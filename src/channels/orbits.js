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

  let comet = null;
  let nextCometAt = 0;

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

    bodies = Array.from({ length: 7 }, (_, i) => {
      const hue = (i * 40 + rand() * 30) % 360;
      const kind = rand() < (i >= 4 ? 0.6 : 0.35) ? 'gas' : 'rock';
      const ring = i >= 2 && rand() < (kind === 'gas' ? 0.28 : 0.14);
      const bandCount = kind === 'gas' ? 3 + ((rand() * 6) | 0) : 0;

      const craters = kind === 'rock'
        ? Array.from({ length: 2 + ((rand() * 4) | 0) }, () => {
          // relative coords inside planet disc (roughly)
          const rx = (rand() - 0.5) * 0.9;
          const ry = (rand() - 0.5) * 0.9;
          const rr = 0.10 + rand() * 0.18;
          return {
            rx, ry, rr,
            a: 0.08 + rand() * 0.18,
          };
        })
        : null;

      const storm = kind === 'gas' && rand() < 0.55
        ? {
          a: rand() * Math.PI * 2,
          r: 0.22 + rand() * 0.18,
        }
        : null;

      return {
        r0: 40 + i * 32,
        r: 0,
        a: rand() * Math.PI * 2,
        sp: (0.08 + rand() * 0.24) * (i % 2 ? 1 : -1),
        size0: 5 + rand() * 10 + i * 0.9,
        size: 0,

        hue,
        kind,

        ring,
        ringTilt: (rand() - 0.5) * 0.9,
        ringW: 1.35 + rand() * 0.55,
        ringH: 0.22 + rand() * 0.22,
        ringHue: (hue + (rand() - 0.5) * 30 + 360) % 360,

        bandCount,
        bandTilt: (rand() - 0.5) * 0.7,
        bandPhase: rand() * Math.PI * 2,

        craters,
        storm,

        moon: rand() < 0.4,
        moonA: rand() * Math.PI * 2,
        moonSp: 0.7 + rand() * 1.1,
      };
    });

    // center star
    bodies.unshift({ center: true, size0: 32 + rand() * 22, size: 0 });

    rebuildSizes();

    // Rare deterministic special moment: the first comet is fixed (~4 min) so
    // it can be reliably captured in review screenshots; subsequent comets are
    // scheduled ~3–5 minutes apart (seeded).
    comet = null;
    nextCometAt = 240;
  }

  function onResize(width, height){
    w = width;
    h = height;
    rebuildSizes();

    if (comet) {
      const s = h / 540;
      comet.headR = 2.2 * s;
      comet.trail = 220 * s;
    }
  }

  function stopDrone({ clearCurrent = false } = {}){
    const handle = drone;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    drone = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive: if onAudioOn is called repeatedly while audio is enabled,
    // ensure we don't stack/overlap our own ambience.
    if (drone && audio.current === drone) return;

    stopDrone({ clearCurrent: true });
    drone = simpleDrone(audio, { root: 82, detune: 0.8, gain: 0.05 });
    audio.setCurrent(drone);
  }

  function onAudioOff(){
    stopDrone({ clearCurrent: true });
  }

  function destroy(){
    // Only clears AudioManager.current when we own it.
    stopDrone({ clearCurrent: true });
  }

  function scheduleNextComet(now){
    // ~3–5 minutes
    nextCometAt = now + 180 + rand() * 120;
  }

  function spawnComet(){
    const s = h / 540;
    const margin = Math.max(w, h) * 0.12;
    const fromLeft = rand() < 0.5;

    const x0 = fromLeft ? -margin : w + margin;
    const y0 = h * (0.15 + rand() * 0.55);
    const x1 = fromLeft ? w + margin : -margin;
    const y1 = Math.max(-margin, Math.min(h + margin, y0 + (rand() - 0.5) * h * 0.35));

    comet = {
      t0: t,
      dur: 5.0 + rand() * 2.0,
      x0, y0, x1, y1,
      headR: 2.2 * s,
      trail: 220 * s,
      hue: 40 + rand() * 40,
    };
  }

  function update(dt){
    t += dt;
    for (const b of bodies){
      if (b.center) continue;
      b.a += dt * b.sp;
      if (b.moon) b.moonA += dt * b.moonSp;
    }

    if (comet && t > comet.t0 + comet.dur + 1.1) {
      comet = null;
    }

    if (t >= nextCometAt) {
      spawnComet();
      scheduleNextComet(t);
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

      // rings (simple: draw under the planet, then the planet hides the inner ring)
      if (b.ring) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(b.ringTilt);
        ctx.globalCompositeOperation = 'lighter';

        const outerA = 0.22;
        const innerA = 0.12;
        const lw = Math.max(1, b.size * 0.16);

        ctx.lineWidth = lw;
        ctx.strokeStyle = `hsla(${b.ringHue},80%,70%,${outerA})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, b.size * b.ringW, b.size * b.ringW * b.ringH, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.lineWidth = Math.max(1, lw * 0.65);
        ctx.strokeStyle = `hsla(${b.ringHue},80%,75%,${innerA})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, b.size * (b.ringW * 0.82), b.size * (b.ringW * 0.82) * b.ringH, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }

      // base planet shading
      const hue2 = (b.hue + 35) % 360;
      const g = ctx.createRadialGradient(x - b.size * 0.35, y - b.size * 0.35, 1, x, y, b.size);
      if (b.kind === 'gas') {
        g.addColorStop(0, `hsla(${b.hue},70%,72%,0.95)`);
        g.addColorStop(1, `hsla(${hue2},70%,48%,0.88)`);
      } else {
        g.addColorStop(0, `hsla(${b.hue},85%,68%,0.95)`);
        g.addColorStop(1, `hsla(${hue2},85%,40%,0.88)`);
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, b.size, 0, Math.PI * 2);
      ctx.fill();

      // details: gas bands / rock craters
      if (b.kind === 'gas' && b.bandCount > 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(b.bandTilt);
        ctx.beginPath();
        ctx.arc(0, 0, b.size, 0, Math.PI * 2);
        ctx.clip();

        ctx.globalCompositeOperation = 'overlay';
        const bandH = (b.size * 2) / (b.bandCount * 1.15);
        for (let i = 0; i < b.bandCount; i++) {
          const yy = -b.size + (i / (b.bandCount - 1 || 1)) * (b.size * 2);
          const wave = 0.08 * Math.sin(b.bandPhase + i * 1.7);
          ctx.globalAlpha = 0.10 + Math.abs(wave);
          ctx.fillStyle = (i % 2) ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,1)';
          ctx.fillRect(-b.size * 1.2, yy - bandH * 0.5, b.size * 2.4, bandH);
        }

        if (b.storm) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = 'rgba(255,255,255,1)';
          const sx = Math.cos(b.storm.a) * (b.size * 0.25);
          const sy = Math.sin(b.storm.a) * (b.size * 0.25);
          ctx.beginPath();
          ctx.ellipse(sx, sy, b.size * b.storm.r, b.size * b.storm.r * 0.55, b.storm.a * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      if (b.kind === 'rock' && b.craters) {
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        ctx.arc(0, 0, b.size, 0, Math.PI * 2);
        ctx.clip();

        for (const c of b.craters) {
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = c.a;
          ctx.fillStyle = 'rgba(40,35,55,1)';
          ctx.beginPath();
          ctx.arc(c.rx * b.size, c.ry * b.size, c.rr * b.size, 0, Math.PI * 2);
          ctx.fill();

          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = c.a * 0.65;
          ctx.strokeStyle = 'rgba(255,255,255,1)';
          ctx.lineWidth = Math.max(1, b.size * 0.06);
          ctx.beginPath();
          ctx.arc(c.rx * b.size - b.size * 0.04, c.ry * b.size - b.size * 0.04, c.rr * b.size, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.restore();
      }

      // atmosphere/rim + spec highlight
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = `hsla(${(b.hue + 10) % 360},85%,70%,1)`;
      ctx.lineWidth = Math.max(1, b.size * 0.08);
      ctx.beginPath();
      ctx.arc(x, y, b.size * 1.03, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.26;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.beginPath();
      ctx.arc(x - b.size * 0.35, y - b.size * 0.35, b.size * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (b.moon){
        const mx = x + Math.cos(b.moonA) * (b.size * 2.2);
        const my = y + Math.sin(b.moonA) * (b.size * 1.4);
        ctx.fillStyle = 'rgba(230,230,245,0.85)';
        ctx.beginPath();
        ctx.arc(mx, my, b.size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // special moment: comet pass
    if (comet) {
      const age = t - comet.t0;
      const p = Math.min(1, Math.max(0, age / comet.dur));
      const ease = 1 - (1 - p) * (1 - p);
      const x = comet.x0 + (comet.x1 - comet.x0) * ease;
      const y = comet.y0 + (comet.y1 - comet.y0) * ease;

      const dx = comet.x1 - comet.x0;
      const dy = comet.y1 - comet.y0;
      const dl = Math.hypot(dx, dy) || 1;
      const ux = dx / dl;
      const uy = dy / dl;

      const fadeIn = Math.min(1, age / 0.35);
      const fadeOut = Math.min(1, Math.max(0, (comet.dur + 0.9 - age) / 0.9));
      const a = fadeIn * fadeOut;

      if (a > 0) {
        const tx = x - ux * comet.trail;
        const ty = y - uy * comet.trail;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9 * a;

        const lg = ctx.createLinearGradient(x, y, tx, ty);
        lg.addColorStop(0, `hsla(${comet.hue},95%,82%,0.95)`);
        lg.addColorStop(0.35, `hsla(${comet.hue + 18},95%,62%,0.55)`);
        lg.addColorStop(1, `hsla(${comet.hue + 35},95%,45%,0)`);
        ctx.strokeStyle = lg;
        ctx.lineWidth = comet.headR * 1.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        ctx.fillStyle = `hsla(${comet.hue},95%,90%,0.95)`;
        ctx.beginPath();
        ctx.arc(x, y, comet.headR * 1.25, 0, Math.PI * 2);
        ctx.fill();

        // sparkle
        ctx.globalAlpha = 0.55 * a;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = Math.max(1, comet.headR * 0.3);
        ctx.beginPath();
        ctx.moveTo(x - ux * comet.headR * 2.8, y - uy * comet.headR * 2.8);
        ctx.lineTo(x + ux * comet.headR * 0.6, y + uy * comet.headR * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - uy * comet.headR * 1.8, y + ux * comet.headR * 1.8);
        ctx.lineTo(x + uy * comet.headR * 1.8, y - ux * comet.headR * 1.8);
        ctx.stroke();

        ctx.restore();

        // OSD-safe label
        ctx.save();
        ctx.globalAlpha = 0.55 * a;
        ctx.font = `${Math.floor(h / 38)}px ui-sans-serif, system-ui`;
        ctx.fillStyle = 'rgba(240,250,255,0.92)';
        ctx.fillText('COMET PASS', w * 0.72, h * 0.12);
        ctx.restore();
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
