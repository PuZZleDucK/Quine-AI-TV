// REVIEWED: 2026-02-10
import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

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
    { bg0: '#0c0f16', bg1: '#111b1f', shelf: '#1a2332', belt: '#1f262f', belt2: '#161c23', bin: '#1e2a2c', bin2: '#142022', ink: '#e9eef7', sub: 'rgba(233,238,247,0.65)', accent: '#7cffc9', alert: '#ff4b5e' },
    { bg0: '#0f0b12', bg1: '#1a111a', shelf: '#2a1e2a', belt: '#2a2a2a', belt2: '#1a1a1a', bin: '#25202a', bin2: '#19141f', ink: '#fff6ec', sub: 'rgba(255,246,236,0.62)', accent: '#ffd36a', alert: '#ff4ea6' },
    { bg0: '#081015', bg1: '#0b1c18', shelf: '#102a25', belt: '#1c2b2a', belt2: '#13201f', bin: '#142b22', bin2: '#0e1f18', ink: '#f1fff9', sub: 'rgba(241,255,249,0.62)', accent: '#6cf2ff', alert: '#ff5a3a' },
  ];
  const pal = pick(rand, palettes);

  const PHASES = [
    { id: 'intake', label: 'INTAKE' },
    { id: 'scan', label: 'SCAN' },
    { id: 'sort', label: 'SORT' },
    { id: 'tidy', label: 'TIDY SWEEP' },
  ];
  const PHASE_DUR = 13;
  const CYCLE_DUR = PHASE_DUR * PHASES.length;

  let conveyor = { x: 0, y: 0, w: 0, h: 0 };
  let scanner = { x: 0, y: 0, w: 0, h: 0 };
  let bins = [];

  // FX / motion layers
  let dust = []; // {x,y,s,a,p}
  let beltScroll = 0;
  let scanFlash = 0;
  let scanBeam = 0;
  let jamFlash = 0;
  let jamTimer = 0;
  let nextJamAt = 0;

  // cached gradients (rebuild on resize/ctx swap)
  let bgGradient = null;
  let bgGradientCtx = null;
  let bgGradientH = 0;

  let scanBeamGradient = null;
  let scanBeamGradientCtx = null;
  let scanBeamGradientFromY = 0;
  let scanBeamGradientToY = 0;

  // books
  const MAX_BOOKS = 26;
  // note: per-book targets/jitter are precomputed on spawn to keep update() deterministic across FPS
  let books = []; // {x,y,w,h,route,rot,color,spine,alpha,mode,tx,ty,meta,scanned,divertJx,divertJy,divertRotTarget,scanFreq,divertFreq}
  let spawnAcc = 0;
  let lastScanned = null; // {title,call,due,route}
  let lastScanTTL = 0;

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

  function regenLayout(){
    const pad = Math.floor(Math.min(w, h) * 0.06);

    conveyor = {
      x: pad,
      y: Math.floor(h * 0.56),
      w: w - pad*2,
      h: Math.max(34, Math.floor(h * 0.12)),
    };

    scanner = {
      x: Math.floor(w * 0.52),
      y: Math.floor(h * 0.38),
      w: Math.floor(Math.min(w, h) * 0.22),
      h: Math.floor(Math.min(w, h) * 0.18),
    };

    // bins (deterministic labels)
    bins = [];
    const binAreaH = Math.floor(h * 0.28);
    const binY = h - pad - binAreaH;
    const gap = Math.max(10, Math.floor(w * 0.022));
    const bw = Math.floor((w - pad*2 - gap*3) / 4);
    const bh = binAreaH;

    const labelsA = ['FICTION', 'NON-FIC', 'KIDS', 'REF', 'MYST', 'SCI', 'ART', 'BIO'];
    const labelsB = ['STACK A', 'STACK B', 'STACK C', 'STACK D'];
    const chosen = [];
    while (chosen.length < 4){
      const lab = rand() < 0.6 ? pick(rand, labelsA) : pick(rand, labelsB);
      if (!chosen.includes(lab)) chosen.push(lab);
    }

    for (let i=0;i<4;i++){
      bins.push({
        x: pad + i*(bw+gap),
        y: binY,
        w: bw,
        h: bh,
        label: chosen[i],
        cx: pad + i*(bw+gap) + bw*0.5,
        cy: binY + bh*0.55,
      });
    }

    // dust motes
    const n = 160;
    dust = Array.from({ length: n }, () => ({
      x: rand() * w,
      y: rand() * h,
      s: 0.2 + rand() * 1.4,
      a: 0.03 + rand() * 0.09,
      p: rand() * Math.PI * 2,
    }));
  }

  function reset(){
    t = 0;
    beltScroll = 0;
    scanFlash = 0;
    scanBeam = 0;
    jamFlash = 0;
    jamTimer = 0;
    nextJamAt = 10 + rand()*11;
    spawnAcc = 0;
    books = [];
    lastScanned = null;
    lastScanTTL = 0;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    // invalidate cached gradients (ctx may swap; layout changes on resize)
    bgGradient = null;
    bgGradientCtx = null;
    bgGradientH = 0;
    scanBeamGradient = null;
    scanBeamGradientCtx = null;
    scanBeamGradientFromY = 0;
    scanBeamGradientToY = 0;

    regenLayout();
    reset();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // defensively stop any existing ambience we started
    stopAmbience({ clearCurrent: true });

    const n = audio.noiseSource({ type: 'pink', gain: 0.0036 });
    n.start();

    const d = simpleDrone(audio, { root: 52 + rand()*20, detune: 0.65, gain: 0.012 });

    const handle = {
      stop(){
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
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

  function makeMeta(){
    // Deterministic-ish metadata (each call uses seeded rand).
    const titlesA = ['The Clockwork Atlas', 'Library of Small Wonders', 'Midnight Index', 'A Brief History of Errata', 'The Quiet Conveyor'];
    const titlesB = ['& Other Stories', 'for Curious Minds', 'Volume II', '— Revised Edition', 'in Four Acts'];
    const callA = ['QA', 'PN', 'BF', 'PR', 'TK', 'ML', 'NC'];
    const callB = String(10 + ((rand()*89)|0));
    const callC = '.' + pick(rand, ['A', 'B', 'C', 'D', 'E']) + String(10 + ((rand()*89)|0));
    const dueDays = 1 + ((rand()*27)|0);
    const due = `DUE +${dueDays}d`;

    return {
      title: `${pick(rand, titlesA)} ${rand() < 0.55 ? pick(rand, titlesB) : ''}`.trim(),
      call: `${pick(rand, callA)} ${callB}${callC}`,
      due,
    };
  }

  function spawnBook(){
    if (books.length >= MAX_BOOKS) return;

    const base = Math.min(w, h);
    const hh = base * (0.055 + rand()*0.02);
    const ww = hh * (1.35 + rand()*0.65);

    const route = (rand() * bins.length) | 0;

    const colors = ['#ffcf6a', '#7cffc9', '#6cf2ff', '#ff6aa2', '#b7ff8a', '#ffd0ff', '#a2c2ff'];
    const spine = pick(rand, colors);
    const cover = `rgba(255,255,255,${0.10 + rand()*0.10})`;

    const meta = makeMeta();

    // precompute per-book targets (avoid rand() inside update hot loop)
    const divertJx = rand() - 0.5;
    const divertJy = rand() - 0.5;
    const divertRotTarget = (rand() - 0.5) * 0.22;
    const scanFreq = 980 + rand() * 160;
    const divertFreq = 140 + rand() * 40;

    books.push({
      x: conveyor.x - ww - rand()*w*0.08,
      y: conveyor.y + conveyor.h*0.5 + (rand()-0.5) * conveyor.h*0.12,
      w: ww,
      h: hh,
      route,
      rot: (rand()-0.5) * 0.10,
      color: cover,
      spine,
      alpha: 1,
      mode: 'belt', // belt|divert|bin
      tx: 0,
      ty: 0,
      meta,
      scanned: false,
      divertJx,
      divertJy,
      divertRotTarget,
      scanFreq,
      divertFreq,
    });
  }

  function triggerScan(book){
    scanFlash = 1;
    scanBeam = 1;
    lastScanned = { ...book.meta, route: bins[book.route].label };
    lastScanTTL = 3.8;

    safeBeep({ freq: book.scanFreq, dur: 0.03, gain: 0.016, type: 'triangle' });
    safeBeep({ freq: 220, dur: 0.05, gain: 0.02, type: 'square' });
  }

  function triggerJam(){
    jamFlash = 1;
    jamTimer = 4.4;
    safeBeep({ freq: 190, dur: 0.09, gain: 0.028, type: 'square' });
    safeBeep({ freq: 420, dur: 0.06, gain: 0.018, type: 'triangle' });
  }

  function update(dt){
    t += dt;

    const cyc = t % CYCLE_DUR;
    const phaseIndex = Math.floor(cyc / PHASE_DUR);
    const phaseT = (cyc - phaseIndex * PHASE_DUR) / PHASE_DUR;
    const phase = PHASES[phaseIndex];

    // FX
    scanFlash = Math.max(0, scanFlash - dt * 2.2);
    scanBeam = Math.max(0, scanBeam - dt * 2.8);
    jamFlash = Math.max(0, jamFlash - dt * 1.4);

    if (lastScanTTL > 0) lastScanTTL = Math.max(0, lastScanTTL - dt);

    // Jam: happens during SORT phase only
    if (jamTimer > 0){
      jamTimer = Math.max(0, jamTimer - dt);
    } else {
      if (phase.id === 'sort'){
        nextJamAt -= dt;
        if (nextJamAt <= 0){
          triggerJam();
          nextJamAt = 14 + rand()*18;
        }
      }
    }

    // Spawn books
    const spawnRate = (phase.id === 'intake') ? 1.4 : (phase.id === 'scan') ? 0.9 : 0.55;
    spawnAcc += dt * spawnRate;
    while (spawnAcc >= 1){
      spawnAcc -= 1;
      if (phase.id !== 'tidy') spawnBook();
    }

    // Belt motion
    const jamFactor = jamTimer > 0 ? (jamTimer > 3.2 ? 0.05 : 0.55) : 1;
    const speed = Math.min(w, h) * (0.15 + 0.05*Math.sin(t*0.8)) * jamFactor;
    beltScroll += dt * speed * 0.18;

    // Update books
    const diverterX = conveyor.x + conveyor.w * 0.76;

    for (const b of books){
      if (b.mode === 'belt'){
        // keep on belt
        b.x += speed * dt;
        b.y = lerp(b.y, conveyor.y + conveyor.h*0.52, 0.07);

        // scan window
        const scanX = scanner.x;
        if (!b.scanned && phase.id === 'scan' && jamTimer <= 0){
          if (Math.abs((b.x + b.w*0.55) - scanX) < b.w * 0.22){
            b.scanned = true;
            triggerScan(b);
          }
        }

        // divert into bin during SORT
        if (phase.id === 'sort' && b.x + b.w*0.6 > diverterX){
          b.mode = 'divert';
          const bin = bins[b.route];
          b.tx = bin.cx + b.divertJx * bin.w * 0.16;
          b.ty = bin.cy + b.divertJy * bin.h * 0.10;
          safeBeep({ freq: b.divertFreq, dur: 0.05, gain: 0.014, type: 'square' });
        }
      } else if (b.mode === 'divert'){
        const k = 1 - Math.pow(0.001, dt); // dt-safe smoothing
        b.x = lerp(b.x, b.tx, k*0.55);
        b.y = lerp(b.y, b.ty, k*0.45);
        b.rot = lerp(b.rot, b.divertRotTarget, k*0.12);
        if (Math.hypot(b.x-b.tx, b.y-b.ty) < 8){
          b.mode = 'bin';
        }
      } else {
        // in bin: tiny settle
        b.rot = lerp(b.rot, 0, 0.06);
      }

      // tidy sweep fades out anything still visible
      if (phase.id === 'tidy'){
        const fade = 0.28 + 0.35*phaseT;
        b.alpha = Math.max(0, b.alpha - dt * fade);
      }
    }

    // in-place compaction (avoid per-frame array allocation)
    let write = 0;
    for (let i=0;i<books.length;i++){
      const b = books[i];
      if (b.alpha > 0 && b.x < w + b.w*2) books[write++] = b;
    }
    if (write !== books.length) books.length = write;

    // more scan beam during scan phase
    if (phase.id === 'scan'){
      scanBeam = Math.max(scanBeam, 0.35 + 0.35*Math.sin(t*4.0));
    }

    // dust drift
    for (const p of dust){
      p.p += dt * (0.25 + p.s*0.04);
      p.x += Math.cos(p.p) * p.s * dt * 3.2;
      p.y += Math.sin(p.p*0.9) * p.s * dt * 2.2;
      if (p.x < -20) p.x = w+20;
      if (p.x > w+20) p.x = -20;
      if (p.y < -20) p.y = h+20;
      if (p.y > h+20) p.y = -20;
    }
  }

  function drawShelves(ctx){
    const rows = 6;
    const cols = 14;
    const shelfTop = h * 0.12;
    const shelfH = h * 0.34;

    ctx.save();
    ctx.globalAlpha = 0.85;

    for (let r=0;r<rows;r++){
      const y0 = shelfTop + (r/rows) * shelfH;
      const y1 = shelfTop + ((r+1)/rows) * shelfH;
      ctx.fillStyle = pal.shelf;
      ctx.fillRect(0, y1-2, w, 2);

      for (let c=0;c<cols;c++){
        const x = (c/cols) * w;
        const bw = w/cols * (0.55 + 0.45*Math.sin((c+1)*0.6));
        const bh = (y1-y0) * (0.55 + 0.35*Math.sin((r+1)*0.9));
        const ox = (Math.sin((r*cols+c)*0.7 + t*0.2) * 3);
        const by = y1 - bh - 4;

        ctx.fillStyle = `rgba(255,255,255,${0.04 + ((c+r)&1)*0.02})`;
        ctx.fillRect(x + ox, by, bw, bh);
        ctx.fillStyle = `rgba(0,0,0,0.12)`;
        ctx.fillRect(x + ox, by, 2, bh);
      }
    }
    ctx.restore();
  }

  function draw(ctx){
    const cyc = t % CYCLE_DUR;
    const phaseIndex = Math.floor(cyc / PHASE_DUR);
    const phaseT = (cyc - phaseIndex * PHASE_DUR) / PHASE_DUR;
    const phase = PHASES[phaseIndex];

    // background (cached)
    if (!bgGradient || bgGradientCtx !== ctx || bgGradientH !== h){
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, pal.bg0);
      g.addColorStop(1, pal.bg1);
      bgGradient = g;
      bgGradientCtx = ctx;
      bgGradientH = h;
    }
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, w, h);

    // shelves layer
    drawShelves(ctx);

    // dust motes
    ctx.save();
    ctx.fillStyle = pal.ink;
    for (const p of dust){
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // conveyor
    ctx.save();
    roundedRect(ctx, conveyor.x, conveyor.y, conveyor.w, conveyor.h, 16);
    ctx.clip();

    ctx.fillStyle = pal.belt2;
    ctx.fillRect(conveyor.x, conveyor.y, conveyor.w, conveyor.h);

    // belt stripes
    const stripeW = Math.max(26, Math.floor(conveyor.h*0.65));
    const off = (beltScroll % (stripeW*2));
    for (let x = conveyor.x - stripeW*2; x < conveyor.x + conveyor.w + stripeW*2; x += stripeW*2){
      ctx.fillStyle = pal.belt;
      ctx.fillRect(x - off, conveyor.y, stripeW, conveyor.h);
    }

    // tidy sweep bar
    if (phase.id === 'tidy'){
      const sx = conveyor.x + conveyor.w * ease(phaseT);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = pal.accent;
      ctx.fillRect(sx - 10, conveyor.y, 18, conveyor.h);
      ctx.globalAlpha = 0.10;
      ctx.fillRect(sx + 12, conveyor.y, 8, conveyor.h);
    }

    ctx.restore();

    // scanner arch
    ctx.save();
    const archX = scanner.x - scanner.w*0.5;
    const archY = scanner.y;
    const archW = scanner.w;
    const archH = scanner.h;

    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = `rgba(255,255,255,0.20)`;
    ctx.lineWidth = Math.max(2, Math.floor(Math.min(w,h)*0.003));

    ctx.beginPath();
    ctx.moveTo(archX, archY + archH);
    ctx.quadraticCurveTo(scanner.x, archY - archH*0.25, archX + archW, archY + archH);
    ctx.stroke();

    // scan beam
    if (phase.id === 'scan' || scanBeam > 0.01){
      const a = 0.08 + scanBeam*0.18;
      ctx.globalAlpha = a;
      const fromY = scanner.y + archH;
      const toY = conveyor.y;
      if (!scanBeamGradient || scanBeamGradientCtx !== ctx || scanBeamGradientFromY !== fromY || scanBeamGradientToY !== toY){
        const beamG = ctx.createLinearGradient(0, fromY, 0, toY);
        beamG.addColorStop(0, pal.accent);
        beamG.addColorStop(1, 'rgba(0,0,0,0)');
        scanBeamGradient = beamG;
        scanBeamGradientCtx = ctx;
        scanBeamGradientFromY = fromY;
        scanBeamGradientToY = toY;
      }
      ctx.fillStyle = scanBeamGradient;
      ctx.fillRect(scanner.x - archW*0.25, fromY, archW*0.5, toY - fromY);
    }

    // scan flash ring
    if (scanFlash > 0){
      ctx.globalAlpha = scanFlash * 0.35;
      ctx.strokeStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(scanner.x, scanner.y + archH*0.9, (archW*0.22) * (1 + (1-scanFlash)*0.6), 0, Math.PI*2);
      ctx.stroke();
    }

    ctx.restore();

    // bins
    for (const bin of bins){
      ctx.save();
      ctx.globalAlpha = 0.96;
      roundedRect(ctx, bin.x, bin.y, bin.w, bin.h, 18);
      ctx.fillStyle = pal.bin2;
      ctx.fill();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = `rgba(255,255,255,0.12)`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // label
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = pal.sub;
      ctx.font = `600 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(bin.label, bin.cx, bin.y + 10);
      ctx.restore();
    }

    // books (belt first, then bins)
    function drawBook(b){
      ctx.save();
      ctx.globalAlpha = b.alpha;
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);

      // shadow
      ctx.globalAlpha = b.alpha * 0.25;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundedRect(ctx, 2, 4, b.w, b.h, 6);
      ctx.fill();

      ctx.globalAlpha = b.alpha;
      // cover
      ctx.fillStyle = b.color;
      roundedRect(ctx, 0, 0, b.w, b.h, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // spine stripe
      ctx.fillStyle = b.spine;
      ctx.globalAlpha = b.alpha * 0.85;
      ctx.fillRect(0, 0, Math.max(4, b.w*0.10), b.h);

      // tiny label tick
      ctx.globalAlpha = b.alpha * 0.55;
      ctx.fillStyle = pal.ink;
      ctx.fillRect(b.w*0.18, b.h*0.55, b.w*0.52, 2);

      ctx.restore();
    }

    for (const b of books.filter(b => b.mode === 'belt')) drawBook(b);
    for (const b of books.filter(b => b.mode !== 'belt')) drawBook(b);

    // HUD
    ctx.save();
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.92;
    ctx.font = `700 ${font}px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Book Return Sorting Machine', 22, 18);

    ctx.globalAlpha = 0.75;
    ctx.font = `600 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`PHASE: ${phase.label}`, 22, 18 + font + 6);

    const mm = Math.floor(cyc / 60);
    const ss = Math.floor(cyc % 60).toString().padStart(2,'0');
    ctx.fillText(`CYCLE: ${mm}:${ss}`, 22, 18 + font + 6 + small + 6);

    // jam alert
    if (jamTimer > 0){
      ctx.globalAlpha = 0.18 + 0.18*Math.sin(t*10);
      ctx.fillStyle = pal.alert;
      ctx.fillRect(0, 0, w, h);

      ctx.globalAlpha = 0.95;
      ctx.fillStyle = pal.alert;
      ctx.font = `800 ${Math.floor(font*1.25)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('JAM DETECTED — CLEARING', w*0.5, h*0.20);
    }

    ctx.restore();

    // scan metadata card
    if (lastScanned && lastScanTTL > 0){
      const a = ease(Math.min(1, lastScanTTL/0.35)) * ease(Math.min(1, lastScanTTL/3.8));
      const cardW = Math.min(w*0.46, 460);
      const cardH = Math.min(h*0.20, 140);
      const x = w - cardW - 22;
      const y = 18;

      ctx.save();
      ctx.globalAlpha = 0.88 * a;
      roundedRect(ctx, x, y, cardW, cardH, 14);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,0.14)`;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.globalAlpha = 0.95 * a;
      ctx.fillStyle = pal.ink;
      ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('SCAN OK', x + 14, y + 12);

      ctx.globalAlpha = 0.80 * a;
      ctx.fillStyle = pal.sub;
      ctx.fillText(`ROUTE: ${lastScanned.route}`, x + 14, y + 12 + small + 6);

      ctx.globalAlpha = 0.95 * a;
      ctx.fillStyle = pal.ink;
      ctx.font = `700 ${Math.floor(small*1.05)}px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif`;
      ctx.fillText(lastScanned.title, x + 14, y + 12 + (small+6)*2);

      ctx.globalAlpha = 0.80 * a;
      ctx.fillStyle = pal.sub;
      ctx.font = `600 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(`${lastScanned.call}  •  ${lastScanned.due}`, x + 14, y + cardH - 12 - small);

      ctx.restore();
    }
  }

  return {
    init,
    onResize,
    update,
    draw,
    destroy,
    onAudioOn,
    onAudioOff,
  };
}
