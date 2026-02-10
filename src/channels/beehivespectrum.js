import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// REVIEWED: 2026-02-10
// Beehive Spectrum Radio
// Honeycomb parallax + waggle-dance traces rendered as a spectrum/waterfall.

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

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

function hexPath(ctx, cx, cy, r){
  const a0 = Math.PI / 6;
  ctx.beginPath();
  for (let i = 0; i < 6; i++){
    const a = a0 + i * (Math.PI / 3);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;

  // perf: cache background gradients (rebuild on resize)
  let bgGrad = null;
  let vignetteGrad = null;
  let bgCacheW = 0;
  let bgCacheH = 0;

  // perf: cache hot-path gradients (rebuild on resize / band switch)
  let danceGlowGrad = null;
  let danceGlowBandIdx = -1;
  let danceGlowCacheX = 0;
  let danceGlowCacheY = 0;
  let danceGlowCacheW = 0;
  let danceGlowCacheH = 0;

  let wfSheenGrad = null;
  let wfSheenBandIdx = -1;
  let wfSheenCacheX = 0;
  let wfSheenCacheY = 0;
  let wfSheenCacheW = 0;
  let wfSheenCacheH = 0;

  // layout
  let pad = 16;
  let panelX = 0, panelY = 0, panelW = 0, panelH = 0;
  let danceX = 0, danceY = 0, danceW = 0, danceH = 0;
  let wfX = 0, wfY = 0, wfW = 0, wfH = 0;
  let infoX = 0, infoY = 0, infoW = 0, infoH = 0;

  // theme / phases
  const BANDS = [
    { key: 'NECTAR', name: 'NECTAR REPORT', hue: 38, rate: 1.0 },
    { key: 'POLLEN', name: 'POLLEN UPDATE', hue: 55, rate: 0.9 },
    { key: 'WAX', name: 'WAX WORKS', hue: 28, rate: 1.08 },
    { key: 'PROPOLIS', name: 'PROPOLIS MIX', hue: 16, rate: 0.95 },
  ];
  let bandIdx = 0;
  let bandTimer = 0;
  let tuneFx = 0;

  // honeycomb layers (precomputed)
  let hexFar = [];
  let hexMid = [];
  let hexNear = [];

  // waggle dancers
  let bees = [];
  let trails = [];

  // spectrum / waterfall
  const BINS = 72;
  const energy = new Float32Array(BINS);
  const peaks = new Float32Array(BINS);

  let wfCanvas = null;
  let wfCtx = null;
  let wfImg = null;
  let wfRowData = null;
  let wfRows = 160;
  let wfScrollAcc = 0;

  // special moments
  let queenPulse = 0;
  let nextQueenAt = 0;
  let queenX = 0;
  let queenY = 0;

  // audio
  let drone = null;
  let audioHandle = null;

  function pick(arr){ return arr[(rand() * arr.length) | 0]; }

  function resetArrays(){
    for (let i = 0; i < BINS; i++) { energy[i] = 0; peaks[i] = 0; }
  }

  function initHoneycomb(){
    hexFar = [];
    hexMid = [];
    hexNear = [];

    const base = Math.max(18, Math.floor(Math.min(w, h) * 0.06));
    const farR = base * 0.95;
    const midR = base * 0.70;
    const nearR = base * 0.55;

    function fillLayer(out, r, jitter, a0){
      const dx = r * Math.sqrt(3);
      const dy = r * 1.5;
      const cols = Math.ceil((w + dx * 2) / dx);
      const rows = Math.ceil((h + dy * 2) / dy);
      for (let y0 = -2; y0 < rows + 2; y0++){
        for (let x0 = -2; x0 < cols + 2; x0++){
          const ox = (x0 * dx) + ((y0 & 1) ? dx * 0.5 : 0);
          const oy = y0 * dy;
          out.push({
            x: ox + (rand() - 0.5) * jitter,
            y: oy + (rand() - 0.5) * jitter,
            r,
            tw: rand() * 12,
            a: a0 * (0.7 + rand() * 0.6),
          });
        }
      }
    }

    fillLayer(hexFar, farR, farR * 0.10, 0.09);
    fillLayer(hexMid, midR, midR * 0.18, 0.16);
    fillLayer(hexNear, nearR, nearR * 0.22, 0.22);
  }

  function initWaterfall(){
    wfRows = Math.max(120, Math.min(240, Math.floor(h * 0.32)));
    wfScrollAcc = 0;

    wfCanvas = document.createElement('canvas');
    wfCanvas.width = BINS;
    wfCanvas.height = wfRows;
    wfCtx = wfCanvas.getContext('2d');
    wfCtx.imageSmoothingEnabled = false;

    wfImg = wfCtx.createImageData(BINS, 1);
    wfRowData = wfImg.data;

    wfCtx.fillStyle = 'rgba(0,0,0,1)';
    wfCtx.fillRect(0, 0, BINS, wfRows);
  }

  function spawnBee({ x, y, hue } = {}){
    const a = rand() * Math.PI * 2;
    const sp = (0.55 + rand() * 0.65);
    bees.push({
      x: x ?? (danceX + danceW * (0.15 + rand() * 0.7)),
      y: y ?? (danceY + danceH * (0.18 + rand() * 0.68)),
      a,
      sp,
      phase: rand() < 0.7 ? 'waggle' : 'loop',
      timer: 0.6 + rand() * 1.6,
      hue: hue ?? (BANDS[bandIdx].hue + (rand() - 0.5) * 12),
      lastX: null,
      lastY: null,
    });
  }

  function initBees(){
    bees = [];
    trails = [];
    const n = 12 + ((rand() * 7) | 0);
    for (let i = 0; i < n; i++) spawnBee();
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;

    // invalidate cached gradients
    bgGrad = null;
    vignetteGrad = null;
    bgCacheW = 0;
    bgCacheH = 0;

    danceGlowGrad = null;
    danceGlowBandIdx = -1;
    wfSheenGrad = null;
    wfSheenBandIdx = -1;

    pad = Math.max(14, Math.floor(Math.min(w, h) * 0.02));
    panelX = pad;
    panelY = pad;
    panelW = Math.floor(w * 0.72);
    panelH = h - pad * 2;

    infoW = Math.max(260, Math.floor(w * 0.24));
    infoH = Math.max(150, Math.floor(h * 0.22));
    infoX = w - pad - infoW;
    infoY = h - pad - infoH;

    danceX = panelX + Math.floor(panelW * 0.05);
    danceY = panelY + Math.floor(panelH * 0.08);
    danceW = Math.floor(panelW * 0.90);
    danceH = Math.floor(panelH * 0.58);

    wfX = danceX;
    wfW = danceW;
    wfH = Math.floor(panelH * 0.24);
    wfY = panelY + panelH - Math.floor(panelH * 0.08) - wfH;

    bandIdx = (seed >>> 0) % BANDS.length;
    bandTimer = 22 + rand() * 18;
    tuneFx = 0;

    queenPulse = 0;
    nextQueenAt = 10 + rand() * 14;
    queenX = danceX + danceW * (0.35 + rand() * 0.3);
    queenY = danceY + danceH * (0.30 + rand() * 0.32);

    initHoneycomb();
    initWaterfall();
    initBees();
    resetArrays();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function switchBand(next){
    bandIdx = (next + BANDS.length) % BANDS.length;
    bandTimer = 22 + rand() * 18;
    tuneFx = 1.05;

    // invalidate cached gradients that depend on band hue
    danceGlowGrad = null;
    danceGlowBandIdx = -1;
    wfSheenGrad = null;
    wfSheenBandIdx = -1;

    // a little “hive click”
    if (audio.enabled){
      audio.beep({ freq: 180 + rand() * 90, dur: 0.028, gain: 0.02, type: 'square' });
      audio.beep({ freq: 520 + rand() * 220, dur: 0.020, gain: 0.012, type: 'triangle' });
    }

    // spawn a couple fresh dancers
    if (bees.length < 22){
      spawnBee({ hue: BANDS[bandIdx].hue });
      if (rand() < 0.7) spawnBee({ hue: BANDS[bandIdx].hue });
    }
  }

  function depositSpectrum(angle, intensity, hue){
    const u = (angle / (Math.PI * 2)) % 1;
    const idx = Math.max(0, Math.min(BINS - 1, (u * (BINS - 1)) | 0));
    const v = (0.20 + 0.95 * intensity) * (0.7 + rand() * 0.6);
    energy[idx] = Math.min(1.3, energy[idx] + v);
    peaks[idx] = Math.max(peaks[idx], 0.25 + v * 0.8);

    // tiny sparkle tick
    if (audio.enabled && rand() < 0.02 * intensity){
      audio.beep({ freq: 740 + rand() * 420, dur: 0.012, gain: 0.010 + intensity * 0.004, type: pick(['triangle', 'square']) });
    }

    // occasional trail stamp (rare, keeps allocations low)
    if (rand() < 0.018 * intensity){
      trails.push({
        x: danceX + danceW * (0.12 + rand() * 0.76),
        y: danceY + danceH * (0.18 + rand() * 0.68),
        a: angle,
        hue,
        life: 0.9 + rand() * 0.7,
      });
    }
  }

  function updateWaterfall(dt){
    if (!wfCtx) return;

    // dt-based decay/breathing so pacing stays stable across FPS.
    // Rates chosen to match the previous ~60fps-tuned constants.
    const energyDecayBase = 0.7488; // per second
    const energyDecaySlope = 0.468; // per second (scaled by bin index)
    const peakDecayPerSec = 5.4;
    const breatheAmpPerSec = 0.24;

    for (let i = 0; i < BINS; i++){
      const x = i / BINS;
      energy[i] = Math.max(0, energy[i] - (energyDecayBase + energyDecaySlope * x) * dt);
      peaks[i] = Math.max(0, peaks[i] - peakDecayPerSec * dt);
      energy[i] = Math.max(0, energy[i] + breatheAmpPerSec * dt * Math.sin(t * 1.35 + i * 0.18));
    }

    // dt-based scroll (rows/sec) scaled to viewport so the waterfall “fills” in a roughly constant time.
    const scrollRowsPerSec = wfRows / 2.7;
    wfScrollAcc += scrollRowsPerSec * dt;

    let rows = wfScrollAcc | 0;
    if (rows <= 0) return;

    wfScrollAcc -= rows;
    rows = Math.min(rows, wfRows - 1);

    const band = BANDS[bandIdx];
    const hueBase = band.hue;

    // Render one or more new rows at y=0.
    // If dt is large we may emit multiple rows to keep time-consistent scroll.
    for (let r = 0; r < rows; r++){
      // shift down 1px
      wfCtx.globalCompositeOperation = 'copy';
      wfCtx.drawImage(wfCanvas, 0, 1);

      for (let i = 0; i < BINS; i++){
        const e = clamp01(energy[i]);
        const p = clamp01(peaks[i]);
        const hue = hueBase + (i / (BINS - 1) - 0.5) * 38;
        const a = clamp01(0.05 + e * 0.90 + p * 0.12);

        // warm spectral mapping (cheap but punchy)
        const rr = Math.max(0, Math.min(255, (40 + 220 * clamp01(Math.sin((hue + 10) * 0.017) * 0.5 + 0.5)) * (0.35 + e * 0.85)) | 0);
        const gg = Math.max(0, Math.min(255, (30 + 220 * clamp01(Math.sin((hue + 140) * 0.017) * 0.5 + 0.5)) * (0.20 + e * 0.95)) | 0);
        const bb = Math.max(0, Math.min(255, (15 + 190 * clamp01(Math.sin((hue + 250) * 0.017) * 0.5 + 0.5)) * (0.18 + e * 0.70)) | 0);

        const k = i * 4;
        wfRowData[k + 0] = rr;
        wfRowData[k + 1] = gg;
        wfRowData[k + 2] = bb;
        wfRowData[k + 3] = (a * 255) | 0;

        // tuning/static overlay
        if (tuneFx > 0 && rand() < 0.16 * (tuneFx / 1.05)){
          const v = (140 + rand() * 90) | 0;
          wfRowData[k + 0] = v;
          wfRowData[k + 1] = v;
          wfRowData[k + 2] = v;
          wfRowData[k + 3] = (30 + rand() * 70) | 0;
        }
      }

      wfCtx.putImageData(wfImg, 0, 0);
    }

    wfCtx.globalCompositeOperation = 'source-over';
  }

  function stopAudio({ clearCurrent=false } = {}){
    const handle = audioHandle;
    const isCurrent = audio.current === handle;

    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    drone = null;
    audioHandle = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // defensively stop any existing drone we started
    stopAudio({ clearCurrent: true });

    // warm hum bed
    const localDrone = simpleDrone(audio, { root: 110 + (rand() * 25 | 0), detune: 1.1, gain: 0.028 });
    drone = localDrone;

    const handle = {
      stop(){
        try { localDrone?.stop?.(); } catch {}
      },
    };

    audioHandle = handle;
    audio.setCurrent(handle);
  }

  function onAudioOff(){
    // stop/clear everything we own; only clear AudioManager.current if it's ours
    stopAudio({ clearCurrent: true });
  }

  function destroy(){
    stopAudio({ clearCurrent: true });
  }

  function update(dt){
    t += dt;
    if (tuneFx > 0) tuneFx = Math.max(0, tuneFx - dt);

    bandTimer -= dt;
    if (bandTimer <= 0) switchBand(bandIdx + 1);

    queenPulse = Math.max(0, queenPulse - dt * 0.85);

    // queen check
    if (t >= nextQueenAt){
      queenPulse = 1.0;
      nextQueenAt = t + 14 + rand() * 22;
      queenX = danceX + danceW * (0.30 + rand() * 0.40);
      queenY = danceY + danceH * (0.26 + rand() * 0.40);

      // surge bins
      for (let k = 0; k < 14 + ((rand() * 12) | 0); k++){
        depositSpectrum(rand() * Math.PI * 2, 1.25, BANDS[bandIdx].hue);
      }

      // spawn a few extra bees briefly
      for (let i = 0; i < 3; i++) spawnBee({ x: queenX + (rand() - 0.5) * 18, y: queenY + (rand() - 0.5) * 12, hue: BANDS[bandIdx].hue });

      if (audio.enabled){
        audio.beep({ freq: 980 + rand() * 320, dur: 0.05, gain: 0.028, type: 'sawtooth' });
        audio.beep({ freq: 240 + rand() * 60, dur: 0.06, gain: 0.018, type: 'square' });
      }

      trails.push({ x: queenX, y: queenY, a: 0, hue: BANDS[bandIdx].hue + 6, life: 1.4 });
    }

    // update bees
    const band = BANDS[bandIdx];
    const baseRate = 10.5 * band.rate;

    for (const b of bees){
      b.timer -= dt;
      const wag = (Math.sin(t * 18 + b.x * 0.02) * 0.5 + 0.5);

      if (b.phase === 'waggle'){
        // forward run with lateral wiggle
        const vx = Math.cos(b.a);
        const vy = Math.sin(b.a);
        const wig = Math.sin(t * (11 + b.sp * 6) + b.y * 0.03) * 0.8;
        b.x += (vx * (36 * b.sp) + -vy * wig * 10) * dt;
        b.y += (vy * (36 * b.sp) + vx * wig * 10) * dt;

        const intensity = (0.65 + 0.5 * wag) * (1.0 + queenPulse * 0.35);
        depositSpectrum((b.a + Math.PI * 2) % (Math.PI * 2), intensity, b.hue);

        // record a short segment
        if (b.lastX != null){
          trails.push({ x0: b.lastX, y0: b.lastY, x1: b.x, y1: b.y, hue: b.hue, life: 0.45 + rand() * 0.35 });
        }
        b.lastX = b.x;
        b.lastY = b.y;

      } else {
        // looping return
        b.a += (0.9 + 0.6 * wag) * dt;
        b.x += Math.cos(b.a) * (18 * b.sp) * dt;
        b.y += Math.sin(b.a) * (18 * b.sp) * dt;

        b.lastX = null;
        b.lastY = null;
      }

      // bounds
      const mx = 10;
      if (b.x < danceX + mx) { b.x = danceX + mx; b.a = Math.PI - b.a; }
      if (b.x > danceX + danceW - mx) { b.x = danceX + danceW - mx; b.a = Math.PI - b.a; }
      if (b.y < danceY + mx) { b.y = danceY + mx; b.a = -b.a; }
      if (b.y > danceY + danceH - mx) { b.y = danceY + danceH - mx; b.a = -b.a; }

      if (b.timer <= 0){
        b.phase = b.phase === 'waggle' ? 'loop' : 'waggle';
        b.timer = b.phase === 'waggle' ? (0.55 + rand() * 1.1) : (0.45 + rand() * 1.1);
        if (b.phase === 'waggle') b.a = rand() * Math.PI * 2;
      }

      // subtle global emission accumulator (keeps spectrum alive)
      if (rand() < baseRate * dt * 0.03){
        depositSpectrum(rand() * Math.PI * 2, 0.45 + wag * 0.25, b.hue);
      }
    }

    // trails decay (perf: in-place compaction to avoid per-frame array allocation)
    let write = 0;
    for (let i = 0; i < trails.length; i++){
      const tr = trails[i];
      tr.life -= dt;
      if (tr.life > 0.02) trails[write++] = tr;
    }
    trails.length = write;

    updateWaterfall(dt);
  }

  function drawBackground(ctx){
    const band = BANDS[bandIdx];

    if (!bgGrad || bgCacheW !== w || bgCacheH !== h){
      bgCacheW = w;
      bgCacheH = h;

      bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#120b03');
      bgGrad.addColorStop(0.55, '#140a02');
      bgGrad.addColorStop(1, '#060301');

      vignetteGrad = ctx.createRadialGradient(
        w * 0.5, h * 0.5, Math.min(w, h) * 0.10,
        w * 0.5, h * 0.5, Math.max(w, h) * 0.78
      );
      vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.60)');
    }

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    function drawHexLayer(layer, driftX, driftY, lineAlpha, glow){
      ctx.save();
      ctx.translate(driftX, driftY);
      ctx.lineWidth = Math.max(1, h / 650);
      ctx.globalCompositeOperation = 'screen';

      // perf: avoid per-cell hsla(...) string allocations.
      // Set strokeStyle once; vary alpha via globalAlpha.
      ctx.strokeStyle = glow
        ? `hsl(${band.hue + 8}, 85%, 55%)`
        : `hsl(${band.hue + 8}, 85%, 42%)`;

      for (const cell of layer){
        const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.35 + cell.tw));
        ctx.globalAlpha = (cell.a * tw) * lineAlpha;
        hexPath(ctx, cell.x, cell.y, cell.r);
        ctx.stroke();
      }
      ctx.restore();
    }

    const farX = Math.sin(t * 0.06) * w * 0.010;
    const farY = Math.cos(t * 0.05) * h * 0.006;
    const midX = Math.sin(t * 0.10 + 2) * w * 0.014;
    const midY = Math.cos(t * 0.08 + 1) * h * 0.008;
    const nearX = Math.sin(t * 0.14 + 4) * w * 0.018;
    const nearY = Math.cos(t * 0.12 + 3) * h * 0.010;

    drawHexLayer(hexFar, farX, farY, 0.55, false);
    drawHexLayer(hexMid, midX, midY, 0.85, true);

    // subtle vignette
    ctx.save();
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // a small near layer only over panel area (keeps density nice)
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.rect(panelX, panelY, panelW, panelH);
    ctx.clip();
    drawHexLayer(hexNear, nearX, nearY, 0.70, true);
    ctx.restore();
  }

  function drawPanels(ctx){
    // main panel
    ctx.save();
    roundRect(ctx, panelX, panelY, panelW, panelH, 18);
    ctx.fillStyle = 'rgba(6, 6, 10, 0.70)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 130, 0.14)';
    ctx.lineWidth = Math.max(1, h / 560);
    ctx.stroke();
    ctx.restore();

    // info panel
    ctx.save();
    roundRect(ctx, infoX, infoY, infoW, infoH, 18);
    ctx.fillStyle = 'rgba(10, 8, 6, 0.86)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 130, 0.16)';
    ctx.lineWidth = Math.max(1, h / 560);
    ctx.stroke();
    ctx.restore();
  }

  function drawDanceFloor(ctx){
    const band = BANDS[bandIdx];

    // dance sub-panel
    ctx.save();
    roundRect(ctx, danceX - 2, danceY - 2, danceW + 4, danceH + 4, 16);
    ctx.fillStyle = 'rgba(14, 10, 6, 0.78)';
    ctx.fill();
    ctx.clip();

    // soft glow (perf: cached gradient)
    if (!danceGlowGrad || danceGlowBandIdx !== bandIdx || danceGlowCacheX !== danceX || danceGlowCacheY !== danceY || danceGlowCacheW !== danceW || danceGlowCacheH !== danceH){
      danceGlowBandIdx = bandIdx;
      danceGlowCacheX = danceX;
      danceGlowCacheY = danceY;
      danceGlowCacheW = danceW;
      danceGlowCacheH = danceH;

      danceGlowGrad = ctx.createRadialGradient(
        danceX + danceW * 0.5,
        danceY + danceH * 0.5,
        10,
        danceX + danceW * 0.5,
        danceY + danceH * 0.5,
        Math.max(danceW, danceH) * 0.65
      );
      danceGlowGrad.addColorStop(0, `hsla(${band.hue + 10}, 90%, 60%, 0.10)`);
      danceGlowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = danceGlowGrad;
    ctx.fillRect(danceX, danceY, danceW, danceH);

    // waggle traces
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const tr of trails){
      const a = clamp01(tr.life);
      if (tr.x0 == null) continue;
      ctx.strokeStyle = `hsla(${tr.hue}, 95%, 62%, ${0.05 + a * 0.22})`;
      ctx.lineWidth = Math.max(1, h / 720) + a * 1.2;
      ctx.beginPath();
      ctx.moveTo(tr.x0, tr.y0);
      ctx.lineTo(tr.x1, tr.y1);
      ctx.stroke();
    }
    ctx.restore();

    // bees (tiny dots)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const b of bees){
      const sz = 1.2 + b.sp * 0.8;
      ctx.fillStyle = `hsla(${b.hue}, 95%, 65%, 0.40)`;
      ctx.fillRect(b.x - sz * 0.5, b.y - sz * 0.5, sz, sz);
    }
    ctx.restore();

    // queen check ripple
    if (queenPulse > 0){
      const p = clamp01(queenPulse);
      const r0 = (1 - p) * (Math.min(danceW, danceH) * 0.42);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `hsla(${band.hue + 8}, 95%, 70%, ${0.05 + p * 0.20})`;
      ctx.lineWidth = Math.max(1, h / 560) + p * 2;
      ctx.beginPath();
      ctx.arc(queenX, queenY, r0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = `hsla(${band.hue + 10}, 95%, 68%, ${0.05 + p * 0.10})`;
      ctx.beginPath();
      ctx.arc(queenX, queenY, 10 + p * 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // border
    ctx.save();
    roundRect(ctx, danceX - 2, danceY - 2, danceW + 4, danceH + 4, 16);
    ctx.strokeStyle = 'rgba(255, 220, 130, 0.16)';
    ctx.lineWidth = Math.max(1, h / 560);
    ctx.stroke();
    ctx.restore();
  }

  function drawWaterfallPanel(ctx){
    const band = BANDS[bandIdx];

    ctx.save();
    roundRect(ctx, wfX - 2, wfY - 2, wfW + 4, wfH + 4, 16);
    ctx.fillStyle = 'rgba(8, 6, 5, 0.82)';
    ctx.fill();
    ctx.clip();

    // scaled waterfall band
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(wfCanvas, wfX, wfY, wfW, wfH);

    // top gloss (perf: cached gradient)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    if (!wfSheenGrad || wfSheenBandIdx !== bandIdx || wfSheenCacheX !== wfX || wfSheenCacheY !== wfY || wfSheenCacheW !== wfW || wfSheenCacheH !== wfH){
      wfSheenBandIdx = bandIdx;
      wfSheenCacheX = wfX;
      wfSheenCacheY = wfY;
      wfSheenCacheW = wfW;
      wfSheenCacheH = wfH;

      wfSheenGrad = ctx.createLinearGradient(wfX, wfY, wfX + wfW, wfY);
      wfSheenGrad.addColorStop(0, 'rgba(255,220,140,0.00)');
      wfSheenGrad.addColorStop(0.55, `hsla(${band.hue + 8}, 95%, 70%, 0.08)`);
      wfSheenGrad.addColorStop(1, 'rgba(255,180,60,0.00)');
    }
    ctx.fillStyle = wfSheenGrad;
    ctx.fillRect(wfX, wfY, wfW, wfH);
    ctx.restore();

    // queen flash wash
    if (queenPulse > 0){
      const p = clamp01(queenPulse);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255, 255, 255, ${0.04 + p * 0.14})`;
      ctx.fillRect(wfX, wfY, wfW, wfH);
      ctx.restore();
    }

    ctx.restore();

    // border
    ctx.save();
    roundRect(ctx, wfX - 2, wfY - 2, wfW + 4, wfH + 4, 16);
    ctx.strokeStyle = 'rgba(255, 220, 130, 0.18)';
    ctx.lineWidth = Math.max(1, h / 560);
    ctx.stroke();
    ctx.restore();
  }

  function drawInfo(ctx){
    const band = BANDS[bandIdx];

    const px = infoX + 18;
    const py = infoY + 22;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 244, 220, 0.90)';
    ctx.font = `800 ${Math.max(14, Math.floor(h * 0.024))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText('BEEHIVE SPECTRUM RADIO', px, py);

    ctx.fillStyle = 'rgba(255, 244, 220, 0.72)';
    ctx.font = `700 ${Math.max(12, Math.floor(h * 0.020))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText(`${band.key}  •  ${band.name}`, px, py + 24);

    // status chips
    const chipY = py + 54;
    const chipH = 22;

    function chip(x, label, active){
      const tw = ctx.measureText(label).width;
      const cw = tw + 18;
      roundRect(ctx, x, chipY, cw, chipH, 10);
      ctx.fillStyle = active ? `hsla(${band.hue + 8}, 95%, 56%, 0.22)` : 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.strokeStyle = active ? `hsla(${band.hue + 8}, 95%, 72%, 0.30)` : 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = active ? 'rgba(255,250,235,0.90)' : 'rgba(255,250,235,0.62)';
      ctx.font = `700 ${Math.max(11, Math.floor(h * 0.018))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.fillText(label, x + 9, chipY + chipH - 6);
      return cw + 10;
    }

    let x = px;
    x += chip(x, 'DANCE FLOOR', true);
    x += chip(x, 'WATERFALL', true);

    // queen indicator
    const qA = queenPulse > 0.18;
    chip(px, 'QUEEN CHECK', qA);

    // tuning indicator
    if (tuneFx > 0){
      ctx.fillStyle = 'rgba(255,250,235,0.62)';
      ctx.font = `800 ${Math.max(11, Math.floor(h * 0.018))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.fillText('TUNING…', px, infoY + infoH - 18);
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    drawPanels(ctx);
    drawDanceFloor(ctx);
    drawWaterfallPanel(ctx);
    drawInfo(ctx);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
