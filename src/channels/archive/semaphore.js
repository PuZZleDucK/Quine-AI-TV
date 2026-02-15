import { mulberry32, clamp } from '../../util/prng.js';

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

// Classic 8-position semaphore: 1=up, then clockwise in 45° steps.
function posAngle(pos){
  // 1..8
  return (-Math.PI / 2) + (pos - 1) * (Math.PI / 4);
}

// A simple, standard-ish mapping: ordered combinations of (1..8) pick 2.
// (This matches many common semaphore charts: A=1-2 ... Z=6-7)
const SEM = {
  A: [1, 2], B: [1, 3], C: [1, 4], D: [1, 5], E: [1, 6], F: [1, 7], G: [1, 8],
  H: [2, 3], I: [2, 4], J: [2, 5], K: [2, 6], L: [2, 7], M: [2, 8],
  N: [3, 4], O: [3, 5], P: [3, 6], Q: [3, 7], R: [3, 8],
  S: [4, 5], T: [4, 6], U: [4, 7], V: [4, 8],
  W: [5, 6], X: [5, 7], Y: [5, 8], Z: [6, 7],
  // extra signals (not displayed as letters, but used for end cards)
  NUM: [6, 8],
  CANCEL: [7, 8],
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0;
  let t = 0;

  let font = 16;
  let big = 56;

  const hue = 170 + rand() * 45;
  const chalk = `hsl(${hue}, 85%, 70%)`;
  const chalkDim = `hsla(${hue}, 75%, 72%, 0.55)`;

  const boardHue = 145 + rand() * 25;
  const boardA = `hsl(${boardHue}, 42%, 20%)`;
  const boardB = `hsl(${boardHue + 12}, 38%, 14%)`;

  const flagA = `hsl(${(hue + 330) % 360}, 86%, 58%)`;
  const flagB = `hsl(${(hue + 40) % 360}, 92%, 60%)`;

  const dust = new Array(26).fill(0).map(() => ({
    x: rand(),
    y: rand(),
    r: 0.7 + rand() * 1.8,
    s: 0.01 + rand() * 0.06,
    a: 0.04 + rand() * 0.1,
  }));

  const smudges = new Array(9).fill(0).map(() => ({
    x: 0.08 + rand() * 0.84,
    y: 0.12 + rand() * 0.78,
    w: 0.12 + rand() * 0.22,
    h: 0.02 + rand() * 0.06,
  }));

  const segments = [];
  function makeWord(len){
    let s = '';
    for (let i = 0; i < len; i++) s += ALPHABET[(rand() * 26) | 0];
    return s;
  }

  // Build a repeating lesson plan: alphabet blocks + quick quizzes + a stampy end card.
  for (let i = 0; i < ALPHABET.length; i++){
    segments.push({ kind: 'letter', letter: ALPHABET[i], dur: 2.15 });
    if ((i + 1) % 7 === 0 && i < 25){
      segments.push({ kind: 'quiz', word: makeWord(3 + ((rand() * 3) | 0)), dur: 7.5 });
    }
  }
  segments.push({ kind: 'end', dur: 4.3 });

  let segIndex = 0;
  let segT = 0;

  let flash = 0;
  let revealPulse = 0;
  let revealed = false;

  let bed = null;

  function cur(){ return segments[segIndex] || segments[0]; }

  function segmentStarted(s){
    revealed = false;
    revealPulse = 0;
    if (!audio.enabled) return;

    if (s.kind === 'letter'){
      const i = s.letter.charCodeAt(0) - 65;
      audio.beep({ freq: 340 + i * 9, dur: 0.05, gain: 0.03, type: 'square' });
    } else if (s.kind === 'quiz'){
      audio.beep({ freq: 920, dur: 0.06, gain: 0.035, type: 'square' });
      audio.beep({ freq: 640, dur: 0.05, gain: 0.025, type: 'triangle' });
    } else if (s.kind === 'end'){
      audio.beep({ freq: 520, dur: 0.06, gain: 0.03, type: 'triangle' });
      audio.beep({ freq: 360, dur: 0.08, gain: 0.025, type: 'sine' });
    }
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    big = Math.max(46, Math.floor(Math.min(w, h) / 8.8));

    segIndex = 0;
    segT = 0;

    flash = 0;
    revealPulse = 0;

    segmentStarted(cur());
  }

  function onResize(width, height){
    init({ width, height });
  }

  function update(dt){
    t += dt;
    segT += dt;

    flash = Math.max(0, flash - dt * 1.5);
    revealPulse = Math.max(0, revealPulse - dt * 2.2);

    const s = cur();
    if (segT >= s.dur){
      segT = 0;
      segIndex = (segIndex + 1) % segments.length;
      segmentStarted(cur());
    }

    // timed special moment: quiz reveal pulse
    const cs = cur();
    if (cs.kind === 'quiz'){
      const revealAt = cs.dur * 0.66;
      if (!revealed && segT >= revealAt){
        revealed = true;
        revealPulse = 1;
        flash = Math.max(flash, 0.75);
        if (audio.enabled) audio.beep({ freq: 1080, dur: 0.06, gain: 0.03, type: 'square' });
      }
    }
  }

  function drawBg(ctx){
    const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.9);
    g.addColorStop(0, 'rgba(16, 24, 34, 1)');
    g.addColorStop(0.55, 'rgba(6, 8, 12, 1)');
    g.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // chalk dust drift
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = chalk;
    for (const d of dust){
      const yy = (d.y + t * d.s) % 1;
      const xx = (d.x + Math.sin(t * 0.3 + d.y * 10) * 0.02) % 1;
      ctx.globalAlpha = d.a;
      ctx.beginPath();
      ctx.arc(xx * w, yy * h, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // scanlines
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const step = Math.max(2, Math.floor(Math.min(w, h) / 120));
    for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, 1);
    ctx.restore();
  }

  function drawBoard(ctx, bx, by, bw, bh){
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, bx + 10, by + 14, bw, bh, 28);
    ctx.fill();

    const bg = ctx.createLinearGradient(bx, by, bx, by + bh);
    bg.addColorStop(0, boardA);
    bg.addColorStop(1, boardB);

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = bg;
    roundRect(ctx, bx, by, bw, bh, 28);
    ctx.fill();

    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = chalkDim;
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, bw, bh, 28);
    ctx.stroke();

    // subtle chalk smudges (precomputed; no hot-path rand)
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = chalk;
    for (const s of smudges){
      ctx.fillRect(bx + s.x * bw, by + s.y * bh, s.w * bw, s.h * bh);
    }

    ctx.restore();
  }

  function drawPoseGuide(ctx, cx, cy, R){
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = chalk;
    ctx.lineWidth = Math.max(1, Math.floor(R * 0.03));
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.18;
    for (let p = 1; p <= 8; p++){
      const a = posAngle(p);
      const x2 = cx + Math.cos(a) * R;
      const y2 = cy + Math.sin(a) * R;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.globalAlpha = 0.16;
      ctx.fillStyle = chalk;
      ctx.beginPath();
      ctx.arc(x2, y2, Math.max(2, R * 0.05), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.18;
    }
    ctx.restore();
  }

  function drawSignalPerson(ctx, cx, cy, scale, pair, glow=0){
    const armL = scale * 0.48;
    const torso = scale * 0.32;
    const headR = scale * 0.11;

    const wob = Math.sin(t * 0.8) * 0.012;
    const flutter = 0.06 * Math.sin(t * 7.4) + 0.03 * Math.sin(t * 11.2);

    const a1 = posAngle(pair[0]) + wob;
    const a2 = posAngle(pair[1]) - wob;

    const sx = cx;
    const sy = cy;

    function armEnd(a){
      return { x: sx + Math.cos(a) * armL, y: sy + Math.sin(a) * armL };
    }

    const e1 = armEnd(a1);
    const e2 = armEnd(a2);

    // body
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = 'rgba(230, 238, 246, 0.75)';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, scale * 0.06);

    // torso
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + torso);
    ctx.stroke();

    // head
    ctx.fillStyle = 'rgba(230, 238, 246, 0.62)';
    ctx.beginPath();
    ctx.arc(cx, cy - headR * 1.55, headR, 0, Math.PI * 2);
    ctx.fill();

    // arms
    if (glow > 0){
      ctx.shadowColor = chalk;
      ctx.shadowBlur = 14 + glow * 22;
    }

    ctx.strokeStyle = `rgba(108,242,255,${0.25 + glow * 0.35})`;
    ctx.lineWidth = Math.max(2, scale * 0.075);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(e1.x, e1.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(e2.x, e2.y);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // flags
    function flag(end, ang, color){
      const fw = scale * 0.18;
      const fh = scale * 0.12;

      const fa = ang + flutter;
      const ux = Math.cos(fa);
      const uy = Math.sin(fa);
      const nx = -uy;
      const ny = ux;

      const tipX = end.x + ux * (fw * 0.65);
      const tipY = end.y + uy * (fw * 0.65);

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(tipX + nx * fh, tipY + ny * fh);
      ctx.lineTo(tipX - nx * fh, tipY - ny * fh);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(end.x + ux * 4, end.y + uy * 4);
      ctx.lineTo(tipX + nx * fh * 0.55, tipY + ny * fh * 0.55);
      ctx.lineTo(tipX - nx * fh * 0.55, tipY - ny * fh * 0.55);
      ctx.closePath();
      ctx.fill();
    }

    flag(e1, a1, flagA);
    flag(e2, a2, flagB);

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBg(ctx);

    const s = cur();
    const p = ease(segT / s.dur);

    const bx = Math.floor(w * 0.08);
    const by = Math.floor(h * 0.12);
    const bw = Math.floor(w * 0.84);
    const bh = Math.floor(h * 0.78);

    drawBoard(ctx, bx, by, bw, bh);

    // board content area
    const pad = Math.floor(Math.min(bw, bh) * 0.06);
    const ix = bx + pad;
    const iy = by + pad;
    const iw = bw - pad * 2;
    const ih = bh - pad * 2;

    const boardCx = ix + iw * 0.36 + Math.sin(t * 0.25) * iw * 0.01;
    const boardCy = iy + ih * 0.55 + Math.sin(t * 0.2 + 1) * ih * 0.008;
    const scale = Math.min(iw, ih) * 0.58;

    // choose what pose to show
    let title = 'SEMAPHORE SIGNAL SCHOOL';
    let subtitle = 'timed lessons • learn the 8 positions';
    let bigText = '';
    let smallRight = '';
    let pose = SEM.CANCEL;
    let glow = 0.0;

    if (s.kind === 'letter'){
      pose = SEM[s.letter] || SEM.CANCEL;
      bigText = s.letter;
      smallRight = `${pose[0]}-${pose[1]}`;
      subtitle = 'watch the flags • match the positions';
      glow = 0.15 + 0.45 * (1 - Math.abs(0.5 - p) * 2);
    } else if (s.kind === 'quiz'){
      const word = s.word;
      title = 'QUIZ';
      subtitle = 'decode the message (answer later)';

      const showDur = s.dur * 0.62;
      const revealAt = s.dur * 0.66;

      const per = showDur / Math.max(1, word.length);
      const idx = Math.min(word.length - 1, Math.floor(segT / per));
      const ch = word[idx] || word[0];

      pose = SEM[ch] || SEM.CANCEL;
      bigText = ch;
      smallRight = `LETTER ${idx + 1}/${word.length}`;
      glow = 0.18;

      if (segT >= revealAt){
        subtitle = 'answer:';
        bigText = word;
        smallRight = 'MESSAGE RECEIVED';
        glow = 0.35 + revealPulse * 0.6;
      }
    } else {
      title = 'END OF LESSON';
      subtitle = 'reset • breathe • try again';
      pose = SEM.CANCEL;
      bigText = 'MESSAGE\nRECEIVED';
      smallRight = 'STAMPED';
      glow = 0.22;
    }

    // ghost guide + person
    drawPoseGuide(ctx, boardCx, boardCy, scale * 0.52);
    drawSignalPerson(ctx, boardCx, boardCy, scale, pose, glow);

    // header text
    ctx.save();
    ctx.textBaseline = 'middle';

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.font = `${Math.floor(font * 1.15)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(title, ix, iy + font * 0.2);

    ctx.globalAlpha = 0.68;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.font = `${Math.floor(font * 0.82)}px ui-sans-serif, system-ui`;
    ctx.fillText(subtitle, ix, iy + font * 1.7);

    ctx.textAlign = 'right';
    ctx.globalAlpha = 0.7;
    ctx.font = `${Math.floor(font * 0.86)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = chalk;
    ctx.fillText(smallRight, ix + iw, iy + font * 0.2);

    ctx.restore();

    // big callout on right side
    ctx.save();
    const tx = ix + iw * 0.66;
    const ty = iy + ih * 0.52;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `${big}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    const lines = String(bigText).split('\n');
    const lh = big * 1.05;

    // subtle shadow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (let i = 0; i < lines.length; i++){
      ctx.fillText(lines[i], tx + 8, ty + (i - (lines.length - 1) / 2) * lh + 10);
    }

    // main
    const pulse = 0.6 + 0.4 * Math.sin(t * 2.4);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = `rgba(231,238,246,${0.88 + pulse * 0.06})`;
    for (let i = 0; i < lines.length; i++){
      ctx.fillText(lines[i], tx, ty + (i - (lines.length - 1) / 2) * lh);
    }

    ctx.restore();

    // reveal flash overlay
    if (flash > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(108,242,255,${flash * 0.12})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    // quiet radio/chalk ambience
    bed = audio.noiseSource({ type: 'pink', gain: 0.018 });
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
