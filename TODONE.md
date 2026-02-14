# Done

- [x] [project:quine-tv] `mailroomtube` (src/channels/mailroomtube.js): text — expanded `DISPATCH_LOG` to 96 lines (~16 minutes rotation) and added a deterministic jam/sweep override message for the HUD dispatch strip (no per-frame RNG consumption). Commit: 5b70c3f

- [x] [project:quine-tv] Review channel `mailroomtube` (src/channels/mailroomtube.js): captured screenshots (0–300s) to `screenshots/review-mailroomtube-2026-02-14` (errors/warnings: 0), did code+audio/perf review, confirmed `// REVIEWED: 2026-02-14`, and queued concrete follow-ups in `TODO.md`. Commit: 09efe22

- [x] [project:quine-tv] `mailroomtube` (src/channels/mailroomtube.js): determinism — switched `update(dt)` to a fixed-timestep sim loop (`SIM_DT=1/60` accumulator) so 30fps/60fps captures match and `rand()` consumption is cadence-stable. Commit: 41138f7

- [x] [project:quine-tv] `mailroomtube` (src/channels/mailroomtube.js): special moments — added rare deterministic “PRIORITY EXPRESS” run (~60–180s) with a distinct canister + HUD badge + short audio sting; clean reset on delivery. Commit: 9a11001

- [x] [project:quine-tv] `mailroomtube` (src/channels/mailroomtube.js): text — added a seeded rotating “dispatch log” strip in the HUD (OSD-safe; ~6 minutes before repeating). Commit: f70f68d

- [x] [project:quine-tv] `mailroomtube` (src/channels/mailroomtube.js): UI — station status lamps now reflect local state (jam/pink, congestion/amber based on nearby canisters, ok/green) with subtle screen-blend glow. Commit: c71a9c9

- [x] [project:quine-tv] `mailroomtube` (src/channels/mailroomtube.js): perf — cached the moving grid/scan background as a repeating pattern tile (rebuild on resize / ctx swap) so steady-state render avoids per-frame stroking ~N vertical lines. Commit: 7b00e7d

- [x] [project:quine-tv] `mailroomtube` (src/channels/mailroomtube.js): audio hygiene — made `onAudioOn()` idempotent (no stacked sources) and added a tiny noise fade-out on stop to reduce clicks. Commit: bb9d616

- [x] [project:quine-tv] `lasercutfile` (src/channels/lasercutfile.js): UI — clamp/ellipsize HUD badge text so it can’t overflow its rounded-rect container at small resolutions (also clips to badge shape). Screenshots: screenshots/autopilot-2026-02-14-lasercutfile-badge-before + screenshots/autopilot-2026-02-14-lasercutfile-badge-after. Commit: 0efa511

- [x] [project:quine-tv] `lasercutfile` (src/channels/lasercutfile.js): audio hygiene — made `onAudioOn()` idempotent and ensured `onAudioOff()`/`destroy()` only clear AudioManager.current when owned (prevents stacking/clobbering). Commit: 15db0c8

- [x] [project:quine-tv] `lasercutfile` (src/channels/lasercutfile.js): perf — cached the inner bed gradient created in `drawBed()` (rebuild on resize/ctx swap) so steady-state render avoids per-frame `createLinearGradient()`. Commit: c952b51

- [x] [project:quine-tv] Cleanup: moved stale TODO entry for `lasercutfile` special moments (implementation already present in src/channels/lasercutfile.js). Commit: d1b3184

- [x] [project:quine-tv] `lasercutfile` (src/channels/lasercutfile.js): determinism — sparks emission is now distance-driven (separate seeded PRNG) so 30fps/60fps captures match. Commit: d7e788a

- [x] [project:quine-tv] `lasercutfile` (src/channels/lasercutfile.js): visuals — added a subtle cached brushed-metal texture overlay on the bed frame (rebuilt on resize; deterministic tile). Commit: 3770c79

- [x] [project:quine-tv] `lasercutfile` (src/channels/lasercutfile.js): perf — replaced spark cap from `shift()` (O(n)) to O(1) swap-remove (order-independent). Screenshots: screenshots/autopilot-2026-02-14-lasercutfile-before + screenshots/autopilot-2026-02-14-lasercutfile-after. Commit: 8431f59

- [x] [project:quine-tv] `packetsfm` (src/channels/packetsnifferfm.js): determinism — switched `update()` to a fixed-timestep simulation loop (`SIM_DT=1/60`) so `updateWaterfall()` static and packet spawning consume RNG at a stable cadence; 30fps/60fps captures now match. Commit: dd311eb

- [x] [project:quine-tv] `packetsfm` (src/channels/packetsnifferfm.js): text/dialog — added a seeded rotating “packet log” / callout strip (~5.6s cadence; ~6 minutes before repeating), clipped OSD-safe inside the waterfall panel. Commit: cbaddfa

- [x] [project:quine-tv] `packetsfm` (src/channels/packetsnifferfm.js): perf — cached background+vignette gradients and panel gradients (waterfall sheen, dial header, knob radial) on init/resize/ctx swap. Accept: steady-state `render()` creates 0 gradients/frame. Commit: 328c94d

- [x] [project:quine-tv] `packetsfm` (src/channels/packetsnifferfm.js): audio hygiene — made `onAudioOn()` idempotent and ensured `onAudioOff()`/`destroy()` only clear AudioManager.current when owned (avoid stacking on repeated toggles). Commit: 0c2a86b

- [x] [project:quine-tv] `packetsfm` (src/channels/packetsnifferfm.js): special moments — added rare deterministic “network incident” events (~45–120s) (PORT SCAN / DDOS FLOOD / LINK DOWN) with an OSD-safe EVENT badge in the dial panel and clean reset. Commit: f15b00b

- [x] [project:quine-tv] `packetsfm` (src/channels/packetsnifferfm.js): perf/allocs — removed per-bin `hsla(...)` template allocations in the spectrum bar loop by precomputing lightness-bucketed `hsl(...)` styles and varying intensity via `globalAlpha`. Commit: 07e2002

- [x] [project:quine-tv] `news` (src/channels/news.js): special moments — added 1–2 rare deterministic events (~45–120s) with clear broadcast signature (BREAKING banner + flash, FIELD REPORT lower-third sweep), clean reset, and OSD-safe placement. Commit: 46fd467

- [x] [project:quine-tv] `news` (src/channels/news.js): audio hygiene — made `onAudioOn()` idempotent (no stacking) and ensured `onAudioOff()`/`destroy()` only clear AudioManager.current when owned. Commit: 095530e

- [x] [project:quine-tv] `news` (src/channels/news.js): text/layout — wrapped the main headline to 2 lines + ellipsized overflow so it never clips off-screen at smaller resolutions. Commit: 0db3977

- [x] [project:quine-tv] `news` (src/channels/news.js): ticker perf/allocs — cached `tickerText` + stable `tickerWidth` (rebuild on headline rotate / resize); render uses cached string. Commit: bd5c29d

- [x] [project:quine-tv] `news` (src/channels/news.js): OSD safety — constrained the bouncing ODD NEWS logo so it won’t overlap the top-left LIVE/time bug (safe rectangle + push-out). Screenshots: screenshots/autopilot-news-osd-before + screenshots/autopilot-news-osd-after. Commit: da5aa95

- [x] [project:quine-tv] Review channel `news` (src/channels/news.js): captured screenshots (0–300s) to `screenshots/review-news-start` + completion shots to `screenshots/review-news-2026-02-14-post` (errors/warnings: 0), did code+audio/perf review, added `// REVIEWED: 2026-02-14`, and queued concrete follow-ups in `TODO.md`. Commit: 36404b7

- [x] [project:quine-tv] `lighthouse` (src/channels/lighthousewatch.js): special moments — added rare deterministic moments (AURORA ribbon sweep + optional BUOY blink / KEEPER silhouette) planned per cycle in a ~60–150s window, with an OSD-safe EVENT badge and clean reset. Commit: 149523f

- [x] [project:quine-tv] `lighthouse` (src/channels/lighthousewatch.js): visuals — added a subtle cached cliff/rock texture + ridge rim-light so the left foreground reads less like a flat black wedge. Screenshots: screenshots/autopilot-lighthouse-cliff-texture-before + screenshots/autopilot-lighthouse-cliff-texture-after. Commit: 34f77c9

- [x] [project:quine-tv] `lighthouse` (src/channels/lighthousewatch.js): audio hygiene — made `onAudioOn()` idempotent (no stacking) and ensured `onAudioOff()`/`destroy()` only clear AudioManager.current when owned. Commit: TBD

- [x] [project:quine-tv] `lighthouse` (src/channels/lighthousewatch.js): perf — cached sky/sea gradients + horizon glow + moon glow + beam gradients (angle-binned) and lantern core gradient (rebuild on init/resize/ctx swap) so steady-state render allocates 0 gradients/frame. Commit: TBD

- [x] [project:quine-tv] `lighthouse` (src/channels/lighthousewatch.js): determinism — removed `rand()` usage from the rain wrap/reset path by deriving rain streak x/y analytically from initial params + absolute time (with deterministic per-wrap jitter); 30fps/60fps captures now match. Commit: 5f0761e

- [x] [project:quine-tv] Review channel `lighthouse` (src/channels/lighthousewatch.js): captured screenshots (0–300s) to `screenshots/review-lighthouse-2026-02-14` + completion shots to `screenshots/review-lighthouse-2026-02-14-post` (errors/warnings: 0), did code+audio/perf review, added `// REVIEWED: 2026-02-14`, and queued concrete follow-ups in `TODO.md`. Commit: 9f1346a

- [x] [project:quine-tv] `microfilm` (src/channels/microfilm.js): long-run interest — added rare deterministic special moments (FILM JAM “RETHREADING…” + OVEREXPOSE glitch) on a ~2–5 minute seeded cadence (separate PRNG; clean reset). Commit: cc4ead9

- [x] [project:quine-tv] `microfilm` (src/channels/microfilm.js): visuals — added a deterministic cached scratches/edge-wear overlay layer (rebuilt on init/resize; no per-frame RNG). Commit: 9428a03

- [x] [project:quine-tv] `microfilm` (src/channels/microfilm.js): visual readability — increased reel rim/spoke contrast and added a subtle film path hint between reels and strip. Commit: df479ba

- [x] [project:quine-tv] `microfilm` (src/channels/microfilm.js): perf — cached static background + vignette into offscreen layers rebuilt on init/resize; steady-state render blits layers (no per-frame `createLinearGradient()`/`createRadialGradient()` for backdrop). Commit: ffb48cb

- [x] [project:quine-tv] `microfilm` (src/channels/microfilm.js): audio hygiene — made `onAudioOn()` idempotent and ensured `onAudioOff()`/`destroy()` only clear AudioManager.current when owned. Screenshots: screenshots/autopilot-microfilm-audio-hygiene/before + screenshots/autopilot-microfilm-audio-hygiene/after. Commit: 3b58ccf

- [x] [project:quine-tv] `kitchen` (src/channels/kitchenscience.js): visual depth — added a cached glass highlight/caustic overlay layer for the beaker (rebuilt on init/resize) to give the prop more “material” without cluttering OSD. Commit: 8bd4cda

- [x] [project:quine-tv] `kitchen` (src/channels/kitchenscience.js): special moment tuning — made “SCIENCE FAIR” rarer (~2–4 min between banners) and made “SHOW & TELL” variant extra-rare. Commit: 27b990c

- [x] [project:quine-tv] `kitchen` (src/channels/kitchenscience.js): cleanup — removed unused local `topW` in `spawnBubble()` (quick scan for other obvious dead locals nearby). Commit: d2b26ae

- [x] [project:quine-tv] `kitchen` (src/channels/kitchenscience.js): text wrapping — pre-wrap `Why it works` card lines via `wrapTextToWidth()` on experiment change + resize (prevents clipping). Commit: 7b7c904

- [x] [project:quine-tv] Review channel `kitchen` (src/channels/kitchenscience.js): captured screenshots (0–300s) to `screenshots/review-kitchen-2026-02-14` (errors/warnings: 0), did code+audio/perf review, confirmed `// REVIEWED: 2026-02-14`, and queued concrete follow-ups in `TODO.md`. Commit: TBD

- [x] [project:quine-tv] `kitchen` (src/channels/kitchenscience.js): special moment — added rare deterministic “SCIENCE FAIR” overlay (confetti + ribbon banner; ~45–120s cadence; clean reset; schedule uses separate RNG). Commit: c6adb58

- [x] [project:quine-tv] `kitchen` (src/channels/kitchenscience.js): long-run interest — expanded `EXPERIMENTS` (more variety) and switched experiment selection to a seeded shuffle-bag with a 5-minute cooldown (avoids back-to-back repeats; keeps the bag moving even if cooldown can’t be satisfied). Commit: 2781e7b

- [x] [project:quine-tv] `kitchen` (src/channels/kitchenscience.js): determinism — removed `rand()` usage from `render()` foam band by precomputing deterministic foam bubble params in init/resize; 30fps/60fps captures now match. Screenshots: screenshots/autopilot-kitchen-foamdet-before-20260214-0615 + screenshots/autopilot-kitchen-foamdet-after-20260214-0615. Commit: 5147d78

- [x] [project:quine-tv] `kitchen` (src/channels/kitchenscience.js): perf — cached the static background (bg gradient + countertop texture lines) into an offscreen layer rebuilt on init/resize; steady-state `render()` now blits the layer (no per-frame `createLinearGradient()` calls for backdrop). Commit: 6335226

- [x] [project:quine-tv] `kitchen` (src/channels/kitchenscience.js): audio hygiene — made `onAudioOn()` idempotent and ensured `onAudioOff()`/`destroy()` only clears AudioManager.current when owned. Screenshots: screenshots/autopilot-kitchen-audiohygiene-before-20260214-0545 + screenshots/autopilot-kitchen-audiohygiene-after-20260214-0545. Commit: 115b407

- [x] [project:quine-tv] `sandtable` (src/channels/sandtable.js): determinism — render speckle now uses a separate time-seeded PRNG (no channel `rand()` consumption) so 30fps/60fps captures match at fixed offsets. Commit: ad0eddd

- [x] [project:quine-tv] `sandtable` (src/channels/sandtable.js): audio determinism/perf — seeded PRNG inside `sandScrape()` (no `Math.random()`); hoisted flutter params. Commit: d64ebd9

- [x] [project:quine-tv] `sandtable` (src/channels/sandtable.js): visual/bug — tile sand texture in Y (and X) so drift never reveals blank sand under the clip. Commit: be3ff52

- [x] [project:quine-tv] Review channel `sandtable` (src/channels/sandtable.js): captured screenshots (0–300s) to `screenshots/review-sandtable` + completion shots to `screenshots/review-sandtable-post-20260214-0430` (errors/warnings: 0), did code+audio/perf review, added `// REVIEWED: 2026-02-14`, and queued concrete follow-ups in `TODO.md`. Commit: TBD

