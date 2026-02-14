// REVIEWED: 2026-02-14
import { mulberry32 } from '../util/prng.js';

const WORDS = [
  'platypus','meteor','quantum','mushroom','satellite','fudge','hologram','sausage','tornado','waffle',
  'dolphin','caffeine','robot','cabbage','penguin','volcano','biscuit','mystery','dungeon','laser',
  'unicorn','traffic','anomaly','banana','pancake','spacetime','librarian','wizard','sock','chimera',
];

const LOGO_W = 150;
const LOGO_H = 54;

function fitEllipsis(ctx, text, maxW){
  if (!text) return '';
  if (ctx.measureText(text).width <= maxW) return text;
  const ell = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi){
    const mid = ((lo + hi) / 2) | 0;
    const s = text.slice(0, mid) + ell;
    if (ctx.measureText(s).width <= maxW) lo = mid + 1;
    else hi = mid;
  }
  const cut = Math.max(0, lo - 1);
  return text.slice(0, cut) + ell;
}

function wrapLines(ctx, text, maxW, maxLines=2){
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines = [];
  let cur = '';

  for (const word of words){
    // On the last line, keep accumulating and ellipsize at the end.
    if (lines.length === maxLines - 1){
      cur = cur ? `${cur} ${word}` : word;
      continue;
    }

    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width <= maxW || !cur) cur = test;
    else {
      lines.push(cur);
      cur = word;
    }
  }

  lines.push(cur);

  for (let i = 0; i < lines.length; i++){
    if (ctx.measureText(lines[i]).width > maxW) lines[i] = fitEllipsis(ctx, lines[i], maxW);
  }

  return lines.slice(0, maxLines);
}

