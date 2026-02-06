import { mulberry32 } from '../util/prng.js';

// Rainy Window Radio
// Lo-fi rain-on-glass visuals + a tiny “radio dial” that flips between mellow micro-genres.

const STATIONS = [
  { name: 'Chillhop Drift', freq: 88.1, tone: { root: 110, lpf: 900 } },
  { name: 'Ambient Tape', freq: 91.7, tone: { root: 82.4, lpf: 650 } },
  { name: 'Vapor Jazz', freq: 94.3, tone: { root: 123.5, lpf: 1050 } },
  { name: 'Lo-fi House (Soft)', freq: 97.9, tone: { root: 98.0, lpf: 1200 } },
  { name: 'Sleepy Piano Bits', freq: 101.5, tone: { root: 146.8, lpf: 800 } },
  { name: 'Night Bus DnB (Mellow)', freq: 104.2, tone: { root: 73.4, lpf: 1400 } },
];

function roundRect(ctx, x, y, w, h, r){
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;
  let droplets = [];
  let streaks = [];

  let stationIdx = 0;
  let stationTimer = 0;
  let tuneFx = 0; // seconds remaining for tuning/static overlay

  // audio handles
  let ah = null;

  function init({ width, height }){
    w = width; h = height; t = 0;

    // streak field: fixed x positions, animated by time
    const n = Math.floor(120 + (w * h) / 120_000);
    streaks = Array.from({ length: n }, () => ({
      x: rand() * w,
      y: rand() * h,
      speed: (0.6 + rand() * 1.8) * (0.75 + (w / 900) * 0.25),
      len: 10 + rand() * 26,
      a: 0.05 + rand() * 0.12,
      wob: rand() * 10,
    }));

    droplets = [];
    stationIdx = (seed >>> 0) % STATIONS.length;
    stationTimer = 10 + rand() * 10;
    tuneFx = 0;
  }

  function onResize(width, height){ w = width; h = height; }

  function switchStation(nextIdx){
    stationIdx = (nextIdx + STATIONS.length) % STATIONS.length;
    stationTimer = 18 + rand() * 14;
    tuneFx = 1.05;

    // little tuning chirp / click
    if (audio.enabled){
      audio.beep({ freq: 520 + rand() * 260, dur: 0.035, gain: 0.035, type: 'square' });
    }

    // update audio tone subtly
    if (audio.enabled && ah && ah.setTone){
      ah.setTone(STATIONS[stationIdx].tone);
    }
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();

    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(audio.master);

    // Rain bed: pink-ish noise, lowpassed.
    const rain = audio.noiseSource({ type: 'pink', gain: 0.07 });

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = STATIONS[stationIdx].tone.lpf;
    lpf.Q.value = 0.8;

    // Slight flutter to feel like a radio.
    const flutter = ctx.createOscillator();
    flutter.type = 'sine';
    flutter.frequency.value = 0.17;

    const flutterGain = ctx.createGain();
    flutterGain.gain.value = 120; // Hz

    flutter.connect(flutterGain);
    flutterGain.connect(lpf.frequency);

    // Tiny tonal pad (very subtle)
    const pad = ctx.createOscillator();
    pad.type = 'triangle';
    pad.frequency.value = STATIONS[stationIdx].tone.root;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.0;

    // Fade in softly
    const t0 = ctx.currentTime;
    padGain.gain.setValueAtTime(0.0001, t0);
    padGain.gain.exponentialRampToValueAtTime(0.028, t0 + 0.45);

    // Connections
    rain.src.disconnect();
    rain.src.connect(rain.gain);
    rain.gain.disconnect();
    rain.gain.connect(lpf);

    pad.connect(padGain);
    padGain.connect(lpf);

    lpf.connect(out);

    rain.start();
    flutter.start();
    pad.start();

    function setTone({ root, lpf: f }){
      const now = ctx.currentTime;
      try {
        lpf.frequency.setTargetAtTime(f, now, 0.08);
        pad.frequency.setTargetAtTime(root, now, 0.12);
      } catch {}
    }

    return {
      setTone,
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.08); } catch {}
        try { rain.stop(); } catch {}
        try { flutter.stop(now + 0.15); } catch {}
        try { pad.stop(now + 0.15); } catch {}
      }
    };
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    ah?.stop?.();
    ah = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;

    if (tuneFx > 0) tuneFx = Math.max(0, tuneFx - dt);

    stationTimer -= dt;
    if (stationTimer <= 0){
      switchStation(stationIdx + 1);
    }

    // spawn droplets
    const spawnRate = 5.5; // per second
    const p = 1 - Math.exp(-spawnRate * dt);
    if (rand() < p){
      const r = 2 + rand() * 6;
      droplets.push({
        x: rand() * w,
        y: -10 - rand() * 20,
        r,
        vy: (120 + rand() * 260) * (0.7 + r / 10),
        vx: (-18 + rand() * 36),
        life: 2.2 + rand() * 1.8,
        tw: rand() * 10,
      });
    }

    // update droplets
    for (const d of droplets){
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      // slow down + smear a bit
      d.vx *= (1 - 0.25 * dt);
    }
    droplets = droplets.filter(d => d.life > 0 && d.y < h + 40);

    // animate streaks: just advance y (wrap)
    for (const s of streaks){
      s.y += (s.speed * 220) * dt;
      if (s.y > h + 30) { s.y = -30; s.x = (s.x + (rand()*60-30) + w) % w; }
    }
  }

  function drawBackground(ctx){
    // cool, rainy gradient + vignette
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#060914');
    g.addColorStop(0.55, '#070d1e');
    g.addColorStop(1, '#03040a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // soft bokeh city lights behind glass
    const n = 10;
    for (let i=0; i<n; i++){
      const bx = (0.1 + 0.8 * rand()) * w;
      const by = (0.15 + 0.75 * rand()) * h;
      const br = (18 + rand() * 64) * (0.8 + Math.sin(t*0.2 + i) * 0.12);
      const c = i % 3 === 0 ? 'rgba(255,190,110,' : (i % 3 === 1 ? 'rgba(120,210,255,' : 'rgba(255,110,190,');
      const a = 0.04 + rand() * 0.06;
      const rg = ctx.createRadialGradient(bx, by, 1, bx, by, br);
      rg.addColorStop(0, `${c}${a})`);
      rg.addColorStop(1, `${c}0)`);
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.5, Math.min(w,h)*0.2, w*0.5, h*0.5, Math.max(w,h)*0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawRain(ctx){
    // streaks
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w,h) / 540));
    for (const s of streaks){
      const wob = Math.sin(t*0.9 + s.wob) * 7;
      ctx.strokeStyle = `rgba(190, 230, 255, ${s.a})`;
      ctx.beginPath();
      ctx.moveTo(s.x + wob, s.y);
      ctx.lineTo(s.x + wob - 8, s.y + s.len);
      ctx.stroke();
    }
    ctx.restore();

    // droplets (bigger beads)
    for (const d of droplets){
      const a = Math.max(0, Math.min(1, d.life / 1.2));
      const rg = ctx.createRadialGradient(d.x, d.y, 1, d.x, d.y, d.r);
      rg.addColorStop(0, `rgba(230,245,255,${0.16*a})`);
      rg.addColorStop(0.55, `rgba(190,230,255,${0.06*a})`);
      rg.addColorStop(1, 'rgba(190,230,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI*2);
      ctx.fill();

      // tiny highlight
      ctx.fillStyle = `rgba(255,255,255,${0.05*a})`;
      ctx.fillRect(d.x - d.r*0.35, d.y - d.r*0.15, 1.2, 1.2);
    }
  }

  function drawDial(ctx){
    const s = Math.min(w, h);
    const pad = Math.max(12, Math.floor(s * 0.02));
    const boxW = Math.floor(s * 0.42);
    const boxH = Math.floor(s * 0.12);
    const x = pad;
    const y = h - pad - boxH;

    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 18, 0.68)';
    ctx.strokeStyle = 'rgba(108, 242, 255, 0.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();

    // station label
    const st = STATIONS[stationIdx];
    ctx.font = `${Math.floor(boxH*0.33)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(210, 245, 255, 0.92)';
    ctx.fillText('RAINY WINDOW RADIO', x + 14, y + Math.floor(boxH*0.44));

    ctx.font = `${Math.floor(boxH*0.30)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(st.name, x + 14, y + Math.floor(boxH*0.82));

    // tiny frequency + knob
    ctx.font = `${Math.floor(boxH*0.26)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255, 190, 110, 0.85)';
    const freq = `${st.freq.toFixed(1)} FM`;
    const fx = x + boxW - 14 - ctx.measureText(freq).width;
    ctx.fillText(freq, fx, y + Math.floor(boxH*0.44));

    const kx = x + boxW - 52;
    const ky = y + Math.floor(boxH*0.78);
    const kr = 10;
    ctx.strokeStyle = 'rgba(210, 245, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(kx, ky, kr, 0, Math.PI*2);
    ctx.stroke();

    // indicator line depends on station
    const u = stationIdx / Math.max(1, STATIONS.length-1);
    const ang = (-0.75 + u*1.5) * Math.PI; // sweep
    ctx.strokeStyle = tuneFx > 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,190,110,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(kx, ky);
    ctx.lineTo(kx + Math.cos(ang)*kr*0.95, ky + Math.sin(ang)*kr*0.95);
    ctx.stroke();

    // subtle scan/tune bar when switching
    if (tuneFx > 0){
      const a = Math.min(1, tuneFx / 1.05);
      ctx.fillStyle = `rgba(255,255,255,${0.08*a})`;
      ctx.fillRect(x, y, boxW, boxH);
      ctx.fillStyle = `rgba(108,242,255,${0.10*a})`;
      const barY = y + ((1-a) * boxH);
      ctx.fillRect(x, barY, boxW, 2);
    }

    ctx.restore();
  }

  function drawStatic(ctx){
    if (tuneFx <= 0) return;
    const a = Math.min(1, tuneFx / 1.05);
    const img = ctx.createImageData(w, Math.max(1, Math.floor(h*0.25)));
    const d = img.data;
    for (let i=0; i<d.length; i+=4){
      const v = (rand() * 255) | 0;
      d[i] = v; d[i+1] = v; d[i+2] = v;
      d[i+3] = (18 + rand()*40) * a;
    }
    // place as a band (old TV vibe)
    ctx.putImageData(img, 0, Math.floor(h*0.18));
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    drawRain(ctx);

    // faint glass sheen
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const sheen = ctx.createLinearGradient(0, 0, w, h);
    sheen.addColorStop(0, 'rgba(120,210,255,0.00)');
    sheen.addColorStop(0.45, 'rgba(120,210,255,0.06)');
    sheen.addColorStop(1, 'rgba(255,110,190,0.00)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    drawStatic(ctx);
    drawDial(ctx);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
