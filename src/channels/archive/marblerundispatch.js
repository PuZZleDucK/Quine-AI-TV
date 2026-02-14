import { mulberry32, clamp } from '../util/prng.js';

// Marble Run Dispatch
// Marble-run routing network: SORT → EXPRESS → JAM CLEAR phases
// with switch-gates, route labels, and a satisfying cascade finale.

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

function buildPath(pts){
  // pts: [[x,y],...]
  const seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++){
    const x0 = pts[i][0], y0 = pts[i][1];
    const x1 = pts[i+1][0], y1 = pts[i+1][1];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.max(1e-6, Math.hypot(dx, dy));
    seg.push({ x0, y0, x1, y1, len });
    total += len;
  }
  return { pts, seg, total };
}

function samplePath(path, s){
  // s in [0,1]
  const d = clamp01(s) * path.total;
  let acc = 0;
  for (let i = 0; i < path.seg.length; i++){
    const g = path.seg[i];
    if (acc + g.len >= d){
      const u = (d - acc) / g.len;
      return {
        x: lerp(g.x0, g.x1, u),
        y: lerp(g.y0, g.y1, u),
        a: Math.atan2(g.y1 - g.y0, g.x1 - g.x0),
      };
    }
    acc += g.len;
  }
  const last = path.seg[path.seg.length - 1];
  return { x: last.x1, y: last.y1, a: Math.atan2(last.y1 - last.y0, last.x1 - last.x0) };
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // phases
  const PHASES = [
    { id: 'sort', label: 'SORT', dur: 18 },
    { id: 'express', label: 'EXPRESS', dur: 14 },
    { id: 'jam', label: 'JAM CLEAR', dur: 12 },
    { id: 'finale', label: 'CASCADE FINALE', dur: 8 },
  ];
  const CYCLE_DUR = PHASES.reduce((a, p) => a + p.dur, 0);

  let phaseIdx = 0;
  let phaseT = 0;
  let cycleIdx = -1;

  // layout
  let frame = { x:0, y:0, w:0, h:0, r:12 };
  let paths = []; // built per-cycle (deterministic variety)
  let bins = []; // {name, x,y,w,h}
  let gate = { a: 0, b: 0 }; // 0..1 position (visual)
  let gateTarget = { a: 0, b: 0 };
  let nextGateFlipAt = 0;

  // jam control
  let jam = {
    active: false,
    holdS: 0.42,
    clearedAt: 0,
    pulse: 0,
  };

  // marbles
  const MAX = 70;
  const marbles = new Array(MAX);
  const free = [];
  let marbleCount = 0;
  let spawnAcc = 0;
  let burst = 0;

  // fx
  let flash = 0;
  let glint = 0;
  let nextGlintAt = 0;

  // audio
  let bed = null;
  let lastGateClickAt = -1;

  function resetPools(){
    marbleCount = 0;
    free.length = 0;
    for (let i = 0; i < MAX; i++){
      marbles[i] = null;
      free.push(i);
    }
  }

  function rebuildLayout(){
    const pad = Math.min(w, h) * 0.07;
    frame.x = pad;
    frame.y = pad;
    frame.w = w - pad * 2;
    frame.h = h - pad * 2;
    frame.r = Math.max(10, Math.min(frame.w, frame.h) * 0.03);

    const bx = frame.x + frame.w * 0.10;
    const by = frame.y + frame.h * 0.78;
    const bw = frame.w * 0.80;
    const bh = frame.h * 0.16;

    const gap = bw * 0.02;
    const cell = (bw - gap * 2) / 3;
    bins = [
      { name: 'BAY A', x: bx, y: by, w: cell, h: bh },
      { name: 'BAY B', x: bx + cell + gap, y: by, w: cell, h: bh },
      { name: 'BAY C', x: bx + (cell + gap) * 2, y: by, w: cell, h: bh },
    ];
  }

  function pickRoutesForCycle(c){
    // derived deterministic rng for this cycle
    const rr = mulberry32(((seed ^ (c * 0x9e3779b9)) >>> 0));

    const sx = frame.x + frame.w * (0.15 + rr() * 0.12);
    const sy = frame.y + frame.h * 0.14;

    const midX = frame.x + frame.w * (0.50 + (rr() * 2 - 1) * 0.04);
    const midY = frame.y + frame.h * 0.44;

    const g1x = frame.x + frame.w * (0.36 + (rr() * 2 - 1) * 0.05);
    const g1y = frame.y + frame.h * (0.34 + (rr() * 2 - 1) * 0.03);

    const g2x = frame.x + frame.w * (0.64 + (rr() * 2 - 1) * 0.05);
    const g2y = frame.y + frame.h * (0.50 + (rr() * 2 - 1) * 0.03);

    // endpoints for the three bays (entry points)
    const eA = [bins[0].x + bins[0].w * 0.50, bins[0].y + bins[0].h * 0.18];
    const eB = [bins[1].x + bins[1].w * 0.50, bins[1].y + bins[1].h * 0.18];
    const eC = [bins[2].x + bins[2].w * 0.50, bins[2].y + bins[2].h * 0.18];

    // A/B/C routes share the first gate, then diverge.
    const wob1 = (rr() * 2 - 1) * frame.w * 0.04;
    const wob2 = (rr() * 2 - 1) * frame.w * 0.04;

    const pA = buildPath([
      [sx, sy],
      [sx + frame.w * 0.05, sy + frame.h * 0.10],
      [g1x, g1y],
      [midX - frame.w * 0.22 + wob1, midY - frame.h * 0.02],
      [eA[0], eA[1]],
    ]);

    const pB = buildPath([
      [sx, sy],
      [sx + frame.w * 0.07, sy + frame.h * 0.11],
      [g1x, g1y],
      [midX + (rr() * 2 - 1) * frame.w * 0.04, midY],
      [g2x, g2y],
      [eB[0], eB[1]],
    ]);

    const pC = buildPath([
      [sx, sy],
      [sx + frame.w * 0.08, sy + frame.h * 0.12],
      [g1x, g1y],
      [midX + frame.w * 0.22 + wob2, midY - frame.h * 0.02],
      [g2x, g2y],
      [eC[0], eC[1]],
    ]);

    // express bypass (slingshots directly to Bay C-ish, visually distinct)
    const ex = frame.x + frame.w * 0.88;
    const ey = frame.y + frame.h * 0.40;
    const pX = buildPath([
      [sx, sy],
      [sx + frame.w * 0.18, sy + frame.h * 0.08],
      [midX + frame.w * 0.26, midY - frame.h * 0.18],
      [ex, ey],
      [eC[0], eC[1]],
    ]);

    paths = [pA, pB, pC, pX];

    // gate timing
    nextGateFlipAt = 1.2 + rr() * 1.8;
    gate.a = rr() < 0.5 ? 0 : 1;
    gate.b = rr() < 0.5 ? 0 : 1;
    gateTarget.a = gate.a;
    gateTarget.b = gate.b;

    // jam profile
    jam.active = false;
    jam.holdS = 0.40 + rr() * 0.09;
    jam.clearedAt = 0;
    jam.pulse = 0;

    // fx schedule
    nextGlintAt = 3 + rr() * 4;
    glint = 0;

    resetPools();
    spawnAcc = 0;
    burst = 0;
  }

  function onResize(width, height, dpr_){
    w = width;
    h = height;
    dpr = dpr_ || 1;
    rebuildLayout();
    cycleIdx = -1; // force re-pick
  }

  function init({ width, height, dpr: dpr_ }){
    onResize(width, height, dpr_ || 1);
  }

  function gateClick(which){
    if (!audio.enabled) return;
    const now = t;
    // avoid click storms if dt jitter flips twice
    if (now - lastGateClickAt < 0.08) return;
    lastGateClickAt = now;
    audio.beep({ freq: which === 'a' ? 420 : 520, dur: 0.04, gain: 0.022, type: 'square' });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    bed = audio.noiseSource({ type: 'brown', gain: 0.020 });
    try { bed.start(); } catch {}
    audio.setCurrent({
      stop(){
        try { bed?.stop?.(); } catch {}
      }
    });
  }

  function onAudioOff(){
    try { bed?.stop?.(); } catch {}
    bed = null;
  }

  function destroy(){
    onAudioOff();
  }

  function spawnMarble({ dest = 0, pathI = 0, speed = 0.22, hue = 40 } = {}){
    if (!free.length) return;
    const idx = free.pop();
    marbles[idx] = {
      alive: true,
      dest,
      pathI,
      s: 0,
      v: speed,
      r: Math.max(3, Math.min(w, h) * 0.010),
      hue,
      jammed: false,
      wob: rand() * Math.PI * 2,
    };
    marbleCount++;
  }

  function killMarble(i){
    if (!marbles[i]) return;
    marbles[i] = null;
    free.push(i);
    marbleCount = Math.max(0, marbleCount - 1);
  }

  function phaseForTime(tt){
    let acc = 0;
    for (let i = 0; i < PHASES.length; i++){
      const p = PHASES[i];
      if (tt < acc + p.dur) return { idx: i, t: tt - acc, p };
      acc += p.dur;
    }
    const last = PHASES[PHASES.length - 1];
    return { idx: PHASES.length - 1, t: last.dur, p: last };
  }

  function updateGates(dt, p){
    // gate positions ease towards target (visual)
    gate.a = lerp(gate.a, gateTarget.a, 1 - Math.pow(0.00001, dt));
    gate.b = lerp(gate.b, gateTarget.b, 1 - Math.pow(0.00001, dt));

    // control logic
    if (phaseT >= nextGateFlipAt){
      if (p.id === 'sort'){
        // flip A gate every few seconds; B gate slower
        gateTarget.a = gateTarget.a < 0.5 ? 1 : 0;
        gateClick('a');
        if (((phaseT / 6) | 0) !== (((nextGateFlipAt) / 6) | 0)){
          gateTarget.b = gateTarget.b < 0.5 ? 1 : 0;
          gateClick('b');
        }
        nextGateFlipAt = phaseT + 2.0 + rand() * 1.8;
      } else if (p.id === 'express'){
        // lock gates for express bypass; tiny wiggle for life
        gateTarget.a = 1;
        gateTarget.b = 1;
        nextGateFlipAt = phaseT + 1.6 + rand() * 1.3;
        if (audio.enabled) audio.beep({ freq: 640, dur: 0.03, gain: 0.012, type: 'triangle' });
      } else if (p.id === 'jam'){
        // alternate: closed (0) then open (1) to clear
        const open = (Math.sin(phaseT * 0.8) > 0.4) ? 1 : 0;
        if ((gateTarget.b < 0.5) !== (open < 0.5)) gateClick('b');
        gateTarget.b = open;
        nextGateFlipAt = phaseT + 1.2 + rand() * 0.9;
      } else {
        // finale: fully open
        gateTarget.a = 1;
        gateTarget.b = 1;
        nextGateFlipAt = phaseT + 999;
      }
    }
  }

  function update(dt){
    t += dt;

    const c = Math.floor(t / CYCLE_DUR);
    if (c !== cycleIdx){
      cycleIdx = c;
      rebuildLayout();
      pickRoutesForCycle(cycleIdx);
    }

    const u = t - cycleIdx * CYCLE_DUR;
    const ph = phaseForTime(u);
    phaseIdx = ph.idx;
    phaseT = ph.t;

    // fx
    flash = Math.max(0, flash - dt * 1.8);
    glint = Math.max(0, glint - dt * 2.2);

    if (phaseT >= nextGlintAt){
      glint = 1;
      nextGlintAt = phaseT + 3.5 + rand() * 5;
    }

    // jam logic
    if (ph.p.id === 'jam'){
      if (!jam.active && phaseT > 1.2){
        jam.active = true;
        jam.clearedAt = 0;
      }
      // at ~mid-phase, force a clear event
      if (jam.active && !jam.clearedAt && phaseT > (PHASES[2].dur * 0.55)){
        jam.clearedAt = t;
        jam.pulse = 1;
        flash = 0.75;
        if (audio.enabled){
          audio.beep({ freq: 220, dur: 0.08, gain: 0.028, type: 'sawtooth' });
          audio.beep({ freq: 330, dur: 0.08, gain: 0.022, type: 'triangle' });
          audio.beep({ freq: 520, dur: 0.06, gain: 0.018, type: 'square' });
        }
      }
    } else {
      jam.active = false;
      jam.pulse = Math.max(0, jam.pulse - dt * 2.6);
    }

    updateGates(dt, ph.p);

    // spawn schedule
    let rate = 2.4; // marbles/sec baseline
    if (ph.p.id === 'sort') rate = 2.8;
    else if (ph.p.id === 'express') rate = 3.6;
    else if (ph.p.id === 'jam') rate = 2.2;
    else rate = 7.5; // finale

    spawnAcc += dt * rate;

    // in express/finale, do occasional bursts
    if ((ph.p.id === 'express' && phaseT > 1.0 && burst <= 0) || (ph.p.id === 'finale' && burst <= 0)){
      if (rand() < (ph.p.id === 'finale' ? 0.22 : 0.10)) burst = ph.p.id === 'finale' ? 10 : 6;
    }

    while (spawnAcc >= 1){
      spawnAcc -= 1;

      const dest = (rand() * 3) | 0;
      let pathI = dest;
      let speed = 0.22 + rand() * 0.08;

      if (ph.p.id === 'express'){
        pathI = 3; // express bypass
        speed = 0.30 + rand() * 0.10;
      } else if (ph.p.id === 'finale'){
        pathI = rand() < 0.32 ? 3 : dest;
        speed = 0.34 + rand() * 0.14;
      } else if (ph.p.id === 'jam'){
        pathI = 1; // bias to Bay B (where jam holds)
        speed = 0.20 + rand() * 0.06;
      }

      const hue = pick(rand, [38, 46, 56, 170, 200]);
      spawnMarble({ dest, pathI, speed, hue });
    }

    if (burst > 0){
      burst--;
      const dest = (rand() * 3) | 0;
      const hue = pick(rand, [38, 56, 180, 210]);
      spawnMarble({ dest, pathI: rand() < 0.35 ? 3 : dest, speed: 0.36 + rand() * 0.16, hue });
      if (audio.enabled && (burst % 3) === 0){
        audio.beep({ freq: 700 + (burst % 5) * 40, dur: 0.03, gain: 0.010, type: 'triangle' });
      }
    }

    // update marbles
    for (let i = 0; i < MAX; i++){
      const m = marbles[i];
      if (!m) continue;

      const path = paths[m.pathI] || paths[0];

      // jam hold behavior: freeze at holdS on Bay B path until cleared
      if (jam.active && m.pathI === 1 && !jam.clearedAt){
        if (m.s >= jam.holdS){
          m.s = jam.holdS;
          m.jammed = true;
        }
      }

      if (m.jammed && jam.clearedAt){
        m.jammed = false;
        m.v *= 1.6;
      }

      // gate influence (visual route feel): slight slowdowns around gates
      const slow = (m.s > 0.18 && m.s < 0.30) || (m.s > 0.55 && m.s < 0.67);
      const v = m.v * (slow ? 0.85 : 1.0);
      m.s += dt * v;

      if (m.s >= 1.03){
        killMarble(i);
      }
    }
  }

  function drawTrack(ctx, path, widthPx, baseCol, glowCol, stripeSpeed){
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // base
    ctx.strokeStyle = baseCol;
    ctx.lineWidth = widthPx;
    ctx.beginPath();
    for (let i = 0; i < path.pts.length; i++){
      const p = path.pts[i];
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();

    // glow overlay
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = glowCol;
    ctx.lineWidth = Math.max(1, widthPx * 0.55);
    ctx.globalAlpha = 0.55;
    ctx.stroke();

    // moving stripes (cheap dashes)
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1, widthPx * 0.20);

    const dash = Math.max(10, widthPx * 0.9);
    const gap = dash * 1.4;
    const off = -((t * stripeSpeed) % (dash + gap));
    ctx.setLineDash([dash, gap]);
    ctx.lineDashOffset = off;
    ctx.stroke();

    ctx.restore();
  }

  function drawGate(ctx, x, y, a, amt, label){
    // simple 2-position switch arm
    const arm = Math.min(w, h) * 0.045;
    const ang0 = a - 0.75;
    const ang1 = a + 0.75;
    const th = lerp(ang0, ang1, ease(amt));

    ctx.save();
    ctx.translate(x, y);

    // base plate
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(20,28,38,0.9)';
    roundRect(ctx, -arm * 0.55, -arm * 0.34, arm * 1.10, arm * 0.68, arm * 0.22);
    ctx.fill();

    // pivot
    ctx.fillStyle = 'rgba(255,235,160,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, arm * 0.12, 0, Math.PI * 2);
    ctx.fill();

    // arm
    ctx.strokeStyle = 'rgba(220,240,255,0.9)';
    ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.4));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(th) * arm, Math.sin(th) * arm);
    ctx.stroke();

    // label
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(245,245,248,0.85)';
    ctx.font = `${Math.max(10, Math.floor(Math.min(w, h) * 0.020))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, 0, arm * 0.42);

    ctx.restore();
  }

  function drawBins(ctx){
    ctx.save();
    for (let i = 0; i < bins.length; i++){
      const b = bins[i];
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(10,14,20,0.90)';
      roundRect(ctx, b.x, b.y, b.w, b.h, Math.min(18, b.h * 0.22));
      ctx.fill();

      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = 'rgba(150,220,255,0.9)';
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      ctx.stroke();

      // fill animation
      const fill = 0.22 + 0.18 * Math.sin(t * 0.7 + i * 1.7);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, `rgba(120,220,255,${0.08 + fill * 0.12})`);
      g.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.restore();

      // text
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(245,245,248,0.82)';
      ctx.font = `${Math.max(12, Math.floor(Math.min(w, h) * 0.022))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'top';
      ctx.fillText(b.name, b.x + b.w * 0.06, b.y + b.h * 0.12);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawHUD(ctx, ph){
    const x = frame.x + frame.w * 0.03;
    const y = frame.y + frame.h * 0.04;

    ctx.save();
    ctx.font = `${Math.max(14, Math.floor(Math.min(w, h) * 0.026))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';

    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.fillText('MARBLE RUN DISPATCH', x, y);

    ctx.font = `${Math.max(12, Math.floor(Math.min(w, h) * 0.022))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(150,220,255,0.85)';
    ctx.fillText(`PHASE: ${ph.p.label}`, x, y + 22 * dpr);

    ctx.fillStyle = 'rgba(255,235,160,0.85)';
    const mm = String(marbleCount).padStart(2, '0');
    ctx.fillText(`IN-FLIGHT: ${mm}   SEED: ${seed}`, x, y + 42 * dpr);

    if (jam.active && !jam.clearedAt){
      ctx.fillStyle = 'rgba(255,90,90,0.85)';
      ctx.fillText('JAM DETECTED', x, y + 62 * dpr);
    }

    ctx.restore();
  }

  function render(ctx){
    if (!w || !h) return;

    // background
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#05080c';
    ctx.fillRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, frame.y, 0, frame.y + frame.h);
    bg.addColorStop(0, '#0b1118');
    bg.addColorStop(0.55, '#070b11');
    bg.addColorStop(1, '#05070b');

    ctx.save();
    roundRect(ctx, frame.x, frame.y, frame.w, frame.h, frame.r);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();

    // subtle scanlines
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#000';
    const step = Math.max(2, Math.floor(3 * dpr));
    for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, 1);
    ctx.restore();

    // phase
    const u = t - cycleIdx * CYCLE_DUR;
    const ph = phaseForTime(u);

    // tracks
    const trackW = Math.max(6, Math.min(w, h) * 0.016);
    drawTrack(ctx, paths[0], trackW, 'rgba(22,30,42,0.95)', 'rgba(120,220,255,0.55)', 70);
    drawTrack(ctx, paths[1], trackW, 'rgba(18,26,38,0.95)', 'rgba(255,220,150,0.45)', 78);
    drawTrack(ctx, paths[2], trackW, 'rgba(22,30,42,0.95)', 'rgba(170,240,255,0.45)', 74);
    drawTrack(ctx, paths[3], trackW * 0.9, 'rgba(16,22,32,0.95)', 'rgba(255,140,200,0.40)', 96);

    // bins + floor widgets
    drawBins(ctx);

    // gates (placed near the first/second junctions on the shared paths)
    const gA = samplePath(paths[1], 0.32);
    const gB = samplePath(paths[2], 0.56);
    drawGate(ctx, gA.x, gA.y, gA.a, gate.a, 'GATE A');
    drawGate(ctx, gB.x, gB.y, gB.a, gate.b, 'GATE B');

    // marbles
    ctx.save();
    for (let i = 0; i < MAX; i++){
      const m = marbles[i];
      if (!m) continue;
      const path = paths[m.pathI] || paths[0];
      const p = samplePath(path, m.s);

      const wob = Math.sin(t * 6.2 + m.wob) * 0.6;
      const ox = Math.cos(p.a + Math.PI * 0.5) * wob;
      const oy = Math.sin(p.a + Math.PI * 0.5) * wob;

      const r = m.r * (m.jammed ? 1.05 : 1);
      const a = m.jammed ? 0.55 : 0.9;

      ctx.save();
      ctx.translate(p.x + ox, p.y + oy);

      // shadow
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.beginPath();
      ctx.ellipse(1.5, 2.0, r * 1.15, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();

      // body
      ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 1, 0, 0, r * 1.4);
      g.addColorStop(0, `hsla(${m.hue}, 95%, 78%, 0.98)`);
      g.addColorStop(0.55, `hsla(${m.hue}, 90%, 55%, 0.92)`);
      g.addColorStop(1, 'rgba(0,0,0,0.1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // highlight
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(-r * 0.28, -r * 0.28, r * 0.28, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
    ctx.restore();

    // jam pulse overlay
    if (jam.pulse > 0.01){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255, 90, 90, ${0.10 + 0.22 * jam.pulse})`;
      ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
      ctx.restore();
    }

    // glint overlay
    if (glint > 0.01 && ph.p.id !== 'jam'){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255, 245, 200, ${0.05 + 0.12 * glint})`;
      ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
      ctx.restore();
    }

    if (flash > 0.01){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255, 210, 210, ${flash * 0.14})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    drawHUD(ctx, ph);
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
