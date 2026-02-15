import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

// Paper Marbling Studio
// Ink drops swirl on water, comb patterns form, and a paper pull reveals the print.

const TAU = Math.PI * 2;

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

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0;
  let t = 0;

  let font = 16;
  let small = 12;

  // layout
  let tray = { x: 0, y: 0, w: 0, h: 0, r: 0 };
  let paper = { x: 0, y: 0, w: 0, h: 0, r: 0 };

  // offscreen ink surface (normalized coordinates [0..1])
  const S = 512;
  const inkCanvas = document.createElement('canvas');
  inkCanvas.width = S;
  inkCanvas.height = S;
  const inkCtx = inkCanvas.getContext('2d');

  const printCanvas = document.createElement('canvas');
  printCanvas.width = S;
  printCanvas.height = S;
  const printCtx = printCanvas.getContext('2d');

  // subtle paper/water noise tile (deterministic)
  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = 128;
  noiseCanvas.height = 128;
  const noiseCtx = noiseCanvas.getContext('2d');
  (function initNoise(){
    const img = noiseCtx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4){
      const v = (rand() * 255) | 0;
      img.data[i + 0] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    noiseCtx.putImageData(img, 0, 0);
  })();

  // pigments
  let pigments = []; // {x,y,vx,vy,r,a,c}
  const MAX_PIGMENTS = 7000;

  let vortices = []; // {x,y,rad,str,spin}
  let palette = [];

  // phase state
  const PHASES = [
    { key: 'DROP', dur: 12 },
    { key: 'SWIRL', dur: 10 },
    { key: 'COMB', dur: 10 },
    { key: 'PULL', dur: 8 },
    { key: 'DRY', dur: 6 },
  ];
  let phaseIdx = 0;
  let phaseT = 0;

  let spawnAcc = 0;
  let spawnEvery = 0.95;

  let combPhase = 0;
  let combFreq = 9;

  let perfectPull = false;
  let pulledSnapshot = false;
  let sparkle = []; // {x,y,r}
  let shineX = -1;

  // audio
  let noise = null;
  let drone = null;
  let audioHandle = null;

  function resetCycle(){
    pigments = [];

    palette = pick(rand, [
      ['#1a2c9c', '#f23fb6', '#ffd36b', '#38c6ff', '#0f1118'],
      ['#14213d', '#fca311', '#e5e5e5', '#ff206e', '#3a86ff'],
      ['#0b1320', '#5de4c7', '#f28f3b', '#b8f2e6', '#ff5a5f'],
      ['#0f1020', '#3dd6d0', '#ff5aa5', '#ffe66d', '#73d13d'],
    ]);

    const nv = 3 + ((rand() * 3) | 0);
    vortices = [];
    for (let i = 0; i < nv; i++){
      vortices.push({
        x: 0.18 + rand() * 0.64,
        y: 0.18 + rand() * 0.64,
        rad: 0.18 + rand() * 0.26,
        str: 0.55 + rand() * 0.85,
        spin: rand() < 0.5 ? -1 : 1,
      });
    }

    spawnAcc = 0;
    spawnEvery = 0.7 + rand() * 0.7;

    combPhase = rand() * TAU;
    combFreq = 7 + ((rand() * 8) | 0);

    sparkle = Array.from({ length: 14 }, () => ({
      x: 0.15 + rand() * 0.7,
      y: 0.15 + rand() * 0.7,
      r: 0.005 + rand() * 0.01,
    }));

    perfectPull = false;
    pulledSnapshot = false;
    shineX = -1;
  }

  function spawnDrop(){
    const cx = 0.18 + rand() * 0.64;
    const cy = 0.18 + rand() * 0.64;
    const baseR = 0.02 + rand() * 0.06;
    const color = pick(rand, palette);

    const n = 110 + ((rand() * 110) | 0);
    for (let i = 0; i < n; i++){
      const a = rand() * TAU;
      const rr = baseR * Math.sqrt(rand());
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      pigments.push({
        x: clamp(x, 0, 1),
        y: clamp(y, 0, 1),
        vx: (rand() * 2 - 1) * 0.02,
        vy: (rand() * 2 - 1) * 0.02,
        r: (0.0025 + rand() * 0.0045) * (0.7 + rand() * 0.9),
        a: 0.10 + rand() * 0.18,
        c: color,
      });
    }

    if (pigments.length > MAX_PIGMENTS) pigments.splice(0, pigments.length - MAX_PIGMENTS);

    if (!audio.enabled) return;
    audio.beep({ freq: 220 + rand() * 120, dur: 0.05, gain: 0.012, type: 'sine' });
  }

  function onPhaseEnter(){
    const key = PHASES[phaseIdx].key;

    if (key === 'DROP') resetCycle();

    if (key === 'COMB'){
      combPhase = rand() * TAU;
    }

    if (key === 'PULL'){
      perfectPull = rand() < 0.22;
      pulledSnapshot = false;
      shineX = -0.2;

      // take snapshot immediately (so the print is from a stable moment)
      renderInk();
      printCtx.clearRect(0, 0, S, S);
      printCtx.drawImage(inkCanvas, 0, 0);
      pulledSnapshot = true;

      if (audio.enabled){
        audio.beep({ freq: perfectPull ? 880 : 520, dur: 0.08, gain: 0.02, type: 'triangle' });
        if (perfectPull) audio.beep({ freq: 1320, dur: 0.06, gain: 0.015, type: 'sine' });
      }
    }

    if (audio.enabled && key !== 'PULL'){
      const f = { DROP: 320, SWIRL: 420, COMB: 560, DRY: 480 }[key] || 440;
      audio.beep({ freq: f, dur: 0.06, gain: 0.012, type: 'square' });
    }
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    const pad = Math.max(12, Math.floor(Math.min(w, h) * 0.06));
    tray.w = Math.floor(Math.min(w - pad * 2, h * 1.25));
    tray.h = Math.floor(Math.min(h - pad * 2, tray.w * 0.72));
    tray.x = Math.floor((w - tray.w) * 0.5);
    tray.y = Math.floor((h - tray.h) * 0.52);
    tray.r = Math.floor(Math.min(tray.w, tray.h) * 0.06);

    paper.w = Math.floor(tray.w * 0.62);
    paper.h = Math.floor(paper.w * 0.70);
    paper.x = Math.floor(tray.x + tray.w * 0.18);
    paper.y = Math.floor(tray.y - paper.h * 0.35);
    paper.r = Math.floor(Math.min(paper.w, paper.h) * 0.04);

    phaseIdx = 0;
    phaseT = 0;
    resetCycle();
    onPhaseEnter();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    noise = audio.noiseSource({ type: 'pink', gain: 0.012 });
    noise.start();
    drone = simpleDrone(audio, { root: 55, detune: 1.1, gain: 0.035 });
    audioHandle = {
      stop(){
        try { noise?.stop?.(); } catch {}
        try { drone?.stop?.(); } catch {}
      },
    };
    audio.setCurrent(audioHandle);
  }

  function onAudioOff(){
    try { audioHandle?.stop?.(); } catch {}
    noise = null;
    drone = null;
    audioHandle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function stepPigments(dt, swirlAmt, combAmt){
    const damp = Math.exp(-dt * 2.8);

    for (let i = 0; i < pigments.length; i++){
      const p = pigments[i];
      let vx = p.vx;
      let vy = p.vy;

      // vortex field
      for (let j = 0; j < vortices.length; j++){
        const v = vortices[j];
        const dx = p.x - v.x;
        const dy = p.y - v.y;
        const d2 = dx * dx + dy * dy;
        const rr = v.rad * v.rad;
        if (d2 > rr) continue;
        const d = Math.sqrt(d2 + 1e-6);
        const fall = (1 - d / v.rad);
        const s = swirlAmt * v.str * fall * fall;
        const inv = 1 / d;
        const tx = (-dy) * inv;
        const ty = (dx) * inv;
        vx += tx * s * v.spin * 0.20;
        vy += ty * s * v.spin * 0.20;
      }

      // gentle drift (sin-based, deterministic)
      vx += Math.sin((p.y * 9 + t * 0.35) * TAU) * 0.004;
      vy += Math.cos((p.x * 8 + t * 0.28) * TAU) * 0.004;

      // comb shear: a travelling influence that imprints striations
      if (combAmt > 0){
        const combX = lerp(-0.1, 1.1, ease(phaseT / PHASES[phaseIdx].dur));
        const dx = p.x - combX;
        const infl = Math.exp(-(dx * dx) / 0.010);
        const wave = Math.sin((p.y * combFreq + t * 0.9) * TAU + combPhase);
        vx += infl * combAmt * wave * 0.030;
        vy += infl * combAmt * Math.cos((p.x * (combFreq * 0.7) + t * 0.6) * TAU + combPhase) * 0.010;
      }

      // integrate
      p.x = p.x + vx * dt;
      p.y = p.y + vy * dt;

      // damp + soft bounds
      p.vx = vx * damp;
      p.vy = vy * damp;

      if (p.x < 0){ p.x = 0; p.vx *= -0.45; }
      if (p.x > 1){ p.x = 1; p.vx *= -0.45; }
      if (p.y < 0){ p.y = 0; p.vy *= -0.45; }
      if (p.y > 1){ p.y = 1; p.vy *= -0.45; }
    }
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    const cur = PHASES[phaseIdx];
    if (phaseT >= cur.dur){
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      phaseT = 0;
      onPhaseEnter();
    }

    const key = PHASES[phaseIdx].key;

    if (key === 'DROP'){
      spawnAcc += dt;
      while (spawnAcc >= spawnEvery){
        spawnAcc -= spawnEvery;
        spawnEvery = 0.75 + rand() * 0.9;
        spawnDrop();
      }
      stepPigments(dt, 0.55, 0);
    } else if (key === 'SWIRL'){
      stepPigments(dt, 1.25, 0);
    } else if (key === 'COMB'){
      stepPigments(dt, 0.90, 1.0);
    } else if (key === 'PULL'){
      // ink still moves very slightly under the paper
      stepPigments(dt, 0.25, 0.15);
      shineX = shineX + dt * 0.45;
    } else {
      // DRY
      stepPigments(dt, 0.12, 0);
      shineX = shineX + dt * 0.35;
    }
  }

  function renderInk(){
    // water base
    const g = inkCtx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#0e1421');
    g.addColorStop(0.35, '#0b1e2a');
    g.addColorStop(1, '#071018');
    inkCtx.fillStyle = g;
    inkCtx.fillRect(0, 0, S, S);

    inkCtx.save();
    inkCtx.globalAlpha = 0.10;
    inkCtx.globalCompositeOperation = 'overlay';
    inkCtx.drawImage(noiseCanvas, 0, 0, S, S);
    inkCtx.restore();

    // pigments
    inkCtx.save();
    inkCtx.globalCompositeOperation = 'screen';
    for (let i = 0; i < pigments.length; i++){
      const p = pigments[i];
      const x = p.x * S;
      const y = p.y * S;
      inkCtx.globalAlpha = p.a;
      inkCtx.fillStyle = p.c;
      inkCtx.beginPath();
      inkCtx.arc(x, y, p.r * S, 0, TAU);
      inkCtx.fill();
    }
    inkCtx.restore();

    // thin ripples
    inkCtx.save();
    inkCtx.globalAlpha = 0.12;
    inkCtx.strokeStyle = 'rgba(220, 245, 255, 0.15)';
    inkCtx.lineWidth = 1;
    const lines = 7;
    for (let i = 0; i < lines; i++){
      const yy = (0.14 + i / (lines + 1) * 0.72) * S;
      inkCtx.beginPath();
      const amp = 4 + Math.sin(t * 0.9 + i) * 1.2;
      for (let x = 0; x <= S; x += 18){
        const nx = x / S;
        const y = yy + Math.sin(nx * TAU * 2 + t * 0.45 + i) * amp;
        if (x === 0) inkCtx.moveTo(x, y);
        else inkCtx.lineTo(x, y);
      }
      inkCtx.stroke();
    }
    inkCtx.restore();
  }

  function drawTray(ctx){
    // table
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#1a1410');
    bg.addColorStop(0.55, '#120f0d');
    bg.addColorStop(1, '#0a0a0c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // tray shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, tray.x + 10, tray.y + 14, tray.w, tray.h, tray.r);
    ctx.fill();
    ctx.restore();

    // tray body
    const tg = ctx.createLinearGradient(tray.x, tray.y, tray.x + tray.w, tray.y + tray.h);
    tg.addColorStop(0, '#0b0c10');
    tg.addColorStop(0.45, '#151821');
    tg.addColorStop(1, '#06070a');
    ctx.fillStyle = tg;
    roundRect(ctx, tray.x, tray.y, tray.w, tray.h, tray.r);
    ctx.fill();

    // inner clip
    const inset = Math.max(10, Math.floor(Math.min(tray.w, tray.h) * 0.045));
    ctx.save();
    roundRect(ctx, tray.x + inset, tray.y + inset, tray.w - inset * 2, tray.h - inset * 2, tray.r * 0.65);
    ctx.clip();

    renderInk();
    ctx.drawImage(inkCanvas, tray.x + inset, tray.y + inset, tray.w - inset * 2, tray.h - inset * 2);

    // glassy highlight
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.12;
    const hg = ctx.createLinearGradient(tray.x, tray.y, tray.x + tray.w, tray.y + tray.h);
    hg.addColorStop(0, 'rgba(255,255,255,0.35)');
    hg.addColorStop(0.35, 'rgba(255,255,255,0.10)');
    hg.addColorStop(1, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = hg;
    ctx.fillRect(tray.x, tray.y, tray.w, tray.h);
    ctx.restore();

    ctx.restore(); // clip

    // tray rim
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, Math.floor(inset * 0.35));
    roundRect(ctx, tray.x + 1, tray.y + 1, tray.w - 2, tray.h - 2, tray.r);
    ctx.stroke();
    ctx.restore();

    return inset;
  }

  function drawPaper(ctx, inset){
    const key = PHASES[phaseIdx].key;
    if (key !== 'PULL' && key !== 'DRY') return;

    const f = phaseT / PHASES[phaseIdx].dur;

    // paper movement: down then up
    let depth = 0;
    if (key === 'PULL'){
      depth = f < 0.45 ? ease(f / 0.45) : 1 - ease((f - 0.45) / 0.55);
    } else {
      depth = 0.12 + 0.04 * Math.sin(t * 0.4);
    }

    const px = paper.x + Math.sin(t * 0.35) * 2;
    const py = paper.y + depth * (tray.h * 0.32);
    const tilt = (key === 'PULL') ? (Math.sin(f * TAU) * 0.02) : 0.01;

    ctx.save();
    ctx.translate(px + paper.w * 0.5, py + paper.h * 0.5);
    ctx.rotate(tilt);
    ctx.translate(-paper.w * 0.5, -paper.h * 0.5);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, 10, 14, paper.w, paper.h, paper.r);
    ctx.fill();
    ctx.restore();

    // sheet
    const pg = ctx.createLinearGradient(0, 0, 0, paper.h);
    pg.addColorStop(0, '#f6f0e7');
    pg.addColorStop(0.65, '#efe7dc');
    pg.addColorStop(1, '#e4dacb');
    ctx.fillStyle = pg;
    roundRect(ctx, 0, 0, paper.w, paper.h, paper.r);
    ctx.fill();

    // paper grain
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(noiseCanvas, 0, 0, paper.w, paper.h);
    ctx.restore();

    // print reveal
    let reveal = 0;
    if (key === 'PULL') reveal = ease((f - 0.38) / 0.62);
    else reveal = 0.95;

    if (pulledSnapshot){
      ctx.save();
      ctx.globalAlpha = 0.92 * reveal;
      ctx.globalCompositeOperation = 'multiply';
      roundRect(ctx, 0, 0, paper.w, paper.h, paper.r);
      ctx.clip();
      ctx.drawImage(printCanvas, 0, 0, paper.w, paper.h);
      ctx.restore();
    }

    // perfect pull moment: sheen sweep + sparkles
    if (perfectPull && reveal > 0.65){
      const sh = ease((reveal - 0.65) / 0.35);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.22 * sh;
      const sx = (shineX % 1.4) * paper.w;
      const sg = ctx.createLinearGradient(sx - paper.w * 0.45, 0, sx + paper.w * 0.45, paper.h);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.45, 'rgba(255,255,255,0.10)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.38)');
      sg.addColorStop(0.55, 'rgba(255,255,255,0.10)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, paper.w, paper.h);

      ctx.globalAlpha = 0.28 * sh;
      ctx.fillStyle = 'rgba(255, 244, 210, 0.9)';
      for (let i = 0; i < sparkle.length; i++){
        const s = sparkle[i];
        const x = s.x * paper.w;
        const y = s.y * paper.h;
        const r = s.r * paper.w;
        ctx.beginPath();
        ctx.moveTo(x - r, y);
        ctx.lineTo(x + r, y);
        ctx.moveTo(x, y - r);
        ctx.lineTo(x, y + r);
        ctx.strokeStyle = 'rgba(255, 244, 210, 0.7)';
        ctx.lineWidth = Math.max(1, Math.floor(r * 0.4));
        ctx.stroke();
      }

      ctx.restore();
    }

    // border
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = 'rgba(40, 30, 22, 0.55)';
    ctx.lineWidth = Math.max(1, Math.floor(paper.w * 0.01));
    roundRect(ctx, 1, 1, paper.w - 2, paper.h - 2, paper.r);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // small caption tag
    ctx.save();
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255, 245, 235, 0.78)';
    ctx.textAlign = 'left';
    const tx = px + paper.w * 0.02;
    const ty = py + paper.h + Math.max(8, small * 0.4);
    ctx.fillText(perfectPull ? 'PERFECT PULL' : 'PAPER PULL', tx, ty);
    ctx.restore();
  }

  function draw(ctx){
    const inset = drawTray(ctx);
    drawPaper(ctx, inset);

    // HUD
    const cur = PHASES[phaseIdx];
    const rem = Math.max(0, cur.dur - phaseT);

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(240, 250, 255, 0.78)';
    ctx.textAlign = 'right';
    const x = w - Math.max(10, w * 0.04);
    const y = Math.max(10, h * 0.04);
    ctx.fillText('MARBLING', x, y);

    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(240, 250, 255, 0.90)';
    ctx.fillText(cur.key, x, y + small * 1.35);

    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(240, 250, 255, 0.72)';
    ctx.fillText(fmtMMSS(rem), x, y + small * 1.35 + font * 1.05);

    ctx.globalAlpha = 0.55;
    ctx.fillText(`seed ${seed >>> 0}`, x, y + small * 1.35 + font * 1.05 + small * 1.15);
    ctx.restore();
  }

  // initial size gets set by host calling onResize
  return {
    onResize,
    onAudioOn,
    onAudioOff,
    update,
    draw,
    destroy,
  };
}
