import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function roundedRect(ctx, x, y, w, h, r){
  r = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hash01(x){
  const s = Math.sin(x) * 43758.5453123;
  return s - Math.floor(s);
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

  const palettes = [
    { sky0: '#04040f', sky1: '#0a0620', neonA: '#ff3bd4', neonB: '#6cf2ff', neonC: '#b7ff8a', ink: '#101018', paper: 'rgba(247,242,232,0.94)' },
    { sky0: '#050013', sky1: '#12051f', neonA: '#ff6a3a', neonB: '#7affd6', neonC: '#ffd86a', ink: '#130d12', paper: 'rgba(246,240,230,0.94)' },
    { sky0: '#020812', sky1: '#061320', neonA: '#7a5cff', neonB: '#ff4e8a', neonC: '#6cf2ff', ink: '#0f1218', paper: 'rgba(242,246,248,0.93)' },
  ];
  const pal = pick(rand, palettes);

  // timing
  const PHASE_DUR = 15;
  const PHASES = [
    { id: 'stall', label: 'STALL CAM' },
    { id: 'ledger', label: 'LEDGER' },
    { id: 'receipts', label: 'RECEIPTS' },
    { id: 'deal', label: 'DEAL OF THE MINUTE' },
  ];
  const CYCLE_DUR = PHASE_DUR * PHASES.length;

  // scene elements
  let signs = [];      // {x,y,w,h,text,col,freq,ph}
  let tags = [];       // price tags on the stall: {x,y,lab,price,col}
  let dropsFar = [];   // rain streaks
  let dropsNear = [];

  let ledger = [];     // entries: {t,label,qty,price}
  let receipts = [];   // receipts: {id, lines: [string], total}

  let deal = null;     // {item, off, price, col}

  // fx / moments
  let flicker = 0;
  let nextFlickerAt = 0;
  let flickerSign = 0;

  let dealFlash = 0;
  let dealPulse = 0;
  let nextDealAt = 0;

  // audio
  let ambience = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regen(){
    // signs (background)
    const baseY = h * 0.16;
    const signCount = 7;
    signs = Array.from({ length: signCount }, (_, i) => {
      const ww = w * (0.10 + rand() * 0.14);
      const hh = h * (0.05 + rand() * 0.08);
      const x = w * (0.08 + (i / (signCount - 1)) * 0.84) - ww * 0.5 + (rand() - 0.5) * w * 0.04;
      const y = baseY + (rand() - 0.5) * h * 0.08;
      const text = pick(rand, ['NOODLES', 'GYOZA', 'TEA', 'SKEWERS', 'SPICES', 'NIGHT', 'MARKET', 'FRUIT', 'RICE', 'BUNS']);
      const col = pick(rand, [pal.neonA, pal.neonB, pal.neonC]);
      return { x, y, w: ww, h: hh, text, col, freq: 1.3 + rand() * 2.4, ph: rand() * 10 };
    });

    // tags on stall
    const tagCount = 6;
    tags = Array.from({ length: tagCount }, (_, i) => {
      const x = w * (0.18 + (i / (tagCount - 1)) * 0.64) + (rand() - 0.5) * w * 0.03;
      const y = h * (0.50 + (rand() - 0.5) * 0.06);
      const lab = pick(rand, ['BUN', 'MANGO', 'RICE', 'TEA', 'SKEWER', 'TOFU', 'MOCHI', 'RAMEN', 'PEAR', 'CHILI']);
      const price = (2 + ((rand() * 11) | 0)) + (rand() < 0.25 ? 0.5 : 0);
      const col = pick(rand, [pal.neonA, pal.neonB, pal.neonC]);
      return { x, y, lab, price, col };
    });

    // rain layers
    const farN = Math.max(70, Math.floor(w * h / 18000));
    const nearN = Math.max(34, Math.floor(w * h / 34000));

    const mkDrop = (near=false) => ({
      x: rand() * w,
      y: rand() * h,
      len: (near ? (h * (0.03 + rand() * 0.05)) : (h * (0.02 + rand() * 0.03))),
      spd: (near ? (h * (0.35 + rand() * 0.55)) : (h * (0.25 + rand() * 0.45))),
      a: (near ? (0.15 + rand() * 0.28) : (0.08 + rand() * 0.18)),
      w: near ? (1.6 + rand() * 1.8) : (1.0 + rand() * 0.8),
      ph: rand() * 10,
    });

    dropsFar = Array.from({ length: farN }, () => mkDrop(false));
    dropsNear = Array.from({ length: nearN }, () => mkDrop(true));

    // ledger entries (deterministic)
    ledger = [];
    const goods = ['NOODLES', 'GYOZA', 'MILK TEA', 'SPICE MIX', 'MANGO', 'BUNS', 'SKEWERS', 'MOCHI', 'TOFU', 'RICE CAKE', 'PEAR', 'CHILI OIL', 'SWEET SOUP', 'DUMPLINGS'];
    for (let i=0;i<14;i++){
      const label = pick(rand, goods);
      const qty = 1 + ((rand() * 6) | 0);
      const price = (2 + ((rand() * 13) | 0)) + (rand() < 0.2 ? 0.5 : 0);
      ledger.push({ label, qty, price, tt: (i * 7 + ((rand()*4)|0)) % 60 });
    }

    // receipts
    receipts = [];
    const receiptCount = 5;
    for (let r=0;r<receiptCount;r++){
      const lines = [];
      const n = 3 + ((rand() * 3) | 0);
      let total = 0;
      for (let i=0;i<n;i++){
        const it = pick(rand, ledger);
        const q = 1 + ((rand() * 2) | 0);
        const p = it.price;
        total += q * p;
        lines.push(`${String(q).padStart(2,' ')}  ${it.label.slice(0, 10).padEnd(10,' ')}  $${(q*p).toFixed(2)}`);
      }
      receipts.push({ id: r, lines, total: `$${total.toFixed(2)}` });
    }

    // deal variants
    const dealItem = pick(rand, ledger);
    const off = pick(rand, [10, 15, 20, 25, 30]);
    const dealPrice = Math.max(1, dealItem.price * (1 - off / 100));
    deal = { item: dealItem.label, off, price: dealPrice, col: pick(rand, [pal.neonA, pal.neonB, pal.neonC]) };

    // moments schedule
    nextFlickerAt = 1.2 + rand() * 6;
    flickerSign = (rand() * signs.length) | 0;
    nextDealAt = PHASE_DUR * 3 + 1.2 + rand() * 3.5;
  }

  function reset(){
    t = 0;
    dealFlash = 0;
    dealPulse = 0;
    flicker = 0;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    regen();
    reset();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // rain-ish bed + tiny drone
    const n = audio.noiseSource({ type: 'pink', gain: 0.0032 });
    n.start();
    const d = simpleDrone(audio, { root: 48 + rand() * 18, detune: 0.9, gain: 0.012 });

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

  function triggerDeal(){
    dealFlash = 1;
    dealPulse = 1;

    // cash-bell-ish
    safeBeep({ freq: 880, dur: 0.05, gain: 0.014, type: 'triangle' });
    safeBeep({ freq: 1320, dur: 0.03, gain: 0.010, type: 'sine' });
  }

  function update(dt){
    t += dt;

    dealFlash = Math.max(0, dealFlash - dt * 1.25);
    dealPulse = Math.max(0, dealPulse - dt * 0.55);
    flicker = Math.max(0, flicker - dt * 5.0);

    // rain
    const wind = Math.sin(t * 0.23) * w * 0.01;
    for (const d of dropsFar){
      d.y += d.spd * dt;
      d.x += wind * dt * 0.6;
      if (d.y > h + d.len) { d.y = -d.len; d.x = (d.x + w * (0.12 + rand()*0.2)) % w; }
      if (d.x < -w*0.1) d.x += w*1.2;
      if (d.x > w*1.1) d.x -= w*1.2;
    }
    for (const d of dropsNear){
      d.y += d.spd * dt;
      d.x += wind * dt * 0.9;
      if (d.y > h + d.len) { d.y = -d.len; d.x = (d.x + w * (0.2 + rand()*0.35)) % w; }
      if (d.x < -w*0.2) d.x += w*1.4;
      if (d.x > w*1.2) d.x -= w*1.4;
    }

    // flicker moment
    if (t >= nextFlickerAt){
      flicker = 1;
      nextFlickerAt = t + 2.2 + rand() * 7.5;
      flickerSign = (rand() * signs.length) | 0;
      safeBeep({ freq: 220 + rand() * 120, dur: 0.012, gain: 0.004, type: 'square' });
    }

    // deal moment (once per cycle)
    const cycT = t % CYCLE_DUR;
    const prev = (t - dt) % CYCLE_DUR;
    if (prev < nextDealAt && cycT >= nextDealAt){
      triggerDeal();
    }

    // new cycle: rotate deal item + schedule
    if (cycT < dt){
      const dealItem = pick(rand, ledger);
      const off = pick(rand, [10, 15, 20, 25, 30]);
      const dealPrice = Math.max(1, dealItem.price * (1 - off / 100));
      deal = { item: dealItem.label, off, price: dealPrice, col: pick(rand, [pal.neonA, pal.neonB, pal.neonC]) };
      nextDealAt = PHASE_DUR * 3 + 1.1 + rand() * 3.8;
    }
  }

  function drawBackdrop(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, pal.sky0);
    sky.addColorStop(0.55, pal.sky1);
    sky.addColorStop(1, '#020208');
    ctx.fillStyle = sky;
    ctx.fillRect(0,0,w,h);

    // distant silhouettes
    const horizon = h * 0.58;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    const steps = 18;
    for (let i=0;i<=steps;i++){
      const x = (i / steps) * w;
      const hh = h * (0.05 + 0.10 * hash01(i * 19.31 + seed * 0.00001));
      ctx.lineTo(x, horizon - hh);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // wet pavement / reflections base
    const roadY = h * 0.63;
    const road = ctx.createLinearGradient(0, roadY, 0, h);
    road.addColorStop(0, 'rgba(5,6,14,0.0)');
    road.addColorStop(0.12, 'rgba(3,4,10,0.65)');
    road.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = road;
    ctx.fillRect(0, roadY, w, h - roadY);
  }

  function drawSigns(ctx){
    // glow layer
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i=0;i<signs.length;i++){
      const s = signs[i];
      const base = 0.55 + 0.45 * Math.sin(t * s.freq + s.ph);
      const fl = (i === flickerSign ? flicker : 0);
      const on = clamp(0.35 + base * 0.8 - fl * 0.65, 0.06, 1);

      ctx.save();
      ctx.globalAlpha = 0.30 + on * 0.65;
      ctx.shadowColor = s.col;
      ctx.shadowBlur = 18 + on * 22;
      ctx.fillStyle = s.col;
      roundedRect(ctx, s.x, s.y, s.w, s.h, Math.max(10, s.h * 0.22));
      ctx.fill();

      // inner glass
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.18 + on * 0.22;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      roundedRect(ctx, s.x + s.w*0.06, s.y + s.h*0.18, s.w*0.88, s.h*0.64, Math.max(8, s.h*0.18));
      ctx.fill();

      // text
      ctx.globalAlpha = 0.75 * on;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = `${Math.max(12, Math.floor(s.h * 0.45))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(s.text, s.x + s.w*0.10, s.y + s.h*0.52);

      ctx.restore();

      // reflection streak on road
      const roadY = h * 0.63;
      const cx = s.x + s.w * 0.5;
      const rw = s.w * (0.55 + on * 0.35);
      const rr = ctx.createLinearGradient(0, roadY, 0, h);
      rr.addColorStop(0, `rgba(255,255,255,${0.0})`);
      rr.addColorStop(0.08, `rgba(255,255,255,${0.10 * on})`);
      rr.addColorStop(0.55, `rgba(255,255,255,${0.02 * on})`);
      rr.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.save();
      ctx.globalAlpha = 0.35 * on;
      ctx.fillStyle = rr;
      ctx.fillRect(cx - rw*0.5, roadY, rw, h - roadY);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawStall(ctx){
    const stallY = h * 0.56;
    const awningH = h * 0.08;

    // awning
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, stallY - awningH, w, awningH);

    const stripeW = Math.max(18, Math.floor(w * 0.03));
    for (let x=0; x<w + stripeW; x+=stripeW){
      ctx.fillStyle = (Math.floor(x / stripeW) % 2 === 0) ? `rgba(255,255,255,0.06)` : `rgba(0,0,0,0.06)`;
      ctx.fillRect(x, stallY - awningH, stripeW, awningH);
    }

    // counter
    const counterH = h * 0.16;
    const cg = ctx.createLinearGradient(0, stallY, 0, stallY + counterH);
    cg.addColorStop(0, 'rgba(10,8,18,0.75)');
    cg.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, stallY, w, counterH);

    // neon edge
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowColor = pal.neonB;
    ctx.shadowBlur = 18;
    ctx.fillStyle = pal.neonB;
    ctx.globalAlpha = 0.08 + 0.04 * Math.sin(t * 1.2);
    ctx.fillRect(0, stallY, w, Math.max(2, Math.floor(dpr)));
    ctx.restore();

    // price tags
    for (const tg of tags){
      const tw = w * 0.12;
      const th = h * 0.055;
      const x = tg.x - tw * 0.5;
      const y = tg.y;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.55;
      ctx.shadowColor = tg.col;
      ctx.shadowBlur = 16;
      ctx.fillStyle = tg.col;
      roundedRect(ctx, x, y, tw, th, th * 0.22);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(tg.lab, x + tw * 0.10, y + th * 0.52);
      ctx.fillText(`$${tg.price.toFixed(2)}`, x + tw * 0.62, y + th * 0.52);
      ctx.restore();
    }
  }

  function drawRain(ctx){
    const slant = -0.28;

    // far
    ctx.save();
    ctx.strokeStyle = 'rgba(180,220,255,0.18)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    ctx.beginPath();
    for (const d of dropsFar){
      const x2 = d.x + d.len * slant;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(x2, d.y + d.len);
    }
    ctx.stroke();
    ctx.restore();

    // near (fatter, varied alpha)
    ctx.save();
    for (const d of dropsNear){
      const a = d.a * (0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.0 + d.ph)));
      ctx.strokeStyle = `rgba(190,235,255,${a.toFixed(3)})`;
      ctx.lineWidth = Math.max(1, d.w * (dpr * 0.65));
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.len * slant, d.y + d.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawOverlayPaper(ctx, { phaseId, phaseP }){
    const pad = Math.floor(Math.min(w, h) * 0.06);

    // base panel
    const panelW = Math.min(w * 0.46, 520);
    const panelH = Math.min(h * 0.44, 420);
    const px = w - pad - panelW;
    const py = pad + h * 0.02;

    // paper
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = pal.paper;
    roundedRect(ctx, px, py, panelW, panelH, 16);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    ctx.stroke();

    // header
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('NEON NIGHT MARKET LEDGER', px + 18, py + 14);

    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const cycT = (t % CYCLE_DUR);
    const hh = Math.floor(cycT) % 24;
    const mm = Math.floor((cycT * 2.2) % 60);
    ctx.fillText(`TIME ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}  •  STALL 07`, px + 18, py + 14 + font + 6);

    // columns
    const colY = py + 14 + font + 6 + small + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(px + 18, colY, panelW - 36, 2);

    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('QTY', px + 18, colY + 8);
    ctx.fillText('ITEM', px + 18 + panelW * 0.16, colY + 8);
    ctx.fillText('TOTAL', px + panelW * 0.73, colY + 8);

    // entries
    const bodyY = colY + 28;
    const rowH = Math.max(18, Math.floor(small * 1.35));

    let showN = 6;
    if (phaseId === 'ledger') showN = 6 + Math.floor(phaseP * 8);
    else if (phaseId === 'receipts') showN = 4 + Math.floor(phaseP * 3);
    else if (phaseId === 'deal') showN = 8;

    const maxRows = Math.floor((panelH - (bodyY - py) - 18) / rowH);
    showN = clamp(showN, 1, maxRows);

    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    for (let i=0;i<showN;i++){
      const e = ledger[i];
      const y = bodyY + i * rowH;
      const ink = 0.62 + 0.18 * Math.sin(t * 0.9 + i * 0.8);
      ctx.fillStyle = `rgba(0,0,0,${ink.toFixed(3)})`;
      const total = e.qty * e.price;
      ctx.fillText(String(e.qty).padStart(2,' '), px + 18, y);
      ctx.fillText(e.label, px + 18 + panelW * 0.16, y);
      ctx.fillText(`$${total.toFixed(2)}`, px + panelW * 0.73, y);

      // faint ruled line
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(px + 18, y + rowH - 6, panelW - 36, 1);
    }

    // scribble highlight (during ledger phase)
    if (phaseId === 'ledger'){
      const a = 0.25 + 0.45 * phaseP;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = a;
      ctx.strokeStyle = pal.neonA;
      ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.2));
      ctx.beginPath();
      const sx = px + panelW * 0.18;
      const sy = bodyY + (showN - 1) * rowH + rowH * 0.25;
      const ex = px + panelW * (0.64 + 0.10 * Math.sin(t * 1.3));
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, sy - rowH * 0.20);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawReceipts(ctx, { phaseId, phaseP }){
    if (phaseId !== 'receipts' && phaseId !== 'deal') return;

    const pad = Math.floor(Math.min(w, h) * 0.06);

    const baseW = Math.min(w * 0.32, 380);
    const baseH = baseW * 0.56;
    const x0 = pad;
    const y0 = h * 0.20 + (1 - phaseP) * h * 0.02;

    const idx = Math.floor(t / 4.8) % receipts.length;
    const f = (t / 4.8) % 1;
    const flip = ease(f);

    for (let s=0;s<3;s++){
      const r = receipts[(idx + s) % receipts.length];
      const w2 = baseW * (1 - s * 0.06);
      const h2 = baseH * (1 - s * 0.06);
      const x = x0 + s * baseW * 0.08;
      const y = y0 + s * baseH * 0.10;
      const rot = (s === 0 ? lerp(-0.03, 0.03, flip) : (s - 1) * 0.02);

      ctx.save();
      ctx.translate(x + w2*0.5, y + h2*0.5);
      ctx.rotate(rot);

      // shadow
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      roundedRect(ctx, -w2*0.48 + 6, -h2*0.46 + 10, w2, h2, 14);
      ctx.fill();
      ctx.restore();

      // paper
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = 'rgba(252,250,244,0.96)';
      roundedRect(ctx, -w2*0.48, -h2*0.46, w2, h2, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      ctx.stroke();

      // header strip
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fillRect(-w2*0.48, -h2*0.46, w2, Math.max(18, h2 * 0.16));

      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'top';
      ctx.fillText('RECEIPT', -w2*0.42, -h2*0.42 + 6);
      ctx.fillText(`#${String(r.id + 17).padStart(3,'0')}`, -w2*0.42 + w2*0.32, -h2*0.42 + 6);

      // lines
      ctx.font = `${Math.max(10, Math.floor(mono * 0.80))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      let yy = -h2*0.30;
      for (const line of r.lines){
        ctx.fillText(line, -w2*0.42, yy);
        yy += h2 * 0.11;
      }

      // total
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-w2*0.42, h2*0.23, w2*0.84, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText('TOTAL', -w2*0.42, h2*0.28);
      ctx.fillText(r.total, w2*0.18, h2*0.28);

      ctx.restore();
    }

    // flip click (audio) — only in receipts phase
    if (phaseId === 'receipts'){
      const nearEdge = Math.abs(f - 0.02) < 0.01;
      if (nearEdge && audio.enabled) safeBeep({ freq: 520 + rand()*120, dur: 0.012, gain: 0.004, type: 'square' });
    }
  }

  function drawDealCard(ctx, { phaseId, phaseP }){
    if (phaseId !== 'deal') return;

    const cardW = Math.min(w * 0.64, 720);
    const cardH = Math.max(70, Math.floor(cardW * 0.18));
    const x = w * 0.5 - cardW * 0.5;
    const y = h * 0.11 + (1 - phaseP) * h * 0.03;

    const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.2));
    const a = 0.75 + 0.25 * pulse + dealPulse * 0.35;

    ctx.save();

    // backdrop
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundedRect(ctx, x, y, cardW, cardH, 18);
    ctx.fill();

    // neon border
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.55 * a;
    ctx.shadowColor = deal.col;
    ctx.shadowBlur = 28 + 14 * pulse;
    ctx.strokeStyle = deal.col;
    ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.4));
    roundedRect(ctx, x, y, cardW, cardH, 18);
    ctx.stroke();

    // text
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('DEAL OF THE MINUTE', x + cardW * 0.06, y + cardH * 0.40);

    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const rhs = `${deal.item}  —  ${deal.off}% OFF  →  $${deal.price.toFixed(2)}`;
    ctx.fillText(rhs, x + cardW * 0.06, y + cardH * 0.72);

    ctx.restore();
  }

  function drawHud(ctx, { phase }){
    const pad = Math.floor(Math.min(w, h) * 0.06);

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    roundedRect(ctx, pad, h - pad - Math.max(52, font * 2.2), Math.min(w * 0.62, 620), Math.max(52, font * 2.2), 16);
    ctx.fill();

    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(245,245,245,0.84)';
    ctx.textBaseline = 'top';
    ctx.fillText('NEON NIGHT MARKET LEDGER', pad + 18, h - pad - Math.max(52, font * 2.2) + 12);

    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = pal.neonB;
    ctx.fillText(`MODE: ${phase.label}`, pad + 18, h - pad - Math.max(52, font * 2.2) + 12 + font + 6);

    ctx.restore();
  }

  function render(ctx){
    const cycT = t % CYCLE_DUR;
    const phaseIdx = Math.floor(cycT / PHASE_DUR);
    const phase = PHASES[phaseIdx];
    const phaseP = (cycT - phaseIdx * PHASE_DUR) / PHASE_DUR;

    drawBackdrop(ctx);
    drawSigns(ctx);
    drawStall(ctx);

    // wet neon sheen + deal flash
    if (dealFlash > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.22 * dealFlash;
      ctx.fillStyle = deal.col;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    drawRain(ctx);

    drawOverlayPaper(ctx, { phaseId: phase.id, phaseP });
    drawReceipts(ctx, { phaseId: phase.id, phaseP });
    drawDealCard(ctx, { phaseId: phase.id, phaseP });
    drawHud(ctx, { phase });

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.5, Math.min(w,h)*0.18, w*0.5, h*0.5, Math.max(w,h)*0.86);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.48)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);
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
