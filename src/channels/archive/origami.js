import { mulberry32 } from '../../util/prng.js';

// Origami After Hours
// Slow, relaxing paper-fold sessions with step highlights and satisfying crease sounds (optional).

const MODELS = [
  {
    name: 'Classic Crane (Loose)',
    steps: [
      { text: 'Fold diagonally (TL → BR). Crease.', fold: { kind: 'diag', a: 'tl', b: 'br' } },
      { text: 'Fold diagonally (TR → BL). Crease.', fold: { kind: 'diag', a: 'tr', b: 'bl' } },
      { text: 'Fold in half (top to bottom). Crease.', fold: { kind: 'mid', axis: 'h' } },
      { text: 'Fold in half (left to right). Crease.', fold: { kind: 'mid', axis: 'v' } },
      { text: 'Open. Bring corners inward (pre-crease).', fold: { kind: 'cornerToCenter', corner: 'tl' } },
      { text: 'Repeat on other corners (soft).', fold: { kind: 'cornerToCenter', corner: 'br' } },
      { text: 'Fold one flap upward (gentle lift).', fold: { kind: 'edgeToCenter', edge: 'bottom' } },
      { text: 'Fold wings outward (slow sweep).', fold: { kind: 'mid', axis: 'v', style: 'wing' } },
    ],
  },
  {
    name: 'Paper Boat',
    steps: [
      { text: 'Fold in half (left to right). Crease.', fold: { kind: 'mid', axis: 'v' } },
      { text: 'Fold top corners to the center line.', fold: { kind: 'cornerToMid', corner: 'tl' } },
      { text: 'Fold the other top corner in.', fold: { kind: 'cornerToMid', corner: 'tr' } },
      { text: 'Fold lower edge up (first brim).', fold: { kind: 'edgeUp', edge: 'bottom' } },
      { text: 'Flip. Fold other brim up.', fold: { kind: 'edgeUp', edge: 'bottom', flip: true } },
      { text: 'Open into a diamond (soft pull).', fold: { kind: 'open' } },
      { text: 'Fold bottom to top. Crease.', fold: { kind: 'mid', axis: 'h' } },
      { text: 'Open and pull ends to form the boat.', fold: { kind: 'openWide' } },
    ],
  },
  {
    name: 'Lucky Star (Fold Loop)',
    steps: [
      { text: 'Fold a thin strip (imaginary). Start loop.', fold: { kind: 'strip', dir: 1 } },
      { text: 'Tuck tail through. Flatten.', fold: { kind: 'strip', dir: -1 } },
      { text: 'Wrap around the pentagon.', fold: { kind: 'wrap' } },
      { text: 'Wrap again (slow).', fold: { kind: 'wrap' } },
      { text: 'Tuck tail in. Seal.', fold: { kind: 'tuck' } },
      { text: 'Pinch edges to puff the star.', fold: { kind: 'pinch' } },
    ],
  },
  {
    name: 'Simple Frog (Bounce)',
    steps: [
      { text: 'Fold in half (top to bottom). Crease.', fold: { kind: 'mid', axis: 'h' } },
      { text: 'Fold corners to center line.', fold: { kind: 'cornerToMid', corner: 'bl' } },
      { text: 'Repeat for the other corner.', fold: { kind: 'cornerToMid', corner: 'br' } },
      { text: 'Fold bottom edge to center.', fold: { kind: 'edgeToCenter', edge: 'bottom' } },
      { text: 'Fold in half (bottom to top).', fold: { kind: 'mid', axis: 'h' } },
      { text: 'Create the spring fold (press).', fold: { kind: 'spring' } },
      { text: 'Let it rest. Tiny hop.', fold: { kind: 'hop' } },
    ],
  },
];

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

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

function pick(rand, arr){ return arr[Math.floor(rand() * arr.length)]; }

