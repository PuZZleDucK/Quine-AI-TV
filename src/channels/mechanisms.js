import { mulberry32, clamp } from '../util/prng.js';

// Satisfying Mechanisms
// Slow cams of linkages, gears, cams, and escapements with labeled motion paths.

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

function drawGrid(ctx, w, h, step, alpha){
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(180,220,255,0.10)';
  ctx.lineWidth = 1;
  for (let x=0;x<=w;x+=step){
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  for (let y=0;y<=h;y+=step){
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function joint(ctx, x, y, r, col='rgba(231,238,246,0.9)'){
  ctx.save();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha *= 0.35;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.arc(x + r*0.18, y + r*0.22, r*0.65, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function arrow(ctx, x0, y0, x1, y1, col='rgba(120,210,255,0.7)'){
  const dx = x1 - x0, dy = y1 - y0;
  const a = Math.atan2(dy, dx);
  const L = Math.hypot(dx, dy);
  ctx.save();
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  ctx.translate(x1, y1);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-8, -4);
  ctx.lineTo(-8, 4);
  ctx.closePath();
  ctx.fill();

  // small tick marks
  ctx.globalAlpha *= 0.55;
  for (let i=1;i<=3;i++){
    const u = i / 4;
    const tx = -L * u;
    ctx.beginPath();
    ctx.moveTo(tx, -3);
    ctx.lineTo(tx, 3);
    ctx.stroke();
  }

  ctx.restore();
}

function drawGear(ctx, x, y, r, teeth=14, ang=0, col='rgba(231,238,246,0.85)'){
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(2, Math.floor(r * 0.08));

  // body
  ctx.globalAlpha *= 0.85;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI*2);
  ctx.stroke();

  // teeth hints
  ctx.globalAlpha *= 0.75;
  ctx.lineWidth = Math.max(1, Math.floor(r * 0.05));
  for (let i=0;i<teeth;i++){
    const a = (i / teeth) * Math.PI*2;
    const x0 = Math.cos(a) * (r * 0.92);
    const y0 = Math.sin(a) * (r * 0.92);
    const x1 = Math.cos(a) * (r * 1.06);
    const y1 = Math.sin(a) * (r * 1.06);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // hub
  ctx.globalAlpha *= 0.95;
  ctx.lineWidth = Math.max(1, Math.floor(r * 0.04));
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.20, 0, Math.PI*2);
  ctx.stroke();

  ctx.restore();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  const SEG_DUR = 22;
  const FADE = 2.0;

  const SEGMENTS = [
    {
      key: 'fourbar',
      title: 'FOUR-BAR LINKAGE',
      blurb: 'Coupler point traces a path.',
    },
    {
      key: 'gears',
      title: 'GEAR TRAIN',
      blurb: 'Ratios turn slow into fast.',
    },
    {
      key: 'cam',
      title: 'CAM + FOLLOWER',
      blurb: 'Rotation becomes a lift curve.',
    },
    {
      key: 'escapement',
      title: 'ESCAPEMENT',
      blurb: 'Ticks meter out motion.',
    },
  ];

  let w = 0, h = 0, t = 0, font = 18;
  let segT = 0;
  let segIndex = 0;

  // Four-bar state
  let trail = [];

  // Audio handle
  let ah = null;
  let clickT = 0;

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    segT = 0;
    segIndex = (seed % SEGMENTS.length + SEGMENTS.length) % SEGMENTS.length;
    trail = [];
    clickT = 0;
  }

  function onResize(width, height){ init({ width, height }); }

  function makeAudioHandle(){
    const ctx = audio.ensure();
    const out = ctx.createGain();
    out.gain.value = 0.65;
    out.connect(audio.master);

    const n = audio.noiseSource({ type: 'brown', gain: 0.006 });
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 520;
    lpf.Q.value = 0.8;

    // Re-route noise through filter -> out
    n.src.disconnect();
    n.src.connect(n.gain);
    n.gain.disconnect();
    n.gain.connect(lpf);
    lpf.connect(out);

    n.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.10); } catch {}
        try { n.stop(); } catch {}
      }
    };
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    try { ah?.stop?.(); } catch {}
    ah = null;
  }

  function destroy(){ onAudioOff(); }

  function segAlpha(){
    const aIn = ease(Math.min(1, segT / FADE));
    const aOut = ease(Math.min(1, (SEG_DUR - segT) / FADE));
    return Math.min(aIn, aOut);
  }

  function update(dt){
    t += dt;
    segT += dt;

    if (audio.enabled){
      clickT += dt;
      const period = 1.1 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.37));
      if (clickT >= period){
        clickT = 0;
        audio.beep({ freq: 820 + 90 * Math.sin(t * 0.9), dur: 0.02, gain: 0.012, type: 'square' });
      }
    }

    if (segT >= SEG_DUR){
      segT = 0;
      segIndex = (segIndex + 1) % SEGMENTS.length;
      trail = [];
      if (audio.enabled) audio.beep({ freq: 560 + rand() * 160, dur: 0.03, gain: 0.020, type: 'triangle' });
    }
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b0f14');
    g.addColorStop(1, '#050609');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, w, h, Math.max(28, Math.floor(Math.min(w, h) / 18)), 0.18);

    // vignette
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.52, 0, w * 0.5, h * 0.52, Math.max(w, h) * 0.80);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.66)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawHeader(ctx){
    const pad = Math.floor(w * 0.05);
    ctx.save();

    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(0, Math.floor(h * 0.06), w, Math.floor(h * 0.12));
    ctx.fillStyle = 'rgba(120,210,255,0.35)';
    ctx.fillRect(0, Math.floor(h * 0.18) - 2, w, 2);

    ctx.fillStyle = 'rgba(231,238,246,0.94)';
    ctx.font = `${Math.floor(font * 1.06)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('SATISFYING MECHANISMS', pad, Math.floor(h * 0.105));

    ctx.fillStyle = 'rgba(231,238,246,0.76)';
    ctx.font = `${Math.floor(font * 0.78)}px ui-sans-serif, system-ui`;
    ctx.fillText('linkages  •  gears  •  cams  •  escapements', pad, Math.floor(h * 0.145));

    ctx.restore();
  }

  function drawInfoPanel(ctx, seg){
    const pad = Math.floor(w * 0.05);
    const a = segAlpha();

    const panelW = Math.floor(w * 0.34);
    const panelH = Math.floor(h * 0.18);
    const x = w - pad - panelW;
    const y = h - pad - panelH;

    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * a;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, x + 6, y + 8, panelW, panelH, 14);
    ctx.fill();

    ctx.fillStyle = 'rgba(10,14,22,0.86)';
    roundRect(ctx, x, y, panelW, panelH, 14);
    ctx.fill();

    ctx.strokeStyle = 'rgba(120,210,255,0.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, panelW, panelH, 14);
    ctx.stroke();

    ctx.globalAlpha = 0.90;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 0.86)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(seg.title, x + 16, y + 34);

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(231,238,246,0.86)';
    ctx.font = `${Math.floor(font * 0.78)}px ui-sans-serif, system-ui`;
    ctx.fillText(seg.blurb, x + 16, y + 62);

    ctx.globalAlpha = 0.62;
    ctx.font = `${Math.floor(font * 0.70)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const hint = 'Slow loop. Watch the highlighted path.';
    ctx.fillText(hint, x + 16, y + panelH - 18);

    ctx.restore();
  }

  function drawFourBar(ctx, cx, cy, s, col){
    // Fixed pivots
    const A = { x: cx - s * 0.42, y: cy + s * 0.12 };
    const B = { x: cx + s * 0.42, y: cy + s * 0.10 };

    const a = s * 0.34;
    const b = s * 0.44;
    const c = s * 0.36;
    const d = Math.hypot(B.x - A.x, B.y - A.y);

    const th = t * 0.55;
    const P = { x: A.x + Math.cos(th) * a, y: A.y + Math.sin(th) * a };

    // Two-circle intersection for Q (choose consistent branch)
    const dx = B.x - P.x, dy = B.y - P.y;
    const dist = Math.hypot(dx, dy);
    const u = clamp((b*b - c*c + dist*dist) / (2 * dist), -dist, dist);
    const hh = Math.max(0, b*b - u*u);
    const hq = Math.sqrt(hh);
    const ex = dx / Math.max(1e-6, dist);
    const ey = dy / Math.max(1e-6, dist);
    const mx = P.x + ex * u;
    const my = P.y + ey * u;
    const sign = (Math.sin(th) > 0) ? 1 : -1;
    const Q = { x: mx - ey * hq * sign, y: my + ex * hq * sign };

    // Coupler point (midpoint offset)
    const mid = { x: (P.x + Q.x) * 0.5, y: (P.y + Q.y) * 0.5 };
    const nx = -(Q.y - P.y);
    const ny = (Q.x - P.x);
    const nl = Math.hypot(nx, ny) || 1;
    const C = { x: mid.x + (nx / nl) * s * 0.10, y: mid.y + (ny / nl) * s * 0.10 };

    // trail
    trail.push({ x: C.x, y: C.y });
    if (trail.length > 280) trail.shift();

    ctx.save();

    // path
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.015));
    ctx.beginPath();
    for (let i=0;i<trail.length;i++){
      const p = trail[i];
      if (i===0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // links
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = 'rgba(231,238,246,0.80)';
    ctx.lineWidth = Math.max(3, Math.floor(s * 0.028));
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(A.x, A.y); ctx.lineTo(P.x, P.y);
    ctx.moveTo(P.x, P.y); ctx.lineTo(Q.x, Q.y);
    ctx.moveTo(Q.x, Q.y); ctx.lineTo(B.x, B.y);
    ctx.stroke();

    // ground link
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.020));
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();

    // joints
    joint(ctx, A.x, A.y, Math.max(4, s * 0.04));
    joint(ctx, B.x, B.y, Math.max(4, s * 0.04));
    joint(ctx, P.x, P.y, Math.max(3, s * 0.032), 'rgba(231,238,246,0.85)');
    joint(ctx, Q.x, Q.y, Math.max(3, s * 0.032), 'rgba(231,238,246,0.85)');

    joint(ctx, C.x, C.y, Math.max(3, s * 0.030), col);

    // label arrow
    ctx.globalAlpha = 0.70;
    arrow(ctx, C.x + s * 0.18, C.y - s * 0.10, C.x + s * 0.02, C.y - s * 0.02, col);

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(231,238,246,0.86)';
    ctx.font = `${Math.floor(font * 0.72)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('COUPLER PATH', C.x + s * 0.20, C.y - s * 0.12);

    ctx.restore();
  }

  function drawGears(ctx, cx, cy, s, col){
    const r1 = s * 0.20;
    const r2 = s * 0.12;
    const r3 = s * 0.16;

    const x1 = cx - s * 0.18;
    const y1 = cy + s * 0.02;
    const x2 = x1 + r1 + r2 + s * 0.02;
    const y2 = y1;
    const x3 = x2 + r2 + r3 + s * 0.02;
    const y3 = y1;

    const a1 = t * 0.55;
    const a2 = -a1 * (r1 / r2);
    const a3 = a2 * (r2 / r3);

    ctx.save();

    // motion arrows
    ctx.globalAlpha = 0.60;
    arrow(ctx, x1, y1 - r1 - s*0.05, x1 + s*0.22, y1 - r1 - s*0.05, col);

    // gears
    ctx.globalAlpha = 0.95;
    drawGear(ctx, x1, y1, r1, 18, a1, 'rgba(231,238,246,0.78)');
    drawGear(ctx, x2, y2, r2, 12, a2, 'rgba(231,238,246,0.70)');
    drawGear(ctx, x3, y3, r3, 16, a3, 'rgba(231,238,246,0.80)');

    // highlight gear ratio path
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.014));
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(x1 + r1, y1);
    ctx.lineTo(x2 - r2, y2);
    ctx.lineTo(x2 + r2, y2);
    ctx.lineTo(x3 - r3, y3);
    ctx.stroke();
    ctx.setLineDash([]);

    // labels
    ctx.globalAlpha = 0.84;
    ctx.fillStyle = 'rgba(231,238,246,0.86)';
    ctx.font = `${Math.floor(font * 0.72)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('INPUT', x1 - r1, y1 + r1 + s*0.10);
    ctx.fillText('IDLER', x2 - r2, y2 + r2 + s*0.10);
    ctx.fillText('OUTPUT', x3 - r3, y3 + r3 + s*0.10);

    ctx.restore();
  }

  function drawCam(ctx, cx, cy, s, col){
    const r = s * 0.20;
    const ang = t * 0.65;

    // follower track on right
    const fx = cx + s * 0.28;
    const fy0 = cy - s * 0.18;
    const fy1 = cy + s * 0.22;

    // cam profile (wobble)
    const lift = 0.5 + 0.5 * Math.sin(ang);
    const followerY = lerp(fy1, fy0, 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(ang + 0.8)));

    // plot lift curve (simple) in mini panel
    const px = cx - s * 0.30;
    const py = cy + s * 0.18;
    const pw = s * 0.42;
    const ph = s * 0.16;

    ctx.save();

    // cam body
    ctx.translate(cx - s*0.12, cy);
    ctx.rotate(ang);

    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = 'rgba(231,238,246,0.80)';
    ctx.lineWidth = Math.max(3, Math.floor(s * 0.028));
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const steps = 80;
    for (let i=0;i<=steps;i++){
      const a = (i / steps) * Math.PI * 2;
      const k = 1 + 0.18 * Math.sin(a * 2 + 0.6) + 0.10 * Math.sin(a * 3 - 0.9);
      const rr = r * k;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i===0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // hub
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.018));
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.25, 0, Math.PI*2);
    ctx.stroke();

    ctx.restore();

    // follower rail
    ctx.save();
    ctx.globalAlpha = 0.70;
    ctx.strokeStyle = 'rgba(231,238,246,0.45)';
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.016));
    ctx.beginPath();
    ctx.moveTo(fx, fy0);
    ctx.lineTo(fx, fy1);
    ctx.stroke();

    // follower
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = 'rgba(231,238,246,0.80)';
    ctx.lineWidth = Math.max(3, Math.floor(s * 0.022));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx, followerY);
    ctx.lineTo(fx, followerY + s * 0.18);
    ctx.stroke();

    // highlight lift arrow
    arrow(ctx, fx + s*0.12, followerY, fx + s*0.12, followerY + s*0.18, col);

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(231,238,246,0.86)';
    ctx.font = `${Math.floor(font * 0.72)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('LIFT', fx + s*0.15, followerY + s*0.10);

    // plot curve
    ctx.globalAlpha = 0.62;
    ctx.strokeStyle = 'rgba(231,238,246,0.30)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, pw, ph);

    ctx.globalAlpha = 0.90;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.010));
    ctx.beginPath();
    for (let i=0;i<=64;i++){
      const u = i / 64;
      const a = u * Math.PI * 2;
      const y = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(a + 0.8));
      const x = px + u * pw;
      const yy = py + (1 - y) * ph;
      if (i===0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();

    // marker
    const mx = px + ((ang % (Math.PI*2)) / (Math.PI*2)) * pw;
    const my = py + (1 - (0.25 + 0.55 * (0.5 + 0.5 * Math.sin(ang + 0.8)))) * ph;
    joint(ctx, mx, my, Math.max(2, s*0.014), col);

    ctx.restore();
  }

  function drawEscapement(ctx, cx, cy, s, col){
    const wheelR = s * 0.16;
    const wx = cx - s * 0.05;
    const wy = cy + s * 0.02;

    const pendL = s * 0.34;
    const px = cx + s * 0.28;
    const py = cy - s * 0.12;

    const swing = Math.sin(t * 1.4) * 0.35;

    // escape wheel: step-ish motion
    const step = Math.floor((t * 1.2) % 12);
    const a = step * (Math.PI * 2 / 12);

    ctx.save();

    // wheel
    ctx.globalAlpha = 0.95;
    drawGear(ctx, wx, wy, wheelR, 12, a, 'rgba(231,238,246,0.78)');

    // pallets (little bracket)
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(231,238,246,0.70)';
    ctx.lineWidth = Math.max(3, Math.floor(s * 0.020));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wx + wheelR*0.75, wy - wheelR*0.35);
    ctx.lineTo(wx + wheelR*1.25, wy);
    ctx.lineTo(wx + wheelR*0.75, wy + wheelR*0.35);
    ctx.stroke();

    // pendulum
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(swing);
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = 'rgba(231,238,246,0.78)';
    ctx.lineWidth = Math.max(3, Math.floor(s * 0.022));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, pendL);
    ctx.stroke();
    joint(ctx, 0, 0, Math.max(3, s*0.020));

    // bob
    const by = pendL;
    ctx.globalAlpha = 0.90;
    ctx.strokeStyle = 'rgba(231,238,246,0.75)';
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.016));
    ctx.beginPath();
    ctx.arc(0, by, s*0.06, 0, Math.PI*2);
    ctx.stroke();

    // highlight arc path
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.010));
    ctx.beginPath();
    ctx.arc(0, 0, pendL, -0.35, 0.35);
    ctx.stroke();

    ctx.restore();

    // tick label
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(231,238,246,0.86)';
    ctx.font = `${Math.floor(font * 0.72)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('TICK', wx - wheelR*0.4, wy + wheelR + s*0.10);
    ctx.fillText('TOCK', wx + wheelR*0.35, wy + wheelR + s*0.10);

    // highlight impulse arrow
    ctx.globalAlpha = 0.60;
    arrow(ctx, wx + wheelR*1.25, wy, wx + wheelR*0.95, wy, col);

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    drawHeader(ctx);

    const seg = SEGMENTS[segIndex];
    const a = segAlpha();

    const s = Math.min(w, h);
    const cx = w * 0.50;
    const cy = h * 0.56;

    const accent = 'rgba(120,210,255,0.78)';

    ctx.save();
    ctx.globalAlpha = 0.80 + 0.20 * a;

    if (seg.key === 'fourbar') drawFourBar(ctx, cx, cy, s * 0.85, accent);
    else if (seg.key === 'gears') drawGears(ctx, cx, cy, s * 0.85, accent);
    else if (seg.key === 'cam') drawCam(ctx, cx, cy, s * 0.85, accent);
    else drawEscapement(ctx, cx, cy, s * 0.85, accent);

    ctx.restore();

    drawInfoPanel(ctx, seg);

    // tiny footer
    ctx.save();
    ctx.globalAlpha = 0.52;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.font = `${Math.floor(font * 0.70)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('Watch for motion paths and conversions.', Math.floor(w * 0.05), Math.floor(h * 0.92));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
