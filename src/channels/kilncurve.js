import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

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

function drawCone(ctx, x, y, w, h, bend, glow){
  // Simple pyrometric cone silhouette.
  const bx = x;
  const by = y;
  const tipX = x + w * (0.5 + bend * 0.25);
  const tipY = y - h * (1 - bend * 0.22);
  const footL = { x: bx, y: by };
  const footR = { x: bx + w, y: by };

  ctx.save();
  ctx.fillStyle = `rgba(20, 16, 14, ${0.85 + glow * 0.1})`;
  ctx.beginPath();
  ctx.moveTo(footL.x, footL.y);
  ctx.lineTo(footR.x, footR.y);
  ctx.lineTo(tipX, tipY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 210, 150, ${0.06 + glow * 0.15})`;
  ctx.lineWidth = Math.max(1, w * 0.08);
  ctx.stroke();
  ctx.restore();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;

  const palettes = [
    { bg0: '#050406', bg1: '#0a0a10', kiln0: '#1b1412', kiln1: '#120c0b', rim: '#3a2a24', steel: '#7c8797', ember: '#ff9c44', ember2: '#ffd08a', chart: '#1a1a22' },
    { bg0: '#040507', bg1: '#090a0f', kiln0: '#1a1210', kiln1: '#0f0a09', rim: '#382622', steel: '#86a0a8', ember: '#ff8741', ember2: '#ffd7a2', chart: '#171722' },
    { bg0: '#050406', bg1: '#0c0c14', kiln0: '#221916', kiln1: '#110c0b', rim: '#402e27', steel: '#93a2b5', ember: '#ffb04f', ember2: '#ffe2b6', chart: '#1b1b26' },
  ];
  const pal = pick(rand, palettes);

  const PHASES = [
    { id: 'bisque', label: 'BISQUE' },
    { id: 'glaze', label: 'GLAZE' },
    { id: 'cool', label: 'COOL DOWN' },
  ];

  const phaseDur = 18 + ((rand() * 10) | 0);
  const totalDur = phaseDur * PHASES.length;

  const bisquePeak = 930 + rand() * 90;
  const glazePeak = 1180 + rand() * 120;

  let phaseIdx = 0;
  let phaseT = 0;
  let tempC = 20;

  // layout
  let kiln = { x: 0, y: 0, w: 0, h: 0 };
  let peephole = { x: 0, y: 0, r: 0 };
  let chart = { x: 0, y: 0, w: 0, h: 0 };

  // shimmer particles (precomputed)
  let shimmer = []; // {a, r0, sp, ph}

  // special moment
  let coneBend = 0;
  let conePulse = 0;
  let coneLatched = false;

  // audio
  let drone = null;
  let noise = null;
  let currentHandle = null;

  function tempAt(time){
    const ct = ((time % totalDur) + totalDur) % totalDur;
    const idx = Math.floor(ct / phaseDur);
    const pt = (ct - idx * phaseDur) / phaseDur;

    if (idx === 0){
      // bisque: long ramp up, short vent/cool at end
      const rampEnd = 0.78;
      if (pt < rampEnd) return lerp(20, bisquePeak, ease(pt / rampEnd));
      return lerp(bisquePeak, bisquePeak - 110, ease((pt - rampEnd) / (1 - rampEnd)));
    }

    if (idx === 1){
      // glaze: ramp up, soak, drop slightly
      const rampEnd = 0.68;
      const soakEnd = 0.82;
      if (pt < rampEnd) return lerp(120, glazePeak, ease(pt / rampEnd));
      if (pt < soakEnd) return glazePeak;
      return lerp(glazePeak, glazePeak - 80, ease((pt - soakEnd) / (1 - soakEnd)));
    }

    // cool down
    const start = glazePeak - 80;
    return lerp(start, 120, ease(pt));
  }

  function header(ctx, title, subtitle, phaseLabel, p, glow){
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    roundedRect(ctx, 14, 14, w - 28, Math.max(54, font * 3.0), 12);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `800 ${font}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(title, 28, 22);

    ctx.fillStyle = 'rgba(240,240,240,0.82)';
    ctx.font = `500 ${small}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillText(subtitle, 28, 22 + font * 1.18);

    ctx.fillStyle = `rgba(255, 220, 160, ${0.85 + glow * 0.12})`;
    ctx.font = `800 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(phaseLabel, 28, 22 + font * 1.18 + small * 1.05);

    const barW = Math.min(240, w * 0.28);
    const bx = w - 28 - barW;
    const by = 22 + font * 1.18 + small * 1.05;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundedRect(ctx, bx, by + 2, barW, Math.max(8, small * 0.55), 8);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 190, 120, ${0.55 + glow * 0.18})`;
    roundedRect(ctx, bx, by + 2, barW * clamp(p,0,1), Math.max(8, small * 0.55), 8);
    ctx.fill();

    ctx.restore();
  }

  function regen(){
    t = 0;
    phaseIdx = 0;
    phaseT = 0;
    tempC = 20;
    coneBend = 0;
    conePulse = 0;
    coneLatched = false;

    kiln = { x: w * 0.07, y: h * 0.16, w: w * 0.60, h: h * 0.78 };
    peephole = { x: kiln.x + kiln.w * 0.52, y: kiln.y + kiln.h * 0.36, r: Math.min(kiln.w, kiln.h) * 0.09 };

    chart = { x: kiln.x + kiln.w + w * 0.035, y: kiln.y + kiln.h * 0.08, w: w * 0.26, h: kiln.h * 0.78 };

    shimmer = Array.from({ length: 18 }, () => ({
      a: rand() * Math.PI * 2,
      r0: 0.25 + rand() * 0.75,
      sp: 0.7 + rand() * 1.8,
      ph: rand() * 10,
    }));
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 30));
    small = Math.max(11, Math.floor(font * 0.78));

    regen();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    drone = simpleDrone(audio, { root: 55, detune: 1.2, gain: 0.045 });
    noise = audio.noiseSource({ type: 'brown', gain: 0.012 });
    try { noise.start(); } catch {}
    currentHandle = {
      stop(){
        try { drone?.stop?.(); } catch {}
        try { noise?.stop?.(); } catch {}
      }
    };
    audio.setCurrent(currentHandle);
  }

  function onAudioOff(){
    try { currentHandle?.stop?.(); } catch {}
    drone = null;
    noise = null;
    currentHandle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;

    const ct = ((t % totalDur) + totalDur) % totalDur;
    phaseIdx = Math.floor(ct / phaseDur);
    phaseT = (ct - phaseIdx * phaseDur) / phaseDur;

    // Temperature with a tiny breathing jitter.
    const base = tempAt(t);
    tempC = base + Math.sin(t * 1.4 + seed * 0.001) * 3.2 + Math.sin(t * 3.2) * 1.4;

    // Cone bend special moment: latch per cycle during glaze peak.
    const phase = PHASES[phaseIdx].id;
    const glow = clamp((tempC - 120) / 1150, 0, 1);

    if (phase === 'glaze' && phaseT > 0.62 && tempC > glazePeak - 35){
      coneBend = clamp(coneBend + dt * 0.9, 0, 1);
      if (!coneLatched && coneBend > 0.85){
        coneLatched = true;
        conePulse = 1;
        if (audio.enabled) audio.beep({ freq: 740, dur: 0.06, gain: 0.03, type: 'triangle' });
      }
    } else {
      // reset bend during cool down
      const resetRate = (phase === 'cool') ? 0.7 : 0.25;
      coneBend = clamp(coneBend - dt * resetRate, 0, 1);
      if (phase === 'bisque' && phaseT < 0.08) coneLatched = false;
    }

    conePulse = Math.max(0, conePulse - dt * (2.2 + glow * 3.5));
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(0.55, pal.bg1);
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // faint vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w*0.5, h*0.45, 0, w*0.5, h*0.45, Math.max(w,h)*0.7);
    vg.addColorStop(0, 'rgba(255,160,90,0.05)');
    vg.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);
    ctx.restore();
  }

  function drawKiln(ctx, glow){
    // body
    ctx.save();
    const body = ctx.createLinearGradient(kiln.x, kiln.y, kiln.x, kiln.y + kiln.h);
    body.addColorStop(0, pal.kiln0);
    body.addColorStop(1, pal.kiln1);
    ctx.fillStyle = body;
    roundedRect(ctx, kiln.x, kiln.y, kiln.w, kiln.h, Math.max(14, kiln.w * 0.03));
    ctx.fill();

    // subtle panel seams
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = Math.max(1, w * 0.0015);
    const rows = 7;
    for (let i=1;i<rows;i++){
      const yy = kiln.y + (kiln.h * i) / rows;
      ctx.beginPath();
      ctx.moveTo(kiln.x + kiln.w * 0.06, yy);
      ctx.lineTo(kiln.x + kiln.w * 0.94, yy);
      ctx.stroke();
    }

    // door handle
    ctx.fillStyle = `rgba(150,160,175,${0.55})`;
    roundedRect(ctx, kiln.x + kiln.w * 0.76, kiln.y + kiln.h * 0.22, kiln.w * 0.12, kiln.h * 0.06, kiln.w * 0.02);
    ctx.fill();

    // peephole rim
    ctx.save();
    ctx.translate(peephole.x, peephole.y);
    ctx.fillStyle = pal.rim;
    ctx.beginPath();
    ctx.arc(0, 0, peephole.r * 1.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, peephole.r * 0.86, 0, Math.PI * 2);
    ctx.fill();

    // inner glow
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, peephole.r * 0.86);
    g.addColorStop(0, `rgba(255, 240, 210, ${0.02 + glow * 0.28})`);
    g.addColorStop(0.25, `rgba(255, 170, 90, ${0.10 + glow * 0.55})`);
    g.addColorStop(0.7, `rgba(255, 110, 40, ${0.04 + glow * 0.35})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, peephole.r * 0.86, 0, Math.PI * 2);
    ctx.fill();

    // shimmer arcs
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(255, 210, 150, ${0.05 + glow * 0.12})`;
    ctx.lineWidth = Math.max(1, peephole.r * 0.06);
    for (const s of shimmer){
      const rr = peephole.r * (0.15 + s.r0 * 0.68);
      const aa = s.a + Math.sin(t * s.sp + s.ph) * 0.9;
      const arc = 0.65 + 0.3 * Math.sin(t * 1.2 + s.ph);
      ctx.beginPath();
      ctx.arc(0, 0, rr, aa, aa + arc);
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore();

    // cone shelf
    const shelfY = kiln.y + kiln.h * 0.78;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, kiln.x + kiln.w * 0.14, shelfY, kiln.w * 0.72, kiln.h * 0.06, kiln.w * 0.02);
    ctx.fill();

    const coneGlow = glow * (0.55 + conePulse * 0.35);
    const cx0 = kiln.x + kiln.w * 0.22;
    const cy0 = shelfY + kiln.h * 0.045;
    const cw = kiln.w * 0.10;
    const ch = kiln.h * 0.16;
    drawCone(ctx, cx0, cy0, cw, ch, coneBend, coneGlow);
    drawCone(ctx, cx0 + cw * 1.45, cy0, cw, ch, coneBend * 0.6, coneGlow * 0.9);
    drawCone(ctx, cx0 + cw * 2.9, cy0, cw, ch, coneBend * 0.3, coneGlow * 0.8);

    // warm spill on kiln face
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const spill = ctx.createRadialGradient(peephole.x, peephole.y, 0, peephole.x, peephole.y, kiln.w * 0.55);
    spill.addColorStop(0, `rgba(255, 165, 80, ${0.02 + glow * 0.08})`);
    spill.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spill;
    ctx.fillRect(kiln.x, kiln.y, kiln.w, kiln.h);
    ctx.restore();
  }

  function drawChart(ctx, glow){
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    roundedRect(ctx, chart.x - 10, chart.y - 10, chart.w + 20, chart.h + 20, 16);
    ctx.fill();

    ctx.fillStyle = pal.chart;
    roundedRect(ctx, chart.x, chart.y, chart.w, chart.h, 14);
    ctx.fill();

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = Math.max(1, 1.0 * dpr);
    const gx = 6;
    const gy = 6;
    for (let i=1;i<gx;i++){
      const x = chart.x + (chart.w * i) / gx;
      ctx.beginPath();
      ctx.moveTo(x, chart.y + chart.h * 0.06);
      ctx.lineTo(x, chart.y + chart.h * 0.94);
      ctx.stroke();
    }
    for (let i=1;i<gy;i++){
      const y = chart.y + (chart.h * i) / gy;
      ctx.beginPath();
      ctx.moveTo(chart.x + chart.w * 0.06, y);
      ctx.lineTo(chart.x + chart.w * 0.94, y);
      ctx.stroke();
    }

    // y labels
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = `600 ${Math.max(10, Math.floor(small * 0.85))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    const labels = [0, 600, 1200];
    for (const v of labels){
      const y = chart.y + chart.h * (0.90 - 0.80 * clamp(v / 1300, 0, 1));
      ctx.fillText(`${v}`, chart.x + chart.w * 0.07, y);
    }

    // curve line
    const x0 = chart.x + chart.w * 0.12;
    const y0 = chart.y + chart.h * 0.90;
    const cw = chart.w * 0.82;
    const ch = chart.h * 0.80;

    const windowSec = Math.min(52, totalDur);
    const start = t - windowSec;
    const N = 120;

    ctx.save();
    ctx.beginPath();
    for (let i=0;i<=N;i++){
      const tt = start + (windowSec * i) / N;
      const v = tempAt(tt);
      const xx = x0 + (cw * i) / N;
      const yy = y0 - ch * clamp(v / 1300, 0, 1);
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.strokeStyle = `rgba(255, 170, 90, ${0.65 + glow * 0.2})`;
    ctx.lineWidth = Math.max(2, 2.3 * dpr);
    ctx.stroke();

    // glow
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(255, 230, 180, ${0.10 + glow * 0.18})`;
    ctx.lineWidth = Math.max(4, 4.5 * dpr);
    ctx.stroke();
    ctx.restore();

    // marker
    const curX = x0 + cw;
    const curY = y0 - ch * clamp(tempC / 1300, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255, 240, 220, ${0.55 + glow * 0.25})`;
    ctx.beginPath();
    ctx.arc(curX, curY, Math.max(3, 4 * dpr), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // readout
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `800 ${Math.max(14, Math.floor(font * 1.05))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    const read = `${Math.round(tempC)}°C`;
    ctx.fillText(read, chart.x + chart.w * 0.12, chart.y + chart.h * 0.06);

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    const glow = clamp((tempC - 120) / 1150, 0, 1);

    drawBackground(ctx);
    drawKiln(ctx, glow);
    drawChart(ctx, glow);

    const phase = PHASES[phaseIdx];
    const phaseLabel = `${phase.label}  •  ${Math.round(tempC)}°C`;
    header(ctx, 'Ceramic Kiln Firing Curve', 'Peephole glow + ramp chart', phaseLabel, phaseT, glow);

    // subtle "cone bend" flash
    if (conePulse > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255, 220, 170, ${conePulse * 0.12})`;
      ctx.fillRect(0,0,w,h);
      ctx.restore();
    }
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
