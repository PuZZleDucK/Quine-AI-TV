import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// Harbor Tug Dispatch
// Port map dispatch: tug lines guide ship silhouettes; tide gauge + squall pulses,
// with a satisfying docked “ALL CLEAR” stamp.
// REVIEWED: 2026-02-13

function lerp(a, b, t){ return a + (b - a) * t; }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function ease(t){ t = clamp01(t); return t * t * (3 - 2 * t); }

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
  const seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++){
    const x0 = pts[i][0], y0 = pts[i][1];
    const x1 = pts[i+1][0], y1 = pts[i+1][1];
    const len = Math.max(1e-6, Math.hypot(x1 - x0, y1 - y0));
    seg.push({ x0, y0, x1, y1, len });
    total += len;
  }
  return { pts, seg, total };
}

function samplePath(path, s){
  const d = clamp01(s) * path.total;
  let acc = 0;
  for (let i = 0; i < path.seg.length; i++){
    const g = path.seg[i];
    if (acc + g.len >= d){
      const u = (d - acc) / g.len;
      const x = lerp(g.x0, g.x1, u);
      const y = lerp(g.y0, g.y1, u);
      const a = Math.atan2(g.y1 - g.y0, g.x1 - g.x0);
      return { x, y, a };
    }
    acc += g.len;
  }
  const last = path.seg[path.seg.length - 1];
  return { x: last.x1, y: last.y1, a: Math.atan2(last.y1 - last.y0, last.x1 - last.x0) };
}

