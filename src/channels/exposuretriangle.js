import { mulberry32, clamp } from '../util/prng.js';

// REVIEWED: 2026-02-11

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

const ISO = [100, 200, 400, 800, 1600, 3200];
const FSTOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
const SHUTTERS = [1/1000, 1/500, 1/250, 1/125, 1/60, 1/30, 1/15, 1/8, 1/4, 1/2, 1, 2];

function fmtISO(v){ return `ISO ${v}`; }
function fmtF(v){ return `f/${v}`; }
function fmtShutter(v){
  if (v >= 1) return `${v}s`;
  const inv = Math.round(1 / v);
  return `1/${inv}s`;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0;
  let t = 0;
  let font = 16;
  let big = 48;

  // palette: warm film + cyan HUD
  const hue = 40 + rand() * 25;
  const paperA = `hsl(${hue}, 35%, 18%)`;
  const paperB = `hsl(${hue + 12}, 35%, 9%)`;
  const hudHue = (190 + rand() * 25) % 360;
  const hud = `hsl(${hudHue}, 85%, 70%)`;
  const hudDim = `hsla(${hudHue}, 70%, 70%, 0.55)`;
  const warn = `hsl(${(hudHue + 320) % 360}, 90%, 65%)`;

  const grain = new Array(320).fill(0).map(() => ({
    x: rand(),
    y: rand(),
    r: 0.6 + rand() * 1.6,
    a: 0.03 + rand() * 0.08,
    s: 0.01 + rand() * 0.06,
    p: rand() * 10,
  }));

  const vignette = { a: 0.85 + rand() * 0.1 };

  const segments = [
    { kind: 'intro', dur: 4.2 },
    { kind: 'iso', dur: 7.6 },
    { kind: 'aperture', dur: 7.6 },
    { kind: 'shutter', dur: 7.6 },
    { kind: 'quiz', dur: 9.2 },
    { kind: 'test', dur: 9.2 },
    { kind: 'end', dur: 4.5 },
  ];

  let segIndex = 0;
  let segT = 0;

  // settings as stop indices
  let isoI = 1 + ((rand() * 3) | 0);
  let fI = 2 + ((rand() * 3) | 0);
  let sI = 3 + ((rand() * 4) | 0);

  // baseline for "meter" calculation
  let baseIsoI = isoI;
  let baseFI = fI;
  let baseSI = sI;

  let flash = 0;
  let clickPulse = 0;

  let quiz = null; // {name, goal, rec:{isoI,fI,sI}}
  let quizRevealed = false;

  let bed = null;

  function cur(){ return segments[segIndex] || segments[0]; }

  function pick(arr){ return arr[(rand() * arr.length) | 0]; }

  function scenario(){
    // Deterministic selection; each uses a different "priority".
    const s = pick(['LOW LIGHT', 'ACTION', 'PORTRAIT', 'LANDSCAPE']);
    if (s === 'LOW LIGHT'){
      return {
        name: s,
        goal: 'BRIGHTER (STAY STEADY)',
        rec: {
          isoI: Math.min(ISO.length - 1, baseIsoI + 2),
          fI: Math.max(0, baseFI - 2),
          sI: Math.min(SHUTTERS.length - 1, baseSI + 1),
        }
      };
    }
    if (s === 'ACTION'){
      return {
        name: s,
        goal: 'FREEZE MOTION',
        rec: {
          isoI: Math.min(ISO.length - 1, baseIsoI + 1),
          fI: Math.max(0, baseFI - 1),
          sI: Math.max(0, baseSI - 2),
        }
      };
    }
    if (s === 'PORTRAIT'){
      return {
        name: s,
        goal: 'SHALLOW DEPTH',
        rec: {
          isoI: Math.max(0, baseIsoI - 1),
          fI: Math.max(0, baseFI - 3),
          sI: Math.max(0, baseSI - 1),
        }
      };
    }
    // LANDSCAPE
    return {
      name: s,
      goal: 'SHARP + CLEAN',
      rec: {
        isoI: Math.max(0, baseIsoI - 1),
        fI: Math.min(FSTOPS.length - 1, baseFI + 2),
        sI: Math.min(SHUTTERS.length - 1, baseSI + 2),
      }
    };
  }

  function segmentStarted(s){
    flash = Math.max(0, flash * 0.5);
    clickPulse = 0;
    if (s.kind === 'quiz'){
      quiz = scenario();
      quizRevealed = false;
    }

    if (!audio.enabled) return;

    if (s.kind === 'test'){
      audio.beep({ freq: 860, dur: 0.04, gain: 0.035, type: 'square' });
      audio.beep({ freq: 520, dur: 0.06, gain: 0.03, type: 'triangle' });
    } else {
      audio.beep({ freq: 640, dur: 0.05, gain: 0.03, type: 'square' });
    }
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    big = Math.max(44, Math.floor(Math.min(w, h) / 9.2));

    segIndex = 0;
    segT = 0;

    // base values remain stable per seed
    isoI = 1 + ((rand() * 3) | 0);
    fI = 2 + ((rand() * 3) | 0);
    sI = 3 + ((rand() * 4) | 0);

    baseIsoI = isoI;
    baseFI = fI;
    baseSI = sI;

    flash = 0;
    clickPulse = 0;

    quiz = null;
    quizRevealed = false;

    segmentStarted(cur());
  }

  function onResize(width, height){
    init({ width, height });
  }

  function update(dt){
    t += dt;
    segT += dt;

    flash = Math.max(0, flash - dt * 1.6);
    clickPulse = Math.max(0, clickPulse - dt * 2.8);

    const s = cur();
    if (segT >= s.dur){
      segT = 0;
      segIndex = (segIndex + 1) % segments.length;
      segmentStarted(cur());
    }

    const cs = cur();

    // gentle teaching motion: nudge the active parameter in a loop.
    const wob = 0.5 + 0.5 * Math.sin(segT * 0.9);

    isoI = baseIsoI;
    fI = baseFI;
    sI = baseSI;

    if (cs.kind === 'iso'){
      isoI = clamp(Math.round(lerp(baseIsoI - 1, baseIsoI + 2, wob)), 0, ISO.length - 1);
    } else if (cs.kind === 'aperture'){
      fI = clamp(Math.round(lerp(baseFI - 2, baseFI + 2, wob)), 0, FSTOPS.length - 1);
    } else if (cs.kind === 'shutter'){
      sI = clamp(Math.round(lerp(baseSI - 2, baseSI + 3, wob)), 0, SHUTTERS.length - 1);
    } else if (cs.kind === 'quiz'){
      const settle = ease(segT / (cs.dur * 0.25));
      // show "student attempt" first, then reveal recommendation.
      const attempt = {
        isoI: clamp(baseIsoI + ((rand() * 3) | 0) - 1, 0, ISO.length - 1),
        fI: clamp(baseFI + ((rand() * 3) | 0) - 1, 0, FSTOPS.length - 1),
        sI: clamp(baseSI + ((rand() * 3) | 0) - 1, 0, SHUTTERS.length - 1),
      };
      isoI = attempt.isoI;
      fI = attempt.fI;
      sI = attempt.sI;

      const revealAt = cs.dur * 0.62;
      if (!quizRevealed && segT >= revealAt){
        quizRevealed = true;
        flash = Math.max(flash, 0.8);
        clickPulse = 1;
        if (audio.enabled) audio.beep({ freq: 980, dur: 0.06, gain: 0.032, type: 'square' });
      }
      if (quizRevealed && quiz){
        isoI = clamp(Math.round(lerp(attempt.isoI, quiz.rec.isoI, settle)), 0, ISO.length - 1);
        fI = clamp(Math.round(lerp(attempt.fI, quiz.rec.fI, settle)), 0, FSTOPS.length - 1);
        sI = clamp(Math.round(lerp(attempt.sI, quiz.rec.sI, settle)), 0, SHUTTERS.length - 1);
      }
    } else if (cs.kind === 'test'){
      // lock to quiz recommendation if we have one
      if (quiz?.rec){
        isoI = quiz.rec.isoI;
        fI = quiz.rec.fI;
        sI = quiz.rec.sI;
      }

      // special moment: shutter click
      const clickAt = cs.dur * 0.38;
      if (segT >= clickAt && clickPulse <= 0.001){
        clickPulse = 1;
        flash = Math.max(flash, 0.9);
        if (audio.enabled){
          audio.beep({ freq: 1200, dur: 0.018, gain: 0.03, type: 'square' });
          audio.beep({ freq: 260, dur: 0.06, gain: 0.03, type: 'triangle' });
        }
      }
    }
  }

  function meterStopDelta(){
    // +ve means "brighter" (more light / higher ISO / slower shutter / wider aperture)
    // Use stop-steps: ISO up = +1, shutter slower = +1, aperture wider (lower index) = +1.
    const dISO = (isoI - baseIsoI);
    const dS = (sI - baseSI);
    const dF = (baseFI - fI);
    return dISO + dS + dF;
  }

  function drawBg(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, paperA);
    g.addColorStop(1, paperB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle grain drift
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const d of grain){
      const yy = (d.y + t * d.s) % 1;
      const xx = (d.x + Math.sin(t * 0.25 + d.p) * 0.02) % 1;
      ctx.globalAlpha = d.a * (0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.2 + d.p)));
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.beginPath();
      ctx.arc(xx * w, yy * h, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.2, w * 0.5, h * 0.45, Math.max(w, h) * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${vignette.a})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // scanlines
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const step = Math.max(2, Math.floor(Math.min(w, h) / 130));
    for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, 1);
    ctx.restore();
  }

  function drawTriangle(ctx, x, y, size, focus){
    const a = { x: x + size * 0.5, y: y };
    const b = { x: x, y: y + size * 0.92 };
    const c = { x: x + size, y: y + size * 0.92 };

    ctx.save();
    ctx.lineWidth = Math.max(2, Math.floor(size / 120));
    ctx.strokeStyle = hudDim;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.stroke();

    // inner lines
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(x + size * 0.5, y + size * 0.56);
    ctx.lineTo(b.x, b.y);
    ctx.moveTo(x + size * 0.5, y + size * 0.56);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();

    ctx.fillStyle = hud;
    ctx.font = `600 ${Math.floor(font * 1.2)}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const fp = (kind) => (focus === kind ? 1 : 0);

    // ISO (top)
    ctx.globalAlpha = 0.65 + 0.35 * fp('iso');
    ctx.fillText('ISO', a.x, a.y - font * 0.25);

    // APERTURE (left)
    ctx.globalAlpha = 0.65 + 0.35 * fp('aperture');
    ctx.save();
    ctx.translate(b.x - font * 0.35, b.y);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('APERTURE', 0, 0);
    ctx.restore();

    // SHUTTER (right)
    ctx.globalAlpha = 0.65 + 0.35 * fp('shutter');
    ctx.save();
    ctx.translate(c.x + font * 0.35, c.y);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('SHUTTER', 0, 0);
    ctx.restore();

    ctx.restore();

    return { a, b, c };
  }

  function drawDial(ctx, x, y, w0, label, value, active){
    ctx.save();
    const r = Math.min(w0, font * 3.2);

    // panel
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    roundRect(ctx, x, y, w0, r, 14);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = hudDim;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w0, r, 14);
    ctx.stroke();

    // label
    ctx.globalAlpha = active ? 1 : 0.75;
    ctx.fillStyle = active ? hud : hudDim;
    ctx.font = `700 ${font}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + font * 0.7, y + r * 0.5);

    // value
    ctx.textAlign = 'right';
    ctx.fillStyle = active ? hud : 'rgba(232,240,252,0.8)';
    ctx.fillText(value, x + w0 - font * 0.7, y + r * 0.5);

    ctx.restore();
  }

  function drawMeter(ctx, x, y, w0, h0, deltaStops){
    ctx.save();

    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    roundRect(ctx, x, y, w0, h0, 16);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = hudDim;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w0, h0, 16);
    ctx.stroke();

    const mid = x + w0 * 0.5;
    const cy = y + h0 * 0.52;

    // ticks
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(231,238,246,0.35)';
    ctx.beginPath();
    for (let i = -4; i <= 4; i++){
      const tx = mid + (i / 4) * (w0 * 0.42);
      const th = i % 2 === 0 ? h0 * 0.28 : h0 * 0.18;
      ctx.moveTo(tx, cy - th * 0.5);
      ctx.lineTo(tx, cy + th * 0.5);
    }
    ctx.stroke();

    // needle
    const n = clamp(deltaStops / 4, -1, 1);
    const nx = mid + n * (w0 * 0.42);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = Math.abs(deltaStops) <= 0.5 ? hud : warn;
    ctx.lineWidth = Math.max(2, Math.floor(font / 7) + 2);
    ctx.beginPath();
    ctx.moveTo(nx, y + h0 * 0.18);
    ctx.lineTo(nx, y + h0 * 0.86);
    ctx.stroke();

    // label
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = hud;
    ctx.font = `700 ${Math.floor(font * 0.95)}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const txt = deltaStops === 0 ? 'METER: OK' : `METER: ${deltaStops > 0 ? '+' : ''}${deltaStops.toFixed(0)} STOP`;
    ctx.fillText(txt, x + w0 * 0.5, y + h0 + font * 0.35);

    ctx.restore();
  }

  function drawTestShot(ctx, x, y, w0, h0){
    const iso = ISO[isoI];
    const f = FSTOPS[fI];
    const sh = SHUTTERS[sI];

    // effect knobs
    const grainAmt = clamp((isoI / (ISO.length - 1)), 0, 1);
    const blurAmt = clamp((sI / (SHUTTERS.length - 1)), 0, 1);
    const bokehAmt = clamp(1 - (fI / (FSTOPS.length - 1)), 0, 1);

    const brightStops = meterStopDelta();
    const exp = clamp(0.48 + brightStops * 0.11, 0.12, 0.92);

    ctx.save();

    // frame
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, x - 10, y - 10, w0 + 20, h0 + 20, 18);
    ctx.fill();

    ctx.fillStyle = 'rgba(12,14,18,1)';
    roundRect(ctx, x, y, w0, h0, 12);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, w0, h0, 12);
    ctx.clip();

    // background bokeh circles
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 10; i++){
      const px = x + (0.12 + i * 0.09) * w0 + Math.sin(t * (0.2 + i * 0.03)) * w0 * 0.02;
      const py = y + (0.2 + (i % 5) * 0.13) * h0 + Math.cos(t * (0.18 + i * 0.02)) * h0 * 0.02;
      const rr = (0.04 + (i % 3) * 0.02) * Math.min(w0, h0) * (0.45 + bokehAmt * 1.1);
      ctx.globalAlpha = 0.08 + bokehAmt * 0.12;
      const col = i % 2 === 0 ? `rgba(90,210,255,1)` : `rgba(255,160,90,1)`;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.fill();
    }

    // subject: moving "duck" block with motion smear
    const cx = x + w0 * (0.22 + 0.56 * (0.5 + 0.5 * Math.sin(t * 0.55)));
    const cy = y + h0 * (0.64 + 0.06 * Math.sin(t * 0.9));
    const sw = w0 * 0.12;
    const shh = h0 * 0.18;
    const smear = (0.5 + blurAmt * 6.5) * (0.5 + 0.5 * Math.sin(t * 0.9));

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(255, 220, 120, ${0.55 + exp * 0.35})`;
    for (let k = 0; k < 6; k++){
      const a = (1 - k / 6) * (0.12 + blurAmt * 0.18);
      ctx.globalAlpha = a;
      roundRect(ctx, cx - sw * 0.5 - k * smear, cy - shh * 0.5, sw, shh, 10);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(255, 240, 210, ${0.45 + exp * 0.45})`;
    roundRect(ctx, cx - sw * 0.5, cy - shh * 0.5, sw, shh, 10);
    ctx.fill();

    // exposure wash
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.16 + exp * 0.45;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillRect(x, y, w0, h0);

    // grain overlay (re-use the precomputed grain points)
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255,255,255,1)';
    for (let i = 0; i < 120; i++){
      const g = grain[i];
      const px = x + ((g.x + t * g.s * 0.4) % 1) * w0;
      const py = y + ((g.y + t * g.s * 0.6) % 1) * h0;
      ctx.globalAlpha = g.a * (0.8 + grainAmt * 2.2);
      ctx.fillRect(px, py, g.r, g.r);
    }

    // capture flash overlay
    if (clickPulse > 0){
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = clickPulse * 0.22;
      ctx.fillStyle = 'rgba(180,240,255,1)';
      ctx.fillRect(x, y, w0, h0);
    }

    ctx.restore(); // clip

    // caption
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(231,238,246,0.8)';
    ctx.font = `700 ${Math.floor(font * 0.95)}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`TEST SHOT  —  ${fmtISO(iso)}  ${fmtF(f)}  ${fmtShutter(sh)}`, x, y + h0 + font * 0.55);

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBg(ctx);

    const s = cur();
    const focus = s.kind === 'iso' ? 'iso' : (s.kind === 'aperture' ? 'aperture' : (s.kind === 'shutter' ? 'shutter' : null));

    const pad = Math.max(16, Math.floor(Math.min(w, h) * 0.04));

    // title block
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    roundRect(ctx, pad, pad, w - pad * 2, font * 2.6, 16);
    ctx.fill();

    ctx.fillStyle = hud;
    ctx.font = `800 ${Math.floor(font * 1.1)}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const head = 'EXPOSURE TRIANGLE SCHOOL';
    ctx.fillText(head, pad + font * 0.8, pad + font * 1.3);

    ctx.fillStyle = 'rgba(231,238,246,0.75)';
    ctx.font = `600 ${Math.floor(font * 0.85)}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'right';
    ctx.fillText(s.kind.toUpperCase(), w - pad - font * 0.8, pad + font * 1.3);
    ctx.restore();

    // main layout
    const triSize = Math.min(w, h) * 0.34;
    const triX = pad + Math.min(w, h) * 0.06;
    const triY = pad + font * 3.0 + Math.min(w, h) * 0.04;

    drawTriangle(ctx, triX, triY, triSize, focus);

    // dials
    const dialW = Math.min(w * 0.36, Math.max(260, triSize * 0.95));
    const dx = triX + triSize + pad * 0.9;
    const dy = triY + triSize * 0.05;
    const gap = Math.max(10, Math.floor(font * 0.75));
    const rowH = Math.floor(font * 3.2);

    drawDial(ctx, dx, dy, dialW, 'ISO', fmtISO(ISO[isoI]), s.kind === 'iso');
    drawDial(ctx, dx, dy + rowH + gap, dialW, 'APERTURE', fmtF(FSTOPS[fI]), s.kind === 'aperture');
    drawDial(ctx, dx, dy + (rowH + gap) * 2, dialW, 'SHUTTER', fmtShutter(SHUTTERS[sI]), s.kind === 'shutter');

    // meter
    const mY = dy + (rowH + gap) * 3 + gap * 0.3;
    drawMeter(ctx, dx, mY, dialW, Math.floor(font * 2.6), meterStopDelta());

    // quiz prompt + reveal
    if (s.kind === 'quiz' && quiz){
      ctx.save();
      const bx = dx;
      const by = mY + font * 3.6;
      const bw = dialW;
      const bh = Math.floor(font * 4.2);
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      roundRect(ctx, bx, by, bw, bh, 16);
      ctx.fill();

      ctx.fillStyle = hud;
      ctx.font = `800 ${Math.floor(font * 0.95)}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`SCENARIO: ${quiz.name}`, bx + font * 0.7, by + font * 0.55);
      ctx.fillStyle = 'rgba(231,238,246,0.78)';
      ctx.font = `700 ${Math.floor(font * 0.88)}px ui-sans-serif, system-ui`;
      ctx.fillText(`GOAL: ${quiz.goal}`, bx + font * 0.7, by + font * 1.65);

      if (!quizRevealed){
        ctx.fillStyle = hudDim;
        ctx.font = `700 ${Math.floor(font * 0.82)}px ui-sans-serif, system-ui`;
        ctx.fillText('Pick settings… then wait for reveal.', bx + font * 0.7, by + font * 2.8);
      } else {
        ctx.fillStyle = hud;
        ctx.font = `900 ${Math.floor(font * 0.92)}px ui-sans-serif, system-ui`;
        ctx.fillText('REVEAL: dial toward the goal.', bx + font * 0.7, by + font * 2.8);
      }
      ctx.restore();
    }

    // test shot panel
    if (s.kind === 'test'){
      const px = triX;
      const py = triY + triSize + pad * 0.75;
      const pw = w - pad * 2;
      const ph = Math.min(h - py - pad * 1.25, Math.min(h, w) * 0.26);
      if (ph > font * 6) drawTestShot(ctx, px, py, pw, ph);
    }

    // end card
    if (s.kind === 'end'){
      ctx.save();
      const cx = w * 0.5;
      const cy = h * 0.72;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.2);

      ctx.globalAlpha = 0.95;
      ctx.fillStyle = 'rgba(0,0,0,0.36)';
      roundRect(ctx, cx - w * 0.24, cy - font * 1.8, w * 0.48, font * 3.8, 18);
      ctx.fill();

      ctx.fillStyle = hud;
      ctx.font = `900 ${big}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PERFECT', cx, cy - font * 0.2);

      ctx.fillStyle = `rgba(231,238,246,${0.7 + pulse * 0.2})`;
      ctx.font = `800 ${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
      ctx.fillText('ONE STOP AT A TIME', cx, cy + font * 1.2);

      ctx.restore();
    }

    if (flash > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = flash * 0.12;
      ctx.fillStyle = 'rgba(108,242,255,1)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    bed = audio.noiseSource({ type: 'pink', gain: 0.016 });
    bed.start();
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

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
