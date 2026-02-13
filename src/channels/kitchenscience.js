// REVIEWED: 2026-02-14
import { mulberry32 } from '../util/prng.js';

const EXPERIMENTS = [
  {
    id: 'volcano',
    title: 'Volcano in a Cup',
    needs: ['baking soda', 'vinegar', 'dish soap'],
    happens: 'fizz + foam + CO₂ bubbles',
    why: 'An acid-base reaction releases carbon dioxide gas.',
    colorA: '#ff7a59',
    colorB: '#ffd36b',
  },
  {
    id: 'milkmarble',
    title: 'Milk Marble Swirls',
    needs: ['milk', 'food colouring', 'a drop of dish soap'],
    happens: 'colours sprint away and swirl',
    why: 'Soap changes surface tension and pushes fats around.',
    colorA: '#6cf2ff',
    colorB: '#ff5aa5',
  },
  {
    id: 'yeastballoon',
    title: 'Yeast Balloon (Tiny Air Factory)',
    needs: ['warm water', 'yeast', 'sugar'],
    happens: 'slow steady bubbling',
    why: 'Yeast ferments sugar and releases CO₂ over time.',
    colorA: '#63ffb6',
    colorB: '#9ad7ff',
  },
  {
    id: 'pepper',
    title: 'Pepper Panic',
    needs: ['water', 'pepper', 'a drop of soap'],
    happens: 'pepper races to the edges',
    why: 'Soap breaks surface tension; water pulls away fast.',
    colorA: '#e7eef6',
    colorB: '#6cf2ff',
  },
  {
    id: 'cabbageph',
    title: 'Cabbage Color Clues',
    needs: ['red cabbage water', 'lemon juice', 'baking soda water'],
    happens: 'purple turns pink (acid) and green (base)',
    why: 'Anthocyanin pigments shift colour depending on acidity.',
    colorA: '#7d5cff',
    colorB: '#ff7aa2',
  },
  {
    id: 'oobleck',
    title: 'Oobleck (Solid-Liquid Sneak)',
    needs: ['cornflour', 'water'],
    happens: 'stiff when hit, flows when you go slow',
    why: 'A non-Newtonian fluid thickens under sudden stress.',
    colorA: '#e7eef6',
    colorB: '#b6ff63',
  },
  {
    id: 'densitytower',
    title: 'Kitchen Density Tower',
    needs: ['honey', 'water', 'oil'],
    happens: 'layers stack and stay separated',
    why: 'Different densities and immiscible liquids form layers.',
    colorA: '#ffd36b',
    colorB: '#6cf2ff',
  },
  {
    id: 'raisindance',
    title: 'Dancing Raisins',
    needs: ['sparkling water', 'raisins'],
    happens: 'raisins bob up and down on bubble elevators',
    why: 'Bubbles stick, lift, pop, then raisins sink and repeat.',
    colorA: '#63ffb6',
    colorB: '#9ad7ff',
  },
  {
    id: 'chromatography',
    title: 'Marker Rainbow Chase',
    needs: ['coffee filter', 'washable marker', 'water'],
    happens: 'ink spreads into colourful bands',
    why: 'Different pigments travel at different speeds in water.',
    colorA: '#ff5aa5',
    colorB: '#6cf2ff',
  },
  {
    id: 'orangeballoon',
    title: 'Orange Peel Pop',
    needs: ['orange peel', 'balloon'],
    happens: 'balloon pops with a tiny citrus mist',
    why: 'Citrus oils can weaken latex when sprayed on it.',
    colorA: '#ff7a59',
    colorB: '#ffd36b',
  },
];

const EXP_BY_ID = new Map(EXPERIMENTS.map((e) => [e.id, e]));

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

