// REVIEWED: 2026-02-15
import { mulberry32, clamp } from '../util/prng.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){
  // smoothstep-ish
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fmt(sec){
  const s = Math.max(0, Math.ceil(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  const audioRand = mulberry32(((seed | 0) ^ 0x5bd1e995) >>> 0);

  const RESET = {
    title: 'TIDY DESK RESET',
    subtitle: '10-minute loop • checklist overlay • gentle ASMR (optional)',
    palette: { a: '#6cf2ff', b: '#ffd36b', c: '#ff5aa5' },
    steps: [
      { label: 'clear cups', dur: 100, mode: 'move' },
      { label: 'stack papers', dur: 90, mode: 'move' },
      { label: 'file sticky notes', dur: 90, mode: 'move' },
      { label: 'coil cables', dur: 90, mode: 'move' },
      { label: 'wipe surface', dur: 110, mode: 'wipe' },
      { label: 'align essentials', dur: 120, mode: 'align' },
    ],
  };

  const TOTAL = RESET.steps.reduce((a, s) => a + s.dur, 0);

  let w = 0, h = 0, t = 0;
  let font = 16;
  let small = 12;

  let stepIndex = 0;
  let stepT = 0;

  // scene items
  let items = []; // {kind, step, messy:{x,y,a}, tidy:{x,y,a}, size, color}
  let papers = []; // extra loose paper sheets

  // audio handles
  let ambience = null;
  let wipeAcc = 0;
  let didStepChime = false;

  // perf: cache background gradients (rebuild on resize / ctx swap)
  let bgGrad = null;
  let woodGrad = null;
  let vignetteGrad = null;
  let gradCacheW = 0;
  let gradCacheH = 0;
  let gradCacheCtx = null;

  function ensureDeskGradients(ctx, d){
    if (!bgGrad || !woodGrad || !vignetteGrad || gradCacheW !== w || gradCacheH !== h || gradCacheCtx !== ctx){
      gradCacheW = w;
      gradCacheH = h;
      gradCacheCtx = ctx;

      bgGrad = ctx.createRadialGradient(w * 0.52, h * 0.18, 10, w * 0.52, h * 0.18, Math.max(w, h) * 0.9);
      bgGrad.addColorStop(0, '#1c2632');
      bgGrad.addColorStop(0.55, '#0b1119');
      bgGrad.addColorStop(1, '#05070c');

      woodGrad = ctx.createLinearGradient(d.x, d.y, d.x + d.w, d.y + d.h);
      woodGrad.addColorStop(0, 'rgba(92, 60, 38, 0.94)');
      woodGrad.addColorStop(1, 'rgba(32, 20, 12, 1)');

      vignetteGrad = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.75);
      vignetteGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
      vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.62)');
    }
  }

  function curStep(){ return RESET.steps[stepIndex] || null; }

  function deskRect(){
    const dx = Math.floor(w * 0.08);
    const dy = Math.floor(h * 0.14);
    const dw = Math.floor(w * 0.84);
    const dh = Math.floor(h * 0.74);
    return { x: dx, y: dy, w: dw, h: dh };
  }

  function resetScene(){
    const d = deskRect();

    items = [];
    papers = [];

    // common tidy targets
    const trayX = d.x + d.w * 0.86;
    const trayY = d.y + d.h * 0.18;
    const stackX = d.x + d.w * 0.22;
    const stackY = d.y + d.h * 0.48;
    const noteX = d.x + d.w * 0.16;
    const noteY = d.y + d.h * 0.18;
    const cableX = d.x + d.w * 0.22;
    const cableY = d.y + d.h * 0.72;
    const penX = d.x + d.w * 0.72;
    const penY = d.y + d.h * 0.72;

    // cups (step 0)
    items.push({
      kind: 'mug',
      step: 0,
      size: 1,
      color: 'rgba(231,238,246,0.75)',
      messy: {
        x: d.x + d.w * (0.62 + rand() * 0.18),
        y: d.y + d.h * (0.56 + rand() * 0.22),
        a: -0.2 + rand() * 0.4,
      },
      tidy: {
        x: trayX,
        y: trayY,
        a: 0,
      }
    });
    items.push({
      kind: 'cup',
      step: 0,
      size: 0.9,
      color: 'rgba(231,238,246,0.62)',
      messy: {
        x: d.x + d.w * (0.44 + rand() * 0.22),
        y: d.y + d.h * (0.62 + rand() * 0.18),
        a: -0.2 + rand() * 0.4,
      },
      tidy: {
        x: trayX,
        y: trayY + d.h * 0.1,
        a: 0,
      }
    });

    // papers (step 1)
    const baseSheets = 6 + ((rand() * 5) | 0);
    for (let i = 0; i < baseSheets; i++){
      papers.push({
        step: 1,
        messy: {
          x: d.x + d.w * (0.18 + rand() * 0.55),
          y: d.y + d.h * (0.28 + rand() * 0.42),
          a: (-0.6 + rand() * 1.2) * 0.25,
        },
        tidy: {
          x: stackX + (rand() * 2 - 1) * 6,
          y: stackY + (rand() * 2 - 1) * 4,
          a: (-0.4 + rand() * 0.8) * 0.04,
        },
        w: 110 + rand() * 120,
        h: 70 + rand() * 90,
        c: `rgba(231,238,246,${0.10 + rand() * 0.12})`,
      });
    }

    // sticky notes (step 2)
    const notes = 3 + ((rand() * 3) | 0);
    for (let i = 0; i < notes; i++){
      items.push({
        kind: 'note',
        step: 2,
        size: 1,
        color: `rgba(255, 215, 120, ${0.65 + rand() * 0.25})`,
        messy: {
          x: d.x + d.w * (0.28 + rand() * 0.55),
          y: d.y + d.h * (0.22 + rand() * 0.5),
          a: (-0.6 + rand() * 1.2) * 0.25,
        },
        tidy: {
          x: noteX + (i % 2) * 58,
          y: noteY + Math.floor(i / 2) * 54,
          a: (-0.2 + rand() * 0.4) * 0.05,
        },
      });
    }

    // cable (step 3)
    items.push({
      kind: 'cable',
      step: 3,
      size: 1,
      color: 'rgba(108,242,255,0.65)',
      messy: {
        x: d.x + d.w * (0.16 + rand() * 0.62),
        y: d.y + d.h * (0.46 + rand() * 0.36),
        a: -0.1 + rand() * 0.2,
      },
      tidy: {
        x: cableX,
        y: cableY,
        a: 0,
      },
    });

    // pen (step 5 - align essentials)
    items.push({
      kind: 'pen',
      step: 5,
      size: 1,
      color: 'rgba(255, 90, 165, 0.85)',
      messy: {
        x: d.x + d.w * (0.25 + rand() * 0.6),
        y: d.y + d.h * (0.66 + rand() * 0.22),
        a: -1.2 + rand() * 2.4,
      },
      tidy: {
        x: penX,
        y: penY,
        a: -0.35,
      }
    });

    didStepChime = false;
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    stepIndex = 0;
    stepT = 0;
    wipeAcc = 0;

    resetScene();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // idempotent: stop any existing handles we own first
    onAudioOff();

    const n = audio.noiseSource({ type: 'pink', gain: 0.0016 });
    n.start();

    ambience = {
      stop(){
        try { n.stop(); } catch {}
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

  function destroy(){
    onAudioOff();
  }

  function chime(kind='check'){
    if (!audio.enabled) return;
    if (kind === 'wipe') audio.beep({ freq: 2200 + audioRand() * 300, dur: 0.01, gain: 0.004, type: 'triangle' });
    else audio.beep({ freq: 720 + audioRand() * 120, dur: 0.028, gain: 0.018, type: 'triangle' });
  }

  function update(dt){
    t += dt;

    const step = curStep();
    if (!step){
      // should never happen
      stepIndex = 0;
      stepT = 0;
      resetScene();
      return;
    }

    stepT += dt;

    // gentle wipe texture sound
    if (audio.enabled && step.mode === 'wipe'){
      wipeAcc += dt * 1.6;
      while (wipeAcc >= 1){
        wipeAcc -= 1;
        chime('wipe');
      }
    } else {
      wipeAcc = 0;
    }

    // chime once mid-step so it feels like a "check" is being earned
    if (!didStepChime){
      const p = stepT / step.dur;
      if (p >= 0.65){
        didStepChime = true;
        chime('check');
      }
    }

    if (stepT >= step.dur){
      stepT = 0;
      stepIndex++;
      didStepChime = false;

      // step completion sound
      chime('check');

      if (stepIndex >= RESET.steps.length){
        // hard loop: a fresh messy desk, then reset again
        stepIndex = 0;
        resetScene();
      }
    }
  }

  function itemProgress(item){
    if (stepIndex > item.step) return 1;
    if (stepIndex < item.step) return 0;
    const step = curStep();
    const p = step ? (stepT / step.dur) : 0;
    return ease(p);
  }

  function drawDesk(ctx){
    const d = deskRect();

    ensureDeskGradients(ctx, d);

    // background
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // desk surface
    ctx.save();
    ctx.fillStyle = woodGrad;
    roundRect(ctx, d.x, d.y, d.w, d.h, Math.max(18, Math.floor(font * 1.2)));
    ctx.fill();

    // subtle grain lines
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 22; i++){
      const yy = d.y + (i / 22) * d.h;
      ctx.beginPath();
      ctx.moveTo(d.x + 8, yy);
      ctx.lineTo(d.x + d.w - 8, yy + Math.sin(i * 0.9) * 2);
      ctx.stroke();
    }
    ctx.restore();

    // vignette
    ctx.save();
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawPaper(ctx, sheet, p){
    const x = lerp(sheet.messy.x, sheet.tidy.x, p);
    const y = lerp(sheet.messy.y, sheet.tidy.y, p);
    const a = lerp(sheet.messy.a, sheet.tidy.a, p);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);

    const ww = sheet.w;
    const hh = sheet.h;

    // shadow
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -ww * 0.5 + 6, -hh * 0.5 + 7, ww, hh, 10);
    ctx.fill();

    // page
    ctx.globalAlpha = 1;
    ctx.fillStyle = sheet.c;
    roundRect(ctx, -ww * 0.5, -hh * 0.5, ww, hh, 10);
    ctx.fill();

    // lines
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(231,238,246,1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++){
      const yy = -hh * 0.35 + i * (hh * 0.09);
      ctx.beginPath();
      ctx.moveTo(-ww * 0.4, yy);
      ctx.lineTo(ww * 0.35, yy);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawItem(ctx, it){
    const p = itemProgress(it);
    const x = lerp(it.messy.x, it.tidy.x, p);
    const y = lerp(it.messy.y, it.tidy.y, p);
    const a = lerp(it.messy.a, it.tidy.a, p);
    const d = deskRect();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);

    const scale = Math.max(1, Math.min(w, h) / 720);
    ctx.scale(scale * it.size, scale * it.size);

    if (it.kind === 'mug' || it.kind === 'cup'){
      const r = it.kind === 'mug' ? 22 : 18;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(6, 8, r * 1.05, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.85;
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      ctx.ellipse(0, 1, r * 0.65, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      if (it.kind === 'mug'){
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = it.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(r * 0.75, 0, r * 0.45, -Math.PI * 0.35, Math.PI * 0.35);
        ctx.stroke();
      }
    }

    if (it.kind === 'note'){
      const ww = 58;
      const hh = 50;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      roundRect(ctx, -ww / 2 + 4, -hh / 2 + 6, ww, hh, 10);
      ctx.fill();

      ctx.globalAlpha = 0.92;
      ctx.fillStyle = it.color;
      roundRect(ctx, -ww / 2, -hh / 2, ww, hh, 10);
      ctx.fill();

      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-ww * 0.34, -hh * 0.1);
      ctx.lineTo(ww * 0.26, -hh * 0.1);
      ctx.moveTo(-ww * 0.34, hh * 0.1);
      ctx.lineTo(ww * 0.18, hh * 0.1);
      ctx.stroke();

      // tiny pin dot
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = 'rgba(255,90,165,1)';
      ctx.beginPath();
      ctx.arc(0, -hh * 0.35, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (it.kind === 'cable'){
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = it.color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';

      // messy: squiggle, tidy: coil
      const coil = p;
      const R0 = 58;
      const R1 = 26;
      const turns = 4.5;
      ctx.beginPath();
      for (let i = 0; i <= 80; i++){
        const u = i / 80;
        const a0 = u * Math.PI * 2;
        const sqx = (u - 0.5) * 160 + Math.sin(t * 0.6 + u * 12) * 16;
        const sqy = Math.sin(t * 0.7 + u * 9) * 14;

        const ang = u * Math.PI * 2 * turns;
        const rr = lerp(R0, R1, u);
        const cx = Math.cos(ang) * rr;
        const cy = Math.sin(ang) * rr;

        const xx = lerp(sqx, cx, coil);
        const yy = lerp(sqy, cy, coil);
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();

      // plug tip highlight
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(231,238,246,0.7)';
      ctx.fillRect(52, -2, 16, 6);
    }

    if (it.kind === 'pen'){
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      roundRect(ctx, -40 + 5, -6 + 7, 90, 12, 6);
      ctx.fill();

      ctx.globalAlpha = 0.92;
      ctx.fillStyle = it.color;
      roundRect(ctx, -40, -6, 90, 12, 6);
      ctx.fill();

      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(231,238,246,0.7)';
      roundRect(ctx, 34, -4, 12, 8, 4);
      ctx.fill();

      // nib
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(231,238,246,0.8)';
      ctx.beginPath();
      ctx.moveTo(-44, 0);
      ctx.lineTo(-56, -4);
      ctx.lineTo(-56, 4);
      ctx.closePath();
      ctx.fill();
    }

    // wipe highlight (a soft cloth pass)
    const step = curStep();
    if (step && step.mode === 'wipe'){
      const sp = ease(stepT / step.dur);
      ctx.globalAlpha = 0.06 + 0.08 * Math.sin(sp * Math.PI);
      ctx.fillStyle = 'rgba(231,238,246,1)';
      ctx.fillRect(-d.w * 0.12, -18, d.w * 0.24, 36);
    }

    ctx.restore();
  }

  function drawChecklist(ctx){
    const pad = Math.floor(w * 0.04);
    const boxW = Math.floor(w * 0.32);
    const boxH = Math.floor(h * 0.52);
    const x = pad;
    const y = Math.floor(h * 0.22);

    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, x + 8, y + 10, boxW, boxH, 18);
    ctx.fill();

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(16, 22, 30, 0.92)';
    roundRect(ctx, x, y, boxW, boxH, 18);
    ctx.fill();

    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = RESET.palette.a;
    ctx.lineWidth = Math.max(1, Math.floor(font * 0.1));
    roundRect(ctx, x, y, boxW, boxH, 18);
    ctx.stroke();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.font = `${Math.floor(font * 1.0)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('CHECKLIST', x + 18, y + 14);

    // timer (remaining)
    const elapsed = RESET.steps.slice(0, stepIndex).reduce((a, s) => a + s.dur, 0) + stepT;
    const rem = TOTAL - (elapsed % TOTAL);
    ctx.globalAlpha = 0.8;
    ctx.font = `${Math.floor(small * 1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`RESET: ${fmt(rem)}`, x + 18, y + 14 + font * 1.2);

    // list
    const lineH = Math.max(22, Math.floor(font * 1.35));
    let yy = y + Math.floor(font * 2.6);

    for (let i = 0; i < RESET.steps.length; i++){
      const s = RESET.steps[i];
      const done = i < stepIndex;
      const active = i === stepIndex;

      const cb = 14 + Math.floor(font * 0.25);
      const cx = x + 18;
      const cy = yy + 4;

      // checkbox
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = done ? RESET.palette.b : 'rgba(231,238,246,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx, cy, cb, cb);

      if (done){
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = RESET.palette.b;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + cb * 0.18, cy + cb * 0.55);
        ctx.lineTo(cx + cb * 0.42, cy + cb * 0.8);
        ctx.lineTo(cx + cb * 0.86, cy + cb * 0.2);
        ctx.stroke();
      }

      // active highlight
      if (active){
        const p = ease(stepT / s.dur);
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = RESET.palette.a;
        roundRect(ctx, x + 12, yy - 2, boxW - 24, lineH, 12);
        ctx.fill();

        // progress bar
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = 'rgba(231,238,246,0.25)';
        roundRect(ctx, x + 16, yy + lineH - 9, boxW - 32, 4, 2);
        ctx.fill();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = RESET.palette.c;
        roundRect(ctx, x + 16, yy + lineH - 9, (boxW - 32) * p, 4, 2);
        ctx.fill();
      }

      ctx.globalAlpha = done ? 0.62 : (active ? 0.95 : 0.78);
      ctx.fillStyle = 'rgba(231,238,246,0.9)';
      ctx.font = `${small}px ui-sans-serif, system-ui`;
      ctx.fillText(s.label, cx + cb + 12, yy + 3);

      yy += lineH;
    }

    ctx.restore();
  }

  function drawHeader(ctx){
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, Math.floor(h * 0.06), w, Math.floor(h * 0.1));
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = RESET.palette.a;
    ctx.fillRect(0, Math.floor(h * 0.16), w, 2);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText(RESET.title, Math.floor(w * 0.05), Math.floor(h * 0.105));

    ctx.globalAlpha = 0.75;
    ctx.font = `${Math.floor(font * 0.82)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.fillText(RESET.subtitle, Math.floor(w * 0.05), Math.floor(h * 0.145));
    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawDesk(ctx);

    // papers first (they sit under most objects)
    for (const s of papers){
      const p = (stepIndex > s.step) ? 1 : (stepIndex < s.step ? 0 : ease(stepT / (curStep()?.dur || 1)));
      drawPaper(ctx, s, p);
    }

    // other items
    for (const it of items) drawItem(ctx, it);

    drawHeader(ctx);
    drawChecklist(ctx);

    // footer
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, Math.floor(h * 0.92), w, Math.floor(h * 0.08));
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(231,238,246,0.7)';
    ctx.font = `${Math.floor(h / 40)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('clean → stack → file → coil → wipe → align', Math.floor(w * 0.05), Math.floor(h * 0.96));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