- [x] [project:quine-tv] `icecorelab` (src/channels/icecorelab.js): UI/visuals — tied isotope proxy chart to ash bands (ash marker + deterministic spike aligned to volcanic layer depth). Screenshots: screenshots/autopilot-icecorelab-ashchart-before-20260214-0400 + screenshots/autopilot-icecorelab-ashchart-after-20260214-0400. Commit: TBD

- [x] [project:quine-tv] `icecorelab` (src/channels/icecorelab.js): UI — probe-tied depth/age readout (DEPTH m + AGE kyr BP) with panel+core markers; nudged readout/chart down during rare banner so it never overlaps. Screenshots: screenshots/autopilot-icecorelab-depthage-before-20260214-0345 + screenshots/autopilot-icecorelab-depthage-after-20260214-0345. Commit: c53a1cb

- [x] [project:quine-tv] `icecorelab` (src/channels/icecorelab.js): visuals — added a sample tray + extracted “chip” animation during CUT→ANALYZE (kept OSD/panel clear). Screenshots: screenshots/autopilot-icecorelab-before + screenshots/autopilot-icecorelab-tray-after. Commit: ca9b8bf

- [x] [project:quine-tv] `icecorelab` (src/channels/icecorelab.js): special moment — added rare deterministic “BUBBLE INCLUSIONS” sparkle moment (~45–120s cadence; seeded schedule; no per-frame RNG). Commit: f6ededb

- [x] [project:quine-tv] `icecorelab` (src/channels/icecorelab.js): visuals — added cached vertical micro-striation texture overlay to reduce “TV banding” (rebuild on init/resize). Commit: fb7b6ec

- [x] [project:quine-tv] Review channel `tugdispatch` (src/channels/harbortugdispatch.js): captured screenshots (0–300s) to `screenshots/review-tugdispatch-20260214-0145` (errors/warnings: 0), did code+audio/perf review, confirmed `// REVIEWED: 2026-02-13`, no new follow-ups queued. Commit: 2edc822

- [x] [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): special moment — added deterministic “FOG HORN” (visibility haze sweep) + “SECURITY SWEEP” beam scheduled ~45–120s, with OSD-safe banner + one-shot audio cues. Commit: 4f08d4d

- [x] [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): text/dialog — added a seeded rotating “VHF DISPATCH” log strip (funny/immersive harbor chatter), ~6+ minutes before repeating; clipped to stay OSD-safe. Commit: TBD

- [x] [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): determinism — schedule squall lightning from the previously scheduled `nextFlashAt` time (catch-up loop) so 30fps vs 60fps matches at the same capture offsets. Screenshots: screenshots/autopilot-tugdispatch-determinism-before + screenshots/autopilot-tugdispatch-determinism-after. Commit: TBD

- [x] [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): perf — replaced per-frame scanline y-loop with a cached scanline pattern (rebuild on resize/ctx swap). Accept: render no longer loops over `y` to draw scanlines each frame. Commit: 506c8ee

- [x] [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): perf — cached the tide gauge fill gradient created in `drawHUD()`; rebuilds on `onResize()` / ctx swap. Accept: steady-state `drawHUD()` does 0 `createLinearGradient()` calls. Commit: bfd60b3

- [x] [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): perf — cached the map water background gradient created in `drawMap()`; rebuilds on `onResize()` / ctx swap. Accept: steady-state `drawMap()` does 0 `createLinearGradient()` calls. Commit: 7be71c6

- [x] [project:quine-tv] `futurearch` (src/channels/futurearch.js): perf — pre-wrap placard bullet text on artifact change / resize (avoid per-frame `split()` + `measureText()` in `wrapText()`). Screenshots: screenshots/autopilot-futurearch-perf-2026-02-13-start + screenshots/autopilot-futurearch-perf-2026-02-13-end2. Commit: 5936ec1

- [x] [project:quine-tv] `futurearch` (src/channels/futurearch.js): perf — cached pedestal gradients (spotlight cone + pedestal body); rebuild on resize/ctx swap. Screenshots: screenshots/autopilot-futurearch-pedcache-before-20260213-224746 + screenshots/autopilot-futurearch-pedcache-after-20260213-224931. Commit: 8758755

- [x] [project:quine-tv] `futurearch` (src/channels/futurearch.js): audio hygiene — make `onAudioOn()` idempotent and ensure `onAudioOff()`/`destroy()` clear `AudioManager.current` only when owned. Commit: 867c4cf

- [x] [project:quine-tv] `futurearch` (src/channels/futurearch.js): visual correctness — added a distinct `watch` artifact icon and set smartwatch artifact `kind` to `watch` (was rendering as a phone). Commit: 1e77af9

- [x] [project:quine-tv] Review channel `futurearch` (src/channels/futurearch.js): captured screenshots (0–300s) to `screenshots/review-futurearch-20260213-2145` (errors/warnings: 0), did code+audio/perf review, confirmed `// REVIEWED: 2026-02-13`, and queued concrete follow-ups in `TODO.md`. Commit: da22125

- [x] [project:quine-tv] `futurearch` (src/channels/futurearch.js): UI — make the placard panel OSD-safe (bottom HUD must not cover bullet text). Accept: with OSD visible, all placard text is fully readable. Commit: da22125

- [x] [project:quine-tv] `futurearch` (src/channels/futurearch.js): special moment — added rare deterministic “DOCENT NOTE” overlay + exhibit light flicker (~45–120s cadence; seeded; placard stays stable). Commit: 2fa7df6

- [x] [project:quine-tv] `futurearch` (src/channels/futurearch.js): transition — switched artifact+placard changeover to a true crossfade dissolve (prev→current) with reduced slide. Commit: f691a30

- [x] [project:quine-tv] `futurearch` (src/channels/futurearch.js): content — expanded `ARTIFACTS` to 16 and switched to a seeded shuffle-bag (no back-to-back repeats; ~5+ min before repeating). Commit: c688d79

- [x] [project:quine-tv] `futurearch` (src/channels/futurearch.js): perf — cached background gradients (bg/floor/vignette); rebuild on resize/ctx swap. Screenshots: screenshots/autopilot-futurearch-bgcache-before + screenshots/autopilot-futurearch-bgcache-after. Commit: cfc3abd

- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — pushed forge further to the side + improved body/frame shading. Commit: e3ba448

- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visual storytelling — dunk hot item into quench bucket during QUENCH; steam originates from bucket waterline. Commit: 3a8bd8b

- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — second pass: pushed workshop props further right + increased opacity (bucket/tools/tongs). Commit: 9c7325b

- [x] [project:quine-tv] Cleanup: removed stale TODO entry for `forgeanvil` workshop prop opacity (already completed earlier; see commit b3a5a62). Commit: TBD

- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — moved the forge + fire further to the side (shifted forge left; aligns floor glow + opening gradients). Commit: 90f5af1

- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — rotate through several glowing hot items on the anvil; swap immediately after QUENCH. Screenshots: screenshots/autopilot-forgeanvil-hotitems-before-20260213-1700 + screenshots/autopilot-forgeanvil-hotitems-after-20260213-1700. Commit: da4cb97

- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — improved hammer swing so it follows a readable arc and reaches the anvil strike point. Commit: 658b16d

- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — make anvil look better (added stand/base plate, top face plate, hardy/pritchel holes, crisp outline + underside shading; heavier shadow). Screenshots: screenshots/autopilot-2026-02-13-forgeanvil-before + screenshots/autopilot-2026-02-13-forgeanvil-anvil-after. Commit: 3db3956

- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): audio polish — replaced “beep-y” strike hits with a noise transient + tone body; added a short quench hiss burst (with stop-guard). Screenshots: screenshots/autopilot-forgeanvil-audio-2026-02-13-before + screenshots/autopilot-forgeanvil-audio-2026-02-13-after. Commit: 1e40323

- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — made workshop props more opaque and pushed further to the side (bucket/tools/tongs). Commit: b3a5a62

- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visual depth — added workshop props (quench bucket + hanging tools + floor tongs) with subtle parallax/lighting; kept OSD clear. Screenshots: screenshots/autopilot-forgeanvil-props-before-20260213-1545 + screenshots/autopilot-forgeanvil-props-after-20260213-1545. Commit: 1f2ce41

- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): text/dialog — added a seeded rotating “shop talk” caption strip (blacksmith jokes/status lines), 5+ minutes before repeating. Screenshots: screenshots/autopilot-forgeanvil-captions-before + screenshots/autopilot-forgeanvil-captions-after. Commit: 132bb92

- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): determinism/visual — precomputed flame tongues so `drawForge()` uses no per-frame `rand()` (prevents flame “teleporting”; FPS-stable). Commit: 8084da6

- [x] [project:quine-tv] `orbits` (src/channels/orbits.js): time structure — added a ~1.5 minute phase cycle (CALM→WARP→DRIFT) modulating orbit speed + nebula wash intensity. Commit: 33bd1d0

- [x] [project:quine-tv] `orbits` (src/channels/orbits.js): ui - overlay label now shows the current orbit-layout name (ORIGIN/TILT/BULGE/SPIN). Commit: ec27195

- [x] [project:quine-tv] `orbits` (src/channels/orbits.js): bug - prevent sun/planet/moon overlap (widened orbit spacing; moons skip draw when overlapping). Commit: db0761c

- [x] [project:quine-tv] `orbits` (src/channels/orbits.js): special moment — added rare deterministic “COMET PASS” (shooting star + trail) scheduled ~3–5 minutes. Commit: 21e93a3

- [x] [project:quine-tv] `orbits` (src/channels/orbits.js): visual - cycle through different orbit layouts every 5 minutes. Commit: e1b1c7a

- [x] [project:quine-tv] `orbits` (src/channels/orbits.js): visual - more interesting planets (rings + bands/craters + rim/highlights; deterministic per seed). Screenshots: screenshots/autopilot-orbits-before-2026-02-13-1215 + screenshots/autopilot-orbits-planets-after-2026-02-13-1215. Commit: 14cd112

- [x] [project:quine-tv] `orbits` (src/channels/orbits.js): audio hygiene — made `onAudioOn()` idempotent (no stacking) and ensured `destroy()` only clears AudioManager.current when owned. Screenshots: screenshots/autopilot-orbits-audiohygiene-before + screenshots/autopilot-orbits-audiohygiene-after. Commit: 9c17123

- [x] [project:quine-tv] Review channel `orbits` (src/channels/orbits.js): captured screenshots (0–300s) to `screenshots/review-orbits-20260213-1130` + completion shots to `screenshots/review-orbits-20260213-1130-post` (errors/warnings: 0), fixed starfield flicker by precomputing stars (no `rand()` in render), added `// REVIEWED: 2026-02-13`, and queued concrete follow-ups in `TODO.md`. Commit: TBD

- [x] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): visual - improve room layout and add dryers. Commit: ed86ad3

- [x] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): visual - improve washing machine visuals so components are not overlapping. Commit: 1dcf95a

- [x] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): visual - improve window apperance. Commit: e20ebee

- [x] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): visual - improve washing machine layout and apperance. Commit: bf597e7

- [x] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): visual - declutter text (removed redundant in-channel overlay; rely on TV OSD). Screenshots: screenshots/autopilot-neonlaundromat-declutter-pre + screenshots/autopilot-neonlaundromat-declutter-post. Commit: 382adc8

- [x] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): special moment — added rare deterministic “POWER SURGE” event (~45–120s cadence; seeded) that boosts neon flicker and dims the room for ~2–5s (with OSD-safe banner). Commit: 0dc580b

- [x] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): visual identity — use per-machine `m.tint` to colorize the control-panel strip, phase indicator light, and inner-drum rim glow so the three machines read as distinct units. Screenshots: screenshots/neonlaundromat-tint-pre + screenshots/neonlaundromat-tint-post. Commit: TBD

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): special moments — added a second independent rare event stream (PANIC / CORE DUMP overlay + mini-scroll) with clean reset and its own seeded schedule. Commit: d3daed2

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): visual — colorize stack-trace + diff snippet lines (diff headers/hunks/+/-) so code blocks read like code, not chat. Commit: dc3a010

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): content — fixed section text coloring so BUG/BUG REPORT lines are reliably red and ASCII art inherits the correct BUG/FIX colors. Screenshots: screenshots/autopilot-duckdebug-before + screenshots/autopilot-duckdebug-after. Commit: 0bfc450

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): content — add 2–5 dialog lines between `duck` and the selected user before BUG/FIX/LESSON so each block reads like a conversation. Commit: f1064cc

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): content — expanded `fakeStackTrace()` with more frame templates + occasional indented diff-snippet lines; hardened `wrapForTerminal()` so extreme indentation can’t overflow. Commit: 1b515d6

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): UI — add a subtle header phase indicator (CALM/CRISIS/RESOLUTION) driven by `phaseParams(t)`; keep it OSD-safe. Commit: ecfbc9e

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): perf — avoid per-frame `ctx.measureText(...)` in the transcript cursor placement by using cached monospace width (`termCharW`) * string length (clamped). Commit: cb16509

- [x] [project:quine-tv] `foleylab` (src/channels/foleylab.js): UI/visual polish — added an OSD-safe VU panel driven by step density, including a waveform sparkline from recent density history, plus rare deterministic special moments (TAKE GOOD / MIC CLIP) scheduled ~45–120s. Commit: 4aee3c5

- [x] [project:quine-tv] `foleylab` (src/channels/foleylab.js): long-run variety — added 4 more recipes (typewriter/platform/balloon/drawer) and confirmed seeded shuffle-bag selection to avoid back-to-back repeats; now runs 5+ minutes before repeating. Commit: 20f36f1

- [x] [project:quine-tv] `foleylab` (src/channels/foleylab.js): perf pass — cached static background (bg gradient + acoustic-panel grid pattern + vignette) and stage/table gradients (wood tabletop + mic silhouette) into offscreen layers rebuilt on resize/ctx swap; render now blits layers (no per-frame gradients/grid loops). Screenshots: screenshots/review-foleylab-pre + screenshots/review-foleylab-post. Commit: f3e8f38

- [x] [project:quine-tv] `foleylab` (src/channels/foleylab.js): determinism — split audio RNG from visual PRNG so audio.enabled toggles don’t change recipe selection/visual sequence. Commit: 1df1700

- [x] [project:quine-tv] `foleylab` (src/channels/foleylab.js): audio hygiene — made `onAudioOn()` idempotent (stops any prior ambience we own before restarting) and `onAudioOff()`/`destroy()` now stop+clear and only clear AudioManager.current when owned. Commit: c4c8dc3