function paperCrinkle(audio, rand, {gain=0.06}={}){
  // Short noise burst shaped to feel like a paper crease.
  const ctx = audio.ensure();
  const dur = 0.10 + rand() * 0.09;
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(dur * sr));

  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i=0; i<len; i++){
    const x = i / len;
    const env = Math.pow(1 - x, 2.2);
    // mixed white + a touch of brown-ish
    const n = (Math.random() * 2 - 1) * 0.85 + ((i ? d[i-1] : 0) * 0.12);
    d[i] = n * env;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 700 + rand() * 700;
  bp.Q.value = 0.9;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 120;
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
}

function foldLineFor(paper, fold){
  const { x, y, s } = paper;
  const cx = x + s/2;
  const cy = y + s/2;

  const corner = (c) => {
    if (c === 'tl') return [x, y];
    if (c === 'tr') return [x + s, y];
    if (c === 'bl') return [x, y + s];
    return [x + s, y + s]; // br
  };

  if (!fold) return null;

  if (fold.kind === 'diag'){
    const [ax, ay] = corner(fold.a);
    const [bx, by] = corner(fold.b);
    return { ax, ay, bx, by };
  }

  if (fold.kind === 'mid'){
    if (fold.axis === 'h') return { ax: x, ay: cy, bx: x + s, by: cy };
    return { ax: cx, ay: y, bx: cx, by: y + s };
  }

  if (fold.kind === 'cornerToCenter'){
    const [ax, ay] = corner(fold.corner);
    return { ax, ay, bx: cx, by: cy };
  }

  if (fold.kind === 'cornerToMid'){
    const [ax, ay] = corner(fold.corner);
    // to nearest midline
    const bx = cx;
    const by = (fold.corner === 'tl' || fold.corner === 'tr') ? y + s*0.35 : y + s*0.65;
    return { ax, ay, bx, by };
  }

  if (fold.kind === 'edgeToCenter'){
    if (fold.edge === 'bottom') return { ax: x, ay: y + s, bx: x + s, by: cy };
    if (fold.edge === 'top') return { ax: x, ay: y, bx: x + s, by: cy };
    if (fold.edge === 'left') return { ax: x, ay: y, bx: cx, by: y + s };
    return { ax: x + s, ay: y, bx: cx, by: y + s };
  }

  if (fold.kind === 'edgeUp'){
    // bottom edge up a bit
    return { ax: x, ay: y + s, bx: x + s, by: y + s*0.62 };
  }

  // gesture-only folds
  return null;
}

