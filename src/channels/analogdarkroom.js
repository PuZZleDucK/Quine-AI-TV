import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// REVIEWED: 2026-02-10
// Analog Photo Darkroom
// Red-light darkroom loop: expose → agitate → reveal; prints slowly appear with a tiny timer HUD.

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }

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

function fmtMMSS(sec){
  sec = Math.max(0, sec);
  const m = (sec / 60) | 0;
  const s = sec % 60 | 0;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function genPrint(rand){
  const motif = pick(rand, ['mountain', 'city', 'portrait', 'botanical', 'waves']);
  const ink = rand() < 0.5 ? '#20130f' : '#120c0a';
  const accents = [];

  if (motif === 'mountain'){
    const horizon = 0.58 + rand() * 0.12;
    const peakX = 0.34 + rand() * 0.32;
    const peakY = 0.20 + rand() * 0.18;
    const w1 = 0.45 + rand() * 0.22;
    accents.push({ kind: 'poly', fill: true, color: ink, a: 1, pts: [
      [0.08, horizon],
      [peakX, peakY],
      [0.08 + w1, horizon],
    ]});
    accents.push({ kind: 'poly', fill: true, color: ink, a: 0.9, pts: [
      [0.35, horizon + 0.02],
      [0.65 + rand() * 0.12, 0.28 + rand() * 0.14],
      [0.96, horizon + 0.02],
    ]});
    accents.push({ kind: 'line', color: ink, a: 0.85, w: 0.012, pts: [[0.06, horizon], [0.94, horizon]] });
    const sunX = 0.70 + (rand() * 2 - 1) * 0.10;
    accents.push({ kind: 'circle', fill: false, color: ink, a: 0.7, x: sunX, y: 0.22 + rand() * 0.07, r: 0.08 + rand() * 0.03, w: 0.012 });
  }

  if (motif === 'city'){
    const base = 0.65 + rand() * 0.12;
    const n = 9 + ((rand() * 6) | 0);
    let x = 0.08;
    for (let i = 0; i < n; i++){
      const bw = 0.04 + rand() * 0.09;
      const bh = 0.14 + rand() * 0.36;
      accents.push({ kind: 'rect', fill: true, color: ink, a: 0.9, x, y: base - bh, w: bw, h: bh });
      // windows
      if (rand() < 0.7){
        const wx = x + bw * 0.18;
        const wy = base - bh + bh * 0.18;
        const cols = 2 + ((rand() * 3) | 0);
        const rows = 3 + ((rand() * 5) | 0);
        for (let r = 0; r < rows; r++){
          for (let c = 0; c < cols; c++){
            if (rand() < 0.55) continue;
            accents.push({ kind: 'rect', fill: true, color: '#ffffff', a: 0.25, x: wx + (c / cols) * bw * 0.56, y: wy + (r / rows) * bh * 0.62, w: bw * 0.12, h: bh * 0.06 });
          }
        }
      }
      x += bw + (0.012 + rand() * 0.02);
      if (x > 0.92) break;
    }
    accents.push({ kind: 'line', color: ink, a: 0.85, w: 0.012, pts: [[0.06, base], [0.94, base]] });
    // tiny moon
    accents.push({ kind: 'circle', fill: false, color: ink, a: 0.55, x: 0.78, y: 0.22, r: 0.06, w: 0.010 });
  }

  if (motif === 'portrait'){
    accents.push({ kind: 'circle', fill: false, color: ink, a: 0.95, x: 0.50, y: 0.38, r: 0.17 + rand() * 0.04, w: 0.015 });
    accents.push({ kind: 'circle', fill: false, color: ink, a: 0.85, x: 0.44, y: 0.36, r: 0.02 + rand() * 0.008, w: 0.012 });
    accents.push({ kind: 'circle', fill: false, color: ink, a: 0.85, x: 0.56, y: 0.36, r: 0.02 + rand() * 0.008, w: 0.012 });
    accents.push({ kind: 'line', color: ink, a: 0.65, w: 0.012, pts: [[0.46, 0.46], [0.54, 0.46]] });
    accents.push({ kind: 'poly', fill: false, color: ink, a: 0.6, w: 0.012, pts: [[0.45, 0.56], [0.50, 0.59], [0.55, 0.56]] });
    // shoulders
    accents.push({ kind: 'poly', fill: false, color: ink, a: 0.7, w: 0.016, pts: [[0.26, 0.76], [0.40, 0.62], [0.60, 0.62], [0.74, 0.76]] });
  }

  if (motif === 'botanical'){
    const cx = 0.50;
    const cy = 0.70;
    accents.push({ kind: 'line', color: ink, a: 0.75, w: 0.014, pts: [[cx, 0.86], [cx, 0.34]] });
    const leaves = 7 + ((rand() * 5) | 0);
    for (let i = 0; i < leaves; i++){
      const y = 0.42 + (i / (leaves - 1)) * 0.40 + (rand() * 2 - 1) * 0.02;
      const side = (i % 2) ? -1 : 1;
      const len = 0.10 + rand() * 0.12;
      const wv = 0.04 + rand() * 0.05;
      const x0 = cx;
      const x1 = cx + side * len;
      accents.push({
        kind: 'poly',
        fill: false,
        color: ink,
        a: 0.7,
        w: 0.012,
        pts: [[x0, y], [lerp(x0, x1, 0.45), y - wv], [x1, y], [lerp(x0, x1, 0.45), y + wv], [x0, y]],
      });
    }
    accents.push({ kind: 'circle', fill: false, color: ink, a: 0.5, x: 0.50, y: 0.26, r: 0.07 + rand() * 0.02, w: 0.010 });
  }

  if (motif === 'waves'){
    const base = 0.52 + rand() * 0.10;
    const rows = 7 + ((rand() * 5) | 0);
    for (let r = 0; r < rows; r++){
      const y = base + (r / (rows - 1)) * 0.34;
      const pts = [];
      const n = 28;
      const amp = 0.015 + rand() * 0.02;
      const f = 3 + ((rand() * 5) | 0);
      const ph = rand() * Math.PI * 2;
      for (let i = 0; i < n; i++){
        const x = i / (n - 1);
        pts.push([0.06 + x * 0.88, y + Math.sin(x * Math.PI * 2 * f + ph) * amp]);
      }
      accents.push({ kind: 'poly', fill: false, color: ink, a: 0.7, w: 0.012, pts });
    }
    accents.push({ kind: 'circle', fill: false, color: ink, a: 0.45, x: 0.78, y: 0.22, r: 0.06, w: 0.010 });
  }

  return {
    motif,
    accents,
    grain: 0.12 + rand() * 0.14,
    border: 0.06 + rand() * 0.04,
    title: pick(rand, ['ILFORD', 'KODAK', 'CONTACT', 'PRINT', 'NEGATIVE', 'DARKROOM']),
  };
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  // precomputed flicker phases (avoid advancing PRNG in hot path)
  const flickPh1 = rand() * Math.PI * 2;
  const flickPh2 = rand() * Math.PI * 2;

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  const PHASES = [
    { key: 'EXPOSE', dur: 6.0 },
    { key: 'AGITATE', dur: 8.0 },
    { key: 'REVEAL', dur: 10.0 },
  ];
  let phaseIdx = 0;
  let phaseT = 0;

  let font = 16;
  let small = 12;

  let tray = { x: 0, y: 0, w: 0, h: 0, r: 12 };
  let paper = { x: 0, y: 0, w: 0, h: 0, r: 10 };
  let lamp = { x: 0, y: 0, r: 80 };

  let trayInset = 0;
  let liquidRect = { x: 0, y: 0, w: 0, h: 0, r: 0 };

  let bubbles = []; // {x,y,r,spd,ph}
  let print = genPrint(rand);

  let leak = 0;
  let nextLeakAt = 0;

  // audio
  let ambience = null;
  let swishAcc = 0;
  let dripAcc = 0;

  // Perf: cache static gradients/layers on resize/init so draw() creates 0 gradients per frame.
  const cache = {
    bg: null,         // CanvasImageSource | false | null
    lamp: null,       // CanvasImageSource | false | null
    lampR: 0,
    liquid: null,     // CanvasImageSource | false | null
    paperBase: null,  // CanvasImageSource | false | null
    leak: null,       // CanvasImageSource | false | null
    leakR: 0,
  };

  function makeCanvas(W, H){
    if (!(W > 0 && H > 0)) return null;
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(W, H);
    if (typeof document !== 'undefined'){
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return c;
    }
    return null;
  }

  function rebuildCaches(){
    // Background + vignette baked together.
    {
      const c = makeCanvas(w, h);
      if (!c){
        cache.bg = false;
      } else {
        const g = c.getContext('2d');
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#0a0006');
        bg.addColorStop(0.45, '#2a000e');
        bg.addColorStop(1, '#140009');
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);

        const vg = g.createRadialGradient(
          w * 0.5,
          h * 0.55,
          Math.min(w, h) * 0.12,
          w * 0.5,
          h * 0.55,
          Math.min(w, h) * 0.72,
        );
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.62)');
        g.fillStyle = vg;
        g.fillRect(0, 0, w, h);

        cache.bg = c;
      }
    }

    // Lamp light sprite (flicker applied via ctx.globalAlpha).
    {
      const R = Math.max(1, Math.floor(lamp.r));
      const S = Math.max(8, R * 2);
      const c = makeCanvas(S, S);
      if (!c){
        cache.lamp = false;
        cache.lampR = 0;
      } else {
        const g = c.getContext('2d');
        const cx = S / 2;
        const cy = S / 2;
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
        grad.addColorStop(0, 'rgba(255, 80, 60, 0.48)');
        grad.addColorStop(0.35, 'rgba(200, 24, 34, 0.20)');
        grad.addColorStop(1, 'rgba(50, 0, 8, 0)');
        g.clearRect(0, 0, S, S);
        g.fillStyle = grad;
        g.fillRect(0, 0, S, S);
        cache.lamp = c;
        cache.lampR = R;
      }
    }

    // Tray liquid sprite.
    {
      const W = Math.max(1, Math.floor(liquidRect.w));
      const H = Math.max(1, Math.floor(liquidRect.h));
      const c = makeCanvas(W, H);
      if (!c){
        cache.liquid = false;
      } else {
        const g = c.getContext('2d');
        const liq = g.createLinearGradient(0, 0, 0, H);
        liq.addColorStop(0, '#23000b');
        liq.addColorStop(0.6, '#3b0013');
        liq.addColorStop(1, '#180007');
        g.clearRect(0, 0, W, H);
        g.fillStyle = liq;
        roundRect(g, 0, 0, W, H, liquidRect.r);
        g.fill();
        cache.liquid = c;
      }
    }

    // Paper base sprite (so the gradient rotates with the paper).
    {
      const W = Math.max(1, Math.floor(paper.w));
      const H = Math.max(1, Math.floor(paper.h));
      const c = makeCanvas(W, H);
      if (!c){
        cache.paperBase = false;
      } else {
        const g = c.getContext('2d');
        const base = g.createLinearGradient(0, 0, 0, H);
        base.addColorStop(0, '#f3d7d7');
        base.addColorStop(1, '#e8c0c3');
        g.clearRect(0, 0, W, H);
        g.fillStyle = base;
        roundRect(g, 0, 0, W, H, paper.r);
        g.fill();
        cache.paperBase = c;
      }
    }

    // Light leak sprite (scaled when drawn, so we don't allocate a huge offscreen).
    {
      const R = Math.min(w, h) * 0.9;
      const S = 1024;
      const c = makeCanvas(S, S);
      if (!c){
        cache.leak = false;
        cache.leakR = 0;
      } else {
        const g = c.getContext('2d');
        const cx = S / 2;
        const cy = S / 2;
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, S / 2);
        grad.addColorStop(0, 'rgba(255, 120, 90, 0.9)');
        grad.addColorStop(0.35, 'rgba(255, 40, 60, 0.45)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.clearRect(0, 0, S, S);
        g.fillStyle = grad;
        g.fillRect(0, 0, S, S);
        cache.leak = c;
        cache.leakR = R;
      }
    }
  }

  function init({ width, height, dpr: dprIn }){
    w = width; h = height; dpr = dprIn || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 28));
    small = Math.max(11, Math.floor(font * 0.74));

    const trayW = Math.min(w * 0.72, h * 0.98);
    const trayH = trayW * 0.50;
    tray.w = trayW;
    tray.h = trayH;
    tray.x = (w - trayW) * 0.5;
    tray.y = h * 0.56;
    tray.r = Math.max(10, Math.floor(Math.min(trayW, trayH) * 0.06));

    paper.w = trayW * 0.62;
    paper.h = trayH * 0.68;
    paper.x = tray.x + trayW * 0.19;
    paper.y = tray.y + trayH * 0.18;
    paper.r = Math.max(8, Math.floor(Math.min(paper.w, paper.h) * 0.06));

    lamp.x = w * (0.12 + rand() * 0.06);
    lamp.y = h * (0.12 + rand() * 0.06);
    lamp.r = Math.min(w, h) * (0.18 + rand() * 0.06);

    trayInset = tray.w * 0.04;
    liquidRect.x = tray.x + trayInset;
    liquidRect.y = tray.y + trayInset;
    liquidRect.w = tray.w - trayInset * 2;
    liquidRect.h = tray.h - trayInset * 2;
    liquidRect.r = tray.r * 0.72;

    bubbles = Array.from({ length: 44 + ((rand() * 26) | 0) }, () => ({
      x: tray.x + tray.w * (0.10 + rand() * 0.80),
      y: tray.y + tray.h * (0.18 + rand() * 0.70),
      r: 1.5 + rand() * 4.2,
      spd: 0.10 + rand() * 0.35,
      ph: rand() * Math.PI * 2,
    }));

    phaseIdx = 0;
    phaseT = 0;
    print = genPrint(rand);

    leak = 0;
    nextLeakAt = 4 + rand() * 8;

    swishAcc = 0;
    dripAcc = 0;

    rebuildCaches();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive: if onAudioOn() is called repeatedly, never allow stacking.
    // (Stop any previously registered current audio before starting new sources.)
    try { audio.stopCurrent(); } catch {}
    ambience = null;

    const n = audio.noiseSource({ type: 'pink', gain: 0.0038 });
    n.start();
    const d = simpleDrone(audio, { root: 55 + rand() * 22, detune: 0.6, gain: 0.014 });

    ambience = {
      stop(){
        try{ n.stop(); } catch {}
        try{ d.stop(); } catch {}
      }
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    const a = ambience;
    try { a?.stop?.(); } catch {}
    // Only clear/stop the AudioManager's current if it's ours.
    try { if (audio.current === a) audio.stopCurrent(); } catch {}
    ambience = null;
  }

  function destroy(){
    onAudioOff();
  }

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function update(dt){
    t += dt;
    phaseT += dt;

    leak = Math.max(0, leak - dt * 1.8);
    if (t >= nextLeakAt){
      leak = 1;
      nextLeakAt = t + 10 + rand() * 16;
      // subtle flash tick
      safeBeep({ freq: 1400 + rand() * 400, dur: 0.012, gain: 0.006, type: 'triangle' });
    }

    const cur = PHASES[phaseIdx];
    if (phaseT >= cur.dur){
      phaseT = phaseT % cur.dur;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      if (phaseIdx === 0){
        // new print each cycle
        print = genPrint(rand);
      }
      // tiny confirmation click
      safeBeep({ freq: 480 + rand() * 160, dur: 0.016, gain: 0.008, type: 'square' });
    }

    // agitation swishes + reveal drips
    const phaseKey = PHASES[phaseIdx].key;

    if (phaseKey === 'AGITATE' && audio.enabled){
      const p = phaseT / PHASES[phaseIdx].dur;
      const rate = lerp(1.3, 4.2, ease(p));
      swishAcc += dt * rate;
      while (swishAcc >= 1){
        swishAcc -= 1;
        safeBeep({ freq: 170 + rand() * 80, dur: 0.03 + rand() * 0.02, gain: 0.010, type: 'triangle' });
      }
    } else {
      swishAcc = 0;
    }

    if (phaseKey === 'REVEAL' && audio.enabled){
      const p = phaseT / PHASES[phaseIdx].dur;
      dripAcc += dt * lerp(0.6, 1.6, ease(p));
      while (dripAcc >= 1){
        dripAcc -= 1;
        safeBeep({ freq: 980 + rand() * 520, dur: 0.012 + rand() * 0.01, gain: 0.006, type: 'sine' });
      }
    } else {
      dripAcc = 0;
    }
  }

  function drawLamp(ctx){
    const flick = 0.85
      + 0.12 * Math.sin(t * 1.2 + flickPh1)
      + 0.06 * Math.sin(t * 12.7 + flickPh2);

    if (cache.lamp && cache.lamp !== false){
      ctx.save();
      ctx.globalAlpha = flick;
      ctx.drawImage(cache.lamp, lamp.x - cache.lampR, lamp.y - cache.lampR);
      ctx.restore();
    } else {
      // Fallback path (no offscreen canvas support).
      const g = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, lamp.r);
      g.addColorStop(0, `rgba(255, 80, 60, ${0.48 * flick})`);
      g.addColorStop(0.35, `rgba(200, 24, 34, ${0.20 * flick})`);
      g.addColorStop(1, 'rgba(50, 0, 8, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, lamp.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // lamp housing
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#1a0508';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, lamp.r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPrintAccents(ctx, devAmt){
    const bx = paper.x + paper.w * print.border;
    const by = paper.y + paper.h * print.border;
    const bw = paper.w * (1 - 2 * print.border);
    const bh = paper.h * (1 - 2 * print.border);

    // frame
    ctx.save();
    ctx.globalAlpha = 0.22 * devAmt;
    ctx.strokeStyle = '#1a100d';
    ctx.lineWidth = Math.max(1, Math.floor(paper.w * 0.01));
    ctx.strokeRect(bx, by, bw, bh);
    ctx.restore();

    // image
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();

    for (const a of print.accents){
      const alpha = (a.a ?? 1) * devAmt;
      if (alpha <= 0.001) continue;
      ctx.globalAlpha = alpha;

      if (a.kind === 'rect'){
        ctx.fillStyle = a.color;
        ctx.fillRect(bx + a.x * bw, by + a.y * bh, a.w * bw, a.h * bh);
      }
      else if (a.kind === 'circle'){
        const x = bx + a.x * bw;
        const y = by + a.y * bh;
        const r = a.r * Math.min(bw, bh);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (a.fill){
          ctx.fillStyle = a.color;
          ctx.fill();
        } else {
          ctx.strokeStyle = a.color;
          ctx.lineWidth = Math.max(1, Math.floor(a.w * Math.min(bw, bh)));
          ctx.stroke();
        }
      }
      else if (a.kind === 'line'){
        ctx.strokeStyle = a.color;
        ctx.lineWidth = Math.max(1, Math.floor(a.w * Math.min(bw, bh)));
        ctx.beginPath();
        ctx.moveTo(bx + a.pts[0][0] * bw, by + a.pts[0][1] * bh);
        ctx.lineTo(bx + a.pts[1][0] * bw, by + a.pts[1][1] * bh);
        ctx.stroke();
      }
      else if (a.kind === 'poly'){
        ctx.strokeStyle = a.color;
        ctx.fillStyle = a.color;
        ctx.lineWidth = Math.max(1, Math.floor((a.w ?? 0.012) * Math.min(bw, bh)));
        ctx.beginPath();
        for (let i = 0; i < a.pts.length; i++){
          const [px, py] = a.pts[i];
          const x = bx + px * bw;
          const y = by + py * bh;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        if (a.fill) ctx.fill();
        else ctx.stroke();
      }
    }

    // grain + edge fog
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = (0.08 + print.grain * 0.12) * devAmt;
    ctx.fillStyle = '#2a1712';
    const dots = 140;
    for (let i = 0; i < dots; i++){
      const x = bx + ((i * 97) % 997) / 997 * bw;
      const y = by + ((i * 193) % 991) / 991 * bh;
      const r = 0.7 + ((i * 29) % 13) * 0.08;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function draw(ctx){
    if (!w || !h) return;

    // background (+ vignette)
    if (cache.bg && cache.bg !== false){
      ctx.drawImage(cache.bg, 0, 0);
    } else {
      // Fallback path (no offscreen canvas support).
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0a0006');
      bg.addColorStop(0.45, '#2a000e');
      bg.addColorStop(1, '#140009');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.55, Math.min(w, h) * 0.12, w * 0.5, h * 0.55, Math.min(w, h) * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    drawLamp(ctx);

    // table
    ctx.save();
    ctx.fillStyle = '#090205';
    ctx.globalAlpha = 0.95;
    ctx.fillRect(0, tray.y + tray.h * 0.62, w, h);
    ctx.restore();

    // tray body
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#1a0508';
    roundRect(ctx, tray.x, tray.y, tray.w, tray.h, tray.r);
    ctx.fill();

    // liquid
    const agitate = PHASES[phaseIdx].key === 'AGITATE' ? ease(phaseT / PHASES[phaseIdx].dur) : 0;
    const slosh = (Math.sin(t * 2.2) * 0.5 + Math.sin(t * 1.3 + 0.8) * 0.5) * agitate;

    const lx = liquidRect.x;
    const ly = liquidRect.y;
    const lw = liquidRect.w;
    const lh = liquidRect.h;

    if (cache.liquid && cache.liquid !== false){
      ctx.drawImage(cache.liquid, lx, ly + slosh * lh * 0.04);
    } else {
      const liq = ctx.createLinearGradient(0, ly, 0, ly + lh);
      liq.addColorStop(0, '#23000b');
      liq.addColorStop(0.6, '#3b0013');
      liq.addColorStop(1, '#180007');
      ctx.fillStyle = liq;
      roundRect(ctx, lx, ly + slosh * lh * 0.04, lw, lh, liquidRect.r);
      ctx.fill();
    }

    // bubbles
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, lx, ly, lw, lh, liquidRect.r);
    ctx.clip();
    for (const b of bubbles){
      const by = b.y + Math.sin(t * (0.7 + b.spd) + b.ph) * (2 + 10 * agitate);
      const bx = b.x + Math.cos(t * (0.6 + b.spd) + b.ph) * (1 + 7 * agitate);
      const alpha = 0.06 + 0.08 * agitate;
      ctx.fillStyle = `rgba(255, 160, 160, ${alpha})`;
      ctx.beginPath();
      ctx.arc(bx, by, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // paper
    const tilt = (Math.sin(t * 1.7) * 0.6 + Math.sin(t * 0.9 + 2.2) * 0.4) * agitate * 0.06;
    ctx.save();
    ctx.translate(paper.x + paper.w * 0.5, paper.y + paper.h * 0.5);
    ctx.rotate(tilt);
    ctx.translate(-(paper.x + paper.w * 0.5), -(paper.y + paper.h * 0.5));

    // base paper (safelight tint)
    if (cache.paperBase && cache.paperBase !== false){
      ctx.drawImage(cache.paperBase, paper.x, paper.y);
    } else {
      const base = ctx.createLinearGradient(paper.x, paper.y, paper.x, paper.y + paper.h);
      base.addColorStop(0, '#f3d7d7');
      base.addColorStop(1, '#e8c0c3');
      ctx.fillStyle = base;
      roundRect(ctx, paper.x, paper.y, paper.w, paper.h, paper.r);
      ctx.fill();
    }

    // developer tint layer
    const phaseKey = PHASES[phaseIdx].key;
    const p = phaseT / PHASES[phaseIdx].dur;
    let devAmt = 0;
    if (phaseKey === 'AGITATE') devAmt = 0.55 * ease(p);
    else if (phaseKey === 'REVEAL') devAmt = 0.55 + 0.45 * ease(p);

    // subtle darkening as it develops
    ctx.save();
    ctx.globalAlpha = 0.22 * devAmt;
    ctx.fillStyle = '#240b10';
    roundRect(ctx, paper.x, paper.y, paper.w, paper.h, paper.r);
    ctx.fill();
    ctx.restore();

    drawPrintAccents(ctx, devAmt);

    // highlight edge
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(255, 210, 210, 0.35)';
    ctx.lineWidth = Math.max(1, Math.floor(paper.w * 0.01));
    roundRect(ctx, paper.x + 1, paper.y + 1, paper.w - 2, paper.h - 2, paper.r);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    ctx.restore(); // clip
    ctx.restore(); // tray save

    // light leak special moment
    if (leak > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.22 * leak;

      if (cache.leak && cache.leak !== false){
        const R = cache.leakR;
        const x0 = w * 0.86 - R;
        const y0 = h * 0.18 - R;
        ctx.drawImage(cache.leak, x0, y0, R * 2, R * 2);
      } else {
        const lxg = ctx.createRadialGradient(w * 0.86, h * 0.18, 0, w * 0.86, h * 0.18, Math.min(w, h) * 0.9);
        lxg.addColorStop(0, 'rgba(255, 120, 90, 0.9)');
        lxg.addColorStop(0.35, 'rgba(255, 40, 60, 0.45)');
        lxg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lxg;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.restore();
    }

    // HUD
    const cur = PHASES[phaseIdx];
    const rem = Math.max(0, cur.dur - phaseT);

    ctx.save();
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255, 210, 210, 0.82)';
    const x = w - Math.max(10, w * 0.04);
    const y = Math.max(10, h * 0.04);
    ctx.textAlign = 'right';
    ctx.fillText('DARKROOM', x, y);
    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255, 170, 170, 0.90)';
    ctx.fillText(cur.key, x, y + small * 1.35);
    ctx.fillStyle = 'rgba(255, 210, 210, 0.78)';
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(fmtMMSS(rem), x, y + small * 1.35 + font * 1.05);

    ctx.globalAlpha = 0.55;
    ctx.fillText(print.title, x, y + small * 1.35 + font * 1.05 + small * 1.15);
    ctx.restore();
  }

  return {
    onResize,
    onAudioOn,
    onAudioOff,
    update,
    draw,
    destroy,
  };
}
