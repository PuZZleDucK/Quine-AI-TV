// REVIEWED: 2026-02-15
import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';
import { COUNTRY_SHAPES } from '../data/countryShapes.js';

const pick = (rand, a) => a[(rand() * a.length) | 0];

const DESTINATIONS = [
  {
    city: 'Lisbon',
    country: 'Portugal',
    region: 'Atlantic Hills',
    vibe: 'tram-lines, tiles, salted air',
    food: 'Pastel de nata',
    fact: 'Built on seven hills; trams still climb them like clockwork.',
    palette: { sky0: '#0b1a2b', sky1: '#2a3f69', accent: '#f4d06f', ink: '#1a1a1a' },
    speed: 38,
  },
  {
    city: 'Kyoto',
    country: 'Japan',
    region: 'Old Capitals',
    vibe: 'lanterns, alleys, quiet steps',
    food: 'Yudōfu (tofu hot pot)',
    fact: 'A thousand years of capital-life left the city layered, not replaced.',
    palette: { sky0: '#0b0f16', sky1: '#1f2b33', accent: '#ffb703', ink: '#121212' },
    speed: 30,
  },
  {
    city: 'Marrakesh',
    country: 'Morocco',
    region: 'Red Cities',
    vibe: 'souks, courtyards, warm dust',
    food: 'Tagine',
    fact: 'The medina is a living maze: commerce as architecture.',
    palette: { sky0: '#190a0a', sky1: '#5b1b1b', accent: '#ffd166', ink: '#120909' },
    speed: 42,
  },
  {
    city: 'Reykjavík',
    country: 'Iceland',
    region: 'North Atlantic',
    vibe: 'geothermal steam, neon on wet streets',
    food: 'Skyr + berries',
    fact: 'Hot water under the city turns cold nights into a soft hiss.',
    palette: { sky0: '#06131f', sky1: '#12324a', accent: '#90e0ef', ink: '#0b0f12' },
    speed: 34,
  },
  {
    city: 'Mexico City',
    country: 'Mexico',
    region: 'High Basins',
    vibe: 'street food, murals, traffic rhythms',
    food: 'Tacos al pastor',
    fact: 'A modern city built atop lakebeds and older cities — still settling.',
    palette: { sky0: '#0c0b1b', sky1: '#2e2a6b', accent: '#ff4d6d', ink: '#130f16' },
    speed: 48,
  },
  {
    city: 'Hanoi',
    country: 'Vietnam',
    region: 'River Deltas',
    vibe: 'scooters, tea, tangled wires',
    food: 'Phở',
    fact: 'French boulevards and old quarters interleave like two stories at once.',
    palette: { sky0: '#081117', sky1: '#1b3946', accent: '#80ed99', ink: '#0c0f10' },
    speed: 50,
  },
  {
    city: 'Istanbul',
    country: 'Türkiye',
    region: 'Straits & Bridges',
    vibe: 'ferries, calls, tiled shadows',
    food: 'Simit',
    fact: 'A city split by water, stitched by bridges and boats.',
    palette: { sky0: '#070b18', sky1: '#253c7a', accent: '#fca311', ink: '#121220' },
    speed: 40,
  },
  {
    city: 'Edinburgh',
    country: 'Scotland',
    region: 'Volcanic Ridges',
    vibe: 'stone closes, wind, bookstores',
    food: 'Shortbread + tea',
    fact: 'The old town clings to a ridge like a story refusing to be edited.',
    palette: { sky0: '#070a0d', sky1: '#232a33', accent: '#9bf6ff', ink: '#0f1215' },
    speed: 28,
  },
  {
    city: 'New Orleans',
    country: 'USA',
    region: 'Delta Cities',
    vibe: 'brass echoes, balconies, humid nights',
    food: 'Beignets',
    fact: 'Built at the edge of water and swamp; the city learns to float.',
    palette: { sky0: '#070510', sky1: '#2a145d', accent: '#f72585', ink: '#120b19' },
    speed: 36,
  },
  {
    city: 'Copenhagen',
    country: 'Denmark',
    region: 'Canals & Bicycles',
    vibe: 'harbour lights, clean lines, cold air',
    food: 'Smørrebrød',
    fact: 'A working port turned into a calm living room for the sea.',
    palette: { sky0: '#061018', sky1: '#184a5a', accent: '#ffd60a', ink: '#0d1216' },
    speed: 32,
  },
];

