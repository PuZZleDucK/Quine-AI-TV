import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

function roundedRect(ctx, x, y, w, h, r){
  r = Math.min(r, w*0.5, h*0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function strokeText(ctx, str, x, y, fill, stroke, lw){
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // typography
  let font = 16;
  let small = 12;
  let mono = 13;

  const THEMES = [
    {
      name: 'alpine',
      desk: ['#2b211a', '#120d0a'],
      frame: ['#3a2b20', '#18100b'],
      glass: 'rgba(210,240,255,0.08)',
      accent: '#ffd36f',
      before: {
        sky: '#2c3340',
        haze: 'rgba(8,10,14,0.35)',
        hill1: '#2e2a28',
        hill2: '#252220',
        snow: '#c8c0b3',
        roof: '#4b3a34',
        wall: '#2e2a27',
        tree: '#2b322a',
        water: '#202730',
      },
      after: {
        sky: '#2b3a66',
        haze: 'rgba(255,255,255,0.12)',
        hill1: '#2f4a6d',
        hill2: '#243a55',
        snow: '#f0f3ff',
        roof: '#d46d5c',
        wall: '#eadfd3',
        tree: '#3bd17f',
        water: '#2bd2ff',
      },
    },
    {
      name: 'seaside',
      desk: ['#242323', '#0e0d0d'],
      frame: ['#2f2e2c', '#13120f'],
      glass: 'rgba(255,240,220,0.06)',
      accent: '#6cf2ff',
      before: {
        sky: '#2c2f33',
        haze: 'rgba(0,0,0,0.32)',
        hill1: '#2b2a27',
        hill2: '#222120',
        snow: '#d0c6ba',
        roof: '#3f3732',
        wall: '#2c2a28',
        tree: '#2b312f',
        water: '#1e2a30',
      },
      after: {
        sky: '#1f4f66',
        haze: 'rgba(255,255,255,0.16)',
        hill1: '#2d6f7a',
        hill2: '#1d4b5a',
        snow: '#fff0d7',
        roof: '#ffb55a',
        wall: '#ffe9d7',
        tree: '#54ffb7',
        water: '#37b7ff',
      },
    },
    {
      name: 'city',
      desk: ['#201d26', '#0d0b10'],
      frame: ['#2b2633', '#120f18'],
      glass: 'rgba(190,210,255,0.07)',
      accent: '#ff4e90',
      before: {
        sky: '#222635',
        haze: 'rgba(0,0,0,0.30)',
        hill1: '#25242a',
        hill2: '#1d1c22',
        snow: '#cfc9c6',
        roof: '#3a3542',
        wall: '#2a2a30',
        tree: '#2b3330',
        water: '#202733',
      },
      after: {
        sky: '#1a2a55',
        haze: 'rgba(255,255,255,0.12)',
        hill1: '#2a3a77',
        hill2: '#1d2652',
        snow: '#f3f0ff',
        roof: '#ff4e90',
        wall: '#e8e3ff',
        tree: '#6cffb3',
        water: '#6cf2ff',
      },
    },
  ];

  const theme = pick(rand, THEMES);

  const PHASES = [
    { id: 'dust', label: 'DUST' },
    { id: 'match', label: 'PAINT MATCH' },
    { id: 'brush', label: 'BRUSH' },
    { id: 'reveal', label: 'REVEAL' },
  ];
  const PHASE_DUR = 12;

  let phaseIdx = 0;
  let phaseT = 0;
  let flipReady = true;

  // layout
  let box = { x: 0, y: 0, w: 0, h: 0 };
  let interior = { x: 0, y: 0, w: 0, h: 0 };

  // scene
  const MAX_PROPS = 22;
  let props = []; // {k,x,y,s,r}

  // dust + paint
  const DUST_N = 340;
  let dust = []; // {x,y,r,life}
  let strokes = []; // {x0,y0,x1,y1,w,c,life}
  let strokeAcc = 0;

  // brush motion
  let brush = { x: 0, y: 0, a: 0 };

  // fx
  let glint = 0;
  let nextGlintAt = 0;
  let revealFlash = 0;

  // audio
  let ambience = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regenLayout(){
    font = Math.max(14, Math.floor(Math.min(w, h) / 30));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    const pad = Math.floor(Math.min(w, h) * 0.08);
    const bw = Math.floor(w - pad * 2);
    const bh = Math.floor(h - pad * 2);
    box.w = Math.floor(bw);
    box.h = Math.floor(bh * 0.84);
    box.x = Math.floor((w - box.w) / 2);
    box.y = Math.floor(pad + (bh - box.h) * 0.18);

    const rim = Math.max(14, Math.floor(Math.min(box.w, box.h) * 0.06));
    interior.x = box.x + rim;
    interior.y = box.y + rim;
    interior.w = box.w - rim * 2;
    interior.h = box.h - rim * 2;

    // props inside diorama
    props = [];
    const kinds = ['house', 'tree', 'rock', 'tower', 'arch'];
    for (let i = 0; i < MAX_PROPS; i++){
      const k = pick(rand, kinds);
      const x = interior.x + interior.w * (0.08 + rand() * 0.84);
      const y = interior.y + interior.h * (0.28 + rand() * 0.62);
      const s = 0.55 + rand() * 1.2;
      const r = (rand() * 2 - 1) * 0.15;
      props.push({ k, x, y, s, r });
    }

    dust = [];
    for (let i = 0; i < DUST_N; i++){
      dust.push({
        x: interior.x + rand() * interior.w,
        y: interior.y + rand() * interior.h,
        r: 0.5 + rand() * 2.2,
        life: 0.6 + rand() * 0.4,
      });
    }

    strokes = [];
    strokeAcc = 0;

    nextGlintAt = 4 + rand() * 6;
    glint = 0;
    revealFlash = 0;
  }

  function onPhaseEnter(){
    const ph = PHASES[phaseIdx].id;

    if (ph === 'dust'){
      for (let i = 0; i < dust.length; i++) dust[i].life = 0.78 + rand() * 0.22;
      flipReady = true;
      safeBeep({ freq: 820 + rand() * 80, dur: 0.03, gain: 0.012, type: 'triangle' });
    }
    if (ph === 'match'){
      safeBeep({ freq: 520 + rand() * 80, dur: 0.05, gain: 0.012, type: 'sine' });
    }
    if (ph === 'brush'){
      strokes.length = 0;
      strokeAcc = 0;
      safeBeep({ freq: 980 + rand() * 120, dur: 0.04, gain: 0.012, type: 'triangle' });
    }
    if (ph === 'reveal'){
      flipReady = true;
      safeBeep({ freq: 660, dur: 0.07, gain: 0.013, type: 'sine' });
    }
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    t = 0;
    phaseIdx = 0;
    phaseT = 0;

    regenLayout();
    onPhaseEnter();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // quiet workshop tone
    const n = audio.noiseSource({ type: 'brown', gain: 0.0036 });
    n.start();
    const d = simpleDrone(audio, { root: 55 + rand() * 18, detune: 0.85, gain: 0.015 });

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

  function destroy(){ onAudioOff(); }

  function updateBrush(ph, p){
    const stripes = 4;

    if (ph === 'dust'){
      const si = Math.min(stripes - 1, (p * stripes) | 0);
      const sp = p * stripes - si;
      const ex = lerp(interior.x + interior.w * 0.12, interior.x + interior.w * 0.88, ease(sp));
      const ey = interior.y + interior.h * (0.22 + (si / (stripes - 1)) * 0.58) + Math.sin(t * 1.2) * interior.h * 0.01;
      brush.x = ex;
      brush.y = ey;
      brush.a = -0.8 + Math.sin(t * 0.9) * 0.07;
      return;
    }

    if (ph === 'brush'){
      const si = Math.min(stripes - 1, (p * stripes) | 0);
      const sp = p * stripes - si;
      const ex = interior.x + interior.w * (0.18 + (si / (stripes - 1)) * 0.64) + Math.sin(t * 1.4) * interior.w * 0.008;
      const ey = lerp(interior.y + interior.h * 0.78, interior.y + interior.h * 0.30, ease(sp));
      brush.x = ex;
      brush.y = ey;
      brush.a = 0.2 + Math.sin(t * 0.8) * 0.05;
      return;
    }

    // idle
    brush.x = interior.x + interior.w * (0.5 + Math.sin(t * 0.12) * 0.1);
    brush.y = interior.y + interior.h * (0.55 + Math.cos(t * 0.14) * 0.08);
    brush.a = -0.3;
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    glint = Math.max(0, glint - dt * 1.3);
    revealFlash = Math.max(0, revealFlash - dt * 1.7);

    if (t >= nextGlintAt){
      glint = 1;
      nextGlintAt = t + 6 + rand() * 10;
      safeBeep({ freq: 1320 + rand() * 240, dur: 0.02, gain: 0.0036, type: 'triangle' });
    }

    if (phaseT >= PHASE_DUR){
      phaseT = phaseT % PHASE_DUR;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      onPhaseEnter();
    }

    const ph = PHASES[phaseIdx].id;
    const p = phaseT / PHASE_DUR;

    updateBrush(ph, p);

    if (ph === 'dust'){
      const r = Math.max(18, interior.w * 0.12);
      const r2 = r * r;
      for (let i = 0; i < dust.length; i++){
        const d0 = dust[i];
        const dx = d0.x - brush.x;
        const dy = d0.y - brush.y;
        const dd = dx*dx + dy*dy;
        if (dd < r2){
          const q = 1 - dd / r2;
          d0.life = Math.max(0, d0.life - dt * (2.0 + 1.8 * q));
        } else {
          d0.life = Math.min(1, d0.life + dt * 0.05);
        }
      }

      // faint cleaning swishes
      if (audio.enabled){
        const rate = 10;
        strokeAcc += dt * rate;
        while (strokeAcc >= 1){
          strokeAcc -= 1;
          safeBeep({ freq: 640 + rand() * 120, dur: 0.008 + rand() * 0.008, gain: 0.0012, type: 'triangle' });
        }
      }
    }

    if (ph === 'brush'){
      // spawn paint strokes along brush
      strokeAcc += dt * (14 + 10 * Math.sin(t * 0.9) * 0.5 + 5);
      while (strokeAcc >= 1){
        strokeAcc -= 1;
        if (strokes.length < 180){
          const dx = (rand() * 2 - 1) * interior.w * 0.03;
          const dy = (rand() * 2 - 1) * interior.h * 0.02;
          const x0 = brush.x + dx;
          const y0 = brush.y + dy;
          const x1 = x0 + (rand() * 2 - 1) * interior.w * 0.08;
          const y1 = y0 + (rand() * 2 - 1) * interior.h * 0.02;
          strokes.push({
            x0, y0, x1, y1,
            w: 1.2 + rand() * 2.8,
            c: theme.accent,
            life: 0.7 + rand() * 0.6,
          });
          safeBeep({ freq: 980 + rand() * 240, dur: 0.006 + rand() * 0.006, gain: 0.0012, type: 'sine' });
        }
      }

      // decay strokes
      for (let i = strokes.length - 1; i >= 0; i--){
        strokes[i].life -= dt * 0.34;
        if (strokes[i].life <= 0){
          strokes[i] = strokes[strokes.length - 1];
          strokes.pop();
        }
      }
    }

    if (ph === 'reveal'){
      // little completion pop near the end
      if (flipReady && p > 0.86){
        flipReady = false;
        revealFlash = 1;
        safeBeep({ freq: 1046.5, dur: 0.05, gain: 0.012, type: 'triangle' });
        safeBeep({ freq: 1568, dur: 0.035, gain: 0.010, type: 'triangle' });
      }
    }
  }

  function drawWorkbench(ctx){
    // desk gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, theme.desk[0]);
    g.addColorStop(1, theme.desk[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // soft vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.45, Math.min(w,h)*0.1, w*0.5, h*0.5, Math.max(w,h)*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // a couple of “tools” hints
    const toolY = box.y + box.h + Math.min(h * 0.08, 70);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundedRect(ctx, w*0.12, toolY, w*0.18, h*0.02, 10);
    ctx.fill();
    roundedRect(ctx, w*0.72, toolY - h*0.012, w*0.16, h*0.03, 12);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawDioramaFrame(ctx){
    const r = Math.max(18, Math.floor(Math.min(box.w, box.h) * 0.05));
    const fg = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
    fg.addColorStop(0, theme.frame[0]);
    fg.addColorStop(1, theme.frame[1]);

    ctx.fillStyle = fg;
    roundedRect(ctx, box.x, box.y, box.w, box.h, r);
    ctx.fill();

    // inner bevel
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = Math.max(2, Math.floor(r * 0.12));
    roundedRect(ctx, box.x + 2, box.y + 2, box.w - 4, box.h - 4, r - 2);
    ctx.stroke();

    // glass highlights
    ctx.save();
    roundedRect(ctx, interior.x, interior.y, interior.w, interior.h, r * 0.6);
    ctx.clip();

    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.glass;
    ctx.fillRect(interior.x, interior.y, interior.w, interior.h);

    // glint streak
    if (glint > 0){
      const gx = interior.x + interior.w * (0.12 + 0.76 * ((t * 0.12) % 1));
      ctx.globalAlpha = glint * 0.55;
      const gg = ctx.createLinearGradient(gx - interior.w*0.2, interior.y, gx + interior.w*0.2, interior.y + interior.h);
      gg.addColorStop(0, 'rgba(255,255,255,0)');
      gg.addColorStop(0.5, 'rgba(255,255,255,0.18)');
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(interior.x, interior.y, interior.w, interior.h);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawScene(ctx, pal){
    const sky = ctx.createLinearGradient(0, interior.y, 0, interior.y + interior.h);
    sky.addColorStop(0, pal.sky);
    sky.addColorStop(0.55, pal.sky);
    sky.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = sky;
    ctx.fillRect(interior.x, interior.y, interior.w, interior.h);

    // subtle haze
    ctx.fillStyle = pal.haze;
    ctx.fillRect(interior.x, interior.y, interior.w, interior.h);

    const ox = Math.sin(t * 0.12) * interior.w * 0.012;
    const oy = Math.cos(t * 0.14) * interior.h * 0.01;

    // back hills
    ctx.fillStyle = pal.hill2;
    ctx.beginPath();
    const y0 = interior.y + interior.h * 0.45 + oy;
    ctx.moveTo(interior.x, interior.y + interior.h);
    ctx.lineTo(interior.x, y0);
    for (let i = 0; i <= 7; i++){
      const x = interior.x + (i / 7) * interior.w;
      const yy = y0 + Math.sin(i * 0.9 + t * 0.08) * interior.h * 0.02 - interior.h * (0.06 + (rand() * 0.01));
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(interior.x + interior.w, interior.y + interior.h);
    ctx.closePath();
    ctx.fill();

    // mid hills
    ctx.fillStyle = pal.hill1;
    ctx.beginPath();
    const y1 = interior.y + interior.h * 0.62 + oy;
    ctx.moveTo(interior.x, interior.y + interior.h);
    ctx.lineTo(interior.x, y1);
    for (let i = 0; i <= 8; i++){
      const x = interior.x + (i / 8) * interior.w;
      const yy = y1 + Math.sin(i * 0.7 + t * 0.09) * interior.h * 0.025;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(interior.x + interior.w, interior.y + interior.h);
    ctx.closePath();
    ctx.fill();

    // water strip (some themes)
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = pal.water;
    ctx.fillRect(interior.x, interior.y + interior.h * 0.72, interior.w, interior.h * 0.22);
    ctx.globalAlpha = 1;

    // snow/sand highlights
    ctx.fillStyle = pal.snow;
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 7; i++){
      const xx = interior.x + interior.w * (i / 7) + ox;
      const yy = interior.y + interior.h * (0.52 + 0.18 * Math.sin(i * 1.2));
      ctx.beginPath();
      ctx.ellipse(xx, yy, interior.w * 0.09, interior.h * 0.02, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // props
    for (let i = 0; i < props.length; i++){
      const p = props[i];
      const x = p.x + ox * 0.6;
      const y = p.y + oy * 0.6;
      const s = p.s;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.r);
      ctx.scale(s, s);

      if (p.k === 'tree'){
        ctx.fillStyle = pal.tree;
        ctx.beginPath();
        ctx.ellipse(0, -6, 7, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(-1.4, 1, 2.8, 10);
      } else if (p.k === 'house'){
        ctx.fillStyle = pal.wall;
        roundedRect(ctx, -10, -2, 20, 16, 3);
        ctx.fill();
        ctx.fillStyle = pal.roof;
        ctx.beginPath();
        ctx.moveTo(-12, -2);
        ctx.lineTo(0, -14);
        ctx.lineTo(12, -2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(-3, 6, 6, 8);
      } else if (p.k === 'tower'){
        ctx.fillStyle = pal.wall;
        roundedRect(ctx, -6, -18, 12, 34, 3);
        ctx.fill();
        ctx.fillStyle = pal.roof;
        ctx.beginPath();
        ctx.moveTo(-8, -18);
        ctx.lineTo(0, -28);
        ctx.lineTo(8, -18);
        ctx.closePath();
        ctx.fill();
      } else if (p.k === 'arch'){
        ctx.strokeStyle = pal.wall;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 6, 12, Math.PI, 0);
        ctx.stroke();
      } else {
        // rock
        ctx.fillStyle = pal.wall;
        ctx.beginPath();
        ctx.ellipse(0, 4, 11, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function drawDust(ctx){
    ctx.save();
    roundedRect(ctx, interior.x, interior.y, interior.w, interior.h, Math.min(interior.w, interior.h) * 0.06);
    ctx.clip();

    for (let i = 0; i < dust.length; i++){
      const d0 = dust[i];
      const a = d0.life * 0.22;
      if (a <= 0.001) continue;
      ctx.fillStyle = `rgba(255,240,220,${a})`;
      ctx.beginPath();
      ctx.arc(d0.x, d0.y, d0.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // extra “dust veil” early in dust phase
    const ph = PHASES[phaseIdx].id;
    if (ph === 'dust'){
      const p = phaseT / PHASE_DUR;
      ctx.fillStyle = `rgba(0,0,0,${0.18 * (1 - p)})`;
      ctx.fillRect(interior.x, interior.y, interior.w, interior.h);
    }

    ctx.restore();
  }

  function drawStrokes(ctx){
    ctx.save();
    roundedRect(ctx, interior.x, interior.y, interior.w, interior.h, Math.min(interior.w, interior.h) * 0.06);
    ctx.clip();

    ctx.lineCap = 'round';
    for (let i = 0; i < strokes.length; i++){
      const s = strokes[i];
      ctx.globalAlpha = clamp(s.life, 0, 1) * 0.35;
      ctx.strokeStyle = s.c;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function drawBrush(ctx){
    const ph = PHASES[phaseIdx].id;
    if (ph !== 'dust' && ph !== 'brush') return;

    ctx.save();
    ctx.translate(brush.x, brush.y);
    ctx.rotate(brush.a);

    // handle
    ctx.fillStyle = 'rgba(10,10,10,0.75)';
    roundedRect(ctx, -54, -5, 46, 10, 5);
    ctx.fill();

    // ferrule
    ctx.fillStyle = 'rgba(220,220,220,0.38)';
    roundedRect(ctx, -12, -8, 14, 16, 3);
    ctx.fill();

    // bristles
    ctx.fillStyle = 'rgba(255,235,210,0.6)';
    ctx.beginPath();
    ctx.moveTo(2, -7);
    ctx.lineTo(18, -4);
    ctx.lineTo(22, 0);
    ctx.lineTo(18, 4);
    ctx.lineTo(2, 7);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawHUD(ctx){
    const ph = PHASES[phaseIdx];
    const p = phaseT / PHASE_DUR;

    const hudX = box.x;
    const hudY = box.y - Math.max(28, font * 1.7);
    const hudW = box.w;
    const hudH = Math.max(24, font * 1.35);

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundedRect(ctx, hudX, hudY, hudW, hudH, 14);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.font = `600 ${font}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const title = 'MUSEUM DIORAMA RESTORATION';
    strokeText(ctx, title, hudX + 18, hudY + hudH * 0.5, 'rgba(255,255,255,0.92)', 'rgba(0,0,0,0.55)', 3);

    ctx.textAlign = 'right';
    ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`${ph.label}`, hudX + hudW - 18, hudY + hudH * 0.5);

    // progress bar
    const bx = box.x + 18;
    const by = box.y + box.h + Math.max(14, font * 0.75);
    const bw = box.w - 36;
    const bh = Math.max(10, Math.floor(font * 0.45));

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, bx, by, bw, bh, 6);
    ctx.fill();

    ctx.fillStyle = theme.accent;
    roundedRect(ctx, bx, by, bw * clamp(p, 0, 1), bh, 6);
    ctx.fill();

    ctx.globalAlpha = 1;

    // checklist (left)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `600 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const steps = ['Dust', 'Match', 'Brush', 'Reveal'];
    for (let i = 0; i < steps.length; i++){
      const x = bx + i * (bw / steps.length);
      const y = by + bh + small + 8;
      const done = i < phaseIdx;
      ctx.fillStyle = done ? theme.accent : 'rgba(255,255,255,0.45)';
      ctx.fillText(done ? `[x] ${steps[i]}` : `[ ] ${steps[i]}`, x, y);
    }

    // tiny seed stamp
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(`seed ${seed >>> 0}`, box.x + box.w - 18, by + bh + small + 8);

    ctx.restore();
  }

  function render(ctx){
    drawWorkbench(ctx);

    // diorama
    drawDioramaFrame(ctx);

    // interior scene
    ctx.save();
    roundedRect(ctx, interior.x, interior.y, interior.w, interior.h, Math.min(interior.w, interior.h) * 0.06);
    ctx.clip();

    const ph = PHASES[phaseIdx].id;

    if (ph === 'reveal'){
      const p = ease(phaseT / PHASE_DUR);
      ctx.globalAlpha = 1 - p;
      drawScene(ctx, theme.before);
      ctx.globalAlpha = p;
      drawScene(ctx, theme.after);
      ctx.globalAlpha = 1;

      if (revealFlash > 0){
        ctx.fillStyle = `rgba(255,255,255,${0.20 * revealFlash})`;
        ctx.fillRect(interior.x, interior.y, interior.w, interior.h);
      }
    } else {
      drawScene(ctx, theme.after);
      if (ph === 'match'){
        const p = ease(phaseT / PHASE_DUR);
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = theme.accent;
        ctx.fillRect(interior.x + interior.w * (0.18 + 0.64 * p), interior.y, interior.w * 0.01, interior.h);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();

    // overlays
    drawStrokes(ctx);
    drawDust(ctx);
    drawBrush(ctx);

    // final glass hit
    if (glint > 0){
      ctx.globalAlpha = glint * 0.14;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(interior.x, interior.y, interior.w, interior.h);
      ctx.globalAlpha = 1;
    }

    drawHUD(ctx);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
