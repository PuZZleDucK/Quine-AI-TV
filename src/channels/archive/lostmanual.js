import { mulberry32, clamp } from '../../util/prng.js';
// REVIEWED: 2026-02-11

// The Lost Instruction Manual
// A faux manual page flips periodically, explaining absurd devices with diagrams and safety warnings.

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }

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

function paperRustle(audio, rand, {gain=0.045}={}){
  // Short noise burst shaped to feel like a page flip.
  const ctx = audio.ensure();
  const dur = 0.16 + rand() * 0.12;
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(dur * sr));

  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++){
    const x = i / len;
    const env = Math.pow(1 - x, 2.2);
    // white noise with a tiny bit of "brown" inertia
    const n = (Math.random() * 2 - 1) * 0.9 + ((i ? d[i-1] : 0) * 0.16);
    d[i] = n * env;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 650 + rand() * 1200;
  bp.Q.value = 0.75;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 140;
  hp.Q.value = 0.7;

  const g = ctx.createGain();
  g.gain.value = 0;

  src.connect(bp);
  bp.connect(hp);
  hp.connect(g);
  g.connect(audio.master);

  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const ADJ = [
  'Quantum', 'Pocket', 'Emergency', 'Modular', 'Self-Inflating', 'Anti-Gravity', 'Portable', 'Accidental',
  'Hyperlocal', 'Solar', 'Microwave-Safe', 'Left-Handed', 'High-Drama', 'No-Question-Asked',
];

const NOUN = [
  'Sandwich Compiler', 'Umbrella Calibrator', 'Regret Extractor', 'Apology Generator', 'Tea Stabilizer',
  'Spoon Indexer', 'Time-Delay Doorknob', 'Cat-Approved Router', 'Mild Panic Filter', 'Sock Teleporter',
  'Desk Atmosphere Engine', 'Weather-Briefcase', 'Laser Tape Measure (Polite)',
];

const PURPOSE = [
  'for aligning intentions with physical reality',
  'for converting small mistakes into useful heat',
  'for negotiating with stubborn household objects',
  'for producing a clean, repeatable Tuesday',
  'for compressing awkward silences into pocket-sized cubes',
  'for rehydrating ancient snack crumbs',
  'for making spreadsheets feel seen',
  'for stabilizing vibes in drafty rooms',
];

const WARNINGS = [
  'Do not operate near enthusiastic pigeons.',
  'Avoid eye contact during the boot sequence.',
  'If humming exceeds 7 seconds, gently apologize and restart.',
  'Not dishwasher safe in any known universe.',
  'Keep away from magnets, secrets, and fresh paint.',
  'If the device begins offering career advice, power down immediately.',
  'Do not fold, spindle, or emotionally anthropomorphize.',
  'For indoor use unless outdoors is feeling particularly reasonable.',
  'Do not run this unit during a haunting unless supervised by accounting.',
  'If the manual starts updating itself, do not make eye contact with page 4.',
  'Keep fingers clear of any slot labelled \"DESTINY\".',
];

const PARTS = [
  'MYSTERY DIAL', 'SAFETY LATCH', 'CALMING VENT', 'INPUT SLOT', 'OUTPUT HATCH', 'TONE KNOB',
  'STATUS EYE', 'CONFIG FLAP', 'BUREAUCRACY PORT', 'BUTTON (DO NOT)',
];

const STEPS = [
  'Place device on a stable surface. Offer a polite greeting.',
  'Rotate the Mystery Dial until the indicator becomes mildly confident.',
  'Insert one (1) ordinary problem into the Input Slot.',
  'Wait for the Status Eye to blink “approved”. (This may be symbolic.)',
  'Open the Output Hatch and retrieve results using tongs or optimism.',
  'If results are philosophical, repeat Step 2 with less sincerity.',
  'Record all unusual humming in triplicate for warranty purposes.',
  'If the indicator points at you, pretend to recalibrate and leave.',
  'When the chassis whispers, ask it to repeat at half speed.',
];

const ERRATA = [
  'ERRATA: DEVICE NOW CERTIFIED FOR MILD HAUNTINGS',
  'ERRATA: STEP 3 REQUIRES A BRAVER TECHNICIAN',
  'ERRATA: OUTPUT MAY INCLUDE UNSOLICITED PROPHECIES',
  'ERRATA: KNOB B IS THE NEW PANIC BUTTON',
  'ERRATA: WEAPONIZED POLITENESS MODE ENABLED',
  'ERRATA: DO NOT FEED AFTER MIDNIGHT (STILL TRUE)',
];

function buildPage(rand, pageNo){
  const name = `${pick(rand, ADJ)} ${pick(rand, NOUN)}`;
  const subtitle = pick(rand, PURPOSE);

  // parts callouts (positions in 0..1 paper space)
  const callouts = [];
  const k = 4 + ((rand() * 3) | 0);
  for (let i = 0; i < k; i++){
    const side = rand() < 0.5 ? 'L' : 'R';
    callouts.push({
      label: pick(rand, PARTS),
      side,
      // target point on device
      tx: 0.48 + (rand() * 0.30 - 0.15),
      ty: 0.42 + (rand() * 0.26 - 0.13),
      // label line anchor near margins
      lx: side === 'L' ? 0.10 + rand() * 0.10 : 0.80 + rand() * 0.10,
      ly: 0.28 + rand() * 0.36,
    });
  }

  const steps = [];
  const nSteps = 4 + ((rand() * 2) | 0);
  const pool = STEPS.slice();
  for (let i = 0; i < nSteps; i++){
    steps.push(pool.splice((rand() * pool.length) | 0, 1)[0]);
  }

  const warning = pick(rand, WARNINGS);

  // diagram spec
  const d = {
    w: 0.46 + rand() * 0.10,
    h: 0.26 + rand() * 0.10,
    knobs: 2 + ((rand() * 4) | 0),
    vents: 3 + ((rand() * 4) | 0),
  };

  const docId = `LM-${String((100 + ((rand() * 900) | 0))).padStart(3,'0')}-${String(pageNo).padStart(2,'0')}`;

  return { name, subtitle, callouts, steps, warning, d, docId };
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;

  let pageNo = 1;
  let page = null;
  let pageT = 0;
  let flipPlayed = false;
  let nextErrataAt = 0;
  let errataPulse = 0;
  let errataText = '';

  const PAGE_DUR = 60; // seconds
  const FLIP_DUR = 1.15;

  function nextPage(){
    pageNo++;
    pageT = 0;
    flipPlayed = false;
    page = buildPage(rand, pageNo);
    nextErrataAt = 14 + rand() * 26;
    errataPulse = 0;
    errataText = '';
  }

  function init({ width, height, dpr: dp }){
    w = width;
    h = height;
    dpr = dp || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.76));

    pageNo = 1;
    pageT = 0;
    flipPlayed = false;
    page = buildPage(rand, pageNo);
    nextErrataAt = 12 + rand() * 24;
    errataPulse = 0;
    errataText = '';
  }

  function onResize(width, height, dp){
    init({ width, height, dpr: dp });
  }

  function onAudioOn(){
    // no continuous ambience (keeps it crisp); we just play flip rustles.
    if (!audio.enabled) return;
    // tiny “ready” tick
    audio.beep({ freq: 520 + rand() * 80, dur: 0.025, gain: 0.02, type: 'square' });
  }

  function onAudioOff(){}

  function destroy(){}

  function update(dt){
    t += dt;
    pageT += dt;
    errataPulse = Math.max(0, errataPulse - dt * 0.55);

    if (pageT >= nextErrataAt && pageT < PAGE_DUR - 6){
      errataPulse = 1;
      errataText = pick(rand, ERRATA);
      nextErrataAt = PAGE_DUR + 99;
      if (audio.enabled){
        paperRustle(audio, rand, { gain: 0.04 });
        audio.beep({ freq: 140 + rand() * 45, dur: 0.06, gain: 0.017, type: 'sawtooth' });
      }
    }

    if (pageT >= PAGE_DUR && !flipPlayed){
      flipPlayed = true;
      if (audio.enabled){
        paperRustle(audio, rand, { gain: 0.05 });
        audio.beep({ freq: 210 + rand() * 60, dur: 0.03, gain: 0.012, type: 'triangle' });
      }
    }

    if (pageT >= PAGE_DUR + FLIP_DUR){
      nextPage();
    }
  }

  function drawPaperTexture(ctx, x, y, pw, ph){
    // subtle grain
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = 'rgba(20, 15, 8, 0.9)';
    const step = Math.max(10, Math.floor(Math.min(pw, ph) / 26));
    for (let yy = 0; yy < ph; yy += step){
      for (let xx = 0; xx < pw; xx += step){
        const hsh = (((xx * 73856093) ^ (yy * 19349663) ^ (pageNo * 83492791)) >>> 0);
        if ((hsh & 31) === 0) ctx.fillRect(x + xx + (hsh & 7), y + yy + ((hsh >>> 3) & 7), 1, 1);
      }
    }
    ctx.restore();

    // coffee-ring-ish circle, occasional
    if (((pageNo + (seed|0)) & 3) === 0){
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.strokeStyle = 'rgba(120, 85, 40, 0.65)';
      ctx.lineWidth = Math.max(1, 1.4 * dpr);
      const cx = x + pw * (0.18 + 0.12 * Math.sin(pageNo));
      const cy = y + ph * 0.82;
      const rr = Math.min(pw, ph) * 0.09;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha *= 0.6;
      ctx.beginPath();
      ctx.arc(cx + rr * 0.22, cy - rr * 0.12, rr * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawDiagram(ctx, x, y, ww, hh, spec){
    // device body
    const bodyW = ww * spec.w;
    const bodyH = hh * spec.h;
    const bx = x + ww * 0.52 - bodyW * 0.5;
    const by = y + hh * 0.38 - bodyH * 0.5;
    const br = Math.max(10, Math.floor(font * 0.7));

    ctx.save();
    ctx.fillStyle = 'rgba(15, 18, 22, 0.85)';
    ctx.strokeStyle = 'rgba(15, 18, 22, 0.95)';
    ctx.lineWidth = Math.max(1, 1.6 * dpr);
    roundRect(ctx, bx, by, bodyW, bodyH, br);
    ctx.fill();

    // inner panel
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(235, 230, 220, 0.06)';
    roundRect(ctx, bx + bodyW * 0.06, by + bodyH * 0.18, bodyW * 0.62, bodyH * 0.64, Math.max(8, br - 8));
    ctx.fill();

    // knobs
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(240, 235, 226, 0.65)';
    ctx.lineWidth = Math.max(1, 1.2 * dpr);
    for (let i = 0; i < spec.knobs; i++){
      const px = bx + bodyW * (0.15 + 0.62 * rand());
      const py = by + bodyH * (0.18 + 0.68 * rand());
      const r = Math.max(6, Math.floor(Math.min(bodyW, bodyH) * (0.05 + 0.015 * rand())));
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + r * 0.85, py - r * 0.25);
      ctx.stroke();
    }

    // vents
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(240, 235, 226, 0.45)';
    ctx.lineWidth = Math.max(1, 1.0 * dpr);
    for (let i = 0; i < spec.vents; i++){
      const vx = bx + bodyW * (0.72 + 0.20 * rand());
      const vy = by + bodyH * (0.22 + 0.62 * rand());
      const vw = bodyW * (0.10 + 0.06 * rand());
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(vx + vw, vy);
      ctx.stroke();
    }

    ctx.restore();

    return { bx, by, bodyW, bodyH };
  }

  function render(ctx){
    if (!page) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // desk background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0c0f13');
    bg.addColorStop(0.55, '#07090b');
    bg.addColorStop(1, '#030405');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // subtle vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const s = Math.min(w, h);
    const pw = Math.floor(s * 0.78);
    const ph = Math.floor(s * 0.92);
    const px = Math.floor(w * 0.5 - pw * 0.5);
    const py = Math.floor(h * 0.5 - ph * 0.5);

    const flipP = clamp((pageT - PAGE_DUR) / FLIP_DUR, 0, 1);

    // paper shadow
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    roundRect(ctx, px + 10, py + 12, pw, ph, Math.max(16, Math.floor(font * 1.15)));
    ctx.fill();
    ctx.restore();

    // paper (slight idle tilt)
    const tilt = (Math.sin(t * 0.07) * 0.006) * (1 - flipP);
    const lift = flipP * 6;

    ctx.save();
    ctx.translate(px + pw/2, py + ph/2 - lift);
    ctx.rotate(tilt);
    ctx.translate(-pw/2, -ph/2);

    // paper base
    const pr = Math.max(16, Math.floor(font * 1.15));
    ctx.save();
    ctx.fillStyle = '#f0eadf';
    ctx.strokeStyle = 'rgba(30, 20, 10, 0.18)';
    ctx.lineWidth = Math.max(1, 1.2 * dpr);
    roundRect(ctx, 0, 0, pw, ph, pr);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    drawPaperTexture(ctx, 0, 0, pw, ph);

    // header
    ctx.save();
    ctx.fillStyle = 'rgba(15, 12, 8, 0.92)';
    ctx.font = `${Math.floor(font * 1.04)}px ui-serif, Georgia, serif`;
    ctx.textBaseline = 'top';
    ctx.fillText('THE LOST INSTRUCTION MANUAL', Math.floor(pw * 0.07), Math.floor(ph * 0.06));

    ctx.globalAlpha = 0.72;
    ctx.font = `${Math.floor(font * 0.82)}px ui-serif, Georgia, serif`;
    ctx.fillText(page.docId, Math.floor(pw * 0.07), Math.floor(ph * 0.06 + font * 1.35));

    ctx.globalAlpha = 0.95;
    ctx.font = `${Math.floor(font * 1.32)}px ui-sans-serif, system-ui`;
    ctx.fillText(page.name, Math.floor(pw * 0.07), Math.floor(ph * 0.14));

    ctx.globalAlpha = 0.7;
    ctx.font = `${Math.floor(font * 0.90)}px ui-sans-serif, system-ui`;
    ctx.fillText(page.subtitle, Math.floor(pw * 0.07), Math.floor(ph * 0.14 + font * 1.5));
    ctx.restore();

    // diagram area
    const dx = Math.floor(pw * 0.07);
    const dy = Math.floor(ph * 0.26);
    const dw = Math.floor(pw * 0.86);
    const dh = Math.floor(ph * 0.36);

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(20, 16, 10, 0.05)';
    roundRect(ctx, dx, dy, dw, dh, Math.max(12, Math.floor(font * 0.8)));
    ctx.fill();
    ctx.restore();

    // draw device diagram
    const device = drawDiagram(ctx, dx, dy, dw, dh, page.d);

    // callouts
    ctx.save();
    ctx.strokeStyle = 'rgba(25, 18, 12, 0.58)';
    ctx.fillStyle = 'rgba(25, 18, 12, 0.88)';
    ctx.lineWidth = Math.max(1, 1.1 * dpr);
    ctx.font = `${Math.floor(small * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';

    for (const c of page.callouts){
      const tx = dx + dw * c.tx;
      const ty = dy + dh * c.ty;
      const lx = dx + dw * c.lx;
      const ly = dy + dh * c.ly;

      // leader line (two segments)
      const midx = (c.side === 'L') ? Math.min(tx - 20, (tx + lx) / 2) : Math.max(tx + 20, (tx + lx) / 2);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(midx, ty);
      ctx.lineTo(lx, ly);
      ctx.stroke();

      // target dot
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(15, 18, 22, 0.95)';
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(2.5, 3.2 * dpr), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // label box
      const pad = Math.floor(small * 0.5);
      const tw = ctx.measureText(c.label).width;
      const bw = Math.ceil(tw + pad * 2);
      const bh = Math.ceil(small * 1.3);
      const bx = c.side === 'L' ? (lx - bw) : lx;
      const by = ly - bh * 0.5;

      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(240, 235, 226, 0.85)';
      ctx.strokeStyle = 'rgba(20, 16, 10, 0.18)';
      roundRect(ctx, bx, by, bw, bh, Math.max(6, Math.floor(bh * 0.35)));
      ctx.fill();
      ctx.stroke();

      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(25, 18, 12, 0.88)';
      ctx.fillText(c.label, bx + pad, ly);
      ctx.restore();
    }
    ctx.restore();

    // steps
    const sx = Math.floor(pw * 0.07);
    const sy = Math.floor(ph * 0.65);

    ctx.save();
    ctx.fillStyle = 'rgba(15, 12, 8, 0.88)';
    ctx.font = `${Math.floor(font * 0.92)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('PROCEDURE', sx, sy);

    ctx.globalAlpha = 0.72;
    ctx.fillRect(sx, sy + Math.floor(font * 1.18), Math.floor(pw * 0.55), Math.max(1, 1.2 * dpr));

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(25, 18, 12, 0.86)';
    ctx.font = `${Math.floor(small * 1.02)}px ui-sans-serif, system-ui`;

    let yy = sy + Math.floor(font * 1.55);
    const lh = Math.floor(small * 1.45);
    for (let i = 0; i < page.steps.length; i++){
      const step = page.steps[i];
      ctx.fillText(`${i+1}.`, sx, yy);

      // wrap manually into ~55% width
      const wrapW = Math.floor(pw * 0.58);
      const words = step.split(' ');
      let line = '';
      let lx = sx + Math.floor(small * 2.2);
      let ly = yy;
      for (const w0 of words){
        const test = line ? (line + ' ' + w0) : w0;
        if (ctx.measureText(test).width > wrapW && line){
          ctx.fillText(line, lx, ly);
          ly += lh;
          line = w0;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, lx, ly);

      yy = ly + lh + Math.floor(small * 0.18);
      if (yy > ph * 0.86) break;
    }
    ctx.restore();

    // warning box
    const wx = Math.floor(pw * 0.66);
    const wy = Math.floor(ph * 0.68);
    const ww2 = Math.floor(pw * 0.27);
    const wh2 = Math.floor(ph * 0.23);

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(255, 230, 180, 0.55)';
    ctx.strokeStyle = 'rgba(120, 80, 30, 0.38)';
    ctx.lineWidth = Math.max(1, 1.1 * dpr);
    roundRect(ctx, wx, wy, ww2, wh2, Math.max(12, Math.floor(font * 0.85)));
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(65, 32, 12, 0.92)';
    ctx.font = `${Math.floor(font * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('WARNING', wx + Math.floor(font * 0.7), wy + Math.floor(font * 0.6));

    ctx.globalAlpha = 0.82;
    ctx.font = `${Math.floor(small * 0.98)}px ui-sans-serif, system-ui`;
    // wrap warning text
    const wrapW = ww2 - Math.floor(font * 1.4);
    const words = page.warning.split(' ');
    let line = '';
    let yy2 = wy + Math.floor(font * 2.0);
    const lh2 = Math.floor(small * 1.35);
    for (const w0 of words){
      const test = line ? (line + ' ' + w0) : w0;
      if (ctx.measureText(test).width > wrapW && line){
        ctx.fillText(line, wx + Math.floor(font * 0.7), yy2);
        yy2 += lh2;
        line = w0;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, wx + Math.floor(font * 0.7), yy2);

    ctx.restore();

    // footer
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(25, 18, 12, 0.74)';
    ctx.font = `${Math.floor(small * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`PAGE ${String(pageNo).padStart(2,'0')}  •  REV ${String(1 + (pageNo % 7)).padStart(2,'0')}`, Math.floor(pw * 0.07), Math.floor(ph * 0.96));

    const rem = Math.max(0, Math.ceil(PAGE_DUR - pageT));
    const right = `NEXT FLIP: ${String(rem).padStart(2,'0')}s`;
    const tw = ctx.measureText(right).width;
    ctx.fillText(right, Math.floor(pw * 0.93 - tw), Math.floor(ph * 0.96));
    ctx.restore();

    if (errataPulse > 0 && errataText) {
      const pulse = errataPulse * (0.45 + 0.55 * Math.sin(t * 12) ** 2);
      ctx.save();
      ctx.translate(pw * 0.72, ph * 0.26);
      ctx.rotate(-0.24);
      const fs = Math.max(11, Math.floor(font * 0.78));
      ctx.font = `700 ${fs}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      const pad = Math.floor(fs * 0.5);
      const tw = Math.ceil(ctx.measureText(errataText).width);
      const bw = tw + pad * 2;
      const bh = fs + pad * 1.5;
      ctx.globalAlpha = 0.9 * pulse;
      ctx.fillStyle = 'rgba(150, 12, 16, 0.16)';
      ctx.strokeStyle = 'rgba(190, 20, 28, 0.75)';
      ctx.lineWidth = Math.max(1, 1.4 * dpr);
      roundRect(ctx, -bw * 0.5, -bh * 0.5, bw, bh, Math.max(6, Math.floor(fs * 0.36)));
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(125, 14, 18, 0.95)';
      ctx.fillText(errataText, -tw * 0.5, fs * 0.35);
      ctx.restore();
    }

    // flip effect overlay
    if (flipP > 0){
      // right-side curl wedge
      const curlW = pw * (0.12 + 0.55 * flipP);
      const x0 = pw - curlW;
      ctx.save();
      ctx.globalAlpha = 0.85;
      const grad = ctx.createLinearGradient(x0, 0, pw, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.15)');
      grad.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(pw, 0);
      ctx.lineTo(pw, ph);
      ctx.lineTo(x0, ph);
      ctx.closePath();
      ctx.fill();

      // fold highlight line
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, 1.2 * dpr);
      ctx.beginPath();
      ctx.moveTo(x0 + 2, 0);
      ctx.lineTo(x0 - 10 * flipP, ph);
      ctx.stroke();

      // a faint "ghost" of the next page edge
      ctx.globalAlpha = 0.12 + 0.10 * flipP;
      ctx.fillStyle = '#f7f2ea';
      roundRect(ctx, x0 + 8, 10, curlW - 16, ph - 20, Math.max(10, pr - 6));
      ctx.fill();

      ctx.restore();
    }

    ctx.restore(); // paper transform

    // subtle broadcast noise dots
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const n = Math.floor(220 + 260 * (0.5 + 0.5 * Math.sin(t * 0.6)));
    for (let i = 0; i < n; i++){
      const x = (rand() * w) | 0;
      const y = (rand() * h) | 0;
      if (((x + y + i) & 7) === 0) ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
