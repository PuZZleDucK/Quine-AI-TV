import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function lerp(a, b, t){ return a + (b - a) * t; }

function roundedRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const QUESTION_BANK = [
  {
    prompt: 'What is `[] == ![]`?',
    answers: ['false', 'true', 'TypeError', 'undefined'],
    correct: 1,
    note: 'Coercion speedrun: both sides become 0. Nobody is proud of it.'
  },
  {
    prompt: 'What is `typeof null`?',
    answers: ['null', 'object', 'undefined', 'NaN'],
    correct: 1,
    note: 'Legacy bug turned language lore.'
  },
  {
    prompt: 'What is `NaN === NaN`?',
    answers: ['true', 'false', 'null', 'Only in strict mode'],
    correct: 1,
    note: 'Not even NaN agrees with itself.'
  },
  {
    prompt: 'What does `0.1 + 0.2` equal?',
    answers: ['0.3', '0.30000000000000004', '0.299999', 'Depends on browser'],
    correct: 1,
    note: 'Floating point keeps the lawyers employed.'
  },
  {
    prompt: 'What is `new Date("2020-01-01")` parsed as?',
    answers: ['Local midnight', 'UTC midnight', 'Invalid Date', 'Unix epoch'],
    correct: 1,
    note: 'Date parsing is where confidence goes to die.'
  },
  {
    prompt: 'What is `typeof NaN`?',
    answers: ['nan', 'number', 'undefined', 'object'],
    correct: 1,
    note: 'Named Not-a-Number, classified as Number.'
  },
  {
    prompt: 'What does `[] + {}` become?',
    answers: ['"[object Object]"', '"[]{}"', '0', 'TypeError'],
    correct: 0,
    note: 'String concatenation wearing a disguise.'
  },
  {
    prompt: 'What does `{} + []` become in expression context?',
    answers: ['"[object Object]"', '0', '""', 'NaN'],
    correct: 1,
    note: 'Parser roulette. Context decides your fate.'
  },
  {
    prompt: 'What is `Boolean("0")`?',
    answers: ['false', 'true', '0', 'throws'],
    correct: 1,
    note: 'The string has length, therefore hope.'
  },
  {
    prompt: 'What is `null == undefined`?',
    answers: ['true', 'false', 'TypeError', 'Only in sloppy mode'],
    correct: 0,
    note: 'A rare special case where the chaos is intentional.'
  },
  {
    prompt: 'What is `Number("")`?',
    answers: ['NaN', '0', 'undefined', '""'],
    correct: 1,
    note: 'Empty string becomes zero because reasons.'
  },
  {
    prompt: 'What does `[1,2] + [3,4]` return?',
    answers: ['[1,2,3,4]', '"1,23,4"', '10', 'TypeError'],
    correct: 1,
    note: 'Arrays become strings and everyone claps politely.'
  },
  {
    prompt: 'What is `Math.max()` with no args?',
    answers: ['0', 'Infinity', '-Infinity', 'NaN'],
    correct: 2,
    note: 'Identity element energy.'
  },
  {
    prompt: 'What is `parseInt("08")` in modern JS?',
    answers: ['8', '0', 'NaN', 'Depends on locale'],
    correct: 0,
    note: 'Octal panic was retired, mostly.'
  },
  {
    prompt: 'What is `typeof (() => {})`?',
    answers: ['object', 'function', 'arrow', 'callable'],
    correct: 1,
    note: 'Function remains function, even with fancy syntax.'
  },
  {
    prompt: 'What does `JSON.stringify({a:undefined,b:1})` keep?',
    answers: ['{"a":null,"b":1}', '{"b":1}', '{"a":undefined,"b":1}', 'throws'],
    correct: 1,
    note: 'Undefined fields quietly vanish like budget line items.'
  },
  {
    prompt: 'What is `Object.is(-0, 0)`?',
    answers: ['true', 'false', 'TypeError', 'null'],
    correct: 1,
    note: 'At last, a method that respects negative zero drama.'
  },
  {
    prompt: 'What is `"5" - 2`?',
    answers: ['"52"', '3', 'NaN', 'TypeError'],
    correct: 1,
    note: 'Subtraction forces everyone to be numeric.'
  }
];

