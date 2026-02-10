import { mulberry32, clamp } from '../util/prng.js';

// REVIEWED: 2026-02-11
// Botanical Blueprint Studio
// Drafting-table plant schematics (venation/cross-sections) drawn in timed layers.

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }

function polyLength(pts){
  let L = 0;
  for (let i = 1; i < pts.length; i++){
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    L += Math.hypot(dx, dy);
  }
  return L;
}

function polyPointAt(pts, u){
  u = clamp(u, 0, 1);
  const total = polyLength(pts) || 1;
  const target = total * u;
  let acc = 0;
  for (let i = 1; i < pts.length; i++){
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const seg = Math.hypot(x1 - x0, y1 - y0) || 0;
    if (acc + seg >= target){
      const t = seg ? (target - acc) / seg : 0;
      return { x: lerp(x0, x1, t), y: lerp(y0, y1, t), ang: Math.atan2(y1 - y0, x1 - x0) };
    }
    acc += seg;
  }
  const [xa, ya] = pts[pts.length - 2] || pts[0];
  const [xb, yb] = pts[pts.length - 1] || pts[0];
  return { x: xb, y: yb, ang: Math.atan2(yb - ya, xb - xa) };
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  // loop state
  let loopDur = 36;
  let loopT = 0;
  let sheetNo = 1;

  // drawing plan
  let strokes = []; // {kind,start,dur, ...}
  let cursor = 0;
  let activeIdx = -1;

  // layout
  let margin = 40;
  let grid = 28;
  let font = 16;
  let small = 12;

  // specimen geometry (in pixels)
  let leaf = null; // { outline, midrib, veins }
  let xsec = null; // { cx, cy, r, rings, bundles }

  // special moments
  let smudges = []; // {x,y,r,t0,life}
  let scan = { t0: 0, dur: 0 };

  // audio
  let ambience = null;
  let scratchAcc = 0;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function push(kind, dur, props){
    strokes.push({ kind, start: loopDur, dur, ...props });
    loopDur += dur;
  }

  function pushLine(x1, y1, x2, y2, dur, style={}){
    push('line', dur, { x1, y1, x2, y2, ...style });
  }

  function pushArc(cx, cy, r, a0, a1, dur, style={}){
    push('arc', dur, { cx, cy, r, a0, a1, ...style });
  }

  function pushPoly(pts, dur, style={}){
    push('poly', dur, { pts, ...style });
  }

  function pushDot(x, y, dur, style={}){
    push('dot', dur, { x, y, ...style });
  }

  function pushText(x, y, text, dur, style={}){
    push('text', dur, { x, y, text, ...style });
  }

  function buildLeaf(cx, cy, s){
    // Create a slightly-curved spine and a symmetric outline around it.
    const n = 52;
    const len = s * (0.52 + rand() * 0.08);
    const amp = s * (0.07 + rand() * 0.04);
    const width0 = s * (0.18 + rand() * 0.06);

    const spine = [];
    const left = [];
    const right = [];

    const rot = (-0.22 + rand() * 0.44); // radians
    const ca = Math.cos(rot);
    const sa = Math.sin(rot);

    function rotPt(x, y){
      return [cx + x * ca - y * sa, cy + x * sa + y * ca];
    }

    for (let i = 0; i < n; i++){
      const u = i / (n - 1);
      const y = lerp(-len * 0.55, len * 0.55, u);
      const bend = Math.sin(u * Math.PI) * amp * (0.65 + 0.35 * Math.sin(u * 6.2 + rand() * 2));
      const x = bend;
      const p = rotPt(x, y);
      spine.push(p);

      const ww = width0 * Math.pow(Math.sin(u * Math.PI), 0.78) * (0.85 + 0.2 * Math.sin(u * 3.1 + rand() * 2));
      const nx = -sa;
      const ny = ca;
      left.push([p[0] + nx * ww, p[1] + ny * ww]);
      right.push([p[0] - nx * ww, p[1] - ny * ww]);
    }

    const outline = left.concat(right.reverse());

    // Veins: sample along spine and draw toward edges.
    const veins = [];
    const vn = 12 + ((rand() * 7) | 0);
    for (let i = 0; i < vn; i++){
      const u = 0.12 + (i / (vn - 1)) * 0.78;
      const idx = Math.floor(u * (n - 1));
      const p = spine[idx];
      const qL = left[idx];
      const qR = right[idx];
      const toL = rand() < 0.5;
      const q = toL ? qL : qR;
      const mid = [lerp(p[0], q[0], 0.55), lerp(p[1], q[1], 0.55)];
      // slight curve with a 3-pt poly
      const wob = (rand() * 2 - 1) * s * 0.02;
      const mid2 = [mid[0] + wob * (toL ? -1 : 1), mid[1] + wob * 0.3];
      veins.push([p, mid2, q]);
    }

    return { outline, spine, veins };
  }

  function regen(){
    strokes = [];
    cursor = 0;
    activeIdx = -1;
    scratchAcc = 0;

    const s = Math.min(w, h);
    margin = Math.max(26, Math.floor(s * 0.075));
    grid = Math.max(22, Math.floor(s / 26));
    font = Math.max(14, Math.floor(s / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    loopDur = 0;

    const x0 = margin;
    const y0 = margin;
    const x1 = w - margin;
    const y1 = h - margin;

    // Border + title block
    pushLine(x0, y0, x1, y0, 0.85, { level: 'final' });
    pushLine(x1, y0, x1, y1, 0.85, { level: 'final' });
    pushLine(x1, y1, x0, y1, 0.85, { level: 'final' });
    pushLine(x0, y1, x0, y0, 0.85, { level: 'final' });

    const tbW = Math.floor((x1 - x0) * 0.27);
    const tbH = Math.floor((y1 - y0) * 0.15);
    const tbX = x1 - tbW;
    const tbY = y1 - tbH;
    pushLine(tbX, tbY, x1, tbY, 0.55, { level: 'construct' });
    pushLine(tbX, tbY, tbX, y1, 0.55, { level: 'construct' });
    pushLine(tbX, tbY + tbH * 0.45, x1, tbY + tbH * 0.45, 0.45, { level: 'construct' });

    pushText(x0 + 14, y0 + 28, 'BOTANICAL BLUEPRINT STUDIO', 0.7, { level: 'hud' });
    pushText(tbX + 10, tbY + tbH * 0.32, `SHEET ${String(sheetNo).padStart(2, '0')}`, 0.5, { level: 'hud' });
    pushText(tbX + 10, tbY + tbH * 0.78, pick(rand, ['SPECIMEN: FOLIAGE', 'SPECIMEN: HERBACEAE', 'SPECIMEN: LEAF STUDY']), 0.65, { level: 'hud' });

    // Specimen placement
    const leafCx = x0 + (x1 - x0) * 0.37;
    const leafCy = y0 + (y1 - y0) * 0.48;
    const leafS = s * 0.62;
    leaf = buildLeaf(leafCx, leafCy, leafS);

    const secCx = x0 + (x1 - x0) * 0.77;
    const secCy = y0 + (y1 - y0) * 0.47;
    const secR = Math.floor(s * (0.10 + rand() * 0.02));

    xsec = {
      cx: secCx,
      cy: secCy,
      r: secR,
      rings: [0.45, 0.72, 0.92].map(k => secR * k),
      bundles: Array.from({ length: 7 + ((rand() * 4) | 0) }, (_, i) => {
        const a = (i / 10) * Math.PI * 2 + rand() * 0.4;
        const rr = secR * (0.32 + rand() * 0.22);
        return { x: secCx + Math.cos(a) * rr, y: secCy + Math.sin(a) * rr };
      }),
    };

    // Leaf outline (final)
    pushPoly(leaf.outline.concat([leaf.outline[0]]), 3.0, { level: 'final', closed: true });

    // Midrib + a couple of construction measures
    pushPoly(leaf.spine, 1.35, { level: 'final', thin: true });
    pushLine(leafCx - leafS * 0.06, leafCy + leafS * 0.31, leafCx + leafS * 0.18, leafCy + leafS * 0.31, 0.6, { level: 'construct' });
    pushLine(leafCx + leafS * 0.08, leafCy - leafS * 0.33, leafCx + leafS * 0.08, leafCy + leafS * 0.33, 0.6, { level: 'construct' });

    // Veins (construct)
    for (const v of leaf.veins){
      pushPoly(v, 0.38 + rand() * 0.22, { level: 'construct' });
    }

    // Cross-section (final + construct rings)
    pushArc(xsec.cx, xsec.cy, xsec.r, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2, 1.45, { level: 'final' });
    for (const rr of xsec.rings){
      pushArc(xsec.cx, xsec.cy, rr, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2, 0.85, { level: 'construct' });
    }
    for (const b of xsec.bundles){
      pushDot(b.x, b.y, 0.22, { level: 'final', r: 3 });
    }

    // Callouts + labels
    const hudY = y0 + (y1 - y0) * 0.18;
    pushText(x0 + 14, hudY, 'VENATION LAYER', 0.45, { level: 'hud' });

    const tip = leaf.spine[0];
    const base = leaf.spine[leaf.spine.length - 1];
    pushLine(tip[0], tip[1], tip[0] - s * 0.10, tip[1] - s * 0.08, 0.65, { level: 'construct' });
    pushText(tip[0] - s * 0.12, tip[1] - s * 0.09, 'APEX', 0.42, { level: 'hud' });

    pushLine(base[0], base[1], base[0] - s * 0.12, base[1] + s * 0.06, 0.65, { level: 'construct' });
    pushText(base[0] - s * 0.14, base[1] + s * 0.075, 'PETIOLE', 0.42, { level: 'hud' });

    pushLine(xsec.cx + xsec.r, xsec.cy, xsec.cx + xsec.r + s * 0.08, xsec.cy, 0.55, { level: 'construct' });
    pushText(xsec.cx + xsec.r + s * 0.085, xsec.cy + 5, 'X-SECTION A–A', 0.55, { level: 'hud' });

    pushText(x0 + 14, y1 - margin * 0.35, 'CYANOTYPE / TRACE / LABEL', 0.6, { level: 'hud' });

    // Special moments: smudges + scan line
    smudges = Array.from({ length: 3 }, (_, i) => ({
      x: leafCx + (rand() * 2 - 1) * leafS * 0.12,
      y: leafCy + (rand() * 2 - 1) * leafS * 0.18,
      r: 16 + rand() * 26,
      t0: loopDur + 2.0 + i * 1.9,
      life: 1.4,
    }));

    scan = { t0: loopDur + 6.2, dur: 1.5 };

    // final pause
    loopDur += 9.0;
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;
    loopT = 0;
    sheetNo = 1;
    regen();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type: 'pink', gain: 0.0030 });
    n.start();
    ambience = { stop(){ try{ n.stop(); } catch {} } };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try{ ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;
    loopT += dt;

    while (cursor < strokes.length && loopT > (strokes[cursor].start + strokes[cursor].dur)) cursor++;

    let idx = -1;
    if (cursor < strokes.length){
      const s = strokes[cursor];
      if (loopT >= s.start && loopT <= s.start + s.dur) idx = cursor;
    }

    if (idx !== activeIdx){
      activeIdx = idx;
      if (idx >= 0) safeBeep({ freq: 980, dur: 0.01, gain: 0.007, type: 'square' });
    }

    if (audio.enabled && activeIdx >= 0){
      scratchAcc += dt * 10.0;
      while (scratchAcc >= 1){
        scratchAcc -= 1;
        safeBeep({ freq: 2400, dur: 0.006, gain: 0.0013, type: 'triangle' });
      }
    } else {
      scratchAcc = 0;
    }

    if (loopT >= loopDur){
      loopT = loopT % loopDur;
      sheetNo++;
      regen();
    }
  }

  function drawBlueprintPaper(ctx){
    // deep cyanotype base
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#071a2b');
    g.addColorStop(0.55, '#0a2a44');
    g.addColorStop(1, '#061423');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle vignette
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.12, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // grid
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#8fe6ff';
    ctx.lineWidth = 1;
    for (let x = margin; x < w - margin + 0.5; x += grid){
      ctx.beginPath();
      ctx.moveTo(x, margin);
      ctx.lineTo(x, h - margin);
      ctx.stroke();
    }
    for (let y = margin; y < h - margin + 0.5; y += grid){
      ctx.beginPath();
      ctx.moveTo(margin, y);
      ctx.lineTo(w - margin, y);
      ctx.stroke();
    }
    ctx.restore();

    // registration dots
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#bff3ff';
    const dotStep = grid * 2;
    for (let y = margin; y < h - margin + 0.5; y += dotStep){
      for (let x = margin; x < w - margin + 0.5; x += dotStep){
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.restore();
  }

  function strokeStyle(ctx, s){
    const bright = 'rgba(198, 246, 255, 0.92)';
    const faint = 'rgba(198, 246, 255, 0.35)';

    if (s.level === 'final'){
      ctx.strokeStyle = bright;
      ctx.lineWidth = s.thin ? Math.max(1.2, Math.min(w, h) * 0.0022) : Math.max(1.7, Math.min(w, h) * 0.0030);
    } else if (s.level === 'hud'){
      ctx.fillStyle = 'rgba(214, 251, 255, 0.80)';
    } else {
      ctx.strokeStyle = faint;
      ctx.lineWidth = Math.max(1.1, Math.min(w, h) * 0.0022);
      ctx.setLineDash([6, 6]);
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function drawStroke(ctx, s, p){
    if (s.kind === 'text'){
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.65 * ease(p);
      ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = 'alphabetic';
      strokeStyle(ctx, s);
      ctx.fillText(s.text, s.x, s.y);
      ctx.restore();
      return;
    }

    if (s.kind === 'dot'){
      const rr = (s.r || 3) * ease(p);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.65 * ease(p);
      ctx.fillStyle = 'rgba(205, 248, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    strokeStyle(ctx, s);

    if (s.kind === 'line'){
      const x = lerp(s.x1, s.x2, ease(p));
      const y = lerp(s.y1, s.y2, ease(p));
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    if (s.kind === 'arc'){
      const aa = lerp(s.a0, s.a1, ease(p));
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, s.r, s.a0, aa);
      ctx.stroke();
    }

    if (s.kind === 'poly'){
      const pts = s.pts;
      const end = Math.max(2, Math.floor(pts.length * ease(p)));
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < end; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }

    ctx.restore();
  }

  function getStrokePoint(s, p){
    const ep = ease(clamp(p, 0, 1));

    if (s.kind === 'line'){
      const x = lerp(s.x1, s.x2, ep);
      const y = lerp(s.y1, s.y2, ep);
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      return { x, y, ang };
    }

    if (s.kind === 'arc'){
      const a = lerp(s.a0, s.a1, ep);
      const x = s.cx + Math.cos(a) * s.r;
      const y = s.cy + Math.sin(a) * s.r;
      const dir = (s.a1 - s.a0) >= 0 ? 1 : -1;
      const ang = a + dir * Math.PI * 0.5;
      return { x, y, ang };
    }

    if (s.kind === 'poly'){
      return polyPointAt(s.pts, ep);
    }

    return null;
  }

  function drawPen(ctx, pt){
    if (!pt) return;

    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(pt.ang);

    const wob = Math.sin(t * 16) * 0.4;
    ctx.translate(0, wob);

    const len = Math.max(22, Math.min(w, h) * 0.045);
    const bodyW = Math.max(5, Math.min(w, h) * 0.010);

    ctx.fillStyle = 'rgba(210, 250, 255, 0.20)';
    ctx.fillRect(-len * 0.12, -bodyW * 0.5, len, bodyW);

    ctx.fillStyle = 'rgba(210, 250, 255, 0.32)';
    ctx.fillRect(len * 0.35, -bodyW * 0.60, len * 0.28, bodyW * 1.2);

    ctx.fillStyle = 'rgba(210, 250, 255, 0.75)';
    ctx.beginPath();
    ctx.moveTo(len * 0.84, 0);
    ctx.lineTo(len * 0.64, -bodyW * 0.30);
    ctx.lineTo(len * 0.64, bodyW * 0.30);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawSmudges(ctx){
    for (const s of smudges){
      const p = clamp((loopT - s.t0) / s.life, 0, 1);
      if (p <= 0 || p >= 1) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.10 * (1 - p);
      ctx.fillStyle = '#04121d';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r * (1.0 + p * 0.5), s.r * 0.55, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawScan(ctx){
    const p = clamp((loopT - scan.t0) / scan.dur, 0, 1);
    if (p <= 0 || p >= 1) return;

    const x = lerp(margin - w * 0.1, (w - margin) + w * 0.1, ease(p));
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.18;
    const gg = ctx.createLinearGradient(x - 140, 0, x + 140, 0);
    gg.addColorStop(0, 'rgba(180,245,255,0)');
    gg.addColorStop(0.5, 'rgba(180,245,255,1)');
    gg.addColorStop(1, 'rgba(180,245,255,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, margin, w, h - margin * 2);
    ctx.restore();
  }

  function draw(ctx){
    drawBlueprintPaper(ctx);

    // strokes
    for (let i = 0; i < strokes.length; i++){
      const s = strokes[i];
      const p = clamp((loopT - s.start) / s.dur, 0, 1);
      if (p <= 0) continue;
      drawStroke(ctx, s, p);
    }

    drawSmudges(ctx);
    drawScan(ctx);

    // instrument overlay for current stroke
    if (activeIdx >= 0){
      const s = strokes[activeIdx];
      const p = clamp((loopT - s.start) / s.dur, 0, 1);
      const pt = getStrokePoint(s, p);
      drawPen(ctx, pt);
    }

    // tiny footer hint
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#c6f6ff';
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText('LEAF / X-SEC / LABEL', margin, h - margin * 0.35);
    ctx.restore();
  }

  return {
    init,
    onResize,
    update,
    draw,
    onAudioOn,
    onAudioOff,
    destroy,
  };
}
