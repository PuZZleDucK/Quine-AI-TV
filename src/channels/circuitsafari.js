import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const SPECIMENS = [
  {
    id: 'charger',
    title: 'Laptop Charger Habitat',
    subtitle: 'Switch-mode converter plains',
    segments: [
      { kind: 'connector', label: 'input', text: 'A wall-born AC current enters the enclosure… somewhat reluctantly.' },
      { kind: 'ic', label: 'controller', text: 'A tiny controller IC does the thinking: switching, sensing, regulating.' },
      { kind: 'inductor', label: 'inductor', text: 'The inductor stores energy like a spring; release it in neat pulses.' },
      { kind: 'capacitor', label: 'capacitor', text: 'Capacitors smooth the ripples. Quiet, reliable, under-appreciated.' },
    ],
  },
  {
    id: 'speaker',
    title: 'Bluetooth Speaker Reef',
    subtitle: 'Audio currents and tiny power amp predators',
    segments: [
      { kind: 'ic', label: 'codec', text: 'Signals arrive compressed; a codec IC unpacks them into sound.' },
      { kind: 'resistor', label: 'bias network', text: 'Resistors set the rules: bias, limits, and polite boundaries.' },
      { kind: 'capacitor', label: 'coupling', text: 'Coupling caps let music pass while blocking DC grumpiness.' },
      { kind: 'led', label: 'status', text: 'A status LED signals mood changes: pairing, charging, drama.' },
    ],
  },
  {
    id: 'controller',
    title: 'Game Controller Grove',
    subtitle: 'Buttons, debouncing, and the dawn chorus of interrupts',
    segments: [
      { kind: 'connector', label: 'usb', text: 'The USB connector: a watering hole where data comes to drink.' },
      { kind: 'ic', label: 'microcontroller', text: 'A microcontroller reads button calls and translates them to intent.' },
      { kind: 'resistor', label: 'pull-up', text: 'Pull-up resistors keep signals from floating off into the void.' },
      { kind: 'diode', label: 'protection', text: 'Protection diodes: tiny shields against the lightning of ESD.' },
    ],
  },
  {
    id: 'bulb',
    title: 'Smart Bulb Canopy',
    subtitle: 'LED drivers under filtered shade',
    segments: [
      { kind: 'inductor', label: 'driver coil', text: 'A driver inductor meters power to LEDs without burning the forest.' },
      { kind: 'ic', label: 'wireless', text: 'The wireless chip listens for spells: on, off, warm, cool.' },
      { kind: 'capacitor', label: 'bulk cap', text: 'A bulk capacitor rides out brownouts like a seasoned ranger.' },
      { kind: 'led', label: 'emitters', text: 'LEDs glow when electrons relax—an oddly poetic physics trick.' },
    ],
  },
];

function buildBoard(rand){
  // normalized board-space geometry; render maps it to pixels.
  const nodes = [];
  const N = 20 + ((rand() * 10) | 0);
  for (let i = 0; i < N; i++){
    nodes.push({ x: 0.08 + rand() * 0.84, y: 0.1 + rand() * 0.8 });
  }

  const edges = [];
  const E = N + 10 + ((rand() * 12) | 0);
  for (let i = 0; i < E; i++){
    const a = (rand() * N) | 0;
    let b = (rand() * N) | 0;
    if (b === a) b = (b + 1) % N;
    edges.push({ a, b });
  }

  const components = [];
  function add(kind, x, y, s=1){
    components.push({
      kind,
      x, y,
      rot: (rand() * Math.PI * 2),
      s,
      hue: 140 + rand() * 30,
    });
  }

  // place some canonical components in stable-ish positions.
  add('connector', 0.12, 0.55, 1.15);
  add('ic', 0.55, 0.46, 1.25);
  add('inductor', 0.72, 0.62, 1.25);
  add('capacitor', 0.32, 0.68, 1.1);
  add('resistor', 0.42, 0.30, 1.0);
  add('diode', 0.78, 0.34, 1.0);
  add('led', 0.86, 0.70, 1.0);

  // sprinkle extra passives
  const extra = 6 + ((rand() * 8) | 0);
  const kinds = ['resistor', 'capacitor', 'diode'];
  for (let i = 0; i < extra; i++){
    add(pick(rand, kinds), 0.12 + rand() * 0.76, 0.18 + rand() * 0.64, 0.7 + rand() * 0.5);
  }

  return { nodes, edges, components };
}