const HOST_LINES = [
  'Host: Tonight, we crown the bravest reader of stack traces.',
  'Host: Deep breath. The language spec can smell fear.',
  'Host: Remember, every answer is correct in at least one legacy codebase.',
  'Host: Somewhere, `with` is still legal and thriving.',
  'Host: We asked 100 developers. 97 said "it depends."',
  'Host: Audience lifeline replaced by one very tired staff engineer.',
  'Host: Our legal team insists coercion is technically intentional.',
  'Host: If you hear screaming, that is just date parsing.'
];

const MONEY_LADDER = [
  '$100', '$200', '$300', '$500', '$1,000', '$2,000', '$4,000', '$8,000', '$16,000',
  '$32,000', '$64,000', '$125,000', '$250,000', '$500,000', '$1,000,000'
];

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;
  let titleSize = 16;
  let bodySize = 13;

  let stars = [];
  let glowPulse = 0;

  const phaseDur = {
    intro: 2.4,
    ask: 9.0,
    lock: 2.8,
    reveal: 3.8,
  };
  const questionDur = phaseDur.intro + phaseDur.ask + phaseDur.lock + phaseDur.reveal;

  let questionOrder = [];
  let qIndex = 0;
  let phase = 'intro';
  let phaseT = 0;
  let selectedAnswer = 0;
  let won = false;
  let flash = 0;
  let hostLine = '';
  let hostSwapAt = 0;

  let drone = null;
  let hiss = null;
  let currentHandle = null;

  function reshuffleQuestions(){
    questionOrder = QUESTION_BANK.map((_, i) => i);
    for (let i = questionOrder.length - 1; i > 0; i--){
      const j = (rand() * (i + 1)) | 0;
      const tmp = questionOrder[i];
      questionOrder[i] = questionOrder[j];
      questionOrder[j] = tmp;
    }
    qIndex = 0;
  }

  function currentQuestion(){
    return QUESTION_BANK[questionOrder[qIndex % questionOrder.length]];
  }

  function questionRank(){
    return (qIndex % MONEY_LADDER.length);
  }

  function decideContestantAnswer(q){
    // Usually correct, but wrong often enough to keep parody tension.
    if (rand() < 0.66) return q.correct;
    let pickIdx = q.correct;
    while (pickIdx === q.correct) pickIdx = (rand() * q.answers.length) | 0;
    return pickIdx;
  }

  function enterQuestion(){
    const q = currentQuestion();
    selectedAnswer = decideContestantAnswer(q);
    won = false;
    phase = 'intro';
    phaseT = 0;
    flash = 0;
    if (audio.enabled){
      audio.beep({ freq: 420 + rand() * 120, dur: 0.03, gain: 0.018, type: 'triangle' });
    }
  }

  function nextQuestion(){
    qIndex += 1;
    if ((qIndex % questionOrder.length) === 0) reshuffleQuestions();
    enterQuestion();
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    titleSize = Math.max(16, Math.floor(Math.min(w, h) * 0.037));
    bodySize = Math.max(12, Math.floor(Math.min(w, h) * 0.024));

    stars = Array.from({ length: 48 }, () => ({
      x: rand(), y: rand(), a: 0.05 + rand() * 0.18, s: 0.3 + rand() * 1.1, p: rand() * 10,
    }));

    reshuffleQuestions();
    hostLine = pick(rand, HOST_LINES);
    hostSwapAt = 6 + rand() * 6;
    enterQuestion();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    drone = simpleDrone(audio, { root: 49, detune: 1.1, gain: 0.028 });
    hiss = audio.noiseSource({ type: 'pink', gain: 0.006 });
    try { hiss.start(); } catch {}
    currentHandle = {
      stop(){
        try { drone?.stop?.(); } catch {}
        try { hiss?.stop?.(); } catch {}
      }
    };
    audio.setCurrent(currentHandle);
  }

  function onAudioOff(){
    try { currentHandle?.stop?.(); } catch {}
    drone = null;
    hiss = null;
    currentHandle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    if (t > hostSwapAt){
      hostLine = pick(rand, HOST_LINES);
      hostSwapAt = t + 8 + rand() * 10;
    }

    if (phase === 'intro' && phaseT >= phaseDur.intro){
      phase = 'ask';
      phaseT = 0;
    } else if (phase === 'ask' && phaseT >= phaseDur.ask){
      phase = 'lock';
      phaseT = 0;
      if (audio.enabled){
        audio.beep({ freq: 260, dur: 0.05, gain: 0.018, type: 'square' });
        audio.beep({ freq: 180, dur: 0.08, gain: 0.016, type: 'triangle' });
      }
    } else if (phase === 'lock' && phaseT >= phaseDur.lock){
      phase = 'reveal';
      phaseT = 0;
      const q = currentQuestion();
      won = selectedAnswer === q.correct;
      flash = 1;
      if (audio.enabled){
        if (won){
          audio.beep({ freq: 620, dur: 0.06, gain: 0.026, type: 'triangle' });
          audio.beep({ freq: 880, dur: 0.08, gain: 0.024, type: 'sine' });
        } else {
          audio.beep({ freq: 140, dur: 0.10, gain: 0.028, type: 'sawtooth' });
        }
      }
    } else if (phase === 'reveal' && phaseT >= phaseDur.reveal){
      nextQuestion();
    }

    glowPulse = 0.5 + 0.5 * Math.sin(t * 0.9);
    flash = Math.max(0, flash - dt * 1.35);
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#070915');
    g.addColorStop(0.6, '#05070f');
    g.addColorStop(1, '#02030a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    for (const s of stars){
      const tw = s.a * (0.65 + 0.35 * Math.sin(t * s.s + s.p));
      ctx.fillStyle = `rgba(130,180,255,${tw})`;
      ctx.fillRect(s.x * w, s.y * h, 2, 2);
    }
    ctx.restore();

    const stage = ctx.createLinearGradient(0, h * 0.12, w, h * 0.88);
    stage.addColorStop(0, 'rgba(65,115,255,0.08)');
    stage.addColorStop(0.5, 'rgba(103,64,255,0.10)');
    stage.addColorStop(1, 'rgba(31,150,255,0.07)');
    ctx.fillStyle = stage;
    roundedRect(ctx, w * 0.05, h * 0.12, w * 0.90, h * 0.78, 20);
    ctx.fill();

    ctx.strokeStyle = 'rgba(180,210,255,0.17)';
    ctx.lineWidth = Math.max(1, dpr);
    roundedRect(ctx, w * 0.05, h * 0.12, w * 0.90, h * 0.78, 20);
    ctx.stroke();
  }

  function drawLadder(ctx, activeIdx){
    const x = w * 0.74;
    const y = h * 0.18;
    const lw = w * 0.18;
    const lh = h * 0.64;

    ctx.save();
    ctx.fillStyle = 'rgba(4,8,20,0.65)';
    roundedRect(ctx, x, y, lw, lh, 12);
    ctx.fill();

    const rowH = lh / MONEY_LADDER.length;
    ctx.font = `700 ${Math.max(10, Math.floor(bodySize * 0.78))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';

    for (let i = 0; i < MONEY_LADDER.length; i++){
      const yy = y + lh - rowH * (i + 1);
      const on = i === activeIdx;
      if (on){
        ctx.fillStyle = `rgba(255,220,130,${0.20 + glowPulse * 0.28})`;
        roundedRect(ctx, x + 6, yy + 2, lw - 12, rowH - 4, 8);
        ctx.fill();
      }
      ctx.fillStyle = on ? 'rgba(255,245,190,0.95)' : 'rgba(176,196,255,0.82)';
      ctx.fillText(MONEY_LADDER[i], x + 12, yy + rowH * 0.5);
    }
    ctx.restore();
  }

  function drawQuestionCard(ctx, q){
    const cardX = w * 0.09;
    const cardY = h * 0.20;
    const cardW = w * 0.60;
    const cardH = h * 0.56;

    ctx.save();
    ctx.fillStyle = 'rgba(7,12,30,0.78)';
    roundedRect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(176,208,255,0.22)';
    ctx.lineWidth = Math.max(1, dpr);
    roundedRect(ctx, cardX, cardY, cardW, cardH, 14);
    ctx.stroke();

    ctx.fillStyle = 'rgba(210,230,255,0.92)';
    ctx.font = `700 ${Math.max(14, Math.floor(bodySize * 1.22))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('WHO WANTS TO BE A JAVASCRIPT MILLIONAIRE?', cardX + 20, cardY + 18);

    ctx.fillStyle = 'rgba(248,252,255,0.96)';
    ctx.font = `700 ${Math.max(13, Math.floor(bodySize * 1.04))}px system-ui, -apple-system, Segoe UI, sans-serif`;
    const promptTop = cardY + cardH * 0.22;
    wrapText(ctx, q.prompt, cardX + 20, promptTop, cardW - 40, Math.max(18, bodySize * 1.3));

    const answersTop = cardY + cardH * 0.49;
    const gapX = 14;
    const gapY = 10;
    const aw = (cardW - 20 * 2 - gapX) * 0.5;
    const ah = cardH * 0.16;

    for (let i = 0; i < q.answers.length; i++){
      const col = i % 2;
      const row = (i / 2) | 0;
      const ax = cardX + 20 + col * (aw + gapX);
      const ay = answersTop + row * (ah + gapY);

      let fill = 'rgba(16,30,68,0.86)';
      let stroke = 'rgba(149,186,255,0.28)';

      if (phase === 'lock' && i === selectedAnswer){
        fill = `rgba(245,184,80,${0.24 + glowPulse * 0.20})`;
        stroke = 'rgba(255,220,130,0.72)';
      }
      if (phase === 'reveal'){
        if (i === q.correct){
          fill = `rgba(75,205,120,${0.25 + glowPulse * 0.25})`;
          stroke = 'rgba(170,255,200,0.8)';
        } else if (i === selectedAnswer && !won){
          fill = 'rgba(220,80,100,0.28)';
          stroke = 'rgba(255,150,170,0.80)';
        }
      }

      ctx.fillStyle = fill;
      roundedRect(ctx, ax, ay, aw, ah, 10);
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(1, dpr);
      roundedRect(ctx, ax, ay, aw, ah, 10);
      ctx.stroke();

      ctx.fillStyle = 'rgba(240,248,255,0.94)';
      ctx.font = `600 ${Math.max(12, Math.floor(bodySize * 0.95))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      const prefix = String.fromCharCode(65 + i);
      ctx.fillText(`${prefix}) ${q.answers[i]}`, ax + 12, ay + ah * 0.52);
    }

    const noteY = cardY + cardH - Math.max(38, bodySize * 2.1);
    ctx.fillStyle = 'rgba(189,214,255,0.84)';
    ctx.font = `500 ${Math.max(11, Math.floor(bodySize * 0.84))}px system-ui, -apple-system, Segoe UI, sans-serif`;
    const phaseLine = phase === 'intro' ? 'Host is setting up the trap question...' : phase === 'ask' ? 'Contestant overthinks equality coercion...' : phase === 'lock' ? 'Final answer locked. Courage questionable.' : (won ? 'Correct. The crowd nods like they expected this.' : 'Incorrect. The crowd pretends to understand dates.');
    wrapText(ctx, phaseLine, cardX + 20, noteY, cardW - 40, Math.max(14, bodySize * 1.05));

    ctx.restore();
  }

  function drawHud(ctx, q){
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    roundedRect(ctx, 14, 14, w - 28, Math.max(60, titleSize * 2.8), 11);
    ctx.fill();

    ctx.fillStyle = 'rgba(238,246,255,0.95)';
    ctx.font = `800 ${titleSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText('The Syntax Is Right', 26, 22);

    ctx.fillStyle = 'rgba(186,215,255,0.9)';
    ctx.font = `600 ${Math.max(12, Math.floor(bodySize * 0.92))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`ROUND ${qIndex + 1}  •  CATEGORY: JS EDGE CASES`, 26, 22 + titleSize * 1.1);

    ctx.fillStyle = 'rgba(200,225,255,0.86)';
    ctx.font = `600 ${Math.max(12, Math.floor(bodySize * 0.84))}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillText(hostLine, 26, 22 + titleSize * 1.1 + bodySize * 1.15);

    const total = phaseDur[phase] || 1;
    const p = clamp(phaseT / total, 0, 1);
    const barW = Math.min(280, w * 0.26);
    const bx = w - barW - 32;
    const by = 22 + titleSize * 1.72;
    ctx.fillStyle = 'rgba(220,235,255,0.20)';
    roundedRect(ctx, bx, by, barW, 10, 8);
    ctx.fill();
    ctx.fillStyle = `rgba(120,200,255,${0.5 + glowPulse * 0.3})`;
    roundedRect(ctx, bx, by, barW * p, 10, 8);
    ctx.fill();

    ctx.fillStyle = 'rgba(205,226,255,0.9)';
    ctx.font = `700 ${Math.max(11, Math.floor(bodySize * 0.80))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`PHASE: ${phase.toUpperCase()}`, bx, by - 14);

    ctx.restore();

    if (phase === 'reveal'){
      ctx.save();
      const alpha = 0.08 + flash * 0.23;
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = won ? `rgba(95,240,160,${alpha})` : `rgba(255,90,120,${alpha})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = won ? `rgba(200,255,220,${0.40 + glowPulse * 0.38})` : `rgba(255,205,220,${0.36 + glowPulse * 0.30})`;
      ctx.font = `900 ${Math.max(30, Math.floor(titleSize * 1.6))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(won ? 'CORRECT' : 'NOPE', w * 0.40, h * 0.52);
      ctx.restore();
    }

    // Snark lower-third.
    ctx.save();
    const text = `SPEC NOTE: ${q.note}`;
    const tx = w * 0.07;
    const ty = h * 0.90;
    ctx.font = `600 ${Math.max(11, Math.floor(bodySize * 0.84))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(3,8,22,0.72)';
    roundedRect(ctx, tx - 8, ty - 16, Math.min(w * 0.84, tw + 16), 24, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,180,255,0.38)';
    roundedRect(ctx, tx - 8, ty - 16, Math.min(w * 0.84, tw + 16), 24, 8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(198,228,255,0.92)';
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }

  function wrapText(ctx, text, x, y, maxW, lineH){
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (let i = 0; i < words.length; i++){
      const test = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(test).width > maxW && line){
        ctx.fillText(line, x, yy);
        yy += lineH;
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  function render(ctx){
    const q = currentQuestion();
    const ladderIdx = questionRank();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    drawQuestionCard(ctx, q);
    drawLadder(ctx, ladderIdx);
    drawHud(ctx, q);

    // Stage beams for extra motion in the foreground.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const beamA = 0.03 + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.8));
    const beamB = 0.03 + 0.03 * (0.5 + 0.5 * Math.sin(t * 1.1 + 1.3));
    ctx.fillStyle = `rgba(100,170,255,${beamA})`;
    ctx.beginPath();
    ctx.moveTo(w * 0.15, 0);
    ctx.lineTo(w * 0.35, h * 0.72);
    ctx.lineTo(w * 0.48, h * 0.72);
    ctx.lineTo(w * 0.24, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(160,120,255,${beamB})`;
    ctx.beginPath();
    ctx.moveTo(w * 0.82, 0);
    ctx.lineTo(w * 0.58, h * 0.72);
    ctx.lineTo(w * 0.72, h * 0.72);
    ctx.lineTo(w * 0.94, 0);
    ctx.closePath();
    ctx.fill();
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
