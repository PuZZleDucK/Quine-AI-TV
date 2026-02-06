import { mulberry32 } from '../util/prng.js';

const TOOLS = [
  {
    id: 'binderclip',
    name: 'Binder Clip',
    icon: 'clip',
    uses: [
      'Cable tidy for charging cords',
      'Keep snack bags closed',
      'Bookmark that doesn’t fall out',
      'Phone stand (two clips + a card)',
      'Keyring quick-clip (light duty)',
      'Hang small art on string lights',
      'Clamp fabric for quick hemming',
      'Hold a razor on the shower shelf',
      'Keep toothpaste from sliding off the sink',
      'Desk note holder for reminders',
    ]
  },
  {
    id: 'ducttape',
    name: 'Duct Tape',
    icon: 'tape',
    uses: [
      'Patch a torn tarp (temporary)',
      'Label things (write on it)',
      'Lint roller in a pinch',
      'Bundle sticks for kindling',
      'Reinforce a cardboard box seam',
      'Anti-slip grip on a tool handle',
      'Emergency shoelace tip wrap',
      'Mark hazards on the floor (high contrast)',
      'Wrap a cracked phone case edge',
      'Seal a leaky air vent (very temporary)',
    ]
  },
  {
    id: 'spoon',
    name: 'Spoon',
    icon: 'spoon',
    uses: [
      'Measure small amounts (roughly)',
      'Scrape labels off jars',
      'Open a paint can (gently)',
      'Press garlic without a press',
      'Shape cookies into neat circles',
      'Planting tool for seedlings',
      'Back-of-the-spoon frosting swirl',
      'Scoop loose screws from a deep drawer',
      'Test soup seasoning like a chef',
      'Tap-tap for locating studs (poorly)',
    ]
  },
  {
    id: 'ziplock',
    name: 'Zip Bag',
    icon: 'bag',
    uses: [
      'Mini freezer organisation',
      'Protect your phone in rain',
      'DIY piping bag for icing',
      'Keep batteries from shorting',
      'Store small lego / bits safely',
      'Marinate food with less mess',
      'Carry a wet swimsuit home',
      'Ice pack (ice + water + towel)',
      'Collect screws during repairs',
      'Make a mini trash bag for the car',
    ]
  },
  {
    id: 'twisttie',
    name: 'Twist Tie',
    icon: 'tie',
    uses: [
      'Cable tie (reusable)',
      'Label cords (wrap a tag)',
      'Close bread bags properly',
      'Train a plant to a stake',
      'Hold a loose zipper pull',
      'Keep earbud tangles under control',
      'Bundle pens for travel',
      'Fix a wobbly glasses arm (temp)',
      'Hang a lightweight ornament',
      'Attach notes to a gift',
    ]
  },
];

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;
  let font = 16;
  let small = 12;

  let tool = null;
  let toolT = 0;

  let idx = 0; // which use is highlighted
  let stepT = 0;

  let clickCooldown = 0;

  function nextTool(){
    tool = pick(rand, TOOLS);
    toolT = 22 + rand() * 10;
    idx = 0;
    stepT = 1.2 + rand() * 0.5;
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));
    nextTool();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    // no continuous loop for this channel; keep it quiet except for tiny clicks
  }

  function onAudioOff(){
    // nothing
  }

  function destroy(){
    onAudioOff();
  }

  function click(){
    if (!audio.enabled) return;
    if (clickCooldown > 0) return;
    clickCooldown = 0.09;
    const f = 820 + rand() * 180;
    audio.beep({ freq: f, dur: 0.012, gain: 0.015, type: 'square' });
  }

  function update(dt){
    t += dt;
    toolT -= dt;
    stepT -= dt;
    clickCooldown -= dt;

    if (toolT <= 0){
      nextTool();
      return;
    }

    if (stepT <= 0){
      stepT = 1.25 + rand() * 0.7;
      idx = (idx + 1) % 10;
      click();
      // after one full cycle of 10 uses, often jump to a new tool
      if (idx === 0 && rand() < 0.55){
        nextTool();
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

  function drawToolIcon(ctx, kind, x, y, s){
    // simple blueprint-ish line icons
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.045));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (kind === 'clip'){
      // binder clip silhouette
      ctx.beginPath();
      roundRect(ctx, -s * 0.36, -s * 0.25, s * 0.72, s * 0.55, s * 0.12);
      ctx.stroke();
      // handles
      ctx.beginPath();
      ctx.moveTo(-s * 0.18, -s * 0.25);
      ctx.lineTo(-s * 0.34, -s * 0.52);
      ctx.lineTo(-s * 0.18, -s * 0.62);
      ctx.moveTo(s * 0.18, -s * 0.25);
      ctx.lineTo(s * 0.34, -s * 0.52);
      ctx.lineTo(s * 0.18, -s * 0.62);
      ctx.stroke();
    } else if (kind === 'tape'){
      // tape roll
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.33, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2);
      ctx.stroke();
      // tail
      ctx.beginPath();
      ctx.moveTo(s * 0.12, s * 0.24);
      ctx.lineTo(s * 0.58, s * 0.44);
      ctx.lineTo(s * 0.52, s * 0.62);
      ctx.lineTo(s * 0.06, s * 0.42);
      ctx.closePath();
      ctx.stroke();
    } else if (kind === 'spoon'){
      // spoon
      ctx.beginPath();
      ctx.ellipse(-s * 0.08, -s * 0.08, s * 0.18, s * 0.24, -0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.06, 0);
      ctx.quadraticCurveTo(s * 0.34, s * 0.08, s * 0.52, s * 0.32);
      ctx.stroke();
    } else if (kind === 'bag'){
      ctx.beginPath();
      roundRect(ctx, -s * 0.34, -s * 0.38, s * 0.68, s * 0.78, s * 0.08);
      ctx.stroke();
      // zip
      ctx.beginPath();
      ctx.moveTo(-s * 0.30, -s * 0.24);
      ctx.lineTo(s * 0.30, -s * 0.24);
      ctx.stroke();
      // little zip tab
      ctx.beginPath();
      ctx.moveTo(s * 0.12, -s * 0.24);
      ctx.lineTo(s * 0.12, -s * 0.18);
      ctx.stroke();
    } else {
      // twist tie
      ctx.beginPath();
      for (let i = 0; i < 14; i++){
        const u = i / 13;
        const xx = (u - 0.5) * s * 0.82;
        const yy = Math.sin(u * Math.PI * 4) * s * 0.10;
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      // ends
      ctx.beginPath();
      ctx.moveTo(-s * 0.44, 0);
      ctx.lineTo(-s * 0.56, -s * 0.08);
      ctx.moveTo(s * 0.44, 0);
      ctx.lineTo(s * 0.56, s * 0.08);
      ctx.stroke();
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // blueprint background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#06101d');
    bg.addColorStop(1, '#02060d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // grid
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(108,242,255,0.55)';
    ctx.lineWidth = 1;
    const step = Math.max(26, Math.floor(Math.min(w, h) / 18));
    const ox = (t * 12) % step;
    const oy = (t * 9) % step;
    for (let x = -ox; x < w; x += step){
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = -oy; y < h; y += step){
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    // header
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, Math.floor(h * 0.06), w, Math.floor(h * 0.11));
    ctx.fillStyle = 'rgba(108,242,255,0.85)';
    ctx.fillRect(0, Math.floor(h * 0.17), w, 2);
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.1)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('ONE TOOL, TEN USES', Math.floor(w * 0.05), Math.floor(h * 0.105));

    ctx.font = `${Math.floor(font * 0.92)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.fillText(tool?.name || '—', Math.floor(w * 0.05), Math.floor(h * 0.145));
    ctx.restore();

    // layout: icon card left, list card right
    const pad = Math.floor(w * 0.06);
    const top = Math.floor(h * 0.24);
    const cardH = Math.floor(h * 0.62);

    const leftW = Math.floor(w * 0.36);
    const rightW = Math.floor(w * 0.52);

    const lx = pad;
    const rx = w - pad - rightW;

    const r = Math.max(12, Math.floor(font * 0.9));

    // cards
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, lx + 6, top + 8, leftW, cardH, r);
    ctx.fill();
    roundRect(ctx, rx + 6, top + 8, rightW, cardH, r);
    ctx.fill();

    ctx.fillStyle = 'rgba(18, 26, 36, 0.88)';
    roundRect(ctx, lx, top, leftW, cardH, r);
    ctx.fill();
    roundRect(ctx, rx, top, rightW, cardH, r);
    ctx.fill();

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(108,242,255,0.85)';
    ctx.fillRect(lx, top + Math.floor(font * 1.55), leftW, 2);
    ctx.fillRect(rx, top + Math.floor(font * 1.55), rightW, 2);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 0.95)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('The Tool', lx + Math.floor(font * 0.8), top + Math.floor(font * 0.5));
    ctx.fillText('Ten Uses', rx + Math.floor(font * 0.8), top + Math.floor(font * 0.5));
    ctx.restore();

    // icon
    const cx = lx + leftW * 0.5;
    const cy = top + cardH * 0.55;
    const size = Math.min(leftW, cardH) * 0.62;

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.strokeStyle = 'rgba(108,242,255,0.9)';
    ctx.shadowColor = 'rgba(108,242,255,0.25)';
    ctx.shadowBlur = Math.floor(font * 1.0);
    const wob = Math.sin(t * 1.2) * 0.02;
    ctx.translate(cx, cy);
    ctx.rotate(wob);
    drawToolIcon(ctx, tool?.icon || 'tie', 0, 0, size);
    ctx.restore();

    // list
    const listX = rx + Math.floor(font * 0.8);
    const listY = top + Math.floor(font * 2.25);
    const lineH = Math.floor(small * 1.25);

    ctx.save();
    ctx.font = `${small}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';

    // highlight bar
    const hy = listY + idx * lineH - 2;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = 'rgba(108,242,255,1)';
    ctx.fillRect(rx + 8, hy, rightW - 16, lineH);

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    const uses = tool?.uses || [];
    for (let i = 0; i < 10; i++){
      const num = String(i + 1).padStart(2, '0');
      const yy = listY + i * lineH;
      const active = i === idx;
      ctx.fillStyle = active ? 'rgba(231,238,246,0.92)' : 'rgba(231,238,246,0.70)';
      ctx.fillText(`${num}. ${uses[i] || ''}`, listX, yy);
    }
    ctx.restore();

    // footer hint
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, Math.floor(h * 0.92), w, Math.floor(h * 0.08));
    ctx.fillStyle = 'rgba(231,238,246,0.7)';
    ctx.font = `${Math.floor(h / 36)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('rapid-fire practical hacks • low stakes • maximum reuse', Math.floor(w * 0.05), Math.floor(h * 0.96));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