function flapPolygonFor(paper, fold){
  // purely decorative: picks a triangle-ish area that "would" move.
  const { x, y, s } = paper;
  const cx = x + s/2;
  const cy = y + s/2;

  if (!fold) return null;

  if (fold.kind === 'cornerToCenter'){
    const c = fold.corner;
    if (c === 'tl') return [[x, y], [cx, cy], [x, cy]];
    if (c === 'tr') return [[x+s, y], [cx, cy], [cx, y]];
    if (c === 'bl') return [[x, y+s], [cx, cy], [cx, y+s]];
    return [[x+s, y+s], [cx, cy], [x+s, cy]];
  }

  if (fold.kind === 'cornerToMid'){
    const c = fold.corner;
    if (c === 'tl') return [[x, y], [cx, y + s*0.35], [x, y + s*0.35]];
    if (c === 'tr') return [[x+s, y], [cx, y + s*0.35], [x+s, y + s*0.35]];
    if (c === 'bl') return [[x, y+s], [cx, y + s*0.65], [x, y + s*0.65]];
    return [[x+s, y+s], [cx, y + s*0.65], [x+s, y + s*0.65]];
  }

  if (fold.kind === 'edgeUp' || (fold.kind === 'edgeToCenter' && fold.edge === 'bottom')){
    return [[x, y+s], [x+s, y+s], [x+s*0.5, y+s*0.70]];
  }

  if (fold.kind === 'mid' && fold.axis === 'v'){
    return [[x, y], [cx, cy], [x, y+s]];
  }

  return null;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;

  let model = pick(rand, MODELS);
  let stepIdx = 0;

  const STEP_DUR = 6.0;
  let stepElapsed = 0;

  // subtle motion cues
  let wob = rand() * 10;
  let hop = 0;

  function init({ width, height }){
    w = width; h = height; t = 0;
    model = pick(rand, MODELS);
    stepIdx = 0;
    stepElapsed = 0;
    wob = rand() * 10;
    hop = 0;
  }

  function onResize(width, height){ w = width; h = height; }

  function nextStep(){
    stepIdx++;
    stepElapsed = 0;

    if (stepIdx >= model.steps.length){
      model = pick(rand, MODELS);
      stepIdx = 0;
    }

    if (audio.enabled){
      paperCrinkle(audio, rand, { gain: 0.045 + rand()*0.03 });
    }
  }

  function update(dt){
    t += dt;
    stepElapsed += dt;

    // little "hop" for frog steps
    const fold = model.steps[stepIdx]?.fold;
    if (fold?.kind === 'hop'){
      hop += dt * 6;
    } else {
      hop = Math.max(0, hop - dt * 4);
    }

    if (stepElapsed >= STEP_DUR){
      nextStep();
    }

    wob += dt * 0.35;
  }

  function drawDesk(ctx){
    // dark desk gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05070b');
    g.addColorStop(0.55, '#070a10');
    g.addColorStop(1, '#020203');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // lamp pool
    const lp = ctx.createRadialGradient(w*0.52, h*0.28, 0, w*0.52, h*0.28, Math.max(w,h)*0.85);
    lp.addColorStop(0, 'rgba(255,220,170,0.10)');
    lp.addColorStop(0.35, 'rgba(255,220,170,0.05)');
    lp.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = lp;
    ctx.fillRect(0, 0, w, h);

    // faint grain
    const n = Math.floor(60 + (w*h)/260_000);
    for (let i=0; i<n; i++){
      const x = (i * 73.1 + (seed % 911)) % w;
      const y = (i * 41.7 + (seed % 277)) % h;
      const a = 0.018 + 0.012 * (0.5 + 0.5 * Math.sin(t*0.7 + i));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function drawPaper(ctx, paper, p, fold){
    const { x, y, s } = paper;

    // gentle bob
    const bob = Math.sin(wob) * 3 + (hop > 0 ? Math.sin(hop) * 5 : 0);

    ctx.save();
    ctx.translate(0, bob);

    // shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, x + 6, y + 10, s, s, 14);
    ctx.fill();
    ctx.restore();

    // paper body
    const pg = ctx.createLinearGradient(x, y, x + s, y + s);
    pg.addColorStop(0, '#f5f2e8');
    pg.addColorStop(0.55, '#efe8db');
    pg.addColorStop(1, '#f8f5ee');

    ctx.fillStyle = pg;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w,h)/900));
    roundRect(ctx, x, y, s, s, 14);
    ctx.fill();
    ctx.stroke();

    // paper texture (small fibers)
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, s, s, 14);
    ctx.clip();
    const dots = Math.floor(110 + s*s/2500);
    for (let i=0; i<dots; i++){
      const px = x + ((i*37.7 + seed) % 1000) / 1000 * s;
      const py = y + ((i*19.1 + (seed%333)) % 1000) / 1000 * s;
      const a = 0.020 + 0.015 * (0.5 + 0.5*Math.sin(i + seed));
      ctx.fillStyle = `rgba(60,45,35,${a})`;
      ctx.fillRect(px, py, 1, 1);
    }
    ctx.restore();

    // decorative flap shading
    const flap = flapPolygonFor(paper, fold);
    if (flap){
      ctx.save();
      ctx.globalAlpha = 0.55 * p;
      ctx.fillStyle = 'rgba(120,95,70,0.25)';
      ctx.beginPath();
      ctx.moveTo(flap[0][0], flap[0][1]);
      for (let i=1;i<flap.length;i++) ctx.lineTo(flap[i][0], flap[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // fold line highlight
    const ln = foldLineFor(paper, fold);
    if (ln){
      const { ax, ay, bx, by } = ln;

      ctx.save();
      ctx.lineWidth = Math.max(1.5, Math.min(4, s * 0.006));
      ctx.setLineDash([Math.max(6, s*0.03), Math.max(5, s*0.02)]);
      ctx.lineCap = 'round';

      // base crease
      ctx.strokeStyle = `rgba(30,25,20,${0.15 + 0.30*p})`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();

      // moving highlight
      const k = 0.15 + 0.70 * p;
      const hx = ax + (bx - ax) * k;
      const hy = ay + (by - ay) * k;
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,230,170,${0.12 + 0.22*p})`;
      ctx.beginPath();
      ctx.arc(hx, hy, Math.max(3, s*0.012), 0, Math.PI*2);
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  }

  function drawInfo(ctx, paper, p){
    const s = Math.min(w, h);
    const pad = Math.max(14, Math.floor(s * 0.03));

    const panelW = Math.floor(w * 0.78);
    const panelH = Math.floor(s * 0.14);
    const px = Math.floor((w - panelW) / 2);
    const py = Math.floor(h - panelH - pad);

    ctx.save();
    ctx.fillStyle = 'rgba(8, 10, 14, 0.70)';
    ctx.strokeStyle = 'rgba(255, 220, 170, 0.16)';
    ctx.lineWidth = 1;
    roundRect(ctx, px, py, panelW, panelH, 14);
    ctx.fill();
    ctx.stroke();

    const title = 'ORIGAMI AFTER HOURS';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `${Math.floor(panelH*0.28)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(title, px + 16, py + Math.floor(panelH*0.36));

    ctx.fillStyle = 'rgba(255,220,170,0.86)';
    ctx.font = `${Math.floor(panelH*0.22)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText(model.name, px + 16, py + Math.floor(panelH*0.66));

    const step = model.steps[stepIdx];
    const stepText = step?.text || '…';
    const count = `${stepIdx + 1}/${model.steps.length}`;

    ctx.fillStyle = `rgba(230,240,255,${0.82 + 0.08*Math.sin(t*0.6)})`;
    ctx.font = `${Math.floor(panelH*0.20)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText(stepText, px + 16, py + Math.floor(panelH*0.92));

    const tw = ctx.measureText(count).width;
    ctx.fillStyle = `rgba(255,255,255,${0.70})`;
    ctx.fillText(count, px + panelW - 16 - tw, py + Math.floor(panelH*0.36));

    // progress bar
    const barW = Math.floor(panelW * 0.32);
    const barH = Math.max(4, Math.floor(panelH * 0.09));
    const bx = px + panelW - 16 - barW;
    const by = py + Math.floor(panelH*0.70);

    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(ctx, bx, by, barW, barH, 999);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,220,170,0.30)';
    roundRect(ctx, bx, by, Math.floor(barW * p), barH, 999);
    ctx.fill();

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, w, h);

    drawDesk(ctx);

    const s = Math.min(w, h);
    const paperSize = Math.floor(s * 0.62);
    const paper = {
      s: paperSize,
      x: Math.floor((w - paperSize) / 2),
      y: Math.floor(h * 0.16),
    };

    const p = clamp01(stepElapsed / STEP_DUR);
    const fold = model.steps[stepIdx]?.fold;

    drawPaper(ctx, paper, p, fold);
    drawInfo(ctx, paper, p);

    // subtle vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w*0.5, h*0.45, s*0.20, w*0.5, h*0.45, Math.max(w,h)*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.70)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function onAudioOn(){
    // No continuous bed: just step sounds.
    if (audio.enabled){
      // soft confirmation tick
      audio.beep({ freq: 520, dur: 0.03, gain: 0.02, type: 'sine' });
    }
  }

  function onAudioOff(){
    // nothing to stop
  }

  function destroy(){
    // nothing to tear down
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
