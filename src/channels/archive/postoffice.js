import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

function roundedRect(ctx, x, y, w, h, r){
  r = Math.min(r, w*0.5, h*0.5);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // typography
  let font = 16;
  let small = 12;
  let mono = 13;

  // palette (deterministic)
  const palettes = [
    { desk: ['#2b1f16', '#140f0b'], paper: ['rgba(245,240,230,0.94)', 'rgba(228,222,210,0.94)'], ink: '#151315', accent: '#ffcf6a', alert: '#ff4e52' },
    { desk: ['#2a2220', '#111010'], paper: ['rgba(240,244,248,0.92)', 'rgba(222,228,236,0.92)'], ink: '#10141a', accent: '#6cf2ff', alert: '#ff3f69' },
    { desk: ['#2c2016', '#0f0b08'], paper: ['rgba(248,236,220,0.94)', 'rgba(234,220,200,0.94)'], ink: '#1a1512', accent: '#b7ff8a', alert: '#ff5a3a' },
  ];
  const pal = pick(rand, palettes);

  // phases
  const PHASES = [
    { id: 'intake', label: 'INTAKE' },
    { id: 'stamp', label: 'POSTMARK' },
    { id: 'sort', label: 'SORT' },
    { id: 'dispatch', label: 'DISPATCH' },
  ];
  const PHASE_DUR = 14;
  const CYCLE_DUR = PHASE_DUR * PHASES.length;

  // layout
  let bins = []; // {x,y,w,h,label}
  let stampPos = { x: 0, y: 0 };

  // visuals / FX
  let grain = []; // {x,y,a}
  let inkBursts = []; // {x,y,vx,vy,life}

  // stamp moment
  let stampFlash = 0;
  let stampAnim = 0; // 0..1 down/up

  // express/alert moment
  let expressFlash = 0;
  let nextExpressAt = 0;

  // mail simulation
  const MAX_MAIL = 26;
  let mail = []; // {x,y,w,h,rot,kind,route,urgent,state,tx,ty,life}
  let spawnAcc = 0;
  let dispatchAcc = 0;

  // audio
  let ambience = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regenLayout(){
    bins = [];

    const pad = Math.floor(Math.min(w, h) * 0.06);
    const binAreaH = Math.floor(h * 0.28);
    const binY = h - pad - binAreaH;

    const binGap = Math.max(10, Math.floor(w * 0.022));
    const binW = Math.floor((w - pad*2 - binGap*3) / 4);
    const binH = binAreaH;

    const routesA = ['NORTH', 'SOUTH', 'EAST', 'WEST', 'CBD', 'HILLS', 'BAYSIDE', 'UPPER'];
    const routesB = ['A1', 'B4', 'C7', 'D2', 'E5', 'F3', 'G9', 'H6'];

    // deterministic route labels
    const chosen = [];
    while (chosen.length < 4){
      const lab = `${pick(rand, routesA)} ${pick(rand, routesB)}`;
      if (!chosen.includes(lab)) chosen.push(lab);
    }

    for (let i=0;i<4;i++){
      const x = pad + i * (binW + binGap);
      bins.push({ x, y: binY, w: binW, h: binH, label: chosen[i] });
    }

    stampPos = {
      x: w * 0.50,
      y: h * 0.46,
    };

    // paper grain dots
    const n = 170;
    grain = Array.from({ length: n }, () => ({
      x: rand() * w,
      y: rand() * h,
      a: 0.04 + rand() * 0.08,
    }));
  }

  function reset(){
    t = 0;
    spawnAcc = 0;
    dispatchAcc = 0;
    mail = [];
    inkBursts = [];
    stampFlash = 0;
    stampAnim = 0;
    expressFlash = 0;
    nextExpressAt = 7 + rand() * 10;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    regenLayout();
    reset();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // quiet bench tone
    const n = audio.noiseSource({ type: 'pink', gain: 0.0038 });
    n.start();
    const d = simpleDrone(audio, { root: 55 + rand()*18, detune: 0.7, gain: 0.014 });

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

  function destroy(){ onAudioOff(); }

  function spawnMailItem({ urgent=false }={}){
    if (mail.length >= MAX_MAIL) return;

    const kinds = ['envelope', 'postcard', 'flat'];
    const kind = urgent ? 'envelope' : pick(rand, kinds);

    const base = Math.min(w, h);
    const hh = (kind === 'postcard') ? base * 0.06 : (kind === 'flat') ? base * 0.055 : base * 0.065;
    const ww = hh * (kind === 'postcard' ? 1.35 : 1.65);

    const route = (rand() * bins.length) | 0;

    mail.push({
      x: -ww - rand()*w*0.08,
      y: h * (0.28 + rand()*0.25),
      w: ww,
      h: hh,
      rot: (rand() - 0.5) * 0.16,
      kind,
      route,
      urgent,
      state: 0, // 0=incoming, 1=toBin, 2=inBin, 3=dispatch
      tx: 0,
      ty: 0,
      life: 0,
    });
  }

  function triggerStamp({ urgent=false }={}){
    stampFlash = 1;
    stampAnim = 1;

    // ink burst
    for (let i=0;i<26;i++){
      const a = rand() * Math.PI * 2;
      const s = (0.25 + rand()*1.0) * Math.min(w, h) * 0.05;
      inkBursts.push({
        x: stampPos.x + (rand()-0.5)*10,
        y: stampPos.y + (rand()-0.5)*8,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - Math.min(w,h)*0.02,
        life: 0.45 + rand()*0.65,
      });
    }

    // audio: thump + click
    safeBeep({ freq: 150, dur: 0.05, gain: urgent ? 0.03 : 0.022, type: 'square' });
    safeBeep({ freq: 680 + rand()*140, dur: 0.014, gain: urgent ? 0.014 : 0.010, type: 'triangle' });

    if (urgent){
      expressFlash = 1;
      safeBeep({ freq: 980, dur: 0.06, gain: 0.02, type: 'square' });
    }
  }

  function update(dt){
    t += dt;

    stampFlash = Math.max(0, stampFlash - dt * 2.1);
    expressFlash = Math.max(0, expressFlash - dt * 1.2);
    stampAnim = Math.max(0, stampAnim - dt * 2.6);

    // advance particles
    for (const p of inkBursts){
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += Math.min(w,h) * 0.12 * dt;
      p.life -= dt;
    }
    if (inkBursts.length) inkBursts = inkBursts.filter(p => p.life > 0);

    // phase
    const cycT = t % CYCLE_DUR;
    const phaseIdx = Math.floor(cycT / PHASE_DUR);
    const phase = PHASES[phaseIdx].id;
    const p = (cycT - phaseIdx * PHASE_DUR) / PHASE_DUR;

    // spawn rate varies by phase
    const spawnRate = (phase === 'intake') ? lerp(1.4, 2.8, ease(p))
      : (phase === 'stamp') ? 1.8
      : (phase === 'sort') ? 1.1
      : 0.55;

    spawnAcc += dt * spawnRate;
    while (spawnAcc >= 1){
      spawnAcc -= 1;
      spawnMailItem();
    }

    // express mail schedule
    if (t >= nextExpressAt){
      spawnMailItem({ urgent: true });
      nextExpressAt = t + 14 + rand()*18;
    }

    // dispatch: periodically send a couple out
    if (phase === 'dispatch'){
      const rate = lerp(0.6, 2.4, ease(p));
      dispatchAcc += dt * rate;
      while (dispatchAcc >= 1){
        dispatchAcc -= 1;

        // pick one in-bin item to dispatch
        for (let i=0;i<mail.length;i++){
          const m = mail[(i + ((rand()*mail.length)|0)) % mail.length];
          if (m.state === 2 && rand() < 0.55){
            m.state = 3;
            m.tx = w * 1.15;
            m.ty = h * (0.18 + rand()*0.18);
            safeBeep({ freq: 320 + rand()*120, dur: 0.018, gain: 0.008, type: 'square' });
            break;
          }
        }
      }
    } else {
      dispatchAcc = 0;
    }

    // move mail items
    for (const m of mail){
      m.life += dt;

      if (m.state === 0){
        // incoming -> stamp
        const v = Math.max(110, w * 0.22);
        m.x += v * dt;
        m.y += Math.sin((t + m.life*0.7) * 1.2) * dt * 12;

        if (m.x >= stampPos.x - m.w * 0.62){
          m.state = 1;
          const b = bins[m.route];
          m.tx = b.x + b.w * (0.25 + rand()*0.5);
          m.ty = b.y + b.h * (0.32 + rand()*0.48);
          triggerStamp({ urgent: m.urgent });
        }
      }
      else if (m.state === 1){
        // to bin
        const dx = m.tx - m.x;
        const dy = m.ty - m.y;
        const k = 4.8;
        m.x += dx * clamp(dt * k, 0, 1);
        m.y += dy * clamp(dt * k, 0, 1);
        m.rot *= (1 - clamp(dt * 2.2, 0, 1));

        if ((dx*dx + dy*dy) < (Math.min(w,h)*0.010) ** 2){
          m.state = 2;
        }
      }
      else if (m.state === 2){
        // settled in bin
        m.y += Math.sin((t * 1.4) + m.route * 1.1 + m.life) * dt * 2.2;
      }
      else if (m.state === 3){
        const dx = m.tx - m.x;
        const dy = m.ty - m.y;
        const k = 2.6;
        m.x += dx * clamp(dt * k, 0, 1);
        m.y += dy * clamp(dt * k, 0, 1);
        m.rot += dt * 0.6;
      }
    }

    // cull offscreen
    mail = mail.filter(m => m.x < w * 1.25 && m.y < h * 1.25 && m.y > -h * 0.25);
  }

  function drawBackground(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    const g = ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0, pal.desk[0]);
    g.addColorStop(1, pal.desk[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // subtle desk vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.42, Math.min(w,h)*0.10, w*0.5, h*0.42, Math.max(w,h)*0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);

    // grain
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = '#ffffff';
    for (const p of grain){
      ctx.globalAlpha = p.a;
      ctx.fillRect(p.x, p.y, 1, 1);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawBins(ctx){
    const pad = Math.floor(Math.min(w,h) * 0.06);

    // bin top divider line
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    ctx.beginPath();
    ctx.moveTo(pad, bins[0].y - pad*0.35);
    ctx.lineTo(w - pad, bins[0].y - pad*0.35);
    ctx.stroke();

    // counts per bin
    const counts = new Array(bins.length).fill(0);
    for (const m of mail){
      if (m.state === 2) counts[m.route]++;
    }

    for (let i=0;i<bins.length;i++){
      const b = bins[i];
      const r = Math.max(10, Math.floor(Math.min(b.w,b.h) * 0.08));

      // bin shell
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundedRect(ctx, b.x, b.y, b.w, b.h, r);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.stroke();

      // label plate
      const plateH = Math.max(18, Math.floor(b.h * 0.18));
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      roundedRect(ctx, b.x + b.w*0.06, b.y + b.h*0.06, b.w*0.88, plateH, r*0.6);
      ctx.fill();

      ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = 'rgba(245,245,245,0.78)';
      ctx.fillText(b.label, b.x + b.w*0.10, b.y + b.h*0.06 + plateH*0.72);

      // fill level
      const maxC = 10;
      const fill = clamp(counts[i] / maxC, 0, 1);
      const fh = b.h * 0.62 * fill;
      const fx = b.x + b.w*0.10;
      const fy = b.y + b.h*0.92 - fh;
      const fw = b.w * 0.80;
      const col = ctx.createLinearGradient(0, fy, 0, fy + fh);
      col.addColorStop(0, 'rgba(255,255,255,0.16)');
      col.addColorStop(1, 'rgba(255,255,255,0.05)');
      ctx.fillStyle = col;
      ctx.fillRect(fx, fy, fw, fh);

      // count marker
      ctx.fillStyle = `rgba(0,0,0,0.35)`;
      ctx.fillRect(fx, b.y + b.h*0.92 + 2, fw, Math.max(2, Math.floor(dpr)));
      ctx.fillStyle = `rgba(255,255,255,0.55)`;
      ctx.fillRect(fx, b.y + b.h*0.92 + 2, fw * fill, Math.max(2, Math.floor(dpr)));
    }
  }

  function drawMail(ctx){
    for (const m of mail){
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rot);

      // base paper
      const g = ctx.createLinearGradient(-m.w*0.5, -m.h*0.5, m.w*0.5, m.h*0.5);
      g.addColorStop(0, pal.paper[0]);
      g.addColorStop(1, pal.paper[1]);
      ctx.fillStyle = g;
      roundedRect(ctx, -m.w*0.5, -m.h*0.5, m.w, m.h, Math.max(4, m.h*0.18));
      ctx.fill();

      // border
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      ctx.stroke();

      // urgent stripe
      if (m.urgent){
        ctx.fillStyle = 'rgba(255,78,82,0.55)';
        ctx.fillRect(-m.w*0.5, -m.h*0.08, m.w, m.h*0.16);
      }

      // address lines
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      const ax = -m.w*0.22;
      const ay = -m.h*0.15;
      for (let i=0;i<3;i++){
        ctx.fillRect(ax, ay + i*m.h*0.17, m.w*(0.45 - i*0.08), Math.max(1, m.h*0.06));
      }
      ctx.globalAlpha = 1;

      // route tag
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      roundedRect(ctx, m.w*0.10, -m.h*0.40, m.w*0.34, m.h*0.30, m.h*0.12);
      ctx.fill();
      ctx.font = `${Math.max(10, Math.floor(m.h*0.32))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      const lab = bins[m.route]?.label?.split(' ')?.[1] || '—';
      ctx.fillText(lab, m.w*0.14, -m.h*0.18);

      ctx.restore();
    }
  }

  function drawStamp(ctx){
    // stamp body
    const down = ease(stampAnim);
    const y = stampPos.y + down * (Math.min(w,h)*0.04);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(stampPos.x, stampPos.y + Math.min(w,h)*0.07, Math.min(w,h)*0.09, Math.min(w,h)*0.028, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(stampPos.x, y);

    // handle
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundedRect(ctx, -Math.min(w,h)*0.028, -Math.min(w,h)*0.12, Math.min(w,h)*0.056, Math.min(w,h)*0.11, Math.min(w,h)*0.02);
    ctx.fill();

    // head
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.min(w,h)*0.11, Math.min(w,h)*0.045, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    ctx.stroke();

    ctx.restore();

    // postmark rings
    if (stampFlash > 0){
      const a = stampFlash;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.55 * a;
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      const r0 = Math.min(w,h) * (0.06 + (1-a)*0.03);
      for (let i=0;i<3;i++){
        ctx.beginPath();
        ctx.arc(stampPos.x, stampPos.y + Math.min(w,h)*0.04, r0 + i*Math.min(w,h)*0.018, 0, Math.PI*2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ink specks
    if (inkBursts.length){
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      for (const p of inkBursts){
        ctx.globalAlpha = clamp(p.life, 0, 1) * 0.25;
        ctx.fillStyle = pal.ink;
        ctx.fillRect(p.x, p.y, 2, 2);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // express alert card
    if (expressFlash > 0){
      const a = expressFlash;
      const cardW = Math.min(w*0.52, h*0.72);
      const cardH = Math.max(56, Math.floor(cardW * 0.18));
      const x = w*0.5 - cardW*0.5;
      const y2 = h*0.12 + (1-a)*(h*0.02);
      ctx.save();
      ctx.globalAlpha = 0.92 * a;
      ctx.fillStyle = `rgba(0,0,0,0.42)`;
      roundedRect(ctx, x, y2, cardW, cardH, 12);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,78,82,0.60)`;
      ctx.stroke();
      ctx.fillStyle = pal.alert;
      ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText('EXPRESS ITEM — PRIORITY ROUTE', x + cardW*0.07, y2 + cardH*0.66);
      ctx.restore();
    }
  }

  function drawHud(ctx){
    const pad = Math.floor(Math.min(w, h) * 0.06);
    const cycT = t % CYCLE_DUR;
    const phaseIdx = Math.floor(cycT / PHASE_DUR);
    const phase = PHASES[phaseIdx];
    const p = (cycT - phaseIdx * PHASE_DUR) / PHASE_DUR;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    roundedRect(ctx, pad, pad, Math.min(w*0.54, 520), Math.max(52, font*2.2), 14);
    ctx.fill();

    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(245,245,245,0.84)';
    ctx.fillText('POST OFFICE SORTING DESK', pad + 18, pad + font*1.15);

    // phase bar
    const barX = pad + 18;
    const barY = pad + font*1.35;
    const barW = Math.min(w*0.54, 520) - 36;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(barX, barY + 18, barW, 3);
    ctx.fillStyle = `rgba(255,255,255,${0.45 + 0.35*Math.sin(t*1.7)})`;
    ctx.fillRect(barX, barY + 18, barW * p, 3);

    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = pal.accent;
    ctx.fillText(`MODE: ${phase.label}`, barX, barY + 14);

    ctx.restore();
  }

  function render(ctx){
    drawBackground(ctx);

    // conveyor / midground
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(2, Math.floor(dpr*1.2));
    ctx.beginPath();
    ctx.moveTo(-w*0.1, h*0.52);
    ctx.lineTo(w*1.1, h*0.40);
    ctx.stroke();
    ctx.restore();

    drawBins(ctx);
    drawMail(ctx);
    drawStamp(ctx);
    drawHud(ctx);

    // final vignette (extra)
    const vg = ctx.createRadialGradient(w*0.5, h*0.42, Math.min(w,h)*0.18, w*0.5, h*0.42, Math.max(w,h)*0.86);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);
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
