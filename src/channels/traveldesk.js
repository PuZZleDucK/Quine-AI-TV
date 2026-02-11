import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

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
  const pts = [];
  const n = 18 + ((rand() * 14) | 0);
  for (let i = 0; i < n; i++){
    const a = (i / n) * Math.PI * 2;
    const wob = 0.65 + rand() * 0.65;
    const rr = r * wob * (0.85 + 0.25 * Math.sin(a * 3 + rand() * 6));
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return pts;
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

  const SEG_DUR = 52; // seconds per destination
  let segIx = 0;
  let segT = 0;
  let dest = DESTINATIONS[0];
  let coast = [];
  let coast2 = [];
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

    // map blobs (desk-map fiction, not real geography)
    const mx = w * 0.27;
    const my = h * 0.40;
    const rr = Math.min(w, h) * (0.18 + r() * 0.04);
    coast = makeCoast(r, mx + r() * w * 0.06, my + r() * h * 0.05, rr);
    coast2 = makeCoast(r, mx + w * 0.12 + r() * w * 0.05, my + h * 0.07 + r() * h * 0.05, rr * 0.75);

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
    strokeCoast(coast2);

    // route highlight (animated)
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(196, 65, 42, 0.65)';
    ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) / 240));
    ctx.setLineDash([8, 10]);
    ctx.lineDashOffset = -t * 28;
    ctx.beginPath();
    ctx.moveTo(mx + mw * 0.2, my + mh * 0.75);
    ctx.bezierCurveTo(mx + mw * 0.35, my + mh * 0.55, mx + mw * 0.45, my + mh * 0.52, mx + mw * 0.62, my + mh * 0.35);
    ctx.stroke();

    // destination pin
    const px = mx + mw * 0.62;
    const py = my + mh * 0.35;
    const pr = Math.max(5, Math.floor(Math.min(w, h) * 0.012));
    const pulse = 0.55 + 0.45 * Math.sin(t * 2.2);
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(196, 65, 42, ${0.75 + 0.2 * pulse})`;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'rgba(196, 65, 42, 1)';
    ctx.beginPath();
    ctx.arc(px, py, pr * 2.2 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // header text
    const font = Math.max(16, Math.floor(Math.min(w, h) / 34));
    ctx.font = `bold ${Math.floor(font * 1.08)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(20, 18, 16, 0.88)';
    ctx.textBaseline = 'top';
    ctx.fillText('THE TINY TRAVEL DESK', mx + Math.floor(mw * 0.05), my + Math.floor(font * 0.8));

    ctx.font = `${Math.floor(font * 0.9)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(20, 18, 16, 0.72)';
    ctx.fillText('desk-based travel • maps • street footage • food • history', mx + Math.floor(mw * 0.05), my + Math.floor(font * 2.1));

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
    // moving tape-glitch bar: keep it in upper sky so it never intersects skyline contact
    const glitchBand = Math.max(18, Math.floor((groundY - iy) * 0.45));
    const gy = iy + ((t * 48) % glitchBand) - 8;
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillRect(ix, gy, iw, 14);
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
    ctx.font = `${Math.floor(font * 0.84)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(235, 240, 245, 0.82)';
    ctx.fillText(`${dest.city.toUpperCase()} • ${dest.vibe}`, sx + Math.floor(sw * 0.08), sy + Math.floor(sh * 0.13));
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
      // wrap-ish: split long values for postcard width
      const text = String(it.v);
      const maxW = pw * 0.44;
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
      const maxLines = 1;
      for (let li = 0; li < Math.min(maxLines, lines.length); li++){
        ctx.fillText(lines[li], tx, y + li * Math.floor(layout.font * 0.98));
      }
      y += Math.floor(layout.font * 0.98);
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