const FANTASY_DESTINATIONS = [
  {
    city: 'Luminara Quay',
    country: 'Aether Isles',
    region: 'Cloud Harbors',
    vibe: 'airships, lantern fog, gulls with badges',
    food: 'Nebula noodle bowl',
    fact: 'Dockworkers tie knots to clouds that drift in from the east.',
    humor: 'Parking ticketed if your dragon idles.',
    palette: { sky0: '#10142b', sky1: '#355596', accent: '#ffd166', ink: '#10131f' },
    speed: 34,
  },
  {
    city: 'Mosskeep',
    country: 'Verdant Realm',
    region: 'Rootbound Boroughs',
    vibe: 'tree-trams, glowing fungi, owl traffic',
    food: 'Thimbleberry hand pies',
    fact: 'Neighborhoods connect by suspended branchwalks and rope lifts.',
    humor: 'Squirrels run the lost-and-found desk.',
    palette: { sky0: '#09120f', sky1: '#1f4a3d', accent: '#9ef28f', ink: '#0f1714' },
    speed: 29,
  },
  {
    city: 'Brasshaven',
    country: 'Clockwork Marches',
    region: 'Gearline District',
    vibe: 'steam valves, copper roofs, bell towers',
    food: 'Clockface biscuits',
    fact: 'Streetlights are wound by hand at dusk to keep them humming.',
    humor: 'Late trains blame philosophical gears.',
    palette: { sky0: '#120d0a', sky1: '#5f3622', accent: '#f7b267', ink: '#1a120d' },
    speed: 37,
  },
];

const HUMOR_BY_CITY = {
  Lisbon: 'Pigeons act like unpaid tram inspectors.',
  Kyoto: 'Even vending machines seem to bow politely.',
  Marrakesh: 'Directions include two lefts and one cat.',
  'Reykjavík': 'Sidewalk steam doubles as dramatic stage fog.',
  'Mexico City': 'Traffic lanes are a collaborative suggestion.',
  Hanoi: 'Crosswalk strategy: confidence plus vibes.',
  Istanbul: 'Local cats review your itinerary silently.',
  Edinburgh: 'Wind speed measured in lost umbrellas per hour.',
  'New Orleans': 'Powdered sugar may reach critical mass.',
  Copenhagen: 'Bikes outnumber excuses by a wide margin.',
};

function destinationKey(d){
  return `${d.city}|${d.country}`;
}

function buildCycleOrder(baseSeed, block, count){
  const r = mulberry32((baseSeed ^ ((block + 1) * 0x85ebca6b)) >>> 0);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--){
    const j = (r() * (i + 1)) | 0;
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}

function humorForDestination(d){
  return d.humor || HUMOR_BY_CITY[d.city] || 'Local ducks are unionized and on break.';
}

function roundedRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function makeCoast(rand, cx, cy, r){
  const n = 42 + ((rand() * 22) | 0);
  const base = [];
  const rough = [];
  const noise = [];
  let v = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++){
    v = 0.62 * v + 0.38 * (rand() * 2 - 1);
    noise.push(v);
  }

  const e0 = 0.76 + rand() * 0.20;
  const e1 = 0.64 + rand() * 0.22;
  const rot = rand() * Math.PI * 2;
  const peninsulaCount = 1 + ((rand() * 2) | 0);
  const bayCount = 1 + ((rand() * 2) | 0);
  const peninsulas = [];
  const bays = [];

  for (let i = 0; i < peninsulaCount; i++){
    peninsulas.push({
      a: rand() * Math.PI * 2,
      amp: 0.10 + rand() * 0.18,
      w: 0.20 + rand() * 0.28,
    });
  }
  for (let i = 0; i < bayCount; i++){
    bays.push({
      a: rand() * Math.PI * 2,
      amp: 0.10 + rand() * 0.20,
      w: 0.16 + rand() * 0.30,
    });
  }

  const twopi = Math.PI * 2;
  const wrapAngle = (a) => {
    let d = a;
    while (d > Math.PI) d -= twopi;
    while (d < -Math.PI) d += twopi;
    return d;
  };

  for (let i = 0; i < n; i++){
    const t = i / n;
    const a = t * twopi;
    const ca = Math.cos(a);
    const sa = Math.sin(a);

    // smooth continental body with anisotropy
    const ell = Math.hypot(ca / e0, sa / e1);
    let rr = (r / Math.max(0.62, ell)) * (0.94 + 0.08 * Math.sin(a * 2 + rot));
    rr += (noise[i] * r) * 0.055;
    rr += Math.sin(a * 3 + rot * 0.7) * r * 0.05;
    rr += Math.sin(a * 5 + rot * 1.3) * r * 0.025;

    // add peninsulas + bays in broad sweeps
    for (const p of peninsulas){
      const d = Math.abs(wrapAngle(a - p.a));
      if (d < p.w){
        const k = 1 - d / p.w;
        rr += p.amp * r * k * k;
      }
    }
    for (const b of bays){
      const d = Math.abs(wrapAngle(a - b.a));
      if (d < b.w){
        const k = 1 - d / b.w;
        rr -= b.amp * r * k * k;
      }
    }

    rr = Math.max(r * 0.56, rr);
    base.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }

  // smooth once to avoid spiky "star" look
  for (let i = 0; i < n; i++){
    const p0 = base[(i - 1 + n) % n];
    const p1 = base[i];
    const p2 = base[(i + 1) % n];
    rough.push({
      x: p0.x * 0.2 + p1.x * 0.6 + p2.x * 0.2,
      y: p0.y * 0.2 + p1.y * 0.6 + p2.y * 0.2,
    });
  }
  return rough;
}

