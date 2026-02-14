import { mulberry32, clamp } from '../util/prng.js';

// Type Specimen Theatre
// Fonts as characters: each act performs a mood with kerning jokes and glyph close-ups.

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

function drawSpacedText(ctx, text, x, y, spacing){
  // Draw text one glyph at a time so we can animate “kerning”.
  let xx = x;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    ctx.fillText(ch, xx, y);
    const m = ctx.measureText(ch);
    xx += (m.width || 0) + spacing;
  }
}

function measureSpacedText(ctx, text, spacing){
  let w = 0;
  for (let i = 0; i < text.length; i++){
    w += ctx.measureText(text[i]).width || 0;
    if (i !== text.length - 1) w += spacing;
  }
  return w;
}

const CAST = [
  {
    name: 'System Sans',
    role: 'The Efficient Lead',
    family: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    baseSpacing: 1.5,
    amp: 6,
    freq: 0.55,
    fg: '#e9eef6',
    accent: '#7bd7ff',
  },
  {
    name: 'Old-School Serif',
    role: 'The Dramatic Monologue',
    family: 'ui-serif, Georgia, Times New Roman, serif',
    baseSpacing: 0.5,
    amp: 4,
    freq: 0.35,
    fg: '#f3eee6',
    accent: '#f6b06a',
  },
  {
    name: 'Mono Courier',
    role: 'The Precise Stagehand',
    family: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    baseSpacing: 0.0,
    amp: 3,
    freq: 0.8,
    fg: '#e6fff0',
    accent: '#7cffb5',
  },
  {
    name: 'Cursive Darling',
    role: 'The Overly Sincere Solo',
    family: 'cursive',
    baseSpacing: 1.0,
    amp: 7,
    freq: 0.42,
    fg: '#fff1fb',
    accent: '#ff7bd1',
  },
  {
    name: 'Fantasy Poster',
    role: 'The Loud Cameo',
    family: 'fantasy',
    baseSpacing: -0.5,
    amp: 8,
    freq: 0.6,
    fg: '#fff6da',
    accent: '#ffd36a',
  },
];

const WORDS = [
  'KERNING', 'GLYPH', 'LIGATURE', 'SERRATED', 'PLATYPUS', 'VIBE CHECK', 'SPACEBAR', 'PIXEL OPERA',
  'TINY TYPE', 'SOFT CURVES', 'HARD EDGES', 'BOLD MOVES', 'QUIET PAUSE',
];

const JOKES = [
  '"We need… space." (kerning)',
  'Tracking is just confidence, measured.',
  'This pair is too close. Add chaperones.',
  'One more unit and we’re friends again.',
  'Ligatures: when letters hold hands.',
  'Baseline? I have a *range*.',
  'Hinting: the art of tiny lies.',
  'My x-height is a personality trait.',
];

