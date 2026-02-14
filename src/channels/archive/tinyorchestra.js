import { mulberry32, clamp } from '../util/prng.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function midiFreq(n){
  return 440 * Math.pow(2, (n - 69) / 12);
}

function pick(rand, a){
  return a[(rand() * a.length) | 0];
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  const ORCH = {
    title: 'TINY ORCHESTRA WORKSHOP',
    subtitle: 'build-a-band • simple notation • moving parts (audio optional)',
    palette: { a: '#6cf2ff', b: '#ffd36b', c: '#ff5aa5' },
  };

  // timing
  let bpm = 94 + ((rand() * 18) | 0);
  let stepLen = 60 / bpm / 4; // 16th notes

  let w = 0, h = 0, t = 0;
  let font = 16;
  let small = 12;

  // transport
  let step = 0;
  let stepTo = 0;
  let bar = 0;       // 0..INSTR.length-1
  let stage = 1;     // number of active instruments

  // harmony
  let keyMidi = 48; // C-ish
  const SCALE = [0, 2, 3, 5, 7, 10]; // minor pent

  // audio bed
  let ambience = null;

  // instruments are rebuilt per loop so the visuals feel "workshoppy"
  let INSTR = [];

  function genDrum(){
    // lanes: kick, snare, hat (1=hit)
    const kick = new Array(16).fill(0);
    const sn = new Array(16).fill(0);
    const hat = new Array(16).fill(0);

    // basics
    kick[0] = 1; kick[8] = 1;
    sn[4] = 1; sn[12] = 1;
    for (let i = 0; i < 16; i += 2) hat[i] = 1;

    // deterministic little fills
    for (let i = 0; i < 3; i++){
      const s = (2 + ((rand() * 12) | 0)) & 15;
      if (rand() < 0.35) kick[s] = 1;
      if (rand() < 0.22) sn[s] = 1;
      if (rand() < 0.25) hat[(s + 1) & 15] = 0;
    }

    return {
      id: 'drums',
      name: 'DRUMS',
      kind: 'drums',
      color: ORCH.palette.a,
      lanes: [kick, sn, hat],
      pulses: [0, 0, 0],
    };
  }

  function genPitched({ id, name, kind, color, density=0.35, octave=0, bias=0 }){
    // notes: -1 = rest, otherwise midi note
    const notes = new Array(16).fill(-1);
    const hits = 5 + ((rand() * 5) | 0);

    for (let i = 0; i < hits; i++){
      if (rand() > density) continue;
      const s = ((rand() * 16) | 0) & 15;
      const deg = pick(rand, SCALE);
      const n = keyMidi + deg + 12 * octave + (rand() < 0.18 ? 12 : 0) + bias;
      notes[s] = n;
    }

    // ensure something happens
    if (notes.every((x) => x === -1)){
      notes[0] = keyMidi + pick(rand, SCALE) + 12 * octave;
      notes[8] = keyMidi + pick(rand, SCALE) + 12 * octave;
    }

    // lightly quantize to a rhythmic identity
    if (kind === 'bass'){
      for (let s = 0; s < 16; s++){
        if (s % 4 !== 0 && rand() < 0.45) notes[s] = -1;
      }
    }

    return {
      id,
      name,
      kind,
      color,
      notes,
      pulse: 0,
    };
  }

  function genPatterns(){
    bpm = 92 + ((rand() * 20) | 0);
    stepLen = 60 / bpm / 4;

    keyMidi = 45 + ((rand() * 12) | 0); // A2..G#3 range

    INSTR = [
      genDrum(),
      genPitched({ id: 'bass', name: 'BASS', kind: 'bass', color: ORCH.palette.b, density: 0.9, octave: -1 }),
      genPitched({ id: 'strings', name: 'STRINGS', kind: 'strings', color: 'rgba(231,238,246,0.85)', density: 0.55, octave: 0 }),
      genPitched({ id: 'lead', name: 'LEAD', kind: 'lead', color: ORCH.palette.c, density: 0.4, octave: 1, bias: (rand() < 0.4 ? 0 : 2) }),
      genPitched({ id: 'bells', name: 'BELLS', kind: 'bells', color: '#b2a4ff', density: 0.45, octave: 1 }),
    ];
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    step = 0;
    stepTo = 0;
    bar = 0;
    stage = 1;

    genPatterns();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type: 'pink', gain: 0.0012 });
    n.start();
    ambience = { stop(){ n.stop(); } };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){
    onAudioOff();
  }

  function drumSound(lane){
    if (!audio.enabled) return;
    if (lane === 0) audio.beep({ freq: 92 + rand() * 14, dur: 0.035, gain: 0.03, type: 'sine' });
    else if (lane === 1) audio.beep({ freq: 200 + rand() * 30, dur: 0.02, gain: 0.02, type: 'square' });
    else audio.beep({ freq: 2100 + rand() * 200, dur: 0.008, gain: 0.012, type: 'triangle' });
  }

  function noteSound(m){
    if (!audio.enabled) return;
    const f = midiFreq(m);
    audio.beep({ freq: f, dur: 0.05 + rand() * 0.03, gain: 0.012, type: 'sine' });
  }

  function chordSound(root){
    if (!audio.enabled) return;
    const tri = [0, 3, 7];
    for (let i = 0; i < tri.length; i++){
      audio.beep({ freq: midiFreq(root + tri[i]), dur: 0.06, gain: 0.007, type: 'triangle' });
    }
  }

  function advanceStep(){
    step = (step + 1) & 15;

    // stage mechanics: each bar adds one instrument, then we rebuild the workshop.
    if (step === 0){
      bar++;
      if (bar >= INSTR.length){
        bar = 0;
        stage = 1;
        genPatterns();
      } else {
        stage = clamp(bar + 1, 1, INSTR.length);
      }
    }

    // trigger events
    for (let i = 0; i < stage; i++){
      const inst = INSTR[i];
      if (inst.kind === 'drums'){
        for (let lane = 0; lane < 3; lane++){
          if (inst.lanes[lane][step]){
            inst.pulses[lane] = 1;
            drumSound(lane);
          }
        }
      } else {
        const m = inst.notes[step];
        if (m !== -1){
          inst.pulse = 1;
          if (inst.kind === 'strings') chordSound(m);
          else noteSound(m);
        }
      }
    }
  }

  function update(dt){
    t += dt;

    // decay pulses
    for (const inst of INSTR){
      if (inst.kind === 'drums'){
        for (let i = 0; i < inst.pulses.length; i++) inst.pulses[i] *= Math.pow(0.001, dt);
      } else {
        inst.pulse *= Math.pow(0.001, dt);
      }
    }

    stepTo -= dt;
    while (stepTo <= 0){
      stepTo += stepLen;
      advanceStep();
    }
  }

  function progressInStep(){
    return 1 - clamp(stepTo / stepLen, 0, 1);
  }

  function drawBackground(ctx){
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#070b14');
    bg.addColorStop(0.55, '#0b1220');
    bg.addColorStop(1, '#04060d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // workshop grid
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = 'rgba(231,238,246,0.8)';
    ctx.lineWidth = 1;
    const g = Math.max(18, Math.floor(Math.min(w, h) / 28));
    for (let x = 0; x < w; x += g){
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += g){
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    }
    ctx.restore();

    // vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.44, 0, w * 0.5, h * 0.44, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(255,255,255,0.05)');
    vg.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawHeader(ctx){
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, Math.floor(h * 0.06), w, Math.floor(h * 0.11));
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = ORCH.palette.a;
    ctx.fillRect(0, Math.floor(h * 0.17), w, 2);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText(ORCH.title, Math.floor(w * 0.05), Math.floor(h * 0.105));

    ctx.globalAlpha = 0.78;
    ctx.font = `${Math.floor(font * 0.86)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.fillText(ORCH.subtitle, Math.floor(w * 0.05), Math.floor(h * 0.145));

    // status on right
    const s = `BPM ${bpm} • STAGE ${stage}/${INSTR.length}`;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = ORCH.palette.b;
    ctx.font = `${Math.floor(font * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tw = ctx.measureText(s).width;
    ctx.fillText(s, Math.floor(w * 0.95 - tw), Math.floor(h * 0.105));

    ctx.restore();
  }

  function drawConductor(ctx){
    const cx = Math.floor(w * 0.5);
    const cy = Math.floor(h * 0.42);
    const r = Math.max(34, Math.floor(Math.min(w, h) * 0.06));

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = ORCH.palette.c;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2);
    ctx.fill();

    // baton
    const a = Math.sin(t * 1.2) * 0.55;
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = 'rgba(231,238,246,0.85)';
    roundRect(ctx, -r * 1.1, -4, r * 2.2, 8, 5);
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = ORCH.palette.a;
    roundRect(ctx, r * 0.5, -3, r * 0.55, 6, 4);
    ctx.fill();

    // little timing dot
    const p = progressInStep();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = ORCH.palette.b;
    ctx.beginPath();
    ctx.arc(r * 0.95, -10 + p * 20, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawGrid(ctx, x, y, gw, gh, cells, hitMask=null, color='rgba(231,238,246,0.8)'){
    const cellW = gw / 16;
    const p = progressInStep();
    const playPos = step + p;

    // background
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    roundRect(ctx, x, y, gw, gh, 10);
    ctx.fill();

    // grid
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(231,238,246,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 16; i++){
      const xx = x + i * cellW;
      ctx.beginPath();
      ctx.moveTo(xx + 0.5, y + 1);
      ctx.lineTo(xx + 0.5, y + gh - 1);
      ctx.stroke();
    }

    // steps
    for (let i = 0; i < 16; i++){
      const on = !!cells[i];
      if (!on) continue;
      const xx = x + i * cellW;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = color;
      ctx.fillRect(xx + 2, y + 2, cellW - 4, gh - 4);
    }

    // playhead
    const ph = x + ((playPos % 16) / 16) * gw;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = ORCH.palette.a;
    ctx.fillRect(ph - 1, y, 2, gh);

    // highlight current step cell
    const cs = step;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = ORCH.palette.b;
    ctx.fillRect(x + cs * cellW, y, cellW, gh);

    // optional hit mask pulse overlay
    if (hitMask){
      for (let i = 0; i < 16; i++){
        const m = hitMask[i];
        if (!m) continue;
        const xx = x + i * cellW;
        ctx.globalAlpha = 0.35 * m;
        ctx.fillStyle = ORCH.palette.c;
        ctx.fillRect(xx + 2, y + 2, cellW - 4, gh - 4);
      }
    }

    ctx.restore();
  }

  function drawModule(ctx, inst, idx, box){
    const { x, y, w: bw, h: bh } = box;
    const active = idx < stage;
    const p = active ? 1 : 0;

    ctx.save();

    // panel
    ctx.globalAlpha = 0.55 + 0.25 * p;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, x + 10, y + 12, bw, bh, 18);
    ctx.fill();

    ctx.globalAlpha = 0.85 * (0.55 + 0.45 * p);
    ctx.fillStyle = 'rgba(16, 22, 30, 0.92)';
    roundRect(ctx, x, y, bw, bh, 18);
    ctx.fill();

    ctx.globalAlpha = 0.4 + 0.5 * p;
    ctx.strokeStyle = inst.color;
    ctx.lineWidth = Math.max(1, Math.floor(font * 0.1));
    roundRect(ctx, x, y, bw, bh, 18);
    ctx.stroke();

    // label
    ctx.globalAlpha = 0.92 * (0.55 + 0.45 * p);
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.font = `${Math.floor(small * 1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(inst.name, x + 16, y + 12);

    // mechanical widget (left)
    const wx = x + 16;
    const wy = y + Math.floor(bh * 0.48);
    const wr = Math.floor(bh * 0.26);

    const wob = Math.sin(t * 0.8 + idx * 1.7) * 0.6;

    if (inst.kind === 'drums'){
      const k = inst.pulses[0];
      const s = inst.pulses[1];
      const hh = inst.pulses[2];

      const drawPad = (dx, pulse, c) => {
        ctx.save();
        ctx.translate(wx + dx, wy);
        const r = wr * (0.88 + 0.22 * pulse);
        ctx.globalAlpha = 0.22 + 0.55 * p;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.arc(5, 7, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.35 + 0.5 * p;
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = 'rgba(231,238,246,0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      };

      drawPad(0, k, ORCH.palette.b);
      drawPad(wr * 1.55, s, ORCH.palette.c);
      drawPad(wr * 3.1, hh, ORCH.palette.a);
    } else {
      ctx.save();
      ctx.translate(wx + wr * 1.6, wy);
      ctx.rotate(wob * 0.22);
      ctx.globalAlpha = 0.25 + 0.45 * p;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(5, 7, wr * 1.05, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.25 + 0.55 * p;
      ctx.strokeStyle = inst.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, wr, 0, Math.PI * 2);
      ctx.stroke();

      // gear-ish spokes
      ctx.globalAlpha = 0.28 + 0.5 * p;
      ctx.strokeStyle = 'rgba(231,238,246,0.55)';
      ctx.lineWidth = 2;
      const spokes = 8;
      for (let i = 0; i < spokes; i++){
        const a = (i / spokes) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * wr * 0.35, Math.sin(a) * wr * 0.35);
        ctx.lineTo(Math.cos(a) * wr * 0.95, Math.sin(a) * wr * 0.95);
        ctx.stroke();
      }

      // pulse core
      const pulse = inst.pulse || 0;
      ctx.globalAlpha = (0.15 + 0.55 * pulse) * (0.4 + 0.6 * p);
      ctx.fillStyle = ORCH.palette.b;
      ctx.beginPath();
      ctx.arc(0, 0, wr * (0.22 + 0.12 * pulse), 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // grid (right)
    const gx = x + Math.floor(bw * 0.44);
    const gy = y + 12;
    const gw = Math.floor(bw * 0.52);
    const gh = Math.floor(bh - 24);

    if (inst.kind === 'drums'){
      const laneH = gh / 3;
      const labels = ['K', 'S', 'H'];
      for (let lane = 0; lane < 3; lane++){
        const ly = gy + lane * laneH;
        drawGrid(ctx, gx, ly, gw, laneH, inst.lanes[lane], null, inst.color);
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = 'rgba(231,238,246,0.75)';
        ctx.font = `${Math.floor(small * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[lane], gx - 18, ly + laneH * 0.5);
        ctx.restore();
      }
    } else {
      const cells = inst.notes.map((n) => (n === -1 ? 0 : 1));
      drawGrid(ctx, gx, gy, gw, gh, cells, null, inst.color);

      // little "pitch" text for current step
      const m = inst.notes[step];
      if (m !== -1){
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = inst.color;
        ctx.font = `${Math.floor(small * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(`midi:${m}`, gx, gy - 4);
        ctx.restore();
      }
    }

    // staged install highlight
    if (idx === stage - 1){
      const q = ease(progressInStep());
      ctx.globalAlpha = 0.22 * (0.5 + 0.5 * Math.sin(q * Math.PI));
      ctx.fillStyle = ORCH.palette.c;
      roundRect(ctx, x + 6, y + 6, bw - 12, bh - 12, 16);
      ctx.fill();
    }

    // inactive veil
    if (!active){
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(0,0,0,0.52)';
      roundRect(ctx, x, y, bw, bh, 18);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawNotation(ctx){
    // simple staff showing the LEAD line (if present), sliding like a tape.
    const lead = INSTR.find((i) => i.kind === 'lead');
    if (!lead) return;

    const x0 = Math.floor(w * 0.08);
    const x1 = Math.floor(w * 0.92);
    const y0 = Math.floor(h * 0.23);
    const band = Math.floor(h * 0.13);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(231,238,246,0.8)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++){
      const y = y0 + i * Math.floor(band / 4);
      ctx.beginPath();
      ctx.moveTo(x0, y + 0.5);
      ctx.lineTo(x1, y + 0.5);
      ctx.stroke();
    }

    // notes
    const p = progressInStep();
    const pos = step + p;

    function yForMidi(m){
      // map midi around key to staff
      const d = (m - (keyMidi + 12)) / 12; // roughly -1..+1
      return y0 + band * (0.55 - d * 0.35);
    }

    for (let s = 0; s < 16; s++){
      const m = lead.notes[s];
      if (m === -1) continue;
      const dx = ((s - pos + 16) % 16) / 16;
      const xx = lerp(x0, x1, dx);
      const yy = yForMidi(m);
      const alpha = 0.18 + 0.55 * (1 - dx);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ORCH.palette.c;
      ctx.beginPath();
      ctx.ellipse(xx, yy, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // stem
      ctx.globalAlpha = alpha * 0.75;
      ctx.strokeStyle = 'rgba(231,238,246,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xx + 7, yy);
      ctx.lineTo(xx + 7, yy - 18);
      ctx.stroke();
    }

    // playhead caret
    const ph = lerp(x0, x1, 0);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ORCH.palette.a;
    ctx.fillRect(ph - 1, y0 - 10, 2, band + 20);

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    drawHeader(ctx);
    drawNotation(ctx);
    drawConductor(ctx);

    // modules stack
    const pad = Math.floor(w * 0.05);
    const top = Math.floor(h * 0.54);
    const availH = Math.floor(h * 0.40);
    const gap = Math.max(10, Math.floor(h * 0.012));

    const per = Math.floor((availH - gap * (INSTR.length - 1)) / INSTR.length);
    const bw = Math.floor(w - pad * 2);

    for (let i = 0; i < INSTR.length; i++){
      const y = top + i * (per + gap);
      drawModule(ctx, INSTR[i], i, { x: pad, y, w: bw, h: per });
    }

    // footer hint
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, Math.floor(h * 0.92), w, Math.floor(h * 0.08));
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(231,238,246,0.7)';
    ctx.font = `${Math.floor(h / 42)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('each bar adds an instrument • the workshop rebuilds after the full band', Math.floor(w * 0.05), Math.floor(h * 0.96));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