function makeInternalBorders(rand, cx, cy, r){
  const borders = [];
  const total = 2 + ((rand() * 3) | 0);
  for (let i = 0; i < total; i++){
    const a = rand() * Math.PI * 2;
    const endA = a + (Math.PI * (0.8 + rand() * 0.4));
    const x1 = cx + Math.cos(a) * r * (0.9 + rand() * 0.35);
    const y1 = cy + Math.sin(a) * r * (0.75 + rand() * 0.28);
    const x2 = cx + Math.cos(endA) * r * (0.9 + rand() * 0.35);
    const y2 = cy + Math.sin(endA) * r * (0.75 + rand() * 0.28);
    const artificial = rand() < 0.42;
    if (artificial){
      borders.push({ artificial: true, pts: [{ x: x1, y: y1 }, { x: x2, y: y2 }] });
      continue;
    }
    const steps = 6 + ((rand() * 4) | 0);
    const pts = [];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    for (let s = 0; s <= steps; s++){
      const p = s / steps;
      const amp = (1 - Math.abs(p - 0.5) * 2) * r * (0.04 + rand() * 0.04);
      const wob = Math.sin((p * Math.PI * 2) + rand() * 6) * amp;
      pts.push({
        x: x1 + dx * p + nx * wob,
        y: y1 + dy * p + ny * wob,
      });
    }
    borders.push({ artificial: false, pts });
  }
  return borders;
}

function makeCoastFromProfile(profile, cx, cy, r, rot){
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const s = r * 0.96;
  const out = [];
  for (let i = 0; i < profile.length; i++){
    const p = profile[i];
    const px = p[0];
    const py = p[1];
    out.push({
      x: cx + (px * cr - py * sr) * s,
      y: cy + (px * sr + py * cr) * s,
    });
  }
  return out;
}

function pointBounds(pts){
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts){
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX, maxX, minY, maxY,
    w: Math.max(1e-6, maxX - minX),
    h: Math.max(1e-6, maxY - minY),
  };
}

function fitPointsToBox(pts, cx, cy, targetW, targetH){
  const b = pointBounds(pts);
  const s = Math.min(targetW / b.w, targetH / b.h);
  const ox = (b.minX + b.maxX) * 0.5;
  const oy = (b.minY + b.maxY) * 0.5;
  return pts.map((p) => ({ x: cx + (p.x - ox) * s, y: cy + (p.y - oy) * s }));
}

