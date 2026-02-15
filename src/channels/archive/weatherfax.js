import { mulberry32, clamp } from '../../util/prng.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

export function createChannel({ seed, audio }){
  let w = 0;
  let h = 0;
  let dpr = 1;

  let t = 0;
  let loopT = 0;
  let cycle = 0;

  // phase timings (seconds)
  const receiveDur = 8.0;
  const printDur = 18.0;
  const annotateDur = 9.0;
  const archiveDur = 7.0;
  const loopDur = receiveDur + printDur + annotateDur + archiveDur;

  // layout
  let s = 1;
  let paperX = 0;
  let paperY = 0;
  let paperW = 0;
  let paperH = 0;
  let pad = 0;

  // render assets (regenerated on resize / cycle)
  let inkCanvas = null; // transparent; ink only
  let inkW = 0;
  let inkH = 0;

  let dotPattern = null;

  // deterministic scene content
  let headerText = '';
  let mapName = '';
  let labels = []; // {x,y,text}
  let annoStrokes = []; // [{color, pts:[{x,y}], w}]

  // moments
  let glitchStripe = { t0: 0, dur: 0, y: 0, h: 0 };
  let jam = { t0: 0, dur: 0 };
  let stamp = { t0: 0, dur: 0, text: '' };

  // audio
  let ambience = null;
  let printAcc = 0;
  let lastPrintRow = -1;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function ensureDotPattern(){
    const cell = Math.max(5, Math.floor(6 * dpr));
    const c = document.createElement('canvas');
    c.width = cell;
    c.height = cell;
    const g = c.getContext('2d');

    // dot-matrix-ish: one strong dot + a faint neighbor
    g.clearRect(0, 0, cell, cell);
    g.fillStyle = 'rgba(14, 22, 30, 0.95)';
    g.fillRect(1, 1, Math.max(1, Math.floor(cell * 0.26)), Math.max(1, Math.floor(cell * 0.26)));
    g.fillStyle = 'rgba(14, 22, 30, 0.25)';
    g.fillRect(1 + Math.floor(cell * 0.28), 1 + Math.floor(cell * 0.16), 1, 1);

    dotPattern = c;
  }

  function mkInk(prng){
    // ink canvas is sized in backing pixels for crispness
    inkW = Math.max(2, Math.floor(paperW));
    inkH = Math.max(2, Math.floor(paperH));

    inkCanvas = document.createElement('canvas');
    inkCanvas.width = Math.floor(inkW * dpr);
    inkCanvas.height = Math.floor(inkH * dpr);
    const ctx = inkCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, inkW, inkH);

    // base ink style
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(16, 26, 36, 0.95)';
    ctx.fillStyle = 'rgba(16, 26, 36, 0.95)';

    // header (fax feel)
    ctx.font = `${Math.max(12, Math.floor(paperW * 0.035))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(headerText, pad, pad * 0.55);
    ctx.globalAlpha = 0.8;
    ctx.fillText(mapName, pad, pad * 0.55 + Math.max(14, Math.floor(paperW * 0.045)));
    ctx.globalAlpha = 1;

    // small grid
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    const gx0 = pad;
    const gy0 = pad * 2.2;
    const gw = paperW - pad * 2;
    const gh = paperH - gy0 - pad;

    const step = Math.max(18, Math.floor(paperW * 0.08));
    for (let x = gx0; x <= gx0 + gw + 0.5; x += step){
      ctx.beginPath();
      ctx.moveTo(x, gy0);
      ctx.lineTo(x, gy0 + gh);
      ctx.stroke();
    }
    for (let y = gy0; y <= gy0 + gh + 0.5; y += step){
      ctx.beginPath();
      ctx.moveTo(gx0, y);
      ctx.lineTo(gx0 + gw, y);
      ctx.stroke();
    }
    ctx.restore();

    // coastline (stylised)
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(1.5, paperW * 0.006);

    const coast = [];
    const coastN = 24;
    const baseY = gy0 + gh * (0.25 + prng() * 0.25);
    const amp = gh * (0.08 + prng() * 0.12);
    const jitter = gh * (0.03 + prng() * 0.05);
    for (let i = 0; i <= coastN; i++){
      const u = i / coastN;
      const x = gx0 + u * gw;
      const y = baseY + Math.sin(u * (3 + prng() * 3) * Math.PI) * amp + (prng() * 2 - 1) * jitter;
      coast.push({ x, y });
    }
    ctx.beginPath();
    ctx.moveTo(coast[0].x, coast[0].y);
    for (let i = 1; i < coast.length; i++) ctx.lineTo(coast[i].x, coast[i].y);
    ctx.stroke();

    // a couple of islands
    for (let k = 0; k < 3; k++){
      const ix = gx0 + gw * (0.2 + prng() * 0.6);
      const iy = gy0 + gh * (0.15 + prng() * 0.65);
      const r = gw * (0.02 + prng() * 0.035);
      ctx.beginPath();
      ctx.ellipse(ix, iy, r, r * (0.75 + prng() * 0.5), prng() * Math.PI, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // isobars
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(1.2, paperW * 0.004);

    const isoCount = 6 + ((prng() * 3) | 0);
    for (let k = 0; k < isoCount; k++){
      const yMid = gy0 + gh * (0.08 + (k / (isoCount - 1)) * 0.82);
      const wig = gh * (0.03 + prng() * 0.03);
      const freq = 2 + prng() * 3;
      ctx.beginPath();
      for (let i = 0; i <= 42; i++){
        const u = i / 42;
        const x = gx0 + u * gw;
        const y = yMid + Math.sin((u * freq + prng() * 1.2) * Math.PI * 2) * wig + Math.sin((u * 1.0 + k * 0.17) * Math.PI * 2) * wig * 0.55;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // pressure label
      if (k % 2 === 0){
        const lx = gx0 + gw * (0.12 + prng() * 0.76);
        const ly = yMid + wig * 0.35;
        const p = 980 + k * 6 + ((prng() * 6) | 0);
        ctx.font = `${Math.max(10, Math.floor(paperW * 0.03))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
        ctx.fillText(String(p), lx, ly);
      }
    }
    ctx.restore();

    // fronts (cold / warm)
    function drawFront(kind){
      const x0 = gx0 + gw * (0.08 + prng() * 0.2);
      const y0 = gy0 + gh * (0.35 + prng() * 0.5);
      const x1 = gx0 + gw * (0.75 + prng() * 0.2);
      const y1 = gy0 + gh * (0.18 + prng() * 0.65);

      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = Math.max(1.4, paperW * 0.0045);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) * 0.5 + (prng() * 2 - 1) * gw * 0.08, (y0 + y1) * 0.5 + (prng() * 2 - 1) * gh * 0.08, x1, y1);
      ctx.stroke();

      const segs = 10;
      for (let i = 0; i <= segs; i++){
        const u = i / segs;
        const x = lerp(x0, x1, u);
        const y = lerp(y0, y1, u);
        const sz = Math.max(6, Math.floor(paperW * 0.02));
        if (kind === 'cold'){
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - sz * 0.55, y + sz * 0.9);
          ctx.lineTo(x + sz * 0.55, y + sz * 0.9);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, sz * 0.4, 0, Math.PI);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    if (prng() < 0.7) drawFront('cold');
    if (prng() < 0.6) drawFront('warm');

    // add label list for later HUD and annotate (deterministic)
    labels = [];
    const labN = 4 + ((prng() * 3) | 0);
    for (let i = 0; i < labN; i++){
      const x = gx0 + gw * (0.12 + prng() * 0.76);
      const y = gy0 + gh * (0.12 + prng() * 0.76);
      const kind = prng() < 0.5 ? 'H' : 'L';
      const v = (kind === 'H' ? 1020 : 980) + (((prng() * 36) | 0) - 18);
      labels.push({ x, y, text: `${kind}${v}` });

      ctx.save();
      ctx.font = `${Math.max(11, Math.floor(paperW * 0.032))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
      ctx.fillText(`${kind} ${String(v)}`, x, y);
      ctx.restore();
    }
  }

  function mkAnnotations(prng){
    const strokes = [];
    const gx0 = pad;
    const gy0 = pad * 2.2;
    const gw = paperW - pad * 2;
    const gh = paperH - gy0 - pad;

    // red pen circles around a couple of labels
    for (let i = 0; i < Math.min(2, labels.length); i++){
      const L = labels[(i * 3 + 1) % labels.length];
      const r = Math.max(14, paperW * (0.05 + prng() * 0.02));
      const pts = [];
      const n = 36;
      for (let k = 0; k <= n; k++){
        const a = (k / n) * Math.PI * 2;
        const wob = 1 + (prng() * 2 - 1) * 0.08;
        pts.push({
          x: L.x + Math.cos(a) * r * wob,
          y: L.y + Math.sin(a) * r * wob,
        });
      }
      strokes.push({ color: 'rgba(176, 32, 36, 0.9)', w: Math.max(2, paperW * 0.006), pts });
    }

    // a quick scribble line (operator note)
    {
      const x0 = gx0 + gw * (0.18 + prng() * 0.1);
      const y0 = gy0 + gh * (0.86 + prng() * 0.06);
      const pts = [];
      const n = 18;
      for (let k = 0; k <= n; k++){
        const u = k / n;
        pts.push({
          x: x0 + u * gw * 0.62 + Math.sin(u * 7 * Math.PI) * paperW * 0.006,
          y: y0 + Math.cos(u * 5 * Math.PI) * paperH * 0.004,
        });
      }
      strokes.push({ color: 'rgba(176, 32, 36, 0.75)', w: Math.max(1.6, paperW * 0.0045), pts });
    }

    annoStrokes = strokes;
  }

  function regen(){
    const prng = mulberry32((seed ^ (cycle * 0x9e3779b9)) >>> 0);

    s = Math.min(w, h);
    paperW = Math.floor(s * 0.60);
    paperH = Math.floor(s * 0.82);
    pad = Math.max(16, Math.floor(s * 0.035));

    paperX = Math.floor(w * 0.5 - paperW * 0.5);
    paperY = Math.floor(h * 0.12);

    const maps = ['SOUTHERN OCEAN', 'BASS STRAIT', 'CORAL SEA', 'NORTH ATLANTIC', 'PACIFIC SECTOR'];
    mapName = `CHART: ${maps[(prng() * maps.length) | 0]}`;

    const day = 1 + ((prng() * 28) | 0);
    const hour = ((prng() * 24) | 0);
    headerText = `WEATHERFAX RX  UTC ${String(day).padStart(2, '0')}/${String(hour).padStart(2, '0')}00Z   SEED ${String(seed).slice(0, 6)}`;

    ensureDotPattern();
    mkInk(prng);
    mkAnnotations(prng);

    // moments within loop (deterministic)
    glitchStripe = {
      t0: 2.0 + prng() * 2.5,
      dur: 0.9 + prng() * 0.7,
      y: paperH * (0.22 + prng() * 0.5),
      h: Math.max(10, paperH * (0.05 + prng() * 0.05)),
    };

    jam = {
      t0: receiveDur + printDur * (0.45 + prng() * 0.25),
      dur: 0.85,
    };

    stamp = {
      t0: receiveDur + printDur + annotateDur * (0.42 + prng() * 0.25),
      dur: 1.4,
      text: prng() < 0.65 ? 'STORM WATCH' : 'GALE WARNING',
    };

    // audio printer tick tracking
    printAcc = 0;
    lastPrintRow = -1;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    t = 0;
    loopT = 0;
    cycle = 0;
    regen();
  }

  function onResize(width, height, dprIn){
    w = width;
    h = height;
    dpr = dprIn || 1;
    regen();
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // quiet radio/fax carrier bed
    const n = audio.noiseSource({ type: 'pink', gain: 0.0019 });
    n.start();

    ambience = {
      stop(){ try{ n.stop(); } catch {} }
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try{ ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    loopT += dt;

    if (loopT >= loopDur){
      loopT -= loopDur;
      cycle = (cycle + 1) | 0;
      regen();
    }

    // printing click ticks (roughly row-based)
    const pPrint = clamp((loopT - receiveDur) / printDur, 0, 1);
    if (audio.enabled && pPrint > 0 && pPrint < 1){
      // estimate number of printed rows as progress * paperH
      const printedRow = Math.floor(pPrint * (paperH / Math.max(4, Math.floor(6 * dpr))));
      if (printedRow !== lastPrintRow){
        lastPrintRow = printedRow;
        safeBeep({ freq: 2200, dur: 0.006, gain: 0.0012, type: 'square' });
        if (printedRow % 9 === 0) safeBeep({ freq: 1400, dur: 0.009, gain: 0.0009, type: 'square' });
      }
    }

    // occasional carrier blip while receiving
    const pRx = clamp(loopT / receiveDur, 0, 1);
    if (audio.enabled && pRx > 0 && pRx < 1){
      printAcc += dt * 0.85;
      if (printAcc >= 1){
        printAcc -= 1;
        safeBeep({ freq: 820 + (pRx * 220), dur: 0.04, gain: 0.0010, type: 'sine' });
      }
    }
  }

  function drawTerminal(ctx){
    // CRT-ish background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#070b12');
    bg.addColorStop(0.55, '#0a0f1a');
    bg.addColorStop(1, '#05070d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // scanlines
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    const step = Math.max(2, Math.floor(3 * dpr));
    for (let y = 0; y < h; y += step){
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();

    // small HUD
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(120, 210, 255, 0.85)';
    ctx.font = `${Math.max(12, Math.floor(s * 0.03))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('WEATHERFAX TERMINAL', Math.floor(w * 0.06), Math.floor(h * 0.05));
    ctx.globalAlpha = 0.65;
    ctx.fillText('MODE: RX/PRINT/ANNOTATE/ARCHIVE', Math.floor(w * 0.06), Math.floor(h * 0.05) + Math.floor(s * 0.035));
    ctx.restore();
  }

  function draw(ctx){
    drawTerminal(ctx);

    const pRx = clamp(loopT / receiveDur, 0, 1);
    const pPrint = clamp((loopT - receiveDur) / printDur, 0, 1);
    const pAnno = clamp((loopT - receiveDur - printDur) / annotateDur, 0, 1);
    const pArch = clamp((loopT - receiveDur - printDur - annotateDur) / archiveDur, 0, 1);

    // paper feed offset and archive motion
    const feed = ease(pPrint) * paperH * 0.12;
    const archDrop = ease(pArch) * paperH * 0.9;

    // paper jam shake
    let shake = 0;
    if (loopT >= jam.t0 && loopT <= jam.t0 + jam.dur){
      const u = (loopT - jam.t0) / jam.dur;
      shake = Math.sin(u * Math.PI * 14) * (1 - u) * (2.6 * dpr);
    }

    // paper shadow
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#000';
    ctx.fillRect(paperX + 6 * dpr + shake, paperY + 10 * dpr + archDrop, paperW, paperH);
    ctx.restore();

    // paper body
    ctx.save();
    ctx.translate(paperX + shake, paperY + archDrop - feed);

    ctx.fillStyle = '#f4f0e6';
    ctx.fillRect(0, 0, paperW, paperH);

    // slight paper texture
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 90; i++){
      const x = (i * 97 + (seed & 255)) % paperW;
      const y = (i * 53 + ((seed >> 8) & 255)) % paperH;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();

    // receiving scanline + faint pre-roll
    if (pRx > 0 && pPrint <= 0.01){
      const y = pad * 2.2 + (paperH - pad * 3) * pRx;
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.22 * (1 - pRx);
      ctx.fillStyle = 'rgba(120, 210, 255, 0.85)';
      ctx.fillRect(pad, y, paperW - pad * 2, Math.max(2, 3 * dpr));
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = 'rgba(16, 26, 36, 0.7)';
      ctx.font = `${Math.max(12, Math.floor(paperW * 0.032))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
      ctx.textBaseline = 'top';
      ctx.fillText('RECEIVING…', pad, pad * 0.6);
      ctx.restore();
    }

    // printed reveal
    const printedH = Math.floor(paperH * ease(pPrint));

    if (printedH > 0){
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, paperW, printedH);
      ctx.clip();

      // ink layer
      ctx.drawImage(inkCanvas, 0, 0, paperW, paperH);

      // convert ink to dot-matrix via source-in
      ctx.globalCompositeOperation = 'source-in';
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = ctx.createPattern(dotPattern, 'repeat');
      ctx.fillRect(0, 0, paperW, printedH);

      ctx.restore();

      // glitch stripe during receive/early print: blank a section
      if (loopT >= glitchStripe.t0 && loopT <= glitchStripe.t0 + glitchStripe.dur){
        const u = (loopT - glitchStripe.t0) / glitchStripe.dur;
        ctx.save();
        ctx.globalAlpha = 0.85 * (1 - Math.abs(u - 0.5) * 1.8);
        ctx.fillStyle = '#f4f0e6';
        ctx.fillRect(pad, glitchStripe.y, paperW - pad * 2, glitchStripe.h);
        ctx.restore();
      }

      // annotate strokes (draw progressively)
      if (pAnno > 0){
        const amt = ease(pAnno);
        ctx.save();
        ctx.globalAlpha = 0.9;
        for (const st of annoStrokes){
          const n = st.pts.length;
          const kMax = Math.max(2, Math.floor(n * amt));
          ctx.strokeStyle = st.color;
          ctx.lineWidth = st.w;
          ctx.beginPath();
          ctx.moveTo(st.pts[0].x, st.pts[0].y);
          for (let i = 1; i < kMax; i++) ctx.lineTo(st.pts[i].x, st.pts[i].y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // stamp moment
      if (loopT >= stamp.t0){
        const u = clamp((loopT - stamp.t0) / stamp.dur, 0, 1);
        const a = (u < 0.25) ? ease(u / 0.25) : (u < 0.7 ? 1 : 1 - ease((u - 0.7) / 0.3));
        ctx.save();
        ctx.globalAlpha = 0.55 * a;
        ctx.translate(paperW * 0.58, paperH * 0.18);
        ctx.rotate(-0.22);
        ctx.strokeStyle = 'rgba(176, 32, 36, 0.95)';
        ctx.lineWidth = Math.max(3, paperW * 0.012);
        ctx.strokeRect(-paperW * 0.19, -paperH * 0.06, paperW * 0.38, paperH * 0.12);
        ctx.fillStyle = 'rgba(176, 32, 36, 0.85)';
        ctx.font = `bold ${Math.max(14, Math.floor(paperW * 0.045))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stamp.text, 0, 0);
        ctx.restore();
      }
    }

    // archive footer text
    if (pArch > 0){
      const a = ease(pArch);
      ctx.save();
      ctx.globalAlpha = 0.7 * a;
      ctx.fillStyle = 'rgba(16, 26, 36, 0.8)';
      ctx.font = `${Math.max(12, Math.floor(paperW * 0.032))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
      ctx.textBaseline = 'bottom';
      ctx.fillText('ARCHIVING…', pad, paperH - pad * 0.6);
      ctx.restore();
    }

    ctx.restore();

    // side stack hint
    ctx.save();
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = '#f4f0e6';
    const sx = paperX + paperW + Math.floor(s * 0.05);
    const sy = paperY + Math.floor(s * 0.3);
    const sw = Math.floor(s * 0.18);
    const sh = Math.floor(s * 0.36);
    for (let i = 0; i < 4; i++){
      ctx.fillRect(sx + i * 3 * dpr, sy + i * 6 * dpr, sw, sh);
    }
    ctx.restore();

    // status line
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(120, 210, 255, 0.75)';
    ctx.font = `${Math.max(12, Math.floor(s * 0.028))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.textBaseline = 'bottom';

    const mode = (loopT < receiveDur) ? 'RX' : (loopT < receiveDur + printDur) ? 'PRINT' : (loopT < receiveDur + printDur + annotateDur) ? 'ANNOTATE' : 'ARCHIVE';
    const sig = (loopT < receiveDur) ? Math.floor(40 + 60 * Math.sin(loopT * 1.4) * 0.5 + 30 * Math.sin(loopT * 3.1) * 0.5) : 92;
    ctx.fillText(`MODE:${mode}   SIG:${String(sig).padStart(3,' ')}%   CHART:${mapName.slice(7)}`, Math.floor(w * 0.06), h - Math.floor(h * 0.05));
    ctx.restore();
  }

  return {
    init,
    onResize,
    update,
    draw,
    onAudioOn,
    onAudioOff,
    destroy,
  };
}
