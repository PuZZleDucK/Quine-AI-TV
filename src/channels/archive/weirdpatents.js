import { mulberry32, clamp } from '../../util/prng.js';

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

// Inspired-by / patent-flavoured oddities. Treat these as playful recreations,
// not an authoritative list of real historical patents.
const PATENTS = [
  {
    id: 'catwheel',
    title: 'Feline Exercise Apparatus',
    year: 1995,
    category: 'Pet / Fitness',
    why: [
      'A tiny treadmill, because the cat refuses your vibes.',
      'Includes "motivation beam" alignment marks.',
      'Claims improved household harmony (bold).',
    ],
    icon: 'cat',
  },
  {
    id: 'umbrellahat',
    title: 'Hands-Free Umbrella Hat',
    year: 1980,
    category: 'Apparel / Weather',
    why: [
      'Your head becomes the handle. Your dignity becomes optional.',
      'Wind stability achieved via "strategic wobble".',
      'Perfect for snacks, not for stealth.',
    ],
    icon: 'umbrella',
  },
  {
    id: 'anti-snore',
    title: 'Anti-Snore Nighttime Alarm Collar',
    year: 1962,
    category: 'Medical-ish',
    why: [
      'Detects "unwanted nocturnal acoustics".',
      'Responds with a gentle buzz (and a not-gentle relationship check).',
      'Sleep science by way of spite.',
    ],
    icon: 'moon',
  },
  {
    id: 'fishbike',
    title: 'Aquatic Bicycle Attachment',
    year: 1938,
    category: 'Transport',
    why: [
      'Turns your bike into a boat-ish contraption.',
      'Promises "improved glide"; delivers splash.',
      'Panic paddle sold separately.',
    ],
    icon: 'bike',
  },
  {
    id: 'clock-sandwich',
    title: 'Time-Indexed Sandwich Organizer',
    year: 1974,
    category: 'Kitchen / Logistics',
    why: [
      'A lunchbox with a clock face and compartments.',
      'Enables precision snacking down to the quarter-hour.',
      'Finally: bureaucracy, but edible.',
    ],
    icon: 'clock',
  },
  {
    id: 'self-stir',
    title: 'Self-Stirring Soup Vessel',
    year: 1917,
    category: 'Kitchen / Mechanical',
    why: [
      'A pot with an internal crank-and-paddle system.',
      'Designed for the cook who hates wrists.',
      'Also stirs your fears about cleaning it.',
    ],
    icon: 'pot',
  },
  {
    id: 'pocket-fan',
    title: 'Pocket-Sized Personal Gust Generator',
    year: 2004,
    category: 'Gadgets',
    why: [
      'A tiny fan with a serious marketing problem.',
      'Claims "portable microclimate" for commuters.',
      'In practice: wind, but opinionated.',
    ],
    icon: 'fan',
  },
  {
    id: 'desk-nap',
    title: 'Workplace Head-Support Hammock',
    year: 1991,
    category: 'Office / Ergonomics',
    why: [
      'A strap system that suspends your forehead.',
      'Reframes napping as "posture management".',
      'HR remains unconvinced.',
    ],
    icon: 'hammock',
  },
  {
    id: 'spaghetti-measure',
    title: 'Spaghetti Portion Calibrator',
    year: 1987,
    category: 'Kitchen / Measurement',
    why: [
      'A plate with holes labelled 1/2/3 servings.',
      'Finally, a standard for noodles you will ignore.',
      'Turns dinner into a compliance exercise.',
    ],
    icon: 'pasta',
  },
  {
    id: 'keyboard-saver',
    title: 'Crumb-Deflecting Keyboard Canopy',
    year: 2001,
    category: 'Computing / Snacks',
    why: [
      'A tiny roof for your keys.',
      'Solves the wrong problem, beautifully.',
      'Includes "drip channel" (ominous).',
    ],
    icon: 'keyboard',
  },
];

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;
  let font = 16;
  let small = 12;

  let current = null;
  let next = null;

  let cardT = 0;
  let cardDur = 14;
  let trans = 1; // 0..1

  // static paper specks
  let specks = [];

  let ambience = null;

  function chooseDifferent(prev){
    let p = pick(rand, PATENTS);
    if (!prev) return p;
    for (let i = 0; i < 6 && p.id === prev.id; i++) p = pick(rand, PATENTS);
    return p;
  }

  function newCard(){
    current = next || chooseDifferent(current);
    next = chooseDifferent(current);
    cardT = 0;
    cardDur = 12 + rand() * 10;
    trans = 0;

    if (audio.enabled){
      // stamp-ish blip
      const base = 220 + rand() * 40;
      audio.beep({ freq: base, dur: 0.06, gain: 0.03, type: 'square' });
      audio.beep({ freq: base * 2.1, dur: 0.02, gain: 0.015, type: 'triangle' });
    }
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    // deterministic specks (so it doesn't shimmer)
    specks = [];
    const n = Math.floor((w * h) / 18_000);
    for (let i = 0; i < n; i++){
      specks.push({
        x: rand() * w,
        y: rand() * h,
        r: 0.5 + rand() * 1.6,
        a: 0.02 + rand() * 0.06,
      });
    }

    current = chooseDifferent(null);
    next = chooseDifferent(current);
    newCard();
    trans = 1;
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type: 'pink', gain: 0.0045 });
    n.start();
    ambience = { stop(){ n.stop(); } };
    audio.setCurrent(ambience);
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

    // transition in for the first second
    trans = clamp(trans + dt * 1.15, 0, 1);

    if (cardT >= cardDur){
      // advance
      current = next;
      next = chooseDifferent(current);
      cardT = 0;
      cardDur = 12 + rand() * 10;
      trans = 0;

      if (audio.enabled){
        const base = 220 + rand() * 40;
        audio.beep({ freq: base, dur: 0.06, gain: 0.03, type: 'square' });
        audio.beep({ freq: base * 2.1, dur: 0.02, gain: 0.015, type: 'triangle' });
      }
    }
  }

  function roundRect(ctx, x, y, ww, hh, r){
    const rr = Math.min(r, ww / 2, hh / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
    ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
    ctx.arcTo(x, y + hh, x, y, rr);
    ctx.arcTo(x, y, x + ww, y, rr);
    ctx.closePath();
  }

  function drawIcon(ctx, kind, x, y, s){
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.05));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const stroke = 'rgba(20,24,30,0.88)';
    ctx.strokeStyle = stroke;

    if (kind === 'cat'){
      // cat head + wheel
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.16, -s * 0.02);
      ctx.quadraticCurveTo(-s * 0.05, -s * 0.18, 0, -s * 0.02);
      ctx.quadraticCurveTo(s * 0.05, -s * 0.18, s * 0.16, -s * 0.02);
      ctx.stroke();
      // ears
      ctx.beginPath();
      ctx.moveTo(-s * 0.10, -s * 0.08);
      ctx.lineTo(-s * 0.18, -s * 0.20);
      ctx.lineTo(-s * 0.06, -s * 0.16);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.10, -s * 0.08);
      ctx.lineTo(s * 0.18, -s * 0.20);
      ctx.lineTo(s * 0.06, -s * 0.16);
      ctx.closePath();
      ctx.stroke();
    } else if (kind === 'umbrella'){
      // hat brim
      ctx.beginPath();
      ctx.ellipse(0, s * 0.14, s * 0.34, s * 0.10, 0, 0, Math.PI * 2);
      ctx.stroke();
      // cap
      ctx.beginPath();
      ctx.moveTo(-s * 0.22, s * 0.14);
      ctx.quadraticCurveTo(0, -s * 0.18, s * 0.22, s * 0.14);
      ctx.stroke();
      // umbrella
      ctx.beginPath();
      ctx.moveTo(-s * 0.36, -s * 0.10);
      ctx.quadraticCurveTo(0, -s * 0.38, s * 0.36, -s * 0.10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.36);
      ctx.lineTo(0, s * 0.02);
      ctx.stroke();
    } else if (kind === 'moon'){
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.30, -0.6, Math.PI + 0.6);
      ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(s * 0.10, -s * 0.06, s * 0.26, -0.4, Math.PI + 0.4);
      ctx.stroke();
    } else if (kind === 'bike'){
      // wheels
      ctx.beginPath();
      ctx.arc(-s * 0.20, s * 0.12, s * 0.16, 0, Math.PI * 2);
      ctx.arc(s * 0.22, s * 0.12, s * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      // frame
      ctx.beginPath();
      ctx.moveTo(-s * 0.20, s * 0.12);
      ctx.lineTo(0, -s * 0.06);
      ctx.lineTo(s * 0.22, s * 0.12);
      ctx.lineTo(0, s * 0.12);
      ctx.closePath();
      ctx.stroke();
      // paddle
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, s * 0.30);
      ctx.lineTo(s * 0.30, s * 0.30);
      ctx.stroke();
    } else if (kind === 'clock'){
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -s * 0.14);
      ctx.moveTo(0, 0);
      ctx.lineTo(s * 0.12, s * 0.06);
      ctx.stroke();
      // sandwich-ish layers
      ctx.beginPath();
      ctx.moveTo(-s * 0.26, s * 0.34);
      ctx.lineTo(s * 0.26, s * 0.34);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.22, s * 0.42);
      ctx.lineTo(s * 0.22, s * 0.42);
      ctx.stroke();
    } else if (kind === 'pot'){
      ctx.beginPath();
      roundRect(ctx, -s * 0.28, -s * 0.10, s * 0.56, s * 0.34, s * 0.10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.22, -s * 0.12);
      ctx.lineTo(s * 0.22, -s * 0.12);
      ctx.stroke();
      // handle
      ctx.beginPath();
      ctx.arc(0, -s * 0.16, s * 0.08, Math.PI, 0);
      ctx.stroke();
      // spoon
      ctx.beginPath();
      ctx.ellipse(s * 0.18, s * 0.04, s * 0.06, s * 0.08, 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.12, s * 0.04);
      ctx.lineTo(-s * 0.10, s * 0.18);
      ctx.stroke();
    } else if (kind === 'fan'){
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 3; i++){
        const a = i * (Math.PI * 2 / 3);
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * s * 0.14, Math.sin(a) * s * 0.14, s * 0.18, s * 0.08, a, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, s * 0.08);
      ctx.lineTo(0, s * 0.34);
      ctx.stroke();
    } else if (kind === 'hammock'){
      ctx.beginPath();
      ctx.moveTo(-s * 0.30, -s * 0.04);
      ctx.quadraticCurveTo(0, s * 0.22, s * 0.30, -s * 0.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.36, -s * 0.20);
      ctx.lineTo(-s * 0.30, -s * 0.04);
      ctx.moveTo(s * 0.36, -s * 0.20);
      ctx.lineTo(s * 0.30, -s * 0.04);
      ctx.stroke();
      // head
      ctx.beginPath();
      ctx.arc(0, -s * 0.10, s * 0.10, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === 'pasta'){
      // spaghetti bundle + measuring holes
      ctx.beginPath();
      for (let i = -2; i <= 2; i++){
        ctx.moveTo(i * s * 0.06, -s * 0.26);
        ctx.lineTo(i * s * 0.06, s * 0.26);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-s * 0.22, s * 0.24, s * 0.06, 0, Math.PI * 2);
      ctx.arc(0, s * 0.24, s * 0.08, 0, Math.PI * 2);
      ctx.arc(s * 0.22, s * 0.24, s * 0.10, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === 'keyboard'){
      roundRect(ctx, -s * 0.34, -s * 0.14, s * 0.68, s * 0.34, s * 0.08);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.30, -s * 0.02);
      ctx.lineTo(s * 0.30, -s * 0.02);
      ctx.stroke();
      // canopy
      ctx.beginPath();
      ctx.moveTo(-s * 0.36, -s * 0.18);
      ctx.lineTo(s * 0.36, -s * 0.18);
      ctx.lineTo(s * 0.26, -s * 0.32);
      ctx.lineTo(-s * 0.26, -s * 0.32);
      ctx.closePath();
      ctx.stroke();
    } else {
      // fallback: a simple badge
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.14, 0);
      ctx.lineTo(s * 0.14, 0);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBackground(ctx){
    // archive-room / paper vibe
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a1018');
    bg.addColorStop(0.55, '#070c12');
    bg.addColorStop(1, '#05070c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // soft vignette
    const vg = ctx.createRadialGradient(w * 0.52, h * 0.35, 0, w * 0.52, h * 0.35, Math.max(w, h) * 0.7);
    vg.addColorStop(0, 'rgba(255,255,255,0.05)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // specks
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,1)';
    for (const s of specks){
      ctx.globalAlpha = s.a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // subtle shelf lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++){
      const y = h * (0.18 + i * 0.12);
      ctx.beginPath();
      ctx.moveTo(w * 0.06, y);
      ctx.lineTo(w * 0.94, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCard(ctx, patent, { alpha = 1, dx = 0 } = {}){
    const cw = Math.min(w * 0.82, 980);
    const ch = Math.min(h * 0.74, 760);
    const x = (w - cw) / 2 + dx;
    const y = (h - ch) / 2;

    ctx.save();
    ctx.globalAlpha = alpha;

    // shadow
    ctx.save();
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x + 10, y + 12, cw, ch, 22);
    ctx.fill();
    ctx.restore();

    // paper
    const paper = ctx.createLinearGradient(x, y, x + cw, y + ch);
    paper.addColorStop(0, 'rgba(241, 238, 228, 0.98)');
    paper.addColorStop(1, 'rgba(214, 206, 190, 0.98)');
    ctx.fillStyle = paper;
    roundRect(ctx, x, y, cw, ch, 22);
    ctx.fill();

    // border
    ctx.strokeStyle = 'rgba(30, 34, 44, 0.45)';
    ctx.lineWidth = Math.max(2, Math.floor(font * 0.12));
    roundRect(ctx, x, y, cw, ch, 22);
    ctx.stroke();

    const pad = Math.floor(font * 1.2);

    // header strip
    ctx.save();
    ctx.fillStyle = 'rgba(20, 24, 30, 0.10)';
    roundRect(ctx, x + pad * 0.6, y + pad * 0.65, cw - pad * 1.2, Math.floor(font * 2.1), 14);
    ctx.fill();
    ctx.restore();

    // header text
    ctx.fillStyle = 'rgba(18, 22, 28, 0.86)';
    ctx.font = `${Math.floor(small * 1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('PATENT ARCHIVE // RECREATION', x + pad, y + pad * 1.6);

    ctx.fillStyle = 'rgba(18, 22, 28, 0.68)';
    ctx.fillText(`FILED: ${patent.year}    CATEGORY: ${patent.category.toUpperCase()}`, x + pad, y + pad * 2.55);

    // icon badge
    const iconS = Math.floor(Math.min(cw, ch) * 0.14);
    const ix = x + cw - pad - iconS * 0.65;
    const iy = y + pad * 2.1;

    ctx.save();
    ctx.globalAlpha *= 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(ix, iy, iconS * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawIcon(ctx, patent.icon, ix, iy, iconS);

    // title
    ctx.fillStyle = 'rgba(10, 12, 16, 0.92)';
    ctx.font = `600 ${Math.floor(font * 1.55)}px ui-sans-serif, system-ui, -apple-system, Segoe UI`;
    wrapText(ctx, patent.title, x + pad, y + pad * 3.7, cw - pad * 2, Math.floor(font * 1.85));

    // divider
    const divY = y + ch * 0.48;
    ctx.save();
    ctx.strokeStyle = 'rgba(20, 24, 30, 0.20)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + pad, divY);
    ctx.lineTo(x + cw - pad, divY);
    ctx.stroke();
    ctx.restore();

    // why it's weird
    ctx.fillStyle = 'rgba(10, 12, 16, 0.78)';
    ctx.font = `600 ${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.fillText("WHY IT'S WEIRD:", x + pad, divY + pad * 0.95);

    ctx.font = `${Math.floor(font * 1.02)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(10, 12, 16, 0.80)';
    const lineH = Math.floor(font * 1.55);
    let yy = divY + pad * 1.7;
    for (const line of patent.why){
      ctx.fillText('• ' + line, x + pad, yy);
      yy += lineH;
    }

    // footer stamp
    const stamp = "PUBLIC ARCHIVE";
    ctx.save();
    ctx.translate(x + cw - pad * 1.1, y + ch - pad * 0.9);
    ctx.rotate(-0.10 + Math.sin(t * 0.4) * 0.01);
    ctx.strokeStyle = 'rgba(180, 38, 62, 0.55)';
    ctx.lineWidth = 3;
    ctx.font = `700 ${Math.floor(font * 1.0)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const m = ctx.measureText(stamp);
    roundRect(ctx, -m.width - 18, -Math.floor(font * 0.95), m.width + 36, Math.floor(font * 1.35), 12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(180, 38, 62, 0.10)';
    ctx.fill();
    ctx.fillStyle = 'rgba(140, 18, 40, 0.62)';
    ctx.fillText(stamp, -m.width - 0, 0);
    ctx.restore();

    ctx.restore();
  }

  function wrapText(ctx, text, x, y, maxW, lineH){
    const words = String(text).split(/\s+/g);
    let line = '';
    let yy = y;
    for (let i = 0; i < words.length; i++){
      const test = line ? (line + ' ' + words[i]) : words[i];
      if (ctx.measureText(test).width > maxW && line){
        ctx.fillText(line, x, yy);
        line = words[i];
        yy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);

    // crossfade / slide-in
    const slide = (1 - trans);
    const dx = slide * (w * 0.06);

    // previous peek (gives motion depth)
    if (next && trans < 1){
      drawCard(ctx, next, { alpha: 0.18 * (1 - trans), dx: -dx * 0.7 });
    }

    drawCard(ctx, current, { alpha: 1, dx: dx });

    // channel label
    ctx.save();
    ctx.fillStyle = 'rgba(231,238,246,0.75)';
    ctx.font = `${Math.floor(h / 28)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText("HISTORY'S WEIRD PATENTS", w * 0.05, h * 0.12);
    ctx.fillStyle = 'rgba(231,238,246,0.52)';
    ctx.font = `${Math.floor(h / 36)}px ui-sans-serif, system-ui`;
    ctx.fillText('Bizarre invention dossiers, lovingly reimagined.', w * 0.05, h * 0.16);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
