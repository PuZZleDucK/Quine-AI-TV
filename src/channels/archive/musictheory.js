import { mulberry32, clamp } from '../util/prng.js';

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const INTERVALS = [
  { s: 0, name: 'Unison' },
  { s: 1, name: 'm2' },
  { s: 2, name: 'M2' },
  { s: 3, name: 'm3' },
  { s: 4, name: 'M3' },
  { s: 5, name: 'P4' },
  { s: 6, name: 'TT' },
  { s: 7, name: 'P5' },
  { s: 8, name: 'm6' },
  { s: 9, name: 'M6' },
  { s: 10, name: 'm7' },
  { s: 11, name: 'M7' },
];

const MODES = [
  { name: 'Ionian', deg: 1 },
  { name: 'Dorian', deg: 2 },
  { name: 'Phrygian', deg: 3 },
  { name: 'Lydian', deg: 4 },
  { name: 'Mixolydian', deg: 5 },
  { name: 'Aeolian', deg: 6 },
  { name: 'Locrian', deg: 7 },
];

const LESSONS = [
  { id: 'intervals', title: 'Intervals', subtitle: 'count the steps; name the sound' },
  { id: 'majorscale', title: 'Major Scale', subtitle: 'W W H W W W H' },
  { id: 'triads', title: 'Triads', subtitle: 'stack thirds: 1–3–5' },
  { id: 'circle5', title: 'Circle of Fifths', subtitle: 'key neighbours; easy modulations' },
  { id: 'prog', title: 'Chord Progression', subtitle: 'I–V–vi–IV (the pop engine)' },
  { id: 'modes', title: 'Modes', subtitle: 'same notes, different “home”' },
  { id: 'rhythm', title: 'Rhythm', subtitle: 'pulse → subdivision → groove' },
];

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

