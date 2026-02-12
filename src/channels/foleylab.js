// REVIEWED: 2026-02-13
import { mulberry32, clamp } from '../util/prng.js';

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

const RECIPES = [
  {
    id: 'rain',
    title: 'Rain on Window',
    effect: 'soft rain texture + distant cars',
    palette: { a: '#6cf2ff', b: '#ff5aa5' },
    props: [
      { name: 'rice', type: 'jar' },
      { name: 'foil tray', type: 'tray' },
      { name: 'glass sheet', type: 'glass' },
    ],
    steps: [
      { label: 'light sprinkle', dur: 6.0, prop: 1, action: 'sprinkle', sound: 'rain' },
      { label: 'steady rain', dur: 8.0, prop: 1, action: 'shake', sound: 'rain' },
      { label: 'droplets on glass', dur: 7.0, prop: 2, action: 'tap', sound: 'drip' },
      { label: 'fade out', dur: 4.5, prop: 0, action: 'settle', sound: null },
    ],
  },
  {
    id: 'footsteps',
    title: 'Footsteps (Snow)',
    effect: 'crunchy steps in a quiet night scene',
    palette: { a: '#e7eef6', b: '#63ffb6' },
    props: [
      { name: 'cornstarch pouch', type: 'bag' },
      { name: 'shoe sole', type: 'shoe' },
      { name: 'felt mat', type: 'mat' },
    ],
    steps: [
      { label: 'prep crunch', dur: 5.0, prop: 0, action: 'knead', sound: 'snow' },
      { label: 'slow steps', dur: 10.0, prop: 1, action: 'step', sound: 'steps' },
      { label: 'quick steps', dur: 8.0, prop: 1, action: 'stepfast', sound: 'steps' },
      { label: 'scuff + stop', dur: 5.5, prop: 2, action: 'scuff', sound: 'scuff' },
    ],
  },
  {
    id: 'door',
    title: 'Door Close (Interior)',
    effect: 'hinge creak + soft latch',
    palette: { a: '#ffd66b', b: '#9ad7ff' },
    props: [
      { name: 'small hinge', type: 'hinge' },
      { name: 'wood frame', type: 'board' },
      { name: 'rubber wedge', type: 'wedge' },
    ],
    steps: [
      { label: 'hinge creak', dur: 7.0, prop: 0, action: 'twist', sound: 'creak' },
      { label: 'close swing', dur: 6.0, prop: 1, action: 'swing', sound: 'whoosh' },
      { label: 'latch click', dur: 4.0, prop: 2, action: 'press', sound: 'click' },
      { label: 'room settle', dur: 4.5, prop: 1, action: 'settle', sound: null },
    ],
  },
  {
    id: 'thunder',
    title: 'Thunder',
    effect: 'distant rumble → close crack',
    palette: { a: '#9b7bff', b: '#6cf2ff' },
    props: [
      { name: 'metal sheet', type: 'sheet' },
      { name: 'big drum', type: 'drum' },
      { name: 'thin stick', type: 'stick' },
    ],
    steps: [
      { label: 'distant rumble', dur: 7.0, prop: 1, action: 'roll', sound: 'rumble' },
      { label: 'approaching', dur: 7.5, prop: 0, action: 'wobble', sound: 'thunder' },
      { label: 'close crack', dur: 4.0, prop: 2, action: 'snap', sound: 'crack' },
      { label: 'after-rumble', dur: 5.5, prop: 1, action: 'roll', sound: 'rumble' },
    ],
  },
  {
    id: 'fire',
    title: 'Fireplace Crackle',
    effect: 'warm crackle + occasional pop',
    palette: { a: '#ff7a59', b: '#ffd36b' },
    props: [
      { name: 'cellophane', type: 'sheet' },
      { name: 'pinecone', type: 'cone' },
      { name: 'small sticks', type: 'sticks' },
    ],
    steps: [
      { label: 'soft crackle', dur: 9.0, prop: 0, action: 'crumple', sound: 'crackle' },
      { label: 'steady burn', dur: 9.0, prop: 2, action: 'tap', sound: 'crackle' },
      { label: 'pop + spark', dur: 6.0, prop: 1, action: 'pop', sound: 'pop' },
      { label: 'fade out', dur: 5.0, prop: 0, action: 'settle', sound: null },
    ],
  },
  {
    id: 'vinyl',
    title: 'Vinyl Static',
    effect: 'dusty groove hiss + occasional pop',
    palette: { a: '#ffd66b', b: '#9b7bff' },
    props: [
      { name: 'record sleeve', type: 'board' },
      { name: 'vinyl disc', type: 'sheet' },
      { name: 'needle brush', type: 'stick' },
    ],
    steps: [
      { label: 'dust sweep', dur: 6.0, prop: 2, action: 'brush', sound: 'crackle' },
      { label: 'drop needle', dur: 4.2, prop: 2, action: 'tap', sound: 'click' },
      { label: 'groove hiss', dur: 10.0, prop: 1, action: 'spin', sound: 'crackle' },
      { label: 'big pop', dur: 6.0, prop: 0, action: 'knock', sound: 'pop' },
    ],
  },
  {
    id: 'pages',
    title: 'Pages (Quick Flip)',
    effect: 'paper rush + crisp corner taps',
    palette: { a: '#e7eef6', b: '#6cf2ff' },
    props: [
      { name: 'paper stack', type: 'board' },
      { name: 'binder clip', type: 'wedge' },
      { name: 'fingertips', type: 'stick' },
    ],
    steps: [
      { label: 'align pages', dur: 5.0, prop: 0, action: 'square', sound: 'click' },
      { label: 'quick flip', dur: 9.0, prop: 2, action: 'flip', sound: 'whoosh' },
      { label: 'corner taps', dur: 6.0, prop: 2, action: 'tap', sound: 'click' },
      { label: 'settle', dur: 4.5, prop: 1, action: 'hold', sound: null },
    ],
  },
  {
    id: 'coffee',
    title: 'Coffee Drip',
    effect: 'steady drip + spoon clinks',
    palette: { a: '#ff7a59', b: '#63ffb6' },
    props: [
      { name: 'mug', type: 'jar' },
      { name: 'spoon', type: 'stick' },
      { name: 'kettle base', type: 'drum' },
    ],
    steps: [
      { label: 'first drops', dur: 6.5, prop: 0, action: 'drip', sound: 'drip' },
      { label: 'steady drip', dur: 8.5, prop: 2, action: 'pour', sound: 'drip' },
      { label: 'stir + clink', dur: 7.0, prop: 1, action: 'stir', sound: 'click' },
      { label: 'cup set down', dur: 4.8, prop: 0, action: 'set', sound: 'click' },
    ],
  },
  {
    id: 'elevator',
    title: 'Elevator (Old Building)',
    effect: 'motor rumble + door creak + chime',
    palette: { a: '#9ad7ff', b: '#ffd66b' },
    props: [
      { name: 'door panel', type: 'board' },
      { name: 'pulley', type: 'hinge' },
      { name: 'cable bundle', type: 'sticks' },
    ],
    steps: [
      { label: 'motor hum', dur: 8.5, prop: 1, action: 'spin', sound: 'rumble' },
      { label: 'cable slide', dur: 7.5, prop: 2, action: 'slide', sound: 'whoosh' },
      { label: 'door creak', dur: 6.5, prop: 0, action: 'open', sound: 'creak' },
      { label: 'arrival chime', dur: 4.2, prop: 0, action: 'tap', sound: 'click' },
    ],
  },
  {
    id: 'typewriter',
    title: 'Typewriter',
    effect: 'key clacks + carriage return',
    palette: { a: '#e7eef6', b: '#ff5aa5' },
    props: [
      { name: 'keybed', type: 'board' },
      { name: 'platen', type: 'drum' },
      { name: 'carriage', type: 'hinge' },
    ],
    steps: [
      { label: 'test keys', dur: 6.2, prop: 0, action: 'tap', sound: 'click' },
      { label: 'rapid typing', dur: 10.5, prop: 0, action: 'type', sound: 'click' },
      { label: 'carriage return', dur: 6.0, prop: 2, action: 'sweep', sound: 'whoosh' },
      { label: 'end bell', dur: 4.8, prop: 1, action: 'ding', sound: 'click' },
    ],
  },
  {
    id: 'platform',
    title: 'Train Pass (Platform)',
    effect: 'distant rumble → rush → doors',
    palette: { a: '#63ffb6', b: '#9b7bff' },
    props: [
      { name: 'rail bundle', type: 'sticks' },
      { name: 'tunnel fan', type: 'drum' },
      { name: 'door latch', type: 'hinge' },
    ],
    steps: [
      { label: 'distant rumble', dur: 8.0, prop: 1, action: 'hum', sound: 'rumble' },
      { label: 'approach rush', dur: 7.2, prop: 0, action: 'rush', sound: 'whoosh' },
      { label: 'doors open', dur: 6.4, prop: 2, action: 'open', sound: 'creak' },
      { label: 'platform chime', dur: 4.6, prop: 2, action: 'tap', sound: 'click' },
    ],
  },
  {
    id: 'balloon',
    title: 'Balloon (Squeak + Pop)',
    effect: 'rubber stretch → squeak → pop',
    palette: { a: '#ffd66b', b: '#6cf2ff' },
    props: [
      { name: 'balloon neck', type: 'wedge' },
      { name: 'fingertips', type: 'stick' },
      { name: 'pin', type: 'stick' },
    ],
    steps: [
      { label: 'stretch', dur: 8.2, prop: 0, action: 'pull', sound: 'creak' },
      { label: 'squeak', dur: 8.0, prop: 1, action: 'rub', sound: 'click' },
      { label: 'overstretch', dur: 6.2, prop: 0, action: 'pullhard', sound: 'creak' },
      { label: 'POP', dur: 4.0, prop: 2, action: 'poke', sound: 'pop' },
    ],
  },
  {
    id: 'drawer',
    title: 'Kitchen Drawer',
    effect: 'slide + utensil clink + thunk',
    palette: { a: '#ff7a59', b: '#9ad7ff' },
    props: [
      { name: 'drawer tray', type: 'tray' },
      { name: 'utensils', type: 'sticks' },
      { name: 'handle', type: 'hinge' },
    ],
    steps: [
      { label: 'drawer pull', dur: 7.0, prop: 2, action: 'pull', sound: 'whoosh' },
      { label: 'utensil jostle', dur: 8.5, prop: 1, action: 'rattle', sound: 'click' },
      { label: 'drawer push', dur: 6.6, prop: 2, action: 'push', sound: 'whoosh' },
      { label: 'thunk', dur: 4.8, prop: 0, action: 'stop', sound: 'click' },
    ],
  },
];

