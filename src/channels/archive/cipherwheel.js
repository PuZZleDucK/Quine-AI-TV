// REVIEWED: 2026-02-11
import { mulberry32, clamp } from '../../util/prng.js';

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  let boardC = null;

  // Cached per-context gradients (rebuild on resize / ctx swap).
  let vignetteG = null;
  let vignetteCtx = null;
  let vignetteW = 0;
  let vignetteH = 0;

  let wheelDiskG = null;
  let wheelDiskCtx = null;
  let wheelDiskR = 0;

  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const STEP = (Math.PI * 2) / 26;

  const phrases = [
    // Keep these short-ish and varied; the first word is used for the quiz.
    'HELLO WORLD',
    'MEET AT DAWN',
    'TRUST THE DUCK',
    'ROTATE THE RING',
    'SHIFT HAPPENS',
    'KEEP IT SECRET',
    'READ THE MANUAL',
    'NO BUGS TODAY',
    'CODE LIKE MAGIC',
    'CHECK YOUR KEYS',
    'WRITE IT DOWN',
    'DONT PANIC',
    'STAY CURIOUS',
    'BREAK THE CODE',
    'THE ANSWER IS 42',
    'DRINK WATER',
    'LOCK IT DOWN',
    'OPEN THE DOOR',
    'FOLLOW THE CIPHER',
    'MIND THE GAP',
    'SEND HELP',
    'GOOD LUCK',
    'KEEP PRACTICING',
    'BLUE TEAM WINS',
    'GREEN CHALK DUST',
    'PAPER TRAIL',
    'QUIZ TIME',
    'NO SPOILERS',
    'ENCRYPT EVERYTHING',
    'DECRYPT LATER',
    'WATCH THE POINTER',
    'COUNT TO TEN',
    'TRUST BUT VERIFY',
    'HIDE IN PLAIN SIGHT',
    'THE DUCK APPROVES',
  ];

  const stampTemplatesCaesar = [
    'SHIFT +{S} OK',
    'SHIFT +{S} SET',
    'OFFSET +{S}',
    'KEY +{S}',
    'ROTATE +{S}',
    'WHEEL +{S}',
    'SHIFTED',
    'DECODED',
  ];

  const stampTemplatesAtbash = [
    'ATBASH OK',
    'A-Z MIRROR',
    'MIRROR SET',
    'REFLECTED',
    'INVERTED OK',
    'REVERSED',
    'DECODED',
  ];

  function pickByKey(arr, key) {
    const r = mulberry32(key >>> 0);
    return arr[(r() * arr.length) | 0];
  }

  function stampTextFor(lesson, step) {
    const k = (seed ^ 0x51ed270b ^ ((step * 0x9e3779b9) >>> 0)) >>> 0;
    const pool = lesson.type === 'ATBASH' ? stampTemplatesAtbash : stampTemplatesCaesar;
    const template = pickByKey(pool, k);
    if (lesson.type === 'CAESAR') {
      return template.replace('{S}', String(lesson.shift | 0));
    }
    return template.replace('{S}', '');
  }

  let lessons = [];
  let lessonIndex = 0;
  let lessonStep = -1;

  // Visual state
  let dust = [];
  let stamp = 0;
  let stampText = 'MESSAGE DECODED';
  let nextStampAt = 0;

  // Audio state
  let noise = null;
  let audioHandle = null;

  function pick(arr) {
    return arr[(rand() * arr.length) | 0];
  }

  function buildBoardTexture() {
    boardC = document.createElement('canvas');
    boardC.width = w;
    boardC.height = h;
    const b = boardC.getContext('2d');

    const g = b.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#061a17');
    g.addColorStop(0.5, '#06211e');
    g.addColorStop(1, '#041614');
    b.fillStyle = g;
    b.fillRect(0, 0, w, h);

    // Deterministic chalk smudges / speckle.
    const r2 = mulberry32((seed ^ 0xC1F3E3) >>> 0);

    b.save();
    b.globalAlpha = 0.08;
    for (let i = 0; i < 1800; i++) {
      const x = r2() * w;
      const y = r2() * h;
      const s = 0.5 + r2() * 1.8;
      b.fillStyle = `rgba(220, 255, 245, ${0.06 + r2() * 0.12})`;
      b.fillRect(x, y, s, s);
    }

    b.globalAlpha = 0.12;
    for (let i = 0; i < 26; i++) {
      const x = r2() * w;
      const y = r2() * h;
      const rw = w * (0.12 + r2() * 0.24);
      const rh = h * (0.02 + r2() * 0.05);
      b.fillStyle = 'rgba(0, 0, 0, 0.35)';
      b.fillRect(x - rw * 0.5, y - rh * 0.5, rw, rh);
    }

    b.globalAlpha = 0.18;
    b.strokeStyle = 'rgba(220,255,245,0.18)';
    b.lineWidth = Math.max(1, (h / 700) | 0);
    for (let i = 0; i < 9; i++) {
      const y = h * (0.15 + i * 0.08);
      b.beginPath();
      b.moveTo(w * 0.06, y + (r2() - 0.5) * 8);
      b.lineTo(w * 0.94, y + (r2() - 0.5) * 8);
      b.stroke();
    }
    b.restore();

    // Faint chalk diagrams / notes (deterministic, baked into the board texture).
    b.save();
    b.globalAlpha = 0.16;
    b.strokeStyle = 'rgba(235,255,248,0.55)';
    b.fillStyle = 'rgba(235,255,248,0.55)';
    b.lineWidth = Math.max(1, h / 700);
    b.font = `${Math.max(10, (h / 60) | 0)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    b.textAlign = 'left';
    b.textBaseline = 'top';

    const dx = w * 0.07;
    const dy = h * 0.28;
    const s = 1 + ((r2() * 25) | 0);
    b.fillText(`SHIFT +${s}`, dx, dy);
    b.fillText('A→?', dx, dy + h * 0.04);

    // Tiny wheel sketch.
    const rr = Math.min(w, h) * 0.05;
    b.save();
    b.translate(dx + rr * 1.1, dy + h * 0.11);
    b.beginPath();
    b.arc(0, 0, rr, 0, Math.PI * 2);
    b.stroke();
    b.beginPath();
    b.arc(0, 0, rr * 0.65, 0, Math.PI * 2);
    b.stroke();
    b.beginPath();
    b.moveTo(0, -rr * 1.15);
    b.lineTo(0, -rr * 0.85);
    b.stroke();
    b.restore();

    const ex = w * 0.70;
    const ey = h * 0.30;
    b.fillText('C = (P + K) mod 26', ex, ey);
    b.fillText('P = (C − K) mod 26', ex, ey + h * 0.04);

    b.restore();

    // Frame
    b.save();
    b.strokeStyle = 'rgba(0,0,0,0.55)';
    b.lineWidth = Math.max(2, h / 140);
    b.strokeRect(w * 0.03, h * 0.06, w * 0.94, h * 0.88);
    b.restore();
  }

  function caesarChar(c, shift) {
    const idx = ALPHA.indexOf(c);
    if (idx < 0) return c;
    return ALPHA[(idx + shift + 26 * 10) % 26];
  }

  function atbashChar(c) {
    const idx = ALPHA.indexOf(c);
    if (idx < 0) return c;
    return ALPHA[25 - idx];
  }

  function encodeText(text, lesson) {
    if (lesson.type === 'ATBASH') {
      return text
        .split('')
        .map((c) => atbashChar(c))
        .join('');
    }

    const shift = lesson.shift | 0;
    return text
      .split('')
      .map((c) => caesarChar(c, shift))
      .join('');
  }

  function decodeText(text, lesson) {
    if (lesson.type === 'ATBASH') return encodeText(text, lesson);
    const shift = lesson.shift | 0;
    return text
      .split('')
      .map((c) => caesarChar(c, -shift))
      .join('');
  }

  function makeLessons() {
    const count = 6;
    lessons = [];

    for (let i = 0; i < count; i++) {
      if (i % 3 === 2) {
        const phrase = pick(phrases);
        const word = phrase.split(' ')[0];
        lessons.push({
          type: 'ATBASH',
          phrase,
          quizPlain: word,
          quizCipher: encodeText(word, { type: 'ATBASH' }),
        });
      } else {
        const shift = 1 + ((rand() * 25) | 0);
        const phrase = pick(phrases);
        const word = phrase.split(' ')[0];
        lessons.push({
          type: 'CAESAR',
          shift,
          phrase,
          quizPlain: word,
          quizCipher: encodeText(word, { type: 'CAESAR', shift }),
        });
      }
    }

    lessonIndex = 0;
    lessonStep = -1;
  }

  function resetDust() {
    dust = Array.from({ length: 70 }, () => ({
      x: rand() * w,
      y: rand() * h,
      vx: (rand() - 0.5) * w * 0.004,
      vy: -(0.005 + rand() * 0.03) * h,
      a: 0.06 + rand() * 0.11,
      r: 0.6 + rand() * 1.8,
      tw: rand() * 10,
    }));
  }

  function sceneInit(width, height) {
    w = width;
    h = height;
    t = 0;
    stamp = 0;
    nextStampAt = 0;

    makeLessons();
    resetDust();
    buildBoardTexture();
  }

  function onResize(width, height) {
    sceneInit(width, height);
  }

  function onAudioOn() {
    if (!audio.enabled) return;
    const ctx = audio.ensure();

    // Quiet chalk-room bed.
    const n = audio.noiseSource({ type: 'pink', gain: 0.02 });
    n.start();

    noise = n;
    audioHandle = {
      stop() {
        try { n?.stop?.(); } catch {}
      },
    };

    // ensure we have a handle registered
    audio.setCurrent(audioHandle);

    // Some browsers need resume; AudioManager.toggle handles it.
    void ctx;
  }

  function onAudioOff() {
    try { audioHandle?.stop?.(); } catch {}
    noise = null;
    audioHandle = null;
  }

  function destroy() {
    onAudioOff();
  }

  function lerp(a, b, u) {
    return a + (b - a) * u;
  }

  function easeInOut(u) {
    return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }

  function update(dt) {
    t += dt;
    stamp = Math.max(0, stamp - dt * 1.6);

    for (const d of dust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x < -10) d.x = w + 10;
      if (d.x > w + 10) d.x = -10;
      if (d.y < -10) {
        d.y = h + 10;
        d.x = rand() * w;
      }
    }

    const cycleDur = 42;
    const step = Math.floor(t / cycleDur);
    if (step !== lessonStep) {
      lessonStep = step;
      lessonIndex = step % lessons.length;

      // schedule stamp once per cycle at end of quiz
      nextStampAt = step * cycleDur + 33.2;
    }

    // Stamp moment + small audio cue.
    if (stamp <= 0 && t >= nextStampAt && t < nextStampAt + 0.25) {
      stamp = 1;

      const lesson = lessons[lessonIndex] || lessons[0];
      stampText = stampTextFor(lesson, step);

      if (audio.enabled) {
        audio.beep({ freq: 660, dur: 0.07, gain: 0.03, type: 'square' });
        audio.beep({ freq: 990, dur: 0.05, gain: 0.02, type: 'triangle' });
      }
    }
  }

  function drawWheel(ctx, cx, cy, r, lesson, highlightPlain, highlightCipher, anim) {
    const rim = Math.max(2, h / 240);
    const ringGap = r * 0.12;

    const outerR = r;
    const innerR = r - ringGap;

    const idle = Math.sin(t * 0.22) * 0.04;

    let innerRot = idle;
    let innerAlphabet = ALPHA;

    if (lesson.type === 'CAESAR') {
      const shift = lesson.shift | 0;
      innerRot += -shift * STEP;
    } else {
      innerAlphabet = ALPHA.split('').reverse().join('');
    }

    // Subtle "hand" wobble.
    const wobble = (Math.sin(t * 0.6) * 0.5 + Math.sin(t * 0.17) * 0.5) * 0.01;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wobble);

    // Disc shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(6, 7, outerR * 1.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Outer disk (cached gradient)
    if (!wheelDiskG || wheelDiskCtx !== ctx || wheelDiskR !== outerR) {
      wheelDiskCtx = ctx;
      wheelDiskR = outerR;
      const g = ctx.createRadialGradient(0, 0, outerR * 0.2, 0, 0, outerR * 1.05);
      g.addColorStop(0, 'rgba(10, 38, 34, 0.9)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
      wheelDiskG = g;
    }
    ctx.fillStyle = wheelDiskG;
    ctx.beginPath();
    ctx.arc(0, 0, outerR * 1.02, 0, Math.PI * 2);
    ctx.fill();

    // Outer ring
    ctx.strokeStyle = 'rgba(220,255,245,0.2)';
    ctx.lineWidth = rim;
    ctx.beginPath();
    ctx.arc(0, 0, outerR, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring
    ctx.strokeStyle = 'rgba(220,255,245,0.18)';
    ctx.lineWidth = rim;
    ctx.beginPath();
    ctx.arc(0, 0, innerR, 0, Math.PI * 2);
    ctx.stroke();

    // Pointer
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(220,255,245,0.6)';
    ctx.lineWidth = Math.max(1, rim * 0.9);
    ctx.beginPath();
    ctx.moveTo(0, -outerR * 1.08);
    ctx.lineTo(0, -outerR * 0.82);
    ctx.stroke();
    ctx.restore();

    const font = Math.max(10, (h / 58) | 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    // Highlight rings
    function hiAt(angle, rr, c) {
      ctx.save();
      ctx.rotate(angle);
      ctx.strokeStyle = c;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = rim * 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, rr, -STEP * 0.42, STEP * 0.42);
      ctx.stroke();
      ctx.restore();
    }

    if (highlightPlain) {
      const idx = ALPHA.indexOf(highlightPlain);
      if (idx >= 0) hiAt(idx * STEP, outerR, 'rgba(120,255,220,0.9)');
    }
    if (highlightCipher) {
      const idx = innerAlphabet.indexOf(highlightCipher);
      if (idx >= 0) hiAt(innerRot + idx * STEP, innerR, 'rgba(255,220,120,0.9)');
    }

    // Letters (outer)
    ctx.fillStyle = 'rgb(235,255,248)';
    for (let i = 0; i < 26; i++) {
      const ang = i * STEP;
      const ch = ALPHA[i];
      const a = 0.28 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.9 + i));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.rotate(ang);
      ctx.translate(0, -outerR * 0.86);
      ctx.rotate(-ang);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }

    // Letters (inner)
    ctx.fillStyle = 'rgb(255,245,210)';
    for (let i = 0; i < 26; i++) {
      const ang = innerRot + i * STEP;
      const ch = innerAlphabet[i];
      const a = 0.26 + 0.14 * (0.5 + 0.5 * Math.sin(t * 0.7 + i * 0.6));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.rotate(ang);
      ctx.translate(0, -innerR * 0.82);
      ctx.rotate(-ang);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }

    // Center hub
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(0, 0, outerR * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,255,245,0.16)';
    ctx.lineWidth = rim;
    ctx.stroke();

    // subtle "chalk" scratches
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(235,255,248,0.35)';
    ctx.lineWidth = Math.max(1, rim * 0.8);
    for (let i = 0; i < 10; i++) {
      const rr = lerp(innerR * 0.3, outerR * 0.95, i / 9);
      const a0 = (t * 0.08 + i * 0.4) % (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(0, 0, rr, a0, a0 + 0.6);
      ctx.stroke();
    }
    ctx.restore();

    // Overall animation pulse
    if (anim > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(120,255,220,${anim * 0.06})`;
      ctx.beginPath();
      ctx.arc(0, 0, outerR * 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawTextPanel(ctx, lesson, demoPlain, demoCipher, quizCipher, answer, seg, segT) {
    const pad = Math.max(14, w * 0.03);
    const x = pad;
    const y = pad;
    const boxW = w - pad * 2;
    const boxH = h * 0.22;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = 'rgba(220,255,245,0.12)';
    ctx.lineWidth = Math.max(2, h / 360);
    ctx.strokeRect(x, y, boxW, boxH);

    const titleSize = Math.max(16, (h / 26) | 0);
    const bodySize = Math.max(12, (h / 42) | 0);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.font = `600 ${titleSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(235,255,248,0.92)';
    ctx.fillText('CIPHER WHEEL CLASSROOM', x + pad * 0.6, y + pad * 0.45);

    const sub = lesson.type === 'ATBASH'
      ? 'LESSON: ATBASH (A↔Z)'
      : `LESSON: CAESAR SHIFT (+${lesson.shift})`;

    ctx.font = `${bodySize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(235,255,248,0.72)';
    ctx.fillText(sub, x + pad * 0.6, y + pad * 0.45 + titleSize + 6);

    // Tiny “shift hint” during DEMO/QUIZ to make the mapping obvious at a glance.
    if (seg === 'DEMO' || seg === 'QUIZ') {
      const hint = lesson.type === 'ATBASH'
        ? 'HINT: A↔Z'
        : `HINT: A→${caesarChar('A', lesson.shift | 0)}`;

      ctx.save();
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(120,255,220,0.82)';
      ctx.fillText(hint, x + boxW - pad * 0.6, y + pad * 0.45 + titleSize + 6);
      ctx.restore();

      ctx.textAlign = 'left';
    }

    const lineY = y + pad * 0.45 + titleSize + bodySize + 16;

    if (seg === 'DEMO') {
      ctx.fillStyle = 'rgba(235,255,248,0.78)';
      ctx.fillText(`ENCODE: ${demoPlain}`, x + pad * 0.6, lineY);
      ctx.fillStyle = 'rgba(255,245,210,0.82)';
      ctx.fillText(`CIPHER: ${demoCipher}`, x + pad * 0.6, lineY + bodySize + 10);

      // tiny cursor sweep
      const sweep = clamp(segT / 16, 0, 1);
      const cursorX = x + pad * 0.6 + (boxW - pad * 1.2) * sweep;
      const cursorY = lineY + bodySize * 0.3;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = 'rgba(120,255,220,1)';
      ctx.fillRect(cursorX, cursorY, 2, bodySize * 0.9);
      ctx.restore();
    } else if (seg === 'QUIZ') {
      ctx.fillStyle = 'rgba(235,255,248,0.78)';
      ctx.fillText(`QUIZ: DECODE → ${quizCipher}`, x + pad * 0.6, lineY);
      const secs = Math.max(0, Math.ceil(8 - segT));
      ctx.fillStyle = `rgba(255,220,120,${0.5 + 0.2 * Math.sin(t * 6)})`;
      ctx.fillText(`TIME: ${secs}s`, x + pad * 0.6, lineY + bodySize + 10);
    } else if (seg === 'REVEAL') {
      ctx.fillStyle = 'rgba(235,255,248,0.78)';
      ctx.fillText(`ANSWER: ${answer}`, x + pad * 0.6, lineY);
      ctx.fillStyle = 'rgba(255,245,210,0.72)';
      ctx.fillText('GOOD. NOW DO IT AGAIN.', x + pad * 0.6, lineY + bodySize + 10);
    } else {
      ctx.fillStyle = 'rgba(235,255,248,0.78)';
      ctx.fillText('ALIGN • ROTATE • TRANSLATE', x + pad * 0.6, lineY);
      ctx.fillStyle = 'rgba(235,255,248,0.62)';
      ctx.fillText('TODAY: PRACTICE SIMPLE SUBSTITUTION', x + pad * 0.6, lineY + bodySize + 10);
    }

    ctx.restore();
  }

  function drawStamp(ctx) {
    if (stamp <= 0) return;

    const a = clamp(stamp, 0, 1);
    const k = easeInOut(1 - a);

    ctx.save();
    ctx.translate(w * 0.62, h * 0.66);
    ctx.rotate(-0.16 + (1 - a) * 0.08);

    const ww = w * (0.34 + k * 0.04);
    const hh = h * (0.10 + k * 0.02);

    ctx.globalAlpha = 0.85 * a;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-ww * 0.5 + 6, -hh * 0.5 + 7, ww, hh);

    ctx.globalAlpha = 0.9 * a;
    ctx.strokeStyle = 'rgba(255,120,120,0.9)';
    ctx.lineWidth = Math.max(3, h / 160);
    ctx.strokeRect(-ww * 0.5, -hh * 0.5, ww, hh);

    ctx.font = `800 ${Math.max(18, (h / 22) | 0)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,120,120,0.85)';
    ctx.fillText(stampText, 0, 0);

    ctx.restore();
  }

  function render(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (boardC) ctx.drawImage(boardC, 0, 0);

    // Subtle moving vignette / breathe. (cached gradient + animated alpha)
    if (!vignetteG || vignetteCtx !== ctx || vignetteW !== w || vignetteH !== h) {
      vignetteCtx = ctx;
      vignetteW = w;
      vignetteH = h;
      const rr0 = Math.min(w, h) * 0.2;
      const rr1 = Math.min(w, h) * 0.9;
      const g = ctx.createRadialGradient(w * 0.5, h * 0.45, rr0, w * 0.5, h * 0.45, rr1);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      vignetteG = g;
    }

    ctx.save();
    ctx.globalAlpha = 0.34 + 0.06 * Math.sin(t * 0.18);
    ctx.fillStyle = vignetteG;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Dust
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgb(220,255,245)';
    for (const d of dust) {
      const tw = 0.5 + 0.5 * Math.sin(t * 0.7 + d.tw);
      ctx.globalAlpha = d.a * (0.5 + tw * 0.6);
      ctx.fillRect(d.x, d.y, d.r, d.r);
    }
    ctx.restore();

    const cycleDur = 42;
    const tt = t % cycleDur;

    // Segments: INTRO(6) -> DEMO(16) -> QUIZ(10) -> REVEAL(10)
    const segs = [
      ['INTRO', 6],
      ['DEMO', 16],
      ['QUIZ', 10],
      ['REVEAL', 10],
    ];

    let seg = 'INTRO';
    let segT = tt;
    let acc = 0;
    for (const [name, dur] of segs) {
      if (tt >= acc && tt < acc + dur) {
        seg = name;
        segT = tt - acc;
        break;
      }
      acc += dur;
    }

    const lesson = lessons[lessonIndex] || lessons[0];

    const demoPlain = lesson.phrase;
    const demoCipher = encodeText(demoPlain, lesson);

    const quizCipher = lesson.quizCipher;
    const answer = lesson.quizPlain;

    // Highlight selection during demo: step across letters
    let hiPlain = null;
    let hiCipher = null;

    if (seg === 'DEMO') {
      const sweep = clamp(segT / 16, 0, 1);
      const letters = demoPlain.replace(/[^A-Z]/g, '');
      const li = clamp((sweep * letters.length) | 0, 0, Math.max(0, letters.length - 1));
      hiPlain = letters[li] || null;
      if (hiPlain) {
        hiCipher = lesson.type === 'ATBASH'
          ? atbashChar(hiPlain)
          : caesarChar(hiPlain, lesson.shift);
      }
    } else if (seg === 'QUIZ' || seg === 'REVEAL') {
      hiPlain = lesson.quizPlain[0] || null;
      hiCipher = lesson.quizCipher[0] || null;
    }

    // Wheel placement
    const cx = w * 0.5;
    const cy = h * 0.62;
    const r = Math.min(w, h) * 0.26;

    const animPulse = seg === 'REVEAL' ? clamp(stamp, 0, 1) : 0;
    drawWheel(ctx, cx, cy, r, lesson, hiPlain, hiCipher, animPulse);

    // Subtle desk edge (foreground framing).
    ctx.save();
    const deskY = h * 0.87;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = 'rgb(10, 20, 18)';
    ctx.fillRect(0, deskY, w, h - deskY);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = 'rgb(235,255,248)';
    ctx.fillRect(0, deskY, w, Math.max(1, h / 520));
    ctx.restore();

    // Chalk tray / eraser (foreground)
    ctx.save();
    const trayY = h * 0.92;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(w * 0.07, trayY, w * 0.86, h * 0.02);

    // Chalk sticks + eraser blocks.
    ctx.fillStyle = 'rgba(235,255,248,0.16)';
    ctx.fillRect(w * 0.14, trayY - h * 0.018, w * 0.09, h * 0.022);
    ctx.fillStyle = 'rgba(235,255,248,0.12)';
    ctx.fillRect(w * 0.25, trayY - h * 0.014, w * 0.06, h * 0.018);
    ctx.fillStyle = 'rgba(235,255,248,0.14)';
    ctx.fillRect(w * 0.33, trayY - h * 0.012, w * 0.022, h * 0.012);
    ctx.fillRect(w * 0.36, trayY - h * 0.013, w * 0.018, h * 0.011);
    ctx.fillRect(w * 0.39, trayY - h * 0.012, w * 0.02, h * 0.012);

    ctx.restore();

    drawTextPanel(ctx, lesson, demoPlain, demoCipher, quizCipher, answer, seg, segT);

    // Stamp overlay (special moment)
    // (stampText is chosen deterministically at the stamp moment)
    drawStamp(ctx);

    // tiny scanline for vibe
    const scanY = (tt * 48) % (h + 80) - 40;
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = 'rgba(120,255,220,1)';
    ctx.fillRect(0, scanY, w, Math.max(1, h / 520));
    ctx.restore();
  }

  function init({ width, height }) {
    sceneInit(width, height);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
