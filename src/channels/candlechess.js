import { mulberry32 } from '../util/prng.js';

// REVIEWED: 2026-02-11
// Candlelit Chess Engine
// Calm candlelit chessboard that plays a deterministic scripted game.

const PIECE_VALUE = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);
  const seedU32 = (typeof seed === 'number' ? seed : 0) >>> 0;
  const dustSeed = (seedU32 ^ 0xa5a5a5a5) >>> 0;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  let board = new Array(64).fill(null); // piece objects
  let pieces = []; // all live pieces

  let lastMove = null; // {from,to, special}
  let moveIndex = 0;
  let moveTimer = 0;
  let phaseHold = 0;
  let resetting = false;
  let fade = 0;

  let dust = [];

  let ambience = null;

  const MOVE_PERIOD = 4.8 + rand() * 0.8;

  // Perf: cache gradients/sprites on init/resize/ctx swap so steady-state render does
  // 0 create*Gradient calls (and avoids expensive candle gradients per frame).
  const cache = {
    ctx: null,
    dirty: true,

    // Board/table/vignette gradients
    bg: null,
    frame: null,
    sheen: null,
    vignette: null,

    // Candle sprites (pre-rendered)
    candleBody: null,
    candleBodyW: 0,
    candleBodyH: 0,
    candleBodyAx: 0,
    candleBodyAy: 0,

    candleGlow: null,
    candleGlowS: 0,

    candleFlame: null,
    candleFlameW: 0,
    candleFlameH: 0,
    candleFlameAx: 0,
    candleFlameAy: 0,
    candleFlameBaseFr: 0,
  };

  function hashU32(x){
    x = (x ^ (x >>> 16)) >>> 0;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0;
    x = Math.imul(x, 0x846ca68b) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x >>> 0;
  }

  function hashUnit(x){
    return hashU32(x) / 4294967296;
  }

  function makeCanvas(W, H) {
    if (!(W > 0 && H > 0)) return null;
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(W, H);
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return c;
    }
    return null;
  }

  function invalidateCaches() {
    cache.dirty = true;
  }

  function rebuildCaches(ctx) {
    cache.ctx = ctx;
    cache.dirty = false;

    // Base layout (no camera offset) so cached gradients stay stable.
    const s = Math.floor(Math.min(w, h) * 0.085);
    const boardSize = s * 8;
    const baseX = Math.floor(w * 0.5 - boardSize * 0.5);
    const baseY = Math.floor(h * 0.56 - boardSize * 0.5);

    // Background gradient.
    {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#090707');
      g.addColorStop(0.5, '#0f0b09');
      g.addColorStop(1, '#040303');
      cache.bg = g;
    }

    // Board frame gradient.
    {
      const g = ctx.createLinearGradient(0, baseY, 0, baseY + boardSize);
      g.addColorStop(0, 'rgba(70,45,28,0.95)');
      g.addColorStop(1, 'rgba(40,26,16,0.98)');
      cache.frame = g;
    }

    // Sheen: bake as a 1.0 alpha gradient; scale in render via globalAlpha.
    {
      const g = ctx.createLinearGradient(baseX, baseY, baseX + boardSize, baseY + boardSize);
      g.addColorStop(0, 'rgba(255,220,170,1)');
      g.addColorStop(0.6, 'rgba(255,220,170,0)');
      g.addColorStop(1, 'rgba(255,220,170,0)');
      cache.sheen = g;
    }

    // Vignette.
    {
      const g = ctx.createRadialGradient(
        w * 0.5,
        h * 0.55,
        Math.min(w, h) * 0.2,
        w * 0.5,
        h * 0.55,
        Math.max(w, h) * 0.7
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      cache.vignette = g;
    }

    // Candle body sprite (wax gradient baked).
    {
      const bodyW = 36;
      const bodyH = 120;
      const pad = 28;

      const W = Math.ceil(bodyW + pad * 2);
      const H = Math.ceil(bodyH + pad * 2);
      const c = makeCanvas(W, H);
      const cctx = c?.getContext?.('2d');

      if (cctx) {
        const cx = W * 0.5;
        const cy = pad + bodyH; // anchor at base of candle

        const wax = cctx.createLinearGradient(cx - bodyW * 0.5, cy - bodyH, cx + bodyW * 0.5, cy);
        wax.addColorStop(0, 'rgba(240,235,220,0.95)');
        wax.addColorStop(0.5, 'rgba(220,212,196,0.95)');
        wax.addColorStop(1, 'rgba(245,240,225,0.95)');

        cctx.clearRect(0, 0, W, H);
        cctx.fillStyle = wax;
        roundRect(cctx, cx - bodyW * 0.52, cy - bodyH, bodyW * 1.04, bodyH, bodyW * 0.25);
        cctx.fill();

        cache.candleBody = c;
        cache.candleBodyW = W;
        cache.candleBodyH = H;
        cache.candleBodyAx = cx;
        cache.candleBodyAy = cy;
      } else {
        cache.candleBody = null;
      }
    }

    // Candle glow sprite (radial gradient baked; intensity scaled via globalAlpha).
    {
      const S = 256;
      const c = makeCanvas(S, S);
      const cctx = c?.getContext?.('2d');

      if (cctx) {
        const cx = S * 0.5;
        const cy = S * 0.5;
        const r = S * 0.5;

        const g = cctx.createRadialGradient(cx, cy, 1, cx, cy, r);
        g.addColorStop(0, 'rgba(255,190,120,1)');
        g.addColorStop(0.45, 'rgba(255,140,70,0.28)');
        g.addColorStop(1, 'rgba(255,140,70,0)');

        cctx.clearRect(0, 0, S, S);
        cctx.fillStyle = g;
        cctx.beginPath();
        cctx.arc(cx, cy, r, 0, Math.PI * 2);
        cctx.fill();

        cache.candleGlow = c;
        cache.candleGlowS = S;
      } else {
        cache.candleGlow = null;
        cache.candleGlowS = 0;
      }
    }

    // Candle flame sprite (elliptical radial gradient baked; scaled by fr).
    {
      const baseFr = 90;
      const rx = baseFr * 0.62;
      const ry = baseFr;
      const pad = 22;
      const W = Math.ceil(rx * 2 + pad * 2);
      const H = Math.ceil(ry * 2 + pad * 2);

      const c = makeCanvas(W, H);
      const cctx = c?.getContext?.('2d');

      if (cctx) {
        const cx = W * 0.5;
        const cy = H * 0.5;

        const g = cctx.createRadialGradient(cx, cy, 1, cx, cy, ry);
        g.addColorStop(0, 'rgba(255,255,220,1)');
        g.addColorStop(0.35, 'rgba(255,200,110,0.78)');
        g.addColorStop(1, 'rgba(255,120,40,0)');

        cctx.clearRect(0, 0, W, H);
        cctx.fillStyle = g;
        cctx.beginPath();
        cctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        cctx.fill();

        cache.candleFlame = c;
        cache.candleFlameW = W;
        cache.candleFlameH = H;
        cache.candleFlameAx = cx;
        cache.candleFlameAy = cy;
        cache.candleFlameBaseFr = baseFr;
      } else {
        cache.candleFlame = null;
        cache.candleFlameW = 0;
        cache.candleFlameH = 0;
        cache.candleFlameAx = 0;
        cache.candleFlameAy = 0;
        cache.candleFlameBaseFr = 0;
      }
    }
  }

  function ensureCaches(ctx) {
    if (cache.dirty || cache.ctx !== ctx) rebuildCaches(ctx);
  }

  // Scripted, plausible-enough mini-game. UCI coords (e2e4), optional promotion suffix.
  // Special moments: bishop sacrifice + pawn promotion.
  const MOVES = [
    'e2e4', 'e7e5',
    'f1c4', 'b8c6',
    'd1h5', 'g8f6',
    'c4f7', 'e8f7', // sacrifice / king takes
    'h2h4', 'd7d6',
    'h4h5', 'a7a6',
    'h5h6', 'b7b6',
    'h6h7', 'c7c6',
    'h7h8q',
  ];

  function idx(file, rank){
    // file: 0..7 (a..h), rank: 1..8
    const row = 8 - rank;
    return row * 8 + file;
  }

  function parseSq(s){
    const file = s.charCodeAt(0) - 97;
    const rank = s.charCodeAt(1) - 48;
    return { file, rank, i: idx(file, rank) };
  }

  function put(file, rank, code){
    const p = {
      code,
      i: idx(file, rank),
      anim: null, // {fromI,toI, t, dur}
      capt: null, // {t, dur}
      jiggle: rand() * 100,
    };
    board[p.i] = p;
    pieces.push(p);
  }

  function removeAt(file, rank){
    const i = idx(file, rank);
    const p = board[i];
    if (!p) return;
    board[i] = null;
    const k = pieces.indexOf(p);
    if (k >= 0) pieces.splice(k, 1);
  }

  function sortPiecesForRender(){
    // Keep render order stable without per-frame array copies/sorts.
    // Order: back-to-front by row (0..7).
    pieces.sort((a,b) => ((a.i/8)|0) - ((b.i/8)|0));
  }

  function resetGame(){

    board = new Array(64).fill(null);
    pieces = [];
    lastMove = null;

    // Standard start.
    const backW = ['r','n','b','q','k','b','n','r'].map(c => c.toUpperCase());
    const backB = ['r','n','b','q','k','b','n','r'];

    for (let f=0; f<8; f++){
      put(f, 1, backW[f]);
      put(f, 2, 'P');
      put(f, 7, 'p');
      put(f, 8, backB[f]);
    }

    // Make room for the promotion story: remove black h-rook + h-pawn + g-pawn.
    removeAt(7, 8); // h8 rook
    removeAt(7, 7); // h7 pawn
    removeAt(6, 7); // g7 pawn (prevents gxh6)

    sortPiecesForRender();

    // Fresh timing.
    moveIndex = 0;
    moveTimer = 1.4 + rand() * 1.2;
    phaseHold = 0;
    resetting = false;
    fade = 0;
  }

  function materialEval(){
    let score = 0;
    for (const p of pieces){
      if (p.capt) continue;
      const c = p.code;
      const v = PIECE_VALUE[c.toLowerCase()] || 0;
      score += (c === c.toUpperCase()) ? v : -v;
    }
    // Small engine wobble.
    score += Math.sin(t * 0.7) * 0.35 + Math.sin(t * 0.17 + 2.2) * 0.25;
    return Math.max(-9.5, Math.min(9.5, score));
  }

  function pieceAt(i){ return board[i]; }

  function applyMove(m){
    const promo = /[qrbn]$/.test(m) ? m[m.length - 1] : null;
    const core = promo ? m.slice(0, -1) : m;
    const from = parseSq(core.slice(0, 2));
    const to = parseSq(core.slice(2, 4));

    const p = pieceAt(from.i);
    if (!p) return null;

    const cap = pieceAt(to.i);
    if (cap){
      cap.capt = { t: 0, dur: 0.35 };
      board[to.i] = null;
    }

    board[from.i] = null;
    board[to.i] = p;
    const fromI = p.i;
    p.i = to.i;

    // Promotion changes the piece code.
    if (promo){
      const isWhite = p.code === p.code.toUpperCase();
      const newCode = isWhite ? promo.toUpperCase() : promo;
      p.code = newCode;
    }

    p.anim = { fromI, toI: to.i, t: 0, dur: 1.15 };

    let special = null;
    if (core === 'c4f7') special = 'SACRIFICE';
    if (promo && core === 'h7h8') special = 'PROMOTION';

    sortPiecesForRender();

    return { from: from.i, to: to.i, special };
  }

  function initDust(){
    const n = 62;
    dust = Array.from({ length: n }, (_, i) => {
      const x0 = rand() * w;
      const y0 = rand() * h;
      return {
        i,
        x0,
        y0,
        x: x0,
        y: y0,
        z: 0.2 + rand() * 1.0,
        s: 0.6 + rand() * 1.4,
        w: rand() * 10, // phase
      };
    });
  }

  function onResize(width, height, _dpr=1){
    w = width;
    h = height;
    dpr = _dpr;
    initDust();
    invalidateCaches();
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();
    const out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(audio.master);

    // Candle / room tone.
    const n = audio.noiseSource({ type: 'pink', gain: 0.020 });
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 950;
    lpf.Q.value = 0.7;

    n.src.disconnect();
    n.src.connect(n.gain);
    n.gain.disconnect();
    n.gain.connect(lpf);
    lpf.connect(out);
    n.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.12); } catch {}
        try { n.stop(); } catch {}
      }
    };
  }

  function stopAmbience({ clearCurrent = false } = {}){
    const handle = ambience;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ambience = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive: avoid stacking our own ambience if onAudioOn gets called repeatedly.
    stopAmbience({ clearCurrent: true });

    ambience = makeAudioHandle();
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    stopAmbience({ clearCurrent: true });
  }

  function destroy(){ onAudioOff(); }

  function init({ width, height, dpr: _dpr=1 }){
    t = 0;
    onResize(width, height, _dpr);
    resetGame();
  }

  function update(dt){
    t += dt;

    // Update capture fades.
    for (let i=pieces.length-1; i>=0; i--){
      const p = pieces[i];
      if (p.capt){
        p.capt.t += dt;
        if (p.capt.t >= p.capt.dur){
          pieces.splice(i, 1);
        }
      }
    }

    // Update animations.
    let animating = false;
    for (const p of pieces){
      if (p.anim){
        p.anim.t += dt;
        if (p.anim.t >= p.anim.dur){
          p.anim = null;
        } else {
          animating = true;
        }
      }
    }

    // Dust (deterministic across FPS): compute position from global time `t`.
    const drift = w * 0.008;
    const wrapRange = h + 40; // y in [-20, h+20)
    for (const d of dust){
      const speed = 10 + 28 * d.z;

      // Wrap y without dt-quantized boundary triggers.
      let y = d.y0 - t * speed;
      y = (y + 20) % wrapRange;
      if (y < 0) y += wrapRange;
      y -= 20;

      // Change x base only when we wrap, via deterministic hash (no rand() in hot path).
      const k = Math.floor((d.y0 + 20 - t * speed) / wrapRange); // 0, -1, -2...
      const wraps = -k;
      const u = hashUnit(
        dustSeed ^ Math.imul(d.i + 1, 0x9e3779b1) ^ Math.imul(wraps + 1, 0x85ebca6b)
      );
      const xBase = wraps === 0 ? d.x0 : u * w;

      const sway = Math.sin(t * (0.28 + d.z * 0.18) + d.w);
      const x = xBase + sway * drift * (0.9 + d.z * 1.1);

      d.x = x;
      d.y = y;
    }

    // Phase holds (after special moments).
    phaseHold = Math.max(0, phaseHold - dt);

    // Reset/fade loop.
    if (resetting){
      fade = Math.min(1, fade + dt * 0.55);
      if (fade >= 1){
        resetGame();
        resetting = false;
      }
      return;
    } else {
      fade = Math.max(0, fade - dt * 0.75);
    }

    // Move stepping.
    if (!animating && phaseHold <= 0){
      moveTimer -= dt;
      if (moveTimer <= 0){
        const m = MOVES[moveIndex];
        if (!m){
          resetting = true;
          moveTimer = 2.8;
          return;
        }

        const mv = applyMove(m);
        lastMove = mv;
        moveIndex++;
        moveTimer = MOVE_PERIOD;

        if (mv?.special){
          phaseHold = mv.special === 'PROMOTION' ? 2.8 : 1.8;
          if (audio.enabled){
            audio.beep({
              freq: mv.special === 'PROMOTION' ? 740 : 520,
              dur: mv.special === 'PROMOTION' ? 0.09 : 0.06,
              gain: mv.special === 'PROMOTION' ? 0.020 : 0.012,
              type: 'triangle',
            });
          }
        }
      }
    }
  }

  function lerp(a,b,u){ return a + (b-a) * u; }
  function ease(u){ return u < 0.5 ? 4*u*u*u : 1 - Math.pow(-2*u+2,3)/2; }

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

  function squareCenter(i, boardRect){
    const file = i % 8;
    const row = (i / 8) | 0;
    const s = boardRect.s;

    // Gentle pseudo-perspective: compress + bias rows.
    const v = row / 7;
    const persp = 0.84 + v * 0.16;
    const cx = boardRect.x + (file + 0.5) * s;
    const cy = boardRect.y + (row + 0.5) * s;
    const py = boardRect.y + (cy - boardRect.y) * persp + (1 - persp) * boardRect.s * 0.2;
    return { x: cx, y: py, persp };
  }

  function drawVignette(ctx){
    if (!cache.vignette) return;
    ctx.fillStyle = cache.vignette;
    ctx.fillRect(0,0,w,h);
  }

  function drawCandle(ctx, cx, cy, scale, flick){
    const bodyW = scale * 36;
    const bodyH = scale * 120;

    // Warm glow.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glowR = scale * (240 + 60 * flick);
    const glowA = 0.24 + flick * 0.1;

    if (cache.candleGlow){
      ctx.globalAlpha = glowA;
      ctx.drawImage(
        cache.candleGlow,
        cx - glowR,
        cy - bodyH * 0.65 - glowR,
        glowR * 2,
        glowR * 2
      );
    } else {
      // Fallback (should be rare): old gradient path.
      const glow = ctx.createRadialGradient(cx, cy - bodyH*0.65, 1, cx, cy - bodyH*0.65, glowR);
      glow.addColorStop(0, `rgba(255,190,120,${glowA})`);
      glow.addColorStop(0.45, 'rgba(255,140,70,0.07)');
      glow.addColorStop(1, 'rgba(255,140,70,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy - bodyH*0.65, glowR, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // Body.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18 * scale;

    if (cache.candleBody){
      const dw = cache.candleBodyW * scale;
      const dh = cache.candleBodyH * scale;
      ctx.drawImage(
        cache.candleBody,
        cx - cache.candleBodyAx * scale,
        cy - cache.candleBodyAy * scale,
        dw,
        dh
      );
    } else {
      // Fallback (should be rare): old gradient path.
      const wax = ctx.createLinearGradient(cx-bodyW*0.5, cy-bodyH, cx+bodyW*0.5, cy);
      wax.addColorStop(0, 'rgba(240,235,220,0.95)');
      wax.addColorStop(0.5, 'rgba(220,212,196,0.95)');
      wax.addColorStop(1, 'rgba(245,240,225,0.95)');

      ctx.fillStyle = wax;
      roundRect(ctx, cx-bodyW*0.52, cy-bodyH, bodyW*1.04, bodyH, bodyW*0.25);
      ctx.fill();
    }
    ctx.restore();

    // Wick + flame.
    ctx.save();
    ctx.strokeStyle = 'rgba(40,30,25,0.8)';
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.beginPath();
    ctx.moveTo(cx, cy - bodyH);
    ctx.lineTo(cx + scale*2, cy - bodyH - scale*10);
    ctx.stroke();

    const fx = cx + Math.sin(t*4.2) * scale*3;
    const fy = cy - bodyH - scale*(18 + 4*flick);
    const fr = scale*(18 + 5*flick);

    if (cache.candleFlame){
      const sc = fr / cache.candleFlameBaseFr;
      const dw = cache.candleFlameW * sc;
      const dh = cache.candleFlameH * sc;
      ctx.globalAlpha = 0.92 + flick * 0.06;
      ctx.drawImage(
        cache.candleFlame,
        fx - cache.candleFlameAx * sc,
        fy - cache.candleFlameAy * sc,
        dw,
        dh
      );
    } else {
      // Fallback (should be rare): old gradient path.
      const flame = ctx.createRadialGradient(fx, fy, 1, fx, fy, fr);
      flame.addColorStop(0, 'rgba(255,255,220,0.95)');
      flame.addColorStop(0.35, 'rgba(255,200,110,0.75)');
      flame.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.ellipse(fx, fy, fr*0.62, fr, 0, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawBoard(ctx, rect, flick){
    const { x, y, s } = rect;

    // Table / background.
    if (cache.bg) {
      ctx.fillStyle = cache.bg;
    } else {
      // Fallback: should only happen on first frame.
      ctx.fillStyle = '#090707';
    }
    ctx.fillRect(0,0,w,h);

    // Soft wood grain band.
    ctx.save();
    ctx.globalAlpha = 0.16;
    for (let i=0;i<22;i++){
      const yy = (i/21) * h;
      const a = 0.02 + 0.03 * Math.sin(i*1.3 + t*0.15);
      ctx.fillStyle = `rgba(110,70,40,${a})`;
      ctx.fillRect(0, yy, w, h/60);
    }
    ctx.restore();

    // Frame.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    if (cache.frame) ctx.fillStyle = cache.frame;
    ctx.fillRect(x - s*0.35, y - s*0.35, s*8 + s*0.7, s*8 + s*0.7);
    ctx.restore();

    // Squares.
    for (let r=0;r<8;r++){
      for (let f=0;f<8;f++){
        const i = r*8 + f;
        const light = ((r+f)&1)===0;
        const base = light ? [175, 146, 110] : [90, 70, 52];
        const warm = 1 + (flick-0.5)*0.07;
        const col = `rgb(${(base[0]*warm)|0},${(base[1]*warm)|0},${(base[2]*warm)|0})`;
        ctx.fillStyle = col;

        const sx = x + f*s;
        const sy = y + r*s;
        // Slight row compression for pseudo-perspective.
        const persp = 0.84 + (r/7)*0.16;
        const hh = s * persp;
        const yy = y + (sy - y) * persp + (1 - persp) * s * 0.2;
        ctx.fillRect(sx, yy, s, hh + 1);

        // Subtle highlight near the candle (right side).
        const bias = (f/7);
        if (bias > 0.55){
          ctx.fillStyle = `rgba(255,200,120,${0.03*(bias-0.55) + flick*0.012})`;
          ctx.fillRect(sx, yy, s, hh + 1);
        }
      }
    }

    // Last-move highlight.
    if (lastMove){
      const from = lastMove.from;
      const to = lastMove.to;
      for (const [i, col] of [[from,'rgba(255,210,120,0.18)'], [to,'rgba(120,220,255,0.14)']]){
        if (i == null) continue;
        const f = i % 8;
        const r = (i/8)|0;
        const sx = x + f*s;
        const sy = y + r*s;
        const persp = 0.84 + (r/7)*0.16;
        const hh = s * persp;
        const yy = y + (sy - y) * persp + (1 - persp) * s * 0.2;
        ctx.fillStyle = col;
        ctx.fillRect(sx, yy, s, hh + 1);
      }
    }

    // Sheen.
    if (cache.sheen){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.05 + flick * 0.02;
      ctx.fillStyle = cache.sheen;
      ctx.fillRect(x - s*0.1, y - s*0.1, s*8 + s*0.2, s*8 + s*0.2);
      ctx.restore();
    }
  }

  function drawPiece(ctx, rect, p){
    if (p.capt) return;

    const isWhite = p.code === p.code.toUpperCase();
    const base = isWhite ? 'rgba(235,228,210,0.98)' : 'rgba(30,25,22,0.98)';
    const rim = isWhite ? 'rgba(60,40,25,0.55)' : 'rgba(255,220,170,0.22)';
    const text = isWhite ? 'rgba(30,22,18,0.78)' : 'rgba(250,230,200,0.85)';

    // Position (with animation).
    let i = p.i;
    let u = 1;
    if (p.anim){
      u = Math.max(0, Math.min(1, p.anim.t / p.anim.dur));
      const uu = ease(u);
      const a = squareCenter(p.anim.fromI, rect);
      const b = squareCenter(p.anim.toI, rect);
      const hop = Math.sin(Math.PI * uu) * rect.s * 0.06;
      var x = lerp(a.x, b.x, uu);
      var y = lerp(a.y, b.y, uu) - hop;
      var persp = lerp(a.persp, b.persp, uu);
    } else {
      const c = squareCenter(i, rect);
      var x = c.x;
      var y = c.y;
      var persp = c.persp;
    }

    const bob = Math.sin(t * 0.6 + p.jiggle) * rect.s * 0.006;
    y += bob;

    const r = rect.s * (0.26 + (isWhite ? 0.01 : 0.0)) * (0.92 + 0.10 * persp);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = rect.s * 0.14;
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1, rect.s * 0.035);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.stroke();

    // Tiny crown-ish highlight.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = isWhite ? 'rgba(255,255,255,0.14)' : 'rgba(255,210,150,0.08)';
    ctx.beginPath();
    ctx.ellipse(x - r*0.15, y - r*0.25, r*0.35, r*0.22, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // Glyph.
    const glyph = ({
      p:'P', n:'N', b:'B', r:'R', q:'Q', k:'K'
    })[p.code.toLowerCase()] || '?';

    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(rect.s * 0.34)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(glyph, x, y + rect.s*0.01);
    ctx.restore();
  }

  function drawHud(ctx, rect, flick){
    const evalScore = materialEval();

    const pad = Math.max(16, Math.floor(Math.min(w, h) * 0.04));
    const font = Math.max(14, Math.floor(Math.min(w, h) / 34));

    // Eval bar.
    const barX = pad;
    const barY = pad;
    const barW = Math.max(12, Math.floor(font * 0.7));
    const barH = Math.floor(h - pad*2);

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(10,8,7,0.55)';
    ctx.fillRect(barX - 6, barY - 6, barW + 12, barH + 12);

    const mid = barY + barH * 0.5;
    ctx.fillStyle = 'rgba(235,228,210,0.85)';
    ctx.fillRect(barX, barY, barW, barH*0.5);
    ctx.fillStyle = 'rgba(25,22,20,0.95)';
    ctx.fillRect(barX, mid, barW, barH*0.5);

    const u = (evalScore + 9.5) / 19;
    const y = barY + (1 - u) * barH;
    ctx.fillStyle = `rgba(255,210,120,${0.85 + flick*0.1})`;
    ctx.fillRect(barX - 3, y - 2, barW + 6, 4);

    // Text.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `${Math.floor(font * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = `rgba(255,210,150,${0.88})`;

    const phase = moveIndex < 6 ? 'OPENING' : (moveIndex < 10 ? 'ATTACK' : 'ENDGAME');
    const line1 = 'CHESS  ENGINE'; // show "engine" vibe (no hardcoded channel number)
    const line2 = `${phase}  EVAL ${evalScore >= 0 ? '+' : ''}${evalScore.toFixed(1)}`;
    ctx.fillText(line1, barX + barW + 18, barY + 6);
    ctx.fillStyle = 'rgba(235,228,210,0.82)';
    ctx.fillText(line2, barX + barW + 18, barY + 6 + font*1.1);

    if (lastMove?.special){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = lastMove.special === 'PROMOTION' ? 'rgba(120,220,255,0.18)' : 'rgba(255,120,80,0.16)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      ctx.fillStyle = lastMove.special === 'PROMOTION' ? 'rgba(120,220,255,0.92)' : 'rgba(255,170,120,0.92)';
      ctx.font = `${Math.floor(font * 1.1)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(lastMove.special === 'PROMOTION' ? 'PROMOTION!' : 'SACRIFICE!', barX + barW + 18, barY + 6 + font*2.35);
    }

    ctx.restore();
  }

  function drawDust(ctx){
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgb(255,220,170)';
    for (const d of dust){
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.6 + d.z*0.25) + d.w));
      const a = (0.02 + 0.06 * tw) * (0.25 + d.z*0.75);
      ctx.globalAlpha = a > 1 ? 1 : (a < 0 ? 0 : a);
      const r = d.s * (0.7 + d.z*0.9);
      ctx.fillRect(d.x, d.y, r, r);
    }
    ctx.restore();
  }

  function render(ctx){
    ensureCaches(ctx);

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    const camX = Math.sin(t*0.12) * w*0.01 + Math.sin(t*0.31) * w*0.004;
    const camY = Math.sin(t*0.14) * h*0.008;

    const s = Math.floor(Math.min(w, h) * 0.085);
    const boardSize = s * 8;
    const rect = {
      s,
      x: Math.floor(w * 0.5 - boardSize * 0.5 + camX),
      y: Math.floor(h * 0.56 - boardSize * 0.5 + camY),
    };

    const flick = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t*2.1 + 0.4*Math.sin(t*0.7)));

    drawBoard(ctx, rect, flick);

    // Pieces (captured pieces fade out then are removed in update()).
    // Render order: back-to-front by row for the pseudo-perspective.
    // `pieces` is kept sorted via sortPiecesForRender() on reset/move.
    for (const p of pieces) drawPiece(ctx, rect, p);

    drawDust(ctx);

    // Candle on the right.
    drawCandle(ctx, w * 0.86 + camX*0.6, h * 0.50 + camY*0.6, Math.max(0.7, Math.min(w,h) / 900), flick);

    drawHud(ctx, rect, flick);

    drawVignette(ctx);

    if (fade > 0){
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0,0,w,h);
    }
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