export function createChannel({ seed, audio }){
  // Split RNG streams so audio.enabled toggles don’t affect recipe/visual determinism.
  const randV = mulberry32(seed);
  const randA = mulberry32(seed ^ 0x9E3779B9);

  let w = 0, h = 0, t = 0;
  let font = 16;
  let small = 12;

  let recipe = null;

  // seeded shuffle-bag to avoid back-to-back repeats
  let recipeBag = [];
  let recipeBagPos = 0;
  let lastRecipeId = null;

  let stepIndex = 0;
  let stepT = 0;
  let sfxAcc = 0;

  let ambience = null;

  function curStep(){
    return recipe?.steps?.[stepIndex] || null;
  }

  function refillRecipeBag(){
    recipeBag = RECIPES.map((_, i) => i);

    // Fisher-Yates shuffle using our seeded visual RNG stream.
    for (let i = recipeBag.length - 1; i > 0; i--){
      const j = (randV() * (i + 1)) | 0;
      const tmp = recipeBag[i]; recipeBag[i] = recipeBag[j]; recipeBag[j] = tmp;
    }

    recipeBagPos = 0;

    // Avoid an immediate repeat across bag boundaries.
    if (lastRecipeId && recipeBag.length > 1 && RECIPES[recipeBag[0]].id === lastRecipeId){
      const k = 1 + ((randV() * (recipeBag.length - 1)) | 0);
      const tmp = recipeBag[0]; recipeBag[0] = recipeBag[k]; recipeBag[k] = tmp;
    }
  }

  function nextRecipe(){
    if (!recipeBag.length || recipeBagPos >= recipeBag.length) refillRecipeBag();

    recipe = RECIPES[recipeBag[recipeBagPos++]];
    lastRecipeId = recipe?.id ?? lastRecipeId;

    stepIndex = 0;
    stepT = 0;
    sfxAcc = 0;
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));
    nextRecipe();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // idempotent: stop any existing handles we own first
    onAudioOff();

    const n = audio.noiseSource({ type: 'pink', gain: 0.006 });
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

  function destroy(){ onAudioOff(); }

  function transitionBlip(){
    if (!audio.enabled) return;
    audio.beep({ freq: 480 + randA() * 220, dur: 0.03, gain: 0.012, type: 'triangle' });
  }

  function sfx(kind, intensity=0.55){
    if (!audio.enabled) return;
    const x = clamp(intensity, 0, 1);

    if (kind === 'rain'){
      audio.beep({ freq: 2400 + randA() * 900, dur: 0.006, gain: 0.002 + x * 0.004, type: 'triangle' });
    } else if (kind === 'drip'){
      audio.beep({ freq: 1200 + randA() * 500, dur: 0.014, gain: 0.006 + x * 0.01, type: 'sine' });
    } else if (kind === 'snow'){
      audio.beep({ freq: 700 + randA() * 420, dur: 0.01, gain: 0.004 + x * 0.006, type: 'square' });
    } else if (kind === 'steps'){
      audio.beep({ freq: 140 + randA() * 80, dur: 0.02, gain: 0.01 + x * 0.018, type: 'triangle' });
      if (randA() < 0.35) audio.beep({ freq: 520 + randA() * 160, dur: 0.008, gain: 0.004 + x * 0.007, type: 'square' });
    } else if (kind === 'scuff'){
      audio.beep({ freq: 260 + randA() * 120, dur: 0.03, gain: 0.008 + x * 0.012, type: 'triangle' });
    } else if (kind === 'creak'){
      audio.beep({ freq: 240 + randA() * 120, dur: 0.045, gain: 0.006 + x * 0.01, type: 'sawtooth' });
    } else if (kind === 'whoosh'){
      audio.beep({ freq: 880 + randA() * 220, dur: 0.02, gain: 0.004 + x * 0.008, type: 'triangle' });
    } else if (kind === 'click'){
      audio.beep({ freq: 1900 + randA() * 700, dur: 0.012, gain: 0.008 + x * 0.012, type: 'square' });
    } else if (kind === 'rumble'){
      audio.beep({ freq: 80 + randA() * 40, dur: 0.05, gain: 0.01 + x * 0.016, type: 'sine' });
    } else if (kind === 'thunder'){
      audio.beep({ freq: 120 + randA() * 60, dur: 0.06, gain: 0.012 + x * 0.02, type: 'triangle' });
    } else if (kind === 'crack'){
      audio.beep({ freq: 1200 + randA() * 800, dur: 0.01, gain: 0.02 + x * 0.03, type: 'square' });
    } else if (kind === 'crackle'){
      audio.beep({ freq: 1700 + randA() * 1600, dur: 0.006, gain: 0.002 + x * 0.006, type: 'triangle' });
    } else if (kind === 'pop'){
      audio.beep({ freq: 2600 + randA() * 1200, dur: 0.008, gain: 0.02 + x * 0.03, type: 'square' });
    }
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
    const p = clamp(stepT / step.dur, 0, 1);

    // drive sounds with a density curve so it breathes
    if (audio.enabled && step.sound){
      let rate = 0;
      if (step.sound === 'rain') rate = 45;
      else if (step.sound === 'drip') rate = 7;
      else if (step.sound === 'snow') rate = 14;
      else if (step.sound === 'steps') rate = (step.action === 'stepfast') ? 6.5 : 4.2;
      else if (step.sound === 'scuff') rate = 2.2;
      else if (step.sound === 'creak') rate = 2.1;
      else if (step.sound === 'whoosh') rate = 3.5;
      else if (step.sound === 'click') rate = 1.2;
      else if (step.sound === 'rumble') rate = 1.6;
      else if (step.sound === 'thunder') rate = 1.1;
      else if (step.sound === 'crack') rate = 0.55;
      else if (step.sound === 'crackle') rate = 26;
      else if (step.sound === 'pop') rate = 0.9;

      const density = Math.sin(p * Math.PI);
      sfxAcc += dt * rate * (0.22 + density * 1.05);
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
      transitionBlip();
      if (stepIndex >= recipe.steps.length){
        nextRecipe();
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

  // Static render caches (rebuilt on resize / ctx swap).
  let staticW = 0, staticH = 0;
  let staticRenderCtx = null;
  let panelLayer = null;
  let stageLayer = null;

  function makeLayer(width, height){
    if (typeof OffscreenCanvas !== 'undefined'){
      const canvas = new OffscreenCanvas(width, height);
      return { canvas, ctx: canvas.getContext('2d') };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, ctx: canvas.getContext('2d') };
  }

  function resizeLayer(layer, width, height){
    if (!layer) return makeLayer(width, height);
    if (layer.canvas.width !== width) layer.canvas.width = width;
    if (layer.canvas.height !== height) layer.canvas.height = height;
    return layer;
  }

  function rebuildPanelLayer(){
    panelLayer = resizeLayer(panelLayer, w, h);
    const ctx = panelLayer.ctx;
    ctx.clearRect(0, 0, w, h);

    // background gradient (cached: rendered once into layer)
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#070913');
    bg.addColorStop(0.55, '#05060c');
    bg.addColorStop(1, '#03040a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // subtle acoustic-panel grid (cached tile/pattern; avoids per-cell allocs in render)
    const s = Math.max(22, Math.floor(Math.min(w, h) / 18));
    const tile = makeLayer(s * 2, s * 2);
    const tctx = tile.ctx;
    tctx.clearRect(0, 0, s * 2, s * 2);

    const c0 = 'rgba(108,242,255,0.08)';
    const c1 = 'rgba(108,242,255,0.14)';

    tctx.fillStyle = c0;
    tctx.fillRect(2, 2, s - 4, s - 4);
    tctx.fillRect(s + 2, s + 2, s - 4, s - 4);

    tctx.fillStyle = c1;
    tctx.fillRect(s + 2, 2, s - 4, s - 4);
    tctx.fillRect(2, s + 2, s - 4, s - 4);

    const pat = ctx.createPattern(tile.canvas, 'repeat');
    if (pat){
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } else {
      // fallback: still avoid template-string allocs
      ctx.save();
      ctx.globalAlpha = 0.25;
      for (let y = 0; y < h; y += s){
        for (let x = 0; x < w; x += s){
          ctx.fillStyle = ((x + y) % (s * 2)) ? c1 : c0;
          ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
        }
      }
      ctx.restore();
    }

    // vignette (cached: rendered once into layer)
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.2, w * 0.5, h * 0.45, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function rebuildStageLayer(){
    stageLayer = resizeLayer(stageLayer, w, h);
    const ctx = stageLayer.ctx;
    ctx.clearRect(0, 0, w, h);

    const top = Math.floor(h * 0.64);

    // tabletop gradient (cached: rendered once into layer)
    ctx.save();
    const wood = ctx.createLinearGradient(0, top, 0, h);
    wood.addColorStop(0, 'rgba(24,18,16,0.92)');
    wood.addColorStop(1, 'rgba(8,6,6,1)');
    ctx.fillStyle = wood;
    ctx.fillRect(0, top, w, h - top);

    // table edge highlight
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, top, w, 2);
    ctx.restore();

    // mic silhouette
    const mx = Math.floor(w * 0.5);
    const my = Math.floor(h * 0.60);
    const mh = Math.floor(h * 0.22);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, mx - Math.floor(font * 1.05), my - Math.floor(mh * 0.62), Math.floor(font * 2.1), Math.floor(mh * 0.48), Math.floor(font * 0.7));
    ctx.fill();
    roundRect(ctx, mx - Math.floor(font * 0.55), my - Math.floor(mh * 0.16), Math.floor(font * 1.1), Math.floor(mh * 0.42), Math.floor(font * 0.6));
    ctx.fill();
    ctx.fillRect(mx - 2, my + Math.floor(mh * 0.26), 4, Math.floor(mh * 0.22));
    ctx.beginPath();
    ctx.arc(mx, my + Math.floor(mh * 0.52), Math.floor(font * 0.95), 0, Math.PI * 2);
    ctx.fill();

    // tiny glowing LED
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(255,90,165,0.8)';
    ctx.beginPath();
    ctx.arc(mx + Math.floor(font * 0.65), my - Math.floor(mh * 0.25), Math.max(2, Math.floor(font * 0.12)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function ensureStaticLayers(renderCtx){
    if (!panelLayer || !stageLayer || staticW !== w || staticH !== h || staticRenderCtx !== renderCtx){
      staticW = w;
      staticH = h;
      staticRenderCtx = renderCtx;
      rebuildPanelLayer();
      rebuildStageLayer();
    }
  }

  function drawPanelBG(ctx){
    ensureStaticLayers(ctx);
    ctx.drawImage(panelLayer.canvas, 0, 0);
  }

  function drawStage(ctx){
    ensureStaticLayers(ctx);
    ctx.drawImage(stageLayer.canvas, 0, 0);
  }

  function propColor(i){
    const a = recipe?.palette?.a || '#6cf2ff';
    const b = recipe?.palette?.b || '#ff5aa5';
    return i % 2 === 0 ? a : b;
  }

  function drawProp(ctx, x, y, s, kind, active, color){
    ctx.save();
    const glow = active ? 0.85 : 0.35;
    ctx.globalAlpha = 1;

    // glow ring
    if (active){
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.lineWidth = Math.max(2, Math.floor(font * 0.12));
    ctx.strokeStyle = `rgba(231,238,246,${0.35 + glow * 0.3})`;
    ctx.fillStyle = `rgba(0,0,0,${0.25 + glow * 0.25})`;

    // basic silhouettes by type
    if (kind === 'jar'){
      roundRect(ctx, x - s * 0.28, y - s * 0.34, s * 0.56, s * 0.68, s * 0.14);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = `rgba(108,242,255,${0.08 + glow * 0.06})`;
      ctx.fillRect(x - s * 0.22, y - s * 0.12, s * 0.44, s * 0.18);
    } else if (kind === 'tray'){
      roundRect(ctx, x - s * 0.42, y - s * 0.18, s * 0.84, s * 0.36, s * 0.12);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + glow * 0.16})`;
      for (let i=0;i<5;i++){
        ctx.beginPath();
        ctx.moveTo(x - s * 0.34 + i * s * 0.17, y - s * 0.12);
        ctx.lineTo(x - s * 0.26 + i * s * 0.17, y + s * 0.12);
        ctx.stroke();
      }
    } else if (kind === 'glass'){
      roundRect(ctx, x - s * 0.34, y - s * 0.24, s * 0.68, s * 0.48, s * 0.1);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = `rgba(108,242,255,${0.06 + glow * 0.06})`;
      ctx.fillRect(x - s * 0.28, y - s * 0.18, s * 0.56, s * 0.08);
    } else if (kind === 'bag'){
      ctx.beginPath();
      ctx.moveTo(x - s * 0.34, y + s * 0.24);
      ctx.lineTo(x - s * 0.28, y - s * 0.28);
      ctx.lineTo(x + s * 0.28, y - s * 0.28);
      ctx.lineTo(x + s * 0.34, y + s * 0.24);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + glow * 0.12})`;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.22, y - s * 0.06);
      ctx.lineTo(x + s * 0.22, y - s * 0.06);
      ctx.stroke();
    } else if (kind === 'shoe'){
      roundRect(ctx, x - s * 0.42, y - s * 0.12, s * 0.84, s * 0.3, s * 0.12);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + s * 0.26, y - s * 0.02, s * 0.18, -0.2, Math.PI + 0.2);
      ctx.stroke();
    } else if (kind === 'mat'){
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = `rgba(231,238,246,${0.08 + glow * 0.06})`;
      ctx.fillRect(x - s * 0.46, y - s * 0.26, s * 0.92, s * 0.52);
      ctx.strokeRect(x - s * 0.46, y - s * 0.26, s * 0.92, s * 0.52);
    } else if (kind === 'hinge'){
      roundRect(ctx, x - s * 0.18, y - s * 0.36, s * 0.36, s * 0.72, s * 0.14);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.32);
      ctx.lineTo(x, y + s * 0.32);
      ctx.stroke();
    } else if (kind === 'board'){
      roundRect(ctx, x - s * 0.44, y - s * 0.2, s * 0.88, s * 0.4, s * 0.1);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.06 + glow * 0.1})`;
      for (let i=0;i<4;i++){
        ctx.beginPath();
        ctx.moveTo(x - s * 0.36 + i * s * 0.24, y - s * 0.18);
        ctx.lineTo(x - s * 0.3 + i * s * 0.24, y + s * 0.18);
        ctx.stroke();
      }
    } else if (kind === 'wedge'){
      ctx.beginPath();
      ctx.moveTo(x - s * 0.35, y + s * 0.22);
      ctx.lineTo(x + s * 0.35, y + s * 0.22);
      ctx.lineTo(x + s * 0.15, y - s * 0.22);
      ctx.lineTo(x - s * 0.35, y - s * 0.22);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (kind === 'sheet'){
      roundRect(ctx, x - s * 0.4, y - s * 0.28, s * 0.8, s * 0.56, s * 0.08);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + glow * 0.12})`;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.34, y);
      ctx.lineTo(x + s * 0.34, y);
      ctx.stroke();
    } else if (kind === 'drum'){
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.42, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.18, s * 0.36, s * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === 'stick'){
      ctx.lineWidth = Math.max(3, Math.floor(font * 0.16));
      ctx.strokeStyle = `rgba(231,238,246,${0.35 + glow * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.32, y + s * 0.28);
      ctx.lineTo(x + s * 0.32, y - s * 0.28);
      ctx.stroke();
    } else if (kind === 'cone'){
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.34);
      ctx.lineTo(x + s * 0.3, y + s * 0.3);
      ctx.lineTo(x - s * 0.3, y + s * 0.3);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (kind === 'sticks'){
      ctx.lineWidth = Math.max(3, Math.floor(font * 0.14));
      ctx.strokeStyle = `rgba(231,238,246,${0.35 + glow * 0.3})`;
      for (let i=0;i<3;i++){
        ctx.beginPath();
        ctx.moveTo(x - s * 0.28 + i * s * 0.18, y + s * 0.28);
        ctx.lineTo(x + s * 0.06 + i * s * 0.12, y - s * 0.28);
        ctx.stroke();
      }
    } else {
      // default box
      roundRect(ctx, x - s * 0.34, y - s * 0.28, s * 0.68, s * 0.56, s * 0.12);
      ctx.fill(); ctx.stroke();
    }

    ctx.restore();
  }

  function drawHUD(ctx){
    const step = curStep();
    const p = step ? clamp(stepT / step.dur, 0, 1) : 0;

    // header
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, Math.floor(h * 0.12));
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `700 ${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('STUDIO FOLEY LAB', Math.floor(w * 0.05), Math.floor(h * 0.06));

    ctx.font = `600 ${Math.floor(font * 0.9)}px ui-sans-serif, system-ui`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(recipe?.title || '—', Math.floor(w * 0.05), Math.floor(h * 0.095));
    ctx.restore();

    // left card: props
    const cardW = Math.floor(w * 0.30);
    const cardH = Math.floor(h * 0.28);
    const cx = Math.floor(w * 0.05);
    const cy = Math.floor(h * 0.16);

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    roundRect(ctx, cx, cy, cardW, cardH, Math.floor(font * 0.7));
    ctx.fill();

    ctx.fillStyle = 'rgba(108,242,255,0.9)';
    ctx.font = `700 ${Math.floor(font * 0.78)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('PROPS', cx + Math.floor(font * 0.75), cy + Math.floor(font * 0.55));

    ctx.fillStyle = 'rgba(231,238,246,0.82)';
    ctx.font = `${Math.floor(font * 0.75)}px ui-sans-serif, system-ui`;
    const list = recipe?.props || [];
    let yy = cy + Math.floor(font * 1.7);
    for (let i=0;i<list.length;i++){
      const a = (step && step.prop === i) ? 0.95 : 0.65;
      ctx.globalAlpha = a;
      ctx.fillText(`• ${list[i].name}`, cx + Math.floor(font * 0.75), yy);
      yy += Math.floor(font * 0.95);
    }

    ctx.globalAlpha = 0.75;
    const eff = recipe?.effect || '';
    ctx.fillStyle = 'rgba(255,90,165,0.85)';
    ctx.font = `${Math.floor(small)}px ui-sans-serif, system-ui`;
    ctx.fillText(eff, cx + Math.floor(font * 0.75), cy + cardH - Math.floor(font * 1.1));

    ctx.restore();

    // right card: procedure
    const rx = Math.floor(w * 0.65);
    const rw = Math.floor(w * 0.30);
    const ry = cy;
    const rh = Math.floor(h * 0.34);

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    roundRect(ctx, rx, ry, rw, rh, Math.floor(font * 0.7));
    ctx.fill();

    ctx.fillStyle = 'rgba(255,214,107,0.92)';
    ctx.font = `700 ${Math.floor(font * 0.78)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('PROCEDURE', rx + Math.floor(font * 0.75), ry + Math.floor(font * 0.55));

    ctx.font = `${Math.floor(font * 0.74)}px ui-sans-serif, system-ui`;
    const steps = recipe?.steps || [];
    yy = ry + Math.floor(font * 1.7);
    for (let i=0;i<steps.length;i++){
      const active = i === stepIndex;
      ctx.globalAlpha = active ? 0.98 : 0.55;
      const prefix = active ? '▶' : '•';
      ctx.fillStyle = active ? 'rgba(231,238,246,0.92)' : 'rgba(231,238,246,0.75)';
      ctx.fillText(`${prefix} ${steps[i].label}`, rx + Math.floor(font * 0.75), yy);
      if (active){
        // progress bar
        const px = rx + Math.floor(font * 0.75);
        const py = yy + Math.floor(font * 0.9);
        const pw = rw - Math.floor(font * 1.5);
        const ph = Math.max(6, Math.floor(font * 0.22));
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = 'rgba(231,238,246,0.18)';
        roundRect(ctx, px, py, pw, ph, ph);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = recipe?.palette?.a || 'rgba(108,242,255,0.9)';
        roundRect(ctx, px, py, pw * p, ph, ph);
        ctx.fill();
      }
      yy += Math.floor(font * 1.28);
    }

    ctx.restore();

    // footer hint
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, Math.floor(h * 0.92), w, Math.floor(h * 0.08));
    ctx.fillStyle = 'rgba(231,238,246,0.75)';
    ctx.font = `${Math.floor(h / 36)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('close-up props • step-by-step sound recipes • toggle audio with A', Math.floor(w * 0.05), Math.floor(h * 0.96));
    ctx.restore();
  }

  function drawActionLines(ctx, x, y, phase, color){
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, Math.floor(font * 0.1));
    const n = 5;
    for (let i=0;i<n;i++){
      const a = (i / n) * Math.PI * 2 + phase;
      const r = (0.18 + i * 0.08) * font;
      ctx.beginPath();
      ctx.arc(x, y, r + Math.sin(phase * 1.8 + i) * 2, a, a + Math.PI * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }

  function render(ctx){
    drawPanelBG(ctx);
    drawStage(ctx);

    // props around the mic
    const top = Math.floor(h * 0.64);
    const cx = Math.floor(w * 0.5);
    const cy = Math.floor(top + (h - top) * 0.45);
    const ring = Math.floor(Math.min(w, h) * 0.18);
    const s = Math.max(44, Math.floor(Math.min(w, h) * 0.11));

    const list = recipe?.props || [];
    const step = curStep();

    for (let i=0;i<list.length;i++){
      const a = (i / Math.max(1, list.length)) * Math.PI * 2 - Math.PI * 0.5;
      const x = cx + Math.cos(a) * ring;
      const y = cy + Math.sin(a) * ring * 0.62;
      const active = step && step.prop === i;
      const col = propColor(i);
      drawProp(ctx, x, y, s, list[i].type, active, col);
      if (active){
        drawActionLines(ctx, x, y, t * 2.1, col);
      }

      // label
      ctx.save();
      ctx.globalAlpha = active ? 0.9 : 0.55;
      ctx.fillStyle = 'rgba(231,238,246,0.85)';
      ctx.font = `${Math.floor(small)}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(list[i].name, x, y + s * 0.52);
      ctx.restore();
    }

    drawHUD(ctx);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
