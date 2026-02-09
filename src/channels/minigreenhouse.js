import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

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

  let font = 16;
  let small = 12;
  let mono = 13;

  const palettes = [
    {
      bg0: '#04110c', bg1: '#0a2a1a', glass: 'rgba(160,255,210,0.10)',
      frame: 'rgba(220,255,235,0.20)', ink: '#e9fff5', sub: 'rgba(233,255,245,0.62)',
      accent: '#7bffb6', warn: '#ffd36a', hot: '#ff6a8a', ok: '#6cf2ff',
      console0: '#071a12', console1: '#0d2a1a'
    },
    {
      bg0: '#061316', bg1: '#0b2a24', glass: 'rgba(160,230,255,0.10)',
      frame: 'rgba(230,250,255,0.20)', ink: '#f0fdff', sub: 'rgba(240,253,255,0.62)',
      accent: '#6cf2ff', warn: '#ffd36a', hot: '#ff4ea6', ok: '#b7ff8a',
      console0: '#06181a', console1: '#0b2a2d'
    },
    {
      bg0: '#0b0f06', bg1: '#25310f', glass: 'rgba(255,250,200,0.09)',
      frame: 'rgba(255,255,240,0.18)', ink: '#fbfff0', sub: 'rgba(251,255,240,0.60)',
      accent: '#b7ff8a', warn: '#ffd36a', hot: '#ff6a8a', ok: '#6cf2ff',
      console0: '#171a07', console1: '#2a2d0b'
    },
  ];
  const pal = pick(rand, palettes);

  // 4-phase loop: mist -> vent -> heat -> drip
  const PHASES = [
    { key: 'MIST', dur: 24 },
    { key: 'VENT', dur: 24 },
    { key: 'HEAT', dur: 24 },
    { key: 'DRIP', dur: 24 },
  ];
  const CYCLE_DUR = PHASES.reduce((a,p)=>a+p.dur, 0);

  // layout
  let house = { x:0, y:0, w:0, h:0 };
  let consoleR = { x:0, y:0, w:0, h:0 };
  let pane = { x:0, y:0, w:0, h:0 };

  // scene
  let plants = []; // {x, y, baseH, sway, leafs, hue}
  let droplets = []; // {x, y, r, vy, a}
  let sparkles = []; // {x, y, r, a, life, vx, vy}

  // state
  let lastPhase = -1;
  let phaseFlash = 0;
  let dewBurstAt = 0;

  // audio
  let ambience = null;
  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function buildPlants(){
    const rows = 3 + ((rand()*3)|0);
    const count = 26 + ((rand()*20)|0);

    plants = [];
    for (let i=0;i<count;i++){
      const row = i % rows;
      const rx = (i / count);
      const x = house.x + house.w * (0.08 + 0.84*rx) + (rand()-0.5) * house.w * 0.02;
      const y = house.y + house.h * (0.64 + row * 0.09) + (rand()-0.5) * house.h * 0.02;
      const baseH = house.h * (0.10 + rand()*0.20) * (0.85 + row*0.12);
      plants.push({
        x,
        y,
        baseH,
        sway: rand()*10,
        leafs: 2 + ((rand()*4)|0),
        hue: 95 + rand()*35,
      });
    }
  }

  function buildDroplets(){
    const n = 90;
    droplets = Array.from({ length: n }, () => ({
      x: pane.x + rand()*pane.w,
      y: pane.y + rand()*pane.h,
      r: 0.6 + rand()*2.2,
      vy: 8 + rand()*22,
      a: 0.04 + rand()*0.10,
    }));
  }

  function regenLayout(){
    const pad = Math.floor(Math.min(w,h) * 0.06);

    house = {
      x: pad,
      y: Math.floor(h * 0.10),
      w: Math.floor(w * 0.66),
      h: Math.floor(h * 0.80),
    };

    consoleR = {
      x: house.x + house.w + Math.floor(pad * 0.55),
      y: house.y + Math.floor(house.h * 0.08),
      w: w - (house.x + house.w) - Math.floor(pad * 1.55),
      h: Math.floor(house.h * 0.84),
    };

    pane = {
      x: house.x + Math.floor(house.w * 0.06),
      y: house.y + Math.floor(house.h * 0.10),
      w: Math.floor(house.w * 0.88),
      h: Math.floor(house.h * 0.54),
    };

    buildPlants();
    buildDroplets();
  }

  function reset(){
    t = 0;
    lastPhase = -1;
    phaseFlash = 0;
    dewBurstAt = 3 + rand()*5;
    sparkles = [];

    for (const d of droplets){
      d.x = pane.x + rand()*pane.w;
      d.y = pane.y + rand()*pane.h;
    }
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w,h) / 28));
    small = Math.max(11, Math.floor(font * 0.76));
    mono = Math.max(12, Math.floor(font * 0.84));

    regenLayout();
    reset();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    // quiet greenhouse ambience: soft noise + low drone
    const n = audio.noiseSource({ type: 'pink', gain: 0.0024 });
    n.start();
    const d = simpleDrone(audio, { root: 36 + rand()*10, detune: 0.55, gain: 0.010 });
    ambience = { stop(){ try{n.stop()}catch{} try{d.stop()}catch{} } };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){ onAudioOff(); }

  function phaseAt(time){
    const cyc = time % CYCLE_DUR;
    let acc = 0;
    for (let i=0;i<PHASES.length;i++){
      const p = PHASES[i];
      if (cyc < acc + p.dur) return { idx:i, key:p.key, local:(cyc-acc)/p.dur, cyc };
      acc += p.dur;
    }
    return { idx: 0, key: PHASES[0].key, local: 0, cyc };
  }

  function spawnDewBurst(){
    const n = 24 + ((rand()*18)|0);
    for (let i=0;i<n;i++){
      const x = house.x + house.w*(0.18 + rand()*0.64);
      const y = house.y + house.h*(0.20 + rand()*0.58);
      sparkles.push({
        x,
        y,
        r: 0.8 + rand()*2.8,
        a: 0.22 + rand()*0.26,
        life: 0.7 + rand()*0.7,
        vx: (rand()-0.5) * 30,
        vy: -10 - rand()*25,
      });
    }
  }

  function update(dt){
    t += dt;
    phaseFlash = Math.max(0, phaseFlash - dt * 1.8);

    const ph = phaseAt(t);
    if (ph.idx !== lastPhase){
      lastPhase = ph.idx;
      phaseFlash = 1;

      // phase change beeps
      const tones = { MIST: 520, VENT: 780, HEAT: 320, DRIP: 640 };
      safeBeep({ freq: tones[ph.key] || 600, dur: 0.045, gain: 0.014, type: 'square' });
      safeBeep({ freq: (tones[ph.key] || 600) * 1.5, dur: 0.035, gain: 0.010, type: 'triangle' });

      if (ph.key === 'DRIP') spawnDewBurst();
    }

    // periodic dew sparkle moments (even outside DRIP)
    if (t >= dewBurstAt){
      spawnDewBurst();
      dewBurstAt = t + 6.5 + rand()*9.5;
    }

    // droplets: drift/slide; more active in MIST/DRIP
    const misty = (ph.key === 'MIST' || ph.key === 'DRIP') ? 1 : 0;
    const slip = lerp(0.35, 1.0, misty);
    for (const d of droplets){
      d.y += d.vy * dt * slip;
      d.x += Math.sin((d.y*0.01) + t*0.6) * dt * 6 * slip;
      if (d.y > pane.y + pane.h + 12){
        d.y = pane.y - 12;
        d.x = pane.x + rand()*pane.w;
      }
    }

    // sparkles
    for (const s of sparkles){
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 18 * dt;
      s.a *= (1 - dt*1.2);
    }
    if (sparkles.length){
      sparkles = sparkles.filter(s => s.life > 0.02 && s.a > 0.01);
      if (sparkles.length > 220) sparkles.length = 220;
    }
  }

  function drawGreenhouse(ctx, ph, growth){
    // background
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(1, pal.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // soft light beams
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(120,255,200,${0.06 + 0.05*(ph.key==='MIST')})`;
    ctx.fillRect(house.x, house.y + house.h*0.08, house.w, house.h*0.55);
    ctx.restore();

    // frame + glass
    const r = Math.floor(Math.min(house.w, house.h) * 0.02);
    ctx.save();
    roundedRect(ctx, house.x, house.y, house.w, house.h, r);
    ctx.strokeStyle = pal.frame;
    ctx.lineWidth = Math.max(2, Math.floor(2.2 * dpr));
    ctx.stroke();

    // roof peak line
    ctx.beginPath();
    ctx.moveTo(house.x + house.w*0.08, house.y + house.h*0.18);
    ctx.lineTo(house.x + house.w*0.50, house.y + house.h*0.04);
    ctx.lineTo(house.x + house.w*0.92, house.y + house.h*0.18);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(2, Math.floor(2.0 * dpr));
    ctx.stroke();

    // panes
    ctx.fillStyle = pal.glass;
    roundedRect(ctx, pane.x, pane.y, pane.w, pane.h, r);
    ctx.fill();

    // condensation droplets
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const d of droplets){
      ctx.fillStyle = `rgba(220,255,245,${d.a})`;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r*0.8, d.r, 0, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // plant beds
    const bedY = house.y + house.h*0.70;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(house.x + house.w*0.06, bedY, house.w*0.88, house.h*0.22);

    // plants
    for (const p of plants){
      const sway = Math.sin(t*0.7 + p.sway) * 0.012;
      const gx = growth;
      const hh = p.baseH * (0.75 + 0.35*gx) * (0.92 + 0.08*Math.sin(t*0.25 + p.sway));
      const x2 = p.x + sway*house.w;
      const y2 = p.y;
      const top = y2 - hh;

      ctx.strokeStyle = `hsla(${p.hue}, 55%, 55%, 0.75)`;
      ctx.lineWidth = Math.max(1, Math.floor(1.4 * dpr));
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.quadraticCurveTo(x2 + sway*house.w*0.8, y2 - hh*0.55, x2 + sway*house.w*1.2, top);
      ctx.stroke();

      // leaves
      for (let i=0;i<p.leafs;i++){
        const ly = y2 - hh*(0.20 + i*0.18);
        const dir = (i%2===0 ? 1 : -1);
        const lw = house.w * (0.012 + 0.008*rand());
        ctx.fillStyle = `hsla(${p.hue + 8}, 60%, ${48 + i*4}%, 0.55)`;
        ctx.beginPath();
        ctx.ellipse(x2 + dir*lw*1.2, ly, lw*1.4, lw*0.65, dir*0.5, 0, Math.PI*2);
        ctx.fill();
      }

      // tip glow in HEAT
      if (ph.key === 'HEAT'){
        const a = 0.06 + 0.04*Math.sin(t*3 + p.sway);
        ctx.fillStyle = `rgba(255,210,160,${a})`;
        ctx.beginPath();
        ctx.arc(x2, top, 6*dpr, 0, Math.PI*2);
        ctx.fill();
      }
    }

    // mist overlay
    if (ph.key === 'MIST'){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const a = 0.10 + 0.14*ease(ph.local);
      ctx.fillStyle = `rgba(160,255,210,${a})`;
      ctx.fillRect(house.x, house.y + house.h*0.22, house.w, house.h*0.62);
      ctx.restore();
    }

    // heat glow
    if (ph.key === 'HEAT'){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const a = 0.08 + 0.14*ease(ph.local);
      ctx.fillStyle = `rgba(255,180,120,${a})`;
      ctx.fillRect(house.x + house.w*0.12, house.y + house.h*0.56, house.w*0.76, house.h*0.36);
      ctx.restore();
    }

    // sparkles
    if (sparkles.length){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const s of sparkles){
        ctx.fillStyle = `rgba(255,255,255,${s.a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function drawGaugeArc(ctx, cx, cy, r, v, color){
    // v 0..1
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;

    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(2, Math.floor(2.1*dpr));
    ctx.stroke();

    const av = a0 + (a1 - a0) * clamp(v, 0, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, av);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, Math.floor(3.0*dpr));
    ctx.stroke();
  }

  function drawConsole(ctx, ph, tempC, hum, co2){
    const rr = Math.floor(Math.min(consoleR.w, consoleR.h) * 0.05);

    const cg = ctx.createLinearGradient(consoleR.x, consoleR.y, consoleR.x, consoleR.y + consoleR.h);
    cg.addColorStop(0, pal.console0);
    cg.addColorStop(1, pal.console1);
    ctx.fillStyle = cg;
    roundedRect(ctx, consoleR.x, consoleR.y, consoleR.w, consoleR.h, rr);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(2, Math.floor(2.0*dpr));
    ctx.stroke();

    const pad = Math.floor(consoleR.w * 0.08);
    const titleY = consoleR.y + pad*0.9;

    ctx.fillStyle = pal.ink;
    ctx.font = `700 ${font}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.fillText('CLIMATE CONSOLE', consoleR.x + pad, titleY);

    ctx.fillStyle = pal.sub;
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.fillText(`PHASE: ${ph.key}`, consoleR.x + pad, titleY + Math.floor(font*1.25));

    // gauges
    const gx = consoleR.x + pad;
    const gy = consoleR.y + Math.floor(consoleR.h * 0.30);
    const gw = consoleR.w - pad*2;

    const r = Math.floor(Math.min(gw, consoleR.h) * 0.18);
    const cols = 2;
    const gap = Math.floor(gw * 0.12);
    const c1 = { x: gx + r, y: gy + r };
    const c2 = { x: gx + r + gap + 2*r, y: gy + r };
    const c3 = { x: gx + r, y: gy + r + Math.floor(r*2.35) };

    // temp
    const tempV = clamp((tempC - 12) / 22, 0, 1);
    drawGaugeArc(ctx, c1.x, c1.y, r, tempV, `rgba(255,140,120,0.85)`);
    ctx.fillStyle = pal.ink;
    ctx.font = `700 ${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.fillText(`${tempC.toFixed(1)}°C`, c1.x - r*0.7, c1.y + r*0.95);
    ctx.fillStyle = pal.sub;
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.fillText('TEMP', c1.x - r*0.55, c1.y - r*0.95);

    // humidity
    const humV = clamp(hum / 100, 0, 1);
    drawGaugeArc(ctx, c2.x, c2.y, r, humV, `rgba(120,255,200,0.82)`);
    ctx.fillStyle = pal.ink;
    ctx.font = `700 ${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.fillText(`${Math.round(hum)}%`, c2.x - r*0.55, c2.y + r*0.95);
    ctx.fillStyle = pal.sub;
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.fillText('HUM', c2.x - r*0.48, c2.y - r*0.95);

    // CO2 bar
    const bx = c3.x - r*0.95;
    const by = c3.y - r*0.55;
    const bw = gw - r*0.1;
    const bh = Math.floor(r*0.48);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundedRect(ctx, bx, by, bw, bh, Math.floor(bh*0.5));
    ctx.fill();

    const co2V = clamp((co2 - 350) / 900, 0, 1);
    ctx.fillStyle = `rgba(108,242,255,${0.55 + 0.25*phaseFlash})`;
    roundedRect(ctx, bx, by, bw*co2V, bh, Math.floor(bh*0.5));
    ctx.fill();

    ctx.fillStyle = pal.sub;
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.fillText(`CO₂ ${Math.round(co2)} ppm`, bx, by - Math.floor(small*0.55));

    // actuators
    const ay = consoleR.y + consoleR.h - Math.floor(pad*1.4);
    const labels = [
      { k: 'MIST', on: ph.key === 'MIST', c: pal.accent },
      { k: 'FAN', on: ph.key === 'VENT', c: pal.ok },
      { k: 'HEAT', on: ph.key === 'HEAT', c: pal.hot },
      { k: 'DRIP', on: ph.key === 'DRIP', c: pal.warn },
    ];

    let x = consoleR.x + pad;
    for (const a of labels){
      const pillW = Math.floor(consoleR.w * 0.20);
      const pillH = Math.floor(font * 1.05);
      ctx.fillStyle = a.on ? a.c : 'rgba(255,255,255,0.08)';
      roundedRect(ctx, x, ay - pillH, pillW, pillH, Math.floor(pillH*0.5));
      ctx.fill();
      ctx.fillStyle = a.on ? '#04110c' : pal.sub;
      ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
      ctx.fillText(a.k, x + Math.floor(pillW*0.18), ay - Math.floor(pillH*0.26));
      x += pillW + Math.floor(pad*0.35);
    }

    // subtle scanline / highlight
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255,255,255,${0.04 + 0.06*phaseFlash})`;
    ctx.fillRect(consoleR.x + 2, consoleR.y + consoleR.h*(0.25 + 0.65*Math.sin(t*0.16)), consoleR.w - 4, 2*dpr);
    ctx.restore();
  }

  function draw(ctx){
    const ph = phaseAt(t);

    // soft values driven by phases (smooth-ish)
    // temp
    const tempTargets = { MIST: 18, VENT: 16, HEAT: 26, DRIP: 20 };
    const humTargets = { MIST: 86, VENT: 52, HEAT: 44, DRIP: 74 };
    const co2Targets = { MIST: 620, VENT: 420, HEAT: 520, DRIP: 690 };

    const nextKey = PHASES[(ph.idx + 1) % PHASES.length].key;
    const s = ease(ph.local);

    const tempC = lerp(tempTargets[ph.key], tempTargets[nextKey], s) + Math.sin(t*0.22) * 0.35;
    const hum = lerp(humTargets[ph.key], humTargets[nextKey], s) + Math.sin(t*0.18 + 1.2) * 1.3;
    const co2 = lerp(co2Targets[ph.key], co2Targets[nextKey], s) + Math.sin(t*0.10 + 0.6) * 18;

    // plant growth cycles (deterministic loop)
    const growth = 0.5 + 0.5*Math.sin((t / CYCLE_DUR) * Math.PI*2 - Math.PI/2);

    drawGreenhouse(ctx, ph, growth);

    // flash on phase change
    if (phaseFlash > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,255,255,${0.06 * phaseFlash})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    drawConsole(ctx, ph, tempC, hum, co2);

    // title tag
    ctx.save();
    ctx.fillStyle = pal.sub;
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.fillText('MINI GREENHOUSE', house.x, house.y - Math.floor(small*0.6));
    ctx.restore();
  }

  // init lazily on first resize
  return {
    onResize,
    onAudioOn,
    onAudioOff,
    update,
    draw,
    destroy,
  };
}
