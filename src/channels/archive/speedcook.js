import { mulberry32, clamp } from '../../util/prng.js';

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

const RECIPES = [
  {
    id: 'noodles',
    title: 'Garlic Butter Noodles',
    subtitle: 'one pan • fast toss • big comfort',
    palette: { a: '#ffd36b', b: '#ff7a59', c: '#6cf2ff' },
    steps: [
      { label: 'heat pan', dur: 18, mode: 'prep' },
      { label: 'sizzle garlic', dur: 34, mode: 'sizzle' },
      { label: 'add noodles + splash', dur: 26, mode: 'add' },
      { label: 'toss + glaze', dur: 44, mode: 'stir' },
      { label: 'plate', dur: 18, mode: 'finish' },
    ],
  },
  {
    id: 'friedrice',
    title: 'Fried Rice Any%',
    subtitle: 'scramble • toss • serve',
    palette: { a: '#63ffb6', b: '#9ad7ff', c: '#ff5aa5' },
    steps: [
      { label: 'warm oil', dur: 14, mode: 'prep' },
      { label: 'scramble eggs', dur: 30, mode: 'stir' },
      { label: 'add rice + soy', dur: 52, mode: 'sizzle' },
      { label: 'toss peas', dur: 34, mode: 'stir' },
      { label: 'serve', dur: 18, mode: 'finish' },
    ],
  },
  {
    id: 'quesa',
    title: 'One-Pan Quesadilla',
    subtitle: 'crisp edges • molten center',
    palette: { a: '#ff5aa5', b: '#ffd36b', c: '#6cf2ff' },
    steps: [
      { label: 'toast tortilla', dur: 24, mode: 'sizzle' },
      { label: 'melt cheese', dur: 38, mode: 'sizzle' },
      { label: 'flip', dur: 9, mode: 'flip' },
      { label: 'crisp', dur: 22, mode: 'sizzle' },
      { label: 'slice', dur: 14, mode: 'finish' },
    ],
  },
];

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

  let w = 0, h = 0, t = 0;
  let font = 16;
  let small = 12;

  let recipe = null;
  let stepIndex = 0;
  let stepT = 0;

  // pan bits
  let bits = []; // {a,r,spd,sz,c}
  let steam = []; // {x,y,vy,a,life}
  let steamAcc = 0;

  // audio
  let sizzle = null; // {src,gain,stop}
  let tickAcc = 0;
  let lastTick = -1;

  function curStep(){
    return recipe?.steps?.[stepIndex] || null;
  }

  function nextRecipe(){
    recipe = pick(rand, RECIPES);
    stepIndex = 0;
    stepT = 0;

    // seed bits per recipe for a stable look
    bits = [];
    const n = 36 + ((rand() * 18) | 0);
    for (let i = 0; i < n; i++){
      const a = rand() * Math.PI * 2;
      const r = 0.08 + rand() * 0.44;
      const spd = (0.35 + rand() * 0.9) * (rand() < 0.5 ? -1 : 1);
      const sz = 2 + rand() * 5;
      const cPick = rand();
      const c = cPick < 0.45 ? (recipe.palette?.a || '#ffd36b') : (cPick < 0.8 ? (recipe.palette?.b || '#ff7a59') : (recipe.palette?.c || '#6cf2ff'));
      bits.push({ a, r, spd, sz, c });
    }

    steam = [];
    steamAcc = 0;
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    tickAcc = 0;
    lastTick = -1;

    nextRecipe();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // white-noise "sizzle" bed; we modulate gain per step.
    const n = audio.noiseSource({ type: 'white', gain: 0.0025 });
    n.start();
    sizzle = { src: n.src, gain: n.gain, stop(){ n.stop(); } };
    audio.setCurrent(sizzle);
  }

  function onAudioOff(){
    try { sizzle?.stop?.(); } catch {}
    sizzle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function stepBeep(kind='step'){
    if (!audio.enabled) return;
    if (kind === 'flip') audio.beep({ freq: 1040 + rand() * 120, dur: 0.03, gain: 0.05, type: 'square' });
    else if (kind === 'finish') audio.beep({ freq: 880 + rand() * 120, dur: 0.05, gain: 0.05, type: 'triangle' });
    else audio.beep({ freq: 640 + rand() * 140, dur: 0.03, gain: 0.035, type: 'triangle' });
  }

  function tickSound(){
    if (!audio.enabled) return;
    audio.beep({ freq: 920 + rand() * 40, dur: 0.012, gain: 0.012, type: 'sine' });
  }

  function spawnSteam(cx, cy, R, intensity){
    const x = cx + (rand() * 2 - 1) * R * 0.35;
    const y = cy - R * 0.2 + (rand() * 2 - 1) * R * 0.08;
    steam.push({
      x,
      y,
      vy: 24 + rand() * 70 + intensity * 80,
      a: 0.08 + rand() * 0.14 + intensity * 0.18,
      life: 0.9 + rand() * 1.2,
    });
  }

  function update(dt){
    t += dt;

    if (!recipe) nextRecipe();

    const step = curStep();
    if (!step){
      nextRecipe();
      return;
    }

    stepT += dt;

    // audio: sizzle gain follows the step
    if (audio.enabled && sizzle?.gain){
      const isSizzle = step.mode === 'sizzle';
      const isStir = step.mode === 'stir';
      const target = 0.0025 + (isSizzle ? 0.008 : 0) + (isStir ? 0.003 : 0);
      // simple smoothing
      const g = sizzle.gain.gain;
      g.value = g.value + (target - g.value) * Math.min(1, dt * 6);
    }

    // tick once per second (based on remaining time)
    const rem = step.dur - stepT;
    const sec = Math.max(0, Math.ceil(rem));
    if (sec !== lastTick){
      lastTick = sec;
      // only tick when there is still time (avoid a burst at transitions)
      if (sec > 0) tickSound();
    }

    // animate bits (stir faster during stir/sizzle)
    const stir = step.mode === 'stir' ? 1.8 : (step.mode === 'sizzle' ? 1.2 : 0.7);
    for (const b of bits){
      b.a += dt * b.spd * stir;
    }

    // steam spawns mostly during sizzle
    const steamInt = step.mode === 'sizzle' ? 1 : (step.mode === 'stir' ? 0.45 : 0.18);
    steamAcc += dt * (2.5 + steamInt * 8);
    while (steamAcc >= 1){
      steamAcc -= 1;
      // positions are computed in render; store normalized and re-map
      steam.push({ x: rand(), y: rand(), vy: 24 + rand() * 70 + steamInt * 80, a: 0.06 + rand() * 0.14 + steamInt * 0.2, life: 0.8 + rand() * 1.2, norm: true });
    }

    // update steam
    for (const s of steam){
      s.life -= dt;
      if (!s.norm) s.y -= s.vy * dt;
    }
    steam = steam.filter((s) => s.life > 0);
    if (steam.length > 180) steam.splice(0, steam.length - 180);

    if (stepT >= step.dur){
      stepT = 0;
      stepIndex++;

      const kind = step.mode === 'flip' ? 'flip' : (step.mode === 'finish' ? 'finish' : 'step');
      stepBeep(kind);

      if (stepIndex >= recipe.steps.length){
        nextRecipe();
      }
    }
  }

  function drawBackground(ctx){
    // kitchen-ish gradient + counter
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a1220');
    bg.addColorStop(0.6, '#111a28');
    bg.addColorStop(1, '#060810');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const top = Math.floor(h * 0.78);
    const wood = ctx.createLinearGradient(0, top, 0, h);
    wood.addColorStop(0, 'rgba(86, 55, 34, 0.92)');
    wood.addColorStop(1, 'rgba(34, 21, 13, 1)');
    ctx.fillStyle = wood;
    ctx.fillRect(0, top, w, h - top);

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 10; i++){
      const y = top + i * ((h - top) / 10);
      ctx.fillRect(0, y, w, 1);
    }
    ctx.globalAlpha = 1;

    // vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.52, h * 0.42, 0, w * 0.52, h * 0.42, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(255,255,255,0.05)');
    vg.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawPan(ctx, cx, cy, R, step){
    // shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + R * 0.68, R * 0.72, R * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // handle
    const hx0 = cx + R * 0.55;
    const hy0 = cy + R * 0.1;
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, hx0, hy0 - R * 0.08, R * 0.65, R * 0.16, R * 0.08);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(231,238,246,0.14)';
    roundRect(ctx, hx0 + 6, hy0 - R * 0.05, R * 0.6, R * 0.1, R * 0.06);
    ctx.fill();
    ctx.restore();

    // pan body
    ctx.save();
    ctx.globalAlpha = 0.92;
    const g = ctx.createRadialGradient(cx - R * 0.22, cy - R * 0.22, R * 0.08, cx, cy, R);
    g.addColorStop(0, 'rgba(231,238,246,0.15)');
    g.addColorStop(0.45, 'rgba(20, 26, 34, 0.95)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // rim
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = 'rgba(231,238,246,0.22)';
    ctx.lineWidth = Math.max(2, Math.floor(font * 0.14));
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.98, 0, Math.PI * 2);
    ctx.stroke();

    // heat shimmer on prep/sizzle
    const heat = step?.mode === 'sizzle' ? 1 : (step?.mode === 'prep' ? 0.35 : 0.2);
    ctx.globalAlpha = 0.06 + heat * 0.08;
    ctx.fillStyle = 'rgba(255, 122, 89, 1)';
    ctx.beginPath();
    ctx.arc(cx, cy, R * (0.6 + 0.02 * Math.sin(t * 2.0)), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);

    const step = curStep();
    const p = step ? clamp(stepT / step.dur, 0, 1) : 0;

    // header banner
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, Math.floor(h * 0.06), w, Math.floor(h * 0.11));
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = recipe?.palette?.c || 'rgba(108,242,255,0.85)';
    ctx.fillRect(0, Math.floor(h * 0.17), w, 2);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('SPEED-RUN COOKING', Math.floor(w * 0.05), Math.floor(h * 0.105));

    ctx.font = `${Math.floor(font * 0.9)}px ui-sans-serif, system-ui`;
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.fillText(recipe?.title || '—', Math.floor(w * 0.05), Math.floor(h * 0.145));
    ctx.restore();

    // main layout
    const scale = Math.max(1, Math.min(w, h) / 780);
    const cx = Math.floor(w * 0.42);
    const cy = Math.floor(h * 0.56);
    const R = Math.floor(Math.min(w, h) * 0.19);

    // pan
    drawPan(ctx, cx, cy, R, step);

    // contents: clip to pan
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.92, 0, Math.PI * 2);
    ctx.clip();

    // sauce/contents fill
    const fillG = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.25, R * 0.1, cx, cy, R);
    fillG.addColorStop(0, 'rgba(255,255,255,0.05)');
    fillG.addColorStop(0.55, 'rgba(0,0,0,0.22)');
    fillG.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = fillG;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // bits
    const stir = step?.mode === 'stir' ? 1.9 : (step?.mode === 'sizzle' ? 1.25 : 0.85);
    for (const b of bits){
      const rr = R * b.r;
      const aa = b.a + Math.sin(t * 0.9 + b.r * 12) * 0.12 * stir;
      const x = cx + Math.cos(aa) * rr;
      const y = cy + Math.sin(aa) * rr * 0.86;
      const s = b.sz * scale * (0.9 + 0.25 * Math.sin(t * 1.1 + b.r * 20));
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = b.c;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }

    // subtle stir swirl
    ctx.globalAlpha = 0.12 + 0.08 * Math.sin(t * 0.7);
    ctx.strokeStyle = recipe?.palette?.c || '#6cf2ff';
    ctx.lineWidth = Math.max(1, Math.floor(font * 0.08));
    ctx.beginPath();
    ctx.arc(cx, cy, R * (0.22 + 0.12 * stir), 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    // steam (map normalized positions to above-pan coordinates)
    ctx.save();
    const steamInt = step?.mode === 'sizzle' ? 1 : (step?.mode === 'stir' ? 0.5 : 0.22);
    for (const s of steam){
      let x = s.x, y = s.y;
      if (s.norm){
        x = cx + (x * 2 - 1) * R * 0.45;
        y = cy - R * (0.25 + y * 0.18);
      }
      const lifeP = clamp(s.life / 1.7, 0, 1);
      const a = s.a * (0.35 + steamInt * 0.9) * (0.3 + 0.7 * (1 - lifeP));
      const rise = (1 - lifeP) * (28 + s.vy * 0.55);

      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(231,238,246,0.9)';
      ctx.lineWidth = Math.max(1, Math.floor(font * 0.07));
      ctx.beginPath();
      const wig = Math.sin(t * 1.8 + x * 0.01) * 6;
      ctx.moveTo(x - wig, y);
      ctx.quadraticCurveTo(x + wig * 0.3, y - rise * 0.5, x + wig, y - rise);
      ctx.stroke();
    }
    ctx.restore();

    // right-side HUD: timer + steps
    const hudX = Math.floor(w * 0.68);
    const hudY = Math.floor(h * 0.26);
    const hudW = Math.floor(w * 0.28);
    const hudH = Math.floor(h * 0.5);
    const r = Math.max(10, Math.floor(font * 0.85));

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    roundRect(ctx, hudX + 6, hudY + 8, hudW, hudH, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(18, 26, 36, 0.88)';
    roundRect(ctx, hudX, hudY, hudW, hudH, r);
    ctx.fill();

    // timer
    const rem = step ? Math.max(0, step.dur - stepT) : 0;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = recipe?.palette?.b || '#ff7a59';
    ctx.font = `${Math.floor(font * 1.35)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(rem), hudX + Math.floor(font * 0.8), hudY + Math.floor(font * 0.55));

    // progress bar
    const barY = hudY + Math.floor(font * 2.2);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(231,238,246,0.18)';
    roundRect(ctx, hudX + Math.floor(font * 0.8), barY, hudW - Math.floor(font * 1.6), 4, 2);
    ctx.fill();
    ctx.fillStyle = recipe?.palette?.c || '#6cf2ff';
    roundRect(ctx, hudX + Math.floor(font * 0.8), barY, (hudW - Math.floor(font * 1.6)) * p, 4, 2);
    ctx.fill();

    // step label
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(231,238,246,0.85)';
    ctx.font = `${small}px ui-sans-serif, system-ui`;
    ctx.fillText(step?.label ? `now: ${step.label}` : 'now: —', hudX + Math.floor(font * 0.8), barY + Math.floor(font * 0.65));

    // steps list
    let yy = hudY + Math.floor(hudH * 0.33);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    const steps = recipe?.steps || [];
    for (let i = 0; i < steps.length; i++){
      const s = steps[i];
      const active = i === stepIndex;
      ctx.globalAlpha = active ? 0.95 : 0.55;
      ctx.fillStyle = active ? (recipe?.palette?.a || '#ffd36b') : 'rgba(231,238,246,0.75)';
      const num = String(i + 1).padStart(2, '0');
      const line = `${num}. ${s.label}`;
      ctx.fillText(line, hudX + Math.floor(font * 0.8), yy);
      yy += Math.floor(small * 1.28);
    }

    // subtitle (tiny)
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.font = `${Math.floor(small * 0.92)}px ui-sans-serif, system-ui`;
    ctx.fillText(recipe?.subtitle || 'one pan • one timer • zero fluff', hudX + Math.floor(font * 0.8), hudY + hudH - Math.floor(font * 1.3));

    ctx.restore();

    // footer
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, Math.floor(h * 0.92), w, Math.floor(h * 0.08));
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = 'rgba(231,238,246,0.7)';
    ctx.font = `${Math.floor(h / 38)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('one pan • one timer • clear steps • zero fluff', Math.floor(w * 0.05), Math.floor(h * 0.96));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