function shuffleInPlace(rand, a){
  for (let i = a.length - 1; i > 0; i--){
    const j = (rand() * (i + 1)) | 0;
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

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

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  // separate RNG so special moments don't perturb experiment selection
  const fairRand = mulberry32((((seed | 0) ^ 0xdecafbad) >>> 0));

  let w = 0, h = 0, t = 0;
  let font = 16;
  let small = 12;

  // experiment state
  const MIN_REPEAT_SEC = 5 * 60;
  let expBag = []; // experiment id shuffle-bag
  let expLastShown = new Map(); // id -> time (seconds)
  let expLastId = null;

  let exp = null;
  let expT = 0;
  let dropT = 0;
  let reaction = 0; // 0..1

  // bubble particles
  let bubbles = []; // {x,y,r,vy,a}
  let spawnAcc = 0;

  // foam band bubbles (precomputed; avoids per-frame rand() usage in render)
  let foam = []; // {x,baseR,rAmp,rPhase,rSpeed,yPhase}

  // cached static background (avoid per-frame gradients)
  let bgLayer = null; // CanvasImageSource | null

  // layout
  let bx = 0, by = 0, bw = 0, bh = 0;
  let liquidY = 0;

  // card layout (computed on init/resize for wrapping)
  let cardLeftX = 0, cardRightX = 0, cardY0 = 0;
  let cardW = 0, cardRightW = 0;
  let cardHNeeds = 0, cardHWhy = 0;

  // pre-wrapped experiment text (avoid clipping on long lines)
  let expWrapped = { whyLines: [] };
  const measureCanvas = makeCanvas(8, 8);
  const measureCtx = measureCanvas?.getContext?.('2d') || null;

  // special moment: rare deterministic “SCIENCE FAIR” overlay
  const FAIR_COLORS = ['#6cf2ff', '#ff5aa5', '#ffd36b', '#63ffb6', '#7d5cff'];
  let fairConfetti = []; // {x,y,s,phase,color}
  let fairNext = 0; // seconds until next fair moment
  let fairT = 0; // seconds remaining
  let fairTotal = 0;
  let fairKind = 0; // 0|1

  let fizz = null;

  function refillExperimentBag(){
    expBag = EXPERIMENTS.map((e) => e.id);
    shuffleInPlace(rand, expBag);
  }

  function nextExperiment(){
    if (!expBag.length) refillExperimentBag();

    // seeded shuffle-bag, with a "cooldown" to keep repeats spaced out
    let chosenId = null;
    const scans = expBag.length;
    for (let i = 0; i < scans; i++){
      const id = expBag.shift();
      const lastAt = expLastShown.get(id);
      const okCooldown = lastAt == null || (t - lastAt) >= MIN_REPEAT_SEC;
      const okNotImmediate = id !== expLastId;
      if (okCooldown && okNotImmediate){
        chosenId = id;
        break;
      }
      expBag.push(id);
    }

    // fallback: keep the bag moving even if we can't satisfy the cooldown
    if (!chosenId){
      for (let i = 0; i < expBag.length; i++){
        const id = expBag.shift();
        if (id !== expLastId){
          chosenId = id;
          break;
        }
        expBag.push(id);
      }
    }

    const picked = (chosenId && EXP_BY_ID.get(chosenId)) || pick(rand, EXPERIMENTS);
    exp = picked;
    expLastId = picked?.id || null;
    if (picked?.id) expLastShown.set(picked.id, t);

    expT = 18 + rand() * 10;
    dropT = 1.2 + rand() * 1.8;
    reaction = 0.2 + rand() * 0.25;
    bubbles = [];
    rebuildExpWrapped();
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    bw = Math.floor(w * 0.36);
    bh = Math.floor(h * 0.62);
    bx = Math.floor(w * 0.5 - bw * 0.5);
    by = Math.floor(h * 0.24);
    liquidY = by + Math.floor(bh * 0.62);

    // cards
    cardW = Math.floor(w * 0.25);
    cardRightW = Math.floor(w * 0.27);
    cardLeftX = Math.floor(w * 0.06);
    cardRightX = Math.floor(w * 0.69);
    cardY0 = Math.floor(h * 0.28);
    cardHNeeds = Math.floor(h * 0.22);
    cardHWhy = Math.floor(h * 0.27);

    bgLayer = rebuildBackgroundLayer();
    rebuildFoam();
    rebuildScienceFair();

    fairT = 0;
    fairTotal = 0;
    scheduleScienceFair();

    expBag = [];
    expLastShown = new Map();
    expLastId = null;
    nextExperiment();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function stopFizz({ clearCurrent = false } = {}){
    const handle = fizz;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    fizz = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // If onAudioOn is called repeatedly while audio is enabled, avoid restarting
    // or stacking our ambience.
    if (fizz && audio.current === fizz) return;

    stopFizz({ clearCurrent: true });
    const n = audio.noiseSource({ type: 'pink', gain: 0.008 });
    n.start();
    fizz = { stop(){ n.stop(); } };
    audio.setCurrent(fizz);
  }

  function onAudioOff(){
    stopFizz({ clearCurrent: true });
  }

  function destroy(){
    // Only clears AudioManager.current when we own it.
    stopFizz({ clearCurrent: true });
  }

  function bubblePopSound(intensity=0.3){
    if (!audio.enabled) return;
    const f = 420 + rand() * 420 + intensity * 360;
    audio.beep({ freq: f, dur: 0.018 + rand() * 0.02, gain: 0.012 + intensity * 0.02, type: 'triangle' });
  }

  function spawnBubble(){
    const neckW = bw * 0.45;
    const x0 = bx + bw * 0.5;
    const spread = neckW * 0.42;

    const r = 2 + rand() * (Math.max(3, Math.floor(font * 0.35)));
    bubbles.push({
      x: x0 + (rand() * 2 - 1) * spread,
      y: liquidY + 12 + rand() * (by + bh - liquidY - 20),
      r,
      vy: (40 + rand() * 90) * (0.7 + reaction * 1.2),
      a: 0.25 + rand() * 0.4,
    });
  }

  function update(dt){
    t += dt;

    expT -= dt;
    if (expT <= 0) nextExperiment();

    // "ingredient" drops that spike the reaction
    dropT -= dt;
    if (dropT <= 0){
      dropT = 1.2 + rand() * 2.4;
      reaction = Math.min(1, reaction + 0.45 + rand() * 0.25);
      bubblePopSound(0.55);
    }

    reaction = Math.max(0, reaction - dt * 0.12);

    // spawn bubbles based on reaction level
    const rate = 10 + reaction * 95;
    spawnAcc += dt * rate;
    while (spawnAcc >= 1){
      spawnAcc -= 1;
      spawnBubble();
    }

    // update bubbles
    const surface = liquidY + Math.sin(t * 1.4) * (2 + reaction * 3);
    for (const b of bubbles){
      b.y -= b.vy * dt;
      b.x += Math.sin(t * 2 + b.y * 0.01) * dt * (8 + reaction * 20);
      if (b.y < surface + b.r * 0.3){
        // pop
        b.y = surface;
        b.a *= 0.4;
        if (rand() < 0.12 + reaction * 0.25) bubblePopSound(reaction);
        // recycle below
        b.y = by + bh - 8 - rand() * 40;
      }
    }

    // science fair special moment scheduler (no per-frame RNG)
    if (fairT > 0){
      fairT -= dt;
      if (fairT < 0) fairT = 0;
    } else {
      fairNext -= dt;
      if (fairNext <= 0) startScienceFair();
    }

    // keep bounded
    if (bubbles.length > 320) bubbles.splice(0, bubbles.length - 320);
  }

  function beakerPath(ctx){
    // a friendly lab beaker: neck + belly
    const neckW = bw * 0.46;
    const bellyW = bw * 0.78;
    const rimH = Math.max(8, Math.floor(font * 0.55));

    const cx = bx + bw * 0.5;
    const y0 = by;
    const y1 = by + rimH;
    const y2 = by + bh;

    const nx0 = cx - neckW * 0.5;
    const nx1 = cx + neckW * 0.5;
    const bx0 = cx - bellyW * 0.5;
    const bx1 = cx + bellyW * 0.5;

    const r = Math.max(10, Math.floor(font * 0.9));

    ctx.beginPath();
    // rim
    ctx.moveTo(nx0, y1);
    ctx.lineTo(nx0, y0);
    ctx.lineTo(nx1, y0);
    ctx.lineTo(nx1, y1);

    // taper out to belly
    ctx.lineTo(bx1, y1 + bh * 0.22);
    ctx.arcTo(bx1, y2, cx, y2, r);
    ctx.arcTo(bx0, y2, bx0, y1 + bh * 0.22, r);
    ctx.lineTo(bx0, y1 + bh * 0.22);

    // back to neck
    ctx.closePath();
  }

  function wrapTextToWidth(ctx, text, maxWidth){
    if (!text) return [];
    const raw = String(text).replace(/\n+/g, ' ').trim();
    if (!raw) return [];

    const words = raw.split(/\s+/g).filter(Boolean);
    const out = [];
    let line = '';

    for (const word of words){
      const test = line ? (line + ' ' + word) : word;
      if (line && ctx.measureText(test).width > maxWidth){
        out.push(line);
        line = word;
      } else {
        line = test;
      }

      // Hard-break a single too-wide token (rare, but avoids clipping)
      if (line && ctx.measureText(line).width > maxWidth){
        let rest = line;
        line = '';
        while (rest){
          let cut = 1;
          for (let i = 1; i <= rest.length; i++){
            if (ctx.measureText(rest.slice(0, i)).width > maxWidth){
              cut = Math.max(1, i - 1);
              break;
            }
            cut = i;
          }
          out.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
      }
    }

    if (line) out.push(line);
    return out;
  }

  function rebuildExpWrapped(){
    const blocks = [];
    if (exp?.happens) blocks.push(`Happens: ${exp.happens}`);
    if (exp?.why) blocks.push(exp.why);

    if (!measureCtx){
      expWrapped = { whyLines: blocks };
      return;
    }

    measureCtx.font = `${small}px ui-sans-serif, system-ui`;
    const padX = Math.floor(font * 0.8);
    const maxW = Math.max(40, cardRightW - padX * 2 - 2);

    const lines = [];
    for (const b of blocks){
      lines.push(...wrapTextToWidth(measureCtx, b, maxW));
    }
    expWrapped = { whyLines: lines };
  }

  function drawCard(ctx, x, y, ww, hh, title, lines, accent){
    const r = Math.max(10, Math.floor(font * 0.8));
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    roundRect(ctx, x + 6, y + 8, ww, hh, r);
    ctx.fill();

    ctx.fillStyle = 'rgba(18, 26, 36, 0.88)';
    roundRect(ctx, x, y, ww, hh, r);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y + Math.floor(font * 1.55), ww, 2);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 0.95)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText(title, x + Math.floor(font * 0.8), y + Math.floor(font * 0.5));

    ctx.font = `${small}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.75)';
    let yy = y + Math.floor(font * 2.1);
    for (const ln of lines){
      ctx.fillText(ln, x + Math.floor(font * 0.8), yy);
      yy += Math.floor(small * 1.25);
    }
    ctx.restore();
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

  function drawStaticBackground(ctx){
    // warm kitchen-ish backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a1220');
    bg.addColorStop(0.55, '#121a26');
    bg.addColorStop(1, '#070a10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // countertop
    ctx.save();
    const top = Math.floor(h * 0.78);
    const wood = ctx.createLinearGradient(0, top, 0, h);
    wood.addColorStop(0, 'rgba(78, 52, 33, 0.9)');
    wood.addColorStop(1, 'rgba(35, 22, 14, 1)');
    ctx.fillStyle = wood;
    ctx.fillRect(0, top, w, h - top);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 10; i++){
      const y = top + i * ((h - top) / 10);
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
  }

  function rebuildBackgroundLayer(){
    const c = makeCanvas(w, h);
    if (!c) return null;
    const cctx = c.getContext('2d');
    if (!cctx) return null;

    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, w, h);
    drawStaticBackground(cctx);
    return c;
  }

  function rebuildFoam(){
    const N = 22;
    const r = mulberry32((((seed | 0) ^ 0x9e3779b9) >>> 0));
    foam = [];
    for (let i = 0; i < N; i++){
      const u = N === 1 ? 0.5 : i / (N - 1);
      const jitter = (r() * 2 - 1) * bw * 0.008;
      const x = bx + u * bw + jitter;
      foam.push({
        x,
        baseR: 3 + r() * 7,
        rAmp: 1.5 + r() * 3.5,
        rPhase: r() * Math.PI * 2,
        rSpeed: 1.2 + r() * 1.6,
        yPhase: r() * Math.PI * 2,
      });
    }
  }

  function rebuildScienceFair(){
    const r = mulberry32((((seed | 0) ^ 0x7f4a7c15) >>> 0));
    const N = 140;
    fairConfetti = [];
    for (let i = 0; i < N; i++){
      fairConfetti.push({
        x: r() * w,
        y: r() * h,
        s: 1.6 + r() * 3.2,
        phase: r() * Math.PI * 2,
        color: FAIR_COLORS[(r() * FAIR_COLORS.length) | 0],
      });
    }
  }

  function scheduleScienceFair(){
    // keep it special: ~2–4 minutes between banners
    fairNext = 120 + fairRand() * 120;
  }

  function startScienceFair(){
    // variant 1 is extra-rare ("SHOW & TELL")
    fairKind = fairRand() < 0.85 ? 0 : 1;
    fairT = 6 + fairRand() * 4;
    fairTotal = fairT;
    scheduleScienceFair();

    reaction = Math.min(1, reaction + 0.35);

    if (audio.enabled){
      const base = fairKind === 0 ? 520 : 640;
      audio.beep({ freq: base, dur: 0.06, gain: 0.02, type: 'sine' });
      audio.beep({ freq: base * 1.25, dur: 0.05, gain: 0.018, type: 'triangle' });
    }
  }

  function drawScienceFair(ctx){
    if (!(fairT > 0 && fairTotal > 0)) return;

    const fadeIn = Math.min(1, (fairTotal - fairT) / 0.6);
    const fadeOut = Math.min(1, fairT / 0.8);
    const a = Math.min(fadeIn, fadeOut);
    if (a <= 0) return;

    // confetti layer
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    const speed = fairKind === 0 ? 55 : 75;
    for (const c of fairConfetti){
      const yy = ((c.y + t * speed + c.phase * 12) % (h + 20)) - 10;
      const xx = c.x + Math.sin(t * 0.9 + c.phase) * 12;
      ctx.fillStyle = c.color;
      ctx.save();
      ctx.translate(xx, yy);
      ctx.rotate(Math.sin(t * 1.2 + c.phase) * 0.7);
      ctx.fillRect(-c.s, -c.s * 0.25, c.s * 2, c.s * 0.5);
      ctx.restore();
    }
    ctx.restore();

    // ribbon banner
    ctx.save();
    ctx.translate(w * 0.5, Math.floor(h * 0.23));
    ctx.rotate(fairKind === 0 ? -0.09 : 0.09);
    const rw = Math.floor(w * 0.74);
    const rh = Math.floor(font * 1.4);

    const grad = ctx.createLinearGradient(-rw / 2, 0, rw / 2, 0);
    grad.addColorStop(0, 'rgba(255,90,165,0.85)');
    grad.addColorStop(0.5, 'rgba(108,242,255,0.85)');
    grad.addColorStop(1, 'rgba(255,211,107,0.85)');

    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, -rw / 2 + 6, -rh / 2 + 6, rw, rh, Math.floor(rh / 2));
    ctx.fill();

    ctx.fillStyle = grad;
    roundRect(ctx, -rw / 2, -rh / 2, rw, rh, Math.floor(rh / 2));
    ctx.fill();

    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(18, 26, 36, 0.9)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('SCIENCE FAIR', 0, 1);

    if (fairKind === 1){
      ctx.font = `${Math.floor(font * 0.72)}px ui-sans-serif, system-ui`;
      ctx.fillStyle = 'rgba(18, 26, 36, 0.75)';
      ctx.fillText('SHOW & TELL', 0, Math.floor(font * 0.95));
    }

    ctx.restore();

    if (fairKind === 1){
      // starburst around beaker
      ctx.save();
      ctx.globalAlpha = a * 0.55;
      const cx = bx + bw * 0.5;
      const cy = by + bh * 0.45;
      const rays = 18;
      ctx.strokeStyle = 'rgba(255,211,107,0.7)';
      ctx.lineWidth = Math.max(1, Math.floor(font * 0.09));
      for (let i = 0; i < rays; i++){
        const ang = (i / rays) * Math.PI * 2 + Math.sin(t * 0.6) * 0.15;
        const r0 = bw * 0.26;
        const r1 = bw * 0.44;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function render(ctx){

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (bgLayer){
      ctx.drawImage(bgLayer, 0, 0);
    } else {
      drawStaticBackground(ctx);
    }

    // title banner
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, Math.floor(h * 0.06), w, Math.floor(h * 0.11));
    ctx.fillStyle = 'rgba(108,242,255,0.85)';
    ctx.fillRect(0, Math.floor(h * 0.17), w, 2);

    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('KITCHEN SCIENCE CLUB', Math.floor(w * 0.05), Math.floor(h * 0.105));

    ctx.font = `${Math.floor(font * 0.9)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.fillText(exp?.title || '—', Math.floor(w * 0.05), Math.floor(h * 0.145));
    ctx.restore();

    // beaker shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.ellipse(bx + bw * 0.5, by + bh * 0.96, bw * 0.34, bh * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // liquid + bubbles (clipped to beaker)
    ctx.save();
    beakerPath(ctx);
    ctx.clip();

    const wave = Math.sin(t * 1.2) * (2 + reaction * 3);
    const ly = liquidY + wave;
    const g = ctx.createLinearGradient(0, ly - 80, 0, by + bh);
    g.addColorStop(0, exp?.colorA || '#6cf2ff');
    g.addColorStop(1, exp?.colorB || '#ff5aa5');
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = g;
    ctx.fillRect(bx, ly, bw, by + bh - ly);

    // foam band (deterministic: no per-frame rand() usage)
    ctx.globalAlpha = 0.22 + reaction * 0.22;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < foam.length; i++){
      const f = foam[i];
      const x = Math.min(bx + bw, Math.max(bx, f.x));
      const wobble = Math.sin(t * 3 + f.yPhase) * (2 + reaction * 0.9);
      const rr = f.baseR + reaction * 8 + f.rAmp * (0.5 + 0.5 * Math.sin(t * f.rSpeed + f.rPhase));
      ctx.beginPath();
      ctx.arc(x, ly + wobble, rr, 0, Math.PI * 2);
      ctx.fill();
    }

    // bubbles
    ctx.globalAlpha = 1;
    for (const b of bubbles){
      ctx.globalAlpha = b.a * (0.6 + reaction * 0.6);
      ctx.strokeStyle = 'rgba(231,238,246,0.7)';
      ctx.lineWidth = Math.max(1, Math.floor(font * 0.08));
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // beaker glass outline + rim
    ctx.save();
    ctx.globalAlpha = 0.9;
    beakerPath(ctx);
    ctx.strokeStyle = 'rgba(231,238,246,0.55)';
    ctx.lineWidth = Math.max(2, Math.floor(font * 0.13));
    ctx.stroke();

    // rim highlight
    const rimY = by + Math.max(8, Math.floor(font * 0.55));
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(231,238,246,0.8)';
    ctx.fillRect(bx + bw * 0.27, by, bw * 0.46, 2);
    ctx.fillRect(bx + bw * 0.23, rimY, bw * 0.54, 1);
    ctx.restore();

    // cards: needs + why
    drawCard(
      ctx,
      cardLeftX,
      cardY0,
      cardW,
      cardHNeeds,
      'You need',
      (exp?.needs || []).map((s) => `• ${s}`),
      'rgba(108,242,255,0.85)'
    );

    drawCard(
      ctx,
      cardRightX,
      cardY0,
      cardRightW,
      cardHWhy,
      'Why it works',
      expWrapped.whyLines || [],
      'rgba(255,90,165,0.85)'
    );

    // safety footer
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, Math.floor(h * 0.92), w, Math.floor(h * 0.08));
    ctx.fillStyle = 'rgba(231,238,246,0.7)';
    ctx.font = `${Math.floor(h / 36)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('safe, small, supervised • no fire • no pressure • no mystery chemicals', Math.floor(w * 0.05), Math.floor(h * 0.96));
    ctx.restore();

    drawScienceFair(ctx);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
