import { mulberry32, clamp } from '../../util/prng.js';

// Minute Museum
// One artwork/object per minute: quick context, one detail zoom, one takeaway.

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const EXHIBITS = [
  {
    title: 'Glass Sea Study',
    maker: 'Anon. Workshop',
    year: 'c. 1920',
    medium: 'ink + salt on paper',
    detail: 'Look for the “grain” where the salt bloomed the pigment.',
    takeaway: 'Tiny material accidents become the whole mood.'
  },
  {
    title: 'The Red Stairwell',
    maker: 'M. Harrow',
    year: '1978',
    medium: 'photograph (gelatin silver)',
    detail: 'Notice the camera tilt: it makes the space feel unstable.',
    takeaway: 'Composition is emotion, before story even begins.'
  },
  {
    title: 'Pocket Planet No. 3',
    maker: 'I. Kato',
    year: '2004',
    medium: 'ceramic + glaze',
    detail: 'Glaze pooling at the rim reads like weather patterns.',
    takeaway: 'Scale doesn’t limit drama; it concentrates it.'
  },
  {
    title: 'Blueprint for a Daydream',
    maker: 'S. Okafor',
    year: '1999',
    medium: 'screenprint',
    detail: 'Find the mis-registered layer: the “ghost” edge.',
    takeaway: 'Imperfection is often the signature.'
  },
  {
    title: 'Night Ferry Ticket',
    maker: 'City Transit Archive',
    year: '1963',
    medium: 'printed ephemera',
    detail: 'The typography hierarchy tells you what mattered to riders.',
    takeaway: 'Design is a time capsule for priorities.'
  },
  {
    title: 'Relic: Brass Compass',
    maker: 'Sailmaker’s Guild',
    year: 'c. 1880',
    medium: 'brass + enamel',
    detail: 'Micro-scratches show how hands used it, not just how it looked.',
    takeaway: 'Wear patterns are a record of real decisions.'
  },
  {
    title: 'Two-Colour City Map',
    maker: 'H. Vance',
    year: '1934',
    medium: 'lithograph',
    detail: 'The second colour is doing the heavy lifting—watch where it lands.',
    takeaway: 'Constraints can sharpen a visual language.'
  },
  {
    title: 'A Small Machine for Listening',
    maker: 'R. Paredes',
    year: '2011',
    medium: 'mixed media',
    detail: 'Cables become lines; lines become rhythm.',
    takeaway: 'Function can be re-read as form.'
  },
];

