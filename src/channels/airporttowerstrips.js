import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }
function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }

function roundedRect(ctx, x, y, w, h, r){
  r = Math.min(r, w*0.5, h*0.5);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // typography
  let font = 16;
  let small = 12;
  let mono = 13;

  // phases
  const PHASES = [
    { id: 'arr', label: 'ARRIVALS', counts: [8, 3, 2] },
    { id: 'dep', label: 'DEPARTURES', counts: [3, 8, 2] },
    { id: 'hold', label: 'HOLDS', counts: [4, 4, 6] },
    { id: 'mix', label: 'MIXED OPS', counts: [6, 6, 3] },
  ];
  const PHASE_DUR = 18;
  const CYCLE_DUR = PHASES.length * PHASE_DUR;

  // layout
  let pad = 40;
  let board = { x: 0, y: 0, w: 0, h: 0 };
  let cols = []; // {x,y,w,h,label}
  let stripH = 32;
  let stripGap = 8;

  // background
  let city = []; // {x,y,z,a}
  let runway = []; // {x,y,z,a}
  let clouds = []; // {x,y,s,ph}

  // strips
  const MAX_STRIPS = 22;
  let strips = []; // {x,y,tx,ty,w,h,a,ta,state,col,slot,callsign,type,alt,route,runway,tag}

  // events
  let phaseIndex = 0;
  let nextPhaseAt = 0;

  let handoff = 0;
  let handoffTag = '';
  let nextHandoffAt = 0;

  let runwayFlash = 0;
  let runwayBanner = 0;
  let activeRunway = '';
  let nextRunwayChangeAt = 0;

  // audio
  let ambience = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regenLayout(){
    const base = Math.min(w, h);
    pad = Math.floor(base * 0.06);

    board.x = pad;
    board.y = Math.floor(pad * 1.25);
    board.w = w - pad * 2;
    board.h = h - pad * 2 - Math.floor(base * 0.02);

    const colGap = Math.max(10, Math.floor(board.w * 0.02));
    const colW = Math.floor((board.w - colGap * 2) / 3);
    const colH = board.h;

    cols = [
      { x: board.x, y: board.y, w: colW, h: colH, label: 'ARR' },
      { x: board.x + colW + colGap, y: board.y, w: colW, h: colH, label: 'DEP' },
      { x: board.x + (colW + colGap) * 2, y: board.y, w: colW, h: colH, label: 'HOLD' },
    ];

    stripH = Math.max(22, Math.floor(base * 0.065));
    stripGap = Math.max(6, Math.floor(stripH * 0.22));

    font = Math.max(14, Math.floor(base / 30));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    // background points (deterministic)
    city = Array.from({ length: 180 }, () => ({
      x: rand() * w,
      y: h * (0.45 + rand() * 0.32),
      z: 0.3 + rand() * 0.95,
      a: 0.05 + rand() * 0.2,
    }));

    runway = Array.from({ length: 90 }, () => ({
      x: rand() * w,
      y: h * (0.84 + rand() * 0.14),
      z: 0.6 + rand() * 1.2,
      a: 0.08 + rand() * 0.25,
    }));

    clouds = Array.from({ length: 7 }, () => ({
      x: rand() * w,
      y: h * (0.08 + rand() * 0.22),
      s: 0.8 + rand() * 1.8,
      ph: rand() * Math.PI * 2,
    }));
  }

  function makeCallsign(){
    const airlines = ['QF', 'VA', 'JQ', 'NZ', 'SQ', 'EK', 'CX', 'QR', 'MH', 'GA', 'JL', 'NH', 'AA', 'DL'];
    const a = pick(rand, airlines);
    const n = 10 + ((rand() * 890) | 0);
    return `${a}${n}`;
  }

  function makeRoute(){
    const places = ['SYD', 'MEL', 'BNE', 'ADL', 'CBR', 'PER', 'HBA', 'OOL', 'AKL', 'WLG', 'SIN', 'HKG', 'DXB', 'LAX'];
    const from = pick(rand, places);
    let to = pick(rand, places);
    if (to === from) to = pick(rand, places);
    return `${from}→${to}`;
  }

  function makeAircraft(){
    const types = ['A320', 'A321', 'A330', 'B737', 'B738', 'B787', 'E190', 'ATR72'];
    return pick(rand, types);
  }

  function makeRunway(){
    const r = ['09', '16', '27', '34'];
    const s = pick(rand, r);
    const side = rand() < 0.35 ? pick(rand, ['L', 'R']) : '';
    return `${s}${side}`;
  }

  function spawnStrip(col, slot, opts){
    const c = cols[col];
    const inset = Math.floor(c.w * 0.04);
    const sw = c.w - inset * 2;
    const headerH = Math.floor(stripH * 1.0);
    const y0 = c.y + headerH + stripGap;
    const ty = y0 + slot * (stripH + stripGap);

    const startX = -sw - rand() * w * 0.18;
    const tx = c.x + inset;

    const s = {
      x: startX,
      y: ty + (rand() - 0.5) * stripH * 0.2,
      tx,
      ty,
      w: sw,
      h: stripH,
      a: 0,
      ta: 1,
      state: 'in',
      col,
      slot,
      callsign: makeCallsign(),
      type: makeAircraft(),
      alt: 40 + ((rand() * 260) | 0),
      route: makeRoute(),
      runway: activeRunway,
      tag: opts?.tag || '',
    };

    strips.push(s);
    if (strips.length > MAX_STRIPS) strips.shift();
  }

  function clearAndRebuildPhase(idx){
    phaseIndex = idx;

    // fade out old
    for (const s of strips){
      if (s.state !== 'out'){
        s.state = 'out';
        s.ta = 0;
        s.tx = w + pad + rand() * w * 0.12;
      }
    }

    const counts = PHASES[phaseIndex].counts;
    const maxPerCol = Math.floor((cols[0].h - stripH * 1.1) / (stripH + stripGap));

    for (let col=0; col<3; col++){
      const n = Math.min(counts[col], maxPerCol);
      for (let i=0; i<n; i++){
        // slight deterministic staggering
        spawnStrip(col, i, { tag: col === 2 && rand() < 0.25 ? 'REROUTE' : '' });
      }
    }
  }

  function triggerHandoff(){
    // pick a non-out strip
    const live = strips.filter(s => s.state !== 'out' && s.ta > 0.1);
    if (!live.length) return;
    const s = live[(rand() * live.length) | 0];
    handoff = 1;
    handoffTag = s.callsign;

    safeBeep({ freq: 660 + rand()*90, dur: 0.02, gain: 0.012, type: 'square' });
    safeBeep({ freq: 440 + rand()*50, dur: 0.03, gain: 0.008, type: 'triangle' });

    nextHandoffAt = t + 6 + rand() * 10;
  }

  function triggerRunwayChange(){
    runwayFlash = 1;
    runwayBanner = 1;
    activeRunway = makeRunway();

    // update runway on some strips and reorder within each column
    for (let col=0; col<3; col++){
      const inCol = strips.filter(s => s.col === col && s.state !== 'out');
      // fisher-yates using rand
      for (let i=inCol.length-1; i>0; i--){
        const j = (rand() * (i+1)) | 0;
        const tmp = inCol[i];
        inCol[i] = inCol[j];
        inCol[j] = tmp;
      }
      for (let i=0; i<inCol.length; i++){
        inCol[i].slot = i;
        // recompute ty
        const c = cols[col];
        const headerH = Math.floor(stripH * 1.0);
        const y0 = c.y + headerH + stripGap;
        inCol[i].ty = y0 + i * (stripH + stripGap);
        if (rand() < 0.75) inCol[i].runway = activeRunway;
      }
    }

    // audio: quick triple blip
    safeBeep({ freq: 880, dur: 0.02, gain: 0.010, type: 'square' });
    safeBeep({ freq: 660, dur: 0.02, gain: 0.010, type: 'square' });
    safeBeep({ freq: 990, dur: 0.02, gain: 0.010, type: 'square' });

    nextRunwayChangeAt = t + 26 + rand() * 26;
  }

  function reset(){
    t = 0;
    strips = [];

    phaseIndex = 0;
    nextPhaseAt = PHASE_DUR;

    handoff = 0;
    handoffTag = '';
    nextHandoffAt = 2.5 + rand() * 4;

    runwayFlash = 0;
    runwayBanner = 0;
    activeRunway = makeRunway();
    nextRunwayChangeAt = 8 + rand() * 12;

    clearAndRebuildPhase(0);
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    regenLayout();
    reset();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // quiet tower-room bed
    const n = audio.noiseSource({ type: 'pink', gain: 0.0026 });
    n.start();
    const d = simpleDrone(audio, { root: 62 + rand()*18, detune: 0.8, gain: 0.012 });

    ambience = {
      stop(){
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      }
    };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;

    handoff = Math.max(0, handoff - dt * 1.6);
    runwayFlash = Math.max(0, runwayFlash - dt * 1.2);
    runwayBanner = Math.max(0, runwayBanner - dt * 0.65);

    if (t >= nextPhaseAt){
      const next = (phaseIndex + 1) % PHASES.length;
      clearAndRebuildPhase(next);
      nextPhaseAt = Math.floor(t / PHASE_DUR + 1) * PHASE_DUR;
    }

    if (t >= nextHandoffAt) triggerHandoff();
    if (t >= nextRunwayChangeAt) triggerRunwayChange();

    // animate strips
    for (let i=strips.length-1; i>=0; i--){
      const s = strips[i];
      const k = 1 - Math.pow(0.001, dt);
      s.x = lerp(s.x, s.tx, k * 0.55);
      s.y = lerp(s.y, s.ty, k * 0.65);
      s.a = lerp(s.a, s.ta, k * 0.8);

      if (s.state === 'in' && Math.abs(s.x - s.tx) < 0.8){
        s.state = 'live';
        s.a = Math.max(s.a, 0.9);
      }

      if (s.state === 'out' && s.a < 0.02){
        strips.splice(i, 1);
      }
    }

    // very occasional micro-spawn to keep motion in long phases
    if (strips.length < MAX_STRIPS && rand() < 0.012){
      const col = (rand() * 3) | 0;
      const existingSlots = strips.filter(s => s.col === col && s.state !== 'out').map(s => s.slot);
      const slot = existingSlots.length ? Math.min(existingSlots.length, 10) : 0;
      spawnStrip(col, slot, { tag: rand() < 0.18 ? 'LATE' : '' });
    }
  }

  function drawBackground(ctx){
    // night sky / tower glass
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#060816');
    sky.addColorStop(0.55, '#08131f');
    sky.addColorStop(1, '#04070c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // clouds (slow parallax)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const c of clouds){
      const cx = (c.x + t * 6 * c.s) % (w + 200) - 100;
      const cy = c.y + Math.sin(t*0.12 + c.ph) * h * 0.01;
      const rw = w * (0.22 + c.s * 0.18);
      const rh = h * (0.06 + c.s * 0.03);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rw);
      g.addColorStop(0, 'rgba(120,170,255,0.06)');
      g.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // distant city / airport lights
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const p of city){
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.5 + p.z*0.4) + p.x * 0.01));
      const a = p.a * tw;
      ctx.fillStyle = `rgba(255, 210, 150, ${a})`;
      const sz = 0.6 + p.z * 1.1;
      ctx.fillRect(p.x, p.y, sz, sz);
    }

    // runway edge lights + sweep
    const sweep = 0.5 + 0.5 * Math.sin(t * 0.35);
    for (const p of runway){
      const a = p.a * (0.6 + 0.4*sweep);
      ctx.fillStyle = `rgba(180, 235, 255, ${a})`;
      const sz = 0.8 + p.z;
      const x = (p.x + t * 14 * p.z) % (w + 2);
      ctx.fillRect(x, p.y, sz, sz);
    }
    ctx.restore();
  }

  function drawBoard(ctx){
    // board backing
    ctx.save();
    const r = Math.max(10, Math.floor(Math.min(w, h) * 0.02));

    const bg = ctx.createLinearGradient(0, board.y, 0, board.y + board.h);
    bg.addColorStop(0, 'rgba(18, 24, 34, 0.88)');
    bg.addColorStop(1, 'rgba(8, 10, 14, 0.92)');

    ctx.fillStyle = bg;
    roundedRect(ctx, board.x, board.y, board.w, board.h, r);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = Math.max(1, Math.floor(1 * dpr));
    ctx.stroke();

    // header
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(board.x, board.y, board.w, Math.floor(stripH * 1.05));

    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = `600 ${font}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textBaseline = 'middle';
    ctx.fillText('TOWER STRIP BOARD', board.x + Math.floor(board.w * 0.02), board.y + Math.floor(stripH * 0.52));

    // phase label + runway
    const ph = PHASES[phaseIndex];
    ctx.font = `600 ${small}px ui-sans-serif, system-ui, -apple-system`;
    ctx.fillStyle = 'rgba(210,240,255,0.9)';
    const right = board.x + board.w - Math.floor(board.w * 0.02);
    const phaseTxt = `${ph.label}`;
    const rwyTxt = `RWY ${activeRunway}`;
    ctx.textAlign = 'right';
    ctx.fillText(phaseTxt, right, board.y + Math.floor(stripH * 0.44));
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fillText(rwyTxt, right, board.y + Math.floor(stripH * 0.74));
    ctx.textAlign = 'left';

    // columns
    for (let i=0;i<cols.length;i++){
      const c = cols[i];
      const inset = Math.floor(c.w * 0.04);

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.strokeRect(c.x, c.y, c.w, c.h);

      // column header strip
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(c.x, c.y + Math.floor(stripH * 1.05), c.w, Math.max(1, Math.floor(1.2 * dpr)));

      ctx.fillStyle = 'rgba(255,255,255,0.66)';
      ctx.font = `700 ${small}px ui-sans-serif, system-ui, -apple-system`;
      ctx.fillText(cols[i].label, c.x + inset, c.y + Math.floor(stripH * 0.9));
    }

    ctx.restore();
  }

  function stripColors(col){
    if (col === 0) return { bg: 'rgba(208,236,255,0.92)', border: 'rgba(255,255,255,0.55)' };
    if (col === 1) return { bg: 'rgba(255,238,205,0.92)', border: 'rgba(255,255,255,0.55)' };
    return { bg: 'rgba(244,220,255,0.92)', border: 'rgba(255,255,255,0.55)' };
  }

  function drawStrip(ctx, s){
    const col = s.col;
    const c = stripColors(col);

    const isHandoff = handoff > 0 && s.callsign === handoffTag;
    const glow = isHandoff ? handoff : 0;

    ctx.save();
    ctx.globalAlpha = clamp(s.a, 0, 1);

    // drop shadow
    ctx.fillStyle = `rgba(0,0,0,${0.22 + glow*0.25})`;
    roundedRect(ctx, s.x + 2*dpr, s.y + 3*dpr, s.w, s.h, Math.floor(s.h*0.22));
    ctx.fill();

    // strip
    ctx.fillStyle = c.bg;
    roundedRect(ctx, s.x, s.y, s.w, s.h, Math.floor(s.h*0.22));
    ctx.fill();

    ctx.strokeStyle = isHandoff ? `rgba(120, 220, 255, ${0.7 + glow*0.3})` : 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(1, Math.floor(1 * dpr));
    ctx.stroke();

    // text
    ctx.fillStyle = 'rgba(10,14,18,0.92)';
    ctx.font = `700 ${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';

    const px = s.x + Math.floor(s.w * 0.04);
    const py = s.y + Math.floor(s.h * 0.52);

    const left = `${s.callsign}  ${s.type}`;
    ctx.fillText(left, px, py);

    ctx.textAlign = 'right';
    const right = `${String(s.alt).padStart(3,'0')}  ${s.runway}`;
    ctx.fillText(right, s.x + s.w - Math.floor(s.w * 0.04), py);
    ctx.textAlign = 'left';

    // route line (small)
    ctx.fillStyle = 'rgba(10,14,18,0.72)';
    ctx.font = `600 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(s.route, px, s.y + Math.floor(s.h * 0.20));

    if (s.tag){
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(220,40,80,0.92)';
      ctx.fillText(s.tag, s.x + s.w - Math.floor(s.w * 0.04), s.y + Math.floor(s.h * 0.20));
      ctx.textAlign = 'left';
    }

    // subtle highlight band
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255,255,255,${0.06 + glow*0.18})`;
    ctx.fillRect(s.x + 1*dpr, s.y + 1*dpr, s.w - 2*dpr, Math.max(1, Math.floor(s.h * 0.18)));
    ctx.restore();

    ctx.restore();
  }

  function drawOverlay(ctx){
    if (runwayBanner <= 0) return;

    ctx.save();
    const a = clamp(runwayBanner, 0, 1);
    const barH = Math.floor(Math.min(w, h) * 0.07);
    const y = board.y + Math.floor(board.h * 0.06);

    ctx.globalAlpha = 0.9 * a;
    ctx.fillStyle = `rgba(30, 190, 255, ${0.18 + runwayFlash*0.20})`;
    ctx.fillRect(board.x, y, board.w, barH);

    ctx.strokeStyle = `rgba(255,255,255,${0.25 + runwayFlash*0.25})`;
    ctx.lineWidth = Math.max(1, Math.floor(1 * dpr));
    ctx.strokeRect(board.x, y, board.w, barH);

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `800 ${font}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`RUNWAY CHANGE → ${activeRunway}`, board.x + board.w/2, y + barH/2);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function draw(ctx){
    drawBackground(ctx);
    drawBoard(ctx);

    // strips
    // (keep the hot path allocation-free; ordering jitter is fine.)
    for (const s of strips) drawStrip(ctx, s);

    drawOverlay(ctx);
  }

  return {
    onResize,
    update,
    draw,
    destroy,
    onAudioOn,
    onAudioOff,
  };
}
