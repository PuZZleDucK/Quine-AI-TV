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

  // particles (sparks)
  const MAX_SPARKS = 90;
  let sparks = [];

  // audio
  let hum = null;
  let hiss = null;
  let audioHandle = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

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

  function emitSparks(x, y, amt, heat = 1){
    const n = Math.min(amt, 10);
    for (let i = 0; i < n; i++){
      if (sparks.length >= MAX_SPARKS){
        // O(1) cap (order doesn't matter for sparks)
        sparks[0] = sparks[sparks.length - 1];
        sparks.pop();
      }
      const a = (-Math.PI / 2) + (rand() * 2 - 1) * 0.9;
      const sp = (140 + rand() * 340) * (0.6 + heat * 0.7);
      sparks.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.12 + rand() * 0.22,
        r: 0.7 + rand() * 1.9,
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

    buildDesign();
    bakeToPixels();

    sparks = [];
    scan = 0;
    glowPulse = 0;
    popFlash = 0;
    nextCornerBeepAt = 0;
  }

  function onAudioOn(){
    if (!audio.enabled) return;
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
    try { audioHandle?.stop?.(); } catch {}
    hum = null;
    hiss = null;
    audioHandle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function phaseInfo(tt){
    const m = ((tt % CYCLE) + CYCLE) % CYCLE;
    if (m < DUR_PREVIEW) return { id: 'preview', t: m, dur: DUR_PREVIEW, label: 'PREVIEW' };
    if (m < DUR_PREVIEW + DUR_CUT) return { id: 'cut', t: m - DUR_PREVIEW, dur: DUR_CUT, label: 'CUT' };
    if (m < DUR_PREVIEW + DUR_CUT + DUR_PEEL) return { id: 'peel', t: m - DUR_PREVIEW - DUR_CUT, dur: DUR_PEEL, label: 'PEEL' };
    return { id: 'show', t: m - DUR_PREVIEW - DUR_CUT - DUR_PEEL, dur: DUR_SHOW, label: 'REVEAL' };
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

    if (ph.id === 'cut'){
      const p = clamp(ph.t / ph.dur, 0, 1);
      const dist = p * totalLen;
      const pt = pointAlong(segs, dist);

      // sparks / zaps
      const heat = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(ph.t * 3.1));
      emitSparks(pt.x, pt.y, 2 + ((heat * 2) | 0), heat);

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

  function drawBed(ctx){
    ctx.save();
    ctx.fillStyle = pal.bed;
    ctx.fillRect(work.x - 18, work.y - 18, work.w + 36, work.h + 36);

    // inner bed gradient
    const g = ctx.createLinearGradient(work.x, work.y, work.x, work.y + work.h);
    g.addColorStop(0, 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(work.x, work.y, work.w, work.h);

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

  function drawHud(ctx, ph){
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
    ctx.fillStyle = pal.neon;
    ctx.fillRect(bx, by, Math.floor(bw * p), bh);

    ctx.restore();
  }

  function draw(ctx){
    const ph = phaseInfo(t);

    drawBackground(ctx);
    drawBed(ctx);

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
      ctx.shadowColor = pal.neon;
      ctx.shadowBlur = 18 * dpr;
      ctx.strokeStyle = `rgba(90, 240, 255, ${0.22 + heat * 0.22})`;
      ctx.lineWidth = Math.max(2, Math.floor(2.4 * dpr));
      ctx.setLineDash([]);
      cutterPt = strokeProgress(ctx, p);
      ctx.restore();

      // hot core
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.shadowColor = pal.hot;
      ctx.shadowBlur = 8 * dpr;
      ctx.strokeStyle = `rgba(255, 90, 125, ${0.10 + heat * 0.20})`;
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
      ctx.shadowColor = pal.neon;
      ctx.shadowBlur = 14 * dpr;
      ctx.strokeStyle = `rgba(90, 240, 255, ${g})`;
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
      ctx.fillStyle = `rgba(90,240,255,${0.03 + 0.02 * (0.5 + 0.5 * Math.sin(t * 1.1))})`;
      ctx.fillRect(work.x, work.y + work.h + 10 * dpr + bob, work.w, 2 * dpr);
      ctx.restore();
    }

    drawHud(ctx, ph);

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
