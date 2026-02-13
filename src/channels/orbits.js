import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// REVIEWED: 2026-02-13
export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  let bodies = [];
  let stars = [];
  let drone = null;

  function rebuildSizes(){
    const s = h / 540;
    for (const b of bodies) {
      if (b.center) {
        b.size = b.size0 * s;
        continue;
      }
      b.r = b.r0 * s;
      b.size = b.size0 * s;
    }
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;

    // Precompute a deterministic starfield so it doesn't flicker (no rand() in render()).
    stars = Array.from({ length: 220 }, () => {
      const a = 0.12 + rand() * 0.5;
      const sz = rand() < 0.08 ? 2 : 1;
      return {
        nx: rand(),
        ny: rand(),
        sz,
        style: `rgba(220,240,255,${a.toFixed(3)})`,
      };
    });

    bodies = Array.from({ length: 7 }, (_, i) => ({
      r0: 40 + i * 32,
      r: 0,
      a: rand() * Math.PI * 2,
      sp: (0.08 + rand() * 0.24) * (i % 2 ? 1 : -1),
      size0: 5 + rand() * 10 + i * 0.9,
      size: 0,
      hue: (i * 40 + rand() * 30) % 360,
      moon: rand() < 0.4,
      moonA: rand() * Math.PI * 2,
      moonSp: 0.7 + rand() * 1.1,
    }));

    // center star
    bodies.unshift({ center: true, size0: 32 + rand() * 22, size: 0 });

    rebuildSizes();
  }

  function onResize(width, height){
    w = width;
    h = height;
    rebuildSizes();
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    if (drone) return;
    drone = simpleDrone(audio, { root: 82, detune: 0.8, gain: 0.05 });
    audio.setCurrent(drone);
  }

  function onAudioOff(){
    drone?.stop?.();
    drone = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;
    for (const b of bodies){
      if (b.center) continue;
      b.a += dt * b.sp;
      if (b.moon) b.moonA += dt * b.moonSp;
    }
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // background
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, '#050610');
    bg.addColorStop(1, '#01010a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // star specks
    ctx.save();
    ctx.globalAlpha = 0.65;
    for (const s of stars) {
      const x = (s.nx * w) | 0;
      const y = (s.ny * h) | 0;
      ctx.fillStyle = s.style;
      ctx.fillRect(x, y, s.sz, s.sz);
    }
    ctx.restore();

    const cx = w / 2;
    const cy = h / 2;

    // orbits
    ctx.save();
    ctx.strokeStyle = 'rgba(180,200,255,0.14)';
    ctx.lineWidth = Math.max(1, Math.floor(h / 540));
    for (const b of bodies){
      if (b.center) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // center star
    const star = bodies[0];
    const sr = star.size;
    const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr);
    sg.addColorStop(0, 'rgba(255,255,220,0.95)');
    sg.addColorStop(0.45, 'rgba(255,190,120,0.7)');
    sg.addColorStop(1, 'rgba(255,75,216,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cx, cy, sr, 0, Math.PI * 2);
    ctx.fill();

    // planets
    for (const b of bodies){
      if (b.center) continue;
      const x = cx + Math.cos(b.a) * b.r;
      const y = cy + Math.sin(b.a) * b.r;
      const g = ctx.createRadialGradient(x - b.size * 0.3, y - b.size * 0.3, 1, x, y, b.size);
      g.addColorStop(0, `hsla(${b.hue},85%,70%,0.95)`);
      g.addColorStop(1, `hsla(${(b.hue + 40) % 360},85%,45%,0.85)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, b.size, 0, Math.PI * 2);
      ctx.fill();

      if (b.moon){
        const mx = x + Math.cos(b.moonA) * (b.size * 2.2);
        const my = y + Math.sin(b.moonA) * (b.size * 1.4);
        ctx.fillStyle = 'rgba(230,230,245,0.85)';
        ctx.beginPath();
        ctx.arc(mx, my, b.size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // label
    ctx.save();
    ctx.font = `${Math.floor(h / 18)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(200,220,255,0.75)';
    ctx.fillText('ORBITAL DESKTOY', w * 0.05, h * 0.12);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