function headline(rand){
  const w = (n)=>WORDS[(rand()*WORDS.length)|0];
  const caps=(s)=>s.charAt(0).toUpperCase()+s.slice(1);
  const a = caps(w());
  const b = w();
  const c = w();
  const forms = [
    `${a} spotted near ${b} festival; experts baffled`,
    `${a} economy enters ${b}-${c} phase`,
    `Local ${b} reveals surprising ${c} workaround`,
    `${a} declares "${b}"; markets respond with ${c}`,
    `BREAKING: ${a} causes mild ${b} incident, ${c} deployed`,
  ];
  return forms[(rand()*forms.length)|0];
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  const specialRand = mulberry32(seed ^ 0x9e3779b9);
  let w=0,h=0,t=0;
  let tickerX=0;
  let headlines=[];
  let tickerText='';
  let tickerWidth=0;
  let logo = {x:40,y:40,vx:120,vy:90};
  let murmur=null;

  // Special moments (rare deterministic broadcast flourishes).
  // Planned at init so captures are deterministic at fixed offsets.
  let specialPlan = []; // { at:number (s), kind:'breaking'|'field' }
  let nextSpecial = null;
  let special = null; // { kind, t0, dur, title, body }

  function rebuildTickerCache(){
    // Update only when headlines rotate or when size changes (avoid per-frame join/width churn).
    tickerText = headlines.join('  •  ');
    const fontPx = Math.floor(h/26); // matches render() ticker font
    const approxCharW = fontPx * 0.62; // monospace-ish; good enough for wrap/reset
    tickerWidth = Math.ceil(tickerText.length * approxCharW);
  }

  function init({width,height}){
    w=width; h=height; t=0;
    headlines = Array.from({length: 18}, () => headline(rand));
    rebuildTickerCache();
    tickerX = w;
    logo = {x:w*0.2,y:h*0.25,vx: 160+rand()*100, vy: 120+rand()*80};

    // Plan 1–2 rare deterministic moments in the first ~45–120s window.
    special = null;
    specialPlan = [];

    const at1 = 45 + specialRand() * 75;
    const kind1 = specialRand() < 0.6 ? 'breaking' : 'field';
    specialPlan.push({ at: at1, kind: kind1 });

    if (specialRand() < 0.4){
      const minAt2 = at1 + 18 + specialRand() * 32;
      const at2 = Math.min(120, Math.max(55, minAt2));
      const kind2 = kind1 === 'breaking' ? 'field' : 'breaking';
      specialPlan.push({ at: at2, kind: kind2 });
    }

    specialPlan.sort((a, b) => a.at - b.at);
    nextSpecial = specialPlan.shift() || null;
  }

  function onResize(width,height){
    w=width; h=height;
    rebuildTickerCache();
    tickerX = Math.min(tickerX, w);
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // idempotent: stop any existing handles we own first
    onAudioOff();

    const n = audio.noiseSource({ type: 'brown', gain: 0.02 });
    n.start();

    murmur = {
      stop(){
        try { n.stop(); } catch {}
      }
    };

    audio.setCurrent(murmur);
  }

  function onAudioOff(){
    try { murmur?.stop?.(); } catch {}

    // only clear AudioManager.current if we own it
    if (audio.current === murmur) audio.current = null;

    murmur = null;
  }

  function destroy(){ onAudioOff(); }

  function startSpecial(at, kind){
    const stripBreaking = (s) => String(s).replace(/^\s*BREAKING:\s*/i, '').trim();

    if (kind === 'breaking'){
      special = {
        kind,
        t0: at,
        dur: 9.5,
        title: 'BREAKING',
        body: stripBreaking(headline(specialRand)),
      };
      if (audio.enabled) audio.beep({ freq: 740, dur: 0.06, gain: 0.05, type: 'square' });
      if (audio.enabled) audio.beep({ freq: 520, dur: 0.08, gain: 0.04, type: 'triangle' });
    } else {
      const subj = WORDS[(specialRand() * WORDS.length) | 0];
      special = {
        kind,
        t0: at,
        dur: 10.5,
        title: 'FIELD REPORT',
        body: `${subj.toUpperCase()} UPDATE: ${stripBreaking(headline(specialRand))}`,
      };
      if (audio.enabled) audio.beep({ freq: 330, dur: 0.06, gain: 0.05, type: 'sine' });
      if (audio.enabled) audio.beep({ freq: 660, dur: 0.05, gain: 0.04, type: 'sine' });
    }
  }

  function update(dt){
    t += dt;

    // Trigger a planned special moment exactly at its scheduled time.
    if (!special && nextSpecial && t >= nextSpecial.at){
      startSpecial(nextSpecial.at, nextSpecial.kind);
      nextSpecial = specialPlan.shift() || null;
    }

    if (special && t - special.t0 >= special.dur){
      special = null;
    }
    tickerX -= dt*(140 + (w/12));
    if (tickerX < -tickerWidth){
      tickerX = w;
      // rotate headlines
      headlines.shift();
      headlines.push(headline(rand));
      rebuildTickerCache();
      if (audio.enabled) audio.beep({freq: 520, dur: 0.04, gain: 0.04, type:'triangle'});
    }

    // logo bounce (OSD-safe: don't collide with the top-left LIVE/time bug)
    logo.x += logo.vx*dt;
    logo.y += logo.vy*dt;

    const pad = 18;
    const leftBound = pad;
    const rightBound = w - pad - LOGO_W;
    const topBound = pad;
    const bottomBound = h*0.65 - LOGO_H;

    if (logo.x < leftBound || logo.x > rightBound) logo.vx *= -1;
    if (logo.y < topBound || logo.y > bottomBound) logo.vy *= -1;

    // Reserve a safe rectangle around the LIVE bug.
    const bugFont = Math.floor(h/32);
    const safeX = w*0.05 - 12;
    const safeY = h*0.12 - bugFont - 14;
    const safeW = Math.max(220, w*0.28);
    const safeH = bugFont + 22;

    const overlapsBug = (
      logo.x < safeX + safeW && logo.x + LOGO_W > safeX &&
      logo.y < safeY + safeH && logo.y + LOGO_H > safeY
    );

    if (overlapsBug){
      const overlapX = Math.min(logo.x + LOGO_W - safeX, safeX + safeW - logo.x);
      const overlapY = Math.min(logo.y + LOGO_H - safeY, safeY + safeH - logo.y);

      if (overlapX < overlapY){
        logo.x += (logo.x + LOGO_W/2 < safeX + safeW/2) ? -(overlapX + 1) : (overlapX + 1);
        logo.vx *= -1;
      } else {
        logo.y += (logo.y + LOGO_H/2 < safeY + safeH/2) ? -(overlapY + 1) : (overlapY + 1);
        logo.vy *= -1;
      }
    }

    // Final clamp (after possible bug-avoidance nudge).
    logo.x = Math.max(leftBound, Math.min(rightBound, logo.x));
    logo.y = Math.max(topBound, Math.min(bottomBound, logo.y));
  }

  // ticker width/text are cached via rebuildTickerCache()

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // studio background
    const bg = ctx.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,'#0a0e18');
    bg.addColorStop(1,'#07141a');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,w,h);

    // diagonal shapes
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#1f2b55';
    ctx.beginPath();
    ctx.moveTo(0,h*0.15);
    ctx.lineTo(w*0.75,0);
    ctx.lineTo(w,0);
    ctx.lineTo(w,h*0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a1747';
    ctx.beginPath();
    ctx.moveTo(0,h*0.55);
    ctx.lineTo(w,h*0.25);
    ctx.lineTo(w,h*0.65);
    ctx.lineTo(0,h*0.85);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // "live" bug
    ctx.save();
    ctx.fillStyle = 'rgba(255,75,216,0.85)';
    ctx.font = `${Math.floor(h/32)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('LIVE', w*0.05, h*0.12);
    ctx.fillStyle = 'rgba(231,238,246,0.8)';
    ctx.fillText(new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), w*0.12, h*0.12);
    ctx.restore();

    // bouncing logo
    ctx.save();
    ctx.translate(logo.x, logo.y);
    ctx.rotate(Math.sin(t*0.8)*0.06);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(6,6,150,54);
    ctx.fillStyle = 'rgba(108,242,255,0.92)';
    ctx.fillRect(0,0,150,54);
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.font = `${Math.floor(h/28)}px ui-sans-serif, system-ui`;
    ctx.fillText('ODD NEWS', 14, 36);
    ctx.restore();

    // anchor text
    ctx.save();
    const headlineX = w*0.05;
    const headlineY = h*0.48;
    const headlineMaxW = w*0.90;
    const headlinePx = Math.floor(h/16);

    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.font = `${headlinePx}px ui-serif, Georgia, serif`;

    // Wrap (2 lines) + ellipsize so long strings don't clip off-screen at smaller resolutions.
    const headLines = wrapLines(ctx, headlines[0], headlineMaxW, 2);
    const lineH = Math.floor(headlinePx * 1.12);
    for (let i = 0; i < headLines.length; i++){
      ctx.fillText(headLines[i], headlineX, headlineY + i*lineH);
    }

    const subPx = Math.floor(h/24);
    ctx.fillStyle = 'rgba(231,238,246,0.65)';
    ctx.font = `${subPx}px ui-sans-serif, system-ui`;
    ctx.fillText(
      'More on this story as the situation becomes increasingly narratable.',
      headlineX,
      headlineY + headLines.length*lineH + Math.floor(subPx*0.9)
    );
    ctx.restore();

    // special moments overlay (OSD-safe placement)
    if (special){
      const age = t - special.t0;
      if (age >= 0 && age <= special.dur){
        const fadeIn = 0.7;
        const fadeOut = 0.9;
        const fade = Math.max(0, Math.min(1, age / fadeIn, (special.dur - age) / fadeOut));

        if (fade > 0){
          const easeOut = (p) => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);
          const pulse = 0.5 + 0.5 * Math.sin(age * 10);

          // quick broadcast flash
          ctx.save();
          ctx.globalAlpha = fade * 0.08 * pulse;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.restore();

          if (special.kind === 'breaking'){
            const bw = w * 0.84;
            const bh = Math.max(56, h * 0.12);
            const bx = (w - bw) / 2;
            const by = h * 0.18;

            ctx.save();
            ctx.globalAlpha = fade;

            const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
            g.addColorStop(0, 'rgba(255,38,76,0.92)');
            g.addColorStop(1, 'rgba(196,0,60,0.92)');
            ctx.fillStyle = g;
            ctx.fillRect(bx, by, bw, bh);

            // border
            ctx.strokeStyle = 'rgba(255,255,255,0.65)';
            ctx.lineWidth = 2;
            ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);

            // label block
            const tagW = Math.max(160, bw * 0.22);
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(bx, by, tagW, bh);

            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = `${Math.floor(h/22)}px ui-sans-serif, system-ui`;
            ctx.fillText(special.title, bx + 18, by + bh * 0.66);

            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.font = `${Math.floor(h/28)}px ui-sans-serif, system-ui`;
            const msg = fitEllipsis(ctx, special.body, bw - tagW - 36);
            ctx.fillText(msg, bx + tagW + 18, by + bh * 0.66);

            // strobe stripe
            ctx.globalAlpha = fade * (0.35 + 0.35 * pulse);
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(bx, by + bh - 6, bw, 6);

            ctx.restore();
          } else {
            const barH = Math.floor(h * 0.12);
            const bh = Math.max(54, h * 0.105);
            const bw = w * 0.86;
            const margin = (w - bw) / 2;
            const y = h - barH - bh - Math.max(14, h * 0.04);

            const inDur = 0.7;
            const outDur = 0.8;
            let x = margin;
            if (age < inDur){
              x = (-bw) + (margin + bw) * easeOut(age / inDur);
            } else if (age > special.dur - outDur){
              const p = (age - (special.dur - outDur)) / outDur;
              x = margin + (w + bw - margin) * easeOut(p);
            }

            ctx.save();
            ctx.globalAlpha = fade;

            ctx.fillStyle = 'rgba(0,0,0,0.62)';
            ctx.fillRect(x, y, bw, bh);
            ctx.fillStyle = 'rgba(108,242,255,0.85)';
            ctx.fillRect(x, y, bw, 3);

            const tagW = Math.max(190, bw * 0.28);
            ctx.fillStyle = 'rgba(108,242,255,0.18)';
            ctx.fillRect(x, y, tagW, bh);

            ctx.fillStyle = 'rgba(231,238,246,0.94)';
            ctx.font = `${Math.floor(h/26)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
            ctx.fillText(special.title, x + 16, y + bh * 0.68);

            ctx.fillStyle = 'rgba(231,238,246,0.88)';
            ctx.font = `${Math.floor(h/30)}px ui-sans-serif, system-ui`;
            const msg = fitEllipsis(ctx, special.body, bw - tagW - 32);
            ctx.fillText(msg, x + tagW + 14, y + bh * 0.68);

            ctx.restore();
          }
        }
      }
    }

    // ticker bar
    const barH = Math.floor(h*0.12);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0,h-barH,w,barH);
    ctx.fillStyle = 'rgba(108,242,255,0.9)';
    ctx.fillRect(0,h-barH, w, 3);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0,h-barH,w,barH);
    ctx.clip();
    ctx.font = `${Math.floor(h/26)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.fillText(tickerText, tickerX, h - barH/2 + 10);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
