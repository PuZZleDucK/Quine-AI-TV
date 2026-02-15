import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

// Pocket Planet Weather
// Tiny rotating planet with playful fronts, pressure rings, and one rotating “wow” fact.

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

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

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }

function drawWarmSymbol(ctx, s){
  // semicircle “bumps” on one side
  ctx.beginPath();
  ctx.arc(0, 0, s, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.stroke();
}

function drawColdSymbol(ctx, s){
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(0, s);
  ctx.lineTo(s * 1.25, 0);
  ctx.closePath();
  ctx.fill();
}

function drawArcFront(ctx, {cx, cy, r, a0, a1, kind='warm', t=0, color='rgba(255,120,120,0.9)'} = {}){
  const dir = a1 >= a0 ? 1 : -1;
  const span = Math.abs(a1 - a0);
  const steps = Math.max(28, Math.floor(span * r / 18));

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, Math.floor(r * 0.025));

  // stroke
  ctx.beginPath();
  for (let i=0;i<=steps;i++){
    const u = i / steps;
    const a = lerp(a0, a1, u);
    const wob = 1 + 0.03 * Math.sin(a * 4 + t * 0.55);
    const rr = r * wob;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // symbols along arc
  const stepPx = Math.max(22, Math.floor(r * 0.18));
  let acc = 0;
  for (let i=1;i<=steps;i++){
    const u0 = (i - 1) / steps;
    const u1 = i / steps;
    const aA = lerp(a0, a1, u0);
    const aB = lerp(a0, a1, u1);
    const xA = cx + Math.cos(aA) * r;
    const yA = cy + Math.sin(aA) * r;
    const xB = cx + Math.cos(aB) * r;
    const yB = cy + Math.sin(aB) * r;
    const seg = Math.hypot(xB - xA, yB - yA);
    acc += seg;
    if (acc < stepPx) continue;

    // place a symbol at u1
    acc = 0;
    const a = aB;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const tang = a + dir * Math.PI * 0.5;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tang);
    ctx.globalAlpha = 0.95;

    const s = Math.max(7, Math.floor(r * 0.10));
    if (kind === 'warm'){
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, Math.floor(r * 0.02));
      drawWarmSymbol(ctx, s);
    } else {
      ctx.fillStyle = color;
      drawColdSymbol(ctx, s);
    }
    ctx.restore();
  }

  ctx.restore();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  const FACTS = [
    'Warm air can hold ~7% more water vapor per °C.',
    'A “high” usually means sinking air — clearer skies.',
    'The Coriolis effect nudges big storms into a spin.',
    'Cold fronts often bring fast, punchy rain (and then… blue sky).',
    'Pressure falls can be an early hint: weather’s changing.',
    'Cloud bases form when rising air cools to its dew point.',
    'Wind is basically air trying to erase a pressure gradient.',
  ];

  let w = 0, h = 0, t = 0;
  let font = 18;

  // segmenting
  const SEG_DUR = 24;
  const FADE = 2.2;
  let segT = 0;
  let factIndex = 0;

  // planet palette / state
  const baseHue = (180 + rand() * 150) % 360;
  const oceanHue = (baseHue + 10 + rand() * 30) % 360;
  const landHue = (baseHue + 90 + rand() * 35) % 360;

  const clouds = Array.from({ length: 14 }, () => ({
    lon: rand() * Math.PI * 2,
    lat: (rand() * 2 - 1) * 0.85,
    s: 0.18 + rand() * 0.35,
    a: 0.10 + rand() * 0.18,
    sp: (0.22 + rand() * 0.55) * (rand() < 0.5 ? 1 : -1),
  }));

  // stars
  let stars = [];

  // audio handle
  let ah = null;

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    segT = 0;
    factIndex = (seed % FACTS.length + FACTS.length) % FACTS.length;

    const n = Math.floor(220 * (w * h) / (960 * 540));
    stars = Array.from({ length: n }, () => ({
      x: rand() * w,
      y: rand() * h,
      z: 0.35 + rand() * 0.95,
      tw: rand() * 10,
      c: 200 + rand() * 55,
    }));
  }

  function onResize(width, height){ init({ width, height }); }

  function makeAudioHandle(){
    const ctx = audio.ensure();
    const out = ctx.createGain();
    out.gain.value = 0.75;
    out.connect(audio.master);

    const n = audio.noiseSource({ type: 'pink', gain: 0.006 });
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 650;
    lpf.Q.value = 0.7;

    // route noise through filter -> out
    n.src.disconnect();
    n.src.connect(n.gain);
    n.gain.disconnect();
    n.gain.connect(lpf);
    lpf.connect(out);

    const d = simpleDrone(audio, { root: 62 + rand() * 10, detune: 0.8, gain: 0.020 });

    n.start();

    return {
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

  function segAlpha(){
    const aIn = ease(Math.min(1, segT / FADE));
    const aOut = ease(Math.min(1, (SEG_DUR - segT) / FADE));
    return Math.min(aIn, aOut);
  }

  function update(dt){
    t += dt;
    segT += dt;

    // star drift
    const dx = 9 * dt;
    const dy = 3.5 * dt;
    for (const s of stars){
      s.x -= dx * s.z;
      s.y += dy * s.z;
      if (s.x < -2) s.x += w + 4;
      if (s.y > h + 2) s.y -= h + 4;
    }

    // clouds advect by longitude
    for (const c of clouds) c.lon = (c.lon + dt * c.sp * 0.22) % (Math.PI * 2);

    if (segT >= SEG_DUR){
      segT = 0;
      factIndex = (factIndex + 1) % FACTS.length;
      if (audio.enabled) audio.beep({ freq: 520 + rand() * 140, dur: 0.03, gain: 0.020, type: 'triangle' });
    }
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#070e1d');
    g.addColorStop(1, '#02030a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (const s of stars){
      const tw = 0.40 + 0.60 * Math.sin(t * 0.8 + s.tw);
      const a = 0.05 + 0.45 * tw;
      ctx.fillStyle = `hsla(${s.c}, 80%, 88%, ${a})`;
      ctx.fillRect(s.x, s.y, 1.1 * s.z, 1.1 * s.z);
    }

    // vignette
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.48, 0, w * 0.5, h * 0.48, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawPlanet(ctx, {cx, cy, r}){
    // sphere base
    const ocean = `hsla(${oceanHue}, 60%, 44%, 1)`;
    const land = `hsla(${landHue}, 55%, 55%, 1)`;
    const ice = 'rgba(235,248,255,0.85)';

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    const sh = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.22, r * 0.08, cx, cy, r);
    sh.addColorStop(0, `hsla(${baseHue}, 50%, 64%, 0.95)`);
    sh.addColorStop(0.40, ocean);
    sh.addColorStop(1, `hsla(${oceanHue}, 65%, 20%, 1)`);
    ctx.fillStyle = sh;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // “continents” bands (cheap procedural)
    ctx.globalAlpha = 0.35;
    for (let i=0;i<7;i++){
      const yy = cy - r + (i / 6) * r * 2;
      const wob = Math.sin(t * 0.12 + i * 1.3) * r * 0.08;
      ctx.fillStyle = land;
      ctx.beginPath();
      ctx.ellipse(cx + wob, yy, r * (0.68 - i * 0.06), r * 0.11, 0.2 * i, 0, Math.PI * 2);
      ctx.fill();
    }

    // polar caps
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = ice;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.70, r * 0.65, r * 0.20, 0, 0, Math.PI * 2);
    ctx.ellipse(cx, cy + r * 0.72, r * 0.60, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // clouds (advected by lon)
    for (const c of clouds){
      const lon = c.lon + t * 0.06;
      const lat = c.lat;
      const x = cx + Math.cos(lon) * r * 0.72 * Math.cos(lat);
      const y = cy + Math.sin(lat) * r * 0.68;
      // fade near limb: pretend x is related to depth
      const depth = 0.5 + 0.5 * Math.cos(lon);
      const a = c.a * (0.2 + 0.8 * depth);

      const rr = r * c.s * (0.65 + 0.35 * depth);
      const cg = ctx.createRadialGradient(x - rr * 0.15, y - rr * 0.10, rr * 0.15, x, y, rr);
      cg.addColorStop(0, `rgba(255,255,255,${0.35 * a})`);
      cg.addColorStop(0.55, `rgba(225,245,255,${0.20 * a})`);
      cg.addColorStop(1, 'rgba(225,245,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }

    // fronts (on-surface arcs)
    ctx.globalAlpha = 0.95;
    drawArcFront(ctx, {
      cx, cy,
      r: r * 0.86,
      a0: -1.0 + 0.20 * Math.sin(t * 0.08),
      a1: 1.75 + 0.20 * Math.cos(t * 0.07),
      kind: 'warm',
      t,
      color: 'rgba(255,125,125,0.82)',
    });
    drawArcFront(ctx, {
      cx, cy,
      r: r * 0.76,
      a0: 2.6 + 0.22 * Math.sin(t * 0.09 + 1.2),
      a1: 4.9 + 0.18 * Math.cos(t * 0.08 + 0.6),
      kind: 'cold',
      t: t + 3,
      color: 'rgba(120,210,255,0.78)',
    });

    // terminator
    ctx.globalCompositeOperation = 'multiply';
    const tg = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    const k = 0.55 + 0.30 * Math.sin(t * 0.05);
    tg.addColorStop(0, 'rgba(0,0,0,0.30)');
    tg.addColorStop(k, 'rgba(0,0,0,0)');
    tg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = tg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();

    // outline
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(2, Math.floor(r * 0.06));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // pressure rings (outside the planet)
    ctx.save();
    ctx.globalAlpha = 0.75;
    const rot = t * 0.07;
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    const ringCol = 'rgba(160, 245, 220, 0.28)';
    ctx.strokeStyle = ringCol;
    ctx.lineWidth = Math.max(1, Math.floor(r * 0.03));
    ctx.setLineDash([Math.max(4, r * 0.10), Math.max(3, r * 0.07)]);
    for (let i=0;i<3;i++){
      const rr = r * (1.18 + i * 0.18);
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * 0.68, -0.35, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawHUD(ctx){
    const pad = Math.floor(w * 0.05);
    const alpha = segAlpha();

    // title
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(0, Math.floor(h * 0.06), w, Math.floor(h * 0.12));
    ctx.fillStyle = 'rgba(120,210,255,0.35)';
    ctx.fillRect(0, Math.floor(h * 0.18) - 2, w, 2);

    ctx.fillStyle = 'rgba(231,238,246,0.94)';
    ctx.font = `${Math.floor(font * 1.06)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('POCKET PLANET WEATHER', pad, Math.floor(h * 0.105));

    // live-ish readouts
    const tempC = 12 + 10 * Math.sin(t * 0.13 + 1.1);
    const press = 1012 + 12 * Math.cos(t * 0.08 - 0.4);
    const wind = 10 + 24 * (0.5 + 0.5 * Math.sin(t * 0.17 + 0.9));

    ctx.fillStyle = 'rgba(231,238,246,0.76)';
    ctx.font = `${Math.floor(font * 0.78)}px ui-sans-serif, system-ui`;
    ctx.fillText(`T ${tempC.toFixed(0)}°C   P ${press.toFixed(0)} hPa   WIND ${wind.toFixed(0)} kph`, pad, Math.floor(h * 0.145));

    // wow fact pill
    const fact = FACTS[factIndex];
    ctx.globalAlpha = 0.60 + 0.40 * alpha;

    ctx.font = `${Math.floor(font * 0.74)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const label = 'WOW FACT:';
    const labelW = Math.ceil(ctx.measureText(label).width);

    ctx.font = `${Math.floor(font * 0.84)}px ui-sans-serif, system-ui`;
    const textW = Math.ceil(ctx.measureText(fact).width);

    const pillW = Math.min(w - pad * 2, labelW + 14 + textW + 28);
    const pillH = Math.floor(font * 1.45);
    const px = pad;
    const py = h - pad - pillH;

    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    roundRect(ctx, px + 6, py + 8, pillW, pillH, pillH / 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(10,14,22,0.86)';
    roundRect(ctx, px, py, pillW, pillH, pillH / 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(120,210,255,0.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, px, py, pillW, pillH, pillH / 2);
    ctx.stroke();

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(231,238,246,0.84)';
    ctx.font = `${Math.floor(font * 0.74)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(label, px + 16, py + pillH * 0.65);

    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 0.84)}px ui-sans-serif, system-ui`;
    ctx.fillText(fact, px + 16 + labelW + 12, py + pillH * 0.65);

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);

    const s = Math.min(w, h);
    const r = s * 0.22;
    const cx = w * (0.50 + 0.05 * Math.sin(t * 0.10));
    const cy = h * (0.53 + 0.05 * Math.cos(t * 0.09));

    // drop shadow
    ctx.save();
    ctx.globalAlpha = 0.40;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.12, cy + r * 0.18, r * 1.05, r * 0.92, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawPlanet(ctx, { cx, cy, r });
    drawHUD(ctx);

    // tiny hint
    ctx.save();
    ctx.globalAlpha = 0.52;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.font = `${Math.floor(font * 0.70)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('Forecast in miniature. Fronts drift; pressure rings wobble.', Math.floor(w * 0.05), Math.floor(h * 0.92));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