function buildVHFLog(seed){
  const rr = mulberry32(((seed ^ 0x7a2f3d91) >>> 0));

  const tugs = [
    'GANNET', 'BRACKEN', 'WIDGEON', 'MULLET', 'KITE', 'PUFFIN', 'OTTER', 'SKUA',
    'HARBOR-3', 'HARBOR-7', 'LINE-2'
  ];
  const places = [
    'FAIRWAY', 'BUOY 1', 'BUOY 2', 'BUOY 3', 'BUOY 4', 'BUOY 5', 'PIER 2', 'PIER 3',
    'OUTER BASIN', 'INNER BASIN', 'LOCK GATE', 'TURNING CIRCLE', 'FUEL DOCK'
  ];
  const cargo = [
    'CONTAINER', 'BULK', 'TANKER', 'RO/RO', 'FISHER', 'BARGE', 'COASTER'
  ];
  const cmds = [
    'HOLD POSITION', 'STANDBY', 'MAINTAIN SAFE SPEED', 'CLEAR THE FAIRWAY',
    'MAKE UP ON STARBOARD', 'MAKE UP ON PORT', 'SHIFT 20M AHEAD', 'SHIFT 20M ASTERN',
    'CHECK LINES', 'REPORT VISIBILITY', 'CONFIRM ETA', 'SECURE TOWLINE',
    'WAIT FOR PILOT', 'FOLLOW LEAD LIGHTS'
  ];
  const oddities = [
    'SEAGULL WATCH ACTIVE — SECURE SNACKS',
    'MYSTERY HORN AGAIN. NOT US.',
    'COFFEE RUN AUTHORISED (ONE CUP PER CREW)',
    'FLOATING PALLET REPORTED — KEEP CLEAR',
    'RADAR GHOST ON THE NORTH RANGE',
    'DOLPHIN SIGHTING — SPEED RESTRICT',
    'TIDE GAUGE DRIFTING; TRUST YOUR EYES'
  ];

  const out = [];
  const seen = new Set();
  const N = 96; // 96 * 4s = 384s (> 5 min) without repeats.

  for (let i = 0; i < N; i++){
    let msg = '';
    let guard = 0;
    while (guard++ < 40){
      const ch = 10 + ((rr() * 7) | 0); // 10–16
      const tug = tugs[(rr() * tugs.length) | 0];
      const where = places[(rr() * places.length) | 0];
      const cmd = cmds[(rr() * cmds.length) | 0];
      const ref = 100 + ((rr() * 900) | 0);

      if (rr() < 0.18){
        const o = oddities[(rr() * oddities.length) | 0];
        msg = `CH ${ch} DISPATCH: ${o} (REF ${ref})`;
      } else if (rr() < 0.55){
        const kind = cargo[(rr() * cargo.length) | 0];
        msg = `CH ${ch} DISPATCH: ${tug} — ${cmd} @ ${where} (${kind}) REF ${ref}`;
      } else {
        msg = `CH ${ch} ${tug}: ${cmd} @ ${where}. REF ${ref}`;
      }

      if (!seen.has(msg)){
        seen.add(msg);
        break;
      }
    }

    if (!msg){
      msg = `CH 12 DISPATCH: STANDBY FOR INSTRUCTION. REF ${100 + i}`;
    }
    out.push(msg);
  }

  return out;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  // Seeded rotating VHF dispatch log strip (5+ min before repeating).
  const VHF_LOG = buildVHFLog(seed);
  const VHF_INTERVAL = 4.0;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  const PHASES = [
    { id: 'inbound', label: 'INBOUND', dur: 16 },
    { id: 'dock', label: 'DOCKING', dur: 12 },
    { id: 'squall', label: 'SQUALL', dur: 8 },
    { id: 'clear', label: 'ALL CLEAR', dur: 6 },
  ];
  const CYCLE_DUR = PHASES.reduce((a, p) => a + p.dur, 0);

  let cycleIdx = -1;
  let phase = PHASES[0];
  let phaseT = 0;
  let lastPhaseId = '';

  // layout
  let frame = { x:0, y:0, w:0, h:0, r:14 };
  let dock = { x:0, y:0, w:0, h:0, side: 'left' };
  let shipPath = null;
  let routePath = null;
  let buoys = [];

  // cached paints (perf)
  let mapWaterGrad = null;
  let mapWaterGradCtx = null;

  let tideGaugeGrad = null;
  let tideGaugeGradCtx = null;
  let tideGaugeGradKey = '';

  let scanlineSrc = null;
  let scanlinePat = null;
  let scanlinePatCtx = null;
  let scanlinePatKey = '';

  function invalidatePaintCache(){
    mapWaterGrad = null;
    mapWaterGradCtx = null;

    tideGaugeGrad = null;
    tideGaugeGradCtx = null;
    tideGaugeGradKey = '';

    scanlineSrc = null;
    scanlinePat = null;
    scanlinePatCtx = null;
    scanlinePatKey = '';
  }

  function getMapWaterGradient(ctx){
    // Rebuild only on resize (cache invalidated) or when ctx swaps.
    if (mapWaterGrad && mapWaterGradCtx === ctx) return mapWaterGrad;

    const g = ctx.createLinearGradient(0, frame.y, 0, frame.y + frame.h);
    g.addColorStop(0, '#061523');
    g.addColorStop(0.55, '#041019');
    g.addColorStop(1, '#030a10');

    mapWaterGrad = g;
    mapWaterGradCtx = ctx;
    return g;
  }

  function getTideGaugeGradient(ctx, gx, gw){
    // Rebuild only on resize (cache invalidated), ctx swap, or gauge geometry change.
    const key = `${gx}|${gw}`;
    if (tideGaugeGrad && tideGaugeGradCtx === ctx && tideGaugeGradKey === key) return tideGaugeGrad;

    const g = ctx.createLinearGradient(gx, 0, gx + gw, 0);
    g.addColorStop(0, 'rgba(120,240,255,0.0)');
    g.addColorStop(1, 'rgba(120,240,255,0.9)');

    tideGaugeGrad = g;
    tideGaugeGradCtx = ctx;
    tideGaugeGradKey = key;
    return g;
  }

  function getScanlinePattern(ctx){
    const step = Math.max(2, Math.floor(3 * dpr));
    const key = `${step}`;
    if (scanlinePat && scanlinePatCtx === ctx && scanlinePatKey === key) return scanlinePat;

    if (!scanlineSrc || scanlineSrc.height !== step){
      scanlineSrc = document.createElement('canvas');
      scanlineSrc.width = 4;
      scanlineSrc.height = step;
      const g = scanlineSrc.getContext('2d');
      g.clearRect(0, 0, scanlineSrc.width, scanlineSrc.height);
      g.fillStyle = '#000';
      g.fillRect(0, 0, scanlineSrc.width, 1);
    }

    scanlinePat = ctx.createPattern(scanlineSrc, 'repeat');
    scanlinePatCtx = ctx;
    scanlinePatKey = key;
    return scanlinePat;
  }

  // animation
  let flash = 0;
  let nextFlashAt = 0;
  let stamp = { a: 0, rot: 0, s: 1 };

  // special moments (rare, deterministic; clean reset)
  const specialRR = mulberry32(((seed ^ 0x3c1f9b15) >>> 0));
  const fogAt = 45 + specialRR() * 55; // 45–100s
  const fogDur = 7.5 + specialRR() * 2.5;
  const sweepAt = Math.min(120, fogAt + 14 + specialRR() * 18);
  const sweepDur = 6.0 + specialRR() * 2.0;

  let fog = { a: 0, start: -1, dur: fogDur };
  let sweep = { a: 0, start: -1, dur: sweepDur };
  let fogFired = false;
  let sweepFired = false;

  // audio
  let bed = null;
  let drone = null;

  function phaseForTime(tt){
    let acc = 0;
    for (let i = 0; i < PHASES.length; i++){
      const p = PHASES[i];
      if (tt < acc + p.dur) return { p, t: tt - acc };
      acc += p.dur;
    }
    return { p: PHASES[PHASES.length - 1], t: PHASES[PHASES.length - 1].dur };
  }

  function rebuildLayout(){
    const pad = Math.min(w, h) * 0.07;
    frame.x = pad;
    frame.y = pad;
    frame.w = w - pad * 2;
    frame.h = h - pad * 2;
    frame.r = Math.max(12, Math.min(frame.w, frame.h) * 0.03);
  }

  function pickForCycle(c){
    const rr = mulberry32(((seed ^ (c * 0x9e3779b9)) >>> 0));

    // dock placement
    dock.side = rr() < 0.55 ? 'left' : 'bottom';
    if (dock.side === 'left'){
      dock.w = frame.w * (0.10 + rr() * 0.05);
      dock.h = frame.h * (0.38 + rr() * 0.20);
      dock.x = frame.x + frame.w * (0.08 + rr() * 0.04);
      dock.y = frame.y + frame.h * (0.30 + rr() * 0.34);
    } else {
      dock.h = frame.h * (0.10 + rr() * 0.05);
      dock.w = frame.w * (0.40 + rr() * 0.25);
      dock.x = frame.x + frame.w * (0.32 + rr() * 0.30);
      dock.y = frame.y + frame.h * (0.78 + rr() * 0.06);
    }

    // ship path points (piecewise linear, looks "charted")
    const sx = frame.x + frame.w * 1.10;
    const sy = frame.y + frame.h * (0.30 + rr() * 0.42);

    const mid1 = [frame.x + frame.w * (0.78 + (rr() * 2 - 1) * 0.06), frame.y + frame.h * (0.28 + rr() * 0.44)];
    const mid2 = [frame.x + frame.w * (0.58 + (rr() * 2 - 1) * 0.06), frame.y + frame.h * (0.30 + rr() * 0.40)];

    let ex, ey;
    if (dock.side === 'left'){
      ex = dock.x + dock.w * 1.10;
      ey = dock.y + dock.h * (0.50 + (rr() * 2 - 1) * 0.08);
    } else {
      ex = dock.x + dock.w * (0.50 + (rr() * 2 - 1) * 0.10);
      ey = dock.y - dock.h * 1.20;
    }

    shipPath = buildPath([
      [sx, sy],
      mid1,
      mid2,
      [ex, ey],
    ]);

    routePath = buildPath([
      [frame.x + frame.w * 0.92, frame.y + frame.h * 0.14],
      [frame.x + frame.w * 0.70, frame.y + frame.h * 0.22],
      [frame.x + frame.w * 0.56, frame.y + frame.h * 0.38],
      [frame.x + frame.w * 0.46, frame.y + frame.h * 0.56],
      [dock.x + dock.w * 1.0, dock.y + dock.h * 0.5],
    ]);

    // buoys
    const n = 9 + ((rr() * 6) | 0);
    buoys = Array.from({ length: n }, (_, i) => ({
      x: frame.x + frame.w * (0.18 + rr() * 0.78),
      y: frame.y + frame.h * (0.16 + rr() * 0.70),
      r: Math.max(2.2, Math.min(w, h) * (0.0045 + rr() * 0.0025)),
      ph: rr() * Math.PI * 2,
      hue: rr() < 0.5 ? 38 : 190,
      keep: i,
    }));

    flash = 0;
    nextFlashAt = 2.5 + rr() * 5;
    stamp = { a: 0, rot: (rr() * 2 - 1) * 0.18, s: 1 };
  }

  function onResize(width, height, dpr_){
    w = width;
    h = height;
    dpr = dpr_ || 1;
    invalidatePaintCache();
    rebuildLayout();
    cycleIdx = -1; // repick
  }

  function init({ width, height, dpr: dpr_ }){
    onResize(width, height, dpr_ || 1);
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive/idempotent: ensure repeated calls don't stack sources.
    onAudioOff();

    const bed_ = audio.noiseSource({ type: 'brown', gain: 0.018 });
    const drone_ = simpleDrone(audio, { root: 55, detune: 1.1, gain: 0.030 });

    bed = bed_;
    drone = drone_;

    try { bed_.start(); } catch {}

    // IMPORTANT: capture local refs so AudioManager.stopCurrent() can't accidentally
    // stop *new* sources due to outer-variable mutation.
    audio.setCurrent({
      stop(){
        try { bed_?.stop?.(); } catch {}
        try { drone_?.stop?.(); } catch {}
        if (bed === bed_) bed = null;
        if (drone === drone_) drone = null;
      }
    });
  }

  function onAudioOff(){
    try { bed?.stop?.(); } catch {}
    try { drone?.stop?.(); } catch {}
    bed = null;
    drone = null;
  }

  function destroy(){
    onAudioOff();
  }

  function phaseBeep(id){
    if (!audio.enabled) return;
    if (id === 'dock') audio.beep({ freq: 220, dur: 0.07, gain: 0.018, type: 'triangle' });
    else if (id === 'squall'){
      audio.beep({ freq: 520, dur: 0.05, gain: 0.014, type: 'square' });
      audio.beep({ freq: 420, dur: 0.07, gain: 0.012, type: 'sawtooth' });
    }
    else if (id === 'clear'){
      audio.beep({ freq: 180, dur: 0.04, gain: 0.018, type: 'square' });
      audio.beep({ freq: 360, dur: 0.06, gain: 0.012, type: 'triangle' });
    }
  }

  function momentAlpha(tt, dur){
    const fi = clamp01(tt / 0.9);
    const fo = clamp01((dur - tt) / 1.2);
    return ease(Math.min(fi, fo));
  }

  function update(dt){
    t += dt;

    const c = Math.floor(t / CYCLE_DUR);
    if (c !== cycleIdx){
      cycleIdx = c;
      rebuildLayout();
      pickForCycle(cycleIdx);
      lastPhaseId = '';
    }

    const u = t - cycleIdx * CYCLE_DUR;
    const ph = phaseForTime(u);
    phase = ph.p;
    phaseT = ph.t;

    if (phase.id !== lastPhaseId){
      phaseBeep(phase.id);
      lastPhaseId = phase.id;
    }

    // lightning flash only in squall
    // Determinism: schedule via the *previous scheduled time* (not the observed phaseT)
    // so 30fps vs 60fps hits the same flash times at the same capture offsets.
    flash = Math.max(0, flash - dt * 2.0);
    if (phase.id === 'squall'){
      // Catch up in case we overshot nextFlashAt this frame.
      let guard = 0;
      while (phaseT >= nextFlashAt && guard++ < 4){
        flash = 0.9;
        nextFlashAt += 1.2 + rand() * 2.8;
        if (audio.enabled) audio.beep({ freq: 90, dur: 0.08, gain: 0.020, type: 'sine' });
      }
    }

    // special moments (fog horn + security sweep)
    if (!fogFired && t >= fogAt){
      fogFired = true;
      fog.start = t;
      if (audio.enabled){
        // Non-stacking cue: one-time short "horn".
        audio.beep({ freq: 110, dur: 0.70, gain: 0.020, type: 'triangle' });
        audio.beep({ freq: 82, dur: 0.85, gain: 0.012, type: 'sine' });
      }
    }
    if (fog.start >= 0){
      const tt = t - fog.start;
      if (tt <= fog.dur) fog.a = momentAlpha(tt, fog.dur);
      else { fog.a = 0; fog.start = -1; }
    }

    if (!sweepFired && t >= sweepAt){
      sweepFired = true;
      sweep.start = t;
      if (audio.enabled){
        // Tight "scanner" chirp.
        audio.beep({ freq: 740, dur: 0.05, gain: 0.014, type: 'square' });
        audio.beep({ freq: 520, dur: 0.07, gain: 0.012, type: 'triangle' });
      }
    }
    if (sweep.start >= 0){
      const tt = t - sweep.start;
      if (tt <= sweep.dur) sweep.a = momentAlpha(tt, sweep.dur);
      else { sweep.a = 0; sweep.start = -1; }
    }

    // stamp animation
    if (phase.id === 'clear'){
      const k = ease(Math.min(1, phaseT / 0.9));
      stamp.a = Math.max(stamp.a, k);
      stamp.s = 0.85 + 0.15 * (1 - Math.cos(k * Math.PI));
    } else {
      stamp.a = Math.max(0, stamp.a - dt * 2.2);
      stamp.s = lerp(stamp.s, 1, 1 - Math.pow(0.0001, dt));
    }
  }

  function drawMap(ctx, squallAmt){
    // water gradient (cached)
    ctx.fillStyle = getMapWaterGradient(ctx);
    roundRect(ctx, frame.x, frame.y, frame.w, frame.h, frame.r);
    ctx.fill();

    // subtle waves + current lines
    ctx.save();
    ctx.clip();

    const waveAmp = (0.5 + 1.6 * squallAmt) * Math.max(1, Math.min(w, h) * 0.0015);
    ctx.globalAlpha = 0.14 + squallAmt * 0.18;
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.45)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));

    const step = Math.max(18, Math.floor(frame.h * 0.08));
    for (let yy = frame.y + step * 0.5; yy < frame.y + frame.h; yy += step){
      const ph = t * (0.55 + 0.7 * squallAmt) + yy * 0.04;
      ctx.beginPath();
      for (let xx = frame.x; xx <= frame.x + frame.w; xx += frame.w / 20){
        const y = yy + Math.sin(ph + xx * 0.01) * waveAmp;
        if (xx === frame.x) ctx.moveTo(xx, y);
        else ctx.lineTo(xx, y);
      }
      ctx.stroke();
    }

    // chart grid
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = 'rgba(200,240,255,1)';
    ctx.lineWidth = 1;
    const gx = Math.max(34, frame.w * 0.10);
    const gy = Math.max(28, frame.h * 0.10);
    for (let x = frame.x; x <= frame.x + frame.w; x += gx){
      ctx.beginPath();
      ctx.moveTo(x, frame.y);
      ctx.lineTo(x, frame.y + frame.h);
      ctx.stroke();
    }
    for (let y = frame.y; y <= frame.y + frame.h; y += gy){
      ctx.beginPath();
      ctx.moveTo(frame.x, y);
      ctx.lineTo(frame.x + frame.w, y);
      ctx.stroke();
    }

    // docks/land mass
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = 'rgba(10, 16, 20, 0.92)';
    // a couple of land blocks
    roundRect(ctx, frame.x + frame.w * 0.02, frame.y + frame.h * 0.10, frame.w * 0.16, frame.h * 0.80, frame.r * 0.55);
    ctx.fill();
    roundRect(ctx, frame.x + frame.w * 0.72, frame.y + frame.h * 0.02, frame.w * 0.26, frame.h * 0.16, frame.r * 0.55);
    ctx.fill();

    // target dock highlight
    ctx.fillStyle = 'rgba(18, 24, 28, 0.95)';
    roundRect(ctx, dock.x, dock.y, dock.w, dock.h, Math.min(18, frame.r * 0.5));
    ctx.fill();

    ctx.globalAlpha = 0.22 + (phase.id === 'dock' ? 0.20 : 0);
    ctx.strokeStyle = 'rgba(255, 220, 160, 0.9)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    ctx.stroke();

    // pier tick marks
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = 'rgba(150, 230, 255, 0.9)';
    const ticks = 12;
    for (let i = 0; i <= ticks; i++){
      const u = i / ticks;
      const x0 = dock.x + u * dock.w;
      const y0 = dock.y + u * 0;
      if (dock.side === 'left'){
        ctx.beginPath();
        ctx.moveTo(dock.x + dock.w, dock.y + dock.h * u);
        ctx.lineTo(dock.x + dock.w + frame.w * 0.012, dock.y + dock.h * u);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(dock.x + dock.w * u, dock.y);
        ctx.lineTo(dock.x + dock.w * u, dock.y - frame.h * 0.012);
        ctx.stroke();
      }
    }

    // route overlay (dashed)
    ctx.save();
    ctx.globalAlpha = 0.35 + (phase.id === 'inbound' ? 0.18 : 0) + (phase.id === 'dock' ? 0.10 : 0);
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(120, 240, 255, 0.9)';
    ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.6));
    ctx.setLineDash([Math.max(10, frame.w * 0.02), Math.max(10, frame.w * 0.018)]);
    ctx.lineDashOffset = -(t * 50);
    ctx.beginPath();
    for (let i = 0; i < routePath.pts.length; i++){
      const p = routePath.pts[i];
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.restore();

    // buoys
    for (const b of buoys){
      const bob = Math.sin(t * (0.8 + squallAmt * 1.2) + b.ph) * (1.0 + squallAmt * 2.2);
      ctx.save();
      ctx.translate(b.x, b.y + bob);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = `hsla(${b.hue}, 90%, 62%, 0.9)`;
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(-b.r * 0.30, -b.r * 0.30, b.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawShipAndTugs(ctx, squallAmt){
    // ship progress along path
    const inboundN = clamp01(phase.id === 'inbound' ? (phaseT / PHASES[0].dur) : 1);
    const dockN = clamp01(phase.id === 'dock' ? (phaseT / PHASES[1].dur) : (phase.id === 'inbound' ? 0 : 1));

    // map to path s
    let s = 0;
    if (phase.id === 'inbound') s = ease(inboundN) * 0.78;
    else if (phase.id === 'dock') s = 0.78 + ease(dockN) * 0.22;
    else s = 1;

    const p = samplePath(shipPath, s);

    // squall jitter
    const jit = squallAmt * 2.5;
    const jx = (Math.sin(t * 3.2) + Math.sin(t * 5.7 + 1.2)) * jit;
    const jy = (Math.cos(t * 3.4) + Math.cos(t * 6.2 + 0.4)) * jit;

    const shipL = frame.w * 0.16;
    const shipW = frame.h * 0.055;

    const attach = phase.id === 'inbound' ? ease(clamp01((inboundN - 0.25) / 0.5)) : 1;

    // tug offsets relative to ship axis
    const nx = Math.cos(p.a + Math.PI * 0.5);
    const ny = Math.sin(p.a + Math.PI * 0.5);
    const tx = Math.cos(p.a);
    const ty = Math.sin(p.a);

    const tugA = {
      x: p.x + jx + (-tx * shipL * 0.10 + nx * shipW * 1.05),
      y: p.y + jy + (-ty * shipL * 0.10 + ny * shipW * 1.05),
      a: p.a - 0.25,
    };
    const tugB = {
      x: p.x + jx + (tx * shipL * 0.10 - nx * shipW * 1.00),
      y: p.y + jy + (ty * shipL * 0.10 - ny * shipW * 1.00),
      a: p.a + 0.25,
    };

    // tugs ease-in when approaching
    const tugEase = attach;
    const pull = 0.14 + squallAmt * 0.10;
    tugA.x = lerp(p.x + jx + shipL * 0.25, tugA.x, tugEase);
    tugA.y = lerp(p.y + jy - shipW * 2.0, tugA.y, tugEase);
    tugB.x = lerp(p.x + jx + shipL * 0.20, tugB.x, tugEase);
    tugB.y = lerp(p.y + jy + shipW * 2.0, tugB.y, tugEase);

    // towlines
    ctx.save();
    ctx.globalAlpha = 0.35 + tugEase * 0.30;
    ctx.strokeStyle = 'rgba(255, 235, 180, 0.95)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    ctx.beginPath();
    ctx.moveTo(tugA.x, tugA.y);
    ctx.lineTo(p.x + jx + nx * shipW * 0.30, p.y + jy + ny * shipW * 0.30);
    ctx.moveTo(tugB.x, tugB.y);
    ctx.lineTo(p.x + jx - nx * shipW * 0.30, p.y + jy - ny * shipW * 0.30);
    ctx.stroke();
    ctx.restore();

    function drawTug(q, hue){
      const L = shipL * 0.28;
      const W = shipW * 0.75;
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.a + Math.sin(t * 1.1) * 0.05 * squallAmt);

      // wake
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.12 + 0.22 * squallAmt;
      ctx.fillStyle = 'rgba(120, 240, 255, 0.8)';
      ctx.beginPath();
      ctx.ellipse(-L * 0.30, 0, L * 0.55, W * 1.10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // hull
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = `hsla(${hue}, 65%, 52%, 0.95)`;
      roundRect(ctx, -L * 0.35, -W * 0.5, L * 0.70, W, W * 0.35);
      ctx.fill();

      // cabin
      ctx.fillStyle = 'rgba(240,245,250,0.9)';
      roundRect(ctx, -L * 0.08, -W * 0.32, L * 0.28, W * 0.64, W * 0.22);
      ctx.fill();

      // light
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = 'rgba(255, 240, 200, 0.9)';
      ctx.beginPath();
      ctx.ellipse(L * 0.26, 0, L * 0.35, W * 0.65, 0, -0.5, 0.5);
      ctx.fill();

      ctx.restore();
    }

    function drawShip(){
      ctx.save();
      ctx.translate(p.x + jx, p.y + jy);
      ctx.rotate(p.a);

      // shadow
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.beginPath();
      ctx.ellipse(3, 3, shipL * 0.52, shipW * 1.10, 0, 0, Math.PI * 2);
      ctx.fill();

      // hull
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = 'rgba(18, 22, 26, 0.95)';
      ctx.beginPath();
      ctx.moveTo(shipL * 0.55, 0);
      ctx.lineTo(shipL * 0.35, -shipW);
      ctx.lineTo(-shipL * 0.50, -shipW * 0.85);
      ctx.lineTo(-shipL * 0.55, 0);
      ctx.lineTo(-shipL * 0.50, shipW * 0.85);
      ctx.lineTo(shipL * 0.35, shipW);
      ctx.closePath();
      ctx.fill();

      // deck stripe
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.20;
      ctx.strokeStyle = 'rgba(150, 230, 255, 0.9)';
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      ctx.beginPath();
      ctx.moveTo(-shipL * 0.44, -shipW * 0.50);
      ctx.lineTo(shipL * 0.40, -shipW * 0.50);
      ctx.stroke();

      // bridge
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(230,235,240,0.85)';
      roundRect(ctx, shipL * 0.05, -shipW * 0.55, shipL * 0.25, shipW * 1.10, shipW * 0.20);
      ctx.fill();

      // running light
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.25 + (phase.id === 'squall' ? 0.15 * Math.sin(t * 6) : 0);
      ctx.fillStyle = 'rgba(255, 200, 120, 0.9)';
      ctx.beginPath();
      ctx.arc(shipL * 0.46, 0, shipW * 0.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    drawShip();
    drawTug(tugA, 32);
    drawTug(tugB, 200);

    // gentle pull arrows during inbound/dock
    if (phase.id === 'inbound' || phase.id === 'dock'){
      const a = (phase.id === 'dock') ? 0.22 : 0.16;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(255, 235, 180, 0.9)';
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      for (let i = 0; i < 6; i++){
        const u = i / 6;
        const s2 = clamp01(s * 0.9 + u * 0.08);
        const pp = samplePath(shipPath, s2);
        ctx.beginPath();
        ctx.moveTo(pp.x, pp.y);
        ctx.lineTo(pp.x - Math.cos(pp.a) * shipL * pull, pp.y - Math.sin(pp.a) * shipL * pull);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawHUD(ctx, squallAmt){
    const x = frame.x + frame.w * 0.03;
    const y = frame.y + frame.h * 0.04;

    const titleSize = Math.max(14, Math.floor(Math.min(w, h) * 0.028));
    const smallSize = Math.max(12, Math.floor(Math.min(w, h) * 0.022));

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.font = `${titleSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.fillText('HARBOR TUG DISPATCH', x, y);

    ctx.font = `${smallSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(150, 230, 255, 0.85)';
    ctx.fillText(`PHASE: ${phase.label}`, x, y + titleSize * 1.15);

    // VHF dispatch log strip (clipped to stay OSD-safe; deterministic rotation)
    {
      const idx = Math.floor(t / VHF_INTERVAL) % VHF_LOG.length;
      const msg = VHF_LOG[idx];

      const sx = x;
      const sy = y + titleSize * (phase.id === 'squall' ? 3.10 : 2.35);
      const sw = frame.w * 0.70;
      const sh = Math.max(18, Math.floor(smallSize * 1.55));
      const r = Math.min(12, sh * 0.32);

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(10, 14, 18, 0.82)';
      roundRect(ctx, sx, sy, sw, sh, r);
      ctx.fill();

      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = 'rgba(150,230,255,0.9)';
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      ctx.stroke();

      ctx.beginPath();
      ctx.rect(sx + sh * 0.18, sy + sh * 0.12, sw - sh * 0.36, sh * 0.76);
      ctx.clip();

      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(255,255,255,0.80)';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = `${Math.max(10, Math.floor(smallSize * 0.92))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(`VHF DISPATCH — ${msg}`, sx + sw * 0.03, sy + sh * 0.52);
      ctx.restore();
    }

    // tide gauge
    const gx = frame.x + frame.w * 0.78;
    const gy = frame.y + frame.h * 0.06;
    const gw = frame.w * 0.18;
    const gh = frame.h * 0.08;

    const tide = 0.5 + 0.32 * Math.sin(t * 0.22 + seed * 0.001) + 0.12 * Math.sin(t * 0.55 + 1.2);
    const k = clamp01(tide);

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(10, 14, 18, 0.85)';
    roundRect(ctx, gx, gy, gw, gh, Math.min(12, gh * 0.28));
    ctx.fill();

    ctx.globalAlpha = 0.20;
    ctx.strokeStyle = 'rgba(150,230,255,0.9)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    ctx.stroke();

    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = getTideGaugeGradient(ctx, gx, gw);
    ctx.fillRect(gx, gy + gh * (1 - k), gw, gh * k);

    // marker
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.7 + squallAmt * 0.2;
    ctx.fillStyle = 'rgba(255, 235, 180, 0.85)';
    ctx.fillRect(gx + gw * 0.86, gy + gh * (1 - k) - 2, gw * 0.10, 4);

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `${Math.max(10, Math.floor(smallSize * 0.92))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('TIDE', gx + gw * 0.06, gy + gh * 0.10);
    ctx.restore();

    // squall banner
    if (phase.id === 'squall'){
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(255, 90, 90, 0.85)';
      ctx.fillText('SQUALL WARNING', x, y + titleSize * 2.25);
    }

    // special moment banner (OSD-safe, under tide gauge)
    if (fog.a > 0.01 || sweep.a > 0.01){
      const a = Math.max(fog.a, sweep.a);
      const label = fog.a >= sweep.a ? 'FOG HORN' : 'SECURITY SWEEP';

      const bx = gx;
      const by = gy + gh + frame.h * 0.02;
      const bw = gw;
      const bh = Math.max(18, Math.floor(smallSize * 1.45));

      ctx.save();
      ctx.globalAlpha = 0.85 * a;
      ctx.fillStyle = 'rgba(10, 14, 18, 0.82)';
      roundRect(ctx, bx, by, bw, bh, Math.min(12, bh * 0.30));
      ctx.fill();

      ctx.globalAlpha = 0.22 * a;
      ctx.strokeStyle = 'rgba(150,230,255,0.9)';
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      roundRect(ctx, bx, by, bw, bh, Math.min(12, bh * 0.30));
      ctx.stroke();

      ctx.globalAlpha = 0.92 * a;
      ctx.fillStyle = (label === 'FOG HORN') ? 'rgba(255, 235, 180, 0.9)' : 'rgba(255,255,255,0.82)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.max(10, Math.floor(smallSize * 0.95))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(label, bx + bw * 0.06, by + bh * 0.55);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawStamp(ctx){
    if (stamp.a <= 0.01) return;

    const cx = frame.x + frame.w * 0.62;
    const cy = frame.y + frame.h * 0.74;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(stamp.rot);
    ctx.scale(stamp.s, stamp.s);

    ctx.globalAlpha = 0.10 * stamp.a;
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    roundRect(ctx, -frame.w * 0.18 + 6, -frame.h * 0.06 + 6, frame.w * 0.36, frame.h * 0.12, 12);
    ctx.fill();

    ctx.globalAlpha = 0.85 * stamp.a;
    ctx.strokeStyle = 'rgba(255, 90, 90, 0.95)';
    ctx.lineWidth = Math.max(2, Math.floor(dpr * 2));
    roundRect(ctx, -frame.w * 0.18, -frame.h * 0.06, frame.w * 0.36, frame.h * 0.12, 12);
    ctx.stroke();

    ctx.globalAlpha = 0.92 * stamp.a;
    ctx.fillStyle = 'rgba(255, 90, 90, 0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(18, Math.floor(Math.min(w, h) * 0.042))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('ALL CLEAR', 0, 0);

    ctx.restore();
  }

  function render(ctx){
    if (!w || !h) return;

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, w, h);

    // outer background
    ctx.fillStyle = '#04070c';
    ctx.fillRect(0, 0, w, h);

    const squallAmt = phase.id === 'squall' ? (0.35 + 0.65 * ease(phaseT / PHASES[2].dur)) : 0;

    // main map
    ctx.save();
    drawMap(ctx, squallAmt);
    drawShipAndTugs(ctx, squallAmt);
    ctx.restore();

    // squall overlay
    if (squallAmt > 0.01){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.12 + 0.24 * squallAmt;
      ctx.fillStyle = 'rgba(120, 170, 255, 0.9)';
      ctx.fillRect(frame.x, frame.y, frame.w, frame.h);

      // gust streaks
      ctx.globalAlpha = 0.16 + 0.22 * squallAmt;
      ctx.strokeStyle = 'rgba(220, 240, 255, 0.9)';
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      const n = 16;
      for (let i = 0; i < n; i++){
        const u = i / n;
        const y = frame.y + u * frame.h;
        const x = frame.x + ((t * 220 + i * 90) % (frame.w + 200)) - 100;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + frame.w * 0.18, y - frame.h * 0.06);
        ctx.stroke();
      }
      ctx.restore();
    }

    // special overlays (clip to frame)
    if (fog.a > 0.01 || sweep.a > 0.01){
      ctx.save();
      roundRect(ctx, frame.x, frame.y, frame.w, frame.h, frame.r);
      ctx.clip();

      if (fog.a > 0.01){
        const p = clamp01((t - fog.start) / Math.max(1e-6, fog.dur));
        const sx = frame.x + frame.w * (p * 1.25 - 0.15);

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.10 + 0.22 * fog.a;
        ctx.fillStyle = 'rgba(220,240,255,0.9)';
        ctx.fillRect(frame.x, frame.y, frame.w, frame.h);

        ctx.globalAlpha = 0.05 + 0.15 * fog.a;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(sx, frame.y, frame.w * 0.35, frame.h);
        ctx.globalAlpha = 0.04 + 0.10 * fog.a;
        ctx.fillRect(sx - frame.w * 0.10, frame.y, frame.w * 0.15, frame.h);
        ctx.restore();
      }

      if (sweep.a > 0.01){
        const p = clamp01((t - sweep.start) / Math.max(1e-6, sweep.dur));
        const ox = dock.x + dock.w * 0.5;
        const oy = dock.y + dock.h * 0.5;
        const ang = -0.9 + p * 1.8;
        const len = Math.max(frame.w, frame.h) * 1.15;
        const spread = 0.22;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.12 + 0.20 * sweep.a;
        ctx.fillStyle = 'rgba(255,235,180,0.9)';
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(ang - spread) * len, oy + Math.sin(ang - spread) * len);
        ctx.lineTo(ox + Math.cos(ang + spread) * len, oy + Math.sin(ang + spread) * len);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 0.10 + 0.25 * sweep.a;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = Math.max(2, Math.floor(dpr * 2));
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(ang) * len, oy + Math.sin(ang) * len);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }

    if (flash > 0.01){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.18})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    drawStamp(ctx);
    drawHUD(ctx, squallAmt);

    // scanlines
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = getScanlinePattern(ctx);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
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
