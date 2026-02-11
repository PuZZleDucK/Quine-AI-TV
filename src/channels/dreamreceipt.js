// REVIEWED: 2026-02-11 (screenshots: screenshots/review-dreamreceipt)
import { mulberry32, clamp } from '../util/prng.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function money(x){
  const v = Math.max(0, x);
  return `$${v.toFixed(2)}`;
}

export function createChannel({ seed, audio }){
  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // loop
  let loopDur = 30;
  let loopT = 0;
  let receiptNo = 1;

  // layout
  let s = 1;
  let cx = 0;
  let slotY = 0;
  let paperW = 0;
  let paperMaxH = 0;
  let lineH = 16;
  let margin = 18;

  // receipt content
  let lines = []; // {y, left, right, kind}
  let paperH = 0;
  let specks = []; // {x,y,a}

  // moments
  let glitch = { t0: 0, dur: 0, y0: 0, y1: 0 };
  let coupon = { t0: 0, dur: 0, text: '', seed: 0 };

  // audio
  let ambience = null;
  let printAcc = 0;
  let lastPrintRow = -1;


  // gradients (cached; rebuilt on init/resize or ctx swap)
  let gradCtx = null;
  let gradKey = '';
  let gCounter = null;
  let gVignette = null;
  let gPrinterBody = null;
  let gPaper = null;

  function invalidateGradients(){
    gradCtx = null;
    gradKey = '';
    gCounter = null;
    gVignette = null;
    gPrinterBody = null;
    gPaper = null;
  }

  function ensureGradients(ctx){
    const key = `${w}|${h}|${s}|${cx}|${slotY}|${paperW}`;
    if (ctx === gradCtx && key === gradKey && gCounter && gVignette && gPrinterBody && gPaper) return;

    gradCtx = ctx;
    gradKey = key;

    // counter background gradient
    const cg = ctx.createLinearGradient(0, 0, 0, h);
    cg.addColorStop(0, '#12161c');
    cg.addColorStop(0.55, '#0e1014');
    cg.addColorStop(1, '#050608');
    gCounter = cg;

    // vignette gradient
    const vg = ctx.createRadialGradient(cx, h * 0.42, s * 0.08, cx, h * 0.5, s * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    gVignette = vg;

    // printer body gradient
    const bodyH = Math.floor(s * 0.18);
    const y = Math.floor(slotY - bodyH * 0.55);
    const pg = ctx.createLinearGradient(0, y, 0, y + bodyH);
    pg.addColorStop(0, '#2a2f38');
    pg.addColorStop(1, '#151922');
    gPrinterBody = pg;

    // paper overlay (world-space; avoids per-frame gradient rebuild as paper extends)
    const pap = ctx.createLinearGradient(0, 0, 0, h);
    pap.addColorStop(0, 'rgba(255,255,255,0.55)');
    pap.addColorStop(1, 'rgba(0,0,0,0.08)');
    gPaper = pap;
  }

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function mkReceipt(prng){
    const headerA = ['DREAM MART', 'SUBLUNAR GROCER', 'MIRAGE SUPPLY CO.', 'LUCID DELI', 'THE SOFTWARE STORE'];
    const headerB = ['NIGHT SHIFT', 'AFTER HOURS', 'OPEN IN THEORY', 'EST. SOMEDAY', 'NOW SERVING: YOU'];

    const nouns = ['MOONBEAM', 'ECHO', 'VELVET', 'STATIC', 'ORCHID', 'GLASS', 'COMET', 'TEA', 'SAND', 'VHS', 'BREAD', 'NEON', 'SPARE KEY', 'TINY SUN'];
    const mods = ['WARM', 'HOLLOW', 'GENTLE', 'UNFINISHED', 'POLITE', 'HAUNTED', 'PORTABLE', 'MINT', 'SLEEPY', 'UNDECLARED', 'UNRELIABLE'];
    const units = ['EA', 'PK', 'SET', 'BAG', 'TUBE', 'ROLL', 'BOX', 'JAR'];

    const jokeTail = ['(DO NOT WAKE)', '(FRAGILE VIBES)', '(TAX EXEMPT: FEELINGS)', '(NON-EUCLIDEAN)', '(OKAY??)'];

    function pick(arr){ return arr[(prng() * arr.length) | 0]; }

    const itemCount = 7 + ((prng() * 5) | 0);
    const rows = [];
    let subtotal = 0;

    for (let i = 0; i < itemCount; i++){
      const name = `${pick(mods)} ${pick(nouns)}`;
      const u = pick(units);
      const qty = 1 + ((prng() * 3) | 0);
      const base = (prng() * 18 + 1.25);
      let price = Math.round(base * 100) / 100;
      if (i === ((itemCount * 0.55) | 0) && prng() < 0.35){
        // one surreal discount line
        price = 0;
      }
      subtotal += price * qty;
      const left = `${String(qty).padStart(2,' ')} ${u}  ${name}`;
      const right = money(price * qty);
      rows.push({ left, right, kind: 'item' });

      if (prng() < 0.12){
        rows.push({ left: `   NOTE: ${pick(jokeTail).replace(/[()]/g,'')}`, right: '', kind: 'note' });
      }
    }

    const weirdFee = prng() < 0.6 ? Math.round((prng() * 2.2) * 100) / 100 : 0;
    const tax = Math.round((subtotal * (0.07 + prng() * 0.04)) * 100) / 100;
    const total = subtotal + tax + weirdFee;

    const hdr = `${pick(headerA)}  #${String(receiptNo).padStart(3,'0')}`;
    const meta = `${pick(headerB)}   ${String(100000 + ((prng() * 899999) | 0)).slice(-6)}`;

    const out = [];
    out.push({ left: hdr, right: '', kind: 'hdr' });
    out.push({ left: meta, right: '', kind: 'hdr2' });
    out.push({ left: '-------------------------------', right: '', kind: 'rule' });
    out.push(...rows);
    out.push({ left: '-------------------------------', right: '', kind: 'rule' });

    const st = prng() < 0.5 ? 'SUBTOTAL (UNREAL)' : 'SUBTOTAL';
    out.push({ left: st, right: money(subtotal), kind: 'sum' });
    out.push({ left: 'DREAM TAX', right: money(tax), kind: 'sum' });
    if (weirdFee > 0) out.push({ left: 'SOFT FEE (JUST VIBES)', right: money(weirdFee), kind: 'sum' });
    out.push({ left: 'TOTAL', right: money(total), kind: 'total' });
    out.push({ left: '', right: '', kind: 'blank' });

    // coupon is printed on-receipt (text filled in later during regen)
    out.push({ left: '----- COUPON -----', right: '', kind: 'coupon_hdr' });
    out.push({ left: '', right: '', kind: 'coupon' });
    out.push({ left: '-------------------------------', right: '', kind: 'rule' });

    out.push({ left: '', right: '', kind: 'blank' });
    out.push({ left: 'PAYMENT: ???', right: '', kind: 'foot' });
    out.push({ left: 'THANK YOU FOR SHOPPING IN A DREAM', right: '', kind: 'foot2' });

    // barcode row placeholder
    out.push({ left: '', right: '', kind: 'barcode' });

    return out;
  }

  function regen(){
    const prng = mulberry32((seed ^ (receiptNo * 2654435761)) >>> 0);

    s = Math.min(w, h);
    cx = w * 0.5;
    slotY = h * 0.18;
    paperW = Math.floor(s * 0.56);
    paperMaxH = Math.floor(s * 0.86);
    lineH = Math.max(14, Math.floor(s * 0.026));
    margin = Math.max(16, Math.floor(s * 0.032));
    const raw = mkReceipt(prng);

    // coupon content is chosen *after* receipt generation so it doesn't perturb item content
    const couponJ = prng();
    const couponText = (prng() < 0.5) ? 'COUPON: 10% OFF REALITY' : 'COUPON: FREE EXTRA MEANING';
    const couponSeed = (prng() * 1e9) | 0;

    lines = [];
    let y = 0;
    for (const r of raw){
      lines.push({
        y,
        left: (r.kind === 'coupon') ? couponText : r.left,
        right: r.right,
        kind: r.kind,
      });
      y += (r.kind === 'blank') ? Math.floor(lineH * 0.75) : lineH;
      if (r.kind === 'barcode') y += Math.floor(lineH * 1.25);
    }

    paperH = clamp(y + margin * 1.6, Math.floor(s * 0.55), paperMaxH);

    // paper specks (fixed per receipt; small, cheap)
    specks = Array.from({ length: 140 }, () => ({
      x: prng(),
      y: prng(),
      a: 0.02 + prng() * 0.08,
    }));

    // special moments (timed within print)
    glitch = {
      t0: 9.4 + prng() * 3.0,
      dur: 1.1 + prng() * 0.55,
      y0: 0,
      y1: 0,
    };
    // coupon moment: align the cue to when the coupon line reaches the print head
    const printStart = 0.7;
    const printDur = 18.0;
    const couponRow = lines.find((r) => r.kind === 'coupon');
    const couponY = couponRow ? couponRow.y : Math.floor(paperH * 0.65);

    coupon = {
      t0: printStart + printDur * clamp((couponY + lineH * 0.2) / paperH, 0, 1) + couponJ * 0.25,
      dur: 1.15,
      text: couponText,
      seed: couponSeed,
    };

    lastPrintRow = -1;
    printAcc = 0;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    t = 0;
    loopT = 0;
    receiptNo = 1;
    regen();
    invalidateGradients();
  }

  function onResize(width, height, dprIn){
    // keep receiptNo/loopT; just recompute layout
    w = width;
    h = height;
    dpr = dprIn || 1;
    regen();
    invalidateGradients();
  }

  function stopAmbience({ clearCurrent = false } = {}){
    const handle = ambience;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // Clears audio.current and stops via handle.stop().
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ambience = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive: if onAudioOn is called repeatedly while audio is enabled,
    // ensure we don't stack/overlap our own ambience.
    stopAmbience({ clearCurrent: true });

    // quiet shop hum
    const n = audio.noiseSource({ type: 'pink', gain: 0.0022 });
    n.start();

    const handle = { stop(){ try{ n.stop(); } catch {} } };
    ambience = handle;
    audio.setCurrent(handle);
  }

  function onAudioOff(){
    // Stop our ambience and clear AudioManager.current only if we own it.
    stopAmbience({ clearCurrent: true });
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    loopT += dt;

    // phase timings (keep in sync with drawPaper)
    const printStart = 0.7;
    const printDur = 18.0;
    const tearT0 = printStart + printDur + 4.8; // longer post-print pause
    const tearDur = 0.9;

    const pPrint = clamp((loopT - printStart) / printDur, 0, 1);

    // audio ticks: while printing, emit soft clicks per row
    if (audio.enabled && pPrint > 0 && pPrint < 1){
      printAcc += dt * 9.5;
      while (printAcc >= 1){
        printAcc -= 1;
        safeBeep({ freq: 2400, dur: 0.006, gain: 0.0013, type: 'square' });
      }

      const printedLen = Math.floor(pPrint * paperH);
      const row = Math.floor(printedLen / lineH);
      if (row !== lastPrintRow){
        lastPrintRow = row;
        // tiny step-beep when a new line starts
        safeBeep({ freq: 780 + (row % 5) * 40, dur: 0.01, gain: 0.0028, type: 'triangle' });
      }
    } else {
      printAcc = 0;
    }

    // coupon moment beep
    const pCoupon = clamp((loopT - coupon.t0) / 0.14, 0, 1);
    if (pCoupon > 0 && pCoupon < 1 && audio.enabled){
      // once, when it begins
      if (!coupon._beeped){
        coupon._beeped = true;
        safeBeep({ freq: 1040, dur: 0.05, gain: 0.012, type: 'square' });
      }
    }
    if (loopT < coupon.t0 - 0.2) coupon._beeped = false;

    if (loopT >= loopDur){
      loopT = loopT % loopDur;
      receiptNo++;
      regen();
      // a small “tear” chirp if audio is on
      if (audio.enabled) safeBeep({ freq: 520, dur: 0.03, gain: 0.01, type: 'square' });
    }
  }

  function drawBackground(ctx){
    // dark, cozy counter
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, w, h);

    ensureGradients(ctx);
    ctx.fillStyle = gCounter;
    ctx.fillRect(0, 0, w, h);

    // subtle scan shimmer
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#89b7ff';
    const yy = (slotY + Math.sin(t * 0.6) * 18);
    ctx.fillRect(0, yy, w, 2);
    ctx.restore();

    // vignette
    ctx.fillStyle = gVignette;
    ctx.fillRect(0, 0, w, h);
  }

  function roundRect(ctx, x, y, rw, rh, r){
    const rr = Math.min(r, rw * 0.5, rh * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + rw, y, x + rw, y + rh, rr);
    ctx.arcTo(x + rw, y + rh, x, y + rh, rr);
    ctx.arcTo(x, y + rh, x, y, rr);
    ctx.arcTo(x, y, x + rw, y, rr);
    ctx.closePath();
  }

  function drawPrinter(ctx){
    const bodyW = Math.floor(paperW * 1.2);
    const bodyH = Math.floor(s * 0.18);
    const x = Math.floor(cx - bodyW * 0.5);
    const y = Math.floor(slotY - bodyH * 0.55);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    roundRect(ctx, x + 8, y + 10, bodyW, bodyH, 18);
    ctx.fill();
    ctx.restore();

    // body
    ensureGradients(ctx);
    ctx.fillStyle = gPrinterBody;
    roundRect(ctx, x, y, bodyW, bodyH, 18);
    ctx.fill();

    // slot
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#0a0b0e';
    const slotW = Math.floor(paperW * 0.88);
    const slotH = Math.max(10, Math.floor(s * 0.02));
    const sx = Math.floor(cx - slotW * 0.5);
    const sy = Math.floor(slotY - slotH * 0.5);
    roundRect(ctx, sx, sy, slotW, slotH, slotH * 0.5);
    ctx.fill();
    ctx.restore();

    // LED + button
    ctx.save();
    const ledX = x + bodyW - Math.floor(bodyW * 0.16);
    const ledY = y + Math.floor(bodyH * 0.25);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(120,255,190,0.85)';
    ctx.beginPath();
    ctx.arc(ledX, ledY, Math.max(3, Math.floor(s * 0.008)), 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#cfd6e4';
    roundRect(ctx, ledX - 22, ledY + 14, 42, 16, 8);
    ctx.fill();
    ctx.restore();

    // title
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#c7d2ff';
    ctx.font = `${Math.max(11, Math.floor(s / 44))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText('THERMAL DREAMPRINT 2000', x + 18, y + bodyH - 14);
    ctx.restore();
  }

  function drawPaper(ctx){
    const printStart = 0.7;
    const printDur = 18.0;
    const tearT0 = printStart + printDur + 4.8; // longer post-print pause
    const tearDur = 0.9;
    const fallT0 = tearT0 + tearDur + 0.15;
    const fallDur = 3.2;

    const pPrint = clamp((loopT - printStart) / printDur, 0, 1);
    const printedLen = Math.floor(pPrint * paperH);

    const pCoupon = clamp((loopT - coupon.t0) / coupon.dur, 0, 1);
    const couponFlash = (pCoupon > 0 && pCoupon < 1) ? (1 - Math.abs(pCoupon * 2 - 1)) : 0;

    const pTear = clamp((loopT - tearT0) / tearDur, 0, 1);
    const hang = ease(pTear);

    const pFall = clamp((loopT - fallT0) / fallDur, 0, 1);
    const fall = pFall * pFall; // ease-in quad

    const fallDist = (h - slotY) + paperH + s * 0.25;

    const x0 = Math.floor(cx - paperW * 0.5);
    const y0 = Math.floor(slotY + 2 + hang * (s * 0.08) + fall * fallDist);
    const ph = Math.floor(lerp(12, paperH, pPrint));

    // paper shadow
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    roundRect(ctx, x0 + 7, y0 + 10, paperW, ph, 10);
    ctx.fill();
    ctx.restore();

    // paper body
    ctx.save();
    ctx.fillStyle = '#f6f2e6';
    roundRect(ctx, x0, y0, paperW, ph, 10);
    ctx.fill();

    // subtle paper gradient
    ensureGradients(ctx);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = gPaper;
    roundRect(ctx, x0, y0, paperW, ph, 10);
    ctx.fill();
    ctx.globalAlpha = 1;

    // specks
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#2b2b2b';
    for (const sp of specks){
      const xx = x0 + sp.x * paperW;
      const yy = y0 + sp.y * ph;
      ctx.globalAlpha = sp.a;
      ctx.fillRect(xx, yy, 1, 1);
    }
    ctx.restore();

    // clip to paper
    ctx.save();
    roundRect(ctx, x0, y0, paperW, ph, 10);
    ctx.clip();

    // text
    const padX = 18;
    const tx = x0 + padX;
    const ty = y0 + margin;

    ctx.font = `${Math.max(12, Math.floor(s / 42))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = 'alphabetic';

    for (const r of lines){
      if (r.kind === 'barcode') continue;
      if (r.y > printedLen) continue;

      const yy = ty + r.y;
      if (yy > y0 + ph - 16) continue;

      let a = 0.12;
      let col = 'rgba(30, 30, 30, 0.78)';
      if (r.kind === 'hdr' || r.kind === 'hdr2') { a = 0.18; col = 'rgba(0,0,0,0.72)'; }
      if (r.kind === 'total') { a = 0.24; col = 'rgba(0,0,0,0.82)'; }
      if (r.kind === 'rule') { a = 0.12; col = 'rgba(0,0,0,0.55)'; }

      if (r.kind === 'coupon_hdr') { a = 0.17; col = 'rgba(0,0,0,0.70)'; }
      if (r.kind === 'coupon') { a = 0.20; col = 'rgba(0,0,0,0.78)'; }
      if ((r.kind === 'coupon_hdr' || r.kind === 'coupon') && couponFlash > 0){
        a += 0.14 * couponFlash;
        col = 'rgba(0,0,0,0.88)';
      }

      ctx.globalAlpha = a + 0.7 * ease(clamp((printedLen - r.y) / (lineH * 1.0), 0, 1));
      ctx.fillStyle = col;
      if (r.kind === 'rule'){
        ctx.fillText(r.left, tx, yy);
      } else {
        ctx.fillText(r.left, tx, yy);
        if (r.right){
          ctx.textAlign = 'right';
          ctx.fillText(r.right, x0 + paperW - padX, yy);
          ctx.textAlign = 'left';
        }
      }
    }

    // barcode block (with glitch)
    const barcodeRow = lines.find((r) => r.kind === 'barcode');
    if (barcodeRow && barcodeRow.y <= printedLen){
      const by = ty + barcodeRow.y + 6;
      const bw = paperW - padX * 2;
      const bh = Math.floor(lineH * 1.45);
      const bx = tx;

      const pG = clamp((loopT - glitch.t0) / glitch.dur, 0, 1);
      const gl = (pG > 0 && pG < 1) ? (1 - Math.abs(pG * 2 - 1)) : 0;

      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(bx, by, bw, bh);

      // deterministic barcode stripes
      const prng = mulberry32((seed ^ (receiptNo * 1315423911) ^ 0xBADC0DE) >>> 0);
      let x = bx;
      let i = 0;
      while (x < bx + bw){
        const sw = 1 + ((prng() * 4) | 0);
        const ink = prng() < 0.55;
        const jitter = gl > 0 ? (Math.sin((t * 55) + i * 0.9) * 2.2 * gl) : 0;
        if (ink){
          ctx.globalAlpha = 0.55 + 0.35 * prng();
          ctx.fillStyle = (gl > 0.02 && prng() < 0.12) ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.78)';
          ctx.fillRect(x + jitter, by, sw, bh);
        }
        x += sw;
        i++;
      }

      // glitch overlay lines
      if (gl > 0.02){
        ctx.globalAlpha = 0.15 + 0.25 * gl;
        ctx.fillStyle = '#111';
        const stripes = 6;
        for (let k = 0; k < stripes; k++){
          const yy = by + (k / stripes) * bh + Math.sin(t * 22 + k * 1.7) * 2.0;
          ctx.fillRect(bx, yy, bw, 1);
        }
      }

      ctx.restore();

      // tiny barcode digits
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.font = `${Math.max(10, Math.floor(s / 56))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const digits = String(100000000000 + Math.floor(prng() * 900000000000)).slice(-12);
      ctx.fillText(digits, bx, by + bh + 14);
      ctx.restore();
    }

    ctx.restore(); // clip

    // tear edge
    if (pTear > 0 && pTear < 1){
      const yT = y0 + ph - 10;
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.18 * (1 - pTear);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const steps = 18;
      for (let i = 0; i <= steps; i++){
        const x = x0 + (i / steps) * paperW;
        const z = Math.sin(i * 1.9 + t * 12) * 2.2 * ease(pTear);
        const y = yT + z;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawHud(ctx){
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#c7d2ff';
    ctx.font = `${Math.max(11, Math.floor(s / 54))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText('DREAM RECEIPT PRINTER', Math.floor(w * 0.06), Math.floor(h * 0.09));

    ctx.globalAlpha = 0.18;
    const ch = `REC#${String(receiptNo).padStart(3,'0')}  SEED ${seed}`;
    ctx.fillText(ch, Math.floor(w * 0.06), Math.floor(h * 0.09) + 18);
    ctx.restore();
  }

  function draw(ctx){
    drawBackground(ctx);
    drawPrinter(ctx);
    drawPaper(ctx);
    drawHud(ctx);
  }

  return {
    init,
    onResize,
    update,
    draw,
    onAudioOn,
    onAudioOff,
    destroy,
  };
}
