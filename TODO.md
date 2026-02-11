
# TODO Queue
- Visual polish `dreamreceipt` (src/channels/dreamreceipt.js): add subtle counter texture/film grain and stronger printer-slot lighting/shadow so the scene reads less “flat”. Accept: 0–60s capture shows visible texture + depth improve receipt legibility.
- Content polish `dreamreceipt` (src/channels/dreamreceipt.js): expand receipt text variety (more headers/footers/notes) and add 1 rare special moment beyond glitch/coupon (e.g., VOID stamp / “TOTAL: ???” scramble) scheduled deterministically (~45–120s). Accept: 5min capture shows at least one additional special moment; deterministic per seed.

- Channel `volcanoobs` (`src/channels/volcanoobservatory.js`): Rebuild cone silhouette in `drawVolcano()` (around the current `quadraticCurveTo` at `src/channels/volcanoobservatory.js:259`) so the crater is visually anchored to mountain shoulders instead of reading like a floating disc/UFO.
- Channel `volcanoobs` (`src/channels/volcanoobservatory.js`): Replace `destination-out` crater hole in `drawVolcano()` (`src/channels/volcanoobservatory.js:265`) with layered rim/lip shading that keeps mountain mass visible and prevents hard cutout artifacts.
- Channel `volcanoobs` (`src/channels/volcanoobservatory.js`): Add explicit, long-window eruption phases in `intensityAt()`/`puffAmount()` (`src/channels/volcanoobservatory.js:42` and `src/channels/volcanoobservatory.js:75`) so at least one clearly visible eruptive event occurs within each 60s viewing window.
- Channel `volcanoobs` (`src/channels/volcanoobservatory.js`): Increase eruption readability by scaling ash and plume contrast in `drawVolcano()` and `drawAsh()` (`src/channels/volcanoobservatory.js:293` and `src/channels/volcanoobservatory.js:341`) during puff phase; include occasional incandescent ejecta arcs as rare moments.
- Channel `volcanoobs` (`src/channels/volcanoobservatory.js`): Improve seismograph coupling in `drawSeismograph()` (`src/channels/volcanoobservatory.js:388`) by overlaying threshold markers/alerts tied to `intensityAt(loopT)` so build-up and eruption states are legible.
- Channel `volcanoobs` (`src/channels/volcanoobservatory.js`): Reduce per-frame gradient allocations by precomputing reusable gradients where possible in `regen()` and using cached palettes in `drawBackground()`/`drawVolcano()` (`src/channels/volcanoobservatory.js:196` and `src/channels/volcanoobservatory.js:234`) to lower hot-path GC churn.




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
