import { mulberry32 } from '../util/prng.js';

// REVIEWED: 2026-02-10
// Arcade Attract Mode Archives
// CRT arcade attract loops with high-score initials, demo play, coin-in flashes,
// and rotating cabinet art cards.

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

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

function makeInitials(rand){
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pick = () => A[(rand() * A.length) | 0];
  return pick() + pick() + pick();
}

function pick(rand, arr){
  return arr[(rand() * arr.length) | 0];
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;

  // layout
  let crtX = 0, crtY = 0, crtW = 0, crtH = 0;
  let sideX = 0, sideY = 0, sideW = 0, sideH = 0;

  // offscreen CRT buffer (pixel look)
  let buf = null;
  let bctx = null;
  let bw = 0, bh = 0;

  // palette + identity (seeded)
  const baseHue = (seed % 360) | 0;
  const accentHue = (baseHue + 210 + ((rand() * 50) | 0)) % 360;
  const gameTitle = (() => {
    const a = ['NEON', 'PIXEL', 'TURBO', 'MEGA', 'LASER', 'VECTOR', 'NOVA', 'STAR', 'VOID', 'CRYPTO', 'SKY', 'NINJA', 'RADIANT'];
    const b = ['RUNNER', 'QUEST', 'BLASTER', 'DRIFTER', 'CADET', 'FURY', 'SAGA', 'STRIKE', 'DUNGEON', 'RALLY', 'WIZARD', 'GLITCH'];
    const suf = pick(rand, ['DX', 'EX', '2000', '’86', 'PLUS', 'ARCADE']);
    return `${pick(rand, a)} ${pick(rand, b)} ${suf}`;
  })();
  const gameCode = `PCB-${((rand() * 9000) | 0) + 1000}`;

  // time structure
  const MODE_LEN = 14.0;
  const MODES = ['TITLE', 'SCORES', 'DEMO', 'HOWTO'];
  let modeIdx = -1;
  let modeT = 0;

  // effects + events
  let scan = 0;
  let coinFlash = 0;
  let coinMsg = 0;
  let nextCoinAt = 0;

  let glitch = 0;
  let nextGlitchAt = 0;

  // high scores (seeded, deterministic)
  let scores = [];

  // cabinet art cards
  let artCards = [];

  // demo state (tiny shoot-'em-up)
  const INV_N = 12;
  const BUL_N = 10;
  const inv = Array.from({ length: INV_N }, () => ({ x: 0, y: 0, phase: rand() * 10, alive: 1 }));
  const bul = Array.from({ length: BUL_N }, () => ({ x: 0, y: 0, vy: 0, on: 0 }));
  let shipX = 0;
  let fireAcc = 0;
  let invDir = 1;
  let invStep = 0;

  // audio handle
  let ah = null;

  function initAssets(){
    // scores
    const top = 980_000 + ((rand() * 900_000) | 0);
    scores = Array.from({ length: 7 }, (_, i) => {
      const s = Math.max(1_000, (top - i * (80_000 + ((rand() * 22_000) | 0))) | 0);
      return { name: makeInitials(rand), score: s };
    });

    // art cards
    const themes = [
      { name: 'CABINET ART', a: baseHue, b: accentHue },
      { name: 'MARQUEE', a: (baseHue + 40) % 360, b: (accentHue + 30) % 360 },
      { name: 'SIDE PANEL', a: (baseHue + 90) % 360, b: (accentHue + 80) % 360 },
      { name: 'FLYER', a: (baseHue + 150) % 360, b: (accentHue + 130) % 360 },
    ];
    artCards = themes.map((th, i) => ({
      key: `${th.name} ${i + 1}`,
      hueA: th.a,
      hueB: th.b,
      grain: rand() * 10,
      stamp: pick(rand, ['REV A', 'REV B', 'OPERATOR', 'EXPORT', 'JAMMA', '2P READY']),
    }));

    // demo
    invDir = rand() < 0.5 ? -1 : 1;
    invStep = 0;
    for (let i = 0; i < INV_N; i++){
      inv[i].alive = 1;
    }

    nextCoinAt = 5 + rand() * 10;
    nextGlitchAt = 2 + rand() * 6;
  }

  function makeBuffer(){
    // pick a buffer size that stays comfortably "pixelly" but tracks aspect.
    const target = Math.max(260, Math.min(420, Math.floor(Math.min(w, h) * 0.55)));
    bw = Math.max(260, Math.min(420, (target * 1.333) | 0));
    bh = Math.max(200, Math.min(360, target | 0));

    buf = document.createElement('canvas');
    buf.width = bw;
    buf.height = bh;
    bctx = buf.getContext('2d');
    bctx.imageSmoothingEnabled = false;
  }

  function onResize(width, height){
    init({ width, height });
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;
    scan = 0;
    coinFlash = 0;
    coinMsg = 0;
    glitch = 0;

    const pad = Math.max(14, Math.floor(Math.min(w, h) * 0.03));
    sideW = Math.max(220, Math.floor(w * 0.26));
    sideH = h - pad * 2;
    sideX = w - pad - sideW;
    sideY = pad;

    crtX = pad;
    crtY = pad;
    crtW = sideX - pad - crtX;
    crtH = h - pad * 2;

    makeBuffer();
    initAssets();
  }

  function setMode(next){
    modeIdx = next;

    // tasteful "attract" chirp
    if (audio.enabled){
      const f0 = 320 + rand() * 260;
      audio.beep({ freq: f0, dur: 0.03, gain: 0.03, type: 'square' });
      audio.beep({ freq: f0 * 1.5, dur: 0.03, gain: 0.02, type: 'triangle' });
    }

    // reset demo enemies on entry
    if (MODES[modeIdx] === 'DEMO'){
      for (let i = 0; i < INV_N; i++) inv[i].alive = 1;
      for (let i = 0; i < BUL_N; i++) bul[i].on = 0;
      fireAcc = 0;
      invStep = 0;
    }
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();

    const out = ctx.createGain();
    out.gain.value = 0.92;
    out.connect(audio.master);

    // arcade room tone: pink noise through a gentle lowpass
    const n = audio.noiseSource({ type: 'pink', gain: 0.045 });
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 980;
    lpf.Q.value = 0.7;

    // subtle "mains" hum + flutter
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 55;

    const hg = ctx.createGain();
    hg.gain.value = 0.0;
    const t0 = ctx.currentTime;
    hg.gain.setValueAtTime(0.0001, t0);
    hg.gain.exponentialRampToValueAtTime(0.012, t0 + 0.35);

    const flutter = ctx.createOscillator();
    flutter.type = 'sine';
    flutter.frequency.value = 0.18;
    const fg = ctx.createGain();
    fg.gain.value = 0.0025;

    flutter.connect(fg);
    fg.connect(hg.gain);

    try { n.gain.disconnect(); } catch {}
    n.gain.connect(lpf);

    hum.connect(hg);
    hg.connect(lpf);

    lpf.connect(out);

    n.start();
    hum.start();
    flutter.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.10); } catch {}
        try { n.stop(); } catch {}
        try { hum.stop(now + 0.25); } catch {}
        try { flutter.stop(now + 0.25); } catch {}
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

  function destroy(){
    onAudioOff();
  }

  function fireBullet(x, y){
    for (let i = 0; i < BUL_N; i++){
      const b = bul[i];
      if (b.on) continue;
      b.on = 1;
      b.x = x;
      b.y = y;
      b.vy = -90;

      if (audio.enabled && rand() < 0.35){
        audio.beep({ freq: 680 + rand() * 260, dur: 0.02, gain: 0.012, type: 'square' });
      }
      return;
    }
  }

  function updateDemo(dt){
    // ship moves smoothly (hands-off demo)
    shipX = 0.5 + 0.36 * Math.sin(t * 0.7) + 0.10 * Math.sin(t * 1.65 + 1.2);

    // invader formation
    const cols = 6;
    const spacingX = 1 / (cols + 1);
    const spacingY = 0.10;

    const drift = Math.sin(t * 0.35) * 0.03;
    const step = invStep * 0.005;

    for (let i = 0; i < INV_N; i++){
      const r = (i / cols) | 0;
      const c = i % cols;
      const wob = 0.015 * Math.sin(t * 1.1 + inv[i].phase);
      inv[i].x = (c + 1) * spacingX + drift + wob + invDir * step;
      inv[i].y = 0.20 + r * spacingY + 0.01 * Math.sin(t * 0.9 + c);
    }

    invStep += dt * 18;
    if (invStep > 60){
      invStep = 0;
      invDir *= -1;
    }

    // fire rhythm
    fireAcc += dt;
    if (fireAcc >= 0.32){
      fireAcc = 0;
      fireBullet(shipX, 0.84);
    }

    // bullets
    for (let i = 0; i < BUL_N; i++){
      const b = bul[i];
      if (!b.on) continue;
      b.y += b.vy * dt;
      if (b.y < 0.08) { b.on = 0; continue; }

      // simple hit test
      for (let k = 0; k < INV_N; k++){
        const e = inv[k];
        if (!e.alive) continue;
        const dx = (b.x - e.x);
        const dy = (b.y - e.y);
        if (dx * dx + dy * dy < 0.0022){
          e.alive = 0;
          b.on = 0;
          if (audio.enabled){
            audio.beep({ freq: 180 + rand() * 140, dur: 0.04, gain: 0.02, type: 'triangle' });
          }
          break;
        }
      }
    }

    // respawn once most are gone
    let alive = 0;
    for (let i = 0; i < INV_N; i++) alive += inv[i].alive ? 1 : 0;
    if (alive <= 3){
      for (let i = 0; i < INV_N; i++) inv[i].alive = 1;
      if (audio.enabled){
        audio.beep({ freq: 520 + rand() * 120, dur: 0.06, gain: 0.02, type: 'square' });
      }
    }
  }

  function update(dt){
    t += dt;

    scan = (scan + dt * 1.2) % 1;
    coinFlash = Math.max(0, coinFlash - dt * 2.6);
    coinMsg = Math.max(0, coinMsg - dt);
    glitch = Math.max(0, glitch - dt * 2.8);

    const nextMode = (Math.floor(t / MODE_LEN) % MODES.length) | 0;
    modeT = (t % MODE_LEN) / MODE_LEN;
    if (nextMode !== modeIdx) setMode(nextMode);

    if (t >= nextCoinAt){
      coinFlash = 1.0;
      coinMsg = 1.6;
      nextCoinAt = t + 8 + rand() * 14;

      if (audio.enabled){
        audio.beep({ freq: 660, dur: 0.03, gain: 0.03, type: 'square' });
        audio.beep({ freq: 990, dur: 0.03, gain: 0.02, type: 'triangle' });
      }
    }

    if (t >= nextGlitchAt){
      glitch = 1.0;
      nextGlitchAt = t + 2.5 + rand() * 7.5;
      if (audio.enabled && rand() < 0.35){
        audio.beep({ freq: 120 + rand() * 80, dur: 0.02, gain: 0.014, type: 'sawtooth' });
      }
    }

    if (MODES[modeIdx] === 'DEMO') updateDemo(dt);
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#040410');
    g.addColorStop(0.52, '#07001a');
    g.addColorStop(1, '#02020a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // soft arcade glow blobs
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++){
      const cx = w * (0.18 + i * 0.28) + Math.sin(t * (0.10 + i * 0.07) + i) * w * 0.02;
      const cy = h * (0.22 + i * 0.23) + Math.cos(t * (0.12 + i * 0.08) + i) * h * 0.02;
      const rr = Math.max(w, h) * (0.18 + i * 0.05);
      const gg = ctx.createRadialGradient(cx, cy, 1, cx, cy, rr);
      gg.addColorStop(0, `hsla(${(accentHue + i * 30) % 360}, 95%, 65%, 0.10)`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // vignette
    ctx.save();
    const v = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.15, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawArtCards(ctx){
    // panel
    ctx.save();
    roundRect(ctx, sideX, sideY, sideW, sideH, 18);
    ctx.fillStyle = 'rgba(10, 12, 22, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.14)';
    ctx.lineWidth = Math.max(1, h / 560);
    ctx.stroke();

    const pad = 14;
    const titleY = sideY + pad + 8;

    ctx.fillStyle = 'rgba(230, 245, 255, 0.86)';
    ctx.font = `800 ${Math.max(12, Math.floor(h * 0.020))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('ARCHIVE CARDS', sideX + pad, titleY);

    const cardH = Math.floor((sideH - pad * 2 - 36) / 3);
    const cardW = sideW - pad * 2;
    let y = sideY + pad + 34;

    const k = (Math.floor(t / 10) % artCards.length) | 0;

    for (let i = 0; i < 3; i++){
      const c = artCards[(k + i) % artCards.length];
      const x = sideX + pad;

      // card background
      ctx.save();
      roundRect(ctx, x, y, cardW, cardH, 14);
      ctx.clip();

      const gg = ctx.createLinearGradient(x, y, x + cardW, y + cardH);
      gg.addColorStop(0, `hsla(${c.hueA}, 90%, 45%, 0.55)`);
      gg.addColorStop(0.55, `hsla(${c.hueB}, 95%, 55%, 0.28)`);
      gg.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = gg;
      ctx.fillRect(x, y, cardW, cardH);

      // diagonal stripes
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      const step = 14;
      for (let s = -cardH; s < cardW + cardH; s += step){
        ctx.fillRect(x + s + (Math.sin(t * 0.18 + i) * 6), y, 6, cardH);
      }
      ctx.globalAlpha = 1;

      // label text
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `900 ${Math.max(12, Math.floor(h * 0.020))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.fillText(c.key, x + 12, y + 10);

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `700 ${Math.max(11, Math.floor(h * 0.018))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.fillText(c.stamp, x + 12, y + 34);

      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = `700 ${Math.max(10, Math.floor(h * 0.016))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.fillText(gameCode, x + 12, y + cardH - 20);

      ctx.restore();

      // outline
      ctx.save();
      roundRect(ctx, x, y, cardW, cardH, 14);
      ctx.strokeStyle = 'rgba(200,220,255,0.14)';
      ctx.stroke();
      ctx.restore();

      y += cardH + 12;
    }

    ctx.restore();
  }

  function btext(msg, x, y, color='rgba(255,255,255,0.92)', size=18, weight=800, align='left'){
    bctx.fillStyle = color;
    bctx.font = `${weight} ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    bctx.textAlign = align;
    bctx.textBaseline = 'middle';
    bctx.fillText(msg, x, y);
  }

  function drawBuffer(){
    if (!bctx) return;

    // clear
    bctx.setTransform(1,0,0,1,0,0);
    bctx.clearRect(0,0,bw,bh);

    // "phosphor" gradient
    const g = bctx.createLinearGradient(0, 0, 0, bh);
    g.addColorStop(0, `hsla(${baseHue}, 70%, 8%, 1)`);
    g.addColorStop(0.55, 'rgba(0,0,0,1)');
    g.addColorStop(1, `hsla(${accentHue}, 80%, 7%, 1)`);
    bctx.fillStyle = g;
    bctx.fillRect(0,0,bw,bh);

    // content
    const mode = MODES[modeIdx];

    if (mode === 'TITLE'){
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.2);
      btext('ATARI-ISH PRESENTS', bw * 0.5, bh * 0.20, 'rgba(200,220,255,0.75)', 14, 800, 'center');

      // big title
      bctx.save();
      bctx.shadowColor = `hsla(${accentHue}, 100%, 70%, 0.75)`;
      bctx.shadowBlur = 14 + pulse * 10;
      btext(gameTitle, bw * 0.5, bh * 0.36, `hsla(${accentHue}, 95%, 65%, 0.95)`, 22, 950, 'center');
      bctx.restore();

      // insert coin blink
      const blink = (Math.floor(t * 2) % 2) === 0;
      if (blink){
        bctx.save();
        bctx.shadowColor = `hsla(${accentHue}, 100%, 70%, 0.6)`;
        bctx.shadowBlur = 10;
        btext('INSERT COIN', bw * 0.5, bh * 0.62, 'rgba(255,255,255,0.9)', 18, 900, 'center');
        bctx.restore();
      }

      btext('DEMO PLAY: ON', bw * 0.5, bh * 0.74, 'rgba(200,220,255,0.70)', 14, 800, 'center');
      btext('HIGH SCORE SAVES', bw * 0.5, bh * 0.82, 'rgba(200,220,255,0.55)', 12, 800, 'center');

    } else if (mode === 'SCORES'){
      btext('HIGH SCORES', bw * 0.5, bh * 0.14, `hsla(${accentHue}, 95%, 65%, 0.95)`, 18, 950, 'center');

      const hi = (Math.floor((t * 1.1)) % scores.length) | 0;
      const y0 = bh * 0.28;
      const dy = bh * 0.085;

      for (let i = 0; i < scores.length; i++){
        const s = scores[i];
        const y = y0 + i * dy;
        const is = i === hi;

        if (is){
          bctx.save();
          bctx.globalCompositeOperation = 'screen';
          bctx.fillStyle = `hsla(${accentHue}, 100%, 70%, 0.10)`;
          bctx.fillRect(bw * 0.18, y - dy * 0.45, bw * 0.64, dy * 0.9);
          bctx.restore();
        }

        btext(String(i + 1).padStart(2, '0'), bw * 0.22, y, 'rgba(220,240,255,0.70)', 14, 900, 'right');
        btext(s.name, bw * 0.27, y, is ? 'rgba(255,255,255,0.94)' : 'rgba(220,240,255,0.84)', 16, 900, 'left');

        const scr = String(s.score).padStart(7, '0');
        btext(scr, bw * 0.78, y, is ? `hsla(${accentHue}, 100%, 72%, 0.96)` : 'rgba(220,240,255,0.80)', 16, 950, 'right');
      }

      btext('SUBMIT INITIALS', bw * 0.5, bh * 0.88, 'rgba(200,220,255,0.55)', 12, 800, 'center');

    } else if (mode === 'DEMO'){
      // playfield bounds
      const px = bw * 0.10;
      const py = bh * 0.16;
      const pw = bw * 0.80;
      const ph = bh * 0.72;

      // header
      btext('DEMO PLAY', bw * 0.5, bh * 0.10, `hsla(${accentHue}, 95%, 65%, 0.95)`, 16, 950, 'center');

      // border
      bctx.save();
      bctx.strokeStyle = 'rgba(180,210,255,0.22)';
      bctx.lineWidth = 2;
      bctx.strokeRect(px, py, pw, ph);
      bctx.restore();

      // invaders
      for (let i = 0; i < INV_N; i++){
        const e = inv[i];
        if (!e.alive) continue;
        const x = px + e.x * pw;
        const y = py + e.y * ph;
        bctx.fillStyle = `hsla(${accentHue}, 95%, 68%, 0.85)`;
        bctx.fillRect((x | 0), (y | 0), 6, 4);
        bctx.fillStyle = 'rgba(255,255,255,0.25)';
        bctx.fillRect((x | 0) + 1, (y | 0) + 1, 4, 1);
      }

      // ship
      const sx = px + shipX * pw;
      const sy = py + ph * 0.86;
      bctx.fillStyle = 'rgba(240,250,255,0.9)';
      bctx.fillRect((sx | 0) - 4, (sy | 0), 8, 3);
      bctx.fillStyle = `hsla(${accentHue}, 100%, 70%, 0.9)`;
      bctx.fillRect((sx | 0) - 1, (sy | 0) - 2, 2, 2);

      // bullets
      bctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < BUL_N; i++){
        const b = bul[i];
        if (!b.on) continue;
        const x = px + b.x * pw;
        const y = py + b.y * ph;
        bctx.fillRect((x | 0), (y | 0), 1, 4);
      }

      // footer text
      const blink = (Math.floor(t * 2) % 2) === 0;
      if (blink) btext('INSERT COIN', bw * 0.5, bh * 0.92, 'rgba(255,255,255,0.82)', 14, 900, 'center');

    } else {
      // HOWTO
      btext('HOW TO PLAY', bw * 0.5, bh * 0.14, `hsla(${accentHue}, 95%, 65%, 0.95)`, 18, 950, 'center');

      const lines = [
        'MOVE: JOYSTICK',
        'FIRE: BUTTON 1',
        'SMART BOMB: BUTTON 2',
        'BONUS EVERY 50,000',
      ];

      const y0 = bh * 0.34;
      const dy = bh * 0.10;
      for (let i = 0; i < lines.length; i++){
        btext(lines[i], bw * 0.5, y0 + i * dy, 'rgba(220,240,255,0.86)', 15, 900, 'center');
      }

      btext('OPERATOR: SET FREE PLAY = OFF', bw * 0.5, bh * 0.86, 'rgba(200,220,255,0.55)', 12, 800, 'center');
    }

    // HUD overlay: credit and tiny noise
    if (coinMsg > 0){
      const a = clamp01(coinMsg / 1.6);
      bctx.save();
      bctx.globalCompositeOperation = 'screen';
      btext('CREDIT 01', bw * 0.86, bh * 0.08, `rgba(255,255,255,${0.55 + a * 0.35})`, 12, 950, 'right');
      bctx.restore();
    }

    // scanlines
    bctx.save();
    bctx.globalAlpha = 0.12;
    bctx.fillStyle = 'rgba(0,0,0,1)';
    for (let y = 0; y < bh; y += 2){
      bctx.fillRect(0, y, bw, 1);
    }
    bctx.restore();

    // rolling scan + glitch lines
    const scanY = ((scan * bh) | 0);
    bctx.save();
    bctx.globalCompositeOperation = 'screen';
    bctx.fillStyle = `rgba(255,255,255,${0.02 + glitch * 0.03})`;
    bctx.fillRect(0, scanY, bw, 2);
    if (glitch > 0){
      for (let i = 0; i < 6; i++){
        const yy = ((rand() * bh) | 0);
        const off = ((rand() - 0.5) * 10 * glitch) | 0;
        bctx.drawImage(buf, 0, yy, bw, 2, off, yy, bw, 2);
      }
    }
    bctx.restore();

    // coin flash
    if (coinFlash > 0){
      bctx.save();
      bctx.globalCompositeOperation = 'screen';
      bctx.fillStyle = `rgba(255,255,255,${coinFlash * 0.20})`;
      bctx.fillRect(0, 0, bw, bh);
      bctx.restore();
    }
  }

  function drawCRT(ctx){
    // frame
    ctx.save();
    roundRect(ctx, crtX, crtY, crtW, crtH, 26);
    ctx.fillStyle = 'rgba(10, 12, 18, 0.92)';
    ctx.fill();

    // inner screen
    const margin = Math.max(10, Math.floor(Math.min(crtW, crtH) * 0.035));
    const sx = crtX + margin;
    const sy = crtY + margin;
    const sw = crtW - margin * 2;
    const sh = crtH - margin * 2;

    // bezel
    ctx.save();
    roundRect(ctx, sx, sy, sw, sh, 18);
    ctx.clip();

    // draw buffer
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, bw, bh, sx, sy, sw, sh);

    // glass reflection
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const refl = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
    refl.addColorStop(0, 'rgba(255,255,255,0.00)');
    refl.addColorStop(0.45, 'rgba(255,255,255,0.05)');
    refl.addColorStop(1, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = refl;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.restore();

    // subtle barrel shading
    ctx.save();
    const v = ctx.createRadialGradient(sx + sw * 0.5, sy + sh * 0.5, Math.min(sw, sh) * 0.1, sx + sw * 0.5, sy + sh * 0.5, Math.max(sw, sh) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.restore();

    ctx.restore();

    // frame outline
    ctx.strokeStyle = 'rgba(200,220,255,0.12)';
    ctx.lineWidth = Math.max(1, h / 560);
    ctx.stroke();

    ctx.restore();
  }

  function render(ctx){
    if (!buf) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    drawArtCards(ctx);

    drawBuffer();
    drawCRT(ctx);

    // tiny label below
    ctx.save();
    ctx.fillStyle = 'rgba(230,245,255,0.55)';
    ctx.font = `700 ${Math.max(11, Math.floor(h * 0.018))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'bottom';
    ctx.fillText('Arcade Attract Mode Archives', crtX + 14, crtY + crtH - 10);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
