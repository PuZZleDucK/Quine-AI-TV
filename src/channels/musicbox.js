// REVIEWED: 2026-02-11
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

function circle(ctx, x, y, r){
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI*2);
}

function drawGear(ctx, cx, cy, r, teeth, ang, fill, stroke){
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);

  ctx.beginPath();
  for (let i=0;i<teeth;i++){
    const a0 = (i / teeth) * Math.PI*2;
    const a1 = ((i+0.5) / teeth) * Math.PI*2;
    const a2 = ((i+1) / teeth) * Math.PI*2;
    const r0 = r * 0.86;
    const r1 = r * 1.02;
    ctx.lineTo(Math.cos(a0)*r0, Math.sin(a0)*r0);
    ctx.lineTo(Math.cos(a1)*r1, Math.sin(a1)*r1);
    ctx.lineTo(Math.cos(a2)*r0, Math.sin(a2)*r0);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.strokeStyle = stroke;
  ctx.stroke();

  // hub
  circle(ctx, 0, 0, r * 0.35);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();
  circle(ctx, 0, 0, r * 0.14);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();

  ctx.restore();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  const palettes = [
    { bg0:'#07060a', bg1:'#140f14', wood0:'#2a1e16', wood1:'#3a2a1e', box:'#241b14', box2:'#2f241a', brass:'#d8b35e', brass2:'#b9923b', steel:'#bfc7cf', ink:'#fff5e8', sub:'rgba(255,245,232,0.65)', accent:'#ffdb7a', ok:'#7cffc9', warn:'#ff5a7a' },
    { bg0:'#07090d', bg1:'#0f1622', wood0:'#1c232d', wood1:'#2a3441', box:'#141a22', box2:'#1c2430', brass:'#d9c3a1', brass2:'#b79f7a', steel:'#cde2ff', ink:'#eaf6ff', sub:'rgba(234,246,255,0.62)', accent:'#6cf2ff', ok:'#8dffb0', warn:'#ff6a3a' },
    { bg0:'#06060a', bg1:'#110d18', wood0:'#251c2c', wood1:'#372343', box:'#1a1320', box2:'#241a2d', brass:'#ffcc6a', brass2:'#dba03a', steel:'#e6d7ff', ink:'#fff6ec', sub:'rgba(255,246,236,0.62)', accent:'#ff7ad6', ok:'#7cffc9', warn:'#ff4ea6' },
  ];
  const pal = pick(rand, palettes);

  const PHASES = [
    { id: 'align', label: 'ALIGN', dur: 12.0 },
    { id: 'punch', label: 'PUNCH', dur: 14.0 },
    { id: 'test', label: 'TEST', dur: 24.0 },
    { id: 'finale', label: 'PERFECT TUNE', dur: 10.0 },
  ];

  // sequence
  const steps = 16;
  const scaleHz = pick(rand, [
    // music-box-ish: major pent + a couple extras
    [523.25, 587.33, 659.25, 783.99, 880.00, 987.77, 1046.50, 1174.66],
    [440.00, 493.88, 554.37, 659.25, 739.99, 880.00, 987.77, 1108.73],
    [392.00, 440.00, 493.88, 587.33, 659.25, 783.99, 880.00, 987.77],
  ]);

  function genPattern(){
    const density = 0.42 + rand()*0.22;
    const out = new Array(steps).fill(-1);
    let n = 0;
    for (let i=0;i<steps;i++){
      if (rand() < density){
        out[i] = (rand() * scaleHz.length) | 0;
        n++;
      }
    }
    // ensure it's not too sparse
    while (n < 6){
      const i = (rand()*steps)|0;
      if (out[i] === -1){ out[i] = (rand()*scaleHz.length)|0; n++; }
    }
    return out;
  }

  const patterns = Array.from({ length: 3 }, () => genPattern());
  let patternIndex = 0;

  // layout
  let pad = 0;
  let box = { x:0, y:0, w:0, h:0 };
  let drum = { x:0, y:0, r:0, ry:0 };
  let comb = { x:0, y:0, w:0, h:0 };
  let gearA = { x:0, y:0, r:0 };
  let gearB = { x:0, y:0, r:0 };

  // motion/state
  let phaseIdx = 0;
  let phaseT = 0;
  let drumAng = rand()*Math.PI*2;
  let gearAng = rand()*Math.PI*2;
  let alignErr0 = (rand() - 0.5) * 0.9; // -0.45..0.45 ("tick" units)
  let alignErr = alignErr0;

  let revealPins = 0; // 0..1
  let contactPulse = 0;
  let sparkle = 0;
  let nextSlipAt = 6 + rand()*10;
  let slip = 0;

  let lastStep = -1;

  // audio
  let ambience = null;
  let drone = null;

  function phase(){ return PHASES[phaseIdx]; }
  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function stopAmbience({ clearCurrent = false } = {}){
    const handle = ambience;
    if (!handle){
      drone = null;
      return;
    }

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ambience = null;
    drone = null;
  }

  function regen(){
    pad = Math.floor(Math.min(w, h) * 0.06);

    box = {
      x: pad,
      y: pad,
      w: w - pad*2,
      h: h - pad*2,
    };

    const mechW = box.w * 0.78;
    const mechH = box.h * 0.64;
    const mx = box.x + (box.w - mechW) * 0.5;
    const my = box.y + box.h * 0.26;

    const R = Math.min(mechW, mechH) * 0.27;
    drum = {
      x: mx + mechW * 0.43,
      y: my + mechH * 0.54,
      r: R,
      ry: R * 0.58,
    };

    comb = {
      x: mx + mechW * 0.74,
      y: my + mechH * 0.54,
      w: mechW * 0.18,
      h: mechH * 0.44,
    };

    gearA = { x: mx + mechW * 0.28, y: my + mechH * 0.63, r: R * 0.6 };
    gearB = { x: mx + mechW * 0.19, y: my + mechH * 0.46, r: R * 0.42 };
  }

  function init({ width, height, dpr: dprIn=1 }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    t = 0;
    phaseIdx = 0;
    phaseT = 0;
    patternIndex = 0;
    drumAng = rand()*Math.PI*2;
    gearAng = rand()*Math.PI*2;
    alignErr0 = (rand() - 0.5) * 0.9;
    alignErr = alignErr0;
    revealPins = 0;
    contactPulse = 0;
    sparkle = 0;
    nextSlipAt = 6 + rand()*10;
    slip = 0;
    lastStep = -1;
    regen();
  }

  function onResize(width, height, dprIn=1){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive: if onAudioOn is called repeatedly while audio is enabled,
    // ensure we don't stack/overlap our own ambience.
    stopAmbience({ clearCurrent: true });

    drone = simpleDrone(audio, { root: 55 + rand()*16, detune: 1.0, gain: 0.010 });
    ambience = {
      stop(){
        try { drone?.stop?.(); } catch {}
      },
    };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    stopAmbience({ clearCurrent: true });
  }

  function destroy(){ onAudioOff(); }

  function onPhaseEnter(prevId){
    const id = phase().id;

    if (id === 'align'){
      // start a new pattern cycle when we loop around
      revealPins = 0;
      alignErr0 = (rand() - 0.5) * 0.9;
      alignErr = alignErr0;
    }

    if (id === 'punch'){
      safeBeep({ freq: 240, dur: 0.05, gain: 0.03, type: 'square' });
    }

    if (id === 'test'){
      safeBeep({ freq: 660, dur: 0.06, gain: 0.04, type: 'triangle' });
    }

    if (id === 'finale'){
      sparkle = 1;
      safeBeep({ freq: 1046.5, dur: 0.08, gain: 0.045, type: 'sine' });
      safeBeep({ freq: 1567.98, dur: 0.06, gain: 0.02, type: 'triangle' });
    }

    if (prevId === 'finale' && id === 'align'){
      patternIndex = (patternIndex + 1) % patterns.length;
      lastStep = -1;
    }
  }

  function update(dt){
    t += dt;

    phaseT += dt;
    while (phaseT >= phase().dur){
      phaseT -= phase().dur;
      const prev = phase().id;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      onPhaseEnter(prev);
    }

    sparkle = Math.max(0, sparkle - dt * 1.35);
    contactPulse = Math.max(0, contactPulse - dt * 6.5);
    slip = Math.max(0, slip - dt * 2.6);

    // periodic tiny gear slip
    if (t >= nextSlipAt){
      slip = 1;
      nextSlipAt = t + 10 + rand()*14;
      if (phase().id !== 'finale') safeBeep({ freq: 130 + rand()*40, dur: 0.035, gain: 0.012, type: 'square' });
    }

    const p = phase();
    const pt = phaseT / p.dur;

    // phase motion
    const baseSpeed = p.id === 'test' || p.id === 'finale' ? 1.05 : (p.id === 'punch' ? 0.62 : 0.42);
    const speed = baseSpeed * (1 + slip * 0.28);
    drumAng += dt * speed;
    gearAng += dt * speed * 1.2;

    if (p.id === 'align'){
      alignErr = lerp(alignErr0, 0, ease(pt));
      revealPins = 0.15 + 0.15 * ease(pt);
    } else if (p.id === 'punch'){
      revealPins = ease(pt);
      // little hand jitter while punching
      alignErr = Math.sin(t * 1.1) * 0.03;
    } else {
      revealPins = 1;
      alignErr = Math.sin(t * 0.28) * 0.015;
    }

    // audio note triggers during test/finale
    if (p.id === 'test' || p.id === 'finale'){
      const cur = patterns[patternIndex];
      const s = ((drumAng / (Math.PI * 2)) * steps);
      const step = ((Math.floor(s) % steps) + steps) % steps;
      if (step !== lastStep){
        lastStep = step;

        const pin = cur[step];
        if (pin >= 0){
          contactPulse = 1;
          const hz = scaleHz[pin];
          const bright = p.id === 'finale' ? 1.0 : 0.8;
          safeBeep({ freq: hz * (1 + (rand()-0.5)*0.004), dur: 0.06, gain: 0.02 * bright, type: 'triangle' });
          if (p.id === 'finale' && rand() < 0.18){
            safeBeep({ freq: hz*2, dur: 0.04, gain: 0.008, type: 'sine' });
          }
        }
      }
    } else {
      lastStep = -1;
    }

    // punch clicks
    if (p.id === 'punch'){
      if ((Math.sin(t * 4.2) * 0.5 + 0.5) > 0.995){
        safeBeep({ freq: 190 + rand()*80, dur: 0.03, gain: 0.02, type: 'square' });
      }
    }
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(1, pal.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle vignette
    const v = ctx.createRadialGradient(w*0.5, h*0.55, 1, w*0.5, h*0.55, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0,0,w,h);
  }

  function drawDesk(ctx){
    const g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    g.addColorStop(0, pal.wood0);
    g.addColorStop(1, pal.wood1);
    ctx.fillStyle = g;
    roundedRect(ctx, box.x, box.y, box.w, box.h, Math.max(10, Math.min(w,h)*0.02));
    ctx.fill();

    // grain
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w,h)/520));
    for (let i=0;i<18;i++){
      const yy = box.y + (i/18)*box.h;
      const amp = box.w * (0.01 + (i%3)*0.003);
      ctx.beginPath();
      for (let x=box.x; x<=box.x+box.w; x+=box.w/24){
        const u = (x - box.x) / box.w;
        const y = yy + Math.sin(u*8 + i*1.7 + t*0.08) * amp;
        if (x===box.x) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMusicBox(ctx){
    const p = phase();

    // inner mechanism plate
    const px = box.x + box.w*0.12;
    const py = box.y + box.h*0.22;
    const pw = box.w*0.76;
    const ph = box.h*0.68;

    const plate = ctx.createLinearGradient(0, py, 0, py + ph);
    plate.addColorStop(0, pal.box2);
    plate.addColorStop(1, pal.box);
    ctx.fillStyle = plate;
    roundedRect(ctx, px, py, pw, ph, Math.max(12, Math.min(w,h)*0.02));
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w,h)/520));
    ctx.stroke();

    // screws
    for (const s of [
      [px+pw*0.06, py+ph*0.08], [px+pw*0.94, py+ph*0.08],
      [px+pw*0.06, py+ph*0.92], [px+pw*0.94, py+ph*0.92],
    ]){
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      circle(ctx, s[0], s[1], Math.min(pw, ph)*0.012);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.stroke();
    }

    // gears behind
    drawGear(ctx, gearA.x, gearA.y, gearA.r, 14, gearAng*0.9, 'rgba(0,0,0,0.18)', `rgba(255,255,255,${0.10 + slip*0.08})`);
    drawGear(ctx, gearB.x, gearB.y, gearB.r, 12, -gearAng*1.1, 'rgba(0,0,0,0.20)', `rgba(255,255,255,${0.10 + slip*0.08})`);

    // brass gear overlay
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawGear(ctx, gearA.x, gearA.y, gearA.r*0.88, 14, gearAng*0.9, 'rgba(0,0,0,0)', `rgba(216,179,94,${0.18 + contactPulse*0.08})`);
    ctx.restore();

    // drum top
    const topG = ctx.createRadialGradient(drum.x - drum.r*0.2, drum.y - drum.ry*0.2, 1, drum.x, drum.y, drum.r*1.1);
    topG.addColorStop(0, pal.brass);
    topG.addColorStop(1, pal.brass2);

    ctx.save();
    ctx.translate(drum.x, drum.y);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, drum.ry*1.42, drum.r*0.96, drum.ry*0.38, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, 0, drum.r, drum.ry, 0, 0, Math.PI*2);
    ctx.fillStyle = topG;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w,h)/560));
    ctx.stroke();

    // lanes + pins
    const cur = patterns[patternIndex];
    const lanes = scaleHz.length;
    const pinCount = Math.floor(steps * revealPins + 0.001);

    // contact marker (comb side)
    const markerA = 0;

    for (let i=0;i<steps;i++){
      if (i >= pinCount) break;
      const note = cur[i];
      if (note < 0) continue;

      const lane = note;
      const rr = drum.r * lerp(0.28, 0.95, lane / Math.max(1, lanes-1));
      const a = drumAng + (i/steps) * Math.PI*2 + (alignErr * (Math.PI*2/steps));
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr * (drum.ry / drum.r);

      // glow when near comb (right side)
      const near = Math.cos(a - markerA);
      const hot = clamp((near - 0.88) / 0.12, 0, 1);

      ctx.save();
      ctx.translate(x, y);
      const pr = Math.max(1.2, drum.r * 0.028);
      ctx.fillStyle = `rgba(20,12,8,${0.25 + hot*0.15})`;
      circle(ctx, 1.2, 1.2, pr*0.9);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.15 + hot*0.35})`;
      circle(ctx, 0, 0, pr);
      ctx.fill();
      ctx.restore();
    }

    // top highlight sweep
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.rotate(-Math.PI*0.12 + Math.sin(t*0.2)*0.05);
    const hg = ctx.createLinearGradient(-drum.r, -drum.ry, drum.r, drum.ry);
    hg.addColorStop(0, 'rgba(255,255,255,0)');
    hg.addColorStop(0.52, `rgba(255,255,255,${0.10 + contactPulse*0.10})`);
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, 0, drum.r, drum.ry, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // comb
    const cx = comb.x;
    const cy = comb.y;
    const teeth = scaleHz.length;
    ctx.save();
    ctx.translate(cx, cy);

    // base plate
    const cg = ctx.createLinearGradient(0, -comb.h*0.5, 0, comb.h*0.5);
    cg.addColorStop(0, 'rgba(210,210,220,0.35)');
    cg.addColorStop(1, 'rgba(120,120,130,0.28)');
    ctx.fillStyle = cg;
    roundedRect(ctx, -comb.w*0.5, -comb.h*0.5, comb.w, comb.h, Math.max(8, comb.w*0.08));
    ctx.fill();

    // teeth
    const tw = comb.w * 0.68;
    const th = comb.h * 0.78;
    const y0 = -th*0.5;
    const pitch = th / (teeth + 1);
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + contactPulse*0.25})`;
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w,h)/640));
    for (let i=0;i<teeth;i++){
      const yy = y0 + (i+1) * pitch;
      ctx.beginPath();
      ctx.moveTo(-tw*0.5, yy);
      ctx.lineTo(tw*0.5, yy);
      ctx.stroke();
    }

    // "contact" highlight when playing
    if (p.id === 'test' || p.id === 'finale'){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,219,122,${0.06 + contactPulse*0.10})`;
      roundedRect(ctx, -comb.w*0.5, -comb.h*0.5, comb.w, comb.h, Math.max(8, comb.w*0.08));
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // phase label + alignment meter
    const labelX = box.x + box.w*0.14;
    const labelY = box.y + box.h*0.14;
    const font = Math.max(14, Math.floor(Math.min(w, h) / 30));
    const mono = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    ctx.save();
    ctx.font = mono;
    ctx.textBaseline = 'middle';

    // Title: avoid hardcoded channel numbers here (OSD already shows the real channel).
    ctx.fillStyle = pal.ink;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.fillText('MECHANICAL MUSIC BOX', labelX, labelY);
    ctx.shadowBlur = 0;

    // status line
    ctx.font = `${Math.floor(font*0.86)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = pal.sub;
    ctx.fillText(`MODE: ${p.label}`, labelX, labelY + font*1.4);

    // align meter
    const mx0 = labelX;
    const my0 = labelY + font*2.4;
    const mw = box.w*0.28;
    const mh = Math.max(10, font*0.6);

    roundedRect(ctx, mx0, my0, mw, mh, mh*0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();

    const err = clamp(0.5 + alignErr*0.32, 0, 1);
    const ok = 1 - Math.min(1, Math.abs(alignErr) * 0.8);
    const barW = mw * ok;

    roundedRect(ctx, mx0+2, my0+2, Math.max(2, barW-4), mh-4, (mh-4)*0.5);
    ctx.fillStyle = `rgba(124,255,201,${0.22 + 0.25*(p.id==='align')})`;
    ctx.fill();

    // pointer
    const px2 = mx0 + err * mw;
    ctx.strokeStyle = `rgba(255,255,255,${0.22 + (p.id==='align')*0.15})`;
    ctx.beginPath();
    ctx.moveTo(px2, my0-3);
    ctx.lineTo(px2, my0+mh+3);
    ctx.stroke();

    ctx.fillStyle = pal.sub;
    ctx.fillText('ALIGN', mx0 + mw + 12, my0 + mh*0.5);

    ctx.restore();

    // sparkle finale overlay
    if (sparkle > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const a = sparkle;
      ctx.fillStyle = `rgba(255,219,122,${0.06*a})`;
      ctx.fillRect(0,0,w,h);

      const sx = drum.x + drum.r*0.2;
      const sy = drum.y - drum.ry*0.35;
      const sr = drum.r * (0.6 + (1-sparkle)*0.2);
      const sg = ctx.createRadialGradient(sx, sy, 1, sx, sy, sr);
      sg.addColorStop(0, `rgba(255,255,255,${0.28*a})`);
      sg.addColorStop(0.45, `rgba(255,219,122,${0.10*a})`);
      sg.addColorStop(1, 'rgba(255,219,122,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    drawBackground(ctx);
    drawDesk(ctx);
    drawMusicBox(ctx);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
