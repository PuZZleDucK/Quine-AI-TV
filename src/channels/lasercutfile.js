// REVIEWED: 2026-02-14
import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function roundRect(ctx, x, y, w, h, r){
  r = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function roundedRectPoints(cx, cy, w, h, r, steps = 6){
  // returns closed loop (first point not repeated)
  r = Math.min(r, w * 0.5, h * 0.5);
  const pts = [];
  const x0 = cx - w * 0.5, x1 = cx + w * 0.5;
  const y0 = cy - h * 0.5, y1 = cy + h * 0.5;

  // top-right
  for (let i = 0; i <= steps; i++){
    const a = (-Math.PI / 2) + (i / steps) * (Math.PI / 2);
    pts.push({ x: x1 - r + Math.cos(a) * r, y: y0 + r + Math.sin(a) * r });
  }
  // bottom-right
  for (let i = 0; i <= steps; i++){
    const a = 0 + (i / steps) * (Math.PI / 2);
    pts.push({ x: x1 - r + Math.cos(a) * r, y: y1 - r + Math.sin(a) * r });
  }
  // bottom-left
  for (let i = 0; i <= steps; i++){
    const a = (Math.PI / 2) + (i / steps) * (Math.PI / 2);
    pts.push({ x: x0 + r + Math.cos(a) * r, y: y1 - r + Math.sin(a) * r });
  }
  // top-left
  for (let i = 0; i <= steps; i++){
    const a = Math.PI + (i / steps) * (Math.PI / 2);
    pts.push({ x: x0 + r + Math.cos(a) * r, y: y0 + r + Math.sin(a) * r });
  }

  // remove near-duplicates
  const out = [];
  for (const p of pts){
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-5) out.push(p);
  }
  return out;
}

function makeGear(rand, teeth = 14){
  const pts = [];
  const r0 = 0.28 + rand() * 0.05;
  const r1 = 0.41 + rand() * 0.05;
  const wob = 0.01 + rand() * 0.02;
  for (let i = 0; i < teeth * 2; i++){
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = (i % 2 === 0 ? r1 : r0) * (1 + (rand() * 2 - 1) * wob);
    pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
  }
  return pts;
}

function bakeSegments(paths){
  const segs = [];
  let total = 0;
  for (const path of paths){
    for (let i = 0; i < path.length; i++){
      const a = path[i];
      const b = path[(i + 1) % path.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) continue;
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, len });
      total += len;
    }
  }
  return { segs, total };
}

