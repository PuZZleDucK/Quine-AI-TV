// REVIEWED: 2026-02-09
import { mulberry32, clamp } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const randSim = mulberry32(seed);
  // Use a separate RNG stream for any precomputed/static visuals so render()
  // doesn't consume simulation randomness (keeps behavior stable across FPS / capture timing).
  const staticSeed = (seed ^ 0x9e3779b9) >>> 0;
  let w=0,h=0,t=0;
  let fish=[], bubbles=[];
  let sand = [];
  let seaweed = [];
  let coral = [];
  let noiseHandle=null;

  // Special moments (rare): bioluminescent plankton bloom or passing silhouette.
  const randEvents = mulberry32((seed ^ 0x27d4eb2d) >>> 0);
  let specialEvent = null;
  let nextEventAt = 0;

  function eventFade01(u){
    u = clamp(u, 0, 1);
    return Math.sin(Math.PI * u);
  }

  function spawnSpecialEvent(now){
    if (w <= 0 || h <= 0) return;

    const kind = randEvents() < 0.62 ? 'bloom' : 'silhouette';
    if (kind === 'bloom'){
      const dur = 10 + randEvents()*10;
      const hue = (165 + randEvents()*90) % 360;
      const count = 48 + ((randEvents()*28) | 0);
      const parts = [];
      const sizeMul = (h/540);
      for (let i = 0; i < count; i++){
        const x = randEvents()*w;
        const y = h*(0.25 + randEvents()*0.60);
        const sp = (10 + randEvents()*32) * sizeMul;
        const r = (0.7 + randEvents()*1.9) * sizeMul;
        const ph = randEvents()*Math.PI*2;
        const drift = (6 + randEvents()*26) * sizeMul;
        const hh = (hue + (randEvents()*24 - 12) + 360) % 360;
        const light = 62 + randEvents()*18;
        parts.push({ x, y, sp, r, ph, drift, color: `hsla(${hh}, 95%, ${light}%, 0.9)` });
      }
      specialEvent = { kind, t0: now, dur, hue, parts };
      return;
    }

    // Silhouette pass: a big gentle shape drifting through the tank.
    const dur = 8 + randEvents()*7;
    const size = h*(0.10 + randEvents()*0.16);
    const y = h*(0.22 + randEvents()*0.46);
    const dir = randEvents() < 0.5 ? 1 : -1;
    const x0 = dir > 0 ? (-size*2) : (w + size*2);
    const x1 = dir > 0 ? (w + size*2) : (-size*2);
    const wob = 0.6 + randEvents()*1.2;
    specialEvent = { kind, t0: now, dur, x0, x1, y, size, wob };
  }

  function drawSpecialMoments(ctx){
    const e = specialEvent;
    if (!e) return;

    const tt = t - e.t0;
    const u = tt / Math.max(0.001, e.dur);
    const fade = eventFade01(u);
    if (fade <= 0) return;

    if (e.kind === 'bloom'){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.16 * fade;
      ctx.shadowColor = `hsla(${e.hue}, 90%, 70%, 0.9)`;
      ctx.shadowBlur = 14 * fade;
      for (const p of e.parts){
        const yy = p.y - tt * p.sp;
        if (yy < -40) continue;
        const xx = p.x + Math.sin(tt*0.7 + p.ph) * p.drift;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(xx, yy, p.r, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    // silhouette
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.22 * fade;

    const x = e.x0 + (e.x1 - e.x0) * clamp(u, 0, 1);
    const y = e.y + Math.sin(tt*e.wob) * e.size*0.05;
    const s = e.size;

    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    // bell
    ctx.beginPath();
    ctx.ellipse(x, y, s*0.56, s*0.42, 0, Math.PI, Math.PI*2);
    ctx.lineTo(x + s*0.56, y);
    ctx.ellipse(x, y, s*0.56, s*0.42, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();

    // tentacles
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = Math.max(1, s*0.02);
    for (let i = 0; i < 6; i++){
      const k = (i - 2.5) / 2.5;
      const tx = x + k * s*0.34;
      const len = s*(0.95 + 0.25*Math.sin(e.t0*0.001 + i*1.7));
      ctx.beginPath();
      ctx.moveTo(tx, y + s*0.04);
      ctx.quadraticCurveTo(
        tx + Math.sin(tt*1.2 + i) * s*0.08,
        y + len*0.55,
        tx + Math.sin(tt*1.6 + i*0.7) * s*0.12,
        y + len
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  // Time-structure: calm → schooling → deep-glow (deterministic per seed).
  const randStruct = mulberry32((seed ^ 0x85ebca6b) >>> 0);
  const phasePlan = (() => {
    const cycleDur = 120 + randStruct()*120; // 2–4 minutes
    const calmDur = cycleDur * (0.38 + randStruct()*0.10);
    const schoolDur = cycleDur * (0.26 + randStruct()*0.14);
    const deepDur = Math.max(10, cycleDur - calmDur - schoolDur);
    const fade = 6 + randStruct()*8; // seconds of crossfade at boundaries
    return { cycleDur, calmDur, schoolDur, deepDur, fade };
  })();

  const schoolPlan = {
    dir: randStruct() < 0.5 ? 1 : -1,
    yNorm: 0.30 + randStruct()*0.40,
    bandNorm: 0.05 + randStruct()*0.06,
    fishSpeed: 1.35 + randStruct()*0.35,
    bubbleSpeed: 1.10 + randStruct()*0.18,
  };
  const deepPlan = {
    fishSpeed: 0.78 + randStruct()*0.12,
    bubbleSpeed: 0.88 + randStruct()*0.10,
    caustics: 0.75 + randStruct()*0.20,
    glowHue: 175 + randStruct()*40,
    glowStrength: 0.08 + randStruct()*0.10,
  };

  let schoolY = 0;
  let schoolBand = 0;

  function smooth01(x){ x = clamp(x, 0, 1); return x*x*(3 - 2*x); }

  function getPhaseState(tt){
    const { cycleDur, calmDur, schoolDur, deepDur, fade } = phasePlan;
    const x = ((tt % cycleDur) + cycleDur) % cycleDur;

    const segs = [
      { name: 'calm', dur: calmDur },
      { name: 'schooling', dur: schoolDur },
      { name: 'deep', dur: deepDur },
    ];

    let acc = 0;
    let idx = 0;
    for (let i = 0; i < segs.length; i++){
      const end = acc + segs[i].dur;
      if (x < end){ idx = i; break; }
      acc = end;
    }

    const cur = segs[idx];
    const next = segs[(idx + 1) % segs.length];
    const segEnd = acc + cur.dur;

    const out = segEnd - x;
    let mix = 0;
    if (out < fade){
      mix = smooth01(1 - out / Math.max(0.001, fade));
    }

    return { name: cur.name, next: next.name, mix };
  }

  function phaseWeight(state, name){
    if (state.name === name) return 1 - state.mix;
    if (state.next === name) return state.mix;
    return 0;
  }

  // Gradient/sprite caches to avoid hot-path allocations in render().
  const gradCache = {
    ctx: null,
    w: 0,
    h: 0,
    water: null,
    vignette: null,
    deepGlow: null,
    bubbleSprites: new Map(),
  };

  function resetGradCache(){
    gradCache.ctx = null;
    gradCache.w = 0;
    gradCache.h = 0;
    gradCache.water = null;
    gradCache.vignette = null;
    gradCache.deepGlow = null;
    gradCache.bubbleSprites.clear();
  }

  function ensureGradCache(ctx){
    if (gradCache.ctx !== ctx || gradCache.w !== w || gradCache.h !== h){
      gradCache.ctx = ctx;
      gradCache.w = w;
      gradCache.h = h;
      gradCache.water = null;
      gradCache.vignette = null;
      gradCache.deepGlow = null;
      // Bubble sprites don't depend on dimensions, but clearing here keeps the cache logic simple.
      gradCache.bubbleSprites.clear();
    }
  }

  function getWaterGradient(ctx){
    ensureGradCache(ctx);
    if (!gradCache.water){
      const g = ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'#041525');
      g.addColorStop(0.5,'#032a33');
      g.addColorStop(1,'#021015');
      gradCache.water = g;
    }
    return gradCache.water;
  }

  function getVignetteGradient(ctx){
    ensureGradCache(ctx);
    if (!gradCache.vignette){
      const vg = ctx.createRadialGradient(w/2,h/2, Math.min(w,h)*0.2, w/2,h/2, Math.max(w,h)*0.65);
      vg.addColorStop(0,'rgba(0,0,0,0)');
      vg.addColorStop(1,'rgba(0,0,0,0.55)');
      gradCache.vignette = vg;
    }
    return gradCache.vignette;
  }

  function getDeepGlowGradient(ctx){
    ensureGradCache(ctx);
    if (!gradCache.deepGlow){
      const gx = w*0.5;
      const gy = h*0.62;
      const r0 = Math.min(w,h)*0.08;
      const r1 = Math.max(w,h)*0.75;
      const gg = ctx.createRadialGradient(gx, gy, r0, gx, gy, r1);
      gg.addColorStop(0, `hsla(${deepPlan.glowHue}, 90%, 60%, 0.75)`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      gradCache.deepGlow = gg;
    }
    return gradCache.deepGlow;
  }

  function getBubbleSprite(r){
    // Bucket radius to reduce unique sprites without noticeably changing the look.
    const key = Math.max(1, Math.round(r * 2) / 2);
    let spr = gradCache.bubbleSprites.get(key);
    if (spr) return spr;

    const pad = 2;
    const size = Math.ceil(key*2 + pad*2);
    const c = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(size, size)
      : document.createElement('canvas');
    c.width = size;
    c.height = size;
    const cctx = c.getContext('2d');
    const cx = size/2;
    const cy = size/2;

    const gg = cctx.createRadialGradient(cx, cy, 1, cx, cy, key);
    gg.addColorStop(0, 'rgba(255,255,255,1)');
    gg.addColorStop(0.6, 'rgba(190,255,255,0.45)');
    gg.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = gg;
    cctx.beginPath();
    cctx.arc(cx, cy, key, 0, Math.PI*2);
    cctx.fill();

    spr = { canvas: c, size, half: size/2 };
    gradCache.bubbleSprites.set(key, spr);
    return spr;
  }

  function init({width,height}){
    w=width; h=height; t=0;
    resetGradCache();
    schoolY = h * schoolPlan.yNorm;
    schoolBand = h * schoolPlan.bandNorm;
    // Spawn some fish on-screen so screenshots are less empty right after tuning.
    fish = Array.from({length: 10}, (_,i)=>makeFish(i, i < 6));
    bubbles = Array.from({length: 90}, ()=>makeBubble(true));
    sand = makeSand();
    seaweed = makeSeaweed();
    coral = makeCoral();

    // Occasional special moments (deterministic per seed).
    specialEvent = null;
    nextEventAt = 25 + randEvents()*75;
  }

  function pickFishKind(){
    // Weighted rarity. Keep rare fish uncommon enough to feel special.
    // common: 85%, uncommon: 13%, rare: 2%
    const r = randSim();
    if (r < 0.02) return 'rare';
    if (r < 0.15) return 'uncommon';
    return 'common';
  }

  function makeFish(i, spawnOnscreen=false){
    const dir = randSim() < 0.5 ? 1 : -1;
    const kind = pickFishKind();
    const sizeBase = (h/540);
    const kindSize =
      kind === 'rare' ? (24 + randSim()*46) * sizeBase :
      kind === 'uncommon' ? (16 + randSim()*40) * sizeBase :
      (12 + randSim()*36) * sizeBase;

    // Color: keep common fish in the teal->violet family, but let rare fish
    // drift toward brighter cyan/pink.
    const hue =
      kind === 'rare' ? (185 + randSim()*150) :
      (170 + randSim()*120);

    const amp = (12+randSim()*40) * (h/540);
    const ph = randSim()*Math.PI*2;
    // Keep a stable baseline for vertical motion so fish don't slowly “walk” into clamps.
    const baseYRaw = h*(0.18 + randSim()*0.72);
    const baseYMin = h*0.12 + amp;
    const baseYMax = h*0.88 - amp;
    const baseY = baseYMin < baseYMax ? clamp(baseYRaw, baseYMin, baseYMax) : h*0.5;

    return {
      x: spawnOnscreen ? (randSim()*w) : (dir>0 ? -randSim()*w*0.6 : w + randSim()*w*0.6),
      y: baseY + Math.sin(ph) * amp,
      baseY,
      dir,
      sp: (0.25+randSim()*0.9) * (w/800),
      amp,
      ph,
      hue,
      size: kindSize,
      kind,
      // Per-fish style variation (patterns/fins) without needing more RNG during render.
      variant: randSim(),
    };
  }

  function makeBubble(reset=false){
    return {
      x: randSim()*w,
      y: reset ? h + randSim()*h : randSim()*h,
      r: (1.5+randSim()*6) * (h/540),
      sp: (14+randSim()*60) * (h/540),
      drift: (randSim()*2-1) * 0.6,
      wob: randSim()*10,
      a: 0.08 + randSim()*0.25,
    };
  }

  function makeSand(){
    const randStatic = mulberry32(staticSeed);
    const top = h*0.86;
    const height = h*0.14;
    // Precompute specks (position + style) so they don't flicker.
    return Array.from({length: 420}, () => {
      const x = (randStatic()*w)|0;
      const y = (top + randStatic()*height)|0;
      const a = 0.08 + randStatic()*0.2;
      return { x, y, style: `rgba(210,200,160,${a})` };
    });
  }

  function makeSeaweed(){
    const randStatic = mulberry32((staticSeed ^ 0x2c1b3c6d) >>> 0);
    const top = h*0.86;
    // Two layers: lots of thin background strands + fewer thicker foreground stalks.
    const count = 30 + ((randStatic() * 18) | 0);
    const items = [];
    for (let i = 0; i < count; i++){
      const x = randStatic()*w;
      const y = top + (randStatic()*h*0.12);
      // Bias toward the thin "classic" seaweed look.
      const layer = randStatic() < 0.84 ? 'back' : 'front';
      const len = layer === 'back'
        ? (h * (0.06 + randStatic()*0.16))
        : (h * (0.10 + randStatic()*0.22));
      const thick = layer === 'back'
        ? Math.max(1, h * (0.0018 + randStatic()*0.0014))
        : Math.max(1, h * (0.0026 + randStatic()*0.0022));
      const sway = layer === 'back'
        ? (0.9 + randStatic()*2.0)
        : (0.7 + randStatic()*1.4);
      const ph = randStatic()*Math.PI*2;
      const hue = layer === 'back'
        ? (150 + randStatic()*45) // green/teal family
        : (135 + randStatic()*70); // slightly broader range
      const a = layer === 'back'
        ? (0.08 + randStatic()*0.12)
        : (0.14 + randStatic()*0.16);
      items.push({ x, y, len, thick, sway, ph, hue, a, layer });
    }
    return items;
  }

  function makeCoral(){
    const randStatic = mulberry32((staticSeed ^ 0x7f4a7c15) >>> 0);
    const top = h*0.86;
    const count = 6 + ((randStatic() * 7) | 0);
    const items = [];

    function coralHue(){
      // Mix a few coral palettes so it doesn't read as stamped clones.
      const r = randStatic();
      if (r < 0.38) return 330 + randStatic()*50; // magenta/pink
      if (r < 0.70) return 12 + randStatic()*48;  // orange/red
      return 265 + randStatic()*60;               // violet
    }

    for (let i = 0; i < count; i++){
      const x = w * (0.12 + randStatic()*0.78);
      const y = top + (randStatic()*h*0.10);
      const r = h * (0.010 + randStatic()*0.018);
      const hue = coralHue();
      const light = 50 + randStatic()*18;
      const a = 0.18 + randStatic()*0.20;
      const ph = randStatic()*Math.PI*2;
      const kindRoll = randStatic();
      const kind =
        kindRoll < 0.45 ? 'boulder' :
        kindRoll < 0.72 ? 'tubes' :
        kindRoll < 0.90 ? 'fan' :
        'branch';

      if (kind === 'boulder'){
        const bumps = 4 + ((randStatic()*8) | 0);
        const spread = 1.5 + randStatic()*3.2;
        const ax = 0.85 + randStatic()*0.65;
        const ay = 0.75 + randStatic()*0.75;
        items.push({ kind, x, y, r, hue, light, a, bumps, spread, ax, ay, ph });
      } else if (kind === 'tubes'){
        const tubes = 4 + ((randStatic()*7) | 0);
        const height = r * (2.8 + randStatic()*5.0);
        const width = r * (0.9 + randStatic()*1.2);
        items.push({ kind, x, y, r, hue, light, a, tubes, height, width, ph });
      } else if (kind === 'fan'){
        const radius = r * (5.0 + randStatic()*8.0);
        const arc = (Math.PI * (0.55 + randStatic()*0.25));
        const spokes = 8 + ((randStatic()*14) | 0);
        items.push({ kind, x, y, r, hue, light, a, radius, arc, spokes, ph });
      } else {
        const branches = 3 + ((randStatic()*5) | 0);
        const height = r * (5.0 + randStatic()*9.0);
        items.push({ kind, x, y, r, hue, light, a, branches, height, ph });
      }
    }
    return items;
  }

  function onResize(width,height){
    w=width; h=height;
    resetGradCache();
    schoolY = h * schoolPlan.yNorm;
    schoolBand = h * schoolPlan.bandNorm;
    sand = makeSand();
    seaweed = makeSeaweed();
    coral = makeCoral();

    // Keep event visuals in-bounds after resize.
    specialEvent = null;
    nextEventAt = 18 + randEvents()*85;
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const hdl = audio.noiseSource({type:'pink', gain:0.03});
    hdl.start();
    noiseHandle = hdl;
    audio.setCurrent({ stop(){ hdl.stop(); } });
  }
  function onAudioOff(){ try{noiseHandle?.stop?.();}catch{} noiseHandle=null; }
  function destroy(){ onAudioOff(); }


  function update(dt){
    t += dt;

    const ph = getPhaseState(t);
    const calmW = phaseWeight(ph, 'calm');
    const schoolW = phaseWeight(ph, 'schooling');
    const deepW = phaseWeight(ph, 'deep');

    const bubbleMul = calmW*1 + schoolW*schoolPlan.bubbleSpeed + deepW*deepPlan.bubbleSpeed;
    const fishMul = calmW*1 + schoolW*schoolPlan.fishSpeed + deepW*deepPlan.fishSpeed;
    const ampMul = calmW*1 + schoolW*0.55 + deepW*1.05;

    // bubbles
    for (const b of bubbles){
      b.y -= b.sp * bubbleMul * dt;
      b.x += Math.sin(t*1.6 + b.wob) * b.drift;
      if (b.y < -20) Object.assign(b, makeBubble(true));
    }

    // fish
    for (let i=0;i<fish.length;i++){
      const f = fish[i];
      const dirEff = (1 - schoolW) * f.dir + schoolW * schoolPlan.dir;
      f.x += dirEff * (80*f.sp*fishMul) * dt;

      const baseY = f.baseY + Math.sin(t*0.8 + f.ph) * f.amp * ampMul;
      let yy = baseY;
      if (schoolW > 0){
        const bandY = schoolY + (f.variant*2 - 1) * schoolBand;
        const schoolYy = bandY + Math.sin(t*1.05 + f.ph) * f.amp * 0.40;
        yy = baseY*(1 - schoolW) + schoolYy*schoolW;
      }
      f.y = clamp(yy, h*0.12, h*0.88);

      if (f.x > w + 120 || f.x < -120) fish[i] = makeFish(i);
    }

    // special moments (rare)
    if (specialEvent && (t - specialEvent.t0) > specialEvent.dur){
      specialEvent = null;
    }
    if (!specialEvent && nextEventAt > 0 && t >= nextEventAt){
      spawnSpecialEvent(t);
      // Next event in ~45–140s so it stays occasional / non-distracting.
      nextEventAt = t + (45 + randEvents()*95);
    }
  }

  function render(ctx){
    const ph = getPhaseState(t);
    const calmW = phaseWeight(ph, 'calm');
    const schoolW = phaseWeight(ph, 'schooling');
    const deepW = phaseWeight(ph, 'deep');

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // water gradient
    ctx.fillStyle = getWaterGradient(ctx);
    ctx.fillRect(0,0,w,h);

    // deep-glow wash
    if (deepW > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = deepW * deepPlan.glowStrength;
      ctx.fillStyle = getDeepGlowGradient(ctx);
      ctx.fillRect(0,0,w,h);
      ctx.restore();
    }

    // caustics
    const causticsA = 0.12 * (calmW*1.25 + schoolW*1.0 + deepW*deepPlan.caustics);
    const causticsT = t * (calmW*1.0 + schoolW*1.25 + deepW*0.85);
    ctx.save();
    ctx.globalAlpha = causticsA;
    ctx.fillStyle = 'rgba(120,255,230,0.8)';
    for (let i=0;i<60;i++){
      const x = (i/60)*w;
      const y = h*0.15 + Math.sin(causticsT*0.8 + i)*h*0.03;
      ctx.fillRect(x, y, w/60, h*0.008);
    }
    ctx.restore();

    // seabed
    ctx.fillStyle = `rgba(0,0,0,${0.25 + 0.08*deepW})`;
    ctx.fillRect(0,h*0.86,w,h*0.14);
    // sand specks
    ctx.save();
    ctx.globalAlpha=0.35;
    for (const s of sand){
      ctx.fillStyle = s.style;
      ctx.fillRect(s.x, s.y, 1, 1);
    }
    ctx.restore();

    // coral + seaweed (background elements sitting on the seabed)
    drawCoral(ctx);
    drawSeaweed(ctx);

    // occasional special moments (kept subtle, behind fish)
    drawSpecialMoments(ctx);

    // fish
    for (const f of fish){
      drawFish(ctx, f);
    }

    // bubbles
    ctx.save();
    for (const b of bubbles){
      const spr = getBubbleSprite(b.r);
      ctx.globalAlpha = b.a;
      ctx.drawImage(spr.canvas, b.x - spr.half, b.y - spr.half);
    }
    ctx.restore();

    // vignette
    ctx.fillStyle = getVignetteGradient(ctx);
    ctx.fillRect(0,0,w,h);

    // label (kept subtle and away from the OSD area)
    ctx.save();
    ctx.font = `${Math.floor(h/34)}px ui-serif, Georgia, serif`;
    ctx.fillStyle = 'rgba(210,255,250,0.35)';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 6;
    ctx.fillText('Midnight Aquarium', w*0.05, h*0.83);
    ctx.restore();
  }

  function drawFish(ctx, f){
    const sway = Math.sin(t*4 + f.ph) * 0.25;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.dir, 1);
    ctx.rotate(sway*0.08);

    const kind = f.kind || 'common';

    // Rare fish: subtle bioluminescent halo to make them pop without being neon.
    if (kind === 'rare'){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const r = f.size * (1.6 + 0.2*Math.sin(t*1.2 + f.ph));
      const gg = ctx.createRadialGradient(0, 0, f.size*0.2, 0, 0, r);
      gg.addColorStop(0, `hsla(${(f.hue+10)%360}, 95%, 70%, 0.26)`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // Shape params vary by kind.
    const bodyX = f.size * (kind === 'uncommon' ? 1.25 : 1.1);
    const bodyY = f.size * (kind === 'uncommon' ? 0.78 : 0.65);

    // body
    const body = ctx.createLinearGradient(-f.size,0,f.size,0);
    body.addColorStop(0, `hsla(${f.hue},85%,${kind === 'rare' ? 66 : 60}%,0.92)`);
    body.addColorStop(1, `hsla(${(f.hue+40)%360},90%,${kind === 'rare' ? 60 : 55}%,0.86)`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0,0, bodyX, bodyY,0,0,Math.PI*2);
    ctx.fill();

    // uncommon: add a soft vertical stripe pattern (stable via f.variant)
    if (kind === 'uncommon'){
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = `hsla(${(f.hue+160)%360}, 70%, 70%, 0.7)`;
      const stripes = 3 + ((f.variant * 3)|0);
      for (let i = 0; i < stripes; i++){
        const x = (-f.size*0.75) + (i/(stripes-1))*f.size*1.2;
        ctx.beginPath();
        ctx.ellipse(x, 0, f.size*0.11, f.size*0.62, 0, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }

    // tail
    ctx.fillStyle = `hsla(${(f.hue+20)%360},90%,55%,0.78)`;
    ctx.beginPath();
    ctx.moveTo(-bodyX,0);
    if (kind === 'rare'){
      // forked tail
      ctx.lineTo(-f.size*1.85, -f.size*0.55);
      ctx.lineTo(-f.size*1.45, 0);
      ctx.lineTo(-f.size*1.85, f.size*0.55);
    } else {
      ctx.lineTo(-f.size*1.7, -f.size*0.45);
      ctx.lineTo(-f.size*1.65, f.size*0.45);
    }
    ctx.closePath();
    ctx.fill();

    // dorsal fin / wing fin
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = `hsla(${(f.hue+80)%360},80%,60%,0.6)`;
    ctx.beginPath();
    if (kind === 'uncommon'){
      // taller fin silhouette
      ctx.moveTo(-f.size*0.15, -f.size*0.1);
      ctx.quadraticCurveTo(f.size*0.1, -f.size*1.15, f.size*0.65, -f.size*0.25);
      ctx.quadraticCurveTo(f.size*0.25, -f.size*0.25, -f.size*0.15, -f.size*0.1);
    } else {
      ctx.moveTo(-f.size*0.1,0);
      ctx.quadraticCurveTo(f.size*0.2, -f.size*0.9, f.size*0.55, -f.size*0.2);
      ctx.quadraticCurveTo(f.size*0.2, -f.size*0.1, -f.size*0.1,0);
    }
    ctx.fill();

    // rare: tiny lure dot near the head
    if (kind === 'rare'){
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = `hsla(${(f.hue+30)%360}, 95%, 72%, 0.85)`;
      ctx.beginPath();
      ctx.arc(f.size*0.95, -f.size*0.55, f.size*0.09, 0, Math.PI*2);
      ctx.fill();
    }

    // eye
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(f.size*0.55, -f.size*0.1, f.size*0.12,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath(); ctx.arc(f.size*0.58, -f.size*0.1, f.size*0.06,0,Math.PI*2); ctx.fill();

    ctx.restore();
  }

  function drawSeaweed(ctx){
    const top = h*0.86;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const s of seaweed){
      const bend = Math.sin(t*0.55*s.sway + s.ph);
      const x0 = s.x;
      const y0 = s.y;
      const y1 = y0 - s.len;
      const x1 = x0 + bend * (s.len * 0.10);

      // Two control points for a smooth stalk.
      const cx1 = x0 + bend * (s.len * 0.06);
      const cy1 = y0 - s.len * 0.35;
      const cx2 = x0 + bend * (s.len * 0.12);
      const cy2 = y0 - s.len * 0.72;

      ctx.lineWidth = s.thick;
      ctx.strokeStyle = `hsla(${s.hue}, 60%, 55%, ${s.a})`;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1);
      ctx.stroke();

      // a faint highlight line for depth (skip in back layer to reduce clutter)
      if (s.layer !== 'back'){
        ctx.lineWidth = Math.max(1, s.thick * 0.55);
        ctx.strokeStyle = `hsla(${(s.hue+25)%360}, 65%, 62%, ${s.a*0.55})`;
        ctx.beginPath();
        ctx.moveTo(x0 + s.thick*0.35, y0);
        ctx.bezierCurveTo(cx1 + s.thick*0.35, cy1, cx2 + s.thick*0.35, cy2, x1 + s.thick*0.2, y1);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawCoral(ctx){
    ctx.save();
    // Mostly paint as "real objects" (source-over), then add a small glow pass.
    ctx.globalCompositeOperation = 'source-over';
    for (const c of coral){
      const pulse = 0.5 + 0.5*Math.sin(t*0.25 + c.ph);
      const a0 = c.a * (0.75 + 0.25*pulse);
      const hue = c.hue % 360;

      if (c.kind === 'tubes'){
        const tubes = c.tubes;
        for (let i = 0; i < tubes; i++){
          const tt = (i / Math.max(1, tubes - 1));
          const dx = (tt - 0.5) * c.width * 3.0 + Math.sin(c.ph + i*1.4)*c.r*0.7;
          const hh = c.height * (0.55 + 0.55*Math.sin(c.ph*0.7 + i*0.9 + 1.0));
          const ww = c.width * (0.85 + 0.30*Math.sin(c.ph + i));
          const x = c.x + dx;
          const y = c.y;
          // tube body
          const body = ctx.createLinearGradient(x, y - hh, x, y);
          body.addColorStop(0, `hsla(${hue}, 72%, ${c.light+12}%, ${a0*0.90})`);
          body.addColorStop(1, `hsla(${(hue+10)%360}, 70%, ${c.light-6}%, ${a0*0.90})`);
          ctx.fillStyle = body;
          ctx.beginPath();
          ctx.roundRect?.(x - ww*0.5, y - hh, ww, hh, ww*0.45);
          if (!ctx.roundRect){
            ctx.rect(x - ww*0.5, y - hh, ww, hh);
          }
          ctx.fill();
          // tube opening
          ctx.fillStyle = `rgba(0,0,0,${0.18 + 0.10*pulse})`;
          ctx.beginPath();
          ctx.ellipse(x, y - hh + ww*0.55, ww*0.35, ww*0.22, 0, 0, Math.PI*2);
          ctx.fill();
          ctx.fillStyle = `hsla(${(hue+25)%360}, 85%, ${Math.min(78, c.light+18)}%, ${a0*0.22})`;
          ctx.beginPath();
          ctx.ellipse(x, y - hh + ww*0.50, ww*0.42, ww*0.26, 0, 0, Math.PI*2);
          ctx.fill();
        }
      } else if (c.kind === 'fan'){
        const ang0 = -Math.PI/2 - c.arc*0.5;
        const ang1 = -Math.PI/2 + c.arc*0.5;
        // fan fill
        const fan = ctx.createRadialGradient(c.x, c.y, c.r*0.6, c.x, c.y, c.radius);
        fan.addColorStop(0, `hsla(${hue}, 70%, ${c.light+10}%, ${a0*0.70})`);
        fan.addColorStop(1, `hsla(${(hue+15)%360}, 70%, ${c.light-6}%, ${a0*0.10})`);
        ctx.fillStyle = fan;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.arc(c.x, c.y, c.radius, ang0, ang1);
        ctx.closePath();
        ctx.fill();

        // spokes
        ctx.save();
        ctx.globalAlpha = a0 * 0.55;
        ctx.strokeStyle = `hsla(${(hue+25)%360}, 78%, ${Math.min(78, c.light+18)}%, 0.8)`;
        ctx.lineWidth = Math.max(1, h/900);
        for (let i = 0; i < c.spokes; i++){
          const tt = i / Math.max(1, c.spokes - 1);
          const a = ang0 + (ang1 - ang0) * tt;
          const rr = c.radius * (0.35 + 0.65*(0.6 + 0.4*Math.sin(c.ph + i*0.7)));
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(c.x + Math.cos(a)*rr, c.y + Math.sin(a)*rr);
          ctx.stroke();
        }
        ctx.restore();
      } else if (c.kind === 'branch'){
        ctx.save();
        ctx.globalAlpha = a0 * 0.95;
        ctx.strokeStyle = `hsla(${hue}, 68%, ${c.light}%, 0.9)`;
        ctx.lineCap = 'round';
        for (let i = 0; i < c.branches; i++){
          const baseAng = -Math.PI/2 + (i - (c.branches-1)/2) * 0.38;
          const sway = Math.sin(t*0.18 + c.ph + i) * 0.10;
          const ang = baseAng + sway;
          const len = c.height * (0.55 + 0.55*Math.sin(c.ph*0.7 + i*1.3));
          const x0 = c.x + (i - (c.branches-1)/2) * c.r * 1.2;
          const y0 = c.y;
          const x1 = x0 + Math.cos(ang) * len;
          const y1 = y0 + Math.sin(ang) * len;
          const cx = x0 + Math.cos(ang-0.35) * len * 0.55;
          const cy = y0 + Math.sin(ang-0.35) * len * 0.55;
          ctx.lineWidth = Math.max(1, c.r * (0.40 + 0.30*Math.sin(c.ph + i)));
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(cx, cy, x1, y1);
          ctx.stroke();
          // tip bloom
          ctx.fillStyle = `hsla(${(hue+18)%360}, 75%, ${Math.min(78, c.light+18)}%, ${a0*0.45})`;
          ctx.beginPath();
          ctx.arc(x1, y1, c.r*(0.50 + 0.20*Math.sin(c.ph+i)), 0, Math.PI*2);
          ctx.fill();
        }
        ctx.restore();
      } else {
        // boulder
        ctx.fillStyle = `hsla(${hue}, 70%, ${c.light}%, ${a0})`;
        // base blob
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.r*1.3*c.ax, c.r*1.1*c.ay, 0, 0, Math.PI*2);
        ctx.fill();

        // bumps
        for (let i = 0; i < c.bumps; i++){
          const ang = (i / c.bumps) * Math.PI*2 + Math.sin(c.ph + i)*0.25;
          const rr = c.r * (0.55 + 0.55*(0.6 + 0.4*Math.sin(i*1.7 + c.ph)));
          const dx = Math.cos(ang) * c.r * c.spread * (0.6 + 0.7*Math.sin(c.ph + i*0.9)*0.2);
          const dy = Math.sin(ang) * c.r * (c.spread*0.55);
          ctx.fillStyle = `hsla(${(hue + 8 + i*3)%360}, 70%, ${c.light + 4}%, ${a0*0.85})`;
          ctx.beginPath();
          ctx.ellipse(c.x + dx, c.y + dy, rr*c.ax, rr*c.ay, 0, 0, Math.PI*2);
          ctx.fill();
        }

        // darker underside shadow to ground it
        ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.08*pulse})`;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y + c.r*0.55, c.r*2.1*c.ax, c.r*0.7*c.ay, 0, 0, Math.PI*2);
        ctx.fill();
      }

      // soft glow
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const gg = ctx.createRadialGradient(c.x, c.y, c.r*0.5, c.x, c.y, c.r*6.0);
      gg.addColorStop(0, `hsla(${hue}, 85%, ${Math.min(82, c.light+14)}%, ${a0*0.18})`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r*6.0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