- [x] [project:quine-tv] Review channel `foleylab` (src/channels/foleylab.js): captured screenshots (0–300s) to `screenshots/review-foleylab-pre` + completion shots to `screenshots/review-foleylab-post` (errors/warnings: 0), did code+audio/perf/determinism review, added `// REVIEWED: 2026-02-13`, and queued concrete follow-ups in `TODO.md`. Commit: a178562

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): added explicit calm→crisis→resolution phase cycle modulating typing speed, scanline intensity, and between-confessional hold durations (with a short crossfade at boundaries). Commit: 98981b6

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): expanded dialog pools and added a short seeded fake stack-trace generator so it can run 5+ minutes without obvious repeats. Commit: 53a42aa

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): added rare deterministic “special moments” (brief CRT glitch/flicker + BUG!/FIXED stamp overlay) scheduled on timers; stamp kept in header so it doesn’t obscure the transcript. Commit: 281c621

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): cached terminal char width + maxChars (recomputed on resize/ctx swap) so steady-state render avoids measureText('M') per frame. Commit: 1c05b71

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): wrapForTerminal() now wraps long indented lines while preserving indentation (prevents off-screen overflow for stack traces / code-ish blocks). Commit: 0680c03

- [x] [project:quine-tv] `fixit` (src/channels/fixit.js): Improved tool art — distinct head silhouettes for pliers/wrench/screwdriver/tape + subtle drop shadows for tool + object. Commit: ae1317a

- [x] [project:quine-tv] `fixit` (src/channels/fixit.js): Added deterministic 2–4 minute phase cycle modulating lamp warmth, bench vignette intensity, and animation pacing (phase stored in `update(dt)`, render reads stable phase values). Commit: 5539923

- [x] [project:quine-tv] `fixit` (src/channels/fixit.js): Expanded `REPAIRS` from 4 → 11 with distinct palettes/tools and 4–6 step scripts (durations ~37–46s per repair). Commit: de52562

- [x] [project:quine-tv] `fixit` (src/channels/fixit.js): Text/dialog — replaced footer with seeded rotating caption strip (45 variants; 9s cadence; deterministic shuffle; ellipsized to stay OSD-safe). Commit: bf7988d

- [x] [project:quine-tv] `fixit` (src/channels/fixit.js): Audio hygiene — `onAudioOn()` idempotent (no stacking), noise fade-out on stop to reduce clicks, and `onAudioOff()`/`destroy()` clear AudioManager.current only when owned. Commit: 8ea6a40

- [x] [project:quine-tv] Review channel `fixit` (src/channels/fixit.js): captured screenshots (0–300s) to `screenshots/review-fixit` (errors/warnings: 0), did code+audio/perf review, added `// REVIEWED: 2026-02-13`, and queued concrete follow-ups in `TODO.md`. Commit: 9eab6f2

- [x] [project:quine-tv] `matrix` (src/channels/matrix.js): special moments — added rare deterministic “GLITCH” event (~45–120s cadence; seeded) that briefly increases contrast + scrambles a subset of columns, then cleanly resets. Screenshots: screenshots/autopilot-matrix-before + screenshots/autopilot-matrix-after. Commit: TBD

- [x] [project:quine-tv] `matrix` (src/channels/matrix.js): time structure — added deterministic 2–4 min phase cycle (GREEN→TEAL→RED ALERT→GREEN) modulating trail decay, rain speed, and palette with smooth easing. Commit: c510490

- [x] [project:quine-tv] `matrix` (src/channels/matrix.js): visual polish — made the top overlay banner more OSD-safe (smaller height + gentle fade) and rotate the title from a deterministic seeded list (5–8 min cadence). Commit: d37e6b2

- [x] [project:quine-tv] `matrix` (src/channels/matrix.js): determinism — removed `rand()` consumption from `render()` by updating per-column glyph arrays on a fixed cadence in `update(dt)` (80–140ms). Screenshots: screenshots/autopilot-matrix-determinism-before + screenshots/autopilot-matrix-determinism-after. Commit: 425c04e

- [x] [project:quine-tv] `matrix` (src/channels/matrix.js): audio hygiene — `onAudioOn()` idempotent (no stacking), gentle hiss fade-out on stop, `onAudioOff()`/`destroy()` clear AudioManager.current only when owned; reduced beep cadence/variation. Commit: 6a4c738

- [x] [project:quine-tv] Review channel `matrix` (src/channels/matrix.js): captured screenshots (0–300s) to `screenshots/review-matrix` (errors/warnings: 0), did code+audio/perf review, added `// REVIEWED: 2026-02-13`, and queued concrete follow-ups in `TODO.md`.

- [x] [project:quine-tv] Review follow-up `dominofactory` (src/channels/dominofactory.js): long-run interest — added rare deterministic special moments (overhead sweep + QC stamp or forklift silhouette pass), scheduled ~55–120s with a clear signature look and clean reset. Commit: 30c5e5b

- [x] [project:quine-tv] Review follow-up `dominofactory` (src/channels/dominofactory.js): text/dialog — added a seeded rotating “line log” under the HUD (funny factory status codes; 5+ min deterministic rotation; clipped so it stays OSD-safe). Screenshots: screenshots/autopilot-dominofactory-linelog-before + screenshots/autopilot-dominofactory-linelog-after. Commit: 30c5e5b

- [x] [project:quine-tv] Review follow-up `dominofactory` (src/channels/dominofactory.js): visual identity — added cached midground “factory clutter” layer (bolts/rivets/hazard decals/soft grime) that stays OSD-safe and rebuilds on resize. Screenshots: screenshots/review-dominofactory-pre + screenshots/review-dominofactory-post. Commit: bff9e4b

- [x] [project:quine-tv] Review follow-up `dominofactory` (src/channels/dominofactory.js): deterministic alarm/spark scheduling — schedule-time corrected decay so 30fps/60fps captures match. Commit: 1ee7343

- [x] [project:quine-tv] Review follow-up `dominofactory` (src/channels/dominofactory.js): audio hygiene — made `onAudioOn()` idempotent (no stacking), and `onAudioOff()`/`destroy()` now stop+clear only when the current AudioManager handle is owned. Commit: 3479944

- [x] [project:quine-tv] Composition `lava` (src/channels/lava.js): added a lamp silhouette (glass outline + metal cap/base) and clipped the blobs to the glass so it reads as an actual lava lamp. Commit: 533d974

- [x] [project:quine-tv] Determinism `lava` (src/channels/lava.js): switched to a fixed-timestep simulation loop so 30fps vs 60fps yields identical captures for the same seed. Screenshots: screenshots/autopilot-lava-determinism-before + screenshots/autopilot-lava-determinism-after. Commit: 261d558

- [x] [project:quine-tv] Special moments `lava` (src/channels/lava.js): added a deterministic glint sweep overlay during cycle events so “special moments” are unmistakable. Commit: 6bfca4e

- [x] [project:quine-tv] Visual texture `lava` (src/channels/lava.js): cached film grain + scanlines + vignette layer (rebuild on resize/ctx swap) to reduce flat empty space without cluttering OSD. Screenshots: screenshots/autopilot-lava-texture-start + screenshots/autopilot-lava-texture-done. Commit: 84ac0e3

- [x] [project:quine-tv] Responsive scaling `lava` (src/channels/lava.js): store `baseR` and recompute `r` on `onResize()` (rebuild sprite cache) so resizes keep blobs proportional. Screenshots: screenshots/autopilot-lava-scaling-before + screenshots/autopilot-lava-scaling-after. Commit: b5695b9

- [x] [project:quine-tv] Audio stop polish `lava` (src/channels/lava.js): delay `bus.disconnect()` until after fade-out so the gain ramps can finish (reduces click/pop risk). Commit: b02ec62

- [x] [project:quine-tv] Micro-perf `lava` (src/channels/lava.js): quantized + cached `ctx.filter = blur(...)` string so it only updates when the blur bucket changes (avoids per-frame template string churn). Commit: bd74466

- [x] [project:quine-tv] Visual `elevatorpanel` (src/channels/elevatorpanel.js): added a right-side building schematic showing shafts + elevator cars; active car + target floor highlighted. Commit: e3f49bb

- [x] [project:quine-tv] Buttons `elevatorpanel` (src/channels/elevatorpanel.js): replaced chase highlight with persistent queue-selected LEDs + deterministic press animation on enqueued calls. Screenshots: screenshots/autopilot-elevatorpanel-before + screenshots/autopilot-elevatorpanel-after. Commit: 74b1a2d

- [x] [project:quine-tv] Visual `elevatorpanel` (src/channels/elevatorpanel.js): call queue now accumulates deterministic background calls and is serviced on ARRIVE; screenshots: screenshots/autopilot-elevatorpanel-queue-before + screenshots/autopilot-elevatorpanel-queue-after. Commit: c082650

- [x] [project:quine-tv] Time structure `lava` (src/channels/lava.js): added deterministic 2–4 min phase cycle (CALM→BLOOP→SURGE) modulating blob speed/blur/intensity; added rare deterministic “special moments” (PULSE/HEAT/SWIRL) scheduled ~45–120s/cycle. Commit: e71d29b

- [x] [project:quine-tv] Perf `lava` (src/channels/lava.js): removed per-blob `createRadialGradient()` from `render()` by pre-rendering blob sprites (bucketed by radius+hue) and blitting with blur+screen composite. Accept: steady-state `render()` allocates 0 gradients/frame. Commit: b07df9f


- [x] [project:quine-tv] Special moment `flow` (src/channels/flowfield.js): added rare deterministic “special moments” (inversion + shockwave) scheduled ~45–120s with OSD-safe label/ring + clean reset. Commit: 3dfb45a

- [x] [project:quine-tv] Long-run interest `flow` (src/channels/flowfield.js): added a deterministic 2–4 min phase cycle (CALM→SURGE→DRIFT) modulating fieldScale/speed/fade with smooth transitions; seeded schedule. Commit: 9f6ec2e

- [x] [project:quine-tv] Long-run interest `kintsugi` (src/channels/kintsugiclinic.js): make the polish glint a true rare “special moment” (~45–120s) with a more dramatic, clearly visible signature (fade in/out) + clean reset. Commit: 0197987

- [x] [project:quine-tv] Long-run composition `flow` (src/channels/flowfield.js): added deterministic periodic point reseed (1.5% every 9.5s; separate RNG) to keep coverage even and avoid long-run ribbon collapse. Screenshots: screenshots/review-flowfield-pre + screenshots/review-flowfield-post. Commit: 12cd9e8

- [x] [project:quine-tv] Visual depth `elevatorpanel` (src/channels/elevatorpanel.js): added subtle glass reflection + edge vignette/panel bloom layer that varies by segment (MOVE/ARRIVE/SERVICE) while keeping OSD crisp. Commit: 8c6946b

- [x] [project:quine-tv] Visual identity `flow` (src/channels/flowfield.js): added cached background gradient+vignette and a slow drifting mist/grain midground (seeded; OSD-safe; no per-frame allocations in steady-state). Commit: e814a6c

- [x] [project:quine-tv] Text/dialog `elevatorpanel` (src/channels/elevatorpanel.js): expanded the status strip into seeded, mildly-funny annunciator messages (5-minute rotation; clipped to avoid overlapping NEXT). Commit: eb10d26

- [x] [project:quine-tv] Visual polish `kintsugi` (src/channels/kintsugiclinic.js): improve CRACK phase readability via per-crack depth (variable thickness/opacity) + deterministic micro-branch cracks at endpoints (regen-time only; no per-frame RNG). Commit: 342eb25

- [x] [project:quine-tv] Perf pass `stitchalong` (src/channels/constellationstitch.js): cached weave/hoop/inner-cloth gradients (rebuild on resize/ctx swap) so steady-state `render()` calls 0 `create*Gradient()`. Screenshots: screenshots/autopilot-stitchalong-perf-before + screenshots/autopilot-stitchalong-perf-after. Commit: 7e019fb

- [x] [project:quine-tv] Audio polish `lava` (src/channels/lava.js): replaced plain brown-noise hum with low drone + filtered brown noise; added slow “breath” modulation; `onAudioOn()` is idempotent and `onAudioOff()` clears AudioManager.current only when owned. Commit: 2f41c05

- [x] [project:quine-tv] Text/dialog `lava` (src/channels/lava.js): added a seeded rotating caption strip (58 variants; 18–27s cadence; no repeats until full cycle). Screenshots: screenshots/autopilot-lava-captions-before + screenshots/autopilot-lava-captions-after. Commit: fcc2caf

- [x] [project:quine-tv] Determinism `flow` (src/channels/flowfield.js): switched to a fixed-timestep simulation + offscreen paint buffer so 30fps vs 60fps yields identical captures for the same seed. Commit: c575965

- [x] [project:quine-tv] `kintsugi` (src/channels/kintsugiclinic.js): add more items and rotate item every 5 minutes. Commit: b066486

- [x] [project:quine-tv] Determinism `stitchalong` (src/channels/constellationstitch.js): decoupled audio randomness from the visual PRNG by splitting an audio RNG and scheduling needle clicks (FPS-stable). Commit: 80299ca

- [x] [project:quine-tv] Determinism `kintsugi` (src/channels/kintsugiclinic.js): decoupled audio randomness from the visual PRNG by using a separate audio RNG (no visual `rand()` consumption in audio paths). Commit: 8d7cdcc

- [x] [project:quine-tv] Perf pass `kintsugi` (src/channels/kintsugiclinic.js): cached bench/spotlight/pottery/gold/vignette gradients (rebuild on resize/regen/ctx swap) so steady-state `render()` allocates 0 gradients/frame. Commit: 27555f5

- [x] [project:quine-tv] Audio hygiene `stitchalong` (src/channels/constellationstitch.js): made `onAudioOn()` idempotent (stop our previous ambience before restarting) and `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Commit: 8346d27

- [x] [project:quine-tv] Visual correctness `kintsugi` (src/channels/kintsugiclinic.js): clipped cracks/dust/gold seams (and glints) to the pottery ellipse so stroke/glow doesn’t bleed outside the bowl silhouette. Commit: 6623587

- [x] [project:quine-tv] Perf `flow` (src/channels/flowfield.js): removed per-point `hsla(...)` template allocations by bucketizing hue (48 buckets) + varying intensity via `globalAlpha` (precomputed `hsl(...)` styles). Screenshots: screenshots/autopilot-flow-perf-before + screenshots/autopilot-flow-perf-after. Commit: 205df54

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): wrapped long dialog lines within the terminal viewport (multiline), expanded bug/confessional text variety. Commit: c4ab24b

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): added uncommon + rare ASCII art stingers for BUG/FIX lines (seeded). Commit: 76689dc

- [x] [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): added variation to usernames + confessional opener/BUG/FIX/LESSON line templates (seeded). Commit: 22b17d9

- [x] [project:quine-tv] Determinism `duckdebug` (src/channels/rubberduck.js): removed per-frame `rand()` typing-speed jitter; now uses per-line seeded speed (FPS-stable at 30fps vs 60fps). Commit: faebeff

- [x] [project:quine-tv] Determinism `duckdebug` (src/channels/rubberduck.js): split audio RNG from visual PRNG so toggling audio doesn’t alter the visual PRNG sequence. Commit: a6683ad

- [x] [project:quine-tv] Cleanup: removed stale TODO entry “Review channel: kaleido” (already completed earlier; see commit 9d50467). Commit: 50ea2e3

- [x] [project:quine-tv] Cleanup: removed duplicate TODO entry “Review channel: deepseasonar” (already completed earlier; see commit 866f413).

- [x] [project:quine-tv] Perf polish `kintsugi` (src/channels/kintsugiclinic.js): replaced `dust = dust.filter(...)` with in-place compaction to avoid per-frame array allocation. Commit: 597ff20

- [x] [project:quine-tv] Audio hygiene `duckdebug` (src/channels/rubberduck.js): made `onAudioOn()` idempotent (keeps our room tone if already current; stops our prior handle before restarting); `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Commit: ba050d6

