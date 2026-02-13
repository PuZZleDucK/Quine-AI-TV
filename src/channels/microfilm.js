import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// REVIEWED: 2026-02-14

function pick(rand, arr) {
  return arr[(rand() * arr.length) | 0];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function ease(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function pad3(n) {
  return String(n | 0).padStart(3, '0');
}

function mkCode(rand, n) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < n; i++) out += alpha[(rand() * alpha.length) | 0];
  return out;
}

const TITLES = [
  'CITY RECORDS — INDEX',
  'FIELD NOTES — MICROFILM',
  'ARCHIVE ROLL — LEDGER',
  'NEWSPAPER CLIPPINGS',
  'TECHNICAL BULLETINS',
  'MAPS & MARGINALIA',
];

const NOTE_SNIPPETS = [
  '"CHECK DRAWER 7B"',
  '"DON\'T TRUST THE DATE"',
  '"SEE ALSO: ROLL 014"',
  '"MISSING PAGE FOUND"',
  '"HANDWRITING MATCH?"',
  '"STAMPED — CONFIDENTIAL"',
  '"LOOK FOR THE SMALL STAR"',
];

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;
  let mono = 14;

  const PHASES = [
    { key: 'load', dur: 7.5, label: 'LOAD' },
    { key: 'scan', dur: 16, label: 'SCAN' },
    { key: 'index', dur: 10.5, label: 'INDEX' },
    { key: 'note', dur: 6.5, label: 'FOUND NOTE' },
  ];

  let phaseIdx = 0;
  let phaseT = 0;

  // roll content
  let rollNo = 0;
  let rollId = '';
  let title = '';
  let frames = []; // {code, lines: [..], ink}
  let highlightIdx = 0;
  let noteText = '';

  // motion
  let filmOffset = 0; // in frame-widths
  let filmSpeed = 0.06;
  let reelA = 0;
  let reelB = 0;

  // fx
  let flash = 0;
  let nextFlashAt = 0;
  let dust = [];

  // audio
  let ambience = null;
  let clickAcc = 0;

  // Cached layers (rebuilt on init/resize)
  const cache = {
    bg: null, // CanvasImageSource | false | null
    bgW: 0,
    bgH: 0,
    vignette: null, // CanvasImageSource | false | null
    vigW: 0,
    vigH: 0,
  };

  function makeCanvas(W, H) {
    if (!(W > 0 && H > 0)) return null;
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(W, H);
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return c;
    }
    return null;
  }

  function ensureBG() {
    const W = Math.max(1, Math.floor(w));
    const H = Math.max(1, Math.floor(h));
    if (cache.bg !== null && cache.bgW === W && cache.bgH === H) return;

    cache.bgW = W;
    cache.bgH = H;

    const c = makeCanvas(W, H);
    if (!c) {
      cache.bg = false;
      return;
    }

    const gctx = c.getContext('2d');
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, W, H);

    const g = gctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05070a');
    g.addColorStop(0.55, '#020304');
    g.addColorStop(1, '#000000');
    gctx.fillStyle = g;
    gctx.fillRect(0, 0, W, H);

    // soft desk glow
    gctx.fillStyle = 'rgba(108,242,255,0.06)';
    gctx.fillRect(0, H * 0.58, W, H * 0.42);

    cache.bg = c;
  }

  function ensureVignette() {
    const W = Math.max(1, Math.floor(w));
    const H = Math.max(1, Math.floor(h));
    if (cache.vignette !== null && cache.vigW === W && cache.vigH === H) return;

    cache.vigW = W;
    cache.vigH = H;

    const c = makeCanvas(W, H);
    if (!c) {
      cache.vignette = false;
      return;
    }

    const gctx = c.getContext('2d');
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, W, H);

    const vg = gctx.createRadialGradient(
      W * 0.5,
      H * 0.48,
      Math.min(W, H) * 0.18,
      W * 0.5,
      H * 0.48,
      Math.max(W, H) * 0.72,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.60)');
    gctx.fillStyle = vg;
    gctx.fillRect(0, 0, W, H);

    cache.vignette = c;
  }

  function sceneInit(width, height, dprIn) {
    w = width;
    h = height;
    dpr = dprIn || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.88));

    phaseIdx = 0;
    phaseT = 0;

    filmOffset = rand() * 10;
    reelA = rand() * Math.PI * 2;
    reelB = rand() * Math.PI * 2;

    flash = 0;
    nextFlashAt = 5 + rand() * 8;

    dust = Array.from({ length: 80 }, () => ({
      x: rand(),
      y: rand(),
      r: 0.6 + rand() * 1.8,
      v: 0.015 + rand() * 0.05,
      a: 0.05 + rand() * 0.18,
    }));

    ensureBG();
    ensureVignette();

    regenRoll(true);
  }

  function regenRoll(isFresh) {
    rollNo = (rollNo + 1 + ((rand() * 2) | 0)) % 999;
    rollId = `ROLL ${pad3(rollNo)}-${mkCode(rand, 3)}`;
    title = pick(rand, TITLES);

    const n = 28 + ((rand() * 10) | 0);
    frames = [];
    for (let i = 0; i < n; i++) {
      const code = `${mkCode(rand, 2)}-${pad3(10 + ((rand() * 980) | 0))}`;
      const lines = [];
      const ln = 4 + ((rand() * 4) | 0);
      for (let k = 0; k < ln; k++) {
        // short pseudo-lines, like dense microfilm paragraphs
        const len = 18 + ((rand() * 14) | 0);
        lines.push(mkCode(rand, len).replace(/[0-9]/g, ''));
      }
      frames.push({
        code,
        lines,
        ink: rand() * 0.9,
      });
    }

    highlightIdx = ((rand() * frames.length) | 0);
    noteText = pick(rand, NOTE_SNIPPETS);

    if (isFresh) {
      filmOffset = rand() * frames.length;
    }
  }

  function enterPhase(idx) {
    phaseIdx = idx;
    phaseT = 0;

    const key = PHASES[phaseIdx].key;
    if (key === 'load') {
      regenRoll(false);
    } else if (key === 'note') {
      highlightIdx = ((highlightIdx + 3 + ((rand() * 9) | 0)) % frames.length) | 0;
      noteText = pick(rand, NOTE_SNIPPETS);
    }

    // tiny UI click
    if (audio.enabled) {
      audio.beep({ freq: 520 + rand() * 140, dur: 0.016, gain: 0.010, type: 'square' });
    }
  }

  function onResize(width, height, dprIn) {
    sceneInit(width, height, dprIn);
  }

  function stopAmbience({ clearCurrent = false } = {}) {
    const handle = ambience;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent) {
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ambience = null;
  }

  function onAudioOn() {
    if (!audio.enabled) return;

    // Defensive: if onAudioOn is called repeatedly while audio is enabled,
    // ensure we don't stack/overlap our own ambience.
    stopAmbience({ clearCurrent: true });

    // quiet projector/motor vibe: pink noise + low drone
    const n = audio.noiseSource({ type: 'pink', gain: 0.0045 });
    n.start();
    const d = simpleDrone(audio, { root: 55 + rand() * 24, detune: 1.1, gain: 0.020 });
    ambience = {
      stop() {
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      },
    };
    audio.setCurrent(ambience);
  }

  function onAudioOff() {
    stopAmbience({ clearCurrent: true });
  }

  function destroy() {
    onAudioOff();
  }

  function update(dt) {
    t += dt;
    phaseT += dt;

    const phase = PHASES[phaseIdx];
    if (phaseT >= phase.dur) {
      enterPhase((phaseIdx + 1) % PHASES.length);
    }

    const key = PHASES[phaseIdx].key;
    filmSpeed = key === 'scan' ? 0.12 : key === 'index' ? 0.045 : 0.07;

    filmOffset = (filmOffset + dt * filmSpeed * 3.1) % Math.max(1, frames.length);

    const spin = dt * (0.9 + filmSpeed * 5);
    reelA += spin;
    reelB -= spin * 0.92;

    flash = Math.max(0, flash - dt * 1.4);
    if (t >= nextFlashAt) {
      flash = 1;
      nextFlashAt = t + 7 + rand() * 13;
    }

    // dust drift
    for (const p of dust) {
      p.y += dt * p.v;
      if (p.y > 1.05) {
        p.y = -0.05;
        p.x = rand();
        p.v = 0.015 + rand() * 0.05;
        p.a = 0.05 + rand() * 0.18;
        p.r = 0.6 + rand() * 1.8;
      }
    }

    // occasional film-advance click (stronger during SCAN)
    if (audio.enabled) {
      const rate = key === 'scan' ? 11 : 6.5;
      clickAcc += dt * rate;
      while (clickAcc >= 1) {
        clickAcc -= 1;
        const g = key === 'scan' ? 0.010 : 0.006;
        audio.beep({ freq: 620 + rand() * 220, dur: 0.008, gain: g, type: 'square' });
      }
    } else {
      clickAcc = 0;
    }
  }

  function bg(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (cache.bg && cache.bg !== false) {
      ctx.drawImage(cache.bg, 0, 0);
      return;
    }

    // Fallback (no offscreen canvas support)
    ctx.clearRect(0, 0, w, h);

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05070a');
    g.addColorStop(0.55, '#020304');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // soft desk glow
    ctx.fillStyle = 'rgba(108,242,255,0.06)';
    ctx.fillRect(0, h * 0.58, w, h * 0.42);
  }

  function drawLabel(ctx, x, y, a, b) {
    ctx.save();
    ctx.textBaseline = 'middle';

    ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255, 215, 120, 0.88)';
    ctx.fillText(a, x, y);

    const aw = ctx.measureText(a).width;
    ctx.font = `${Math.floor(font * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(231,238,246,0.82)';
    ctx.fillText(b, x + aw + 10, y);

    ctx.restore();
  }

  function drawReel(ctx, cx, cy, r, ang, bright) {
    ctx.save();

    const body = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
    body.addColorStop(0, `rgba(231,238,246,${0.06 + bright * 0.06})`);
    body.addColorStop(1, 'rgba(231,238,246,0.015)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(231,238,246,0.10)';
    ctx.lineWidth = Math.max(1, h / 620);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // spokes
    const spokes = 6;
    ctx.strokeStyle = `rgba(108,242,255,${0.10 + bright * 0.12})`;
    ctx.lineWidth = Math.max(1, h / 700);
    for (let i = 0; i < spokes; i++) {
      const a = ang + (i / spokes) * Math.PI * 2;
      const x0 = cx + Math.cos(a) * r * 0.18;
      const y0 = cy + Math.sin(a) * r * 0.18;
      const x1 = cx + Math.cos(a) * r * 0.9;
      const y1 = cy + Math.sin(a) * r * 0.9;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawFrame(ctx, x, y, fw, fh, f, isHot) {
    ctx.save();

    // paper
    ctx.fillStyle = `rgba(231,238,246,${0.86 - f.ink * 0.18})`;
    ctx.fillRect(x, y, fw, fh);

    // microfilm darkness banding
    const band = 0.10 + 0.10 * (0.5 + 0.5 * Math.sin(t * 2.2 + f.ink * 7));
    ctx.fillStyle = `rgba(0,0,0,${band})`;
    ctx.fillRect(x, y, fw, fh);

    // header code
    ctx.font = `${Math.max(10, Math.floor(mono * 0.70))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(10,12,14,0.55)';
    ctx.textBaseline = 'top';
    ctx.fillText(f.code, x + fw * 0.06, y + fh * 0.06);

    // pseudo paragraphs
    ctx.font = `${Math.max(10, Math.floor(mono * 0.62))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(10,12,14,0.42)';
    const lh = Math.max(9, Math.floor(fh * 0.12));
    for (let i = 0; i < f.lines.length; i++) {
      const yy = y + fh * 0.25 + i * lh;
      if (yy > y + fh * 0.9) break;
      ctx.fillText(f.lines[i], x + fw * 0.06, yy);
    }

    // small diagram block
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = 'rgba(10,12,14,0.75)';
    ctx.lineWidth = 1;
    const bx = x + fw * 0.62;
    const by = y + fh * 0.30;
    const bw = fw * 0.30;
    const bh = fh * 0.46;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.beginPath();
    ctx.moveTo(bx, by + bh * 0.6);
    ctx.lineTo(bx + bw, by + bh * 0.25);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (isHot) {
      ctx.strokeStyle = 'rgba(255, 215, 120, 0.90)';
      ctx.lineWidth = Math.max(2, h / 400);
      ctx.strokeRect(x + 1.5, y + 1.5, fw - 3, fh - 3);

      ctx.fillStyle = 'rgba(255, 215, 120, 0.10)';
      ctx.fillRect(x, y, fw, fh);
    }

    ctx.restore();
  }

  function render(ctx) {
    bg(ctx);

    const key = PHASES[phaseIdx].key;
    const phaseP = phaseT / Math.max(0.001, PHASES[phaseIdx].dur);

    const pad = Math.floor(Math.min(w, h) * 0.06);
    const top = pad;

    // header panel
    ctx.fillStyle = 'rgba(108,242,255,0.08)';
    ctx.fillRect(pad, top, w - pad * 2, Math.max(54, font * 2.4));

    ctx.fillStyle = 'rgba(231,238,246,0.95)';
    ctx.font = `700 ${font}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textBaseline = 'top';
    ctx.fillText('Microfilm Archive Reader', pad + font, top + Math.floor(font * 0.45));

    ctx.fillStyle = 'rgba(231,238,246,0.70)';
    ctx.font = `${small}px ui-sans-serif, system-ui, -apple-system`;
    ctx.fillText(`${title}  •  ${rollId}  •  ${PHASES[phaseIdx].label}`, pad + font, top + Math.floor(font * 1.55));

    // reader body
    const bodyY = top + Math.max(54, font * 2.4) + Math.floor(font * 0.9);
    const bodyH = h - bodyY - pad;
    const bodyX = pad;
    const bodyW = w - pad * 2;

    ctx.fillStyle = 'rgba(8,10,12,0.90)';
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
    ctx.strokeStyle = 'rgba(231,238,246,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bodyX + 1, bodyY + 1, bodyW - 2, bodyH - 2);

    // reels
    const reelY = bodyY + bodyH * 0.22;
    const r = Math.min(bodyW, bodyH) * 0.10;
    const rx0 = bodyX + bodyW * 0.22;
    const rx1 = bodyX + bodyW * 0.78;

    const bright = key === 'scan' ? 1 : 0.25;
    drawReel(ctx, rx0, reelY, r, reelA, bright);
    drawReel(ctx, rx1, reelY, r, reelB, bright);

    // film strip path
    const stripY = bodyY + bodyH * 0.52;
    const stripH = Math.max(64, Math.floor(bodyH * 0.18));
    const stripX = bodyX + bodyW * 0.08;
    const stripW = bodyW * 0.84;

    // strip frame
    ctx.fillStyle = 'rgba(231,238,246,0.05)';
    ctx.fillRect(stripX, stripY - stripH * 0.55, stripW, stripH * 1.1);

    const fw = Math.max(54, Math.floor(stripH * 0.72));
    const fh = Math.max(44, Math.floor(stripH * 0.78));

    // visible frames
    const idx0 = Math.floor(filmOffset);
    const frac = filmOffset - idx0;
    const count = Math.ceil(stripW / fw) + 2;
    const startX = stripX - frac * fw;

    for (let i = 0; i < count; i++) {
      const fi = (idx0 + i) % frames.length;
      const f = frames[fi];
      const x = startX + i * fw;
      const y = stripY - fh * 0.5;
      const hot = key === 'note' && fi === highlightIdx;
      drawFrame(ctx, x, y, fw - 6, fh, f, hot);

      // sprocket holes
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const holeR = Math.max(1, Math.floor(fh / 24));
      for (let k = 0; k < 5; k++) {
        const hx = x + fw * (0.10 + k * 0.18);
        ctx.fillRect(hx, y - holeR * 2.4, holeR * 2.0, holeR * 2.0);
        ctx.fillRect(hx, y + fh + holeR * 0.6, holeR * 2.0, holeR * 2.0);
      }
    }

    // scan window (magnifier)
    const winW = Math.floor(bodyW * 0.42);
    const winH = Math.floor(bodyH * 0.22);
    const winX = Math.floor(bodyX + bodyW * 0.29);
    const winY = Math.floor(bodyY + bodyH * 0.64);

    ctx.save();
    ctx.fillStyle = 'rgba(108,242,255,0.06)';
    ctx.fillRect(winX, winY, winW, winH);
    ctx.strokeStyle = 'rgba(108,242,255,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(winX + 1, winY + 1, winW - 2, winH - 2);

    // scanline
    const scanP = (t * (key === 'scan' ? 0.8 : 0.35) + seed * 0.0001) % 1;
    const sx = winX + scanP * winW;
    ctx.fillStyle = `rgba(255, 215, 120, ${0.08 + (key === 'scan' ? 0.08 : 0.03)})`;
    ctx.fillRect(sx - 10, winY + 4, 20, winH - 8);

    // found-note hotspot shimmer
    if (key === 'note') {
      const p = ease(clamp((phaseP - 0.15) / 0.65, 0, 1));
      ctx.fillStyle = `rgba(255, 215, 120, ${0.06 + p * 0.10})`;
      ctx.fillRect(winX + 6, winY + 6, winW - 12, winH - 12);
    }

    // small status in window
    ctx.font = `${Math.floor(small * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(231,238,246,0.70)';
    ctx.textBaseline = 'top';
    const cur = (Math.floor(filmOffset) + 1) % frames.length;
    ctx.fillText(`FRAME ${pad3(cur)} / ${pad3(frames.length)}`, winX + 10, winY + 10);
    ctx.restore();

    // note overlay
    if (key === 'note') {
      const p = ease(clamp((phaseP - 0.05) / 0.22, 0, 1));
      const nx = bodyX + bodyW * 0.08;
      const ny = bodyY + bodyH * 0.34;
      const nw = bodyW * 0.36;
      const nh = bodyH * 0.22;

      ctx.save();
      ctx.globalAlpha = 0.92 * p;
      ctx.fillStyle = 'rgba(255, 215, 120, 0.94)';
      ctx.fillRect(nx, ny, nw, nh);
      ctx.fillStyle = 'rgba(10,12,14,0.75)';
      ctx.font = `800 ${Math.floor(font * 0.86)}px ui-sans-serif, system-ui, -apple-system`;
      ctx.textBaseline = 'top';
      ctx.fillText('FOUND NOTE', nx + 12, ny + 10);
      ctx.font = `${Math.floor(mono * 0.78)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(noteText, nx + 12, ny + Math.floor(font * 1.6));
      ctx.fillStyle = 'rgba(10,12,14,0.35)';
      ctx.fillRect(nx + nw * 0.84, ny + 10, nw * 0.12, 5);
      ctx.restore();
    }

    // film leader glow during LOAD
    if (key === 'load') {
      const p = ease(clamp(phaseP / 0.55, 0, 1));
      ctx.fillStyle = `rgba(108,242,255,${0.03 + p * 0.05})`;
      ctx.fillRect(stripX, stripY - stripH * 0.65, stripW, stripH * 1.3);
    }

    // dust specks
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const p of dust) {
      const x = bodyX + p.x * bodyW;
      const y = bodyY + p.y * bodyH;
      ctx.fillStyle = `rgba(231,238,246,${p.a * (0.55 + 0.45 * (key === 'scan' ? 1 : 0.75))})`;
      ctx.fillRect(x, y, p.r, p.r);
    }
    ctx.restore();

    // flash/exposure
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.06})`;
      ctx.fillRect(0, 0, w, h);
    }

    // vignette
    if (cache.vignette && cache.vignette !== false) {
      ctx.drawImage(cache.vignette, 0, 0);
    } else {
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.18, w * 0.5, h * 0.48, Math.max(w, h) * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.60)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    drawLabel(ctx, pad + font, top + Math.floor(font * 2.25), 'CH', 'MICROFILM');
  }

  function init({ width, height, dpr: dprIn }) {
    sceneInit(width, height, dprIn);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
