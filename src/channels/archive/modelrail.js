import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

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

function dist(ax, ay, bx, by){
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx*dx + dy*dy);
}

function buildEdge(points){
  const cum = [0];
  let len = 0;
  for (let i = 1; i < points.length; i++){
    len += dist(points[i-1][0], points[i-1][1], points[i][0], points[i][1]);
    cum.push(len);
  }
  return { points, cum, len: Math.max(0.0001, len) };
}

function pointAt(edge, s, out){
  const pts = edge.points;
  const cum = edge.cum;
  const len = edge.len;
  let d = s;
  if (d <= 0){ out[0] = pts[0][0]; out[1] = pts[0][1]; return out; }
  if (d >= len){
    const p = pts[pts.length - 1];
    out[0] = p[0]; out[1] = p[1];
    return out;
  }

  let si = 0;
  // small list; linear scan is fine.
  for (let i = 1; i < cum.length; i++){
    if (d <= cum[i]){ si = i - 1; break; }
  }

  const d0 = cum[si];
  const d1 = cum[si + 1];
  const tt = (d - d0) / Math.max(0.0001, d1 - d0);

  const a = pts[si];
  const b = pts[si + 1];
  out[0] = a[0] + (b[0] - a[0]) * tt;
  out[1] = a[1] + (b[1] - a[1]) * tt;
  return out;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  // Visual identity: dim control-room panel + luminous track diagram.
  const hue = 165 + rand() * 35;
  const bgA = `hsl(${(hue + 210) % 360}, 32%, 10%)`;
  const bgB = `hsl(${(hue + 235) % 360}, 28%, 7%)`;
  const panelA = `hsla(${(hue + 20) % 360}, 30%, 16%, 0.95)`;
  const panelB = `hsla(${(hue + 30) % 360}, 28%, 12%, 0.95)`;
  const ink = `hsla(${hue}, 60%, 75%, 0.9)`;
  const inkDim = `hsla(${hue}, 50%, 72%, 0.45)`;
  const rail = `hsla(${hue}, 70%, 70%, 0.60)`;
  const railGlow = `hsla(${hue}, 80%, 66%, 0.15)`;
  const warn = `hsla(${(hue + 320) % 360}, 90%, 62%, 0.95)`;
  const ok = `hsla(${(hue + 10) % 360}, 90%, 62%, 0.95)`;
  const caution = `hsla(${(hue + 60) % 360}, 92%, 58%, 0.95)`;

  let font = 16;
  let mono = 14;

  // Track graph in normalized coordinates.
  // Nodes: A (TL), B (TR), C (BR), D (BL), Y (yard), S (shed)
  const N = {
    A: [0.24, 0.30],
    B: [0.76, 0.30],
    C: [0.76, 0.72],
    D: [0.24, 0.72],
    Y: [0.50, 0.16],
    S: [0.88, 0.52],
  };

  // Directed edges (clockwise loop, plus two sidings).
  // Index map is kept stable for occupancy/signals.
  const EDGES = [
    { id: 'AB', from: 'A', to: 'B', edge: buildEdge([N.A, [0.50, 0.27], N.B]) },
    { id: 'BC', from: 'B', to: 'C', edge: buildEdge([N.B, [0.79, 0.51], N.C]) },
    { id: 'CD', from: 'C', to: 'D', edge: buildEdge([N.C, [0.50, 0.75], N.D]) },
    { id: 'DA', from: 'D', to: 'A', edge: buildEdge([N.D, [0.21, 0.51], N.A]) },

    { id: 'AY', from: 'A', to: 'Y', edge: buildEdge([N.A, [0.33, 0.20], N.Y]) },
    { id: 'YA', from: 'Y', to: 'A', edge: buildEdge([N.Y, [0.44, 0.20], N.A]) },

    { id: 'BS', from: 'B', to: 'S', edge: buildEdge([N.B, [0.83, 0.34], N.S]) },
    { id: 'SB', from: 'S', to: 'B', edge: buildEdge([N.S, [0.83, 0.44], N.B]) },
  ];

  const edgeIndexById = {};
  for (let i = 0; i < EDGES.length; i++) edgeIndexById[EDGES[i].id] = i;

  // Turnouts: A chooses AB vs AY. B chooses BC vs BS.
  let turnoutA = rand() < 0.65 ? 0 : 1;
  let turnoutB = rand() < 0.60 ? 0 : 1;

  let nextToggleAAt = 0;
  let nextToggleBAt = 0;

  const PHASES = [
    { id: 'rush', name: 'AM RUSH', dur: 80 },
    { id: 'yard', name: 'YARD WORK', dur: 90 },
    { id: 'night', name: 'NIGHT RUN', dur: 90 },
  ];
  let phaseIdx = 0;
  let phaseT = 0;

  let clearWave = 0; // 0..1
  let clearWaveT = 0;
  let nextClearAt = 8 + rand() * 10;

  let emergency = 0; // 0..1
  let emergencyT = 0;
  let nextEmergencyAt = 16 + rand() * 26;

  // State arrays (no per-frame allocations).
  const occ = new Array(EDGES.length).fill(0);
  const sig = new Array(EDGES.length).fill(0); // 0=red,1=yellow,2=green
  const sigVis = new Array(EDGES.length).fill(0); // intensity for glow

  // Track a previous signal state so we can click on red->green.
  const prevSig = new Array(EDGES.length).fill(0);

  const tmpP = [0, 0];
  const tmpQ = [0, 0];

  function phase(){ return PHASES[phaseIdx]; }

  function safeBeep(opts){
    try { audio.beep(opts); } catch {}
  }

  function scheduleToggleTimes(){
    // Call whenever we enter a new phase.
    const id = phase().id;
    if (id === 'rush'){
      nextToggleAAt = t + 6 + rand() * 10;
      nextToggleBAt = t + 7 + rand() * 12;
    } else if (id === 'yard'){
      nextToggleAAt = t + 2.5 + rand() * 5.5;
      nextToggleBAt = t + 2.0 + rand() * 5.0;
    } else {
      nextToggleAAt = t + 10 + rand() * 18;
      nextToggleBAt = t + 10 + rand() * 18;
    }
  }

  function setTurnout(which, v){
    if (which === 'A'){
      if (turnoutA === v) return;
      turnoutA = v;
    } else {
      if (turnoutB === v) return;
      turnoutB = v;
    }

    // Relay click.
    if (audio.enabled){
      safeBeep({ freq: 240 + rand() * 120, dur: 0.012, gain: 0.0036, type: 'square' });
      if (rand() < 0.28) safeBeep({ freq: 520 + rand() * 160, dur: 0.010, gain: 0.0022, type: 'triangle' });
    }
  }

  function edgeIdxForNodeExit(node){
    if (node === 'A') return turnoutA ? edgeIndexById.AY : edgeIndexById.AB;
    if (node === 'B') return turnoutB ? edgeIndexById.BS : edgeIndexById.BC;
    if (node === 'C') return edgeIndexById.CD;
    if (node === 'D') return edgeIndexById.DA;
    if (node === 'Y') return edgeIndexById.YA;
    if (node === 'S') return edgeIndexById.SB;
    return 0;
  }

  function nextEdgeFor(edgeIdx){
    const to = EDGES[edgeIdx].to;
    return edgeIdxForNodeExit(to);
  }

  function makeTrain(i){
    // Each train has its own hue offset + a small “dispatcher tag”.
    const base = rand() * 360;
    const col = `hsla(${(base + i * 45) % 360}, 90%, 65%, 0.98)`;
    return {
      edgeIdx: i === 0 ? edgeIndexById.DA : edgeIndexById.BC,
      s: (0.2 + rand() * 0.6) * EDGES[i === 0 ? edgeIndexById.DA : edgeIndexById.BC].edge.len,
      speed: 0.14 + rand() * 0.08, // normalized units per second (scaled by edge length)
      col,
      glow: 0,
      tag: i === 0 ? 'LN-3' : 'SH-8',
    };
  }

  const trains = [makeTrain(0), makeTrain(1)];

  function resetSignals(){
    for (let i = 0; i < sig.length; i++){
      sig[i] = 0;
      prevSig[i] = 0;
      sigVis[i] = 0;
    }
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 28));
    mono = Math.max(11, Math.floor(font * 0.82));

    t = 0;
    phaseIdx = 0;
    phaseT = 0;

    clearWave = 0;
    clearWaveT = 0;
    nextClearAt = 8 + rand() * 10;

    emergency = 0;
    emergencyT = 0;
    nextEmergencyAt = 16 + rand() * 26;

    turnoutA = rand() < 0.70 ? 0 : 1;
    turnoutB = rand() < 0.62 ? 0 : 1;
    scheduleToggleTimes();

    trains[0].edgeIdx = edgeIndexById.DA;
    trains[0].s = (0.25 + rand() * 0.5) * EDGES[edgeIndexById.DA].edge.len;
    trains[0].speed = 0.14 + rand() * 0.07;
    trains[0].glow = 0;

    trains[1].edgeIdx = edgeIndexById.BC;
    trains[1].s = (0.10 + rand() * 0.7) * EDGES[edgeIndexById.BC].edge.len;
    trains[1].speed = 0.12 + rand() * 0.07;
    trains[1].glow = 0;

    resetSignals();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  let ambience = null;
  let noise = null;
  let drone = null;

  function onAudioOn(){
    if (!audio.enabled) return;

    // Control-room hum: low drone + faint brown noise.
    noise = audio.noiseSource({ type: 'brown', gain: 0.0022 });
    noise.start();

    drone = simpleDrone(audio, { root: 46 + rand() * 18, detune: 1.1, gain: 0.010 });

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

  function updateTurnouts(){
    const id = phase().id;

    if (t >= nextToggleAAt){
      if (id === 'rush'){
        // Mostly mainline. Occasionally route to yard briefly.
        const toYard = rand() < 0.18;
        setTurnout('A', toYard ? 1 : 0);
        nextToggleAAt = t + (toYard ? (1.6 + rand() * 2.4) : (6 + rand() * 10));
      } else if (id === 'yard'){
        // Lots of shunting.
        setTurnout('A', rand() < 0.55 ? 1 : 0);
        nextToggleAAt = t + 2.5 + rand() * 5.5;
      } else {
        // Night: keep it calm.
        setTurnout('A', rand() < 0.15 ? 1 : 0);
        nextToggleAAt = t + 10 + rand() * 18;
      }
    }

    if (t >= nextToggleBAt){
      if (id === 'rush'){
        const toShed = rand() < 0.16;
        setTurnout('B', toShed ? 1 : 0);
        nextToggleBAt = t + (toShed ? (1.8 + rand() * 2.6) : (7 + rand() * 12));
      } else if (id === 'yard'){
        setTurnout('B', rand() < 0.52 ? 1 : 0);
        nextToggleBAt = t + 2.0 + rand() * 5.0;
      } else {
        setTurnout('B', rand() < 0.12 ? 1 : 0);
        nextToggleBAt = t + 10 + rand() * 18;
      }
    }
  }

  function triggerClearWave(){
    clearWave = 1;
    clearWaveT = 0;

    // Tiny “all clear” bell.
    if (audio.enabled){
      safeBeep({ freq: 660 + rand() * 120, dur: 0.030, gain: 0.007, type: 'triangle' });
      safeBeep({ freq: 990 + rand() * 180, dur: 0.020, gain: 0.004, type: 'sine' });
    }
  }

  function triggerEmergency(){
    emergency = 1;
    emergencyT = 0;

    if (audio.enabled){
      safeBeep({ freq: 160 + rand() * 40, dur: 0.10, gain: 0.010, type: 'sawtooth' });
      safeBeep({ freq: 120 + rand() * 30, dur: 0.12, gain: 0.010, type: 'square' });
    }
  }

  function updateSignals(){
    // occupancy
    for (let i = 0; i < occ.length; i++) occ[i] = 0;
    for (let i = 0; i < trains.length; i++) occ[trains[i].edgeIdx] = 1;

    for (let i = 0; i < EDGES.length; i++){
      const next = nextEdgeFor(i);
      const mine = occ[i];
      const ahead = occ[next];

      let s = 2;
      if (mine) s = 0;
      else if (ahead) s = 1;

      // clear-wave override (a pleasing green cascade)
      if (clearWave > 0){
        const order = i; // stable order, includes sidings.
        const tt = clamp((clearWaveT - order * 0.14) * 2.1, 0, 1);
        const pulse = Math.sin(tt * Math.PI);
        if (pulse > 0.02) s = 2;
        sigVis[i] = Math.max(sigVis[i], pulse);
      }

      sig[i] = s;

      // Click on red->green.
      if (!mine && prevSig[i] === 0 && s === 2){
        if (audio.enabled && rand() < 0.22){
          safeBeep({ freq: 320 + rand() * 200, dur: 0.010, gain: 0.0028, type: 'square' });
        }
      }
      prevSig[i] = s;

      // fade glow
      const target = s === 2 ? 1 : (s === 1 ? 0.55 : 0.15);
      sigVis[i] = lerp(sigVis[i], target, 0.08);
    }
  }

  function updateTrains(dt){
    const id = phase().id;

    // Speed profile by phase.
    let base = 1;
    if (id === 'rush') base = 1.25;
    else if (id === 'yard') base = 0.92;
    else base = 0.82;

    // Emergency forces a smooth stop.
    const em = emergency > 0 ? (1 - ease(clamp(emergencyT / 2.2, 0, 1))) : 1;

    for (let i = 0; i < trains.length; i++){
      const tr = trains[i];
      const e = EDGES[tr.edgeIdx].edge;

      // In night, park one train in the yard occasionally.
      let park = 0;
      if (id === 'night' && i === 1){
        park = turnoutA && (tr.edgeIdx === edgeIndexById.AY || tr.edgeIdx === edgeIndexById.YA) ? 1 : 0;
      }

      const spd = tr.speed * base * (park ? 0.35 : 1.0) * em;

      // Convert normalized speed to edge-space distance.
      tr.s += dt * spd * e.len;

      while (tr.s >= e.len){
        tr.s -= e.len;

        // Switch to next edge.
        const nxt = nextEdgeFor(tr.edgeIdx);
        tr.edgeIdx = nxt;

        // When a train enters a block, bump its glow.
        tr.glow = 1;

        // Soft horn/beep at junctions.
        if (audio.enabled && rand() < 0.06){
          safeBeep({ freq: 740 + rand() * 120, dur: 0.018, gain: 0.0028, type: 'triangle' });
        }
      }

      tr.glow = Math.max(0, tr.glow - dt * 0.9);
    }
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    // phase advance
    if (phaseT >= phase().dur){
      phaseT = phaseT % phase().dur;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      scheduleToggleTimes();

      // A phase change often comes with a “dispatcher decision”.
      if (phase().id === 'night'){
        setTurnout('A', 1);
        setTurnout('B', 0);
      }
    }

    updateTurnouts();

    // special moments
    if (t >= nextClearAt){
      triggerClearWave();
      nextClearAt = t + 16 + rand() * 22;
    }

    if (t >= nextEmergencyAt){
      triggerEmergency();
      nextEmergencyAt = t + 28 + rand() * 40;
    }

    if (clearWave > 0){
      clearWaveT += dt;
      clearWave = Math.max(0, 1 - clearWaveT / 2.2);
    }

    if (emergency > 0){
      emergencyT += dt;
      emergency = Math.max(0, 1 - emergencyT / 3.2);
    }

    updateTrains(dt);
    updateSignals();
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, bgA);
    g.addColorStop(1, bgB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle scanlines
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const step = Math.max(2, Math.floor(3 * dpr));
    for (let y = 0; y < h; y += step){
      ctx.fillRect(0, y, w, 1);
    }
    ctx.globalAlpha = 1;

    // vignette
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, h);
  }

  function xy(nx, ny, out){
    out[0] = nx * w;
    out[1] = ny * h;
    return out;
  }

  function drawTrack(ctx){
    ctx.save();

    // soft glow under the rails
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = railGlow;
    ctx.lineWidth = Math.max(10, Math.min(w, h) * 0.018);

    for (let i = 0; i < EDGES.length; i++){
      const pts = EDGES[i].edge.points;
      ctx.beginPath();
      xy(pts[0][0], pts[0][1], tmpP);
      ctx.moveTo(tmpP[0], tmpP[1]);
      for (let j = 1; j < pts.length; j++){
        xy(pts[j][0], pts[j][1], tmpQ);
        ctx.lineTo(tmpQ[0], tmpQ[1]);
      }
      ctx.stroke();
    }

    // main rail line
    ctx.strokeStyle = rail;
    ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.006);

    for (let i = 0; i < EDGES.length; i++){
      const pts = EDGES[i].edge.points;
      ctx.beginPath();
      xy(pts[0][0], pts[0][1], tmpP);
      ctx.moveTo(tmpP[0], tmpP[1]);
      for (let j = 1; j < pts.length; j++){
        xy(pts[j][0], pts[j][1], tmpQ);
        ctx.lineTo(tmpQ[0], tmpQ[1]);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawSignals(ctx){
    const r = Math.max(4, Math.min(w, h) * 0.008);

    for (let i = 0; i < EDGES.length; i++){
      const ed = EDGES[i];
      const start = N[ed.from];
      const end = N[ed.to];

      // place near the start, slightly offset toward the edge.
      const px = start[0] + (end[0] - start[0]) * 0.18;
      const py = start[1] + (end[1] - start[1]) * 0.18;

      const xx = px * w;
      const yy = py * h;

      let col = warn;
      if (sig[i] === 2) col = ok;
      else if (sig[i] === 1) col = caution;

      // glow
      ctx.beginPath();
      ctx.fillStyle = `rgba(0,0,0,0.25)`;
      ctx.arc(xx, yy, r * 1.75, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.6 + 0.4 * sigVis[i];
      ctx.arc(xx, yy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,255,255,0.12)`;
      ctx.lineWidth = 1;
      ctx.arc(xx, yy, r, 0, Math.PI * 2);
      ctx.stroke();

      // tiny label
      ctx.fillStyle = inkDim;
      ctx.font = `${Math.max(10, Math.floor(mono * 0.8))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(ed.id, xx, yy + r * 1.25);
    }
  }

  function drawTrains(ctx){
    const rr = Math.max(5, Math.min(w, h) * 0.010);

    for (let i = 0; i < trains.length; i++){
      const tr = trains[i];
      const e = EDGES[tr.edgeIdx].edge;

      pointAt(e, tr.s, tmpP);
      const x = tmpP[0] * w;
      const y = tmpP[1] * h;

      // glow blob
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${0.06 + 0.10 * tr.glow})`;
      ctx.arc(x, y, rr * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // train dot
      ctx.beginPath();
      ctx.fillStyle = tr.col;
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();

      // tag
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.85;
      ctx.font = `${Math.max(11, Math.floor(mono * 0.95))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(tr.tag, x + rr * 1.4, y);
      ctx.globalAlpha = 1;
    }
  }

  function drawPanel(ctx){
    const pad = Math.max(14, Math.floor(Math.min(w, h) * 0.03));
    const pw = Math.max(260, Math.floor(w * 0.32));
    const ph = Math.max(180, Math.floor(h * 0.40));
    const x = pad;
    const y = pad;

    // panel body
    const g = ctx.createLinearGradient(x, y, x, y + ph);
    g.addColorStop(0, panelA);
    g.addColorStop(1, panelB);

    roundRect(ctx, x, y, pw, ph, 18);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const innerX = x + pad * 0.8;
    let cy = y + pad * 0.7;

    ctx.fillStyle = ink;
    ctx.font = `600 ${font}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('MODEL RAILWAY CONTROL', innerX, cy);
    cy += font * 1.25;

    ctx.fillStyle = inkDim;
    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    const p = phase();
    const pct = phaseT / p.dur;
    const mm = (14 + Math.floor((t % 600) / 60)).toString().padStart(2, '0');
    const ss = Math.floor(t % 60).toString().padStart(2, '0');
    ctx.fillText(`SHIFT ${mm}:${ss}   PHASE: ${p.name}`, innerX, cy);
    cy += mono * 1.25;

    // turnout indicators
    const bx = innerX;
    const by = cy;
    const bw = pw - pad * 1.6;
    const bh = mono * 1.7;

    function turnoutRow(label, state, which){
      roundRect(ctx, bx, cy, bw, bh, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.stroke();

      ctx.fillStyle = inkDim;
      ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + 10, cy + bh / 2);

      const pillW = 94;
      const pillH = bh - 10;
      const px = bx + bw - pillW - 10;
      const py = cy + 5;

      roundRect(ctx, px, py, pillW, pillH, 999);
      const on = state ? 1 : 0;
      ctx.fillStyle = on ? 'rgba(90,255,180,0.12)' : 'rgba(255,120,120,0.10)';
      ctx.fill();
      ctx.strokeStyle = on ? 'rgba(90,255,180,0.35)' : 'rgba(255,120,120,0.25)';
      ctx.stroke();

      ctx.fillStyle = on ? ok : warn;
      ctx.textAlign = 'center';
      ctx.fillText(which === 'A' ? (on ? 'YARD' : 'MAIN') : (on ? 'SHED' : 'MAIN'), px + pillW / 2, py + pillH / 2);
    }

    turnoutRow('TURNOUT A', turnoutA, 'A');
    cy += bh + 8;
    turnoutRow('TURNOUT B', turnoutB, 'B');
    cy += bh + 10;

    // small schedule card
    roundRect(ctx, bx, cy, bw, mono * 4.4, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = `600 ${Math.max(12, Math.floor(mono * 0.95))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SCHEDULE', bx + 10, cy + 8);

    ctx.fillStyle = inkDim;
    ctx.font = `${Math.max(11, Math.floor(mono * 0.90))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

    const s0 = p.id === 'rush' ? 'Express loop: 2 trains' : (p.id === 'yard' ? 'Shunt: yard + shed' : 'Quiet hours: park + loop');
    const s1 = emergency > 0 ? 'ALERT: EMERGENCY STOP' : (clearWave > 0 ? 'All-clear: signal cascade' : 'Blocks: auto-protected');
    const s2 = `Route bias: ${p.id === 'rush' ? 'MAINLINE' : (p.id === 'yard' ? 'DIVERT' : 'CALM')}`;

    ctx.fillText(`• ${s0}`, bx + 10, cy + 28);
    ctx.fillText(`• ${s1}`, bx + 10, cy + 28 + mono * 1.1);
    ctx.fillText(`• ${s2}`, bx + 10, cy + 28 + mono * 2.2);

    // overlay: emergency stripe
    if (emergency > 0){
      ctx.save();
      ctx.globalAlpha = 0.10 + 0.18 * emergency;
      ctx.fillStyle = warn;
      ctx.translate(x, y);
      ctx.rotate(-0.25);
      for (let k = -2; k < 8; k++){
        ctx.fillRect(k * 40, ph * 0.2, 18, ph * 1.2);
      }
      ctx.restore();
    }
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);

    // Layout: track diagram centered, panel top-left.
    drawTrack(ctx);
    drawSignals(ctx);
    drawTrains(ctx);
    drawPanel(ctx);

    // subtle “glass” highlight
    ctx.globalAlpha = 0.12;
    const gx = w * 0.22;
    const gy = h * 0.14;
    const g = ctx.createLinearGradient(gx, gy, gx + w * 0.35, gy + h * 0.25);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
