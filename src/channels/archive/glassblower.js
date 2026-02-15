import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

// REVIEWED: 2026-02-12
// Glassblower’s Studio Loop
// Molten glass on a pipe: heat → gather → blow → shape → anneal.

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

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

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  const randA = mulberry32((seed ^ 0xA11DCAFE) >>> 0); // audio RNG (don’t affect visuals)

  // fixed phases for deterministic “show” structure
  const PHASES = [
    { key: 'HEAT', dur: 6.0 },
    { key: 'GATHER', dur: 7.0 },
    { key: 'BLOW', dur: 8.0 },
    { key: 'SHAPE', dur: 10.0 },
    { key: 'ANNEAL', dur: 6.0 },
  ];

  // scene
  let w = 0, h = 0, dpr = 1;
  let t = 0;
  let phaseIdx = 0;
  let phaseT = 0;

  // layout
  let font = 16;
  let small = 12;
  let furnace = { x: 0, y: 0, w: 0, h: 0, r: 12 };
  let bench = { x: 0, y: 0, w: 0, h: 0, r: 12 };
  let blob = { x: 0, y: 0, r: 40 };

  // deterministic look
  const glowHue = 18 + rand() * 10; // orange-ish
  const steelHue = 210 + rand() * 12;
  const woodHue = 22 + rand() * 10;
  const flickPh1 = rand() * Math.PI * 2;
  const flickPh2 = rand() * Math.PI * 2;

  // smoke + sparks (spawned deterministically on timers)
  let smoke = []; // {x,y,r,spd,ph}
  let sparks = []; // {x,y,vx,vy,life}
  let flare = 0;
  let nextSparkAt = 0;

  // “recipe” for this cycle
  let recipe = null; // {massR, blowR, aspect, twist}

  // audio
  let ambience = null;

  function newRecipe(){
    // size targets vary per cycle but stay deterministic for the seed
    const base = Math.min(w, h);
    const massR = base * (0.060 + rand() * 0.020);
    const blowR = base * (0.085 + rand() * 0.030);
    const aspect = 0.78 + rand() * 0.55; // >1 = longer, <1 = squat
    const twist = (rand() * 2 - 1) * 0.25;
    recipe = { massR, blowR, aspect, twist };
  }

  function init({ width, height, dpr: dprIn }){
    w = width; h = height; dpr = dprIn || 1;
    t = 0;
    phaseIdx = 0;
    phaseT = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 26));
    small = Math.max(11, Math.floor(font * 0.72));

    furnace.w = Math.max(120, Math.floor(w * 0.22));
    furnace.h = Math.max(140, Math.floor(h * 0.40));
    furnace.x = Math.floor(w * 0.06);
    furnace.y = Math.floor(h * 0.36);
    furnace.r = Math.max(12, Math.floor(Math.min(furnace.w, furnace.h) * 0.06));

    bench.w = Math.floor(w * 0.90);
    bench.h = Math.max(60, Math.floor(h * 0.18));
    bench.x = Math.floor((w - bench.w) * 0.5);
    bench.y = Math.floor(h * 0.72);
    bench.r = Math.max(10, Math.floor(bench.h * 0.18));

    blob.x = Math.floor(w * 0.58);
    blob.y = Math.floor(h * 0.56);
    blob.r = Math.floor(Math.min(w, h) * 0.08);

    smoke = Array.from({ length: 9 + ((rand() * 5) | 0) }, () => ({
      x: w * (0.12 + rand() * 0.78),
      y: h * (0.08 + rand() * 0.22),
      r: Math.min(w, h) * (0.05 + rand() * 0.06),
      spd: 0.06 + rand() * 0.12,
      ph: rand() * Math.PI * 2,
    }));

    sparks = [];
    flare = 0;
    nextSparkAt = 4 + rand() * 8;

    newRecipe();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function safeBeep(makeOpts){
    if (!audio.enabled) return;
    const opts = makeOpts?.();
    if (opts) audio.beep(opts);
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // idempotent: stop any prior handles we created
    try { ambience?.stop?.(); } catch {}
    ambience = null;

    const n = audio.noiseSource({ type: 'brown', gain: 0.0045 });
    n.start();
    const d = simpleDrone(audio, { root: 44 + randA() * 14, detune: 0.55, gain: 0.012 });
    ambience = { stop(){ try{ n.stop(); } catch {} try{ d.stop(); } catch {} } };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){
    onAudioOff();
  }

  function spawnSparks(){
    const n = 7 + ((rand() * 9) | 0);
    const bx = blob.x + w * 0.04;
    const by = blob.y - h * 0.02;
    for (let i = 0; i < n; i++){
      const a = -Math.PI * 0.15 + (rand() * 2 - 1) * 0.55;
      const sp = (w + h) * (0.0014 + rand() * 0.0016);
      sparks.push({
        x: bx,
        y: by,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - sp * 0.18,
        life: 0.45 + rand() * 0.65,
      });
    }

    flare = 1;

    // tiny “spark pop” (use audio RNG; don’t consume visual RNG when audio is off)
    if (audio.enabled){
      safeBeep(() => ({ freq: 1100 + randA() * 800, dur: 0.014, gain: 0.010, type: 'triangle' }));
      if (randA() < 0.5) safeBeep(() => ({ freq: 340 + randA() * 120, dur: 0.030, gain: 0.006, type: 'sine' }));
    }
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    flare = Math.max(0, flare - dt * 3.0);

    const cur = PHASES[phaseIdx];
    if (phaseT >= cur.dur){
      phaseT -= cur.dur;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      // new recipe each cycle (when returning to HEAT)
      if (phaseIdx === 0) newRecipe();
    }

    if (t >= nextSparkAt){
      spawnSparks();
      nextSparkAt = t + 6 + rand() * 12;
    }

    // integrate sparks
    for (const s of sparks){
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += (h * 0.55) * dt; // gravity-ish
      s.vx *= Math.pow(0.12, dt); // quick drag
      s.life -= dt;
    }
    if (sparks.length){
      sparks = sparks.filter(s => s.life > 0 && s.y < h * 1.2);
    }
  }

  function phaseHeat(key, p){
    // 0..1 heat level
    if (key === 'HEAT') return 0.55 + 0.45 * ease(p);
    if (key === 'GATHER') return 0.85;
    if (key === 'BLOW') return 0.75 - 0.20 * ease(p);
    if (key === 'SHAPE') return 0.55 - 0.20 * ease(p);
    return 0.25 - 0.10 * ease(p); // ANNEAL
  }

  function blobState(){
    const cur = PHASES[phaseIdx];
    const p = clamp(phaseT / cur.dur, 0, 1);
    const e = ease(p);

    // targets
    const rHeat = lerp(recipe.massR * 0.85, recipe.massR * 0.95, e);
    const rGather = lerp(recipe.massR * 0.95, recipe.massR, e);
    const rBlow = lerp(recipe.massR, recipe.blowR, e);
    const rShape = lerp(recipe.blowR, recipe.blowR * 0.90, e);
    const rAnneal = lerp(recipe.blowR * 0.90, recipe.blowR * 0.82, e);

    let r = recipe.massR;
    let sx = 1, sy = 1;
    let rot = 0;

    if (cur.key === 'HEAT'){
      r = rHeat;
      sx = 1 + 0.04 * Math.sin(t * 2.2 + flickPh1);
      sy = 1 - 0.02 * Math.sin(t * 1.7 + flickPh2);
      rot = 0.03 * Math.sin(t * 0.7);
    } else if (cur.key === 'GATHER'){
      r = rGather;
      sx = 0.96;
      sy = 1.05;
      rot = -0.02;
    } else if (cur.key === 'BLOW'){
      r = rBlow;
      sx = 1.02;
      sy = 0.92;
      rot = 0.02 * Math.sin(t * 1.1);
    } else if (cur.key === 'SHAPE'){
      r = rShape;
      const a = lerp(1, recipe.aspect, e);
      sx = a;
      sy = 1 / a;
      rot = recipe.twist * (0.3 + 0.7 * e);
    } else {
      r = rAnneal;
      sx = recipe.aspect * 0.92;
      sy = 1 / (recipe.aspect * 0.92);
      rot = recipe.twist;
    }

    // gentle roll on the pipe
    const roll = 0.10 * Math.sin(t * 0.9);
    return { key: cur.key, p, heat: phaseHeat(cur.key, p), r, sx, sy, rot: rot + roll };
  }

  function drawBackground(ctx, heat){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05060b');
    g.addColorStop(0.55, '#070912');
    g.addColorStop(1, '#03040a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // warm furnace wash
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const warm = ctx.createRadialGradient(furnace.x + furnace.w * 0.55, furnace.y + furnace.h * 0.55, 10, furnace.x + furnace.w * 0.55, furnace.y + furnace.h * 0.55, Math.max(w, h) * 0.75);
    warm.addColorStop(0, `hsla(${glowHue}, 100%, 60%, ${0.12 + 0.10 * heat})`);
    warm.addColorStop(0.35, `hsla(${glowHue}, 95%, 55%, ${0.05 + 0.07 * heat})`);
    warm.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // smoke drift
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const s of smoke){
      const y = s.y + Math.sin(t * s.spd + s.ph) * (h * 0.015);
      const x = s.x + Math.sin(t * s.spd * 0.7 + s.ph) * (w * 0.012);
      const a = 0.035 + 0.03 * (0.5 + 0.5 * Math.sin(t * s.spd * 1.4 + s.ph));
      const gg = ctx.createRadialGradient(x, y, 1, x, y, s.r);
      gg.addColorStop(0, `rgba(220, 230, 255, ${a})`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFurnace(ctx, heat){
    // body
    ctx.save();
    roundRect(ctx, furnace.x, furnace.y, furnace.w, furnace.h, furnace.r);
    ctx.fillStyle = '#10131c';
    ctx.fill();

    // subtle steel shading
    const sh = ctx.createLinearGradient(furnace.x, 0, furnace.x + furnace.w, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0.03)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0.00)');
    sh.addColorStop(1, 'rgba(0,0,0,0.20)');
    ctx.fillStyle = sh;
    ctx.fillRect(furnace.x, furnace.y, furnace.w, furnace.h);

    // door glow
    const doorW = furnace.w * 0.62;
    const doorH = furnace.h * 0.46;
    const dx = furnace.x + furnace.w * 0.19;
    const dy = furnace.y + furnace.h * 0.30;
    const flick = 0.75 + 0.25 * Math.sin(t * 3.1 + flickPh1) + 0.12 * Math.sin(t * 8.1 + flickPh2);
    const a = clamp((0.08 + 0.55 * heat) * flick, 0, 0.85);

    const door = ctx.createRadialGradient(dx + doorW * 0.52, dy + doorH * 0.55, 3, dx + doorW * 0.52, dy + doorH * 0.55, Math.max(doorW, doorH) * 0.9);
    door.addColorStop(0, `hsla(${glowHue + 6}, 100%, 70%, ${a})`);
    door.addColorStop(0.35, `hsla(${glowHue}, 100%, 55%, ${a * 0.85})`);
    door.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    roundRect(ctx, dx, dy, doorW, doorH, furnace.r * 0.6);
    ctx.clip();
    ctx.fillStyle = door;
    ctx.fillRect(dx, dy, doorW, doorH);

    // “heat shimmer” stripes
    ctx.globalAlpha = 0.20 + 0.28 * heat;
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `hsla(${glowHue}, 100%, 78%, 0.25)`;
    const lines = 8;
    for (let i = 0; i < lines; i++){
      const yy = dy + (i / lines) * doorH + Math.sin(t * (2.5 + i * 0.6) + flickPh2) * (doorH * 0.025);
      ctx.fillRect(dx, yy, doorW, Math.max(1, doorH * 0.03));
    }
    ctx.restore();

    // outline
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = Math.max(1, h / 520);
    roundRect(ctx, furnace.x, furnace.y, furnace.w, furnace.h, furnace.r);
    ctx.stroke();

    ctx.restore();
  }

  function drawBench(ctx){
    ctx.save();
    // top slab
    roundRect(ctx, bench.x, bench.y, bench.w, bench.h, bench.r);
    ctx.fillStyle = `hsl(${woodHue}, 22%, 16%)`;
    ctx.fill();

    // wood grain hint
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = `hsla(${woodHue + 8}, 30%, 40%, 0.18)`;
    ctx.lineWidth = Math.max(1, h / 620);
    for (let i = 0; i < 12; i++){
      const y = bench.y + bench.h * (0.18 + i * 0.06);
      ctx.beginPath();
      ctx.moveTo(bench.x + bench.w * 0.04, y);
      ctx.lineTo(bench.x + bench.w * 0.96, y + Math.sin(t * 0.3 + i) * (bench.h * 0.02));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // front edge shadow
    const edge = ctx.createLinearGradient(0, bench.y, 0, bench.y + bench.h);
    edge.addColorStop(0, 'rgba(0,0,0,0.0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = edge;
    ctx.fillRect(bench.x, bench.y, bench.w, bench.h);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = Math.max(1, h / 520);
    roundRect(ctx, bench.x, bench.y, bench.w, bench.h, bench.r);
    ctx.stroke();
    ctx.restore();
  }

  function drawPipe(ctx){
    const y = blob.y + h * 0.02;
    const x0 = w * 0.16;
    const x1 = w * 0.94;
    const th = Math.max(3, h * 0.010);

    ctx.save();
    // shadow
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = th * 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y + th * 0.9);
    ctx.lineTo(x1, y + th * 0.9);
    ctx.stroke();

    // steel rod
    ctx.globalAlpha = 1;
    const rod = ctx.createLinearGradient(x0, 0, x1, 0);
    rod.addColorStop(0, `hsla(${steelHue}, 18%, 55%, 0.9)`);
    rod.addColorStop(0.3, `hsla(${steelHue}, 12%, 35%, 0.9)`);
    rod.addColorStop(0.6, `hsla(${steelHue}, 15%, 48%, 0.9)`);
    rod.addColorStop(1, `hsla(${steelHue}, 10%, 30%, 0.9)`);
    ctx.strokeStyle = rod;
    ctx.lineWidth = th;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();

    // grip rings
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = Math.max(1, th * 0.25);
    for (let i = 0; i < 7; i++){
      const x = w * (0.20 + i * 0.09);
      ctx.beginPath();
      ctx.moveTo(x, y - th * 0.55);
      ctx.lineTo(x, y + th * 0.55);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBlob(ctx, st){
    const heat = st.heat;

    ctx.save();
    ctx.translate(blob.x, blob.y);
    ctx.rotate(st.rot);
    ctx.scale(st.sx, st.sy);

    const r = st.r;
    const grad = ctx.createRadialGradient(-r * 0.15, -r * 0.15, Math.max(2, r * 0.10), 0, 0, r * 1.05);
    grad.addColorStop(0, `hsla(${glowHue + 12}, 100%, ${60 + heat * 26}%, ${0.95})`);
    grad.addColorStop(0.25, `hsla(${glowHue + 6}, 100%, ${48 + heat * 22}%, ${0.92})`);
    grad.addColorStop(0.65, `hsla(${glowHue}, 95%, ${28 + heat * 20}%, ${0.80})`);
    grad.addColorStop(1, 'rgba(0,0,0,0.05)');

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // highlight band
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.25 + 0.35 * heat;
    ctx.fillStyle = `hsla(${glowHue + 24}, 100%, 82%, 0.45)`;
    ctx.beginPath();
    ctx.ellipse(-r * 0.18, -r * 0.18, r * 0.55, r * 0.32, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // outline
    ctx.globalAlpha = 0.18 + 0.20 * heat;
    ctx.strokeStyle = `hsla(${glowHue + 6}, 90%, 70%, 0.5)`;
    ctx.lineWidth = Math.max(1, h / 720);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    // bright “flare” overlay on spark moments
    if (flare > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const a = 0.15 * flare;
      const rr = r * (1.6 + flare * 0.6);
      const g = ctx.createRadialGradient(blob.x, blob.y, 1, blob.x, blob.y, rr);
      g.addColorStop(0, `hsla(${glowHue + 12}, 100%, 65%, ${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(blob.x - rr, blob.y - rr, rr * 2, rr * 2);
      ctx.restore();
    }
  }

  function drawSparks(ctx){
    if (!sparks.length) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const s of sparks){
      const a = clamp(s.life / 0.8, 0, 1);
      const r = Math.max(1, Math.min(w, h) * 0.004);
      ctx.fillStyle = `hsla(${38 + a * 20}, 100%, ${58 + a * 18}%, ${0.55 * a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      // tiny streak
      ctx.globalAlpha = 0.30 * a;
      ctx.strokeStyle = 'rgba(255,220,160,0.7)';
      ctx.lineWidth = Math.max(1, h / 820);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.02, s.y - s.vy * 0.02);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawHud(ctx, st){
    const pad = Math.floor(Math.min(w, h) * 0.035);

    // title
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = `700 ${font}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText("Glassblower's Studio", pad, pad + font);

    ctx.font = `600 ${small}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText(`PHASE: ${st.key}`, pad, pad + font + small + 8);

    // progress bar
    const barW = Math.min(w * 0.34, 360 * dpr);
    const barH = Math.max(6 * dpr, Math.floor(small * 0.55));
    const bx = pad;
    const by = pad + font + small * 2 + 16;

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, bx, by, barW, barH, barH * 0.6);
    ctx.fill();

    ctx.save();
    roundRect(ctx, bx, by, barW, barH, barH * 0.6);
    ctx.clip();
    const fillW = barW * clamp(st.p, 0, 1);
    const gg = ctx.createLinearGradient(bx, 0, bx + barW, 0);
    gg.addColorStop(0, `hsla(${glowHue + 8}, 100%, 62%, 0.95)`);
    gg.addColorStop(1, `hsla(${glowHue + 18}, 100%, 72%, 0.95)`);
    ctx.fillStyle = gg;
    ctx.fillRect(bx, by, fillW, barH);
    ctx.restore();

    // temp-ish readout
    ctx.globalAlpha = 0.70;
    ctx.fillStyle = `hsla(${glowHue + 10}, 100%, 72%, 0.85)`;
    const temp = Math.round(lerp(220, 1120, st.heat));
    ctx.fillText(`TEMP: ~${temp}°C`, pad, by + barH + small + 10);

    ctx.restore();
  }

  function render(ctx){
    const st = blobState();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx, st.heat);
    drawFurnace(ctx, st.heat);
    drawBench(ctx);
    drawPipe(ctx);
    drawBlob(ctx, st);
    drawSparks(ctx);
    drawHud(ctx, st);

    // subtle vignette
    ctx.save();
    const v = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  return {
    init,
    onResize,
    onAudioOn,
    onAudioOff,
    update,
    render,
    destroy,
  };
}
