import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// REVIEWED: 2026-02-11

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  const PHASES = [
    { id: 'cut', label: 'CUT KEY' },
    { id: 'pins', label: 'SET PINS' },
    { id: 'turn', label: 'TURN + TEST' },
  ];
  const PHASE_DUR = 16;
  let phaseIdx = 0;
  let phaseT = 0;

  let font = 16;
  let small = 12;
  let mono = 13;

  // deterministic palette
  const palettes = [
    { woodA: '#2a1a12', woodB: '#1a100b', metalA: '#cfd6df', metalB: '#7f8a99', brass: '#d2b65b', ink: 'rgba(245,245,248,0.92)', accent: '#7ad7ff' },
    { woodA: '#261a0d', woodB: '#130d06', metalA: '#d7dde5', metalB: '#8e96a3', brass: '#cfa74a', ink: 'rgba(245,245,248,0.92)', accent: '#ffd27a' },
    { woodA: '#23170f', woodB: '#0f0a06', metalA: '#dbe3ed', metalB: '#8792a3', brass: '#e0c36a', ink: 'rgba(245,245,248,0.92)', accent: '#a8ff8a' },
  ];
  const pal = pick(rand, palettes);

  // hot-path draw colors (avoid per-frame template-literal `rgba(...)` allocations)
  const COLOR_DUST = 'rgb(210,235,255)';
  const COLOR_HILITE = 'rgb(180,255,255)';

  // layout
  let key = { x:0, y:0, w:0, h:0 };
  let lock = { x:0, y:0, w:0, h:0 };

  // key cuts + pins
  let pinCount = 6;
  let cutTargets = []; // 0..1 depths
  let grain = []; // [{x,y,l,a,w}]

  // special moments
  let clickFlash = 0;
  let clickFired = false;
  let glint = 0;
  let nextGlintAt = 0;

  // dust motes (reused objects)
  let dust = [];

  // cached gradients + sprites (rebuild on init/resize/ctx swap)
  let gradCtx = null;
  let gradKey = '';
  let woodGrad = null;
  let woodVignetteGrad = null;
  let keyBodyGrad = null;
  let lockBodyGrad = null;

  let sweepCanvas = null; // horizontal white sweep (alpha gradient)
  let plugCanvas = null;
  let plugPad = 0;

  // derived layout (stable for given w/h)
  let inner = { x:0, y:0, w:0, h:0 };
  let plugW = 0;
  let plugH = 0;
  let plugCx = 0;
  let plugCy = 0;

  function invalidateCaches(){
    gradCtx = null;
    gradKey = '';
    woodGrad = null;
    woodVignetteGrad = null;
    keyBodyGrad = null;
    lockBodyGrad = null;
    sweepCanvas = null;
    plugCanvas = null;
  }

  function ensureCaches(ctx){
    const keyStr = `${w},${h},${key.x},${key.y},${key.w},${key.h},${lock.x},${lock.y},${lock.w},${lock.h}`;
    if (ctx === gradCtx && keyStr === gradKey && woodGrad && woodVignetteGrad && keyBodyGrad && lockBodyGrad && sweepCanvas && plugCanvas) return;

    gradCtx = ctx;
    gradKey = keyStr;

    woodGrad = ctx.createLinearGradient(0, 0, 0, h);
    woodGrad.addColorStop(0, pal.woodA);
    woodGrad.addColorStop(1, pal.woodB);

    woodVignetteGrad = ctx.createRadialGradient(w*0.5, h*0.5, Math.min(w,h)*0.12, w*0.5, h*0.5, Math.max(w,h)*0.7);
    woodVignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
    woodVignetteGrad.addColorStop(1, 'rgba(0,0,0,0.55)');

    keyBodyGrad = ctx.createLinearGradient(key.x, key.y, key.x + key.w, key.y);
    keyBodyGrad.addColorStop(0, pal.metalB);
    keyBodyGrad.addColorStop(0.5, pal.metalA);
    keyBodyGrad.addColorStop(1, pal.metalB);

    lockBodyGrad = ctx.createLinearGradient(lock.x, lock.y, lock.x + lock.w, lock.y + lock.h);
    lockBodyGrad.addColorStop(0, 'rgba(20,20,24,0.72)');
    lockBodyGrad.addColorStop(1, 'rgba(0,0,0,0.72)');

    // sweep sprite (reused for key glint + click sparkle)
    sweepCanvas = document.createElement('canvas');
    sweepCanvas.width = 256;
    sweepCanvas.height = 64;
    const sctx = sweepCanvas.getContext('2d');
    const sg = sctx.createLinearGradient(0, 0, sweepCanvas.width, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,1)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, sweepCanvas.width, sweepCanvas.height);

    // plug sprite (metal fill + slot + shear line + outline)
    plugPad = Math.ceil(plugH * 0.25);
    plugCanvas = document.createElement('canvas');
    plugCanvas.width = Math.ceil(plugW + plugPad * 2);
    plugCanvas.height = Math.ceil(plugH + plugPad * 2);
    const pctx = plugCanvas.getContext('2d');

    const pg = pctx.createLinearGradient(plugPad, plugPad, plugPad + plugW, plugPad + plugH);
    pg.addColorStop(0, pal.metalB);
    pg.addColorStop(0.55, pal.metalA);
    pg.addColorStop(1, pal.metalB);
    pctx.fillStyle = pg;
    roundedRect(pctx, plugPad, plugPad, plugW, plugH, plugH*0.2);
    pctx.fill();

    // key slot cutout
    pctx.save();
    pctx.globalCompositeOperation = 'destination-out';
    pctx.fillStyle = 'rgba(0,0,0,1)';
    roundedRect(
      pctx,
      plugPad + plugW * 0.16,
      plugPad + plugH * 0.56,
      plugW * 0.68,
      plugH * 0.18,
      plugH * 0.09
    );
    pctx.fill();
    pctx.restore();

    // shear line
    pctx.strokeStyle = 'rgba(0,0,0,0.32)';
    pctx.lineWidth = Math.max(1, plugH*0.045);
    pctx.beginPath();
    pctx.moveTo(plugPad + plugW * 0.02, plugPad + plugH * 0.48);
    pctx.lineTo(plugPad + plugW * 0.98, plugPad + plugH * 0.48);
    pctx.stroke();

    // outline
    pctx.strokeStyle = 'rgba(0,0,0,0.42)';
    pctx.lineWidth = Math.max(1, plugH*0.06);
    roundedRect(pctx, plugPad, plugPad, plugW, plugH, plugH*0.2);
    pctx.stroke();
  }

  // audio
  let ambience = null;
  let cutAcc = 0;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regen(){
    t = 0;
    phaseIdx = 0;
    phaseT = 0;

    pinCount = 5 + ((rand() * 3) | 0);
    cutTargets = Array.from({ length: pinCount }, () => 0.18 + rand() * 0.72);

    grain = [];
    const gN = 42 + ((rand() * 24) | 0);
    for (let i=0;i<gN;i++){
      grain.push({
        x: rand() * w,
        y: rand() * h,
        l: (0.2 + rand() * 0.8) * Math.max(w, h),
        a: (rand() * Math.PI * 2),
        w: 0.35 + rand() * 1.1,
      });
    }

    dust = Array.from({ length: 34 }, () => ({
      x: rand() * w,
      y: rand() * h,
      vx: (rand() - 0.5) * Math.min(w,h) * 0.012,
      vy: (rand() - 0.5) * Math.min(w,h) * 0.010,
      life: rand() * 2,
      r: 0.8 + rand() * 2.2,
    }));

    clickFlash = 0;
    clickFired = false;
    glint = 0;
    nextGlintAt = 3 + rand() * 4;
    cutAcc = 0;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    key = {
      x: w * 0.12,
      y: h * 0.68,
      w: w * 0.76,
      h: h * 0.12,
    };

    lock = {
      x: w * 0.18,
      y: h * 0.24,
      w: w * 0.64,
      h: h * 0.34,
    };

    inner = {
      x: lock.x + lock.w*0.06,
      y: lock.y + lock.h*0.16,
      w: lock.w*0.88,
      h: lock.h*0.62,
    };

    plugCx = inner.x + inner.w*0.52;
    plugCy = inner.y + inner.h*0.55;
    plugW = inner.w*0.78;
    plugH = inner.h*0.46;

    invalidateCaches();

    regen();
    onPhaseEnter();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onPhaseEnter(){
    clickFired = false;
    safeBeep({ freq: 420 + rand()*170, dur: 0.018, gain: 0.010, type: 'square' });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // idempotent: stop any existing handles we own first
    onAudioOff();

    const n = audio.noiseSource({ type: 'pink', gain: 0.0033 });
    n.start();

    const d = simpleDrone(audio, { root: 55 + rand()*12, detune: 0.9, gain: 0.016 });

    ambience = {
      stop(){
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      }
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}

    // only clear AudioManager.current if we own it
    if (audio.current === ambience) audio.current = null;

    ambience = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    phaseT += dt;

    clickFlash = Math.max(0, clickFlash - dt * 1.3);
    glint = Math.max(0, glint - dt * 1.6);

    // dust drift
    for (const p of dust){
      p.life -= dt;
      if (p.life <= 0){
        p.life = 1.2 + rand()*2.4;
        p.x = rand() * w;
        p.y = rand() * h;
        p.vx = (rand() - 0.5) * Math.min(w,h) * 0.010;
        p.vy = (rand() - 0.5) * Math.min(w,h) * 0.008;
        p.r = 0.8 + rand() * 2.2;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -20) p.x = w + 20;
      if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20;
      if (p.y > h + 20) p.y = -20;
    }

    if (phaseT >= PHASE_DUR){
      phaseT = phaseT % PHASE_DUR;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      onPhaseEnter();
    }

    const ph = PHASES[phaseIdx].id;
    const p = phaseT / PHASE_DUR;

    if (t >= nextGlintAt){
      glint = 1;
      nextGlintAt = t + 4 + rand() * 6;
    }

    // micro-sfx
    if (audio.enabled){
      if (ph === 'cut'){
        const rate = lerp(6, 22, ease(p));
        cutAcc += dt * rate;
        while (cutAcc >= 1){
          cutAcc -= 1;
          safeBeep({ freq: 980 + rand()*520, dur: 0.007 + rand()*0.006, gain: 0.0012 + rand()*0.0014, type: 'triangle' });
        }
      } else {
        cutAcc = 0;
      }

      if (ph === 'pins' && !clickFired && p >= 0.56){
        clickFired = true;
        clickFlash = 1;
        safeBeep({ freq: 180, dur: 0.045, gain: 0.020, type: 'square' });
        safeBeep({ freq: 820 + rand()*160, dur: 0.012, gain: 0.010, type: 'triangle' });
      }

      if (ph === 'turn' && p >= 0.85 && rand() < 0.06){
        safeBeep({ freq: 260 + rand()*70, dur: 0.02, gain: 0.005, type: 'sine' });
      }
    }
  }

  function roundedRect(ctx, x, y, ww, hh, r){
    r = Math.min(r, ww*0.5, hh*0.5);
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+ww, y, x+ww, y+hh, r);
    ctx.arcTo(x+ww, y+hh, x, y+hh, r);
    ctx.arcTo(x, y+hh, x, y, r);
    ctx.arcTo(x, y, x+ww, y, r);
    ctx.closePath();
  }

  function drawWood(ctx){
    ctx.fillStyle = woodGrad;
    ctx.fillRect(0,0,w,h);

    // subtle grain
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(255,220,180,0.18)';
    for (const ln of grain){
      const x1 = ln.x;
      const y1 = ln.y;
      const x2 = x1 + Math.cos(ln.a) * ln.l;
      const y2 = y1 + Math.sin(ln.a) * ln.l;
      ctx.lineWidth = ln.w;
      ctx.beginPath();
      ctx.moveTo(x1,y1);
      ctx.lineTo(x2,y2);
      ctx.stroke();
    }
    ctx.restore();

    // vignette
    ctx.fillStyle = woodVignetteGrad;
    ctx.fillRect(0,0,w,h);
  }

  function drawKey(ctx, cutReveal){
    const x = key.x;
    const y = key.y;
    const ww = key.w;
    const hh = key.h;

    // body
    ctx.save();
    ctx.fillStyle = keyBodyGrad;

    const r = hh * 0.22;
    roundedRect(ctx, x, y, ww, hh, r);
    ctx.fill();

    // head
    const headW = ww * 0.18;
    roundedRect(ctx, x - headW*0.45, y - hh*0.2, headW, hh*1.4, r);
    ctx.fill();

    // keyway notch silhouette (cuts)
    const toothX0 = x + ww * 0.22;
    const toothW = ww * 0.64;
    const seg = toothW / pinCount;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (let i=0;i<pinCount;i++){
      const cx = toothX0 + i*seg;
      const depth = cutTargets[i] * cutReveal;
      const notchW = seg * 0.78;
      const nx = cx + seg*0.11;
      const ny = y + hh*0.06;
      const nd = hh * (0.08 + depth * 0.62);
      roundedRect(ctx, nx, ny, notchW, nd, hh*0.12);
      ctx.fill();
    }
    ctx.restore();

    // shine/glint sweep
    if (glint > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const gx = x + ww * (0.15 + 0.85 * (1 - glint));
      const sw = ww * 0.36;
      ctx.globalAlpha = 0.28 * glint;
      ctx.drawImage(sweepCanvas, gx - sw*0.5, y - hh*0.3, sw, hh*1.8);
      ctx.restore();
    }

    // outline
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, hh*0.06);
    roundedRect(ctx, x, y, ww, hh, r);
    ctx.stroke();

    ctx.restore();
  }

  function drawLock(ctx, turnAmt, showPins){
    const x = lock.x;
    const y = lock.y;
    const ww = lock.w;
    const hh = lock.h;

    // lock body
    ctx.fillStyle = lockBodyGrad;
    roundedRect(ctx, x, y, ww, hh, hh*0.06);
    ctx.fill();

    // inner cutaway
    // (derived layout is precomputed on init)

    ctx.save();
    ctx.translate(plugCx, plugCy);
    ctx.rotate(turnAmt * (Math.PI * 0.24));

    // plug sprite (cached; rotates with ctx)
    ctx.drawImage(plugCanvas, -plugW*0.5 - plugPad, -plugH*0.5 - plugPad);

    if (showPins){
      const seg = (plugW * 0.76) / pinCount;
      const px0 = -plugW*0.38;
      const shearY = -plugH*0.02;
      const pinW = seg * 0.42;
      const topLen = plugH * 0.34;
      const botMax = plugH * 0.34;

      for (let i=0;i<pinCount;i++){
        const cxp = px0 + i*seg;
        const cut = cutTargets[i];
        const bottomLen = lerp(botMax*0.22, botMax, cut);
        const bottomTop = shearY;
        const bottomY = bottomTop;
        const topY = bottomTop - topLen;

        // top pin
        ctx.fillStyle = pal.brass;
        roundedRect(ctx, cxp - pinW*0.5, topY, pinW, topLen, pinW*0.35);
        ctx.fill();

        // bottom pin
        ctx.fillStyle = '#f2e1a8';
        roundedRect(ctx, cxp - pinW*0.5, bottomY, pinW, bottomLen, pinW*0.35);
        ctx.fill();

        // tiny jitter highlight
        if (clickFlash > 0){
          const a = clickFlash * (0.25 + 0.25 * Math.sin(t*22 + i*1.7));
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = a;
          ctx.fillStyle = COLOR_HILITE;
          ctx.fillRect(cxp - pinW*0.55, shearY - plugH*0.03, pinW*1.1, plugH*0.06);
          ctx.restore();
        }
      }

      if (clickFlash > 0){
        // the “perfect click” sparkle sweep
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const sx = -plugW*0.5 + plugW * ease(1 - clickFlash);
        const sw = plugW * 0.36;
        ctx.globalAlpha = 0.42 * clickFlash;
        ctx.drawImage(sweepCanvas, sx - sw*0.5, shearY - plugH*0.09, sw, plugH*0.18);
        ctx.restore();
      }
    }

    // plug outline baked into plugCanvas

    ctx.restore();

    // shackle hint (turn phase)
    const sh = hh * 0.32;
    const sx = x + ww*0.86;
    const sy = y + hh*0.22;
    ctx.save();
    ctx.lineWidth = Math.max(2, sh*0.11);
    ctx.strokeStyle = `rgba(230,240,255,${0.18 + 0.35*turnAmt})`;
    ctx.beginPath();
    const rr = sh * 0.55;
    ctx.arc(sx, sy + sh*0.08 - turnAmt*sh*0.12, rr, Math.PI*0.15, Math.PI*0.85);
    ctx.stroke();
    ctx.restore();
  }

  function drawHud(ctx){
    ctx.save();
    ctx.fillStyle = pal.ink;
    ctx.font = `${Math.floor(font*1.02)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText("LOCKSMITH'S PIN‑TUMBLER BENCH", w*0.04, h*0.085);

    const ph = PHASES[phaseIdx];
    ctx.font = `${Math.floor(small)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace`;
    ctx.fillStyle = 'rgba(245,245,248,0.82)';
    ctx.fillText(`MODE: ${ph.label}`, w*0.04, h*0.115);

    // tiny status pill
    const pillW = w*0.20;
    const pillH = h*0.034;
    const px = w*0.04;
    const py = h*0.135;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, px, py, pillW, pillH, pillH*0.5);
    ctx.fill();

    const p = phaseT / PHASE_DUR;
    ctx.fillStyle = pal.accent;
    roundedRect(ctx, px, py, pillW * (0.12 + 0.88*p), pillH, pillH*0.5);
    ctx.fill();

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    ensureCaches(ctx);

    // subtle camera drift
    const dx = Math.sin(t*0.12 + seed*0.00001) * w * 0.008;
    const dy = Math.cos(t*0.10 + seed*0.00002) * h * 0.006;

    ctx.save();
    ctx.translate(dx, dy);

    drawWood(ctx);

    const ph = PHASES[phaseIdx].id;
    const p = phaseT / PHASE_DUR;

    const cutReveal = ph === 'cut' ? ease(p) : 1;
    const showPins = ph !== 'cut';
    const turnAmt = ph === 'turn' ? ease(p) : 0;

    // lock cutaway + pins
    drawLock(ctx, turnAmt, showPins);

    // key (always visible)
    drawKey(ctx, cutReveal);

    // cutter head (cut phase)
    if (ph === 'cut'){
      const toothX0 = key.x + key.w * 0.22;
      const toothW = key.w * 0.64;
      const seg = toothW / pinCount;
      const idx = Math.min(pinCount - 1, Math.floor(p * pinCount));
      const f = (p * pinCount) - idx;
      const cx = toothX0 + idx*seg + seg*0.5;
      const yy = key.y - key.h * (0.08 + 0.12*Math.sin(t*4.2));

      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(10,10,12,0.78)';
      roundedRect(ctx, cx - seg*0.55, yy - key.h*0.95, seg*1.1, key.h*0.72, key.h*0.12);
      ctx.fill();

      // sparks
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,210,120,${0.20 + 0.20*ease(f)})`;
      for (let i=0;i<6;i++){
        const sx = cx + (rand() - 0.5) * seg * 0.7;
        const sy = key.y + key.h*0.02 + rand()*key.h*0.25;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.restore();
    }

    // dust motes
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = COLOR_DUST;
    for (const p0 of dust){
      const a = 0.06 + 0.08 * Math.sin(t*0.6 + p0.x*0.01);
      ctx.globalAlpha = a;
      ctx.fillRect(p0.x, p0.y, p0.r, p0.r);
    }
    ctx.restore();

    drawHud(ctx);

    ctx.restore();

    // scanline-ish subtle overlay
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#000';
    const step = Math.max(2, Math.floor(3 * dpr));
    for (let y=0; y<h; y+=step){
      ctx.fillRect(0, y, w, 1);
    }
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
