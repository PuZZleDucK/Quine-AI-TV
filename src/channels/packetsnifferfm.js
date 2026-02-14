import { mulberry32 } from '../util/prng.js';

// REVIEWED: 2026-02-14

// Packet Sniffer FM
// Turn network packets into a neon spectrum: tune TCP/UDP/ICMP “stations” with bursts, waterfalls, and protocol IDs.

const STATIONS = [
  { key: 'TCP', name: 'TCP MAINLINE', freq: 97.3, hue: 190, rate: 28, tone: { root: 55, lpf: 980 } },
  { key: 'UDP', name: 'UDP SPRAY', freq: 101.9, hue: 305, rate: 34, tone: { root: 73.4, lpf: 1250 } },
  { key: 'ICMP', name: 'ICMP ECHO', freq: 88.7, hue: 120, rate: 18, tone: { root: 41.2, lpf: 820 } },
];

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

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

  // Use a separate PRNG for UI text so we don't perturb the main visual/audio randomness.
  const logRand = mulberry32(((seed >>> 0) ^ 0x9E3779B9) >>> 0);

  let w = 0, h = 0, t = 0;

  // layout
  let wfX = 0, wfY = 0, wfW = 0, wfH = 0;
  let dialX = 0, dialY = 0, dialW = 0, dialH = 0;

  // station state
  let stationIdx = 0;
  let stationTimer = 0;
  let tuneFx = 0;

  // events
  let bigFlash = 0;
  let nextBigAt = 0;

  // special moments: rare deterministic “network incident” events (OSD-safe badge)
  let incidentKind = null; // 'PORT_SCAN' | 'DDOS' | 'LINK_DOWN'
  let incidentBadge = '';
  let incidentT = 0;
  let incidentDur = 0;
  let nextIncidentAt = 0;
  let scanAcc = 0;
  let scanStep = 0;

  // spectrum / waterfall
  const BINS = 64;
  const energy = new Float32Array(BINS);
  const peaks = new Float32Array(BINS);
  let pktAcc = 0;

  // spectrum bar style cache (avoid per-frame `hsla(...)` template allocations)
  const BAR_L_LEVELS = 8;
  const barLightness = Array.from({ length: BAR_L_LEVELS }, (_, k) => 52 + (14 * k) / (BAR_L_LEVELS - 1));
  const spectrumStyles = STATIONS.map(s => {
    const bar = Array.from({ length: BAR_L_LEVELS }, () => new Array(BINS));
    const peak = new Array(BINS);

    for (let i = 0; i < BINS; i++){
      const hue = Math.round(s.hue + (i / (BINS - 1) - 0.5) * 24);
      for (let k = 0; k < BAR_L_LEVELS; k++){
        bar[k][i] = `hsl(${hue}, 95%, ${barLightness[k]}%)`;
      }
      peak[i] = `hsl(${hue}, 100%, 70%)`;
    }

    return { bar, peak };
  });

  let wfCanvas = null;
  let wfCtx = null;
  let wfImg = null;
  let wfRowData = null;
  let wfRows = 160;

  // render cache: gradients (rebuild on init/resize/ctx swap)
  let gfxCtx = null;
  let gfxDirty = true;
  let bgGrad = null;
  let vignetteGrad = null;
  let sheenGrad = null;
  let dialHeadGrads = null; // [stationIdx]
  let knobGrad = null;

  function rebuildGradients(ctx){
    // background
    bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#030312');
    bgGrad.addColorStop(0.55, '#06001a');
    bgGrad.addColorStop(1, '#02020a');

    // vignette
    vignetteGrad = ctx.createRadialGradient(
      w * 0.5, h * 0.5, Math.min(w, h) * 0.15,
      w * 0.5, h * 0.5, Math.max(w, h) * 0.7
    );
    vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.55)');

    // waterfall sheen
    sheenGrad = ctx.createLinearGradient(wfX, wfY, wfX + wfW, wfY + wfH);
    sheenGrad.addColorStop(0, 'rgba(120,220,255,0.00)');
    sheenGrad.addColorStop(0.45, 'rgba(120,220,255,0.06)');
    sheenGrad.addColorStop(1, 'rgba(255,90,220,0.00)');

    // dial header (per station hue)
    dialHeadGrads = STATIONS.map(s => {
      const g = ctx.createLinearGradient(dialX, dialY, dialX + dialW, dialY);
      g.addColorStop(0, `hsla(${s.hue}, 90%, 60%, 0.25)`);
      g.addColorStop(0.6, 'rgba(120,220,255,0.06)');
      g.addColorStop(1, `hsla(${s.hue + 40}, 90%, 60%, 0.18)`);
      return g;
    });

    // knob radial gradient (anchored in canvas coords)
    const kx = dialX + dialW - 56;
    const ky = dialY + dialH - 46;
    const kr = 18;
    knobGrad = ctx.createRadialGradient(kx, ky, 2, kx, ky, kr * 1.5);
    knobGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
    knobGrad.addColorStop(0.55, 'rgba(110,140,190,0.10)');
    knobGrad.addColorStop(1, 'rgba(0,0,0,0.35)');

    gfxCtx = ctx;
    gfxDirty = false;
  }

  function ensureGradients(ctx){
    if (gfxDirty || gfxCtx !== ctx) rebuildGradients(ctx);
  }

  // floating labels
  let labels = [];

  // OSD-safe rotating packet log strip (seeded; 5+ minutes before repeating)
  const PACKET_LOG_PERIOD = 5.6;
  let packetLog = [];
  let packetLogOffset = 0;

  // audio
  let ah = null;

  function pick(arr){ return arr[(rand() * arr.length) | 0]; }

  function pickLog(arr){ return arr[(logRand() * arr.length) | 0]; }

  function buildPacketLogLines(){
    const domains = [
      'cdn.quine.local', 'auth.edge', 'mirror.node', 'telemetry.mesh', 'status.uplink',
      'pkg.repo', 'updates.cache', 'stream.mux', 'sso.portal', 'api.gateway',
    ];
    const paths = [
      '/', '/login', '/metrics', '/healthz', '/v1/events', '/v1/packets', '/sync', '/assets/app.js',
      '/trace', '/static/noise.png',
    ];
    const reasons = ['TTL_EXPIRED', 'CHECKSUM', 'POLICY', 'RATELIMIT', 'NO_ROUTE', 'CONN_REFUSED'];
    const ciphers = ['TLS_AES_128_GCM_SHA256', 'TLS_CHACHA20_POLY1305_SHA256', 'TLS_AES_256_GCM_SHA384'];

    function ip(){
      return `${10 + ((logRand() * 10) | 0)}.${((logRand() * 256) | 0)}.${((logRand() * 256) | 0)}.${1 + ((logRand() * 254) | 0)}`;
    }

    function port(){
      return 1024 + ((logRand() * 54000) | 0);
    }

    function mmss(seconds){
      const m = (seconds / 60) | 0;
      const ss = (seconds | 0) % 60;
      return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }

    const lines = [];
    const N = 64;

    for (let i = 0; i < N; i++){
      const tt = i * PACKET_LOG_PERIOD;
      const ts = mmss(tt);

      const src = ip();
      const dst = ip();
      const sport = port();
      const dport = port();

      const dom = pickLog(domains);
      const path0 = pickLog(paths);
      const proto = pickLog(['TCP', 'UDP', 'ICMP', 'ARP']);
      const kind = pickLog(['SYN', 'ACK', 'PSH', 'FIN', 'ECHO', 'QRY', 'RESP', 'DROP', 'RETX', 'HANDSHAKE']);

      let line = '';
      if (proto === 'TCP'){
        let extra = '';
        if (kind === 'ACK') extra = ` win=${256 + ((logRand() * 4096) | 0)}`;
        else if (kind === 'PSH') extra = ` len=${40 + ((logRand() * 1400) | 0)}`;
        else if (kind === 'RETX') extra = ` seq=${(logRand() * 9000) | 0}`;

        line = `T+${ts}  TCP ${kind.padEnd(4, ' ')} ${src}:${sport} → ${dst}:${dport}${extra}`;
      } else if (proto === 'UDP'){
        if ((kind === 'QRY' || kind === 'RESP') && logRand() < 0.6){
          const q = pickLog(['A?', 'AAAA?', 'TXT?', 'SRV?', 'MX?']);
          const id = (((logRand() * 65535) | 0).toString(16)).padStart(4, '0');
          line = `T+${ts}  DNS ${q.padEnd(5, ' ')} ${dom}  id=${id}`;
        } else {
          const ln = 18 + ((logRand() * 1400) | 0);
          line = `T+${ts}  UDP       ${src}:${sport} → ${dst}:${dport}  len=${ln}`;
        }
      } else if (proto === 'ICMP'){
        const seq = 1 + ((logRand() * 4096) | 0);
        const ttl = 32 + ((logRand() * 160) | 0);
        line = `T+${ts}  ICMP ECHO  ${src} → ${dst}  seq=${seq} ttl=${ttl}`;
      } else {
        line = `T+${ts}  ARP who-has ${dst} tell ${src}`;
      }

      // sprinkle in higher-level callouts
      if (i % 11 === 7){
        line = `T+${ts}  TLS ClientHello  sni=${dom}  cipher=${pickLog(ciphers)}`;
      } else if (i % 13 === 9){
        line = `T+${ts}  HTTP GET  https://${dom}${path0}`;
      } else if (i % 17 === 12){
        line = `T+${ts}  DROP ${pickLog(reasons)}  ${src}:${sport} → ${dst}:${dport}`;
      }

      lines.push(line);
    }

    return lines;
  }

  function init({ width, height }){
    w = width; h = height; t = 0;

    // layout: waterfall left, dial bottom-right
    const pad = Math.max(14, Math.floor(Math.min(w, h) * 0.02));
    wfX = pad;
    wfY = pad;
    wfW = Math.floor(w * 0.70);
    wfH = h - pad * 2;

    dialW = Math.max(240, Math.floor(w * 0.26));
    dialH = Math.max(120, Math.floor(h * 0.18));
    dialX = w - pad - dialW;
    dialY = h - pad - dialH;

    stationIdx = (seed >>> 0) % STATIONS.length;
    stationTimer = 22 + rand() * 16;
    tuneFx = 0.0;

    bigFlash = 0;
    nextBigAt = 6 + rand() * 10;

    incidentKind = null;
    incidentBadge = '';
    incidentT = 0;
    incidentDur = 0;
    nextIncidentAt = 45 + rand() * 75;
    scanAcc = 0;
    scanStep = 0;

    for (let i = 0; i < BINS; i++) { energy[i] = 0; peaks[i] = 0; }
    pktAcc = 0;

    labels = [];

    packetLog = buildPacketLogLines();
    packetLogOffset = ((seed >>> 0) % packetLog.length) | 0;

    // waterfall backing store: small canvas, scaled up when drawn
    wfRows = Math.max(120, Math.min(220, Math.floor(h * 0.28)));
    wfCanvas = document.createElement('canvas');
    wfCanvas.width = BINS;
    wfCanvas.height = wfRows;
    wfCtx = wfCanvas.getContext('2d');
    wfCtx.imageSmoothingEnabled = false;

    wfImg = wfCtx.createImageData(BINS, 1);
    wfRowData = wfImg.data;

    // clear
    wfCtx.fillStyle = 'rgba(0,0,0,1)';
    wfCtx.fillRect(0, 0, BINS, wfRows);

    // gradients depend on layout size; rebuild on next render
    gfxDirty = true;
  }

  function onResize(width, height){
    init({ width, height });
  }

  function switchStation(nextIdx){
    stationIdx = (nextIdx + STATIONS.length) % STATIONS.length;
    stationTimer = 22 + rand() * 16;
    tuneFx = 1.05;

    // chirp + click
    if (audio.enabled){
      audio.beep({ freq: 420 + rand() * 420, dur: 0.032, gain: 0.035, type: 'square' });
      audio.beep({ freq: 120 + rand() * 80, dur: 0.028, gain: 0.02, type: 'triangle' });
    }

    if (audio.enabled && ah?.setTone){
      ah.setTone(STATIONS[stationIdx].tone);
    }

    // leave a little protocol tag
    labels.push({
      text: STATIONS[stationIdx].key,
      x: wfX + wfW * (0.15 + rand() * 0.7),
      y: wfY + wfH * (0.15 + rand() * 0.7),
      a: 0.9,
      life: 1.2,
      vx: (-10 + rand() * 20),
      vy: (-24 - rand() * 26),
    });
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();

    const out = ctx.createGain();
    out.gain.value = 0.95;
    out.connect(audio.master);

    // Pink-ish noise into a lowpass: radio bed.
    const n = audio.noiseSource({ type: 'pink', gain: 0.06 });

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = STATIONS[stationIdx].tone.lpf;
    lpf.Q.value = 0.8;

    // a subtle “carrier” tone that shifts by station
    const carrier = ctx.createOscillator();
    carrier.type = 'triangle';
    carrier.frequency.value = STATIONS[stationIdx].tone.root;

    const cg = ctx.createGain();
    cg.gain.value = 0.0;

    const t0 = ctx.currentTime;
    cg.gain.setValueAtTime(0.0001, t0);
    cg.gain.exponentialRampToValueAtTime(0.022, t0 + 0.35);

    // flutter (very subtle)
    const flutter = ctx.createOscillator();
    flutter.type = 'sine';
    flutter.frequency.value = 0.23;

    const flutterGain = ctx.createGain();
    flutterGain.gain.value = 80;
    flutter.connect(flutterGain);
    flutterGain.connect(lpf.frequency);

    // connect
    try { n.gain.disconnect(); } catch {}
    n.gain.connect(lpf);

    carrier.connect(cg);
    cg.connect(lpf);

    lpf.connect(out);

    n.start();
    carrier.start();
    flutter.start();

    function setTone({ root, lpf: f }){
      const now = ctx.currentTime;
      try {
        carrier.frequency.setTargetAtTime(root, now, 0.12);
        lpf.frequency.setTargetAtTime(f, now, 0.10);
      } catch {}
    }

    return {
      setTone,
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.08); } catch {}
        try { n.stop(); } catch {}
        try { carrier.stop(now + 0.2); } catch {}
        try { flutter.stop(now + 0.2); } catch {}
      },
    };
  }

  function stopAmbience({ clearCurrent = false } = {}){
    const handle = ah;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      try { audio.stopCurrent(); } catch {}
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ah = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Idempotent: avoid stacking/overlapping our own ambience if called repeatedly.
    if (ah){
      if (audio.current !== ah) audio.setCurrent(ah);
      return;
    }

    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    // Only clears AudioManager.current when we own it.
    stopAmbience({ clearCurrent: true });
  }

  function destroy(){ onAudioOff(); }

  function spikeBin(idx, intensity = 1, beep = false){
    idx = Math.max(0, Math.min(BINS - 1, idx | 0));

    const v = (0.35 + 0.9 * intensity);
    energy[idx] = Math.min(1.2, energy[idx] + v);
    peaks[idx] = Math.max(peaks[idx], 0.35 + v * 0.65);

    if (beep && audio.enabled){
      const f = 200 + idx * 12;
      audio.beep({ freq: f, dur: 0.012, gain: 0.010 + 0.008 * intensity, type: 'square' });
    }
  }

  function startIncident(){
    const choices = [
      { kind: 'PORT_SCAN', badge: 'EVENT: PORT SCAN', dur: 8.5 },
      { kind: 'DDOS', badge: 'EVENT: DDOS FLOOD', dur: 9.5 },
      { kind: 'LINK_DOWN', badge: 'EVENT: LINK DOWN', dur: 7.2 },
    ];

    const c = choices[(rand() * choices.length) | 0];

    incidentKind = c.kind;
    incidentBadge = c.badge;
    incidentDur = c.dur;
    incidentT = 0;
    scanAcc = 0;
    scanStep = 0;

    // kickoff signature + reset-friendly state tweaks
    if (incidentKind === 'LINK_DOWN'){
      for (let i = 0; i < BINS; i++){
        energy[i] *= 0.18;
        peaks[i] *= 0.28;
      }
      tuneFx = Math.max(tuneFx, 0.25);
    } else if (incidentKind === 'DDOS'){
      bigFlash = Math.max(bigFlash, 0.7);
    }

    // (optional) one floating callout in the playfield
    labels.push({
      text: c.badge.replace('EVENT: ', ''),
      x: wfX + wfW * (0.18 + rand() * 0.64),
      y: wfY + wfH * (0.18 + rand() * 0.58),
      a: 0.95,
      life: 1.3,
      vx: (-10 + rand() * 20),
      vy: (-26 - rand() * 22),
    });
  }

  function spawnPacket(intensity = 1){
    // map a synthetic packet “size” to a frequency bin (log-ish)
    const size = 40 + rand() * 1460;
    const norm = Math.log(size) / Math.log(1500);
    const idx = Math.max(0, Math.min(BINS - 1, (norm * (BINS - 1)) | 0));

    const v = (0.28 + 0.85 * intensity) * (0.7 + rand() * 0.6);
    energy[idx] = Math.min(1.2, energy[idx] + v);
    peaks[idx] = Math.max(peaks[idx], 0.35 + v * 0.65);

    // occasional protocol label
    if (rand() < 0.06 * intensity){
      labels.push({
        text: STATIONS[stationIdx].key,
        x: wfX + wfW * (0.05 + rand() * 0.9),
        y: wfY + wfH * (0.10 + rand() * 0.8),
        a: 0.65,
        life: 0.9 + rand() * 0.6,
        vx: (-18 + rand() * 36),
        vy: (-22 - rand() * 30),
      });
    }

    // light packet “tick”
    if (audio.enabled && rand() < 0.045 * intensity){
      audio.beep({ freq: 540 + rand() * 480, dur: 0.012 + rand() * 0.01, gain: 0.012 + intensity * 0.006, type: pick(['square', 'triangle']) });
    }
  }

  function updateWaterfall(){
    if (!wfCtx) return;

    // shift down 1 px
    wfCtx.globalCompositeOperation = 'copy';
    wfCtx.drawImage(wfCanvas, 0, 1);

    // paint new row at y=0
    const s = STATIONS[stationIdx];
    const hueBase = s.hue;

    for (let i = 0; i < BINS; i++){
      const e = clamp01(energy[i]);
      const p = clamp01(peaks[i]);
      const lum = 10 + e * 60 + p * 18;
      const sat = 85;
      const hue = hueBase + (i / (BINS - 1) - 0.5) * 28;

      // convert HSL-ish to RGB quickly with canvas? keep simple: use pre-baked palette via hsl string per-pixel is too slow.
      // Instead: approximate using a small triad based on hue offsets.
      const a = clamp01(0.06 + e * 0.85);

      // cheap neon RGB-ish mapping (not true HSL, but looks “spectral”)
      const r = Math.max(0, Math.min(255, (40 + 220 * clamp01(Math.sin((hue + 30) * 0.017) * 0.5 + 0.5)) * (0.35 + e * 0.75)) | 0);
      const g = Math.max(0, Math.min(255, (40 + 220 * clamp01(Math.sin((hue + 150) * 0.017) * 0.5 + 0.5)) * (0.25 + e * 0.85)) | 0);
      const b = Math.max(0, Math.min(255, (50 + 220 * clamp01(Math.sin((hue + 270) * 0.017) * 0.5 + 0.5)) * (0.35 + e * 0.75)) | 0);

      const k = i * 4;
      wfRowData[k + 0] = r;
      wfRowData[k + 1] = g;
      wfRowData[k + 2] = b;
      wfRowData[k + 3] = (a * 255) | 0;

      // decay for next frame
      energy[i] = Math.max(0, energy[i] - 0.75 * (0.016 + 0.008 * (i / BINS)));
      peaks[i] = Math.max(0, peaks[i] - 0.085);

      // subtle “breathing” for movement
      energy[i] = Math.max(0, energy[i] + 0.004 * Math.sin(t * 1.25 + i * 0.22));
    }

    // tuning/static overlay
    if (tuneFx > 0){
      const a = clamp01(tuneFx / 1.05);
      for (let i = 0; i < BINS; i++){
        if (rand() < 0.24 * a){
          const k = i * 4;
          const v = (120 + rand() * 120) | 0;
          wfRowData[k + 0] = v;
          wfRowData[k + 1] = v;
          wfRowData[k + 2] = v;
          wfRowData[k + 3] = (40 + rand() * 90) | 0;
        }
      }
    }

    wfCtx.putImageData(wfImg, 0, 0);
    wfCtx.globalCompositeOperation = 'source-over';
  }

  function update(dt){
    t += dt;

    if (tuneFx > 0) tuneFx = Math.max(0, tuneFx - dt);
    bigFlash = Math.max(0, bigFlash - dt * 1.6);

    stationTimer -= dt;
    if (stationTimer <= 0){
      switchStation(stationIdx + 1);
    }

    // network incident special moments (rare, deterministic; badge is OSD-safe in dial panel)
    if (!incidentKind && t >= nextIncidentAt){
      startIncident();
    }

    let incidentMul = 1.0;
    if (incidentKind){
      incidentT += dt;

      if (incidentKind === 'DDOS'){
        incidentMul = 2.6;
        // keep the dial a little “angry”
        bigFlash = Math.max(bigFlash, 0.15 * (0.5 + 0.5 * Math.sin(t * 7.0)));
      } else if (incidentKind === 'LINK_DOWN'){
        incidentMul = 0.08;
        // dampen energy slightly for a “dead carrier” feel
        if (incidentT < 0.8){
          for (let i = 0; i < BINS; i++){
            energy[i] *= 0.88;
            peaks[i] *= 0.90;
          }
        }
      } else if (incidentKind === 'PORT_SCAN'){
        incidentMul = 1.15;

        const pulseEvery = 0.075;
        scanAcc += dt;
        while (scanAcc >= pulseEvery){
          scanAcc -= pulseEvery;

          const span = BINS - 12;
          const idx = 6 + (scanStep % span);
          const beep = (scanStep % 4) === 0;
          spikeBin(idx, 1.05, beep);
          scanStep++;
        }
      }

      if (incidentT >= incidentDur){
        incidentKind = null;
        incidentBadge = '';
        incidentT = 0;
        incidentDur = 0;
        scanAcc = 0;
        scanStep = 0;

        nextIncidentAt = t + 45 + rand() * 75;
      }
    }

    // big “event” flashes
    if (t >= nextBigAt){
      bigFlash = 1.0;
      nextBigAt = t + 8 + rand() * 14;
      for (let k = 0; k < 10 + (rand() * 10 | 0); k++) spawnPacket(1.35);

      if (audio.enabled){
        audio.beep({ freq: 980 + rand() * 520, dur: 0.05, gain: 0.03, type: 'sawtooth' });
      }

      labels.push({
        text: 'BIG EVENT',
        x: wfX + wfW * (0.12 + rand() * 0.76),
        y: wfY + wfH * (0.16 + rand() * 0.68),
        a: 0.9,
        life: 1.1,
        vx: (-14 + rand() * 28),
        vy: (-30 - rand() * 20),
      });
    }

    // packet field: Poisson-ish using an accumulator
    const s = STATIONS[stationIdx];
    const rate = s.rate * (0.78 + 0.44 * (0.5 + 0.5 * Math.sin(t * 0.35 + stationIdx)));
    const burst = (tuneFx > 0 ? 0.55 : 1.0) * (0.92 + 0.20 * bigFlash);

    pktAcc += rate * dt * burst * incidentMul;
    while (pktAcc >= 1.0){
      spawnPacket(1.0 + bigFlash * 0.6);
      pktAcc -= 1.0;

      // sometimes a micro-burst (deterministic)
      if (rand() < 0.12 + bigFlash * 0.25){
        spawnPacket(1.15 + bigFlash * 0.5);
      }
    }

    // update labels
    for (const L of labels){
      L.x += L.vx * dt;
      L.y += L.vy * dt;
      L.life -= dt;
      L.a = Math.max(0, L.a - dt * 0.8);
    }
    labels = labels.filter(L => L.life > 0 && L.a > 0.02);

    // waterfall line update roughly at ~60fps; stable even if dt spikes
    updateWaterfall();
  }

  function drawBackground(ctx){
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // faint grid
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(160,200,255,0.25)';
    ctx.lineWidth = 1;
    const step = Math.max(18, Math.floor(Math.min(w, h) * 0.04));
    for (let x = 0; x <= w; x += step){
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step){
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();

    // vignette
    ctx.save();
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawWaterfall(ctx){
    // panel
    ctx.save();
    roundRect(ctx, wfX - 2, wfY - 2, wfW + 4, wfH + 4, 16);
    ctx.fillStyle = 'rgba(6, 8, 18, 0.88)';
    ctx.fill();
    ctx.clip();

    // draw scaled waterfall band (bottom third)
    const bandH = Math.floor(wfH * 0.36);
    const bandY = wfY + wfH - bandH;

    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(wfCanvas, wfX, bandY, wfW, bandH);

    // spectrum bars above
    const sY = wfY + Math.floor(wfH * 0.10);
    const sH = Math.floor(wfH * 0.45);
    const barW = wfW / BINS;

    const styles = spectrumStyles[stationIdx];
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < BINS; i++){
      const e = clamp01(energy[i]);
      const p = clamp01(peaks[i]);
      const hh = (e * e) * sH;
      const x0 = wfX + i * barW;
      const barW0 = Math.max(1, barW * 0.95);

      const pLevel = Math.max(0, Math.min(BAR_L_LEVELS - 1, ((p * (BAR_L_LEVELS - 1)) + 0.5) | 0));
      ctx.globalAlpha = 0.18 + e * 0.55;
      ctx.fillStyle = styles.bar[pLevel][i];
      ctx.fillRect(x0, sY + (sH - hh), barW0, hh);

      if (p > 0.02){
        ctx.globalAlpha = 0.12 + p * 0.22;
        ctx.fillStyle = styles.peak[i];
        ctx.fillRect(x0, sY + (sH - (p * sH)), barW0, 2);
      }
    }

    ctx.restore();

    // scanline / waterfall gloss
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(wfX, wfY, wfW, wfH);
    ctx.restore();

    // big event flash
    if (bigFlash > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,255,255,${0.08 + bigFlash * 0.22})`;
      ctx.fillRect(wfX, wfY, wfW, wfH);
      ctx.restore();
    }

    ctx.restore();

    // border
    ctx.save();
    roundRect(ctx, wfX - 2, wfY - 2, wfW + 4, wfH + 4, 16);
    ctx.strokeStyle = 'rgba(180,210,255,0.18)';
    ctx.lineWidth = Math.max(1, h / 520);
    ctx.stroke();
    ctx.restore();
  }

  function drawPacketLog(ctx){
    if (!packetLog.length) return;

    // OSD-safe: clipped to the waterfall panel and inset away from edges.
    const idx = (packetLogOffset + ((t / PACKET_LOG_PERIOD) | 0)) % packetLog.length;
    const txt0 = packetLog[idx];

    ctx.save();

    // clip to the same rounded rect as the waterfall panel
    roundRect(ctx, wfX - 2, wfY - 2, wfW + 4, wfH + 4, 16);
    ctx.clip();

    const pad = Math.max(12, Math.floor(Math.min(w, h) * 0.018));
    const stripH = Math.max(22, Math.floor(h * 0.040));
    const x = wfX + pad;
    const y = wfY + pad;
    const ww = wfW - pad * 2;

    // background strip
    ctx.globalAlpha = 0.85;
    roundRect(ctx, x, y, ww, stripH, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,210,255,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // text
    ctx.globalAlpha = 0.92;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(220,240,255,0.74)';
    ctx.font = `700 ${Math.max(11, Math.floor(h * 0.018))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

    // cheap clipping/ellipsis: keep string bounded, then measure/trim if still too wide.
    let txt = txt0.length > 96 ? (txt0.slice(0, 95) + '…') : txt0;
    const maxW = ww - 20;
    if (ctx.measureText(txt).width > maxW){
      while (txt.length > 6 && ctx.measureText(txt + '…').width > maxW){
        txt = txt.slice(0, -1);
      }
      txt = txt + '…';
    }

    ctx.fillText(txt, x + 10, y + stripH * 0.55);

    ctx.restore();
  }

  function drawLabels(ctx){
    if (!labels.length) return;
    const s = STATIONS[stationIdx];

    ctx.save();
    ctx.font = `${Math.max(14, Math.floor(h * 0.024))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'middle';

    for (const L of labels){
      const a = clamp01(L.a);
      ctx.globalAlpha = a;

      const glow = 0.35 + a * 0.5;
      ctx.shadowColor = `hsla(${s.hue}, 100%, 70%, ${glow})`;
      ctx.shadowBlur = 10 + a * 18;
      ctx.fillStyle = `hsla(${s.hue}, 95%, 62%, ${0.8})`;
      ctx.fillText(L.text, L.x, L.y);

      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(255,255,255,${0.10 + a * 0.12})`;
      ctx.fillText(L.text, L.x + 1, L.y + 1);
    }
    ctx.restore();
  }

  function drawDial(ctx){
    const s = STATIONS[stationIdx];

    // panel
    ctx.save();
    roundRect(ctx, dialX, dialY, dialW, dialH, 16);
    ctx.fillStyle = 'rgba(10, 12, 22, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,210,255,0.18)';
    ctx.lineWidth = Math.max(1, h / 560);
    ctx.stroke();

    // header
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = dialHeadGrads[stationIdx];
    ctx.fillRect(dialX + 1, dialY + 1, dialW - 2, Math.max(26, dialH * 0.26));
    ctx.restore();

    const px = dialX + 18;
    const py = dialY + 20;

    ctx.fillStyle = 'rgba(220,240,255,0.88)';
    ctx.font = `700 ${Math.max(14, Math.floor(h * 0.024))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText('PACKET SNIFFER FM', px, py);

    ctx.fillStyle = 'rgba(220,240,255,0.74)';
    ctx.font = `600 ${Math.max(12, Math.floor(h * 0.020))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText(`${s.key}  •  ${s.name}`, px, py + 22);

    // frequency + tuning knob
    const fx = dialX + dialW - 18;
    const fy = dialY + 22;
    ctx.textAlign = 'right';
    ctx.fillStyle = `hsla(${s.hue}, 95%, 68%, 0.95)`;
    ctx.font = `800 ${Math.max(16, Math.floor(h * 0.030))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText(`${s.freq.toFixed(1)}`, fx, fy);

    ctx.fillStyle = 'rgba(220,240,255,0.60)';
    ctx.font = `600 ${Math.max(11, Math.floor(h * 0.018))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText('MHz', fx, fy + 18);

    // knob
    const kx = dialX + dialW - 56;
    const ky = dialY + dialH - 46;
    const kr = 18;

    const knobRot = (t * 0.6 + stationIdx * 0.9) + (tuneFx > 0 ? (1 - tuneFx / 1.05) * 2.2 : 0);

    ctx.save();
    ctx.translate(kx, ky);

    ctx.fillStyle = knobGrad;
    ctx.beginPath();
    ctx.arc(0, 0, kr, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(220,240,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.rotate(knobRot);
    ctx.strokeStyle = `hsla(${s.hue}, 100%, 70%, ${0.55 + (tuneFx > 0 ? 0.25 : 0)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(kr * 0.85, 0);
    ctx.stroke();

    ctx.restore();

    // incident badge (OSD-safe, within dial panel)
    if (incidentKind){
      const fadeIn = Math.min(1, incidentT / 0.25);
      const fadeOut = Math.min(1, (incidentDur - incidentT) / 0.4);
      const a = clamp01(Math.min(fadeIn, fadeOut));

      const txt = incidentBadge || 'EVENT';
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.65 * a;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      const bh = Math.max(18, Math.floor(dialH * 0.18));
      const bx = dialX + 14;
      const by = dialY + dialH - bh - 12;

      const padX = 10;
      ctx.font = `800 ${Math.max(11, Math.floor(h * 0.018))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      const tw = ctx.measureText(txt).width;
      const bw = Math.min(dialW - 28, tw + padX * 2);

      roundRect(ctx, bx, by, bw, bh, 10);
      ctx.fillStyle = incidentKind === 'LINK_DOWN' ? 'rgba(255, 90, 90, 0.18)' : 'rgba(255, 215, 120, 0.14)';
      ctx.fill();
      ctx.strokeStyle = incidentKind === 'LINK_DOWN' ? 'rgba(255, 120, 120, 0.22)' : 'rgba(255, 220, 150, 0.20)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = incidentKind === 'LINK_DOWN' ? 'rgba(255, 200, 200, 0.92)' : 'rgba(255, 235, 180, 0.92)';
      ctx.fillText(txt, bx + padX, by + bh * 0.52);

      ctx.restore();
    }

    // tuning static hint
    if (tuneFx > 0){
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(220,240,255,0.58)';
      ctx.font = `700 ${Math.max(11, Math.floor(h * 0.018))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.fillText('TUNING…', dialX + 18, dialY + dialH - 22);
      ctx.restore();
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ensureGradients(ctx);

    drawBackground(ctx);
    drawWaterfall(ctx);
    drawPacketLog(ctx);
    drawLabels(ctx);
    drawDial(ctx);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
