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

    return { from: from.i, to: to.i, special };
  }

  function initDust(){
    const n = 62;
    dust = Array.from({ length: n }, () => ({
      x: rand() * w,
      y: rand() * h,
      z: 0.2 + rand() * 1.0,
      s: 0.6 + rand() * 1.4,
      w: rand() * 10,
    }));
  }

  function onResize(width, height, _dpr=1){
    w = width;
    h = height;
    dpr = _dpr;
    initDust();
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

  function onAudioOn(){
    if (!audio.enabled) return;
    ambience = makeAudioHandle();
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
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

    // Dust.
    const drift = w * 0.008;
    for (const d of dust){
      d.y -= dt * (10 + 28 * d.z);
      d.x += Math.sin(t * (0.28 + d.z * 0.18) + d.w) * dt * drift * (0.2 + d.z * 0.35);
      if (d.y < -20){
        d.y = h + 20;
        d.x = rand() * w;
      }
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
    const g = ctx.createRadialGradient(w*0.5, h*0.55, Math.min(w,h)*0.2, w*0.5, h*0.55, Math.max(w,h)*0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);
  }

  function drawCandle(ctx, cx, cy, scale, flick){
    const bodyW = scale * 36;
    const bodyH = scale * 120;

    // Warm glow.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glowR = scale * (240 + 60 * flick);
    const glow = ctx.createRadialGradient(cx, cy - bodyH*0.65, 1, cx, cy - bodyH*0.65, glowR);
    glow.addColorStop(0, `rgba(255,190,120,${0.24 + flick*0.1})`);
    glow.addColorStop(0.45, 'rgba(255,140,70,0.07)');
    glow.addColorStop(1, 'rgba(255,140,70,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy - bodyH*0.65, glowR, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // Body.
    const wax = ctx.createLinearGradient(cx-bodyW*0.5, cy-bodyH, cx+bodyW*0.5, cy);
    wax.addColorStop(0, 'rgba(240,235,220,0.95)');
    wax.addColorStop(0.5, 'rgba(220,212,196,0.95)');
    wax.addColorStop(1, 'rgba(245,240,225,0.95)');

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18 * scale;
    ctx.fillStyle = wax;
    roundRect(ctx, cx-bodyW*0.52, cy-bodyH, bodyW*1.04, bodyH, bodyW*0.25);
    ctx.fill();
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

    const flame = ctx.createRadialGradient(fx, fy, 1, fx, fy, fr);
    flame.addColorStop(0, 'rgba(255,255,220,0.95)');
    flame.addColorStop(0.35, 'rgba(255,200,110,0.75)');
    flame.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.ellipse(fx, fy, fr*0.62, fr, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawBoard(ctx, rect, flick){
    const { x, y, s } = rect;

    // Table / background.
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#090707');
    bg.addColorStop(0.5, '#0f0b09');
    bg.addColorStop(1, '#040303');
    ctx.fillStyle = bg;
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
    const frame = ctx.createLinearGradient(x, y, x, y + s*8);
    frame.addColorStop(0, 'rgba(70,45,28,0.95)');
    frame.addColorStop(1, 'rgba(40,26,16,0.98)');
    ctx.fillStyle = frame;
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

        const sq = squareCenter(i, rect);
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
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const sheen = ctx.createLinearGradient(x, y, x + s*8, y + s*8);
    sheen.addColorStop(0, `rgba(255,220,170,${0.05 + flick*0.02})`);
    sheen.addColorStop(0.6, 'rgba(255,220,170,0)');
    sheen.addColorStop(1, 'rgba(255,220,170,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x - s*0.1, y - s*0.1, s*8 + s*0.2, s*8 + s*0.2);
    ctx.restore();
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
    const line1 = `CH ${String(1).padStart(2,'0')}  ENGINE`; // show "engine" vibe
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
    for (const d of dust){
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.6 + d.z*0.25) + d.w));
      const a = (0.02 + 0.06 * tw) * (0.25 + d.z*0.75);
      ctx.fillStyle = `rgba(255,220,170,${a.toFixed(3)})`;
      const r = d.s * (0.7 + d.z*0.9);
      ctx.fillRect(d.x, d.y, r, r);
    }
    ctx.restore();
  }

  function render(ctx){
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

    // Pieces (render captured pieces already removed).
    // Render order: back-to-front by row for the pseudo-perspective.
    const sorted = pieces.slice().sort((a,b) => ((a.i/8)|0) - ((b.i/8)|0));
    for (const p of sorted) drawPiece(ctx, rect, p);

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