- [x] [project:quine-tv] Audio hygiene `kintsugi` (src/channels/kintsugiclinic.js): made `onAudioOn()` idempotent (stop current first, then start new sources); `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Commit: 0f4232f

- [x] [project:quine-tv] Perf pass `duckdebug` (src/channels/rubberduck.js): pre-rendered scanlines as a cached pattern (no per-frame scanline fillRect loop). Commit: d9d8baa

- [x] [project:quine-tv] Perf pass `duckdebug` (src/channels/rubberduck.js): cached background linear + vignette radial gradients (rebuild on resize/ctx swap) so steady-state `render()` allocates 0 gradients/frame. Commit: 0f3c483

- [x] [project:quine-tv] Audio hygiene `elevatorpanel` (src/channels/elevatorpanel.js): made `onAudioOn()` idempotent (stops any existing handle we own before starting) and `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Commit: 9ecfa53

- [x] [project:quine-tv] Review channel `flow` (src/channels/flowfield.js): captured screenshots (0–300s) to `screenshots/review-flow-before` + completion shots to `screenshots/review-flow-after` (errors/warnings: 0), did code/perf pass, confirmed `// REVIEWED: 2026-02-12`, and confirmed/queued concrete follow-ups in `/home/puzzleduck/clawd/TODO.md`. Commit: ff11544

- [x] [project:quine-tv] Review channel `stitchalong` (src/channels/constellationstitch.js): captured screenshots (0–300s) to `screenshots/review-stitchalong` (errors/warnings: 0), did code+audio/perf/determinism pass, added `// REVIEWED: 2026-02-12`, and queued concrete follow-ups in `/home/puzzleduck/clawd/TODO.md`. Commit: 329ad4a

- [x] [project:quine-tv] Review channel `kintsugi` (src/channels/kintsugiclinic.js): captured screenshots (0–300s) to `screenshots/review-kintsugi`, did code+audio/perf/determinism pass, confirmed `// REVIEWED: 2026-02-12`, and queued concrete follow-ups in `/home/puzzleduck/clawd/TODO.md`. Commit: 1d3463d

- [x] [project:quine-tv] Review channel `elevatorpanel` (src/channels/elevatorpanel.js): captured screenshots (0–300s) to `screenshots/review-elevatorpanel`, did code+audio pass (errors/warnings: 0), confirmed `// REVIEWED: 2026-02-12`, and queued concrete follow-ups in `/home/puzzleduck/clawd/TODO.md`. Commit: TBD

- [x] [project:quine-tv] Review channel `deepseasonar` (src/channels/deepseasonar.js): captured screenshots (0–300s) to `screenshots/review-deepseasonar`, did code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups in `/home/puzzleduck/clawd/TODO.md`. Commit: 866f413

- [x] [project:quine-tv] Review channel `kaleido` (src/channels/kaleido.js): captured screenshots (0–300s) to `screenshots/review-kaleido`, did code+audio pass, confirmed no errors/warnings, and queued follow-ups in `/home/puzzleduck/clawd/TODO.md`. Commit: 9d50467

- [x] [project:quine-tv] visuals `containerport`: containers should be loaded and unloaded from ships when ship is stopped only. some ships unload, some load, some both. Commit: 73b3e34

- [x] [project:quine-tv] visuals `containerport`: cranes should only lift containers vertically and should be consistant and not jump around. Commit: 6ad6d17

- [x] [project:quine-tv] visuals `containerport`: containers should be limited to stacks of three on ships. Commit: 532568c

- [x] [project:quine-tv] visuals `containerport`: containers on the ships are the wrong size, should be the same size as all other containers. Commit: 90a7316

- [x] [project:quine-tv] visuals `containerport`: containers should be consistent persistant entities and not background elements or disapear, they should move with ships when loaded. Commit: 92a487d

- [x] [project:quine-tv] visuals `containerport`: reroute events should cause a container to be moved from the source to the target column. Commit: 4a4855b

- [x] [project:quine-tv] visuals `containerport`: the boat should start off screen at the start, and go all the way offscreen at the end. Commit: fec9124

- [x] [project:quine-tv] visuals `containerport`: containers should look more like shipping containers. Commit: 7b8d2e3

- [x] [project:quine-tv] Special moment `containerport` (`src/channels/containerport.js`): add 1–2 rare deterministic events (~45–120s) uncommon and rare ship types. Accept: 5min capture shows at least one special moment; deterministic per seed. Commit: c84f6c5

- [x] [project:quine-tv] Determinism `containerport` (`src/channels/containerport.js`): decouple audio randomness from visual PRNG (separate RNG) so the same seed yields identical visuals with audio on/off. Accept: same seed yields identical screenshots at 30fps vs 60fps; audio.enabled does not affect visual sequence. Commit: 1512bd6

- [x] [project:quine-tv] visuals `containerport`: crane frame should look sturdier. Commit: bd87b1f

- [x] [project:quine-tv] visuals `containerport`: clouds should look better. Commit: 9dddb4a

- [x] [project:quine-tv] Perf pass `containerport` (`src/channels/containerport.js`): cache gradients created in render path (bg/sea/yard/vignette) on init/resize/ctx swap. Accept: steady-state `render()` allocates 0 gradients/frame. Commit: f848d5e

- [x] [project:quine-tv] Review channel `containerport` (src/channels/containerport.js): captured screenshots (0–300s) to `screenshots/review-containerport`, did code+audio pass, added `// REVIEWED` marker, and queued follow-ups. Commit: TBD

- [x] [project:quine-tv] Channel `volcanoobs` (`src/channels/volcanoobservatory.js`): Increase eruption readability by scaling ash and plume contrast during puff phase; added rare incandescent ejecta arcs. Commit: 2115be7

- [x] [project:quine-tv] Channel `volcanoobs` (`src/channels/volcanoobservatory.js`): Replace `destination-out` crater hole in `drawVolcano()` with layered rim/lip shading (no hard cutout artifacts). Commit: 30db510

- [x] [project:quine-tv] Channel `volcanoobs` (`src/channels/volcanoobservatory.js`): Improve seismograph coupling in `drawSeismograph()` by overlaying threshold markers/alerts tied to `intensityAt(loopT)` so build-up and eruption states are legible. Commit: eab3c69

- [x] [project:quine-tv] Channel `volcanoobs` (src/channels/volcanoobservatory.js): Perf pass — cache sky/ground/vignette gradients (rebuilt on `regen()` / ctx swap) so steady-state render avoids per-frame background/vignette/ground gradient allocations. Commit: 12bb239

- [x] [project:quine-tv] Channel `volcanoobs` (src/channels/volcanoobservatory.js): Rebuild cone silhouette in `drawVolcano()` so the crater is visually anchored to mountain shoulders instead of reading like a floating disc/UFO. Commit: cc7bef1

- [x] [project:quine-tv] Channel `volcanoobs` (src/channels/volcanoobservatory.js): Add explicit, long-window eruption phases in `intensityAt()`/`puffAmount()` so at least one clearly visible eruptive event occurs within each 60s viewing window. Commit: 85eae5d

- [x] [project:quine-tv] Content polish `dreamreceipt` (src/channels/dreamreceipt.js): expanded receipt text variety (more headers/footers/notes) + added deterministic rare special moment (VOID stamp or TOTAL ??? scramble) every ~45–120s. Accept: 5min capture shows at least one additional special moment; deterministic per seed. Commit: ecaabcb

- [x] [project:quine-tv] Visual polish `dreamreceipt` (src/channels/dreamreceipt.js): added subtle counter film grain + stronger printer-slot lip/shadow (paper mouth shade) so the scene reads less “flat”. Commit: c13d109

- [x] [project:quine-tv] Visual polish `dreamreceipt` (src/channels/dreamreceipt.js): widen printer body + slot so paper fits; added bevel highlight + screws for interest. Commit: 9c00b79

- [x] [project:quine-tv] Visual polish `dreamreceipt` (src/channels/dreamreceipt.js): longer post-print pause, then receipt falls off-screen. Commit: 582e5c1

- [x] [project:quine-tv] Audio hygiene `dreamreceipt` (src/channels/dreamreceipt.js): make `onAudioOn()` idempotent (stop existing ambience we own first); `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Accept: repeated A toggles never stack; volume stays stable. Commit: efc57d6

- [x] [project:quine-tv] Perf pass `dreamreceipt` (src/channels/dreamreceipt.js): cache background gradients (counter linear + vignette radial) and any paper/slot gradients on init/resize/ctx swap so steady-state `draw*()` creates 0 gradients/frame. Accept: no `create*Gradient()` in steady-state render path. Commit: 05d1221

- [x] [project:quine-tv] Visual polish `dreamreceipt` (src/channels/dreamreceipt.js): coupons are printed on the receipt (flash cue aligned to print head); removed side coupon drop. Commit: 9a18fe3

- 2026-02-11 17:45 — quine-tv: reviewed channel `dreamreceipt` (screenshots/review-dreamreceipt); commit 4549f7f.

- [x] [project:quine-tv] Review channel `cavetorch` (src/channels/cavetorch.js): captured screenshots (0–300s) to `screenshots/review-cavetorch`, did code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups. Commit: 05887db
- [x] [project:quine-tv] Audio hygiene `cavetorch` (src/channels/cavetorch.js): make `onAudioOn()` idempotent (stop existing torch noise we own first); `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Accept: repeated A toggles never stack; volume stays stable. Commit: 2df5567
- [x] [project:quine-tv] Perf pass `cavetorch` (src/channels/cavetorch.js): pre-render wall background (base gradient + warm + tiled texture + vignette) to offscreen on init/resize and blit each frame; cache dynamic light/soot gradients on resize. Accept: `drawWall()` does no nested wall-tiling loops and allocates 0 gradients/frame in steady-state. Commit: 71f67ba
- [x] [project:quine-tv] Perf polish `cavetorch` (src/channels/cavetorch.js): remove per-mote template `fillStyle` allocations by using a fixed `fillStyle` and varying brightness via `globalAlpha` (or cached sprite buckets). Accept: mote loop allocates 0 new color strings per frame. Commit: f467a4a
- [x] [project:quine-tv] Determinism `cavetorch` (src/channels/cavetorch.js): replace per-frame `rand()` flicker/grain with time-scheduled or hashed noise so 30fps vs 60fps yields identical captures (same seed). Accept: same seed yields identical screenshots at 30fps vs 60fps. Commit: 37d6978
- [x] [project:quine-tv] Content polish `cavetorch` (src/channels/cavetorch.js): expand storyboard text variety (more scene titles/rotating captions) and add 1–2 rare special moments beyond the handprint (e.g., bat swarm silhouette / distant rumble + dust fall) scheduled deterministically (~45–120s). Accept: 5min capture shows at least one additional special moment; deterministic per seed. Commit: 53930f8
- [x] [project:quine-tv] Review channel `locksmith` (src/channels/locksmithbench.js): captured screenshots (0–300s) to `screenshots/review-locksmith`, did code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups. Commit: 43ec501
- [x] [project:quine-tv] Perf pass `locksmith` (src/channels/locksmithbench.js): cache gradients (bench wood linear + vignette radial; key body linear; lock body linear; plug metal linear; click/glint sparkle sweeps) on init/resize/ctx swap so steady-state `render()`/draw* calls create 0 gradients/frame. Accept: no `create*Gradient()` in steady-state render path. Commit: a83c824
- [x] [project:quine-tv] Audio hygiene `locksmith` (src/channels/locksmithbench.js): make `onAudioOn()` idempotent (stop existing handles we own first); `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Accept: repeated A toggles never stack; volume stays stable. Commit: 1aaa730
- [x] [project:quine-tv] Perf polish `locksmith` (src/channels/locksmithbench.js): remove per-frame template-literal `rgba(...)` allocations (dust motes + pin clickFlash highlight) by setting fixed `fillStyle` and varying intensity via `globalAlpha` / `ctx.save()` blocks. Accept: dust + highlight loops allocate 0 new color strings per frame. Commit: 16102a1
- [x] [project:quine-tv] Review channel `cloudchamber` (src/channels/cloudchamber.js): captured screenshots (0–300s) to `screenshots/review-cloudchamber`, did code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups. Commit: 1788da4
- [x] [project:quine-tv] Perf pass `cloudchamber` (src/channels/cloudchamber.js): cache background + chamber gradients (bg radial, rim linear, inner vignette radial) on init/resize/ctx swap so steady-state `draw()` calls no `create*Gradient()`. Accept: no `create*Gradient()` in steady-state draw path. Commit: 8864cfb
- [x] [project:quine-tv] Perf polish `cloudchamber` (src/channels/cloudchamber.js): remove per-track template-literal `hsla(...)` allocations in `drawTracks()` by precomputing stroke/shadow color strings per track on spawn and varying fade via `globalAlpha`. Accept: `drawTracks()` allocates 0 new color strings per frame. Commit: 6d6c4fc
- [x] [project:quine-tv] Audio hygiene `cloudchamber` (src/channels/cloudchamber.js): make `onAudioOn()` idempotent (stop any existing handle we own first); `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Accept: repeated A toggles never stack; volume stays stable. Commit: 873596d
- [x] [project:quine-tv] Determinism `cloudchamber` (src/channels/cloudchamber.js): replace `spawnCount = floor(rate*dt + rand()*...)` with a deterministic spawn accumulator/scheduler so 30fps vs 60fps yields identical spawn counts and screenshots. Accept: same seed yields identical captures at 30fps vs 60fps. Commit: 018151d
- [x] [project:quine-tv] Content/UI polish `cloudchamber` (src/channels/cloudchamber.js): replace generic banner text `BIG EVENT` with a deterministic rotating set (e.g., COSMIC RAY / MUON SHOWER / ALPHA HIT) and keep counter width stable (mod 100000). Accept: banner text varies; hits display remains 5 digits indefinitely. Commit: e43a788
- [x] [project:quine-tv] Review channel `dreamreceipt` (src/channels/dreamreceipt.js): captured screenshots (0–300s) to `screenshots/review-dreamreceipt`, did code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups. Commit: 4549f7f

