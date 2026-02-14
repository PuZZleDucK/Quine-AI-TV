// REVIEWED: 2026-02-15
import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

const pick = (rand, a) => a[(rand() * a.length) | 0];

const SETTINGS = [
  'a rain-soaked arcade',
  'the last train carriage',
  'a lighthouse break room',
  'a late-night museum',
  'a roadside diner at 2:13am',
  'a quiet data centre',
  'a library basement',
  'a rooftop greenhouse',
  'a tiny community theatre',
  'a hotel corridor with bad carpet',
];

const MISSING = [
  'a cassette tape labelled “DON\'T PLAY”',
  'a brass key with no teeth',
  'the curator\'s badge',
  'a prototype circuit board',
  'a love letter with the last line torn off',
  'a jar of black sand',
  'a train ticket stamped twice',
  'a postcard from a city that doesn\'t exist',
  'a ring that was never worn',
  'a folded map with one street inked out',
];

const TITLES_A = [
  'The Case of the',
  'Micro-Mystery:',
  'Small Crime, Big Shadow:',
  'Tiny Trouble:',
  'A Pocket Mystery:',
];

const TITLES_B = [
  'Missing Key',
  'Double Stamp',
  'Silent Tape',
  'Inkless Map',
  'Borrowed Badge',
  'Black Sand',
  'Vanishing Postcard',
  'Unworn Ring',
  'Locked Drawer',
  'Half Letter',
];

const SUSPECTS = [
  { name: 'Mara Venn', quirk: 'collects receipts like evidence' },
  { name: 'Jules Kade', quirk: 'never removes their gloves' },
  { name: 'Ivo Sato', quirk: 'talks in timestamps' },
  { name: 'Len Ward', quirk: 'answers questions with questions' },
  { name: 'Pia Holloway', quirk: 'always smells faintly of citrus' },
  { name: 'Noah Brice', quirk: 'keeps perfect eye contact' },
  { name: 'Sera Coil', quirk: 'hums the same three notes' },
  { name: 'Oren Vale', quirk: 'never steps on cracks' },
];

const MOTIVES = [
  'to hide a mistake',
  'to protect someone',
  'to swap the real item with a decoy',
  'to settle a quiet debt',
  'to prevent a scandal',
  'to buy time',
  'to erase a name from the record',
  'to prove a point',
];

const METHODS = [
  'a duplicated key',
  'a forged badge',
  'a timed power flicker',
  'a staged spill',
  'a swapped envelope',
  'a mislabelled box',
  'a “helpful” distraction',
  'a second stamp',
];

const CLUE_FORMS = [
  'a smear of ink',
  'a thread caught on a hinge',
  'a fresh scratch on an old lock',
  'a warm plug in a cold wall',
  'a glove print on clean glass',
  'a receipt dated tomorrow',
  'a citrus scent where it shouldn\'t be',
  'three hummed notes, repeated',
  'a crack avoided too carefully',
  'a timestamp that doesn\'t match',
];

