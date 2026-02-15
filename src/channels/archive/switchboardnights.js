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

  const pal = {
    bg0: '#07080b',
    bg1: '#0b1016',
    board0: '#0f1a16',
    board1: '#0a1210',
    trim: 'rgba(245, 235, 210, 0.10)',
    ink: 'rgba(235, 244, 250, 0.86)',
    inkDim: 'rgba(235, 244, 250, 0.60)',
    lamp: '#ffcf6b',
    lampHot: '#fff2b8',
    jack: 'rgba(225, 240, 235, 0.14)',
    jackEdge: 'rgba(225, 240, 235, 0.26)',
    cord: ['#ff5c91', '#49d2ff', '#ffd84f', '#b27cff', '#46f2c6'],
    glitch: '#7df8ff',
  };

  const PHASES = [
    { id: 'after', label: 'AFTER HOURS', dur: 26 },
    { id: 'rush', label: 'RUSH HOUR', dur: 22 },
    { id: 'late', label: 'LATE SHIFT', dur: 26 },
  ];

  let phaseIdx = 0;
  let phaseT = 0;

  // board geometry
  let board = { x: 0, y: 0, w: 0, h: 0, r: 18 };
  let grid = { cols: 0, rows: 0, padX: 0, padY: 0, cellW: 0, cellH: 0 };
  let jacks = []; // {x,y}
  let jackBusy = []; // call index or -1

  // calls
  let calls = []; // {a,b,state,age,ringP,ringAcc,connDur,fade,color,from,to}
  let callLog = []; // strings
  let spawnAcc = 0;

  // special moments
  let nextMysteryAt = 0;
  let mystery = 0; // 0..1
  let flicker = 0;

  // audio
  let ambience = null;
  let noise = null;
  let drone = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regen(){
    t = 0;
    phaseIdx = 0;
    phaseT = 0;

    calls = [];
    callLog = [];
    spawnAcc = 0;

    mystery = 0;
    flicker = 0;
    nextMysteryAt = 10 + rand() * 18;

    // deterministic board layout
    const baseCols = 10 + ((rand() * 4) | 0); // 10..13
    const baseRows = 6 + ((rand() * 3) | 0);  // 6..8
    grid.cols = baseCols;
    grid.rows = baseRows;

    jackBusy = new Array(grid.cols * grid.rows).fill(-1);
    jacks = [];

    // board area
    const margin = Math.floor(Math.min(w, h) * 0.07);
    board.w = Math.floor(w - margin * 2);
    board.h = Math.floor(h * 0.74);
    board.x = Math.floor((w - board.w) * 0.5);
    board.y = Math.floor(h * 0.16);
    board.r = Math.max(16, Math.floor(Math.min(w, h) * 0.03));

    grid.padX = Math.floor(board.w * 0.07);
    grid.padY = Math.floor(board.h * 0.16);
    grid.cellW = (board.w - grid.padX * 2) / grid.cols;
    grid.cellH = (board.h - grid.padY * 2) / grid.rows;

    for (let r=0;r<grid.rows;r++){
      for (let c=0;c<grid.cols;c++){
        const x = board.x + grid.padX + (c + 0.5) * grid.cellW;
        const y = board.y + grid.padY + (r + 0.55) * grid.cellH;
        jacks.push({ x, y });
      }
    }
  }

  function pushLog(s){
    callLog.unshift(s);
    if (callLog.length > 7) callLog.pop();
  }

  function phase(){ return PHASES[phaseIdx]; }

  function onPhaseEnter(prevId){
    const id = phase().id;
    // tiny UI click
    safeBeep({ freq: 380 + rand()*90, dur: 0.015, gain: 0.006, type: 'square' });

    // rush entry: small sweep + extra calls
    if (id === 'rush' && prevId !== 'rush'){
      flicker = Math.max(flicker, 0.65);
      for (let i=0;i<2;i++) spawnCall(true);
    }
  }

  function freeJack(ix){
    if (ix < 0 || ix >= jackBusy.length) return;
    jackBusy[ix] = -1;
  }

  function allocJack(){
    // find a free jack deterministically-ish
    const start = ((rand() * jackBusy.length) | 0);
    for (let k=0;k<jackBusy.length;k++){
      const ix = (start + k) % jackBusy.length;
      if (jackBusy[ix] === -1) return ix;
    }
    return -1;
  }

  function randNumber(){
    const a = 100 + ((rand() * 900) | 0);
    const b = 100 + ((rand() * 900) | 0);
    return `${a}-${b}`;
  }

  function spawnCall(force=false){
    // don't overfill; allow a small queue during rush
    const max = phase().id === 'rush' ? 10 : 7;
    if (!force && calls.length >= max) return;

    const a = allocJack();
    const b = allocJack();
    if (a === -1 || b === -1 || a === b){
      freeJack(a);
      freeJack(b);
      return;
    }

    const color = pick(rand, pal.cord);
    const from = randNumber();
    const to = randNumber();

    const ci = calls.length;
    jackBusy[a] = ci;
    jackBusy[b] = ci;

    const ringP = 0.55 + rand() * 0.22;
    calls.push({
      a, b,
      state: 'ringing',
      age: 0,
      ringP,
      ringAcc: 0,
      connDur: 7 + rand() * 10,
      fade: 0,
      color,
      from,
      to,
      mystery: 0,
    });

    pushLog(`IN  ${from}  →  ${to}`);
  }

  function connectCall(c){
    c.state = 'connected';
    c.age = 0;
    c.fade = 0;
    safeBeep({ freq: 210 + rand()*80, dur: 0.014, gain: 0.007, type: 'square' });
    if (rand() < 0.25) safeBeep({ freq: 980 + rand()*140, dur: 0.010, gain: 0.0038, type: 'triangle' });
  }

  function endCall(c){
    c.state = 'ending';
    c.age = 0;
    c.fade = 1;
    safeBeep({ freq: 160 + rand()*70, dur: 0.012, gain: 0.0045, type: 'sine' });
    pushLog(`OUT ${c.from}  ↔  ${c.to}`);
  }

  function spawnMystery(){
    // inject a short-lived glitch call + board flicker
    mystery = 1;
    flicker = Math.max(flicker, 0.85);

    const a = allocJack();
    const b = allocJack();
    if (a === -1 || b === -1 || a === b){
      freeJack(a);
      freeJack(b);
      return;
    }

    const ci = calls.length;
    jackBusy[a] = ci;
    jackBusy[b] = ci;

    const color = pal.glitch;
    const from = '???-???';
    const to = 'OPR-01';

    calls.push({
      a, b,
      state: 'ringing',
      age: 0,
      ringP: 0.33,
      ringAcc: 0,
      connDur: 3.5 + rand()*2.5,
      fade: 0,
      color,
      from,
      to,
      mystery: 1,
    });

    pushLog('IN  ???-???  →  OPR-01');

    if (audio.enabled){
      safeBeep({ freq: 420, dur: 0.04, gain: 0.010, type: 'sawtooth' });
      safeBeep({ freq: 780, dur: 0.03, gain: 0.007, type: 'triangle' });
    }
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 30));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    regen();
    onPhaseEnter('');
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    noise = audio.noiseSource({ type: 'pink', gain: 0.0028 });
    noise.start();

    drone = simpleDrone(audio, { root: 52 + rand()*20, detune: 1.2, gain: 0.010 });

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

  function update(dt){
    t += dt;
    phaseT += dt;

    mystery = Math.max(0, mystery - dt * 0.55);
    flicker = Math.max(0, flicker - dt * 1.5);

    // phase advance
    if (phaseT >= phase().dur){
      const prev = phase().id;
      phaseT = phaseT % phase().dur;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      onPhaseEnter(prev);
    }

    // call spawn rate by phase
    const p = phaseT / phase().dur;
    const id = phase().id;

    let rate = 0.32; // calls/sec
    if (id === 'after') rate = lerp(0.20, 0.32, ease(p));
    if (id === 'rush') rate = lerp(0.70, 1.05, 0.5 + 0.5*Math.sin(t*0.35));
    if (id === 'late') rate = lerp(0.36, 0.18, ease(p));

    spawnAcc += dt * rate;
    while (spawnAcc >= 1){
      spawnAcc -= 1;
      spawnCall(false);
    }

    // mystery call
    if (t >= nextMysteryAt){
      spawnMystery();
      nextMysteryAt = t + 14 + rand()*26;
    }

    // update calls
    for (let i=0;i<calls.length;i++){
      const c = calls[i];
      c.age += dt;

      if (c.state === 'ringing'){
        // ring for a bit, then connect
        const ringFor = c.mystery ? 1.3 : (1.8 + rand()*1.8);

        // audio ring ticks
        c.ringAcc += dt;
        if (audio.enabled && c.ringAcc >= c.ringP){
          c.ringAcc = c.ringAcc % c.ringP;
          const base = c.mystery ? 980 : 860;
          safeBeep({ freq: base + rand()*120, dur: c.mystery ? 0.030 : 0.018, gain: c.mystery ? 0.010 : 0.006, type: c.mystery ? 'triangle' : 'sine' });
          if (!c.mystery && rand() < 0.2) safeBeep({ freq: 1420 + rand()*220, dur: 0.010, gain: 0.003, type: 'square' });
        }

        if (c.age >= ringFor) connectCall(c);
      } else if (c.state === 'connected'){
        if (c.age >= c.connDur) endCall(c);
        // occasional click while connected
        if (audio.enabled && rand() < 0.01 * (id === 'rush' ? 2.0 : 1.0)){
          safeBeep({ freq: 240 + rand()*180, dur: 0.008, gain: 0.0026, type: 'square' });
        }
      } else {
        // ending
        c.fade = Math.max(0, c.fade - dt * 1.8);
        if (c.fade <= 0){
          freeJack(c.a);
          freeJack(c.b);
          c.dead = 1;
        }
      }
    }

    if (calls.length){
      // compact array occasionally
      if (rand() < 0.06){
        const alive = [];
        for (const c of calls) if (!c.dead) alive.push(c);
        calls = alive;
        // rebuild busy map indexes
        jackBusy.fill(-1);
        for (let i=0;i<calls.length;i++){
          const c = calls[i];
          jackBusy[c.a] = i;
          jackBusy[c.b] = i;
        }
      }
    }
  }

  function drawBackground(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(1, pal.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // subtle scanlines
    ctx.save();
    ctx.globalAlpha = 0.06 + flicker * 0.10;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    const step = Math.max(3, Math.floor(h / 140));
    const drift = (t * 24) % step;
    for (let y = -step; y < h + step; y += step){
      const yy = y + drift;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
      ctx.stroke();
    }
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.5, Math.min(w,h)*0.22, w*0.5, h*0.5, Math.max(w,h)*0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.70)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);
  }

  function drawHeader(ctx){
    const pad = Math.floor(Math.min(w,h) * 0.055);

    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(pad, pad, w - pad*2, Math.max(56, font*2.6));

    ctx.fillStyle = pal.ink;
    ctx.font = `800 ${font}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textBaseline = 'top';
    ctx.fillText('Telephone Switchboard Nights', pad + font, pad + Math.floor(font*0.48));

    ctx.fillStyle = pal.inkDim;
    ctx.font = `${small}px ui-sans-serif, system-ui, -apple-system`;
    ctx.fillText('patch cords • blinking calls • late-night routing', pad + font, pad + Math.floor(font*1.58));

    const ph = phase();
    const pill = ph.label;
    ctx.font = `700 ${Math.max(11, Math.floor(small*0.95))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tw = ctx.measureText(pill).width;
    const px = w - pad - tw - font*1.2;
    const py = pad + Math.floor(font*0.65);
    ctx.fillStyle = 'rgba(235,244,250,0.12)';
    roundedRect(ctx, px - 10, py - 6, tw + 20, Math.floor(small*1.7), 10);
    ctx.fill();
    ctx.fillStyle = pal.lamp;
    ctx.fillText(pill, px, py);

    const barY = pad + Math.max(56, font*2.6) - 10;
    const barX = pad + font;
    const barW = w - pad*2 - font*2;
    ctx.fillStyle = 'rgba(235,244,250,0.10)';
    ctx.fillRect(barX, barY, barW, 3);
    ctx.fillStyle = pal.lamp;
    ctx.fillRect(barX, barY, Math.floor(barW * clamp(phaseT / ph.dur, 0, 1)), 3);
  }

  function drawBoard(ctx){
    // shadow
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundedRect(ctx, board.x + 6, board.y + 10, board.w, board.h, board.r);
    ctx.fill();
    ctx.restore();

    // plate
    const plate = ctx.createLinearGradient(board.x, board.y, board.x, board.y + board.h);
    plate.addColorStop(0, pal.board0);
    plate.addColorStop(1, pal.board1);

    ctx.fillStyle = plate;
    roundedRect(ctx, board.x, board.y, board.w, board.h, board.r);
    ctx.fill();

    // trim
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = Math.max(2, Math.floor(h/360));
    roundedRect(ctx, board.x + 1, board.y + 1, board.w - 2, board.h - 2, board.r);
    ctx.stroke();

    // subtle grime/texture
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const lines = 8;
    for (let i=0;i<lines;i++){
      const yy = board.y + board.h*(0.12 + i*0.10) + Math.sin(t*0.25 + i)*2;
      ctx.beginPath();
      ctx.moveTo(board.x + board.w*0.04, yy);
      ctx.bezierCurveTo(board.x + board.w*0.35, yy-6, board.x + board.w*0.65, yy+6, board.x + board.w*0.96, yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function jackLampValue(ix){
    const cix = jackBusy[ix];
    if (cix === -1) {
      // gentle idle twinkle
      const base = 0.02 + 0.04 * (0.5 + 0.5*Math.sin(t*0.25 + ix*0.3));
      return base;
    }

    const c = calls[cix];
    if (!c) return 0.03;

    if (c.state === 'ringing'){
      const f = 2.2 + (phase().id === 'rush' ? 1.4 : 0);
      const blink = 0.2 + 0.8 * (0.5 + 0.5*Math.sin(t*f*2*Math.PI + ix));
      return 0.25 + 0.65 * blink;
    }

    if (c.state === 'connected'){
      const pulse = 0.35 + 0.65 * (0.5 + 0.5*Math.sin(t*1.2 + ix*0.11));
      return 0.35 + 0.35 * pulse;
    }

    // ending
    return 0.15 * c.fade;
  }

  function drawJacks(ctx){
    const jackR = Math.max(3, Math.floor(Math.min(w,h) * 0.006));
    const lampR = Math.max(3, Math.floor(jackR * 1.05));

    for (let ix=0;ix<jacks.length;ix++){
      const j = jacks[ix];

      // jack port
      ctx.fillStyle = pal.jack;
      ctx.beginPath();
      ctx.arc(j.x, j.y, jackR, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = pal.jackEdge;
      ctx.lineWidth = 1;
      ctx.stroke();

      // lamp above
      const lv = jackLampValue(ix);
      const lx = j.x;
      const ly = j.y - grid.cellH * 0.34;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, lampR * 3.2);
      g.addColorStop(0, `rgba(255, 242, 184, ${0.65 * lv})`);
      g.addColorStop(0.3, `rgba(255, 207, 107, ${0.45 * lv})`);
      g.addColorStop(1, 'rgba(255, 207, 107, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, lampR * 3.2, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = `rgba(255, 207, 107, ${0.10 + 0.70*lv})`;
      ctx.beginPath();
      ctx.arc(lx, ly, lampR, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function drawCord(ctx, c, amt){
    const a = jacks[c.a];
    const b = jacks[c.b];
    if (!a || !b) return;

    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;

    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const sag = (0.10 + 0.12*Math.sin(t*0.7 + len*0.02)) * (board.h * 0.22);
    const sway = Math.sin(t*0.45 + c.a*0.3) * (board.w * 0.018);

    const c1x = lerp(a.x, mx, 0.55) + sway;
    const c1y = lerp(a.y, my, 0.55) - sag;
    const c2x = lerp(b.x, mx, 0.55) + sway;
    const c2y = lerp(b.y, my, 0.55) - sag;

    const width = Math.max(2, Math.floor(h/360));

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.25 * amt;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = width + 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x + 1, a.y + 2);
    ctx.bezierCurveTo(c1x + 1, c1y + 2, c2x + 1, c2y + 2, b.x + 1, b.y + 2);
    ctx.stroke();
    ctx.restore();

    // cord
    ctx.save();
    ctx.globalAlpha = 0.82 * amt;
    ctx.strokeStyle = c.color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, b.x, b.y);
    ctx.stroke();

    // highlight
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.26 * amt;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, width - 1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawCords(ctx){
    for (const c of calls){
      if (c.state === 'ringing') continue;
      const amt = c.state === 'ending' ? c.fade : 1;
      drawCord(ctx, c, amt);
    }
  }

  function drawCallPanel(ctx){
    const pad = Math.floor(Math.min(w,h) * 0.055);
    const panelW = Math.floor(Math.min(w * 0.34, 420));
    const panelX = w - pad - panelW;
    const panelY = board.y + board.h + Math.floor(h*0.03);
    const panelH = Math.floor(h - panelY - pad);

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    roundedRect(ctx, panelX, panelY, panelW, panelH, 14);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = pal.ink;
    ctx.font = `700 ${Math.max(12, Math.floor(small*1.0))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('CALL LOG', panelX + 14, panelY + 12);

    const y0 = panelY + 40;
    const lineH = Math.max(16, Math.floor(mono * 1.25));

    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    for (let i=0;i<callLog.length;i++){
      const s = callLog[i];
      const y = y0 + i * lineH;
      const a = 0.75 - i * 0.08;
      ctx.fillStyle = `rgba(235,244,250,${clamp(a, 0.25, 0.75)})`;
      ctx.fillText(s, panelX + 14, y);
    }

    // current counts
    const ringing = calls.filter(c=>c.state==='ringing').length;
    const live = calls.filter(c=>c.state==='connected').length;

    const stats = `RING ${String(ringing).padStart(2,'0')}   LIVE ${String(live).padStart(2,'0')}`;
    ctx.fillStyle = 'rgba(235,244,250,0.65)';
    ctx.fillText(stats, panelX + 14, panelY + panelH - lineH - 10);

    if (mystery > 0.02){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.18 * mystery;
      ctx.fillStyle = pal.glitch;
      ctx.fillRect(panelX, panelY, panelW, panelH);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.75 * mystery;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(panelX, panelY, panelW, 28);
      ctx.fillStyle = pal.glitch;
      ctx.font = `800 ${Math.max(12, Math.floor(small*0.95))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText('MYSTERY CALL', panelX + 14, panelY + 6);
      ctx.restore();
    }
  }

  function render(ctx){
    drawBackground(ctx);
    drawHeader(ctx);

    drawBoard(ctx);
    drawCords(ctx);
    drawJacks(ctx);

    drawCallPanel(ctx);

    if (flicker > 0.02){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.12 * flicker;
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    if (mystery > 0.02){
      // occasional jittery ghost frame
      const jx = (rand() - 0.5) * 6 * mystery;
      const jy = (rand() - 0.5) * 4 * mystery;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.10 * mystery;
      ctx.translate(jx, jy);
      ctx.fillStyle = pal.glitch;
      ctx.fillRect(0, 0, w, h);
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