function drawComponent(ctx, kind, x, y, s, rot, ink, accent){
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);

  ctx.globalAlpha = 0.92;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (kind === 'resistor'){
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(-26, 0); ctx.lineTo(-14, 0);
    ctx.moveTo(14, 0); ctx.lineTo(26, 0);
    ctx.stroke();

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -14, -7, 28, 14, 6);
    ctx.fill();

    ctx.fillStyle = accent;
    roundRect(ctx, -12, -6, 24, 12, 6);
    ctx.fill();

    // stripes
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (let i = -8; i <= 8; i += 6){
      ctx.fillRect(i, -6, 2, 12);
    }
  } else if (kind === 'capacitor'){
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(-26, 0); ctx.lineTo(-10, 0);
    ctx.moveTo(10, 0); ctx.lineTo(26, 0);
    ctx.stroke();

    ctx.globalAlpha = 0.88;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-10, -10); ctx.lineTo(-10, 10);
    ctx.moveTo(10, -10); ctx.lineTo(10, 10);
    ctx.stroke();
  } else if (kind === 'ic'){
    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    roundRect(ctx, -22, -16, 44, 32, 10);
    ctx.fill();

    ctx.fillStyle = 'rgba(25, 35, 45, 0.95)';
    roundRect(ctx, -20, -14, 40, 28, 10);
    ctx.fill();

    // pins
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    for (let i = -12; i <= 12; i += 6){
      ctx.beginPath();
      ctx.moveTo(-24, i); ctx.lineTo(-30, i);
      ctx.moveTo(24, i); ctx.lineTo(30, i);
      ctx.stroke();
    }

    // notch
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(-10, -8, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'inductor'){
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-28, 0); ctx.lineTo(-18, 0);
    ctx.moveTo(18, 0); ctx.lineTo(28, 0);
    ctx.stroke();

    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    for (let i = -12; i <= 12; i += 6){
      ctx.beginPath();
      ctx.arc(i, 0, 6, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  } else if (kind === 'diode'){
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(-26, 0); ctx.lineTo(-10, 0);
    ctx.moveTo(10, 0); ctx.lineTo(26, 0);
    ctx.stroke();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(10, 0);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(10, -10); ctx.lineTo(10, 10);
    ctx.stroke();
  } else if (kind === 'led'){
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(-20, 12); ctx.lineTo(-10, 0);
    ctx.lineTo(0, 12);
    ctx.stroke();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, -2, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-4, -6, 5.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'connector'){
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, -26, -14, 52, 28, 8);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(40, 55, 70, 0.9)';
    roundRect(ctx, -24, -12, 48, 24, 8);
    ctx.fill();

    ctx.globalAlpha = 0.8;
    ctx.fillStyle = accent;
    for (let i = -16; i <= 16; i += 8){
      roundRect(ctx, i - 3, -6, 6, 12, 3);
      ctx.fill();
    }
  }

  ctx.restore();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;
  let font = 16;
  let small = 12;
  let dpr = 1;

  let specimen = null;
  let segmentIndex = 0;
  let segmentT = 0;

  let board = null;
  let ambience = null;

  // pacing
  const SEG_MIN = 6.5;
  const SEG_MAX = 10.5;
  let segDur = 8;

  function chooseSpecimen(){
    // avoid immediate repeats without tracking too much state
    const s = pick(rand, SPECIMENS);
    return s;
  }

  function setSegmentDuration(){
    segDur = SEG_MIN + rand() * (SEG_MAX - SEG_MIN);
  }

  function chirp(strength = 1){
    if (!audio.enabled) return;
    const base = 820 + rand() * 520;
    const gain = 0.018 + 0.018 * clamp(strength, 0, 1);
    audio.beep({ freq: base, dur: 0.03, gain, type: 'triangle' });
    audio.beep({ freq: base * (1.18 + rand() * 0.12), dur: 0.02, gain: gain * 0.75, type: 'sine' });
  }

  function nextSegment(){
    segmentIndex++;
    segmentT = 0;
    setSegmentDuration();
    chirp(0.7);

    if (!specimen) return;
    if (segmentIndex >= specimen.segments.length){
      segmentIndex = 0;
      specimen = chooseSpecimen();
      board = buildBoard(rand);
      chirp(1);
    }
  }

  function init({ width, height, dpr: dp }){
    w = width;
    h = height;
    dpr = dp || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    specimen = chooseSpecimen();
    board = buildBoard(rand);
    segmentIndex = 0;
    segmentT = 0;
    setSegmentDuration();
  }

  function onResize(width, height, dp){
    init({ width, height, dpr: dp });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const hiss = audio.noiseSource({ type: 'pink', gain: 0.0045 });
    hiss.start();
    const dr = simpleDrone(audio, { root: 92 + rand() * 30, detune: 0.8, gain: 0.045 });
    ambience = {
      stop(){
        try { hiss.stop(); } catch {}
        try { dr.stop(); } catch {}
      }
    };
    audio.setCurrent(ambience);
    chirp(0.6);
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
    segmentT += dt;

    if (segmentT >= segDur){
      nextSegment();
    }

    // occasional tiny "radio" bleep
    if (audio.enabled && rand() < dt * 0.06){
      const f = 1200 + rand() * 900;
      audio.beep({ freq: f, dur: 0.012, gain: 0.008, type: 'square' });
    }
  }

  function render(ctx){
    if (!board) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // background: lab-dark + soft vignette
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.35, 10, w * 0.5, h * 0.35, Math.max(w, h) * 0.85);
    bg.addColorStop(0, '#10161f');
    bg.addColorStop(0.55, '#070b10');
    bg.addColorStop(1, '#020306');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const driftX = Math.sin(t * 0.18) * w * 0.02;
    const driftY = Math.cos(t * 0.14) * h * 0.016;

    // board placement
    const bw = Math.floor(w * 0.72);
    const bh = Math.floor(h * 0.58);
    const bx = Math.floor((w - bw) / 2 + driftX);
    const by = Math.floor(h * 0.2 + driftY);
    const br = Math.max(18, Math.floor(font * 1.1));

    // drop shadow
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    roundRect(ctx, bx + 10, by + 14, bw, bh, br);
    ctx.fill();
    ctx.restore();

    // board body
    const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    g.addColorStop(0, '#0c3b2a');
    g.addColorStop(1, '#06261b');
    ctx.fillStyle = g;
    roundRect(ctx, bx, by, bw, bh, br);
    ctx.fill();

    // subtle solder-mask texture
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    const step = Math.max(16, Math.floor(font * 1.1));
    for (let y = by; y < by + bh; y += step){
      for (let x = bx; x < bx + bw; x += step){
        if (((x + y) / step) % 3 < 1) ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.restore();

    // traces
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();

    ctx.globalAlpha = 0.52;
    ctx.strokeStyle = 'rgba(180, 255, 212, 0.22)';
    ctx.lineWidth = Math.max(1.25, 2.2 * dpr);
    for (const e of board.edges){
      const a = board.nodes[e.a];
      const b = board.nodes[e.b];
      const ax = bx + a.x * bw;
      const ay = by + a.y * bh;
      const bx2 = bx + b.x * bw;
      const by2 = by + b.y * bh;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      // mid control point to make traces feel less straight
      const mx = (ax + bx2) * 0.5 + Math.sin((ax + ay) * 0.01 + t * 0.6) * 8;
      const my = (ay + by2) * 0.5 + Math.cos((bx2 + by2) * 0.01 + t * 0.7) * 8;
      ctx.quadraticCurveTo(mx, my, bx2, by2);
      ctx.stroke();
    }

    // scanning line
    const scan = (Math.sin(t * 0.55) * 0.5 + 0.5);
    const sx = bx + scan * bw;
    const sg = ctx.createLinearGradient(sx, by, sx, by + bh);
    sg.addColorStop(0, 'rgba(108,242,255,0)');
    sg.addColorStop(0.5, 'rgba(108,242,255,0.18)');
    sg.addColorStop(1, 'rgba(108,242,255,0)');
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 10, by, 20, bh);

    ctx.restore();

    // components
    const seg = specimen?.segments?.[segmentIndex];
    const focusKind = seg?.kind;
    let focus = null;
    if (focusKind){
      for (const c of board.components){
        if (c.kind === focusKind){ focus = c; break; }
      }
    }
    if (!focus) focus = board.components[0];

    for (const c of board.components){
      const cx = bx + c.x * bw;
      const cy = by + c.y * bh;
      const ink = 'rgba(231,238,246,0.62)';
      const accent = `hsl(${c.hue}, 80%, 62%)`;
      drawComponent(ctx, c.kind, cx, cy, (Math.min(w, h) / 820) * c.s, c.rot, ink, accent);
    }

    // focus highlight
    if (focus){
      const fx = bx + focus.x * bw;
      const fy = by + focus.y * bh;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = 'rgba(108,242,255,0.75)';
      ctx.lineWidth = Math.max(2, 2.5 * dpr);
      ctx.beginPath();
      ctx.arc(fx, fy, 22 + pulse * 10, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.25;
      ctx.fillStyle = 'rgba(108,242,255,0.3)';
      ctx.beginPath();
      ctx.arc(fx, fy, 36 + pulse * 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // callout line
      const tx = bx + bw * 0.08;
      const ty = by + bh * 0.12;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(231,238,246,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + (tx - fx) * 0.35, fy + (ty - fy) * 0.35);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();
    }

    // HUD
    const headerH = Math.floor(h * 0.12);
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, headerH);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.06)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('CIRCUIT SAFARI', Math.floor(w * 0.05), Math.floor(headerH * 0.45));

    ctx.globalAlpha = 0.72;
    ctx.font = `${Math.floor(font * 0.88)}px ui-sans-serif, system-ui`;
    ctx.fillText(specimen?.title || '—', Math.floor(w * 0.05), Math.floor(headerH * 0.78));

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(108,242,255,0.9)';
    ctx.fillRect(0, headerH - 2, w, 2);
    ctx.restore();

    // segment card
    const cardW = Math.floor(w * 0.44);
    const cardH = Math.floor(h * 0.18);
    const cx = Math.floor(w * 0.05);
    const cy = Math.floor(h * 0.78);

    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    roundRect(ctx, cx, cy, cardW, cardH, Math.floor(cardH * 0.18));
    ctx.fill();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.88)';
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';

    const segName = seg?.label ? `focus: ${seg.label}` : 'focus: —';
    ctx.fillText(segName, cx + 14, cy + 12);

    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.font = `${Math.floor(small * 0.96)}px ui-sans-serif, system-ui`;

    const text = seg?.text || specimen?.subtitle || '—';
    // simple word wrap
    const maxW = cardW - 28;
    const words = String(text).split(/\s+/);
    let line = '';
    let y = cy + 12 + Math.floor(small * 1.55);
    const lh = Math.floor(small * 1.25);
    for (const w0 of words){
      const test = line ? (line + ' ' + w0) : w0;
      if (ctx.measureText(test).width > maxW && line){
        ctx.fillText(line, cx + 14, y);
        line = w0;
        y += lh;
        if (y > cy + cardH - lh) break;
      } else {
        line = test;
      }
    }
    if (y <= cy + cardH - lh) ctx.fillText(line, cx + 14, y);

    // progress bar
    const p = clamp(segmentT / segDur, 0, 1);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(231,238,246,0.18)';
    roundRect(ctx, cx + 14, cy + cardH - 12, cardW - 28, 3, 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(108,242,255,0.7)';
    roundRect(ctx, cx + 14, cy + cardH - 12, (cardW - 28) * p, 3, 2);
    ctx.fill();

    ctx.restore();

    // footer subtitle
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fillRect(0, Math.floor(h * 0.93), w, Math.floor(h * 0.07));

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(231,238,246,0.7)';
    ctx.font = `${Math.floor(h / 40)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText(specimen?.subtitle || 'guided teardowns • signals • parts', Math.floor(w * 0.05), Math.floor(h * 0.965));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
