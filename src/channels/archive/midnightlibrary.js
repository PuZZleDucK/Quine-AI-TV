import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';
// REVIEWED: 2026-02-11

// Midnight Library Index
// Card-catalog drawers and index cards reveal micro-stories, one card at a time.

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

function smoothstep(a, b, x){
  x = clamp((x - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

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

function cardFlick(audio, rand, {gain=0.028}={}){
  const ctx = audio.ensure();
  const dur = 0.10 + rand() * 0.08;
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(dur * sr));

  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++){
    const x = i / len;
    const env = Math.pow(1 - x, 2.1);
    const n = (Math.random() * 2 - 1) * 0.9 + ((i ? d[i-1] : 0) * 0.12);
    d[i] = n * env;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900 + rand() * 1500;
  bp.Q.value = 0.9;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 160;
  hp.Q.value = 0.7;

  const g = ctx.createGain();
  g.gain.value = 0;

  src.connect(bp);
  bp.connect(hp);
  hp.connect(g);
  g.connect(audio.master);

  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.start(t0);
  src.stop(t0 + dur + 0.02);

  // little drawer "tick"
  audio.beep({ freq: 260 + rand() * 90, dur: 0.018, gain: 0.012, type: 'square' });
}

const TOPICS = [
  'MAPS', 'REGRETS', 'LOST KEYS', 'MOONLIGHT', 'PROMISES', 'OLD RECEIPTS', 'SHADOWS', 'SALTWATER',
  'BIRDS', 'SLEEP', 'NICKNAMES', 'WEATHER', 'MISSING PAGES', 'CUP STAINS', 'ELEVATORS', 'SPARE PARTS',
];

const SUBJECTS = [
  'A librarian who never blinks',
  'A student with ink-stained fingertips',
  'A courier carrying a warm envelope',
  'A watchmaker with a second hand that hesitates',
  'A stranger who knows your old password',
  'A detective allergic to conclusions',
  'A night guard who listens for footnotes',
  'A novelist who writes only endings',
];

const SETTINGS = [
  'in Stacks B-12',
  'beneath the Reference Desk',
  'in the Annex of Unfiled Things',
  'between the atlas shelves',
  'behind the microfiche reader',
  'near the return slot that whispers',
  'under the clock with the slow chime',
];

const EVENTS = [
  'finds an index card that shouldn\'t exist',
  'opens a drawer labelled with tomorrow\'s date',
  'pulls a card that smells faintly of rain',
  'discovers the catalogue is listing them',
  'hears a card being typed from inside the wood',
  'sees a title crossing itself out and rewriting',
  'notices the call number matches their heartbeat',
];

const TWISTS = [
  'The story ends early—but the card keeps going.',
  'The card is addressed to you, in your handwriting.',
  'The drawer is empty, yet the card feels heavier each minute.',
  'The stamped date is wrong by exactly one life choice.',
  'A note in pencil says: “Return this before you wake.”',
  'The final sentence is missing, but you remember it anyway.',
  'Someone has underlined a word you haven\'t read yet.',
  'The overdue fine is addressed to your future self.',
  'The catalogue pauses, then asks if you are still there.',
  'A margin note says: “this happened to the previous reader too.”',
];

const RARE_NOTES = [
  'MARGIN ALERT: A DRAWER JUST CLOSED BY ITSELF',
  'MARGIN ALERT: SOMEONE TYPED WHILE NO ONE WAS THERE',
  'MARGIN ALERT: A DIFFERENT CARD HAS YOUR NAME',
  'MARGIN ALERT: THE INDEX BELL RANG TWICE',
];

function makeCallNo(rand, n){
  // Cozy pseudo-library call number
  const a = String.fromCharCode(65 + ((rand() * 8) | 0));
  const b = String.fromCharCode(65 + ((rand() * 18) | 0));
  const num = (100 + ((rand() * 900) | 0));
  const dec = ((rand() * 90) | 0);
  const year = 1976 + ((rand() * 50) | 0);
  return `${a}${b} ${num}.${String(dec).padStart(2,'0')} • ${year} • CARD ${String(n).padStart(3,'0')}`;
}

function buildCard(rand, n){
  const topic = pick(rand, TOPICS);
  const subject = pick(rand, SUBJECTS);
  const where = pick(rand, SETTINGS);
  const event = pick(rand, EVENTS);
  const twist = pick(rand, TWISTS);

  const drawer = (rand() * 6) | 0; // which drawer "served" it
  const callNo = makeCallNo(rand, n);

  // keep it micro: 2–3 short lines
  const line1 = `${subject} ${where} ${event}.`;
  const line2 = twist;
  const line3 = rand() < 0.45 ? pick(rand, [
    'Filed under: DO NOT SAY THIS OUT LOUD.',
    'Cross-reference: the sound of pages turning at 3:13 AM.',
    'See also: a door that only opens on rereads.',
    'Note: if you feel watched, check the margins.',
  ]) : null;

  const title = `${topic} — ${String(1 + ((rand() * 97) | 0)).padStart(2,'0')}`;

  const lines = [line1, line2];
  if (line3) lines.push(line3);

  return { title, topic, lines, callNo, drawer };
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;

  let cardN = 1;
  let card = null;
  let cardT = 0;

  let openP = 0; // 0..1 drawer open
  let openFrom = 0;
  let rarePulse = 0;
  let rareText = '';
  let nextRareAt = 0;

  let ambience = null;

  const CARD_DUR = 14.0; // seconds per card
  const FLIP_DUR = 1.1;  // transition window at end

  function nextCard(){
    cardN++;
    cardT = 0;
    openFrom = openP;
    // alternate drawer open/close feel by snapping open target
    card = buildCard(rand, cardN);
    openP = 0; // start closed; will animate open

    if (audio.enabled) cardFlick(audio, rand, { gain: 0.030 });
  }

  function init({ width, height, dpr: dp }){
    w = width;
    h = height;
    dpr = dp || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    cardN = 1;
    cardT = 0;
    card = buildCard(rand, cardN);
    openP = 0;
    openFrom = 0;
    rarePulse = 0;
    rareText = '';
    nextRareAt = 4 + rand() * 7;
  }

  function onResize(width, height, dp){
    init({ width, height, dpr: dp });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const hiss = audio.noiseSource({ type: 'pink', gain: 0.0035 });
    hiss.start();
    const dr = simpleDrone(audio, { root: 82 + rand() * 20, detune: 0.55, gain: 0.032 });
    ambience = {
      stop(){
        try { hiss.stop(); } catch {}
        try { dr.stop(); } catch {}
      }
    };
    audio.setCurrent(ambience);
    audio.beep({ freq: 520 + rand() * 80, dur: 0.03, gain: 0.012, type: 'triangle' });
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;
    cardT += dt;
    rarePulse = Math.max(0, rarePulse - dt * 0.75);

    // drawer open animation: open quickly, then settle
    const openTarget = 1;
    const inP = smoothstep(0.05, 0.35, cardT / CARD_DUR);
    openP = openFrom + (openTarget - openFrom) * inP;

    // occasional tiny library tick
    if (audio.enabled && rand() < dt * 0.035){
      audio.beep({ freq: 740 + rand() * 380, dur: 0.012, gain: 0.0045, type: 'square' });
    }

    // flip
    if (cardT >= CARD_DUR + FLIP_DUR){
      nextCard();
    }
    if (cardT >= nextRareAt && cardT < CARD_DUR - 2.2){
      rarePulse = 1;
      rareText = pick(rand, RARE_NOTES);
      nextRareAt = CARD_DUR + 99;
      if (audio.enabled){
        audio.beep({ freq: 320 + rand() * 50, dur: 0.028, gain: 0.01, type: 'triangle' });
        audio.beep({ freq: 205 + rand() * 40, dur: 0.04, gain: 0.009, type: 'square' });
      }
    }
    if (cardT >= CARD_DUR && audio.enabled && cardT - dt < CARD_DUR){
      // pre-flip soft rustle
      cardFlick(audio, rand, { gain: 0.020 });
    }
  }

  function drawWood(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a0b0e');
    g.addColorStop(0.35, '#07070a');
    g.addColorStop(1, '#030304');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // faint warm pool
    const rg = ctx.createRadialGradient(w * 0.52, h * 0.52, 10, w * 0.52, h * 0.52, Math.max(w, h) * 0.7);
    rg.addColorStop(0, 'rgba(120, 75, 35, 0.18)');
    rg.addColorStop(0.45, 'rgba(60, 35, 18, 0.10)');
    rg.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    // dust motes
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = 'rgba(255, 245, 230, 0.9)';
    const n = Math.floor(80 + 120 * (0.5 + 0.5 * Math.sin(t * 0.17)));
    for (let i = 0; i < n; i++){
      const x = (rand() * w) | 0;
      const y = (rand() * h) | 0;
      if (((x + y + i) & 15) === 0) ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  function drawCabinet(ctx, x, y, cw, ch, activeDrawer){
    // cabinet frame
    ctx.save();
    ctx.fillStyle = 'rgba(34, 20, 12, 0.85)';
    ctx.strokeStyle = 'rgba(10, 6, 4, 0.9)';
    ctx.lineWidth = Math.max(1, 2.0 * dpr);
    roundRect(ctx, x, y, cw, ch, Math.max(16, Math.floor(font * 1.1)));
    ctx.fill();
    ctx.stroke();

    // subtle grain stripes
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'rgba(255, 210, 160, 0.28)';
    const step = Math.max(10, Math.floor(ch / 20));
    for (let yy = 0; yy < ch; yy += step){
      if (((yy / step) | 0) & 1) ctx.fillRect(x + Math.floor(cw * 0.06), y + yy, Math.floor(cw * 0.88), 1);
    }

    // drawers: 3 rows x 2 cols
    ctx.globalAlpha = 1;
    const pad = Math.floor(cw * 0.06);
    const gap = Math.floor(cw * 0.04);
    const cols = 2;
    const rows = 3;
    const dw = Math.floor((cw - pad * 2 - gap * (cols - 1)) / cols);
    const dh = Math.floor((ch - pad * 2 - gap * (rows - 1)) / rows);

    for (let r = 0; r < rows; r++){
      for (let c = 0; c < cols; c++){
        const i = r * cols + c;
        const dx = x + pad + c * (dw + gap);
        const dy = y + pad + r * (dh + gap);

        const isActive = i === activeDrawer;
        const shade = isActive ? 0.92 : 0.74;

        ctx.save();
        ctx.fillStyle = `rgba(58, 34, 20, ${shade})`;
        ctx.strokeStyle = isActive ? 'rgba(240, 210, 160, 0.38)' : 'rgba(0, 0, 0, 0.28)';
        ctx.lineWidth = Math.max(1, 1.4 * dpr);
        roundRect(ctx, dx, dy, dw, dh, Math.max(12, Math.floor(font * 0.9)));
        ctx.fill();
        ctx.stroke();

        // label plate + handle
        ctx.globalAlpha = 0.95;
        const plateW = Math.floor(dw * 0.56);
        const plateH = Math.floor(dh * 0.32);
        const px = dx + Math.floor(dw * 0.22);
        const py = dy + Math.floor(dh * 0.18);
        ctx.fillStyle = 'rgba(240, 230, 215, 0.75)';
        ctx.strokeStyle = 'rgba(40, 24, 14, 0.25)';
        roundRect(ctx, px, py, plateW, plateH, Math.max(8, Math.floor(font * 0.6)));
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(20, 12, 8, 0.82)';
        ctx.font = `${Math.floor(small * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillText(`IDX ${String(i+1).padStart(2,'0')}`, px + Math.floor(font * 0.6), py + plateH / 2);

        const hx = dx + dw * 0.5;
        const hy = dy + dh * 0.72;
        ctx.strokeStyle = 'rgba(240, 210, 160, 0.32)';
        ctx.lineWidth = Math.max(1, 2.0 * dpr);
        ctx.beginPath();
        ctx.moveTo(hx - dw * 0.10, hy);
        ctx.lineTo(hx + dw * 0.10, hy);
        ctx.stroke();

        if (isActive){
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = 'rgba(255, 235, 200, 0.9)';
          ctx.fillRect(dx + 2, dy + 2, dw - 4, dh - 4);
        }

        ctx.restore();
      }
    }

    ctx.restore();

    return { pad, gap, dw, dh, cols, rows };
  }

  function render(ctx){
    if (!card) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawWood(ctx);

    // header strip
    const headerH = Math.floor(h * 0.12);
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(0, 0, w, headerH);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(245, 235, 220, 0.92)';
    ctx.font = `${Math.floor(font * 1.06)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('MIDNIGHT LIBRARY INDEX', Math.floor(w * 0.05), Math.floor(headerH * 0.45));

    ctx.globalAlpha = 0.72;
    ctx.font = `${Math.floor(font * 0.86)}px ui-sans-serif, system-ui`;
    ctx.fillText('card catalogue • micro-stories • drawer by drawer', Math.floor(w * 0.05), Math.floor(headerH * 0.78));

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(240, 210, 160, 0.75)';
    ctx.fillRect(0, headerH - 2, w, 2);
    ctx.restore();

    // cabinet
    const s = Math.min(w, h);
    const cw = Math.floor(s * 0.78);
    const ch = Math.floor(s * 0.70);
    const cx = Math.floor(w * 0.5 - cw * 0.5);
    const cy = Math.floor(h * 0.54 - ch * 0.5);

    const layout = drawCabinet(ctx, cx, cy, cw, ch, card.drawer);

    // active drawer position
    const { pad, gap, dw, dh, cols } = layout;
    const r = (card.drawer / cols) | 0;
    const c = card.drawer % cols;
    const dx = cx + pad + c * (dw + gap);
    const dy = cy + pad + r * (dh + gap);

    // open-drawer animation
    const p = clamp(cardT / (CARD_DUR * 0.35), 0, 1);
    const open = smoothstep(0.0, 1.0, p) * clamp(openP, 0, 1);

    // drawer body pulled out
    const pull = Math.floor(dw * 0.20 * open);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(44, 26, 16, 0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, 1.4 * dpr);
    roundRect(ctx, dx + pull, dy + Math.floor(dh * 0.06), dw, Math.floor(dh * 0.86), Math.max(10, Math.floor(font * 0.8)));
    ctx.fill();
    ctx.stroke();

    // inner cavity
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, dx + pull + Math.floor(dw * 0.08), dy + Math.floor(dh * 0.20), Math.floor(dw * 0.84), Math.floor(dh * 0.58), Math.max(8, Math.floor(font * 0.6)));
    ctx.fill();

    // card emerging
    const cardW = Math.floor(dw * 0.92);
    const cardH = Math.floor(dh * 1.35);
    const cardX = dx + pull + Math.floor(dw * 0.04);
    const cardY = dy + Math.floor(dh * 0.10) - Math.floor(cardH * (0.62 * open));

    // shadow
    ctx.globalAlpha = 0.35 * open;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, cardX + 8, cardY + 10, cardW, cardH, Math.max(12, Math.floor(font * 0.9)));
    ctx.fill();

    // paper
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = 'rgba(246, 241, 232, 0.98)';
    ctx.strokeStyle = 'rgba(40, 24, 14, 0.16)';
    ctx.lineWidth = Math.max(1, 1.2 * dpr);
    roundRect(ctx, cardX, cardY, cardW, cardH, Math.max(12, Math.floor(font * 0.9)));
    ctx.fill();
    ctx.stroke();

    // ruled lines
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = 'rgba(60, 40, 24, 0.65)';
    ctx.lineWidth = Math.max(1, 1.0 * dpr);
    const ry0 = cardY + Math.floor(cardH * 0.30);
    const step = Math.max(14, Math.floor(cardH / 9));
    for (let yy = ry0; yy < cardY + cardH - Math.floor(cardH * 0.10); yy += step){
      ctx.beginPath();
      ctx.moveTo(cardX + Math.floor(cardW * 0.06), yy);
      ctx.lineTo(cardX + Math.floor(cardW * 0.94), yy);
      ctx.stroke();
    }

    // text (typewriter reveal)
    const revealP = clamp((cardT - 0.4) / (CARD_DUR * 0.78), 0, 1);
    const head = card.title;
    const allLines = [
      head,
      card.callNo,
      '',
      ...card.lines,
    ];
    const text = allLines.join('\n');
    const total = text.length;
    const shown = Math.floor(total * smoothstep(0, 1, revealP));
    const vis = text.slice(0, shown);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(20, 12, 8, 0.90)';
    ctx.textBaseline = 'top';

    const marginX = cardX + Math.floor(cardW * 0.08);
    let yy = cardY + Math.floor(cardH * 0.10);

    // first line: title
    ctx.font = `${Math.floor(font * 1.0)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const lines = vis.split('\n');

    // render line-by-line to style title+call no
    for (let i = 0; i < lines.length; i++){
      const ln = lines[i];
      if (i === 0){
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = 'rgba(20, 12, 8, 0.92)';
        ctx.font = `${Math.floor(font * 1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      } else if (i === 1){
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = 'rgba(20, 12, 8, 0.75)';
        ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      } else {
        ctx.globalAlpha = 0.86;
        ctx.fillStyle = 'rgba(20, 12, 8, 0.86)';
        ctx.font = `${Math.floor(small * 1.02)}px ui-sans-serif, system-ui`;
      }

      ctx.fillText(ln, marginX, yy);
      yy += Math.floor((i < 2 ? font * 1.25 : small * 1.45));
      if (yy > cardY + cardH - Math.floor(cardH * 0.10)) break;
    }

    ctx.restore();

    // footer hint
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, Math.floor(h * 0.93), w, Math.floor(h * 0.07));

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(245, 235, 220, 0.70)';
    ctx.font = `${Math.floor(h / 40)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';

    const rem = Math.max(0, Math.ceil(CARD_DUR - cardT));
    ctx.fillText(`NEXT CARD: ${String(rem).padStart(2,'0')}s`, Math.floor(w * 0.05), Math.floor(h * 0.965));
    ctx.restore();

    if (rarePulse > 0 && rareText) {
      const p = rarePulse * (0.5 + 0.5 * Math.sin(t * 14) ** 2);
      const fs = Math.max(12, Math.floor(Math.min(w, h) * 0.023));
      const pad = Math.max(6, Math.floor(fs * 0.45));
      ctx.save();
      ctx.font = `700 ${fs}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      const tw = Math.ceil(ctx.measureText(rareText).width);
      const bw = tw + pad * 2;
      const bh = fs + pad * 1.6;
      const bx = Math.floor(w * 0.5 - bw * 0.5);
      const by = Math.floor(h * 0.84 - bh * 0.5);
      ctx.globalAlpha = 0.9 * p;
      ctx.fillStyle = 'rgba(30, 20, 16, 0.88)';
      ctx.strokeStyle = 'rgba(255, 210, 140, 0.8)';
      ctx.lineWidth = Math.max(1, Math.floor(fs * 0.12));
      roundRect(ctx, bx, by, bw, bh, Math.max(8, Math.floor(fs * 0.35)));
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(250, 235, 210, 0.96)';
      ctx.fillText(rareText, bx + pad, by + fs + pad * 0.35);
      ctx.restore();
    }
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
