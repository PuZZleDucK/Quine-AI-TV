import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';
// REVIEWED: 2026-02-11

const pick = (rand, a) => a[(rand() * a.length) | 0];

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

function makeStopName(rand){
  const A = ['Harbour', 'Museum', 'Kings', 'Lime', 'Cedar', 'North', 'South', 'Old', 'New', 'Market', 'Clock', 'Foundry', 'Garden', 'Signal', 'Library', 'Ferry', 'Cathedral', 'Lantern', 'Canal', 'Bridge'];
  const B = ['Street', 'Heights', 'Junction', 'Row', 'Park', 'Quay', 'Cross', 'Gate', 'Yard', 'Square', 'Terminal', 'Arcade', 'Mews', 'Loop', 'Point', 'Hill', 'Bay', 'Plaza'];
  const a = pick(rand, A);
  const b = rand() < 0.72 ? pick(rand, B) : '';
  return (a + (b ? ' ' + b : '')).trim();
}

function makeRoute(rand, {w, h}){
  const LINES = [
    { name: 'Amber Line', color: '#ffb703' },
    { name: 'Cobalt Line', color: '#4ea8de' },
    { name: 'Violet Loop', color: '#b5179e' },
    { name: 'Mint Spur', color: '#52b788' },
    { name: 'Crimson Express', color: '#ef233c' },
  ];

  const line = pick(rand, LINES);
  const nStops = 7 + ((rand() * 4) | 0); // 7–10

  // generate a gently-curving pseudo-map polyline, then pin stations onto it.
  const cx0 = w * (0.18 + rand() * 0.12);
  const cy0 = h * (0.22 + rand() * 0.12);
  const dx = w * (0.58 + rand() * 0.16);
  const dy = h * (0.48 + rand() * 0.16);

  const pts = [];
  for (let i = 0; i < nStops; i++){
    const p = i / (nStops - 1);
    const wobX = Math.sin(p * Math.PI * (1.6 + rand() * 0.6) + rand() * 6) * w * (0.05 + rand() * 0.02);
    const wobY = Math.cos(p * Math.PI * (1.4 + rand() * 0.7) + rand() * 6) * h * (0.05 + rand() * 0.02);
    pts.push({
      x: cx0 + dx * p + wobX,
      y: cy0 + dy * p + wobY,
    });
  }

  const stops = pts.map(() => ({ name: makeStopName(rand) }));

  const PEOPLE = ['Ari', 'Jun', 'Mina', 'Sol', 'Noor', 'Casey', 'Remy', 'Sasha', 'Theo', 'Kit'];
  const ROLES = ['courier', 'grad student', 'night-shift paramedic', 'museum intern', 'busker', 'quiet auditor', 'sleep-deprived engineer', 'runaway chef', 'street photographer', 'librarian'];
  const MACGUFFIN = ['an unlabelled key', 'a torn metro card', 'a sealed envelope', 'a miniature cassette', 'a ring with a chipped stone', 'a postcard with no stamp', 'a matchbook', 'a USB stick', 'a folded paper map'];
  const VOW = ['not to look back', 'to stay on the train until it feels safe', 'to find the person in the red coat', 'to return what they stole', 'to finally get off at the right stop'];
  const TWIST = [
    'the announcements are reading their own thoughts',
    'every station name is an anagram of their real name',
    'the conductor has their handwriting',
    'the map is a route through memories, not streets',
    'they have been looping for hours—yet their phone says two minutes',
  ];

  const protagonist = pick(rand, PEOPLE);
  const role = pick(rand, ROLES);
  const item = pick(rand, MACGUFFIN);
  const vow = pick(rand, VOW);
  const twist = pick(rand, TWIST);

  const story = [];
  for (let i = 0; i < stops.length; i++){
    const s = stops[i].name;
    if (i === 0){
      story.push(`At ${s}, ${protagonist}—a ${role}—boards with ${item}.`);
    } else if (i === 1){
      story.push(`At ${s}, they make a vow: ${vow}.`);
    } else if (i === stops.length - 2){
      story.push(`At ${s}, the lights flicker and the map briefly redraws itself.`);
    } else if (i === stops.length - 1){
      story.push(`At ${s}, the final sign clicks into place: ${twist}.`);
    } else {
      const beats = [
        `At ${s}, a stranger offers directions that sound like a warning.`,
        `At ${s}, the train pauses too long—long enough to listen.`,
        `At ${s}, someone leaves a note under the seat: “keep riding.”`,
        `At ${s}, the platform clock runs backwards for three breaths.`,
        `At ${s}, ${protagonist} spots the same advertisement again, perfectly intact.`,
      ];
      story.push(pick(rand, beats));
    }
  }

  return { line, pts, stops, story, protagonist };
}