function shuffled(rand, arr){
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--){
    const j = (rand() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;
  let font = 16, small = 12;

  const SEG_DUR = 60; // seconds per exhibit
  let order = [];
  let idx = 0;
  let segT = 0;

  // procedural “art” ingredients for the current exhibit
  let palette = null;
  let shapes = [];
  let grainSeed = 0;

  // audio handle
  let ah = null;

  function buildPalette(){
    const schemes = [
      { bg0: '#0b1220', bg1: '#04070f', a: '#6cf2ff', b: '#ffd36b', c: '#ff5aa5' },
      { bg0: '#120b1f', bg1: '#05030a', a: '#b2a4ff', b: '#63ffb6', c: '#ff7a59' },
      { bg0: '#06141a', bg1: '#020607', a: '#9ad7ff', b: '#ffd36b', c: '#7cffc6' },
    ];
    return pick(rand, schemes);
  }

  function buildArt(){
    palette = buildPalette();
    grainSeed = (rand() * 1e9) | 0;

    const n = 54 + ((rand() * 32) | 0);
    shapes = Array.from({ length: n }, (_, i) => {
      const typ = rand() < 0.45 ? 'circle' : (rand() < 0.7 ? 'rect' : 'stroke');
      const col = i % 3 === 0 ? palette.a : (i % 3 === 1 ? palette.b : palette.c);
      return {
        typ,
        x: rand(),
        y: rand(),
        r: 0.02 + rand() * 0.18,
        w: 0.04 + rand() * 0.28,
        h: 0.04 + rand() * 0.28,
        rot: rand() * Math.PI * 2,
        a: 0.03 + rand() * 0.14,
        col,
        wob: rand() * 10,
      };
    });
  }

  function cur(){
    return order[idx] || EXHIBITS[0];
  }

  function nextExhibit(){
    idx++;
    if (idx >= order.length) idx = 0;
    segT = 0;
    buildArt();

    // gentle “gallery click”
    if (audio.enabled){
      audio.beep({ freq: 420 + rand() * 80, dur: 0.02, gain: 0.03, type: 'square' });
    }
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    order = shuffled(rand, EXHIBITS);
    idx = 0;
    segT = 0;
    buildArt();
  }

  function onResize(width, height){
    w = width; h = height;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();
    const out = ctx.createGain();
    out.gain.value = 0.85;
    out.connect(audio.master);

    // Quiet museum room tone: lowpassed pink noise.
    const noise = audio.noiseSource({ type: 'pink', gain: 0.035 });
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 720;
    lpf.Q.value = 0.9;

    noise.src.disconnect();
    noise.src.connect(noise.gain);
    noise.gain.disconnect();
    noise.gain.connect(lpf);
    lpf.connect(out);

    noise.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.09); } catch {}
        try { noise.stop(); } catch {}
      }
    };
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    ah?.stop?.();
    ah = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    segT += dt;
    if (segT >= SEG_DUR){
      nextExhibit();
    }
  }

  function drawWall(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, palette?.bg0 || '#0b1220');
    g.addColorStop(0.55, '#070b14');
    g.addColorStop(1, palette?.bg1 || '#04070f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle spotlight
    const sp = ctx.createRadialGradient(w * 0.52, h * 0.42, 0, w * 0.52, h * 0.42, Math.max(w, h) * 0.7);
    sp.addColorStop(0, 'rgba(255,255,255,0.06)');
    sp.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = sp;
    ctx.fillRect(0, 0, w, h);
  }

  function drawArt(ctx, x, y, ww, hh, time){
    // background wash
    const g = ctx.createLinearGradient(x, y, x + ww, y + hh);
    g.addColorStop(0, 'rgba(255,255,255,0.02)');
    g.addColorStop(1, 'rgba(0,0,0,0.24)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, ww, hh);

    // shapes
    for (const s of shapes){
      const px = x + s.x * ww;
      const py = y + s.y * hh;
      const wob = Math.sin(time * 0.5 + s.wob) * 0.008;

      ctx.save();
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.col;
      ctx.strokeStyle = s.col;
      ctx.translate(px, py);
      ctx.rotate(s.rot + wob);

      if (s.typ === 'circle'){
        const rr = s.r * Math.min(ww, hh);
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.typ === 'rect'){
        ctx.fillRect(-s.w * ww * 0.5, -s.h * hh * 0.5, s.w * ww, s.h * hh);
      } else {
        ctx.globalAlpha *= 0.8;
        ctx.lineWidth = Math.max(1, Math.floor(Math.min(ww, hh) / 220));
        ctx.beginPath();
        ctx.moveTo(-s.w * ww * 0.5, -s.h * hh * 0.5);
        ctx.lineTo(s.w * ww * 0.5, s.h * hh * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    // faint “paper grain”
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const step = Math.max(10, Math.floor(Math.min(ww, hh) / 18));
    // deterministic-ish dithering: use a simple hash based on i + seed
    for (let yy = 0; yy < hh; yy += step){
      for (let xx = 0; xx < ww; xx += step){
        const hsh = (((xx * 73856093) ^ (yy * 19349663) ^ grainSeed) >>> 0);
        if ((hsh & 15) === 0){
          ctx.fillRect(x + xx + (hsh & 7), y + yy + ((hsh >>> 3) & 7), 1, 1);
        }
      }
    }
    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const ex = cur();
    const s = Math.min(w, h);

    drawWall(ctx);

    // Frame geometry
    const frameW = Math.floor(s * 0.78);
    const frameH = Math.floor(s * 0.58);
    const fx = Math.floor(w * 0.5 - frameW * 0.5);
    const fy = Math.floor(h * 0.18);
    const frameR = Math.max(14, Math.floor(font * 1.0));

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, fx + 10, fy + 12, frameW, frameH, frameR);
    ctx.fill();
    ctx.restore();

    // frame
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(30, 22, 12, 0.92)';
    roundRect(ctx, fx, fy, frameW, frameH, frameR);
    ctx.fill();

    // matte
    const matte = Math.floor(font * 1.35);
    ctx.fillStyle = 'rgba(235, 236, 242, 0.06)';
    roundRect(ctx, fx + matte, fy + matte, frameW - matte*2, frameH - matte*2, Math.max(10, frameR - 6));
    ctx.fill();

    // art
    const pad = matte + Math.floor(font * 0.95);
    const ax = fx + pad;
    const ay = fy + pad;
    const aw = frameW - pad*2;
    const ahh = frameH - pad*2;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, ax, ay, aw, ahh, Math.max(10, frameR - 10));
    ctx.clip();
    drawArt(ctx, ax, ay, aw, ahh, t);
    ctx.restore();

    // subtle gloss on frame
    ctx.globalAlpha = 0.12;
    const gloss = ctx.createLinearGradient(fx, fy, fx + frameW, fy + frameH);
    gloss.addColorStop(0, 'rgba(255,255,255,0.9)');
    gloss.addColorStop(0.35, 'rgba(255,255,255,0.0)');
    gloss.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = gloss;
    roundRect(ctx, fx, fy, frameW, frameH, frameR);
    ctx.fill();

    ctx.restore();

    // Detail zoom inset
    const insetW = Math.floor(s * 0.28);
    const insetH = Math.floor(s * 0.20);
    const ix = Math.floor(w * 0.68);
    const iy = Math.floor(h * 0.70);

    // where the zoom points, slowly drifting
    const u = clamp(segT / SEG_DUR, 0, 1);
    const px = 0.15 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.19 + idx));
    const py = 0.15 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.23 + idx * 1.7));
    const zoom = 2.2;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, ix + 6, iy + 8, insetW, insetH, 12);
    ctx.fill();

    ctx.fillStyle = 'rgba(10, 14, 22, 0.88)';
    roundRect(ctx, ix, iy, insetW, insetH, 12);
    ctx.fill();

    ctx.beginPath();
    roundRect(ctx, ix + 8, iy + 8, insetW - 16, insetH - 16, 10);
    ctx.clip();

    // draw art again, but zoomed & panned
    const zx = ix + 8 - (px * aw) * (zoom - 1);
    const zy = iy + 8 - (py * ahh) * (zoom - 1);
    ctx.save();
    ctx.translate(zx, zy);
    ctx.scale(zoom, zoom);
    drawArt(ctx, ax, ay, aw, ahh, t + 10);
    ctx.restore();

    ctx.restore();

    // inset label + timing
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.font = `${Math.floor(small * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    const rem = Math.max(0, Math.ceil(SEG_DUR - segT));
    const tag = `DETAIL  •  ${String(rem).padStart(2,'0')}s`;
    ctx.fillText(tag, ix + 10, iy - Math.floor(small * 1.35));
    ctx.restore();

    // Text panel (bottom left)
    const tx = Math.floor(w * 0.06);
    const ty = Math.floor(h * 0.70);
    const tw = Math.floor(w * 0.56);
    const th = Math.floor(h * 0.24);

    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    roundRect(ctx, tx + 6, ty + 8, tw, th, 16);
    ctx.fill();

    ctx.fillStyle = 'rgba(10, 14, 22, 0.78)';
    roundRect(ctx, tx, ty, tw, th, 16);
    ctx.fill();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = palette?.a || 'rgba(108,242,255,0.85)';
    ctx.fillRect(tx, ty + Math.floor(font * 1.55), tw, 2);

    ctx.globalAlpha = 0.94;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('MINUTE MUSEUM', tx + Math.floor(font * 0.8), ty + Math.floor(font * 0.35));

    ctx.globalAlpha = 0.92;
    ctx.font = `${Math.floor(font * 1.15)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.fillText(ex.title, tx + Math.floor(font * 0.8), ty + Math.floor(font * 2.1));

    ctx.globalAlpha = 0.78;
    ctx.font = `${Math.floor(small * 0.98)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.fillText(`${ex.maker}  •  ${ex.year}  •  ${ex.medium}`, tx + Math.floor(font * 0.8), ty + Math.floor(font * 3.55));

    // staged copy: context → detail → takeaway
    const detailGate = (u > 0.45);
    const takeawayGate = (u > 0.82);

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = (palette?.b || '#ffd36b');
    ctx.font = `${Math.floor(small * 0.96)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('CONTEXT:', tx + Math.floor(font * 0.8), ty + Math.floor(font * 4.85));

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(231,238,246,0.82)';
    ctx.font = `${Math.floor(small * 0.98)}px ui-sans-serif, system-ui`;
    ctx.fillText('One object, one minute. Look closely, then move on.', tx + Math.floor(font * 4.3), ty + Math.floor(font * 4.82));

    ctx.globalAlpha = detailGate ? 0.88 : 0.25;
    ctx.fillStyle = (palette?.c || '#ff5aa5');
    ctx.font = `${Math.floor(small * 0.96)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('DETAIL:', tx + Math.floor(font * 0.8), ty + Math.floor(font * 6.1));

    ctx.globalAlpha = detailGate ? 0.86 : 0.20;
    ctx.fillStyle = 'rgba(231,238,246,0.82)';
    ctx.font = `${Math.floor(small * 0.98)}px ui-sans-serif, system-ui`;
    ctx.fillText(ex.detail, tx + Math.floor(font * 4.3), ty + Math.floor(font * 6.07));

    ctx.globalAlpha = takeawayGate ? 0.9 : 0.18;
    ctx.fillStyle = (palette?.a || '#6cf2ff');
    ctx.font = `${Math.floor(small * 0.96)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('TAKEAWAY:', tx + Math.floor(font * 0.8), ty + Math.floor(font * 7.35));

    ctx.globalAlpha = takeawayGate ? 0.88 : 0.16;
    ctx.fillStyle = 'rgba(231,238,246,0.86)';
    ctx.font = `${Math.floor(small * 0.98)}px ui-sans-serif, system-ui`;
    ctx.fillText(ex.takeaway, tx + Math.floor(font * 5.3), ty + Math.floor(font * 7.32));

    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
