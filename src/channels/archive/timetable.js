import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function pick(rand, a){ return a[(rand() * a.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3-2*t); }

function pad2(n){ return String(n).padStart(2,'0'); }
function fmtTime(mins){
  mins = ((mins % (24*60)) + 24*60) % (24*60);
  const hh = (mins / 60) | 0;
  const mm = mins % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

const DESTS = [
  'Richmond', 'Northcote', 'Fitzroy', 'Collingwood', 'Sunbury', 'Werribee',
  'Sandringham', 'Frankston', 'Footscray', 'Glen Waverley', 'Coburg',
  'Hawthorn', 'Brighton', 'Box Hill', 'Ringwood', 'St Kilda',
];

const STATUSES = [
  'ON TIME', 'BOARDING', 'LAST CALL', 'DELAY 3', 'DELAY 6', 'ALL ABOARD', '—'
];

function jitterString(rand, s, p=0.22){
  // split-flap-ish jitter: swap a few chars briefly
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
  let out = '';
  for (let i=0;i<s.length;i++){
    const c = s[i];
    if (c === ':' || c === '-') { out += c; continue; }
    out += (rand() < p) ? alpha[(rand()*alpha.length)|0] : c;
  }
  return out;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  // layout
  let w=0, h=0, dpr=1;
  let t=0;
  let font=16, small=12, mono=14;

  // scenes
  const SCENES = ['page', 'board', 'platform'];
  let sceneIdx = 0;
  let sceneT = 0;
  const SCENE_DUR = 18;

  // generated content
  let pageRows = []; // {time,dest,plat,via}
  let pageTitle = '';

  let boardRows = []; // {time,dest,plat,status,hot}
  let boardScroll = 0;
  let boardRowH = 28;

  let platform = null; // {plat, nextTime, dest, eta}

  // audio
  let ambience = null;
  let flipAcc = 0;
  let flapAcc = 0;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regenPage(){
    const base = ((5 + (rand()*17)|0) * 60) + ((rand()*6)|0)*5;
    const n = 11 + ((rand()*5)|0);
    const plat = 1 + ((rand()*7)|0);
    pageTitle = pick(rand, ['WEEKDAY TIMETABLE', 'EVENING SERVICES', 'WEEKEND EXTRA', 'ALL STOPS', 'LIMITED STOPS']);
    pageRows = [];
    let m = base;
    let last = null;
    for (let i=0;i<n;i++){
      let dest = pick(rand, DESTS);
      if (dest === last) dest = pick(rand, DESTS);
      last = dest;
      const via = rand() < 0.35 ? pick(rand, ['via CITY', 'via LOOP', 'via JUNCTION', 'via RIVER', 'via HILLS']) : '';
      pageRows.push({
        time: fmtTime(m),
        dest,
        plat: String(plat + ((i%3===0 && rand()<0.5)?1:0)),
        via,
      });
      m += 7 + ((rand()*18)|0);
    }
  }

  function mkBoardRow(baseMin){
    const dest = pick(rand, DESTS);
    const plat = 1 + ((rand()*10)|0);
    const status = pick(rand, STATUSES);
    return {
      time: fmtTime(baseMin + (((rand()*16)|0) * 3)),
      dest,
      plat: String(plat),
      status,
      hot: 0.9 + rand()*0.8, // seconds of jitter
    };
  }

  function regenBoard(){
    const nowMin = ((6 + (rand()*16)|0) * 60) + (((rand()*12)|0) * 5);
    boardRows = [];
    for (let i=0;i<10;i++) boardRows.push(mkBoardRow(nowMin + i*6));
    boardScroll = 0;
    flapAcc = 0;
  }

  function regenPlatform(){
    const p = 1 + ((rand()*12)|0);
    const nextMin = ((6 + (rand()*16)|0) * 60) + (((rand()*12)|0) * 5);
    platform = {
      plat: p,
      nextTime: fmtTime(nextMin),
      dest: pick(rand, DESTS),
      eta: 3 + ((rand()*12)|0),
    };
  }

  function onSceneEnter(){
    if (SCENES[sceneIdx] === 'page') regenPage();
    if (SCENES[sceneIdx] === 'board') regenBoard();
    if (SCENES[sceneIdx] === 'platform') regenPlatform();

    // tiny confirmation click
    safeBeep({ freq: 520 + rand()*120, dur: 0.018, gain: 0.010, type: 'square' });
  }

  function init({ width, height, dpr: dprIn }){
    w = width; h = height; dpr = dprIn || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.88));

    boardRowH = Math.max(22, Math.floor(h * 0.055));

    sceneIdx = 0;
    sceneT = 0;

    flipAcc = 0;
    flapAcc = 0;

    onSceneEnter();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    // quiet station room tone
    const n = audio.noiseSource({ type: 'pink', gain: 0.0048 });
    n.start();
    const d = simpleDrone(audio, { root: 55 + rand()*22, detune: 0.7, gain: 0.018 });
    ambience = { stop(){ try{n.stop();}catch{} try{d.stop();}catch{} } };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try{ ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    sceneT += dt;

    if (sceneT >= SCENE_DUR){
      sceneT = sceneT % SCENE_DUR;
      sceneIdx = (sceneIdx + 1) % SCENES.length;
      onSceneEnter();
    }

    const mode = SCENES[sceneIdx];

    // page flip rustle in the last ~1.3s
    if (mode === 'page' && audio.enabled){
      const flipP = clamp((sceneT - (SCENE_DUR - 1.25)) / 1.25, 0, 1);
      if (flipP > 0){
        const rate = lerp(8, 32, flipP);
        flipAcc += dt * rate;
        while (flipAcc >= 1){
          flipAcc -= 1;
          safeBeep({ freq: 1200 + rand()*900, dur: 0.006 + rand()*0.006, gain: 0.0018 + rand()*0.0018, type: 'triangle' });
        }
      } else {
        flipAcc = 0;
      }
    }

    // departures board scrolling + flap clicks on row changes
    if (mode === 'board'){
      const speed = Math.max(16, h * 0.03);
      boardScroll += dt * speed;
      while (boardScroll >= boardRowH){
        boardScroll -= boardRowH;
        // rotate rows
        const nowMin = ((7 + (rand()*15)|0) * 60) + (((rand()*12)|0) * 5);
        boardRows.shift();
        boardRows.push(mkBoardRow(nowMin));

        if (audio.enabled){
          // a quick little split-flap burst
          for (let i=0;i<3;i++) safeBeep({ freq: 520 + i*90 + rand()*40, dur: 0.012, gain: 0.010, type: 'square' });
        }
      }

      for (const r of boardRows){
        if (r.hot > 0) r.hot = Math.max(0, r.hot - dt);
      }
    }

    // platform: countdown tick every second or so
    if (mode === 'platform' && audio.enabled){
      flapAcc += dt;
      if (flapAcc >= 1.05){
        flapAcc = 0;
        safeBeep({ freq: 260 + rand()*60, dur: 0.02, gain: 0.006, type: 'triangle' });
        if (rand() < 0.12) safeBeep({ freq: 820 + rand()*120, dur: 0.01, gain: 0.006, type: 'square' });
      }
    }
  }

  function bg(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);
    const g = ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0, '#05070a');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // subtle diagonal grid
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = '#6cf2ff';
    ctx.lineWidth = 1;
    const step = Math.max(26, Math.floor(Math.min(w,h)/18));
    for (let x=-h; x<w; x+=step){
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function header(ctx, title, subtitle){
    const pad = Math.floor(Math.min(w,h) * 0.06);
    ctx.fillStyle = 'rgba(108,242,255,0.10)';
    ctx.fillRect(pad, pad, w - pad*2, Math.max(54, font*2.4));

    ctx.fillStyle = 'rgba(231,238,246,0.95)';
    ctx.font = `700 ${font}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textBaseline = 'top';
    ctx.fillText(title, pad + font, pad + Math.floor(font*0.45));

    if (subtitle){
      ctx.fillStyle = 'rgba(231,238,246,0.70)';
      ctx.font = `${small}px ui-sans-serif, system-ui, -apple-system`;
      ctx.fillText(subtitle, pad + font, pad + Math.floor(font*1.55));
    }
  }

  function renderPage(ctx){
    header(ctx, 'Railway Timetable ASMR', 'pages • boards • departures');

    const pad = Math.floor(Math.min(w,h) * 0.06);
    const top = pad + Math.max(54, font*2.4) + Math.floor(font*0.9);
    const ph = h - top - pad;
    const pw = Math.min(w - pad*2, Math.floor(ph * 0.78));
    const px = Math.floor((w - pw) * 0.5);
    const py = top;

    const flipP = clamp((sceneT - (SCENE_DUR - 1.25)) / 1.25, 0, 1);
    const fp = ease(flipP);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(px + 14, py + 18, pw, ph);

    // paper
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.fillRect(px, py, pw, ph);

    // margin line
    ctx.strokeStyle = 'rgba(10,12,14,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + pw*0.13, py + ph*0.10);
    ctx.lineTo(px + pw*0.13, py + ph*0.92);
    ctx.stroke();

    // title
    ctx.fillStyle = 'rgba(10,12,14,0.75)';
    ctx.font = `700 ${Math.floor(font*1.05)}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textBaseline = 'top';
    ctx.fillText(pageTitle, px + pw*0.16, py + ph*0.08);

    // columns
    const colY = py + ph*0.17;
    ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(10,12,14,0.55)';
    ctx.fillText('TIME', px + pw*0.18, colY);
    ctx.fillText('DEST', px + pw*0.40, colY);
    ctx.fillText('PL', px + pw*0.84, colY);

    const rowY0 = colY + Math.floor(small*1.8);
    const rowH = Math.max(18, Math.floor(ph * 0.055));

    const hi = (Math.floor(sceneT * 0.55) % Math.max(1, pageRows.length)) | 0;

    // rows
    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    for (let i=0;i<pageRows.length;i++){
      const y = rowY0 + i*rowH;
      if (y > py + ph*0.90) break;

      if (i === hi){
        ctx.fillStyle = 'rgba(108,242,255,0.18)';
        ctx.fillRect(px + pw*0.16, y - rowH*0.15, pw*0.72, rowH*0.92);
      }

      const r = pageRows[i];
      ctx.fillStyle = 'rgba(10,12,14,0.78)';
      ctx.fillText(r.time, px + pw*0.18, y);
      ctx.fillText(r.dest.toUpperCase(), px + pw*0.40, y);
      ctx.fillText(r.plat, px + pw*0.85, y);

      if (r.via){
        ctx.fillStyle = 'rgba(10,12,14,0.42)';
        ctx.font = `${Math.max(10, Math.floor(mono*0.78))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        ctx.fillText(r.via.toUpperCase(), px + pw*0.40, y + Math.floor(mono*0.84));
        ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      }
    }

    // page flip effect: darkening wedge and highlight strip
    if (flipP > 0){
      const wx = px + pw*(0.50 + 0.42*fp);
      const ww = (px + pw) - wx;
      const grad = ctx.createLinearGradient(wx, 0, px + pw, 0);
      grad.addColorStop(0, `rgba(0,0,0,${0.05 + fp*0.18})`);
      grad.addColorStop(1, `rgba(0,0,0,${0.28 + fp*0.52})`);
      ctx.fillStyle = grad;
      ctx.fillRect(wx, py, ww, ph);

      ctx.fillStyle = `rgba(255,255,255,${0.12 + fp*0.18})`;
      ctx.fillRect(wx - 2, py, 3, ph);
    }

    // footer stamp
    ctx.fillStyle = 'rgba(10,12,14,0.35)';
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`EDITION ${(seed % 999).toString().padStart(3,'0')}  •  KEEP LEFT`, px + pw*0.16, py + ph*0.92);
  }

  function renderBoard(ctx){
    header(ctx, 'Railway Timetable ASMR', 'departures board • gentle motion');

    const pad = Math.floor(Math.min(w,h) * 0.06);
    const top = pad + Math.max(54, font*2.4) + Math.floor(font*0.9);

    const bw = Math.floor(w - pad*2);
    const bh = Math.floor(h - top - pad);
    const bx = pad;
    const by = top;

    // frame
    ctx.fillStyle = 'rgba(8,10,12,0.92)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(108,242,255,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx+1, by+1, bw-2, bh-2);

    // header strip
    ctx.fillStyle = 'rgba(108,242,255,0.10)';
    ctx.fillRect(bx, by, bw, Math.floor(boardRowH*1.05));

    ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(231,238,246,0.80)';
    const hy = by + Math.floor(boardRowH*0.32);
    ctx.fillText('TIME', bx + bw*0.06, hy);
    ctx.fillText('DESTINATION', bx + bw*0.22, hy);
    ctx.fillText('PL', bx + bw*0.74, hy);
    ctx.fillText('STATUS', bx + bw*0.82, hy);

    // rows
    const startY = by + Math.floor(boardRowH*1.2);
    const visible = Math.floor((bh - boardRowH*1.2) / boardRowH);

    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    for (let i=0;i<Math.min(visible+1, boardRows.length);i++){
      const r = boardRows[i];
      const y = startY + i*boardRowH - boardScroll;
      const alt = i % 2;
      ctx.fillStyle = alt ? 'rgba(231,238,246,0.03)' : 'rgba(231,238,246,0.015)';
      ctx.fillRect(bx, y, bw, boardRowH);

      const hot = clamp(r.hot, 0, 1);
      const j = hot > 0 ? (0.10 + hot*0.35) : 0;

      ctx.fillStyle = 'rgba(231,238,246,0.85)';
      const time = (j>0) ? jitterString(rand, r.time, j*0.35) : r.time;
      const dest = (j>0) ? jitterString(rand, r.dest.toUpperCase().padEnd(14,' '), j*0.22) : r.dest.toUpperCase();
      const stat = (j>0) ? jitterString(rand, r.status.padEnd(8,' '), j*0.28) : r.status;

      ctx.fillText(time, bx + bw*0.06, y + Math.floor(boardRowH*0.22));
      ctx.fillText(dest, bx + bw*0.22, y + Math.floor(boardRowH*0.22));
      ctx.fillText(r.plat, bx + bw*0.74, y + Math.floor(boardRowH*0.22));
      ctx.fillText(stat, bx + bw*0.82, y + Math.floor(boardRowH*0.22));

      if (rand() < 0.01 && audio.enabled){
        // occasional soft click, like relays
        safeBeep({ freq: 420 + rand()*120, dur: 0.008, gain: 0.006, type: 'square' });
      }
    }

    // glow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#6cf2ff';
    ctx.fillRect(bx, by + bh - 2, bw, 2);
    ctx.globalAlpha = 1;
  }

  function renderPlatform(ctx){
    header(ctx, 'Railway Timetable ASMR', 'platform sign • quiet countdown');

    const pad = Math.floor(Math.min(w,h) * 0.06);
    const top = pad + Math.max(54, font*2.4) + Math.floor(font*0.9);

    const cx = w * 0.5;
    const signW = Math.floor(w * 0.78);
    const signH = Math.floor(h * 0.42);
    const sx = Math.floor(cx - signW/2);
    const sy = Math.floor(top + (h - top - pad - signH) * 0.22);

    // sign body
    ctx.fillStyle = 'rgba(12,14,16,0.95)';
    ctx.fillRect(sx, sy, signW, signH);
    ctx.strokeStyle = 'rgba(231,238,246,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx+1, sy+1, signW-2, signH-2);

    // inner panel
    ctx.fillStyle = 'rgba(108,242,255,0.08)';
    ctx.fillRect(sx + 10, sy + 10, signW - 20, signH - 20);

    const flick = 0.78 + 0.22 * (0.5 + 0.5*Math.sin(t*2.1 + seed*0.001));

    ctx.font = `800 ${Math.floor(font*1.6)}px ui-sans-serif, system-ui, -apple-system`;
    ctx.fillStyle = `rgba(231,238,246,${0.92*flick})`;
    ctx.textBaseline = 'top';
    ctx.fillText(`PLATFORM ${platform?.plat ?? 2}`, sx + signW*0.08, sy + signH*0.16);

    ctx.font = `700 ${Math.floor(font*1.35)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = `rgba(255, 215, 120, ${0.88*flick})`;
    ctx.fillText(`${platform?.nextTime ?? '—:—'}  ${String(platform?.dest ?? '—').toUpperCase()}`, sx + signW*0.08, sy + signH*0.40);

    const eta = platform?.eta ?? 7;
    const down = Math.max(0, Math.floor(eta - (sceneT * 0.35)));
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = `rgba(231,238,246,${0.70*flick})`;
    ctx.fillText(`DEPARTS IN ~${pad2(down)} MIN   •   PLEASE STAND CLEAR`, sx + signW*0.08, sy + signH*0.68);

    // little scanning bar
    const barY = sy + signH*0.86;
    const p = (t*0.10) % 1;
    const bx = sx + signW*0.08 + (signW*0.84)*p;
    ctx.fillStyle = 'rgba(108,242,255,0.35)';
    ctx.fillRect(bx - 18, barY, 36, 2);
  }

  function render(ctx){
    bg(ctx);
    const mode = SCENES[sceneIdx];
    if (mode === 'page') renderPage(ctx);
    else if (mode === 'board') renderBoard(ctx);
    else renderPlatform(ctx);

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.45, Math.min(w,h)*0.15, w*0.5, h*0.45, Math.max(w,h)*0.68);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
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
