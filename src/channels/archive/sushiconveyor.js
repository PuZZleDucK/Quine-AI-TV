import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function easeInOut(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

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

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // palette
  const PAL = {
    bg0: '#06080e',
    bg1: '#0a1220',
    neon: '#ff4fd8',
    cyan: '#6cf2ff',
    warm: '#ffd37a',
    ink: 'rgba(0,0,0,0.35)',
    paper: 'rgba(231,238,246,0.92)',
  };

  // conveyor + scene layout
  let beltY = 0;
  let beltH = 0;
  let counterY = 0;

  let font = 18;
  let mono = 14;

  // motion layers
  let glowOrbs = []; // {x,y,r,s,a,ph}
  let beltOff = 0;

  // plates (objects) + tickets
  const plates = []; // {x, r, kind, hue, wob}
  const tickets = []; // {x,y,w,h,text,life,vy,stamp}

  let spawnAcc = 0;
  let ticketAcc = 0;

  let nextSpecialAt = 0;
  let special = null; // {t0, life, msg}

  // audio
  let ambience = null;

  const MENU = [
    { name: 'TUNA', hue: 5 },
    { name: 'SALMON', hue: 18 },
    { name: 'EEL', hue: 28 },
    { name: 'CUKE', hue: 120 },
    { name: 'TOFU', hue: 44 },
    { name: 'UNI', hue: 34 },
    { name: 'MISO', hue: 52 },
  ];

  const SIGN = (rand() < 0.5) ? 'NIGHT SHIFT' : 'LAST ORDERS';
  const HOUSE = ['SUSHI GO', 'NEON NIGIRI', 'LATE PLATES', 'MIDNIGHT MAKI'];
  const HOUSE_NAME = HOUSE[(rand() * HOUSE.length) | 0];

  function pick(a){ return a[(rand() * a.length) | 0]; }

  function sceneInit(width, height, dprIn){
    w = width;
    h = height;
    dpr = dprIn || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    mono = Math.max(12, Math.floor(font * 0.86));

    counterY = Math.floor(h * 0.52);
    beltY = Math.floor(h * 0.70);
    beltH = Math.max(52, Math.floor(h * 0.16));

    beltOff = 0;

    glowOrbs = Array.from({ length: 18 }, () => ({
      x: rand() * w,
      y: rand() * h * 0.45,
      r: (0.02 + rand() * 0.05) * Math.min(w, h),
      s: 0.02 + rand() * 0.07,
      a: 0.05 + rand() * 0.10,
      ph: rand() * Math.PI * 2,
    }));

    plates.length = 0;
    tickets.length = 0;
    spawnAcc = 0;
    ticketAcc = 0;

    nextSpecialAt = 10 + rand() * 10;
    special = null;

    // pre-seed a few plates
    const pr = Math.max(16, Math.floor(Math.min(w, h) * 0.04));
    const count = 5 + ((rand() * 4) | 0);
    for (let i = 0; i < count; i++){
      spawnPlate(w * (0.2 + i * 0.16), pr * (0.9 + rand() * 0.25));
    }
  }

  function spawnPlate(x, r){
    const item = pick(MENU);
    plates.push({
      x,
      r,
      kind: item,
      hue: item.hue + (rand() - 0.5) * 10,
      wob: rand() * 10,
    });

    if (audio.enabled && rand() < 0.16){
      audio.beep({ freq: 520 + rand() * 140, dur: 0.02, gain: 0.010, type: 'triangle' });
      if (rand() < 0.25) audio.beep({ freq: 260 + rand() * 90, dur: 0.03, gain: 0.007, type: 'sine' });
    }
  }

  function spawnTicket(intense=false){
    const m = pick(MENU);
    const q = intense ? (2 + ((rand() * 3) | 0)) : (1 + ((rand() * 2) | 0));
    const text = `${q}× ${m.name}`;

    const tw = Math.max(120, Math.floor(w * 0.18));
    const th = Math.max(54, Math.floor(h * 0.10));
    const tx = Math.floor(w * (0.10 + rand() * 0.80));
    const ty = -th - rand() * (h * 0.08);

    tickets.push({
      x: clamp(tx, 14, w - tw - 14),
      y: ty,
      w: tw,
      h: th,
      text,
      life: 4.5 + rand() * 2.0,
      vy: (h * 0.10) * (0.8 + rand() * 0.6),
      stamp: rand() < 0.12,
    });

    if (audio.enabled){
      // tiny ticket-pin / order printer click
      audio.beep({ freq: 900 + rand() * 220, dur: 0.012, gain: 0.008, type: 'square' });
      if (intense && rand() < 0.35) audio.beep({ freq: 480 + rand() * 140, dur: 0.012, gain: 0.007, type: 'square' });
    }
  }

  function phaseInfo(){
    // 60s loop, with a rush wave.
    const CYCLE = 60;
    const p = (t % CYCLE) / CYCLE;

    // segments: prep(0-0.28), plate(0.28-0.40), rush(0.40-0.80), close(0.80-1)
    const prep = clamp((0.28 - p) / 0.10, 0, 1);
    const plate = clamp((p - 0.28) / 0.12, 0, 1);
    const rush = clamp((p - 0.40) / 0.08, 0, 1) * clamp((0.80 - p) / 0.08, 0, 1);
    const close = clamp((p - 0.80) / 0.18, 0, 1);

    const rushAmt = easeInOut(rush);
    const closeAmt = easeInOut(close);

    const speed = lerp(w * 0.09, w * 0.20, rushAmt) * (1 - closeAmt * 0.25);
    const spawnRate = lerp(0.65, 1.7, rushAmt) * (1 - closeAmt * 0.35); // plates/sec-ish

    return {
      p,
      rushAmt,
      closeAmt,
      speed,
      spawnRate,
      label: rushAmt > 0.15 ? 'RUSH HOUR' : (p < 0.28 ? 'PREP' : (p < 0.40 ? 'PLATE' : (p < 0.80 ? 'SERVE' : 'CLOSE'))),
    };
  }

  function init({ width, height, dpr: dprIn }){
    sceneInit(width, height, dprIn);
  }

  function onResize(width, height, dprIn){
    sceneInit(width, height, dprIn);
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    const n = audio.noiseSource({ type: 'pink', gain: 0.0042 });
    n.start();
    const d = simpleDrone(audio, { root: 55 + rand() * 25, detune: 0.8, gain: 0.018 });

    ambience = {
      stop(){
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      }
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;

    const ph = phaseInfo();

    // conveyor motion
    beltOff = (beltOff + dt * ph.speed) % Math.max(1, w);

    // spawn plates with a little spacing logic
    spawnAcc += dt * ph.spawnRate;
    while (spawnAcc >= 1){
      spawnAcc -= 1;
      const r = Math.max(14, Math.floor(Math.min(w, h) * (0.032 + rand() * 0.018)));
      const x = w + r + rand() * (w * 0.12);
      spawnPlate(x, r);
    }

    // advance plates
    const beltSpeed = ph.speed;
    for (let i = plates.length - 1; i >= 0; i--){
      const p = plates[i];
      p.x -= dt * beltSpeed;
      if (p.x < -p.r * 3) plates.splice(i, 1);
    }

    // ticket spawn (more during rush)
    const ticketRate = lerp(0.12, 0.55, ph.rushAmt);
    ticketAcc += dt * ticketRate;
    while (ticketAcc >= 1){
      ticketAcc -= 1;
      spawnTicket(ph.rushAmt > 0.2);
    }

    // update tickets
    for (let i = tickets.length - 1; i >= 0; i--){
      const k = tickets[i];
      k.life -= dt;
      k.y += dt * k.vy;
      if (k.life <= 0 || k.y > h + k.h * 2) tickets.splice(i, 1);
    }

    // chef's special card moment
    if (!special && t >= nextSpecialAt){
      special = {
        t0: t,
        life: 3.2,
        msg: 'CHEF\'S SPECIAL',
      };
      nextSpecialAt = t + 14 + rand() * 18;

      if (audio.enabled){
        audio.beep({ freq: 1040 + rand() * 220, dur: 0.06, gain: 0.020, type: 'triangle' });
        audio.beep({ freq: 1560 + rand() * 220, dur: 0.04, gain: 0.015, type: 'sine' });
      }
    }

    if (special){
      special.life -= dt;
      if (special.life <= 0) special = null;
    }

    // gentle drift for glow orbs
    for (const o of glowOrbs){
      o.x = (o.x + dt * (w * o.s)) % (w + o.r * 2);
    }
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, PAL.bg1);
    g.addColorStop(0.55, PAL.bg0);
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // neon orbs
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const o of glowOrbs){
      const breathe = 0.75 + 0.25 * Math.sin(t * 0.7 + o.ph);
      const a = o.a * breathe;
      const gg = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, o.r);
      gg.addColorStop(0, `rgba(255, 79, 216, ${a})`);
      gg.addColorStop(0.55, `rgba(108, 242, 255, ${a * 0.65})`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // subtle diagonal linework
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = PAL.cyan;
    ctx.lineWidth = 1;
    const step = Math.max(32, Math.floor(Math.min(w, h) / 16));
    for (let x = -h; x < w; x += step){
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawCounter(ctx, ph){
    // counter base
    const top = counterY;
    ctx.fillStyle = 'rgba(8,10,12,0.92)';
    ctx.fillRect(0, top, w, beltY - top + beltH);

    // counter surface highlight
    const hl = ctx.createLinearGradient(0, top, 0, top + h * 0.10);
    hl.addColorStop(0, 'rgba(255,255,255,0.10)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(0, top, w, h * 0.12);

    // neon sign
    const sx = w * 0.06;
    const sy = h * 0.10;
    const signW = w * 0.88;
    const signH = Math.max(64, h * 0.12);

    ctx.fillStyle = 'rgba(8,10,12,0.75)';
    ctx.fillRect(sx, sy, signW, signH);
    ctx.strokeStyle = 'rgba(108,242,255,0.20)';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, signW - 2, signH - 2);

    const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.25));

    ctx.save();
    ctx.shadowColor = `rgba(255,79,216,${0.65 * pulse})`;
    ctx.shadowBlur = 14 + ph.rushAmt * 10;
    ctx.fillStyle = `rgba(255,79,216,${0.90 * pulse})`;
    ctx.font = `800 ${Math.floor(font * 1.35)}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textBaseline = 'middle';
    ctx.fillText(HOUSE_NAME, sx + signW * 0.04, sy + signH * 0.45);

    ctx.shadowColor = `rgba(108,242,255,${0.55 * pulse})`;
    ctx.shadowBlur = 12;
    ctx.fillStyle = `rgba(108,242,255,${0.82 * pulse})`;
    ctx.font = `700 ${Math.floor(font * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(SIGN, sx + signW * 0.04, sy + signH * 0.78);
    ctx.restore();

    // status pill (phase label)
    const label = ph.label;
    const pillX = w * 0.70;
    const pillY = sy + signH * 0.24;
    ctx.font = `700 ${Math.floor(font * 0.78)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tw = ctx.measureText(label).width;
    const pw = tw + 26;
    const phh = Math.floor(font * 1.2);

    ctx.fillStyle = 'rgba(108,242,255,0.10)';
    ctx.fillRect(pillX, pillY, pw, phh);
    ctx.strokeStyle = 'rgba(108,242,255,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pillX + 1, pillY + 1, pw - 2, phh - 2);

    ctx.fillStyle = 'rgba(231,238,246,0.85)';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pillX + 13, pillY + phh * 0.52);

    // lantern dots (foreground glows)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 6; i++){
      const lx = w * (0.12 + i * 0.14) + Math.sin(t * 0.2 + i) * w * 0.01;
      const ly = h * (0.18 + 0.03 * Math.sin(t * 0.8 + i * 1.7));
      const r = Math.min(w, h) * (0.018 + 0.008 * Math.sin(t * 0.7 + i));
      const gg = ctx.createRadialGradient(lx, ly, 1, lx, ly, r * 3);
      gg.addColorStop(0, `rgba(255, 211, 122, ${0.20 + ph.rushAmt * 0.10})`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(lx, ly, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBelt(ctx, ph){
    const y = beltY;

    // belt base
    ctx.fillStyle = 'rgba(14,18,22,0.98)';
    ctx.fillRect(0, y, w, beltH);

    // moving belt texture
    const stripeW = Math.max(22, Math.floor(w * 0.06));
    const speedTone = ph.rushAmt;

    for (let x = -stripeW * 2; x < w + stripeW * 2; x += stripeW){
      const xx = x + (beltOff % stripeW);
      const a = 0.06 + 0.10 * (0.5 + 0.5 * Math.sin((xx / stripeW) + t * 0.8));
      ctx.fillStyle = `rgba(108,242,255,${a * (0.35 + speedTone * 0.75)})`;
      ctx.fillRect(xx, y, Math.floor(stripeW * 0.55), beltH);
    }

    // highlight lip
    const lip = ctx.createLinearGradient(0, y, 0, y + beltH);
    lip.addColorStop(0, 'rgba(255,255,255,0.10)');
    lip.addColorStop(0.25, 'rgba(255,255,255,0.02)');
    lip.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = lip;
    ctx.fillRect(0, y, w, beltH);

    // belt edges
    ctx.strokeStyle = 'rgba(231,238,246,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + 2);
    ctx.lineTo(w, y + 2);
    ctx.moveTo(0, y + beltH - 2);
    ctx.lineTo(w, y + beltH - 2);
    ctx.stroke();
  }

  function drawPlate(ctx, p){
    const y = beltY + beltH * 0.52 + Math.sin(t * 0.9 + p.wob) * (h * 0.003);

    // plate shadow
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(p.x, y + p.r * 0.48, p.r * 1.05, p.r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // plate
    const rim = ctx.createRadialGradient(p.x - p.r*0.25, y - p.r*0.25, 1, p.x, y, p.r * 1.2);
    rim.addColorStop(0, 'rgba(255,255,255,0.96)');
    rim.addColorStop(0.65, 'rgba(231,238,246,0.92)');
    rim.addColorStop(1, 'rgba(210,220,232,0.88)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(p.x, y, p.r, 0, Math.PI * 2);
    ctx.fill();

    // inner dish
    ctx.fillStyle = 'rgba(10,12,14,0.10)';
    ctx.beginPath();
    ctx.arc(p.x, y, p.r * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // sushi piece
    const sx = p.x + Math.sin(t * 0.6 + p.wob) * (p.r * 0.05);
    const sy = y - p.r * 0.06;

    ctx.fillStyle = `hsla(${p.hue}, 88%, 58%, 0.95)`;
    roundRect(ctx, sx - p.r * 0.36, sy - p.r * 0.18, p.r * 0.72, p.r * 0.34, p.r * 0.14);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(ctx, sx - p.r * 0.30, sy - p.r * 0.15, p.r * 0.60, p.r * 0.10, p.r * 0.08);
    ctx.fill();

    // garnish dot
    ctx.fillStyle = `rgba(108,242,255,0.45)`;
    ctx.beginPath();
    ctx.arc(sx + p.r * 0.22, sy + p.r * 0.10, Math.max(2, p.r * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTickets(ctx){
    for (const k of tickets){
      const a = clamp(k.life / 1.0, 0, 1);
      const wob = Math.sin(t * 2.1 + (k.x * 0.01)) * 1.2;

      ctx.save();
      ctx.globalAlpha = 0.92 * a;
      ctx.translate(k.x + wob, k.y);

      // paper
      ctx.fillStyle = PAL.paper;
      ctx.fillRect(0, 0, k.w, k.h);

      // tape top
      ctx.fillStyle = 'rgba(10,12,14,0.10)';
      ctx.fillRect(k.w * 0.36, -6, k.w * 0.28, 12);

      // text
      ctx.fillStyle = 'rgba(10,12,14,0.72)';
      ctx.textBaseline = 'top';
      ctx.font = `700 ${Math.floor(mono * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText('ORDER', Math.floor(k.w * 0.10), Math.floor(k.h * 0.16));

      ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(k.text, Math.floor(k.w * 0.10), Math.floor(k.h * 0.48));

      // stamp
      if (k.stamp){
        ctx.save();
        ctx.rotate(-0.12);
        ctx.strokeStyle = 'rgba(255,79,216,0.55)';
        ctx.lineWidth = 2;
        ctx.strokeRect(k.w * 0.55, k.h * 0.52, k.w * 0.36, k.h * 0.34);
        ctx.fillStyle = 'rgba(255,79,216,0.16)';
        ctx.fillRect(k.w * 0.55, k.h * 0.52, k.w * 0.36, k.h * 0.34);
        ctx.fillStyle = 'rgba(10,12,14,0.65)';
        ctx.font = `800 ${Math.floor(mono * 0.62)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        ctx.fillText('OK', k.w * 0.66, k.h * 0.60);
        ctx.restore();
      }

      ctx.restore();
    }
  }

  function drawSpecial(ctx){
    if (!special) return;

    const age = t - special.t0;
    const p = 1 - clamp(special.life / 3.2, 0, 1);
    const inP = easeInOut(clamp(age / 0.35, 0, 1));
    const outP = easeInOut(clamp((3.2 - special.life) / 0.6, 0, 1));
    const a = clamp(inP * (1 - outP), 0, 1);

    const cw = Math.floor(w * 0.42);
    const ch = Math.floor(h * 0.14);
    const cx = Math.floor(w * 0.5 - cw / 2);
    const cy = Math.floor(h * (0.30 - 0.02 * Math.sin(t * 1.1)));

    ctx.save();
    ctx.globalAlpha = 0.92 * a;

    // card body
    ctx.fillStyle = 'rgba(8,10,12,0.88)';
    ctx.fillRect(cx, cy, cw, ch);

    ctx.strokeStyle = 'rgba(255,79,216,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 1, cy + 1, cw - 2, ch - 2);

    // sparkles
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 14; i++){
      const rx = cx + cw * (0.08 + (i / 14) * 0.84);
      const ry = cy + ch * (0.20 + 0.60 * (0.5 + 0.5 * Math.sin(i * 3.1 + t * 3.0)));
      const rr = 1 + 2.5 * (0.5 + 0.5 * Math.sin(t * 4.3 + i * 1.7));
      ctx.fillStyle = `rgba(255, 211, 122, ${0.12 + a * 0.18})`;
      ctx.fillRect(rx, ry, rr, rr);
    }
    ctx.globalCompositeOperation = 'source-over';

    // text
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `800 ${Math.floor(font * 1.02)}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textBaseline = 'middle';
    ctx.fillText(special.msg, cx + cw * 0.08, cy + ch * 0.52);

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const ph = phaseInfo();

    drawBackground(ctx);
    drawCounter(ctx, ph);
    drawTickets(ctx);

    // plates behind the belt lip
    for (const p of plates) drawPlate(ctx, p);

    drawBelt(ctx, ph);

    drawSpecial(ctx);

    // vignette
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.15, w * 0.5, h * 0.45, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.58)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // subtle scanline at rush
    if (ph.rushAmt > 0.1){
      const scanY = (t * (80 + 80 * ph.rushAmt)) % h;
      ctx.fillStyle = `rgba(108,242,255,${0.03 + ph.rushAmt * 0.04})`;
      ctx.fillRect(0, scanY, w, 2);
    }

    // title tag (small)
    ctx.fillStyle = 'rgba(231,238,246,0.65)';
    ctx.font = `700 ${Math.floor(font * 0.72)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('SUSHI CONVEYOR • NIGHT SHIFT', Math.floor(w * 0.06), Math.floor(h * 0.06));
  }

  return {
    init,
    onResize,
    update,
    render,
    onAudioOn,
    onAudioOff,
    destroy,
  };
}
