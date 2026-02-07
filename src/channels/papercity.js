import { mulberry32, clamp } from '../util/prng.js';

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

function drawLinePartial(ctx, x1, y1, x2, y2, amt){
  amt = clamp(amt, 0, 1);
  const x = lerp(x1, x2, amt);
  const y = lerp(y1, y2, amt);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x, y);
  ctx.stroke();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // palette (deterministic)
  const palettes = [
    { deskA: '#201b17', deskB: '#0f0c0a', paperA: '#f4efe6', paperB: '#e6ddcf', ink: '#141214', accent: '#ffb86b', lights: '#ffdca8' },
    { deskA: '#1d1f24', deskB: '#0b0c10', paperA: '#f2f6fb', paperB: '#dde7f2', ink: '#0f141c', accent: '#6cf2ff', lights: '#b7f7ff' },
    { deskA: '#1f1a16', deskB: '#0b0806', paperA: '#f7eddc', paperB: '#ead7ba', ink: '#1a1411', accent: '#b7ff8a', lights: '#e3ffd1' },
  ];
  const pal = pick(rand, palettes);

  // phases
  const PHASES = [
    { id: 'fold', label: 'FOLD OUT' },
    { id: 'rise', label: 'POP UP' },
    { id: 'lights', label: 'LIGHTS ON' },
    { id: 'fly', label: 'CRANE FLYOVER' },
  ];
  const PHASE_DUR = 18;
  const CYCLE_DUR = PHASE_DUR * PHASES.length;

  // layout
  let paper = { x: 0, y: 0, w: 0, h: 0, rot: 0 };
  let streets = []; // {x1,y1,x2,y2,w}
  let buildings = []; // {x,y,w,h,ht,winSeed}
  let grain = []; // {x,y,a}

  // fx
  let phaseIndex = 0;
  let lastPhaseIndex = -1;
  let phaseFlash = 0;

  // audio
  let ambience = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regenLayout(){
    const lr = mulberry32((seed ^ 0xC0FFEE) >>> 0);

    paper.w = Math.min(w, h) * 0.78;
    paper.h = paper.w * 0.64;
    paper.x = w * 0.5;
    paper.y = h * 0.54;
    paper.rot = (-0.028 + (lr() - 0.5) * 0.02);

    // paper grain dots (local coords)
    const n = 190;
    grain = Array.from({ length: n }, () => ({
      x: (lr() - 0.5) * paper.w,
      y: (lr() - 0.5) * paper.h,
      a: 0.02 + lr() * 0.06,
    }));

    // street plan
    streets = [];
    const mainY = (-0.06 + (lr() - 0.5) * 0.06) * paper.h;
    const mainX0 = -paper.w * 0.46;
    const mainX1 = paper.w * 0.46;
    streets.push({ x1: mainX0, y1: mainY, x2: mainX1, y2: mainY, w: Math.max(2, paper.w * 0.006) });

    const sideCount = 5 + ((lr() * 3) | 0);
    for (let i=0;i<sideCount;i++){
      const x = lerp(-paper.w*0.42, paper.w*0.42, (i + 0.5) / sideCount) + (lr() - 0.5) * paper.w * 0.03;
      const y0 = mainY + paper.h * (0.08 + lr() * 0.26);
      const y1 = mainY - paper.h * (0.08 + lr() * 0.28);
      streets.push({ x1: x, y1: y0, x2: x, y2: y1, w: Math.max(1.5, paper.w * (0.0035 + lr() * 0.002)) });
    }

    // buildings (pop-up rectangles)
    buildings = [];
    const cols = 7;
    const rows = 5;
    const padX = paper.w * 0.08;
    const padY = paper.h * 0.12;
    for (let r=0;r<rows;r++){
      for (let c=0;c<cols;c++){
        if (lr() < 0.22) continue;
        const cellW = (paper.w - padX*2) / cols;
        const cellH = (paper.h - padY*2) / rows;
        const cx = -paper.w*0.5 + padX + (c + 0.5) * cellW;
        const cy = -paper.h*0.5 + padY + (r + 0.5) * cellH;

        const bw = cellW * (0.52 + lr() * 0.34);
        const bh = cellH * (0.44 + lr() * 0.34);
        const bx = cx + (lr() - 0.5) * cellW * 0.18;
        const by = cy + (lr() - 0.5) * cellH * 0.18;

        // avoid main street stripe
        if (Math.abs(by - mainY) < paper.h * 0.08) continue;

        buildings.push({
          x: bx - bw * 0.5,
          y: by - bh * 0.5,
          w: bw,
          h: bh,
          ht: 0.12 + lr() * 0.32,
          winSeed: (lr() * 1e9) | 0,
        });
      }
    }

    // stable sort so resizing doesn't shuffle draw order too much
    buildings.sort((a,b) => (a.y - b.y) || (a.x - b.x));
  }

  function reset(){
    t = 0;
    phaseIndex = 0;
    lastPhaseIndex = -1;
    phaseFlash = 0;
  }

  function onResize(width, height){
    w = width;
    h = height;
    dpr = window.devicePixelRatio || 1;
    regenLayout();
    reset();
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type: 'pink', gain: 0.03 });
    n.start();
    ambience = {
      stop(){ try { n.stop(); } catch {} },
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
    phaseFlash = Math.max(0, phaseFlash - dt * 1.6);

    const cyc = t % CYCLE_DUR;
    phaseIndex = Math.floor(cyc / PHASE_DUR);

    if (phaseIndex !== lastPhaseIndex){
      if (lastPhaseIndex !== -1){
        phaseFlash = 1;
        safeBeep({ freq: 220 + phaseIndex * 70, dur: 0.06, gain: 0.02, type: 'triangle' });
      }
      lastPhaseIndex = phaseIndex;
    }
  }

  function drawDesk(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.deskA);
    g.addColorStop(1, pal.deskB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // vignette
    ctx.save();
    ctx.globalAlpha = 0.35;
    const vg = ctx.createRadialGradient(w*0.5, h*0.55, Math.min(w,h)*0.15, w*0.5, h*0.55, Math.min(w,h)*0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawPaper(ctx, driftX, driftY){
    ctx.save();
    ctx.translate(paper.x + driftX, paper.y + driftY);
    ctx.rotate(paper.rot);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, -paper.w*0.5 + paper.w*0.02, -paper.h*0.5 + paper.h*0.03, paper.w, paper.h, paper.w*0.03);
    ctx.fill();
    ctx.restore();

    // sheet
    const pg = ctx.createLinearGradient(0, -paper.h*0.5, 0, paper.h*0.5);
    pg.addColorStop(0, pal.paperA);
    pg.addColorStop(1, pal.paperB);
    ctx.fillStyle = pg;
    roundedRect(ctx, -paper.w*0.5, -paper.h*0.5, paper.w, paper.h, paper.w*0.03);
    ctx.fill();

    // crease lines
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(1, paper.w * 0.0018);
    ctx.beginPath();
    ctx.moveTo(-paper.w*0.5, 0);
    ctx.lineTo(paper.w*0.5, 0);
    ctx.moveTo(0, -paper.h*0.5);
    ctx.lineTo(0, paper.h*0.5);
    ctx.stroke();
    ctx.restore();

    // grain
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (const g of grain){
      ctx.globalAlpha = g.a;
      ctx.fillRect(g.x, g.y, 1, 1);
    }
    ctx.restore();

    ctx.restore();
  }

  function drawStreets(ctx, foldAmt, driftX, driftY){
    ctx.save();
    ctx.translate(paper.x + driftX, paper.y + driftY);
    ctx.rotate(paper.rot);

    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(20,18,20,0.65)';

    for (const s of streets){
      ctx.lineWidth = s.w;
      const a = foldAmt;
      drawLinePartial(ctx, s.x1, s.y1, s.x2, s.y2, a);
    }

    // accent route labels
    const labelA = foldAmt;
    if (labelA > 0.2){
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.35 * foldAmt;
      ctx.fillStyle = pal.accent;
      ctx.font = `${Math.floor(Math.max(11, paper.h * 0.045))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('PAPER CITY', -paper.w*0.44, -paper.h*0.42);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawBuilding(ctx, b, popAmt, lightsAmt){
    const ht = b.ht * popAmt;
    const ex = -paper.w * 0.045 * ht;
    const ey = -paper.h * 0.075 * ht;

    // base shadow
    ctx.save();
    ctx.globalAlpha = 0.18 * popAmt;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    ctx.rect(b.x + paper.w*0.008, b.y + paper.h*0.01, b.w, b.h);
    ctx.fill();
    ctx.restore();

    // faces
    const top = { x: b.x + ex, y: b.y + ey, w: b.w, h: b.h };

    // side face
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    ctx.beginPath();
    ctx.moveTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w + ex, b.y + ey);
    ctx.lineTo(b.x + b.w + ex, b.y + b.h + ey);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.closePath();
    ctx.fill();

    // front face
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    ctx.lineTo(b.x + ex, b.y + b.h + ey);
    ctx.lineTo(b.x + b.w + ex, b.y + b.h + ey);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.closePath();
    ctx.fill();

    // top face
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.rect(top.x, top.y, top.w, top.h);
    ctx.fill();

    // fold outline
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(1, paper.w * 0.0015);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.strokeRect(top.x, top.y, top.w, top.h);
    ctx.restore();

    // windows (appear during lights phase)
    if (lightsAmt > 0){
      const wr = mulberry32((b.winSeed ^ (seed >>> 0)) >>> 0);
      const cols = Math.max(1, (b.w / (paper.w * 0.06)) | 0);
      const rows = Math.max(1, (b.h / (paper.h * 0.07)) | 0);
      const sx = b.w / (cols + 1);
      const sy = b.h / (rows + 1);
      const tw = 0.65 + 0.35 * Math.sin(t * 0.7 + b.x * 0.02);
      ctx.save();
      ctx.fillStyle = pal.lights;
      ctx.globalAlpha = (0.1 + 0.7 * lightsAmt) * tw;
      for (let ry=1; ry<=rows; ry++){
        for (let cx=1; cx<=cols; cx++){
          if (wr() < 0.35) continue;
          const wx = b.x + cx * sx;
          const wy = b.y + ry * sy;
          const s = Math.max(1, paper.w * 0.006);
          ctx.fillRect(wx - s*0.5, wy - s*0.5, s, s);
        }
      }
      ctx.restore();
    }
  }

  function drawCity(ctx, popAmt, lightsAmt, driftX, driftY){
    ctx.save();
    ctx.translate(paper.x + driftX, paper.y + driftY);
    ctx.rotate(paper.rot);

    // subtle sheet ambient tint (helps depth)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = pal.accent;
    ctx.fillRect(-paper.w*0.5, -paper.h*0.5, paper.w, paper.h);
    ctx.restore();

    for (const b of buildings) drawBuilding(ctx, b, popAmt, lightsAmt);

    ctx.restore();
  }

  function drawCrane(ctx, flyAmt, driftX, driftY){
    if (flyAmt <= 0) return;

    const cyc = t % CYCLE_DUR;
    const phaseT = (cyc - 3 * PHASE_DUR) / PHASE_DUR;
    const u = lerp(-0.62, 0.62, ease(phaseT));
    const v = -0.22 + Math.sin(phaseT * Math.PI * 2) * 0.06;

    ctx.save();
    ctx.translate(paper.x + driftX, paper.y + driftY);
    ctx.rotate(paper.rot);

    const x = u * paper.w;
    const y = v * paper.h;

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.18 * flyAmt;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    ctx.ellipse(x + paper.w*0.02, y + paper.h*0.03, paper.w*0.07, paper.h*0.03, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // simple origami crane glyph
    ctx.save();
    ctx.globalAlpha = 0.85 * flyAmt;
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = Math.max(1, paper.w * 0.002);
    ctx.lineJoin = 'round';

    const s = paper.w * 0.09;
    ctx.beginPath();
    ctx.moveTo(x - s*0.55, y);
    ctx.lineTo(x, y - s*0.25);
    ctx.lineTo(x + s*0.55, y);
    ctx.lineTo(x, y + s*0.22);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y - s*0.25);
    ctx.lineTo(x - s*0.25, y - s*0.62);
    ctx.moveTo(x, y - s*0.25);
    ctx.lineTo(x + s*0.28, y - s*0.58);
    ctx.stroke();

    ctx.restore();

    ctx.restore();
  }

  function drawOverlay(ctx, label, amt){
    const pad = Math.floor(Math.min(w, h) * 0.04);
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    roundedRect(ctx, pad, pad, Math.max(180, w*0.32), Math.max(38, h*0.06), 10);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `${Math.floor(Math.max(14, h * 0.034))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(`CH ??  PAPER CITY`, pad + 14, pad + Math.max(19, h*0.03));

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = pal.accent;
    ctx.font = `${Math.floor(Math.max(12, h * 0.03))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(label, pad + 14, pad + Math.max(19, h*0.03) + Math.max(16, h*0.03));

    // phase bar
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(pad + 14, pad + Math.max(34, h*0.055), Math.max(150, w*0.25), 2);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(pad + 14, pad + Math.max(34, h*0.055), Math.max(150, w*0.25) * amt, 2);

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cyc = t % CYCLE_DUR;
    const pIdx = Math.floor(cyc / PHASE_DUR);
    const pT = (cyc - pIdx * PHASE_DUR) / PHASE_DUR;

    const foldAmt = pIdx === 0 ? ease(pT) : 1;
    const popAmt = pIdx < 1 ? 0 : (pIdx === 1 ? ease(pT) : 1);
    const lightsAmt = pIdx < 2 ? 0 : (pIdx === 2 ? ease(pT) : 1);
    const flyAmt = pIdx === 3 ? ease(pT) : 0;

    const driftX = Math.sin(t * 0.11) * w * 0.004 + Math.sin(t * 0.33) * w * 0.002;
    const driftY = Math.sin(t * 0.13) * h * 0.004;

    drawDesk(ctx);
    drawPaper(ctx, driftX, driftY);
    drawStreets(ctx, foldAmt, driftX, driftY);
    drawCity(ctx, popAmt, lightsAmt, driftX, driftY);
    drawCrane(ctx, flyAmt, driftX, driftY);

    // phase flash (creases catch the light)
    if (phaseFlash > 0){
      ctx.save();
      ctx.globalAlpha = 0.08 * phaseFlash;
      ctx.fillStyle = pal.accent;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    const label = PHASES[pIdx]?.label || '...';
    drawOverlay(ctx, label, (pIdx + pT) / PHASES.length);
  }

  function init({ width, height }){ onResize(width, height); }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
