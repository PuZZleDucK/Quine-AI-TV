import { mulberry32, clamp } from '../../util/prng.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // loop state
  let loopDur = 42;
  let loopT = 0;
  let sheetNo = 1;

  // drawing plan
  let strokes = []; // {kind,start,dur, ...}
  let cursor = 0;
  let activeIdx = -1;

  // visuals
  let margin = 40;
  let cx = 0;
  let cy = 0;
  let R = 100;
  let grid = 28;

  // special moments
  let smudges = []; // {x,y,r,t0,life}
  let wipe = { t0: 0, dur: 0, x0: 0, x1: 0 };

  // audio
  let ambience = null;
  let scratchAcc = 0;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function pushLine(x1, y1, x2, y2, dur, style={}){
    strokes.push({ kind: 'line', start: loopDur, dur, x1, y1, x2, y2, ...style });
    loopDur += dur;
  }

  function pushArc(acx, acy, r, a0, a1, dur, style={}){
    strokes.push({ kind: 'arc', start: loopDur, dur, cx: acx, cy: acy, r, a0, a1, ...style });
    loopDur += dur;
  }

  function pushDot(x, y, dur, style={}){
    strokes.push({ kind: 'dot', start: loopDur, dur, x, y, ...style });
    loopDur += dur;
  }

  function pushText(x, y, text, dur, style={}){
    strokes.push({ kind: 'text', start: loopDur, dur, x, y, text, ...style });
    loopDur += dur;
  }

  function regen(){
    strokes = [];
    cursor = 0;
    activeIdx = -1;

    const s = Math.min(w, h);
    margin = Math.max(28, Math.floor(s * 0.08));
    cx = (w * 0.5);
    cy = (h * 0.5) - s * 0.02;
    R = Math.floor(s * (0.26 + (rand() * 0.05)));
    grid = Math.max(22, Math.floor(s / 26));

    // Start time cursor is stored in loopDur while building.
    loopDur = 0;

    const x0 = margin;
    const y0 = margin;
    const x1 = w - margin;
    const y1 = h - margin;

    // Border + title block
    pushLine(x0, y0, x1, y0, 1.25, { level: 'final' });
    pushLine(x1, y0, x1, y1, 1.25, { level: 'final' });
    pushLine(x1, y1, x0, y1, 1.25, { level: 'final' });
    pushLine(x0, y1, x0, y0, 1.25, { level: 'final' });

    const tbW = Math.floor((x1 - x0) * 0.25);
    const tbH = Math.floor((y1 - y0) * 0.14);
    const tbX = x1 - tbW;
    const tbY = y1 - tbH;
    pushLine(tbX, tbY, x1, tbY, 0.75, { level: 'construct' });
    pushLine(tbX, tbY, tbX, y1, 0.75, { level: 'construct' });
    pushLine(tbX, tbY + tbH * 0.45, x1, tbY + tbH * 0.45, 0.55, { level: 'construct' });

    pushText(x0 + 14, y0 + 26, 'MECHANICAL PENCIL GEOMETRY', 0.85, { level: 'hud' });
    pushText(tbX + 10, tbY + tbH * 0.32, `SHEET ${String(sheetNo).padStart(2,'0')}`, 0.65, { level: 'hud' });

    // Construction: circle + crosshair
    const aStart = -Math.PI * 0.5;
    pushArc(cx, cy, R, aStart, aStart + Math.PI * 2, 3.2, { level: 'construct', compass: true });

    pushLine(cx - R * 1.05, cy, cx + R * 1.05, cy, 1.35, { level: 'construct' });
    pushLine(cx, cy - R * 1.05, cx, cy + R * 1.05, 1.35, { level: 'construct' });

    // 6 points around the circle (hex)
    const pts = [];
    const rot = (rand() * Math.PI * 2);
    for (let i = 0; i < 6; i++){
      const a = rot + i * (Math.PI * 2 / 6);
      pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }

    for (let i = 0; i < 6; i++){
      const [px, py] = pts[i];
      pushDot(px, py, 0.28, { level: 'construct', r: 4 });
    }

    // Hexagon edges (final-ish)
    for (let i = 0; i < 6; i++){
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % 6];
      pushLine(ax, ay, bx, by, 1.05, { level: 'final' });
    }

    // Triangle (every other vertex)
    for (let i = 0; i < 3; i++){
      const [ax, ay] = pts[(i * 2) % 6];
      const [bx, by] = pts[((i * 2) + 2) % 6];
      pushLine(ax, ay, bx, by, 1.05, { level: 'final', thick: true });
    }

    // A couple of extra compass arcs as construction flair
    const arcR = R * 0.67;
    pushArc(cx, cy, arcR, rot + Math.PI * 0.1, rot + Math.PI * 0.1 + Math.PI * 1.25, 1.8, { level: 'construct', compass: true });
    pushArc(cx, cy, arcR, rot + Math.PI * 1.15, rot + Math.PI * 1.15 + Math.PI * 1.25, 1.8, { level: 'construct', compass: true });

    // Labels
    const lbl = ['A','B','C','D','E','F'];
    for (let i = 0; i < 6; i++){
      const [px, py] = pts[i];
      const dx = (px - cx);
      const dy = (py - cy);
      const m = 18;
      pushText(px + (dx / R) * m, py + (dy / R) * m, lbl[i], 0.32, { level: 'hud' });
    }

    // Hold / special moments
    smudges = Array.from({ length: 3 }, (_, i) => ({
      x: cx + (rand() * 2 - 1) * R * 0.65,
      y: cy + (rand() * 2 - 1) * R * 0.65,
      r: 18 + rand() * 30,
      t0: loopDur + 1.5 + i * 2.2,
      life: 1.6,
    }));

    wipe = {
      t0: loopDur + 7.0,
      dur: 1.35,
      x0: x0 - 40,
      x1: x1 + 40,
    };

    // final pause
    loopDur += 9.5;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    t = 0;
    loopT = 0;
    sheetNo = 1;
    scratchAcc = 0;
    regen();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type: 'pink', gain: 0.0032 });
    n.start();
    ambience = { stop(){ try{ n.stop(); } catch {} } };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try{ ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    loopT += dt;

    // advance cursor as loop progresses
    while (cursor < strokes.length && loopT > (strokes[cursor].start + strokes[cursor].dur)) cursor++;

    let idx = -1;
    if (cursor < strokes.length){
      const s = strokes[cursor];
      if (loopT >= s.start && loopT <= s.start + s.dur) idx = cursor;
    }

    if (idx !== activeIdx){
      activeIdx = idx;
      // tiny “click” on new stroke
      if (idx >= 0) safeBeep({ freq: 900, dur: 0.01, gain: 0.008, type: 'square' });
    }

    // scratchy ticks during active drawing
    if (audio.enabled && activeIdx >= 0){
      scratchAcc += dt * 10.5;
      while (scratchAcc >= 1){
        scratchAcc -= 1;
        // a quiet, papery tick
        safeBeep({ freq: 2200, dur: 0.006, gain: 0.0016, type: 'triangle' });
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

  function drawPaper(ctx){
    // warm drafting paper
    ctx.fillStyle = '#f6f1e3';
    ctx.fillRect(0, 0, w, h);

    // subtle vignette
    const g = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.15, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(40,30,20,0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // grid lines
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#6a7680';
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
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#111';
    const dotStep = grid * 2;
    for (let y = margin; y < h - margin + 0.5; y += dotStep){
      for (let x = margin; x < w - margin + 0.5; x += dotStep){
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.restore();
  }

  function strokeStyle(ctx, s){
    if (s.level === 'final'){
      ctx.strokeStyle = 'rgba(25, 25, 25, 0.92)';
      ctx.lineWidth = s.thick ? Math.max(2.4, Math.min(w, h) * 0.004) : Math.max(1.6, Math.min(w, h) * 0.0028);
    } else if (s.level === 'hud'){
      ctx.fillStyle = 'rgba(20, 20, 20, 0.75)';
    } else {
      ctx.strokeStyle = 'rgba(25, 25, 25, 0.32)';
      ctx.lineWidth = Math.max(1.1, Math.min(w, h) * 0.0022);
      ctx.setLineDash([6, 6]);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function drawStroke(ctx, s, p){
    if (s.kind === 'text'){
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.75 * ease(p);
      ctx.font = `${Math.max(12, Math.floor(Math.min(w, h) / 34))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = 'alphabetic';
      strokeStyle(ctx, s);
      ctx.fillText(s.text, s.x, s.y);
      ctx.restore();
      return;
    }

    if (s.kind === 'dot'){
      const rr = (s.r || 4) * ease(p);
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.75 * ease(p);
      ctx.fillStyle = (s.level === 'final') ? 'rgba(25,25,25,0.85)' : 'rgba(25,25,25,0.35)';
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

    ctx.restore();
  }

  function getStrokePoint(s, p){
    p = clamp(p, 0, 1);
    const ep = ease(p);

    if (s.kind === 'line'){
      const x = lerp(s.x1, s.x2, ep);
      const y = lerp(s.y1, s.y2, ep);
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      return { x, y, ang, isArc: false };
    }

    if (s.kind === 'arc'){
      const a = lerp(s.a0, s.a1, ep);
      const x = s.cx + Math.cos(a) * s.r;
      const y = s.cy + Math.sin(a) * s.r;
      const dir = (s.a1 - s.a0) >= 0 ? 1 : -1;
      const ang = a + dir * Math.PI * 0.5;
      return { x, y, ang, isArc: true, acx: s.cx, acy: s.cy, r: s.r, a };
    }

    return null;
  }

  function drawPencil(ctx, pt){
    if (!pt) return;

    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(pt.ang);

    // slight tremor
    const wob = Math.sin(t * 18) * 0.6;
    ctx.translate(0, wob);

    const len = Math.max(24, Math.min(w, h) * 0.05);
    const bodyW = Math.max(6, Math.min(w, h) * 0.012);

    // body
    ctx.fillStyle = 'rgba(30, 30, 30, 0.75)';
    ctx.fillRect(-len * 0.15, -bodyW * 0.5, len, bodyW);

    // grip
    ctx.fillStyle = 'rgba(60, 60, 60, 0.45)';
    ctx.fillRect(len * 0.35, -bodyW * 0.55, len * 0.32, bodyW * 1.1);

    // tip
    ctx.fillStyle = 'rgba(10,10,10,0.85)';
    ctx.beginPath();
    ctx.moveTo(len * 0.85, 0);
    ctx.lineTo(len * 0.65, -bodyW * 0.28);
    ctx.lineTo(len * 0.65, bodyW * 0.28);
    ctx.closePath();
    ctx.fill();

    // lead
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(len * 0.86, -1, 5, 2);

    ctx.restore();
  }

  function drawCompass(ctx, pt){
    if (!pt || !pt.isArc) return;

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1.1, Math.min(w, h) * 0.0023);
    ctx.lineCap = 'round';

    // pivot
    ctx.fillStyle = 'rgba(20,20,20,0.25)';
    ctx.beginPath();
    ctx.arc(pt.acx, pt.acy, 4, 0, Math.PI * 2);
    ctx.fill();

    // arm
    ctx.beginPath();
    ctx.moveTo(pt.acx, pt.acy);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    // second leg (slightly offset)
    const ox = Math.cos(pt.a + Math.PI * 0.18) * pt.r;
    const oy = Math.sin(pt.a + Math.PI * 0.18) * pt.r;
    ctx.beginPath();
    ctx.moveTo(pt.acx, pt.acy);
    ctx.lineTo(pt.acx + ox, pt.acy + oy);
    ctx.stroke();

    ctx.restore();
  }

  function drawSmudges(ctx){
    for (const s of smudges){
      const p = clamp((loopT - s.t0) / s.life, 0, 1);
      if (p <= 0 || p >= 1) continue;
      ctx.save();
      ctx.globalAlpha = 0.10 * (1 - p);
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r * (1.0 + p * 0.5), s.r * 0.55, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawWipe(ctx){
    const p = clamp((loopT - wipe.t0) / wipe.dur, 0, 1);
    if (p <= 0 || p >= 1) return;

    const x = lerp(wipe.x0, wipe.x1, ease(p));
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#fff8ef';
    ctx.fillRect(x - 80, margin - 10, 160, h - margin * 2 + 20);
    ctx.restore();
  }

  function draw(ctx){
    drawPaper(ctx);

    // strokes
    for (let i = 0; i < strokes.length; i++){
      const s = strokes[i];
      const p = clamp((loopT - s.start) / s.dur, 0, 1);
      if (p <= 0) continue;
      drawStroke(ctx, s, p);
    }

    drawSmudges(ctx);
    drawWipe(ctx);

    // instrument overlay for current stroke
    if (activeIdx >= 0){
      const s = strokes[activeIdx];
      const p = clamp((loopT - s.start) / s.dur, 0, 1);
      const pt = getStrokePoint(s, p);
      if (s.compass) drawCompass(ctx, pt);
      drawPencil(ctx, pt);
    }

    // footer hint
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#111';
    ctx.font = `${Math.max(11, Math.floor(Math.min(w, h) / 46))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText('GEOM / CONSTRUCT / TRACE', margin, h - margin * 0.35);
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