function pointInPolygon(x, y, poly){
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-6) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function dist2(a, b){
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function sampleRouteStops(rand, coast){
  const b = pointBounds(coast);
  const stopCount = 2 + ((rand() * 4) | 0); // 2..5
  const minGap = Math.max(18, Math.min(b.w, b.h) * 0.12);
  const minGap2 = minGap * minGap;
  const pts = [];
  let tries = 0;

  while (pts.length < stopCount && tries < 1200){
    tries++;
    const x = b.minX + rand() * b.w;
    const y = b.minY + rand() * b.h;
    if (!pointInPolygon(x, y, coast)) continue;
    const p = { x, y };
    let ok = true;
    for (const q of pts){
      if (dist2(p, q) < minGap2){
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    pts.push(p);
  }

  if (pts.length < 2){
    const cx = (b.minX + b.maxX) * 0.5;
    const cy = (b.minY + b.maxY) * 0.5;
    pts.push({ x: cx - b.w * 0.12, y: cy + b.h * 0.08 });
    pts.push({ x: cx + b.w * 0.12, y: cy - b.h * 0.08 });
  }

  let start = 0;
  for (let i = 1; i < pts.length; i++){
    if (pts[i].x < pts[start].x) start = i;
  }
  const ordered = [pts[start]];
  const used = new Set([start]);
  while (ordered.length < pts.length){
    const last = ordered[ordered.length - 1];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++){
      if (used.has(i)) continue;
      const d = dist2(last, pts[i]);
      if (d < bestD){
        bestD = d;
        best = i;
      }
    }
    if (best < 0) break;
    used.add(best);
    ordered.push(pts[best]);
  }
  return ordered;
}

function buildRoutePlan(stops, cycleSeconds){
  if (!stops || stops.length === 0){
    return { stops: [], pausePerStop: cycleSeconds, legDurations: [], cycleSeconds };
  }
  if (stops.length === 1){
    return { stops, pausePerStop: cycleSeconds, legDurations: [], cycleSeconds };
  }
  const legs = [];
  let totalLen = 0;
  for (let i = 0; i < stops.length - 1; i++){
    const dx = stops[i + 1].x - stops[i].x;
    const dy = stops[i + 1].y - stops[i].y;
    const len = Math.max(1, Math.hypot(dx, dy));
    legs.push(len);
    totalLen += len;
  }
  const pausePerStop = Math.min(2.6, (cycleSeconds * 0.28) / stops.length);
  const totalPause = pausePerStop * stops.length;
  const travelBudget = Math.max(1, cycleSeconds - totalPause);
  const legDurations = legs.map((len) => (len / totalLen) * travelBudget);
  return { stops, pausePerStop, legDurations, cycleSeconds };
}

function routePositionAtTime(route, timeSeconds){
  const stops = route.stops || [];
  if (stops.length === 0) return null;
  if (stops.length === 1) return { x: stops[0].x, y: stops[0].y, stopIndex: 0 };

  const cycle = Math.max(1e-3, route.cycleSeconds || 60);
  let tt = ((timeSeconds % cycle) + cycle) % cycle;
  const pause = route.pausePerStop || 0;

  if (tt < pause){
    return { x: stops[0].x, y: stops[0].y, stopIndex: 0 };
  }
  tt -= pause;

  for (let i = 0; i < route.legDurations.length; i++){
    const leg = route.legDurations[i];
    if (tt < leg){
      const f = leg > 0 ? (tt / leg) : 0;
      return {
        x: stops[i].x + (stops[i + 1].x - stops[i].x) * f,
        y: stops[i].y + (stops[i + 1].y - stops[i].y) * f,
        stopIndex: -1,
      };
    }
    tt -= leg;
    if (tt < pause){
      return { x: stops[i + 1].x, y: stops[i + 1].y, stopIndex: i + 1 };
    }
    tt -= pause;
  }

  const last = stops[stops.length - 1];
  return { x: last.x, y: last.y, stopIndex: stops.length - 1 };
}

function makeStreet(rand, ww, hh){
  const horizon = hh * (0.72 + rand() * 0.14);
  const layers = [0.4, 0.7, 1.0].map((depth, i) => {
    const b = [];
    let x = -ww * 0.2;
    while (x < ww * 1.3){
      const bw = (20 + rand() * 54) * (0.82 + 0.18 * (1 / depth));
      const bh = (hh * (0.10 + rand() * 0.36)) * depth;
      const cols = Math.max(2, Math.floor(bw / 20));
      const rows = Math.max(2, Math.floor(bh / 26));
      const lights = new Uint8Array(cols * rows);
      for (let wi = 0; wi < lights.length; wi++){
        lights[wi] = rand() < (0.22 + 0.10 * depth) ? 1 : 0;
      }
      b.push({
        x,
        w: bw,
        h: bh,
        seed: rand() * 999,
        hue: 210 + i * 10,
        cols,
        rows,
        lights,
        lightTimer: 4 + rand() * 10 + (1 - depth) * 5,
      });
      x += bw + (10 + rand() * 40);
    }
    const stripStart = b.length ? b[0].x : 0;
    const last = b[b.length - 1];
    const stripEnd = last ? (last.x + last.w) : ww;
    const stripWidth = Math.max(ww * 0.8, stripEnd - stripStart);
    return { depth, buildings: b, stripStart, stripWidth };
  });

  return { horizon, layers, rand };
}

export function createChannel({ seed, audio }){
  let w = 0, h = 0;
  let t = 0;

  const SEG_DUR = 60; // seconds per destination/route cycle
  let segIx = 0;
  let segT = 0;
  let dest = DESTINATIONS[0];
  let coast = [];
  let islands = [];
  let borders = [];
  let route = { stops: [], pausePerStop: SEG_DUR, legDurations: [], cycleSeconds: SEG_DUR };
  let street = null;

  let bed = null;
  let lastDestKey = '';
  const normalCycleCache = new Map();

  function getNormalDestination(i){
    const len = DESTINATIONS.length;
    const block = Math.floor(i / len);
    const offset = i % len;
    if (!normalCycleCache.has(block)){
      normalCycleCache.set(block, buildCycleOrder(seed, block, len));
    }
    const order = normalCycleCache.get(block);
    return DESTINATIONS[order[offset]];
  }

  function pickDestinationForSegment(i, r){
    let next = r() < 0.08 ? pick(r, FANTASY_DESTINATIONS) : getNormalDestination(i);
    if (destinationKey(next) === lastDestKey){
      next = getNormalDestination(i + 1);
    }
    lastDestKey = destinationKey(next);
    return next;
  }

  function setSegment(i){
    segIx = i;
    const r = mulberry32((seed ^ (i * 0x9e3779b9)) >>> 0);
    dest = pickDestinationForSegment(i, r);

    // Map geometry: scale to the map panel so outlines fill most of the paper.
    const pad = Math.floor(Math.min(w, h) * 0.05);
    const mw = Math.floor(w * 0.54);
    const mh = Math.floor(h * 0.68);
    const mx = pad;
    const my = Math.floor(h * 0.16);
    const rr = Math.min(mw, mh) * 0.44;
    const ccx = mx + mw * (0.53 + (r() - 0.5) * 0.05);
    const ccy = my + mh * (0.53 + (r() - 0.5) * 0.05);
    const targetW = mw * 0.72;
    const targetH = mh * 0.62;
    const profile = COUNTRY_SHAPES[dest.country];
    if (profile){
      const rot = (r() - 0.5) * (Math.PI / 6);
      const raw = makeCoastFromProfile(profile, 0, 0, 1, rot);
      coast = fitPointsToBox(raw, ccx, ccy, targetW, targetH);
    } else {
      const raw = makeCoast(r, 0, 0, 1);
      coast = fitPointsToBox(raw, ccx, ccy, targetW, targetH);
    }
    const cb = pointBounds(coast);
    const borderRadius = Math.max(cb.w, cb.h) * 0.56;
    borders = makeInternalBorders(r, ccx, ccy, borderRadius);
    route = buildRoutePlan(sampleRouteStops(r, coast), SEG_DUR);
    islands = [];
    const islandCount = profile ? 0 : (r() < 0.18 ? 1 : 0);
    for (let k = 0; k < islandCount; k++){
      const ia = r() * Math.PI * 2;
      const id = rr * (0.95 + r() * 0.55);
      const ir = rr * (0.14 + r() * 0.12);
      islands.push(makeCoast(
        r,
        mx + Math.cos(ia) * id + (r() - 0.5) * rr * 0.22,
        my + Math.sin(ia) * id * 0.72 + (r() - 0.5) * rr * 0.22,
        ir
      ));
    }

    // street footage in a small "screen"
    street = makeStreet(r, w * 0.34, h * 0.24);
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    segIx = 0;
    segT = 0;
    lastDestKey = '';
    normalCycleCache.clear();
    setSegment(0);
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const d = simpleDrone(audio, { root: 92, detune: 0.85, gain: 0.032 });
    const n = audio.noiseSource({ type: 'pink', gain: 0.007 });
    n.start();
    bed = { stop(){ try { d.stop(); } catch {} try { n.stop(); } catch {} } };
    audio.setCurrent(bed);
  }

  function onAudioOff(){
    try { bed?.stop?.(); } catch {}
    bed = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;
    segT += dt;
    while (segT >= SEG_DUR){
      segT -= SEG_DUR;
      setSegment(segIx + 1);
    }

    if (!street) return;
    for (const layer of street.layers){
      for (const b of layer.buildings){
        b.lightTimer -= dt;
        if (b.lightTimer > 0) continue;
        const toggles = (street.rand() < 0.18 ? 2 : 1);
        for (let i = 0; i < toggles; i++){
          const ix = (street.rand() * b.lights.length) | 0;
          b.lights[ix] = b.lights[ix] ? 0 : 1;
        }
        b.lightTimer = 6 + street.rand() * 16 + (1 - layer.depth) * 7;
      }
    }
  }

  function drawDesk(ctx){
    // wood-ish gradient
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#120b07');
    g.addColorStop(0.45, '#23130a');
    g.addColorStop(1, '#0a0604');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle grain
    ctx.save();
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 46; i++){
      const y = (i / 46) * h;
      const a = 0.35 + 0.35 * Math.sin(i * 0.9 + t * 0.15);
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(0, y, w, Math.max(1, h / 240));
    }
    ctx.restore();
  }

  function drawMap(ctx){
    const pad = Math.floor(Math.min(w, h) * 0.05);
    const mw = Math.floor(w * 0.54);
    const mh = Math.floor(h * 0.68);
    const mx = pad;
    const my = Math.floor(h * 0.16);
    const r = Math.floor(Math.min(w, h) * 0.02);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    roundedRect(ctx, mx + 10, my + 14, mw, mh, r);
    ctx.fill();
    ctx.restore();

    // paper
    ctx.save();
    ctx.globalAlpha = 0.98;
    ctx.fillStyle = 'rgba(242, 233, 214, 0.98)';
    roundedRect(ctx, mx, my, mw, mh, r);
    ctx.fill();

    // grid
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = 'rgba(20,20,20,1)';
    ctx.lineWidth = 1;
    const step = Math.max(22, Math.floor(mw / 18));
    for (let x = mx + step; x < mx + mw; x += step){
      ctx.beginPath();
      ctx.moveTo(x, my);
      ctx.lineTo(x, my + mh);
      ctx.stroke();
    }
    for (let y = my + step; y < my + mh; y += step){
      ctx.beginPath();
      ctx.moveTo(mx, y);
      ctx.lineTo(mx + mw, y);
      ctx.stroke();
    }

    // coastline scribble
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(40,35,28,0.85)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) / 420));

    function strokeCoast(pts){
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha *= 0.08;
      ctx.fillStyle = 'rgba(20,30,40,1)';
      ctx.fill();
      ctx.restore();
    }

    strokeCoast(coast);
    for (const isl of islands){
      strokeCoast(isl);
    }

    // Interior borders: clipped to the country silhouette, mix of straight and natural lines.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(coast[0].x, coast[0].y);
    for (let i = 1; i < coast.length; i++) ctx.lineTo(coast[i].x, coast[i].y);
    ctx.closePath();
    ctx.clip();
    const baseBorderW = Math.max(1, Math.floor(Math.min(w, h) / 460));
    for (const b of borders){
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i].x, b.pts[i].y);
      ctx.globalAlpha = b.artificial ? 0.52 : 0.36;
      ctx.lineWidth = b.artificial ? baseBorderW * 1.05 : baseBorderW * 0.9;
      ctx.strokeStyle = 'rgba(36,31,24,1)';
      ctx.stroke();
    }
    ctx.restore();

    // Route: dotted links between in-country stops + moving highlight that pauses at stops.
    if (route.stops.length > 0){
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = 'rgba(196, 65, 42, 0.65)';
      ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) / 240));
      ctx.setLineDash([8, 10]);
      ctx.lineDashOffset = -t * 18;
      for (let i = 0; i < route.stops.length - 1; i++){
        const a = route.stops[i];
        const b = route.stops[i + 1];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      ctx.setLineDash([]);
      const stopR = Math.max(3, Math.floor(Math.min(w, h) * 0.007));
      ctx.fillStyle = 'rgba(196, 65, 42, 0.52)';
      for (const p of route.stops){
        ctx.beginPath();
        ctx.arc(p.x, p.y, stopR, 0, Math.PI * 2);
        ctx.fill();
      }

      const p = routePositionAtTime(route, segT);
      if (p){
        const pulse = 0.55 + 0.45 * Math.sin(t * 3.2);
        const pr = Math.max(5, Math.floor(Math.min(w, h) * 0.012));
        ctx.fillStyle = `rgba(196, 65, 42, ${0.76 + 0.2 * pulse})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = 'rgba(196, 65, 42, 1)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, pr * 2.15 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // channel title above map
    const font = Math.max(16, Math.floor(Math.min(w, h) / 34));
    const titleY = Math.max(10, my - Math.floor(font * 1.35));
    ctx.font = `bold ${Math.floor(font * 1.08)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(232, 226, 208, 0.88)';
    ctx.textBaseline = 'top';
    ctx.fillText('THE TINY TRAVEL DESK', mx + Math.floor(mw * 0.05), titleY);

    ctx.restore();

    return { mx, my, mw, mh, font };
  }

  function drawStreetScreen(ctx, layout){
    const sw = Math.floor(w * 0.38);
    const sh = Math.floor(h * 0.28);
    const sx = Math.floor(w * 0.58);
    const sy = Math.floor(h * 0.18);
    const r = Math.floor(Math.min(w, h) * 0.02);

    // frame shadow
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundedRect(ctx, sx + 10, sy + 12, sw, sh, r);
    ctx.fill();
    ctx.restore();

    // frame
    ctx.save();
    ctx.fillStyle = 'rgba(18, 20, 26, 0.92)';
    roundedRect(ctx, sx, sy, sw, sh, r);
    ctx.fill();

    // screen area
    const pad = Math.floor(sw * 0.06);
    const ix = sx + pad;
    const iy = sy + pad;
    const iw = sw - pad * 2;
    const ih = sh - pad * 2;

    ctx.save();
    roundedRect(ctx, ix, iy, iw, ih, Math.floor(r * 0.65));
    ctx.clip();

    // sky
    const g = ctx.createLinearGradient(ix, iy, ix, iy + ih);
    g.addColorStop(0, dest.palette.sky0);
    g.addColorStop(1, dest.palette.sky1);
    ctx.fillStyle = g;
    ctx.fillRect(ix, iy, iw, ih);

    // parallax street
    const sp = (dest.speed || 36) * (w / 960);
    const baseShift = t * sp;

    // horizon glow
    ctx.save();
    const hz = iy + street.horizon;
    const hg = ctx.createLinearGradient(ix, hz - ih * 0.15, ix, hz + ih * 0.2);
    hg.addColorStop(0, 'rgba(255,255,255,0)');
    hg.addColorStop(1, `rgba(255,255,255,0.08)`);
    ctx.fillStyle = hg;
    ctx.fillRect(ix, iy, iw, ih);
    ctx.restore();

    const groundY = Math.floor(iy + street.horizon);
    for (const layer of street.layers){
      const tone = Math.floor(12 + (1 - layer.depth) * 24);
      const layerParallax = 0.3 + 0.8 * layer.depth;
      const wrap = layer.stripWidth;
      const layerShift = -((baseShift * layerParallax) % wrap);
      for (const b of layer.buildings){
        for (let rep = -1; rep <= 2; rep++){
          const bx = Math.floor(ix + (b.x - layer.stripStart) + layerShift + rep * wrap);
          const by = Math.floor(groundY - b.h);
          const bw = Math.ceil(b.w);
          const bh = Math.ceil(b.h) + 1;
          if (bx + bw < ix || bx > ix + iw) continue;
          ctx.fillStyle = `rgb(${tone}, ${tone + 3}, ${tone + 7})`;
          ctx.fillRect(bx, by, bw, bh);

          // rare-event windows: mostly stable with occasional on/off changes
          const ww = bw / (b.cols + 1);
          const wh = bh / (b.rows + 1);
          for (let r0 = 1; r0 <= b.rows; r0++){
            for (let c0 = 1; c0 <= b.cols; c0++){
              const wi = (r0 - 1) * b.cols + (c0 - 1);
              if (!b.lights[wi]) continue;
              const twinkle = 0.82 + 0.18 * Math.sin(t * 0.35 + b.seed + wi * 0.17);
              ctx.fillStyle = `rgba(255, 210, 140, ${(0.06 + 0.08 * layer.depth) * twinkle})`;
              ctx.fillRect(
                Math.floor(bx + c0 * ww),
                Math.floor(by + r0 * wh),
                Math.max(1, Math.floor(ww * 0.35)),
                Math.max(1, Math.floor(wh * 0.35))
              );
            }
          }
        }
      }
    }

    // anchor silhouettes to a ground strip so skylines never appear to float
    const groundH = Math.max(4, Math.floor(ih * 0.07));
    ctx.fillStyle = 'rgba(12, 17, 29, 1)';
    ctx.fillRect(ix, groundY - 1, iw, groundH);
    ctx.fillStyle = 'rgba(52, 86, 158, 0.85)';
    ctx.fillRect(ix, groundY - 1, iw, 1);

    // scanlines
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const sl = Math.max(2, Math.floor(ih / 80));
    for (let y = 0; y < ih; y += sl){
      if ((y / sl) % 2 === 0) ctx.fillRect(ix, iy + y, iw, 1);
    }
    // moving tape-glitch bar: keep it in the top third so it never intersects the skyline
    const scanAreaH = Math.max(18, Math.floor(ih * 0.33));
    const bandH = 14;
    const maxBandTop = iy + scanAreaH - bandH;
    const gy = iy + ((t * 22) % Math.max(1, (maxBandTop - iy) + 1));
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillRect(ix, gy, iw, bandH);
    ctx.restore();
    ctx.restore();

    // caption
    const font = layout.font;
    ctx.save();
    ctx.font = `bold ${Math.floor(font * 1.02)}px ui-sans-serif, system-ui`;
    ctx.lineWidth = Math.max(1, Math.floor(font * 0.07));
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.fillStyle = 'rgba(245, 248, 252, 0.96)';
    ctx.textBaseline = 'top';
    ctx.strokeText('STREET FEED', sx + Math.floor(sw * 0.08), sy + Math.floor(sh * 0.06));
    ctx.fillText('STREET FEED', sx + Math.floor(sw * 0.08), sy + Math.floor(sh * 0.06));
    ctx.restore();

    ctx.restore();

    return { sx, sy, sw, sh };
  }

  function drawPostcard(ctx, layout){
    const pw = Math.floor(w * 0.38);
    const ph = Math.floor(h * 0.30);
    const px = Math.floor(w * 0.58);
    const py = Math.floor(h * 0.53);
    const r = Math.floor(Math.min(w, h) * 0.02);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    roundedRect(ctx, px + 10, py + 14, pw, ph, r);
    ctx.fill();
    ctx.restore();

    // card
    ctx.save();
    ctx.fillStyle = 'rgba(248, 244, 234, 0.98)';
    roundedRect(ctx, px, py, pw, ph, r);
    ctx.fill();

    // divider line
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + pw * 0.55, py + ph * 0.10);
    ctx.lineTo(px + pw * 0.55, py + ph * 0.92);
    ctx.stroke();

    // stamp box
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(140, 50, 40, 1)';
    ctx.lineWidth = 2;
    const sx = px + pw * 0.72;
    const sy = py + ph * 0.12;
    const sw = pw * 0.20;
    const sh = ph * 0.22;
    roundedRect(ctx, sx, sy, sw, sh, Math.floor(r * 0.7));
    ctx.stroke();

    // stamp "ink"
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = 'rgba(140, 50, 40, 1)';
    ctx.font = `bold ${Math.floor(layout.font * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('AIR', sx + sw * 0.18, sy + sh * 0.18);
    ctx.fillText('MAIL', sx + sw * 0.12, sy + sh * 0.55);

    // left note
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(10,10,10,0.85)';
    ctx.font = `bold ${Math.floor(layout.font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.fillText(`${dest.city}, ${dest.country}`, px + pw * 0.08, py + ph * 0.16);

    ctx.font = `${Math.floor(layout.font * 0.92)}px ui-sans-serif, system-ui`;
    ctx.globalAlpha = 0.78;
    ctx.fillText(`Region: ${dest.region}`, px + pw * 0.08, py + ph * 0.30);

    // info bullets (highlighted by phase)
    const phase = (segT / SEG_DUR);
    const hi = Math.min(3, Math.floor(phase * 4));
    const items = [
      { k: 'STREET', v: dest.vibe },
      { k: 'FOOD', v: dest.food },
      { k: 'HISTORY', v: dest.fact },
      { k: 'HUMOR', v: humorForDestination(dest) },
    ];

    let y = py + ph * 0.40;
    const x = px + pw * 0.08;
    for (let i = 0; i < items.length; i++){
      const it = items[i];
      const a = i === hi ? 0.94 : 0.68;
      ctx.globalAlpha = a;
      ctx.fillStyle = i === hi ? `rgba(0,0,0,0.82)` : `rgba(0,0,0,0.72)`;
      ctx.font = `${Math.floor(layout.font * 0.84)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(`${it.k}:`, x, y);

      ctx.font = `${Math.floor(layout.font * 0.84)}px ui-sans-serif, system-ui`;
      const tx = x + pw * 0.16;
      // wrap-ish: split long values for postcard width (stay left of divider)
      const text = String(it.v);
      const dividerX = px + pw * 0.55;
      const pad = pw * 0.03;
      const maxW = Math.max(24, dividerX - pad - tx);
      const words = text.split(' ');
      let line = '';
      const lines = [];
      for (const wd of words){
        const next = line ? (line + ' ' + wd) : wd;
        if (ctx.measureText(next).width > maxW && line){
          lines.push(line);
          line = wd;
        } else {
          line = next;
        }
      }
      if (line) lines.push(line);
      if (!lines.length) lines.push('');

      const lineH = Math.floor(layout.font * 0.98);
      const maxLines = 2;
      const hasOverflow = lines.length > maxLines;
      const renderLines = lines.slice(0, maxLines);

      if (hasOverflow){
        const ell = '…';
        const base = renderLines[maxLines - 1] || '';

        if (ctx.measureText(base + ell).width <= maxW){
          renderLines[maxLines - 1] = base + ell;
        } else {
          const wds = base.split(' ');
          while (wds.length && ctx.measureText(wds.join(' ') + ell).width > maxW){
            wds.pop();
          }
          renderLines[maxLines - 1] = wds.length ? (wds.join(' ') + ell) : ell;
        }
      }

      const usedLines = Math.max(1, renderLines.length);
      for (let li = 0; li < usedLines; li++){
        ctx.fillText(renderLines[li], tx, y + li * lineH);
      }
      y += usedLines * lineH;
    }

    // tiny coffee steam (desk ambience)
    ctx.save();
    const cx = px + pw * 0.90;
    const cy = py + ph * 0.78;
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = Math.max(2, Math.floor(layout.font * 0.12));
    for (let i = 0; i < 3; i++){
      const ox = (i - 1) * layout.font * 0.22;
      ctx.beginPath();
      for (let k = 0; k < 22; k++){
        const p = k / 21;
        const xx = cx + ox + Math.sin(t * 1.2 + p * 6 + i) * layout.font * 0.10;
        const yy = cy - p * layout.font * (1.6 + 0.3 * i);
        if (k === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawDesk(ctx);
    const layout = drawMap(ctx);
    drawStreetScreen(ctx, layout);
    drawPostcard(ctx, layout);

    // gentle vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // small status strip
    ctx.save();
    const font = layout.font;
    ctx.font = `${Math.floor(font * 0.78)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(245, 240, 230, 0.45)';
    ctx.textBaseline = 'bottom';
    const eta = Math.max(0, Math.ceil(SEG_DUR - segT));
    ctx.fillText(`DESTINATION ROTATES IN ${eta}s`, Math.floor(w * 0.05), Math.floor(h * 0.95));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
