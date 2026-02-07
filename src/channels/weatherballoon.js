import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// Weather Balloon Ascent
// Balloon climbs through atmosphere layers with a live sensor HUD;
// a burst event triggers parachute descent, then the loop restarts.

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function smoothstep(a, b, v){ return ease((v - a) / (b - a)); }

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

function pad2(n){ return String(n | 0).padStart(2, '0'); }

function fmtSigned(n, digits=2){
  const s = (n >= 0) ? '+' : '−';
  const v = Math.abs(n);
  return `${s}${v.toFixed(digits)}`;
}

function stdTempC(altKm){
  // super rough ISA-ish profile; good enough for vibes.
  if (altKm < 11) return 15 - 6.5 * altKm;
  if (altKm < 20) return -56.5;
  if (altKm < 32) return -56.5 + 1.0 * (altKm - 20);
  return -44.5;
}

function stdPressHpa(altKm){
  // cheap exponential falloff
  return 1013.25 * Math.exp(-altKm / 7.2);
}

function drawScanlines(ctx, w, h, t, a=0.12){
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,1)';
  const step = 3;
  const off = (t * 28) % step;
  for (let y = off; y < h; y += step){
    ctx.fillRect(0, y, w, 1);
  }
  ctx.restore();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, dpr = 1;
  let t = 0;
  let font = 18, small = 12, mono = 14;

  // Loop structure
  const LOOP = 88;
  const P_LAUNCH = 10;
  const P_TROPO = 24;
  const P_STRATO = 24;
  const P_SPACE = 12;
  const P_BURST = 6;
  const P_CHUTE = LOOP - (P_LAUNCH + P_TROPO + P_STRATO + P_SPACE + P_BURST);

  // scene props
  let clouds = []; // {x,y,r,depth,sp}
  let stars = [];  // {x,y,z,tw,c}
  let pieces = []; // burst pieces: {a,sp,rr,rot,rotSp}

  // drift + events
  let windX = 0;
  let windVX = 0;
  let gustT = 0;
  let glitchT = 0;
  let prevPhase = '';

  // station-ish location
  const lat0 = -37.70 + rand() * 0.9;
  const lon0 = 144.65 + rand() * 0.9;

  // audio handle
  let ah = null;

  function phaseInfo(lt){
    let x = lt;
    if (x < P_LAUNCH) return { phase: 'launch', p: x / P_LAUNCH };
    x -= P_LAUNCH;
    if (x < P_TROPO) return { phase: 'tropo', p: x / P_TROPO };
    x -= P_TROPO;
    if (x < P_STRATO) return { phase: 'strato', p: x / P_STRATO };
    x -= P_STRATO;
    if (x < P_SPACE) return { phase: 'space', p: x / P_SPACE };
    x -= P_SPACE;
    if (x < P_BURST) return { phase: 'burst', p: x / P_BURST };
    x -= P_BURST;
    return { phase: 'chute', p: x / P_CHUTE };
  }

  function altitudeKm(lt){
    const { phase, p } = phaseInfo(lt);

    // max altitude around 32km; loop returns to low altitude for the launch.
    if (phase === 'launch') return lerp(0.2, 1.2, ease(p));
    if (phase === 'tropo') return lerp(1.2, 11.0, ease(p));
    if (phase === 'strato') return lerp(11.0, 28.0, ease(p));
    if (phase === 'space') return lerp(28.0, 32.0, ease(p));
    if (phase === 'burst') return lerp(32.0, 31.2, ease(p));

    // chute: quick drop then slower settle
    const pp = ease(p);
    return lerp(31.2, 0.8, pp * (0.65 + 0.35 * pp));
  }

  function layerLabel(altKm){
    if (altKm < 2) return 'GROUND';
    if (altKm < 11) return 'TROPOSPHERE';
    if (altKm < 20) return 'LOW STRATOSPHERE';
    if (altKm < 30) return 'STRATOSPHERE';
    return 'NEAR-SPACE';
  }

  function regenPieces(){
    const n = 18;
    pieces = Array.from({ length: n }, () => ({
      a: rand() * Math.PI * 2,
      sp: 120 + rand() * 240,
      rr: 2 + rand() * 4,
      rot: rand() * Math.PI * 2,
      rotSp: (rand() * 2 - 1) * (1.2 + rand() * 2.2),
    }));
  }

  function init({ width, height, dpr: dprIn }){
    w = width; h = height; dpr = dprIn || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    windX = 0;
    windVX = 0;
    gustT = 2 + rand() * 4;
    glitchT = 0;
    prevPhase = '';

    const areaN = (w * h) / (960 * 540);

    const nCloud = clamp(Math.floor(16 * areaN), 10, 26);
    clouds = Array.from({ length: nCloud }, () => ({
      x: rand() * w,
      y: (0.28 + rand() * 0.42) * h,
      r: (0.06 + rand() * 0.14) * Math.min(w, h),
      depth: 0.35 + rand() * 0.95,
      sp: (rand() * 2 - 1) * (8 + rand() * 18),
    }));

    const nStars = clamp(Math.floor(260 * areaN), 140, 520);
    stars = Array.from({ length: nStars }, () => ({
      x: rand() * w,
      y: rand() * h,
      z: 0.35 + rand() * 0.95,
      tw: rand() * 10,
      c: 200 + rand() * 55,
    }));

    regenPieces();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();
    const out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(audio.master);

    const n = audio.noiseSource({ type: 'white', gain: 0.010 });
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    hp.Q.value = 0.8;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.Q.value = 0.7;

    // route: noise -> filters -> out
    n.src.disconnect();
    n.src.connect(n.gain);
    n.gain.disconnect();
    n.gain.connect(hp);
    hp.connect(lp);
    lp.connect(out);

    const d = simpleDrone(audio, { root: 54 + rand() * 18, detune: 0.9, gain: 0.014 });
    n.start();

    function setWind(level){
      level = clamp(level, 0, 1);
      const now = ctx.currentTime;
      const g = 0.38 + 0.62 * level;
      const lpf = 900 + 1900 * level;
      const hpf = 120 + 320 * level;
      try { out.gain.setTargetAtTime(g, now, 0.12); } catch {}
      try { lp.frequency.setTargetAtTime(lpf, now, 0.12); } catch {}
      try { hp.frequency.setTargetAtTime(hpf, now, 0.12); } catch {}
    }

    return {
      setWind,
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.10); } catch {}
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      }
    };
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    try { ah?.stop?.(); } catch {}
    ah = null;
  }

  function destroy(){ onAudioOff(); }

  function onPhaseEnter(phase){
    if (!audio.enabled) return;

    if (phase === 'space'){
      audio.beep({ freq: 540 + rand() * 120, dur: 0.03, gain: 0.020, type: 'triangle' });
    }

    if (phase === 'burst'){
      // the burst gets a little alarm-ish stutter
      for (let i = 0; i < 3; i++){
        audio.beep({ freq: 820 + i * 120 + rand() * 40, dur: 0.030, gain: 0.022, type: 'square' });
      }
      regenPieces();
      glitchT = 0.85;
    }

    if (phase === 'chute'){
      audio.beep({ freq: 420 + rand() * 90, dur: 0.040, gain: 0.018, type: 'triangle' });
    }
  }

  function update(dt){
    t += dt;

    const lt = t % LOOP;
    const info = phaseInfo(lt);
    if (info.phase !== prevPhase){
      prevPhase = info.phase;
      onPhaseEnter(info.phase);
    }

    const altKm = altitudeKm(lt);
    const altN = clamp(altKm / 32, 0, 1);

    // wind drift: gusts get a little stronger as we climb
    gustT -= dt;
    if (gustT <= 0){
      gustT = 4.0 + rand() * 10.0;
      const s = (rand() * 2 - 1);
      const base = (0.010 + 0.040 * altN) * w;
      windVX = lerp(windVX, s * base, 0.85);

      // small "radio tick" on gust
      if (audio.enabled && rand() < 0.35) audio.beep({ freq: 620 + rand() * 220, dur: 0.012, gain: 0.012, type: 'square' });
    }

    // gently damp
    windVX = lerp(windVX, 0, dt * 0.10);
    windX += windVX * dt;
    windX = clamp(windX, -w * 0.18, w * 0.18);

    // clouds drift (fade with altitude)
    for (const c of clouds){
      c.x += (c.sp + windVX * 0.20) * dt * (0.40 + 0.60 * c.depth);
      if (c.x < -c.r * 1.5) c.x += w + c.r * 3;
      if (c.x > w + c.r * 1.5) c.x -= w + c.r * 3;
    }

    // stars drift slowly
    const sx = 6.5 * dt;
    const sy = 2.0 * dt;
    for (const s of stars){
      s.x -= sx * s.z;
      s.y += sy * s.z;
      if (s.x < -2) s.x += w + 4;
      if (s.y > h + 2) s.y -= h + 4;
    }

    // glitch overlay timer
    if (glitchT > 0) glitchT = Math.max(0, glitchT - dt);
    else if ((info.phase === 'strato' || info.phase === 'space') && rand() < 0.015){
      glitchT = 0.20 + rand() * 0.35;
    }

    // wind audio scales with altitude + gustiness
    if (audio.enabled && ah?.setWind){
      const gustiness = clamp(Math.abs(windVX) / (w * 0.05), 0, 1);
      const level = clamp(0.10 + 0.78 * altN + 0.20 * gustiness, 0, 1);
      ah.setWind(level);
    }
  }

  function bg(ctx, altN){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // sky gradient evolves with altitude
    const top = lerp(210, 240, altN);
    const bot = lerp(195, 260, altN);
    const sat = lerp(70, 55, altN);
    const lTop = lerp(72, 10, altN);
    const lBot = lerp(56, 6, altN);

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `hsl(${top}, ${sat}%, ${lTop}%)`);
    g.addColorStop(1, `hsl(${bot}, ${sat}%, ${lBot}%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // high-altitude darkening
    ctx.globalAlpha = 0.65 * altN;
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    // stars fade in above ~14km
    const starA = smoothstep(0.42, 0.72, altN);
    if (starA > 0.001){
      ctx.save();
      for (const s of stars){
        const tw = 0.40 + 0.60 * Math.sin(t * 0.8 + s.tw);
        const a = starA * (0.05 + 0.45 * tw);
        ctx.fillStyle = `hsla(${s.c}, 85%, 88%, ${a})`;
        ctx.fillRect(s.x, s.y, 1.1 * s.z, 1.1 * s.z);
      }
      ctx.restore();
    }

    // sun / limb glow (low altitude)
    const sunA = 1 - smoothstep(0.18, 0.45, altN);
    if (sunA > 0.01){
      const cx = w * 0.80;
      const cy = h * 0.22;
      const r = Math.min(w, h) * 0.18;
      const sg = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
      sg.addColorStop(0, `rgba(255,240,210,${0.35 * sunA})`);
      sg.addColorStop(0.35, `rgba(255,200,150,${0.18 * sunA})`);
      sg.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // vignette
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.10, w * 0.5, h * 0.45, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.56)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawClouds(ctx, altN){
    const a = 1 - smoothstep(0.25, 0.55, altN);
    if (a <= 0.001) return;

    ctx.save();
    ctx.globalAlpha = 0.50 * a;

    for (const c of clouds){
      const y = c.y + Math.sin(t * 0.08 + c.depth * 6.0) * (h * 0.012);
      const x = c.x + windX * 0.25 * c.depth;
      const r = c.r;
      const cg = ctx.createRadialGradient(x - r * 0.2, y - r * 0.15, r * 0.15, x, y, r);
      cg.addColorStop(0, 'rgba(255,255,255,0.65)');
      cg.addColorStop(0.55, 'rgba(230,248,255,0.28)');
      cg.addColorStop(1, 'rgba(230,248,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawBalloon(ctx, { cx, cy, r, mode, burstP }){
    // mode: 'balloon' | 'burst' | 'chute'

    if (mode === 'burst'){
      // small flash at the start
      const flash = 1 - smoothstep(0.0, 0.35, burstP);
      if (flash > 0.001){
        const fr = r * (1.3 + 2.1 * (1 - burstP));
        const fg = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, fr);
        fg.addColorStop(0, `rgba(255,245,220,${0.35 * flash})`);
        fg.addColorStop(0.45, `rgba(255,180,120,${0.14 * flash})`);
        fg.addColorStop(1, 'rgba(255,180,120,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(cx, cy, fr, 0, Math.PI * 2);
        ctx.fill();
      }

      // pieces radiate out
      ctx.save();
      ctx.globalAlpha = 0.85;
      for (const p of pieces){
        const d = p.sp * burstP;
        const x = cx + Math.cos(p.a) * d;
        const y = cy + Math.sin(p.a) * d;
        const rr = p.rr * (1 - burstP * 0.65);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot + p.rotSp * t);
        ctx.fillStyle = 'rgba(255,120,160,0.85)';
        ctx.fillRect(-rr, -rr * 0.5, rr * 2, rr);
        ctx.restore();
      }
      ctx.restore();

      return;
    }

    // tether + payload (common)
    const py = cy + r * 1.05;
    const boxW = r * 0.55;
    const boxH = r * 0.40;
    const boxX = cx - boxW / 2;
    const boxY = py + r * 0.52;

    ctx.save();

    // string
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(1, Math.floor(r * 0.04));
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.90);
    ctx.lineTo(cx, boxY);
    ctx.stroke();

    if (mode === 'chute'){
      // parachute canopy
      const canopyW = r * 1.55;
      const canopyH = r * 0.72;
      const cY = cy - r * 0.15;

      ctx.fillStyle = 'rgba(255,110,150,0.92)';
      ctx.beginPath();
      ctx.ellipse(cx, cY, canopyW * 0.5, canopyH * 0.5, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();

      // ribs
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = Math.max(1, Math.floor(r * 0.03));
      for (let i = -2; i <= 2; i++){
        const x = cx + i * canopyW * 0.17;
        ctx.beginPath();
        ctx.moveTo(cx, cY);
        ctx.lineTo(x, cY);
        ctx.stroke();
      }

      // lines down to payload
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      for (let i = -2; i <= 2; i++){
        const x = cx + i * canopyW * 0.18;
        ctx.beginPath();
        ctx.moveTo(x, cY);
        ctx.lineTo(cx, boxY);
        ctx.stroke();
      }

    } else {
      // balloon body
      const sh = ctx.createRadialGradient(cx - r * 0.22, cy - r * 0.22, r * 0.12, cx, cy, r);
      sh.addColorStop(0, 'rgba(255,170,210,0.95)');
      sh.addColorStop(0.40, 'rgba(255,110,150,0.95)');
      sh.addColorStop(1, 'rgba(120,30,60,0.95)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 0.86, r, 0, 0, Math.PI * 2);
      ctx.fill();

      // highlight
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.22, cy - r * 0.18, r * 0.22, r * 0.34, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // neck
      ctx.fillStyle = 'rgba(20,18,22,0.65)';
      roundRect(ctx, cx - r * 0.16, cy + r * 0.82, r * 0.32, r * 0.18, r * 0.06);
      ctx.fill();
    }

    // payload box
    ctx.fillStyle = 'rgba(22,26,30,0.78)';
    roundRect(ctx, boxX, boxY, boxW, boxH, boxH * 0.18);
    ctx.fill();

    ctx.strokeStyle = 'rgba(120,210,255,0.20)';
    ctx.lineWidth = 1;
    roundRect(ctx, boxX, boxY, boxW, boxH, boxH * 0.18);
    ctx.stroke();

    // tiny antenna
    ctx.strokeStyle = 'rgba(231,238,246,0.55)';
    ctx.lineWidth = Math.max(1, Math.floor(r * 0.03));
    ctx.beginPath();
    ctx.moveTo(cx + boxW * 0.25, boxY);
    ctx.lineTo(cx + boxW * 0.25, boxY - r * 0.22);
    ctx.stroke();

    // little LED
    const led = 0.5 + 0.5 * Math.sin(t * 3.1 + seed * 0.002);
    ctx.fillStyle = `rgba(255, 215, 120, ${0.25 + 0.65 * led})`;
    ctx.beginPath();
    ctx.arc(cx - boxW * 0.20, boxY + boxH * 0.55, Math.max(1.5, r * 0.06), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawHUD(ctx, altKm, phase, lt){
    const pad = Math.floor(Math.min(w, h) * 0.05);
    const topH = Math.max(54, font * 2.4);

    // panel
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(0, pad * 0.35, w, topH);
    ctx.fillStyle = 'rgba(120,210,255,0.26)';
    ctx.fillRect(0, pad * 0.35 + topH - 2, w, 2);

    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `700 ${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('WEATHER BALLOON ASCENT', pad, pad * 0.55);

    const layer = layerLabel(altKm);
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.font = `${small}px ui-sans-serif, system-ui`;
    ctx.fillText(`${layer}  •  T+${pad2((lt / 60) | 0)}:${pad2((lt % 60) | 0)}`, pad, pad * 0.55 + font * 1.25);

    // readouts
    const temp = stdTempC(altKm);
    const press = stdPressHpa(altKm);

    const windKph = 8 + 46 * clamp(altKm / 32, 0, 1) + 10 * (0.5 + 0.5 * Math.sin(t * 0.22 + seed * 0.003));

    const lat = lat0 + (windX / w) * 0.12;
    const lon = lon0 + (windX / w) * 0.18;

    const sig = clamp(0.25 + 0.65 * (1 - Math.abs(Math.sin(t * 0.08 + altKm * 0.35))) + (phase === 'burst' ? 0.25 : 0), 0, 1);

    ctx.fillStyle = 'rgba(231,238,246,0.84)';
    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    const y0 = pad * 0.55 + font * 1.95;
    const lh = mono * 1.25;

    ctx.fillText(`ALT  ${altKm.toFixed(1)} km`, pad, y0);
    ctx.fillText(`TEMP ${fmtSigned(temp, 1)} °C`, pad, y0 + lh);
    ctx.fillText(`PRES ${press.toFixed(0)} hPa`, pad, y0 + lh * 2);

    ctx.fillText(`WIND ${windKph.toFixed(0)} kph`, pad + w * 0.30, y0);
    ctx.fillText(`LAT  ${lat.toFixed(3)}`, pad + w * 0.30, y0 + lh);
    ctx.fillText(`LON  ${lon.toFixed(3)}`, pad + w * 0.30, y0 + lh * 2);

    // signal bar
    const bx = w - pad - Math.floor(w * 0.18);
    const by = y0;
    const bw = Math.floor(w * 0.16);
    const bh = Math.floor(mono * 0.55);

    ctx.fillStyle = 'rgba(231,238,246,0.22)';
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(120,210,255,0.80)';
    roundRect(ctx, bx, by, bw * sig, bh, bh / 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`SIG ${(sig * 100) | 0}%`, bx, by + bh + Math.floor(small * 0.35));

    // burst warning
    if (phase === 'burst'){
      const pulse = 0.55 + 0.45 * Math.sin(t * 10.0);
      ctx.globalAlpha = 0.75 + 0.25 * pulse;
      ctx.fillStyle = 'rgba(255, 90, 110, 0.35)';
      ctx.fillRect(0, 0, w, 3);
      ctx.fillStyle = 'rgba(255, 90, 110, 0.88)';
      ctx.font = `800 ${Math.floor(font * 0.95)}px ui-sans-serif, system-ui`;
      ctx.fillText('BURST EVENT', w - pad - Math.floor(w * 0.22), pad * 0.55);
    }

    ctx.restore();
  }

  function render(ctx){
    const lt = t % LOOP;
    const info = phaseInfo(lt);
    const altKm = altitudeKm(lt);
    const altN = clamp(altKm / 32, 0, 1);

    bg(ctx, altN);
    drawClouds(ctx, altN);

    // balloon position
    const cx = w * 0.5 + windX + Math.sin(t * 0.12 + seed * 0.001) * w * 0.02;
    const baseY = h * 0.62;
    const yLift = lerp(0, h * 0.18, smoothstep(0.10, 0.75, altN));
    const cy = baseY + yLift;
    const r = Math.min(w, h) * 0.09;

    if (info.phase === 'burst'){
      drawBalloon(ctx, { cx, cy, r, mode: 'burst', burstP: info.p });
    } else if (info.phase === 'chute'){
      drawBalloon(ctx, { cx, cy: cy + r * 0.20, r, mode: 'chute', burstP: 0 });
    } else {
      drawBalloon(ctx, { cx, cy, r, mode: 'balloon', burstP: 0 });
    }

    // mild camera HUD / scanline vibe at altitude
    const hudA = smoothstep(0.25, 0.75, altN);
    if (hudA > 0.001) drawScanlines(ctx, w, h, t, 0.05 + 0.10 * hudA);

    // glitch overlay when active
    if (glitchT > 0){
      ctx.save();
      const a = 0.18 * (glitchT > 0.2 ? 1 : glitchT / 0.2);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(120,210,255,1)';
      const bands = 4;
      for (let i = 0; i < bands; i++){
        const yy = (0.18 + i * 0.18 + Math.sin(t * 6 + i) * 0.02) * h;
        ctx.fillRect(0, yy, w, 2);
      }
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = 'rgba(255,90,110,1)';
      ctx.fillRect(0, (0.52 + Math.sin(t * 8.2) * 0.02) * h, w, 1);
      ctx.restore();
    }

    drawHUD(ctx, altKm, info.phase, lt);

    // tiny hint
    ctx.save();
    ctx.globalAlpha = 0.52;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.font = `${Math.floor(font * 0.70)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('Ascent → layers → burst → chute descent.', Math.floor(w * 0.05), Math.floor(h * 0.94));
    ctx.restore();
  }

  return {
    init,
    onResize,
    update,
    render,
    onAudioOn,
    onAudioOff,
    destroy,
  };
}
