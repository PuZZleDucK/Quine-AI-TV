import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

function roundedRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w*0.5, h*0.5);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}

function drawDial(ctx, x, y, r, value, label){
  ctx.save();
  ctx.translate(x, y);

  // body
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, r*1.08, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI*2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, r*0.08);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI*2);
  ctx.stroke();

  // ticks
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = Math.max(1, r*0.045);
  for (let i=0;i<=10;i++){
    const a = lerp(-Math.PI*0.75, Math.PI*0.75, i/10);
    const r0 = r*0.72;
    const r1 = r*0.9;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*r0, Math.sin(a)*r0);
    ctx.lineTo(Math.cos(a)*r1, Math.sin(a)*r1);
    ctx.stroke();
  }

  // needle
  const aN = lerp(-Math.PI*0.75, Math.PI*0.75, clamp(value,0,1));
  ctx.strokeStyle = 'rgba(180,40,40,0.95)';
  ctx.lineWidth = Math.max(2, r*0.09);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(aN)*r*0.78, Math.sin(aN)*r*0.78);
  ctx.stroke();

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, r*0.1, 0, Math.PI*2);
  ctx.fill();

  // label
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.font = `700 ${Math.max(9, r*0.22)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, r*0.52);

  ctx.restore();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  const palettes = [
    { sky0:'#040514', sky1:'#0a0b20', sky2:'#060815', glow:'rgba(120,210,255,0.12)', roof:'#0d1119', roof2:'#111827', tank:'#b9c2cf', tank2:'#8e98ab', water:'#2a9df4', accent:'#ffd48a' },
    { sky0:'#04040f', sky1:'#0b0b1e', sky2:'#070816', glow:'rgba(160,120,255,0.10)', roof:'#0e1016', roof2:'#151a22', tank:'#c6c9d1', tank2:'#9aa1b2', water:'#33b0ff', accent:'#ffe19a' },
    { sky0:'#03040f', sky1:'#080a1b', sky2:'#050612', glow:'rgba(90,255,200,0.10)', roof:'#0b1216', roof2:'#0f1d24', tank:'#bfc9d6', tank2:'#8d9bb2', water:'#22b6cc', accent:'#c7ffe6' },
  ];
  const pal = pick(rand, palettes);

  let stars = [];
  let clouds = [];
  let skylineFar = [];
  let skylineNear = [];

  // tank / pump
  let cyclePeriod = 24;
  let cycleOffset = 0;
  let pumpOn = false;
  let lastPumpOn = false;
  let level = 0.5;
  let pressure = 0.4;

  let lightning = 0;
  let nextLightningAt = 0;
  let bolt = null; // array of points

  let walker = null;
  let nextWalkerAt = 0;

  // audio handles
  let ambience = null;

  function safeBeep(opts){
    if (!audio.enabled) return;
    audio.beep(opts);
  }

  function regen(){
    t = 0;
    lightning = 0;
    bolt = null;

    cyclePeriod = 22 + rand() * 10;
    cycleOffset = rand() * cyclePeriod;

    stars = Array.from({ length: 180 }, () => ({
      x: rand()*1,
      y: rand()*1,
      r: 0.5 + rand()*1.5,
      a: 0.35 + rand()*0.55,
      tw: rand()*12,
    }));

    clouds = Array.from({ length: 12 }, () => ({
      x: rand()*1,
      y: rand()*1,
      r: 0.08 + rand()*0.14,
      spd: 0.004 + rand()*0.01,
      a: 0.06 + rand()*0.12,
    }));

    // skyline layers; x in [0,1] normalized, scroll wraps
    skylineFar = [];
    skylineNear = [];

    let x = -0.1;
    while (x < 1.15) {
      const bw = 0.05 + rand()*0.09;
      skylineFar.push({
        x,
        w: bw,
        h: 0.08 + rand()*0.22,
        lights: 2 + ((rand()*6)|0),
        tw: rand()*8,
      });
      x += bw + (0.01 + rand()*0.02);
    }

    x = -0.12;
    while (x < 1.18) {
      const bw = 0.07 + rand()*0.12;
      skylineNear.push({
        x,
        w: bw,
        h: 0.12 + rand()*0.28,
        lights: 3 + ((rand()*7)|0),
        tw: rand()*6,
      });
      x += bw + (0.014 + rand()*0.03);
    }

    walker = null;
    nextWalkerAt = 6 + rand()*10;

    nextLightningAt = 12 + rand()*18;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    regen();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    const hum = simpleDrone(audio, { root: 44 + rand()*12, detune: 1.2, gain: 0.014 });
    const noise = audio.noiseSource({ type: 'pink', gain: 0.0024 });
    noise.start();

    ambience = {
      stop(){
        try { hum.stop(); } catch {}
        try { noise.stop(); } catch {}
      }
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){
    onAudioOff();
  }

  function makeBolt(){
    const pts = [];
    const x0 = w * (0.55 + rand()*0.35);
    const y0 = h * (0.08 + rand()*0.12);
    const steps = 8 + ((rand()*6)|0);
    let x = x0;
    let y = y0;
    pts.push({x,y});
    for (let i=0;i<steps;i++){
      x += (rand()-0.5) * w * 0.06;
      y += h * (0.06 + rand()*0.05);
      pts.push({x,y});
    }
    return pts;
  }

  function update(dt){
    t += dt;

    lightning = Math.max(0, lightning - dt * 2.2);

    // pump cycle: triangle wave => fill/drain
    const u = ((t + cycleOffset) % cyclePeriod) / cyclePeriod;
    const tri = u < 0.5 ? (u*2) : (2 - u*2);
    level = 0.22 + tri * 0.58;

    // pump on during filling half
    pumpOn = (u < 0.5);
    pressure = pumpOn ? (0.55 + 0.35*Math.sin(u*Math.PI*2)) : (0.25 + 0.15*Math.sin(u*Math.PI*2));

    if (pumpOn && !lastPumpOn) {
      safeBeep({ freq: 72, dur: 0.09, gain: 0.02, type: 'square' });
    }
    lastPumpOn = pumpOn;

    if (!walker && t >= nextWalkerAt){
      const y = h * (0.67 + rand()*0.04);
      const dir = rand() < 0.5 ? 1 : -1;
      const xStart = dir > 0 ? -w*0.1 : w*1.1;
      walker = {
        x: xStart,
        y,
        dir,
        spd: w * (0.04 + rand()*0.03),
        headlamp: 0,
      };
      nextWalkerAt = t + 14 + rand()*18;
    }

    if (walker){
      walker.x += walker.dir * walker.spd * dt;
      walker.headlamp = Math.max(0, walker.headlamp - dt * 3);
      if (rand() < dt * 0.7) walker.headlamp = 1; // occasional glint
      if ((walker.dir > 0 && walker.x > w*1.1) || (walker.dir < 0 && walker.x < -w*0.1)) walker = null;
    }

    if (t >= nextLightningAt){
      lightning = 1;
      bolt = makeBolt();
      nextLightningAt = t + 18 + rand()*30;

      // storm "reset": shuffle cycle offset a bit
      cycleOffset = rand() * cyclePeriod;

      safeBeep({ freq: 220, dur: 0.08, gain: 0.03, type: 'triangle' });
      safeBeep({ freq: 110, dur: 0.12, gain: 0.025, type: 'sine' });
    }

    // values are stored in closure vars
  }

  function drawSky(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.sky0);
    g.addColorStop(0.55, pal.sky1);
    g.addColorStop(1, pal.sky2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle glow band
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = pal.glow;
    ctx.fillRect(0, h*0.22, w, h*0.32);
    ctx.restore();

    // stars
    ctx.fillStyle = 'white';
    for (const s of stars){
      const tw = 0.5 + 0.5*Math.sin(t * 0.7 + s.tw);
      ctx.globalAlpha = s.a * (0.6 + 0.4*tw);
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h * 0.55, s.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // clouds
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const c of clouds){
      const x = ((c.x + t * c.spd) % 1.2) * w - w*0.1;
      const y = c.y * h * 0.5;
      const rr = c.r * Math.min(w,h);
      ctx.fillStyle = `rgba(200,220,255,${c.a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rr*1.4, rr, 0, 0, Math.PI*2);
      ctx.ellipse(x + rr*0.9, y + rr*0.1, rr*1.2, rr*0.9, 0.2, 0, Math.PI*2);
      ctx.ellipse(x - rr*0.8, y + rr*0.05, rr*1.1, rr*0.85, -0.1, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSkyline(ctx){
    const yH = h * 0.64;

    // far buildings
    const farScroll = (t * 8) % (w * 0.6);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const b of skylineFar){
      let x = b.x * w - farScroll;
      while (x < -w*0.2) x += w*1.2;
      while (x > w*1.2) x -= w*1.2;

      const bw = b.w * w;
      const bh = b.h * h;
      ctx.fillRect(x, yH - bh, bw, bh);

      // windows
      const ww = Math.max(2, bw / (b.lights + 2));
      const wh = Math.max(2, bh / 10);
      for (let i=0;i<b.lights;i++){
        const tw = 0.5 + 0.5*Math.sin(t*0.45 + b.tw + i*1.7);
        ctx.fillStyle = `rgba(255,220,140,${0.06 + tw*0.08})`;
        ctx.fillRect(x + ww*(i+0.7), yH - bh + wh*2, ww*0.55, wh*0.7);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
    }

    // near buildings
    const nearScroll = (t * 14) % (w * 0.75);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (const b of skylineNear){
      let x = b.x * w - nearScroll;
      while (x < -w*0.3) x += w*1.3;
      while (x > w*1.3) x -= w*1.3;

      const bw = b.w * w;
      const bh = b.h * h;
      ctx.fillRect(x, yH - bh*0.86, bw, bh*0.86);

      const ww = Math.max(2, bw / (b.lights + 3));
      const wh = Math.max(2, bh / 12);
      for (let i=0;i<b.lights;i++){
        const tw = 0.5 + 0.5*Math.sin(t*0.55 + b.tw + i*1.3);
        ctx.fillStyle = `rgba(255,230,170,${0.05 + tw*0.09})`;
        ctx.fillRect(x + ww*(i+0.8), yH - bh*0.86 + wh*2.4, ww*0.55, wh*0.7);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
    }
  }

  function drawRoof(ctx){
    const roofY = h * 0.66;
    ctx.fillStyle = pal.roof;
    ctx.fillRect(0, roofY, w, h - roofY);

    // parapet / details
    ctx.fillStyle = pal.roof2;
    ctx.fillRect(0, roofY, w, h * 0.06);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = Math.max(1, 1.2 * dpr);
    for (let i=0;i<8;i++){
      const x = (i / 7) * w;
      ctx.beginPath();
      ctx.moveTo(x, roofY);
      ctx.lineTo(x, roofY + h*0.05);
      ctx.stroke();
    }

    // hatch
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    roundedRect(ctx, w*0.18, roofY + h*0.06, w*0.12, h*0.06, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();
  }

  function drawTank(ctx, level, pressure){
    const baseY = h * 0.78;
    const x = w * 0.72;
    const tankW = Math.min(w, h) * 0.26;
    const tankH = tankW * 1.05;
    const rx = tankW * 0.5;
    const ry = tankW * 0.16;
    const topY = baseY - tankH;

    // stand
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i=0;i<4;i++){
      const lx = x - rx*0.8 + i*(rx*0.53);
      ctx.fillRect(lx, baseY - h*0.02, rx*0.12, h*0.12);
    }
    ctx.restore();

    // tank body
    const bodyG = ctx.createLinearGradient(x-rx, 0, x+rx, 0);
    bodyG.addColorStop(0, pal.tank2);
    bodyG.addColorStop(0.45, pal.tank);
    bodyG.addColorStop(1, pal.tank2);

    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.ellipse(x, topY, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(x+rx, baseY);
    ctx.ellipse(x, baseY, rx, ry, 0, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();

    // water level (clip inside body)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, topY, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(x+rx, baseY);
    ctx.ellipse(x, baseY, rx, ry, 0, 0, Math.PI, true);
    ctx.closePath();
    ctx.clip();

    const fillH = tankH * clamp(level, 0, 1);
    const yFill = baseY - fillH;
    ctx.fillStyle = pal.water;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x-rx, yFill, tankW, fillH);

    // surface shimmer
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'white';
    ctx.fillRect(x-rx, yFill - 2, tankW, 3);

    ctx.restore();
    ctx.globalAlpha = 1;

    // outlines
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, 1.3 * dpr);
    ctx.beginPath();
    ctx.ellipse(x, topY, rx, ry, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, baseY, rx, ry, 0, 0, Math.PI*2);
    ctx.stroke();

    // gauge panel
    const panelX = x - rx*1.1;
    const panelY = topY + tankH*0.12;
    const panelW = rx*0.72;
    const panelH = tankH*0.46;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundedRect(ctx, panelX, panelY, panelW, panelH, 12);
    ctx.fill();

    // LED (pump)
    const ledX = panelX + panelW*0.18;
    const ledY = panelY + panelH*0.15;
    const ledR = Math.max(5, panelW*0.08);
    ctx.fillStyle = pumpOn ? 'rgba(90,255,160,0.9)' : 'rgba(255,80,80,0.55)';
    ctx.beginPath();
    ctx.arc(ledX, ledY, ledR, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `700 ${Math.max(10, panelW*0.08)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText(pumpOn ? 'PUMP ON' : 'PUMP OFF', panelX + panelW*0.30, ledY);

    drawDial(ctx, panelX + panelW*0.52, panelY + panelH*0.56, panelW*0.24, level, 'LVL');
    drawDial(ctx, panelX + panelW*0.52, panelY + panelH*0.86, panelW*0.24, pressure, 'PSI');

    // pipe
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = Math.max(2, tankW*0.03);
    ctx.beginPath();
    ctx.moveTo(x - rx*0.2, baseY + ry*0.1);
    ctx.lineTo(x - rx*0.2, baseY + h*0.09);
    ctx.lineTo(x - rx*0.9, baseY + h*0.09);
    ctx.stroke();
  }

  function drawWalker(ctx){
    if (!walker) return;
    const roofY = h * 0.66;

    ctx.save();
    ctx.translate(walker.x, walker.y);

    // silhouette
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.ellipse(0, -h*0.03, w*0.008, h*0.016, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillRect(-w*0.006, -h*0.02, w*0.012, h*0.05);
    ctx.fillRect(-w*0.012, h*0.03, w*0.008, h*0.03);
    ctx.fillRect(w*0.004, h*0.03, w*0.008, h*0.03);

    // headlamp glint
    if (walker.headlamp > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.18 * walker.headlamp;
      ctx.fillStyle = 'rgba(255,255,220,1)';
      ctx.beginPath();
      ctx.arc(w*0.006, -h*0.032, Math.max(8, w*0.015), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // tiny shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(walker.x, roofY + h*0.085, w*0.018, h*0.008, 0, 0, Math.PI*2);
    ctx.fill();
  }

  function drawLightning(ctx){
    if (lightning <= 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(245,250,255,${0.28 * lightning})`;
    ctx.fillRect(0, 0, w, h);

    if (bolt){
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * lightning})`;
      ctx.lineWidth = Math.max(2, 2.4 * dpr);
      ctx.beginPath();
      ctx.moveTo(bolt[0].x, bolt[0].y);
      for (let i=1;i<bolt.length;i++) ctx.lineTo(bolt[i].x, bolt[i].y);
      ctx.stroke();

      ctx.strokeStyle = `rgba(150,220,255,${0.35 * lightning})`;
      ctx.lineWidth = Math.max(1, 1.2 * dpr);
      ctx.stroke();
    }

    ctx.restore();
  }

  function draw(ctx){
    drawSky(ctx);
    drawSkyline(ctx);
    drawRoof(ctx);
    drawTank(ctx, level, pressure);
    drawWalker(ctx);
    drawLightning(ctx);

    // small title bug
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, 14, h - 54, 300, 40, 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 14px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('Rooftop Water Tank Nights', 26, h - 34);

    ctx.fillStyle = pal.accent;
    ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.fillText(pumpOn ? 'CYCLE: FILL' : 'CYCLE: DRAIN', 26, h - 18);
    ctx.restore();
  }

  return {
    onResize,
    update,
    draw,
    onAudioOn,
    onAudioOff,
    destroy,
  };
}
