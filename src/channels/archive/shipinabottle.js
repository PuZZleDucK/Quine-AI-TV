import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

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
    { woodA: '#261a12', woodB: '#130d09', glass: 'rgba(200,240,255,0.09)', waterA: 'rgba(70,150,190,0.40)', waterB: 'rgba(40,90,130,0.62)', accent: '#c8f4ff', rope: '#e7d7b8', ship: '#d4b08a', ink: 'rgba(10,12,14,0.9)' },
    { woodA: '#2a1f14', woodB: '#0f0c09', glass: 'rgba(210,250,255,0.08)', waterA: 'rgba(90,170,170,0.38)', waterB: 'rgba(40,110,110,0.60)', accent: '#bfffe9', rope: '#ffe4a6', ship: '#cfa47a', ink: 'rgba(10,12,14,0.9)' },
    { woodA: '#241913', woodB: '#0d0a09', glass: 'rgba(210,235,255,0.10)', waterA: 'rgba(85,145,205,0.36)', waterB: 'rgba(35,85,150,0.64)', accent: '#ffd0f2', rope: '#e9d1ff', ship: '#d6b98f', ink: 'rgba(10,12,14,0.9)' },
  ];
  const pal = pick(rand, palettes);

  const PHASES = [
    { id: 'hull', label: 'BUILD HULL' },
    { id: 'mast', label: 'STEP MAST' },
    { id: 'rig', label: 'TIE RIGGING' },
    { id: 'reveal', label: 'REVEAL + POLISH' },
  ];
  const PHASE_DUR = 18;
  let phaseIdx = 0;
  let phaseT = 0;

  // bottle geometry (horizontal)
  let bottle = { x: 0, y: 0, bw: 0, bh: 0, r: 0, neck: 0, inset: 0 };

  // deterministic drift
  let benchDrift = { x: 0, y: 0 };

  // bubbles + sparkles
  let bubbles = []; // {x,y,r,spd,phase}
  let sparkles = []; // {x,y,vx,vy,life}
  let knotFlash = 0;
  let knotArmed = true;

  // audio
  let ambience = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regen(){
    t = 0;
    phaseIdx = 0;
    phaseT = 0;

    benchDrift = {
      x: (rand() - 0.5) * 0.05,
      y: (rand() - 0.5) * 0.05,
    };

    bubbles = [];
    const n = 34 + ((rand() * 14) | 0);
    for (let i=0;i<n;i++){
      bubbles.push({
        x: rand(),
        y: rand(),
        r: 0.8 + rand() * 2.4,
        spd: 0.018 + rand() * 0.045,
        phase: rand() * Math.PI * 2,
      });
    }

    sparkles = Array.from({ length: 24 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: -1 }));
    knotFlash = 0;
    knotArmed = true;
  }

  function onPhaseEnter(){
    // tiny confirmation click
    safeBeep({ freq: 420 + rand()*140, dur: 0.016, gain: 0.007, type: 'square' });
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 30));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    const bh = Math.min(h * 0.26, w * 0.22);
    const bw = Math.min(w * 0.72, h * 2.2);
    bottle = {
      bw,
      bh,
      x: w * 0.5 - bw * 0.5,
      y: h * 0.55 - bh * 0.5,
      r: bh * 0.5,
      neck: bw * 0.12,
      inset: Math.max(2, Math.floor(Math.min(w, h) / 220)),
    };

    regen();
    onPhaseEnter();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    const n = audio.noiseSource({ type: 'pink', gain: 0.0028 });
    n.start();
    const d = simpleDrone(audio, { root: 55 + rand()*10, detune: 1.2, gain: 0.014 });

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

  function spawnKnotSparkles(cx, cy){
    for (let i=0;i<sparkles.length;i++){
      const a = (i / sparkles.length) * Math.PI * 2 + rand() * 0.4;
      const s = (0.3 + rand()*1.1) * Math.min(w, h) * 0.09;
      sparkles[i].x = cx + (rand() - 0.5) * 8;
      sparkles[i].y = cy + (rand() - 0.5) * 8;
      sparkles[i].vx = Math.cos(a) * s;
      sparkles[i].vy = Math.sin(a) * s - Math.min(w, h) * 0.05;
      sparkles[i].life = 0.7 + rand() * 0.9;
    }
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    knotFlash = Math.max(0, knotFlash - dt * 1.5);

    if (phaseT >= PHASE_DUR){
      phaseT = phaseT % PHASE_DUR;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      if (PHASES[phaseIdx].id === 'rig') knotArmed = true;
      onPhaseEnter();
    }

    const ph = PHASES[phaseIdx].id;
    const p = phaseT / PHASE_DUR;

    // bubble drift (inside bottle; wrap)
    for (const b of bubbles){
      b.y -= dt * b.spd;
      b.x += Math.sin(t * 0.6 + b.phase) * dt * 0.01;
      if (b.y < -0.1) b.y += 1.2;
      if (b.x < -0.2) b.x += 1.4;
      if (b.x > 1.2) b.x -= 1.4;
    }

    // perfect knot special moment
    if (ph === 'rig' && knotArmed && p >= 0.72){
      knotArmed = false;
      knotFlash = 1;

      // audio: gentle "knot" click + shimmer
      safeBeep({ freq: 220, dur: 0.045, gain: 0.010, type: 'square' });
      safeBeep({ freq: 920 + rand()*180, dur: 0.018, gain: 0.008, type: 'triangle' });

      const cx = bottle.x + bottle.bw * 0.56;
      const cy = bottle.y + bottle.bh * 0.46;
      spawnKnotSparkles(cx, cy);
    }

    for (const s of sparkles){
      if (s.life <= 0) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += Math.min(w, h) * 0.16 * dt;
      s.life -= dt;
    }

    // occasional tiny glass "ping" in reveal
    if (audio.enabled && ph === 'reveal' && rand() < dt * 0.12){
      safeBeep({ freq: 1400 + rand()*600, dur: 0.006 + rand()*0.008, gain: 0.0022, type: 'sine' });
    }
  }

  function header(ctx, title, subtitle, phaseLabel, phaseP){
    const pad = Math.floor(Math.min(w, h) * 0.055);

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(pad, pad, w - pad*2, Math.max(56, font*2.6));

    ctx.fillStyle = 'rgba(231,238,246,0.94)';
    ctx.font = `800 ${font}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textBaseline = 'top';
    ctx.fillText(title, pad + font, pad + Math.floor(font*0.50));

    ctx.fillStyle = 'rgba(231,238,246,0.70)';
    ctx.font = `${small}px ui-sans-serif, system-ui, -apple-system`;
    ctx.fillText(subtitle, pad + font, pad + Math.floor(font*1.58));

    // phase pill
    const pill = `${phaseLabel}`;
    ctx.font = `700 ${Math.max(11, Math.floor(small*0.95))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tw = ctx.measureText(pill).width;
    const px = w - pad - tw - font*1.2;
    const py = pad + Math.floor(font*0.65);

    ctx.fillStyle = 'rgba(231,238,246,0.12)';
    roundedRect(ctx, px - 10, py - 6, tw + 20, Math.floor(small*1.7), 10);
    ctx.fill();

    ctx.fillStyle = pal.accent;
    ctx.fillText(pill, px, py);

    // progress bar
    const barY = pad + Math.max(56, font*2.6) - 10;
    const barX = pad + font;
    const barW = w - pad*2 - font*2;
    ctx.fillStyle = 'rgba(231,238,246,0.10)';
    ctx.fillRect(barX, barY, barW, 3);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(barX, barY, Math.floor(barW * clamp(phaseP, 0, 1)), 3);
  }

  function drawBench(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // wood gradient
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0, pal.woodA);
    g.addColorStop(1, pal.woodB);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // grain
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const step = Math.max(18, Math.floor(Math.min(w,h) / 22));
    const drift = (t * 9) % step;
    for (let y = -step; y < h + step; y += step){
      ctx.beginPath();
      ctx.moveTo(0, y + drift);
      const wob = Math.sin(y * 0.04 + t * 0.18) * 12;
      ctx.bezierCurveTo(w*0.3, y + drift + wob, w*0.7, y + drift - wob, w, y + drift);
      ctx.stroke();
    }
    ctx.restore();

    // bench spotlight
    const sp = ctx.createRadialGradient(w*0.5, h*0.55, Math.min(w,h)*0.08, w*0.5, h*0.55, Math.max(w,h)*0.8);
    sp.addColorStop(0, 'rgba(0,0,0,0)');
    sp.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = sp;
    ctx.fillRect(0,0,w,h);
  }

  function bottlePath(ctx, inset){
    const x = bottle.x + inset;
    const y = bottle.y + inset;
    const bw = bottle.bw - inset * 2;
    const bh = bottle.bh - inset * 2;
    const r = (bh * 0.5);

    // main body
    roundedRect(ctx, x, y, bw, bh, r);

    // neck (left)
    const nx = x - bottle.neck + inset;
    const ny = y + bh * 0.22;
    const nw = bottle.neck;
    const nh = bh * 0.56;
    roundedRect(ctx, nx, ny, nw, nh, nh * 0.22);
  }

  function drawBottle(ctx){
    const bob = Math.sin(t * 0.18 + seed*0.002) * h * benchDrift.y;

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.translate(0, bob);
    bottlePath(ctx, -2);
    ctx.fill();
    ctx.restore();

    // glass fill
    ctx.save();
    ctx.translate(0, bob);
    bottlePath(ctx, 0);
    ctx.fillStyle = pal.glass;
    ctx.fill();

    // outline + highlight
    ctx.strokeStyle = 'rgba(220,245,255,0.20)';
    ctx.lineWidth = Math.max(2, Math.floor(Math.min(w,h) / 280));
    ctx.stroke();

    // glass sheen bands
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.7;
    const sx = bottle.x + bottle.bw * 0.22;
    const sy = bottle.y;
    const sh = bottle.bh;

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(sx, sy, bottle.bw*0.08, sh);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(sx + bottle.bw*0.10, sy, bottle.bw*0.04, sh);
    ctx.restore();

    ctx.restore();

    return bob;
  }

  function drawInside(ctx, bob, phaseId, p){
    // clip to inside
    ctx.save();
    ctx.translate(0, bob);
    bottlePath(ctx, bottle.inset);
    ctx.clip();

    const ix = bottle.x + bottle.inset;
    const iy = bottle.y + bottle.inset;
    const iw = bottle.bw - bottle.inset*2;
    const ih = bottle.bh - bottle.inset*2;

    // water
    const waterY = iy + ih * (0.62 + Math.sin(t*0.22) * 0.01);
    const waveAmp = ih * 0.03;

    // water body
    const wg = ctx.createLinearGradient(0, waterY - ih*0.1, 0, iy + ih);
    wg.addColorStop(0, pal.waterA);
    wg.addColorStop(1, pal.waterB);
    ctx.fillStyle = wg;
    ctx.fillRect(ix, waterY, iw, iy + ih - waterY);

    // surface wave line
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(200,240,255,${0.14 + 0.10*Math.sin(t*0.9)})`;
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w,h) / 520));
    ctx.beginPath();
    for (let k=0;k<=36;k++){
      const u = k / 36;
      const xx = ix + u * iw;
      const yy = waterY + Math.sin(t*1.3 + u*8.0) * waveAmp + Math.sin(t*0.7 + u*14.0) * waveAmp * 0.35;
      if (k === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.restore();

    // bubbles
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (const b of bubbles){
      const xx = ix + b.x * iw;
      const yy = waterY + b.y * (iy + ih - waterY);
      if (yy < waterY + 6) continue;
      const rr = b.r * (1.0 + 0.18 * Math.sin(t*2.2 + b.phase));
      ctx.strokeStyle = 'rgba(220,250,255,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(xx, yy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // ship placement
    const shipCx = ix + iw * 0.58;
    const shipBaseY = waterY - ih * 0.04;
    const rock = Math.sin(t*0.6) * 0.035;

    // build progress by phase
    const hullP = phaseId === 'hull' ? ease(p) : 1;
    const mastP = phaseId === 'mast' ? ease(p) : (phaseId === 'hull' ? 0 : 1);
    const rigP = phaseId === 'rig' ? ease(p) : (phaseId === 'reveal' ? 1 : 0);

    // hull
    const hullW = iw * 0.34;
    const hullH = ih * 0.18;
    const hx = shipCx - hullW * 0.5;
    const hy = shipBaseY - hullH * 0.55;

    ctx.save();
    ctx.translate(shipCx, shipBaseY);
    ctx.rotate(rock);
    ctx.translate(-shipCx, -shipBaseY);

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = pal.ship;
    ctx.beginPath();
    ctx.moveTo(hx, hy + hullH*0.55);
    ctx.quadraticCurveTo(hx + hullW*0.15, hy + hullH*0.95, hx + hullW*0.45, hy + hullH);
    ctx.quadraticCurveTo(hx + hullW*0.78, hy + hullH*0.95, hx + hullW, hy + hullH*0.55);
    ctx.lineTo(hx + hullW*0.92, hy + hullH*0.40);
    ctx.lineTo(hx + hullW*0.10, hy + hullH*0.40);
    ctx.closePath();

    // reveal hull via clip rect
    ctx.save();
    ctx.clip();
    ctx.clearRect(hx + hullW*hullP, hy - 2, hullW, hullH + 6);
    ctx.restore();

    ctx.fill();

    // hull shading
    const shade = ctx.createLinearGradient(hx, 0, hx + hullW, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.12)');
    shade.addColorStop(0.55, 'rgba(255,255,255,0.08)');
    shade.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.restore();

    // mast
    const mastX = hx + hullW * 0.52;
    const mastY0 = hy + hullH * 0.35;
    const mastY1 = hy - ih * 0.22;
    const mastY = lerp(mastY0, mastY1, mastP);

    ctx.save();
    ctx.strokeStyle = 'rgba(231,238,246,0.50)';
    ctx.lineWidth = Math.max(2, Math.floor(Math.min(w,h) / 360));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mastX, mastY0);
    ctx.lineTo(mastX, mastY);
    ctx.stroke();
    ctx.restore();

    // sail cloth hint (only after mast)
    if (mastP > 0.02){
      const sp = ease(mastP);
      ctx.save();
      ctx.globalAlpha = 0.16 + sp*0.12;
      ctx.fillStyle = 'rgba(231,238,246,0.85)';
      ctx.beginPath();
      ctx.moveTo(mastX, mastY0);
      ctx.lineTo(mastX + hullW*0.18*sp, mastY0 - hullH*0.22*sp);
      ctx.lineTo(mastX, mastY0 - hullH*0.32*sp);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // rigging
    if (rigP > 0){
      const rp = rigP;
      ctx.save();
      ctx.strokeStyle = pal.rope;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1, Math.floor(Math.min(w,h) / 520));

      const bowX = hx + hullW*0.10;
      const sternX = hx + hullW*0.92;
      const deckY = hy + hullH*0.42;

      const topY = mastY;
      const topX = mastX;

      // two main lines appear left-to-right
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.lineTo(lerp(topX, bowX, rp), lerp(topY, deckY, rp));
      ctx.moveTo(topX, topY);
      ctx.lineTo(lerp(topX, sternX, rp), lerp(topY, deckY, rp));
      ctx.stroke();

      // little knot highlight near completion
      if (rp > 0.72){
        const kp = clamp((rp - 0.72) / 0.28, 0, 1);
        ctx.globalAlpha = 0.20 + 0.35*kp;
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.arc(topX, topY + hullH*0.04, Math.max(2, Math.floor(Math.min(w,h) / 240)), 0, Math.PI*2);
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.restore(); // rocking transform

    // sparkles
    for (const s of sparkles){
      if (s.life <= 0) continue;
      const a = clamp(s.life / 1.2, 0, 1);
      ctx.fillStyle = `rgba(255,245,210,${0.10 + a*0.30})`;
      ctx.fillRect(s.x, s.y, 2, 2);
    }

    // inside vignette
    const vg = ctx.createRadialGradient(ix + iw*0.55, iy + ih*0.55, ih*0.05, ix + iw*0.55, iy + ih*0.55, iw*0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(ix, iy, iw, ih);

    // knot flash overlay
    if (knotFlash > 0){
      ctx.save();
      ctx.globalAlpha = knotFlash * 0.14;
      ctx.fillStyle = 'rgba(255,245,230,1)';
      ctx.fillRect(ix, iy, iw, ih);
      ctx.restore();
    }

    ctx.restore();
  }

  function render(ctx){
    drawBench(ctx);

    const ph = PHASES[phaseIdx];
    const p = phaseT / PHASE_DUR;

    header(ctx, 'Ship-in-a-Bottle Workshop', 'hull • mast • rigging • polish', ph.label, p);

    const bob = drawBottle(ctx);
    drawInside(ctx, bob, ph.id, p);

    // foreground label card
    const cardW = Math.min(w*0.32, h*0.62);
    const cardH = Math.max(44, Math.floor(font * 2.3));
    const cx = w*0.08;
    const cy = h*0.80;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    roundedRect(ctx, cx, cy, cardW, cardH, 14);
    ctx.fill();

    ctx.fillStyle = 'rgba(231,238,246,0.88)';
    ctx.font = `700 ${Math.max(12, Math.floor(mono*0.95))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';

    const msg = ph.id === 'rig' ? (knotFlash > 0 ? 'PERFECT KNOT ✓' : 'TENSION: OK') : (ph.id === 'reveal' ? 'BOTTLE SEA: CALM' : 'WORKBENCH MODE');
    ctx.fillText(msg, cx + 16, cy + cardH*0.5);
    ctx.restore();

    // overall vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.58, Math.min(w,h)*0.20, w*0.5, h*0.58, Math.max(w,h)*0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.66)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);

    // subtle scan speckle
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    const dots = 180;
    for (let i=0;i<dots;i++){
      const x = ((i * 97 + (seed|0)) % 997) / 997;
      const y = ((i * 57 + ((seed*3)|0)) % 991) / 991;
      const px = x * w;
      const py = y * h;
      if (((i + (t*6)|0) % 23) !== 0) continue;
      ctx.fillRect(px, py, 1, 1);
    }
    ctx.restore();
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