export function createChannel({ seed, audio }){
  let w = 0, h = 0;
  let t = 0;

  const STOP_DUR = 7.5;
  let stopIx = 0;
  let stopT = 0;
  let segment = 'BOARDING';

  let route = null;
  let bed = null;
  let flash = 0;
  let flashLabel = '';
  let nextRareAt = 0;

  function setRoute(i){
    const rand = mulberry32((seed ^ (i * 0x6c8e9cf5)) >>> 0);
    route = makeRoute(rand, { w, h });
    stopIx = 0;
    stopT = 0;
    segment = 'BOARDING';
    flash = 0;
    flashLabel = '';
    nextRareAt = 16 + rand() * 28;
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    setRoute(0);
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    const d = simpleDrone(audio, { root: 55, detune: 0.9, gain: 0.030 });
    const rumble = audio.noiseSource({ type: 'brown', gain: 0.010 });
    rumble.start();

    bed = {
      stop(){
        try { d.stop(); } catch {}
        try { rumble.stop(); } catch {}
      }
    };

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
    stopT += dt;
    flash = Math.max(0, flash - dt * 0.8);

    if (route && t >= nextRareAt && flash <= 0) {
      const tags = ['POWER DIP', 'WRONG PLATFORM', 'PHANTOM ANNOUNCEMENT', 'TRACK HUM'];
      flashLabel = tags[((seed + ((t * 10) | 0)) >>> 0) % tags.length];
      flash = 1;
      nextRareAt = t + 28 + ((seed + ((t * 7) | 0)) % 36);
      if (audio.enabled) {
        audio.beep({ freq: 220, dur: 0.05, gain: 0.018, type: 'sawtooth' });
        audio.beep({ freq: 320, dur: 0.04, gain: 0.014, type: 'triangle' });
      }
    }

    if (stopT >= STOP_DUR){
      stopT = 0;
      stopIx++;
      const p = route ? stopIx / Math.max(1, route.stops.length - 1) : 0;
      segment = p < 0.33 ? 'DEPARTURE' : p < 0.7 ? 'TRANSFER' : 'LAST LEG';
      if (audio.enabled){
        // station chime
        audio.beep({ freq: 660, dur: 0.04, gain: 0.030, type: 'triangle' });
        setTimeout(() => audio.beep({ freq: 880, dur: 0.04, gain: 0.022, type: 'sine' }), 90);
      }

      if (stopIx >= route.stops.length){
        setRoute(((t / 60) | 0) + 1);
      }
    }
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#06070a');
    g.addColorStop(1, '#05040a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // faint grit
    ctx.save();
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 120; i++){
      const x = (Math.sin(i * 12.3 + t * 0.9) * 0.5 + 0.5) * w;
      const y = (Math.cos(i * 9.7 + t * 0.7) * 0.5 + 0.5) * h;
      ctx.fillStyle = `rgba(255,255,255,${0.02 + (i % 7) * 0.002})`;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  function drawPanel(ctx){
    const px = Math.floor(w * 0.06);
    const py = Math.floor(h * 0.10);
    const pw = Math.floor(w * 0.64);
    const ph = Math.floor(h * 0.80);
    const r = Math.floor(Math.min(w, h) * 0.02);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundedRect(ctx, px + 10, py + 14, pw, ph, r);
    ctx.fill();
    ctx.restore();

    // panel
    ctx.save();
    ctx.globalAlpha = 0.98;
    ctx.fillStyle = 'rgba(16, 18, 22, 0.96)';
    roundedRect(ctx, px, py, pw, ph, r);
    ctx.fill();

    // subtle grid
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    const step = Math.max(26, Math.floor(pw / 14));
    for (let x = px + step; x < px + pw; x += step){
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x, py + ph);
      ctx.stroke();
    }
    for (let y = py + step; y < py + ph; y += step){
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px + pw, y);
      ctx.stroke();
    }

    ctx.restore();
    return { px, py, pw, ph, r };
  }

  function drawMap(ctx, layout){
    const { px, py, pw, ph } = layout;

    // map area inset
    const mx = px + Math.floor(pw * 0.06);
    const my = py + Math.floor(ph * 0.12);
    const mw = Math.floor(pw * 0.88);
    const mh = Math.floor(ph * 0.74);

    // glow line
    ctx.save();
    const L = route.line;
    const pts = route.pts;

    function tx(p){
      return mx + (p.x / w) * mw;
    }
    function ty(p){
      return my + (p.y / h) * mh;
    }

    // thick under-glow
    ctx.globalAlpha = 0.20;
    ctx.strokeStyle = L.color;
    ctx.lineWidth = Math.max(10, Math.floor(Math.min(w, h) / 70));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx(pts[0]), ty(pts[0]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(tx(pts[i]), ty(pts[i]));
    ctx.stroke();

    // main line
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = L.color;
    ctx.lineWidth = Math.max(4, Math.floor(Math.min(w, h) / 190));
    ctx.beginPath();
    ctx.moveTo(tx(pts[0]), ty(pts[0]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(tx(pts[i]), ty(pts[i]));
    ctx.stroke();

    // stations
    const sr = Math.max(4, Math.floor(Math.min(w, h) / 210));
    for (let i = 0; i < pts.length; i++){
      const x = tx(pts[i]);
      const y = ty(pts[i]);
      const active = i === stopIx;
      const visited = i < stopIx;

      ctx.save();
      ctx.globalAlpha = visited ? 0.85 : 0.55;
      ctx.fillStyle = 'rgba(15,16,20,1)';
      ctx.strokeStyle = active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = active ? 3 : 2;
      ctx.beginPath();
      ctx.arc(x, y, active ? sr * 1.25 : sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (active){
        const pulse = 0.35 + 0.65 * Math.sin(t * 3.1);
        ctx.globalAlpha = 0.12 + 0.12 * pulse;
        ctx.fillStyle = L.color;
        ctx.beginPath();
        ctx.arc(x, y, sr * 3.1 * (0.8 + 0.2 * pulse), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // station labels (just current + next)
    const font = Math.max(14, Math.floor(Math.min(w, h) / 40));
    ctx.font = `bold ${Math.floor(font * 0.92)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';

    const cur = route.stops[Math.min(stopIx, route.stops.length - 1)]?.name || '—';
    const nxt = route.stops[Math.min(stopIx + 1, route.stops.length - 1)]?.name || '—';

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(240,245,250,0.88)';
    ctx.fillText(`NOW: ${cur.toUpperCase()}`, mx, my + mh + Math.floor(font * 0.7));

    ctx.globalAlpha = 0.60;
    ctx.fillStyle = 'rgba(240,245,250,0.75)';
    ctx.font = `${Math.floor(font * 0.78)}px ui-sans-serif, system-ui`;
    ctx.fillText(`NEXT: ${nxt.toUpperCase()}`, mx, my + mh + Math.floor(font * 2.0));
    ctx.restore();

    ctx.restore();

    return { mx, my, mw, mh, font };
  }

  function drawHUD(ctx, layout, mapLayout){
    const { px, py, pw, ph } = layout;
    const font = mapLayout.font;

    // header strip
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px, py, pw, Math.floor(ph * 0.10));

    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.fillText('SUBWAY MAP STORIES', px + Math.floor(pw * 0.06), py + Math.floor(ph * 0.05));

    ctx.font = `${Math.floor(font * 0.85)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = route.line.color;
    ctx.fillText(route.line.name.toUpperCase(), px + Math.floor(pw * 0.62), py + Math.floor(ph * 0.05));
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = 'rgba(245,248,255,0.85)';
    ctx.font = `${Math.floor(font * 0.72)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(segment, px + Math.floor(pw * 0.48), py + Math.floor(ph * 0.085));

    // progress dots
    const n = route.stops.length;
    const dx = px + Math.floor(pw * 0.06);
    const dy = py + Math.floor(ph * 0.095);
    const step = Math.min(14, Math.max(7, Math.floor(pw / (n * 1.7))));
    for (let i = 0; i < n; i++){
      ctx.globalAlpha = i <= stopIx ? 0.85 : 0.25;
      ctx.fillStyle = i <= stopIx ? route.line.color : 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(dx + i * step, dy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // story card (right side)
    const sx = Math.floor(w * 0.73);
    const sy = Math.floor(h * 0.12);
    const sw = Math.floor(w * 0.22);
    const sh = Math.floor(h * 0.76);
    const r = Math.floor(Math.min(w, h) * 0.02);

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundedRect(ctx, sx + 10, sy + 14, sw, sh, r);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = 'rgba(20, 20, 26, 0.94)';
    roundedRect(ctx, sx, sy, sw, sh, r);
    ctx.fill();

    const pad = Math.floor(sw * 0.09);
    const tx = sx + pad;
    let ty = sy + pad;

    ctx.textBaseline = 'top';
    ctx.font = `bold ${Math.floor(font * 0.95)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText('STORY LOG', tx, ty);

    ty += Math.floor(font * 1.3);

    const curLine = route.story[Math.min(stopIx, route.story.length - 1)] || '';
    const prev1 = route.story[Math.max(0, stopIx - 1)] || '';
    const prev2 = route.story[Math.max(0, stopIx - 2)] || '';
    const lines = [prev2, prev1, curLine].filter(Boolean);

    ctx.font = `${Math.floor(font * 0.76)}px ui-sans-serif, system-ui`;
    const maxW = sw - pad * 2;
    for (let i = 0; i < lines.length; i++){
      const a = i === lines.length - 1 ? 0.86 : 0.50;
      ctx.fillStyle = `rgba(240,245,250,${a})`;
      const wrap = wrapText(ctx, lines[i], maxW);
      for (const ln of wrap){
        ctx.fillText(ln, tx, ty);
        ty += Math.floor(font * 0.98);
      }
      ty += Math.floor(font * 0.45);
    }

    // footer countdown
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `${Math.floor(font * 0.70)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const eta = Math.max(0, Math.ceil(STOP_DUR - stopT));
    ctx.fillText(`NEXT STOP IN ${eta}s`, tx, sy + sh - pad - Math.floor(font * 0.8));

    ctx.restore();
  }

  function wrapText(ctx, s, maxW){
    const words = String(s).split(' ');
    const out = [];
    let line = '';
    for (const wd of words){
      const next = line ? (line + ' ' + wd) : wd;
      if (ctx.measureText(next).width > maxW && line){
        out.push(line);
        line = wd;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
    return out;
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    const panel = drawPanel(ctx);
    const mapLayout = drawMap(ctx, panel);
    drawHUD(ctx, panel, mapLayout);

    if (flash > 0 && flashLabel) {
      const p = flash * (0.5 + 0.5 * Math.sin(t * 24) ** 2);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(160,210,255,${0.1 * p})`;
      ctx.fillRect(0, 0, w, h);
      const fs = Math.max(14, Math.floor(Math.min(w, h) * 0.028));
      ctx.font = `700 ${fs}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      const pad = Math.floor(fs * 0.45);
      const tw = Math.ceil(ctx.measureText(flashLabel).width);
      const bw = tw + pad * 2;
      const bh = fs + pad * 1.5;
      const bx = Math.floor(w * 0.5 - bw * 0.5);
      const by = Math.floor(h * 0.08);
      ctx.globalAlpha = 0.92 * p;
      ctx.fillStyle = 'rgba(10,22,34,0.9)';
      ctx.strokeStyle = 'rgba(150,220,255,0.8)';
      ctx.lineWidth = 2;
      roundedRect(ctx, bx, by, bw, bh, Math.max(8, Math.floor(fs * 0.36)));
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(230,248,255,0.96)';
      ctx.fillText(flashLabel, bx + pad, by + fs + pad * 0.35);
      ctx.restore();
    }

    // vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
