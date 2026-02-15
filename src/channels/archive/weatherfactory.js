import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function roundRect(ctx, x, y, w, h, r){
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function strokeFront(ctx, pts, kind, alpha=1){
  // kind: 'warm' | 'cold' | 'occluded'
  ctx.save();
  const col = kind === 'warm' ? 'rgba(255,120,120,' : (kind === 'cold' ? 'rgba(120,200,255,' : 'rgba(200,140,255,');
  ctx.strokeStyle = `${col}${0.8*alpha})`;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i=0;i<pts.length;i++){
    const p = pts[i];
    if (i===0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  // symbols along the path
  let acc = 0;
  const step = 46;
  for (let i=1;i<pts.length;i++){
    const a = pts[i-1], b = pts[i];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const seg = Math.hypot(dx, dy);
    if (seg < 1) continue;
    dx /= seg; dy /= seg;
    let u0 = 0;
    while (acc + (seg - u0) >= step){
      const need = step - acc;
      const u = u0 + need;
      const x = a.x + dx*u;
      const y = a.y + dy*u;
      const nx = -dy, ny = dx; // normal

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(dy, dx));

      ctx.fillStyle = `${col}${0.9*alpha})`;
      ctx.strokeStyle = `${col}${0.9*alpha})`;

      if (kind === 'warm'){
        // semicircle on one side
        ctx.beginPath();
        ctx.arc(0, 0, 10, -Math.PI*0.5, Math.PI*0.5);
        ctx.stroke();
      } else if (kind === 'cold'){
        // triangle on one side
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(0, 11);
        ctx.lineTo(14, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        // occluded: alternating semicircle + triangle (both sides-ish)
        ctx.beginPath();
        ctx.arc(0, 0, 9, -Math.PI*0.5, Math.PI*0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.lineTo(12, 0);
        ctx.closePath();
        ctx.fill();
      }

      // slight offset to one side for better readability
      ctx.restore();

      acc = 0;
      u0 = u;
    }
    acc += seg;
  }

  ctx.restore();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  const SEGMENTS = [
    { key: 'clouds', title: 'CLOUDS', desc: 'Moisture + lift → cloud build (watch layers drift).' },
    { key: 'pressure', title: 'PRESSURE', desc: 'Highs clear; lows spin up wind and rain.' },
    { key: 'fronts', title: 'FRONTS', desc: 'Warm/cold/occluded lines show where air masses collide.' },
    { key: 'widgets', title: 'WIDGETS', desc: 'Barometer, thermometer, wind vane: the forecast toolkit.' },
  ];

  let w = 0, h = 0, t = 0;
  let font = 18;

  // clouds
  let clouds = []; // {x,y,r,layer,speed,alpha}

  // pressure centers
  let centers = []; // {x,y,kind:'H'|'L',strength,phx,phy}

  // fronts
  let frontPts = [];

  // widgets state
  let tempC = 18;
  let pressure = 1012;
  let windKph = 24;
  let windDir = 0.0;

  // segment cycling
  let segIndex = 0;
  let segTimer = 0;
  const SEG_DUR = 18; // seconds
  const FADE = 2.4;

  // audio handle
  let ah = null;

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));

    segIndex = 0;
    segTimer = 0;

    // cloud field
    const n = Math.floor(20 + (w * h) / 55_000);
    clouds = Array.from({ length: n }, () => {
      const layer = rand();
      return {
        x: rand() * w,
        y: (0.1 + rand() * 0.55) * h,
        r: (30 + rand() * 90) * (0.55 + layer * 0.85),
        layer,
        speed: (8 + rand() * 22) * (0.35 + layer * 0.9),
        alpha: 0.05 + rand() * 0.10,
      };
    });

    // pressure centers: one H, one L
    centers = [
      {
        kind: 'H',
        x: (0.28 + rand() * 0.12) * w,
        y: (0.42 + rand() * 0.14) * h,
        strength: 1.0,
        phx: rand() * Math.PI * 2,
        phy: rand() * Math.PI * 2,
      },
      {
        kind: 'L',
        x: (0.64 + rand() * 0.12) * w,
        y: (0.52 + rand() * 0.16) * h,
        strength: 1.0,
        phx: rand() * Math.PI * 2,
        phy: rand() * Math.PI * 2,
      },
    ];

    rebuildFront();

    // seed widgets deterministically-ish
    tempC = 14 + rand() * 12;
    pressure = 1006 + rand() * 18;
    windKph = 12 + rand() * 28;
    windDir = rand() * Math.PI * 2;
  }

  function onResize(width, height){
    init({ width, height });
  }

  function makeAudioHandle(){
    // airy bed + quiet low drone
    const n = audio.noiseSource({ type: 'pink', gain: 0.0048 });
    n.start();
    const d = simpleDrone(audio, { root: 55, detune: 0.9, gain: 0.028 });
    return {
      stop(){
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      }
    };
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    try { ah?.stop?.(); } catch {}
    ah = null;
  }

  function destroy(){ onAudioOff(); }

  function rebuildFront(){
    // a wavy diagonal front across the "map"
    const pts = [];
    const left = -w * 0.05;
    const right = w * 1.05;
    const y0 = h * (0.62 + (rand() * 0.12 - 0.06));
    const amp = h * 0.06;
    const k = 2 + (rand() * 2);
    const steps = 10;
    for (let i=0;i<=steps;i++){
      const u = i / steps;
      const x = lerp(left, right, u);
      const y = y0 - (u - 0.5) * h * 0.28 + Math.sin(u * Math.PI * k + rand() * 0.4) * amp;
      pts.push({ x, y });
    }
    frontPts = pts;
  }

  function segmentWeight(i){
    if (i === segIndex){
      const fIn = ease(Math.min(1, segTimer / FADE));
      const fOut = ease(Math.min(1, (SEG_DUR - segTimer) / FADE));
      return Math.min(fIn, fOut);
    }
    return 0.12;
  }

  function update(dt){
    t += dt;

    // clouds drift
    for (const c of clouds){
      c.x += c.speed * dt;
      if (c.x - c.r > w + 40) c.x = -c.r - 40;
      // tiny vertical wobble
      c.y += Math.sin(t * (0.12 + c.layer * 0.22) + c.x * 0.002) * dt * (2 + c.layer * 4);
    }

    // pressure centers drift slowly
    for (const c of centers){
      const s = c.kind === 'H' ? 1 : -1;
      c.x += Math.cos(t * 0.08 + c.phx) * dt * (10 + 6 * s);
      c.y += Math.sin(t * 0.07 + c.phy) * dt * (8 + 5 * s);
      c.x = clamp(c.x, w * 0.1, w * 0.9);
      c.y = clamp(c.y, h * 0.2, h * 0.85);
    }

    // widgets: gentle motion tied to centers and time
    const H = centers.find(c => c.kind === 'H');
    const L = centers.find(c => c.kind === 'L');
    const swing = Math.sin(t * 0.25);
    tempC = 16 + 6 * Math.sin(t * 0.10 + 1.2) + 2 * swing;
    pressure = 1012 + 10 * Math.cos(t * 0.08 - 0.4) + (H ? (H.x / w - 0.5) * 6 : 0) - (L ? (L.y / h - 0.5) * 5 : 0);
    windKph = 16 + 18 * (0.5 + 0.5 * Math.sin(t * 0.18 + 0.9));
    windDir = (windDir + dt * 0.25) % (Math.PI * 2);

    // segment cycle
    segTimer += dt;
    if (segTimer >= SEG_DUR){
      segTimer = 0;
      segIndex = (segIndex + 1) % SEGMENTS.length;

      // occasional front rebuild so it doesn't feel too static
      if (segIndex === 2) rebuildFront();

      if (audio.enabled) audio.beep({ freq: 520 + rand() * 180, dur: 0.03, gain: 0.03, type: 'square' });
    }
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1930');
    g.addColorStop(0.55, '#070f1e');
    g.addColorStop(1, '#04060d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle blueprint grid
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(108,242,255,0.18)';
    ctx.lineWidth = 1;
    const step = Math.max(28, Math.floor(Math.min(w, h) / 18));
    for (let x = 0; x <= w; x += step){
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += step){
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    }
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.15, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawClouds(ctx, a){
    ctx.save();
    ctx.globalAlpha = a;

    for (const c of clouds){
      const wob = Math.sin(t * (0.12 + c.layer * 0.2) + c.x * 0.004) * (6 + c.layer * 10);
      const x = c.x;
      const y = c.y + wob;
      const r = c.r;
      const al = c.alpha;

      const rg = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      rg.addColorStop(0, `rgba(230,245,255,${0.22 * al})`);
      rg.addColorStop(0.6, `rgba(160,210,255,${0.10 * al})`);
      rg.addColorStop(1, 'rgba(160,210,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      // extra puffs for volume
      ctx.fillStyle = `rgba(230,245,255,${0.05 * al})`;
      ctx.beginPath();
      ctx.arc(x - r * 0.45, y + r * 0.10, r * 0.55, 0, Math.PI * 2);
      ctx.arc(x + r * 0.40, y + r * 0.06, r * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawPressure(ctx, a){
    ctx.save();
    ctx.globalAlpha = a;

    // isobars around each center
    for (const c of centers){
      const baseCol = c.kind === 'H' ? 'rgba(120,255,200,' : 'rgba(255,190,110,';
      ctx.strokeStyle = `${baseCol}${0.35})`;
      ctx.lineWidth = 2;

      const rings = 5;
      for (let i=1;i<=rings;i++){
        const rr = (0.10 + i * 0.075) * Math.min(w, h) * (c.kind === 'H' ? 1.0 : 1.1);
        ctx.beginPath();
        const steps = 70;
        for (let k=0;k<=steps;k++){
          const u = k / steps;
          const ang = u * Math.PI * 2;
          const n = Math.sin(ang * 3 + t * 0.35 + c.phx) * 0.05 + Math.cos(ang * 2 + t * 0.22 + c.phy) * 0.04;
          const r = rr * (1 + n);
          const x = c.x + Math.cos(ang) * r;
          const y = c.y + Math.sin(ang) * r;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // label marker
      ctx.save();
      ctx.fillStyle = `${baseCol}${0.8})`;
      ctx.font = `${Math.floor(font * 1.25)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(c.kind, c.x - 8, c.y);
      ctx.restore();
    }

    // wind arrows: swirl around low
    const L = centers.find(c => c.kind === 'L');
    if (L){
      ctx.save();
      ctx.strokeStyle = 'rgba(180,220,255,0.22)';
      ctx.lineWidth = 2;
      const n = 18;
      const R = Math.min(w, h) * 0.34;
      for (let i=0;i<n;i++){
        const u = i / n;
        const ang = u * Math.PI * 2 + t * 0.12;
        const r = R * (0.28 + 0.68 * u);
        const x = L.x + Math.cos(ang) * r;
        const y = L.y + Math.sin(ang) * r;
        const tang = ang + Math.PI * 0.55;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(tang) * 18, y + Math.sin(tang) * 18);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function drawFronts(ctx, a){
    ctx.save();
    ctx.globalAlpha = a;

    // animate slight drift
    const drift = Math.sin(t * 0.07) * w * 0.02;
    const pts = frontPts.map(p => ({ x: p.x + drift, y: p.y + Math.sin(t * 0.35 + p.x * 0.01) * 6 }));

    strokeFront(ctx, pts, 'warm', 0.95);
    // a parallel cold front line
    const pts2 = pts.map(p => ({ x: p.x + 10, y: p.y - 18 }));
    strokeFront(ctx, pts2, 'cold', 0.75);

    // small legend
    const boxW = Math.floor(Math.min(w, h) * 0.32);
    const boxH = Math.floor(boxW * 0.36);
    const x = w - boxW - Math.floor(w * 0.04);
    const y = Math.floor(h * 0.18);

    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    roundRect(ctx, x + 6, y + 8, boxW, boxH, 16);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,14,22,0.82)';
    roundRect(ctx, x, y, boxW, boxH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(108,242,255,0.20)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, boxW, boxH, 16);
    ctx.stroke();

    const tx = x + 16;
    let ty = y + 18;
    ctx.font = `${Math.floor(font * 0.82)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(231,238,246,0.88)';
    ctx.fillText('FRONT LEGEND', tx, ty);

    ty += Math.floor(font * 1.0);
    ctx.font = `${Math.floor(font * 0.72)}px ui-sans-serif, system-ui`;

    ctx.fillStyle = 'rgba(255,120,120,0.9)';
    ctx.fillText('Warm front', tx, ty);
    ty += Math.floor(font * 0.9);

    ctx.fillStyle = 'rgba(120,200,255,0.9)';
    ctx.fillText('Cold front', tx, ty);
    ty += Math.floor(font * 0.9);

    ctx.fillStyle = 'rgba(200,140,255,0.9)';
    ctx.fillText('Occluded', tx, ty);

    ctx.restore();
  }

  function drawWidgets(ctx, a){
    ctx.save();
    ctx.globalAlpha = a;

    const pad = Math.floor(w * 0.04);
    const panelW = Math.floor(Math.min(w, h) * 0.36);
    const panelH = Math.floor(h * 0.54);
    const x = w - pad - panelW;
    const y = Math.floor(h * 0.35);

    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    roundRect(ctx, x + 8, y + 10, panelW, panelH, 18);
    ctx.fill();

    ctx.fillStyle = 'rgba(10,14,22,0.86)';
    roundRect(ctx, x, y, panelW, panelH, 18);
    ctx.fill();

    ctx.strokeStyle = 'rgba(108,242,255,0.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, panelW, panelH, 18);
    ctx.stroke();

    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 0.86)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('WEATHER WIDGETS', x + 16, y + 22);

    const innerX = x + 18;
    const innerY = y + 48;
    const innerW = panelW - 36;

    // thermometer
    const thX = innerX;
    const thY = innerY + 16;
    const thH = Math.floor(panelH * 0.38);
    const thW = 34;

    ctx.fillStyle = 'rgba(231,238,246,0.18)';
    roundRect(ctx, thX, thY, thW, thH, 14);
    ctx.fill();

    const tNorm = clamp((tempC - 0) / 35, 0, 1);
    const fillH = Math.floor(thH * tNorm);
    const hot = `rgba(255, 90, 165, ${0.85})`;
    const cool = `rgba(108, 242, 255, ${0.85})`;
    const mix = tNorm;
    ctx.fillStyle = `rgba(${Math.floor(108 + (255-108)*mix)}, ${Math.floor(242 + (90-242)*mix)}, ${Math.floor(255 + (165-255)*mix)}, 0.85)`;
    roundRect(ctx, thX + 6, thY + (thH - fillH) + 6, thW - 12, Math.max(10, fillH - 12), 10);
    ctx.fill();

    ctx.fillStyle = cool;
    ctx.font = `${Math.floor(font * 0.72)}px ui-sans-serif, system-ui`;
    ctx.fillText(`Temp`, thX + thW + 14, thY + 10);
    ctx.fillStyle = hot;
    ctx.font = `${Math.floor(font * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`${tempC.toFixed(0)}°C`, thX + thW + 14, thY + 34);

    // barometer dial
    const bx = innerX + innerW * 0.55;
    const by = thY + thH * 0.46;
    const br = Math.floor(Math.min(innerW * 0.26, thH * 0.46));

    ctx.save();
    ctx.translate(bx, by);
    ctx.fillStyle = 'rgba(231,238,246,0.08)';
    ctx.beginPath(); ctx.arc(0, 0, br + 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(231,238,246,0.20)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, br, 0, Math.PI * 2); ctx.stroke();

    // tick marks
    ctx.strokeStyle = 'rgba(231,238,246,0.22)';
    ctx.lineWidth = 2;
    for (let i=0;i<11;i++){
      const u = i / 10;
      const ang = (-0.75 + u * 1.5) * Math.PI;
      const x0 = Math.cos(ang) * (br * 0.78);
      const y0 = Math.sin(ang) * (br * 0.78);
      const x1 = Math.cos(ang) * (br * 0.92);
      const y1 = Math.sin(ang) * (br * 0.92);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }

    // needle
    const pNorm = clamp((pressure - 990) / 50, 0, 1);
    const ang = (-0.75 + pNorm * 1.5) * Math.PI;
    ctx.strokeStyle = 'rgba(255,190,110,0.88)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang) * (br * 0.85), Math.sin(ang) * (br * 0.85));
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,190,110,0.85)';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.font = `${Math.floor(font * 0.72)}px ui-sans-serif, system-ui`;
    ctx.fillText('Pressure', innerX + innerW * 0.46, thY + thH + 18);
    ctx.fillStyle = 'rgba(255,190,110,0.90)';
    ctx.font = `${Math.floor(font * 0.90)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`${pressure.toFixed(0)} hPa`, innerX + innerW * 0.46, thY + thH + 42);

    // wind vane
    const wy = thY + thH + 86;
    const wx = innerX + 26;
    const wr = 22;
    ctx.save();
    ctx.translate(wx, wy);
    ctx.strokeStyle = 'rgba(108,242,255,0.30)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, wr, 0, Math.PI * 2); ctx.stroke();
    ctx.rotate(windDir);
    ctx.fillStyle = 'rgba(108,242,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, -wr * 0.9);
    ctx.lineTo(-6, -wr * 0.2);
    ctx.lineTo(6, -wr * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.font = `${Math.floor(font * 0.72)}px ui-sans-serif, system-ui`;
    ctx.fillText('Wind', wx + 40, wy - 8);
    ctx.fillStyle = 'rgba(108,242,255,0.90)';
    ctx.font = `${Math.floor(font * 0.90)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`${windKph.toFixed(0)} kph`, wx + 40, wy + 18);

    ctx.restore();
  }

  function drawHeader(ctx){
    const seg = SEGMENTS[segIndex];
    const top = Math.floor(h * 0.06);

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, top, w, Math.floor(h * 0.12));

    ctx.fillStyle = 'rgba(108,242,255,0.42)';
    ctx.fillRect(0, top + Math.floor(h * 0.12) - 2, w, 2);

    ctx.fillStyle = 'rgba(231,238,246,0.94)';
    ctx.font = `${Math.floor(font * 1.08)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('WEATHER FACTORY', Math.floor(w * 0.05), top + Math.floor(h * 0.045));

    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.font = `${Math.floor(font * 0.78)}px ui-sans-serif, system-ui`;
    ctx.fillText(`Assembling: ${seg.title} — ${seg.desc}`, Math.floor(w * 0.05), top + Math.floor(h * 0.09));

    // progress pill
    const p = segTimer / SEG_DUR;
    const pillW = Math.floor(w * 0.18);
    const pillH = Math.floor(font * 1.15);
    const px = w - Math.floor(w * 0.05) - pillW;
    const py = top + Math.floor(h * 0.06) - pillH / 2;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(10,14,22,0.86)';
    roundRect(ctx, px, py, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.globalAlpha = 0.60;
    ctx.fillStyle = 'rgba(231,238,246,0.18)';
    roundRect(ctx, px + 4, py + 4, pillW - 8, pillH - 8, (pillH - 8) / 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(108,242,255,0.50)';
    roundRect(ctx, px + 4, py + 4, (pillW - 8) * p, pillH - 8, (pillH - 8) / 2);
    ctx.fill();

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);

    const aClouds = 0.35 + 0.85 * segmentWeight(0);
    const aPress = 0.20 + 0.95 * segmentWeight(1);
    const aFront = 0.18 + 0.95 * segmentWeight(2);
    const aWidg  = 0.18 + 0.95 * segmentWeight(3);

    drawClouds(ctx, aClouds);
    drawPressure(ctx, aPress);
    drawFronts(ctx, aFront);
    drawWidgets(ctx, aWidg);

    drawHeader(ctx);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
