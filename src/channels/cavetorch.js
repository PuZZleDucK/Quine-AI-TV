import { mulberry32 } from '../util/prng.js';

// REVIEWED: 2026-02-11

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function smoothstep(a, b, t){
  t = clamp((t - a) / (b - a), 0, 1);
  return t*t*(3 - 2*t);
}

// Small deterministic hash utilities for FPS-stable "randomness".
function hashU32(n){
  n = (n + 0x7ed55d16) >>> 0;
  n = (n ^ (n >>> 15)) >>> 0;
  n = Math.imul(n, 0x85ebca6b) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 0xc2b2ae35) >>> 0;
  return (n ^ (n >>> 16)) >>> 0;
}
function hash01(n){
  return hashU32(n) / 4294967296;
}
function noise1D(time, rate, salt){
  const x = time * rate;
  const i = Math.floor(x);
  const f = x - i;
  const u = f*f*(3 - 2*f);
  const a = hash01((i + salt) >>> 0);
  const b = hash01((i + 1 + salt) >>> 0);
  return a + (b - a) * u;
}

export function createChannel({ seed, audio }){ 
  const rand = mulberry32(seed);
  const grainRand = mulberry32((seed ^ 0x9E3779B9) >>> 0);
  const flickSalt = (seed ^ 0xA73F7C15) >>> 0;

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  // atmosphere layers
  let motes = [];
  let drips = [];
  let wallTex = null;
  let grainTex = null;

  // timed structure
  const scenes = [
    { key: 'hunt', title: 'HUNT' },
    { key: 'river', title: 'RIVER' },
    { key: 'stars', title: 'STARS' },
    { key: 'beast', title: 'BEAST' },
  ];
  const warmupDur = 10;
  const sceneDur = 42;
  const loopDur = warmupDur + scenes.length * sceneDur;

  // torch flicker (deterministic, FPS-stable)
  let flick = 0;
  const flickerAt = (time) => {
    const a = noise1D(time, 8.5, flickSalt) * 2 - 1;
    const b = noise1D(time, 23.0, (flickSalt + 1) >>> 0) * 2 - 1;
    return clamp((a*0.75 + b*0.25) * 1.05, -1.2, 1.2);
  };

  // special moment
  let nextHandTime = 22 + rand() * 48;
  let lastHandTime = -1e9;
  let handFlash = 0;
  let handX = 0.72;
  let handY = 0.46;

  // audio
  let torchAudio = null;
  let nextCrackle = 0;

  function makeWallTexture(){
    // Small tiling texture; scaled up at draw time.
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');

    g.fillStyle = '#22140f';
    g.fillRect(0,0,c.width,c.height);

    // speckle + cracks
    for (let i=0;i<2600;i++){
      const x = rand() * c.width;
      const y = rand() * c.height;
      const v = 12 + rand()*38;
      g.fillStyle = `rgba(${v},${v*0.85|0},${v*0.65|0},${0.18 + rand()*0.22})`;
      g.fillRect(x,y, 1 + (rand()*2|0), 1 + (rand()*2|0));
    }

    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 1;
    for (let i=0;i<38;i++){
      const x0 = rand()*c.width;
      const y0 = rand()*c.height;
      const len = 30 + rand()*120;
      const ang = rand()*Math.PI*2;
      g.beginPath();
      g.moveTo(x0,y0);
      let x=x0,y=y0;
      for (let k=0;k<10;k++){
        x += Math.cos(ang + (rand()*2-1)*0.35) * (len/10);
        y += Math.sin(ang + (rand()*2-1)*0.35) * (len/10);
        g.lineTo(x,y);
      }
      g.stroke();
    }

    // subtle soot smudges
    for (let i=0;i<26;i++){
      const x = rand()*c.width;
      const y = rand()*c.height;
      const r = 18 + rand()*44;
      const rg = g.createRadialGradient(x,y, 0, x,y, r);
      rg.addColorStop(0, 'rgba(0,0,0,0.18)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x,y,r,0,Math.PI*2);
      g.fill();
    }

    return c;
  }

  function makeGrainTexture(){
    // Pre-generated grain tile so render path stays deterministic across FPS.
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0,0,c.width,c.height);

    g.fillStyle = 'rgba(0,0,0,0.55)';
    // sparse single-pixel pepper
    for (let i=0;i<4200;i++){
      const x = grainRand() * c.width;
      const y = grainRand() * c.height;
      g.fillRect(x, y, 1, 1);
    }
    // a few 2x1/1x2 clumps
    g.fillStyle = 'rgba(0,0,0,0.40)';
    for (let i=0;i<900;i++){
      const x = grainRand() * c.width;
      const y = grainRand() * c.height;
      if ((grainRand()*2|0)===0) g.fillRect(x, y, 2, 1);
      else g.fillRect(x, y, 1, 2);
    }

    return c;
  }

  function resetParticles(){ 
    const moteN = Math.floor(180 + (w*h) / (900*520) * 120);
    motes = Array.from({length: moteN}, () => ({
      x: rand()*w,
      y: rand()*h,
      z: 0.2 + rand()*0.9,
      r: (0.6 + rand()*2.4) * (h/540),
      vy: (6 + rand()*24) * (h/540),
      vx: (rand()*2-1) * 5 * (w/960),
    }));

    const dripN = Math.floor(18 + rand()*10);
    drips = Array.from({length: dripN}, () => ({
      x: (0.18 + rand()*0.72) * w,
      y: -rand()*h,
      sp: (10 + rand()*38) * (h/540),
      len: (0.06 + rand()*0.18) * h,
      wob: rand()*Math.PI*2,
    }));
  }

  function init({ width, height, dpr: inDpr }){
    w = width;
    h = height;
    dpr = inDpr || 1;
    t = 0;

    wallTex = makeWallTexture();
    grainTex = makeGrainTexture();
    resetParticles();

    flick = 0;

    nextHandTime = 22 + rand() * 48;
    lastHandTime = -1e9;
    handFlash = 0;
    handX = 0.62 + rand()*0.28;
    handY = 0.28 + rand()*0.44;

    nextCrackle = 0.3 + rand() * 0.8;
  }

  function onResize(width, height){
    w = width;
    h = height;
    resetParticles();
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // idempotent: stop any existing handles we own first
    onAudioOff();

    const n = audio.noiseSource({ type: 'brown', gain: 0.012 });
    n.start();

    torchAudio = {
      stop(){
        try { n.stop(); } catch {}
      }
    };

    audio.setCurrent(torchAudio);
  }

  function onAudioOff(){
    try { torchAudio?.stop?.(); } catch {}

    // only clear AudioManager.current if we own it
    if (audio.current === torchAudio) audio.current = null;

    torchAudio = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;

    // torch flicker (deterministic, FPS-stable)
    flick = flickerAt(t);

    // motes drift upward
    for (let i=0;i<motes.length;i++){
      const m = motes[i];
      m.y -= m.vy * dt * (0.6 + 0.8*m.z);
      m.x += m.vx * dt * (0.6 + 0.8*m.z);
      if (m.y < -10) { m.y = h + 10; m.x = rand()*w; }
      if (m.x < -20) m.x = w + 20;
      if (m.x > w + 20) m.x = -20;
    }

    // drips
    for (let i=0;i<drips.length;i++){
      const d = drips[i];
      d.y += d.sp * dt;
      d.wob += dt * 0.7;
      if (d.y - d.len > h*1.05){
        d.x = (0.18 + rand()*0.72) * w;
        d.y = -rand()*h*0.6;
        d.sp = (10 + rand()*38) * (h/540);
        d.len = (0.06 + rand()*0.18) * h;
      }
    }

    // handprint special moment (absolute schedule so FPS doesn't shift trigger timing)
    while (t >= nextHandTime){
      lastHandTime = nextHandTime;
      nextHandTime += 48 + rand()*90;
      handX = 0.60 + rand()*0.30;
      handY = 0.26 + rand()*0.50;
      if (audio.enabled) audio.beep({ freq: 140 + rand()*60, dur: 0.07, gain: 0.018, type: 'triangle' });
    }
    handFlash = Math.max(0, 1.2 - (t - lastHandTime));

    // occasional torch crackle ticks
    nextCrackle -= dt;
    if (nextCrackle <= 0){
      nextCrackle = 0.18 + rand()*1.1;
      if (audio.enabled) audio.beep({ freq: 620 + rand()*480, dur: 0.012, gain: 0.006, type: 'square' });
    }
  }

  function currentScene(){
    const tt = (t % loopDur);
    if (tt < warmupDur) return { idx: -1, p: tt / warmupDur, tt };
    const u = tt - warmupDur;
    const idx = Math.floor(u / sceneDur);
    const p = (u - idx*sceneDur) / sceneDur;
    return { idx: clamp(idx, 0, scenes.length-1), p, tt };
  }

  function drawTorch(ctx){
    const x = w*0.12;
    const y = h*0.62;

    // handle
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(-0.08);
    ctx.fillStyle = 'rgba(40,24,14,1)';
    ctx.fillRect(-w*0.012, -h*0.12, w*0.024, h*0.18);
    ctx.fillStyle = 'rgba(18,10,6,0.9)';
    ctx.fillRect(-w*0.010, -h*0.12, w*0.020, h*0.18);

    // head
    ctx.fillStyle = 'rgba(70,50,28,0.95)';
    ctx.beginPath();
    ctx.ellipse(0, -h*0.13, w*0.028, h*0.022, 0, 0, Math.PI*2);
    ctx.fill();

    // flame
    const f = 0.92 + 0.10*Math.sin(t*8) + 0.08*flick;
    const fy = -h*0.16;
    ctx.globalCompositeOperation = 'lighter';
    for (let i=0;i<3;i++){
      const a = 0.18 - i*0.04;
      const r = (0.020 + i*0.010) * Math.min(w,h) * f;
      const g = ctx.createRadialGradient(0, fy - r*0.25, 0, 0, fy - r*0.25, r);
      g.addColorStop(0, `rgba(255,210,120,${a})`);
      g.addColorStop(0.6, `rgba(255,120,50,${a*0.8})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, fy - r*0.2, r*0.65, r*1.05, 0, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWall(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // base gradient
    const bg = ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0, '#0c0606');
    bg.addColorStop(1, '#050203');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,w,h);

    // warm wall fill
    const warm = ctx.createRadialGradient(w*0.18,h*0.62, 0, w*0.18,h*0.62, Math.max(w,h)*0.9);
    warm.addColorStop(0, 'rgba(90,45,18,0.75)');
    warm.addColorStop(1, 'rgba(12,6,6,0.0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0,0,w,h);

    // texture tiled
    if (wallTex){
      ctx.save();
      ctx.globalAlpha = 0.9;
      const scale = 2.6;
      for (let y=0; y<h; y+=wallTex.height*scale){
        for (let x=0; x<w; x+=wallTex.width*scale){
          ctx.drawImage(wallTex, x, y, wallTex.width*scale, wallTex.height*scale);
        }
      }
      ctx.restore();
    }

    // vignette
    const vig = ctx.createRadialGradient(w*0.5,h*0.55, Math.min(w,h)*0.15, w*0.5,h*0.55, Math.max(w,h)*0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = vig;
    ctx.fillRect(0,0,w,h);

    // torch light cone
    const flickAmt = 0.92 + 0.10*Math.sin(t*4.5) + 0.10*flick;
    const lx = w*0.14;
    const ly = h*0.62;
    const r = Math.max(w,h) * (0.62 + 0.06*flick);
    const light = ctx.createRadialGradient(lx,ly, 0, lx,ly, r);
    light.addColorStop(0, `rgba(255,170,90,${0.34*flickAmt})`);
    light.addColorStop(0.35, `rgba(255,120,55,${0.18*flickAmt})`);
    light.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = light;
    ctx.fillRect(0,0,w,h);
    ctx.restore();

    // subtle soot bloom near torch
    const soot = ctx.createRadialGradient(lx,ly, 0, lx,ly, Math.max(w,h)*0.22);
    soot.addColorStop(0, 'rgba(0,0,0,0.16)');
    soot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = soot;
    ctx.fillRect(0,0,w,h);
  }

  function strokeStyle(ctx, tone='ochre', a=1){
    if (tone==='ochre') ctx.strokeStyle = `rgba(235,170,92,${a})`;
    else if (tone==='char') ctx.strokeStyle = `rgba(30,24,20,${a})`;
    else ctx.strokeStyle = `rgba(220,220,220,${a})`;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function drawStickFigure(ctx, x, y, s, phase){
    const bob = Math.sin(phase*Math.PI*2) * 0.03*s;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.lineWidth = Math.max(1, s*0.06);
    // head
    ctx.beginPath();
    ctx.arc(0, -s*0.35, s*0.12, 0, Math.PI*2);
    ctx.stroke();
    // body
    ctx.beginPath();
    ctx.moveTo(0, -s*0.23);
    ctx.lineTo(0, s*0.12);
    // arms
    ctx.moveTo(-s*0.18, -s*0.05);
    ctx.lineTo(s*0.18, -s*0.12);
    // legs
    ctx.moveTo(0, s*0.12);
    ctx.lineTo(-s*0.16, s*0.36);
    ctx.moveTo(0, s*0.12);
    ctx.lineTo(s*0.16, s*0.36);
    ctx.stroke();

    // spear
    ctx.lineWidth = Math.max(1, s*0.04);
    ctx.beginPath();
    ctx.moveTo(s*0.12, -s*0.16);
    ctx.lineTo(s*0.46, -s*0.38);
    ctx.stroke();
    ctx.restore();
  }

  function drawDeer(ctx, x, y, s, phase){
    const step = Math.sin(phase*Math.PI*2);
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(1, s*0.05);

    // body
    ctx.beginPath();
    ctx.ellipse(0, 0, s*0.34, s*0.18, 0, 0, Math.PI*2);
    ctx.stroke();

    // neck + head
    ctx.beginPath();
    ctx.moveTo(s*0.18, -s*0.08);
    ctx.lineTo(s*0.34, -s*0.24);
    ctx.lineTo(s*0.48, -s*0.18);
    ctx.stroke();

    // legs
    for (let i=0;i<4;i++){
      const sx = (-0.18 + i*0.12) * s;
      const k = i%2===0 ? step : -step;
      ctx.beginPath();
      ctx.moveTo(sx, s*0.12);
      ctx.lineTo(sx + k*s*0.05, s*0.40);
      ctx.stroke();
    }

    // antlers
    ctx.lineWidth = Math.max(1, s*0.04);
    ctx.beginPath();
    ctx.moveTo(s*0.42, -s*0.22);
    ctx.lineTo(s*0.46, -s*0.40);
    ctx.lineTo(s*0.52, -s*0.32);
    ctx.moveTo(s*0.46, -s*0.40);
    ctx.lineTo(s*0.40, -s*0.46);
    ctx.stroke();

    ctx.restore();
  }

  function drawFish(ctx, x, y, s, phase){
    const wig = Math.sin(phase*Math.PI*2) * 0.35;
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(wig*0.08);
    ctx.lineWidth = Math.max(1, s*0.05);
    ctx.beginPath();
    ctx.ellipse(0,0, s*0.22, s*0.12, 0, 0, Math.PI*2);
    ctx.stroke();
    // tail
    ctx.beginPath();
    ctx.moveTo(-s*0.22, 0);
    ctx.lineTo(-s*0.34, -s*0.10);
    ctx.moveTo(-s*0.22, 0);
    ctx.lineTo(-s*0.34, s*0.10);
    ctx.stroke();
    // fin
    ctx.beginPath();
    ctx.moveTo(0, -s*0.02);
    ctx.lineTo(s*0.08, -s*0.14);
    ctx.stroke();
    ctx.restore();
  }

  function drawBeast(ctx, x, y, s, phase){
    const breathe = 1 + 0.04*Math.sin(phase*Math.PI*2);
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(breathe, breathe);
    ctx.lineWidth = Math.max(1, s*0.06);

    // spine curve
    ctx.beginPath();
    ctx.moveTo(-s*0.42, 0);
    ctx.quadraticCurveTo(-s*0.12, -s*0.22, s*0.22, -s*0.08);
    ctx.quadraticCurveTo(s*0.42, s*0.05, s*0.50, -s*0.12);
    ctx.stroke();

    // belly
    ctx.beginPath();
    ctx.moveTo(-s*0.36, s*0.04);
    ctx.quadraticCurveTo(-s*0.02, s*0.26, s*0.30, s*0.10);
    ctx.stroke();

    // head + eye
    ctx.beginPath();
    ctx.arc(s*0.50, -s*0.10, s*0.12, 0, Math.PI*2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(235,170,92,0.8)';
    ctx.beginPath();
    ctx.arc(s*0.54, -s*0.12, s*0.02, 0, Math.PI*2);
    ctx.fill();

    // legs
    ctx.lineWidth = Math.max(1, s*0.05);
    for (let i=0;i<3;i++){
      const lx = (-0.20 + i*0.22)*s;
      const k = Math.sin(phase*Math.PI*2 + i) * 0.05;
      ctx.beginPath();
      ctx.moveTo(lx, s*0.08);
      ctx.lineTo(lx + k*s, s*0.34);
      ctx.stroke();
    }

    // tail swish
    ctx.beginPath();
    ctx.moveTo(-s*0.42, 0);
    ctx.quadraticCurveTo(-s*0.62, -s*(0.08 + 0.10*Math.sin(phase*6)), -s*0.74, -s*0.02);
    ctx.stroke();

    ctx.restore();
  }

  function drawStars(ctx, x, y, s, phase){
    const spin = phase * Math.PI*2;
    ctx.save();
    ctx.translate(x,y);
    ctx.lineWidth = Math.max(1, s*0.05);

    // spiral glyph
    ctx.beginPath();
    const turns = 2.8;
    for (let i=0;i<140;i++){
      const u = i/139;
      const a = u * turns * Math.PI*2 + spin*0.15;
      const r = (0.04 + 0.42*u) * s;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i===0) ctx.moveTo(px,py);
      else ctx.lineTo(px,py);
    }
    ctx.stroke();

    // star dots
    ctx.fillStyle = 'rgba(235,170,92,0.75)';
    for (let i=0;i<18;i++){
      const a = (i/18)*Math.PI*2 + spin*0.06;
      const r = (0.18 + 0.36*(i%3)/2) * s;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      const rr = (0.012 + (i%4)*0.003) * s;
      ctx.beginPath();
      ctx.arc(px,py, rr, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawScenePainting(ctx, idx, alpha, reveal){
    // mural frame area
    const fx = w*0.56;
    const fy = h*0.52;
    const sx = Math.min(w,h) * 0.55;

    ctx.save();
    ctx.globalAlpha = alpha;

    // paint bed shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(fx, fy, sx*0.56, sx*0.34, -0.05, 0, Math.PI*2);
    ctx.fill();

    // pigment underlay
    const g = ctx.createRadialGradient(fx,fy, 0, fx,fy, sx*0.78);
    g.addColorStop(0, 'rgba(235,170,92,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - sx*0.8, fy - sx*0.55, sx*1.6, sx*1.1);

    // drawn strokes
    const phase = (t*0.06 + idx*0.11) % 1;
    const rs = smoothstep(0.05, 0.55, reveal);
    const as = smoothstep(0.00, 0.25, reveal);

    ctx.save();
    ctx.translate(fx, fy);

    // a slightly jittery cave-wall warp
    const warp = 1 + 0.01*Math.sin(t*0.9) + 0.01*flick;
    ctx.scale(warp, warp);

    strokeStyle(ctx, 'ochre', 0.9*as);

    // scene-specific glyphs
    if (idx === 0){
      // hunt
      const k = smoothstep(0.12, 0.92, rs);
      ctx.globalAlpha *= k;
      drawStickFigure(ctx, -sx*0.18, sx*0.10, sx*0.28, phase);
      drawDeer(ctx, sx*0.16, sx*0.10, sx*0.30, (phase+0.25)%1);

      // ground line
      ctx.globalAlpha *= 0.9;
      ctx.lineWidth = Math.max(1, sx*0.012);
      ctx.beginPath();
      ctx.moveTo(-sx*0.55, sx*0.26);
      ctx.lineTo(sx*0.55, sx*0.28);
      ctx.stroke();

    } else if (idx === 1){
      // river
      const k = smoothstep(0.06, 0.88, rs);
      ctx.globalAlpha *= k;

      // river curve
      ctx.lineWidth = Math.max(1, sx*0.018);
      ctx.beginPath();
      ctx.moveTo(-sx*0.55, -sx*0.02);
      ctx.quadraticCurveTo(-sx*0.10, sx*0.32, sx*0.55, sx*0.06);
      ctx.stroke();

      // fish parade
      for (let i=0;i<5;i++){
        const u = i/4;
        const px = -sx*0.42 + u*sx*0.84;
        const py = -sx*0.02 + Math.sin(t*0.7 + i)*sx*0.06;
        drawFish(ctx, px, py, sx*(0.20 + 0.02*i), (phase + u*0.22) % 1);
      }

    } else if (idx === 2){
      // stars
      const k = smoothstep(0.08, 0.92, rs);
      ctx.globalAlpha *= k;
      drawStars(ctx, 0, 0, sx*0.50, (phase+0.2)%1);

      // horizon scribble
      ctx.lineWidth = Math.max(1, sx*0.012);
      ctx.beginPath();
      for (let i=0;i<18;i++){
        const u = i/17;
        const px = -sx*0.55 + u*sx*1.1;
        const py = sx*(0.30 + 0.02*Math.sin(i*1.3 + t*0.8));
        if (i===0) ctx.moveTo(px,py);
        else ctx.lineTo(px,py);
      }
      ctx.stroke();

    } else {
      // beast
      const k = smoothstep(0.10, 0.90, rs);
      ctx.globalAlpha *= k;
      drawBeast(ctx, 0, sx*0.06, sx*0.55, (phase+0.3)%1);

      // claw marks
      ctx.globalAlpha *= 0.9;
      ctx.lineWidth = Math.max(1, sx*0.014);
      for (let i=0;i<4;i++){
        const px = sx*(0.24 + i*0.05);
        const py0 = -sx*(0.20 + i*0.02);
        ctx.beginPath();
        ctx.moveTo(px, py0);
        ctx.lineTo(px - sx*0.08, py0 + sx*0.30);
        ctx.stroke();
      }
    }

    ctx.restore();

    // charcoal dust overlay (gives that storyboard smudge feel)
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(20,16,14,${0.10 + 0.10*(1-reveal)})`;
    ctx.beginPath();
    ctx.ellipse(fx, fy, sx*0.58, sx*0.36, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function drawHandprint(ctx){
    if (handFlash <= 0) return;

    // flash curve: bright at start, then linger faintly
    const a = smoothstep(0, 0.25, handFlash) * (0.65 + 0.35*smoothstep(1.2, 0.2, handFlash));
    const x = w * handX;
    const y = h * handY;
    const s = Math.min(w,h) * 0.22;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // halo
    const g = ctx.createRadialGradient(x,y, 0, x,y, s*1.2);
    g.addColorStop(0, `rgba(255,120,80,${0.18*a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - s*1.2, y - s*1.2, s*2.4, s*2.4);

    // palm blob
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(255,74,64,${0.14 + 0.18*a})`;
    ctx.beginPath();
    ctx.ellipse(x, y, s*0.26, s*0.30, -0.15, 0, Math.PI*2);
    ctx.fill();

    // fingers
    for (let i=0;i<5;i++){
      const dx = (-0.18 + i*0.09) * s;
      const dy = (-0.30 - (i===0||i===4 ? 0.04 : 0)) * s;
      const rr = (0.055 + (i%2)*0.008) * s;
      ctx.beginPath();
      ctx.ellipse(x + dx, y + dy, rr*0.55, rr, -0.10 + i*0.03, 0, Math.PI*2);
      ctx.fill();
    }

    // quick brightness strobe
    const strobe = Math.max(0, Math.sin(handFlash*30)) * 0.08 * a;
    if (strobe > 0){
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,240,220,${strobe})`;
      ctx.fillRect(0,0,w,h);
    }

    ctx.restore();
  }

  function render(ctx){
    drawWall(ctx);

    // drip parallax
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = 'rgba(10,10,10,0.55)';
    ctx.lineWidth = Math.max(1, h*0.002);
    for (const d of drips){
      const sway = Math.sin(d.wob) * (w/960) * 8;
      ctx.beginPath();
      ctx.moveTo(d.x + sway, d.y);
      ctx.lineTo(d.x + sway*0.6, d.y + d.len);
      ctx.stroke();
    }
    ctx.restore();

    // paintings
    const st = currentScene();
    if (st.idx >= 0){
      const edge = 0.18;
      const fadeIn = smoothstep(0.00, edge, st.p);
      const fadeOut = 1 - smoothstep(1-edge, 1.0, st.p);
      const alpha = fadeIn * fadeOut;
      drawScenePainting(ctx, st.idx, alpha, st.p);

      // label
      ctx.save();
      ctx.globalAlpha = 0.45*alpha;
      ctx.font = `${Math.floor(h/26)}px ui-serif, Georgia, serif`;
      ctx.fillStyle = 'rgba(255,220,190,0.95)';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 10;
      ctx.fillText(scenes[st.idx].title, w*0.06, h*0.14);
      ctx.restore();
    } else {
      // warmup hint
      ctx.save();
      const a = smoothstep(0.25, 1, st.p);
      ctx.globalAlpha = 0.22*a;
      ctx.font = `${Math.floor(h/30)}px ui-serif, Georgia, serif`;
      ctx.fillStyle = 'rgba(255,220,180,0.9)';
      ctx.fillText('CAVE TORCH STORYBOARD', w*0.06, h*0.14);
      ctx.restore();
    }

    // dust motes (foreground-ish)
    // Perf: avoid per-mote template literal `rgba(...)` allocations by using fixed fillStyle
    // and varying intensity via ctx.globalAlpha.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgb(255,210,160)';
    for (const m of motes){
      const a = (0.05 + 0.10*m.z) * (0.7 + 0.3*Math.sin(t*0.8 + m.x*0.01));
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(m.x + Math.sin(t*0.4 + m.y*0.01)*m.z*6, m.y, m.r*(0.6 + 0.8*m.z), 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    drawTorch(ctx);
    drawHandprint(ctx);

    // subtle film grain (deterministic, FPS-stable)
    if (grainTex){
      ctx.save();
      ctx.globalAlpha = 0.06;
      const ox = (t*32) % grainTex.width;
      const oy = (t*19) % grainTex.height;
      for (let yy=-grainTex.height; yy<h+grainTex.height; yy+=grainTex.height){
        for (let xx=-grainTex.width; xx<w+grainTex.width; xx+=grainTex.width){
          ctx.drawImage(grainTex, xx - ox, yy - oy);
        }
      }
      ctx.restore();
    }
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