- [x] [project:quine-tv] Review channel `cargomanifest` (src/channels/cargomanifest.js): captured screenshots (0–300s), code/audio pass, added REVIEWED marker, and queued follow-ups. Commit: 754beb1
- [x] [project:quine-tv] UI polish `cargomanifest` (src/channels/cargomanifest.js): remove/replace the in-panel `CH NN` label derived from seed to avoid mismatching OSD. Accept: no misleading channel number appears in the manifest panel. Commit: fe8785f
- [x] [project:quine-tv] Audio hygiene `cargomanifest` (src/channels/cargomanifest.js): `onAudioOn()` defensively stops any prior drone/noise handles we own; `onAudioOff()`/`destroy()` stop+clear everything and clear AudioManager.current when owned. Accept: repeated A toggles never stack; volume stays stable. Commit: b7a207e
- [x] [project:quine-tv] Perf pass `cargomanifest` (src/channels/cargomanifest.js): cache background linear gradient + vignette radial gradient (rebuild on resize/ctx swap). Accept: steady-state `render()` allocates 0 gradients/frame. Commit: b61bab9
- [x] [project:quine-tv] Perf pass `cargomanifest` (src/channels/cargomanifest.js): pre-render the BG grid to an offscreen layer/pattern and blit with drift (remove per-frame grid line loops). Accept: steady-state `drawBG()` does no per-line stroke loops. Commit: 19ce2ed
- [x] [project:quine-tv] Review channel `candlechess` (src/channels/candlechess.js): captured screenshots (0–300s), code/audio pass, added REVIEWED marker, and queued follow-ups. Commit: 531e104
- [x] [project:quine-tv] Audio hygiene `candlechess` (src/channels/candlechess.js): `onAudioOn()` defensively stops any existing ambience before starting; `onAudioOff()`/`destroy()` stop+clear everything and only clear AudioManager.current when owned. Accept: repeated A toggles never stack; volume stays stable. Commit: 365e035
- [x] [project:quine-tv] Perf pass `candlechess` (src/channels/candlechess.js): cache gradients (bg/frame/sheen/vignette/candle) and/or pre-render static layers (board/table) so steady-state `render()` calls no `create*Gradient()`. Accept: no create*Gradient calls in steady-state render path. Commit: 9938437
- [x] [project:quine-tv] Perf pass `candlechess` (src/channels/candlechess.js): remove per-frame `pieces.slice().sort(...)` allocation/sort in `render()` by drawing in stable order without creating new arrays. Accept: steady-state `render()` allocates 0 new arrays per frame. Commit: 8c31aae
- [x] [project:quine-tv] Perf pass `candlechess` (src/channels/candlechess.js): remove per-dust `toFixed()` + per-particle `fillStyle` string creation; use fixed color + `globalAlpha` (or cached sprite). Accept: dust loop allocates 0 strings per frame. Commit: 5382f89
- [x] [project:quine-tv] Determinism `candlechess` (src/channels/candlechess.js): remove `rand()` usage from hot-path dust respawns (update-time boundary triggers) by precomputing a respawn-x table or deterministic hash function. Accept: same seed yields identical dust behavior at 30fps vs 60fps. Commit: a74034f
- [x] [project:quine-tv] UI polish `candlechess` (src/channels/candlechess.js): remove/replace the hardcoded HUD label `CH 01` (currently mismatches OSD). Accept: no incorrect channel number/placeholder appears on screen. Commit: a3ea805
- [x] [project:quine-tv] Review channel `circsafari` (src/channels/circuitsafari.js): captured screenshots (0–300s), code/audio pass, added REVIEWED marker, and queued follow-ups. Commit: 47c55d6
- [x] [project:quine-tv] Perf pass `circsafari` (src/channels/circuitsafari.js): cache background/board gradients + pre-render solder-mask texture (offscreen) so steady-state `render()` allocates 0 gradients/frame and does no per-frame texture dot-loop. Accept: no `create*Gradient()` calls in steady-state render; no nested texture loops in render. Commit: e90a452
- [x] [project:quine-tv] Determinism `circsafari` (src/channels/circuitsafari.js): replace per-frame `rand() < dt*p` “radio bleep” with scheduled next-bleep timers so results are FPS-stable. Accept: same seed yields identical bleeps/visuals at 30fps vs 60fps. Commit: 82d3b2b
- [x] [project:quine-tv] Audio hygiene `circsafari` (src/channels/circuitsafari.js): `onAudioOn()` defensively stops any existing ambience before starting; `onAudioOff()`/`destroy()` stop+clear everything and clear current if owned. Accept: repeated A toggles never stack; volume stays stable. Commit: 814d431
- [x] [project:quine-tv] Time structure `circsafari` (src/channels/circuitsafari.js): add a slower 2–4 min phase cycle (e.g., “quiet survey → active scan → spotlight focus”) + 1–2 rare special moments (glitch pulse / “specimen found” flash) scheduled deterministically (~45–120s). Accept: distinct phases + deterministic per seed. Commit: b1606d9

- [x] [project:quine-tv] Review channel `bughotel` (src/channels/bughotel.js): captured screenshots (0–300s), code/audio pass, added REVIEWED marker, and queued follow-ups. Commit: 58ca27e
- [x] [project:quine-tv] Audio hygiene `bughotel` (src/channels/bughotel.js): `onAudioOn()` defensively stops any existing ambience before starting; `onAudioOff()`/`destroy()` stop+clear everything and clear current if owned. Accept: repeated A toggles never stack; volume stays stable. Commit: 217c253
- [x] [project:quine-tv] Perf pass `bughotel` (src/channels/bughotel.js): cache background + vignette gradients and terrarium gradients (glass/substrate) on init/resize/ctx swap. Accept: steady-state `render()` allocates 0 gradients/frame. Commit: 7cfafec
- [x] [project:quine-tv] Determinism/perf `bughotel` (src/channels/bughotel.js): replace per-frame “macro grain” random arc loop with cached seeded noise layer (offscreen) blitted with slow drift. Accept: no per-frame grain loops/template-rgba strings; same seed yields identical screenshots at 30fps vs 60fps. Commit: 1530c4a
- [x] [project:quine-tv] Visual polish `bughotel` (src/channels/bughotel.js): add 2–3 midground “bug hotel” elements (bark/tubes/leaf litter) + boost critter readability (contrast/scale) without harming OSD. Accept: 60s screenshot reads clearly as a “bug hotel” scene. Commit: e65f909
- [x] [project:quine-tv] Time structure `bughotel` (src/channels/bughotel.js): add 2–4 min phase cycle (quiet→busy→night-lamp) + 1–2 rare special moments (flashlight sweep / dew drop) scheduled deterministically (~45–120s). Accept: distinct phases + deterministic per seed. Commit: f7b5350

- [x] [project:quine-tv] Review channel `musicbox` (src/channels/musicbox.js): captured screenshots (0–300s), code/audio pass, added REVIEWED marker, and queued follow-ups. Commit: b3dc793
- [x] [project:quine-tv] UI polish `musicbox` (src/channels/musicbox.js): remove/replace the in-channel hardcoded `CH 01` label (currently mismatches OSD CH). Accept: no incorrect channel number/placeholder appears on screen. Commit: daad7eb
- [x] [project:quine-tv] Audio hygiene `musicbox` (src/channels/musicbox.js): `onAudioOn()` defensively stops any existing ambience before starting; `onAudioOff()`/`destroy()` stop+clear everything and clear current if owned. Accept: repeated A toggles never stack; volume stays stable. Commit: 54bfee1
- [x] [project:quine-tv] Perf pass `musicbox` (src/channels/musicbox.js): cache gradients created in `drawBackground()` (bg + vignette) and other static-ish gradients (plate/top/cg/hg/sparkle) on init/resize/ctx swap so steady-state `render()` allocates 0 gradients/frame. Accept: no `create*Gradient()` calls in steady-state render path. Commit: dfc7bcc
- [x] [project:quine-tv] Perf pass `musicbox` (src/channels/musicbox.js): pre-render desk wood grain into an offscreen layer on resize and blit in `drawDesk()` (remove per-frame grain stroke loops). Accept: steady-state `drawDesk()` does no per-frame grain loop/strokes. Commit: b8a1877
- [x] [project:quine-tv] Visual polish `musicbox` (src/channels/musicbox.js): improve gear visibility/readability (contrast, subtle highlights, depth) and add 1–2 small workshop details (e.g., pin-strip, tiny calipers/awl) without harming OSD. Accept: 60s screenshot reads clearly as a “music box workshop” scene. Commit: 58d7d0a
- [x] [project:quine-tv] Determinism `musicbox` (src/channels/musicbox.js): remove `rand()` usage from per-frame update hot path where feasible (e.g., slip beeps detune/trigger), or schedule randomness via next-* timers so visuals are FPS-stable. Accept: same seed yields identical screenshots at 30fps vs 60fps. Commit: a8571b0

- [x] [project:quine-tv] Review channel `gumballecon` (src/channels/gumballecon.js): capture screenshots (0–300s), code/audio pass, add REVIEWED marker, and queue follow-ups. Commit: 8e34cd0
- [x] [project:quine-tv] Audio hygiene `gumballecon` (src/channels/gumballecon.js): `onAudioOn()` defensively stops any existing ambience before starting; `onAudioOff()`/`destroy()` stop+clear everything and clear current if owned. Accept: repeated A toggles never stack; volume stays stable. Commit: 2c8a5af
- [x] [project:quine-tv] Perf pass `gumballecon` (src/channels/gumballecon.js): cache background/base/globe gradients (rebuild on resize/ctx swap). Accept: steady-state `drawBackground()`+`drawMachine()` allocate 0 gradients per frame. Commit: b0ce4c0
- [x] [project:quine-tv] Perf pass `gumballecon` (src/channels/gumballecon.js): pre-render diagonal candy stripes into an offscreen layer/pattern and blit with drift (remove per-frame stripe fillRect loop). Accept: steady-state `drawBackground()` does no stripe fillRect loop. Commit: 8e5f8e7
- [x] [project:quine-tv] Determinism `gumballecon` (src/channels/gumballecon.js): replace per-frame `rand()<p` events (demand jitter, restock, coupon spawn/accept) with scheduled next-* times so results are FPS-stable. Accept: same seed yields identical screenshots at 30fps vs 60fps. Commit: 15ab5f8
- [x] [project:quine-tv] UI polish `gumballecon` (src/channels/gumballecon.js): remove/replace the in-channel placeholder label `CH ??` in the title area. Accept: no `??` appears on screen. Commit: 57a0d81
- [x] [project:quine-tv] Time structure `gumballecon` (src/channels/gumballecon.js): add 2–4 min boom→bust→steady cycle + 1–2 rare special moments (e.g., “market crash” / “audit”). Accept: distinct phases + deterministic per seed. Commit: 412b697
- [x] [project:quine-tv] Review channel `bookreturns` (src/channels/bookreturnsorter.js): capture screenshots, code/audio pass, add REVIEWED marker, and queue follow-ups. Commit: TBD
- [x] [project:quine-tv] Audio hygiene `bookreturns` (src/channels/bookreturnsorter.js): `onAudioOn()` defensively stops any existing ambience before starting; `onAudioOff()`/`destroy()` stop+clear everything and clear current if owned. Accept: repeated A toggles never stack; volume stays stable. Commit: f2c426e
- [x] [project:quine-tv] Perf pass `bookreturns` (src/channels/bookreturnsorter.js): cache background linear gradient + scan-beam gradient (rebuild on resize/ctx swap) so steady-state `draw()` allocates 0 gradients/frame. Commit: 392bbd0
- [x] [project:quine-tv] Perf pass `bookreturns` (src/channels/bookreturnsorter.js): replace `books = books.filter(...)` with in-place compaction. Accept: steady-state `update()` allocates 0 new arrays per frame. Commit: 0c55c52
- [x] [project:quine-tv] Determinism/perf `bookreturns` (src/channels/bookreturnsorter.js): remove per-frame `rand()` usage in the hot loop (e.g., divert-mode rotation); precompute per-book targets. Accept: same seed yields identical visuals across different FPS; no `rand()` inside per-book update loop. Commit: 44e765d

- [x] [project:quine-tv] channel `city` buildings should be opaque
- [x] [project:quine-tv] channel `city` lights should be random most of the time and occasionally syncronize or rarely wipe accross the scene
- [x] [project:quine-tv] channel `city` lights still start out doing a wipe pattern accross the scene and are still not random most of the time
- [x] [project:quine-tv] channel `city` random lights should not be so random, while being random only one or two lights should turn on or off every second or two
- [x] [project:quine-tv] channel `bonsai` (src/channels/bonsai.js): tree does not look like a tree - improve bonsai graphics
- [x] [project:quine-tv] channel `baggagecarousel`: bags should not overtake each other
- [x] [project:quine-tv] channel `cctv`: each cctv should show different scenes
- [x] [project:quine-tv] channel `cctv`: each cctv should show different items being detected, object detection effect should be on moving objects
- [x] [project:quine-tv] channel `cctv`: replace moving words with blurred colored emoji
- [x] [project:quine-tv] channel `fire`: fire does not look good - improve flame effect
- [x] [project:quine-tv] channel `arcadeattract`: the panels on the right should show funny/sarcastic advertisments

