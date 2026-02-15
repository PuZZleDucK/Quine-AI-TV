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

function drawGear(ctx, x, y, r, teeth, color, stroke){
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i=0;i<teeth;i++){
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.5) / teeth) * Math.PI * 2;
    const a2 = ((i + 1) / teeth) * Math.PI * 2;
    const ro = r * 1.08;
    const ri = r * 0.92;
    ctx.lineTo(Math.cos(a0) * ro, Math.sin(a0) * ro);
    ctx.lineTo(Math.cos(a1) * ri, Math.sin(a1) * ri);
    ctx.lineTo(Math.cos(a2) * ro, Math.sin(a2) * ro);
  }
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = stroke;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();

  ctx.restore();
}

function drawScrew(ctx, x, y, r, color){
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(1, r * 0.35);
  ctx.beginPath();
  ctx.moveTo(-r*0.55, 0);
  ctx.lineTo(r*0.55, 0);
  ctx.stroke();
  ctx.restore();
}

function header(ctx, w, title, subtitle, phaseLabel, p, font, small){
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  roundedRect(ctx, 14, 14, w - 28, Math.max(54, font * 3.0), 12);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = `700 ${font}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(title, 28, 22);

  ctx.fillStyle = 'rgba(240,240,240,0.82)';
  ctx.font = `500 ${small}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(subtitle, 28, 22 + font * 1.18);

  ctx.fillStyle = 'rgba(255,230,160,0.95)';
  ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.fillText(phaseLabel, 28, 22 + font * 1.18 + small * 1.05);

  // progress bar
  const barW = Math.min(220, w * 0.26);
  const bx = w - 28 - barW;
  const by = 22 + font * 1.18 + small * 1.05;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundedRect(ctx, bx, by + 2, barW, Math.max(8, small * 0.55), 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,230,160,0.65)';
  roundedRect(ctx, bx, by + 2, barW * clamp(p,0,1), Math.max(8, small * 0.55), 8);
  ctx.fill();

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
    { wood0: '#24160f', wood1: '#17100b', brass: '#e0b45a', brass2: '#b98a2a', steel: '#c7ccd6', ink: 'rgba(255,255,255,0.9)' },
    { wood0: '#1f1410', wood1: '#120c0a', brass: '#d7b46d', brass2: '#ad7a2b', steel: '#b8c4d8', ink: 'rgba(255,255,255,0.9)' },
    { wood0: '#2a1a12', wood1: '#140d09', brass: '#f0c06c', brass2: '#c2892c', steel: '#d0d6df', ink: 'rgba(255,255,255,0.9)' },
  ];
  const pal = pick(rand, palettes);

  const PHASES = [
    { id: 'sort', label: 'SORT PARTS' },
    { id: 'assemble', label: 'ASSEMBLE MOVEMENT' },
    { id: 'regulate', label: 'REGULATE TICK' },
  ];

  const PHASE_DUR = 18;
  let phaseIdx = 0;
  let phaseT = 0;

  // layout
  let bench = { x: 0, y: 0, w: 0, h: 0 };
  let trays = []; // {x,y,w,h}
  let parts = []; // {kind, r, teeth, sx,sy, sortx,sorty, asmx,asmy, x,y, spin, spin2, hue}
  let movement = { x: 0, y: 0, r: 0 };
  let balance = { x: 0, y: 0, r: 0 };

  // loupe inset
  let loupe = { x: 0, y: 0, r: 0 };

  // special moment
  let tickFlash = 0;
  let nextPerfectAt = 0;

  // audio
  let ambience = null;
  let tickAcc = 0;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regen(){
    t = 0;
    phaseIdx = 0;
    phaseT = 0;
    tickFlash = 0;

    bench = { x: w * 0.08, y: h * 0.12, w: w * 0.84, h: h * 0.8 };

    const trayW = bench.w * 0.26;
    const trayH = bench.h * 0.22;
    trays = [
      { x: bench.x + bench.w * 0.05, y: bench.y + bench.h * 0.18, w: trayW, h: trayH },
      { x: bench.x + bench.w * 0.05, y: bench.y + bench.h * 0.46, w: trayW, h: trayH },
      { x: bench.x + bench.w * 0.05, y: bench.y + bench.h * 0.74, w: trayW, h: trayH },
    ];

    movement = { x: bench.x + bench.w * 0.62, y: bench.y + bench.h * 0.56, r: Math.min(bench.w, bench.h) * 0.22 };
    balance = { x: movement.x + movement.r * 0.38, y: movement.y - movement.r * 0.24, r: movement.r * 0.38 };

    loupe = { x: bench.x + bench.w * 0.82, y: bench.y + bench.h * 0.26, r: Math.min(w,h) * 0.12 };

    // parts
    const partCount = 12 + ((rand() * 8) | 0);
    parts = [];

    for (let i=0;i<partCount;i++){
      const kind = rand() < 0.62 ? 'gear' : 'screw';
      const r0 = (kind === 'gear') ? (12 + rand() * 22) : (5 + rand() * 7);
      const tray = i % trays.length;
      const slotX = (i % 4);
      const slotY = ((i / 4) | 0) % 2;

      const tr = trays[tray];
      const sortx = tr.x + tr.w * (0.22 + slotX * 0.2) + (rand() - 0.5) * 6;
      const sorty = tr.y + tr.h * (0.34 + slotY * 0.32) + (rand() - 0.5) * 6;

      const ang = rand() * Math.PI * 2;
      const rad = movement.r * (0.12 + rand() * 0.82);
      const asmx = movement.x + Math.cos(ang) * rad;
      const asmy = movement.y + Math.sin(ang) * rad;

      const sx = bench.x + bench.w * (0.22 + rand() * 0.7);
      const sy = bench.y + bench.h * (0.15 + rand() * 0.78);

      parts.push({
        kind,
        r: r0,
        teeth: 10 + ((rand() * 14) | 0),
        sx, sy,
        sortx, sorty,
        asmx, asmy,
        x: sx, y: sy,
        spin: (rand() - 0.5) * 0.8,
        spin2: (rand() - 0.5) * 1.4,
        hue: 0.8 + rand() * 0.2,
      });
    }

    nextPerfectAt = 7 + rand() * 10;
    tickAcc = 0;
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

    // soft bench room-tone + low drift drone
    const n = audio.noiseSource({ type: 'brown', gain: 0.0036 });
    n.start();

    const d = simpleDrone(audio, { root: 55 + rand()*10, detune: 0.8, gain: 0.014 });

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

  function destroy(){
    onAudioOff();
  }

  function onPhaseEnter(){
    safeBeep({ freq: 520 + rand()*180, dur: 0.014, gain: 0.007, type: 'square' });
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    tickFlash = Math.max(0, tickFlash - dt * 1.35);

    if (phaseT >= PHASE_DUR){
      phaseT = phaseT % PHASE_DUR;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      onPhaseEnter();
    }

    const ph = PHASES[phaseIdx].id;
    const p = phaseT / PHASE_DUR;

    // perfect tick special moment
    if (t >= nextPerfectAt){
      tickFlash = 1;
      nextPerfectAt = t + 10 + rand() * 16;
      if (audio.enabled){
        safeBeep({ freq: 880, dur: 0.03, gain: 0.012, type: 'triangle' });
        safeBeep({ freq: 1320, dur: 0.02, gain: 0.009, type: 'triangle' });
      }
    }

    // per-phase motion (no allocations)
    for (let i=0;i<parts.length;i++){
      const part = parts[i];
      let tx = part.x;
      let ty = part.y;

      if (ph === 'sort'){
        const e = ease(p);
        tx = lerp(part.sx, part.sortx, e);
        ty = lerp(part.sy, part.sorty, e);
      } else if (ph === 'assemble'){
        const e = ease(p);
        // start from sorted trays (snapped), then glide into movement
        tx = lerp(part.sortx, part.asmx, e);
        ty = lerp(part.sorty, part.asmy, e);
      } else {
        // regulate: tiny breathing around assembled position
        const wob = Math.sin(t * (0.7 + part.hue * 0.9) + i) * (0.6 + part.hue);
        tx = part.asmx + wob;
        ty = part.asmy + Math.cos(t * (0.62 + part.hue) + i * 0.4) * (0.6 + part.hue);
      }

      // subtle bench drift
      const drift = Math.sin(t * 0.12) * 0.8;
      part.x = tx + drift;
      part.y = ty + Math.cos(t * 0.11) * 0.5;
    }

    // optional tick sfx
    if (audio.enabled){
      let tickRate = 2.0;
      if (ph === 'assemble') tickRate = 2.2;
      if (ph === 'regulate') tickRate = 2.6;
      tickAcc += dt * tickRate;
      while (tickAcc >= 1){
        tickAcc -= 1;
        safeBeep({ freq: 240 + rand()*30, dur: 0.012, gain: 0.0055, type: 'square' });
        if (rand() < 0.35) safeBeep({ freq: 860 + rand()*90, dur: 0.006, gain: 0.0022, type: 'triangle' });
      }
    }
  }

  function drawBench(ctx){
    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#060506');
    bg.addColorStop(1, '#030203');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,w,h);

    // bench surface
    const g = ctx.createLinearGradient(bench.x, bench.y, bench.x, bench.y + bench.h);
    g.addColorStop(0, pal.wood0);
    g.addColorStop(1, pal.wood1);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = g;
    roundedRect(ctx, bench.x, bench.y, bench.w, bench.h, 26);
    ctx.fill();
    ctx.restore();

    // wood grain lines
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    const lines = 16;
    for (let i=0;i<lines;i++){
      const yy = bench.y + (i / (lines-1)) * bench.h;
      ctx.beginPath();
      ctx.moveTo(bench.x + bench.w * 0.05, yy);
      ctx.bezierCurveTo(
        bench.x + bench.w * (0.25 + Math.sin(i*0.8)*0.03), yy + Math.sin(i)*6,
        bench.x + bench.w * (0.6 + Math.cos(i*0.7)*0.03), yy + Math.cos(i)*6,
        bench.x + bench.w * 0.95, yy
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTrays(ctx){
    for (let i=0;i<trays.length;i++){
      const tr = trays[i];
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      roundedRect(ctx, tr.x+6, tr.y+8, tr.w, tr.h, 16);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      roundedRect(ctx, tr.x, tr.y, tr.w, tr.h, 16);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      roundedRect(ctx, tr.x, tr.y, tr.w, tr.h, 16);
      ctx.stroke();

      // dividers
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let k=1;k<4;k++){
        const xx = tr.x + tr.w * (k/4);
        ctx.beginPath();
        ctx.moveTo(xx, tr.y + tr.h*0.12);
        ctx.lineTo(xx, tr.y + tr.h*0.88);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawMovement(ctx){
    const mx = movement.x;
    const my = movement.y;
    const r = movement.r;

    // shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(mx + 8, my + 10, r*1.02, r*0.92, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // main plate
    const plate = ctx.createRadialGradient(mx - r*0.2, my - r*0.3, r*0.2, mx, my, r*1.1);
    plate.addColorStop(0, 'rgba(230,234,242,0.92)');
    plate.addColorStop(1, 'rgba(140,150,168,0.75)');
    ctx.fillStyle = plate;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(2, r*0.05);
    ctx.stroke();

    // jewel screws
    for (let i=0;i<6;i++){
      const a = (i/6) * Math.PI*2 + 0.4;
      const x = mx + Math.cos(a) * r * 0.78;
      const y = my + Math.sin(a) * r * 0.78;
      ctx.fillStyle = 'rgba(160,40,60,0.75)';
      ctx.beginPath();
      ctx.arc(x, y, r*0.045, 0, Math.PI*2);
      ctx.fill();
    }

    // balance wheel (regulation)
    const bw = balance;
    const wob = Math.sin(t * 6.5) * 0.22;
    ctx.save();
    ctx.translate(bw.x, bw.y);
    ctx.rotate(wob);
    ctx.strokeStyle = pal.brass2;
    ctx.lineWidth = Math.max(2, bw.r*0.08);
    ctx.beginPath();
    ctx.arc(0,0,bw.r,0,Math.PI*2);
    ctx.stroke();

    // spokes
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, bw.r*0.05);
    const spokes = 7;
    for (let i=0;i<spokes;i++){
      const a = (i/spokes) * Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*bw.r*0.25, Math.sin(a)*bw.r*0.25);
      ctx.lineTo(Math.cos(a)*bw.r*0.98, Math.sin(a)*bw.r*0.98);
      ctx.stroke();
    }
    ctx.restore();

    // regulation timing lines
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1;
    for (let i=0;i<12;i++){
      const a = (i/12) * Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(mx + Math.cos(a)*r*0.12, my + Math.sin(a)*r*0.12);
      ctx.lineTo(mx + Math.cos(a)*r*0.92, my + Math.sin(a)*r*0.92);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParts(ctx){
    for (let i=0;i<parts.length;i++){
      const part = parts[i];
      const brass = `rgba(${Math.floor(224*part.hue)}, ${Math.floor(180*part.hue)}, ${Math.floor(90*part.hue)}, 0.92)`;

      if (part.kind === 'gear'){
        const spin = t * part.spin2;
        ctx.save();
        ctx.translate(part.x, part.y);
        ctx.rotate(spin);
        drawGear(ctx, 0, 0, part.r, part.teeth, brass, 'rgba(0,0,0,0.45)');
        ctx.restore();
      } else {
        drawScrew(ctx, part.x, part.y, part.r, 'rgba(210,216,230,0.88)');
      }
    }
  }

  function drawLoupe(ctx){
    // loupe body
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18;

    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.arc(loupe.x, loupe.y, loupe.r + 8, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();

    // clip circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(loupe.x, loupe.y, loupe.r, 0, Math.PI*2);
    ctx.clip();

    // magnified movement
    const sx = loupe.x - (balance.x - loupe.x) * 1.6;
    const sy = loupe.y - (balance.y - loupe.y) * 1.6;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1.6, 1.6);
    drawMovement(ctx);
    ctx.restore();

    // glass sheen
    const sh = ctx.createRadialGradient(loupe.x - loupe.r*0.3, loupe.y - loupe.r*0.35, loupe.r*0.1, loupe.x, loupe.y, loupe.r);
    sh.addColorStop(0, 'rgba(255,255,255,0.26)');
    sh.addColorStop(0.6, 'rgba(255,255,255,0.06)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(loupe.x - loupe.r, loupe.y - loupe.r, loupe.r*2, loupe.r*2);

    ctx.restore();

    // ring
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(loupe.x, loupe.y, loupe.r, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPerfectTick(ctx){
    if (tickFlash <= 0) return;

    const a = tickFlash;
    const mx = movement.x;
    const my = movement.y;
    const r = movement.r;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = a * 0.55;

    // glint rays
    ctx.strokeStyle = 'rgba(255,240,200,0.95)';
    ctx.lineWidth = 2;
    for (let i=0;i<10;i++){
      const ang = (i/10) * Math.PI*2 + t*0.2;
      ctx.beginPath();
      ctx.moveTo(mx + Math.cos(ang)*r*0.35, my + Math.sin(ang)*r*0.35);
      ctx.lineTo(mx + Math.cos(ang)*r*1.05, my + Math.sin(ang)*r*1.25);
      ctx.stroke();
    }

    ctx.restore();

    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(255,240,210,0.18)';
    ctx.fillRect(0,0,w,h);

    ctx.fillStyle = 'rgba(255,235,170,0.95)';
    ctx.font = `800 ${Math.floor(font * 1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PERFECT TICK', mx, my + r * 0.92);

    ctx.restore();
  }

  function render(ctx){
    drawBench(ctx);

    const ph = PHASES[phaseIdx];
    const p = phaseT / PHASE_DUR;

    header(ctx, w, "Timekeeper's Bench ASMR", 'sort • assemble • regulate', ph.label, p, font, small);

    drawTrays(ctx);
    drawMovement(ctx);
    drawParts(ctx);
    drawLoupe(ctx);
    drawPerfectTick(ctx);

    // vignette
    const vg = ctx.createRadialGradient(w*0.55, h*0.55, Math.min(w,h)*0.22, w*0.55, h*0.55, Math.max(w,h)*0.82);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
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