function makeStory(rand){
  const caseNo = String(100 + ((rand() * 900) | 0));
  const title = `${pick(rand, TITLES_A)} ${pick(rand, TITLES_B)}`;
  const setting = pick(rand, SETTINGS);
  const missing = pick(rand, MISSING);

  // pick 3 unique suspects
  const pool = SUSPECTS.slice();
  const suspects = [];
  for (let i = 0; i < 3; i++){
    const ix = (rand() * pool.length) | 0;
    suspects.push(pool.splice(ix, 1)[0]);
  }

  const culpritIx = (rand() * suspects.length) | 0;
  const culprit = suspects[culpritIx];
  const motive = pick(rand, MOTIVES);
  const method = pick(rand, METHODS);

  // craft 4 clues, ensure one points at culprit\'s quirk
  const clues = [pick(rand, CLUE_FORMS), pick(rand, CLUE_FORMS), pick(rand, CLUE_FORMS)];
  const tell = {
    'collects receipts like evidence': 'a receipt dated tomorrow',
    'never removes their gloves': 'a glove print on clean glass',
    'talks in timestamps': 'a timestamp that doesn\'t match',
    'hums the same three notes': 'three hummed notes, repeated',
    'always smells faintly of citrus': 'a citrus scent where it shouldn\'t be',
    'never steps on cracks': 'a crack avoided too carefully',
  }[culprit.quirk] || null;

  if (tell && !clues.includes(tell)) clues[(rand() * clues.length) | 0] = tell;
  clues.push(pick(rand, CLUE_FORMS));

  const clueLines = clues.map((c, i) => `CLUE ${i + 1}: ${c}.`);

  const suspectLines = suspects.map((s, i) => `SUSPECT ${i + 1}: ${s.name} — ${s.quirk}.`);

  const recap = [
    'FINAL CLUE RECAP:',
    ...clueLines.map((c) => `• ${c.replace(/^CLUE \d+: /,'')}`),
    `• Method: ${method}.`,
    `• Motive: ${motive}.`,
  ];

  const beats = [
    {
      duration: 14,
      lines: [
        `CASE #${caseNo}  —  ${title.toUpperCase()}`,
        `LOCATION: ${setting}.`,
        `INCIDENT: ${missing} is gone.`,
      ],
    },
    {
      duration: 12,
      lines: [
        'NOTE: It\'s always the small detail that makes the big shadow.',
        'NOTE: Keep your voice low. Keep your eyes open.',
      ],
    },
    {
      duration: 12,
      lines: suspectLines,
    },
    {
      duration: 12,
      lines: [
        'OBSERVATION: No forced entry. No broken glass.',
        'OBSERVATION: Someone wanted this to look effortless.',
      ],
    },
    // clue run
    {
      duration: 12,
      lines: [clueLines[0], 'NOTE: Not proof. A fingerprint of a decision.'],
    },
    {
      duration: 12,
      lines: [clueLines[1], 'NOTE: The room tells the truth before people do.'],
    },
    {
      duration: 12,
      lines: [clueLines[2], 'NOTE: Patterns don\'t lie — they just wait.'],
    },
    {
      duration: 12,
      lines: [clueLines[3], 'NOTE: One clue is a coincidence. Four is choreography.'],
    },
    {
      duration: 12,
      lines: [
        'MISDIRECT: The obvious suspect is a decoy story.',
        'MISDIRECT: If you\'re certain too fast, you\'re being guided.',
      ],
    },
    {
      duration: 14,
      lines: [
        'REVEAL: The telling detail wasn\'t loud — it was consistent.',
        `REVEAL: It points straight at ${culprit.name}.`,
      ],
    },
    {
      duration: 14,
      lines: [
        `CONFESSION (UNSIGNED): “I did it ${motive}.“`,
        `HOW: ${method}.`,
      ],
    },
    {
      duration: 16,
      lines: recap,
    },
    {
      duration: 12,
      lines: [
        'END NOTE: Micro-mysteries don\'t end. They just reset the room.',
        'END NOTE: Watch the details. They\'re watching you back.',
      ],
    },
  ];

  // stretch to ~5–6 minutes by inserting “slow pans” between beats
  // (keeps the vibe without needing 200 lines of text)
  const PANS = [
    '…camera lingers on the empty space where it was.',
    '…somewhere, a hinge clicks once. Then silence.',
    '…rain taps the window like a metronome for lies.',
    '…a fluorescent light remembers how to flicker.',
    '…footsteps that aren\'t yours, counted anyway.',
  ];

  const stretched = [];
  for (const b of beats){
    stretched.push(b);
    // insert a pan after most beats (not after final)
    if (b !== beats[beats.length - 1] && rand() < 0.78){
      stretched.push({ duration: 10 + rand() * 6, lines: [`PAN: ${pick(rand, PANS)}`] });
    }
  }

  // Ensure total duration is ~300–420s.
  let total = stretched.reduce((s, b) => s + b.duration, 0);
  while (total < 300){
    stretched.splice(2 + ((rand() * (stretched.length - 3)) | 0), 0, { duration: 12 + rand() * 8, lines: [`PAN: ${pick(rand, PANS)}`] });
    total = stretched.reduce((s, b) => s + b.duration, 0);
  }

  return { caseNo, title, setting, missing, suspects, culprit, motive, method, clues, beats: stretched, totalSeconds: total };
}

function roundedRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function makeCanvas(W, H){
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(W, H);
  if (typeof document !== 'undefined'){
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  }
  return null;
}

