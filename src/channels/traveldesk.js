// REVIEWED: 2026-02-15
import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';
import { COUNTRY_SHAPES } from '../data/countryShapes.js';

const pick = (rand, a) => a[(rand() * a.length) | 0];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp255 = (v) => clamp(v | 0, 0, 255);

function hashStr(s){
  // FNV-1a
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hexToRgb(hex){
  const h = String(hex || '').trim().replace(/^#/, '');
  if (h.length === 3){
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length === 6){
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return { r: 255, g: 255, b: 255 };
}

function mixRgb(a, b, k){
  const kk = clamp(k, 0, 1);
  return {
    r: clamp255(a.r + (b.r - a.r) * kk),
    g: clamp255(a.g + (b.g - a.g) * kk),
    b: clamp255(a.b + (b.b - a.b) * kk),
  };
}

function streetStyleForDestination(d){
  const accent = hexToRgb(d?.palette?.accent);
  const sky0 = hexToRgb(d?.palette?.sky0);
  const sky1 = hexToRgb(d?.palette?.sky1);

  // stable per-destination accent shifts (so each city has its own “street feed” signature)
  const rr = mulberry32(hashStr(destinationKey(d)));
  const wob = () => (rr() * 2 - 1);

  const baseShift = {
    dr: clamp((accent.r - 128) / 24, -7, 7),
    dg: clamp((accent.g - 128) / 24, -7, 7),
    db: clamp((accent.b - 128) / 24, -7, 7),
  };

  const dr = clamp((baseShift.dr + wob() * 4) | 0, -12, 12);
  const dg = clamp((baseShift.dg + wob() * 4) | 0, -12, 12);
  const db = clamp((baseShift.db + wob() * 4) | 0, -12, 12);

  const warmWindow = { r: 255, g: 210, b: 140 };
  const windowMix = 0.22 + rr() * 0.50;
  const window = mixRgb(warmWindow, accent, windowMix);

  const ground = mixRgb({ r: 12, g: 17, b: 29 }, sky0, 0.18 + rr() * 0.22);
  const edge = mixRgb({ r: 52, g: 86, b: 158 }, sky1, 0.12 + rr() * 0.18);

  return { dr, dg, db, window, ground, edge };
}

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
  {
    city: 'Prague',
    country: 'Czechia',
    region: 'River & Spires',
    vibe: 'cobbles, bridges, late-night jazz',
    food: 'Svíčková',
    fact: 'The skyline reads like a catalogue of towers, domes, and stubborn stone.',
    palette: { sky0: '#090c16', sky1: '#253a70', accent: '#f6bd60', ink: '#101018' },
    speed: 33,
  },
  {
    city: 'Seoul',
    country: 'South Korea',
    region: 'Night Markets',
    vibe: 'neon, cafés, subway chimes',
    food: 'Tteokbokki',
    fact: 'A city that reinvents itself quickly — but keeps its alleys like secrets.',
    palette: { sky0: '#040913', sky1: '#1b2d57', accent: '#00f5d4', ink: '#0b0d12' },
    speed: 52,
  },
  {
    city: 'Cape Town',
    country: 'South Africa',
    region: 'Cape Peninsula',
    vibe: 'ocean wind, cliffs, mountain shadows',
    food: 'Bobotie',
    fact: 'Two oceans meet nearby, still debating which one gets to be “chilly.”',
    palette: { sky0: '#031622', sky1: '#0b4f6c', accent: '#ffb703', ink: '#051018' },
    speed: 41,
  },
  {
    city: 'Buenos Aires',
    country: 'Argentina',
    region: 'River Plains',
    vibe: 'tangos, bookstores, late dinners',
    food: 'Asado',
    fact: 'Café culture here is a gentle negotiation with time — not a schedule.',
    palette: { sky0: '#0a0a13', sky1: '#3b1d4a', accent: '#e63946', ink: '#100a12' },
    speed: 39,
  },
  {
    city: 'Mumbai',
    country: 'India',
    region: 'Monsoon Coast',
    vibe: 'markets, sea breeze, honking poetry',
    food: 'Vada pav',
    fact: 'When the rains arrive, the whole city learns a new choreography overnight.',
    palette: { sky0: '#0b0b11', sky1: '#23395b', accent: '#f77f00', ink: '#110d0f' },
    speed: 49,
  },
  {
    city: 'Auckland',
    country: 'New Zealand',
    region: 'Volcanic Harbors',
    vibe: 'sails, clean air, black-sand daydreams',
    food: 'Hāngī',
    fact: 'A city built across old lava fields, now mostly occupied by good views.',
    palette: { sky0: '#061018', sky1: '#1b4965', accent: '#a7c957', ink: '#0d1216' },
    speed: 35,
  },
  {
    city: 'Cairo',
    country: 'Egypt',
    region: 'Nile Cities',
    vibe: 'river lights, old stone, late tea',
    food: 'Koshari',
    fact: 'The city keeps time with a river older than calendars and louder than clocks.',
    palette: { sky0: '#0f0b05', sky1: '#3d2a1a', accent: '#ffd166', ink: '#140d07' },
    speed: 44,
  },
  {
    city: 'Vancouver',
    country: 'Canada',
    region: 'Pacific Rain',
    vibe: 'glass towers, cedar air, mountain silhouettes',
    food: 'Salmon + cedar',
    fact: 'Forest and city share a border here; both seem determined to win.',
    palette: { sky0: '#061018', sky1: '#1b4965', accent: '#7ae582', ink: '#0d1216' },
    speed: 31,
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
  Prague: 'Every bridge insists it’s the main character.',
  Seoul: 'Neon signs compete for your attention like polite billboards.',
  'Cape Town': 'The mountain watches you pack the wrong jacket.',
  'Buenos Aires': 'Dinner starts when other cities are already asleep.',
  Mumbai: 'Traffic horns form a symphony with strong opinions.',
  Auckland: 'Seagulls run a robust freelance tax policy.',
  Cairo: 'Cats patrol ruins like tiny archaeologists.',
  Vancouver: 'Rain arrives on schedule; your plans do not.',
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

  // occasional foreground passes to keep the inset feed from feeling static over long runs
  const fgWrap = ww * (2.6 + rand() * 1.2);
  const fgCount = 2 + ((rand() * 4) | 0); // 2..5
  const fgItems = [];
  for (let i = 0; i < fgCount; i++){
    const roll = rand();
    const kind = roll < 0.40 ? 'pole' : (roll < 0.65 ? 'bus' : (roll < 0.90 ? 'sign' : 'moon'));
    fgItems.push({
      kind,
      x: rand() * fgWrap,
      s: 0.8 + rand() * 0.6,
      y: rand(),
    });
  }
  fgItems.sort((a, b) => a.x - b.x);

  return { horizon, layers, rand, fg: { wrap: fgWrap, items: fgItems } };
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
  let streetStyle = null;

  // special desk moments (rare, deterministic; separate RNG so core visuals stay stable)
  let momentRand = null;
  let nextMomentSeg = 0;
  let activeMoment = null;

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
    const mh = Math.floor(h * 0.72);
    const mx = pad;
    const my = Math.floor(h * 0.12);
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
    street = makeStreet(r, w * 0.36, h * 0.26);
    streetStyle = streetStyleForDestination(dest);
  }

  function startMoment(){
    if (!momentRand) momentRand = mulberry32((seed ^ 0x7f4a7c15) >>> 0);
    const type = momentRand() < 0.52 ? 'PASSPORT_STAMP' : 'ROUTE_UPDATE';
    const dur = type === 'PASSPORT_STAMP' ? (6.6 + momentRand() * 2.2) : (7.2 + momentRand() * 2.6);
    activeMoment = { type, t: 0, dur };
    const gap = 2 + ((momentRand() * 4) | 0); // 2..5 segments (~minutes)
    nextMomentSeg = segIx + gap;
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    segIx = 0;
    segT = 0;
    lastDestKey = '';
    normalCycleCache.clear();
    momentRand = mulberry32((seed ^ 0x7f4a7c15) >>> 0);
    nextMomentSeg = 2 + ((momentRand() * 4) | 0); // 2..5 minutes
    activeMoment = null;
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
      if (segIx === nextMomentSeg) startMoment();
    }

    if (activeMoment){
      activeMoment.t += dt;
      if (activeMoment.t >= activeMoment.dur) activeMoment = null;
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
    const mh = Math.floor(h * 0.72);
    const mx = pad;
    const my = Math.floor(h * 0.12);
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
    const momentType = activeMoment?.type || '';
    const momentAlpha = activeMoment
      ? Math.max(0, Math.min(1, (activeMoment.t / 0.7)) * Math.min(1, ((activeMoment.dur - activeMoment.t) / 1.0)))
      : 0;
    if (route.stops.length > 0){
      ctx.save();
      ctx.globalAlpha = 0.85;

      let routeStroke = 'rgba(196, 65, 42, 0.65)';
      let stopFill = 'rgba(196, 65, 42, 0.52)';
      let dash = [8, 10];
      let dashSpeed = 18;
      let widthMul = 1;

      if (momentAlpha > 0 && momentType){
        if (momentType === 'ROUTE_UPDATE'){
          routeStroke = `rgba(90, 230, 255, ${0.55 + 0.35 * momentAlpha})`;
          stopFill = `rgba(90, 230, 255, ${0.32 + 0.30 * momentAlpha})`;
          dash = [4, 8];
          dashSpeed = 34;
          widthMul = 1.35;
        } else if (momentType === 'PASSPORT_STAMP'){
          routeStroke = `rgba(90, 210, 120, ${0.48 + 0.28 * momentAlpha})`;
          stopFill = `rgba(90, 210, 120, ${0.28 + 0.25 * momentAlpha})`;
          dash = [10, 8];
          dashSpeed = 22;
          widthMul = 1.15;
        }
      }

      ctx.strokeStyle = routeStroke;
      ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) / 240)) * widthMul;
      ctx.setLineDash(dash);
      ctx.lineDashOffset = -t * dashSpeed;
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
      ctx.fillStyle = stopFill;
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

      if (momentAlpha > 0 && momentType === 'ROUTE_UPDATE'){
        const tagW = Math.floor(mw * 0.30);
        const tagH = Math.floor(mh * 0.08);
        const tx = mx + Math.floor(mw * 0.06);
        const ty = my + Math.floor(mh * 0.06);
        ctx.save();
        ctx.globalAlpha = 0.85 * momentAlpha;
        ctx.fillStyle = 'rgba(10, 12, 18, 0.62)';
        roundedRect(ctx, tx, ty, tagW, tagH, Math.floor(tagH * 0.45));
        ctx.fill();
        ctx.strokeStyle = 'rgba(90, 230, 255, 0.85)';
        ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) / 520));
        ctx.stroke();
        const f = Math.max(12, Math.floor(Math.min(w, h) / 46));
        ctx.font = `bold ${f}px ui-sans-serif, system-ui`;
        ctx.fillStyle = 'rgba(90, 230, 255, 0.96)';
        ctx.textBaseline = 'middle';
        ctx.fillText('ROUTE UPDATE', tx + Math.floor(tagW * 0.10), ty + Math.floor(tagH * 0.53));
        ctx.restore();
      }

      if (momentAlpha > 0 && momentType === 'PASSPORT_STAMP'){
        const sw = mw * 0.32;
        const sh = mh * 0.16;
        const sx = mx + mw * 0.60;
        const sy = my + mh * 0.08;
        ctx.save();
        ctx.translate(sx + sw * 0.5, sy + sh * 0.5);
        ctx.rotate(-0.18);
        ctx.globalAlpha = 0.80 * momentAlpha;
        const rr = Math.min(sw, sh) * 0.22;
        ctx.strokeStyle = 'rgba(140, 50, 40, 0.95)';
        ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) / 280));
        ctx.setLineDash([7, 7]);
        roundedRect(ctx, -sw * 0.5, -sh * 0.5, sw, sh, rr);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.10 * momentAlpha;
        ctx.fillStyle = 'rgba(140, 50, 40, 1)';
        roundedRect(ctx, -sw * 0.5, -sh * 0.5, sw, sh, rr);
        ctx.fill();

        const f = Math.max(12, Math.floor(Math.min(w, h) / 46));
        ctx.globalAlpha = 0.88 * momentAlpha;
        ctx.fillStyle = 'rgba(140, 50, 40, 0.95)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.floor(f * 1.12)}px ui-sans-serif, system-ui`;
        ctx.fillText('PASSPORT STAMP', 0, -f * 0.20);
        ctx.font = `bold ${Math.floor(f * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        ctx.fillText(String(dest.country || '').toUpperCase(), 0, f * 0.70);
        ctx.restore();
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
    const sw = Math.floor(w * 0.40);
    const sh = Math.floor(h * 0.30);
    const sx = Math.floor(w * 0.57);
    const sy = Math.floor(h * 0.16);
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

    const style = streetStyle || {};
    const dr = style.dr || 0;
    const dg = style.dg || 0;
    const db = style.db || 0;
    const win = style.window || { r: 255, g: 210, b: 140 };
    const ground = style.ground || { r: 12, g: 17, b: 29 };
    const edge = style.edge || { r: 52, g: 86, b: 158 };
    const accent = hexToRgb(dest?.palette?.accent);

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
          ctx.fillStyle = `rgb(${clamp255(tone + dr)}, ${clamp255(tone + 3 + dg)}, ${clamp255(tone + 7 + db)})`;
          ctx.fillRect(bx, by, bw, bh);

          // rare-event windows: mostly stable with occasional on/off changes
          const ww = bw / (b.cols + 1);
          const wh = bh / (b.rows + 1);
          for (let r0 = 1; r0 <= b.rows; r0++){
            for (let c0 = 1; c0 <= b.cols; c0++){
              const wi = (r0 - 1) * b.cols + (c0 - 1);
              if (!b.lights[wi]) continue;
              const twinkle = 0.82 + 0.18 * Math.sin(t * 0.35 + b.seed + wi * 0.17);
              ctx.fillStyle = `rgba(${win.r}, ${win.g}, ${win.b}, ${(0.06 + 0.08 * layer.depth) * twinkle})`;
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
    ctx.fillStyle = `rgb(${ground.r}, ${ground.g}, ${ground.b})`;
    ctx.fillRect(ix, groundY - 1, iw, groundH);
    ctx.fillStyle = `rgba(${edge.r}, ${edge.g}, ${edge.b}, 0.85)`;
    ctx.fillRect(ix, groundY - 1, iw, 1);

    // foreground passes (fast parallax silhouettes / neon bits)
    const fg = street.fg;
    if (fg?.items?.length){
      const wrap = Math.max(1, fg.wrap || (iw * 3));
      const fgShift = -((baseShift * 1.55) % wrap);
      const baseAlpha = 0.55;

      for (const it of fg.items){
        for (let rep = -1; rep <= 1; rep++){
          const xx = ix + it.x + fgShift + rep * wrap;
          if (xx < ix - iw * 0.8 || xx > ix + iw * 1.8) continue;

          if (it.kind === 'pole'){
            const poleW = Math.max(2, Math.floor(iw * (0.012 * it.s)));
            const poleH = Math.floor(ih * (0.78 + 0.16 * it.s));
            const px = Math.floor(xx - poleW * 0.5);
            const py = Math.floor(groundY - poleH);
            ctx.save();
            ctx.globalAlpha = baseAlpha;
            ctx.fillStyle = 'rgba(0,0,0,0.92)';
            ctx.fillRect(px, py, poleW, poleH);

            // lamp head + tiny glow
            const arm = Math.max(6, Math.floor(poleW * 2.6));
            ctx.fillRect(px, py + Math.floor(poleW * 1.3), arm, Math.max(2, Math.floor(poleW * 0.55)));
            ctx.globalAlpha = baseAlpha * 0.35;
            ctx.fillStyle = `rgba(${win.r}, ${win.g}, ${win.b}, 1)`;
            ctx.fillRect(
              px + arm - Math.floor(poleW * 0.35),
              py + Math.floor(poleW * 1.0),
              Math.max(2, Math.floor(poleW * 0.7)),
              Math.max(2, Math.floor(poleW * 0.7))
            );
            ctx.restore();
          } else if (it.kind === 'bus'){
            const bw = Math.floor(iw * (0.26 + 0.10 * it.s));
            const bh = Math.floor(ih * (0.10 + 0.05 * it.s));
            const bx = Math.floor(xx - bw * 0.5);
            const by = Math.floor(groundY - bh + groundH * 0.10);
            ctx.save();
            ctx.globalAlpha = baseAlpha * 0.95;
            ctx.fillStyle = 'rgba(0,0,0,0.88)';
            roundedRect(ctx, bx, by, bw, bh, Math.floor(bh * 0.18));
            ctx.fill();

            // windows
            ctx.globalAlpha = baseAlpha * 0.22;
            ctx.fillStyle = `rgba(${win.r}, ${win.g}, ${win.b}, 1)`;
            const wx = bx + Math.floor(bw * 0.12);
            const wy = by + Math.floor(bh * 0.22);
            ctx.fillRect(wx, wy, Math.floor(bw * 0.70), Math.floor(bh * 0.32));

            // wheels
            ctx.globalAlpha = baseAlpha * 0.75;
            ctx.fillStyle = 'rgba(0,0,0,0.92)';
            const wr = Math.max(2, Math.floor(bh * 0.20));
            ctx.beginPath();
            ctx.arc(bx + Math.floor(bw * 0.25), by + bh, wr, 0, Math.PI * 2);
            ctx.arc(bx + Math.floor(bw * 0.75), by + bh, wr, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (it.kind === 'sign'){
            const poleW = Math.max(2, Math.floor(iw * (0.010 * it.s)));
            const poleH = Math.floor(ih * (0.35 + 0.25 * it.y));
            const boardW = Math.floor(iw * (0.16 + 0.10 * it.s));
            const boardH = Math.floor(ih * (0.06 + 0.05 * it.s));
            const px = Math.floor(xx - poleW * 0.5);
            const py = Math.floor(groundY - poleH);
            const bx = Math.floor(xx - boardW * 0.5);
            const by = Math.floor(py - boardH * 0.15);

            ctx.save();
            ctx.globalAlpha = baseAlpha;
            ctx.fillStyle = 'rgba(0,0,0,0.92)';
            ctx.fillRect(px, py, poleW, poleH + Math.floor(groundH * 0.15));

            // neon-ish board
            ctx.globalAlpha = 0.92;
            ctx.fillStyle = 'rgba(0,0,0,0.70)';
            roundedRect(ctx, bx, by, boardW, boardH, Math.floor(boardH * 0.28));
            ctx.fill();
            ctx.save();
            ctx.globalAlpha = 0.80;
            ctx.shadowColor = `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.65)`;
            ctx.shadowBlur = Math.max(6, Math.floor(boardH * 0.9));
            ctx.strokeStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.85)`;
            ctx.lineWidth = Math.max(2, Math.floor(boardH * 0.18));
            roundedRect(ctx, bx, by, boardW, boardH, Math.floor(boardH * 0.28));
            ctx.stroke();
            ctx.restore();

            ctx.restore();
          } else if (it.kind === 'moon'){
            const mr = ih * (0.05 + 0.05 * it.s);
            const mx = xx;
            const my = iy + ih * (0.18 + 0.26 * it.y);
            ctx.save();
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = 'rgba(245, 246, 255, 1)';
            ctx.beginPath();
            ctx.arc(mx, my, mr, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.08;
            ctx.fillStyle = 'rgba(245, 246, 255, 1)';
            ctx.beginPath();
            ctx.arc(mx - mr * 0.22, my - mr * 0.10, mr * 0.58, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
    }

    // scanlines
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const sl = Math.max(2, Math.floor(ih / 80));
    for (let y = 0; y < ih; y += sl){
      if ((y / sl) % 2 === 0) ctx.fillRect(ix, iy + y, iw, 1);
    }
    // moving tape-glitch bar: sweep the full feed height
    const bandH = 14;
    const gy = iy - bandH + ((t * 48) % (ih + bandH));
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


  function drawPostcardBack(ctx, layout){
    const pw = Math.floor(w * 0.40);
    const ph = Math.floor(h * 0.32);
    const px = Math.floor(w * 0.57);
    const py = Math.floor(h * 0.50);
    const r = Math.floor(Math.min(w, h) * 0.02);

    const dividerX = px + pw * 0.55;

    const wrapLines = (text, maxW) => {
      const words = String(text || '').split(/\s+/).filter(Boolean);
      const lines = [];
      let line = '';
      for (const wd of words){
        const next = line ? (line + ' ' + wd) : wd;
        if (line && ctx.measureText(next).width > maxW){
          lines.push(line);
          line = wd;
        } else {
          line = next;
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [''];
    };

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    roundedRect(ctx, px + 10, py + 14, pw, ph, r);
    ctx.fill();
    ctx.restore();

    // card base
    ctx.save();
    ctx.globalAlpha = 0.98;
    ctx.fillStyle = 'rgba(248, 244, 234, 0.98)';
    roundedRect(ctx, px, py, pw, ph, r);
    ctx.fill();

    // subtle paper speckle
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (let i = 0; i < 72; i++){
      const xx = px + (i * 997) % Math.max(1, pw - 10);
      const yy = py + (i * 613) % Math.max(1, ph - 10);
      ctx.fillRect(xx, yy, 1, 1);
    }
    ctx.restore();

    // airmail stripe (top edge)
    ctx.save();
    const stripeH = Math.max(6, Math.floor(ph * 0.08));
    ctx.globalAlpha = 0.12;
    for (let x = px - pw; x < px + pw * 2; x += Math.max(16, Math.floor(pw * 0.06))){
      ctx.fillStyle = 'rgba(220, 60, 70, 1)';
      ctx.fillRect(x, py + Math.floor(stripeH * 0.25), Math.floor(pw * 0.03), Math.floor(stripeH * 0.55));
      ctx.fillStyle = 'rgba(30, 90, 200, 1)';
      ctx.fillRect(x + Math.floor(pw * 0.03), py + Math.floor(stripeH * 0.25), Math.floor(pw * 0.03), Math.floor(stripeH * 0.55));
    }
    ctx.restore();

    // divider (slightly wobbly)
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++){
      const p = i / 12;
      const yy = py + ph * (0.10 + p * 0.82);
      const wob = Math.sin((p * 7.2) + 0.6) * (pw * 0.0025);
      const xx = dividerX + wob;
      if (i == 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.restore();

    // stamp box
    const sx = px + pw * 0.72;
    const sy = py + ph * 0.12;
    const sw = pw * 0.20;
    const sh = ph * 0.22;

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(140, 50, 40, 1)';
    ctx.lineWidth = 2;
    roundedRect(ctx, sx, sy, sw, sh, Math.floor(r * 0.7));
    ctx.stroke();

    // perforation ticks
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = 'rgba(140, 50, 40, 1)';
    ctx.lineWidth = 1;
    const tick = Math.max(3, Math.floor(sw * 0.08));
    for (let i = 0; i < 10; i++){
      const px0 = sx + (i / 10) * sw;
      ctx.beginPath();
      ctx.moveTo(px0, sy);
      ctx.lineTo(px0 + tick * 0.35, sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px0, sy + sh);
      ctx.lineTo(px0 + tick * 0.35, sy + sh);
      ctx.stroke();
    }
    ctx.restore();

    // cancellation mark over stamp
    ctx.save();
    ctx.globalAlpha = 0.20;
    ctx.strokeStyle = 'rgba(140, 50, 40, 1)';
    ctx.lineWidth = Math.max(2, Math.floor(layout.font * 0.10));
    const cx = sx + sw * 0.45;
    const cy = sy + sh * 0.55;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(sw, sh) * 0.40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 4; i++){
      const yy = sy + sh * (0.30 + i * 0.14);
      ctx.beginPath();
      for (let k = 0; k <= 16; k++){
        const p = k / 16;
        const xx = sx - sw * 0.12 + p * (sw * 1.45);
        const wob = Math.sin(p * Math.PI * 6 + i) * (sh * 0.06);
        if (k == 0) ctx.moveTo(xx, yy + wob);
        else ctx.lineTo(xx, yy + wob);
      }
      ctx.stroke();
    }
    ctx.restore();

    // left side: parody message
    const pr = mulberry32((seed ^ hashStr(destinationKey(dest)) ^ (segIx * 0x27d4eb2d)) >>> 0);
    const opener = pick(pr, ['DEAR MUM,', 'DEAR FRIEND,', 'GREETINGS,', 'DEAR SOMEONE IMPORTANT,']);
    const closer = pick(pr, ['WISH YOU WERE HERE.', 'SEND SNACKS.', 'PLEASE FORWARD ALL MAIL TO THE MOON.', 'I HAVE BECOME A LOCAL ATTRACTION.']);
    const msg = [
      `${opener}`,
      `I’M IN ${String(dest.city || '').toUpperCase()} (${String(dest.country || '').toUpperCase()}).`,
      `CURRENT VIBE: ${dest.vibe}.`,
      `I TRIED ${dest.food}. WOULD RECOMMEND TO A BRAVE ADULT.`,
      humorForDestination(dest),
      `${closer}`,
    ].join(' ');

    const mx = px + pw * 0.08;
    const my = py + ph * 0.18;
    const maxW = Math.max(24, dividerX - mx - pw * 0.04);
    const maxH = Math.max(24, ph * 0.50);

    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(10,10,10,0.82)';
    const f = Math.max(10, Math.floor(layout.font * 0.74));
    ctx.font = `italic ${f}px ui-serif, Georgia, Times, serif`;
    ctx.textBaseline = 'top';

    const lines = wrapLines(msg, maxW);
    const lineH = Math.floor(f * 1.15);
    const maxLines = Math.max(4, Math.floor(maxH / Math.max(1, lineH)));
    const drawLines = lines.slice(0, maxLines);
    for (let i = 0; i < drawLines.length; i++){
      ctx.fillText(drawLines[i], mx, my + i * lineH);
    }

    // greetings header (bottom-left)
    ctx.globalAlpha = 0.70;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.font = `bold ${Math.floor(layout.font * 0.72)}px ui-sans-serif, system-ui`;
    ctx.fillText('GREETINGS FROM', mx, py + ph * 0.78);
    ctx.globalAlpha = 0.86;
    ctx.font = `900 ${Math.floor(layout.font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.fillText(String(dest.city || '').toUpperCase(), mx, py + ph * 0.84);
    ctx.restore();

    // right side: address lines
    const ax = dividerX + pw * 0.06;
    let ay = py + ph * 0.20;
    const aw = px + pw - ax - pw * 0.06;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.80)';
    ctx.globalAlpha = 0.78;
    ctx.font = `bold ${Math.floor(layout.font * 0.82)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('TO:', ax, ay);

    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = 1;
    const lh = Math.floor(layout.font * 0.95);
    ay += lh * 1.2;

    const addrLines = 4;
    for (let i = 0; i < addrLines; i++){
      const yy = ay + i * lh;
      ctx.beginPath();
      ctx.moveTo(ax, yy + lh * 0.70);
      ctx.lineTo(ax + aw, yy + lh * 0.70);
      ctx.stroke();
    }

    // tiny parody routing code
    ctx.globalAlpha = 0.35;
    ctx.font = `${Math.floor(layout.font * 0.70)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`POSTCODE ${String(10000 + ((segIx * 7919) % 89999))}`, ax, py + ph * 0.82);
    ctx.restore();

    ctx.restore();
  }


  // Flip starts at 30s and takes the same duration as before; after the flip completes we keep showing the front.
  const POSTCARD_FLIP_AT_SECONDS = 30;
  const POSTCARD_FLIP_SECONDS = 15;

  function postcardRect(){
    const pw = Math.floor(w * 0.40);
    const ph = Math.floor(h * 0.32);
    const px = Math.floor(w * 0.57);
    const py = Math.floor(h * 0.50);
    const r = Math.floor(Math.min(w, h) * 0.02);
    return { px, py, pw, ph, r };
  }

  function drawPostcardFront(ctx, layout){
    const { px, py, pw, ph, r } = postcardRect();

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    roundedRect(ctx, px + 10, py + 14, pw, ph, r);
    ctx.fill();
    ctx.restore();

    // card base
    ctx.save();
    ctx.globalAlpha = 0.985;
    ctx.fillStyle = 'rgba(248, 244, 234, 0.98)';
    roundedRect(ctx, px, py, pw, ph, r);
    ctx.fill();

    // subtle paper speckle
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (let i = 0; i < 72; i++){
      const xx = px + (i * 997) % Math.max(1, pw - 10);
      const yy = py + (i * 613) % Math.max(1, ph - 10);
      ctx.fillRect(xx, yy, 1, 1);
    }
    ctx.restore();

    // airmail stripe (bottom edge)
    ctx.save();
    const stripeH = Math.max(6, Math.floor(ph * 0.08));
    ctx.globalAlpha = 0.10;
    for (let x = px - pw; x < px + pw * 2; x += Math.max(16, Math.floor(pw * 0.06))){
      ctx.fillStyle = 'rgba(220, 60, 70, 1)';
      ctx.fillRect(x, py + ph - Math.floor(stripeH * 0.78), Math.floor(pw * 0.03), Math.floor(stripeH * 0.55));
      ctx.fillStyle = 'rgba(30, 90, 200, 1)';
      ctx.fillRect(x + Math.floor(pw * 0.03), py + ph - Math.floor(stripeH * 0.78), Math.floor(pw * 0.03), Math.floor(stripeH * 0.55));
    }
    ctx.restore();

    // photo frame
    const fx = px + Math.floor(pw * 0.07);
    const fy = py + Math.floor(ph * 0.12);
    const fw = Math.floor(pw * 0.86);
    const fh = Math.floor(ph * 0.60);
    const fr = Math.floor(r * 0.75);

    ctx.save();
    ctx.globalAlpha = 0.98;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    roundedRect(ctx, fx - 2, fy - 2, fw + 4, fh + 4, fr);
    ctx.fill();

    // photo
    ctx.save();
    roundedRect(ctx, fx, fy, fw, fh, fr);
    ctx.clip();

    const gg = ctx.createLinearGradient(fx, fy, fx, fy + fh);
    gg.addColorStop(0, dest.palette.sky1);
    gg.addColorStop(1, dest.palette.sky0);
    ctx.fillStyle = gg;
    ctx.fillRect(fx, fy, fw, fh);

    const pr = mulberry32((seed ^ hashStr(`postcardfront|${destinationKey(dest)}`) ^ (segIx * 0x51e17acb)) >>> 0);
    const accent = hexToRgb(dest?.palette?.accent);

    // sun / moon
    const sunX = fx + fw * (0.18 + pr() * 0.64);
    const sunY = fy + fh * (0.18 + pr() * 0.22);
    const sunR = fh * (0.08 + pr() * 0.10);
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, 1)`;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.46;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // distant silhouette skyline (parody “photo”)
    const baseY = fy + fh * (0.78 + pr() * 0.06);
    const ink = hexToRgb(dest?.palette?.ink);
    const skyDark = mixRgb(ink, hexToRgb(dest?.palette?.sky0), 0.45);
    ctx.fillStyle = `rgba(${skyDark.r}, ${skyDark.g}, ${skyDark.b}, 0.92)`;
    let x = fx - fw * 0.06;
    while (x < fx + fw * 1.06){
      const bw = fw * (0.06 + pr() * 0.10);
      const bh = fh * (0.12 + pr() * 0.34);
      const top = baseY - bh;
      ctx.fillRect(Math.floor(x), Math.floor(top), Math.ceil(bw), Math.ceil(bh));
      if (pr() < 0.35){
        const sp = pr() < 0.5 ? 2 : 3;
        ctx.fillRect(Math.floor(x + bw * 0.35), Math.floor(top - bh * 0.12), Math.max(2, Math.floor(bw * 0.12)), Math.floor(bh * sp * 0.08));
      }
      x += bw * (0.62 + pr() * 0.55);
    }

    // watermark outline (country-ish) for “location” vibe
    const profile = COUNTRY_SHAPES[dest.country];
    const raw = profile
      ? makeCoastFromProfile(profile, 0, 0, 1, (pr() - 0.5) * (Math.PI / 8))
      : makeCoast(pr, 0, 0, 1);
    const wm = fitPointsToBox(raw, fx + fw * 0.78, fy + fh * 0.45, fw * 0.58, fh * 0.66);
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, 1)`;
    ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) / 480));
    ctx.beginPath();
    ctx.moveTo(wm[0].x, wm[0].y);
    for (let i = 1; i < wm.length; i++) ctx.lineTo(wm[i].x, wm[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // light grain / halftone hint
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const step = Math.max(6, Math.floor(fw / 42));
    for (let yy = fy; yy < fy + fh; yy += step){
      for (let xx = fx; xx < fx + fw; xx += step){
        if (pr() < 0.18) ctx.fillRect(xx, yy, 1, 1);
      }
    }
    ctx.restore();

    ctx.restore(); // clip

    // frame edge
    ctx.globalAlpha = 0.26;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = Math.max(1, Math.floor(layout.font * 0.08));
    roundedRect(ctx, fx - 2, fy - 2, fw + 4, fh + 4, fr);
    ctx.stroke();
    ctx.restore();

    // greetings banner
    const tx = px + Math.floor(pw * 0.08);
    const ty = py + Math.floor(ph * 0.77);
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.font = `bold ${Math.floor(layout.font * 0.74)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('GREETINGS FROM', tx, ty);
    ctx.globalAlpha = 0.90;
    ctx.font = `900 ${Math.floor(layout.font * 1.10)}px ui-sans-serif, system-ui`;
    ctx.fillText(String(dest.city || '').toUpperCase(), tx, ty + Math.floor(layout.font * 0.90));

    // tiny corner caption
    ctx.globalAlpha = 0.45;
    ctx.font = `${Math.floor(layout.font * 0.62)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`THE TINY TRAVEL DESK • ${String(dest.country || '').toUpperCase()}`, tx, py + Math.floor(ph * 0.07));
    ctx.restore();

    ctx.restore();
  }

  function drawPostcardFlip(ctx, layout){
    const flipStart = POSTCARD_FLIP_AT_SECONDS;
    if (segT < flipStart){
      drawPostcardBack(ctx, layout);
      return;
    }

    const u = clamp((segT - flipStart) / POSTCARD_FLIP_SECONDS, 0, 1);
    const angle = u * Math.PI;
    const c = Math.cos(angle);
    const scaleX = Math.max(0.02, Math.abs(c));

    const { px, py, pw, ph, r } = postcardRect();
    const cx = px + pw * 0.5;
    const cy = py + ph * 0.5;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scaleX, 1 + (1 - scaleX) * 0.02);
    ctx.translate(-cx, -cy);

    if (c < 0){
      // Front face: scaleX already uses abs(c), so no extra mirroring needed.
      drawPostcardFront(ctx, layout);
    } else {
      drawPostcardBack(ctx, layout);
    }

    // edge darkening during flip (keeps it from looking like a pure squash)
    const edge = 1 - scaleX;
    if (edge > 0.001){
      ctx.save();
      roundedRect(ctx, px, py, pw, ph, r);
      ctx.clip();
      ctx.globalAlpha = 0.25 * edge;
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fillRect(px, py, pw, ph);
      ctx.restore();
    }

    ctx.restore();
  }


  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawDesk(ctx);
    const layout = drawMap(ctx);
    drawStreetScreen(ctx, layout);
    drawPostcardFlip(ctx, layout);

    // gentle vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // (Countdown removed; reclaim the space for layout.)
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
