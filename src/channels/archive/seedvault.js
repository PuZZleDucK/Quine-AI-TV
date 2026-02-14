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

  let font = 16;
  let small = 12;
  let mono = 13;

  const palettes = [
    { bg0:'#071016', bg1:'#0a1c22', cab:'#132930', cab2:'#0d1e24', metal:'rgba(255,255,255,0.13)', ink:'#eaffff', sub:'rgba(234,255,255,0.62)', accent:'#6cf2ff', ok:'#7cffc9', warn:'#ff6a8a' },
    { bg0:'#0a0e16', bg1:'#121a20', cab:'#1a232f', cab2:'#121a22', metal:'rgba(255,255,255,0.12)', ink:'#f3f7ff', sub:'rgba(243,247,255,0.62)', accent:'#ffd36a', ok:'#7cffc9', warn:'#ff4ea6' },
    { bg0:'#060f12', bg1:'#0f1c16', cab:'#122a22', cab2:'#0d1f18', metal:'rgba(255,255,255,0.12)', ink:'#f1fff9', sub:'rgba(241,255,249,0.60)', accent:'#a2c2ff', ok:'#b7ff8a', warn:'#ff5a3a' },
  ];
  const pal = pick(rand, palettes);

  // cycle structure
  const DRAWER_DUR = 12.5; // seconds
  const DRAWERS = 4;
  const TALLY_DUR = 6.0;
  const CYCLE_DUR = DRAWERS*DRAWER_DUR + TALLY_DUR;

  // layout
  let cab = { x:0, y:0, w:0, h:0 };
  let drawerH = 0;
  let drawerGap = 0;
  let gauge = { x:0, y:0, w:0, h:0 };

  let drawers = []; // {label, packets:[{code,name,color}], active}

  // motion/FX
  let frost = []; // {x,y,r,a,vy,life}
  let scanFlash = 0;
  let stampFlash = 0;
  let stampTTL = 0;

  let lastSegment = -1;

  // audio
  let ambience = null;
  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function makeDrawers(){
    const cropsA = ['WHEAT', 'RYE', 'BARLEY', 'OATS', 'SORGHUM', 'AMARANTH', 'QUINOA', 'LENTIL', 'CHICKPEA', 'RICE'];
    const cropsB = ['HEIRLOOM', 'DWARF', 'WINTER', 'SPRING', 'ARCTIC', 'COASTAL', 'HIGHLAND', 'DRYLAND', 'ALPINE', 'RIVER'];
    const regions = ['SVALBARD', 'TASMAN', 'KAROO', 'HOKKAIDO', 'ATLAS', 'PUNA', 'OKHOTSK', 'DANUBE', 'KAMCHAT'];

    const packetColors = ['#7cffc9', '#6cf2ff', '#ffd36a', '#ff6aa2', '#b7ff8a', '#a2c2ff', '#ffd0ff'];

    drawers = [];
    for (let i=0;i<DRAWERS;i++){
      const label = `DRAWER ${String(i+1).padStart(2,'0')}`;
      const packets = [];
      const n = 4 + ((rand()*3)|0);
      const used = new Set();
      while (packets.length < n){
        const name = `${pick(rand, cropsA)} ${rand()<0.55 ? pick(rand, cropsB) : ''}`.trim();
        if (used.has(name)) continue;
        used.add(name);
        const code = `${pick(rand, regions)}-${10 + ((rand()*89)|0)}-${String.fromCharCode(65 + ((rand()*5)|0))}`;
        packets.push({
          code,
          name,
          color: pick(rand, packetColors),
        });
      }
      drawers.push({ label, packets, active: (rand()*packets.length)|0 });
    }
  }

  function regenLayout(){
    const pad = Math.floor(Math.min(w,h) * 0.06);
    cab = {
      x: pad,
      y: Math.floor(h * 0.16),
      w: Math.floor(w * 0.62),
      h: Math.floor(h * 0.72),
    };

    drawerGap = Math.max(10, Math.floor(h * 0.02));
    drawerH = Math.floor((cab.h - drawerGap*(DRAWERS+1)) / DRAWERS);

    gauge = {
      x: cab.x + cab.w + Math.floor(pad * 0.45),
      y: cab.y,
      w: w - (cab.x + cab.w) - Math.floor(pad * 1.45),
      h: cab.h,
    };

    // FX particles
    const n = 70;
    frost = Array.from({ length: n }, () => ({
      x: rand()*w,
      y: rand()*h,
      r: 0.6 + rand()*2.6,
      a: 0.03 + rand()*0.08,
      vy: 8 + rand()*18,
      life: 1,
    }));
  }

  function reset(){
    t = 0;
    scanFlash = 0;
    stampFlash = 0;
    stampTTL = 0;
    lastSegment = -1;

    for (const p of frost){
      p.x = rand()*w;
      p.y = rand()*h;
      p.life = 1;
    }
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w,h) / 30));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    makeDrawers();
    regenLayout();
    reset();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type: 'brown', gain: 0.0032 });
    n.start();
    const d = simpleDrone(audio, { root: 38 + rand()*14, detune: 0.55, gain: 0.010 });
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

  function triggerSegment(idx){
    // idx: 0..DRAWERS (tally = DRAWERS)
    if (idx < DRAWERS){
      // drawer step: small mechanical click
      safeBeep({ freq: 160 + rand()*40, dur: 0.05, gain: 0.014, type: 'square' });
    } else {
      // tally stamp
      stampFlash = 1;
      stampTTL = 2.8;
      safeBeep({ freq: 920 + rand()*80, dur: 0.03, gain: 0.018, type: 'triangle' });
      safeBeep({ freq: 220, dur: 0.06, gain: 0.018, type: 'square' });
    }
  }

  function update(dt){
    t += dt;
    scanFlash = Math.max(0, scanFlash - dt * 2.0);
    stampFlash = Math.max(0, stampFlash - dt * 1.35);
    if (stampTTL > 0) stampTTL = Math.max(0, stampTTL - dt);

    // determine current segment
    const cyc = t % CYCLE_DUR;
    const seg = (cyc < DRAWERS*DRAWER_DUR) ? Math.floor(cyc / DRAWER_DUR) : DRAWERS;
    if (seg !== lastSegment){
      lastSegment = seg;
      triggerSegment(seg);
      if (seg < DRAWERS){
        scanFlash = 1;
      }
    }

    // frost drift (vault air)
    for (const p of frost){
      p.y += p.vy * dt;
      p.x += Math.sin((p.y*0.01) + t*0.3) * dt * 6;
      if (p.y > h + 20){
        p.y = -20;
        p.x = rand()*w;
      }
    }
  }

  function drawGauges(ctx){
    // values drift with time (deterministic-ish)
    const humBase = 38 + ((seed % 11) * 0.9);
    const tempBase = -18 + ((seed % 7) * 0.35);
    const hum = humBase + Math.sin(t*0.27) * 4.0 + Math.sin(t*0.91) * 1.2;
    const temp = tempBase + Math.sin(t*0.19) * 0.8 + Math.sin(t*0.53) * 0.25;

    const gx = gauge.x;
    const gy = gauge.y;
    const gw = Math.max(220, gauge.w);
    const gh = gauge.h;

    // panel
    ctx.save();
    roundedRect(ctx, gx, gy, gw, gh, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.92;
    ctx.font = `800 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ENVIRONMENT', gx + 14, gy + 12);

    const dialR = Math.min(gw*0.38, gh*0.19);
    const d1x = gx + gw*0.5;
    const d1y = gy + gh*0.30;
    const d2y = gy + gh*0.64;

    function dial(label, value, unit, min, max, y, color){
      ctx.save();
      ctx.translate(d1x, y);

      // arc
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = Math.max(2, Math.floor(dialR*0.08));
      ctx.beginPath();
      ctx.arc(0, 0, dialR, Math.PI*0.75, Math.PI*2.25);
      ctx.stroke();

      const tt = clamp((value - min) / (max - min), 0, 1);
      const ang = lerp(Math.PI*0.75, Math.PI*2.25, tt);

      // needle
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, Math.floor(dialR*0.10));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * dialR*0.92, Math.sin(ang) * dialR*0.92);
      ctx.stroke();

      // hub
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, dialR*0.10, 0, Math.PI*2);
      ctx.fill();

      // text
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = pal.sub;
      ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(label, 0, dialR*0.95);

      ctx.globalAlpha = 0.98;
      ctx.fillStyle = pal.ink;
      ctx.font = `800 ${Math.floor(font*1.05)}px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif`;
      const txt = (unit==='°C') ? `${value.toFixed(1)}${unit}` : `${Math.round(value)}${unit}`;
      ctx.fillText(txt, 0, dialR*0.95 + small + 6);

      ctx.restore();
    }

    dial('HUMIDITY', hum, '%', 25, 65, d1y, pal.accent);
    dial('TEMP', temp, '°C', -24, -10, d2y, pal.ok);

    // status strip
    const ok = hum < 58 && temp < -12.0;
    const status = ok ? 'STABLE' : 'CHECK';
    const col = ok ? pal.ok : pal.warn;

    ctx.globalAlpha = 0.9;
    roundedRect(ctx, gx + 14, gy + gh - 56, gw - 28, 42, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();

    ctx.fillStyle = col;
    ctx.globalAlpha = 0.96;
    ctx.font = `900 ${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`STATUS: ${status}`, gx + 28, gy + gh - 56 + 21);

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // background
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(1, pal.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // subtle cold glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.10;
    const glow = ctx.createRadialGradient(w*0.35, h*0.45, 0, w*0.35, h*0.45, Math.max(w,h)*0.7);
    glow.addColorStop(0, pal.accent);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0,0,w,h);
    ctx.restore();

    // frost motes
    ctx.save();
    ctx.fillStyle = pal.ink;
    for (const p of frost){
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // cabinet body
    ctx.save();
    roundedRect(ctx, cab.x, cab.y, cab.w, cab.h, 22);
    ctx.fillStyle = pal.cab;
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = pal.metal;
    ctx.lineWidth = 2;
    ctx.stroke();

    // top label
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = pal.ink;
    ctx.font = `800 ${font}px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Seed Vault Inventory', cab.x + 18, cab.y + 14);
    ctx.globalAlpha = 0.75;
    ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = pal.sub;
    ctx.fillText('CONTROLLED ACCESS • ARCHIVE', cab.x + 18, cab.y + 14 + font + 6);

    // compute current segment and drawer motion
    const cyc = t % CYCLE_DUR;
    const inDrawer = cyc < DRAWERS*DRAWER_DUR;
    const seg = inDrawer ? Math.floor(cyc / DRAWER_DUR) : DRAWERS;
    const segT = inDrawer ? (cyc - seg*DRAWER_DUR) / DRAWER_DUR : (cyc - DRAWERS*DRAWER_DUR) / TALLY_DUR;

    // drawers
    for (let i=0;i<DRAWERS;i++){
      const dy = cab.y + drawerGap + i*(drawerH + drawerGap) + Math.floor(h*0.08);
      const isActive = (seg === i);

      // open curve: pull -> inspect -> reseal -> stow
      let open = 0;
      if (isActive){
        const tt = segT;
        const pull = ease(tt / 0.18);
        const hold = ease((tt - 0.18) / 0.54);
        const stow = ease((tt - 0.80) / 0.20);
        open = clamp(pull * 1.0 - stow * 1.0, 0, 1);
        open = Math.max(open, hold*0.85);
      }

      const faceX = cab.x + 16;
      const faceY = dy;
      const faceW = cab.w - 32;
      const faceH = drawerH;

      // shadow when open
      if (open > 0.01){
        ctx.save();
        ctx.globalAlpha = 0.18 * open;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        roundedRect(ctx, faceX + 10, faceY + 10, faceW, faceH, 14);
        ctx.fill();
        ctx.restore();
      }

      const pullX = faceX + open * (Math.min(w,h) * 0.055);

      // drawer face
      ctx.save();
      ctx.globalAlpha = isActive ? 0.98 : 0.88;
      roundedRect(ctx, pullX, faceY, faceW, faceH, 14);
      ctx.fillStyle = pal.cab2;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // handle
      ctx.globalAlpha = 0.9;
      const hx = pullX + faceW*0.72;
      const hy = faceY + faceH*0.5;
      ctx.strokeStyle = `rgba(255,255,255,${0.18 + (isActive?0.10:0)})`;
      ctx.lineWidth = Math.max(2, Math.floor(faceH*0.10));
      ctx.beginPath();
      ctx.arc(hx, hy, faceH*0.18, Math.PI*1.15, Math.PI*1.85);
      ctx.stroke();

      // label
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = pal.sub;
      ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(drawers[i].label, pullX + 14, faceY + faceH*0.35);

      // packet strip inside open drawer
      if (open > 0.02){
        const pk = drawers[i].packets;
        const pw = faceW * 0.22;
        const ph = faceH * 0.48;
        const startX = pullX + 14;
        const baseY = faceY + faceH*0.55;
        const gap = Math.max(10, pw*0.10);

        for (let k=0;k<Math.min(4, pk.length);k++){
          const p = pk[k];
          const lift = (k === drawers[i].active) ? ease(clamp((segT - 0.22)/0.35, 0, 1)) * open : 0;
          const tilt = (k === drawers[i].active) ? (Math.sin(t*1.8) * 0.03) * lift : 0;

          const x = startX + k*(pw + gap);
          const y = baseY - ph + (-lift * ph*0.55);

          ctx.save();
          ctx.translate(x + pw*0.5, y + ph*0.5);
          ctx.rotate(tilt);
          ctx.translate(-pw*0.5, -ph*0.5);

          ctx.globalAlpha = 0.92;
          roundedRect(ctx, 0, 0, pw, ph, 10);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${0.10 + lift*0.12})`;
          ctx.lineWidth = 2;
          ctx.stroke();

          // seal/tape
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = p.color;
          ctx.fillRect(pw*0.10, ph*0.18, pw*0.80, Math.max(2, ph*0.10));

          // micro label
          ctx.globalAlpha = 0.82;
          ctx.fillStyle = pal.ink;
          ctx.font = `700 ${Math.max(10, Math.floor(small*0.85))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(p.code, pw*0.10, ph*0.34);
          ctx.globalAlpha = 0.70;
          ctx.fillStyle = pal.sub;
          ctx.font = `600 ${Math.max(10, Math.floor(small*0.82))}px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif`;
          ctx.fillText(p.name, pw*0.10, ph*0.58);

          ctx.restore();
        }

        // reseal shimmer near end
        const reseal = ease(clamp((segT - 0.70)/0.18, 0, 1)) * open;
        if (reseal > 0.02){
          ctx.globalAlpha = 0.12 * reseal;
          ctx.fillStyle = pal.ok;
          ctx.fillRect(pullX, faceY, faceW, faceH);
        }
      }

      ctx.restore();
    }

    ctx.restore();

    // scan flash overlay (drawer transition)
    if (scanFlash > 0.01){
      ctx.save();
      ctx.globalAlpha = scanFlash * 0.12;
      ctx.fillStyle = pal.accent;
      ctx.fillRect(0,0,w,h);
      ctx.restore();
    }

    // gauges / right panel
    drawGauges(ctx);

    // tally / stamp moment
    if (seg === DRAWERS){
      const a = ease(Math.min(1, segT/0.18)) * (0.65 + 0.35*ease(1 - clamp((segT-0.78)/0.22, 0, 1)));
      const cardW = Math.min(w*0.50, 520);
      const cardH = Math.min(h*0.22, 160);
      const x = cab.x + cab.w*0.12;
      const y = cab.y + cab.h*0.38;

      ctx.save();
      ctx.globalAlpha = 0.88 * a;
      roundedRect(ctx, x, y, cardW, cardH, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.globalAlpha = 0.95 * a;
      ctx.fillStyle = pal.ink;
      ctx.font = `900 ${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('END-OF-SHIFT TALLY', x + 16, y + 14);

      const count = 40 + ((seed % 61) | 0);
      ctx.globalAlpha = 0.80 * a;
      ctx.fillStyle = pal.sub;
      ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(`PACKETS CHECKED: ${count}`, x + 16, y + 14 + font + 10);
      ctx.fillText('LOG: SYNCED  •  SEALS: VERIFIED', x + 16, y + 14 + font + 10 + small + 8);

      // stamp
      const s = 1 + (stampFlash*0.08);
      ctx.save();
      ctx.translate(x + cardW - 130, y + cardH - 62);
      ctx.rotate(-0.14);
      ctx.scale(s, s);
      ctx.globalAlpha = (0.65 + stampFlash*0.25) * a;
      ctx.strokeStyle = pal.ok;
      ctx.lineWidth = 3;
      roundedRect(ctx, -70, -22, 140, 44, 10);
      ctx.stroke();
      ctx.fillStyle = pal.ok;
      ctx.globalAlpha = (0.55 + stampFlash*0.25) * a;
      ctx.font = `900 ${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TALLY OK', 0, 0);
      ctx.restore();

      ctx.restore();
    }

    // footer HUD
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = pal.sub;
    ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const mm = Math.floor(cyc / 60);
    const ss = Math.floor(cyc % 60).toString().padStart(2,'0');
    const phase = (seg < DRAWERS) ? `INSPECT ${String(seg+1).padStart(2,'0')}/${String(DRAWERS).padStart(2,'0')}` : 'TALLY';
    ctx.fillText(`PHASE: ${phase}   •   CYCLE: ${mm}:${ss}`, 22, h - 18);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
