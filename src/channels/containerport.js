// REVIEWED: 2026-02-11
import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }
function fract(x){ return x - Math.floor(x); }

// Deterministic hash → [0,1). (Avoids consuming the channel PRNG, which is used elsewhere.)
function hash01(n){
  n = (n | 0) >>> 0;
  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15;
  n = Math.imul(n, 0x846ca68b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

function roundedRect(ctx, x, y, w, h, r){
  r = Math.min(r, w*0.5, h*0.5);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  // Audio must never consume the visual PRNG (visuals must match with audio on/off).
  const randAudio = mulberry32(((seed | 0) ^ 0x9e3779b9) >>> 0);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;
  let mono = 13;

  const pal = {
    sky0: '#061022',
    sky1: '#0b2a47',
    sea0: '#06151d',
    sea1: '#0a2631',
    glow: 'rgba(125,240,255,0.18)',
    yard: '#0f1317',
    yard2: '#111a1f',
    grid: 'rgba(255,255,255,0.055)',
    dock: '#1a242c',
    dockEdge: 'rgba(210,240,255,0.12)',
    steel: '#a6b6c3',
    steel2: 'rgba(220,240,255,0.22)',
    text: 'rgba(235,245,255,0.92)',
    subtext: 'rgba(235,245,255,0.72)',
    accent: '#6cf2ff',
    warn: '#ff4e52',
    warn2: '#ffcf6a',
  };

  const PHASES = [
    { id: 'arrival', label: 'SHIP ARRIVAL' },
    { id: 'unload', label: 'UNLOAD' },
    { id: 'stack', label: 'STACK & SORT' },
    { id: 'reroute', label: 'REROUTE' },
    { id: 'sweep', label: 'END-OF-SHIFT SWEEP' },
  ];
  const PHASE_DUR = 16;
  const CYCLE_DUR = PHASE_DUR * PHASES.length;

  // Layout
  let horizon = 0;
  let dockY = 0;
  let seaH = 0;

  let yardX = 0;
  let yardY = 0;
  let yardW = 0;
  let yardH = 0;

  let dockX0 = 0;
  let dockX1 = 0;

  // Simulation
  let phaseIndex = -1;
  let movesPerMin = 18;

  const BAY_COUNT = 14;
  let bays = []; // {x, w, h, col, h0, ht}
  let heights = new Float32Array(BAY_COUNT);
  let targets = new Float32Array(BAY_COUNT);

  const CRANE_COUNT = 3;
  let cranes = []; // {x, y, s, off}

  let ship = { x: 0, y: 0, w: 0, h: 0, dockX: 0 };

  // Special moment: reroute
  let routeA = 0;
  let routeB = 1;
  let routePulse = 0;

  // Audio
  let ambience = null;

  // Gradient caches (rebuilt on resize/layout change or ctx swap)
  let gCtx = null;
  let gSky = null;
  let gSea = null;
  let gYard = null;
  let gVignette = null;
  let gradientsDirty = true;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regenLayout(){
    horizon = h * 0.34;
    seaH = h * 0.22;
    dockY = horizon + seaH * 0.62;

    yardX = w * 0.10;
    yardY = dockY + h * 0.08;
    yardW = w * 0.80;
    yardH = h * 0.44;

    dockX0 = w * 0.08;
    dockX1 = w * 0.92;

    // ship
    ship.w = w * 0.46;
    ship.h = Math.max(26, h * 0.08);
    ship.dockX = w * 0.72;
    ship.y = horizon + seaH * 0.38;

    // bays: container stacks on yard
    bays = [];
    const gap = yardW * 0.012;
    const bayW = (yardW - gap * (BAY_COUNT - 1)) / BAY_COUNT;
    for (let i = 0; i < BAY_COUNT; i++){
      const x = yardX + i * (bayW + gap);
      const col = pick(rand, ['#2b2d3a','#2f1f2b','#1f2b2a','#2f2a1f','#1f2430','#2a3322','#2a2033']);
      bays.push({ x, w: bayW, col });
    }

    // cranes along dock
    cranes = [];
    for (let i = 0; i < CRANE_COUNT; i++){
      const fx = lerp(dockX0 + w * 0.08, dockX1 - w * 0.08, (i + 0.5) / CRANE_COUNT);
      cranes.push({ x: fx, y: dockY - h * 0.10, s: 0.9 + rand()*0.25, off: rand() * 10 });
    }

    gradientsDirty = true;
  }

  function reset(){
    t = 0;
    phaseIndex = -1;

    // base stack heights
    for (let i = 0; i < BAY_COUNT; i++){
      const v = 1 + ((rand() * 3) | 0);
      heights[i] = v;
      targets[i] = v;
    }

    routeA = (rand() * BAY_COUNT) | 0;
    routeB = (routeA + 4 + ((rand() * 6) | 0)) % BAY_COUNT;
    routePulse = 0;

    ship.x = w * 1.15;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    regenLayout();
    reset();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    const n = audio.noiseSource({ type: 'brown', gain: 0.0035 });
    n.start();
    const d = simpleDrone(audio, { root: 44 + randAudio()*12, detune: 0.75, gain: 0.013 });

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
    ambience = null;
  }

  function destroy(){
    onAudioOff();
  }

  function chooseTargetsForPhase(p){
    // copy current targets by default
    for (let i = 0; i < BAY_COUNT; i++) targets[i] = heights[i];

    if (p === 0){
      // arrival: keep modest stacks
      movesPerMin = 14 + ((rand() * 6) | 0);
      for (let i = 0; i < BAY_COUNT; i++) targets[i] = clamp(targets[i], 1, 4);
    } else if (p === 1){
      // unload: build up a few bays
      movesPerMin = 20 + ((rand() * 10) | 0);
      const k = 4 + ((rand() * 3) | 0);
      for (let j = 0; j < k; j++){
        const idx = (rand() * BAY_COUNT) | 0;
        targets[idx] = clamp(targets[idx] + 2 + rand()*2.2, 1, 9);
      }
    } else if (p === 2){
      // stack & sort: redistribute heights
      movesPerMin = 22 + ((rand() * 12) | 0);
      for (let i = 0; i < BAY_COUNT; i++){
        const j = (rand() * BAY_COUNT) | 0;
        const a = heights[i];
        targets[i] = heights[j];
        targets[j] = a;
      }
    } else if (p === 3){
      // reroute: keep stacks, but choose a route highlight
      movesPerMin = 16 + ((rand() * 10) | 0);
      routeA = (rand() * BAY_COUNT) | 0;
      routeB = (routeA + 3 + ((rand() * 8) | 0)) % BAY_COUNT;
      routePulse = 1;

      safeBeep({ freq: 220, dur: 0.08, gain: 0.018, type: 'square' });
      safeBeep({ freq: 440, dur: 0.05, gain: 0.014, type: 'triangle' });
    } else {
      // sweep: gently reduce heights (ship departs)
      movesPerMin = 10 + ((rand() * 6) | 0);
      for (let i = 0; i < BAY_COUNT; i++){
        targets[i] = clamp(heights[i] - (0.8 + rand()*1.6), 1, 7);
      }
    }
  }

  function update(dt){
    t += dt;

    // phase
    const p = ((t / PHASE_DUR) | 0) % PHASES.length;
    if (p !== phaseIndex){
      phaseIndex = p;
      chooseTargetsForPhase(phaseIndex);

      if (phaseIndex === 0) safeBeep({ freq: 92, dur: 0.06, gain: 0.014, type: 'sine' });
      if (phaseIndex === 1) safeBeep({ freq: 110, dur: 0.07, gain: 0.016, type: 'square' });
      if (phaseIndex === 2) safeBeep({ freq: 140, dur: 0.06, gain: 0.014, type: 'triangle' });
      if (phaseIndex === 4) safeBeep({ freq: 78, dur: 0.08, gain: 0.013, type: 'sine' });
    }

    routePulse = Math.max(0, routePulse - dt * 0.55);

    // move stack heights toward targets
    const k = 1 - Math.exp(-dt * 1.05);
    for (let i = 0; i < BAY_COUNT; i++){
      heights[i] = lerp(heights[i], targets[i], k);
    }

    // ship motion (arrival + sweep)
    const phaseT = (t % PHASE_DUR) / PHASE_DUR;
    if (phaseIndex === 0){
      const u = ease(phaseT);
      ship.x = lerp(w * 1.15, ship.dockX, u);
    } else if (phaseIndex === 4){
      const u = ease(phaseT);
      ship.x = lerp(ship.dockX, -ship.w * 0.25, u);
    } else {
      ship.x = ship.dockX;
    }

    // occasional tiny crane click
    if (audio.enabled && phaseIndex === 1){
      const u = fract(t * 0.9);
      if (u < dt * 0.9 && randAudio() < 0.35) safeBeep({ freq: 520 + randAudio()*220, dur: 0.02, gain: 0.006, type: 'square' });
    }

    if (audio.enabled && phaseIndex === 3){
      const u = fract(t * 0.45);
      if (u < dt * 0.45 && randAudio() < 0.55) safeBeep({ freq: 260 + randAudio()*80, dur: 0.03, gain: 0.008, type: 'triangle' });
    }
  }

  function ensureGradients(ctx){
    if (!gradientsDirty && gCtx === ctx) return;
    gCtx = ctx;

    gSky = ctx.createLinearGradient(0, 0, 0, h);
    gSky.addColorStop(0, pal.sky0);
    gSky.addColorStop(0.55, pal.sky1);
    gSky.addColorStop(1, '#050b12');

    gSea = ctx.createLinearGradient(0, horizon, 0, dockY);
    gSea.addColorStop(0, pal.sea1);
    gSea.addColorStop(1, pal.sea0);

    gYard = ctx.createLinearGradient(0, yardY, 0, yardY + yardH);
    gYard.addColorStop(0, pal.yard2);
    gYard.addColorStop(1, pal.yard);

    gVignette = ctx.createRadialGradient(
      w*0.5, h*0.45, Math.min(w,h)*0.12,
      w*0.5, h*0.45, Math.max(w,h)*0.65
    );
    gVignette.addColorStop(0, 'rgba(0,0,0,0)');
    gVignette.addColorStop(1, 'rgba(0,0,0,0.35)');

    gradientsDirty = false;
  }

  function drawBackground(ctx){
    ctx.fillStyle = gSky;
    ctx.fillRect(0, 0, w, h);

    // clouds (layered puffs; deterministic by seed, no rand() calls)
    for (let pass = 0; pass < 2; pass++){
      ctx.save();
      ctx.globalCompositeOperation = pass === 0 ? 'source-over' : 'screen';

      for (let i = 0; i < 7; i++){
        const h0 = hash01((seed|0) + i * 1013);
        const h1 = hash01((seed|0) + i * 1619);
        const h2 = hash01((seed|0) + i * 2713);

        const sp = (0.006 + i * 0.004) * (0.70 + 0.80 * h0);
        const x0 = (w * (0.10 + i * 0.14) + (t * 34 * sp)) % (w * 1.25) - w * 0.12 + (h1 - 0.5) * w * 0.04;
        const y0 = h * (0.09 + i * 0.043) + (h2 - 0.5) * h * 0.015;

        const r0 = w * (0.050 + i * 0.009) * (0.85 + 0.55 * h1);
        const puffN = 4 + ((h2 * 5) | 0);

        const a = 0.040 + 0.030 * (1 - i / 7);
        if (pass === 0){
          ctx.fillStyle = `rgba(0,0,0,${0.020 + a * 0.55})`;
        } else {
          ctx.fillStyle = `rgba(140,225,255,${a})`;
        }

        for (let p = 0; p < puffN; p++){
          const hp = hash01((seed|0) + i * 9001 + p * 97);
          const hq = hash01((seed|0) + i * 9001 + p * 131);
          const hr = hash01((seed|0) + i * 9001 + p * 193);

          const px = x0 + (hp - 0.5) * r0 * 1.25;
          const py = y0 + (hq - 0.5) * r0 * 0.22 + (pass === 0 ? r0 * 0.10 : 0);
          const pr = r0 * (0.32 + 0.46 * hr);

          ctx.beginPath();
          ctx.ellipse(px, py, pr * 1.10, pr * 0.64, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // small highlight cap
        if (pass === 1){
          const hx = x0 + (hash01((seed|0) + i * 6007) - 0.5) * r0 * 0.6;
          const hy = y0 - r0 * 0.12;
          ctx.fillStyle = `rgba(225,250,255,${a * 0.50})`;
          ctx.beginPath();
          ctx.ellipse(hx, hy, r0 * 0.55, r0 * 0.18, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    // horizon glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = pal.glow;
    ctx.fillRect(0, horizon - h * 0.04, w, h * 0.10);
    ctx.restore();
  }

  function drawSea(ctx){
    ctx.fillStyle = gSea;
    ctx.fillRect(0, horizon, w, dockY - horizon);

    // simple waves
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(160,230,255,0.18)';
    ctx.lineWidth = Math.max(1, Math.floor(1.2 * dpr));
    for (let i = 0; i < 7; i++){
      const y = lerp(horizon + 10, dockY - 8, i / 6);
      const ph = t * (0.35 + i * 0.07) + i * 2.1;
      ctx.beginPath();
      const amp = 5 + i * 1.2;
      for (let x = 0; x <= w; x += 18){
        const yy = y + Math.sin(ph + x * 0.012) * amp * 0.12;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDock(ctx){
    const dh = h * 0.07;
    ctx.fillStyle = pal.dock;
    ctx.fillRect(0, dockY, w, dh);

    ctx.fillStyle = pal.dockEdge;
    ctx.fillRect(0, dockY, w, Math.max(2, dh * 0.07));

    // markings
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, 1.2 * dpr);
    for (let x = dockX0; x <= dockX1; x += w * 0.06){
      ctx.beginPath();
      ctx.moveTo(x, dockY + dh * 0.22);
      ctx.lineTo(x + w * 0.03, dockY + dh * 0.22);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShip(ctx){
    const sx = ship.x - ship.w;
    const sy = ship.y;

    // hull
    ctx.save();
    ctx.fillStyle = '#0c1014';
    roundedRect(ctx, sx, sy, ship.w, ship.h, ship.h * 0.22);
    ctx.fill();

    // deck
    ctx.fillStyle = 'rgba(220,240,255,0.10)';
    roundedRect(ctx, sx + ship.w * 0.06, sy + ship.h * 0.18, ship.w * 0.88, ship.h * 0.64, ship.h * 0.18);
    ctx.fill();

    // stacked containers on ship
    const cols = ['#2b2d3a', '#1f2b2a', '#2f2a1f', '#2a2033', '#2f1f2b'];
    const nx = 11;
    for (let i = 0; i < nx; i++){
      const bx = sx + ship.w * (0.10 + i * 0.075);
      const bw = ship.w * 0.06;
      const base = sy - ship.h * 0.20;
      const n = 1 + (((i + (seed|0)) % 4) | 0);
      for (let j = 0; j < n; j++){
        const by = base - j * (ship.h * 0.22);
        ctx.fillStyle = cols[(i + j) % cols.length];
        roundedRect(ctx, bx, by, bw, ship.h * 0.18, 3);
        ctx.fill();
      }
    }

    // bow highlight
    ctx.fillStyle = 'rgba(108,242,255,0.10)';
    ctx.fillRect(sx + ship.w * 0.82, sy + ship.h * 0.10, ship.w * 0.14, ship.h * 0.12);

    ctx.restore();
  }

  function yardContainerUnit(){
    return Math.max(10, Math.floor(Math.min(yardW / (BAY_COUNT * 1.1), yardH / 11)));
  }

  function bayTopY(i){
    const u = yardContainerUnit();
    const hh = Math.floor(heights[i] + 0.0001);
    return yardY + yardH - hh * (u * 0.78);
  }

  function drawYard(ctx){
    // yard pad
    ctx.fillStyle = gYard;
    roundedRect(ctx, yardX, yardY, yardW, yardH, Math.max(10, yardH * 0.02));
    ctx.fill();

    // grid
    ctx.save();
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = Math.max(1, 1.0 * dpr);
    const step = yardW / 12;
    for (let i = 1; i < 12; i++){
      const x = yardX + i * step;
      ctx.beginPath();
      ctx.moveTo(x, yardY);
      ctx.lineTo(x, yardY + yardH);
      ctx.stroke();
    }
    for (let i = 1; i < 8; i++){
      const y = yardY + i * (yardH / 8);
      ctx.beginPath();
      ctx.moveTo(yardX, y);
      ctx.lineTo(yardX + yardW, y);
      ctx.stroke();
    }
    ctx.restore();

    // container stacks
    const u = yardContainerUnit();
    for (let i = 0; i < BAY_COUNT; i++){
      const b = bays[i];
      const hh = Math.floor(heights[i] + 0.0001);
      const baseY = yardY + yardH;
      const bw = b.w * 0.92;
      const bx = b.x + (b.w - bw) * 0.5;

      for (let j = 0; j < hh; j++){
        const by = baseY - (j + 1) * (u * 0.78);
        ctx.fillStyle = b.col;
        roundedRect(ctx, bx, by, bw, u * 0.62, 3);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(bx + bw * 0.08, by + u * 0.18, bw * 0.84, Math.max(1, u * 0.06));
      }

      // bay label
      ctx.save();
      ctx.font = `${Math.floor(small * 0.90)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = 'rgba(235,245,255,0.52)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`B${String(i+1).padStart(2,'0')}`, b.x + b.w * 0.5, yardY + yardH + u * 0.10);
      ctx.restore();
    }

    // base shadow
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(yardX, yardY + yardH - u * 0.12, yardW, u * 0.18);
    ctx.restore();
  }

  function craneMoveFor(i){
    // one procedural move per crane in unload/stack, otherwise idle
    const c = cranes[i];
    const base = t * (0.10 + c.s * 0.06) + c.off;
    const u = fract(base);

    // choose source/dest bay indices deterministically
    const a = (Math.floor(base * 3.1) + i * 2) % BAY_COUNT;
    const b = (a + 3 + ((Math.floor(base * 5.7) + i) % 7)) % BAY_COUNT;

    const shipSlotX = ship.x - ship.w * (0.75 - i * 0.10);
    const dockX = c.x;
    const yardX1 = bays[b].x + bays[b].w * 0.5;

    const startX = phaseIndex === 2 ? bays[a].x + bays[a].w * 0.5 : shipSlotX;
    const endX = phaseIndex === 2 ? yardX1 : yardX1;

    const topY = (phaseIndex === 2) ? bayTopY(a) : (ship.y - ship.h * 0.22);
    const endY = bayTopY(b);

    // path: up over dock, then down
    const midY = dockY - h * 0.16;
    const e = ease(u);
    const x = lerp(startX, endX, e);
    const y = lerp(lerp(topY, midY, ease(Math.min(1, u*1.25))), endY, ease(Math.max(0, (u-0.25) / 0.75)));

    // trolley position along crane beam
    const tx = clamp((x - (dockX - w * 0.14)) / (w * 0.28), 0, 1);

    return { u, x, y, tx, a, b, active: (phaseIndex === 1 || phaseIndex === 2) };
  }

  function drawCranes(ctx){
    ctx.save();

    for (let i = 0; i < CRANE_COUNT; i++){
      const c = cranes[i];

      const mastH = h * 0.20;
      const mastW = Math.max(w * 0.012, 4 * dpr);
      const beamW = w * 0.28;
      const beamH = Math.max(h * 0.007, 3 * dpr);

      const beamY = dockY - mastH;
      const leftX = c.x - beamW * 0.50;
      const rightX = c.x + beamW * 0.50;

      // mast (filled body + outline so it reads as a solid frame)
      ctx.fillStyle = 'rgba(220,240,255,0.10)';
      ctx.fillRect(c.x - mastW * 0.5, beamY, mastW, mastH);

      ctx.lineWidth = Math.max(2, 2.2 * dpr);
      ctx.strokeStyle = 'rgba(220,240,255,0.22)';
      ctx.strokeRect(c.x - mastW * 0.5, beamY, mastW, mastH);

      // base shoe
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(c.x - mastW * 0.70, dockY - 2 * dpr, mastW * 1.40, 4 * dpr);

      // beam (chunky bar)
      ctx.fillStyle = 'rgba(220,240,255,0.08)';
      ctx.fillRect(leftX, beamY - beamH * 0.5, beamW, beamH);
      ctx.strokeStyle = 'rgba(220,240,255,0.18)';
      ctx.strokeRect(leftX, beamY - beamH * 0.5, beamW, beamH);

      // highlight cap
      ctx.strokeStyle = 'rgba(108,242,255,0.10)';
      ctx.beginPath();
      ctx.moveTo(leftX, beamY - beamH * 0.5);
      ctx.lineTo(rightX, beamY - beamH * 0.5);
      ctx.stroke();

      // truss braces
      ctx.lineWidth = Math.max(1, 1.6 * dpr);
      ctx.strokeStyle = 'rgba(220,240,255,0.10)';
      const pad = beamW * 0.18;
      ctx.beginPath();
      ctx.moveTo(leftX + pad, beamY);
      ctx.lineTo(c.x, dockY);
      ctx.lineTo(rightX - pad, beamY);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(220,240,255,0.08)';
      for (let k = 0; k < 6; k++){
        const x0 = lerp(leftX + pad, rightX - pad, k/6);
        const x1 = lerp(leftX + pad, rightX - pad, (k+1)/6);
        ctx.beginPath();
        ctx.moveTo(x0, beamY);
        ctx.lineTo(x1, beamY + mastH * 0.20);
        ctx.stroke();
      }

      const mv = craneMoveFor(i);
      const trolleyX = lerp(leftX, rightX, mv.tx);

      // trolley
      ctx.fillStyle = 'rgba(108,242,255,0.22)';
      roundedRect(ctx, trolleyX - 11, beamY - 8, 22, 16, 4);
      ctx.fill();

      // hoist cable
      ctx.lineWidth = Math.max(1, 1.4 * dpr);
      ctx.strokeStyle = 'rgba(180,220,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(trolleyX, beamY);
      ctx.lineTo(mv.x, mv.y);
      ctx.stroke();

      if (mv.active){
        // moving container
        ctx.fillStyle = (i === 0 && phaseIndex === 1) ? pal.warn2 : pal.accent;
        roundedRect(ctx, mv.x - 18, mv.y - 8, 36, 16, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(mv.x - 12, mv.y - 3, 24, 3);
      }
    }

    ctx.restore();
  }

  function drawRouteOverlay(ctx){
    if (phaseIndex !== 3) return;

    const ax = bays[routeA].x + bays[routeA].w * 0.5;
    const bx = bays[routeB].x + bays[routeB].w * 0.5;
    const ay = bayTopY(routeA) - 10;
    const by = bayTopY(routeB) - 10;

    const pulse = 0.45 + 0.55 * Math.sin(t * 3.2);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = Math.max(2, 2.2 * dpr);
    ctx.strokeStyle = `rgba(255,78,82,${0.25 + 0.35*pulse})`;

    ctx.beginPath();
    ctx.moveTo(ax, ay);
    const mx = (ax + bx) * 0.5;
    ctx.quadraticCurveTo(mx, Math.min(ay, by) - h * 0.10, bx, by);
    ctx.stroke();

    // nodes
    ctx.fillStyle = `rgba(255,207,106,${0.35 + 0.45*pulse})`;
    ctx.beginPath(); ctx.arc(ax, ay, 5 + 3*pulse, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by, 5 + 3*pulse, 0, Math.PI*2); ctx.fill();

    ctx.restore();
  }

  function drawHUD(ctx){
    const pad = Math.max(10, w * 0.02);
    const barH = Math.max(46, h * 0.085);

    ctx.save();

    // top bar
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    roundedRect(ctx, pad, pad, w - pad*2, barH, 14);
    ctx.fill();

    ctx.fillStyle = 'rgba(108,242,255,0.10)';
    roundedRect(ctx, pad, pad, w - pad*2, barH, 14);
    ctx.fill();

    const label = `CONTAINER PORT — ${PHASES[phaseIndex].label}`;
    ctx.font = `${Math.floor(font * 1.02)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
    ctx.fillStyle = pal.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pad + 18, pad + barH * 0.50);

    // right stats
    let occ = 0;
    for (let i = 0; i < BAY_COUNT; i++) occ += heights[i];
    const util = Math.round((occ / (BAY_COUNT * 9)) * 100);
    const routeTxt = phaseIndex === 3 ? `ROUTE: B${String(routeA+1).padStart(2,'0')}→B${String(routeB+1).padStart(2,'0')}` : 'ROUTE: AUTO';

    ctx.textAlign = 'right';
    ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = pal.subtext;
    ctx.fillText(`MOVES/MIN ${movesPerMin}`, w - pad - 18, pad + barH * 0.32);
    ctx.fillText(`YARD UTIL ${util}%   ${routeTxt}`, w - pad - 18, pad + barH * 0.68);

    // reroute pill
    if (phaseIndex === 3){
      const pillW = Math.max(120, w * 0.18);
      const pillH = Math.max(20, barH * 0.42);
      const px = w - pad - 18 - pillW;
      const py = pad + barH + pad * 0.55;
      const pulse = 0.5 + 0.5 * Math.sin(t * 6.2);

      ctx.fillStyle = `rgba(255,78,82,${0.22 + 0.25*pulse})`;
      roundedRect(ctx, px, py, pillW, pillH, pillH * 0.5);
      ctx.fill();

      ctx.strokeStyle = `rgba(255,207,106,${0.35 + 0.35*pulse})`;
      ctx.lineWidth = Math.max(1, 1.2 * dpr);
      roundedRect(ctx, px, py, pillW, pillH, pillH * 0.5);
      ctx.stroke();

      ctx.font = `${Math.floor(small * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = `rgba(255,207,106,${0.85})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('REROUTE ACTIVE', px + pillW * 0.5, py + pillH * 0.55);
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ensureGradients(ctx);

    drawBackground(ctx);
    drawSea(ctx);
    drawShip(ctx);
    drawDock(ctx);

    drawYard(ctx);
    drawRouteOverlay(ctx);
    drawCranes(ctx);

    drawHUD(ctx);

    // subtle vignette
    ctx.save();
    ctx.fillStyle = gVignette;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
