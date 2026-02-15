import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

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

function dist(ax, ay, bx, by){
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx*dx + dy*dy);
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  // Palette: cold winter map + amber dispatch UI.
  const hue = 205 + rand() * 25;
  const bgA = `hsl(${(hue + 220) % 360}, 28%, 9%)`;
  const bgB = `hsl(${(hue + 245) % 360}, 25%, 6%)`;
  const ink = `hsla(${hue}, 45%, 78%, 0.85)`;
  const inkDim = `hsla(${hue}, 35%, 78%, 0.35)`;
  const road = `hsla(${hue}, 35%, 70%, 0.22)`;
  const roadBright = `hsla(${hue}, 55%, 75%, 0.55)`;
  const accent = `hsla(${(hue + 55) % 360}, 95%, 62%, 0.95)`;
  const warn = `hsla(${(hue + 330) % 360}, 92%, 62%, 0.95)`;

  let font = 16;
  let small = 12;

  // Offscreen layers.
  let mapC = null, mapCtx = null;
  let snowC = null, snowCtx = null;

  // Grid + route.
  let cols = 9, rows = 7;
  let gridX = 0, gridY = 0, cell = 64;
  let nodes = []; // intersection points in px

  let depot = [0, 0];
  let routeA = []; // points (arrays) reused, stable per shift
  let routeB = [];
  let activeRoute = routeA;
  let routeAlt = routeB;

  // Plow state.
  const plow = {
    x: 0, y: 0,
    px: 0, py: 0,
    i: 0, // segment index
    segT: 0,
    speed: 180,
    headingDepot: 0,
  };

  // Snowfall particles (foreground) — fixed-size pool.
  const flakes = Array.from({ length: 140 }, () => ({
    x: rand(), y: rand(),
    vx: -0.02 + rand()*0.04,
    vy: 0.08 + rand()*0.22,
    r: 0.8 + rand()*1.8,
    tw: rand()*6,
  }));

  // Timeline.
  const planningDur = 8.0;
  const endDur = 12.0;
  let shiftDur = 92.0;
  let shiftT = 0;

  let rerouteFlash = 0;
  let nextRerouteAt = 0;

  let salt = 1.0;
  let saltFlash = 0;
  let refillT = 0;

  let sweep = 0; // 0..1 for end-of-shift clear sweep

  let noise = null;
  let drone = null;
  let audioHandle = null;

  function pick(arr){ return arr[(rand() * arr.length) | 0]; }

  function safeBeep(opts){ try { audio.beep(opts); } catch {} }

  function makeOffscreen(){
    // Use OffscreenCanvas if available, else fallback to a normal canvas.
    const make = () => {
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    };

    mapC = make();
    mapC.width = w; mapC.height = h;
    mapCtx = mapC.getContext('2d');

    snowC = make();
    snowC.width = w; snowC.height = h;
    snowCtx = snowC.getContext('2d');
  }

  function buildGrid(){
    cols = 8 + ((rand() * 5) | 0); // 8..12
    rows = 6 + ((rand() * 4) | 0); // 6..9

    const pad = Math.floor(Math.min(w, h) * 0.10);
    const usableW = w - pad * 2;
    const usableH = h - pad * 2;

    cell = Math.floor(Math.min(usableW / cols, usableH / rows));
    cell = Math.max(44, cell);

    gridX = Math.floor((w - cell * cols) * 0.5);
    gridY = Math.floor((h - cell * rows) * 0.5);

    nodes = [];
    for (let y = 0; y <= rows; y++){
      for (let x = 0; x <= cols; x++){
        nodes.push([gridX + x * cell, gridY + y * cell]);
      }
    }

    // Depot near lower-left, but not at the extreme edge.
    const dx = 1 + ((rand() * 2) | 0);
    const dy = rows - 1 - ((rand() * 2) | 0);
    depot[0] = gridX + dx * cell;
    depot[1] = gridY + dy * cell;
  }

  function nodeAt(ix, iy){
    const x = clamp(ix, 0, cols);
    const y = clamp(iy, 0, rows);
    return nodes[y * (cols + 1) + x];
  }

  function randomWalkRoute(out, steps){
    out.length = 0;

    // Start at depot-ish intersection.
    let ix = Math.round((depot[0] - gridX) / cell);
    let iy = Math.round((depot[1] - gridY) / cell);

    out.push(nodeAt(ix, iy));

    let dir = pick([[1,0],[-1,0],[0,1],[0,-1]]);
    for (let s = 0; s < steps; s++){
      // With some probability, turn.
      if (rand() < 0.36){
        dir = pick([[1,0],[-1,0],[0,1],[0,-1]]);
      }

      ix = clamp(ix + dir[0], 1, cols - 1);
      iy = clamp(iy + dir[1], 1, rows - 1);

      const p = nodeAt(ix, iy);
      const last = out[out.length - 1];
      if (p[0] !== last[0] || p[1] !== last[1]) out.push(p);
    }

    // Return toward depot for a satisfying loop.
    out.push([depot[0], depot[1]]);
  }

  function buildRoutes(){
    const steps = 18 + ((rand() * 10) | 0);
    randomWalkRoute(routeA, steps);

    // Alternate route: take A and detour a mid chunk by shifting a few nodes.
    routeB.length = 0;
    for (let i = 0; i < routeA.length; i++) routeB.push(routeA[i]);

    const k0 = 3 + ((rand() * Math.max(1, routeB.length - 8)) | 0);
    const k1 = Math.min(routeB.length - 3, k0 + 3 + ((rand() * 3) | 0));

    for (let i = k0; i < k1; i++){
      const p = routeB[i];
      // jitter by one cell to simulate a reroute/detour.
      const sx = rand() < 0.5 ? -1 : 1;
      const sy = rand() < 0.5 ? -1 : 1;
      const ix = Math.round((p[0] - gridX) / cell) + sx;
      const iy = Math.round((p[1] - gridY) / cell) + sy;
      routeB[i] = nodeAt(ix, iy);
    }

    activeRoute = routeA;
    routeAlt = routeB;
  }

  function drawMapStatic(){
    const ctx = mapCtx;
    if (!ctx) return;

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // Subtle paper-ish background.
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // City blocks.
    ctx.save();
    ctx.globalAlpha = 0.9;

    // faint grid lines
    ctx.strokeStyle = road;
    ctx.lineWidth = Math.max(1, Math.floor(dpr));

    for (let y = 0; y <= rows; y++){
      const yy = gridY + y * cell;
      ctx.beginPath();
      ctx.moveTo(gridX, yy);
      ctx.lineTo(gridX + cols * cell, yy);
      ctx.stroke();
    }
    for (let x = 0; x <= cols; x++){
      const xx = gridX + x * cell;
      ctx.beginPath();
      ctx.moveTo(xx, gridY);
      ctx.lineTo(xx, gridY + rows * cell);
      ctx.stroke();
    }

    // buildings inside blocks
    for (let y = 0; y < rows; y++){
      for (let x = 0; x < cols; x++){
        const bx = gridX + x * cell;
        const by = gridY + y * cell;
        const pad = Math.max(4, Math.floor(cell * 0.16));
        const bw = cell - pad * 2;
        const bh = cell - pad * 2;
        const a = 0.05 + rand() * 0.06;
        ctx.fillStyle = `rgba(0,0,0,${a})`;
        ctx.fillRect(bx + pad, by + pad, bw, bh);

        if (rand() < 0.12){
          ctx.fillStyle = `rgba(255,255,255,${0.03 + rand()*0.05})`;
          ctx.fillRect(bx + pad + bw * (0.1 + rand()*0.7), by + pad + bh * (0.1 + rand()*0.7), Math.max(2, bw*0.12), Math.max(2, bh*0.08));
        }
      }
    }

    // Depot marker.
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(2, Math.floor(dpr*1.2));
    const r = Math.max(10, cell * 0.18);
    ctx.beginPath();
    ctx.arc(depot[0], depot[1], r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function resetSnow(){
    const ctx = snowCtx;
    if (!ctx) return;

    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0,0,w,h);

    // Base snow veil (not totally opaque).
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0,0,w,h);

    // Grain
    const n = Math.floor((w*h) / 4200);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < n; i++){
      const x = rand() * w;
      const y = rand() * h;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function resetShift(){
    shiftDur = 86 + rand() * 22;
    shiftT = 0;
    sweep = 0;

    buildRoutes();

    plow.x = depot[0];
    plow.y = depot[1];
    plow.px = plow.x;
    plow.py = plow.y;
    plow.i = 0;
    plow.segT = 0;
    plow.speed = Math.max(140, cell * (1.7 + rand() * 0.6));
    plow.headingDepot = 0;

    salt = 0.85 + rand() * 0.15;
    saltFlash = 0;
    refillT = 0;

    rerouteFlash = 0;
    nextRerouteAt = planningDur + 10 + rand() * 14;

    resetSnow();
  }

  function init({ width, height, dpr: dprIn } = {}){
    w = width || w;
    h = height || h;
    dpr = dprIn || dpr || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 28));
    small = Math.max(11, Math.floor(font * 0.78));

    makeOffscreen();
    buildGrid();
    drawMapStatic();
    resetShift();

    t = 0;
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Windy snow ambience: soft noise + low drone.
    const src = audio.noiseSource({ type: rand() < 0.5 ? 'pink' : 'brown', gain: 0.020 });
    src.start();
    noise = src;

    drone = simpleDrone(audio, { root: 55, detune: 1.1, gain: 0.045 });

    audioHandle = {
      stop(){
        try { noise?.stop?.(); } catch {}
        try { drone?.stop?.(); } catch {}
      }
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

  function setActiveRoute(which){
    if (which === activeRoute) return;
    const prev = activeRoute;
    activeRoute = which;
    routeAlt = (prev === routeA) ? routeB : routeA;

    rerouteFlash = 1;
    if (audio.enabled){
      safeBeep({ freq: 740, dur: 0.05, gain: 0.028, type: 'square' });
      safeBeep({ freq: 520, dur: 0.06, gain: 0.018, type: 'triangle' });
    }
  }

  function plowTarget(i){
    const pts = activeRoute;
    return pts[clamp(i, 0, pts.length - 1)];
  }

  function advancePlow(dt){
    const pts = activeRoute;
    if (pts.length < 2) return;

    // Optional refill run: head back to depot for a short beat, then resume.
    if (refillT > 0){
      refillT = Math.max(0, refillT - dt);

      const tx = depot[0], ty = depot[1];
      const dx = tx - plow.x;
      const dy = ty - plow.y;
      const d = Math.max(0.0001, Math.sqrt(dx*dx + dy*dy));
      const sp = plow.speed * 1.25;
      const step = Math.min(d, sp * dt);
      plow.x += (dx / d) * step;
      plow.y += (dy / d) * step;

      if (refillT === 0){
        salt = 1.0;
        saltFlash = 1;
        // Jump route index to nearest depot point (start).
        plow.i = 0;
        plow.segT = 0;
        plow.x = depot[0];
        plow.y = depot[1];
      }
      return;
    }

    let a = plowTarget(plow.i);
    let b = plowTarget(plow.i + 1);

    // segment in px
    let segLen = dist(a[0], a[1], b[0], b[1]);
    if (segLen < 0.001){
      plow.i = (plow.i + 1) % (pts.length - 1);
      return;
    }

    const ds = plow.speed * dt;
    plow.segT += ds / segLen;

    while (plow.segT >= 1){
      plow.segT -= 1;
      plow.i = (plow.i + 1) % (pts.length - 1);
      a = plowTarget(plow.i);
      b = plowTarget(plow.i + 1);
      segLen = Math.max(0.001, dist(a[0], a[1], b[0], b[1]));
    }

    plow.x = lerp(a[0], b[0], plow.segT);
    plow.y = lerp(a[1], b[1], plow.segT);

    // Salt consumption scales with speed (distance).
    salt = clamp(salt - ds / Math.max(1, (cell * cols * 6.0)), 0, 1);
    if (salt < 0.12 && refillT === 0){
      refillT = 4.2 + rand() * 2.0;
      if (audio.enabled) safeBeep({ freq: 220, dur: 0.08, gain: 0.030, type: 'square' });
    }
  }

  function clearSnowAlong(prevX, prevY, x, y){
    const ctx = snowCtx;
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(10, cell * 0.54);
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
  }

  function updateFlakes(dt){
    const drift = 0.08 + 0.08 * Math.sin(t * 0.23);
    for (const f of flakes){
      f.x += (f.vx + drift * 0.012) * dt;
      f.y += f.vy * dt;
      if (f.y > 1.12){ f.y = -0.12; f.x = rand(); }
      if (f.x < -0.12) f.x = 1.12;
      if (f.x > 1.12) f.x = -0.12;
    }
  }

  function update(dt){
    t += dt;
    shiftT += dt;

    rerouteFlash = Math.max(0, rerouteFlash - dt * 1.8);
    saltFlash = Math.max(0, saltFlash - dt * 2.0);

    // Choose phase based on shiftT.
    const clearingT0 = planningDur;
    const endT0 = Math.max(clearingT0 + 40, shiftDur - endDur);

    // Reroute “special moment”.
    if (shiftT >= nextRerouteAt && shiftT < endT0 - 4){
      setActiveRoute(activeRoute === routeA ? routeB : routeA);
      nextRerouteAt = shiftT + 11 + rand() * 20;
    }

    // Snow accumulation (very gentle) — keep it cheap.
    if (snowCtx && shiftT >= clearingT0 && shiftT < endT0){
      snowCtx.save();
      snowCtx.globalCompositeOperation = 'source-over';
      snowCtx.fillStyle = 'rgba(255,255,255,0.008)';
      snowCtx.fillRect(0, 0, w, h);
      snowCtx.restore();
    }

    updateFlakes(dt);

    // Planning: no movement, let the dispatcher UI settle.
    if (shiftT < clearingT0){
      return;
    }

    // End-of-shift sweep: wipe remaining snow clean.
    if (shiftT >= endT0){
      const p = (shiftT - endT0) / Math.max(0.001, (shiftDur - endT0));
      sweep = ease(p);
      if (snowCtx){
        snowCtx.save();
        snowCtx.globalCompositeOperation = 'destination-out';
        snowCtx.fillStyle = 'rgba(0,0,0,0.9)';
        const xx = -w * 0.1;
        const ww = (w * 1.2) * sweep;
        snowCtx.fillRect(xx, 0, ww, h);
        snowCtx.restore();
      }
      if (shiftT >= shiftDur){
        resetShift();
      }
      return;
    }

    // Clearing: plow advances and carves its lane.
    plow.px = plow.x;
    plow.py = plow.y;
    advancePlow(dt);
    clearSnowAlong(plow.px, plow.py, plow.x, plow.y);
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, bgA);
    g.addColorStop(1, bgB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.45, Math.min(w,h)*0.20, w*0.5, h*0.45, Math.max(w,h)*0.88);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);
  }

  function drawRoutes(ctx, phase){
    const showPlan = phase === 'plan';

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, Math.floor(dpr*1.2));

    // dim base route
    const pts = activeRoute;
    ctx.strokeStyle = showPlan ? roadBright : inkDim;
    ctx.setLineDash(showPlan ? [Math.max(6, cell*0.14), Math.max(6, cell*0.12)] : []);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++){
      const p = pts[i];
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();

    // reroute highlight
    if (rerouteFlash > 0.01){
      ctx.setLineDash([]);
      ctx.lineWidth = Math.max(3, Math.floor(dpr*2));
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + 0.22*rerouteFlash})`;
      const alt = routeAlt;
      ctx.beginPath();
      for (let i = 0; i < alt.length; i++){
        const p = alt[i];
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPlow(ctx, phase){
    if (phase === 'plan'){
      // subtle idle marker at depot
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(depot[0], depot[1], Math.max(4, cell*0.10), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const r = Math.max(5, cell * 0.12);
    ctx.save();

    // trail glow (clearing lane)
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, r*1.4);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(plow.px, plow.py);
    ctx.lineTo(plow.x, plow.y);
    ctx.stroke();

    // body
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(plow.x, plow.y, r, 0, Math.PI*2);
    ctx.fill();

    // blade
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx.lineWidth = Math.max(2, r*0.55);
    ctx.beginPath();
    ctx.moveTo(plow.x - r*1.1, plow.y + r*0.35);
    ctx.lineTo(plow.x + r*1.1, plow.y - r*0.35);
    ctx.stroke();

    ctx.restore();
  }

  function drawFlakes(ctx){
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const f of flakes){
      const tw = 0.55 + 0.45 * Math.sin(t * 0.9 + f.tw);
      ctx.globalAlpha = 0.10 + 0.22 * tw;
      const x = f.x * w;
      const y = f.y * h;
      ctx.beginPath();
      ctx.arc(x, y, f.r * (0.6 + 0.6*tw), 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHud(ctx, phase){
    const pad = Math.max(14, Math.floor(Math.min(w,h) * 0.028));
    const hudW = Math.min(w * 0.60, 620);
    const hudH = Math.max(64, font * 2.25);

    ctx.save();
    ctx.globalAlpha = 0.96;
    const bg = ctx.createLinearGradient(pad, pad, pad + hudW, pad + hudH);
    bg.addColorStop(0, 'rgba(0,0,0,0.46)');
    bg.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = bg;
    roundRect(ctx, pad, pad, hudW, hudH, 14);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    ctx.stroke();

    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.fillText('SNOWPLOW ROUTE PLANNER', pad + 18, pad + font * 1.15);

    // Phase + progress
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = ink;

    let label = 'PLANNING';
    if (phase === 'clear') label = refillT > 0 ? 'REFILL RUN' : 'CLEARING';
    if (phase === 'end') label = 'END OF SHIFT';

    if (rerouteFlash > 0.01 && phase === 'clear') label = 'REROUTE';

    ctx.fillText(`MODE: ${label}`, pad + 18, pad + font * 1.15 + small * 1.15);

    // Salt gauge
    const gx = pad + hudW - 160;
    const gy = pad + 18;
    const gw = 130;
    const gh = 10;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(gx, gy, gw, gh);

    const saltCol = salt < 0.18 ? warn : accent;
    ctx.fillStyle = saltCol;
    ctx.fillRect(gx, gy, gw * salt, gh);

    ctx.fillStyle = 'rgba(255,255,255,0.70)';
    ctx.fillText('SALT', gx, gy + gh + small + 2);

    if (saltFlash > 0.01){
      ctx.save();
      ctx.globalAlpha = 0.20 * saltFlash;
      ctx.fillStyle = accent;
      ctx.fillRect(gx - 4, gy - 4, gw + 8, gh + 8);
      ctx.restore();
    }

    // Progress bar
    const barX = pad + 18;
    const barY = pad + hudH - 18;
    const barW = hudW - 36;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(barX, barY, barW, 3);

    const prog = clamp(shiftT / shiftDur, 0, 1);
    ctx.fillStyle = `rgba(255,255,255,${0.40 + 0.20*Math.sin(t*1.6)})`;
    ctx.fillRect(barX, barY, barW * prog, 3);

    ctx.restore();

    // End stamp
    if (phase === 'end'){
      const a = 0.12 + 0.25 * sweep;
      ctx.save();
      ctx.translate(w*0.67, h*0.62);
      ctx.rotate(-0.16);
      ctx.globalAlpha = a;
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(3, Math.floor(dpr*2));
      ctx.font = `700 ${Math.floor(font*1.8)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      const text = 'CLEARED';
      const tw = ctx.measureText(text).width;
      roundRect(ctx, -tw*0.55, -font*1.2, tw*1.1, font*1.8, 14);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.fillText(text, -tw*0.5, font*0.2);
      ctx.restore();
    }
  }

  function render(ctx){
    if (!(w && h)) return;

    const clearingT0 = planningDur;
    const endT0 = Math.max(clearingT0 + 40, shiftDur - endDur);

    let phase = 'plan';
    if (shiftT >= endT0) phase = 'end';
    else if (shiftT >= clearingT0) phase = 'clear';

    drawBackground(ctx);

    // static map
    if (mapC) ctx.drawImage(mapC, 0, 0);

    // route overlay
    drawRoutes(ctx, phase);

    // snow veil (cleared by plow)
    if (snowC){
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(snowC, 0, 0);
      ctx.restore();
    }

    // plow
    drawPlow(ctx, phase);

    // active snowfall (foreground)
    drawFlakes(ctx);

    // HUD overlay
    drawHud(ctx, phase);
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