function pointAlong(segs, dist){
  let d = dist;
  for (const s of segs){
    if (d <= s.len){
      const t = s.len ? (d / s.len) : 0;
      return { x: lerp(s.x1, s.x2, t), y: lerp(s.y1, s.y2, t) };
    }
    d -= s.len;
  }
  const last = segs[segs.length - 1];
  return last ? { x: last.x2, y: last.y2 } : { x: 0, y: 0 };
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // typography
  let font = 16;
  let small = 12;
  let mono = 13;

  // palette (laser + anodized metal)
  const palettes = [
    { bg0: '#0b0d12', bg1: '#111a24', bed: '#1b222e', grid: 'rgba(120,170,210,0.08)', neon: '#59f6ff', hot: '#ff5d7d', smoke: 'rgba(255,255,255,0.08)', hud: 'rgba(220,240,255,0.85)' },
    { bg0: '#070910', bg1: '#1b1226', bed: '#221a2d', grid: 'rgba(255,120,210,0.07)', neon: '#ff78d2', hot: '#7dff67', smoke: 'rgba(255,255,255,0.08)', hud: 'rgba(255,235,250,0.86)' },
    { bg0: '#070b0f', bg1: '#0e1b16', bed: '#15231e', grid: 'rgba(120,255,190,0.07)', neon: '#68ffb6', hot: '#ffd26a', smoke: 'rgba(255,255,255,0.08)', hud: 'rgba(235,255,245,0.86)' },
  ];
  const pal = pick(rand, palettes);

  // phases
  const DUR_PREVIEW = 12;
  const DUR_CUT = 22;
  const DUR_PEEL = 10;
  const DUR_SHOW = 10;
  const CYCLE = DUR_PREVIEW + DUR_CUT + DUR_PEEL + DUR_SHOW;

  // layout / cached
  let bgGrad = null;
  let bedTile = null;
  let bedPattern = null;
  let bedPatternCtx = null;
  let bedGrad = null;
  let bedGradCtx = null;
  let bedGradKey = '';
  let work = { x: 0, y: 0, w: 0, h: 0 };

  // cutfile
  let design = { title: 'CUTFILE', id: 'x', cut: [], engrave: [] };
  let cutPaths = [];     // px points [{x,y}]
  let engravePaths = []; // px points [{x,y}]
  let segs = [];
  let totalLen = 1;

  // FX
  let scan = 0;
  let glowPulse = 0;
  let popFlash = 0;
  let nextCornerBeepAt = 0;

  // rare deterministic special moments (~1–3 min)
  const materialAccents = [
    { name: 'ACRYLIC', neon: '#ffd26a', hot: '#68ffb6', tint: 'rgba(255,210,120,0.08)' },
    { name: 'ANODIZED AL', neon: '#ff78d2', hot: '#59f6ff', tint: 'rgba(255,120,210,0.08)' },
    { name: 'BIRCH PLY', neon: '#7dff67', hot: '#ff5d7d', tint: 'rgba(120,255,190,0.08)' },
  ];
  let special = null;       // { kind, t0, dur, variant }
  let specialArmed = null;  // { kind, startAt, dur, variant }
  let specialCount = 0;
  let nextSpecialAt = 0;

  // particles (sparks)
  const MAX_SPARKS = 90;
  let sparks = [];

  // determinism: drive sparks emission from cut distance, not per-frame update()
  const SPARK_STEP_PX = 6;
  let cutSparkDist = 0;
  let cutSparkEvent = 0;
  let wasCutPhase = false;

  // audio
  let hum = null;
  let hiss = null;
  let audioHandle = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function stopLaserAudio({ clearCurrent = false } = {}){
    const handle = audioHandle;
    if (!handle){
      hum = null;
      hiss = null;
      return;
    }

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    hum = null;
    hiss = null;
    audioHandle = null;
  }

  function toPx(u){
    // u: {x,y} in -0.5..0.5-ish
    return {
      x: work.x + (u.x * 0.5 + 0.5) * work.w,
      y: work.y + (u.y * 0.5 + 0.5) * work.h,
    };
  }

  function buildDesign(){
    // Generate a few recognizable "files".
    const options = [
      { id: 'tag', title: 'NAME TAG' },
      { id: 'gear', title: 'GEAR COASTER' },
      { id: 'box', title: 'FOLD BOX TEMPLATE' },
      { id: 'hex', title: 'HEX COASTER' },
    ];
    const chosen = pick(rand, options);

    let cut = [];
    let engrave = [];

    if (chosen.id === 'tag'){
      const outer = roundedRectPoints(0, 0, 0.92, 0.50, 0.12, 7);
      cut.push(outer);

      // lanyard hole
      const hole = [];
      const cx = 0.34, cy = -0.12;
      const rr = 0.07;
      const n = 22;
      for (let i = 0; i < n; i++){
        const a = (i / n) * Math.PI * 2;
        hole.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
      }
      cut.push(hole);

      // engraving guide lines
      for (let i = 0; i < 3; i++){
        const y = 0.05 + i * 0.12;
        engrave.push([{ x: -0.36, y }, { x: 0.30, y }]);
      }
      engrave.push([{ x: -0.36, y: -0.17 }, { x: 0.10, y: -0.17 }]);
    }

    if (chosen.id === 'gear'){
      const teeth = 12 + ((rand() * 8) | 0);
      cut.push(makeGear(rand, teeth));
      // center hole
      const hole = [];
      const rr = 0.12 + rand() * 0.04;
      const n = 26;
      for (let i = 0; i < n; i++){
        const a = (i / n) * Math.PI * 2;
        hole.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
      }
      cut.push(hole);
      // decorative spokes
      const spokes = 4 + ((rand() * 3) | 0);
      for (let i = 0; i < spokes; i++){
        const a = (i / spokes) * Math.PI * 2 + rand() * 0.2;
        engrave.push([
          { x: Math.cos(a) * 0.14, y: Math.sin(a) * 0.14 },
          { x: Math.cos(a) * 0.30, y: Math.sin(a) * 0.30 },
        ]);
      }
    }

    if (chosen.id === 'box'){
      // a cross-ish fold template: central + flaps
      const cw = 0.36, ch = 0.26;
      const flap = 0.22;
      // outer cut path as a single polygon (approx)
      cut.push([
        { x: -cw - flap, y: -ch },
        { x: -cw, y: -ch },
        { x: -cw, y: -ch - flap },
        { x: cw, y: -ch - flap },
        { x: cw, y: -ch },
        { x: cw + flap, y: -ch },
        { x: cw + flap, y: ch },
        { x: cw, y: ch },
        { x: cw, y: ch + flap },
        { x: -cw, y: ch + flap },
        { x: -cw, y: ch },
        { x: -cw - flap, y: ch },
      ]);

      // fold lines (engrave)
      engrave.push([{ x: -cw, y: -ch }, { x: cw, y: -ch }]);
      engrave.push([{ x: -cw, y: ch }, { x: cw, y: ch }]);
      engrave.push([{ x: -cw, y: -ch }, { x: -cw, y: ch }]);
      engrave.push([{ x: cw, y: -ch }, { x: cw, y: ch }]);

      // little tabs
      engrave.push([{ x: -cw - flap * 0.65, y: -ch * 0.5 }, { x: -cw, y: -ch * 0.2 }]);
      engrave.push([{ x: cw, y: -ch * 0.2 }, { x: cw + flap * 0.65, y: -ch * 0.5 }]);
    }

    if (chosen.id === 'hex'){
      const n = 6;
      const rr = 0.44;
      const outer = [];
      for (let i = 0; i < n; i++){
        const a = (i / n) * Math.PI * 2 + Math.PI / 6;
        outer.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
      }
      cut.push(outer);

      // inner honeycomb engraving
      const rows = 4;
      for (let r = -rows; r <= rows; r++){
        for (let c = -rows; c <= rows; c++){
          const ox = (c + (r % 2) * 0.5) * 0.18;
          const oy = r * 0.155;
          if (Math.hypot(ox, oy) > 0.34) continue;
          const cell = [];
          const cr = 0.075;
          for (let i = 0; i < 6; i++){
            const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
            cell.push({ x: ox + Math.cos(a) * cr, y: oy + Math.sin(a) * cr });
          }
          engrave.push(cell);
        }
      }

      // center hole
      const hole = [];
      const rr2 = 0.12;
      for (let i = 0; i < 26; i++){
        const a = (i / 26) * Math.PI * 2;
        hole.push({ x: Math.cos(a) * rr2, y: Math.sin(a) * rr2 });
      }
      cut.push(hole);
    }

    design = { title: chosen.title, id: chosen.id, cut, engrave };
  }

  function bakeToPixels(){
    cutPaths = design.cut.map((path) => path.map(toPx));
    engravePaths = design.engrave.map((path) => path.map(toPx));
    const baked = bakeSegments(cutPaths);
    segs = baked.segs;
    totalLen = baked.total || 1;
  }

  function emitSparks(x, y, amt, heat = 1, rng = rand){
    const n = Math.min(amt, 10);
    for (let i = 0; i < n; i++){
      if (sparks.length >= MAX_SPARKS){
        // O(1) cap (order doesn't matter for sparks)
        sparks[0] = sparks[sparks.length - 1];
        sparks.pop();
      }
      const a = (-Math.PI / 2) + (rng() * 2 - 1) * 0.9;
      const sp = (140 + rng() * 340) * (0.6 + heat * 0.7);
      sparks.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.12 + rng() * 0.22,
        r: 0.7 + rng() * 1.9,
      });
    }
  }

  function onResize(width, height, devicePixelRatio){
    w = width;
    h = height;
    dpr = devicePixelRatio || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) * 0.028));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(11, Math.floor(font * 0.82));

    const pad = Math.floor(Math.min(w, h) * 0.08);
    const ww = Math.floor(Math.min(w - pad * 2, h * 0.92));
    const wh = Math.floor(ww * 0.74);
    work = { x: Math.floor((w - ww) * 0.5), y: Math.floor((h - wh) * 0.52), w: ww, h: wh };

    bgGrad = null;
    bedTile = null;
    bedPattern = null;
    bedPatternCtx = null;
    bedGrad = null;
    bedGradCtx = null;
    bedGradKey = '';

    buildDesign();
    bakeToPixels();

    sparks = [];
    cutSparkDist = 0;
    cutSparkEvent = 0;
    wasCutPhase = false;

    scan = 0;
    glowPulse = 0;
    popFlash = 0;
    nextCornerBeepAt = 0;

    special = null;
    specialArmed = null;
    specialCount = 0;
    // keep it “rare”: first moment appears after ~1–3 minutes (absolute-time, seeded)
    const s0 = mulberry32((seed ^ 0x94d049bb) >>> 0);
    nextSpecialAt = t + 60 + s0() * 120; // 60–180s
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive: if onAudioOn is called repeatedly while audio is enabled,
    // ensure we don't stack/overlap our own ambience.
    stopLaserAudio({ clearCurrent: true });

    hum = simpleDrone(audio, { root: 44 + ((rand() * 12) | 0), detune: 1.2, gain: 0.045 });
    hiss = audio.noiseSource({ type: 'pink', gain: 0.018 });
    hiss.start();

    audioHandle = {
      stop(){
        try { hum?.stop?.(); } catch {}
        try { hiss?.stop?.(); } catch {}
      }
    };
    audio.setCurrent(audioHandle);
  }

  function onAudioOff(){
    stopLaserAudio({ clearCurrent: true });
  }

  function destroy(){ onAudioOff(); }

  function phaseInfo(tt){
    const m = ((tt % CYCLE) + CYCLE) % CYCLE;
    if (m < DUR_PREVIEW) return { id: 'preview', t: m, dur: DUR_PREVIEW, label: 'PREVIEW', m };
    if (m < DUR_PREVIEW + DUR_CUT) return { id: 'cut', t: m - DUR_PREVIEW, dur: DUR_CUT, label: 'CUT', m };
    if (m < DUR_PREVIEW + DUR_CUT + DUR_PEEL) return { id: 'peel', t: m - DUR_PREVIEW - DUR_CUT, dur: DUR_PEEL, label: 'PEEL', m };
    return { id: 'show', t: m - DUR_PREVIEW - DUR_CUT - DUR_PEEL, dur: DUR_SHOW, label: 'REVEAL', m };
  }

  function armSpecial(atT, idx){
    const sr = mulberry32(((seed ^ 0x4c1c9ddf) + (idx * 0x85ebca6b)) >>> 0);
    const kind = (sr() < 0.55) ? 'air' : 'material';
    const variant = (sr() * materialAccents.length) | 0;

    const cycleM = (((atT % CYCLE) + CYCLE) % CYCLE);
    let cycleStart = atT - cycleM;

    // default: early in PREVIEW
    let startAt = cycleStart + 0.35;

    if (kind === 'material'){
      // keep it a short, clearly "moment"-style palette shift that resets before CUT.
      const maxStart = Math.max(0.8, DUR_PREVIEW - 3.4);
      startAt = cycleStart + (0.8 + sr() * maxStart);
    }

    if (kind === 'air'){
      // into CUT (don’t let it spill into PEEL)
      const maxOff = Math.max(0.8, DUR_CUT - 3.6);
      const off = 0.8 + sr() * maxOff;
      startAt = cycleStart + DUR_PREVIEW + off;
    }

    // Ensure it’s always scheduled in the future.
    if (startAt <= atT){
      startAt += CYCLE;
      cycleStart += CYCLE;
    }

    let dur = (kind === 'air') ? (2.8 + sr() * 2.6) : (6 + sr() * 5);

    // Clamp duration to stay within the intended phase window.
    const endLimit = (kind === 'air')
      ? (cycleStart + DUR_PREVIEW + DUR_CUT - 0.4)
      : (cycleStart + DUR_PREVIEW - 0.2);
    dur = Math.max(1.6, Math.min(dur, Math.max(1.6, endLimit - startAt)));

    specialArmed = { kind, startAt, dur, variant };
  }

  function scheduleNextSpecial(fromT, idx){
    const sr = mulberry32(((seed ^ 0x94d049bb) + (idx * 0x9e3779b9)) >>> 0);
    const gap = 60 + sr() * 120; // 60–180s
    nextSpecialAt = fromT + gap;
  }

  function update(dt){
    t += dt;

    scan = (scan + dt * 0.22) % 1;
    glowPulse = (glowPulse + dt * 0.9) % 1;
    popFlash = Math.max(0, popFlash - dt * 1.6);

    // animate sparks
    for (let i = sparks.length - 1; i >= 0; i--){
      const s = sparks[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= Math.pow(0.08, dt);
      s.vy = s.vy * Math.pow(0.08, dt) + 520 * dt;
      if (s.life <= 0) sparks.splice(i, 1);
    }

    const ph = phaseInfo(t);

    // schedule special moments using absolute time (FPS-stable)
    while (t >= nextSpecialAt){
      const idx = specialCount;
      if (!special && !specialArmed) armSpecial(nextSpecialAt, idx);
      specialCount++;
      scheduleNextSpecial(nextSpecialAt, specialCount);
    }

    if (specialArmed && t >= specialArmed.startAt){
      special = { kind: specialArmed.kind, t0: specialArmed.startAt, dur: specialArmed.dur, variant: specialArmed.variant };
      specialArmed = null;
      if (special.kind === 'air'){
        safeBeep({ freq: 1320, dur: 0.06, gain: 0.020, type: 'triangle' });
        safeBeep({ freq: 660, dur: 0.08, gain: 0.014, type: 'sine' });
      }
      if (special.kind === 'material'){
        safeBeep({ freq: 980, dur: 0.05, gain: 0.016, type: 'sine' });
      }
    }

    if (special && t >= special.t0 + special.dur) special = null;

    if (ph.id !== 'cut') wasCutPhase = false;

    if (ph.id === 'cut'){
      const p = clamp(ph.t / ph.dur, 0, 1);
      const dist = p * totalLen;
      const pt = pointAlong(segs, dist);

      if (!wasCutPhase){
        wasCutPhase = true;
        cutSparkDist = 0;
        cutSparkEvent = 0;
      }

      // sparks / zaps (distance-driven so 30fps/60fps captures match)
      while (cutSparkDist <= dist){
        const tt = (cutSparkDist / totalLen) * ph.dur;
        const heat2 = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(tt * 3.1));
        const pt2 = pointAlong(segs, cutSparkDist);
        const sr = mulberry32((seed ^ 0x6c8e9cf5) + (cutSparkEvent * 0x9e3779b9));
        emitSparks(pt2.x, pt2.y, 2 + ((heat2 * 2) | 0), heat2, sr);
        cutSparkDist += SPARK_STEP_PX;
        cutSparkEvent++;
      }

      const heat = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(ph.t * 3.1));

      // gentle click/beep cadence
      if (audio.enabled && t >= nextCornerBeepAt){
        nextCornerBeepAt = t + 0.28 + rand() * 0.22;
        safeBeep({ freq: 520 + rand() * 280, dur: 0.03 + rand() * 0.02, gain: 0.012 + heat * 0.01, type: 'square' });
      }
    }

    if (ph.id === 'peel'){
      const p = ease(ph.t / ph.dur);
      if (p > 0.92 && popFlash <= 0.01){
        popFlash = 1;
        safeBeep({ freq: 1180, dur: 0.08, gain: 0.05, type: 'sine' });
        safeBeep({ freq: 740, dur: 0.10, gain: 0.03, type: 'triangle' });
      }
    }

    if (ph.id === 'preview'){
      nextCornerBeepAt = 0;
    }
  }

  function drawBackground(ctx){
    if (!bgGrad){
      bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, pal.bg0);
      bgGrad.addColorStop(1, pal.bg1);
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // subtle moving stripes
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.translate(0, (t * 24) % 40);
    ctx.fillStyle = '#000';
    for (let y = -60; y < h + 60; y += 40){
      ctx.fillRect(0, y, w, 10);
    }
    ctx.restore();
  }

  function rebuildBedTexture(ctx){
    bedPattern = null;
    bedTile = null;
    bedPatternCtx = ctx;

    try {
      const sz = Math.max(96, Math.floor(128 * dpr));
      const tile = (typeof OffscreenCanvas !== 'undefined')
        ? new OffscreenCanvas(sz, sz)
        : (typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: sz, height: sz }) : null);
      if (!tile) return;

      const tctx = tile.getContext('2d');
      if (!tctx) return;

      const tr = mulberry32((seed ^ 0x6d2b79f5) >>> 0);

      tctx.clearRect(0, 0, sz, sz);

      // Brushed-metal vertical grain.
      for (let x = 0; x < sz; x++){
        const a = 0.02 + tr() * 0.05;
        tctx.fillStyle = `rgba(255,255,255,${a})`;
        tctx.fillRect(x, 0, 1, sz);
      }
      // A few darker streaks.
      for (let i = 0; i < sz * 0.6; i++){
        const x = (tr() * sz) | 0;
        const a = 0.02 + tr() * 0.05;
        tctx.fillStyle = `rgba(0,0,0,${a})`;
        tctx.fillRect(x, 0, 1, sz);
      }
      // Light stipple.
      for (let i = 0; i < 220; i++){
        const x = (tr() * sz) | 0;
        const y = (tr() * sz) | 0;
        const s = 1 + ((tr() * 2) | 0);
        const a = 0.04 + tr() * 0.10;
        tctx.fillStyle = `rgba(255,255,255,${a})`;
        tctx.fillRect(x, y, s, s);
      }

      bedTile = tile;
      bedPattern = ctx.createPattern(tile, 'repeat');
    } catch {
      bedPattern = null;
      bedTile = null;
    }
  }

  function ensureBedTexture(ctx){
    if (!bedPattern || bedPatternCtx !== ctx) rebuildBedTexture(ctx);
  }

  function ensureBedGradient(ctx){
    const key = `${work.x},${work.y},${work.w},${work.h}`;
    if (!bedGrad || bedGradCtx !== ctx || bedGradKey !== key){
      bedGradCtx = ctx;
      bedGradKey = key;
      const g = ctx.createLinearGradient(work.x, work.y, work.x, work.y + work.h);
      g.addColorStop(0, 'rgba(255,255,255,0.03)');
      g.addColorStop(1, 'rgba(0,0,0,0.16)');
      bedGrad = g;
    }
  }

  function drawBed(ctx){
    const frame = 18;
    const fx = work.x - frame, fy = work.y - frame;
    const fw = work.w + frame * 2, fh = work.h + frame * 2;

    ctx.save();
    ctx.fillStyle = pal.bed;
    ctx.fillRect(fx, fy, fw, fh);

    // subtle brushed-metal frame texture (cached; rebuilt on resize)
    ensureBedTexture(ctx);
    if (bedPattern){
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = bedPattern;
      ctx.fillRect(fx, fy, fw, fh);
      ctx.restore();
    }

    // inner bed gradient (cached; rebuilt on resize/ctx swap)
    ensureBedGradient(ctx);
    if (bedGrad){
      ctx.fillStyle = bedGrad;
      ctx.fillRect(work.x, work.y, work.w, work.h);
    }

    // grid
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = Math.max(1, Math.floor(1 * dpr));
    const step = Math.max(16, Math.floor(Math.min(work.w, work.h) * 0.08));
    ctx.beginPath();
    for (let x = work.x; x <= work.x + work.w + 1; x += step){
      ctx.moveTo(x, work.y);
      ctx.lineTo(x, work.y + work.h);
    }
    for (let y = work.y; y <= work.y + work.h + 1; y += step){
      ctx.moveTo(work.x, y);
      ctx.lineTo(work.x + work.w, y);
    }
    ctx.stroke();

    // scanline
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const sy = work.y + scan * work.h;
    ctx.fillStyle = `rgba(90, 240, 255, ${0.05 + 0.05 * (0.5 + 0.5 * Math.sin(t * 1.4))})`;
    ctx.fillRect(work.x, sy - 2, work.w, 4);
    ctx.restore();

    ctx.restore();
  }

  function strokePaths(ctx, paths){
    for (const p of paths){
      if (p.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
      if (p.length > 2) ctx.closePath();
      ctx.stroke();
    }
  }

  function strokeProgress(ctx, progress){
    const distTarget = clamp(progress, 0, 1) * totalLen;
    let d = distTarget;
    ctx.beginPath();

    let started = false;
    for (const s of segs){
      if (d <= 0) break;
      const segd = Math.min(d, s.len);
      const tt = segd / s.len;
      const x2 = lerp(s.x1, s.x2, tt);
      const y2 = lerp(s.y1, s.y2, tt);
      if (!started){
        ctx.moveTo(s.x1, s.y1);
        started = true;
      }
      ctx.lineTo(x2, y2);
      d -= segd;
    }

    ctx.stroke();
    return pointAlong(segs, distTarget);
  }

  function drawCutter(ctx, x, y, heat){
    const r = Math.max(10, Math.floor(Math.min(work.w, work.h) * 0.028));
    const headW = r * 1.8;
    const headH = r * 1.2;

    ctx.save();
    ctx.translate(x, y);

    // nozzle glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255, 90, 120, ${0.12 + heat * 0.25})`;
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.6 + heat * 0.35), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // body
    ctx.fillStyle = 'rgba(10,12,16,0.82)';
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = Math.max(1, Math.floor(1 * dpr));
    roundRect(ctx, -headW * 0.5, -headH * 0.9, headW, headH, 6);
    ctx.fill();
    ctx.stroke();

    // focus dot
    ctx.fillStyle = `rgba(255,255,255,${0.12 + heat * 0.2})`;
    ctx.beginPath();
    ctx.arc(0, 0, 1.6 * dpr, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawHud(ctx, ph, opts = null){
    const o = opts || {};
    const neon = o.neon || pal.neon;
    const badge = o.badge || null; // { text, color } | string

    ctx.save();
    ctx.fillStyle = pal.hud;
    ctx.font = `${font}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.textBaseline = 'top';

    const x = Math.floor(w * 0.06);
    const y = Math.floor(h * 0.08);

    ctx.fillText('LASER CUTFILE STUDIO', x, y);

    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText(`FILE: ${design.title}`, x, y + font + 6);

    ctx.fillStyle = 'rgba(255,255,255,0.60)';
    ctx.fillText(`PHASE: ${ph.label}`, x, y + font + small + 12);

    // progress bar
    const bw = Math.floor(w * 0.26);
    const bh = Math.max(6, Math.floor(6 * dpr));
    const bx = x;
    const by = y + font + small + small + 18;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(bx, by, bw, bh);

    const p = clamp(ph.t / ph.dur, 0, 1);
    ctx.fillStyle = neon;
    ctx.fillRect(bx, by, Math.floor(bw * p), bh);

    if (badge){
      const b = (typeof badge === 'string') ? { text: badge, color: neon } : badge;
      const text = String(b.text || '');
      const color = b.color || neon;
      const padX = 10 * dpr;
      const padY = 6 * dpr;
      const bw2 = Math.floor(w * 0.30);
      const bx2 = x;
      const by2 = by + bh + 10 * dpr;

      ctx.save();
      ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(ctx, bx2, by2, bw2, Math.floor(small + padY * 2), 9);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = Math.max(1, Math.floor(1.2 * dpr));
      roundRect(ctx, bx2, by2, bw2, Math.floor(small + padY * 2), 9);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillText(text, Math.floor(bx2 + padX), Math.floor(by2 + padY));
      ctx.restore();
    }

    ctx.restore();
  }

  function draw(ctx){
    const ph = phaseInfo(t);

    // special moments (rare, deterministic): visual + HUD treatment
    let neon = pal.neon;
    let hot = pal.hot;
    let badge = null;       // { text, color }
    let tint = null;        // rgba()
    let tintA = 0;
    let airBurst = 0;       // 0..1

    if (special){
      const u = clamp((t - special.t0) / special.dur, 0, 1);
      if (special.kind === 'material'){
        const acc = materialAccents[special.variant % materialAccents.length];
        neon = acc.neon;
        hot = acc.hot;
        tint = acc.tint;
        tintA = 0.75 * Math.sin(u * Math.PI);
        badge = { text: `MATERIAL CHANGE: ${acc.name}`, color: neon };
      }
      if (special.kind === 'air'){
        // bursty at the start, then settles
        airBurst = Math.pow(1 - u, 2);
        badge = { text: 'AIR ASSIST BURST', color: pal.neon };
      }
    }

    drawBackground(ctx);
    drawBed(ctx);

    if (tint && tintA > 0.001){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = tintA;
      ctx.fillStyle = tint;
      ctx.fillRect(work.x, work.y, work.w, work.h);
      ctx.restore();
    }

    // engrave/fold lines (faint)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(1, Math.floor(1.2 * dpr));
    ctx.setLineDash([6 * dpr, 8 * dpr]);
    strokePaths(ctx, engravePaths);
    ctx.restore();

    // preview full cut path
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${ph.id === 'preview' ? 0.20 : 0.10})`;
    ctx.lineWidth = Math.max(1, Math.floor(1.4 * dpr));
    ctx.setLineDash(ph.id === 'preview' ? [10 * dpr, 12 * dpr] : []);
    strokePaths(ctx, cutPaths);
    ctx.restore();

    let cutterPt = null;

    if (ph.id === 'cut'){
      const p = ease(ph.t / ph.dur);
      const heat = 0.5 + 0.5 * Math.sin(ph.t * 3.1);

      // kerf glow
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.shadowColor = neon;
      ctx.shadowBlur = 18 * dpr;
      ctx.globalAlpha = 0.22 + heat * 0.22;
      ctx.strokeStyle = neon;
      ctx.lineWidth = Math.max(2, Math.floor(2.4 * dpr));
      ctx.setLineDash([]);
      cutterPt = strokeProgress(ctx, p);
      ctx.restore();

      // hot core
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.shadowColor = hot;
      ctx.shadowBlur = 8 * dpr;
      ctx.globalAlpha = 0.10 + heat * 0.20;
      ctx.strokeStyle = hot;
      ctx.lineWidth = Math.max(1, Math.floor(1.2 * dpr));
      strokeProgress(ctx, p);
      ctx.restore();

      cutterPt && drawCutter(ctx, cutterPt.x, cutterPt.y, heat);
    }

    if (ph.id === 'peel' || ph.id === 'show'){
      // fully cut, with a gentle glow
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const g = 0.10 + 0.06 * (0.5 + 0.5 * Math.sin(t * 1.7));
      ctx.shadowColor = neon;
      ctx.shadowBlur = 14 * dpr;
      ctx.globalAlpha = g;
      ctx.strokeStyle = neon;
      ctx.lineWidth = Math.max(2, Math.floor(2.0 * dpr));
      strokePaths(ctx, cutPaths);
      ctx.restore();
    }

    // sparks
    if (sparks.length){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const s of sparks){
        const a = clamp(s.life / 0.25, 0, 1);
        ctx.fillStyle = `rgba(255, 210, 120, ${0.22 * a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 90, 125, ${0.10 * a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 2.1 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // smoke hint during cutting
    if (ph.id === 'cut'){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = pal.smoke;
      const n = 12;
      for (let i = 0; i < n; i++){
        const a = (i / n) * Math.PI * 2;
        const rr = (0.10 + 0.06 * Math.sin(t * 0.9 + i)) * Math.min(work.w, work.h);
        ctx.beginPath();
        ctx.arc(work.x + work.w * 0.52 + Math.cos(a) * rr, work.y + work.h * 0.48 + Math.sin(a) * rr, (8 + i) * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // special: air assist burst (extra smoke plume near the cutter head)
      if (airBurst > 0.001 && cutterPt){
        const sr = mulberry32(((seed ^ 0x1f3d5b79) + (special?.variant || 0) * 0x9e3779b9) >>> 0);
        const puffN = 10;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.65 * airBurst;
        ctx.fillStyle = 'rgba(255,255,255,0.14)';

        for (let i = 0; i < puffN; i++){
          const a = (i / puffN) * Math.PI * 2 + (sr() * 0.35);
          const rr = (10 + sr() * 18) * dpr * (1 + (1 - airBurst) * 1.2);
          const x = cutterPt.x + Math.cos(a) * rr;
          const y = cutterPt.y + Math.sin(a) * rr;
          const r = (10 + sr() * 16) * dpr * (0.5 + 0.7 * (1 - airBurst));
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // peel overlay
    if (ph.id === 'peel'){
      const p = ease(ph.t / ph.dur);
      const cover = 1 - p;
      const peelX = work.x + work.w * (0.08 + p * 1.08);

      ctx.save();
      ctx.fillStyle = 'rgba(235,245,255,0.06)';
      ctx.fillRect(work.x, work.y, work.w * cover, work.h);

      // curling corner ribbon
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,255,255,${0.10 + 0.10 * (1 - p)})`;
      ctx.beginPath();
      ctx.moveTo(peelX, work.y);
      ctx.lineTo(peelX + 26 * dpr, work.y + 16 * dpr);
      ctx.lineTo(peelX, work.y + 40 * dpr);
      ctx.closePath();
      ctx.fill();

      // pop flash at the end
      if (popFlash > 0.01){
        ctx.fillStyle = `rgba(255,255,255,${0.12 * popFlash})`;
        ctx.fillRect(work.x, work.y, work.w, work.h);
      }

      ctx.restore();
    }

    // subtle reveal bob
    if (ph.id === 'show'){
      const bob = Math.sin(t * 0.8) * 2 * dpr;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.03 + 0.02 * (0.5 + 0.5 * Math.sin(t * 1.1));
      ctx.fillStyle = neon;
      ctx.fillRect(work.x, work.y + work.h + 10 * dpr + bob, work.w, 2 * dpr);
      ctx.restore();
    }

    drawHud(ctx, ph, { neon, badge });

    // tiny footer
    ctx.save();
    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`seed:${seed}  file:${design.id}  loop:${CYCLE}s`, Math.floor(w * 0.06), Math.floor(h * 0.96));
    ctx.restore();
  }

  return {
    onResize,
    update,
    draw,
    destroy,
    onAudioOn,
    onAudioOff,
  };
}
