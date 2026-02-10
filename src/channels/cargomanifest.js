import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// REVIEWED: 2026-02-11

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

function hashStr(s){
  // deterministic-ish, no RNG touch
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // Visual identity: starship cargo bay HUD
  const hue = 190 + rand() * 50;
  const bg0 = `hsl(${(hue + 220) % 360}, 26%, 8%)`;
  const bg1 = `hsl(${(hue + 250) % 360}, 30%, 6%)`;
  const panel = `hsla(${(hue + 18) % 360}, 22%, 14%, 0.92)`;
  const panel2 = `hsla(${(hue + 18) % 360}, 26%, 10%, 0.92)`;
  const ink = `hsla(${hue}, 86%, 74%, 0.92)`;
  const inkDim = `hsla(${hue}, 60%, 70%, 0.40)`;
  const glow = `hsla(${hue}, 90%, 62%, 0.18)`;
  const ok = `hsla(${(hue + 16) % 360}, 92%, 58%, 0.92)`;
  const warn = `hsla(${(hue + 330) % 360}, 92%, 60%, 0.95)`;
  const danger = `hsla(${(hue + 350) % 360}, 95%, 60%, 0.95)`;

  let font = 16;
  let mono = 14;

  const N_CONTAINERS = 8 + ((rand() * 5) | 0);
  const containers = Array.from({ length: N_CONTAINERS }, (_, i) => ({
    i,
    x: 0, y: 0, cw: 0, ch: 0,
    code: '',
    dest: '',
    heat: 0,
    quarantined: 0,
  }));

  const DESTS = ['HATCH A', 'HATCH B', 'HATCH C', 'RING 2', 'DOCK 7', 'BAY 04'];

  function pick(arr){ return arr[(rand() * arr.length) | 0]; }

  function makeCode(i){
    const alph = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const a = alph[(rand() * alph.length) | 0];
    const b = alph[(rand() * alph.length) | 0];
    const num = 100 + ((rand() * 900) | 0);
    return `${a}${b}-${num}-${(i + 1).toString().padStart(2, '0')}`;
  }

  // manifest is a stable ordering of container ids
  let manifest = []; // [{idx, code, dest, flags}]
  let scanIdx = 0;
  let scanT = 0;
  let scanDir = 1;

  const PHASES = [
    { id: 'inbound', name: 'INBOUND SCAN', dur: 62 },
    { id: 'route', name: 'ROUTE UPDATE', dur: 76 },
    { id: 'transfer', name: 'TRANSFER WINDOW', dur: 86 },
    { id: 'quiet', name: 'QUIET RUN', dur: 48 },
  ];
  let phaseIdx = 0;
  let phaseT = 0;
  function phase(){ return PHASES[phaseIdx]; }

  // moving scan sweep over the whole bay
  let sweep = 0;
  let nextSweepAt = 1.5 + rand() * 3.5;

  // anomaly moment
  let anomaly = null; // { idx, t, stage, nextBeepAt }
  let nextAnomalyAt = 11 + rand() * 15;

  let drone = null;
  let noise = null;
  let musicHandle = null;

  function safeBeep(opts){
    if (!audio.enabled) return;
    try { audio.beep(opts); } catch {}
  }

  function stopAmbience({ clearCurrent = false } = {}){
    const handle = musicHandle;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    drone = null;
    noise = null;
    musicHandle = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // defensively stop any existing ambience we started
    stopAmbience({ clearCurrent: true });

    drone = simpleDrone(audio, { root: 55, detune: 1.2, gain: 0.05 });
    try {
      noise = audio.noiseSource({ type: 'pink', gain: 0.010 });
      noise.start();
    } catch { noise = null; }

    musicHandle = {
      stop(){
        try { drone?.stop?.(); } catch {}
        try { noise?.stop?.(); } catch {}
      }
    };

    audio.setCurrent(musicHandle);
  }

  function onAudioOff(){
    // stop/clear everything we own; only clear AudioManager.current if it's ours
    stopAmbience({ clearCurrent: true });
  }

  function destroy(){
    stopAmbience({ clearCurrent: true });
  }

  function rebuildLayout(width, height, devicePixelRatio=1){
    w = width;
    h = height;
    dpr = devicePixelRatio;

    font = Math.max(14, Math.floor(h / 28));
    mono = Math.max(12, Math.floor(h / 32));

    // main bay area (right) + manifest panel (left)
    const pad = Math.max(14, Math.floor(Math.min(w, h) * 0.03));
    const panelW = Math.floor(w * 0.34);
    const bayX = pad + panelW + pad;
    const bayY = pad;
    const bayW = w - bayX - pad;
    const bayH = h - pad * 2;

    const cols = 3;
    const rows = Math.ceil(N_CONTAINERS / cols);
    const cellW = bayW / cols;
    const cellH = bayH / rows;

    for (let i = 0; i < containers.length; i++){
      const c = containers[i];
      const col = i % cols;
      const row = (i / cols) | 0;
      const inset = Math.min(cellW, cellH) * (0.12 + rand() * 0.06);
      c.x = bayX + col * cellW + inset;
      c.y = bayY + row * cellH + inset;
      c.cw = cellW - inset * 2;
      c.ch = cellH - inset * 2;
    }

    // Build codes/dests once (keeps deterministic relative to seed, not resize)
    if (manifest.length === 0){
      for (let i = 0; i < containers.length; i++){
        containers[i].code = makeCode(i);
        containers[i].dest = pick(DESTS);
      }

      // Stable manifest order: hashed by code (not RNG order)
      manifest = containers
        .map((c) => ({ idx: c.i, code: c.code, dest: c.dest, flags: '' }))
        .sort((a, b) => (hashStr(a.code) - hashStr(b.code)));

      // sprinkle a couple of "fragile" flags for fun
      for (let k = 0; k < manifest.length; k++){
        const m = manifest[k];
        const r = (hashStr(m.code) % 1000) / 1000;
        if (r < 0.12) m.flags = 'FRAGILE';
        else if (r < 0.18) m.flags = 'BIO';
        else if (r < 0.22) m.flags = 'MAG';
      }
    }
  }

  function onResize(width, height, devicePixelRatio){
    rebuildLayout(width, height, devicePixelRatio);
  }

  function init({ width, height, devicePixelRatio }){
    t = 0;
    phaseIdx = 0;
    phaseT = 0;
    scanIdx = 0;
    scanT = 0;
    scanDir = 1;
    sweep = 0;
    anomaly = null;
    nextSweepAt = 1.5 + rand() * 3.5;
    nextAnomalyAt = 11 + rand() * 15;

    // clear container dynamics
    for (const c of containers){
      c.heat = 0;
      c.quarantined = 0;
    }

    rebuildLayout(width, height, devicePixelRatio);
  }

  function bumpScan(){
    // called when scan completes
    safeBeep({ freq: 520 + ((scanIdx % 5) * 40), dur: 0.055, gain: 0.018, type: 'square' });
  }

  function triggerAnomaly(){
    // pick a container that isn't already the current highlight
    const idx = manifest[(scanIdx + 3 + ((rand() * 5) | 0)) % manifest.length].idx;
    anomaly = { idx, t: 0, stage: 0, nextBeepAt: 0 };
    containers[idx].quarantined = 1;

    // short alarm gesture
    safeBeep({ freq: 140, dur: 0.12, gain: 0.03, type: 'sawtooth' });
    safeBeep({ freq: 210, dur: 0.10, gain: 0.02, type: 'square' });
  }

  function update(dt){
    t += dt;

    // phases
    phaseT += dt;
    if (phaseT >= phase().dur){
      phaseT = 0;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
    }

    // scan advancement (a subtle back-and-forth sweep bar)
    scanT += dt * (phase().id === 'inbound' ? 1.25 : phase().id === 'transfer' ? 1.1 : 0.95);
    if (scanT >= 1){
      scanT = 0;
      scanDir *= -1;
      scanIdx = (scanIdx + 1) % manifest.length;
      bumpScan();

      // a tiny highlight bloom on the scanned container
      const c = containers[manifest[scanIdx].idx];
      c.heat = Math.min(1, c.heat + 0.9);
    }

    // decay container highlights
    for (const c of containers){
      c.heat = Math.max(0, c.heat - dt * 0.8);
      c.quarantined = Math.max(0, c.quarantined - dt * 0.22);
    }

    // whole-bay scan sweep
    if (t >= nextSweepAt && sweep <= 0){
      sweep = 1;
      nextSweepAt = t + (5.2 + rand() * 6.5);
      safeBeep({ freq: 320, dur: 0.05, gain: 0.010, type: 'triangle' });
    }
    if (sweep > 0){
      sweep = Math.max(0, sweep - dt * 1.6);
    }

    // anomaly moment
    if (!anomaly && t >= nextAnomalyAt){
      triggerAnomaly();
      nextAnomalyAt = t + (18 + rand() * 26);
    }

    if (anomaly){
      anomaly.t += dt;
      if (anomaly.t > 6.4){
        anomaly = null;
      } else {
        // beeps during anomaly (rate-limited)
        if (audio.enabled && anomaly.t >= anomaly.nextBeepAt){
          const p = anomaly.t;
          const f = p < 2.6 ? 220 : 150;
          safeBeep({ freq: f, dur: 0.07, gain: 0.018, type: 'square' });
          anomaly.nextBeepAt = anomaly.t + (p < 2.6 ? 0.55 : 0.75);
        }
      }
    }
  }

  function drawBG(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, bg0);
    g.addColorStop(1, bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle drifting grid
    const gx = (t * 18) % 40;
    const gy = (t * 10) % 40;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = `hsla(${hue}, 70%, 58%, 0.12)`;
    ctx.lineWidth = Math.max(1, h / 820);
    for (let x = -40; x < w + 40; x += 40){
      ctx.beginPath();
      ctx.moveTo(x + gx, 0);
      ctx.lineTo(x + gx, h);
      ctx.stroke();
    }
    for (let y = -40; y < h + 40; y += 40){
      ctx.beginPath();
      ctx.moveTo(0, y + gy);
      ctx.lineTo(w, y + gy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPanels(ctx){
    const pad = Math.max(14, Math.floor(Math.min(w, h) * 0.03));
    const panelW = Math.floor(w * 0.34);
    const px = pad;
    const py = pad;
    const ph = h - pad * 2;

    // manifest panel
    ctx.save();
    ctx.fillStyle = panel;
    roundRect(ctx, px, py, panelW, ph, 14);
    ctx.fill();

    // inner border glow
    ctx.strokeStyle = `hsla(${hue}, 85%, 62%, 0.25)`;
    ctx.lineWidth = 1;
    roundRect(ctx, px + 1, py + 1, panelW - 2, ph - 2, 13);
    ctx.stroke();

    // header
    ctx.fillStyle = ink;
    ctx.font = `600 ${font}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textBaseline = 'top';
    ctx.fillText('CARGO MANIFEST', px + 16, py + 14);

    ctx.fillStyle = inkDim;
    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    // (UI) Avoid showing a faux channel number here; OSD already shows the real CH.
    const sub = `${phase().name}`;
    ctx.fillText(sub, px + 16, py + 14 + font + 6);

    // list
    const listX = px + 16;
    const listY = py + 14 + font + 6 + mono + 14;
    const rowH = Math.max(18, Math.floor(mono * 1.25));
    const visible = Math.floor((ph - (listY - py) - 18) / rowH);

    const center = scanIdx;
    const start = Math.max(0, Math.min(manifest.length - visible, center - ((visible / 2) | 0)));

    for (let r = 0; r < visible; r++){
      const mi = start + r;
      if (mi >= manifest.length) break;
      const m = manifest[mi];
      const y = listY + r * rowH;
      const isCur = mi === scanIdx;

      if (isCur){
        ctx.fillStyle = panel2;
        roundRect(ctx, listX - 8, y - 3, panelW - 32, rowH, 10);
        ctx.fill();

        // scanline sweep within row
        const s = (scanT * 1.2) % 1;
        ctx.fillStyle = `hsla(${hue}, 90%, 65%, ${0.10 + 0.12 * (1 - Math.abs(0.5 - s) * 2)})`;
        ctx.fillRect(listX - 8 + (panelW - 32) * s, y - 3, 18, rowH);
      }

      ctx.fillStyle = isCur ? ok : inkDim;
      ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(m.code, listX, y);

      ctx.fillStyle = isCur ? ink : inkDim;
      ctx.fillText(m.dest.padEnd(7, ' '), listX + Math.floor(panelW * 0.42), y);

      if (m.flags){
        ctx.fillStyle = isCur ? warn : `hsla(${(hue + 330) % 360}, 70%, 64%, 0.45)`;
        ctx.fillText(m.flags, listX + Math.floor(panelW * 0.70), y);
      }
    }

    // footer status
    const ft = 0.5 + 0.5 * Math.sin(t * 0.8);
    ctx.fillStyle = `hsla(${hue}, 90%, 60%, ${0.20 + 0.14 * ft})`;
    ctx.fillRect(px + 16, py + ph - 26, panelW - 32, 2);

    ctx.restore();
  }

  function drawArrow(ctx, x0, y0, x1, y1, phaseShift, col){
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    // dashed glowing line with moving dashes
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, h / 620);
    ctx.setLineDash([10, 10]);
    ctx.lineDashOffset = -((t * 60 + phaseShift) % 20);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    // simple curve
    const cx = (x0 + x1) * 0.5 + dy * 0.18;
    const cy = (y0 + y1) * 0.5 - dx * 0.18;
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.stroke();

    // arrow head
    const ang = Math.atan2(y1 - cy, x1 - cx);
    ctx.setLineDash([]);
    ctx.fillStyle = col;
    const ah = Math.max(8, Math.min(16, len * 0.06));
    ctx.translate(x1, y1);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-ah, ah * 0.5);
    ctx.lineTo(-ah, -ah * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBay(ctx){
    const pad = Math.max(14, Math.floor(Math.min(w, h) * 0.03));
    const panelW = Math.floor(w * 0.34);
    const bayX = pad + panelW + pad;
    const bayY = pad;
    const bayW = w - bayX - pad;
    const bayH = h - pad * 2;

    // bay frame
    ctx.save();
    ctx.fillStyle = `hsla(${(hue + 18) % 360}, 24%, 9%, 0.55)`;
    roundRect(ctx, bayX, bayY, bayW, bayH, 18);
    ctx.fill();

    ctx.strokeStyle = `hsla(${hue}, 90%, 62%, 0.18)`;
    ctx.lineWidth = 1;
    roundRect(ctx, bayX + 1, bayY + 1, bayW - 2, bayH - 2, 17);
    ctx.stroke();

    // destination nodes (top row)
    const nodes = [
      { name: 'HATCH A', x: bayX + bayW * 0.18, y: bayY + bayH * 0.10 },
      { name: 'HATCH B', x: bayX + bayW * 0.50, y: bayY + bayH * 0.10 },
      { name: 'HATCH C', x: bayX + bayW * 0.82, y: bayY + bayH * 0.10 },
      { name: 'RING 2', x: bayX + bayW * 0.28, y: bayY + bayH * 0.92 },
      { name: 'DOCK 7', x: bayX + bayW * 0.56, y: bayY + bayH * 0.92 },
      { name: 'BAY 04', x: bayX + bayW * 0.84, y: bayY + bayH * 0.92 },
    ];

    const nodePos = {};
    for (const n of nodes) nodePos[n.name] = n;

    for (const n of nodes){
      const r = Math.max(7, Math.min(14, bayW * 0.02));
      ctx.fillStyle = `hsla(${hue}, 90%, 62%, 0.12)`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 1.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `hsla(${hue}, 90%, 62%, 0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = inkDim;
      ctx.font = `${Math.max(11, Math.floor(mono * 0.85))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(n.name, n.x, n.y + r + 6);
    }
    ctx.textAlign = 'left';

    // containers
    const cur = manifest[scanIdx]?.idx ?? 0;
    for (const c of containers){
      const isCur = c.i === cur;
      const heat = isCur ? (0.6 + 0.4 * (1 - Math.abs(0.5 - scanT) * 2)) : c.heat;
      const q = Math.max(0, c.quarantined);

      ctx.fillStyle = `hsla(${(hue + 14) % 360}, 22%, ${10 + heat * 6}%, 0.92)`;
      roundRect(ctx, c.x, c.y, c.cw, c.ch, 14);
      ctx.fill();

      // edge glow
      const edgeA = 0.10 + heat * 0.35;
      ctx.strokeStyle = `hsla(${hue}, 90%, 62%, ${edgeA})`;
      ctx.lineWidth = Math.max(1, h / 880);
      roundRect(ctx, c.x + 1, c.y + 1, c.cw - 2, c.ch - 2, 13);
      ctx.stroke();

      // quarantine overlay
      if (q > 0.02){
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `hsla(${(hue + 350) % 360}, 92%, 60%, ${0.08 + q * 0.20})`;
        roundRect(ctx, c.x, c.y, c.cw, c.ch, 14);
        ctx.fill();
        ctx.restore();

        // warning stripes
        const stripeW = Math.max(10, Math.floor(c.cw * 0.08));
        ctx.save();
        ctx.globalAlpha = 0.25 + q * 0.35;
        ctx.translate(c.x + c.cw * 0.5, c.y + c.ch * 0.5);
        ctx.rotate(-0.28);
        ctx.fillStyle = danger;
        for (let x = -c.cw; x < c.cw; x += stripeW * 2){
          ctx.fillRect(x, -c.ch, stripeW, c.ch * 2);
        }
        ctx.restore();
      }

      // label
      ctx.fillStyle = isCur ? ink : inkDim;
      ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'top';
      ctx.fillText(c.code, c.x + 14, c.y + 12);
      ctx.fillStyle = isCur ? ok : inkDim;
      ctx.fillText(c.dest, c.x + 14, c.y + 12 + mono + 4);

      // scan bar in current container
      if (isCur){
        const s = scanDir > 0 ? scanT : (1 - scanT);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `hsla(${hue}, 90%, 62%, ${0.06 + 0.18 * (1 - Math.abs(0.5 - s) * 2)})`;
        ctx.fillRect(c.x + c.cw * s, c.y + 6, Math.max(10, c.cw * 0.08), c.ch - 12);
        ctx.restore();
      }

      // routing arrow
      const node = nodePos[c.dest] || nodes[0];
      const ax0 = c.x + c.cw * 0.5;
      const ay0 = c.y + c.ch * 0.5;
      const ax1 = node.x;
      const ay1 = node.y;
      const col = q > 0.02 ? danger : `hsla(${hue}, 90%, 62%, ${0.10 + heat * 0.22})`;
      drawArrow(ctx, ax0, ay0, ax1, ay1, c.i * 23, col);
    }

    // global sweep overlay
    if (sweep > 0){
      const s = 1 - sweep;
      const x = bayX + bayW * s;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const a = 0.10 + 0.15 * (1 - Math.abs(0.5 - s) * 2);
      ctx.fillStyle = `hsla(${hue}, 90%, 65%, ${a})`;
      ctx.fillRect(x - 18, bayY, 36, bayH);
      ctx.fillStyle = `hsla(${hue}, 90%, 65%, ${a * 0.6})`;
      ctx.fillRect(x - 60, bayY, 6, bayH);
      ctx.fillRect(x + 54, bayY, 6, bayH);
      ctx.restore();
    }

    // anomaly overlay banner
    if (anomaly){
      const a = 0.5 + 0.5 * Math.sin(anomaly.t * 7.5);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `hsla(${(hue + 350) % 360}, 95%, 60%, ${0.10 + 0.18 * a})`;
      roundRect(ctx, bayX + bayW * 0.18, bayY + bayH * 0.42, bayW * 0.64, bayH * 0.16, 16);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = danger;
      ctx.font = `700 ${Math.max(16, Math.floor(font * 1.05))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ANOMALY DETECTED', bayX + bayW * 0.5, bayY + bayH * 0.48);
      ctx.fillStyle = `hsla(${(hue + 350) % 360}, 90%, 70%, 0.88)`;
      ctx.font = `600 ${Math.max(13, Math.floor(font * 0.85))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText('QUARANTINE CONTAINER • ISOLATE ROUTE', bayX + bayW * 0.5, bayY + bayH * 0.54);
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBG(ctx);
    drawPanels(ctx);
    drawBay(ctx);

    // subtle vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
