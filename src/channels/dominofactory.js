import { mulberry32, clamp } from '../util/prng.js';

// REVIEWED: 2026-02-12
// Domino Factory Floor
// Top-down domino layout machine builds patterns → triggers cascades;
// phase-based motifs (spiral, wave, monogram, gear) with slow cams and factory HUD.

function lerp(a, b, t){ return a + (b - a) * t; }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function ease(t){ t = clamp01(t); return t * t * (3 - 2 * t); }
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

function dist(a, b){
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.hypot(dx, dy);
}

function resamplePolyline(pts, step){
  if (!pts || pts.length < 2) return pts ? pts.slice() : [];
  const out = [pts[0].slice ? pts[0].slice() : [pts[0][0], pts[0][1]]];
  let carry = 0;

  let x0 = pts[0][0], y0 = pts[0][1];
  for (let i = 1; i < pts.length; i++){
    let x1 = pts[i][0], y1 = pts[i][1];
    let dx = x1 - x0;
    let dy = y1 - y0;
    let seg = Math.hypot(dx, dy);
    if (seg < 1e-6){ x0 = x1; y0 = y1; continue; }

    while (carry + seg >= step){
      const t = (step - carry) / seg;
      const nx = x0 + dx * t;
      const ny = y0 + dy * t;
      out.push([nx, ny]);
      // start next sample from this point
      x0 = nx; y0 = ny;
      dx = x1 - x0; dy = y1 - y0;
      seg = Math.hypot(dx, dy);
      carry = 0;
      if (seg < 1e-6) break;
    }

    carry += seg;
    x0 = x1; y0 = y1;
  }

  return out;
}

function makeSpiral(rand, cx, cy){
  const pts = [];
  const turns = 2.6 + rand() * 1.2;
  const a0 = rand() * Math.PI * 2;
  const r0 = 0.40 + rand() * 0.05;
  const r1 = 0.10 + rand() * 0.08;
  const n = 260;
  for (let i = 0; i < n; i++){
    const u = i / (n - 1);
    const th = a0 + u * turns * Math.PI * 2;
    const rr = lerp(r0, r1, Math.pow(u, 0.92));
    const wob = 1 + 0.04 * Math.sin(th * (2 + (rand() * 2 | 0)) + rand() * 6);
    pts.push([cx + Math.cos(th) * rr * wob, cy + Math.sin(th) * rr]);
  }
  return pts;
}

function makeWave(rand){
  const pts = [];
  const n = 240;
  const y0 = 0.52 + (rand() * 2 - 1) * 0.04;
  const a = 0.18 + rand() * 0.06;
  const f1 = 1.6 + rand() * 1.1;
  const f2 = 3.2 + rand() * 1.5;
  const ph = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++){
    const u = i / (n - 1);
    const x = 0.12 + u * 0.76;
    const y = y0 + a * Math.sin(u * Math.PI * 2 * f1 + ph) + 0.05 * Math.sin(u * Math.PI * 2 * f2 + ph * 0.7);
    pts.push([x, y]);
  }
  return pts;
}

function makeMonogram(rand){
  // Simple faux factory logo: a chunky "DF" path (polyline).
  // (Enough to feel like a motif without needing font outlines.)
  const ox = 0.24 + (rand() * 2 - 1) * 0.02;
  const oy = 0.30 + (rand() * 2 - 1) * 0.02;
  const sx = 0.52;
  const sy = 0.44;

  const P = (x, y) => [ox + x * sx, oy + y * sy];

  const pts = [];
  // D
  pts.push(P(0.08, 0.10));
  pts.push(P(0.08, 0.90));
  pts.push(P(0.26, 0.90));
  pts.push(P(0.33, 0.84));
  pts.push(P(0.33, 0.16));
  pts.push(P(0.26, 0.10));
  pts.push(P(0.08, 0.10));

  // connector to F
  pts.push(P(0.44, 0.10));

  // F
  pts.push(P(0.44, 0.10));
  pts.push(P(0.44, 0.90));
  pts.push(P(0.64, 0.90));
  pts.push(P(0.64, 0.78));
  pts.push(P(0.52, 0.78));
  pts.push(P(0.52, 0.58));
  pts.push(P(0.62, 0.58));
  pts.push(P(0.62, 0.46));
  pts.push(P(0.52, 0.46));
  pts.push(P(0.52, 0.10));

  // add a slight diagonal "stamp" tail
  pts.push(P(0.70, 0.18));
  pts.push(P(0.78, 0.10));

  return pts;
}