function buildAct(rand, idx){
  const c = CAST[idx % CAST.length];
  const word = pick(rand, WORDS);
  const joke = pick(rand, JOKES);

  // pick a glyph to spotlight (skip spaces)
  const letters = [...word].filter(ch => ch !== ' ');
  const glyph = letters.length ? letters[(rand() * letters.length) | 0] : 'A';

  // “mood” affects spotlight hue + spacing bias
  const mood = pick(rand, ['tender', 'bold', 'anxious', 'heroic', 'minimal']);
  const moodBias = mood === 'anxious' ? 1.2 : (mood === 'minimal' ? -0.6 : 0);

  return { ...c, word, joke, glyph, mood, moodBias };
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  let font = 18;
  let small = 12;

  const ACT_DUR = 28; // seconds per act
  const XFADE = 1.5;

  let actIndex = 0;
  let actT = 0;
  let act = buildAct(rand, actIndex);

  function init({ width, height, dpr: dp }){
    w = width;
    h = height;
    dpr = dp || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 30));
    small = Math.max(11, Math.floor(font * 0.72));

    actIndex = 0;
    actT = 0;
    act = buildAct(rand, actIndex);
  }

  function onResize(width, height, dp){
    init({ width, height, dpr: dp });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    audio.beep({ freq: 620, dur: 0.03, gain: 0.02, type: 'triangle' });
  }

  function onAudioOff(){}

  function destroy(){}

  function nextAct(){
    actIndex++;
    actT = 0;
    act = buildAct(rand, actIndex);
    if (audio.enabled){
      // tiny theatre “sting”
      audio.beep({ freq: 740 + rand() * 60, dur: 0.04, gain: 0.02, type: 'square' });
      setTimeout(() => audio.beep({ freq: 920 + rand() * 90, dur: 0.05, gain: 0.018, type: 'triangle' }), 60);
    }
  }

  function update(dt){
    t += dt;
    actT += dt;
    if (actT >= ACT_DUR) nextAct();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Stage background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#07080b');
    bg.addColorStop(0.55, '#040406');
    bg.addColorStop(1, '#020203');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Curtains
    const curtain = ctx.createLinearGradient(0, 0, 0, h);
    curtain.addColorStop(0, '#4a0c18');
    curtain.addColorStop(0.6, '#2c0610');
    curtain.addColorStop(1, '#120206');

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = curtain;
    const cw = Math.floor(w * 0.18);
    ctx.fillRect(0, 0, cw, h);
    ctx.fillRect(w - cw, 0, cw, h);
    // folds
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#ffffff';
    const foldStep = Math.max(18, Math.floor(cw / 7));
    for (let x = 0; x < cw; x += foldStep){
      const a = 0.10 + 0.07 * Math.sin((x / foldStep) + t * 0.35);
      ctx.globalAlpha = a;
      ctx.fillRect(x + Math.floor(foldStep * 0.55), 0, Math.max(2, Math.floor(foldStep * 0.12)), h);
      ctx.fillRect(w - cw + x + Math.floor(foldStep * 0.2), 0, Math.max(2, Math.floor(foldStep * 0.10)), h);
    }
    ctx.restore();

    // Stage floor
    ctx.save();
    ctx.globalAlpha = 0.85;
    const floorY = Math.floor(h * 0.74);
    const floor = ctx.createLinearGradient(0, floorY, 0, h);
    floor.addColorStop(0, 'rgba(10,10,12,0.0)');
    floor.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = floor;
    ctx.fillRect(0, floorY, w, h - floorY);
    ctx.restore();

    // Spotlight
    const spotX = w * (0.5 + 0.08 * Math.sin(t * 0.18));
    const spotY = h * 0.46;
    const sr = Math.min(w, h) * 0.55;
    const spot = ctx.createRadialGradient(spotX, spotY, sr * 0.06, spotX, spotY, sr);
    const hue = act.mood === 'tender' ? 320 : (act.mood === 'bold' ? 45 : (act.mood === 'heroic' ? 200 : 120));
    spot.addColorStop(0, `hsla(${hue}, 85%, 65%, 0.28)`);
    spot.addColorStop(0.45, `hsla(${hue}, 75%, 55%, 0.10)`);
    spot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, w, h);

    // Crossfade in/out
    const fadeIn = smooth(clamp(actT / XFADE, 0, 1));
    const fadeOut = smooth(clamp((ACT_DUR - actT) / XFADE, 0, 1));
    const a = Math.min(fadeIn, fadeOut);

    // Marquee
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(Math.floor(w * 0.16), Math.floor(h * 0.08), Math.floor(w * 0.68), Math.floor(font * 2.3));

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(Math.floor(w * 0.16), Math.floor(h * 0.08 + font * 2.3), Math.floor(w * 0.68), Math.max(1, Math.floor(1.2 * dpr)));

    ctx.globalAlpha = 0.88;
    ctx.fillStyle = '#f4f2ee';
    ctx.font = `${Math.floor(font * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('TYPE SPECIMEN THEATRE', Math.floor(w * 0.18), Math.floor(h * 0.09));

    ctx.globalAlpha = 0.68;
    ctx.font = `${Math.floor(small * 0.95)}px ui-sans-serif, system-ui`;
    const actNo = String((actIndex % CAST.length) + 1).padStart(2,'0');
    ctx.fillText(`ACT ${actNo} — ${act.name} • ${act.role}`, Math.floor(w * 0.18), Math.floor(h * 0.09 + font * 1.05));
    ctx.restore();

    // Main word performance
    const mainY = Math.floor(h * 0.46);
    const size = Math.floor(Math.min(w, h) * 0.11);

    const kern = act.baseSpacing + act.moodBias + act.amp * Math.sin(actT * act.freq);
    const kernPx = Math.floor(kern * dpr);

    ctx.save();
    ctx.globalAlpha = 0.95 * a;
    ctx.fillStyle = act.fg;
    ctx.font = `700 ${size}px ${act.family}`;
    ctx.textBaseline = 'alphabetic';

    const text = act.word;
    const tw = measureSpacedText(ctx, text, kernPx);
    const tx = Math.floor(w * 0.5 - tw * 0.5);
    drawSpacedText(ctx, text, tx, mainY, kernPx);

    // underline-ish stage mark
    ctx.globalAlpha = 0.18 * a;
    ctx.strokeStyle = act.accent;
    ctx.lineWidth = Math.max(1, Math.floor(1.6 * dpr));
    ctx.beginPath();
    ctx.moveTo(Math.floor(w * 0.22), Math.floor(mainY + size * 0.22));
    ctx.lineTo(Math.floor(w * 0.78), Math.floor(mainY + size * 0.22));
    ctx.stroke();

    // Joke caption
    ctx.globalAlpha = 0.72 * a;
    ctx.fillStyle = '#d9dde7';
    ctx.font = `${Math.floor(small * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    const cap = act.joke;
    const capW = ctx.measureText(cap).width;
    ctx.fillText(cap, Math.floor(w * 0.5 - capW * 0.5), Math.floor(h * 0.57));

    ctx.restore();

    // Glyph close-up panel (right side)
    const panelW = Math.floor(w * 0.26);
    const panelH = Math.floor(h * 0.30);
    const px = Math.floor(w * 0.70);
    const py = Math.floor(h * 0.60);
    const pulse = 0.5 + 0.5 * Math.sin(actT * 0.85);

    ctx.save();
    ctx.globalAlpha = 0.88 * a;
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    ctx.fillRect(px, py, panelW, panelH);

    ctx.globalAlpha = 0.30 * a;
    ctx.strokeStyle = act.accent;
    ctx.lineWidth = Math.max(1, Math.floor(1.2 * dpr));
    ctx.strokeRect(px + 1, py + 1, panelW - 2, panelH - 2);

    // guides
    ctx.globalAlpha = 0.18 * a;
    ctx.beginPath();
    ctx.moveTo(px, py + panelH * 0.66);
    ctx.lineTo(px + panelW, py + panelH * 0.66);
    ctx.moveTo(px, py + panelH * 0.38);
    ctx.lineTo(px + panelW, py + panelH * 0.38);
    ctx.stroke();

    ctx.globalAlpha = 0.90 * a;
    ctx.fillStyle = act.fg;
    const gSize = Math.floor(panelH * (0.78 + 0.06 * pulse));
    ctx.font = `800 ${gSize}px ${act.family}`;
    ctx.textBaseline = 'alphabetic';

    const g = act.glyph;
    const m = ctx.measureText(g);
    const gx = px + Math.floor(panelW * 0.52 - (m.width || 0) * 0.5);
    const gy = py + Math.floor(panelH * 0.72);

    // bounding box (if available)
    const asc = (m.actualBoundingBoxAscent ?? (gSize * 0.75));
    const desc = (m.actualBoundingBoxDescent ?? (gSize * 0.20));
    const bw = (m.actualBoundingBoxRight != null && m.actualBoundingBoxLeft != null)
      ? (m.actualBoundingBoxRight - m.actualBoundingBoxLeft)
      : (m.width || gSize * 0.6);
    const bx = (m.actualBoundingBoxLeft != null) ? (gx + m.actualBoundingBoxLeft) : gx;
    const by = gy - asc;

    ctx.globalAlpha = 0.14 * a;
    ctx.fillStyle = act.accent;
    ctx.fillRect(Math.floor(bx), Math.floor(by), Math.ceil(bw), Math.ceil(asc + desc));

    ctx.globalAlpha = 0.90 * a;
    ctx.fillStyle = act.fg;
    ctx.fillText(g, gx, gy);

    // label
    ctx.globalAlpha = 0.78 * a;
    ctx.fillStyle = '#d9dde7';
    ctx.font = `${Math.floor(small * 0.90)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(`GLYPH: “${g}”`, px + Math.floor(font * 0.6), py + Math.floor(font * 0.5));

    ctx.globalAlpha = 0.55 * a;
    const s2 = `TRACK: ${kernPx >= 0 ? '+' : ''}${kernPx}px`;
    ctx.fillText(s2, px + Math.floor(font * 0.6), py + Math.floor(font * 0.5 + small * 1.2));

    ctx.restore();

    // broadcast dust
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const n = 180 + ((220 * (0.5 + 0.5 * Math.sin(t * 0.6))) | 0);
    for (let i = 0; i < n; i++){
      const x = (rand() * w) | 0;
      const y = (rand() * h) | 0;
      if (((x * 3 + y + i) & 7) === 0) ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