- [x] [project:quine-tv] Review channel `city` (src/channels/city.js): capture screenshots, code/audio pass, add REVIEWED marker, and queue follow-ups. Commit: b5e0b7e
- [x] [project:quine-tv] Perf pass `city` (src/channels/city.js): cache sky/moon/street gradients on init/resize. Accept: `render()` allocates 0 gradients per frame in steady-state. Commit: 89468fb
- [x] [project:quine-tv] Perf pass `city` (src/channels/city.js): remove per-building template-literal `fillStyle` allocations (set fillStyle once per layer; vary darkness via `globalAlpha`). Accept: building loop sets fillStyle once per layer per frame. Commit: 9b51cdc
- [x] [project:quine-tv] Perf pass `city` (src/channels/city.js): optimize rain draw (no per-drop beginPath+stroke; batch paths or use cached sprite/buckets). Accept: rain draw does not stroke per drop in steady-state. Commit: b3e02a5
- [x] [project:quine-tv] Audio hygiene `city` (src/channels/city.js): `onAudioOn()` defensively stops existing rain/noise; `onAudioOff()`/`destroy()` stop+clear and clear current if owned. Accept: repeated A toggles never stack; volume stays stable. Commit: 2554fa0
- [x] [project:quine-tv] Time structure `city` (src/channels/city.js): add quiet→rush→late-night phase cycle (~2–4 min) + 1–2 rare special moments (e.g., lightning flash / neon sign flicker). Accept: distinct phases + deterministic per seed; specials occur ~45–120s. Commit: 4baca9a
- [x] [project:quine-tv] Review channel `coffeetimer` (src/channels/coffeetimer.js): capture screenshots, code/audio pass, add REVIEWED marker, and queue follow-ups. Commit: e873df1
- [x] [project:quine-tv] Perf pass `coffeetimer` (src/channels/coffeetimer.js): cache background radial gradient + vignette radial gradient (rebuild on resize) so `bg()` allocates 0 gradients per frame in steady-state. Commit: f9f91ac
- [x] [project:quine-tv] Perf pass `coffeetimer` (src/channels/coffeetimer.js): pre-render warm grain scanlines into an offscreen sprite on resize and blit in `bg()` (remove per-frame scanline loop). Accept: `bg()` does no per-line fillRect loops in steady-state. Commit: 4ca40f4
- [x] [project:quine-tv] Perf pass `coffeetimer` (src/channels/coffeetimer.js): cache plate radial gradient (or pre-render plate sprite) so steady-state `render()` allocates 0 gradients per frame for the plate. Commit: ba69a9c
- [x] [project:quine-tv] Audio hygiene `coffeetimer` (src/channels/coffeetimer.js): `onAudioOn()` defensively stops any existing ambience before starting; `onAudioOff()`/`destroy()` stop/clear everything and clear current if set. Accept: repeated A toggles never stack sources; volume stays stable. Commit: 16282f5
- [x] [project:quine-tv] Determinism `coffeetimer` (src/channels/coffeetimer.js): decouple audio randomness from visual PRNG (separate RNG or consume rand consistently) so tuning with the same seed yields identical visuals regardless of audio.enabled toggles. Accept: method/station/track sequence is unchanged by audio on/off. Commit: d023d92

- [x] [project:quine-tv] Review channel `bonsai` (src/channels/bonsai.js): capture screenshots, code/audio pass, add REVIEWED marker, and queue follow-ups.
- [x] [project:quine-tv] Perf pass `bonsai` (src/channels/bonsai.js): cache background gradients (bg linear, lamp glow radial, vignette radial) on init/resize. Accept: `drawBackground()` allocates 0 gradients per frame in steady-state.
- [x] [project:quine-tv] Perf pass `bonsai` (src/channels/bonsai.js): cache bench + pot gradients (bench linear, pot body linear) on init/resize. Accept: `drawBench()` + `drawPot()` allocate 0 gradients per frame in steady-state.
- [x] [project:quine-tv] Perf pass `bonsai` (src/channels/bonsai.js): replace per-leaf-puff radial gradient allocation with cached sprites/buckets (tint via `globalAlpha`/composite). Accept: leaf puff loop allocates 0 gradients per puff per frame in steady-state.
- [x] [project:quine-tv] Audio hygiene `bonsai` (src/channels/bonsai.js): `onAudioOn()` defensively stops any existing ambience before starting; `onAudioOff()`/`destroy()` stop/clear everything and clear current if set. Accept: repeated A toggles never stack sources; volume stays stable.
- [x] [project:quine-tv] Visual polish `bonsai` (src/channels/bonsai.js): rebalance composition (pot/tree x placement + scale) to reduce “empty left” feel while keeping OSD legible. Accept: 10s screenshot shows balanced framing with clear OSD.
- [x] [project:quine-tv] Special moment `bonsai` (src/channels/bonsai.js): add rare leaf-fall or gentle mist-spray event (~45–120s) that resets cleanly and doesn’t overwhelm OSD. Accept: noticeable but tasteful occasional event; deterministic per seed.

- [x] [project:quine-tv] Review channel `beehivespectrum` (src/channels/beehivespectrum.js): capture screenshots, code/audio pass, add REVIEWED marker, and queue follow-ups.
- [x] [project:quine-tv] Perf pass `beehivespectrum` (src/channels/beehivespectrum.js): cache background linear gradient + vignette radial gradient (rebuild on resize) so `drawBackground()` allocates 0 gradients per frame in steady-state.
- [x] [project:quine-tv] Perf pass `beehivespectrum` (src/channels/beehivespectrum.js): avoid per-hex template-literal `hsla(...)` allocations in honeycomb layers (set `strokeStyle` once per frame; vary alpha via `globalAlpha`). Accept: honeycomb loop creates 0 style strings per cell per frame.
- [x] [project:quine-tv] Perf pass `beehivespectrum` (src/channels/beehivespectrum.js): cache dance-floor glow radial gradient + waterfall sheen gradient (rebuild on resize / band switch). Accept: `drawDanceFloor()` and `drawWaterfallPanel()` allocate 0 gradients per frame in steady-state.
- [x] [project:quine-tv] Correctness pass `beehivespectrum` (src/channels/beehivespectrum.js): make waterfall decay/breathing dt-based (remove hardcoded ~60fps constants). Accept: visual pacing is stable across variable dt/FPS.
- [x] [project:quine-tv] Audio hygiene `beehivespectrum` (src/channels/beehivespectrum.js): `onAudioOn()` defensively stops any existing drone before starting; `onAudioOff()`/`destroy()` stop/clear everything and clear current if set. Accept: repeated A toggles never stack; volume stays stable.
- [x] [project:quine-tv] Perf pass `beehivespectrum` (src/channels/beehivespectrum.js): replace `trails = trails.filter(...)` with in-place compaction or a ring buffer. Accept: steady-state `update()` allocates no new arrays per frame.

- [x] [project:quine-tv] Review follow-up `baggagecarousel` (src/channels/baggagecarousel.js): audio hygiene — make `onAudioOn()` defensively stop any existing ambience before starting; ensure `onAudioOff()` + `destroy()` stop/clear everything (and clear current if set). Accept: repeated A toggles never stack sources; volume stays stable.
- [x] [project:quine-tv] Perf pass `baggagecarousel` (src/channels/baggagecarousel.js): cache floor gradients + vignette + belt/post gradients on init/resize; reuse in render. Accept: `drawFloor()`+`drawCarousel()` allocate 0 gradients per frame in steady-state.
- [x] [project:quine-tv] Perf pass `baggagecarousel` (src/channels/baggagecarousel.js): pre-render floor tile grid to offscreen and blit with drift offset (remove per-frame tile-line loops). Accept: `drawFloor()` does no per-tile line loops in steady-state.
- [x] [project:quine-tv] Perf polish `baggagecarousel` (src/channels/baggagecarousel.js): avoid per-mark rgba/template `strokeStyle` allocations in moving belt ticks — set `strokeStyle` once and vary intensity via `globalAlpha`. Accept: belt tick loop sets `strokeStyle` once per frame.
- [x] [project:quine-tv] Visual polish `baggagecarousel` (src/channels/baggagecarousel.js): add subtle “camera” vibe (scanlines/noise/auto-exposure) and/or slightly zoom carousel to use more frame, without harming OSD legibility. Accept: 60s screenshot shows fuller composition + clear OSD.

- [x] [project:quine-tv] Add a channel guide overlay (toggle with G)
- [x] [project:quine-tv] Add a "Scan" button/shortcut that auto-switches channels every 30 seconds (toggle on/off)
- [x] [project:quine-tv] Review follow-up `antfarm` (src/channels/antfarmtransit.js): audio hygiene — make `onAudioOn()` defensively stop any existing ambience before starting; ensure `onAudioOff()` + `destroy()` stop/clear everything (and clear current if set). Accept: repeated A toggles never stack sources; volume stays stable.
- [x] [project:quine-tv] Perf pass `antfarm` (src/channels/antfarmtransit.js): cache background gradients + speckle texture + vignette (offscreen canvas on init/resize) and blit in `drawBackground()`. Accept: `drawBackground()` allocates 0 gradients per frame and does no per-frame speckle-dot loop in steady-state.
- [x] [project:quine-tv] Perf pass `antfarm` (src/channels/antfarmtransit.js): avoid per-ant color string/template allocation in `drawAnts()` (precompute body color per ant on spawn, or use `globalAlpha`+fixed palette). Accept: `drawAnts()` does not create new template literal strings per ant per frame.
- [x] [project:quine-tv] Visual polish `antfarm` (src/channels/antfarmtransit.js): improve ant readability (slightly larger size and/or subtle highlight) without harming OSD legibility. Accept: ants are clearly visible at a glance in 60s screenshot; OSD remains uncluttered.

- [x] [project:quine-tv] Review follow-up `analogdarkroom` (src/channels/analogdarkroom.js): audio hygiene — make `onAudioOn()` defensively stop any existing ambience before starting; ensure `onAudioOff()` + `destroy()` stop/clear everything. Accept: repeated A toggles never stack sources; volume stays stable.
- [x] [project:quine-tv] Perf pass `analogdarkroom` (src/channels/analogdarkroom.js): cache static gradients on resize/init (bg, vignette, tray liquid, paper base) and reuse in `draw()`. Accept: `draw()` creates 0 gradients per frame in steady-state.
- [x] [project:quine-tv] Perf pass `analogdarkroom` (src/channels/analogdarkroom.js): avoid per-bubble `fillStyle` string allocations — set `fillStyle` once and vary intensity via `globalAlpha`. Accept: bubble loop sets `fillStyle` once per frame.
- [x] [project:quine-tv] Perf polish `analogdarkroom` (src/channels/analogdarkroom.js): pre-render the print “grain” layer for each new `print` (offscreen canvas) and blit it during develop, instead of drawing ~140 arcs per frame. Accept: grain render becomes a single `drawImage` per frame.

- [x] [project:quine-tv] Review follow-up `cctv` (src/channels/cctv.js): replace per-frame `new Date().toLocaleTimeString()` with deterministic seeded clock (base time + t) computed once per frame. Accept: no Date() calls in renderCam; timestamp still looks “real”; deterministic per seed.
- [x] [project:quine-tv] Audio hygiene for `cctv` (src/channels/cctv.js): make `onAudioOn()` defensively stop existing noise before starting; clear current on off/destroy. Accept: repeated A toggles never stack noise sources.
- [x] [project:quine-tv] Perf pass for `cctv` (src/channels/cctv.js): eliminate per-frame radial gradient allocation (use cached offscreen light sprite or prebuilt gradients) + avoid repeated fillStyle in dot loop. Accept: renderCam creates 0 gradients per frame; fewer style changes.
- [x] [project:quine-tv] Add time structure to `cctv`: quiet → patrol → busy window over ~2–4 minutes with seeded variation in motion frequency/box count. Accept: distinct phases, deterministic per seed.
- [x] [project:quine-tv] Add 1–2 rare “special moments” to `cctv`: brief signal loss/static + reconnect overlay (or “CAM SWITCH” event). Accept: tasteful, doesn’t wreck OSD legibility; occurs occasionally (~45–120s).

### Reviews (completed)
- [x] [project:quine-tv] Review channel `aquarium` (src/channels/aquarium.js): capture screenshots, code/audio pass, add REVIEWED marker, and add follow-ups to queue.
- [x] [project:quine-tv] Review channel `cctv` (src/channels/cctv.js): capture screenshots, code/audio pass, add REVIEWED marker, and add follow-ups to queue.
- [x] [project:quine-tv] Review channel `analogdarkroom` (src/channels/analogdarkroom.js): capture screenshots, code/audio pass, add REVIEWED marker, and add follow-ups to queue.
- [x] [project:quine-tv] Review channel `fire` (src/channels/fireplace.js): capture screenshots, code/audio pass, add REVIEWED marker, and add follow-ups to queue.
- [x] [project:quine-tv] Review channel `bookbind` (src/channels/bookbindingbench.js): capture screenshots, code/audio pass, add REVIEWED marker, and add follow-ups to queue. Commit: 1716c7a

- [x] [project:quine-tv] Review channel `antfarm` (src/channels/antfarmtransit.js): capture screenshots, code/audio pass, add REVIEWED marker, and add follow-ups to queue.
### Review follow-ups — `aquarium`
- [x] [project:quine-tv] Fix fish vertical motion accumulating drift in `src/channels/aquarium.js` (store baseY per fish and compute y = baseY + sin(...) * amp). Accept: fish swim with smooth periodic motion and don’t “walk” to clamp edges over long runs.
- [x] [project:quine-tv] Reduce hot-path allocations in `src/channels/aquarium.js` by caching: (1) water gradient, (2) vignette gradient, (3) bubble gradients (bucket by radius). Accept: render() no longer creates a new gradient per bubble per frame.
- [x] [project:quine-tv] Add time-structure phases to `aquarium` (e.g., calm → schooling → deep-glow) driven by a timer and seeded variation. Accept: clearly distinct phases over ~2–4 minutes, deterministic per seed.
- [x] [project:quine-tv] Add 1–2 “special moments” to `aquarium` (e.g., bioluminescent plankton bloom, passing silhouette/jellyfish) with rare trigger and tasteful glow. Accept: visible occasional event without distracting from OSD legibility.
- [x] [project:quine-tv] Audio hygiene pass for `aquarium` (ensure toggling audio doesn’t leak/stack sources; consider clearing current on off). Accept: repeated on/off toggles never increase volume/instances; destroy stops everything.

### Review follow-ups — `bookbind`
- [x] [project:quine-tv] Perf pass `bookbind` (src/channels/bookbindingbench.js): cache bench wood + spotlight gradients on init/resize; reuse in `drawBench()`. Accept: `drawBench()` allocates 0 gradients per frame in steady-state. Commit: a08126d
- [x] [project:quine-tv] Perf pass `bookbind` (src/channels/bookbindingbench.js): avoid per-signature `createLinearGradient` in `drawStack()` (pre-render signature stack layer to offscreen on init/resize, or cache gradients per signature). Accept: steady-state `drawStack()` allocates 0 gradients per signature per frame. Commit: 814446b
- [x] [project:quine-tv] Perf pass `bookbind` (src/channels/bookbindingbench.js): replace `dust = dust.filter(...)` with in-place compaction. Accept: stamp dust update allocates 0 new arrays per frame. Commit: d4dc896
- [x] [project:quine-tv] Audio hygiene `bookbind` (src/channels/bookbindingbench.js): onAudioOn defensively stop existing ambience; onAudioOff/destroy stop+clear and clear AudioManager.current when owned. Accept: repeated A toggles never stack; volume stays stable. Commit: a817916
- [x] [project:quine-tv] Visual polish `bookbind` (src/channels/bookbindingbench.js): add 2–3 recognizable tools (needle+thread, awl, glue pot/brush, press board) around the stack for stronger identity + depth; keep OSD legible. Accept: 10s screenshot reads “bookbinding bench” immediately. Commit: 74e0ea3
- [x] [project:quine-tv] Special moment `bookbind` (src/channels/bookbindingbench.js): add rare “perfect stamp” gold-foil glint / wax seal sheen event (~45–120s) that resets cleanly and is deterministic per seed. Accept: tasteful occasional event; deterministic. Commit: 26af2ba