function fmt(sec){
  const s = Math.max(0, Math.ceil(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function noteName(n){
  return NOTES[((n % 12) + 12) % 12];
}

function majorScale(root){
  // semitone offsets
  return [0, 2, 4, 5, 7, 9, 11].map((o) => (root + o) % 12);
}

function triad(root, quality='maj'){
  const offs = quality === 'min' ? [0, 3, 7] : (quality === 'dim' ? [0, 3, 6] : [0, 4, 7]);
  return offs.map((o) => (root + o) % 12);
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;
  let font = 16;
  let small = 12;

  // lesson loop
  const LESSON_DUR = 180; // seconds
  let lessonOrder = [];
  let lessonIndex = 0;
  let lessonT = 0;

  // per-lesson params
  let key = 0;
  let accent = '#6cf2ff';
  let warm = '#ffd36b';
  let hot = '#ff5aa5';

  // intervals
  let intervalIdx = 0;
  let intervalT = 0;

  // chords / progressions
  let progT = 0;
  let progIdx = 0;

  // modes
  let modeIdx = 0;
  let modeT = 0;

  // rhythm + audio
  let bpm = 86;
  let beat = 0;
  let tickTo = 0;

  function shuffleLessons(){
    lessonOrder = [...LESSONS];
    // deterministic shuffle
    for (let i = lessonOrder.length - 1; i > 0; i--){
      const j = (rand() * (i + 1)) | 0;
      const tmp = lessonOrder[i];
      lessonOrder[i] = lessonOrder[j];
      lessonOrder[j] = tmp;
    }
    lessonIndex = 0;
  }

  function pickPalette(){
    // vary tint slightly per seed
    const p = rand();
    if (p < 0.33){
      accent = '#6cf2ff';
      warm = '#ffd36b';
      hot = '#ff5aa5';
    } else if (p < 0.66){
      accent = '#9ad7ff';
      warm = '#63ffb6';
      hot = '#ff7a59';
    } else {
      accent = '#b2a4ff';
      warm = '#ffd36b';
      hot = '#6cf2ff';
    }
  }

  function resetLessonState(){
    key = (rand() * 12) | 0;
    bpm = 76 + ((rand() * 28) | 0);

    intervalIdx = 0;
    intervalT = 0;

    progT = 0;
    progIdx = 0;

    modeIdx = 0;
    modeT = 0;

    beat = 0;
    tickTo = 0; // fire quickly after enabling audio
  }

  function curLesson(){
    return lessonOrder[lessonIndex] || LESSONS[0];
  }

  function nextLesson(){
    lessonIndex++;
    if (lessonIndex >= lessonOrder.length){
      shuffleLessons();
    }
    lessonT = 0;
    resetLessonState();
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    pickPalette();
    shuffleLessons();
    lessonT = 0;
    resetLessonState();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    // no continuous bed; we just tick.
    tickTo = 0;
  }

  function onAudioOff(){
    // nothing to stop
  }

  function destroy(){
    onAudioOff();
  }

  function tickSound(isAccent=false){
    if (!audio.enabled) return;
    audio.beep({
      freq: isAccent ? (980 + rand() * 25) : (840 + rand() * 18),
      dur: isAccent ? 0.014 : 0.012,
      gain: isAccent ? 0.018 : 0.012,
      type: 'sine'
    });
  }

  function update(dt){
    t += dt;

    lessonT += dt;
    if (lessonT >= LESSON_DUR){
      nextLesson();
      return;
    }

    // per-lesson internal timing
    intervalT -= dt;
    if (intervalT <= 0){
      intervalT = 4.2 + rand() * 2.2;
      intervalIdx = (intervalIdx + 1 + ((rand() * 3) | 0)) % INTERVALS.length;
    }

    progT -= dt;
    if (progT <= 0){
      progT = 2.2 + rand() * 0.9;
      progIdx = (progIdx + 1) % 4;
    }

    modeT -= dt;
    if (modeT <= 0){
      modeT = 5.0 + rand() * 2.5;
      modeIdx = (modeIdx + 1) % MODES.length;
    }

    // metronome
    if (audio.enabled){
      tickTo -= dt;
      const per = 60 / Math.max(40, bpm);
      while (tickTo <= 0){
        tickTo += per;
        beat = (beat + 1) % 4;
        tickSound(beat === 0);
      }
    }
  }

  function drawBackground(ctx){
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#070c16');
    bg.addColorStop(0.55, '#0b1322');
    bg.addColorStop(1, '#04060d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // faint staff lines
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(231,238,246,0.7)';
    ctx.lineWidth = 1;
    const band = Math.floor(h * 0.48);
    const y0 = Math.floor(h * 0.26);
    for (let i = 0; i < 5; i++){
      const y = y0 + i * Math.floor(band / 10);
      ctx.beginPath();
      ctx.moveTo(Math.floor(w * 0.06), y);
      ctx.lineTo(Math.floor(w * 0.94), y);
      ctx.stroke();
    }
    // tiny moving shimmer
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = accent;
    const sweep = (t * 40) % (w + 200);
    ctx.fillRect(sweep - 200, 0, 200, h);
    ctx.restore();

    // vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(255,255,255,0.05)');
    vg.addColorStop(1, 'rgba(0,0,0,0.74)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawHeader(ctx, lesson){
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, Math.floor(h * 0.06), w, Math.floor(h * 0.11));
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = accent;
    ctx.fillRect(0, Math.floor(h * 0.17), w, 2);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('THE 3-MINUTE MUSIC THEORY', Math.floor(w * 0.05), Math.floor(h * 0.105));

    ctx.globalAlpha = 0.78;
    ctx.font = `${Math.floor(font * 0.9)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.fillText(`${lesson.title} — ${lesson.subtitle}`, Math.floor(w * 0.05), Math.floor(h * 0.145));

    // timer on right
    const rem = Math.max(0, LESSON_DUR - lessonT);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = warm;
    ctx.font = `${Math.floor(font * 1.02)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const s = fmt(rem);
    const tw = ctx.measureText(s).width;
    ctx.fillText(s, Math.floor(w * 0.95 - tw), Math.floor(h * 0.105));

    ctx.restore();
  }

  function drawCard(ctx){
    const x = Math.floor(w * 0.08);
    const y = Math.floor(h * 0.24);
    const cw = Math.floor(w * 0.84);
    const ch = Math.floor(h * 0.62);
    const r = Math.max(12, Math.floor(font * 0.9));

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, x + 6, y + 8, cw, ch, r);
    ctx.fill();

    ctx.fillStyle = 'rgba(18, 26, 36, 0.88)';
    roundRect(ctx, x, y, cw, ch, r);
    ctx.fill();

    // header separator
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = accent;
    ctx.fillRect(x, y + Math.floor(font * 1.55), cw, 2);

    ctx.restore();

    return { x, y, w: cw, h: ch };
  }

  function drawIntervals(ctx, card){
    const root = key;
    const itv = INTERVALS[intervalIdx] || INTERVALS[0];
    const other = (root + itv.s) % 12;

    // title
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.font = `${Math.floor(font * 1.0)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText(`Root: ${noteName(root)}   Interval: ${itv.name} (${itv.s} semitones)   Target: ${noteName(other)}`,
      card.x + Math.floor(font * 0.8),
      card.y + Math.floor(font * 0.5)
    );

    // wheel
    const cx = card.x + card.w * 0.5;
    const cy = card.y + card.h * 0.56;
    const R = Math.min(card.w, card.h) * 0.28;

    // ring
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = Math.max(2, Math.floor(font * 0.12));
    ctx.strokeStyle = 'rgba(231,238,246,0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // 12 ticks + labels
    for (let i = 0; i < 12; i++){
      const a = -Math.PI/2 + (i / 12) * Math.PI * 2;
      const x0 = cx + Math.cos(a) * (R * 0.84);
      const y0 = cy + Math.sin(a) * (R * 0.84);
      const x1 = cx + Math.cos(a) * (R * 1.02);
      const y1 = cy + Math.sin(a) * (R * 1.02);
      const isRoot = i === root;
      const isOther = i === other;
      ctx.globalAlpha = (isRoot || isOther) ? 0.95 : 0.35;
      ctx.strokeStyle = (isRoot ? warm : (isOther ? hot : 'rgba(231,238,246,0.45)'));
      ctx.lineWidth = (isRoot || isOther) ? Math.max(2, Math.floor(font * 0.14)) : 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // label
      ctx.globalAlpha = (isRoot || isOther) ? 0.92 : 0.32;
      ctx.fillStyle = (isRoot ? warm : (isOther ? hot : 'rgba(231,238,246,0.7)'));
      ctx.font = `${Math.floor(small * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      const lx = cx + Math.cos(a) * (R * 1.18);
      const ly = cy + Math.sin(a) * (R * 1.18);
      const label = NOTES[i];
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, lx - tw/2, ly);
    }

    // arc between root and target
    const a0 = -Math.PI/2 + (root / 12) * Math.PI * 2;
    const a1 = -Math.PI/2 + (other / 12) * Math.PI * 2;
    // choose the shorter direction for visual clarity
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const steps = 48;

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, Math.floor(font * 0.12));
    ctx.beginPath();
    for (let i = 0; i <= steps; i++){
      const u = i / steps;
      const aa = a0 + da * u;
      const rr = R * (0.58 + 0.04 * Math.sin(t * 1.4 + u * Math.PI * 2));
      const xx = cx + Math.cos(aa) * rr;
      const yy = cy + Math.sin(aa) * rr;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawMajorScale(ctx, card){
    const root = key;
    const sc = majorScale(root);

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.font = `${Math.floor(font * 1.0)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText(`Key: ${noteName(root)} major`, card.x + Math.floor(font * 0.8), card.y + Math.floor(font * 0.5));

    // 12-step piano roll
    const px = card.x + Math.floor(card.w * 0.08);
    const py = card.y + Math.floor(card.h * 0.23);
    const pw = Math.floor(card.w * 0.84);
    const ph = Math.floor(card.h * 0.28);

    // background
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, px, py, pw, ph, Math.max(10, Math.floor(font * 0.8)));
    ctx.fill();

    const cell = pw / 12;
    for (let i = 0; i < 12; i++){
      const isIn = sc.includes((root + i) % 12);
      const xx = px + i * cell;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = isIn ? accent : 'rgba(231,238,246,0.16)';
      ctx.fillRect(xx + 1, py + 1, Math.max(0, cell - 2), ph - 2);

      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = 'rgba(231,238,246,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(xx + 0.5, py + 0.5, cell, ph);

      // label
      ctx.globalAlpha = isIn ? 0.8 : 0.4;
      ctx.fillStyle = isIn ? 'rgba(231,238,246,0.9)' : 'rgba(231,238,246,0.65)';
      ctx.font = `${Math.floor(small * 0.88)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      const lab = NOTES[(root + i) % 12];
      const tw = ctx.measureText(lab).width;
      ctx.textBaseline = 'middle';
      ctx.fillText(lab, xx + cell/2 - tw/2, py + ph * 0.5);
    }

    // step pattern
    const steps = ['W','W','H','W','W','W','H'];
    const sx = card.x + Math.floor(card.w * 0.12);
    const sy = card.y + Math.floor(card.h * 0.6);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.88)';
    ctx.font = `${Math.floor(font * 0.95)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('Pattern:', sx, sy);

    const dotR = Math.max(4, Math.floor(font * 0.18));
    const gap = Math.floor(font * 1.35);
    let x = sx + Math.floor(font * 4.1);
    for (let i = 0; i < steps.length; i++){
      const u = i / (steps.length - 1);
      const pulse = 0.6 + 0.4 * Math.sin(t * 1.2 + u * 4.2);
      ctx.globalAlpha = 0.25 + 0.35 * pulse;
      ctx.fillStyle = steps[i] === 'H' ? hot : warm;
      ctx.beginPath();
      ctx.arc(x, sy + Math.floor(font * 0.55), dotR * (steps[i] === 'H' ? 1.2 : 1.0), 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(231,238,246,0.85)';
      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      const tw = ctx.measureText(steps[i]).width;
      ctx.fillText(steps[i], x - tw/2, sy + Math.floor(font * 1.0));

      x += gap;
    }

    // hint line
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.font = `${Math.floor(small * 0.95)}px ui-sans-serif, system-ui`;
    ctx.fillText('Tip: “W” = 2 semitones, “H” = 1 semitone', sx, sy + Math.floor(font * 2.2));

    ctx.restore();
  }

  function drawTriads(ctx, card){
    const q = (Math.floor((t / 6.0)) % 3);
    const quality = q === 0 ? 'maj' : (q === 1 ? 'min' : 'dim');
    const root = key;
    const ns = triad(root, quality);

    const qualName = quality === 'maj' ? 'Major (0–4–7)' : (quality === 'min' ? 'Minor (0–3–7)' : 'Diminished (0–3–6)');

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.font = `${Math.floor(font * 1.0)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText(`Root: ${noteName(root)}   Quality: ${qualName}`, card.x + Math.floor(font * 0.8), card.y + Math.floor(font * 0.5));

    // stacked note card
    const bx = card.x + Math.floor(card.w * 0.16);
    const by = card.y + Math.floor(card.h * 0.2);
    const bw = Math.floor(card.w * 0.68);
    const bh = Math.floor(card.h * 0.64);
    const r = Math.max(12, Math.floor(font * 0.9));

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    roundRect(ctx, bx + 6, by + 8, bw, bh, r);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(6, 10, 16, 0.82)';
    roundRect(ctx, bx, by, bw, bh, r);
    ctx.fill();

    // staff lines in box
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = 'rgba(231,238,246,0.85)';
    ctx.lineWidth = 1;
    const y0 = by + bh * 0.25;
    const dy = bh * 0.08;
    for (let i = 0; i < 5; i++){
      const y = y0 + i * dy;
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.08, y);
      ctx.lineTo(bx + bw * 0.92, y);
      ctx.stroke();
    }

    // notes as circles (not literal pitches; just “stacked thirds”)
    const cx = bx + bw * 0.58;
    const baseY = y0 + dy * 3.6;
    const step = dy * 0.9;
    const noteR = Math.max(7, Math.floor(font * 0.32));

    const labels = ['1 (root)', '3 (third)', '5 (fifth)'];
    for (let i = 0; i < 3; i++){
      const yy = baseY - i * step;
      const pulse = 0.7 + 0.3 * Math.sin(t * 1.3 + i * 1.6);
      ctx.globalAlpha = 0.25 + 0.35 * pulse;
      ctx.fillStyle = i === 0 ? warm : (i === 1 ? accent : hot);
      ctx.beginPath();
      ctx.arc(cx, yy, noteR, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.88;
      ctx.fillStyle = 'rgba(231,238,246,0.9)';
      ctx.font = `${Math.floor(small * 0.95)}px ui-sans-serif, system-ui`;
      ctx.textBaseline = 'middle';
      ctx.fillText(`${labels[i]} = ${noteName(ns[i])}`, bx + bw * 0.12, yy);
    }

    // footer tip
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.font = `${Math.floor(small * 0.95)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('Triads are “3-note chords”: pick a scale, then take 1–3–5.', bx + bw * 0.08, by + bh * 0.85);

    ctx.restore();
  }

  function drawCircleOfFifths(ctx, card){
    const cx = card.x + card.w * 0.5;
    const cy = card.y + card.h * 0.56;
    const R = Math.min(card.w, card.h) * 0.3;

    // pick a position that slowly rotates
    const pos = (Math.floor(t / 5.0) + key) % 12;

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.font = `${Math.floor(font * 1.0)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('Move +7 semitones each step (a perfect fifth). Neighbours share most notes.',
      card.x + Math.floor(font * 0.8),
      card.y + Math.floor(font * 0.5)
    );

    // ring
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = 'rgba(231,238,246,0.22)';
    ctx.lineWidth = Math.max(2, Math.floor(font * 0.12));
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // 12 key labels around, in fifth order
    const fifthOrder = [];
    let n = 0;
    for (let i = 0; i < 12; i++){
      fifthOrder.push(n);
      n = (n + 7) % 12;
    }

    for (let i = 0; i < 12; i++){
      const note = fifthOrder[i];
      const a = -Math.PI/2 + (i / 12) * Math.PI * 2;
      const xx = cx + Math.cos(a) * R * 1.12;
      const yy = cy + Math.sin(a) * R * 1.12;
      const active = i === pos;

      ctx.globalAlpha = active ? 0.95 : 0.4;
      ctx.fillStyle = active ? accent : 'rgba(231,238,246,0.7)';
      ctx.font = `${Math.floor(small * (active ? 1.15 : 0.95))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      const lab = NOTES[note];
      const tw = ctx.measureText(lab).width;
      ctx.fillText(lab, xx - tw/2, yy);

      // tick mark
      ctx.globalAlpha = active ? 0.9 : 0.28;
      ctx.strokeStyle = active ? accent : 'rgba(231,238,246,0.4)';
      ctx.lineWidth = active ? Math.max(2, Math.floor(font * 0.14)) : 1;
      const x0 = cx + Math.cos(a) * (R * 0.85);
      const y0 = cy + Math.sin(a) * (R * 0.85);
      const x1 = cx + Math.cos(a) * (R * 1.0);
      const y1 = cy + Math.sin(a) * (R * 1.0);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // centre caption
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = warm;
    ctx.font = `${Math.floor(font * 1.25)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    const center = `${NOTES[fifthOrder[pos]]} → ${NOTES[fifthOrder[(pos+1)%12]]}`;
    const tw = ctx.measureText(center).width;
    ctx.fillText(center, cx - tw/2, cy);

    ctx.globalAlpha = 0.6;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.font = `${Math.floor(small * 0.95)}px ui-sans-serif, system-ui`;
    const hint = 'step clockwise = +5th; counter = -5th';
    const tw2 = ctx.measureText(hint).width;
    ctx.fillText(hint, cx - tw2/2, cy + Math.floor(font * 1.1));

    ctx.restore();
  }

  function drawProgression(ctx, card){
    const root = key;
    const scale = majorScale(root);

    // I–V–vi–IV (1,5,6,4)
    const degIdx = [0, 4, 5, 3];
    const romans = ['I', 'V', 'vi', 'IV'];

    const chords = degIdx.map((di) => {
      const r = scale[di];
      const isMinor = (di === 5); // vi
      const ns = triad(r, isMinor ? 'min' : 'maj');
      return { root: r, ns, name: `${noteName(r)}${isMinor ? 'm' : ''}` };
    });

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.font = `${Math.floor(font * 1.0)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText(`Key: ${noteName(root)} major  •  Loop: I–V–vi–IV`, card.x + Math.floor(font * 0.8), card.y + Math.floor(font * 0.5));

    const cx = card.x + Math.floor(card.w * 0.08);
    const cy = card.y + Math.floor(card.h * 0.25);
    const cw = Math.floor(card.w * 0.84);
    const ch = Math.floor(card.h * 0.54);
    const gap = Math.floor(font * 0.9);
    const boxW = Math.floor((cw - gap * 3) / 4);
    const boxH = ch;
    const r = Math.max(12, Math.floor(font * 0.9));

    for (let i = 0; i < 4; i++){
      const x = cx + i * (boxW + gap);
      const active = i === progIdx;

      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(ctx, x + 6, cy + 8, boxW, boxH, r);
      ctx.fill();

      ctx.globalAlpha = active ? 0.93 : 0.82;
      ctx.fillStyle = active ? 'rgba(14, 20, 30, 0.95)' : 'rgba(10, 14, 22, 0.86)';
      roundRect(ctx, x, cy, boxW, boxH, r);
      ctx.fill();

      // top rule
      ctx.globalAlpha = active ? 0.85 : 0.4;
      ctx.fillStyle = active ? accent : 'rgba(231,238,246,0.22)';
      ctx.fillRect(x, cy + Math.floor(font * 1.55), boxW, 2);

      // roman
      ctx.globalAlpha = active ? 0.95 : 0.65;
      ctx.fillStyle = active ? warm : 'rgba(231,238,246,0.75)';
      ctx.font = `${Math.floor(font * 1.35)}px ui-sans-serif, system-ui`;
      ctx.textBaseline = 'top';
      ctx.fillText(romans[i], x + Math.floor(font * 0.7), cy + Math.floor(font * 0.35));

      // chord name
      ctx.globalAlpha = active ? 0.92 : 0.68;
      ctx.fillStyle = 'rgba(231,238,246,0.9)';
      ctx.font = `${Math.floor(font * 1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(chords[i].name, x + Math.floor(font * 0.7), cy + Math.floor(font * 2.05));

      // notes list
      ctx.globalAlpha = active ? 0.78 : 0.55;
      ctx.fillStyle = 'rgba(231,238,246,0.78)';
      ctx.font = `${Math.floor(small * 0.95)}px ui-sans-serif, system-ui`;
      const ns = chords[i].ns.map(noteName).join(' – ');
      ctx.fillText(ns, x + Math.floor(font * 0.7), cy + Math.floor(font * 3.25));

      // active pulse bar
      if (active){
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.3);
        ctx.globalAlpha = 0.18 + 0.22 * pulse;
        ctx.fillStyle = hot;
        ctx.fillRect(x + Math.floor(boxW * 0.06), cy + boxH - Math.floor(font * 0.85), Math.floor(boxW * 0.88) * (0.35 + 0.65 * pulse), 4);
      }
    }

    // hint
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.font = `${Math.floor(small * 0.95)}px ui-sans-serif, system-ui`;
    ctx.fillText('Common trick: keep the bass moving smoothly, even when chords change.', card.x + Math.floor(font * 0.8), card.y + Math.floor(card.h * 0.84));

    ctx.restore();
  }

  function drawModes(ctx, card){
    const root = key;
    const sc = majorScale(root);
    const m = MODES[modeIdx] || MODES[0];
    const tonic = sc[(m.deg - 1) % 7];

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.font = `${Math.floor(font * 1.0)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText(`Parent scale: ${noteName(root)} major  •  Mode: ${m.name} (start on degree ${m.deg})  •  Tonic: ${noteName(tonic)}`,
      card.x + Math.floor(font * 0.8),
      card.y + Math.floor(font * 0.5)
    );

    const x = card.x + Math.floor(card.w * 0.1);
    const y = card.y + Math.floor(card.h * 0.27);
    const ww = Math.floor(card.w * 0.8);
    const hh = Math.floor(card.h * 0.45);

    // scale degrees line
    const gap = ww / 7;
    for (let i = 0; i < 7; i++){
      const n = sc[i];
      const isTonic = n === tonic;
      const xx = x + i * gap + gap * 0.5;

      const pulse = 0.55 + 0.45 * Math.sin(t * 1.2 + i * 0.7);
      ctx.globalAlpha = isTonic ? (0.35 + 0.45 * pulse) : 0.2;
      ctx.fillStyle = isTonic ? warm : accent;
      ctx.beginPath();
      ctx.arc(xx, y + hh * 0.34, Math.max(8, Math.floor(font * (isTonic ? 0.45 : 0.32))), 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = isTonic ? 0.95 : 0.75;
      ctx.fillStyle = 'rgba(231,238,246,0.9)';
      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      const lab = noteName(n);
      const tw = ctx.measureText(lab).width;
      ctx.fillText(lab, xx - tw/2, y + hh * 0.34);

      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(231,238,246,0.78)';
      ctx.font = `${Math.floor(small * 0.9)}px ui-sans-serif, system-ui`;
      const deg = String(i + 1);
      const tw2 = ctx.measureText(deg).width;
      ctx.fillText(deg, xx - tw2/2, y + hh * 0.62);
    }

    // arrow / highlight for mode degree
    const hx = x + (m.deg - 1) * gap + gap * 0.5;
    const hy = y + hh * 0.1;
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = hot;
    ctx.lineWidth = Math.max(2, Math.floor(font * 0.12));
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx, y + hh * 0.22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx - 8, y + hh * 0.22);
    ctx.lineTo(hx, y + hh * 0.28);
    ctx.lineTo(hx + 8, y + hh * 0.22);
    ctx.stroke();

    // hint
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.font = `${Math.floor(small * 0.95)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('Modes = rotate the same 7 notes; the “tonic” changes the feel.', x, y + hh * 0.78);

    ctx.restore();
  }

  function drawRhythm(ctx, card){
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.font = `${Math.floor(font * 1.0)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText(`Tempo: ${bpm} BPM  •  Count: 1 2 3 4  •  Subdivide: 1-&-2-&-3-&-4-&`,
      card.x + Math.floor(font * 0.8),
      card.y + Math.floor(font * 0.5)
    );

    const x = card.x + Math.floor(card.w * 0.12);
    const y = card.y + Math.floor(card.h * 0.3);
    const ww = Math.floor(card.w * 0.76);
    const hh = Math.floor(card.h * 0.42);

    // bar box
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    roundRect(ctx, x + 6, y + 8, ww, hh, Math.max(12, Math.floor(font * 0.9)));
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(6, 10, 16, 0.82)';
    roundRect(ctx, x, y, ww, hh, Math.max(12, Math.floor(font * 0.9)));
    ctx.fill();

    // beats and subdivisions
    const total = 8; // eighth notes in a bar
    const gap = ww / total;
    const nowBeat = beat; // 0..3
    const nowSub = Math.floor(((t * bpm) / 60) * 2) % 8; // approximate

    for (let i = 0; i < total; i++){
      const isBeat = (i % 2 === 0);
      const isActive = i === nowSub;
      const bx = x + i * gap + gap * 0.5;

      // vertical guide
      ctx.globalAlpha = isBeat ? 0.22 : 0.12;
      ctx.strokeStyle = 'rgba(231,238,246,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, y + hh * 0.18);
      ctx.lineTo(bx, y + hh * 0.82);
      ctx.stroke();

      // dot
      const r = Math.max(5, Math.floor(font * (isBeat ? 0.28 : 0.22)));
      const yy = y + (isBeat ? hh * 0.38 : hh * 0.62);
      const pulse = 0.55 + 0.45 * Math.sin(t * 2.2 + i * 0.5);
      ctx.globalAlpha = (isActive ? 0.35 : 0.12) + 0.22 * pulse;
      ctx.fillStyle = isBeat ? warm : accent;
      ctx.beginPath();
      ctx.arc(bx, yy, r * (isActive ? 1.4 : 1.0), 0, Math.PI * 2);
      ctx.fill();

      // labels
      if (isBeat){
        const num = String((i/2) + 1);
        ctx.globalAlpha = (nowBeat === i/2) ? 0.95 : 0.55;
        ctx.fillStyle = (nowBeat === i/2) ? hot : 'rgba(231,238,246,0.78)';
        ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(num).width;
        ctx.fillText(num, bx - tw/2, y + hh * 0.2);
      } else {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = 'rgba(231,238,246,0.72)';
        ctx.font = `${Math.floor(small * 0.9)}px ui-sans-serif, system-ui`;
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText('&').width;
        ctx.fillText('&', bx - tw/2, y + hh * 0.2);
      }
    }

    // hint
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.font = `${Math.floor(small * 0.95)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('Try clapping beats (1 2 3 4), then add the “&”s between them.', x, y + hh + Math.floor(font * 0.65));

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const lesson = curLesson();

    drawBackground(ctx);
    drawHeader(ctx, lesson);

    const card = drawCard(ctx);

    // progress bar (bottom of card)
    const p = clamp(lessonT / LESSON_DUR, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = 'rgba(231,238,246,0.14)';
    const barX = card.x + Math.floor(font * 0.8);
    const barY = card.y + card.h - Math.floor(font * 0.95);
    const barW = card.w - Math.floor(font * 1.6);
    roundRect(ctx, barX, barY, barW, 4, 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = accent;
    roundRect(ctx, barX, barY, barW * p, 4, 2);
    ctx.fill();
    ctx.restore();

    if (lesson.id === 'intervals') drawIntervals(ctx, card);
    else if (lesson.id === 'majorscale') drawMajorScale(ctx, card);
    else if (lesson.id === 'triads') drawTriads(ctx, card);
    else if (lesson.id === 'circle5') drawCircleOfFifths(ctx, card);
    else if (lesson.id === 'prog') drawProgression(ctx, card);
    else if (lesson.id === 'modes') drawModes(ctx, card);
    else drawRhythm(ctx, card);

    // footer
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, Math.floor(h * 0.92), w, Math.floor(h * 0.08));
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = 'rgba(231,238,246,0.7)';
    ctx.font = `${Math.floor(h / 38)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('tiny concepts • clean visuals • one loop at a time', Math.floor(w * 0.05), Math.floor(h * 0.96));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
