import { mulberry32, clamp } from '../../util/prng.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function fmt(sec){
  sec = Math.max(0, Math.ceil(sec));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

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

export function createChannel({ seed, audio }){
  // NOTE: by design this channel is silent even when audio is enabled.
  void audio;

  const rand = mulberry32(seed);

  const ROUTINES = [
    {
      name: 'MOBILITY',
      caption: 'silent intervals • stretch + range • breathe slowly',
      work: 40,
      rest: 20,
      moves: [
        'neck + shoulders',
        'thoracic twists',
        'hip circles',
        'hamstring hinge',
        'ankle rocks',
        'cat-cow',
        'lunge stretch',
        'wrist + forearms',
      ],
    },
    {
      name: 'STRENGTH (LIGHT)',
      caption: 'silent intervals • low-impact • clean form',
      work: 35,
      rest: 25,
      moves: [
        'bodyweight squats',
        'wall push-ups',
        'glute bridge',
        'dead bug',
        'side plank (L)',
        'side plank (R)',
        'calf raises',
        'good mornings',
      ],
    },
    {
      name: 'RESET',
      caption: 'silent intervals • posture + core • tiny wins',
      work: 30,
      rest: 15,
      moves: [
        'march in place',
        'scap squeezes',
        'air squats',
        'standing rows',
        'toe touches',
        'slow lunges',
        'breathing (box)',
        'walk + shake out',
      ],
    }
  ];

  const routine = ROUTINES[(rand() * ROUTINES.length) | 0];

  // build a loop: alternating work/rest for each move, ending with a longer rest.
  const segments = [];
  for (let i = 0; i < routine.moves.length; i++){
    segments.push({ kind: 'work', label: routine.moves[i], dur: routine.work });
    segments.push({ kind: 'rest', label: 'rest', dur: routine.rest });
  }
  segments[segments.length - 1].dur = Math.max(routine.rest, 30); // endcap rest

  const TOTAL = segments.reduce((a, s) => a + s.dur, 0);

  let w = 0, h = 0;
  let t = 0;

  let segIndex = 0;
  let segT = 0;

  let font = 16;
  let big = 48;

  // subtle floating dots
  const dots = new Array(18).fill(0).map(() => ({
    x: rand(),
    y: rand(),
    r: 1.5 + rand() * 2.5,
    s: 0.02 + rand() * 0.08,
    a: 0.18 + rand() * 0.22,
  }));

  function cur(){ return segments[segIndex] || segments[0]; }
  function next(){ return segments[(segIndex + 1) % segments.length]; }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    big = Math.max(44, Math.floor(Math.min(w, h) / 9));

    segIndex = 0;
    segT = 0;
  }

  function onResize(width, height){
    init({ width, height });
  }

  function update(dt){
    t += dt;
    segT += dt;

    const s = cur();
    if (segT >= s.dur){
      segT = 0;
      segIndex = (segIndex + 1) % segments.length;
    }
  }

  function drawBg(ctx){
    const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.35, Math.max(w, h) * 0.85);
    g.addColorStop(0, '#16222e');
    g.addColorStop(0.55, '#070b10');
    g.addColorStop(1, '#020308');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // floaty dots
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const d of dots){
      const yy = (d.y + t * d.s) % 1;
      const xx = (d.x + Math.sin(t * 0.2 + d.y * 12) * 0.01) % 1;
      ctx.globalAlpha = d.a;
      ctx.fillStyle = 'rgba(108,242,255,1)';
      ctx.beginPath();
      ctx.arc(xx * w, yy * h, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(255,255,255,0.05)');
    vg.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // scanlines
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const step = Math.max(2, Math.floor(Math.min(w, h) / 120));
    for (let y = 0; y < h; y += step){
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBg(ctx);

    const s = cur();
    const n = next();
    const p = ease(segT / s.dur);

    const work = s.kind === 'work';
    const cA = work ? '#6cf2ff' : '#ffd36b';
    const cB = work ? '#ff5aa5' : '#6cf2ff';

    // header strip
    ctx.save();
    const hx = Math.floor(w * 0.06);
    const hy = Math.floor(h * 0.08);
    const hw = Math.floor(w * 0.88);
    const hh = Math.floor(font * 2.2);

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, hx + 8, hy + 10, hw, hh, 18);
    ctx.fill();

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(12, 16, 22, 0.92)';
    roundRect(ctx, hx, hy, hw, hh, 18);
    ctx.fill();

    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = cA;
    ctx.lineWidth = 2;
    roundRect(ctx, hx, hy, hw, hh, 18);
    ctx.stroke();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.0)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('MINIMALIST WORKOUT CLOCK', hx + 18, hy + hh * 0.5);

    ctx.globalAlpha = 0.68;
    ctx.font = `${Math.floor(font * 0.78)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.textAlign = 'right';
    ctx.fillText(routine.name, hx + hw - 18, hy + hh * 0.5);
    ctx.textAlign = 'left';

    ctx.restore();

    // center timer
    const cx = w * 0.5;
    const cy = h * 0.52;
    const R = Math.min(w, h) * 0.22;

    const rem = (s.dur - segT);
    const main = fmt(rem);

    // shadow plate
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.ellipse(cx + 10, cy + 16, R * 1.1, R * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // plate
    ctx.globalAlpha = 0.82;
    const plate = ctx.createRadialGradient(cx, cy - R * 0.25, 10, cx, cy, R * 1.35);
    plate.addColorStop(0, 'rgba(24, 32, 44, 1)');
    plate.addColorStop(1, 'rgba(6, 8, 12, 1)');
    ctx.fillStyle = plate;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 1.12, R * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();

    // progress ring
    ctx.globalAlpha = 0.26;
    ctx.strokeStyle = 'rgba(231,238,246,0.35)';
    ctx.lineWidth = Math.max(6, Math.floor(R * 0.12));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();

    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = cA;
    ctx.lineWidth = Math.max(6, Math.floor(R * 0.12));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * p);
    ctx.stroke();

    // timer text
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(231,238,246,0.95)';
    ctx.font = `${big}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(main, cx, cy);

    // label
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = cB;
    ctx.font = `${Math.floor(font * 1.1)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    const kind = work ? 'WORK' : 'REST';
    ctx.fillText(kind, cx, cy + R * 0.22);

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(231,238,246,0.84)';
    ctx.font = `${Math.floor(font * 1.2)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText(s.label.toUpperCase(), cx, cy + R * 0.35);

    ctx.restore();

    // footer: next + loop timer
    const elapsed = segments.slice(0, segIndex).reduce((a, x) => a + x.dur, 0) + segT;
    const loopRem = TOTAL - (elapsed % TOTAL);

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, Math.floor(h * 0.86), w, Math.floor(h * 0.14));

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.font = `${Math.floor(font * 0.9)}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`NEXT: ${n.kind === 'work' ? n.label.toUpperCase() : 'REST'}`, Math.floor(w * 0.06), Math.floor(h * 0.92));

    ctx.textAlign = 'right';
    ctx.globalAlpha = 0.75;
    ctx.font = `${Math.floor(font * 0.82)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`LOOP ${fmt(loopRem)}`, Math.floor(w * 0.94), Math.floor(h * 0.92));

    ctx.globalAlpha = 0.62;
    ctx.textAlign = 'left';
    ctx.font = `${Math.floor(font * 0.74)}px ui-sans-serif, system-ui`;
    ctx.fillText(routine.caption, Math.floor(w * 0.06), Math.floor(h * 0.965));

    ctx.restore();
  }

  // silent by design
  function onAudioOn(){}
  function onAudioOff(){}
  function destroy(){}

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
