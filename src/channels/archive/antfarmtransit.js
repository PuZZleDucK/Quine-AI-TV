import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

// REVIEWED: 2026-02-10

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

function roundedRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w*0.5, h*0.5);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}

function bezierCubic(p0, p1, p2, p3, u){
  const t = 1 - u;
  const a = t*t*t;
  const b = 3*t*t*u;
  const c = 3*t*u*u;
  const d = u*u*u;
  return {
    x: p0.x*a + p1.x*b + p2.x*c + p3.x*d,
    y: p0.y*a + p1.y*b + p2.y*c + p3.y*d,
  };
}

function approxCubicLen(p0, p1, p2, p3){
  let len = 0;
  let prev = p0;
  const steps = 12;
  for (let i=1;i<=steps;i++){
    const u = i / steps;
    const p = bezierCubic(p0, p1, p2, p3, u);
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    len += Math.hypot(dx, dy);
    prev = p;
  }
  return Math.max(1, len);
}

function drawAnt(ctx, x, y, ang, s, body, glow=0){
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);

  // glow (pheromone highlight)
  if (glow > 0){
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(180,255,210,${0.12 * glow})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, s*2.2, s*1.4, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // body segments (with subtle shadow + highlight for readability)
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(-s*0.55 + s*0.05, s*0.06, s*0.60, s*0.46, 0, 0, Math.PI*2);
  ctx.ellipse(0.2 + s*0.05, s*0.06, s*0.68, s*0.53, 0, 0, Math.PI*2);
  ctx.ellipse(s*0.78 + s*0.05, s*0.06, s*0.78, s*0.60, 0, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(-s*0.55, 0, s*0.55, s*0.42, 0, 0, Math.PI*2);
  ctx.ellipse(0.2, 0, s*0.62, s*0.48, 0, 0, Math.PI*2);
  ctx.ellipse(s*0.78, 0, s*0.72, s*0.55, 0, 0, Math.PI*2);
  ctx.fill();

  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.ellipse(0.15, -s*0.14, s*0.85, s*0.22, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // legs
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = Math.max(1, s*0.16);
  for (let i=0;i<3;i++){
    const yy = (-0.45 + i*0.45) * s;
    ctx.beginPath();
    ctx.moveTo(-s*0.15, yy);
    ctx.lineTo(-s*0.65, yy + s*(i===1?0.1:0.25));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(s*0.35, yy);
    ctx.lineTo(s*0.8, yy + s*(i===1?-0.08:0.22));
    ctx.stroke();
  }

  // antennae
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, s*0.14);
  ctx.beginPath();
  ctx.moveTo(-s*1.0, -s*0.1);
  ctx.quadraticCurveTo(-s*1.35, -s*0.55, -s*1.65, -s*0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s*1.0, s*0.1);
  ctx.quadraticCurveTo(-s*1.35, s*0.55, -s*1.65, s*0.85);
  ctx.stroke();

  ctx.restore();
}

function panelHeader(ctx, w, h, title, subtitle, phaseLabel, p, font, small){
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  roundedRect(ctx, 14, 14, w - 28, Math.max(54, font * 3.0), 12);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = `800 ${font}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(title, 28, 22);

  ctx.fillStyle = 'rgba(240,240,240,0.82)';
  ctx.font = `600 ${small}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(subtitle, 28, 22 + font * 1.18);

  ctx.fillStyle = 'rgba(180,255,210,0.95)';
  ctx.font = `800 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.fillText(phaseLabel, 28, 22 + font * 1.18 + small * 1.05);

  const barW = Math.min(220, w * 0.26);
  const bx = w - 28 - barW;
  const by = 22 + font * 1.18 + small * 1.05;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundedRect(ctx, bx, by + 2, barW, Math.max(8, small * 0.55), 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,255,210,0.55)';
  roundedRect(ctx, bx, by + 2, barW * clamp(p,0,1), Math.max(8, small * 0.55), 8);
  ctx.fill();
  ctx.restore();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;

  // Layout regions
  let farm = { x: 0, y: 0, w: 0, h: 0 };

  // Network
  let stations = []; // {x,y,code}
  let edges = []; // {a,b,p0,p1,p2,p3,len,line}
  let adj = []; // array of edge-index arrays
  let lineEdges = [[],[],[]];

  // Ant trains
  const MAX_ANTS = 70;
  let ants = new Array(MAX_ANTS);
  let antHead = 0;

  // Phases
  const PHASES = [
    { id: 'rush', label: 'RUSH HOUR', speed: 1.25, spawn: 3.2 },
    { id: 'mid', label: 'MIDDAY FLOW', speed: 0.95, spawn: 1.7 },
    { id: 'night', label: 'NIGHT SHIFT', speed: 0.78, spawn: 1.0 },
    { id: 'maint', label: 'MAINTENANCE', speed: 0.62, spawn: 0.7 },
  ];
  const PHASE_DUR = 16;
  let phaseIdx = 0;
  let phaseT = 0;
  let phaseFlash = 0;

  // Specials
  let surge = { edge: -1, t: 0, dur: 0 };
  let nextSurgeAt = 0;

  let collapse = { edge: -1, t: 0, dur: 0 };
  let nextCollapseAt = 0;

  let queen = { active: false, x: 0, y: 0, t: 0, dur: 0 };
  let nextQueenAt = 0;

  // Audio
  let ambience = null;

  // Perf: cache background gradients + speckle texture + vignette on resize/init.
  const bgCache = {
    soil: null,     // CanvasImageSource | false | null
    vignette: null, // CanvasImageSource | false | null
    farm: null,     // CanvasImageSource | false | null
    farmW: 0,
    farmH: 0,
  };

  function makeCanvas(W, H){
    if (!(W > 0 && H > 0)) return null;
    const wI = Math.max(1, Math.floor(W));
    const hI = Math.max(1, Math.floor(H));
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(wI, hI);
    if (typeof document !== 'undefined'){
      const c = document.createElement('canvas');
      c.width = wI;
      c.height = hI;
      return c;
    }
    return null;
  }

  function rebuildBackgroundCaches(){
    // soil gradient layer
    {
      const c = makeCanvas(w, h);
      if (!c){
        bgCache.soil = false;
      } else {
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#080506');
        grad.addColorStop(1, '#020102');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        bgCache.soil = c;
      }
    }

    // farm glass + speckle layer (relative coords; can be blitted at farm.x/y even if it drifts)
    {
      const fw = Math.max(1, Math.ceil(farm.w));
      const fh = Math.max(1, Math.ceil(farm.h));
      bgCache.farmW = fw;
      bgCache.farmH = fh;

      const c = makeCanvas(fw, fh);
      if (!c){
        bgCache.farm = false;
      } else {
        const g = c.getContext('2d');
        g.clearRect(0, 0, fw, fh);

        const glass = g.createLinearGradient(0, 0, 0, fh);
        glass.addColorStop(0, 'rgba(70,60,55,0.55)');
        glass.addColorStop(1, 'rgba(25,18,16,0.72)');
        g.fillStyle = glass;
        roundedRect(g, 0, 0, fw, fh, 26);
        g.fill();

        // deterministic speckle dots (no RNG usage in hot path)
        g.save();
        g.globalAlpha = 0.16;
        g.fillStyle = 'rgba(255,230,200,0.06)';
        const dots = 380;
        for (let i = 0; i < dots; i++){
          const fx = (Math.sin((i + 1) * 12.9898 + seed) * 43758.5453) % 1;
          const fy = (Math.sin((i + 7) * 78.233 + seed * 0.3) * 23421.631) % 1;
          const x = ((fx + 1) % 1) * fw;
          const y = ((fy + 1) % 1) * fh;
          const r = 0.7 + (((i * 97) % 11) / 11) * 1.6;
          g.fillRect(x, y, r, r);
        }
        g.restore();

        bgCache.farm = c;
      }
    }

    // vignette layer
    {
      const c = makeCanvas(w, h);
      if (!c){
        bgCache.vignette = false;
      } else {
        const g = c.getContext('2d');
        g.clearRect(0, 0, w, h);
        const vg = g.createRadialGradient(
          w * 0.55, h * 0.55, Math.min(w, h) * 0.22,
          w * 0.55, h * 0.55, Math.max(w, h) * 0.82
        );
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.64)');
        g.fillStyle = vg;
        g.fillRect(0, 0, w, h);
        bgCache.vignette = c;
      }
    }
  }

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function edgePoint(edge, u){
    return bezierCubic(edge.p0, edge.p1, edge.p2, edge.p3, u);
  }

  function edgeTangent(edge, u){
    // derivative of cubic bezier
    const t = 1 - u;
    const dx = 3*t*t*(edge.p1.x-edge.p0.x) + 6*t*u*(edge.p2.x-edge.p1.x) + 3*u*u*(edge.p3.x-edge.p2.x);
    const dy = 3*t*t*(edge.p1.y-edge.p0.y) + 6*t*u*(edge.p2.y-edge.p1.y) + 3*u*u*(edge.p3.y-edge.p2.y);
    return Math.atan2(dy, dx);
  }

  function edgeClosed(i){
    return collapse.edge === i && collapse.t < collapse.dur;
  }

  function makeNetwork(){
    // deterministic-ish, but ok if resize regenerates
    const nStations = 11 + ((rand() * 6) | 0);
    stations = [];
    edges = [];
    adj = [];
    lineEdges = [[],[],[]];

    const codes = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let i=0;i<nStations;i++){
      const x = farm.x + farm.w * (0.10 + rand() * 0.80);
      const y = farm.y + farm.h * (0.15 + rand() * 0.78);
      const code = codes[i % codes.length] + String(1 + ((i / codes.length) | 0));
      stations.push({ x, y, code });
      adj.push([]);
    }

    function addEdge(a, b){
      if (a === b) return;
      // avoid duplicates
      for (let ei=0;ei<edges.length;ei++){
        const e = edges[ei];
        if ((e.a===a && e.b===b) || (e.a===b && e.b===a)) return;
      }

      const p0 = { x: stations[a].x, y: stations[a].y };
      const p3 = { x: stations[b].x, y: stations[b].y };
      const mx = (p0.x + p3.x) * 0.5;
      const my = (p0.y + p3.y) * 0.5;
      const dx = p3.x - p0.x;
      const dy = p3.y - p0.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / d;
      const ny = dx / d;
      const bend = (rand() - 0.5) * Math.min(farm.w, farm.h) * (0.10 + rand() * 0.18);

      const p1 = { x: lerp(p0.x, mx, 0.45) + nx * bend, y: lerp(p0.y, my, 0.45) + ny * bend };
      const p2 = { x: lerp(p3.x, mx, 0.45) + nx * bend, y: lerp(p3.y, my, 0.45) + ny * bend };

      const len = approxCubicLen(p0, p1, p2, p3);

      const e = { a, b, p0, p1, p2, p3, len, line: -1 };
      const idx = edges.length;
      edges.push(e);
      adj[a].push(idx);
      adj[b].push(idx);
    }

    // connect into a tree via nearest-previous
    for (let i=1;i<nStations;i++){
      let bestJ = 0;
      let bestD = 1e9;
      for (let j=0;j<i;j++){
        const dx = stations[i].x - stations[j].x;
        const dy = stations[i].y - stations[j].y;
        const dd = dx*dx + dy*dy;
        if (dd < bestD){ bestD = dd; bestJ = j; }
      }
      addEdge(i, bestJ);
    }

    // add a few cross links
    const extra = Math.max(3, (nStations * 0.7) | 0);
    for (let k=0;k<extra;k++){
      const a = (rand() * nStations) | 0;
      let b = (rand() * nStations) | 0;
      if (b === a) b = (b + 1) % nStations;
      addEdge(a, b);
    }

    // pick 3 colored lines by BFS paths
    const lines = [
      { name: 'GREEN', color: '#44e08f' },
      { name: 'VIOLET', color: '#b07bff' },
      { name: 'AMBER', color: '#ffcc63' },
    ];

    function bfsPath(s, g){
      const q = new Array(nStations);
      let qh = 0, qt = 0;
      const prevNode = new Array(nStations).fill(-1);
      const prevEdge = new Array(nStations).fill(-1);
      prevNode[s] = s;
      q[qt++] = s;

      while (qh < qt){
        const v = q[qh++];
        if (v === g) break;
        const edgesIdx = adj[v];
        for (let ii=0;ii<edgesIdx.length;ii++){
          const ei = edgesIdx[ii];
          const e = edges[ei];
          const to = (e.a === v) ? e.b : e.a;
          if (prevNode[to] !== -1) continue;
          prevNode[to] = v;
          prevEdge[to] = ei;
          q[qt++] = to;
        }
      }

      if (prevNode[g] === -1) return [];
      const path = [];
      let cur = g;
      while (cur !== s){
        const ei = prevEdge[cur];
        if (ei < 0) break;
        path.push(ei);
        cur = prevNode[cur];
      }
      path.reverse();
      return path;
    }

    for (let li=0;li<3;li++){
      const s = (rand() * nStations) | 0;
      let g = (rand() * nStations) | 0;
      if (g === s) g = (g + 1) % nStations;

      const path = bfsPath(s, g);
      for (let i=0;i<path.length;i++){
        const ei = path[i];
        // allow overlaps; but prefer to fill unassigned first
        if (edges[ei].line === -1 || rand() < 0.25) edges[ei].line = li;
      }
    }

    // build per-line edge lists
    for (let ei=0;ei<edges.length;ei++){
      const li = edges[ei].line;
      if (li >= 0) lineEdges[li].push(ei);
    }

    // If a line ended up empty, sprinkle a few edges.
    for (let li=0;li<3;li++){
      if (lineEdges[li].length) continue;
      for (let k=0;k<Math.min(4, edges.length);k++){
        const ei = (rand() * edges.length) | 0;
        edges[ei].line = li;
        lineEdges[li].push(ei);
      }
    }

    return lines;
  }

  let lines = null;

  function resetAnts(){
    for (let i=0;i<MAX_ANTS;i++){
      ants[i] = {
        active: false,
        edge: 0,
        dir: 1,
        u: 0,
        speed: 70,
        line: 0,
        size: 3,
        shade: 0.88,
        body: 'rgba(35, 28, 22, 0.92)',
      };
    }
    antHead = 0;
  }

  function spawnAnt(speedMult, spawnLine){
    const a = ants[antHead];
    antHead = (antHead + 1) % MAX_ANTS;

    const li = (spawnLine != null) ? spawnLine : ((rand() * 3) | 0);
    const list = lineEdges[li] && lineEdges[li].length ? lineEdges[li] : null;
    const ei = list ? list[(rand() * list.length) | 0] : ((rand() * edges.length) | 0);

    a.active = true;
    a.edge = ei;
    a.dir = rand() < 0.5 ? 1 : -1;
    a.u = (a.dir === 1) ? 0 : 1;
    a.line = li;
    // Slightly larger ants for readability at a glance.
    a.size = 3.1 + rand() * 2.2;
    a.shade = 0.78 + rand() * 0.18;
    {
      const r = (40 * a.shade) | 0;
      const g = (30 * a.shade) | 0;
      const b = (25 * a.shade) | 0;
      a.body = `rgba(${r}, ${g}, ${b}, 0.92)`;
    }

    const base = 58 + rand()*55;
    a.speed = base * speedMult;

    if (audio.enabled && rand() < 0.16){
      safeBeep({ freq: 420 + li*120 + rand()*40, dur: 0.012, gain: 0.006, type: 'square' });
    }
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 30));
    small = Math.max(11, Math.floor(font * 0.78));

    t = 0;
    phaseIdx = 0;
    phaseT = 0;
    phaseFlash = 0;

    farm = { x: w * 0.06, y: h * 0.12, w: w * 0.88, h: h * 0.84 };

    rebuildBackgroundCaches();

    lines = makeNetwork();
    resetAnts();

    // initial ants
    for (let i=0;i<20;i++) spawnAnt(1, i % 3);

    nextSurgeAt = 4 + rand() * 8;
    surge = { edge: -1, t: 0, dur: 0 };

    nextCollapseAt = 9 + rand() * 12;
    collapse = { edge: -1, t: 0, dur: 0 };

    nextQueenAt = 14 + rand() * 18;
    queen = { active: false, x: 0, y: 0, t: 0, dur: 0 };
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    // Defensive: avoid stacking if toggled repeatedly.
    onAudioOff();
    if (!audio.enabled) return;

    const n = audio.noiseSource({ type: 'brown', gain: 0.0032 });
    n.start();

    const d = simpleDrone(audio, { root: 62 + rand()*10, detune: 0.9, gain: 0.015 });

    ambience = {
      stop(){
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      }
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    const prev = ambience;
    ambience = null;

    // Stop our own sources regardless.
    try { prev?.stop?.(); } catch {}

    // If we're the registered current handle, clear it.
    try { if (audio.current === prev) audio.stopCurrent(); } catch {}
  }

  function destroy(){
    onAudioOff();
  }

  let spawnAcc = 0;

  function onPhaseEnter(){
    phaseFlash = 1;
    if (audio.enabled){
      safeBeep({ freq: 660 + rand()*90, dur: 0.02, gain: 0.01, type: 'triangle' });
      if (rand() < 0.35) safeBeep({ freq: 990 + rand()*120, dur: 0.015, gain: 0.007, type: 'triangle' });
    }
  }

  function updateAnt(a, dt, speedMult){
    if (!a.active) return;

    let e = edges[a.edge];
    if (!e) { a.active = false; return; }

    // if the tunnel is collapsed, the ant slows and tries to reverse at endpoints
    const closed = edgeClosed(a.edge);
    const slow = closed ? 0.25 : 1;

    const du = (dt * (a.speed * speedMult) * slow) / e.len;
    a.u += du * a.dir;

    if (a.u > 1 || a.u < 0){
      // arrive at station
      const atNode = (a.u > 1) ? e.b : e.a;

      // pick next edge from adjacency (no allocations)
      const options = adj[atNode];
      let tries = Math.min(8, options.length);
      let chosen = -1;
      while (tries-- > 0){
        const nei = options[(rand() * options.length) | 0];
        if (nei === a.edge) continue;
        if (edgeClosed(nei)) continue;
        chosen = nei;
        break;
      }

      if (chosen < 0){
        // fallback: reverse on current edge
        a.dir *= -1;
        a.u = clamp(a.u, 0, 1);
        return;
      }

      const ne = edges[chosen];
      a.edge = chosen;
      // direction away from station
      a.dir = (ne.a === atNode) ? 1 : -1;
      a.u = (a.dir === 1) ? 0 : 1;

      // occasional station departure blip
      if (audio.enabled && rand() < 0.06){
        safeBeep({ freq: 330 + a.line*100 + rand()*60, dur: 0.01, gain: 0.0048, type: 'square' });
      }
    }
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    phaseFlash = Math.max(0, phaseFlash - dt * 2.2);

    // phase loop
    if (phaseT >= PHASE_DUR){
      phaseT = phaseT % PHASE_DUR;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      onPhaseEnter();
    }

    const ph = PHASES[phaseIdx];
    const p = phaseT / PHASE_DUR;

    // spawn cadence
    spawnAcc += dt * ph.spawn;
    while (spawnAcc >= 1){
      spawnAcc -= 1;
      spawnAnt(ph.speed, null);
    }

    // pheromone surge
    if (surge.edge >= 0){
      surge.t += dt;
      if (surge.t >= surge.dur) surge.edge = -1;
    }
    if (t >= nextSurgeAt){
      const li = (rand() * 3) | 0;
      const list = lineEdges[li];
      if (list && list.length){
        surge.edge = list[(rand() * list.length) | 0];
        surge.t = 0;
        surge.dur = 3.0 + rand()*1.8;
        nextSurgeAt = t + 8 + rand()*14;

        if (audio.enabled){
          safeBeep({ freq: 1040 + li*120, dur: 0.02, gain: 0.009, type: 'triangle' });
        }
      }
    }

    // tunnel collapse
    if (collapse.edge >= 0){
      collapse.t += dt;
      if (collapse.t >= collapse.dur) collapse.edge = -1;
    }
    if (t >= nextCollapseAt){
      collapse.edge = (rand() * edges.length) | 0;
      collapse.t = 0;
      collapse.dur = 5.5 + rand()*2.5;
      nextCollapseAt = t + 16 + rand()*22;

      if (audio.enabled){
        safeBeep({ freq: 210, dur: 0.03, gain: 0.012, type: 'square' });
        safeBeep({ freq: 140, dur: 0.05, gain: 0.010, type: 'square' });
      }
    }

    // queen inspection
    if (queen.active){
      queen.t += dt;
      const u = clamp(queen.t / queen.dur, 0, 1);
      queen.x = lerp(farm.x - farm.w*0.15, farm.x + farm.w*1.15, ease(u));
      queen.y = farm.y + farm.h * (0.17 + Math.sin(t*0.3)*0.01);
      if (queen.t >= queen.dur) queen.active = false;
    }
    if (t >= nextQueenAt){
      queen.active = true;
      queen.t = 0;
      queen.dur = 6.5 + rand()*3;
      queen.x = farm.x - farm.w*0.15;
      queen.y = farm.y + farm.h * 0.2;
      nextQueenAt = t + 22 + rand()*28;

      if (audio.enabled){
        safeBeep({ freq: 520, dur: 0.02, gain: 0.009, type: 'triangle' });
      }
    }

    // update ants
    for (let i=0;i<MAX_ANTS;i++){
      updateAnt(ants[i], dt, ph.speed);
    }

    // extra flicker during collapse (visual)
    if (collapse.edge >= 0 && collapse.t < 0.7) phaseFlash = Math.max(phaseFlash, 0.75);

    // tiny drift so the farm feels alive
    farm.x = w * 0.06 + Math.sin(t * 0.12) * w * 0.004;
  }

  function drawBackground(ctx){
    // soil gradient (cached)
    if (bgCache.soil && bgCache.soil !== false){
      ctx.drawImage(bgCache.soil, 0, 0);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#080506');
      g.addColorStop(1, '#020102');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // farm tank shadow (depends on current farm.x drift)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, farm.x + 10, farm.y + 10, farm.w, farm.h, 26);
    ctx.fill();
    ctx.restore();

    // farm glass + speckle (cached)
    if (bgCache.farm && bgCache.farm !== false){
      ctx.drawImage(bgCache.farm, farm.x, farm.y);
    } else {
      const glass = ctx.createLinearGradient(farm.x, farm.y, farm.x, farm.y + farm.h);
      glass.addColorStop(0, 'rgba(70,60,55,0.55)');
      glass.addColorStop(1, 'rgba(25,18,16,0.72)');
      ctx.fillStyle = glass;
      roundedRect(ctx, farm.x, farm.y, farm.w, farm.h, 26);
      ctx.fill();

      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = 'rgba(255,230,200,0.06)';
      const dots = 380;
      for (let i=0;i<dots;i++){
        const x = farm.x + (Math.sin((i+1)*12.9898 + seed) * 43758.5453 % 1 + 1) % 1 * farm.w;
        const y = farm.y + (Math.sin((i+7)*78.233 + seed*0.3) * 23421.631 % 1 + 1) % 1 * farm.h;
        const r = 0.7 + (((i*97) % 11) / 11) * 1.6;
        ctx.fillRect(x, y, r, r);
      }
      ctx.restore();
    }

    // vignette (cached)
    if (bgCache.vignette && bgCache.vignette !== false){
      ctx.drawImage(bgCache.vignette, 0, 0);
    } else {
      const vg = ctx.createRadialGradient(w*0.55, h*0.55, Math.min(w,h)*0.22, w*0.55, h*0.55, Math.max(w,h)*0.82);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.64)');
      ctx.fillStyle = vg;
      ctx.fillRect(0,0,w,h);
    }
  }

  function drawTunnels(ctx){
    ctx.save();

    // carve base
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const thick = Math.max(10, Math.min(farm.w, farm.h) * 0.025);

    for (let ei=0;ei<edges.length;ei++){
      const e = edges[ei];
      const closed = edgeClosed(ei);

      ctx.strokeStyle = closed ? 'rgba(10,7,7,0.88)' : 'rgba(10,7,7,0.78)';
      ctx.lineWidth = thick;
      ctx.beginPath();
      ctx.moveTo(e.p0.x, e.p0.y);
      ctx.bezierCurveTo(e.p1.x, e.p1.y, e.p2.x, e.p2.y, e.p3.x, e.p3.y);
      ctx.stroke();

      // inner highlight
      const li = e.line;
      const c = (li === 0) ? 'rgba(68,224,143,0.30)'
        : (li === 1) ? 'rgba(176,123,255,0.28)'
        : (li === 2) ? 'rgba(255,204,99,0.26)'
        : 'rgba(210,200,190,0.12)';

      ctx.strokeStyle = closed ? 'rgba(255,120,120,0.20)' : c;
      ctx.lineWidth = thick * 0.55;
      ctx.beginPath();
      ctx.moveTo(e.p0.x, e.p0.y);
      ctx.bezierCurveTo(e.p1.x, e.p1.y, e.p2.x, e.p2.y, e.p3.x, e.p3.y);
      ctx.stroke();

      // surge glow on selected edge
      if (surge.edge === ei){
        const a = 0.55 + 0.45 * Math.sin((surge.t / Math.max(0.001, surge.dur)) * Math.PI);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = `rgba(180,255,210,${0.22 * a})`;
        ctx.lineWidth = thick * 0.95;
        ctx.beginPath();
        ctx.moveTo(e.p0.x, e.p0.y);
        ctx.bezierCurveTo(e.p1.x, e.p1.y, e.p2.x, e.p2.y, e.p3.x, e.p3.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // stations
    for (let i=0;i<stations.length;i++){
      const s = stations[i];
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(s.x + 2, s.y + 2, thick*0.32, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, thick*0.32, 0, Math.PI*2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, thick*0.32, 0, Math.PI*2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawAnts(ctx){
    for (let i=0;i<MAX_ANTS;i++){
      const a = ants[i];
      if (!a.active) continue;

      const e = edges[a.edge];
      if (!e) continue;

      const p = edgePoint(e, a.u);
      const ang = edgeTangent(e, a.u) + (a.dir === 1 ? 0 : Math.PI);

      const glow = (surge.edge === a.edge) ? 1 : 0;
      drawAnt(ctx, p.x, p.y, ang, a.size, a.body, glow);
    }

    // queen pass
    if (queen.active){
      const a = 0.55 + 0.45 * Math.sin((queen.t / Math.max(0.001, queen.dur)) * Math.PI);
      drawAnt(ctx, queen.x, queen.y, 0.08, Math.min(10, Math.min(w,h)*0.02), 'rgba(25,18,14,0.95)', a);

      ctx.save();
      ctx.fillStyle = 'rgba(255,230,160,0.92)';
      ctx.font = `800 ${Math.floor(small*0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText('QUEEN INSPECTION', queen.x + 18, queen.y - 14);
      ctx.restore();
    }
  }

  function drawMapOverlay(ctx){
    // small map UI in bottom-right
    const pad = 14;
    const bw = Math.min(300, w * 0.34);
    const bh = Math.min(180, h * 0.23);
    const x0 = w - pad - bw;
    const y0 = h - pad - bh;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    roundedRect(ctx, x0, y0, bw, bh, 14);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    roundedRect(ctx, x0, y0, bw, bh, 14);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    roundedRect(ctx, x0+8, y0+8, bw-16, bh-16, 12);
    ctx.clip();

    // map scale
    const minX = farm.x;
    const minY = farm.y;
    const sx = (bw-16) / farm.w;
    const sy = (bh-16) / farm.h;

    const ox = x0 + 8;
    const oy = y0 + 8;

    // edges
    for (let ei=0;ei<edges.length;ei++){
      const e = edges[ei];
      const li = e.line;
      const c = (li === 0) ? 'rgba(68,224,143,0.55)'
        : (li === 1) ? 'rgba(176,123,255,0.48)'
        : (li === 2) ? 'rgba(255,204,99,0.50)'
        : 'rgba(220,220,220,0.14)';

      ctx.strokeStyle = edgeClosed(ei) ? 'rgba(255,120,120,0.38)' : c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox + (e.p0.x - minX) * sx, oy + (e.p0.y - minY) * sy);
      ctx.bezierCurveTo(
        ox + (e.p1.x - minX) * sx, oy + (e.p1.y - minY) * sy,
        ox + (e.p2.x - minX) * sx, oy + (e.p2.y - minY) * sy,
        ox + (e.p3.x - minX) * sx, oy + (e.p3.y - minY) * sy
      );
      ctx.stroke();
    }

    // stations
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i=0;i<stations.length;i++){
      const s = stations[i];
      ctx.beginPath();
      ctx.arc(ox + (s.x - minX) * sx, oy + (s.y - minY) * sy, 2.4, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();

    // legends
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = `800 ${Math.floor(small*0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('ROUTE MAP', x0 + 16, y0 + 14);

    const legendY = y0 + 14 + small * 1.2;
    const items = [
      { label: 'GREEN', c: 'rgba(68,224,143,0.9)' },
      { label: 'VIOLET', c: 'rgba(176,123,255,0.9)' },
      { label: 'AMBER', c: 'rgba(255,204,99,0.9)' },
    ];

    for (let i=0;i<items.length;i++){
      const it = items[i];
      const lx = x0 + 16;
      const ly = legendY + i * (small * 1.05);
      ctx.fillStyle = it.c;
      ctx.fillRect(lx, ly + 4, 10, 3);
      ctx.fillStyle = 'rgba(240,240,240,0.82)';
      ctx.font = `700 ${Math.floor(small*0.85)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(it.label, lx + 16, ly);
    }

    ctx.restore();
  }

  function drawAlerts(ctx){
    if (phaseFlash <= 0 && collapse.edge < 0) return;

    const a = Math.max(phaseFlash, collapse.edge >= 0 ? (0.35 + 0.65 * Math.sin(collapse.t * 6.5) * 0.5 + 0.5) : 0);
    const msg = (collapse.edge >= 0) ? 'SERVICE CHANGE: TUNNEL CLOSED' : 'SERVICE CHANGE';

    ctx.save();
    ctx.globalAlpha = 0.85 * a;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const bw = Math.min(520, w * 0.62);
    const bh = Math.max(46, font * 2.2);
    const x0 = w * 0.5 - bw * 0.5;
    const y0 = farm.y + farm.h * 0.09;
    roundedRect(ctx, x0, y0, bw, bh, 14);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    roundedRect(ctx, x0, y0, bw, bh, 14);
    ctx.stroke();

    ctx.fillStyle = (collapse.edge >= 0) ? 'rgba(255,170,170,0.95)' : 'rgba(180,255,210,0.95)';
    ctx.font = `900 ${Math.floor(font * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, w * 0.5, y0 + bh * 0.55);

    ctx.restore();
  }

  function render(ctx){
    drawBackground(ctx);

    const ph = PHASES[phaseIdx];
    const p = phaseT / PHASE_DUR;

    panelHeader(
      ctx,
      w,
      h,
      'Ant Farm Transit Authority',
      `${stations.length} stations • ${edges.length} tunnels • live ops`,
      ph.label,
      p,
      font,
      small
    );

    drawTunnels(ctx);
    drawAnts(ctx);
    drawMapOverlay(ctx);
    drawAlerts(ctx);

    // subtle screen flash on phase/collapse
    if (phaseFlash > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(180,255,210,${0.06 * phaseFlash})`;
      ctx.fillRect(0,0,w,h);
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