### Review follow-ups — `fire`
- [x] [project:quine-tv] `fire` (src/channels/fireplace.js): audio hygiene — make `onAudioOn()` defensively stop any existing crackle/noise before starting; ensure `onAudioOff()` + `destroy()` stop/clear everything. Accept: repeated A toggles never stack sources; volume stays stable.
- [x] [project:quine-tv] `fire` (src/channels/fireplace.js): perf pass — cache static background/hearth/log layer(s) (offscreen canvas on init/resize) so steady-state `render()` creates 0 gradients for these parts. Accept: background/hearth/log layers draw via `drawImage` and allocate 0 gradients per frame.
- [x] [project:quine-tv] `fire` (src/channels/fireplace.js): perf pass — replace per-spark radial gradients with cached spark sprites (bucket by radius; tint via globalAlpha/composite). Accept: sparks loop creates 0 gradients per frame.
- [x] [project:quine-tv] `fire` (src/channels/fireplace.js): add time-structure (calm → roaring → embers) over ~2–4 minutes with seeded variation (spark count, flame height, glow). Accept: distinct phases + deterministic per seed.
- [x] [project:quine-tv] `fire` (src/channels/fireplace.js): add 1–2 rare “special moments” (log shift + ember burst / gust flare) that reset cleanly and don’t overwhelm OSD. Accept: tasteful, seeded, occurs ~45–120s.

### Refill ideas (auto)
- [x] [project:quine-tv] Channel idea: **Late Night Rubber Duck Debugging** — Cozy late-night "code confessionals" where creators talk through bugs and fixes in real time.
- [x] [project:quine-tv] Channel idea: **Kitchen Science Club** — Short, safe experiments you can do with pantry ingredients, explained like a mini-doc.
- [x] [project:quine-tv] Channel idea: **One Tool, Ten Uses** — Each episode picks one everyday tool and shows ten clever applications.
- [x] [project:quine-tv] Channel idea: **Micro-Mysteries** — 5–8 minute mystery stories with a twist and a final clue recap.
- [x] [project:quine-tv] Channel idea: **The Tiny Travel Desk** — Desk-based travel: maps, street footage, local food, and history in bite-size segments.
- [x] [project:quine-tv] Channel idea: **Fix-It ASMR** — Calm, close-up repair sessions (electronics, zips, chairs) with minimal talking and satisfying sounds.
- [x] [project:quine-tv] Channel idea: **History’s Weird Patents** — A fast tour of bizarre inventions that were actually patented, with quick context.
- [x] [project:quine-tv] Channel idea: **Speed-Run Cooking** — One recipe, one pan, one timer: efficient cooking with clear steps and zero fluff.
- [x] [project:quine-tv] Channel idea: **The 3-Minute Music Theory** — Small music theory concepts explained visually, each in three minutes.
- [x] [project:quine-tv] Channel idea: **Future Archaeology** — Speculative "museum tours" of modern objects as if discovered 1,000 years from now.

### Refill ideas (auto) — 2026-02-07
- [x] [project:quine-tv] Channel idea: **Circuit Safari** — Guided tours through everyday electronics (teardowns, signals, parts) with a playful nature-doc narration style.
- [x] [project:quine-tv] Channel idea: **Rainy Window Radio** — Lo-fi visual loops of rain-on-glass + tiny “radio dial” that flips between mellow micro-genres.
- [x] [project:quine-tv] Channel idea: **Small Town UFO Hotline** — Call-in style faux radio drama: odd sightings, skeptical hosts, escalating lore, and periodic “commercials.”
- [x] [project:quine-tv] Channel idea: **Origami After Hours** — Slow, relaxing paperfold sessions with step highlights and satisfying crease sounds (optional).
- [x] [project:quine-tv] Channel idea: **Minute Museum** — One artwork/object per minute: quick context, one detail zoom, one takeaway.
- [x] [project:quine-tv] Channel idea: **Bonsai Time Machine** — Calm plant care + subtle time-lapse jumps that show growth, pruning, wiring, and tiny seasonal changes.
- [x] [project:quine-tv] Channel idea: **Retro Boot Sequence** — Vintage computer boot-ups, UI tours, and “software archaeology” with CRT shaders and disk sounds (optional).
- [x] [project:quine-tv] Channel idea: **Subway Map Stories** — A transit map becomes a story engine: pick a line, meet a character, follow stops, reveal a twist.
- [x] [project:quine-tv] Channel idea: **Tidy Desk Reset** — 10-minute desk clean/organize loops with checklist overlays and gentle ASMR (optional).
- [x] [project:quine-tv] Channel idea: **Weather Factory** — Build-a-forecast visuals: clouds, pressure, fronts, and quirky “weather widgets” that explain what’s happening.

### Refill ideas (auto) — 2026-02-07 09:00
- [x] [project:quine-tv] Channel idea: **Analog Signal Garden** — Oscilloscope-style “flowers” that bloom from waveforms (sine/saw/FM) with gentle HUD labels.
- [x] [project:quine-tv] Channel idea: **The Lost Instruction Manual** — A faux manual page flips every minute, explaining absurd devices with diagrams and safety warnings.
- [x] [project:quine-tv] Channel idea: **Midnight Library Index** — Card-catalog drawers and index cards reveal micro-stories, one card at a time.
- [x] [project:quine-tv] Channel idea: **Tiny Orchestra Workshop** — Build-a-band visuals: each loop “adds” an instrument with simple notation and moving parts.
- [x] [project:quine-tv] Channel idea: **Mapmaker’s Weathered Atlas** — Hand-drawn map pages with animated routes, marginalia, and little historical footnotes.
- [x] [project:quine-tv] Channel idea: **Minimalist Workout Clock** — Silent interval training prompts (stretch/strength/mobility) with clean typography and a big timer.
- [x] [project:quine-tv] Channel idea: **Robot Petting Zoo** — Cute micro-robots exhibit simple behaviors (curious/shy/playful) in a stylized enclosure UI.
- [x] [project:quine-tv] Channel idea: **Planetarium Postcards** — Rotating “postcards” from planets/moons with a single wow-fact and slow starfield parallax.
- [x] [project:quine-tv] Channel idea: **Studio Foley Lab** — Close-up “sound recipes” (steps + props) for common effects: rain, footsteps, doors, etc.
- [x] [project:quine-tv] Channel idea: **Railway Timetable ASMR** — Flipping timetable pages, platform boards, and rolling departures with cozy, orderly motion.

### Refill ideas (auto) — 2026-02-07 14:30
- [x] [project:quine-tv] Channel idea: **Pocket Planet Weather** — Tiny rotating planet with playful fronts, pressure rings, and one “wow” fact.
- [x] [project:quine-tv] Channel idea: **Satisfying Mechanisms** — Slow cams of linkages, gears, cams, and escapements with labeled motion paths.
- [x] [project:quine-tv] Channel idea: **Bug Hotel Live** — Cozy macro “wildlife cam” of tiny insects with faux field-notes and sightings log.
- [x] [project:quine-tv] Channel idea: **Type Specimen Theatre** — Fonts as characters: each loop “performs” a mood with kerning jokes and glyph close-ups.
- [x] [project:quine-tv] Channel idea: **Ocean Floor Postcards** — Gentle parallax seafloor scenes + one creature fact per card; slow drifting silt.
- [x] [project:quine-tv] Channel idea: **Coffee Timer Radio** — Brew-method prompts (V60/AeroPress/etc.) with a big timer and tiny “station” info.
- [x] [project:quine-tv] Channel idea: **The Cozy Compiler** — Code snippets “compile” into little animations; errors become punchlines and fixes.
- [x] [project:quine-tv] Channel idea: **Found Footage: Miniature Worlds** — Diorama scenes shot like a documentary: labels, scale bars, and gentle pans.
- [x] [project:quine-tv] Channel idea: **Museum of Obsolete Media** — Rotating VHS/floppy/minidisc exhibits with quick history and UI-style metadata.
- [x] [project:quine-tv] Channel idea: **Night Signals** — Railway/aviation/maritime signal lamps + short “what it means” captions in the dark.

### Refill ideas (auto) — 2026-02-07 21:01
- [x] [project:quine-tv] Channel idea: **Packet Sniffer FM** — Turn packets into a neon spectrum: tune TCP/UDP/ICMP “stations” with bursts, waterfalls, and protocol IDs.
- [x] [project:quine-tv] Channel idea: **Cloud Chamber Live** — Particle-track wisps drift across a dark chamber with a rolling counter and occasional ‘big event’ flashes.
- [x] [project:quine-tv] Channel idea: **Sand Table Cartography** — Zen sand table draws evolving topographic patterns: ridges, rivers, and compass headings across timed phases.
- [x] [project:quine-tv] Channel idea: **Analog Photo Darkroom** — Red-light darkroom loop: expose → agitate → reveal; prints slowly appear with a tiny timer HUD.
- [x] [project:quine-tv] Channel idea: **Candlelit Chess Engine** — A calm chessboard plays a slow game: moves, eval bar, and endgame ‘special moments’ (sacrifice, promotion).
- [x] [project:quine-tv] Channel idea: **Mechanical Pencil Geometry** — Procedural drafting: compass arcs, ruler lines, construction marks; phases build a clean geometric diagram.
- [x] [project:quine-tv] Channel idea: **Dream Receipt Printer** — Thermal printer spits surreal receipts; barcode glitches, subtotal jokes, and periodic ‘coupon drop’ moments.
- [x] [project:quine-tv] Channel idea: **Tiny Volcano Observatory** — Mini crater scene with seismograph strip + gas plume; timed tremors escalate to a gentle ash puff.
- [x] [project:quine-tv] Channel idea: **Bookbinding Bench ASMR** — Close-up bookbinding: fold signatures, stitch, press, stamp; minimal UI with satisfying, orderly motion.
- [x] [project:quine-tv] Channel idea: **Glassblower’s Studio Loop** — Molten glass forms on the pipe: heat, gather, blow, shape; glowing gradients and occasional spark pop.

### Refill ideas (auto) — 2026-02-08 02:30
- [x] [project:quine-tv] Channel idea: **Post Office Sorting Desk** — Crisp overhead of a sorting bench: stamps, postmarks, route labels, and bins that fill/empty in timed waves.
- [x] [project:quine-tv] Channel idea: **Neon Night Market Ledger** — A glowing stall scene with handwritten receipts, price tags, and rotating ‘deal of the minute’ cards; rain-slick reflections.
- [x] [project:quine-tv] Channel idea: **Tiny Lighthouse Watch** — Coastal vignette: rotating Fresnel beam, fog banks, ship silhouettes; timed storm pulses and a calm dawn reset.
- [x] [project:quine-tv] Channel idea: **Airport Baggage Carousel Cam** — Looping carousel with luggage tags, destination flips, occasional ‘lost bag’ alert card; satisfying conveyor motion.
- [x] [project:quine-tv] Channel idea: **Subterranean Mushroom Lab** — Bioluminescent fungus terrariums that ‘grow’ across phases; microscope inset + spore-count ticker; moody cave parallax.
- [x] [project:quine-tv] Channel idea: **Gumball Machine Economics** — Coins drop, gumballs dispense, stock levels & tiny charts animate; periodic ‘price spike’ gag and coupon tokens.
- [x] [project:quine-tv] Channel idea: **Paper City Fold-Out** — A papercraft city unfolds in segments: streets pop up, lights turn on; occasional paper-crane flyover ‘special moment’.
- [x] [project:quine-tv] Channel idea: **Semaphore Signal School** — Clean training board teaches flag/semaphore letters in timed lessons; quiz flashes + ‘message received’ end card.
- [x] [project:quine-tv] Channel idea: **Snow Globe Weather Lab** — A desk snow-globe becomes a tiny climate sim: fronts, pressure rings, and ‘shake’ events that reset snowfall patterns.
- [x] [project:quine-tv] Channel idea: **Domino Factory Floor** — Top-down domino layout machine builds patterns → triggers cascades; phase-based motifs (spiral, wave, logo) with slow cams.

### Refill ideas (auto) — 2026-02-08 08:00
- [x] [project:quine-tv] Channel idea: **Kintsugi Clinic** — Broken pottery repaired with gold seams; crack→glue→dust→polish phases with glint “special moments”.
- [x] [project:quine-tv] Channel idea: **Telephone Switchboard Nights** — Old-school operator board: patch cords, blinking calls, timed rush hours, and occasional “mystery call” glitch.
- [x] [project:quine-tv] Channel idea: **Container Port Logistics** — Crane choreography stacking containers on a yard map; ship arrival phases, reroutes, and a satisfying end-of-shift sweep.
- [x] [project:quine-tv] Channel idea: **Weather Balloon Ascent** — Balloon climbs through atmosphere layers with live sensor HUD; burst→parachute descent as a looping finale.
- [x] [project:quine-tv] Channel idea: **Stargazer’s Logbook** — Telescope view + handwritten notes: target→track→sketch phases, with timed meteor streaks and focus “breathing”.
- [x] [project:quine-tv] Channel idea: **Haunted Floorplan Tour** — Blueprint map slowly explores rooms; annotations appear, lights flicker, and one periodic “door slam” event resets the route.
- [x] [project:quine-tv] Channel idea: **Paper Marbling Studio** — Ink drops swirl on water, comb patterns form, paper lifts to reveal prints; occasional “perfect pull” moment.
- [x] [project:quine-tv] Channel idea: **Arcade Attract Mode Archives** — CRT arcade attract loops with high-score initials, demo play, coin-in flashes, and rotating cabinet art cards.
- [x] [project:quine-tv] Channel idea: **Deep Sea Sonar Survey** — Submarine sonar sweep + range rings; contacts bloom/fade, classification tags, and a rare “big echo” event.
- [x] [project:quine-tv] Channel idea: **Model Railway Control Room** — Miniature rail network with block signals and turnout toggles; schedule phases and satisfying signal clears.

