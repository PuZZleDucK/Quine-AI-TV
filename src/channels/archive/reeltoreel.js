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
    { bg0:'#0b0c10', bg1:'#15151b', desk:'#1d1b18', deck:'#2a2722', panel:'#1b1f26', panel2:'#11151b', ink:'#f6f1e8', sub:'rgba(246,241,232,0.66)', tape:'#6d4a2c', tape2:'#8b6a48', metal:'#c9c6bd', accent:'#ffcc6a', ok:'#7cffc9', warn:'#ff4b5e' },
    { bg0:'#070a0d', bg1:'#0f141a', desk:'#1c1f23', deck:'#2a2f36', panel:'#182029', panel2:'#10161d', ink:'#eaf6ff', sub:'rgba(234,246,255,0.62)', tape:'#5a3e2b', tape2:'#7a5a41', metal:'#bfc9d2', accent:'#6cf2ff', ok:'#8dffb0', warn:'#ff5a3a' },
    { bg0:'#0a0710', bg1:'#171022', desk:'#221b2d', deck:'#2d243a', panel:'#1a1422', panel2:'#110d18', ink:'#fff6ec', sub:'rgba(255,246,236,0.64)', tape:'#6a3c3c', tape2:'#8c5b5b', metal:'#d4c6c6', accent:'#ffd36a', ok:'#7cffc9', warn:'#ff4ea6' },
  ];
  const pal = pick(rand, palettes);

  const PHASES = [
    { id: 'wind', label: 'WIND', dur: 8.5 },
    { id: 'cut', label: 'CUT', dur: 4.8 },
    { id: 'splice', label: 'SPLICE', dur: 7.2 },
    { id: 'play', label: 'PLAY', dur: 12.0 },
  ];

  const totalDur = PHASES.reduce((a,p)=>a+p.dur, 0);

  // layout
  let deck = { x: 0, y: 0, w: 0, h: 0 };
  let reelL = { x: 0, y: 0, r: 0 };
  let reelR = { x: 0, y: 0, r: 0 };
  let splice = { x: 0, y: 0, w: 0, h: 0 };
  let head = { x: 0, y: 0, w: 0, h: 0 };
  let vu = { x: 0, y: 0, w: 0, h: 0 };
  let label = '';
  let dust = [];

  // motion
  let dash = 0;
  let angL = rand()*Math.PI*2;
  let angR = rand()*Math.PI*2;

  // phase book-keeping
  let phaseIdx = 0;
  let phaseT = 0;

  // fx
  let cutFlash = 0;
  let spliceGlow = 0;
  let sparkle = 0;
  let sparkleAt = 0;
  const rareSparkle = rand() < 0.18;

  // audio
  let ambience = null;
  let noise = null;
  let drone = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function phase(){ return PHASES[phaseIdx]; }

  function timecode(sec){
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2,'0');
    return `${String(m).padStart(2,'0')}:${ss}`;
  }

  function regen(){
    const pad = Math.floor(Math.min(w, h) * 0.06);

    deck = {
      x: pad,
      y: pad,
      w: w - pad*2,
      h: h - pad*2,
    };

    const rx = deck.x + deck.w*0.26;
    const ry = deck.y + deck.h*0.52;
    const rr = Math.floor(Math.min(deck.w, deck.h) * 0.22);

    reelL = { x: Math.floor(rx), y: Math.floor(ry), r: rr };
    reelR = { x: Math.floor(deck.x + deck.w*0.74), y: Math.floor(ry), r: rr };

    const midY = Math.floor(deck.y + deck.h*0.52);
    head = {
      x: Math.floor(deck.x + deck.w*0.46),
      y: Math.floor(midY - rr*0.22),
      w: Math.floor(rr*0.34),
      h: Math.floor(rr*0.44),
    };

    splice = {
      x: Math.floor(deck.x + deck.w*0.48),
      y: Math.floor(midY + rr*0.08),
      w: Math.floor(rr*0.42),
      h: Math.floor(rr*0.18),
    };

    vu = {
      x: Math.floor(deck.x + deck.w*0.16),
      y: Math.floor(deck.y + deck.h*0.12),
      w: Math.floor(deck.w*0.68),
      h: Math.floor(deck.h*0.14),
    };

    font = Math.max(14, Math.floor(Math.min(w, h) / 30));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    const labelsA = ['MASTER', 'WORK', 'TAKE 07', 'SIDE B', 'ARCHIVE', 'PRINT'];
    const labelsB = ['EDIT', 'SPLICE', 'REWIND', 'MIX', 'TRANSFER', 'BUMP'];
    label = `${pick(rand, labelsA)} • ${pick(rand, labelsB)}`;

    dust = Array.from({ length: 150 }, () => ({
      x: rand() * w,
      y: rand() * h,
      s: 0.4 + rand() * 1.8,
      a: 0.15 + rand() * 0.35,
      p: rand() * Math.PI * 2,
      z: 0.25 + rand() * 0.85,
    }));
  }

  function init({ width, height, dpr: dprIn=1 }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    t = 0;
    phaseIdx = 0;
    phaseT = 0;
    dash = 0;
    cutFlash = 0;
    spliceGlow = 0;
    sparkle = 0;
    sparkleAt = 0;
    regen();
  }

  function onResize(width, height, dprIn=1){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    noise = audio.noiseSource({ type: 'pink', gain: 0.0032 });
    noise.start();

    drone = simpleDrone(audio, { root: 52 + rand()*18, detune: 1.1, gain: 0.012 });

    ambience = {
      stop(){
        try { noise?.stop?.(); } catch {}
        try { drone?.stop?.(); } catch {}
      },
    };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
    noise = null;
    drone = null;
  }

  function destroy(){ onAudioOff(); }

  function onPhaseEnter(prevId){
    const id = phase().id;

    if (id === 'cut'){
      cutFlash = 1;
      safeBeep({ freq: 220 + rand()*90, dur: 0.03, gain: 0.010, type: 'square' });
      safeBeep({ freq: 620 + rand()*120, dur: 0.015, gain: 0.006, type: 'triangle' });
    }

    if (id === 'splice'){
      spliceGlow = 1;
      safeBeep({ freq: 420 + rand()*80, dur: 0.04, gain: 0.010, type: 'sawtooth' });
      safeBeep({ freq: 980 + rand()*160, dur: 0.018, gain: 0.006, type: 'sine' });
    }

    if (id === 'play'){
      // splice passes the head shortly after playback begins
      sparkleAt = t + 1.15 + rand()*1.0;
      safeBeep({ freq: 540 + rand()*80, dur: 0.045, gain: 0.012, type: 'triangle' });
    }

    if (id === 'wind' && prevId){
      safeBeep({ freq: 180 + rand()*60, dur: 0.03, gain: 0.006, type: 'sine' });
    }
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    // phase advance
    if (phaseT >= phase().dur){
      const prev = phase().id;
      phaseT = phaseT % phase().dur;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      onPhaseEnter(prev);
    }

    cutFlash = Math.max(0, cutFlash - dt * 1.6);
    spliceGlow = Math.max(0, spliceGlow - dt * 0.55);
    sparkle = Math.max(0, sparkle - dt * 2.2);

    const id = phase().id;
    const p = phaseT / phase().dur;

    let tapeSpeed = 0;
    if (id === 'wind') tapeSpeed = lerp(1.3, 2.2, 0.5 + 0.5*Math.sin(t*0.42));
    else if (id === 'play') tapeSpeed = 0.22 + 0.05*Math.sin(t*0.9);

    dash = (dash + dt * 120 * tapeSpeed) % 10000;

    const spin = dt * (0.9 + tapeSpeed * 3.2);
    angL -= spin;
    angR += spin * 1.04;

    // sparkle moment
    if (rareSparkle && id === 'play' && sparkleAt && t >= sparkleAt && sparkle <= 0.001){
      sparkle = 1;
      // tiny "clean edit" tick
      if (audio.enabled && rand() < 0.75) safeBeep({ freq: 1240 + rand()*220, dur: 0.010, gain: 0.005, type: 'square' });
    }

    // tiny flutter ticks during splice
    if (audio.enabled && id === 'splice'){
      const chance = 0.018 * (0.6 + 0.8*Math.sin(t*1.3 + 2.1));
      if (rand() < chance * dt * 60){
        safeBeep({ freq: 320 + rand()*180, dur: 0.008, gain: 0.0032, type: 'square' });
      }
    }

    // drift dust
    for (let i=0;i<dust.length;i++){
      const d = dust[i];
      d.p += dt * 0.25 * d.z;
      d.x += Math.cos(d.p) * dt * 6 * d.z;
      d.y += Math.sin(d.p*1.2) * dt * 4.5 * d.z;
      if (d.x < -20) d.x = w + 20;
      if (d.x > w + 20) d.x = -20;
      if (d.y < -20) d.y = h + 20;
      if (d.y > h + 20) d.y = -20;
    }
  }

  function drawReel(ctx, cx, cy, r, ang, fillAmt, active){
    // outer plate
    ctx.save();
    ctx.translate(cx, cy);

    const g = ctx.createRadialGradient(0, 0, r*0.12, 0, 0, r);
    g.addColorStop(0, pal.panel2);
    g.addColorStop(0.55, pal.panel);
    g.addColorStop(1, pal.panel2);
    ctx.fillStyle = g;
    circle(ctx, 0, 0, r);
    ctx.fill();

    // tape pack (ring)
    const inner = r * 0.28;
    const pack = lerp(r*0.42, r*0.72, fillAmt);

    ctx.globalCompositeOperation = 'source-over';
    circle(ctx, 0, 0, pack);
    ctx.fillStyle = pal.tape;
    ctx.fill();

    circle(ctx, 0, 0, inner);
    ctx.fillStyle = pal.panel;
    ctx.fill();

    // spokes
    ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = Math.max(1, Math.floor(r*0.03));
    for (let i=0;i<6;i++){
      ctx.beginPath();
      ctx.moveTo(inner*0.72, 0);
      ctx.lineTo(pack*0.92, 0);
      ctx.stroke();
      ctx.rotate(Math.PI/3);
    }

    // hub
    circle(ctx, 0, 0, inner*0.62);
    ctx.fillStyle = pal.metal;
    ctx.globalAlpha = 0.82;
    ctx.fill();
    ctx.globalAlpha = 1;

    // activity glow
    if (active > 0.001){
      ctx.globalAlpha = 0.16 * active;
      circle(ctx, 0, 0, r*0.92);
      ctx.fillStyle = pal.accent;
      ctx.fill();
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, pal.bg0);
    bg.addColorStop(1, pal.bg1);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // desk vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.55, 0, w*0.5, h*0.55, Math.max(w,h)*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // dust
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i=0;i<dust.length;i++){
      const d = dust[i];
      ctx.globalAlpha = d.a;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(d.x, d.y, d.s, d.s);
    }
    ctx.restore();

    // deck base
    ctx.save();
    roundedRect(ctx, deck.x, deck.y, deck.w, deck.h, Math.floor(Math.min(deck.w, deck.h)*0.06));
    ctx.fillStyle = pal.desk;
    ctx.fill();

    // inner plate
    const inset = Math.floor(Math.min(deck.w, deck.h) * 0.06);
    roundedRect(ctx, deck.x+inset, deck.y+inset, deck.w-inset*2, deck.h-inset*2, Math.floor(inset*0.7));
    ctx.fillStyle = pal.deck;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.restore();

    const id = phase().id;
    const p = phaseT / phase().dur;

    // tape state
    const cycleP = (t % totalDur) / totalDur;
    const leftFill = lerp(0.76, 0.34, cycleP);
    const rightFill = lerp(0.34, 0.76, cycleP);

    let active = 0;
    if (id === 'wind') active = 1;
    else if (id === 'play') active = 0.55;

    // reels
    drawReel(ctx, reelL.x, reelL.y, reelL.r, angL, leftFill, active);
    drawReel(ctx, reelR.x, reelR.y, reelR.r, angR, rightFill, active);

    // tape path
    const tapeY = Math.floor(deck.y + deck.h*0.52);
    const tapeW = Math.max(4, Math.floor(Math.min(w, h) * 0.012));

    const x0 = reelL.x + reelL.r*0.72;
    const x1 = head.x - head.w*0.15;
    const x2 = splice.x + splice.w*0.52;
    const x3 = reelR.x - reelR.r*0.72;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = pal.tape2;
    ctx.lineWidth = tapeW;

    // cut gap during CUT/SPLICE
    const gap = (id === 'cut') ? lerp(0, splice.w*0.18, ease(p)) : (id === 'splice' ? lerp(splice.w*0.18, 0, ease(p)) : 0);

    function strokeSegment(ax, ay, bx, by){
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // left run
    strokeSegment(x0, tapeY, x1 - gap*0.5, tapeY);
    // right run
    strokeSegment(x2 + gap*0.5, tapeY, x3, tapeY);

    // animated dash highlight when moving
    if (active > 0.001){
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([Math.max(12, tapeW*2.5), Math.max(10, tapeW*2)]);
      ctx.lineDashOffset = -dash;
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = Math.max(1, Math.floor(tapeW*0.55));
      strokeSegment(x0, tapeY, x3, tapeY);
      ctx.setLineDash([]);
    }

    ctx.restore();

    // head block
    ctx.save();
    roundedRect(ctx, head.x, head.y, head.w, head.h, Math.floor(head.h*0.2));
    ctx.fillStyle = pal.panel;
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // head slots
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    const slotH = Math.max(4, Math.floor(head.h*0.12));
    for (let i=0;i<3;i++){
      ctx.fillRect(head.x + head.w*0.16, head.y + head.h*0.18 + i*(slotH + head.h*0.12), head.w*0.68, slotH);
    }
    ctx.restore();

    // splice block
    ctx.save();
    roundedRect(ctx, splice.x, splice.y, splice.w, splice.h, Math.floor(splice.h*0.35));
    ctx.fillStyle = pal.panel2;
    ctx.fill();

    // splice tape overlay during SPLICE
    if (id === 'splice'){
      const a = ease(p);
      ctx.globalAlpha = 0.35 + 0.35*a;
      ctx.fillStyle = pal.ok;
      ctx.fillRect(splice.x + splice.w*0.12, splice.y + splice.h*0.26, splice.w*0.76, splice.h*0.48);

      ctx.globalAlpha = 0.18 + 0.25*a;
      ctx.fillStyle = pal.accent;
      ctx.fillRect(splice.x + splice.w*0.20, splice.y + splice.h*0.22, splice.w*0.08, splice.h*0.56);
      ctx.fillRect(splice.x + splice.w*0.72, splice.y + splice.h*0.22, splice.w*0.08, splice.h*0.56);
    }

    // cut line indicator
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(splice.x + splice.w*0.5, splice.y + splice.h*0.16);
    ctx.lineTo(splice.x + splice.w*0.5, splice.y + splice.h*0.84);
    ctx.stroke();

    // glow
    if (spliceGlow > 0.001){
      ctx.globalAlpha = 0.18 * spliceGlow;
      ctx.fillStyle = pal.ok;
      ctx.fillRect(splice.x, splice.y, splice.w, splice.h);
    }

    ctx.restore();

    // sparkle
    if (sparkle > 0.001){
      const sx = splice.x + splice.w*0.5;
      const sy = tapeY;
      const r = Math.min(w, h) * (0.012 + sparkle * 0.02);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.55 * sparkle;
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = Math.max(1, Math.floor(r*0.22));
      for (let k=0;k<8;k++){
        const a = (k/8) * Math.PI*2 + t*0.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a)*r, sy + Math.sin(a)*r);
        ctx.stroke();
      }
      ctx.restore();
    }

    // top UI: title, phase, timecode, VU
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = pal.ink;
    ctx.font = `800 ${font}px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif`;
    ctx.fillText('REEL-TO-REEL SPLICE DESK', deck.x + inset, deck.y + inset + font);

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = pal.sub;
    ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(label, deck.x + inset, deck.y + inset + font + small + 6);

    // status pill
    const pill = { x: deck.x + deck.w - inset - Math.floor(deck.w*0.22), y: deck.y + inset + 8, w: Math.floor(deck.w*0.22), h: Math.floor(small*2.0) };
    roundedRect(ctx, pill.x, pill.y, pill.w, pill.h, Math.floor(pill.h*0.5));
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = id === 'play' ? pal.ok : (id === 'cut' ? pal.warn : pal.accent);
    ctx.font = `800 ${Math.floor(small*1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(phase().label, pill.x + 14, pill.y + pill.h - 10);

    // timecode
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = pal.sub;
    ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`TC ${timecode(t)} / ${timecode(totalDur)}`, pill.x + 14, pill.y + pill.h + small + 12);

    // VU meters
    const vuPad = Math.floor(vu.h*0.12);
    const barW = Math.floor((vu.w - vuPad*3) / 2);
    const barH = Math.floor(vu.h - vuPad*2);
    const vuX = vu.x;
    const vuY = vu.y;

    const activity = (id === 'play') ? 1 : (id === 'wind' ? 0.55 : 0.15);
    const flutter = (sparkle > 0.001 ? 0.12 * sparkle : 0);
    const vL = clamp(0.12 + activity * (0.55 + 0.45*Math.sin(t*2.1 + 0.7) + flutter*Math.sin(t*18)), 0, 1);
    const vR = clamp(0.10 + activity * (0.55 + 0.45*Math.sin(t*2.5 + 2.0) + flutter*Math.cos(t*16)), 0, 1);

    function vuBar(x, y, v, name){
      roundedRect(ctx, x, y, barW, barH, Math.floor(barH*0.18));
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(0,0,0,0.40)';
      ctx.fill();

      const fillH = Math.floor(barH * v);
      const fy = y + (barH - fillH);
      const grad = ctx.createLinearGradient(0, y + barH, 0, y);
      grad.addColorStop(0, pal.ok);
      grad.addColorStop(0.7, pal.accent);
      grad.addColorStop(1, pal.warn);

      ctx.globalAlpha = 0.88;
      ctx.fillStyle = grad;
      ctx.fillRect(x + 8, fy + 6, barW - 16, Math.max(0, fillH - 12));

      ctx.globalAlpha = 0.80;
      ctx.fillStyle = pal.sub;
      ctx.font = `800 ${Math.floor(small*0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(name, x + 10, y + barH + small + 8);
    }

    vuBar(vuX, vuY, vL, 'VU L');
    vuBar(vuX + barW + vuPad, vuY, vR, 'VU R');

    ctx.restore();

    // CUT flash overlay
    if (cutFlash > 0.001){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.10 * cutFlash;
      ctx.fillStyle = pal.warn;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  return {
    init,
    onResize,
    update,
    render,
    // compat (older channels sometimes export draw)
    draw: render,
    destroy,
    onAudioOn,
    onAudioOff,
  };
}
