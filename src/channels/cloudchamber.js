import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// REVIEWED: 2026-02-11
// Cloud Chamber Live
// Particle-track wisps drift across a dark chamber with a rolling counter and occasional “big event” flashes.

function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function lerp(a,b,t){ return a + (b-a)*t; }

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

  // chamber layout
  let cx = 0, cy = 0, cw = 0, ch = 0, cr = 18;

  // time structure
  const PHASES = [
    { name: 'CALM', dur: 34, rate: 7, glow: 0.55 },
    { name: 'ACTIVE', dur: 44, rate: 12, glow: 0.75 },
    { name: 'STORM', dur: 28, rate: 18, glow: 0.95 },
    { name: 'RESET', dur: 22, rate: 6, glow: 0.45 },
  ];
  let phaseIdx = 0;
  let phaseEndsAt = 0;

  // events / HUD
  let bigFlash = 0;
  let banner = 0;
  let nextBigAt = 0;

  let hits = 0;
  let displayHits = 0;

  // background texture
  let noiseCanvas = null;
  let noiseCtx = null;
  let noiseScroll = 0;

  // gradients (cache per ctx + size)
  let gradCtx = null;
  let gradKey = '';
  let bgGrad = null;
  let rimGrad = null;
  let vignetteGrad = null;

  function invalidateGradients(){
    gradCtx = null;
    gradKey = '';
    bgGrad = null;
    rimGrad = null;
    vignetteGrad = null;
  }

  function ensureGradients(ctx){
    const key = `${w},${h},${cx},${cy},${cw},${ch}`;
    if (ctx === gradCtx && key === gradKey && bgGrad && rimGrad && vignetteGrad) return;

    gradCtx = ctx;
    gradKey = key;

    bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    bgGrad.addColorStop(0, '#040a10');
    bgGrad.addColorStop(0.45, '#03070c');
    bgGrad.addColorStop(1, '#020408');

    rimGrad = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
    rimGrad.addColorStop(0, 'rgba(170,255,255,0.16)');
    rimGrad.addColorStop(0.55, 'rgba(80,170,210,0.09)');
    rimGrad.addColorStop(1, 'rgba(140,255,255,0.14)');

    vignetteGrad = ctx.createRadialGradient(cx + cw * 0.5, cy + ch * 0.5, 10, cx + cw * 0.5, cy + ch * 0.5, Math.max(cw, ch) * 0.65);
    vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
  }

  // tracks (pooled)
  const MAX_TRACKS = 140;
  const MAX_PTS = 26;
  const tracks = Array.from({ length: MAX_TRACKS }, () => ({
    active: false,
    pts: new Float32Array(MAX_PTS * 2),
    n: 0,
    age: 0,
    life: 1,
    width: 1,
    hue: 175,
    seed: 0,
    drift: 0,
    energy: 1,
    strokeStyle: 'hsla(175, 92%, 70%, 0.12)',
    shadowColor: 'hsla(175, 92%, 70%, 0.25)',
  }));

  // audio
  let drone = null;
  let ambience = null;
  let musicHandle = null;

  function pick(arr){ return arr[(rand() * arr.length) | 0]; }

  function init({ width, height }){
    w = width; h = height; t = 0;

    const pad = Math.max(16, Math.floor(Math.min(w, h) * 0.06));
    cw = Math.floor(w - pad * 2);
    ch = Math.floor(h - pad * 2);
    cx = Math.floor((w - cw) / 2);
    cy = Math.floor((h - ch) / 2);
    cr = Math.max(16, Math.floor(Math.min(cw, ch) * 0.06));

    invalidateGradients();

    phaseIdx = (seed >>> 0) % PHASES.length;
    phaseEndsAt = PHASES[phaseIdx].dur;

    bigFlash = 0;
    banner = 0;
    nextBigAt = 8 + rand() * 10;

    hits = 0;
    displayHits = 0;

    noiseScroll = 0;
    noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = 256;
    noiseCanvas.height = 256;
    noiseCtx = noiseCanvas.getContext('2d');
    noiseCtx.imageSmoothingEnabled = false;

    // deterministic-ish speckle field (seeded by rand)
    const img = noiseCtx.createImageData(256, 256);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4){
      const v = rand();
      const a = v < 0.93 ? 0 : (v < 0.985 ? 30 : 70);
      d[i] = 210;
      d[i+1] = 245;
      d[i+2] = 255;
      d[i+3] = a;
    }
    noiseCtx.putImageData(img, 0, 0);

    for (const tr of tracks) tr.active = false;

    // start with a few wisps
    for (let i = 0; i < 18; i++) spawnTrack({ kind: 'small', prewarm: true });
  }

  function onResize(width, height){
    init({ width, height });
  }

  function spawnTrack({ kind='small', prewarm=false } = {}){
    // find free slot
    let tr = null;
    for (let i = 0; i < tracks.length; i++) {
      if (!tracks[i].active) { tr = tracks[i]; break; }
    }
    if (!tr) {
      // recycle the oldest (simple scan)
      let oldest = tracks[0];
      for (let i = 1; i < tracks.length; i++) if (tracks[i].age > oldest.age) oldest = tracks[i];
      tr = oldest;
    }

    tr.active = true;
    tr.age = prewarm ? rand() * 1.2 : 0;
    tr.life = (kind === 'big' ? 2.6 : 1.7) + rand() * (kind === 'big' ? 1.1 : 0.9);
    tr.width = (kind === 'big' ? 2.1 : 1.2) + rand() * (kind === 'big' ? 1.2 : 0.8);
    tr.energy = kind === 'big' ? 1.35 : 1.0;
    tr.hue = kind === 'big' ? (168 + rand() * 34) : (175 + rand() * 22);
    tr.seed = (rand() * 1e9) | 0;
    tr.drift = (rand() * 4.5 + (kind === 'big' ? 4.0 : 2.0)) * (rand() < 0.5 ? -1 : 1);

    // perf: precompute style strings per track; fade via ctx.globalAlpha in drawTracks()
    tr.strokeStyle = `hsla(${tr.hue}, 92%, 70%, ${0.12 * tr.energy})`;
    tr.shadowColor = `hsla(${tr.hue}, 92%, 70%, 0.25)`;

    // path
    const margin = Math.min(cw, ch) * 0.06;
    let x = cx + margin + rand() * (cw - margin * 2);
    let y = cy + margin + rand() * (ch - margin * 2);

    let ang = rand() * Math.PI * 2;
    let step = Math.min(cw, ch) * (kind === 'big' ? 0.016 : 0.012);

    const nPts = kind === 'big' ? 26 : 20;
    tr.n = nPts;

    for (let i = 0; i < nPts; i++){
      // meander
      ang += (rand() - 0.5) * (kind === 'big' ? 0.55 : 0.45);
      const s = step * (0.65 + rand() * 0.75);
      x += Math.cos(ang) * s;
      y += Math.sin(ang) * s;
      // keep within chamber
      x = Math.max(cx + margin, Math.min(cx + cw - margin, x));
      y = Math.max(cy + margin, Math.min(cy + ch - margin, y));

      const j = i * 2;
      tr.pts[j] = x + (rand() - 0.5) * (kind === 'big' ? 5.5 : 3.5);
      tr.pts[j + 1] = y + (rand() - 0.5) * (kind === 'big' ? 5.5 : 3.5);
    }

    hits += kind === 'big' ? (6 + ((rand() * 10) | 0)) : 1;
  }

  function triggerBigEvent(){
    bigFlash = 1.0;
    banner = 1.0;

    const burst = 6 + ((rand() * 7) | 0);
    for (let i = 0; i < burst; i++) spawnTrack({ kind: 'big' });

    if (audio.enabled){
      audio.beep({ freq: 92 + rand() * 25, dur: 0.08, gain: 0.045, type: 'triangle' });
      audio.beep({ freq: 420 + rand() * 120, dur: 0.035, gain: 0.028, type: 'square' });
    }
  }

  function stopAmbience({ clearCurrent=false } = {}){
    const handle = musicHandle;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ambience = null;
    drone = null;
    musicHandle = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // idempotent: stop any existing handles we own first
    stopAmbience({ clearCurrent: true });

    // subtle chamber hiss + low hum
    try {
      ambience = audio.noiseSource({ type: pick(['pink','brown']), gain: 0.026 });
      ambience.start();
    } catch { ambience = null; }

    drone = simpleDrone(audio, { root: 44, detune: 0.9, gain: 0.038 });

    musicHandle = {
      stop(){
        try { ambience?.stop?.(); } catch {}
        try { drone?.stop?.(); } catch {}
      }
    };
    audio.setCurrent(musicHandle);
  }

  function onAudioOff(){
    // stop/clear everything we own; only clear AudioManager.current if it's ours
    stopAmbience({ clearCurrent: true });
  }

  function destroy(){
    stopAmbience({ clearCurrent: true });
  }

  function update(dt){
    t += dt;

    const phase = PHASES[phaseIdx];
    if (t >= phaseEndsAt){
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      phaseEndsAt = t + PHASES[phaseIdx].dur;

      // tiny cue
      banner = Math.max(banner, 0.6);
      if (audio.enabled) audio.beep({ freq: 160 + rand() * 120, dur: 0.03, gain: 0.02, type: 'sine' });
    }

    // spawn rate
    // (keep bounded, avoid huge while loops)
    const rate = phase.rate;
    const spawnCount = Math.min(6, Math.floor(rate * dt + rand() * 1.3));
    for (let i = 0; i < spawnCount; i++) spawnTrack({ kind: 'small' });

    // big events
    if (t >= nextBigAt){
      triggerBigEvent();
      nextBigAt = t + 12 + rand() * 16;
    }

    // decay
    bigFlash = Math.max(0, bigFlash - dt * 1.35);
    banner = Math.max(0, banner - dt * 1.1);

    // tracks aging
    for (const tr of tracks){
      if (!tr.active) continue;
      tr.age += dt;
      if (tr.age >= tr.life) tr.active = false;
    }

    // rolling counter
    displayHits = lerp(displayHits, hits, 1 - Math.exp(-dt * 5.2));

    noiseScroll = (noiseScroll + dt * 18) % 256;
  }

  function drawBackground(ctx){
    ensureGradients(ctx);

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // subtle spill glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(120,240,255,0.05)';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.restore();

    // speckle noise
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.translate(-noiseScroll, -noiseScroll * 0.6);
    ctx.drawImage(noiseCanvas, 0, 0);
    ctx.drawImage(noiseCanvas, 256, 0);
    ctx.drawImage(noiseCanvas, 0, 256);
    ctx.drawImage(noiseCanvas, 256, 256);
    ctx.restore();
  }

  function drawChamber(ctx){
    // outer glass
    ctx.save();
    ctx.shadowColor = 'rgba(140,245,255,0.18)';
    ctx.shadowBlur = Math.max(10, Math.min(w, h) * 0.03);

    ensureGradients(ctx);

    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.006);
    roundRect(ctx, cx, cy, cw, ch, cr);
    ctx.stroke();

    ctx.shadowBlur = 0;
    // inner vignette
    ctx.fillStyle = vignetteGrad;
    roundRect(ctx, cx + 4, cy + 4, cw - 8, ch - 8, Math.max(10, cr - 6));
    ctx.fill();

    ctx.restore();
  }

  function drawTracks(ctx){
    const phase = PHASES[phaseIdx];
    const glow = phase.glow;

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, cx, cy, cw, ch, cr);
    ctx.clip();

    // soft bloom
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const tr of tracks){
      if (!tr.active) continue;
      const a = clamp01(1 - tr.age / tr.life);
      const drift = tr.drift;
      const wob = Math.sin(t * 0.9 + tr.seed * 0.00001) * 2.6;
      const dx = (Math.sin(t * 0.33 + tr.seed * 0.00002) * 1.4 + wob) * 0.35;
      const dy = (Math.cos(t * 0.27 + tr.seed * 0.000015) * 1.7 - wob) * 0.35;

      // perf: no per-frame template literal allocations; fade via globalAlpha
      ctx.globalAlpha = a * glow;
      ctx.strokeStyle = tr.strokeStyle;
      ctx.lineWidth = tr.width * (1.0 + a * 0.35);
      ctx.shadowColor = tr.shadowColor;
      ctx.shadowBlur = 10 + a * 18;

      ctx.beginPath();
      for (let i = 0; i < tr.n; i++){
        const j = i * 2;
        // gentle global drift to mimic convection
        const px = tr.pts[j] + dx + drift * 0.12 * tr.age;
        const py = tr.pts[j + 1] + dy + Math.sin((t * 0.7 + i * 0.55) + tr.seed * 0.00003) * 0.9;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawRollingNumber(ctx, x, y, value, alpha){
    const v = Math.max(0, value);
    const base = Math.floor(v);
    const frac = clamp01(v - base);
    const str = String(base).padStart(5, '0');

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${Math.max(16, Math.floor(Math.min(w, h) * 0.028))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.textBaseline = 'top';

    const m = ctx.measureText('0');
    const dx = Math.max(10, m.width * 0.92);
    const dh = Math.max(18, Math.floor(Math.min(w, h) * 0.03));

    for (let i = 0; i < str.length; i++){
      const d0 = str.charCodeAt(i) - 48;
      const d1 = (d0 + 1) % 10;

      ctx.save();
      ctx.translate(x + i * dx, y);
      ctx.fillStyle = 'rgba(210, 250, 255, 0.9)';
      ctx.fillText(String(d0), 0, -frac * dh);
      ctx.fillText(String(d1), 0, (1 - frac) * dh);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawHUD(ctx){
    const phase = PHASES[phaseIdx];
    const pad = Math.max(14, Math.floor(Math.min(w, h) * 0.03));

    ctx.save();
    ctx.fillStyle = 'rgba(210,250,255,0.86)';
    ctx.font = `${Math.max(14, Math.floor(Math.min(w, h) * 0.022))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.textBaseline = 'top';

    ctx.fillText('CLOUD CHAMBER LIVE', cx + pad, cy + pad);

    ctx.globalAlpha = 0.72;
    ctx.fillText(`PHASE: ${phase.name}`, cx + pad, cy + pad + Math.max(18, Math.floor(Math.min(w, h) * 0.03)));

    // counter block
    const bx = cx + pad;
    const by = cy + ch - pad - Math.max(54, Math.floor(Math.min(w, h) * 0.11));

    ctx.globalAlpha = 0.9;
    ctx.fillText('HITS', bx, by);

    drawRollingNumber(ctx, bx, by + Math.max(16, Math.floor(Math.min(w, h) * 0.03)), displayHits, 0.92);

    // big event banner
    if (banner > 0){
      const a = clamp01(banner);
      const bw = Math.min(cw * 0.7, Math.max(260, w * 0.46));
      const bh = Math.max(42, Math.floor(Math.min(w, h) * 0.07));
      const bx2 = cx + (cw - bw) / 2;
      const by2 = cy + Math.max(pad * 1.15, ch * 0.16);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.25 * a;
      ctx.fillStyle = 'rgba(150,250,255,1)';
      roundRect(ctx, bx2, by2, bw, bh, 14);
      ctx.fill();

      ctx.globalAlpha = 0.92 * a;
      ctx.strokeStyle = 'rgba(200,255,255,0.85)';
      ctx.lineWidth = 2;
      roundRect(ctx, bx2, by2, bw, bh, 14);
      ctx.stroke();

      ctx.globalAlpha = 0.9 * a;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = `${Math.max(14, Math.floor(Math.min(w, h) * 0.026))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BIG EVENT', bx2 + bw / 2, by2 + bh / 2);
      ctx.restore();
    }

    ctx.restore();
  }

  function draw(ctx){
    drawBackground(ctx);
    drawTracks(ctx);
    drawChamber(ctx);

    // flash
    if (bigFlash > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = bigFlash * 0.23;
      ctx.fillStyle = 'rgba(210,255,255,1)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    drawHUD(ctx);
  }

  // NOTE: main.js calls `init()` on channel creation, and only calls `onResize()`
  // when the canvas size changes. Expose `init` so the channel is initialized
  // correctly even when tuning without a resize.
  return { init, onResize, update, draw, destroy, onAudioOn, onAudioOff };
}