### Refill ideas (auto) — 2026-02-08 14:00
- [x] [project:quine-tv] Channel idea: **Timekeeper’s Bench ASMR** — Watchmaker bench loop: sort parts → assemble → regulate; loupe inset + “perfect tick” moment.
- [x] [project:quine-tv] Channel idea: **Weatherfax Terminal** — Retro weatherfax receiver prints synoptic charts; phases: receive → print → annotate → archive with dot-matrix vibes.
- [x] [project:quine-tv] Channel idea: **Ant Farm Transit Authority** — Ant tunnels as subway lines; rush-hour waves, route map UI, and tiny “service change” alerts.
- [x] [project:quine-tv] Channel idea: **Subsea Cable Pulse Monitor** — Ocean cross-section with repeater nodes; light pulses travel, packet storms, rare “fault isolate” sequence.
- [x] [project:quine-tv] Channel idea: **Botanical Blueprint Studio** — Drafting-table plant schematics (venation/cross-sections) drawn in timed layers with crisp label callouts.
- [x] [project:quine-tv] Channel idea: **Rooftop Water Tank Nights** — City rooftops with gauges + pump cycles; maintenance walk-bys and occasional storm lightning reset.
- [x] [project:quine-tv] Channel idea: **Museum Diorama Restoration** — Miniature exhibit restoration: dust → paint-match → brush → reveal; before/after flip “special moment”.
- [x] [project:quine-tv] Channel idea: **Mailroom Tube Network** — Pneumatic tube canisters zip between stations; routing map UI, jam-clear event, end-of-shift sweep.
- [x] [project:quine-tv] Channel idea: **Desert Radio Telescope Array** — Dish field tracks targets; interference bursts, scanning sweeps, and rare “wow” transient spike.
- [x] [project:quine-tv] Channel idea: **Vending Machine Oracle** — Items reshuffle like tarot; fortunes on tiny receipts, rare “mystery spiral” glitch, cozy neon hum.

### Refill ideas (auto) — 2026-02-08 20:00
- [x] [project:quine-tv] Channel idea: **Dungeon Cartographer’s Desk** — A candlelit map table draws a dungeon in phases; rooms reveal, traps ping, and an occasional “secret door” shimmer resets the route.
- [x] [project:quine-tv] Channel idea: **Robotic Arm Ballet** — Industrial robot arms perform choreographed loops on a stage; safety HUD, timed “maintenance pause,” and a rare perfectly-synced finale.
- [x] [project:quine-tv] Channel idea: **Neon Sign Repair Bench** — Diagnose → bend → seal → light cycles for neon tubes; crackle tests, flicker fixes, and a satisfying “steady glow” moment.
- [x] [project:quine-tv] Channel idea: **Exposure Triangle School** — Vintage camera + swinging light-meter needle teaches ISO/shutter/aperture in timed lessons with a clean diagram overlay and test shots.
- [x] [project:quine-tv] Channel idea: **Mythical Creature Field Station** — A ranger desk logs cryptid “evidence” (casts, sketches, maps); periodic camera glitches and a calm “specimen filed” end card.
- [x] [project:quine-tv] Channel idea: **Ship-in-a-Bottle Workshop** — Slow assembly loop inside a glass bottle: hull → mast → rigging → reveal; tiny waves + “perfect knot” special moment.
- [x] [project:quine-tv] Channel idea: **Constellation Stitch‑Along** — Embroidery hoop stitches star patterns in phases; thread shimmer, gentle parallax fabric weave, and an occasional “gold thread” highlight.
- [x] [project:quine-tv] Channel idea: **Wind Tunnel Toy Lab** — Smoke lines visualize airflow over little shapes; lift/drag HUD, phase-based test series, and a rare “stall recovery” swoop.
- [x] [project:quine-tv] Channel idea: **Forge & Anvil Rhythm** — Cozy smithy loop: heat → hammer → quench → polish; sparks, glow gradients, and a timed “perfect ring” moment.
- [x] [project:quine-tv] Channel idea: **Miniature Paint Swatch Factory** — Pigments mix into satisfying swatches; palette cards slide, harmony grids animate, and a “perfect match” lock-in moment.

### Refill ideas (auto) — 2026-02-09 02:00
- [x] [project:quine-tv] Channel idea: **Geologist’s Polarized Microscope** — Thin-section slides under rotating polarizers: interference colors, grain labels, and timed “phase flip” moments.
- [x] [project:quine-tv] Channel idea: **Laser Cutter Cutfile Studio** — Vector paths preview → cut passes → peel reveal; smoky glow, kerf lines, and a “perfect pop-out” finale.
- [x] [project:quine-tv] Channel idea: **Airport Tower Strip Board** — Flight strips slide/stack across phases (arrivals/deps/holds), with calm “handoff” highlights and occasional runway-change events.
- [x] [project:quine-tv] Channel idea: **Book Return Sorting Machine** — Conveyor intake → scan → divert to bins; library metadata HUD, jam-clear interlude, and end-of-shift tidy sweep.
- [x] [project:quine-tv] Channel idea: **Reel‑to‑Reel Tape Splicing Desk** — Spool tension, VU meters, cut→splice→playback loops, with a rare “clean edit” sparkle moment.
- [x] [project:quine-tv] Channel idea: **Cipher Wheel Classroom** — Rotating cipher discs teach quick puzzles; timed quiz flashes, “message decoded” stamp, and subtle chalkboard motion.
- [x] [project:quine-tv] Channel idea: **Streetlight Night Repair Crew** — Lift basket rises, swap bulb/ballast, flicker tests, then a satisfying steady-glow street reset.
- [x] [project:quine-tv] Channel idea: **Beehive Spectrum Radio** — Honeycomb parallax with waggle-dance traces rendered as a spectrum/waterfall; occasional “queen check” special moment.
- [x] [project:quine-tv] Channel idea: **Mechanical Music Box Workshop** — Pin drum patterns “compose” a melody: align → punch → test; gear motion layers and a perfect-tune finale.
- [x] [project:quine-tv] Channel idea: **Observatory Dome Scheduler** — Big dome silhouette rotates through targets; calendar cards, cloud-cover rolls, and a meteor-window “go” event.

### Refill ideas (auto) — 2026-02-09 07:30
- [x] [project:quine-tv] Channel idea: **Microfilm Archive Reader** — Dim reader desk: reels advance, zoom window scans frames, and a periodic “found note” highlight.
- [x] [project:quine-tv] Channel idea: **Locksmith’s Pin‑Tumbler Bench** — Key blank cutting → pin stack alignment → satisfying turn; occasional “perfect click” moment.
- [x] [project:quine-tv] Channel idea: **Starship Cargo Manifest** — Futuristic bay UI: scan pulses, routing arrows, and rare “anomaly container” quarantine sequence.
- [x] [project:quine-tv] Channel idea: **Seed Vault Inventory** — Drawer pull → packet inspect → reseal; humidity/temp gauges drift with a calm end-of-shift tally.
- [x] [project:quine-tv] Channel idea: **Ceramic Kiln Firing Curve** — Glow-through peep hole + rising temperature chart; bisque→glaze phases and a “cone bend” special moment.
- [x] [project:quine-tv] Channel idea: **Elevator Control Panel Dreams** — Retro floor indicator + call queue; lights chase, service mode interlude, and a satisfying arrival chime.
- [x] [project:quine-tv] Channel idea: **Telegraph Key Practice Hour** — Morse pulses on a paper tape; timed decode quizzes and a “message received” stamp finale.
- [x] [project:quine-tv] Channel idea: **Street Map Folding Gym** — Paper map unfolds, creases highlight, route animates; rare “perfect fold” snap-to-grid moment.
- [x] [project:quine-tv] Channel idea: **Nanobot Repair Swarm** — Microscope view: swarm scans → patches → polishes a crack; occasional sparkle “repair complete.”
- [x] [project:quine-tv] Channel idea: **Ice Core Analysis Lab** — Stratified core rotates under light; sample cut marks, isotope chart wiggles, and a “volcanic layer” highlight.


### Refill ideas (auto) — 2026-02-09 13:30
- [x] [project:quine-tv] Channel idea: **Marble Run Dispatch** — Marble-run routing network: SORT → EXPRESS → JAM CLEAR phases with switch-gates, route labels, and a satisfying cascade finale.
- [x] [project:quine-tv] Channel idea: **Neon Laundromat Spin Cycle** — Cozy neon laundromat: wash→rinse→spin→dry cycles with reflections, timer HUD, and periodic “lost sock” alerts.
- [x] [project:quine-tv] Channel idea: **Cave Torch Storyboard** — Torch-lit cave wall where paintings animate into micro-scenes; drip parallax, charcoal dust motes, and a rare handprint flash moment.
- [x] [project:quine-tv] Channel idea: **Vinyl Pressing Plant** — Press cycle visuals: heat→press→cool→sleeve with label stamps, waveform QC panel, and a “perfect press” glint.
- [x] [project:quine-tv] Channel idea: **Sushi Conveyor Night Shift** — Conveyor belt of plates + order tickets: prep→plate→serve rush-hour waves with a rare “chef’s special” sparkle card.
- [x] [project:quine-tv] Channel idea: **Signal Flag Regatta** — Tiny sailboats communicate with semaphore/flag codes; lesson→quiz→message received phases over calm ocean parallax.
- [x] [project:quine-tv] Channel idea: **Mini Greenhouse Climate Console** — Greenhouse gauges drive mist/fan/heat cycles; subtle plant growth phases and periodic dew-burst sparkles.
- [x] [project:quine-tv] Channel idea: **Snowplow Route Planner** — Winter city grid map with plow routes, salt hopper gauge, snowfall overlay, reroute events, and an end-of-shift cleared-map sweep.
- [x] [project:quine-tv] Channel idea: **Harbor Tug Dispatch** — Port map dispatch: tug lines guide ship silhouettes; tide gauge + squall pulses, with a satisfying docked “all clear” stamp.
- [x] [project:quine-tv] Channel idea: **Vintage Cash Counter** — Bank back-office sorter: count→bundle→audit phases with note/coin motion, fraud-detect stamps, and end-of-day reconciliation card.


- [x] [project:quine-tv] Review channel `cipherwheel` (src/channels/cipherwheel.js): captured screenshots (0–300s), code/audio pass, added REVIEWED marker, and queued follow-ups. Commit: 53725f8
- [x] [project:quine-tv] Perf pass `cipherwheel` (src/channels/cipherwheel.js): cache wheel disk radial gradient(s) + vignette gradient (rebuild on resize/ctx swap). Accept: steady-state `render()`/`drawWheel()` allocate 0 gradients/frame. Commit: e9ef6f5
- [x] [project:quine-tv] Perf pass `cipherwheel` (src/channels/cipherwheel.js): avoid per-letter and per-dust template-literal `rgba(...)` allocations (set `fillStyle` once per loop; vary brightness via `globalAlpha`). Accept: letter loops and dust loop allocate 0 style strings per frame. Commit: 5bc06e1
- [x] [project:quine-tv] Visual polish `cipherwheel` (src/channels/cipherwheel.js): add 2–3 classroom/desk details to reduce empty space (chalk pieces/eraser, faint chalk diagram/notes, subtle desk edge) without harming OSD. Accept: 60s screenshot reads clearly as “cipher classroom”, composition feels less empty. Commit: 1294283
- [x] [project:quine-tv] Content polish `cipherwheel` (src/channels/cipherwheel.js): expand `phrases` substantially (>= 25) and vary `stampText` by segment/lesson (few fun variants). Accept: within a 5-minute capture, phrases/stamps don’t feel repetitious. Commit: 8fbcdce
- [x] [project:quine-tv] UX polish `cipherwheel` (src/channels/cipherwheel.js): add a tiny “shift hint” during DEMO/QUIZ (e.g., `A→E` or small tick mark/offset label). Accept: viewer can infer the shift faster at a glance. Commit: fa21e9c

- [x] [project:quine-tv] Review channel `cozycompiler` (src/channels/cozycompiler.js): captured screenshots (0–300s), code/audio pass, added REVIEWED marker, and queued follow-ups. Commit: 5ad9a1e
- [x] [project:quine-tv] Perf pass `cozycompiler` (src/channels/cozycompiler.js): cache background linear gradient + warm glow radial gradient (rebuild on resize/ctx swap). Accept: steady-state `render()` allocates 0 gradients/frame. Commit: afdbec2
- [x] [project:quine-tv] Determinism `cozycompiler` (src/channels/cozycompiler.js): remove `rand()` usage from per-frame update hot paths (typing speed, log reveal, beep timings) by precomputing per-segment params and scheduling randomness via deterministic next-* timers. Accept: same seed yields identical visuals at 30fps vs 60fps. Commit: 476a942
- [x] [project:quine-tv] Audio hygiene `cozycompiler` (src/channels/cozycompiler.js): `onAudioOn()` defensively stops any existing ambience we own before starting; `onAudioOff()`/`destroy()` stop+clear everything and only clear AudioManager.current when owned. Accept: repeated A toggles never stack; volume stays stable. Commit: 6ca2aa3

- [x] [project:quine-tv] Review channel `exposuretriangle` (src/channels/exposuretriangle.js): captured screenshots (0–300s) to `screenshots/review-exposuretriangle` (and quick after-pass to `screenshots/review-exposuretriangle-after`), did code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups. Commit: 89af1fc
- [x] [project:quine-tv] Determinism `exposuretriangle` (src/channels/exposuretriangle.js): remove per-frame `rand()` usage in the QUIZ segment by precomputing/storing the “attempt” settings on quiz segment start (and avoid consuming RNG in hot path). Accept: same seed yields identical screenshots at 30fps vs 60fps. Commit: f512dbd
- [x] [project:quine-tv] Perf pass `exposuretriangle` (src/channels/exposuretriangle.js): cache paper linear gradient + vignette radial gradient (rebuild on resize/ctx swap) and pre-render scanlines so steady-state `drawBg()` allocates 0 gradients/frame and does no per-line loops. Accept: no `create*Gradient()` in steady-state render; scanlines are a single blit. Commit: 3dcafb2
- [x] [project:quine-tv] Audio hygiene `exposuretriangle` (src/channels/exposuretriangle.js): make `onAudioOn()` idempotent (stop any existing bed we own first); `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Accept: repeated A toggles never stack; volume stays stable. Commit: 73d5d3d
- [x] [project:quine-tv] Composition polish `exposuretriangle` (src/channels/exposuretriangle.js): use the empty right-side space for a small “reference card”/camera UI (e.g., EV scale / exposure compensation / histogram) that updates with meter delta, without harming OSD. Accept: 60s screenshot feels balanced; OSD remains clean. Commit: 908aa1f

- [x] [project:quine-tv] Long-run interest `stitchalong` (src/channels/constellationstitch.js): expanded pattern variety (added new constellations) and added a rare deterministic special moment (~45–120s) with a shooting-star sweep + brief re-thread highlight; clean reset; OSD-safe. Screenshots: screenshots/autopilot-stitchalong-before + screenshots/autopilot-stitchalong-after. Commit: TBD

- [x] [project:quine-tv] `fixit` (src/channels/fixit.js): added rare seeded “special moments” scheduled ~45–120s (LAMP FLICKER, SUCCESS STAMP, DUST PUFF) with clean reset + subtle audio signature. Commit: 8043a42
- [x] [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals - bugs: added a floor and made the brick wall pattern static (no drift). Screenshots: screenshots/autopilot-forgeanvil-floorwall-before + screenshots/autopilot-forgeanvil-floorwall-after. Commit: c97c39d
