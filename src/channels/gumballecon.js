// REVIEWED: 2026-02-10
import { mulberry32, clamp } from '../util/prng.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function roundRect(ctx, x, y, w, h, r){
  r = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmtMoney(v){
  const x = Math.max(0, v);
  return `$${x.toFixed(2)}`;
}

function hsl(h, s, l, a=1){ return `hsla(${h}, ${s}%, ${l}%, ${a})`; }

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // economy
  let stock = 0;
  let cash = 0;
  let price = 0.25;
  let basePrice = 0.25;
  let demand = 0.35;
  let cpi = 100;

  // events
  let nextCoinAt = 0;
  let nextSpikeAt = 0;
  let spike = { t0: 0, dur: 0, active: false };
  let coupon = { t0: 0, dur: 0, active: false };
  let shake = 0;

  // scene
  let s = 1;
  let cx = 0;
  let cy = 0;
  let globeR = 0;
  let baseW = 0;
  let baseH = 0;
  let slot = { x: 0, y: 0, w: 0, h: 0 };
  let chute = { x0: 0, y0: 0, x1: 0, y1: 0 };

  // gumballs in globe
  let balls = []; // fixed objects
  const BALL_N = 26;

  // coin particles (reuse)
  const COIN_N = 10;
  let coins = []; // {on,x,y,vx,vy,r,spin}

  // dispensed gumballs
  const DISP_N = 7;
  let disp = []; // {on,x,y,vx,vy,life,r,col}

  // coupon tokens (reuse)
  const COUPON_N = 8;
  let coupons = []; // {on,x,y,vx,vy,life,code}

  // charts
  const HIST = 140;
  let histP = new Float32Array(HIST);
  let histS = new Float32Array(HIST);
  let histI = 0;

  // audio
  let ambience = null;
  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function stopAmbience({ clearCurrent = false } = {}){
    const handle = ambience;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ambience = null;
  }

  function pick(arr){ return arr[(rand() * arr.length) | 0]; }

  function resetSim(){
    t = 0;

    basePrice = 0.2 + ((rand() * 20) | 0) / 100; // 0.20..0.39
    price = basePrice;
    stock = 60 + ((rand() * 35) | 0);
    cash = 0;
    demand = 0.32 + rand() * 0.24;
    cpi = 100;

    nextCoinAt = 0.6 + rand() * 1.1;
    nextSpikeAt = 22 + rand() * 26;
    spike = { t0: 0, dur: 0, active: false };
    coupon = { t0: 0, dur: 0, active: false };
    shake = 0;

    // init balls (stable per seed)
    const pal = [
      { h: 330, s: 90, l: 62 }, // pink
      { h: 195, s: 85, l: 55 }, // cyan
      { h: 55, s: 95, l: 60 },  // lemon
      { h: 120, s: 70, l: 54 }, // mint
      { h: 18, s: 92, l: 58 },  // orange
    ];

    balls = Array.from({ length: BALL_N }, (_, i) => {
      const p = pal[(i + ((rand() * pal.length) | 0)) % pal.length];
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 0.82;
      return {
        // relative to globe; not physical, just cute
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        z: 0.35 + rand() * 0.9,
        rr: 0.04 + rand() * 0.022,
        hue: p.h + (rand() * 18 - 9),
        sat: p.s,
        lit: p.l,
        bob: rand() * 10,
      };
    });

    coins = Array.from({ length: COIN_N }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, r: 6, spin: 0 }));
    disp = Array.from({ length: DISP_N }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, r: 6, col: '#fff' }));
    coupons = Array.from({ length: COUPON_N }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, code: 'SAVE' }));

    histP.fill(price);
    histS.fill(stock);
    histI = 0;
  }

  function layout(){
    s = Math.min(w, h);
    cx = w * 0.47;
    cy = h * 0.54;

    globeR = s * 0.235;
    baseW = globeR * 1.55;
    baseH = globeR * 0.98;

    slot.w = globeR * 0.34;
    slot.h = globeR * 0.11;
    slot.x = cx - slot.w * 0.5;
    slot.y = cy + globeR * 0.19;

    chute.x0 = cx + baseW * 0.22;
    chute.y0 = cy + globeR * 0.06;
    chute.x1 = cx + baseW * 0.42;
    chute.y1 = cy + globeR * 0.29;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    layout();
    resetSim();
  }

  function onResize(width, height, dprIn){
    w = width;
    h = height;
    dpr = dprIn || 1;
    layout();
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // defensively stop any existing ambience we started
    stopAmbience({ clearCurrent: true });

    // tiny candy-shop hum
    const n = audio.noiseSource({ type: 'pink', gain: 0.0016 });
    n.start();

    const handle = {
      stop(){
        try { n.stop(); } catch {}
      }
    };

    ambience = handle;
    audio.setCurrent(handle);
  }

  function onAudioOff(){
    // stop/clear everything we own; only clear AudioManager.current if it's ours
    stopAmbience({ clearCurrent: true });
  }

  function destroy(){
    stopAmbience({ clearCurrent: true });
  }

  function spawnCoin(rate){
    const c = coins.find(x => !x.on);
    if (!c) return;

    c.on = true;
    c.r = Math.max(5, s * (0.008 + rand() * 0.002));
    c.x = slot.x + slot.w * (0.2 + rand() * 0.6);
    c.y = slot.y - globeR * (0.75 + rand() * 0.35);
    c.vx = (rand() - 0.5) * globeR * 0.25;
    c.vy = globeR * (0.85 + rand() * 0.35) * (0.7 + rate * 0.9);
    c.spin = rand() * Math.PI * 2;

    safeBeep({ freq: 720 + rand() * 160, dur: 0.03, gain: 0.015, type: 'square' });
  }

  function dispenseBall(){
    const p = balls[(rand() * balls.length) | 0];
    const d = disp.find(x => !x.on);
    if (!d) return;
    d.on = true;
    d.r = globeR * (0.07 + rand() * 0.02);
    d.x = chute.x0;
    d.y = chute.y0;
    d.vx = (chute.x1 - chute.x0) * (0.9 + rand() * 0.15);
    d.vy = (chute.y1 - chute.y0) * (0.9 + rand() * 0.15);
    d.life = 1.2;
    d.col = hsl(p.hue, p.sat, p.lit, 0.98);

    safeBeep({ freq: 420 + rand() * 70, dur: 0.05, gain: 0.02, type: 'triangle' });
  }

  function spawnCoupon(code){
    const c = coupons.find(x => !x.on);
    if (!c) return;
    c.on = true;
    c.code = code;
    c.x = w * (0.64 + rand() * 0.28);
    c.y = h * (0.12 + rand() * 0.08);
    c.vx = (rand() - 0.5) * s * 0.05;
    c.vy = s * (0.14 + rand() * 0.06);
    c.life = 2.7;

    safeBeep({ freq: 980, dur: 0.04, gain: 0.012, type: 'square' });
  }

  function doPurchase(mult=1){
    if (stock <= 0) return;

    stock = Math.max(0, stock - (1 + ((rand() * 2) | 0)));
    const p = price * mult;
    cash += p;

    // micro-inflation model
    const scarcity = 1 - stock / 100;
    const demandKick = demand + (spike.active ? 0.75 : 0);
    price = clamp(basePrice * (1 + 1.25 * scarcity) * (1 + 0.65 * demandKick), 0.15, 2.99);
    cpi = lerp(cpi, 96 + price / basePrice * 10, 0.08);

    dispenseBall();
  }

  function update(dt){
    t += dt;
    shake = Math.max(0, shake - dt * 2.4);

    // demand breathes
    demand = clamp(demand + Math.sin(t * 0.22) * 0.0009 + (rand() - 0.5) * 0.002, 0.18, 0.98);

    // schedule/drive spike & coupon windows
    if (!spike.active && t >= nextSpikeAt){
      spike = { t0: t, dur: 2.6 + rand() * 1.2, active: true };
      coupon = { t0: t + 1.1, dur: 6.5, active: true };
      nextSpikeAt = t + 26 + rand() * 30;
      shake = 1;

      safeBeep({ freq: 160, dur: 0.08, gain: 0.05, type: 'square' });
      safeBeep({ freq: 240, dur: 0.08, gain: 0.03, type: 'square' });
    }

    if (spike.active && (t - spike.t0) >= spike.dur){
      spike.active = false;
    }

    if (coupon.active && (t - coupon.t0) >= coupon.dur){
      coupon.active = false;
    }

    // coins
    const spikeBoost = spike.active ? 2.1 : 1;
    const rate = (0.55 + demand * 1.4) * spikeBoost;
    if (t >= nextCoinAt){
      spawnCoin(rate);
      nextCoinAt = t + (0.65 + rand() * 1.35) / rate;
    }

    for (const c of coins){
      if (!c.on) continue;
      c.spin += dt * (4 + demand * 7);
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += globeR * 0.75 * dt;

      // hit slot
      if (c.y >= slot.y + slot.h * 0.2){
        c.on = false;
        doPurchase(spike.active ? 1.75 : 1);
      }
      // offscreen
      if (c.y > h + c.r * 2) c.on = false;
    }

    for (const d of disp){
      if (!d.on) continue;
      d.life -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += s * 0.5 * dt;
      if (d.life <= 0 || d.y > h + d.r * 2) d.on = false;
    }

    // coupons float during coupon window
    if (coupon.active && t >= coupon.t0){
      if (rand() < 0.06){
        const codes = ['SAVE10', 'B2G1', 'HALFOFF', 'MARKET', 'DENT', 'CPI??'];
        spawnCoupon(pick(codes));
      }
    }

    for (const c of coupons){
      if (!c.on) continue;
      c.life -= dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += s * 0.03 * dt;

      // accept coupon near price panel
      if (c.life < 1.8 && c.y > h * 0.22 && rand() < 0.02){
        // correction
        price = lerp(price, Math.max(basePrice * 0.85, price * 0.7), 0.45);
        cpi = lerp(cpi, 98, 0.18);
        safeBeep({ freq: 880, dur: 0.05, gain: 0.02, type: 'triangle' });
      }

      if (c.life <= 0 || c.y > h + 40) c.on = false;
    }

    // restock slowly
    if (stock < 92 && rand() < 0.02){
      stock = Math.min(100, stock + 1);
    }

    // push chart history
    const pNorm = price;
    histP[histI] = pNorm;
    histS[histI] = stock;
    histI = (histI + 1) % HIST;
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#080018');
    g.addColorStop(0.55, '#12002a');
    g.addColorStop(1, '#05000f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // diagonal candy stripes (slow drift)
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.translate(Math.sin(t * 0.07) * w * 0.02, 0);
    ctx.rotate(-0.18);
    const stripeW = Math.max(24, s * 0.06);
    for (let x = -w; x < w * 2; x += stripeW * 1.2){
      ctx.fillStyle = 'rgba(255, 92, 220, 0.35)';
      ctx.fillRect(x, -h, stripeW * 0.5, h * 3);
      ctx.fillStyle = 'rgba(90, 245, 255, 0.28)';
      ctx.fillRect(x + stripeW * 0.6, -h, stripeW * 0.25, h * 3);
    }
    ctx.restore();

    // subtle grid behind HUD
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, h / 900);
    const step = Math.max(22, s * 0.07);
    const off = (t * 12) % step;
    for (let x = -step; x < w + step; x += step){
      ctx.beginPath();
      ctx.moveTo(x + off, 0);
      ctx.lineTo(x + off, h);
      ctx.stroke();
    }
    for (let y = -step; y < h + step; y += step){
      ctx.beginPath();
      ctx.moveTo(0, y + off);
      ctx.lineTo(w, y + off);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMachine(ctx){
    const j = shake * shake;
    const jx = (Math.sin(t * 28) * 1.2 + Math.sin(t * 18.2) * 0.8) * j * s * 0.008;
    const jy = (Math.sin(t * 22) * 1.1) * j * s * 0.006;

    const gx = cx + jx;
    const gy = cy + jy;

    // base shadow
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, gx - baseW * 0.6, gy + globeR * 0.58, baseW * 1.2, baseH * 0.26, baseH * 0.12);
    ctx.fill();
    ctx.restore();

    // base
    const baseGrad = ctx.createLinearGradient(0, gy, 0, gy + baseH);
    baseGrad.addColorStop(0, '#1c0b34');
    baseGrad.addColorStop(1, '#090117');
    ctx.fillStyle = baseGrad;
    roundRect(ctx, gx - baseW * 0.5, gy + globeR * 0.45, baseW, baseH, baseH * 0.18);
    ctx.fill();

    // highlight lip
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = 'rgba(255, 92, 220, 0.8)';
    roundRect(ctx, gx - baseW * 0.48, gy + globeR * 0.5, baseW * 0.96, baseH * 0.16, baseH * 0.12);
    ctx.fill();
    ctx.restore();

    // globe
    const globeG = ctx.createRadialGradient(gx - globeR * 0.25, gy - globeR * 0.3, globeR * 0.2, gx, gy - globeR * 0.05, globeR * 1.15);
    globeG.addColorStop(0, 'rgba(130, 255, 255, 0.18)');
    globeG.addColorStop(0.55, 'rgba(255, 255, 255, 0.08)');
    globeG.addColorStop(1, 'rgba(255, 120, 210, 0.02)');

    // balls inside (clipped)
    ctx.save();
    ctx.beginPath();
    ctx.arc(gx, gy - globeR * 0.18, globeR, 0, Math.PI * 2);
    ctx.clip();

    // internal swirl
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(gx - globeR, gy - globeR * 1.2, globeR * 2, globeR * 2.4);

    const swirl = (t * 0.22 + (spike.active ? 0.6 : 0)) * (0.35 + demand);
    for (const b of balls){
      const a = swirl + b.bob;
      const px = gx + (b.x * Math.cos(a) - b.y * Math.sin(a)) * globeR * 0.85;
      const py = (gy - globeR * 0.18) + (b.x * Math.sin(a) + b.y * Math.cos(a)) * globeR * 0.85;
      const rr = b.rr * globeR * (0.85 + 0.25 * Math.sin(t * 0.9 + b.bob));
      const shine = 0.18 + 0.2 * Math.sin(t * 0.7 + b.bob);

      ctx.fillStyle = hsl(b.hue, b.sat, b.lit, 0.98);
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,255,255,${shine})`;
      ctx.beginPath();
      ctx.arc(px - rr * 0.25, py - rr * 0.25, rr * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // inner vignette
    const vg = ctx.createRadialGradient(gx, gy - globeR * 0.18, globeR * 0.2, gx, gy - globeR * 0.18, globeR * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vg;
    ctx.fillRect(gx - globeR * 1.2, gy - globeR * 1.5, globeR * 2.4, globeR * 2.6);

    ctx.restore();

    // glass overlay
    ctx.fillStyle = globeG;
    ctx.beginPath();
    ctx.arc(gx, gy - globeR * 0.18, globeR, 0, Math.PI * 2);
    ctx.fill();

    // glass rim
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = Math.max(1, globeR * 0.02);
    ctx.beginPath();
    ctx.arc(gx, gy - globeR * 0.18, globeR, 0, Math.PI * 2);
    ctx.stroke();

    // crank/slot panel
    const panelX = gx - baseW * 0.24;
    const panelY = gy + globeR * 0.08;
    const panelW = baseW * 0.48;
    const panelH = baseH * 0.38;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, panelX, panelY, panelW, panelH, panelH * 0.18);
    ctx.fill();

    // slot
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, slot.x + jx, slot.y + jy, slot.w, slot.h, slot.h * 0.45);
    ctx.fill();

    // coin particles
    for (const c of coins){
      if (!c.on) continue;
      ctx.save();
      ctx.translate(c.x + jx, c.y + jy);
      ctx.rotate(c.spin);
      ctx.fillStyle = 'rgba(255, 208, 90, 0.9)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = Math.max(1, c.r * 0.12);
      ctx.beginPath();
      ctx.ellipse(0, 0, c.r, c.r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // chute
    ctx.save();
    ctx.strokeStyle = 'rgba(90,245,255,0.25)';
    ctx.lineWidth = Math.max(1, globeR * 0.02);
    ctx.beginPath();
    ctx.moveTo(chute.x0 + jx, chute.y0 + jy);
    ctx.lineTo(chute.x1 + jx, chute.y1 + jy);
    ctx.stroke();
    ctx.restore();

    // dispensed balls
    for (const d of disp){
      if (!d.on) continue;
      const a = clamp(d.life / 1.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.85 + (1 - a) * 0.15;
      ctx.fillStyle = d.col;
      ctx.beginPath();
      ctx.arc(d.x + jx, d.y + jy, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // label plate
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    roundRect(ctx, gx - baseW * 0.46, gy + globeR * 0.73, baseW * 0.92, baseH * 0.18, baseH * 0.08);
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(12, Math.floor(s * 0.028))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText('GUMBALL MACRO', gx - baseW * 0.42, gy + globeR * 0.82);
    ctx.restore();
  }

  function drawHud(ctx){
    const pad = Math.max(14, s * 0.026);
    const px = w * 0.62;
    const py = h * 0.12;
    const pw = w - px - pad;
    const ph = h * 0.72;

    // panel
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, px, py, pw, ph, 14);
    ctx.fill();

    // header
    ctx.textBaseline = 'top';
    ctx.font = `${Math.max(12, Math.floor(s * 0.03))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,92,220,0.95)';
    ctx.fillText('GUMBALL MARKET', px + pad, py + pad * 0.7);

    // metrics
    ctx.font = `${Math.max(11, Math.floor(s * 0.026))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const l0 = py + pad * 2.0;
    const line = Math.max(18, s * 0.045);

    const spikeMult = spike.active ? 1.75 : 1;
    const showPrice = price * spikeMult;

    const rows = [
      ['PRICE', fmtMoney(showPrice)],
      ['STOCK', `${Math.round(stock)} / 100`],
      ['DEMAND', `${Math.round(demand * 100)}%`],
      ['CASH', fmtMoney(cash)],
      ['GUMBALL CPI', `${cpi.toFixed(1)}`],
    ];

    for (let i = 0; i < rows.length; i++){
      const y = l0 + i * line;
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.fillText(rows[i][0], px + pad, y);

      ctx.textAlign = 'right';
      ctx.fillStyle = i === 0 && spike.active ? 'rgba(255,210,90,0.95)' : 'rgba(90,245,255,0.9)';
      ctx.fillText(rows[i][1], px + pw - pad, y);
      ctx.textAlign = 'left';
    }

    // mini chart
    const chY = l0 + rows.length * line + pad * 0.7;
    const chH = ph - (chY - py) - pad * 1.2;
    const chW = pw - pad * 2;
    const chX = px + pad;

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, chX, chY, chW, chH, 10);
    ctx.stroke();

    // chart grid
    ctx.save();
    ctx.beginPath();
    ctx.rect(chX, chY, chW, chH);
    ctx.clip();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    for (let k = 1; k < 4; k++){
      const yy = chY + (chH * k) / 4;
      ctx.beginPath();
      ctx.moveTo(chX, yy);
      ctx.lineTo(chX + chW, yy);
      ctx.stroke();
    }
    ctx.restore();

    // plot price
    const maxP = 3.0;
    const minP = 0.1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(chX, chY, chW, chH);
    ctx.clip();

    ctx.lineWidth = Math.max(1, s * 0.002);

    ctx.strokeStyle = 'rgba(255,92,220,0.9)';
    ctx.beginPath();
    for (let i = 0; i < HIST; i++){
      const idx = (histI + i) % HIST;
      const v = clamp((histP[idx] - minP) / (maxP - minP), 0, 1);
      const x = chX + (i / (HIST - 1)) * chW;
      const y = chY + (1 - v) * chH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // plot stock
    ctx.strokeStyle = 'rgba(90,245,255,0.85)';
    ctx.beginPath();
    for (let i = 0; i < HIST; i++){
      const idx = (histI + i) % HIST;
      const v = clamp(histS[idx] / 100, 0, 1);
      const x = chX + (i / (HIST - 1)) * chW;
      const y = chY + (1 - v) * chH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.restore();

    // legend
    ctx.font = `${Math.max(10, Math.floor(s * 0.022))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,92,220,0.85)';
    ctx.fillText('PRICE', chX + 8, chY + 8);
    ctx.fillStyle = 'rgba(90,245,255,0.85)';
    ctx.fillText('STOCK', chX + 78, chY + 8);

    // overlay moments
    if (spike.active){
      const u = clamp((t - spike.t0) / 0.28, 0, 1);
      const a = 0.5 + 0.5 * ease(u);
      const msg = 'PRICE SPIKE';

      ctx.save();
      ctx.globalAlpha = 0.9 * a;
      ctx.translate(px + pw * 0.5, py + ph * 0.06);
      ctx.rotate(-0.06);
      ctx.fillStyle = 'rgba(255, 210, 90, 0.25)';
      roundRect(ctx, -pw * 0.42, -12, pw * 0.84, 34, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 210, 90, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = `${Math.max(14, Math.floor(s * 0.04))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = 'rgba(255, 235, 170, 0.95)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, 0, 5);
      ctx.restore();
    }

    // coupon tokens (draw over HUD)
    for (const c of coupons){
      if (!c.on) continue;
      const a = clamp(c.life / 2.7, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.2 + 0.8 * a;
      const tw = s * 0.12;
      const th = s * 0.05;
      const x = c.x;
      const y = c.y;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(ctx, x, y, tw, th, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,245,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = `${Math.max(10, Math.floor(s * 0.02))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = 'rgba(90,245,255,0.95)';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.code, x + tw * 0.08, y + th * 0.55);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawTitle(ctx){
    ctx.save();
    const size = Math.max(14, Math.floor(s * 0.033));
    ctx.textBaseline = 'middle';
    ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('CH ??', w * 0.05, h * 0.17);

    ctx.font = `${Math.max(16, Math.floor(s * 0.038))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,92,220,0.92)';
    ctx.shadowColor = 'rgba(255,92,220,0.7)';
    ctx.shadowBlur = 14;
    ctx.fillText('GUMBALL MACHINE ECONOMICS', w * 0.05, h * 0.22);
    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    drawMachine(ctx);
    drawHud(ctx);
    drawTitle(ctx);

    // soft vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, s * 0.1, w * 0.5, h * 0.5, s * 0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