export function createChannel({ seed, audio }){
  const baseSeed = (seed == null) ? 0 : (seed >>> 0);
  const rand = mulberry32(baseSeed);
  // Keep audio randomness deterministic, but independent of story/visual RNG.
  const audioRand = mulberry32((baseSeed ^ 0x85ebca6b) >>> 0);
  const grainSeed = (baseSeed ^ 0x9e3779b9) >>> 0;

  let w = 0, h = 0;
  let t = 0;

  let story = makeStory(rand);
  let beatIx = 0;
  let beatT = 0;
  let shown = 0;
  let typeSpeed = 28;

  let font = 18;
  let lineH = 22;

  let clickCooldown = 0;
  let bed = null;

  let layout = null;
  let bgLayer = null;
  let folderLayer = null;
  let grainLayer = null;

  function computeLayout(){
    const pw = Math.floor(w * 0.84);
    const ph = Math.floor(h * 0.78);
    const px = Math.floor((w - pw) / 2);
    const py = Math.floor(h * 0.11);
    const r = Math.floor(Math.min(w, h) * 0.02);

    const paperPad = Math.floor(pw * 0.05);
    const sx = px + paperPad;
    const sy = py + paperPad;
    const sw = pw - paperPad * 2;
    const sh = ph - paperPad * 2;

    const paperR = Math.floor(r * 0.8);

    const stampW = Math.floor(sw * 0.36);
    const stampH = Math.floor(font * 2.2);
    const stampX = sx + Math.floor(sw * 0.58);
    const stampY = sy + Math.floor(sh * 0.08);
    const stampR = Math.floor(r * 0.6);

    const headerH = Math.floor(font * 2.1);
    const titleX = sx + Math.floor(sw * 0.05);
    const headerMidY = sy + Math.floor(font * 1.05);
    const metaX = sx + Math.floor(sw * 0.62);

    const tx = sx + Math.floor(sw * 0.06);
    const ty = sy + Math.floor(font * 2.7);

    const barY = sy + sh - Math.floor(font * 1.2);
    const barX = sx + Math.floor(sw * 0.06);
    const barW = Math.floor(sw * 0.88);
    const barH = Math.max(3, Math.floor(font * 0.16));

    return { pw, ph, px, py, r, sx, sy, sw, sh, paperR, stampW, stampH, stampX, stampY, stampR, headerH, titleX, headerMidY, metaX, tx, ty, barY, barX, barW, barH };
  }

  function rebuildLayers(){
    layout = computeLayout();

    bgLayer = makeCanvas(w, h) || false;
    folderLayer = makeCanvas(w, h) || false;
    grainLayer = makeCanvas(w, h) || false;

    if (bgLayer && bgLayer !== false){
      const b = bgLayer.getContext('2d');
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, w, h);

      const bg = b.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#06070b');
      bg.addColorStop(1, '#010208');
      b.fillStyle = bg;
      b.fillRect(0, 0, w, h);

      const vg = b.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.72)');
      b.fillStyle = vg;
      b.fillRect(0, 0, w, h);
    }

    if (folderLayer && folderLayer !== false){
      const f = folderLayer.getContext('2d');
      f.setTransform(1, 0, 0, 1, 0, 0);
      f.clearRect(0, 0, w, h);

      const { pw, ph, px, py, r, sx, sy, sw, sh, paperR, stampW, stampH, stampX, stampY, stampR, headerH, titleX, headerMidY } = layout;

      // shadow
      f.save();
      f.globalAlpha = 0.55;
      f.fillStyle = 'rgba(0,0,0,0.85)';
      roundedRect(f, px + 12, py + 16, pw, ph, r);
      f.fill();
      f.restore();

      // folder body
      f.save();
      f.globalAlpha = 0.96;
      f.fillStyle = 'rgba(32, 26, 18, 0.96)';
      roundedRect(f, px, py, pw, ph, r);
      f.fill();
      f.restore();

      // paper base
      f.save();
      f.globalAlpha = 0.98;
      f.fillStyle = 'rgba(245, 238, 224, 0.98)';
      roundedRect(f, sx, sy, sw, sh, paperR);
      f.fill();
      f.restore();

      // stamp
      f.save();
      f.globalAlpha = 0.18;
      f.strokeStyle = 'rgba(160, 40, 40, 1)';
      f.lineWidth = Math.max(2, Math.floor(font * 0.14));
      roundedRect(f, stampX, stampY, stampW, stampH, stampR);
      f.stroke();
      f.font = `bold ${Math.floor(font * 1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      f.fillStyle = 'rgba(160, 40, 40, 1)';
      f.textBaseline = 'middle';
      f.fillText('CONFIDENTIAL', stampX + Math.floor(stampW * 0.08), stampY + stampH / 2);
      f.restore();

      // header bar base + fixed title
      f.save();
      f.fillStyle = 'rgba(0,0,0,0.08)';
      f.fillRect(sx, sy, sw, headerH);
      f.font = `bold ${Math.floor(font * 1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      f.fillStyle = 'rgba(10,10,12,0.78)';
      f.textBaseline = 'middle';
      f.fillText('MICRO-MYSTERIES', titleX, headerMidY);
      f.restore();
    }

    if (grainLayer && grainLayer !== false){
      const g = grainLayer.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);

      const { sx, sy, sw, sh, paperR } = layout;
      const gr = mulberry32(grainSeed);

      g.save();
      roundedRect(g, sx, sy, sw, sh, paperR);
      g.clip();
      g.globalAlpha = 0.06;
      for (let i = 0; i < 140; i++){
        const x = sx + gr() * sw;
        const y = sy + gr() * sh;
        const ww = 10 + gr() * 34;
        g.fillStyle = (gr() < 0.5) ? 'rgba(0,0,0,1)' : 'rgba(90,70,40,1)';
        g.fillRect(x, y, ww, 1);
      }
      g.restore();
    }
  }

  function setBeat(i){
    beatIx = i;
    beatT = 0;
    shown = 0;
    const full = story.beats[beatIx].lines.join('\n');
    // try to finish typing within ~3.5s (or half beat duration), but not too fast.
    const target = Math.min(3.8, Math.max(2.2, story.beats[beatIx].duration * 0.45));
    typeSpeed = Math.max(18, full.length / target);
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 36));
    lineH = Math.floor(font * 1.35);
    story = makeStory(rand);
    setBeat(0);
    rebuildLayers();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    // Idempotent: avoid stacking multiple beds if the host calls this twice.
    if (bed) return;
    const d = simpleDrone(audio, { root: 70, detune: 0.9, gain: 0.035 });
    const n = audio.noiseSource({ type: 'pink', gain: 0.006 });
    n.start();
    bed = { stop(){ try { d.stop(); } catch {} try { n.stop(); } catch {} } };
    audio.setCurrent(bed);
  }

  function onAudioOff(){
    try { bed?.stop?.(); } catch {}
    bed = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;
    clickCooldown -= dt;

    const beat = story.beats[beatIx];
    beatT += dt;

    const full = beat.lines.join('\n');
    if (shown < full.length){
      const prev = Math.floor(shown);
      shown = Math.min(full.length, shown + dt * typeSpeed);
      const now = Math.floor(shown);

      // gentle type clicks, rate-limited (not per char)
      if (audio.enabled && now > prev && clickCooldown <= 0){
        clickCooldown = 0.045 + audioRand() * 0.04;
        audio.beep({ freq: 980 + audioRand() * 180, dur: 0.012, gain: 0.012, type: 'square' });
      }
    }

    if (beatT >= beat.duration){
      if (beatIx < story.beats.length - 1){
        setBeat(beatIx + 1);
      } else {
        story = makeStory(rand);
        setBeat(0);
      }
    }
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const L = layout || (layout = computeLayout());
    const { pw, ph, px, py, r, sx, sy, sw, sh, paperR, stampW, stampH, stampX, stampY, stampR, headerH, titleX, headerMidY, metaX, tx, ty, barX, barY, barW, barH } = L;

    if (bgLayer && bgLayer !== false) {
      ctx.drawImage(bgLayer, 0, 0);
    } else {
      // Fallback (no offscreen canvas support)
      ctx.clearRect(0, 0, w, h);

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#06070b');
      bg.addColorStop(1, '#010208');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.72)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    if (folderLayer && folderLayer !== false) {
      ctx.drawImage(folderLayer, 0, 0);
    } else {
      // shadow
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      roundedRect(ctx, px + 12, py + 16, pw, ph, r);
      ctx.fill();
      ctx.restore();

      // folder body
      ctx.save();
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = 'rgba(32, 26, 18, 0.96)';
      roundedRect(ctx, px, py, pw, ph, r);
      ctx.fill();
      ctx.restore();

      // paper base
      ctx.save();
      ctx.globalAlpha = 0.98;
      ctx.fillStyle = 'rgba(245, 238, 224, 0.98)';
      roundedRect(ctx, sx, sy, sw, sh, paperR);
      ctx.fill();
      ctx.restore();

      // stamp
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = 'rgba(160, 40, 40, 1)';
      ctx.lineWidth = Math.max(2, Math.floor(font * 0.14));
      roundedRect(ctx, stampX, stampY, stampW, stampH, stampR);
      ctx.stroke();
      ctx.font = `bold ${Math.floor(font * 1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = 'rgba(160, 40, 40, 1)';
      ctx.textBaseline = 'middle';
      ctx.fillText('CONFIDENTIAL', stampX + Math.floor(stampW * 0.08), stampY + stampH / 2);
      ctx.restore();

      // header bar base + fixed title
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(sx, sy, sw, headerH);
      ctx.font = `bold ${Math.floor(font * 1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = 'rgba(10,10,12,0.78)';
      ctx.textBaseline = 'middle';
      ctx.fillText('MICRO-MYSTERIES', titleX, headerMidY);
      ctx.restore();
    }

    if (grainLayer && grainLayer !== false) {
      ctx.drawImage(grainLayer, 0, 0);
    } else {
      const gr = mulberry32(grainSeed);
      ctx.save();
      roundedRect(ctx, sx, sy, sw, sh, paperR);
      ctx.clip();
      ctx.globalAlpha = 0.06;
      for (let i = 0; i < 140; i++){
        const x = sx + gr() * sw;
        const y = sy + gr() * sh;
        const ww = 10 + gr() * 34;
        ctx.fillStyle = (gr() < 0.5) ? 'rgba(0,0,0,1)' : 'rgba(90,70,40,1)';
        ctx.fillRect(x, y, ww, 1);
      }
      ctx.restore();
    }

    // header meta
    ctx.save();
    ctx.font = `${Math.floor(font * 0.88)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(10,10,12,0.55)';
    ctx.textBaseline = 'middle';
    const eta = Math.floor(story.totalSeconds);
    ctx.fillText(`CASE #${story.caseNo}  •  ~${Math.floor(eta / 60)}m`, metaX, headerMidY);
    ctx.restore();

    // body text (typed)
    const beat = story.beats[beatIx];
    const full = beat.lines.join('\n');
    const visible = full.slice(0, Math.floor(shown));
    const lines = visible.split('\n');

    ctx.save();
    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';

    let y = ty;
    for (const line of lines){
      const l = line.trimEnd();
      let color = 'rgba(20, 18, 16, 0.78)';
      if (l.startsWith('CLUE')) color = 'rgba(18, 45, 76, 0.82)';
      else if (l.startsWith('REVEAL')) color = 'rgba(92, 18, 26, 0.85)';
      else if (l.startsWith('FINAL CLUE RECAP')) color = 'rgba(0, 0, 0, 0.7)';
      else if (l.startsWith('PAN:')) color = 'rgba(0, 0, 0, 0.46)';
      else if (l.startsWith('NOTE')) color = 'rgba(0, 0, 0, 0.56)';

      // mild jitter like a tired typewriter
      const jx = (rand() - 0.5) * 0.6;
      const jy = (rand() - 0.5) * 0.6;
      ctx.fillStyle = color;
      ctx.fillText(l.replace(/^PAN: /, ''), tx + jx, y + jy);
      y += lineH;
      if (y > sy + sh - lineH * 2) break;
    }

    // cursor blink when still typing
    if (shown < full.length && lines.length){
      const blink = (Math.sin(t * 7) > 0) ? 1 : 0;
      if (blink){
        const last = lines[lines.length - 1];
        const cx = tx + ctx.measureText(last).width + 3;
        const cy = ty + (lines.length - 1) * lineH;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(cx, cy + 2, Math.max(2, Math.floor(font * 0.12)), font + 1);
      }
    }

    ctx.restore();

    // progress bar
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(barX, barY, barW, barH);
    const p = Math.min(1, Math.max(0, (beatIx + beatT / beat.duration) / story.beats.length));
    ctx.fillStyle = 'rgba(92, 18, 26, 0.45)';
    ctx.fillRect(barX, barY, Math.floor(barW * p), barH);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
