// REVIEWED: 2026-02-10
import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // layout
  let font = 16;
  let small = 12;
  let mono = 13;

  // palette (deterministic)
  const palettes = [
    { wood: ['#2a1a12', '#20140f'], paper: ['rgba(238,232,220,0.92)', 'rgba(226,219,206,0.92)'], accent: '#e7d7b8', thread: '#d55a4a' },
    { wood: ['#261a0d', '#1a120a'], paper: ['rgba(235,236,240,0.90)', 'rgba(220,222,228,0.90)'], accent: '#cfe1ff', thread: '#4a86d5' },
    { wood: ['#2b1f14', '#181008'], paper: ['rgba(242,232,214,0.92)', 'rgba(228,216,195,0.92)'], accent: '#ffd57a', thread: '#3fbf9f' },
  ];
  const pal = pick(rand, palettes);

  const PHASES = [
    { id: 'fold', label: 'FOLD SIGNATURES' },
    { id: 'stitch', label: 'STITCH SPINE' },
    { id: 'press', label: 'PRESS + SQUARE' },
    { id: 'stamp', label: 'STAMP + FINISH' },
  ];

  const PHASE_DUR = 16;
  let phaseIdx = 0;
  let phaseT = 0;

  // objects
  let signatures = []; // {x,y,w,h,shade}
  let sigCount = 6;

  let benchDrift = { x: 0, y: 0 };

  // cached gradients (rebuild on resize / ctx swap)
  let benchWoodGrad = null;
  let benchSpotGrad = null;
  let benchGradCtx = null;
  let benchGradW = 0;
  let benchGradH = 0;

  // cached per-signature paper gradients for the stack (rebuild on regen/resize/ctx swap)
  let sigPaperGrads = [];
  let sigGradCtx = null;
  let sigGradDirty = true;

  function invalidateSigGradients(){
    sigGradDirty = true;
  }

  function ensureSigGradients(ctx){
    if (!sigGradDirty && sigGradCtx === ctx && sigPaperGrads.length === signatures.length) return;
    sigGradCtx = ctx;
    sigPaperGrads = new Array(signatures.length);
    for (let i = 0; i < signatures.length; i++){
      const s = signatures[i];
      const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
      g.addColorStop(0, pal.paper[0]);
      g.addColorStop(1, pal.paper[1]);
      sigPaperGrads[i] = g;
    }
    sigGradDirty = false;
  }

  function ensureBenchGradients(ctx){
    if (benchGradCtx === ctx && benchGradW === w && benchGradH === h && benchWoodGrad && benchSpotGrad) return;
    benchGradCtx = ctx;
    benchGradW = w;
    benchGradH = h;

    // wood gradient
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0, pal.wood[0]);
    g.addColorStop(1, pal.wood[1]);
    benchWoodGrad = g;

    // bench spotlight
    const sp = ctx.createRadialGradient(w*0.5, h*0.45, Math.min(w,h)*0.05, w*0.5, h*0.45, Math.max(w,h)*0.7);
    sp.addColorStop(0, 'rgba(0,0,0,0)');
    sp.addColorStop(1, 'rgba(0,0,0,0.55)');
    benchSpotGrad = sp;
  }

  // stitch state
  let stitchPath = []; // precomputed points on spine

  // stamp special moment
  let stampThumped = false;
  let stampFlash = 0;
  let dust = []; // {x,y,vx,vy,life}

  // audio
  let ambience = null;
  let flipAcc = 0;
  let stitchAcc = 0;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function stopAmbience({ clearCurrent = false } = {}){
    const handle = ambience;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ambience = null;
  }

  function regen(){
    t = 0;
    phaseIdx = 0;
    phaseT = 0;

    sigCount = 5 + ((rand() * 4) | 0);
    signatures = [];

    benchDrift = {
      x: (rand() - 0.5) * 0.06,
      y: (rand() - 0.5) * 0.05,
    };

    // paper stack
    const stackW = Math.min(w * 0.62, h * 0.86);
    const stackH = stackW * 0.55;
    const sx = w * 0.5 - stackW * 0.5;
    const sy = h * 0.52 - stackH * 0.35;

    for (let i = 0; i < sigCount; i++){
      const z = i / Math.max(1, sigCount - 1);
      const ox = lerp(-10, 12, z) + (rand() - 0.5) * 3;
      const oy = lerp(10, -8, z) + (rand() - 0.5) * 3;
      const sh = 0.12 + z * 0.12;
      signatures.push({
        x: sx + ox,
        y: sy + oy,
        w: stackW,
        h: stackH,
        shade: sh,
      });
    }

    invalidateSigGradients();

    // stitch path along spine of top signature
    stitchPath = [];
    const top = signatures[signatures.length - 1];
    const spineX = top.x + top.w * 0.18;
    const y0 = top.y + top.h * 0.18;
    const y1 = top.y + top.h * 0.82;
    const holes = 7 + ((rand() * 3) | 0);
    for (let i=0;i<holes;i++){
      const yy = lerp(y0, y1, i/(holes-1));
      stitchPath.push({ x: spineX, y: yy });
    }

    stampThumped = false;
    stampFlash = 0;
    dust = [];
  }

  function onPhaseEnter(){
    const ph = PHASES[phaseIdx].id;
    if (ph === 'stamp'){
      stampThumped = false;
      dust = [];
    }

    // tiny confirmation click
    safeBeep({ freq: 420 + rand()*160, dur: 0.016, gain: 0.008, type: 'square' });
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    flipAcc = 0;
    stitchAcc = 0;

    regen();
    onPhaseEnter();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // defensively stop any existing ambience we started
    stopAmbience({ clearCurrent: true });

    // quiet bench room-tone
    const n = audio.noiseSource({ type: 'brown', gain: 0.0042 });
    n.start();

    const d = simpleDrone(audio, { root: 55 + rand()*14, detune: 0.8, gain: 0.016 });

    const handle = {
      stop(){
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      }
    };

    ambience = handle;
    audio.setCurrent(handle);
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
    phaseT += dt;

    stampFlash = Math.max(0, stampFlash - dt * 1.6);

    if (phaseT >= PHASE_DUR){
      phaseT = phaseT % PHASE_DUR;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      onPhaseEnter();
    }

    const ph = PHASES[phaseIdx].id;
    const p = phaseT / PHASE_DUR;

    // audio micro-sfx
    if (audio.enabled){
      if (ph === 'fold'){
        const rate = lerp(10, 34, ease(p));
        flipAcc += dt * rate;
        while (flipAcc >= 1){
          flipAcc -= 1;
          safeBeep({ freq: 1200 + rand()*900, dur: 0.006 + rand()*0.006, gain: 0.0014 + rand()*0.0016, type: 'triangle' });
        }
      } else {
        flipAcc = 0;
      }

      if (ph === 'stitch'){
        const rate = lerp(2.2, 7.5, ease(1 - Math.abs(p - 0.5) * 2));
        stitchAcc += dt * rate;
        while (stitchAcc >= 1){
          stitchAcc -= 1;
          safeBeep({ freq: 420 + rand()*120, dur: 0.012, gain: 0.006, type: 'square' });
          if (rand() < 0.25) safeBeep({ freq: 840 + rand()*180, dur: 0.008, gain: 0.004, type: 'triangle' });
        }
      } else {
        stitchAcc = 0;
      }

      if (ph === 'stamp' && !stampThumped && p >= 0.52){
        stampThumped = true;
        safeBeep({ freq: 140, dur: 0.05, gain: 0.02, type: 'square' });
        safeBeep({ freq: 680 + rand()*120, dur: 0.014, gain: 0.010, type: 'triangle' });
      }

      if (ph === 'press' && p >= 0.82 && rand() < 0.06){
        // occasional tiny clamp creak
        safeBeep({ freq: 260 + rand()*80, dur: 0.02, gain: 0.0045, type: 'sine' });
      }
    }

    // dust particles after stamp thump
    if (ph === 'stamp' && stampThumped){
      if (dust.length === 0){
        const top = signatures[signatures.length - 1];
        const cx = top.x + top.w * 0.62;
        const cy = top.y + top.h * 0.45;
        for (let i=0;i<28;i++){
          const a = rand() * Math.PI * 2;
          const s = (0.4 + rand()*1.2) * Math.min(w, h) * 0.018;
          dust.push({
            x: cx + (rand()-0.5) * 18,
            y: cy + (rand()-0.5) * 10,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s - Math.min(w,h)*0.012,
            life: 0.8 + rand() * 1.2,
          });
        }
        stampFlash = 1;
      }

      for (const d of dust){
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += Math.min(w,h) * 0.09 * dt;
        d.life -= dt;
      }
      // in-place compaction (avoid per-frame allocations)
      let wr = 0;
      for (let i = 0; i < dust.length; i++){
        const d = dust[i];
        if (d.life > 0) dust[wr++] = d;
      }
      dust.length = wr;
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

  function drawBench(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);


    ensureBenchGradients(ctx);

    ctx.fillStyle = benchWoodGrad;
    ctx.fillRect(0,0,w,h);

    // subtle grain
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const step = Math.max(18, Math.floor(Math.min(w,h) / 22));
    const drift = (t * 9) % step;
    for (let y = -step; y < h + step; y += step){
      ctx.beginPath();
      ctx.moveTo(0, y + drift);
      const wob = Math.sin(y * 0.04 + t * 0.18) * 12;
      ctx.bezierCurveTo(w*0.3, y + drift + wob, w*0.7, y + drift - wob, w, y + drift);
      ctx.stroke();
    }
    ctx.restore();


    // bench spotlight
    ctx.fillStyle = benchSpotGrad;
    ctx.fillRect(0,0,w,h);
  }

  function header(ctx, title, subtitle, phaseLabel, phaseP){
    const pad = Math.floor(Math.min(w,h) * 0.055);

    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(pad, pad, w - pad*2, Math.max(56, font*2.6));

    ctx.fillStyle = 'rgba(231,238,246,0.94)';
    ctx.font = `800 ${font}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textBaseline = 'top';
    ctx.fillText(title, pad + font, pad + Math.floor(font*0.50));

    ctx.fillStyle = 'rgba(231,238,246,0.70)';
    ctx.font = `${small}px ui-sans-serif, system-ui, -apple-system`;
    ctx.fillText(subtitle, pad + font, pad + Math.floor(font*1.58));

    // phase pill
    const pill = `${phaseLabel}`;
    ctx.font = `700 ${Math.max(11, Math.floor(small*0.95))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tw = ctx.measureText(pill).width;
    const px = w - pad - tw - font*1.2;
    const py = pad + Math.floor(font*0.65);
    ctx.fillStyle = 'rgba(231,238,246,0.12)';
    roundedRect(ctx, px - 10, py - 6, tw + 20, Math.floor(small*1.7), 10);
    ctx.fill();
    ctx.fillStyle = pal.accent;
    ctx.fillText(pill, px, py);

    // progress bar under header
    const barY = pad + Math.max(56, font*2.6) - 10;
    const barX = pad + font;
    const barW = w - pad*2 - font*2;
    ctx.fillStyle = 'rgba(231,238,246,0.10)';
    ctx.fillRect(barX, barY, barW, 3);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(barX, barY, Math.floor(barW * clamp(phaseP, 0, 1)), 3);
  }

  function drawStack(ctx){
    const sway = Math.sin(t * 0.22 + seed*0.001) * w * benchDrift.x;
    const bob = Math.sin(t * 0.18 + seed*0.002) * h * benchDrift.y;

    // shadow
    const top = signatures[signatures.length - 1];
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundedRect(ctx, top.x + sway + 14, top.y + bob + 18, top.w, top.h, 16);
    ctx.fill();
    ctx.restore();

    ensureSigGradients(ctx);

    // pages
    for (let i=0;i<signatures.length;i++){
      const s = signatures[i];
      const a = 0.72 + s.shade;
      ctx.fillStyle = sigPaperGrads[i];
      ctx.save();
      ctx.globalAlpha = a;
      roundedRect(ctx, s.x + sway, s.y + bob, s.w, s.h, 18);
      ctx.fill();

      // page edge lines
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = 'rgba(10,12,14,0.55)';
      ctx.lineWidth = 1;
      for (let k=0;k<7;k++){
        const yy = s.y + bob + s.h * (0.14 + k*0.1) + Math.sin(t*0.6 + i*0.7 + k)*0.6;
        ctx.beginPath();
        ctx.moveTo(s.x + sway + s.w*0.10, yy);
        ctx.lineTo(s.x + sway + s.w*0.92, yy);
        ctx.stroke();
      }

      ctx.restore();
    }

    // spine strip
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'rgba(10,12,14,0.8)';
    ctx.fillRect(top.x + sway + top.w*0.15, top.y + bob + top.h*0.16, Math.max(4, top.w*0.045), top.h*0.70);
    ctx.restore();
  }

  function drawFold(ctx, p){
    const top = signatures[signatures.length - 1];
    const sway = Math.sin(t * 0.22 + seed*0.001) * w * benchDrift.x;
    const bob = Math.sin(t * 0.18 + seed*0.002) * h * benchDrift.y;

    const cx = top.x + sway + top.w*0.18;
    const cy = top.y + bob + top.h*0.50;

    const fold = ease(p);
    const ang = lerp(0.0, -Math.PI * 0.45, fold);

    // crease highlight
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${0.10 + 0.22*fold})`;
    ctx.lineWidth = Math.max(2, Math.floor(h/360));
    ctx.beginPath();
    ctx.moveTo(cx, top.y + bob + top.h*0.20);
    ctx.lineTo(cx, top.y + bob + top.h*0.80);
    ctx.stroke();
    ctx.restore();

    // fold flap (right half)
    const flapW = top.w*0.74;
    const flapH = top.h*0.78;
    const fx = cx;
    const fy = cy - flapH/2;

    ctx.save();
    ctx.translate(fx, cy);
    ctx.rotate(ang);
    ctx.translate(0, -flapH/2);

    const grad = ctx.createLinearGradient(0, 0, flapW, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.20)');
    grad.addColorStop(1, 'rgba(0,0,0,0.18)');

    ctx.fillStyle = pal.paper[0];
    roundedRect(ctx, 0, 0, flapW, flapH, 18);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = grad;
    roundedRect(ctx, 0, 0, flapW, flapH, 18);
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // little paper flutter near the end
    if (p > 0.86){
      const fp = ease((p - 0.86) / 0.14);
      ctx.save();
      ctx.globalAlpha = 0.18 + fp*0.18;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      for (let i=0;i<9;i++){
        const yy = top.y + bob + top.h*(0.20 + i*0.07);
        const xx = top.x + sway + top.w*(0.58 + 0.06*Math.sin(t*4 + i));
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx + top.w*0.12*fp, yy - top.h*0.01);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawStitch(ctx, p){
    const top = signatures[signatures.length - 1];
    const sway = Math.sin(t * 0.22 + seed*0.001) * w * benchDrift.x;
    const bob = Math.sin(t * 0.18 + seed*0.002) * h * benchDrift.y;

    // holes
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,14,0.28)';
    for (const pt of stitchPath){
      ctx.beginPath();
      ctx.arc(pt.x + sway, pt.y + bob, Math.max(2, Math.floor(h/360)), 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // thread curve
    const prog = ease(p);
    const idx = prog * (stitchPath.length - 1);
    const i0 = Math.floor(idx);
    const frac = idx - i0;
    const a = stitchPath[clamp(i0, 0, stitchPath.length-1)];
    const bpt = stitchPath[clamp(i0+1, 0, stitchPath.length-1)];
    const nx = lerp(a.x, bpt.x, frac) + sway;
    const ny = lerp(a.y, bpt.y, frac) + bob;

    const startX = top.x + sway + top.w*0.82;
    const startY = top.y + bob + top.h*0.20;

    ctx.save();
    ctx.strokeStyle = pal.thread;
    ctx.lineWidth = Math.max(2, Math.floor(h/320));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(top.x + sway + top.w*0.65, top.y + bob + top.h*(0.35 + 0.1*Math.sin(t*0.8)), nx, ny);
    ctx.stroke();

    // needle
    const ang = Math.atan2(ny - (top.y + bob + top.h*0.5), nx - (top.x + sway + top.w*0.25));
    ctx.translate(nx, ny);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(231,238,246,0.85)';
    ctx.fillRect(-10, -2, 26, 4);
    ctx.fillStyle = 'rgba(231,238,246,0.55)';
    ctx.fillRect(10, -4, 10, 8);
    ctx.restore();

    // subtle stitch marks already completed
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = pal.thread;
    ctx.lineWidth = 2;
    for (let i=0;i<=i0;i++){
      const pt = stitchPath[i];
      const x = pt.x + sway;
      const y = pt.y + bob;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6);
      ctx.lineTo(x + 6, y + 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPress(ctx, p){
    const top = signatures[signatures.length - 1];
    const sway = Math.sin(t * 0.22 + seed*0.001) * w * benchDrift.x;
    const bob = Math.sin(t * 0.18 + seed*0.002) * h * benchDrift.y;

    const cp = ease(p);
    const plateW = top.w * 0.88;
    const plateH = top.h * 0.18;
    const plateX = top.x + sway + top.w * 0.06;
    const baseY = top.y + bob + top.h * 0.10;

    const down = lerp(-h*0.06, 0, ease(clamp((p - 0.18) / 0.45, 0, 1)));
    const settle = Math.sin(t*2.2) * (1 - cp) * 2.0;
    const y = baseY + down + settle;

    // press frame
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,14,0.65)';
    roundedRect(ctx, plateX - 16, baseY - h*0.14, plateW + 32, plateH + h*0.22, 18);
    ctx.fill();

    // top plate
    const metal = ctx.createLinearGradient(plateX, 0, plateX + plateW, 0);
    metal.addColorStop(0, 'rgba(231,238,246,0.20)');
    metal.addColorStop(0.4, 'rgba(231,238,246,0.06)');
    metal.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = 'rgba(231,238,246,0.10)';
    roundedRect(ctx, plateX, y, plateW, plateH, 12);
    ctx.fill();
    ctx.fillStyle = metal;
    roundedRect(ctx, plateX, y, plateW, plateH, 12);
    ctx.fill();

    // compression shadow on paper
    const comp = clamp((p - 0.25) / 0.35, 0, 1);
    ctx.globalAlpha = 0.25 + comp*0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, top.x + sway + top.w*0.04, top.y + bob + top.h*0.06, top.w*0.92, top.h*0.92, 18);
    ctx.fill();

    // screws (gentle spin)
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(231,238,246,0.35)';
    const sx = plateX + plateW*0.10;
    const sx2 = plateX + plateW*0.90;
    const sy = baseY - h*0.08;
    const rot = t * 0.6;
    for (const xx of [sx, sx2]){
      ctx.save();
      ctx.translate(xx, sy);
      ctx.rotate(rot);
      ctx.fillRect(-2, -10, 4, 20);
      ctx.fillRect(-10, -2, 20, 4);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawStamp(ctx, p){
    const top = signatures[signatures.length - 1];
    const sway = Math.sin(t * 0.22 + seed*0.001) * w * benchDrift.x;
    const bob = Math.sin(t * 0.18 + seed*0.002) * h * benchDrift.y;

    const sp = ease(p);

    const stampX = top.x + sway + top.w * 0.68;
    const stampY0 = top.y + bob - top.h * 0.15;
    const stampY1 = top.y + bob + top.h * 0.30;

    const down = ease(clamp((p - 0.22) / 0.30, 0, 1));
    const up = ease(clamp((p - 0.62) / 0.30, 0, 1));
    const y = lerp(stampY0, stampY1, down) - lerp(0, top.h*0.18, up);

    // ink pad
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,14,0.65)';
    roundedRect(ctx, top.x + sway + top.w*0.10, top.y + bob + top.h*0.78, top.w*0.40, top.h*0.18, 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,40,40,0.35)';
    roundedRect(ctx, top.x + sway + top.w*0.13, top.y + bob + top.h*0.81, top.w*0.34, top.h*0.12, 10);
    ctx.fill();
    ctx.restore();

    // stamp body
    ctx.save();
    ctx.translate(stampX, y);

    const th = stampThumped ? 1 : 0;
    const wob = (1 - sp) * Math.sin(t*6) * 2;
    ctx.rotate((rand() - 0.5) * 0.04 * (1 - sp));

    // handle
    ctx.fillStyle = 'rgba(231,238,246,0.14)';
    roundedRect(ctx, -18, -54, 36, 44, 12);
    ctx.fill();

    // head
    const headGrad = ctx.createLinearGradient(-30, 0, 30, 0);
    headGrad.addColorStop(0, 'rgba(231,238,246,0.16)');
    headGrad.addColorStop(0.5, 'rgba(231,238,246,0.06)');
    headGrad.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = headGrad;
    roundedRect(ctx, -46, -18, 92, 30, 10);
    ctx.fill();

    // base (rubber)
    ctx.fillStyle = 'rgba(10,12,14,0.80)';
    roundedRect(ctx, -44, 8, 88, 18, 8);
    ctx.fill();

    // thump shadow
    if (th){
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(-48, 26, 96, 6);
      ctx.restore();
    }

    ctx.restore();

    // imprint
    if (stampThumped){
      const ix = top.x + sway + top.w * 0.54;
      const iy = top.y + bob + top.h * 0.42;
      const iw = top.w * 0.22;
      const ih = top.h * 0.16;

      // red ink underprint
      ctx.save();
      ctx.globalAlpha = 0.26 + 0.18 * (0.5 + 0.5*Math.sin(t*1.4));
      ctx.fillStyle = 'rgba(190,40,40,1)';
      roundedRect(ctx, ix, iy, iw, ih, 10);
      ctx.fill();

      // gold-ish foil shimmer
      const sh = 0.55 + 0.45 * (0.5 + 0.5*Math.sin(t*2.1 + seed*0.003));
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.18 + 0.20 * sh;
      ctx.fillStyle = 'rgba(255,215,120,1)';
      roundedRect(ctx, ix, iy, iw, ih, 10);
      ctx.fill();
      ctx.restore();

      // monogram
      const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      const a = alpha[(seed + 7) % alpha.length];
      const b = alpha[(seed * 3 + 11) % alpha.length];
      ctx.save();
      ctx.fillStyle = 'rgba(231,238,246,0.88)';
      ctx.font = `800 ${Math.floor(mono*1.35)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(`${a}${b}`, ix + iw*0.22, iy + ih*0.52);
      ctx.restore();

      // dust
      for (const d of dust){
        const a2 = clamp(d.life / 2, 0, 1);
        ctx.fillStyle = `rgba(255,215,120,${0.12 + a2*0.22})`;
        ctx.fillRect(d.x, d.y, 2, 2);
      }
    }

    // stamp flash overlay
    if (stampFlash > 0){
      ctx.save();
      ctx.globalAlpha = stampFlash * 0.15;
      ctx.fillStyle = 'rgba(255,240,210,1)';
      ctx.fillRect(0,0,w,h);
      ctx.restore();
    }
  }

  function render(ctx){
    drawBench(ctx);

    const ph = PHASES[phaseIdx];
    const p = phaseT / PHASE_DUR;

    header(ctx, 'Bookbinding Bench ASMR', 'fold • stitch • press • stamp', ph.label, p);

    drawStack(ctx);

    if (ph.id === 'fold') drawFold(ctx, p);
    else if (ph.id === 'stitch') drawStitch(ctx, p);
    else if (ph.id === 'press') drawPress(ctx, p);
    else drawStamp(ctx, p);

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.48, Math.min(w,h)*0.18, w*0.5, h*0.48, Math.max(w,h)*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);
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