function makeGear(rand, cx, cy){
  const pts = [];
  const teeth = 10 + ((rand() * 6) | 0);
  const r0 = 0.28 + rand() * 0.05;
  const r1 = r0 * (1.13 + rand() * 0.08);
  const a0 = rand() * Math.PI * 2;
  const steps = teeth * 10;
  for (let i = 0; i <= steps; i++){
    const u = i / steps;
    const th = a0 + u * Math.PI * 2;
    const tooth = Math.max(0, Math.sin(th * teeth));
    const rr = lerp(r0, r1, Math.pow(tooth, 3.2));
    pts.push([cx + Math.cos(th) * rr, cy + Math.sin(th) * rr]);
  }
  return pts;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // layout
  let floor = { x: 0, y: 0, w: 0, h: 0, r: 16 };
  let domLen = 18;
  let domWid = 6;

  // cycle
  const BUILD_DUR = 18;
  const PAUSE_DUR = 2.0;
  const CASCADE_DUR = 10.5;
  const RESET_DUR = 4.0;
  const CYCLE_DUR = BUILD_DUR + PAUSE_DUR + CASCADE_DUR + RESET_DUR;

  let cycleIndex = -1;
  let cycleT = 0;

  // motif
  let motif = { key: 'SPIRAL', name: 'Spiral', pts: [], samples: [] };
  let dominos = []; // {x,y,a,col,dir,order}
  let N = 0;

  // effects
  let alarm = 0;
  let alarmSchedule = [];
  let alarmI = 0;

  let spark = 0;
  let sparkSchedule = [];
  let sparkI = 0;

  let cam = { x: 0, y: 0, z: 1 };

  // audio
  let humHandle = null;
  let lastPlaceCount = -1;
  let lastFallNote = -1;

  function stopHum({ clearCurrent = false } = {}){
    const handle = humHandle;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    humHandle = null;
  }

  function rebuildLayout(){
    const pad = Math.min(w, h) * 0.08;
    floor.x = pad;
    floor.y = pad;
    floor.w = w - pad * 2;
    floor.h = h - pad * 2;
    floor.r = Math.max(10, Math.min(floor.w, floor.h) * 0.025);

    const base = Math.min(floor.w, floor.h);
    domLen = Math.max(12, base * 0.032);
    domWid = domLen * 0.34;
  }

  function pickMotifForCycle(c){
    // Derive a deterministic local RNG for this cycle.
    const rr = mulberry32(((seed ^ (c * 0x9e3779b9)) >>> 0));

    const options = [
      { key: 'SPIRAL', name: 'Spiral' },
      { key: 'WAVE', name: 'Wave' },
      { key: 'MONOGRAM', name: 'Monogram' },
      { key: 'GEAR', name: 'Gear' },
    ];

    const pickI = (rr() * options.length) | 0;
    const m = options[pickI];

    let pts = [];
    if (m.key === 'SPIRAL') pts = makeSpiral(rr, 0.52 + (rr() * 2 - 1) * 0.05, 0.54 + (rr() * 2 - 1) * 0.05);
    else if (m.key === 'WAVE') pts = makeWave(rr);
    else if (m.key === 'MONOGRAM') pts = makeMonogram(rr);
    else pts = makeGear(rr, 0.52 + (rr() * 2 - 1) * 0.05, 0.54 + (rr() * 2 - 1) * 0.05);

    // resample into domino placement points
    const step = 0.030 + rr() * 0.006;
    const samples = resamplePolyline(pts, step);

    // build dominos list
    const palette = [
      { fill: '#f6d54a', edge: '#2a2110' }, // safety yellow
      { fill: '#ff7a3d', edge: '#2a1210' },
      { fill: '#ff3f6e', edge: '#240813' },
      { fill: '#67e0ff', edge: '#05202a' },
    ];

    dominos = [];
    N = Math.max(24, Math.min(140, samples.length));

    for (let i = 0; i < N; i++){
      const p = samples[i];
      const p2 = samples[Math.min(N - 1, i + 1)] || p;
      const a = Math.atan2(p2[1] - p[1], p2[0] - p[0]);
      const col = palette[(i + ((rr() * 4) | 0)) & 3];
      const dir = (rr() < 0.5 ? -1 : 1);
      dominos.push({ x: p[0], y: p[1], a, col, dir, order: i });
    }

    motif = { ...m, pts, samples };

    alarm = 0;
    alarmSchedule = [];
    alarmI = 0;
    {
      let at = 3 + rr() * 14;
      while (at < CYCLE_DUR - 0.1){
        alarmSchedule.push(at);
        at += 7 + rr() * 10;
      }
    }

    spark = 0;
    sparkSchedule = [];
    sparkI = 0;
    {
      let at = BUILD_DUR + PAUSE_DUR + 1.2 + rr() * 4.6;
      while (at < CYCLE_DUR - 0.1){
        sparkSchedule.push(at);
        at += 2.6 + rr() * 4.8;
      }
    }

    lastPlaceCount = -1;
    lastFallNote = -1;
  }

  function onResize(width, height, dpr_){
    w = width;
    h = height;
    dpr = dpr_ || 1;
    rebuildLayout();
    // force rebuild on resize so layout + cached scaling match
    cycleIndex = -1;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Idempotent: if our hum is already current, keep it.
    if (humHandle && audio.current === humHandle) return;

    // If we previously started one (even if no longer current), stop it.
    stopHum({ clearCurrent: true });

    const n = audio.noiseSource({ type: 'brown', gain: 0.022 });
    try { n.start(); } catch {}

    humHandle = audio.setCurrent({
      stop(){
        try { n.stop(); } catch {}
      }
    });
  }

  function onAudioOff(){
    stopHum({ clearCurrent: true });
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;

    const c = Math.floor(t / CYCLE_DUR);
    if (c !== cycleIndex){
      cycleIndex = c;
      pickMotifForCycle(cycleIndex);
    }

    cycleT = t - cycleIndex * CYCLE_DUR;

    // slow camera drift
    cam.x = (Math.sin(t * 0.18) + Math.sin(t * 0.047 + 1.2)) * 0.007;
    cam.y = (Math.cos(t * 0.14 + 0.8) + Math.sin(t * 0.06)) * 0.006;
    cam.z = 1 + 0.01 * Math.sin(t * 0.09);

    const ALARM_DECAY = 2.4;
    const SPARK_DECAY = 2.8;

    // Decay is continuous-time linear, so integrating via sum(dt) is stable across FPS.
    // The key determinism fix is: when a scheduled event is crossed, compute the
    // instantaneous intensity as if it fired at the exact scheduled time, not the
    // (FPS-dependent) frame boundary where we noticed it.
    alarm = Math.max(0, alarm - dt * ALARM_DECAY);
    spark = Math.max(0, spark - dt * SPARK_DECAY);

    while (alarmI < alarmSchedule.length && cycleT >= alarmSchedule[alarmI]){
      const at = alarmSchedule[alarmI];
      const age = cycleT - at;
      alarm = Math.max(alarm, Math.max(0, 1 - age * ALARM_DECAY));
      alarmI++;
    }

    while (sparkI < sparkSchedule.length && cycleT >= sparkSchedule[sparkI]){
      const at = sparkSchedule[sparkI];
      const age = cycleT - at;
      spark = Math.max(spark, Math.max(0, 1 - age * SPARK_DECAY));
      sparkI++;
    }

    // audio tick for placement/falls (throttled)
    if (audio.enabled){
      const placed = Math.min(N, Math.floor((cycleT / BUILD_DUR) * N));
      if (placed !== lastPlaceCount){
        lastPlaceCount = placed;
        if (placed > 0 && (placed % 6) === 0 && cycleT < BUILD_DUR){
          audio.beep({ freq: 520 + (placed % 12) * 11, dur: 0.045, gain: 0.020, type: 'square' });
        }
      }

      const cascadeStart = BUILD_DUR + PAUSE_DUR;
      if (cycleT >= cascadeStart && cycleT < cascadeStart + CASCADE_DUR){
        const u = clamp01((cycleT - cascadeStart) / CASCADE_DUR);
        const fallI = Math.floor(u * N);
        if (fallI !== lastFallNote && (fallI % 10) === 0){
          lastFallNote = fallI;
          audio.beep({ freq: 200 + (fallI % 30) * 3, dur: 0.07, gain: 0.018, type: 'triangle' });
        }
      }
    }
  }

  function drawFloor(ctx){
    // base
    const g = ctx.createLinearGradient(0, floor.y, 0, floor.y + floor.h);
    g.addColorStop(0, '#0e141b');
    g.addColorStop(0.5, '#0b1017');
    g.addColorStop(1, '#090d13');

    ctx.fillStyle = '#05080c';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(floor.x, floor.y);

    // floor panel
    roundRect(ctx, 0, 0, floor.w, floor.h, floor.r);
    ctx.fillStyle = g;
    ctx.fill();

    // subtle vignette
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const vg = ctx.createRadialGradient(floor.w * 0.5, floor.h * 0.55, floor.w * 0.2, floor.w * 0.5, floor.h * 0.55, floor.w * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, floor.w, floor.h);
    ctx.restore();

    // grid (moving)
    const grid = domLen * 1.55;
    const ox = ((t * 18) % grid);
    const oy = ((t * 11) % grid);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(160, 210, 255, 0.45)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));

    for (let x = -ox; x < floor.w + grid; x += grid){
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, floor.h);
      ctx.stroke();
    }
    for (let y = -oy; y < floor.h + grid; y += grid){
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(floor.w, y);
      ctx.stroke();
    }
    ctx.restore();

    // conveyors (layered motion)
    const beltH = Math.max(28, floor.h * 0.10);
    const beltY = floor.h * 0.20;
    const beltY2 = floor.h * 0.74;

    function belt(y, speed, tint){
      ctx.save();
      ctx.globalAlpha = 0.92;
      roundRect(ctx, floor.w * 0.08, y, floor.w * 0.84, beltH, beltH * 0.22);
      ctx.fillStyle = tint;
      ctx.fill();

      // moving stripes
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.rect(floor.w * 0.08, y, floor.w * 0.84, beltH);
      ctx.clip();

      const step = domLen * 0.9;
      const off = ((t * speed) % step);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      for (let x = -step * 2; x < floor.w + step * 2; x += step){
        ctx.beginPath();
        ctx.moveTo(x + off, y + beltH);
        ctx.lineTo(x + off + beltH * 0.9, y);
        ctx.stroke();
      }
      ctx.restore();

      // edge
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.stroke();
      ctx.restore();
    }

    belt(beltY, 80, '#111822');
    belt(beltY2, -70, '#0f1620');

    ctx.restore();
  }

  function drawDomino(ctx, x, y, ang, p, { fill, edge }, dir){
    // p = 0 upright → 1 fully "fallen" (stylized 2D cheat)
    const u = ease(p);
    const L = lerp(domLen * 0.70, domLen * 1.25, u);
    const W = lerp(domWid * 0.95, domWid * 0.70, u);
    const a = ang + dir * u * 0.55;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.18 + u * 0.10;
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    roundRect(ctx, -L * 0.5 + 2, -W * 0.5 + 3, L, W, Math.min(6, W * 0.7));
    ctx.fill();
    ctx.restore();

    // body
    roundRect(ctx, -L * 0.5, -W * 0.5, L, W, Math.min(6, W * 0.7));
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    ctx.strokeStyle = edge;
    ctx.globalAlpha = 0.6;
    ctx.stroke();

    // pips / highlight
    ctx.globalAlpha = 0.22 + (1 - u) * 0.14;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const pip = Math.max(1, W * 0.12);
    ctx.fillRect(-L * 0.18, -W * 0.18, pip, pip);
    ctx.fillRect(L * 0.08, W * 0.02, pip, pip);

    ctx.restore();
  }

  function drawHUD(ctx, placed, phaseName){
    const x = floor.x + floor.w * 0.02;
    const y = floor.y + floor.h * 0.04;
    ctx.save();
    ctx.font = `${Math.max(14, Math.floor(14 * dpr))}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'top';

    const title = 'DOMINO FACTORY FLOOR';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(title, x, y);

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(150, 220, 255, 0.85)';
    ctx.fillText(`PATTERN: ${motif.name}`, x, y + 18 * dpr);

    ctx.fillStyle = 'rgba(255, 235, 160, 0.85)';
    ctx.fillText(`${phaseName}  ${String(placed).padStart(3, '0')}/${String(N).padStart(3, '0')}`, x, y + 36 * dpr);

    if (alarm > 0.01){
      ctx.fillStyle = `rgba(255, 80, 90, ${0.35 + 0.45 * alarm})`;
      ctx.fillText('⚠ JAM SENSOR BLIP', x, y + 54 * dpr);
    }

    ctx.restore();
  }

  function draw(ctx){
    if (!w || !h) return;
    // Layout is derived from (w,h,dpr) in onResize(); only rebuild if somehow missing.
    if (!floor.w || !floor.h) rebuildLayout();

    // phase
    let phaseName = 'BUILD';
    let placed = 0;
    let cascadeU = 0;

    if (cycleT < BUILD_DUR){
      phaseName = 'BUILD';
      placed = Math.min(N, Math.floor((cycleT / BUILD_DUR) * N));
    } else if (cycleT < BUILD_DUR + PAUSE_DUR){
      phaseName = 'ARM READY';
      placed = N;
    } else if (cycleT < BUILD_DUR + PAUSE_DUR + CASCADE_DUR){
      phaseName = 'CASCADE';
      placed = N;
      cascadeU = (cycleT - (BUILD_DUR + PAUSE_DUR)) / CASCADE_DUR;
    } else {
      phaseName = 'RESET';
      placed = N;
    }

    // camera transform
    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-w * 0.5 + cam.x * w, -h * 0.5 + cam.y * h);

    drawFloor(ctx);

    // planned path preview (faint)
    ctx.save();
    ctx.translate(floor.x, floor.y);
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = 'rgba(120,200,255,0.7)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    ctx.beginPath();
    for (let i = 0; i < motif.pts.length; i++){
      const p = motif.pts[i];
      const x = p[0] * floor.w;
      const y = p[1] * floor.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // dominos
    const cascadeStart = BUILD_DUR + PAUSE_DUR;
    const stagger = (CASCADE_DUR * 0.78) / Math.max(1, N);

    for (let i = 0; i < placed; i++){
      const d = dominos[i];
      const x = floor.x + d.x * floor.w;
      const y = floor.y + d.y * floor.h;

      let p = 0;
      if (cycleT >= cascadeStart){
        const fallAt = cascadeStart + d.order * stagger;
        p = clamp01((cycleT - fallAt) / 0.34);
      }
      if (cycleT > cascadeStart + CASCADE_DUR) p = 1;

      drawDomino(ctx, x, y, d.a, p, d.col, d.dir);
    }

    // placement head / robot arm
    if (cycleT < BUILD_DUR){
      const i = Math.min(N - 1, Math.max(0, placed));
      const d = dominos[i];
      const px = floor.x + d.x * floor.w;
      const py = floor.y + d.y * floor.h;

      const armBaseX = floor.x + floor.w * 0.12;
      const armBaseY = floor.y + floor.h * 0.10;
      const midX = lerp(armBaseX, px, 0.52) + Math.sin(t * 2.2) * domLen * 0.4;
      const midY = lerp(armBaseY, py, 0.52) + Math.cos(t * 2.0) * domLen * 0.4;

      ctx.save();
      ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.4));
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(220,235,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(armBaseX, armBaseY);
      ctx.lineTo(midX, midY);
      ctx.lineTo(px, py);
      ctx.stroke();

      // end effector
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(255, 235, 160, 0.85)';
      roundRect(ctx, px - domWid * 0.9, py - domWid * 0.9, domWid * 1.8, domWid * 1.8, domWid * 0.5);
      ctx.fill();

      // pulse ring
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = 'rgba(255, 235, 160, 0.85)';
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      ctx.beginPath();
      ctx.arc(px, py, domLen * (0.65 + 0.25 * Math.sin(t * 6)), 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // spark moment
    if (spark > 0.01){
      const a = 0.15 + 0.35 * spark;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255, 245, 200, ${a})`;
      ctx.fillRect(floor.x, floor.y, floor.w, floor.h);
      ctx.restore();
    }

    // alarm flash
    if (alarm > 0.01){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255, 60, 80, ${0.10 + 0.22 * alarm})`;
      ctx.fillRect(floor.x, floor.y, floor.w, floor.h);
      ctx.restore();
    }

    // HUD
    drawHUD(ctx, placed, phaseName);

    ctx.restore();
  }

  return {
    onResize,
    onAudioOn,
    onAudioOff,
    update,
    draw,
    destroy,
  };
}
