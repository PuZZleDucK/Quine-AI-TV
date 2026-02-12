import { mulberry32, clamp } from '../util/prng.js';

// REVIEWED: 2026-02-13

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

const REPAIRS = [
  {
    id: 'zipper',
    title: 'Zipper Alignment',
    tool: 'pliers',
    palette: { a: '#6cf2ff', b: '#ff5aa5' },
    steps: [
      { label: 'inspect', dur: 3.5, action: 'hover', sound: null },
      { label: 'align teeth', dur: 7.5, action: 'zip', sound: 'zip' },
      { label: 'crimp pull', dur: 6.5, action: 'press', sound: 'click' },
      { label: 'test glide', dur: 4.5, action: 'zip', sound: 'zip-soft' },
    ],
  },
  {
    id: 'glasses',
    title: 'Glasses Screw Tighten',
    tool: 'screwdriver',
    palette: { a: '#9ad7ff', b: '#63ffb6' },
    steps: [
      { label: 'inspect hinge', dur: 3.0, action: 'hover', sound: null },
      { label: 'tighten', dur: 9.0, action: 'screw', sound: 'screw' },
      { label: 'wipe lens', dur: 6.0, action: 'brush', sound: 'brush' },
      { label: 'fold + unfold', dur: 4.0, action: 'tap', sound: 'tap' },
    ],
  },
  {
    id: 'chair',
    title: 'Chair Leg Wobble Fix',
    tool: 'wrench',
    palette: { a: '#ffd66b', b: '#6cf2ff' },
    steps: [
      { label: 'find wobble', dur: 3.0, action: 'tap', sound: 'tap' },
      { label: 'tighten bolt', dur: 10.0, action: 'screw', sound: 'screw-low' },
      { label: 'add felt pad', dur: 6.5, action: 'press', sound: 'click-soft' },
      { label: 'test stability', dur: 4.0, action: 'tap', sound: 'tap' },
    ],
  },
  {
    id: 'cable',
    title: 'Headphone Cable Patch',
    tool: 'tape',
    palette: { a: '#ff7a59', b: '#63ffb6' },
    steps: [
      { label: 'locate break', dur: 3.0, action: 'hover', sound: null },
      { label: 'wrap tape', dur: 8.5, action: 'wrap', sound: 'wrap' },
      { label: 'press + smooth', dur: 6.0, action: 'press', sound: 'click-soft' },
      { label: 'test flex', dur: 4.0, action: 'tap', sound: 'tap' },
    ],
  },
];

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;
  let font = 16;
  let small = 12;

  let repair = null;
  let stepIndex = 0;
  let stepT = 0;

  let sfxAcc = 0;
  let ambience = null;

  function curStep(){
    return repair?.steps?.[stepIndex] || null;
  }

  function nextRepair(){
    repair = pick(rand, REPAIRS);
    stepIndex = 0;
    stepT = 0;
    sfxAcc = 0;
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    nextRepair();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type: 'pink', gain: 0.006 });
    n.start();
    ambience = { stop(){ n.stop(); } };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){
    onAudioOff();
  }

  function stepTransitionSound(){
    if (!audio.enabled) return;
    audio.beep({ freq: 520 + rand() * 140, dur: 0.03, gain: 0.014, type: 'triangle' });
  }

  function sfx(kind, intensity){
    if (!audio.enabled) return;
    const x = clamp(intensity ?? 0.5, 0, 1);

    if (kind === 'screw'){
      audio.beep({ freq: 1600 + rand() * 500, dur: 0.012, gain: 0.008 + x * 0.01, type: 'square' });
    } else if (kind === 'screw-low'){
      audio.beep({ freq: 820 + rand() * 220, dur: 0.016, gain: 0.01 + x * 0.01, type: 'triangle' });
    } else if (kind === 'zip'){
      audio.beep({ freq: 820 + rand() * 380 + x * 240, dur: 0.008, gain: 0.006 + x * 0.009, type: 'triangle' });
    } else if (kind === 'zip-soft'){
      audio.beep({ freq: 660 + rand() * 260 + x * 160, dur: 0.008, gain: 0.004 + x * 0.006, type: 'triangle' });
    } else if (kind === 'click'){
      audio.beep({ freq: 2100 + rand() * 600, dur: 0.01, gain: 0.008 + x * 0.012, type: 'square' });
    } else if (kind === 'click-soft'){
      audio.beep({ freq: 1500 + rand() * 500, dur: 0.01, gain: 0.006 + x * 0.009, type: 'square' });
    } else if (kind === 'tap'){
      audio.beep({ freq: 520 + rand() * 240, dur: 0.018, gain: 0.008 + x * 0.01, type: 'sine' });
    } else if (kind === 'brush'){
      audio.beep({ freq: 2800 + rand() * 700, dur: 0.006, gain: 0.003 + x * 0.004, type: 'triangle' });
    } else if (kind === 'wrap'){
      audio.beep({ freq: 980 + rand() * 220, dur: 0.009, gain: 0.005 + x * 0.006, type: 'triangle' });
    }
  }

  function update(dt){
    t += dt;

    if (!repair) nextRepair();

    const step = curStep();
    if (!step){
      nextRepair();
      return;
    }

    stepT += dt;
    const p = clamp(stepT / step.dur, 0, 1);

    // drive sounds
    if (audio.enabled && step.sound){
      let rate = 0;
      if (step.sound === 'screw' || step.sound === 'screw-low') rate = 12;
      else if (step.sound === 'zip') rate = 28;
      else if (step.sound === 'zip-soft') rate = 18;
      else if (step.sound === 'brush') rate = 22;
      else if (step.sound === 'wrap') rate = 20;
      else if (step.sound === 'click' || step.sound === 'click-soft') rate = 7;
      else if (step.sound === 'tap') rate = 5;

      // fade in/out the density so it feels less mechanical
      const density = Math.sin(p * Math.PI);
      sfxAcc += dt * rate * (0.25 + density * 0.95);
      while (sfxAcc >= 1){
        sfxAcc -= 1;
        sfx(step.sound, density);
      }
    } else {
      sfxAcc = 0;
    }

    if (stepT >= step.dur){
      stepIndex++;
      stepT = 0;
      sfxAcc = 0;
      stepTransitionSound();
      if (stepIndex >= repair.steps.length){
        // a short pause between repairs
        if (rand() < 0.12) stepTransitionSound();
        nextRepair();
      }
    }
  }

  function roundRect(ctx, x, y, ww, hh, r){
    const rr = Math.min(r, ww / 2, hh / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
    ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
    ctx.arcTo(x, y + hh, x, y, rr);
    ctx.arcTo(x, y, x + ww, y, rr);
    ctx.closePath();
  }

  function drawWorkbench(ctx){
    const top = Math.floor(h * 0.66);

    // soft lamp gradient
    const bg = ctx.createRadialGradient(w * 0.52, h * 0.22, 10, w * 0.52, h * 0.22, Math.max(w, h) * 0.75);
    bg.addColorStop(0, '#141b24');
    bg.addColorStop(0.55, '#0b1119');
    bg.addColorStop(1, '#05070c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // bench wood
    ctx.save();
    const wood = ctx.createLinearGradient(0, top, 0, h);
    wood.addColorStop(0, 'rgba(92, 60, 38, 0.92)');
    wood.addColorStop(1, 'rgba(28, 18, 11, 1)');
    ctx.fillStyle = wood;
    ctx.fillRect(0, top, w, h - top);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (let i = 0; i < 12; i++){
      const y = top + i * ((h - top) / 12);
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();

    // anti-vignette (center brighter)
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.68);
    vg.addColorStop(0, 'rgba(255,255,255,0.06)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawMat(ctx, x, y, ww, hh, accent){
    const r = Math.max(12, Math.floor(font * 0.95));
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x + 8, y + 10, ww, hh, r);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(16, 22, 30, 0.92)';
    roundRect(ctx, x, y, ww, hh, r);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, Math.floor(font * 0.1));
    ctx.setLineDash([Math.max(4, Math.floor(font * 0.35)), Math.max(4, Math.floor(font * 0.35))]);
    roundRect(ctx, x + 10, y + 10, ww - 20, hh - 20, r - 6);
    ctx.stroke();
    ctx.setLineDash([]);

    // grid
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 1;
    const step = Math.max(18, Math.floor(font * 1.15));
    for (let xx = x; xx <= x + ww; xx += step){
      ctx.beginPath();
      ctx.moveTo(xx, y);
      ctx.lineTo(xx, y + hh);
      ctx.stroke();
    }
    for (let yy = y; yy <= y + hh; yy += step){
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + ww, yy);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawObject(ctx, kind, cx, cy, scale, p, accentA, accentB){
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    const wob = Math.sin(t * 0.6) * 0.6;
    ctx.rotate(wob * 0.002);

    if (kind === 'zipper'){
      // two fabric strips + teeth
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(231,238,246,0.14)';
      ctx.fillRect(-70, -50, 50, 100);
      ctx.fillRect(20, -50, 50, 100);

      // teeth
      const teeth = 18;
      for (let i = 0; i < teeth; i++){
        const y = -42 + (i / (teeth - 1)) * 84;
        const open = 1 - p;
        const gap = 8 + open * 16;
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = 'rgba(231,238,246,0.55)';
        ctx.fillRect(-6 - gap * 0.5, y, 4, 6);
        ctx.fillRect(2 + gap * 0.5, y, 4, 6);
      }

      // slider (moves with p)
      const sy = -42 + p * 84;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = accentA;
      roundRect(ctx, -14, sy - 10, 28, 20, 6);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.fillRect(-10, sy - 4, 20, 8);
    }

    if (kind === 'glasses'){
      // simple glasses frames
      ctx.globalAlpha = 0.88;
      ctx.strokeStyle = 'rgba(231,238,246,0.65)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(-36, 0, 24, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(36, 0, 24, 18, 0, 0, Math.PI * 2);
      ctx.stroke();

      // bridge
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();

      // hinge screw highlight (tighten target)
      const hx = 60;
      const hy = -10;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = accentB;
      ctx.beginPath();
      ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // subtle shimmer based on progress
      ctx.globalAlpha = 0.12 + 0.18 * Math.sin(p * Math.PI);
      ctx.fillStyle = accentA;
      ctx.fillRect(-75, -30, 150, 60);
    }

    if (kind === 'chair'){
      // top seat edge
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(231,238,246,0.12)';
      roundRect(ctx, -70, -42, 140, 30, 10);
      ctx.fill();

      // legs
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(231,238,246,0.2)';
      ctx.fillRect(-52, -12, 24, 70);
      ctx.fillRect(28, -12, 24, 70);

      // wobble indicator
      const wobX = Math.sin(t * 4.0) * (2 + (1 - p) * 6);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = accentA;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-52 + wobX, 62);
      ctx.lineTo(52 - wobX, 62);
      ctx.stroke();

      // bolt point
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = accentB;
      ctx.beginPath();
      ctx.arc(40, 6, 5.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (kind === 'cable'){
      // cable line with a "break" section
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = 'rgba(231,238,246,0.55)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-70, 10);
      ctx.quadraticCurveTo(-22, -30, 0, 5);
      ctx.quadraticCurveTo(26, 35, 70, -5);
      ctx.stroke();

      // patch wrap grows with p
      const px = 0;
      const py = 6;
      const len = 30 + p * 45;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = accentA;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(px - len * 0.5, py);
      ctx.lineTo(px + len * 0.5, py);
      ctx.stroke();

      // tape stripes
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = accentB;
      ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++){
        const x = i * 8;
        ctx.beginPath();
        ctx.moveTo(x - 6, py - 8);
        ctx.lineTo(x + 6, py + 8);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawTool(ctx, tool, cx, cy, scale, action, p, accent){
    // minimalist "hand/tool" pass over the object
    ctx.save();
    ctx.translate(cx, cy);

    const reach = 120 * scale;
    let tx = 0, ty = 0, rot = 0;

    if (action === 'hover'){
      tx = Math.sin(t * 0.9) * reach * 0.08;
      ty = -reach * 0.35 + Math.sin(t * 1.1) * reach * 0.05;
      rot = -0.25;
    } else if (action === 'screw'){
      tx = reach * 0.35;
      ty = -reach * 0.15;
      rot = -0.6 + Math.sin(t * 20) * 0.04;
    } else if (action === 'zip'){
      tx = 0;
      ty = (-reach * 0.2) + (p * reach * 0.6);
      rot = -0.1;
    } else if (action === 'press'){
      tx = reach * 0.18;
      ty = reach * (0.05 + (1 - Math.sin(p * Math.PI)) * 0.08);
      rot = -0.35;
    } else if (action === 'brush'){
      tx = -reach * 0.1 + Math.sin(t * 10) * reach * 0.05;
      ty = -reach * 0.05 + Math.cos(t * 9) * reach * 0.03;
      rot = 0.25;
    } else if (action === 'tap'){
      tx = -reach * 0.2;
      ty = reach * (0.1 + Math.abs(Math.sin(t * 8)) * 0.05);
      rot = 0.2;
    } else if (action === 'wrap'){
      tx = -reach * 0.15 + Math.sin(t * 5) * reach * 0.03;
      ty = -reach * 0.1;
      rot = -0.15;
    }

    ctx.translate(tx, ty);
    ctx.rotate(rot);

    const L = 110 * scale;
    const W = 14 * scale;

    // handle
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, -L * 0.12, -W * 0.7, L * 0.38, W * 1.4, W * 0.6);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(231,238,246,0.28)';
    roundRect(ctx, -L * 0.1, -W * 0.6, L * 0.34, W * 1.2, W * 0.55);
    ctx.fill();

    // shaft
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(231,238,246,0.35)';
    roundRect(ctx, L * 0.18, -W * 0.18, L * 0.62, W * 0.36, W * 0.18);
    ctx.fill();

    // tip
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = accent;
    if (tool === 'tape'){
      roundRect(ctx, L * 0.58, -W * 0.55, L * 0.26, W * 1.1, W * 0.55);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(L * 0.84, 0);
      ctx.lineTo(L * 0.72, -W * 0.22);
      ctx.lineTo(L * 0.72, W * 0.22);
      ctx.closePath();
      ctx.fill();
    }

    // tool label (subtle)
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(231,238,246,0.8)';
    ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    const lbl = (tool || '').toUpperCase();
    if (lbl) ctx.fillText(lbl, -L * 0.1, W * 0.95);

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawWorkbench(ctx);

    const accentA = repair?.palette?.a || '#6cf2ff';
    const accentB = repair?.palette?.b || '#ff5aa5';

    // mat area
    const mw = Math.floor(w * 0.66);
    const mh = Math.floor(h * 0.56);
    const mx = Math.floor((w - mw) / 2);
    const my = Math.floor(h * 0.2);
    drawMat(ctx, mx, my, mw, mh, accentA);

    // object
    const step = curStep();
    const p = step ? clamp(stepT / step.dur, 0, 1) : 0;
    const scale = Math.max(1, Math.min(w, h) / 720);
    const cx = mx + mw * 0.5;
    const cy = my + mh * 0.52;
    drawObject(ctx, repair?.id, cx, cy, scale, p, accentA, accentB);

    // tool pass
    drawTool(ctx, repair?.tool, cx, cy, scale, step?.action || 'hover', p, accentB);

    // title strip
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, Math.floor(h * 0.06), w, Math.floor(h * 0.1));
    ctx.fillStyle = accentA;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(0, Math.floor(h * 0.16), w, 2);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('FIX-IT ASMR', Math.floor(w * 0.05), Math.floor(h * 0.105));

    ctx.font = `${Math.floor(font * 0.9)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.fillText(repair?.title || '—', Math.floor(w * 0.05), Math.floor(h * 0.145));
    ctx.restore();

    // step label + progress
    ctx.save();
    const pillW = Math.floor(w * 0.34);
    const pillH = Math.max(24, Math.floor(font * 1.45));
    const px = Math.floor(w * 0.05);
    const py = Math.floor(h * 0.78);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, px, py, pillW, pillH, pillH / 2);
    ctx.fill();

    // progress bar
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(231,238,246,0.2)';
    roundRect(ctx, px + 10, py + pillH - 7, pillW - 20, 3, 2);
    ctx.fill();
    ctx.fillStyle = accentB;
    roundRect(ctx, px + 10, py + pillH - 7, (pillW - 20) * p, 3, 2);
    ctx.fill();

    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(231,238,246,0.82)';
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    const stepTxt = step?.label ? `step: ${step.label}` : 'step: —';
    ctx.fillText(stepTxt, px + 14, py + pillH * 0.46);
    ctx.restore();

    // footer
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, Math.floor(h * 0.92), w, Math.floor(h * 0.08));
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(231,238,246,0.7)';
    ctx.font = `${Math.floor(h / 38)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('no talking • gentle clicks • slow repairs', Math.floor(w * 0.05), Math.floor(h * 0.96));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
