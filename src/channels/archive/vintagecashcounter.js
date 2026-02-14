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

function drawTextShadow(ctx, text, x, y, color, shadow='rgba(0,0,0,0.55)'){
  ctx.fillStyle = shadow;
  ctx.fillText(text, x+2, y+2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function serial(rand){
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i=0;i<2;i++) s += a[(rand()*a.length)|0];
  const n = String(100000 + ((rand()*899999)|0));
  return s + n;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;
  let mono = 13;

  const palettes = [
    { bg0:'#0b1012', bg1:'#101717', desk:'#1a2222', panel:'#152021', brass:'#d1b86a', brass2:'#9a8747', ink:'#f7f3e8', sub:'rgba(247,243,232,0.66)', accent:'#7ce6c6', alert:'#ff4b5e', paper:'#e9e2cf', paper2:'#d8cfb8' },
    { bg0:'#0d0a10', bg1:'#151019', desk:'#211a25', panel:'#1b1320', brass:'#d6a35b', brass2:'#8a5a2b', ink:'#fff6ea', sub:'rgba(255,246,234,0.64)', accent:'#ffd36a', alert:'#ff4ea6', paper:'#efe1c9', paper2:'#d9c3a1' },
    { bg0:'#091013', bg1:'#0c1b1d', desk:'#162326', panel:'#0f1d20', brass:'#7ac0ff', brass2:'#3f7aa6', ink:'#eff8ff', sub:'rgba(239,248,255,0.62)', accent:'#6cf2ff', alert:'#ff5a3a', paper:'#dfeaf0', paper2:'#c1d7e2' },
  ];
  const pal = pick(rand, palettes);

  const PHASES = [
    { id:'count', label:'COUNT' },
    { id:'bundle', label:'BUNDLE' },
    { id:'audit', label:'AUDIT' },
    { id:'reconcile', label:'RECONCILE' },
  ];
  const PHASE_DUR = 12;
  const CYCLE_DUR = PHASE_DUR * PHASES.length;

  // layout
  let desk = { x:0, y:0, w:0, h:0 };
  let machine = { x:0, y:0, w:0, h:0 };
  let feed = { x:0, y:0, w:0, h:0 };
  let outTray = { x:0, y:0, w:0, h:0 };
  let ledger = { x:0, y:0, w:0, h:0 };

  // particles / texture
  let dust = []; // {x,y,s,a,p}
  let grain = []; // {x,y,a,p}

  // notes
  const MAX_NOTES = 40;
  let notes = []; // {x,y,w,h,denom,serial,rot,vx,vy,age,stage}
  let spawnAcc = 0;

  // cycle state (deterministic per seed)
  const DENOMS = [5, 10, 20, 50, 100];
  let targetNotes = 0;
  let denomBias = 0;
  let countDone = 0;
  let valueDone = 0;
  let bundleCount = 0;
  let entries = []; // {stamp, total, notes, ok, ttl}

  // FX
  let roller = 0;
  let strapP = 0;
  let auditScan = 0;
  let stampP = 0; // 0..1 stamp flash
  let stampText = '';
  let stampX = 0, stampY = 0;
  let fraudAt = -1; // time inside AUDIT phase
  let reconcileFlash = 0;

  // audio
  let ambience = null;
  let clickAcc = 0;
  let whirrAcc = 0;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regenLayout(){
    const pad = Math.floor(Math.min(w, h) * 0.06);
    desk = { x: pad, y: Math.floor(h*0.22), w: w - pad*2, h: Math.floor(h*0.70) };

    machine = {
      x: Math.floor(w*0.26),
      y: Math.floor(h*0.38),
      w: Math.floor(Math.min(w,h)*0.38),
      h: Math.floor(Math.min(w,h)*0.26),
    };

    feed = {
      x: machine.x - Math.floor(machine.w*0.42),
      y: machine.y + Math.floor(machine.h*0.18),
      w: Math.floor(machine.w*0.38),
      h: Math.floor(machine.h*0.62),
    };

    outTray = {
      x: machine.x + machine.w + Math.floor(machine.w*0.05),
      y: machine.y + Math.floor(machine.h*0.22),
      w: Math.floor(machine.w*0.40),
      h: Math.floor(machine.h*0.56),
    };

    ledger = {
      x: Math.floor(w*0.63),
      y: Math.floor(h*0.30),
      w: Math.floor(w*0.32),
      h: Math.floor(h*0.42),
    };

    // dust motes
    const n = 160;
    dust = Array.from({ length: n }, () => ({
      x: rand()*w,
      y: rand()*h,
      s: 0.2 + rand()*1.35,
      a: 0.03 + rand()*0.09,
      p: rand()*Math.PI*2,
    }));

    const gn = 140;
    grain = Array.from({ length: gn }, () => ({
      x: rand()*w,
      y: rand()*h,
      a: 0.015 + rand()*0.055,
      p: rand()*Math.PI*2,
    }));
  }

  function resetCycle(){
    notes = [];
    spawnAcc = 0;
    roller = 0;
    strapP = 0;
    auditScan = 0;
    stampP = 0;
    stampText = '';
    reconcileFlash = 0;

    countDone = 0;
    valueDone = 0;
    bundleCount = 0;

    denomBias = rand();
    targetNotes = 70 + ((rand()*90)|0);

    entries = [];
    for (let i=0;i<6;i++) entries.push({
      stamp: null,
      total: 0,
      notes: 0,
      ok: true,
      ttl: 999,
    });

    // fraud stamp in ~28% of cycles
    fraudAt = (rand() < 0.28) ? (2.0 + rand()*(PHASE_DUR-3.2)) : -1;
  }

  function init({ width, height, dpr: dprIn }){
    w = width; h = height; dpr = dprIn || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w,h)/32));
    small = Math.max(11, Math.floor(font*0.78));
    mono = Math.max(12, Math.floor(font*0.86));

    regenLayout();
    resetCycle();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type:'pink', gain: 0.0032 });
    n.start();
    const d = simpleDrone(audio, { root: 56 + rand()*16, detune: 0.65, gain: 0.010 });
    ambience = { stop(){ try{n.stop();}catch{} try{d.stop();}catch{} } };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try{ ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){ onAudioOff(); }

  function denomPick(){
    // Slight bias for more 20/50, sometimes 100.
    const r = rand();
    if (r < 0.06 + denomBias*0.04) return 5;
    if (r < 0.26) return 10;
    if (r < 0.62) return 20;
    if (r < 0.90) return 50;
    return 100;
  }

  function spawnNote(){
    if (notes.length >= MAX_NOTES) return;

    const base = Math.min(w,h);
    const nh = base * (0.042 + rand()*0.015);
    const nw = nh * (1.85 + rand()*0.25);

    const denom = denomPick();
    notes.push({
      x: feed.x + feed.w*0.06 + rand()*feed.w*0.20,
      y: feed.y + feed.h*(0.10 + rand()*0.80),
      w: nw,
      h: nh,
      denom,
      serial: serial(rand),
      rot: (rand()-0.5)*0.09,
      vx: 0,
      vy: 0,
      age: 0,
      stage: 'feed',
    });
  }

  function stamp(text, x, y, kind='ok'){
    stampText = text;
    stampX = x; stampY = y;
    stampP = 1;

    // stamp thump
    if (kind === 'fraud') safeBeep({ freq: 110, dur: 0.045, gain: 0.050, type: 'square' });
    else safeBeep({ freq: 140, dur: 0.040, gain: 0.040, type: 'square' });
    safeBeep({ freq: 420 + rand()*120, dur: 0.020, gain: 0.012, type: 'triangle' });
  }

  function update(dt){
    t += dt;

    // cycle boundary
    const prevCycle = ((t - dt) / CYCLE_DUR) | 0;
    const curCycle = (t / CYCLE_DUR) | 0;
    if (curCycle !== prevCycle){
      resetCycle();
    }

    const cycleT = t % CYCLE_DUR;
    const phaseIdx = (cycleT / PHASE_DUR) | 0;
    const phaseT = cycleT - phaseIdx * PHASE_DUR;
    const phase = PHASES[phaseIdx].id;

    // rollers always drift
    roller += dt * (phase === 'count' ? 1.8 : 0.7);

    // spawn notes mostly during COUNT
    const spawnRate = (phase === 'count') ? lerp(5.5, 10.5, ease(phaseT/PHASE_DUR)) : 0.0;
    spawnAcc += dt * spawnRate;
    while (spawnAcc >= 1){
      spawnAcc -= 1;
      if (phase === 'count') spawnNote();
    }

    // move notes through stages
    for (let i=notes.length-1;i>=0;i--){
      const n = notes[i];
      n.age += dt;

      if (n.stage === 'feed'){
        // gentle drift toward mouth
        const tx = machine.x - n.w*0.25;
        const ty = machine.y + machine.h*0.52;
        n.x = lerp(n.x, tx, 1 - Math.exp(-dt*2.2));
        n.y = lerp(n.y, ty, 1 - Math.exp(-dt*1.6));
        if (n.age > 0.9 + rand()*0.6) { n.stage = 'in'; n.age = 0; }
      }
      else if (n.stage === 'in'){
        // in-machine transit
        n.x = lerp(n.x, machine.x + machine.w*0.52, 1 - Math.exp(-dt*6.0));
        n.y = lerp(n.y, machine.y + machine.h*0.52, 1 - Math.exp(-dt*6.0));
        n.rot *= 0.94;
        if (n.age > 0.45){
          n.stage = 'out';
          n.age = 0;

          // register count
          countDone += 1;
          valueDone += n.denom;

          // click
          safeBeep({ freq: 980 + rand()*240, dur: 0.010, gain: 0.006, type: 'square' });

          // if we crossed a bundle boundary, append ledger entry
          if (countDone % 25 === 0){
            bundleCount += 1;
            const row = (bundleCount - 1) % entries.length;
            const v = 25 * 20; // placeholder; will overwrite with actual sum estimate below
            entries[row].notes = 25;
            entries[row].total = valueDone;
            entries[row].ok = true;
            entries[row].stamp = null;
          }
        }
      }
      else if (n.stage === 'out'){
        // slide to tray
        const tx = outTray.x + outTray.w*0.40 + Math.sin((n.age*2.0)+i)*2;
        const slot = (i % 8) / 7;
        const ty = outTray.y + outTray.h*(0.18 + 0.64*slot) + Math.cos((t*0.9)+i)*1.5;
        n.x = lerp(n.x, tx, 1 - Math.exp(-dt*4.2));
        n.y = lerp(n.y, ty, 1 - Math.exp(-dt*4.2));
        n.rot = lerp(n.rot, (rand()-0.5)*0.04, 1 - Math.exp(-dt*1.8));
        if (n.age > 1.5) {
          // keep a handful in the tray for visual density
          if (notes.length > 18) notes.splice(i, 1);
          else n.stage = 'tray';
        }
      }
      else if (n.stage === 'tray'){
        // subtle jitter in tray
        n.x += Math.sin((t*1.2) + i*2.1) * dt * 1.0;
        n.y += Math.cos((t*1.3) + i*1.7) * dt * 0.9;
      }
    }

    // bundle strap animation during BUNDLE
    if (phase === 'bundle'){
      const p = phaseT / PHASE_DUR;
      strapP = Math.sin(p * Math.PI);
      // strap snap near peak
      if (audio.enabled){
        const snapZone = clamp((p - 0.46)/0.08, 0, 1);
        if (snapZone > 0.0001){
          clickAcc += dt * lerp(0, 20, snapZone);
          while (clickAcc >= 1){
            clickAcc -= 1;
            safeBeep({ freq: 520 + rand()*160, dur: 0.012, gain: 0.0045, type:'triangle' });
          }
        }
      }
    } else {
      strapP *= 0.90;
      clickAcc *= 0.65;
    }

    // audit scan bar
    if (phase === 'audit'){
      auditScan = (phaseT / PHASE_DUR);

      // fraud stamp moment
      if (fraudAt >= 0 && phaseT >= fraudAt && phaseT < fraudAt + dt){
        const row = ((rand()*entries.length)|0);
        entries[row].ok = false;
        entries[row].stamp = 'FRAUD';
        stamp('FRAUD', ledger.x + ledger.w*0.68, ledger.y + ledger.h*(0.28 + row*0.095));
      }

      // subtle scan clicks
      if (audio.enabled){
        whirrAcc += dt * 10.0;
        while (whirrAcc >= 1){
          whirrAcc -= 1;
          safeBeep({ freq: 1400 + rand()*400, dur: 0.006, gain: 0.0017, type:'triangle' });
        }
      }
    } else {
      whirrAcc *= 0.7;
      auditScan *= 0.92;
    }

    // reconcile flash + stamp
    if (phase === 'reconcile'){
      const p = phaseT / PHASE_DUR;
      reconcileFlash = Math.max(reconcileFlash, 0.15 * Math.sin(p*Math.PI));
      if (phaseT > PHASE_DUR*0.72 && phaseT < PHASE_DUR*0.72 + dt){
        stamp('RECONCILED', ledger.x + ledger.w*0.62, ledger.y + ledger.h*0.76);
      }
    } else {
      reconcileFlash *= 0.86;
    }

    // counting whirr/clicks during COUNT
    if (audio.enabled && phase === 'count'){
      const p = phaseT / PHASE_DUR;
      const rate = lerp(14, 28, ease(p));
      whirrAcc += dt * rate;
      while (whirrAcc >= 1){
        whirrAcc -= 1;
        safeBeep({ freq: 220 + rand()*80, dur: 0.007, gain: 0.0022, type:'square' });
      }
    }

    stampP = Math.max(0, stampP - dt*1.8);
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(1, pal.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // subtle vignette
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0,0,w, Math.floor(h*0.10));
    ctx.fillRect(0,Math.floor(h*0.88),w, Math.floor(h*0.12));

    // dust motes
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i=0;i<dust.length;i++){
      const d = dust[i];
      const x = (d.x + Math.cos(t*0.15 + d.p) * 16) % w;
      const y = (d.y + Math.sin(t*0.17 + d.p) * 10) % h;
      ctx.fillStyle = `rgba(255,255,255,${d.a})`;
      ctx.fillRect(x, y, d.s, d.s);
    }
    ctx.restore();
  }

  function drawDesk(ctx){
    // desk slab
    ctx.save();
    ctx.fillStyle = pal.desk;
    roundedRect(ctx, desk.x, desk.y, desk.w, desk.h, Math.max(14, Math.floor(Math.min(w,h)*0.02)));
    ctx.fill();

    // desk sheen
    ctx.globalAlpha = 0.10;
    const g = ctx.createLinearGradient(desk.x, desk.y, desk.x+desk.w, desk.y+desk.h);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(desk.x, desk.y, desk.w, desk.h);
    ctx.restore();
  }

  function drawMachine(ctx, phase, phaseT){
    // machine body
    ctx.save();
    ctx.fillStyle = pal.panel;
    roundedRect(ctx, machine.x, machine.y, machine.w, machine.h, Math.floor(machine.h*0.14));
    ctx.fill();

    // brass trim
    ctx.lineWidth = Math.max(2, Math.floor(Math.min(w,h)*0.003));
    ctx.strokeStyle = pal.brass2;
    ctx.stroke();

    // display window
    const dx = machine.x + machine.w*0.10;
    const dy = machine.y + machine.h*0.14;
    const dw = machine.w*0.40;
    const dh = machine.h*0.26;
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    roundedRect(ctx, dx, dy, dw, dh, 8);
    ctx.fill();

    // counter text
    ctx.font = `700 ${Math.floor(font*1.02)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const shownNotes = Math.min(countDone, targetNotes);
    drawTextShadow(ctx, String(shownNotes).padStart(4,'0'), dx + dw*0.10, dy + dh*0.56, pal.ink);

    ctx.font = `600 ${Math.floor(small*0.92)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = pal.sub;
    ctx.fillText(`$${valueDone}`, dx + dw*0.52, dy + dh*0.56);

    // rollers
    const rx = machine.x + machine.w*0.62;
    const ry = machine.y + machine.h*0.50;
    const r = Math.floor(machine.h*0.18);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i=0;i<3;i++){
      const cx = rx + i*(r*1.05);
      ctx.beginPath();
      ctx.arc(cx, ry, r, 0, Math.PI*2);
      ctx.fill();

      ctx.strokeStyle = pal.brass;
      ctx.lineWidth = Math.max(2, Math.floor(r*0.14));
      ctx.beginPath();
      ctx.arc(cx, ry, r*0.85, roller + i, roller + i + Math.PI*1.7);
      ctx.stroke();
    }

    // mouth slot
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundedRect(ctx, machine.x + machine.w*0.44, machine.y + machine.h*0.62, machine.w*0.20, machine.h*0.12, 10);
    ctx.fill();

    // feed + tray frames
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(2, Math.floor(Math.min(w,h)*0.003));

    roundedRect(ctx, feed.x, feed.y, feed.w, feed.h, 14);
    ctx.stroke();
    roundedRect(ctx, outTray.x, outTray.y, outTray.w, outTray.h, 14);
    ctx.stroke();

    // bundle strap on tray
    if (phase === 'bundle'){
      const p = clamp(phaseT / PHASE_DUR, 0, 1);
      const s = ease(Math.sin(p*Math.PI));
      const sx = outTray.x + outTray.w*0.12;
      const sy = outTray.y + outTray.h*0.50;
      const sw = outTray.w*0.76;
      const sh = Math.max(10, outTray.h*0.14);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(20,15,10,0.75)';
      roundedRect(ctx, sx, sy - sh*0.5, sw, sh, 8);
      ctx.fill();
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = pal.brass;
      roundedRect(ctx, sx + sw*(0.46 - 0.10*s), sy - sh*0.25, sw*(0.08 + 0.20*s), sh*0.5, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawNotes(ctx){
    // draw notes behind machine slot
    ctx.save();
    for (let i=0;i<notes.length;i++){
      const n = notes[i];
      const inMachine = (n.stage === 'in');
      if (inMachine) ctx.globalAlpha = 0.75;
      else ctx.globalAlpha = 0.92;

      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(n.rot);

      // note base
      ctx.fillStyle = pal.paper;
      roundedRect(ctx, -n.w*0.5, -n.h*0.5, n.w, n.h, Math.min(8, n.h*0.25));
      ctx.fill();

      // border
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = Math.max(1, Math.floor(n.h*0.06));
      ctx.stroke();

      // watermark band
      ctx.globalAlpha *= 0.7;
      ctx.fillStyle = pal.paper2;
      roundedRect(ctx, -n.w*0.46, -n.h*0.20, n.w*0.92, n.h*0.40, 6);
      ctx.fill();

      // denom
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.font = `700 ${Math.max(10, Math.floor(n.h*0.55))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(n.denom), -n.w*0.40, n.h*0.30);

      // serial
      ctx.globalAlpha = 0.55;
      ctx.font = `600 ${Math.max(9, Math.floor(n.h*0.24))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillText(n.serial, -n.w*0.40, -n.h*0.12);

      ctx.restore();
    }
    ctx.restore();
  }

  function drawLedger(ctx, phase, phaseT){
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundedRect(ctx, ledger.x, ledger.y, ledger.w, ledger.h, 18);
    ctx.fill();

    // paper sheet
    const px = ledger.x + ledger.w*0.06;
    const py = ledger.y + ledger.h*0.10;
    const pw = ledger.w*0.88;
    const ph = ledger.h*0.78;

    ctx.fillStyle = pal.paper;
    roundedRect(ctx, px, py, pw, ph, 14);
    ctx.fill();

    // header
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.font = `800 ${Math.floor(font*0.98)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('BACK OFFICE AUDIT', px + pw*0.06, py + ph*0.16);

    // table lines
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let i=0;i<6;i++){
      const y = py + ph*(0.24 + i*0.11);
      ctx.beginPath();
      ctx.moveTo(px + pw*0.05, y);
      ctx.lineTo(px + pw*0.95, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // entries
    ctx.font = `700 ${Math.floor(small*0.92)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    for (let i=0;i<entries.length;i++){
      const row = entries[i];
      const y = py + ph*(0.30 + i*0.11);
      const idx = String(i+1).padStart(2,'0');
      const flag = row.ok ? 'OK' : '??';
      ctx.fillText(`${idx}  NOTES ${String(row.notes||0).padStart(2,'0')}   TOTAL $${String(row.total||0).padStart(4,' ') }   ${flag}`, px + pw*0.06, y);
    }

    // audit scan bar
    if (phase === 'audit'){
      const p = clamp(phaseT/PHASE_DUR, 0, 1);
      const sx = px + pw*(0.05 + 0.90*p);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = pal.accent;
      ctx.fillRect(sx - 8, py + ph*0.22, 16, ph*0.62);
      ctx.restore();
    }

    // reconcile card overlay
    if (phase === 'reconcile'){
      const p = ease(clamp(phaseT/PHASE_DUR, 0, 1));
      const cx = px + pw*0.08;
      const cy = py + ph*(0.28 + 0.10*Math.sin(p*Math.PI));
      const cw = pw*0.84;
      const ch = ph*0.54;
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = pal.paper2;
      roundedRect(ctx, cx, cy, cw, ch, 18);
      ctx.fill();

      ctx.fillStyle = 'rgba(0,0,0,0.58)';
      ctx.font = `900 ${Math.floor(font*1.02)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.fillText('END OF DAY', cx + cw*0.08, cy + ch*0.22);

      ctx.font = `800 ${Math.floor(small*1.00)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillText(`NOTES: ${countDone}`, cx + cw*0.08, cy + ch*0.44);
      ctx.fillText(`VALUE: $${valueDone}`, cx + cw*0.08, cy + ch*0.60);

      ctx.globalAlpha = 0.18 + reconcileFlash;
      ctx.fillStyle = pal.accent;
      roundedRect(ctx, cx + cw*0.64, cy + ch*0.36, cw*0.28, ch*0.46, 14);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = `900 ${Math.floor(font*0.92)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillText('✓', cx + cw*0.74, cy + ch*0.70);
    }

    // stamp overlay
    if (stampP > 0.0001){
      const p = ease(stampP);
      ctx.save();
      ctx.translate(stampX, stampY);
      ctx.rotate(-0.22);
      ctx.globalAlpha = 0.55 * p;
      ctx.strokeStyle = (stampText === 'FRAUD') ? pal.alert : pal.accent;
      ctx.lineWidth = Math.max(3, Math.floor(Math.min(w,h)*0.005));
      const sw = ledger.w*0.34;
      const sh = ledger.h*0.12;
      roundedRect(ctx, -sw*0.5, -sh*0.5, sw, sh, 10);
      ctx.stroke();

      ctx.globalAlpha = 0.62 * p;
      ctx.fillStyle = (stampText === 'FRAUD') ? pal.alert : pal.accent;
      ctx.font = `900 ${Math.floor(font*0.86)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(stampText, 0, 1);
      ctx.restore();
    }

    ctx.restore();
  }

  function draw(ctx){
    const cycleT = t % CYCLE_DUR;
    const phaseIdx = (cycleT / PHASE_DUR) | 0;
    const phaseT = cycleT - phaseIdx * PHASE_DUR;
    const phase = PHASES[phaseIdx].id;

    drawBackground(ctx);
    drawDesk(ctx);

    // OSD / phase pill
    ctx.save();
    ctx.font = `800 ${Math.floor(small*0.98)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const pill = { x: desk.x + desk.w*0.04, y: desk.y + desk.h*0.08, w: desk.w*0.34, h: Math.max(28, Math.floor(h*0.05)) };
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, pill.x, pill.y, pill.w, pill.h, pill.h*0.5);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.ink;
    ctx.fillText(`PHASE: ${PHASES[phaseIdx].label}`, pill.x + pill.w*0.08, pill.y + pill.h*0.52);

    // tiny progress bar
    const p = clamp(phaseT/PHASE_DUR, 0, 1);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundedRect(ctx, pill.x + pill.w*0.08, pill.y + pill.h*0.74, pill.w*0.84, Math.max(6, pill.h*0.16), 6);
    ctx.fill();
    ctx.fillStyle = pal.accent;
    roundedRect(ctx, pill.x + pill.w*0.08, pill.y + pill.h*0.74, pill.w*0.84*p, Math.max(6, pill.h*0.16), 6);
    ctx.fill();
    ctx.restore();

    // notes behind + in front of machine
    drawNotes(ctx);
    drawMachine(ctx, phase, phaseT);
    drawLedger(ctx, phase, phaseT);

    // warm film grain (precomputed; frame-rate independent)
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000';
    for (let i=0;i<grain.length;i++){
      const g = grain[i];
      const x = (g.x + Math.sin(t*0.9 + g.p) * 14 + w) % w;
      const y = (g.y + Math.cos(t*1.1 + g.p) * 10 + h) % h;
      ctx.globalAlpha = g.a;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  return { init, onResize, update, draw, destroy, onAudioOn, onAudioOff };
}
