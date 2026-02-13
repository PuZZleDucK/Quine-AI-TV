# Quine TV

**Live demo (GitHub Pages):** https://puzzleduck.github.io/Quine-AI-TV/

HTML5 virtual TV: a CRT-ish shell UI + a pile of animated channels.

This is an AI-coded project (human-directed, LLM-coded with Open Claw background tasks).

## Run

Development:
```bash
cd ~/x/quine-tv
npm run dev
# open http://localhost:5176
```

Run dev server in background:
```bash
cd ~/x/quine-tv
nohup npm run dev > /tmp/quine-tv-dev.log 2>&1 &
```

Persistent background service (recommended):
```bash
systemctl --user enable --now quine-tv-dev.service
systemctl --user status quine-tv-dev.service
```

Service management:
```bash
systemctl --user restart quine-tv-dev.service
systemctl --user stop quine-tv-dev.service
journalctl --user -u quine-tv-dev.service -n 100 --no-pager
```

Production build (hashed assets):
```bash
cd ~/x/quine-tv
npm run build
npm run preview
# open http://localhost:5176
```

The build output is written to `dist/` with hashed files in `dist/assets/`.

## Controls
- Space: power
- ↑ / ↓: channel
- 0–9: type a channel number, Enter to tune
- Backspace: edit tuning
- A: audio on/off (first click is required to allow audio)
- I: toggle info overlay (OSD)
- G: toggle channel guide
- H / ?: help

## Notes
- Each channel is a module in `src/channels/`.
- Audio is optional per-channel and only starts after user gesture.
- For deploys, serve `index.html` as revalidating (`no-cache`) and hashed assets as immutable.
- Do not use `python -m http.server`; the app uses Vite-only module features during development.

## Channel Screenshots
Generate one screenshot per channel (discovered dynamically from `src/channelList.js`):

```bash
cd ~/x/quine-tv
npm run screenshots:install   # first time only
npm run screenshots
```

Output goes to `screenshots/channels-YYYYMMDD-HHMMSS/` with:
- one PNG per channel (for example `01-synthwave.png`)
- `report.json` (captures + console/page errors)

Optional env vars:
- `BASE_URL` (default `http://localhost:5176`)
- `OUT_DIR` (custom output folder)
- `CLEAN_OUT_DIR=1` (delete existing PNGs + `report.json` in `OUT_DIR` before capturing)
- `WAIT_MS` (default `1200`, wait after tune input)
- `SETTLE_MS` (default `500`, extra wait after transition noise clears)
- `CHANNEL_LIMIT` (default `0`, capture first N channels only)
- `CHANNEL_ID` (capture a single channel by id, e.g. `aquarium`)
- `CHANNEL_NUM` (capture a single channel by number, e.g. `2`)
- `FRAMES` (default `1`, capture multiple frames per channel)
- `FRAME_GAP_MS` (default `350`, delay between frames when `FRAMES > 1`)
- `SHOT_SCOPE` (`screen-wrap` | `screen` | `page`)
- `FAIL_ON_ERRORS=1` (exit non-zero if runtime errors are detected)

To refresh the checked-in set under `screenshots/all/`:
```bash
npm run screenshots:all
```

To review animation/flicker for a single channel:
```bash
OUT_DIR=screenshots/aquarium-frames CHANNEL_ID=aquarium FRAMES=12 FRAME_GAP_MS=200 npm run screenshots
```




### Paused channel ideas (do not implement) — 2026-02-09 20:01
- Server Room Night Ops
- Celestial Navigation Desk
- Stamp Collector’s Watermark Lab
- Clock Tower Bell Scheduler
- Hydroponic Nutrient Mix Board
- City Power Grid Control Room
- Tin Toy Assembly Line
- Kiteborne Weather Probe
- Nightshift Risograph Print Shop
- Fossil Prep Micro‑Sandblaster
- Ocean Buoy Data Console — Buoy telemetry HUD (wave height/pressure/wind) with rolling packets, alert spikes, and calm night→dawn phases.
- Analog Synth Patchbay Clinic — Patch cables re-route in timed “recipes” (bass/pad/lead) with scope inset and occasional “perfect lock” moment (optional).
- Old Map Digitization Scanner — Flatbed scan pass → stitching preview → metadata card → archive stamp loop with paper texture parallax.
- Night Ferry Ticket Booth — Rainy terminal window with ticket-print cycles, destination flips, boarding waves, and a final “all aboard” sweep.
- Tea Tasting Flight Board — Cups on a tasting tray with steep timers, aroma notes cards, palette wheel, and a “perfect steep” glint moment.
- Microscope Slide Prep Bench — Label → drop → cover slip → focus loop with tiny checklist HUD and occasional “perfect focus” snap.
- Museum Label Maker Station — Exhibit label templates fill in (title/date/materials), print/trim/pin phases, and a satisfying alignment grid.
- Space Meal Tray Assembly — Modular tray parts click into place across menu phases with nutrition HUD, vacuum-seal moment, and end-of-shift tally.
- Pneumatic Tube Maintenance Bay — Canister tests (pressure/leak/route) with gauge dance, jam-clear interlude, and “system green” finale.
- Solar Observatory Spectrograph — Sun disk + slit view with spectrum waterfall, calibration lines, flare alert moments, and a calm cooldown phase.


