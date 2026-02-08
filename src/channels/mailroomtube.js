import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

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

  // Visual identity: a dim mailroom floor with a glowing pneumatic tube diagram.
  const hue = 165 + rand() * 40;
  const bg0 = `hsl(${(hue + 220) % 360}, 26%, 8%)`;
  const bg1 = `hsl(${(hue + 245) % 360}, 28%, 6%)`;
  const panel = `hsla(${(hue + 25) % 360}, 25%, 14%, 0.92)`;
  const panel2 = `hsla(${(hue + 35) % 360}, 25%, 10%, 0.92)`;
  const ink = `hsla(${hue}, 75%, 72%, 0.90)`;
  const inkDim = `hsla(${hue}, 55%, 70%, 0.44)`;
  const glow = `hsla(${hue}, 85%, 62%, 0.18)`;
  const warn = `hsla(${(hue + 330) % 360}, 92%, 60%, 0.95)`;
  const ok = `hsla(${(hue + 30) % 360}, 92%, 58%, 0.95)`;

  let font = 16;
  let mono = 14;

  const STATIONS = {
    IN:   [0.12, 0.50],
    SORT: [0.34, 0.34],
    QC:   [0.34, 0.66],
    ARCH: [0.62, 0.24],
    FIN:  [0.62, 0.50],
    SHIP: [0.86, 0.34],
    RET:  [0.86, 0.66],
  };

  const STATION_NAMES = {
    IN: 'INTAKE',
    SORT: 'SORT',
    QC: 'QC',
    ARCH: 'ARCHIVE',
    FIN: 'ROUTER',
    SHIP: 'SHIPPING',
    RET: 'RETURNS',
  };

  // Edges are rebuilt per-resize (points in px).
  const EDGE_SPECS = [
    { id: 'IN_SORT', from: 'IN', to: 'SORT', mid: [0.22, 0.50] },
    { id: 'IN_QC', from: 'IN', to: 'QC', mid: [0.22, 0.50] },

    { id: 'SORT_FIN', from: 'SORT', to: 'FIN', mid: [0.48, 0.34] },
    { id: 'QC_FIN', from: 'QC', to: 'FIN', mid: [0.48, 0.66] },

    { id: 'FIN_ARCH', from: 'FIN', to: 'ARCH', mid: [0.62, 0.34] },
    { id: 'ARCH_FIN', from: 'ARCH', to: 'FIN', mid: [0.62, 0.34] },

    { id: 'FIN_SHIP', from: 'FIN', to: 'SHIP', mid: [0.74, 0.34] },
    { id: 'SHIP_FIN', from: 'SHIP', to: 'FIN', mid: [0.74, 0.34] },

    { id: 'FIN_RET', from: 'FIN', to: 'RET', mid: [0.74, 0.66] },
    { id: 'RET_FIN', from: 'RET', to: 'FIN', mid: [0.74, 0.66] },
  ];

  let stationPx = {};
  let EDGES = [];
  let outgoing = {};

  const tmpP = [0, 0];
  const tmpQ = [0, 0];

  function rebuildGeometry(){
    stationPx = {};
    for (const k of Object.keys(STATIONS)){
      stationPx[k] = [STATIONS[k][0] * w, STATIONS[k][1] * h];
    }

    EDGES = EDGE_SPECS.map((e) => {
      const a = stationPx[e.from];
      const b = stationPx[e.to];
      const m = [e.mid[0] * w, e.mid[1] * h];
      const pts = [a, m, b];
      return { ...e, edge: buildEdge(pts) };
    });

    outgoing = {};
    for (let i = 0; i < EDGES.length; i++){
      const from = EDGES[i].from;
      (outgoing[from] ||= []).push(i);
    }
  }

  const PHASES = [
    { id: 'intake', name: 'INTAKE WAVE', dur: 70 },
    { id: 'rush', name: 'RUSH HOUR', dur: 85 },
    { id: 'maint', name: 'MAINTENANCE', dur: 65 },
    { id: 'close', name: 'END OF SHIFT', dur: 40 },
  ];
  let phaseIdx = 0;
  let phaseT = 0;

  function phase(){ return PHASES[phaseIdx]; }

  let nextSpawnAt = 0;
  let canisterSeq = 0;

  const MAX_CANS = 14;
  const cans = Array.from({ length: MAX_CANS }, () => ({
    active: false,
    id: '',
    edgeIdx: 0,
    s: 0,
    speed: 180,
    from: 'IN',
    to: 'SORT',
    dest: 'SHIP',
    dwell: 0,
    col: ink,
    glow: 0,
    jammed: false,
  }));

  let jam = null; // { idx, edgeIdx, until, pulse }
  let nextJamAt = 7 + rand() * 10;
  let clearPulse = 0;

  let sweep = 0;
  let sweepT = 0;
  let nextSweepAt = 18 + rand() * 20;

  let drone = null;
  let noise = null;
  let musicHandle = null;

  function countActive(){
    let n = 0;
    for (const c of cans) if (c.active) n++;
    return n;
  }

  function pick(arr){ return arr[(rand() * arr.length) | 0]; }

  function safeBeep(opts){
    try { audio.beep(opts); } catch {}
  }

  function phaseSpawnPeriod(){
    const id = phase().id;
    if (id === 'rush') return 0.75 + rand() * 0.7;
    if (id === 'maint') return 1.8 + rand() * 1.7;
    if (id === 'close') return 1.4 + rand() * 1.5;
    return 1.05 + rand() * 1.1;
  }

  function pickDestForPhase(from){
    const id = phase().id;
    const all = ['SORT','QC','ARCH','FIN','SHIP','RET'];
    const endcaps = ['SHIP','RET','ARCH'];

    let pool;
    if (id === 'rush') pool = all;
    else if (id === 'maint') pool = rand() < 0.65 ? ['FIN','ARCH','RET'] : all;
    else if (id === 'close') pool = endcaps;
    else pool = rand() < 0.65 ? endcaps : all;

    // avoid staying put
    let d = pick(pool);
    if (d === from) d = pick(pool);
    if (d === from) d = pick(all);
    return d;
  }

  function edgeDirScore(edgeIdx, dest){
    const e = EDGES[edgeIdx];
    const p = stationPx[e.to];
    const q = stationPx[dest];
    return dist(p[0], p[1], q[0], q[1]);
  }

  function chooseNextEdge(from, dest){
    const outs = outgoing[from];
    if (!outs || outs.length === 0) return null;

    // Prefer edges that move us closer to dest; add a tiny deterministic wobble.
    let best = outs[0];
    let bestScore = 1e9;
    for (const ei of outs){
      const s = edgeDirScore(ei, dest) + rand() * 6;
      if (s < bestScore){ bestScore = s; best = ei; }
    }
    return best;
  }

  function spawnCanister(){
    // spawn from IN most of the time; during maintenance/close, spawn from FIN too.
    const id = phase().id;
    const from = (id === 'maint' || id === 'close') && rand() < 0.35 ? 'FIN' : 'IN';
    const dest = pickDestForPhase(from);
    const edgeIdx = chooseNextEdge(from, dest) ?? 0;

    for (const c of cans){
      if (c.active) continue;
      canisterSeq++;
      c.active = true;
      c.id = `T-${String(canisterSeq % 100).padStart(2,'0')}`;
      c.from = from;
      c.dest = dest;
      c.edgeIdx = edgeIdx;
      c.to = EDGES[edgeIdx].to;
      c.s = 0;
      c.dwell = 0;
      c.speed = (0.55 + rand() * 0.55) * Math.min(w, h) * 0.34; // px/s
      c.col = `hsla(${(hue + (rand()*50-25)) % 360}, 90%, 66%, 0.98)`;
      c.glow = 0.65 + rand() * 0.35;
      c.jammed = false;

      if (audio.enabled){
        safeBeep({ freq: 520 + rand() * 120, dur: 0.02, gain: 0.007, type: 'square' });
        if (rand() < 0.35) safeBeep({ freq: 260 + rand() * 90, dur: 0.03, gain: 0.006, type: 'triangle' });
      }
      break;
    }
  }

  function startJam(){
    if (jam) return;
    const activeIdx = [];
    for (let i = 0; i < cans.length; i++) if (cans[i].active && cans[i].edgeIdx >= 0) activeIdx.push(i);
    if (activeIdx.length === 0) return;

    const idx = pick(activeIdx);
    const c = cans[idx];
    jam = {
      idx,
      edgeIdx: c.edgeIdx,
      until: t + (2.5 + rand() * 2.8),
      pulse: 1,
    };
    c.jammed = true;

    if (audio.enabled){
      safeBeep({ freq: 160 + rand() * 30, dur: 0.10, gain: 0.03, type: 'square' });
      safeBeep({ freq: 120 + rand() * 20, dur: 0.12, gain: 0.024, type: 'square' });
    }
  }

  function clearJam(){
    if (!jam) return;
    const c = cans[jam.idx];
    if (c) c.jammed = false;
    jam = null;
    clearPulse = 1;
    if (audio.enabled){
      safeBeep({ freq: 860 + rand() * 80, dur: 0.06, gain: 0.02, type: 'triangle' });
      safeBeep({ freq: 640 + rand() * 70, dur: 0.05, gain: 0.016, type: 'triangle' });
    }
  }

  function triggerSweep(){
    sweep = 0;
    sweepT = 0;

    // During the sweep, route everything back through the router.
    for (const c of cans){
      if (!c.active) continue;
      c.dest = 'FIN';
      if (c.edgeIdx < 0){
        c.dwell = Math.min(c.dwell, 0.25);
      }
    }

    if (audio.enabled){
      safeBeep({ freq: 420 + rand() * 90, dur: 0.08, gain: 0.016, type: 'sine' });
    }
  }

  function onResize(width, height, _dpr){
    w = width; h = height; dpr = _dpr || 1;
    font = Math.max(12, Math.floor(h / 40));
    mono = Math.max(10, Math.floor(h / 50));
    rebuildGeometry();
  }

  function init({ width, height, dpr: _dpr }){
    // main.js may not call onResize() on channel switch if the canvas size didn't change.
    // This channel depends on geometry rebuilt from w/h, so do it here unconditionally.
    onResize(width, height, _dpr);
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    drone = simpleDrone(audio, { root: 62 + rand() * 10, detune: 1.1, gain: 0.035 });
    noise = audio.noiseSource({ type: 'brown', gain: 0.010 });
    try { noise.start(); } catch {}
    musicHandle = {
      stop(){
        try { drone?.stop?.(); } catch {}
        try { noise?.stop?.(); } catch {}
      }
    };
    audio.setCurrent(musicHandle);
  }

  function onAudioOff(){
    try { musicHandle?.stop?.(); } catch {}
    drone = null;
    noise = null;
    musicHandle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    clearPulse = Math.max(0, clearPulse - dt * 1.8);
    if (jam) jam.pulse = Math.max(0, jam.pulse - dt * 1.6);

    // phase loop
    if (phaseT >= phase().dur){
      phaseT = 0;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      // minor stinger
      if (audio.enabled){
        safeBeep({ freq: 320 + rand() * 90, dur: 0.05, gain: 0.014, type: 'square' });
      }
    }

    // spawn cadence
    if (t >= nextSpawnAt && countActive() < MAX_CANS - 1){
      spawnCanister();
      nextSpawnAt = t + phaseSpawnPeriod();
    }

    // jam events are more likely in maintenance.
    const jamGap = phase().id === 'maint' ? (10 + rand() * 14) : (16 + rand() * 20);
    if (!jam && t >= nextJamAt && countActive() > 3){
      if (phase().id === 'maint' || rand() < 0.55) startJam();
      nextJamAt = t + jamGap;
    }

    if (jam && t >= jam.until) clearJam();

    // periodic end-of-shift sweep
    if (t >= nextSweepAt){
      triggerSweep();
      nextSweepAt = t + (38 + rand() * 60);
    }

    if (sweepT < 4.4){
      sweepT += dt;
      sweep = ease(sweepT / 4.4);
    }

    for (let ci = 0; ci < cans.length; ci++){
      const c = cans[ci];
      if (!c.active) continue;

      // dwell at a station
      if (c.edgeIdx < 0){
        c.dwell -= dt;
        if (c.dwell <= 0){
          const next = chooseNextEdge(c.from, c.dest);
          if (next != null){
            c.edgeIdx = next;
            c.to = EDGES[next].to;
            c.s = 0;
          } else {
            c.active = false;
          }
        }
        continue;
      }

      if (jam && jam.idx === ci && c.jammed){
        // frozen
      } else {
        c.s += c.speed * dt;
      }

      const e = EDGES[c.edgeIdx];
      if (c.s >= e.edge.len){
        // arrived
        c.from = e.to;
        c.s = 0;
        c.edgeIdx = -1;
        c.dwell = 0.15 + rand() * 0.55;

        if (c.from === c.dest){
          c.dest = pickDestForPhase(c.from);
          c.dwell += 0.25 + rand() * 0.8;

          if (audio.enabled && rand() < 0.25){
            safeBeep({ freq: 700 + rand() * 120, dur: 0.02, gain: 0.006, type: 'triangle' });
          }
        }
      }

      // retire a few canisters during close.
      if (phase().id === 'close' && rand() < 0.0025){
        c.active = false;
      }
    }
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, bg0);
    g.addColorStop(1, bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Faint grid/scan.
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = `hsla(${hue}, 20%, 55%, 0.35)`;
    ctx.lineWidth = Math.max(1, h / 720);
    const step = Math.max(18, Math.floor(Math.min(w, h) / 18));
    for (let x = 0; x <= w; x += step){
      ctx.beginPath();
      ctx.moveTo(x + (t * 8) % step, 0);
      ctx.lineTo(x + (t * 8) % step, h);
      ctx.stroke();
    }
    ctx.restore();

    // Subtle vignette.
    ctx.save();
    const vg = ctx.createRadialGradient(w*0.5, h*0.52, Math.min(w,h)*0.1, w*0.5, h*0.52, Math.max(w,h)*0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawTubes(ctx){
    const lw = Math.max(1.5, Math.min(w, h) / 210);

    // glow pass
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < EDGES.length; i++){
      const e = EDGES[i];
      const pts = e.edge.points;
      const isJam = jam && jam.edgeIdx === i;

      ctx.strokeStyle = isJam ? `hsla(${(hue + 330) % 360}, 95%, 62%, ${0.22 + 0.18 * (0.5 + 0.5*Math.sin(t*9))})` : glow;
      ctx.lineWidth = lw * 6;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.stroke();
    }
    ctx.restore();

    // ink pass
    for (let i = 0; i < EDGES.length; i++){
      const e = EDGES[i];
      const pts = e.edge.points;
      const isJam = jam && jam.edgeIdx === i;
      ctx.strokeStyle = isJam ? warn : inkDim;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.stroke();

      // direction ticks
      ctx.save();
      ctx.globalAlpha = isJam ? 0.55 : 0.30;
      ctx.fillStyle = isJam ? warn : ink;
      const edge = e.edge;
      const tickN = 3;
      for (let ti = 1; ti <= tickN; ti++){
        const ss = (edge.len * ti) / (tickN + 1);
        pointAt(edge, ss, tmpP);
        ctx.beginPath();
        ctx.arc(tmpP[0], tmpP[1], lw * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawStations(ctx){
    const r = Math.max(6, Math.min(w, h) / 65);
    const pad = Math.max(6, Math.min(w, h) / 85);
    const sw = Math.max(110, Math.min(w, h) * 0.18);
    const sh = Math.max(46, Math.min(w, h) * 0.075);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    for (const key of Object.keys(STATIONS)){
      const p = stationPx[key];
      const x = p[0] - sw * 0.5;
      const y = p[1] - sh * 0.5;

      // panel
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = panel;
      roundRect(ctx, x, y, sw, sh, r);
      ctx.fill();

      ctx.strokeStyle = `hsla(${hue}, 60%, 70%, 0.35)`;
      ctx.lineWidth = Math.max(1, h / 640);
      ctx.stroke();
      ctx.restore();

      // label
      ctx.fillStyle = ink;
      ctx.font = `${Math.floor(font * 0.9)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillText(STATION_NAMES[key], x + pad, y + sh * 0.5);

      // status lamp
      const lampX = x + sw - pad * 1.1;
      const lampY = y + sh * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = ok;
      ctx.beginPath();
      ctx.arc(lampX, lampY, Math.max(3, sh * 0.12), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawCanisters(ctx){
    const r = Math.max(4, Math.min(w, h) / 120);
    const lw = Math.max(1, Math.min(w, h) / 520);

    for (const c of cans){
      if (!c.active) continue;

      let px, py;
      if (c.edgeIdx >= 0){
        const e = EDGES[c.edgeIdx].edge;
        pointAt(e, c.s, tmpP);
        px = tmpP[0]; py = tmpP[1];
      } else {
        const p = stationPx[c.from];
        px = p[0]; py = p[1];
      }

      const jammed = c.jammed;
      const pulse = jammed ? (0.5 + 0.5*Math.sin(t*10)) : 0;

      // glow
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = jammed ? `rgba(255,80,140,${0.28 + 0.22*pulse})` : `hsla(${hue}, 90%, 62%, ${0.18 * c.glow})`;
      ctx.beginPath();
      ctx.arc(px, py, r * 2.8, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      // capsule
      ctx.save();
      ctx.fillStyle = jammed ? warn : c.col;
      ctx.strokeStyle = `rgba(0,0,0,0.35)`;
      ctx.lineWidth = lw;
      roundRect(ctx, px - r*2.0, py - r*1.15, r*4.0, r*2.3, r*1.1);
      ctx.fill();
      ctx.stroke();

      // small label dot
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = `rgba(255,255,255,0.25)`;
      ctx.beginPath();
      ctx.arc(px + r*0.9, py - r*0.2, r*0.45, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHUD(ctx){
    const pad = Math.max(10, Math.min(w, h) / 38);
    const x = pad;
    const y = pad;
    const pw = Math.max(240, Math.min(w, h) * 0.40);
    const ph = Math.max(92, Math.min(w, h) * 0.16);

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = panel2;
    roundRect(ctx, x, y, pw, ph, Math.max(10, ph*0.18));
    ctx.fill();

    ctx.strokeStyle = `hsla(${hue}, 60%, 70%, 0.28)`;
    ctx.lineWidth = Math.max(1, h / 760);
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.font = `${Math.floor(font * 0.95)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText('MAILROOM TUBE NETWORK', x + pad, y + pad * 0.7);

    ctx.globalAlpha = 0.9;
    ctx.font = `${Math.floor(mono * 0.92)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = inkDim;
    ctx.fillText(`PHASE: ${phase().name}`, x + pad, y + pad * 2.2);
    ctx.fillText(`TRAFFIC: ${countActive()} CANISTERS`, x + pad, y + pad * 3.3);

    if (jam){
      ctx.fillStyle = warn;
      ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 10);
      ctx.fillText('JAM DETECTED — CLEARING…', x + pad, y + pad * 4.4);
    } else if (clearPulse > 0){
      ctx.fillStyle = ok;
      ctx.globalAlpha = 0.2 + 0.8 * clearPulse;
      ctx.fillText('ROUTE CLEAR', x + pad, y + pad * 4.4);
    }

    ctx.restore();

    // Sweep line (special moment)
    if (sweepT < 4.4){
      const sx = lerp(-w * 0.1, w * 1.1, sweep);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `hsla(${hue}, 90%, 70%, 0.07)`;
      ctx.fillRect(sx - w * 0.06, 0, w * 0.12, h);
      ctx.fillStyle = `hsla(${hue}, 90%, 75%, 0.12)`;
      ctx.fillRect(sx - w * 0.01, 0, w * 0.02, h);
      ctx.restore();
    }
  }

  function draw(ctx){
    if (!w || !h) return;
    drawBackground(ctx);
    drawTubes(ctx);
    drawCanisters(ctx);
    drawStations(ctx);
    drawHUD(ctx);
  }

  function render(ctx){
    draw(ctx);
  }

  return {
    init,
    onResize,
    onAudioOn,
    onAudioOff,
    update,
    render,
    destroy,
  };
}
