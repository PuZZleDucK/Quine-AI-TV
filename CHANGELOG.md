- 2026-02-14 04:45 (Australia/Melbourne) [project:quine-tv] `sandtable` (src/channels/sandtable.js): visual/bug — tile sand texture in Y (and X) so drift never reveals blank sand under the clip. Commit: be3ff52

- 2026-02-14 04:39 (Australia/Melbourne) [project:quine-tv] Review channel `sandtable` (src/channels/sandtable.js): captured screenshots (0–300s) to `screenshots/review-sandtable` + completion shots to `screenshots/review-sandtable-post-20260214-0430` (errors/warnings: 0), did code+audio/perf review, added `// REVIEWED: 2026-02-14`, and queued follow-ups in `TODO.md`. Commit: TBD

- 2026-02-14 03:48 (Australia/Melbourne) [project:quine-tv] `icecorelab` (src/channels/icecorelab.js): UI — probe-tied depth/age readout now stays clear of the rare “BUBBLE INCLUSIONS” banner (header lift for readout+chart). Screenshots: screenshots/autopilot-icecorelab-depthage-before-20260214-0345 + screenshots/autopilot-icecorelab-depthage-after-20260214-0345. Commit: c53a1cb

- 2026-02-14 03:35 (Australia/Melbourne) [project:quine-tv] `icecorelab` (src/channels/icecorelab.js): visuals — added sample tray + extracted chip animation during CUT→ANALYZE (kept OSD/panel clear). Screenshots: screenshots/autopilot-icecorelab-before + screenshots/autopilot-icecorelab-tray-after. Commit: ca9b8bf

- 2026-02-14 03:15 (Australia/Melbourne) [project:quine-tv] Cleanup: moved stale TODO item for `icecorelab` “BUBBLE INCLUSIONS” deterministic sparkle moment to TODONE (implementation already present). Commit: f6ededb

- 2026-02-14 03:05 (Australia/Melbourne) [project:quine-tv] `icecorelab` (src/channels/icecorelab.js): visuals — added cached vertical micro-striation texture overlay to reduce “TV banding” (rebuild on init/resize). Commit: fb7b6ec

- 2026-02-14 01:54 (Australia/Melbourne) [project:quine-tv] Review channel `tugdispatch` (src/channels/harbortugdispatch.js): captured screenshots (0–300s) to `screenshots/review-tugdispatch-20260214-0145` (errors/warnings: 0), did code+audio/perf review, confirmed `// REVIEWED: 2026-02-13`, no new follow-ups queued. Commit: 2edc822

- 2026-02-14 01:36 (Australia/Melbourne) [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): special moment — added deterministic “FOG HORN” haze sweep + “SECURITY SWEEP” beam scheduled ~45–120s, with OSD-safe banner + one-shot audio cues. Commit: 4f08d4d

- 2026-02-14 01:22 (Australia/Melbourne) [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): text/dialog — added a seeded rotating “VHF DISPATCH” log strip (funny/immersive harbor chatter), ~6+ minutes before repeating; clipped to stay OSD-safe. Commit: TBD

- 2026-02-14 01:08 (Australia/Melbourne) [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): determinism — schedule lightning flashes from the previous `nextFlashAt` time (catch-up loop) so 30fps vs 60fps matches at the same capture offsets. Screenshots: screenshots/autopilot-tugdispatch-determinism-before + screenshots/autopilot-tugdispatch-determinism-after. Commit: TBD

- 2026-02-14 00:49 (Australia/Melbourne) [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): perf — replaced per-frame scanline loop with a cached scanline pattern (rebuild on resize/ctx swap). Accept: render no longer loops over `y` to draw scanlines each frame. Commit: 506c8ee

- 2026-02-14 00:32 (Australia/Melbourne) [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): perf — cached tide gauge fill gradient in `drawHUD()` (rebuild on resize/ctx swap; steady-state 0 `createLinearGradient()` calls). Commit: bfd60b3

- 2026-02-14 00:17 (Australia/Melbourne) [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): perf — cached map water background gradient in `drawMap()` (rebuild on resize/ctx swap; steady-state 0 `createLinearGradient()` calls). Commit: 7be71c6

- 2026-02-13 23:00 (Australia/Melbourne) [project:quine-tv] `futurearch` (src/channels/futurearch.js): perf — cached placard bullet wrapping lines per artifact+layout (avoids per-frame split/measureText). Screenshots: screenshots/autopilot-futurearch-perf-2026-02-13-start + screenshots/autopilot-futurearch-perf-2026-02-13-end2. Commit: 5936ec1

- 2026-02-13 22:50 (Australia/Melbourne) [project:quine-tv] `futurearch` (src/channels/futurearch.js): perf — cached pedestal gradients (spotlight cone + pedestal body); rebuild on resize/ctx swap. Screenshots: screenshots/autopilot-futurearch-pedcache-before-20260213-224746 + screenshots/autopilot-futurearch-pedcache-after-20260213-224931. Commit: 8758755

- 2026-02-13 22:33 (Australia/Melbourne) [project:quine-tv] `futurearch` (src/channels/futurearch.js): audio hygiene — make `onAudioOn()` idempotent and ensure `onAudioOff()`/`destroy()` clear `AudioManager.current` only when owned. Commit: 867c4cf

- 2026-02-13 22:15 (Australia/Melbourne) [project:quine-tv] `futurearch` (src/channels/futurearch.js): visual correctness — add `watch` artifact icon + set smartwatch kind to `watch` (was rendering as phone). Commit: 1e77af9

- 2026-02-13 22:05 (Australia/Melbourne) [project:quine-tv] `futurearch` (src/channels/futurearch.js): UI — make the placard panel OSD-safe (bottom HUD must not cover bullet text). Commit: da22125

- 2026-02-13 21:23 (Australia/Melbourne) [project:quine-tv] `futurearch` (src/channels/futurearch.js): special moment — added rare deterministic “DOCENT NOTE” overlay + exhibit light flicker (~45–120s cadence; seeded; placard stays stable). Commit: 2fa7df6

- 2026-02-13 19:18 (Australia/Melbourne) [project:quine-tv] `futurearch` (src/channels/futurearch.js): transition — artifact+placard now dissolve via true crossfade (prev→current) with reduced slide. Commit: f691a30

- 2026-02-13 19:00 (Australia/Melbourne) [project:quine-tv] `futurearch` (src/channels/futurearch.js): content — expanded `ARTIFACTS` to 16 and switched to a seeded shuffle-bag (no back-to-back repeats; ~5+ min before repeating). Commit: c688d79

- 2026-02-13 18:48 (Australia/Melbourne) [project:quine-tv] `futurearch` (src/channels/futurearch.js): perf — cached background gradients (bg/floor/vignette); rebuild on resize/ctx swap. Screenshots: screenshots/autopilot-futurearch-bgcache-before + screenshots/autopilot-futurearch-bgcache-after. Commit: cfc3abd

- 2026-02-13 18:15 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — pushed forge further to the side + improved body/frame shading. Commit: e3ba448

- 2026-02-13 18:05 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visual storytelling — dunk hot item into quench bucket during QUENCH; steam originates from bucket waterline. Commit: 3a8bd8b

- 2026-02-13 17:47 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — second pass: pushed workshop props further right + increased opacity (bucket/tools/tongs). Commit: 9c7325b

- 2026-02-13 17:30 (Australia/Melbourne) [project:quine-tv] Cleanup: removed stale TODO entry for `forgeanvil` workshop prop opacity (already completed earlier; see commit b3a5a62). Commit: TBD

- 2026-02-13 17:15 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — moved the forge + fire further to the side (shifted forge left; aligned floor glow + opening gradients). Commit: 90f5af1

- 2026-02-13 17:00 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — rotate through several glowing hot items on the anvil; swap immediately after QUENCH. Screenshots: screenshots/autopilot-forgeanvil-hotitems-before-20260213-1700 + screenshots/autopilot-forgeanvil-hotitems-after-20260213-1700. Commit: da4cb97

- 2026-02-13 16:50 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — improved hammer swing so it follows a readable arc and reaches the anvil strike point. Commit: 658b16d

- 2026-02-13 16:35 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — made the anvil read more like an anvil (stand/base plate, top face plate, hardy/pritchel holes, crisp outline + underside shading). Screenshots: screenshots/autopilot-2026-02-13-forgeanvil-before + screenshots/autopilot-2026-02-13-forgeanvil-anvil-after. Commit: 3db3956

- 2026-02-13 16:20 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): audio polish — replaced “beep-y” strike hits with a noise transient + tone body; added a short quench hiss burst (with stop-guard). Screenshots: screenshots/autopilot-forgeanvil-audio-2026-02-13-before + screenshots/autopilot-forgeanvil-audio-2026-02-13-after. Commit: 1e40323

- 2026-02-13 16:04 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visuals — made workshop props more opaque and pushed further to the side (bucket/tools/tongs). Commit: b3a5a62

- 2026-02-13 15:45 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): visual depth — added workshop props (quench bucket + hanging tools + floor tongs) with subtle parallax/lighting; kept OSD clear. Screenshots: screenshots/autopilot-forgeanvil-props-before-20260213-1545 + screenshots/autopilot-forgeanvil-props-after-20260213-1545. Commit: 1f2ce41

- 2026-02-13 15:34 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): text/dialog — added a seeded rotating “shop talk” caption strip (blacksmith jokes/status lines), 5+ minutes before repeating. Screenshots: screenshots/autopilot-forgeanvil-captions-before + screenshots/autopilot-forgeanvil-captions-after. Commit: 132bb92

- 2026-02-13 14:30 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): determinism/visual — precomputed flame tongues so `drawForge()` uses no per-frame `rand()` (prevents flame teleporting; FPS-stable). Commit: 8084da6

- 2026-02-13 13:45 (Australia/Melbourne) [project:quine-tv] `orbits` (src/channels/orbits.js): time structure — added a ~1.5 minute phase cycle (CALM→WARP→DRIFT) modulating orbit speed + nebula wash intensity. Commit: 33bd1d0

- 2026-02-13 13:33 (Australia/Melbourne) [project:quine-tv] `orbits` (src/channels/orbits.js): ui — overlay label now shows the current orbit-layout name (ORIGIN/TILT/BULGE/SPIN). Commit: ec27195

- 2026-02-13 13:15 (Australia/Melbourne) [project:quine-tv] `orbits` (src/channels/orbits.js): bug — prevent sun/planet/moon overlap (orbit spacing adjusted; moons skip draw when overlapping). Commit: db0761c

- 2026-02-13 13:01 (Australia/Melbourne) [project:quine-tv] `orbits` (src/channels/orbits.js): special moment — added rare deterministic “COMET PASS” (shooting star + trail) scheduled ~3–5 minutes. Commit: 21e93a3

- 2026-02-13 12:46 (Australia/Melbourne) [project:quine-tv] `orbits` (src/channels/orbits.js): visual — cycle through different orbit layouts every 5 minutes (smooth transition; avoids per-frame layout allocations). Commit: e1b1c7a

- 2026-02-13 12:21 (Australia/Melbourne) [project:quine-tv] `orbits` (src/channels/orbits.js): visual — planets now have deterministic variety (rings, gas bands/storms, rock craters, rim glow/spec highlight). Screenshots: screenshots/autopilot-orbits-before-2026-02-13-1215 + screenshots/autopilot-orbits-planets-after-2026-02-13-1215. Commit: 14cd112

- 2026-02-13 11:49 (Australia/Melbourne) [project:quine-tv] `orbits` (src/channels/orbits.js): audio hygiene — made `onAudioOn()` idempotent (no stacking) and ensured `destroy()` only clears AudioManager.current when owned. Screenshots: screenshots/autopilot-orbits-audiohygiene-before + screenshots/autopilot-orbits-audiohygiene-after. Commit: 9c17123

- 2026-02-13 11:39 (Australia/Melbourne) [project:quine-tv] Review channel `orbits` (src/channels/orbits.js): captured screenshots (0–300s) to `screenshots/review-orbits-20260213-1130` + completion shots to `screenshots/review-orbits-20260213-1130-post` (errors/warnings: 0), fixed starfield flicker by precomputing star specks (no `rand()` in render), added `// REVIEWED: 2026-02-13`, and queued follow-ups in `TODO.md`. Commit: TBD

- 2026-02-13 11:20 (Australia/Melbourne) [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): room layout — added a subtle folding counter + laundry basket and a right-side stacked dryer bank (with “DRYERS” sign and heat-glow doors). Commit: ed86ad3

- 2026-02-13 10:47 (Australia/Melbourne) [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): washing machine UI — adjusted control-panel dial/buttons spacing to prevent overlap on small viewports. Commit: 1dcf95a

- 2026-02-13 10:33 (Australia/Melbourne) [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): window — upgraded the midground window into framed glass with mullions, subtle city/neon specks, and a reflection band (kept rain streaks). Commit: e20ebee

- 2026-02-13 10:18 (Australia/Melbourne) [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): washing machine layout/appearance — tightened responsive layout so machines always fit; added control-panel display/dial/buttons for more readable machine detail. Commit: bf597e7

- 2026-02-13 10:00 (Australia/Melbourne) [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): declutter — removed redundant in-channel HUD text (CH/phase/cycle timer) so the scene is cleaner; rely on TV OSD. Screenshots: screenshots/autopilot-neonlaundromat-declutter-pre + screenshots/autopilot-neonlaundromat-declutter-post. Commit: 382adc8

- 2026-02-13 09:45 (Australia/Melbourne) [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): special moment — added rare deterministic “POWER SURGE” event (~45–120s cadence; seeded) that boosts neon flicker and dims the room for ~2–5s (with OSD-safe banner). Commit: 0dc580b

- 2026-02-13 09:21 (Australia/Melbourne) [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): visual identity — use per-machine `m.tint` to colorize panel strip + phase LED + inner-drum rim glow (machines read distinct). Screenshots: screenshots/neonlaundromat-tint-pre + screenshots/neonlaundromat-tint-post. Commit: TBD

- 2026-02-13 08:33 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): visual — colorize stack trace + diff snippet lines (diff headers/hunks/+/-) so code blocks read like code, not chat. Commit: dc3a010

- 2026-02-13 08:15 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): content — fixed section coloring so BUG/BUG REPORT lines are reliably red and ASCII art inherits the correct BUG/FIX colors. Screenshots: screenshots/autopilot-duckdebug-before + screenshots/autopilot-duckdebug-after. Commit: 0bfc450

- 2026-02-13 08:02 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): content — added 2–5 short user↔duck dialog lines per confessional block (before BUG/FIX/LESSON) for more “conversation” feel. Commit: f1064cc

- 2026-02-13 07:48 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): content — expanded `fakeStackTrace()` with more frame templates + occasional indented diff-snippet lines; hardened `wrapForTerminal()` indentation wrapping to guarantee max width. Commit: 1b515d6

- 2026-02-13 07:17 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): perf — replaced per-frame cursor `ctx.measureText(...)` with cached monospace char width (`termCharW`) * string length. Commit: cb16509

- 2026-02-13 06:48 (Australia/Melbourne) [project:quine-tv] `foleylab` (src/channels/foleylab.js): UI/visual polish — added an OSD-safe VU panel driven by step density with a waveform sparkline (recent density history) + rare deterministic special moments (TAKE GOOD / MIC CLIP) scheduled ~45–120s. Commit: 4aee3c5

- 2026-02-13 06:19 (Australia/Melbourne) [project:quine-tv] `foleylab` (src/channels/foleylab.js): long-run variety — added 4 more foley recipes (typewriter/platform/balloon/drawer) so the channel runs 5+ minutes before repeating; uses seeded shuffle-bag selection to avoid back-to-back repeats. Commit: 20f36f1

- 2026-02-13 06:00 (Australia/Melbourne) [project:quine-tv] `foleylab` (src/channels/foleylab.js): perf pass — cached static bg/vignette + stage/table gradients by pre-rendering to offscreen layers (rebuild on resize/ctx swap); acoustic-panel grid is now a cached pattern tile (no per-cell template allocs in render). Commit: f3e8f38

- 2026-02-13 05:35 (Australia/Melbourne) [project:quine-tv] `foleylab` (src/channels/foleylab.js): determinism — split audio RNG from visual PRNG so audio.enabled toggles don’t change recipe selection/visual sequence. Commit: 1df1700

- 2026-02-13 05:18 (Australia/Melbourne) [project:quine-tv] `foleylab` (src/channels/foleylab.js): audio hygiene — made `onAudioOn()` idempotent (stop our previous ambience before starting) and `onAudioOff()`/`destroy()` now stop+clear and only clear AudioManager.current when owned. Commit: c4c8dc3

- 2026-02-13 05:08 (Australia/Melbourne) [project:quine-tv] Review channel `foleylab` (src/channels/foleylab.js): captured screenshots (0–300s) to `screenshots/review-foleylab-pre` + completion shots to `screenshots/review-foleylab-post` (errors/warnings: 0), added `// REVIEWED: 2026-02-13`, and queued concrete follow-ups in `TODO.md`. Commit: a178562

- 2026-02-13 04:49 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): time structure — added explicit calm→crisis→resolution phase cycle that shapes typing speed, scanline intensity, and between-confessional hold durations (with short crossfades at boundaries). Commit: 98981b6

- 2026-02-13 04:34 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): dialog variety — expanded phrase pools and added short seeded fake stack-trace snippets to avoid obvious repeats over 5+ minutes. Commit: 53a42aa

- 2026-02-13 04:22 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): special moments — added rare deterministic CRT glitch/flicker + BUG!/FIXED stamp overlay (timer-scheduled; stamp stays in header to preserve transcript legibility). Commit: 281c621

- 2026-02-13 04:00 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): cached terminal char width + maxChars (recomputed on resize/ctx swap) so steady-state render avoids per-frame measureText('M'). Commit: 1c05b71

- 2026-02-13 03:49 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): wrapForTerminal() now wraps long indented lines while preserving indentation (indent kept on all wrapped lines). Commit: 0680c03

- 2026-02-13 03:19 (Australia/Melbourne) [project:quine-tv] `fixit` (src/channels/fixit.js): tool art — distinct tool head silhouettes (pliers/wrench/screwdriver/tape) + subtle drop shadows under tool + object. Commit: ae1317a

- 2026-02-13 02:48 (Australia/Melbourne) [project:quine-tv] `fixit` (src/channels/fixit.js): time structure — added deterministic 2–4 minute phase cycle modulating lamp warmth, bench vignette intensity, and animation pacing (phase stored in `update(dt)`, render reads stable phase values). Commit: 5539923

- 2026-02-13 02:30 (Australia/Melbourne) [project:quine-tv] `fixit` (src/channels/fixit.js): content — expanded `REPAIRS` to 11 and extended per-repair duration to ~37–46s (4–6 steps each; distinct palettes/tools). Commit: de52562

- 2026-02-13 02:16 (Australia/Melbourne) [project:quine-tv] `fixit` (src/channels/fixit.js): text/dialog — replaced static footer with a seeded rotating caption strip (45 variants; 9s cadence; deterministic shuffle; OSD-safe ellipsis). Commit: bf7988d

- 2026-02-13 01:00 (Australia/Melbourne) [project:quine-tv] `matrix` (src/channels/matrix.js): time structure — added deterministic 2–4 min phase cycle (GREEN→TEAL→RED ALERT→GREEN) modulating trail decay, rain speed, and palette with smooth easing. Commit: c510490

- 2026-02-13 00:48 (Australia/Melbourne) [project:quine-tv] `matrix` (src/channels/matrix.js): visual polish — made the top overlay banner more OSD-safe (smaller height + gentle fade) and rotate the title from a deterministic seeded list (5–8 min cadence). Commit: d37e6b2

- 2026-02-13 00:30 (Australia/Melbourne) [project:quine-tv] `matrix` (src/channels/matrix.js): determinism — moved glyph RNG out of `render()` by updating per-column glyph arrays on a fixed cadence in `update(dt)` (80–140ms). Screenshots: screenshots/autopilot-matrix-determinism-before + screenshots/autopilot-matrix-determinism-after. Commit: 425c04e

- 2026-02-13 00:18 (Australia/Melbourne) [project:quine-tv] `matrix` (src/channels/matrix.js): audio hygiene — made `onAudioOn()` idempotent, added gentle noise fade-out on stop, `onAudioOff()` only clears AudioManager.current when owned, and reduced beep cadence/variation. Commit: 6a4c738

- 2026-02-13 00:07 (Australia/Melbourne) [project:quine-tv] Review channel `matrix` (src/channels/matrix.js): captured screenshots (0–300s) to `screenshots/review-matrix` (errors/warnings: 0), added `// REVIEWED: 2026-02-13`, and queued concrete follow-ups in `TODO.md`.

- 2026-02-12 23:47 (Australia/Melbourne) [project:quine-tv] `dominofactory` (src/channels/dominofactory.js): long-run interest — added a deterministic forklift silhouette pass special moment (paired with the overhead sweep + a second STAMP/FORKLIFT follow-up), scheduled in the first ~55–120s with a clean reset. Commit: 30c5e5b

- 2026-02-12 23:24 (Australia/Melbourne) [project:quine-tv] `dominofactory` (src/channels/dominofactory.js): text/dialog — verified seeded rotating “line log” HUD panel (5+ min deterministic rotation), clipped to remain OSD-safe. Screenshots: screenshots/autopilot-dominofactory-linelog-before + screenshots/autopilot-dominofactory-linelog-after. Commit: 30c5e5b

- 2026-02-12 22:45 (Australia/Melbourne) [project:quine-tv] `dominofactory` (src/channels/dominofactory.js): visual identity — added cached midground clutter layer (bolts/rivets/hazard decals/soft grime), rebuilt on resize; OSD-safe masks. Screenshots: screenshots/review-dominofactory-pre + screenshots/review-dominofactory-post. Commit: bff9e4b

- 2026-02-12 22:30 (Australia/Melbourne) [project:quine-tv] `dominofactory` (src/channels/dominofactory.js): determinism — alarm/spark schedules now compute intensity relative to the exact scheduled time (FPS-stable at 30fps vs 60fps). Commit: 1ee7343

- 2026-02-12 22:00 (Australia/Melbourne) [project:quine-tv] `dominofactory` (src/channels/dominofactory.js): audio hygiene — made `onAudioOn()` idempotent (no stacking), and `onAudioOff()`/`destroy()` stop+clear only when the AudioManager current handle is owned; `AudioManager.setCurrent()` now returns the stored handle. Commit: 3479944

- 2026-02-12 21:30 (Australia/Melbourne) [project:quine-tv] `lava` (src/channels/lava.js): composition — added lamp silhouette (glass outline + cap/base) and clipped blobs to the glass. Commit: 533d974

- 2026-02-12 21:08 (Australia/Melbourne) [project:quine-tv] `lava` (src/channels/lava.js): determinism — switched to a fixed-timestep update loop so 30fps vs 60fps yields identical captures. Screenshots: screenshots/autopilot-lava-determinism-before + screenshots/autopilot-lava-determinism-after. Commit: 261d558

- 2026-02-12 20:48 (Australia/Melbourne) [project:quine-tv] `lava` (src/channels/lava.js): special moments — added a deterministic glint sweep overlay during cycle events so the windows read clearly. Commit: 6bfca4e

- 2026-02-12 20:33 (Australia/Melbourne) [project:quine-tv] `lava` (src/channels/lava.js): visual texture — cached film grain + scanlines + vignette layer (rebuild on resize/ctx swap) to reduce flat empty space without cluttering OSD. Screenshots: screenshots/autopilot-lava-texture-start + screenshots/autopilot-lava-texture-done. Commit: 84ac0e3

- 2026-02-12 20:05 (Australia/Melbourne) [project:quine-tv] `lava` (src/channels/lava.js): responsive scaling — store `baseR` and recompute blob radius on `onResize()` (rebuild sprite cache) so resizes keep blobs proportional. Screenshots: screenshots/autopilot-lava-scaling-before + screenshots/autopilot-lava-scaling-after. Commit: b5695b9

- 2026-02-12 19:46 (Australia/Melbourne) [project:quine-tv] `lava` (src/channels/lava.js): audio stop polish — delay `bus.disconnect()` until after fade-out so gain ramps can finish (reduces click/pop risk). Commit: b02ec62

- 2026-02-12 19:17 (Australia/Melbourne) [project:quine-tv] Micro-perf `lava` (src/channels/lava.js): quantized + cached `ctx.filter = blur(...)` string so it only updates when the blur bucket changes (avoids per-frame template string churn). Commit: bd74466

- 2026-02-12 18:06 (Australia/Melbourne) [project:quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): replaced chase-light button highlight with persistent queue-selected LEDs + press animation when calls are queued. Screenshots: screenshots/autopilot-elevatorpanel-before + screenshots/autopilot-elevatorpanel-after. Commit: 74b1a2d

- 2026-02-12 17:45 (Australia/Melbourne) [project:quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): call queue now accumulates deterministic background calls and is serviced on ARRIVE. Screenshots: screenshots/autopilot-elevatorpanel-queue-before + screenshots/autopilot-elevatorpanel-queue-after. Commit: c082650

- 2026-02-12 17:34 (Australia/Melbourne) [project:quine-tv] Time structure `lava` (src/channels/lava.js): added deterministic 2–4 min phase cycle (CALM→BLOOP→SURGE) modulating blob speed/blur/intensity + rare deterministic “special moments” (PULSE/HEAT/SWIRL) scheduled ~45–120s/cycle. Commit: e71d29b

- 2026-02-12 17:21 (Australia/Melbourne) [project:quine-tv] Perf `lava` (src/channels/lava.js): pre-rendered blob sprites (radius+hue buckets) so steady-state `render()` no longer calls `create*Gradient()` per blob (blit + blur + screen). Commit: b07df9f

- 2026-02-12 16:48 (Australia/Melbourne) [project:quine-tv] Long-run interest `flow` (src/channels/flowfield.js): added deterministic 2–4 min phase cycle (CALM→SURGE→DRIFT) modulating fieldScale/speed/fade with smooth transitions; seeded schedule. Commit: 9f6ec2e

- 2026-02-12 16:30 (Australia/Melbourne) [project:quine-tv] Long-run interest `kintsugi` (src/channels/kintsugiclinic.js): polish glint “special moment” now fades in/out with stronger signature and clean reset. Commit: 0197987

- 2026-02-12 15:49 (Australia/Melbourne) [project:quine-tv] Long-run composition `flow` (src/channels/flowfield.js): added deterministic periodic point reseed (separate RNG) to prevent long-run ribbon collapse and keep coverage even. Screenshots: screenshots/review-flowfield-pre + screenshots/review-flowfield-post. Commit: 12cd9e8

- 2026-02-12 15:20 (Australia/Melbourne) [project:quine-tv] Visual identity `flow` (src/channels/flowfield.js): added cached background gradient+vignette and a slow drifting mist/grain midground (seeded; OSD-safe; no per-frame allocations in steady-state). Commit: e814a6c

- 2026-02-12 15:06 (Australia/Melbourne) [project:quine-tv] Text/dialog `elevatorpanel` (src/channels/elevatorpanel.js): expanded status strip into seeded annunciator messages (5-minute rotation; avoids repeats too quickly; clipped so it won’t overlap NEXT). Commit: eb10d26

- 2026-02-12 14:51 (Australia/Melbourne) [project:quine-tv] Visual polish `kintsugi` (src/channels/kintsugiclinic.js): improve CRACK phase readability via per-crack depth (variable thickness/opacity) + deterministic micro-branch cracks at endpoints (regen-time only; no per-frame RNG). Commit: 342eb25

- 2026-02-12 14:36 (Australia/Melbourne) [project:quine-tv] Perf pass `stitchalong` (src/channels/constellationstitch.js): cached render-path gradients (weave vignette, hoop wood, inner cloth) so steady-state `render()` creates 0 gradients/frame. Screenshots: screenshots/autopilot-stitchalong-perf-before + screenshots/autopilot-stitchalong-perf-after. Commit: 7e019fb

- 2026-02-12 14:18 (Australia/Melbourne) [project:quine-tv] `lava` (src/channels/lava.js): audio polish — replaced plain brown-noise hum with gentle low drone + filtered noise with slow “breath” modulation; made `onAudioOn()` idempotent and `onAudioOff()` clears AudioManager.current only when owned. Commit: 2f41c05

- 2026-02-12 14:04 (Australia/Melbourne) [project:quine-tv] `lava` (src/channels/lava.js): added seeded rotating caption/subtitle strip (58 variants; 18–27s cadence; no repeats until full cycle). Screenshots: screenshots/autopilot-lava-captions-before + screenshots/autopilot-lava-captions-after. Commit: fcc2caf

- 2026-02-12 13:45 (Australia/Melbourne) [project:quine-tv] Determinism `flow` (src/channels/flowfield.js): switched to fixed-timestep simulation + offscreen paint buffer so captures are FPS-stable (30fps vs 60fps). Commit: c575965

- 2026-02-12 13:35 (Australia/Melbourne) [project:quine-tv] `kintsugi` (src/channels/kintsugiclinic.js): added rotating patient/item subtitle (expanded item list) and resets the scene every 5 minutes. Commit: b066486

- 2026-02-12 13:15 (Australia/Melbourne) [project:quine-tv] Determinism `stitchalong` (src/channels/constellationstitch.js): split audio RNG from visual PRNG and scheduled needle-click SFX (FPS-stable; audio.enabled no longer affects visual rand sequence). Commit: 80299ca

- 2026-02-12 13:04 (Australia/Melbourne) [project:quine-tv] Determinism `kintsugi` (src/channels/kintsugiclinic.js): decoupled audio randomness from the visual PRNG via a separate audio RNG (no visual `rand()` consumption inside audio code paths). Commit: 8d7cdcc

- 2026-02-12 12:45 (Australia/Melbourne) [project:quine-tv] Perf pass `kintsugi` (src/channels/kintsugiclinic.js): cached bench/spotlight/pottery/gold/vignette gradients (rebuild on resize/regen/ctx swap) so steady-state `render()` allocates 0 gradients/frame. Commit: 27555f5

- 2026-02-12 12:15 (Australia/Melbourne) [project:quine-tv] Audio hygiene `stitchalong` (src/channels/constellationstitch.js): made `onAudioOn()` idempotent (stops our previous ambience before restarting) and `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Commit: 8346d27

- 2026-02-12 12:00 (Australia/Melbourne) [project:quine-tv] Visual correctness `kintsugi` (src/channels/kintsugiclinic.js): clipped cracks/dust/gold seams (and glints) to the pottery ellipse so stroke/glow doesn’t bleed outside the bowl silhouette. Commit: 6623587

- 2026-02-12 11:47 (Australia/Melbourne) [project:quine-tv] Perf `flow` (src/channels/flowfield.js): removed per-point `hsla(...)` fillStyle allocations by using 48 cached `hsl(...)` hue buckets and varying intensity via `ctx.globalAlpha`. Screenshots: screenshots/autopilot-flow-perf-before + screenshots/autopilot-flow-perf-after. Commit: 205df54

- 2026-02-12 11:34 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): wrapped long dialog lines for multiline terminal text + expanded bug/confessional phrase pools. Commit: c4ab24b

- 2026-02-12 11:18 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): added uncommon + rare ASCII art stingers for BUG/FIX lines (seeded). Commit: 76689dc

- 2026-02-12 11:00 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): added variation to usernames + confessional opener/BUG/FIX/LESSON line templates (seeded). Commit: 22b17d9

- 2026-02-12 10:50 (Australia/Melbourne) [project:quine-tv] Determinism `duckdebug` (src/channels/rubberduck.js): removed per-frame `rand()` typing-speed jitter; now uses per-line seeded speed for FPS-stable captures. Commit: faebeff

- 2026-02-12 10:30 (Australia/Melbourne) [project:quine-tv] Determinism `duckdebug` (src/channels/rubberduck.js): split audio RNG from visual PRNG so audio.enabled toggles don’t affect visuals. Commit: a6683ad

- 2026-02-12 10:21 (Australia/Melbourne) [project:quine-tv] Cleanup: removed stale TODO entry “Review channel: kaleido” (already completed earlier; see commit 9d50467). Commit: 50ea2e3

- 2026-02-12 10:05 (Australia/Melbourne) [project:quine-tv] Cleanup: removed duplicate TODO entry “Review channel: deepseasonar” (already completed earlier; see commit 866f413). Commit: 2a3ba5f

- 2026-02-12 09:34 (Australia/Melbourne) [project:quine-tv] Perf polish `kintsugi` (src/channels/kintsugiclinic.js): replaced `dust = dust.filter(...)` with in-place compaction to avoid per-frame array allocation. Commit: 597ff20

- 2026-02-12 09:19 (Australia/Melbourne) [project:quine-tv] Audio hygiene `duckdebug` (src/channels/rubberduck.js): made room tone start/stop idempotent; `onAudioOn()` keeps our handle if already current and stops our prior handle before restarting; `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Commit: ba050d6

- 2026-02-12 09:02 (Australia/Melbourne) [project:quine-tv] Audio hygiene `kintsugi` (src/channels/kintsugiclinic.js): made `onAudioOn()` idempotent (stop current first, avoids stacking); `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Commit: 0f4232f

- 2026-02-12 08:49 (Australia/Melbourne) [project:quine-tv] Perf pass `duckdebug` (src/channels/rubberduck.js): pre-rendered scanlines as a cached pattern (no per-frame scanline fillRect loop). Commit: d9d8baa

- 2026-02-12 08:32 (Australia/Melbourne) [project:quine-tv] Perf pass `duckdebug` (src/channels/rubberduck.js): cached background linear gradient + vignette radial gradient (rebuild on resize/ctx swap) so steady-state `render()` allocates 0 gradients/frame. Commit: 0f3c483

- 2026-02-12 08:15 (Australia/Melbourne) [project:quine-tv] Audio hygiene `elevatorpanel` (src/channels/elevatorpanel.js): made `onAudioOn()` idempotent (stops any existing handle we own before starting) and `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned. Commit: 9ecfa53

- 2026-02-12 08:00 (Australia/Melbourne) [project:quine-tv] Review channel `flow` (src/channels/flowfield.js): captured screenshots (0–300s) to `screenshots/review-flow-before` + completion shots to `screenshots/review-flow-after` (errors/warnings: 0), did code/perf pass, confirmed `// REVIEWED: 2026-02-12`, and confirmed/queued follow-ups in `/home/puzzleduck/clawd/TODO.md`. Commit: ff11544

- 2026-02-12 04:38 (Australia/Melbourne) [project:quine-tv] Review channel `kintsugi` (src/channels/kintsugiclinic.js): captured screenshots (0–300s) to `screenshots/review-kintsugi`, did code+audio/perf/determinism pass, confirmed `// REVIEWED: 2026-02-12`, and queued follow-ups in `/home/puzzleduck/clawd/TODO.md`. Commit: 1d3463d

- 2026-02-12 03:23 (Australia/Melbourne) [project:quine-tv] Review channel `deepseasonar` (src/channels/deepseasonar.js): captured screenshots (0–300s) to `screenshots/review-deepseasonar`, did code+audio pass, added `// REVIEWED` marker, and queued follow-ups in `/home/puzzleduck/clawd/TODO.md`. Commit: 866f413

- 2026-02-12 02:37 (Australia/Melbourne) [project:quine-tv] Review channel `kaleido` (src/channels/kaleido.js): captured screenshots (0–300s) to `screenshots/review-kaleido`, did code+audio pass, and queued follow-ups in `/home/puzzleduck/clawd/TODO.md`. Commit: 9d50467

- 2026-02-12 01:23 (Australia/Melbourne) [project:quine-tv] visuals `containerport`: only schedule ship load/unload moves once the ship is fully docked (prevents cargo moving while ship is still arriving). Commit: 73b3e34
- 2026-02-12 00:48 (Australia/Melbourne) [project:quine-tv] visuals `containerport`: crane hoist stays vertical (clamped to beam span; trolley tracks load). Commit: 6ad6d17
- 2026-02-12 00:32 (Australia/Melbourne) [project:quine-tv] visuals `containerport`: capped on-ship container stacks to max 3 high. Commit: 532568c
- 2026-02-12 00:24 (Australia/Melbourne) [project:quine-tv] visuals `containerport`: unified container sizing across ship/yard/crane so ship containers match yard containers. Commit: 90a7316
- 2026-02-12 00:08 (Australia/Melbourne) [project:quine-tv] visuals `containerport`: ship containers are now persistent entities (drawn from `shipStacks`), and UNLOAD crane moves pop containers off the ship so the stacks visibly empty while the ship moves. Commit: 92a487d
- 2026-02-11 23:45 (Australia/Melbourne) [project:quine-tv] visuals `containerport`: during REROUTE phase, cranes now move a container from the source bay to the target bay (routeA→routeB). Commit: 4a4855b
- 2026-02-11 22:46 (Australia/Melbourne) [project:quine-tv] Special moment `containerport` (`src/channels/containerport.js`): added deterministic rare ship arrival event with rare ship type variants. Commit: c84f6c5
- 2026-02-11 22:19 (Australia/Melbourne) [project:quine-tv] Determinism `containerport` (`src/channels/containerport.js`): split audio RNG from visual PRNG so audio.enabled doesn"t change the visual sequence (FPS-stable). Commit: 1512bd6
- 2026-02-11 21:30 (Australia/Melbourne) [project:quine-tv] Perf pass `containerport` (`src/channels/containerport.js`): cached sky/sea/yard/vignette gradients (rebuild on resize/layout change or ctx swap) so steady-state `render()` allocates 0 gradients/frame. Commit: f848d5e
- 2026-02-11 21:24 (Australia/Melbourne) [project:quine-tv] Review channel `containerport` (src/channels/containerport.js): captured screenshots (0–300s) to `screenshots/review-containerport`, did code+audio pass, added `// REVIEWED` marker, and queued follow-ups. Commit: TBD
- 2026-02-11 21:00 (Australia/Melbourne) [project:quine-tv] `volcanoobs` (src/channels/volcanoobservatory.js): boosted plume + ash contrast during puff phase (extra gradient stops + ash drop-shadow) and added rare incandescent ejecta arcs (lighter composite) for occasional punch. Commit: 2115be7
- 2026-02-11 20:47 (Australia/Melbourne) [project:quine-tv] `volcanoobs` (src/channels/volcanoobservatory.js): replaced crater `destination-out` hole with layered rim/lip shading to keep mountain mass visible (no hard cutout). Commit: 30db510
- 2026-02-11 20:15 (Australia/Melbourne) [project:quine-tv] Perf pass `volcanoobs` (src/channels/volcanoobservatory.js): cached sky/ground/vignette gradients (rebuild on regen/ctx swap) to reduce hot-path gradient allocations. Commit: 12bb239
- 2026-02-11 20:03 (Australia/Melbourne) [project:quine-tv] `volcanoobs` (src/channels/volcanoobservatory.js): reshaped cone silhouette (multi-curve shoulders + shared craterY) so the crater rim reads anchored to the mountain. Commit: cc7bef1
- 2026-02-11 19:45 (Australia/Melbourne) [project:quine-tv] `volcanoobs` (src/channels/volcanoobservatory.js): added a longer, pulsing eruption window in `intensityAt()`/`puffAmount()` so at least one clearly visible eruptive event occurs within each loop (<=60s). Commit: 85eae5d
- 2026-02-11 19:30 (Australia/Melbourne) [project:quine-tv] Content polish `dreamreceipt` (src/channels/dreamreceipt.js): expanded receipt text variety (more headers/footers/notes) + added deterministic rare special moment (VOID stamp or TOTAL ??? scramble) every ~45–120s. Commit: ecaabcb
- 2026-02-11 19:21 (Australia/Melbourne) [project:quine-tv] Visual polish `dreamreceipt` (src/channels/dreamreceipt.js): added subtle counter film grain + stronger printer-slot lip/shadow (paper mouth shade) so the scene reads less “flat”. Commit: c13d109
- 2026-02-11 19:01 (Australia/Melbourne) [project:quine-tv] Visual polish `dreamreceipt` (src/channels/dreamreceipt.js): widened printer body + slot (paper no longer feels wider than the hole); added subtle bevel highlight + screws for extra interest. Commit: 9c00b79
- 2026-02-11 18:32 (Australia/Melbourne) [project:quine-tv] Visual polish `dreamreceipt` (src/channels/dreamreceipt.js): increased post-print pause and added a fall-off-screen motion after tear. Commit: 582e5c1
- 2026-02-11 18:15 (Australia/Melbourne) [project:quine-tv] Audio hygiene `dreamreceipt` (src/channels/dreamreceipt.js): made `onAudioOn()` idempotent by stopping our existing ambience first; `onAudioOff()`/`destroy()` now stop+clear and only clear AudioManager.current when owned (prevents stacking on repeated toggles). Commit: efc57d6
- 2026-02-11 18:04 (Australia/Melbourne) [project:quine-tv] Perf pass `dreamreceipt` (src/channels/dreamreceipt.js): cached counter/vignette/printer/paper gradients (rebuild on init/resize/ctx swap) so steady-state render path calls no create*Gradient(). Commit: 05d1221
- 2026-02-11 17:33 (Australia/Melbourne) [project:quine-tv] Perf pass `cavetorch` (src/channels/cavetorch.js): cached base wall background into an offscreen layer and replaced torch light/soot gradients with cached sprites so steady-state `drawWall()` is just blits (no gradients, no tiling loops). Commit: 71f67ba
- 2026-02-11 17:18 (Australia/Melbourne) [project:quine-tv] Content polish `cavetorch` (src/channels/cavetorch.js): added deterministic rotating scene title/caption variants + a rare bat-swarm silhouette special moment scheduled ~45–120s. Commit: 53930f8
- 2026-02-11 17:00 (Australia/Melbourne) [project:quine-tv] Determinism `cavetorch` (src/channels/cavetorch.js): made torch flicker + film grain FPS-stable by switching to time-hashed flicker and a pre-generated grain tile (no per-frame `rand()` consumption); also scheduled handprint in absolute time. Commit: 37d6978
- 2026-02-11 16:45 (Australia/Melbourne) [project:quine-tv] Perf polish `cavetorch` (src/channels/cavetorch.js): removed per-mote `rgba(...)` fillStyle string allocations in dust motes by using fixed `fillStyle` + varying intensity via `ctx.globalAlpha`. Commit: f467a4a
- 2026-02-11 16:30 (Australia/Melbourne) [project:quine-tv] Audio hygiene `cavetorch` (src/channels/cavetorch.js): made `onAudioOn()` idempotent (stops our existing torch noise first); `onAudioOff()`/`destroy()` now stop+clear and only clear AudioManager.current when owned. Commit: 2df5567
- 2026-02-11 16:22 (Australia/Melbourne) [project:quine-tv] Review channel `cavetorch` (src/channels/cavetorch.js): captured screenshots (0–300s) to `screenshots/review-cavetorch`, did code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups. Commit: 05887db
- 2026-02-11 16:00 (Australia/Melbourne) [project:quine-tv] Perf polish `locksmith` (src/channels/locksmithbench.js): removed per-frame template-literal `rgba(...)` allocations in dust motes + pin clickFlash highlight by using fixed `fillStyle` and varying brightness via `ctx.globalAlpha`. Commit: 16102a1
- 2026-02-11 15:45 (Australia/Melbourne) [project:quine-tv] Audio hygiene `locksmith` (src/channels/locksmithbench.js): made `onAudioOn()` idempotent by stopping our existing ambience first; `onAudioOff()` now clears AudioManager.current only when owned. Commit: 1aaa730
- 2026-02-11 15:30 (Australia/Melbourne) [project:quine-tv] Perf pass `locksmith` (src/channels/locksmithbench.js): cached gradients + replaced glint/click sweeps with cached sprites so steady-state render path calls no create*Gradient(). Commit: a83c824
- 2026-02-11 15:19 (Australia/Melbourne) [project:quine-tv] Review channel `locksmith` (src/channels/locksmithbench.js): captured screenshots (0–300s) to `screenshots/review-locksmith`, did code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups. Commit: 43ec501
- 2026-02-11 15:03 (Australia/Melbourne) [project:quine-tv] Composition polish `exposuretriangle` (src/channels/exposuretriangle.js): added a right-side reference card (EV scale + mini histogram) driven by meter delta. Commit: 908aa1f
- 2026-02-11 14:32 (Australia/Melbourne) [project:quine-tv] Determinism `exposuretriangle` (src/channels/exposuretriangle.js): removed per-frame QUIZ `rand()` usage by precomputing the student attempt once per quiz segment start. Commit: f512dbd
- 2026-02-11 14:17 (Australia/Melbourne) [project:quine-tv] Audio hygiene `exposuretriangle` (src/channels/exposuretriangle.js): made onAudioOn idempotent and onAudioOff/destroy stop+clear only when we own audio.current. Commit: 73d5d3d
- 2026-02-11 14:00 (Australia/Melbourne) [project:quine-tv] Review channel `exposuretriangle` (src/channels/exposuretriangle.js): captured screenshots (0–300s) to `screenshots/review-exposuretriangle`, did code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups. Commit: 89af1fc
- 2026-02-11 13:32 (Australia/Melbourne) [project:quine-tv] Content/UI polish `cloudchamber` (src/channels/cloudchamber.js): replaced banner text with deterministic rotating labels (plus phase cue) and made the rolling HITS counter render as fixed-width 5 digits via mod 100000. Commit: e43a788
- 2026-02-11 13:15 (Australia/Melbourne) [project:quine-tv] Determinism `cloudchamber` (src/channels/cloudchamber.js): replaced per-frame random spawn counts with a time-scheduled spawn clock (fixed spawn times per phase) and applied within-frame age correction for spawned tracks + big events (FPS-stable at 30 vs 60). Commit: 018151d
- 2026-02-11 13:02 (Australia/Melbourne) [project:quine-tv] Audio hygiene `cloudchamber` (src/channels/cloudchamber.js): added `stopAmbience({clearCurrent})` so `onAudioOn()` is idempotent and `onAudioOff()`/`destroy()` stop+clear and only clear AudioManager.current when owned (prevents stacking on repeated toggles). Commit: 873596d
- 2026-02-11 12:48 (Australia/Melbourne) [project:quine-tv] Perf polish `cloudchamber` (src/channels/cloudchamber.js): precomputed per-track stroke/shadow hsla strings and now vary fade via `ctx.globalAlpha` (no per-frame color-string allocs in `drawTracks()`). Commit: 6d6c4fc
- 2026-02-11 12:30 (Australia/Melbourne) [project:quine-tv] Perf pass `cloudchamber` (src/channels/cloudchamber.js): cached background + chamber gradients so steady-state draw path doesn’t call create*Gradient(). Commit: 8864cfb
- 2026-02-11 12:24 (Australia/Melbourne) [project:quine-tv] Review channel `cloudchamber` (src/channels/cloudchamber.js): captured screenshots (0–300s) to `screenshots/review-cloudchamber`, did code+audio pass, added `// REVIEWED` marker, and queued follow-ups. Commit: 1788da4
- 2026-02-11 12:05 (Australia/Melbourne) [project:quine-tv] Determinism `cozycompiler` (src/channels/cozycompiler.js): removed `rand()` usage from per-frame update hot paths by precomputing per-segment params (typing speed / compile step delays / log reveal) and making keyclick pitch deterministic per char count; moved audio-only randomness to a separate RNG. Commit: 476a942
- 2026-02-11 11:47 (Australia/Melbourne) [project:quine-tv] Audio hygiene `cozycompiler` (src/channels/cozycompiler.js): made `onAudioOn()` idempotent (stopBed({clearCurrent:true}) first) and `onAudioOff()`/`destroy()` stop+clear only when owned. Commit: 6ca2aa3
- 2026-02-11 11:32 (Australia/Melbourne) [project:quine-tv] Perf pass `cozycompiler` (src/channels/cozycompiler.js): cached background linear gradient + warm glow radial gradient (rebuild on resize/ctx swap) so steady-state `render()` no longer calls create*Gradient(). Commit: afdbec2
- 2026-02-11 11:23 (Australia/Melbourne) [project:quine-tv] Review channel `cozycompiler` (src/channels/cozycompiler.js): captured screenshots (0–300s) to `screenshots/review-cozycompiler`, did code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups. Commit: 5ad9a1e
- 2026-02-11 11:05 (Australia/Melbourne) [project:quine-tv] Perf pass `cargomanifest` (src/channels/cargomanifest.js): pre-rendered the drifting BG grid as a cached tile + ctx pattern (blitted with translate offsets), eliminating per-frame per-line stroke loops in `drawBG()`. Commit: 19ce2ed
- 2026-02-11 10:47 (Australia/Melbourne) [project:quine-tv] Perf pass `cargomanifest` (src/channels/cargomanifest.js): cached BG linear gradient + vignette radial gradient (rebuilt on resize/ctx swap) so steady-state render doesn’t call create*Gradient(). Commit: b61bab9
- 2026-02-11 10:32 (Australia/Melbourne) [project:quine-tv] Audio hygiene `cargomanifest` (src/channels/cargomanifest.js): added `stopAmbience({clearCurrent})` so onAudioOn stops any prior handle we own and onAudioOff/destroy stop+clear and only clear AudioManager.current when owned (prevents stacking on repeated toggles). Commit: b7a207e
- 2026-02-11 10:16 (Australia/Melbourne) [project:quine-tv] UI polish `cargomanifest` (src/channels/cargomanifest.js): removed the in-panel faux `CH NN` label (seed-derived) so it can’t mismatch OSD. Commit: fe8785f
- 2026-02-11 10:07 (Australia/Melbourne) [project:quine-tv] Review channel `cargomanifest` (src/channels/cargomanifest.js): captured screenshots (0–300s) to `screenshots/review-cargomanifest`, did code+audio pass, added `// REVIEWED` marker, and queued follow-ups. Commit: 754beb1
- 2026-02-11 09:49 (Australia/Melbourne) [project:quine-tv] Determinism `candlechess` (src/channels/candlechess.js): removed `rand()` usage from dust respawns by making dust motion/wraps time-based and hashing respawn-x per wrap (FPS-stable at 30 vs 60). Commit: a74034f
- 2026-02-11 09:03 (Australia/Melbourne) [project:quine-tv] Perf pass `candlechess` (src/channels/candlechess.js): removed per-frame `pieces.slice().sort(...)` in `render()` by keeping `pieces` sorted on reset/move (no per-frame array allocation). Commit: 8c31aae
- 2026-02-11 08:45 (Australia/Melbourne) [project:quine-tv] Audio hygiene `candlechess` (src/channels/candlechess.js): onAudioOn now defensively stops any ambience handle we own; onAudioOff/destroy stop+clear and only clear AudioManager.current when owned (prevents stacking on repeated toggles). Commit: 365e035
- 2026-02-11 08:30 (Australia/Melbourne) [project:quine-tv] UI polish `candlechess` (src/channels/candlechess.js): removed hardcoded in-channel `CH 01` label from HUD (avoids mismatching OSD). Commit: a3ea805
- 2026-02-11 08:22 (Australia/Melbourne) [project:quine-tv] Review channel `candlechess` (src/channels/candlechess.js): captured screenshots (0–300s) to `screenshots/review-candlechess`, did code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups. Commit: 531e104
- 2026-02-11 08:00 (Australia/Melbourne) [project:quine-tv] Time structure `circsafari` (src/channels/circuitsafari.js): added seeded 2–4 min phase cycle (SURVEY→SCAN→FOCUS) that modulates scan speed/drift/trace intensity/focus pulse + rare special moments (GLITCH pulse, “SPECIMEN FOUND”) scheduled ~45–120s. Commit: b1606d9
- 2026-02-11 07:17 (Australia/Melbourne) [project:quine-tv] Determinism `circsafari` (src/channels/circuitsafari.js): replaced per-frame `rand() < dt*p` radio-bleep trigger with deterministic time-scheduled next-bleep events (FPS-stable at 30fps vs 60fps). Commit: 82d3b2b
- 2026-02-11 07:00 (Australia/Melbourne) [project:quine-tv] Perf pass `circsafari` (src/channels/circuitsafari.js): cached background into an offscreen layer, board body (gradient + solder-mask texture) into an offscreen layer, and scanline into a cached strip; `render()` now creates 0 gradients/frame and does no per-frame texture dot-loop. Commit: e90a452
- 2026-02-11 06:54 (Australia/Melbourne) [project:quine-tv] Review channel `circsafari` (src/channels/circuitsafari.js): captured screenshots (0–300s) to `screenshots/review-circsafari`, did code+audio pass, added `// REVIEWED` marker, and queued follow-ups. Commit: 47c55d6
- 2026-02-11 06:30 (Australia/Melbourne) [project:quine-tv] UX polish `cipherwheel` (src/channels/cipherwheel.js): added a right-aligned hint label during DEMO/QUIZ (CAESAR: `A→<shifted>`; ATBASH: `A↔Z`). Commit: fa21e9c
- 2026-02-11 06:17 (Australia/Melbourne) [project:quine-tv] Visual polish `cipherwheel` (src/channels/cipherwheel.js): added faint chalk notes/diagram baked into the board texture + subtle desk edge + extra chalk pieces on the tray. Commit: 1294283
- 2026-02-11 06:02 (Australia/Melbourne) [project:quine-tv] Content polish `cipherwheel` (src/channels/cipherwheel.js): expanded `phrases` (now 35) and made the stamp text vary deterministically by lesson/step (CAESAR vs ATBASH + shift). Commit: 8fbcdce
- 2026-02-11 05:47 (Australia/Melbourne) [project:quine-tv] Perf pass `cipherwheel` (src/channels/cipherwheel.js): removed per-frame template-literal `rgba(...)` allocations in wheel letter loops + dust loop by setting `fillStyle` once and varying brightness via `globalAlpha`. Commit: 5bc06e1
- 2026-02-11 05:30 (Australia/Melbourne) [project:quine-tv] Perf pass `cipherwheel` (src/channels/cipherwheel.js): cached wheel disk + vignette gradients (rebuild on resize/ctx swap); steady-state `render()`/`drawWheel()` no longer call create*Gradient(). Commit: e9ef6f5
- 2026-02-11 05:23 (Australia/Melbourne) [project:quine-tv] Review channel `cipherwheel` (src/channels/cipherwheel.js): captured screenshots (0–300s), code+audio pass, added `// REVIEWED` marker, and queued follow-ups. Commit: 53725f8
- 2026-02-11 05:00 (Australia/Melbourne) [project:quine-tv] Visual polish `bughotel` (src/channels/bughotel.js): added cached habitat midground layer (bark slabs, cardboard tubes, leaf litter/pebbles) + boosted critter readability (slight scale bump + rim/highlight). Commit: e65f909
- 2026-02-11 04:33 (Australia/Melbourne) [project:quine-tv] Determinism/perf `bughotel` (src/channels/bughotel.js): cached a seeded macro-grain noise tile (offscreen) and blit via pattern with slow drift (no per-frame grain arcs/template strings). Commit: 1530c4a
- 2026-02-11 03:53 (Australia/Melbourne) [project:quine-tv] Reviewed channel `bughotel` (src/channels/bughotel.js): captured screenshots (0–300s), code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups. Commit: 58ca27e
- 2026-02-11 03:18 (Australia/Melbourne) [project:quine-tv] Visual polish `musicbox` (src/channels/musicbox.js): improved gear readability via bevel/specular/shadow strokes (no gradients) + added tiny calipers/awl bench tools detail. Commit: 58d7d0a
- 2026-02-11 03:06 (Australia/Melbourne) [project:quine-tv] Determinism `musicbox` (src/channels/musicbox.js): removed per-frame `rand()` usage by precomputing detune/harmonics; scheduled slip + punch-click events via deterministic timers. Commit: a8571b0
- 2026-02-11 02:48 (Australia/Melbourne) [project:quine-tv] Perf pass `musicbox` (src/channels/musicbox.js): pre-rendered desk wood grain to offscreen and blit in drawDesk() (no per-frame grain stroke loops). Commit: b8a1877
- 2026-02-11 02:38 (Australia/Melbourne) [project:quine-tv] Perf pass `musicbox` (src/channels/musicbox.js): cached bg/vignette/desk/plate/drum/comb gradients; baked drum highlight sweep to sprite; bucketed sparkle gradients. Commit: dfc7bcc
- 2026-02-11 02:17 (Australia/Melbourne) [project:quine-tv] Audio hygiene `musicbox` (src/channels/musicbox.js): onAudioOn now defensively stops our existing ambience; onAudioOff/destroy stop+clear and only clear AudioManager.current when owned. Commit: 54bfee1
- 2026-02-11 02:02 (Australia/Melbourne) [project:quine-tv] UI polish `musicbox` (src/channels/musicbox.js): removed hardcoded in-channel `CH 01` label (to avoid mismatching OSD channel). Commit: daad7eb
- 2026-02-11 01:38 (Australia/Melbourne) [project:quine-tv] Reviewed channel `musicbox` (src/channels/musicbox.js): captured screenshots (0/10/60/300s), did code+audio pass, added `// REVIEWED` marker, and queued concrete follow-ups (audio hygiene, perf caches, UI label fix, visual polish, determinism). Commit: b3dc793
- 2026-02-11 01:06 (Australia/Melbourne) [project:quine-tv] Time structure `gumballecon` (src/channels/gumballecon.js): added deterministic boom→bust→steady phase cycle (2–4 min) with phase-driven targets, plus rare special moments (“MARKET CRASH” / “AUDIT”) and HUD banners. Commit: 412b697
- 2026-02-11 00:49 (Australia/Melbourne) [project:quine-tv] Determinism `gumballecon` (src/channels/gumballecon.js): replaced per-frame `rand()<p` events with time-scheduled next-* events (demand jitter, restock, coupon spawn/accept) for FPS-stable determinism. Commit: 15ab5f8
- 2026-02-11 00:31 (Australia/Melbourne) [project:quine-tv] UI polish `gumballecon` (src/channels/gumballecon.js): replaced placeholder title label `CH ??` with `GUMBALL ECON`. Commit: 57a0d81
- 2026-02-11 00:15 (Australia/Melbourne) [project:quine-tv] Perf pass `gumballecon` (src/channels/gumballecon.js): pre-rendered diagonal candy stripes into a cached offscreen layer and blit with drift; drawBackground() now does no per-frame stripe fillRect loop. Commit: 8e5f8e7
- 2026-02-11 00:04 (Australia/Melbourne) [project:quine-tv] Perf pass `gumballecon` (src/channels/gumballecon.js): cached background/base/globe gradients (rebuild on resize/ctx swap) so steady-state drawBackground()+drawMachine() allocate 0 gradients per frame; also applied shake via ctx.translate to keep cached gradients aligned. Commit: b0ce4c0
- 2026-02-10 23:47 (Australia/Melbourne) [project:quine-tv] Audio hygiene `gumballecon` (src/channels/gumballecon.js): onAudioOn now clears any prior handle we own before starting; onAudioOff/destroy stop+clear and only clear AudioManager.current when owned (prevents stacking on repeated toggles). Commit: 2c8a5af
- 2026-02-10 23:18 (Australia/Melbourne) [project:quine-tv] Determinism/perf `bookreturns` (src/channels/bookreturnsorter.js): precomputed per-book scan/divert targets so update() has no `rand()` calls in the per-book hot loop (incl. divert-mode rotation). Commit: 44e765d
- 2026-02-10 23:01 (Australia/Melbourne) [project:quine-tv] Perf pass `bookreturns` (src/channels/bookreturnsorter.js): replaced `books = books.filter(...)` with in-place compaction (no per-frame array allocation). Commit: 0c55c52
- 2026-02-10 22:47 (Australia/Melbourne) [project:quine-tv] Perf pass `bookreturns` (src/channels/bookreturnsorter.js): cached background + scan-beam gradients (rebuild on resize/ctx swap) so steady-state `draw()` allocates 0 gradients/frame. Commit: 392bbd0
- 2026-02-10 22:31 (Australia/Melbourne) [project:quine-tv] Audio hygiene `bookreturns` (src/channels/bookreturnsorter.js): onAudioOn now stops previous ambience before creating sources; onAudioOff/destroy stop+clear and only clear AudioManager.current when owned (prevents stacking on repeated toggles). Commit: f2c426e
- 2026-02-10 21:50 (Australia/Melbourne) [project:quine-tv] Special moment `bookbind` (src/channels/bookbindingbench.js): added rare “perfect stamp” foil-glint sweep + sparkles on the imprint, scheduled deterministically every ~45–120s; also moved stamp thump trigger outside audio gating. Commit: 26af2ba
- 2026-02-10 21:30 (Australia/Melbourne) [project:quine-tv] Visual polish `bookbind` (src/channels/bookbindingbench.js): added glue pot+brush, awl, and a bone-folder/press tool around the stack (kept OSD clear). Commit: 74e0ea3
- 2026-02-10 21:16 (Australia/Melbourne) [project:quine-tv] Audio hygiene `bookbind` (src/channels/bookbindingbench.js): onAudioOn now stops prior ambience; onAudioOff/destroy stop+clear and clear AudioManager.current when owned. Commit: a817916
- 2026-02-10 21:01 (Australia/Melbourne) [project:quine-tv] Perf pass `bookbind`: replaced `dust = dust.filter(...)` with in-place compaction so stamp dust update allocates 0 new arrays per frame. Commit: d4dc896
- 2026-02-10 20:45 (Australia/Melbourne) [project:quine-tv] Perf pass `bookbind`: cached per-signature paper gradients so `drawStack()` reuses gradients (0 gradients per signature per frame in steady-state). Commit: 814446b
- 2026-02-10 20:30 (Australia/Melbourne) [project:quine-tv] Perf pass `bookbind`: cached bench wood + spotlight gradients so `drawBench()` reuses gradients (no per-frame allocations in steady-state). Commit: a08126d
- 2026-02-10 20:23 (Australia/Melbourne) [project:quine-tv] Reviewed channel `bookbind`: captured screenshots (0–300s), reviewed code+audio, added REVIEWED marker, and queued follow-ups. Commit: 1716c7a
- 2026-02-10 20:03 (Australia/Melbourne) [project:quine-tv] `bonsai`: improved trunk/canopy silhouette so it reads more like a tree. Commit: c06a64e
- 2026-02-10 19:47 (Australia/Melbourne) [project:quine-tv] `fire`: improved flame body rendering (tapered additive layers + subtle blue base). Commit: 53e700b. Note: stashed unrelated bonsai WIP ("wip bonsai leaf puff cache").
- 2026-02-10 18:48 (Australia/Melbourne) [project:quine-tv] `arcadeattract`: replaced right-side archive cards with rotating sarcastic ad panels. Commit: d660a9c
- 2026-02-10 18:31 (Australia/Melbourne) [project:quine-tv] `cctv`: replaced moving detection labels with blurred colored emoji tags. Commit: 8d803f5
- 2026-02-10 18:19 (Australia/Melbourne) [project:quine-tv] `cctv`: detections now track moving targets; each cam uses a distinct label set. Commit: 0bfbc9d
- 2026-02-10 18:04 (Australia/Melbourne) [project:quine-tv] `cctv`: gave each camera a distinct scene palette/pattern (ALLEY/HALL/YARD) using cached per-palette light sprites + deterministic hashes (no draw-time PRNG). Commit: 76234dd
- 2026-02-10 17:45 (Australia/Melbourne) [project:quine-tv] `city`: made window lights mostly stable with sparse updates (1–2 windows change every ~1–2s), keeping sync/wipe overlays without per-frame flicker. Commit: d200ec8
- 2026-02-10 17:30 (Australia/Melbourne) [project:quine-tv] `city`: replaced sine-based window twinkle with per-window hashed randomness to avoid startup “wipe” wave while keeping sync/rare-wipe events. Commit: 80e6e09
- 2026-02-10 17:17 (Australia/Melbourne) [project:quine-tv] `baggagecarousel`: prevented bags overtaking by clamping per-bag advance to the gap ahead. Commit: 2970b74
- 2026-02-10 17:03 (Australia/Melbourne) [project:quine-tv] `city`: added window-light events so lights are random by default, occasionally pulse/synchronize globally, and rarely do a wipe band across the skyline. Commit: 804c9c4
- 2026-02-10 16:30 (Australia/Melbourne) [project:quine-tv] Time structure `city`: added seeded quiet→rush→late phase cycle (2–4 min) affecting rain/wind/windows/moon/street glow + rare special moments (neon flicker, lightning flash) scheduled ~45–120s. Commit: 4baca9a
- 2026-02-10 16:15 (Australia/Melbourne) [project:quine-tv] Audio hygiene `city`: made onAudioOn/onAudioOff/destroy defensively stop+clear and only clear AudioManager.current when owned (prevents stacking). Commit: 2554fa0
- 2026-02-10 16:03 (Australia/Melbourne) [project:quine-tv] Perf pass `city`: optimized rain draw by switching to a cached rain-streak sprite (no per-drop beginPath+stroke). Commit: b3e02a5
- 2026-02-10 15:46 (Australia/Melbourne) [project:quine-tv] Perf pass `city`: removed per-building `fillStyle` string allocations by setting `fillStyle` once per layer and using `globalAlpha` for building darkness. Commit: 9b51cdc
- 2026-02-10 15:32 (Australia/Melbourne) [project:quine-tv] Perf pass `city`: cached sky/moon/street gradients (rebuild on resize/ctx swap) so steady-state `render()` allocates 0 gradients/frame. Commit: 89468fb
- 2026-02-10 15:22 (Australia/Melbourne) [project:quine-tv] Reviewed channel `city`: captured screenshots (0–300s), reviewed code+audio, added REVIEWED marker, and queued follow-ups. Commit: b5e0b7e
- 2026-02-10 14:45 (Australia/Melbourne) [project:quine-tv] Determinism `coffeetimer`: split visual/content RNG from audio RNG; toggling audio no longer changes method/station/track progression. Commit: d023d92
- 2026-02-10 14:30 (Australia/Melbourne) [project:quine-tv] Perf pass `coffeetimer`: cached plate radial gradient per ctx/resize so steady-state `render()` allocates 0 gradients/frame for the plate. Commit: ba69a9c
- 2026-02-10 14:17 (Australia/Melbourne) [project:quine-tv] Perf pass `coffeetimer`: pre-rendered warm scanline grain into an offscreen canvas on resize; `bg()` now blits it (no per-line loop in steady-state). Commit: 4ca40f4
- 2026-02-10 14:02 (Australia/Melbourne) [project:quine-tv] Perf pass `coffeetimer`: cached background radial + vignette radial gradients (rebuilt on resize / ctx swap) so `bg()` allocates 0 gradients per frame in steady-state. Commit: f9f91ac
- 2026-02-10 13:48 (Australia/Melbourne) [project:quine-tv] Audio hygiene `coffeetimer`: onAudioOn now stops prior ambience; onAudioOff/destroy stop+clear and clear AudioManager.current when owned (prevents stacking on repeated toggles). Commit: 16282f5
- 2026-02-10 13:38 (Australia/Melbourne) [project:quine-tv] Reviewed channel `coffeetimer`: captured screenshots (0–300s), added REVIEWED marker, and queued concrete follow-ups. Commit: e873df1
- 2026-02-10 13:04 (Australia/Melbourne) [project:quine-tv] Visual polish `bonsai`: shifted pot/tree center left (cx 0.52→0.49) to reduce “empty left” feel; captured before/after 0s+10s screenshots. Commit: 41684f3
- 2026-02-10 12:51 (Australia/Melbourne) [project:quine-tv] Perf pass `bonsai`: replaced per-leaf puff radial gradients with cached mask+tinted sprites (no per-puff gradients in steady-state). Commit: 24a5837
- 2026-02-10 12:32 (Australia/Melbourne) [project:quine-tv] Audio hygiene `bonsai`: made onAudioOn/off/destroy stop/clear semantics deterministic and clear AudioManager.current when owned (prevents stacking on repeated toggles). Commit: a7fddd6
- 2026-02-10 12:17 (Australia/Melbourne) [project:quine-tv] Perf pass `bonsai`: cached bench + pot body gradients (rebuild on init/resize); steady-state `drawBench()`+`drawPot()` allocate 0 gradients/frame. Commit: 1bb06c4
- 2026-02-10 12:02 (Australia/Melbourne) [project:quine-tv] Perf pass `bonsai`: cached background + lamp-glow + vignette gradients (rebuild on init/resize); steady-state `drawBackground()` allocates 0 gradients/frame. Commit: 3efc1ba
- 2026-02-10 11:52 (Australia/Melbourne) [project:quine-tv] Reviewed channel `bonsai`: captured screenshots (0–300s), reviewed code+audio, confirmed REVIEWED marker, and queued follow-ups.
- 2026-02-10 11:16 (Australia/Melbourne) [project:quine-tv] Perf pass `beehivespectrum`: replaced trails filter with in-place compaction (no per-frame array alloc). Commit: 369b767
- 2026-02-10 10:46 (Australia/Melbourne) [project:quine-tv] Audio hygiene `beehivespectrum`: fixed handle stop closure + stop/clear semantics so repeated audio toggles don’t stack/flip-flop. Commit: f9b4129
- 2026-02-10 10:30 (Australia/Melbourne) [project:quine-tv] Correctness pass `beehivespectrum`: made waterfall scroll + decay + breathing dt-based so pacing stays stable across variable FPS. Commit: 1c08c0b
- 2026-02-10 10:17 (Australia/Melbourne) [project:quine-tv] Perf pass `beehivespectrum`: cached dance-floor glow radial gradient + waterfall sheen gradient; steady-state `drawDanceFloor()`/`drawWaterfallPanel()` allocate 0 gradients/frame. Commit: 9346df6
- 2026-02-10 10:01 (Australia/Melbourne) [project:quine-tv] Perf pass `beehivespectrum`: honeycomb layers now set `strokeStyle` once and vary alpha via `globalAlpha` (no per-cell `hsla(...)` strings). Commit: 6db9372
- 2026-02-10 09:46 (Australia/Melbourne) [project:quine-tv] Perf pass `beehivespectrum`: cached background linear gradient + vignette radial gradient; steady-state `drawBackground()` allocates 0 gradients/frame. Commit: d796787
- 2026-02-10 09:37 (Australia/Melbourne) [project:quine-tv] Reviewed channel `beehivespectrum`: captured screenshots (0–300s), added REVIEWED marker, and queued follow-ups. Commit: fad50e9
- 2026-02-06 12:30 (Australia/Melbourne) [project:quine-tv] Added in-screen channel guide overlay toggled with G; updates active channel highlight on switch. Commit: 38d5509
- 2026-02-06 13:30 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-06 14:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Rubber Duck Debugging" (duckdebug): terminal-style late-night bug confessionals with typewriter cursor + gentle room tone when audio is enabled. Commit: 95602c7
- 2026-02-06 15:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Kitchen Science Club" (kitchen): animated beaker + rotating mini-experiments; low-key fizz audio when enabled. Commit: 7c0d4f9
- 2026-02-06 16:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "One Tool, Ten Uses" (onetool): blueprint grid + rotating tool icon + highlighted 10-item hacks list; subtle click sounds when audio is enabled. Commit: 1bce30f
- 2026-02-06 17:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Micro-Mysteries" (micromyst): noir case-file micro-stories (~5–7 min) with interleaved slow pans + final clue recap; typewriter clicks + drone bed when audio is enabled. Commit: acdbe43
- 2026-02-06 18:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "The Tiny Travel Desk" (traveldesk): desk-map + street feed window + postcard-style info (map/street/food/history) with soft ambient audio bed. Commit: fcf9c97
- 2026-02-06 19:30 (Australia/Melbourne) [project:quine-tv] Added Scan toggle (button + S) to auto-step channels every 30s; shows SCAN status pill in OSD and resets timer on manual tuning/channel changes. Commit: fc4fa0c
- 2026-02-06 20:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Fix-It ASMR" (fixit): calm workbench repairs (zipper/glasses/chair/cable) with minimal UI and gentle click/zip sounds when audio is enabled. Commit: 3f2359e
- 2026-02-06 21:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "History's Weird Patents" (patents): patent-dossier cards that rotate through playful archival oddities; paper/archive vibe with optional pink-noise ambience + stamp blips on card changes. Commit: 7699fa3
- 2026-02-06 22:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Speed-Run Cooking" (speedcook): one-pan recipe loops with countdown timer, step list HUD, animated pan contents + optional sizzle/tick audio. Commit: efd9d8e
- 2026-02-07 01:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "The 3-Minute Music Theory" (musictheory): rotating visual mini-lessons (intervals, major scale, triads, circle of fifths, I–V–vi–IV, modes, rhythm) with optional metronome ticks when audio is enabled. Commit: b734f08
- 2026-02-07 02:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Future Archaeology" (futurearch): gallery-style pedestal + rotating playful placards for modern artifacts; optional museum hum ambience with tiny "gallery click" on exhibit changes. Commit: 63ae6e0
- 2026-02-07 03:00 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-07 03:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Circuit Safari" (circsafari): macro PCB view with animated traces + scanning line; rotates through specimen segments (charger/speaker/controller/bulb) highlighting components with nature-doc style captions; optional soft drone + gentle chirps when audio is enabled. Commit: 573ebe0
- 2026-02-07 04:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Rainy Window Radio" (rainradio): rain-on-glass streaks + droplets, bokeh lights, small station dial that flips between micro-genres; optional pink-noise radio bed with gentle tonal pad. Commit: 621032c
- 2026-02-07 04:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Small Town UFO Hotline" (ufohotline): rotating call-in segments (calls/lore/ad breaks) with late-night hotline UI + glitchy wave meter; optional AM-ish radio noise bed. Commit: b15bda4
- 2026-02-07 05:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Origami After Hours" (origami): slow fold-step loop with highlighted crease lines and optional paper-crinkle sfx per step. Commit: 738aca1
- 2026-02-07 05:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Minute Museum" (minutemuseum): rotating 60s exhibits with framed procedural artwork, detail zoom inset, and staged context/detail/takeaway captions; optional lowpassed room-tone when audio is enabled. Commit: cd91923
- 2026-02-07 06:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Bonsai Time Machine" (bonsai): cozy desk bonsai with subtle time-lapse jumps (+days) and care actions (water/prune/wire/repot) plus gentle room-tone noise when audio is enabled. Commit: b327633
- 2026-02-07 07:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Retro Boot Sequence" (retroboot): rotating BIOS/DOS/Mac/Linux boot scenes with CRT scanlines, vignette, and optional disk clicks + hum. Commit: 9bdf481
- 2026-02-07 07:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Subway Map Stories" (subwaystories): subway map + stop-by-stop micro-story log with a twist finale; optional train rumble + station chime audio. Commit: 9ad79ea
- 2026-02-07 08:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Tidy Desk Reset" (tidydesk): 10-minute reset loop with checklist overlay + optional gentle pink-noise ambience and soft step chimes. Commit: ff3401f
- 2026-02-07 08:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Weather Factory" (weatherfactory): build-a-forecast visuals (cloud layers, pressure isobars, fronts) plus barometer/thermometer/wind vane widgets; optional airy audio bed. Commit: 6c9e317
- 2026-02-07 09:00 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-07 09:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Analog Signal Garden" (signalgarden): oscilloscope-style blooms from sine/saw/triangle/FM waveforms with soft scope grid + HUD labels; optional pink-noise + gentle drone audio. Commit: 33b01c9
- 2026-02-07 10:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "The Lost Instruction Manual" (lostmanual): faux manual pages with absurd device diagrams, callouts, procedure + warning box; page-flip animation and optional paper-rustle SFX on flips. Commit: 9667732
- 2026-02-07 10:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Midnight Library Index" (midnightlibrary): card-catalog cabinet with animated drawer pull + typewriter index cards that reveal micro-stories; optional subtle library ambience + card flick SFX. Commit: 48a0866
- 2026-02-07 11:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Tiny Orchestra Workshop" (tinyorch): workshop-style sequencer panels; each bar adds an instrument and the full-band loop rebuilds patterns; optional pink-noise bed + beeps per step. Commit: 7ddaf0d
- 2026-02-07 11:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Mapmaker's Weathered Atlas" (weatheredatlas): parchment atlas leaf with hand-drawn coastlines, towns, mountains, animated dashed route marker, marginalia + footnotes; quiet pink-noise paper-room bed and occasional quill scratch when audio is enabled. Commit: 6640d2a
- 2026-02-07 12:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Minimalist Workout Clock" (workclock): silent interval prompts with big timer + progress ring; cycles through mobility/strength/reset routines. Commit: 4614022
- 2026-02-07 12:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Robot Petting Zoo" (robotzoo): stylized enclosure + rotating cute micro-robot exhibits with curious/shy/playful behaviors and optional soft mechanical ambience. Commit: b8953b5
- 2026-02-07 13:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Planetarium Postcards" (planetpost): rotating postcard cards with stylized planets/moons, starfield parallax, and a single wow-fact per card; optional planetarium hum + chime on card change. Commit: 5a9cde2
- 2026-02-07 13:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Studio Foley Lab" (foleylab): close-up prop stage + step-by-step procedure cards for classic SFX recipes; optional subtle studio pink-noise room tone + procedural beeps/crackle. Commit: 6971844
- 2026-02-07 14:04 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Railway Timetable ASMR" (timetable): flips timetable pages + departures board scroll + platform sign countdown; optional quiet station room-tone with page-rustle + split-flap clicks. Commit: d7b84c6
- 2026-02-07 14:30 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-07 16:04 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Pocket Planet Weather" (pocketplanet): tiny rotating planet with drifting fronts, pressure rings, and rotating wow-facts; optional windy ambience when audio is enabled. Commit: 6fea203
- 2026-02-07 16:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Satisfying Mechanisms" (mechanisms): slow loop cycling four-bar linkage, gear train, cam+follower (with lift curve), and escapement with highlighted motion paths + optional subtle mechanical ticks when audio is enabled. Commit: 0632322
- 2026-02-07 17:04 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Bug Hotel Live" (bughotel): macro terrarium cam with wandering critters, REC HUD, field-notes panel, and sightings log; optional soft roomy brown-noise ambience + tiny spotter beeps when audio is enabled. Commit: ec91b1a
- 2026-02-07 17:34 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Type Specimen Theatre" (typespecimen): rotating font “acts” that animate tracking/kerning with captions + glyph spotlight panel; short sting on act changes when audio is enabled. Commit: 725505e
- 2026-02-07 18:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Ocean Floor Postcards" (oceanpost): postcard-style seafloor window with marine snow + creature facts; optional underwater audio bed. Commit: 460b7ee
- 2026-02-07 18:33 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Coffee Timer Radio" (coffeetimer): brew-method prompts (V60/AeroPress/French press/Moka) with big step timer, brew-notes card, and tiny station dial; optional quiet café room tone + gentle ticks when audio is enabled. Commit: 803b4f9
- 2026-02-07 19:04 (Australia/Melbourne) [project:quine-tv] Implemented new channel "The Cozy Compiler" (cozycompiler): typewriter code pane + build log panel; occasional punchline errors that auto-fix into a successful build. Commit: 71d9ecf
- 2026-02-07 19:37 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Found Footage: Miniature Worlds" (miniworlds): diorama scenes shot like documentary footage with REC HUD, timecode, scale bar, annotations, gentle pan/zoom; optional tape-hiss ambience when audio is enabled. Commit: 637766d
- 2026-02-07 20:04 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Museum of Obsolete Media" (obsoletemedia): rotating exhibits (VHS/floppy/cassette/minidisc/zip/CD) with metadata panel + optional archive room tone. Commit: ff59b79
- 2026-02-07 20:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Night Signals" (nightsignals): dark signal-lamp vignettes (rail/aviation/maritime + SOS blink) with short meaning captions; optional soft pink-noise + drone. Commit: 797b298
- 2026-02-07 21:01 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-07 21:34 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Packet Sniffer FM" (packetsfm): neon radio spectrum + scaled waterfall; cycles TCP/UDP/ICMP stations with tuning static and occasional BIG EVENT flashes; optional radio-bed audio with packet ticks. Commit: aeb4a73
- 2026-02-07 22:03 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Cloud Chamber Live" (cloudchamber): dark chamber with drifting particle-track wisps, phase-based density, rolling hits counter + BIG EVENT flashes; optional noise+hum ambience when audio is enabled. Commit: 6a1ba9f
- 2026-02-07 22:36 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Sand Table Cartography" (sandtable): zen sand tray draws topographic contours → ridges → rivers → compass bearings in timed phases; optional brown-noise bed + scrape SFX when audio is enabled. Commit: ba8de7b
- 2026-02-07 23:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Analog Photo Darkroom" (analogdarkroom): red safelight darkroom with expose→agitate→reveal phases, tray bubbles, light-leak moments, and tiny timer HUD; optional quiet ambience + swish/drip beeps when audio is enabled. Commit: ae8c37a
- 2026-02-07 23:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Candlelit Chess Engine" (candlechess): warm candlelit board plays a slow scripted game with eval bar; special moments for sacrifice + promotion; optional soft candle room-tone when audio is enabled. Commit: a058f9d
- 2026-02-08 00:04 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Mechanical Pencil Geometry" (pencilgeo): drafting-paper grid + construction strokes (circle/hex/triangle), animated pencil/compass overlay, optional pencil-scratch ticks when audio is enabled. Commit: 0458d61
- 2026-02-08 00:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Dream Receipt Printer" (dreamreceipt): thermal-printer scene that prints surreal itemised receipts with barcode glitch moment + coupon drop card; optional quiet pink-noise hum + tiny print ticks when audio is enabled. Commit: 3f8a2f0
- 2026-02-08 01:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Tiny Volcano Observatory" (volcanoobs): crater + gas plume + seismograph strip; tremor build → ash puff; optional rumble audio. Commit: c739d7a
- 2026-02-08 01:34 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Bookbinding Bench ASMR" (bookbind): fold→stitch→press→stamp phases with minimal HUD, dust/flash stamp moment, optional bench ambience + micro-sfx. Commit: 342a054
- 2026-02-08 02:06 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Glassblower's Studio Loop" (glassblower): workshop furnace glow with heat→gather→blow→shape→anneal phases; spark-pop moments; optional furnace hum when audio is enabled. Commit: 6e8f665
- 2026-02-08 02:30 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-08 03:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Post Office Sorting Desk" (postoffice): overhead sorting-bench loop with intake→postmark→sort→dispatch phases, route bins that fill/drain, express alert moments; optional quiet desk ambience + stamp/click SFX when audio is enabled. Commit: 57be821
- 2026-02-08 03:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Neon Night Market Ledger" (nightmarket): neon signs + rain streaks over wet pavement, price tags, animated ledger + rotating receipts, and a pulsing “deal of the minute” card with optional ambience. Commit: ca76c2d
- 2026-02-08 04:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Tiny Lighthouse Watch" (lighthouse): rotating beam + layered fog + passing ship silhouette; storm lightning phase + calm dawn reset; optional ocean/wind audio bed. Commit: 168717c
- 2026-02-08 04:34 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Airport Baggage Carousel Cam" (baggagecarousel): looping baggage carousel with destination-tag flips and occasional LOST BAG ALERT card; optional subtle drone + brown-noise ambience. Commit: dd50970
- 2026-02-08 05:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Subterranean Mushroom Lab" (mushroomlab): moody cave parallax terrariums with phase-based growth → sample → spore-release bursts; microscope inset + spore ticker; optional cave hum audio. Commit: 9cb39ed
- 2026-02-08 05:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Gumball Machine Economics" (gumballecon): gumball machine scene with coin drops, price/stock HUD + price-spike tape moment and coupon token drops; optional tiny shop-hum audio. Commit: 47e5260
- 2026-02-08 06:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Paper City Fold-Out" (papercity): desk pop-up paper sheet with fold→rise→lights→crane phases; optional pink-noise paper ambience. Commit: 73d9336
- 2026-02-08 06:37 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Semaphore Signal School" (semaphore): chalkboard-style timed lessons + quiz reveal flash + “message received” end card; optional quiet pink-noise ambience. Commit: 8d269e2
- 2026-02-08 07:04 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Snow Globe Weather Lab" (snowglobe): desk snow-globe climate sim with pressure rings, drifting fronts, and timed shake events that reset snowfall patterns; optional cozy audio bed. Commit: 80adb65
- 2026-02-08 07:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Domino Factory Floor" (dominofactory): factory-floor conveyor + robot placement, phase-based motifs (spiral/wave/monogram/gear) and timed cascades; optional factory hum. Commit: 09fc2f3
- 2026-02-08 08:00 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-08 08:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Kintsugi Clinic" (kintsugi): pottery repair loop with crack→glue→dust→polish phases and periodic gold-seam glints (optional ambience + chimes). Commit: a8e396e
- 2026-02-08 09:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Telephone Switchboard Nights" (switchboard): operator board with blinking calls, animated patch cords, phase-based rush hours, and a periodic mystery-call glitch (optional ring/click audio). Commit: f259a5a
- 2026-02-08 09:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Container Port Logistics" (containerport): ship arrival + crane unload/stack phases, reroute alert overlay, and end-of-shift sweep; optional port ambience audio. Commit: 1c63a85
- 2026-02-08 10:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Weather Balloon Ascent" (weatherballoon): atmosphere-layer ascent with live sensor HUD, glitch moments, then burst → parachute descent loop; optional wind bed audio. Commit: 5ad47ff
- 2026-02-08 10:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Stargazer's Logbook" (stargazerlog): telescope view + logbook page; target→track→sketch phases with meteor streaks and focus breathing. Commit: 9ea9ab9
- 2026-02-08 11:08 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Haunted Floorplan Tour" (hauntedplan): blueprint floorplan tour with flicker notes + periodic DOOR SLAM reset; optional drone/noise ambience. Commit: 49fbc4a
- 2026-02-08 11:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Paper Marbling Studio" (papermarble): drops → swirl → comb → pull → dry cycle with optional ambience and a rare PERFECT PULL sheen. Commit: 07cd6e7
- 2026-02-08 12:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Arcade Attract Mode Archives" (arcadeattract): CRT attract loop with title/scores/demo/how-to phases, coin-in flashes, scanlines/glitch, and rotating cabinet-art archive cards; optional arcade room-tone when audio is enabled. Commit: e151d4c
- 2026-02-08 13:01 (Australia/Melbourne) [project:quine-tv] Marked queue item complete: "Deep Sea Sonar Survey" already implemented. Commit: da19b2b
- 2026-02-08 13:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Model Railway Control Room" (modelrail): control-room panel + track schematic with signals/turnouts/trains; clear-wave + emergency-stop moments; optional control-room hum. Commit: a51c72d
- 2026-02-08 14:00 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-08 14:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Timekeeper's Bench ASMR" (timekeeper): warm watchmaker bench with part-sorting trays → assembly into movement → regulation phase, loupe inset, and a periodic PERFECT TICK glint (optional soft ticks when audio is enabled). Commit: 9f6e98d
- 2026-02-08 15:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Weatherfax Terminal" (weatherfax): retro terminal + dot-matrix chart printout with RX→PRINT→ANNOTATE→ARCHIVE phases; optional quiet fax/radio ambience + printer ticks. Commit: c1d95a5
- 2026-02-08 15:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Ant Farm Transit Authority" (antfarm): ant-tunnel subway network with phase-based service levels, route map UI, pheromone surge + tunnel-closure alerts, and a queen inspection flyby; optional low drone + tiny dispatch beeps when audio is enabled. Commit: 51ea07e
- 2026-02-08 16:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Subsea Cable Pulse Monitor" (subseacable): ocean cross-section with repeater nodes; light pulses + packet storms + fault-isolate sequence; optional low underwater hum audio. Commit: e92d8a4
- 2026-02-08 16:34 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Botanical Blueprint Studio" (botblueprint): cyanotype drafting-table leaf venation + cross-section blueprint with scanline and optional paper-noise audio. Commit: 5ef275d
- 2026-02-08 17:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Rooftop Water Tank Nights" (rooftoptank): night rooftop skyline with pump-driven tank level, gauge panel, maintenance walk-by, and storm lightning reset (optional city hum audio). Commit: c821a0c
- 2026-02-08 18:06 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Museum Diorama Restoration" (dioramarest): dust → paint match → brush → reveal cycle with optional workshop ambience. Commit: b08cd9c
- 2026-02-08 18:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Mailroom Tube Network" (mailroomtube): pneumatic tube routing diagram with canisters, jam-clear alerts, and periodic end-of-shift sweep; optional hum/drone when audio is enabled. Commit: 907692e
- 2026-02-08 19:04 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Desert Radio Telescope Array" (radiotelescope): night desert dish field with phase-based calibrate/track/sweep/quiet mode, waterfall panel, interference bursts, and a rare WOW transient moment (optional wind+drone audio). Commit: 370e255
- 2026-02-08 19:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Vending Machine Oracle" (vendoracle): neon vending machine with tarot-like reshuffles, printed fortune receipts, and a rare mystery-spiral glass glitch (optional cozy hum audio). Commit: d068a70
- 2026-02-08 20:00 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-08 20:36 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Dungeon Cartographer's Desk" (dungeoncarto): candlelit parchment dungeon map drawn in phases with trap pings and a secret-door shimmer reset. Commit: 2b1e2c0
- 2026-02-08 21:32 (Australia/Melbourne) [project:quine-tv] Implemented/fixed channel "Robotic Arm Ballet" (robotarmballet): wired render/init so it displays correctly in the main loop. Commit: 33c95d8
- 2026-02-08 22:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Neon Sign Repair Bench" (neonrepair): phase-based diagnose→bend→seal→light loop with scanline, crackle/flicker moments, and a steady-glow finale; optional hum+beeps when audio is enabled. Commit: 23e87d2
- 2026-02-08 22:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Exposure Triangle School" (exposuretriangle): vintage film HUD teaching ISO/aperture/shutter with scenario quiz + test shot simulation; optional pink-noise ambience. Commit: de95b48
- 2026-02-08 23:06 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Mythical Creature Field Station" (cryptidstation): ranger desk dossier logging rotating evidence (cast/sketch/map/etc) with timed glitches + SPECIMEN FILED stamp. Commit: 8e3dbaa
- 2026-02-08 23:34 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Ship-in-a-Bottle Workshop" (shipbottle): horizontal bottle build loop (hull→mast→rigging→polish) with bubbles/waves + "perfect knot" sparkle moment; optional ambience + pings. Commit: 3387406
- 2026-02-09 00:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Constellation Stitch‑Along" (stitchalong): embroidery hoop with fabric weave, phase-based constellations, thread shimmer + gold highlight moments (optional ambience + tiny needle clicks). Commit: 63951ba
- 2026-02-09 00:36 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Wind Tunnel Toy Lab" (windtunnel): wind tunnel chamber with streamlines + smoke puffs, lift/drag HUD, phase-based test series, and stall recovery moments (optional wind drone audio). Commit: f518b07
- 2026-02-09 01:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Forge & Anvil Rhythm" (forgeanvil): smithy loop with phase-based heat→hammer→quench→polish, sparks/steam, and a timed perfect-ring moment (optional audio). Commit: 1221dc5
- 2026-02-09 01:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Miniature Paint Swatch Factory" (swatchfactory): mix bowl + sliding swatch cards + harmony grid, with PERFECT MATCH sparkles (optional ambience). Commit: 81d0eaf
- 2026-02-09 02:00 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-09 02:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Geologist's Polarized Microscope" (polarmicro): thin-section slide viewport with rotating polarizers, grain labels, and phase-flip moments; optional drone audio. Commit: 59e89fc
- 2026-02-09 03:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Laser Cutter Cutfile Studio" (lasercutfile): vector-path preview → cut passes → peel reveal, with sparks + pop-out moment; optional hum/hiss audio. Commit: b29d08a
- 2026-02-09 03:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Airport Tower Strip Board" (towerstrips): flight strips slide/stack across ARR/DEP/HOLD phases with handoff highlights and runway-change moments (optional tower-room ambience). Commit: d8595ee
- 2026-02-09 04:04 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Book Return Sorting Machine" (bookreturns): conveyor intake → scan metadata card → divert to bins, with jam alert + tidy sweep; optional library ambience. Commit: 40446d3
- 2026-02-09 04:36 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Reel-to-Reel Tape Splicing Desk" (reeltoreel): phase-based wind→cut→splice→play loop with animated tape path, VU meters, and rare clean-edit sparkle; optional pink-noise + soft drone ambience. Commit: 7b172a0
- 2026-02-09 05:06 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Cipher Wheel Classroom" (cipherwheel): chalkboard cipher wheel lessons with intro/demo/quiz/reveal phases + message-decoded stamp; optional quiet pink-noise bed. Commit: 9f81f5b
- 2026-02-09 05:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Streetlight Night Repair Crew" (streetlightcrew): night street vignette with lift-basket rise, swap sparks, flicker test phase, then steady sodium glow (optional hum). Commit: 621b051
- 2026-02-09 06:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Beehive Spectrum Radio" (beehivespectrum): honeycomb parallax + waggle-dance trace spectrum/waterfall with periodic QUEEN CHECK pulses (optional warm hum). Commit: 316c5d8
- 2026-02-09 06:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Mechanical Music Box Workshop" (musicbox): phase-based ALIGN→PUNCH→TEST→PERFECT TUNE with rotating pin drum, gears, comb teeth, and optional note pings/drone. Commit: a2b5e07
- 2026-02-09 07:04 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Observatory Dome Scheduler" (domescheduler): dome silhouette + schedule cards + cloud-cover rolls + meteor-window GO event; optional drone ambience. Commit: 336dcbf
- 2026-02-09 07:30 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-09 08:04 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Microfilm Archive Reader" (microfilm): dim reader desk with advancing reels, scrolling film frames, scan window, and a periodic FOUND NOTE overlay; optional motor ambience + film clicks when audio is enabled. Commit: 8b536e1
- 2026-02-09 08:34 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Locksmith's Pin‑Tumbler Bench" (locksmith): workbench key-cut → pin alignment “perfect click” → turn-test phases; optional pink-noise + drone ambience with cutter ticks/click SFX. Commit: 87be477
- 2026-02-09 09:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Starship Cargo Manifest" (cargomanifest): starship bay HUD with scrolling manifest panel, scan sweeps, routing arrows, and rare anomaly quarantine overlay; optional drone/pink-noise ambience + scan/alarm beeps. Commit: 781dcaf
- 2026-02-09 09:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Seed Vault Inventory" (seedvault): vault cabinet + drawer pull/inspect/reseal loop with humidity/temp gauges and an end-of-shift tally stamp. Commit: de309f2
- 2026-02-09 10:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Ceramic Kiln Firing Curve" (kilncurve): kiln peephole glow + firing curve chart with BISQUE/GLAZE/COOL phases; cone-bend flash moment; optional furnace hum audio. Commit: fc0eacf
- 2026-02-09 10:36 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Elevator Control Panel Dreams" (elevatorpanel): retro floor indicator + call queue, chase-lit buttons, service-mode interlude, and an arrival chime when audio is enabled. Commit: f8df47d
- 2026-02-09 11:35 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Telegraph Key Practice Hour" (telegraph): paper tape feed with morse pulses + practice/quiz/reveal HUD and a MESSAGE RECEIVED stamp moment; optional key clicks/tones when audio is enabled. Commit: 734787f
- 2026-02-09 12:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Street Map Folding Gym" (streetmapfold): paper map unfold/fold loop, crease sheen, animated route trace, and rare PERFECT FOLD snap moment with optional paper-rustle audio. Commit: 9129eb0
- 2026-02-09 12:34 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Nanobot Repair Swarm" (nanobotrepair): microscope viewport with SCAN→PATCH→POLISH phases, swarm particles, and a REPAIR COMPLETE sparkle moment; optional hum+beeps when audio is enabled. Commit: 6b1969e
- 2026-02-09 13:04 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Ice Core Analysis Lab" (icecorelab): rotating stratified core cylinder + isotope chart panel with SCAN/CUT/ANALYZE/VOLCANIC phases and periodic glints; optional lab drone + pink-noise ambience. Commit: e570cd1
- 2026-02-09 13:30 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-09 14:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Marble Run Dispatch" (marbledispatch): marble-run routing network with SORT/EXPRESS/JAM CLEAR phases, animated switch gates, and a cascade finale (optional low rumble + click/beep audio). Commit: a82bda2
- 2026-02-09 15:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Neon Laundromat Spin Cycle" (neonlaundromat): wash/rinse/spin/dry phased loop with neon sign + rain window, rotating drum visuals, timer HUD, and periodic LOST SOCK alert card (optional hum/noise audio). Commit: e769d13
- 2026-02-09 16:02 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Cave Torch Storyboard" (cavetorch): torch-lit cave wall with timed mural scenes (hunt/river/stars/beast), dripping water + drifting dust motes, and a rare handprint flash moment (optional torch crackle + ambience). Commit: 1f39fdb
- 2026-02-09 16:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Vinyl Pressing Plant" (vinylpress): heat→press→cool→sleeve loop with QC waveform panel, label stamp moments, steam puffs, and a perfect-press glint; optional hum/hiss + thump beeps when audio is enabled. Commit: b8fb526
- 2026-02-09 17:05 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Sushi Conveyor Night Shift" (sushiconveyor): conveyor belt plates + order tickets with a RUSH HOUR wave and a CHEF'S SPECIAL sparkle card; optional ambience. Commit: 75aab84
- 2026-02-09 17:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Signal Flag Regatta" (flagregatta): calm ocean parallax with a signal boat teaching semaphore-style flags; periodic quiz + reveal flash, gust snaps, and gull fly-bys; optional brown-noise sea bed. Commit: 23df38f
- 2026-02-09 18:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Mini Greenhouse Climate Console" (minigreenhouse): greenhouse interior + console UI with MIST/VENT/HEAT/DRIP phases, condensation droplets, subtle plant growth, and dew-burst sparkles; optional ambience. Commit: b7736f3
- 2026-02-09 18:36 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Snowplow Route Planner" (snowplow): winter city grid map with route overlay, live snowfall, salt gauge + refill run, reroute flash moments, and end-of-shift clear sweep; optional wind/drone ambience. Commit: 87af094
- 2026-02-09 19:00 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Harbor Tug Dispatch" (tugdispatch): port chart map with tug towlines guiding an inbound ship through DOCKING/SQUALL/ALL CLEAR phases; includes tide gauge + lightning flashes; optional harbor drone audio. Commit: efd2f73
- 2026-02-09 19:30 (Australia/Melbourne) [project:quine-tv] Implemented new channel "Vintage Cash Counter" (cashcounter): back-office counting machine with COUNT/BUNDLE/AUDIT/RECONCILE phases, fraud stamp moment, and end-of-day reconciliation card; optional mechanical clicks + drone. Commit: 88517d8
- 2026-02-09 20:01 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-09 20:30 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 review+improvement tasks (no new channels).
- 2026-02-09 21:00 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-09 21:30 (Australia/Melbourne) [project:quine-tv] Refilled empty queue with 10 new channel idea tasks.
- 2026-02-09 23:00 (Australia/Melbourne) [project:quine-tv] Reviewed channel `aquarium`: captured screenshots (0–60s), added REVIEWED marker, and queued concrete follow-ups. Commit: 7203741
- 2026-02-09 23:30 (Australia/Melbourne) [project:quine-tv] Fixed fish vertical motion drift in `aquarium` by adding per-fish baseY and computing y from sin() each frame. Commit: 6e3b330
- 2026-02-09 23:48 (Australia/Melbourne) [project:quine-tv] Reduced hot-path allocations in `aquarium` render by caching water/vignette gradients and bucketed bubble sprites. Commit: ee319f5
- 2026-02-10 00:05 (Australia/Melbourne) [project:quine-tv] Added deterministic time-structure phases (calm → schooling → deep-glow) to `aquarium` (fish/bubble multipliers + deep glow wash). Commit: 2491dbc
- 2026-02-10 00:18 (Australia/Melbourne) [project:quine-tv] Added rare special moments to `aquarium` (bioluminescent bloom + passing silhouette), seeded + subtle. Commit: 62e24bd
- 2026-02-10 00:30 (Australia/Melbourne) [project:quine-tv] Audio hygiene pass for `aquarium` (defensive stop on re-on; clear stale current on off). Commit: d419667
- 2026-02-10 01:18 (Australia/Melbourne) [project:quine-tv] `cctv`: replaced per-frame Date() timestamp with deterministic seeded clock computed once per frame and passed into each cam render. Commit: 5f14870
- 2026-02-10 01:30 (Australia/Melbourne) [project:quine-tv] `cctv`: audio hygiene (defensive stop on re-on; clear stale current on off). Commit: c6fc320
- 2026-02-10 01:47 (Australia/Melbourne) [project:quine-tv] `cctv`: perf pass (cached light sprite; fewer fillStyle changes in noise loop). Commit: a1c648f
- 2026-02-10 02:03 (Australia/Melbourne) [project:quine-tv] `cctv`: added 2–4 minute seeded quiet→patrol→busy phase cycle affecting motion interval + box counts, with phase shown in title bar. Commit: e96f947
- 2026-02-10 02:15 (Australia/Melbourne) [project:quine-tv] `cctv`: added rare signal loss/reconnect overlay + brief CAM SWITCH overlay special moments (seeded; ~45–120s). Commit: faa334c
- 2026-02-10 02:51 (Australia/Melbourne) [project:quine-tv] Reviewed channel `analogdarkroom`: captured screenshots (0–300s), added REVIEWED marker, and queued concrete follow-ups. Commit: 1484e0b
- 2026-02-10 03:00 (Australia/Melbourne) [project:quine-tv] `analogdarkroom`: audio hygiene (defensive stop on re-on; clear stale current on off). Commit: fd2e304
- 2026-02-10 03:21 (Australia/Melbourne) [project:quine-tv] Perf pass analogdarkroom: cached background/vignette/lamp/leak/liquid/paper base sprites so steady-state draw() allocates 0 gradients. Commit: ac327a3
- 2026-02-10 03:30 (Australia/Melbourne) [project:quine-tv] Perf pass analogdarkroom: bubble draw loop sets fillStyle once per frame; varies intensity via globalAlpha (no per-bubble rgba string allocations). Commit: 6c4bc00
- 2026-02-10 03:47 (Australia/Melbourne) [project:quine-tv] Perf polish analogdarkroom: pre-rendered print grain layer per print (offscreen) and blit during develop (1 drawImage/frame). Commit: 4eb9f23
- 2026-02-10 04:08 (Australia/Melbourne) [project:quine-tv] Reviewed channel `fire` (Cozy Fireplace): captured screenshots (0–300s), added REVIEWED marker, and queued concrete follow-ups. Commit: 347db53
- 2026-02-10 04:17 (Australia/Melbourne) [project:quine-tv] `fire` (src/channels/fireplace.js): audio hygiene (defensive stop on re-on; clear stale current on off/destroy). Commit: 658cd96
- 2026-02-10 04:33 (Australia/Melbourne) [project:quine-tv] `fire` (src/channels/fireplace.js): perf pass — cached background/hearth layer + pre-rendered log sprites so steady-state render allocates 0 gradients for these parts. Commit: d445295
- 2026-02-10 04:48 (Australia/Melbourne) [project:quine-tv] `fire` (src/channels/fireplace.js): perf pass — replaced per-spark radial gradients with cached spark sprites (bucketed by radius; alpha via globalAlpha). Commit: 53d7449
- 2026-02-10 05:00 (Australia/Melbourne) [project:quine-tv] `fire`: added deterministic calm→roaring→embers phase cycle (spark count, flame height, glow). Commit: aae04fe
- 2026-02-10 05:15 (Australia/Melbourne) [project:quine-tv] `fire`: added rare seeded special moments (log shift + ember burst, gust flare), scheduled ~45–120s. Commit: 0a78b43
- 2026-02-10 06:30 (Australia/Melbourne) [project:quine-tv] `antfarm`: audio hygiene (defensive stop on re-on; clear stale current on off). Commit: 639955e
- 2026-02-10 06:46 (Australia/Melbourne) [project:quine-tv] Perf pass `antfarm`: cached soil gradient + farm glass/speckle + vignette into offscreen canvases; drawBackground now blits cached layers (0 gradients per frame, no per-frame speckle loop). Commit: 515c14d
- 2026-02-10 07:00 (Australia/Melbourne) [project:quine-tv] Perf pass `antfarm`: precomputed per-ant body color on spawn (no per-frame template literal allocations in drawAnts). Commit: 0aa0b75
- 2026-02-10 07:15 (Australia/Melbourne) [project:quine-tv] Visual polish `antfarm`: increased ant size slightly + added subtle shadow/highlight for readability while keeping UI clean. Commit: 24873d9
- 2026-02-10 08:08 (Australia/Melbourne) [project:quine-tv] Reviewed channel `baggagecarousel`: captured screenshots (0–300s), added REVIEWED marker, and queued concrete follow-ups. Commit: 8f78c34
- 2026-02-10 08:15 (Australia/Melbourne) [project:quine-tv] `baggagecarousel`: audio hygiene (defensive stop on re-on; clear stale current on off/destroy). Commit: a2b7462
- 2026-02-10 08:30 (Australia/Melbourne) [project:quine-tv] Perf pass `baggagecarousel`: cached floor/vignette/belt/post gradients (rebuilt on resize / ctx swap) so steady-state `drawFloor()`+`drawCarousel()` allocate 0 gradients per frame. Commit: 58d7201
- 2026-02-10 08:48 (Australia/Melbourne) [project:quine-tv] Perf pass `baggagecarousel`: pre-rendered floor tile grid layer and blit with drift offset (no per-frame tile-line loops in steady-state). Commit: 8e77ba3
- 2026-02-10 09:00 (Australia/Melbourne) [project:quine-tv] Perf polish `baggagecarousel`: belt tick loop sets `strokeStyle` once per frame; intensity via `globalAlpha` (no per-tick rgba/template strings). Commit: 688190a
- 2026-02-10 09:19 (Australia/Melbourne) [project:quine-tv] Visual polish `baggagecarousel`: tighter framing + subtle camera FX layer (scanlines, grain, exposure breathing) with OSD kept crisp. Commit: e183bc5
- 2026-02-10 13:18 (Australia/Melbourne) [project:quine-tv] Special moment `bonsai`: added rare single falling-leaf event (45–120s) with deterministic timer + clean reset. Commit: 0bea975
- 2026-02-11 04:02 (Australia/Melbourne) [project:quine-tv] Audio hygiene `bughotel` (src/channels/bughotel.js): added defensive stop+clearCurrent handling so repeated audio toggles don’t stack. Commit: 217c253
- 2026-02-11 04:18 (Australia/Melbourne) [project:quine-tv] Perf pass `bughotel` (src/channels/bughotel.js): cached background/vignette + terrarium glass/substrate gradients; rebuild on resize/ctx swap via ensureGradients(). Commit: 7cfafec
- 2026-02-11 04:51 (Australia/Melbourne) [project:quine-tv] Time structure `bughotel` (src/channels/bughotel.js): added seeded 2–4 min quiet→busy→night phase cycle, phase-driven activity + background tint, deterministic sightings schedule, and rare specials (flashlight sweep / dew drops) scheduled ~45–120s. Commit: f7b5350
- 2026-02-11 07:30 (Australia/Melbourne) [project:quine-tv] Audio hygiene `circsafari`: defensive stop on re-on; on off/destroy clear stale current when owned. Commit: 814d431
- 2026-02-11 09:15 (Australia/Melbourne) [project:quine-tv] Perf pass `candlechess`: dust draw now sets fillStyle once and uses globalAlpha (no per-particle rgba/toFixed strings). Commit: 5382f89
- 2026-02-11 09:30 (Australia/Melbourne) [project:quine-tv] Perf pass `candlechess`: cached board/vignette gradients + replaced candle gradients with cached sprites so steady-state render executes 0 create*Gradient() calls. Commit: 9938437
- 2026-02-11 14:45 (Australia/Melbourne) [project:quine-tv] Perf pass `exposuretriangle`: cached paper/vignette gradients (rebuild on resize/ctx swap) and pre-rendered scanlines into an offscreen canvas (single drawImage blit). Commit: 3dcafb2
- 2026-02-11 18:49 (Australia/Melbourne) [project:quine-tv] Visual polish `dreamreceipt`: print coupon on-receipt (no side drop; cue aligned to print head). Commit: 9a18fe3
- 2026-02-11 20:30 (Australia/Melbourne) [project:quine-tv] `volcanoobs`: seismograph overlay — intensity threshold ticks + alert state label/meter (tied to intensityAt(loopT)). Commit: eab3c69
- 2026-02-11 21:49 (Australia/Melbourne) [project:quine-tv] `containerport`: improved clouds (layered deterministic puffs; no rand() calls). Commit: 9dddb4a
- 2026-02-11 22:04 (Australia/Melbourne) [project:quine-tv] visuals `containerport`: made crane frame sturdier (filled mast/beam + truss braces). Commit: bd87b1f
- 2026-02-11 23:05 (Australia/Melbourne) [project:quine-tv] visuals `containerport`: containers now render with a more shipping-container look (corrugation ribs, corner castings, door seam). Commit: 7b8d2e3
- 2026-02-11 23:33 (Australia/Melbourne) [project:quine-tv] visuals `containerport`: ship now starts fully off-screen before arrival and sweeps in from the right. Commit: fec9124
- 2026-02-12 04:09 (Australia/Melbourne) [project:quine-tv] Reviewed channel `elevatorpanel` (src/channels/elevatorpanel.js): captured screenshots (0–300s), confirmed REVIEWED marker, and queued concrete follow-ups in `/home/puzzleduck/clawd/TODO.md`. Commit: TBD
- 2026-02-12 15:30 (Australia/Melbourne) [project:quine-tv] Visual depth `elevatorpanel` (src/channels/elevatorpanel.js): added subtle glass reflection + edge vignette/bloom overlay that varies by segment (MOVE/ARRIVE/SERVICE) while keeping OSD crisp. Commit: 8c6946b
- 2026-02-12 17:00 (Australia/Melbourne) [project:quine-tv] `flow` (src/channels/flowfield.js): added rare deterministic “special moments” (inversion + shockwave) scheduled ~45–120s with OSD-safe label/ring + clean reset. Commit: 3dfb45a
- 2026-02-12 18:20 (Australia/Melbourne) [project:quine-tv] Visual `elevatorpanel` (src/channels/elevatorpanel.js): added right-side building schematic (shafts + elevator cars) with active shaft + target floor highlight. Commit: e3f49bb
- 2026-02-12 18:30 (Australia/Melbourne) [project:quine-tv] `stitchalong` (src/channels/constellationstitch.js): expanded constellation variety and added a rare deterministic shooting-star sweep + re-thread special moment (~45–120s). Screenshots: screenshots/autopilot-stitchalong-before + screenshots/autopilot-stitchalong-after. Commit: TBD
- 2026-02-13 01:52 (Australia/Melbourne) [project:quine-tv] Reviewed channel `fixit` (src/channels/fixit.js): captured screenshots (0–300s) to `screenshots/review-fixit`, added REVIEWED marker, and queued concrete follow-ups in `TODO.md`. Commit: 9eab6f2
- 2026-02-13 02:05 (Australia/Melbourne) [project:quine-tv] `fixit` (src/channels/fixit.js): Audio hygiene — `onAudioOn()` idempotent (no stacking), noise fade-out on stop to reduce clicks, and `onAudioOff()`/`destroy()` clear AudioManager.current only when owned. Commit: 8ea6a40
- 2026-02-13 03:04 (Australia/Melbourne) [project:quine-tv] `fixit`: added rare deterministic “special moments” (LAMP FLICKER, SUCCESS STAMP, DUST PUFF) scheduled ~45–120s with clean reset + subtle audio signature. Commit: 8043a42

- 2026-02-13 07:30 (Australia/Melbourne) [project:quine-tv]  (src/channels/rubberduck.js): UI — added a subtle header phase indicator (CALM/CRISIS/RESOLUTION) driven by ; OSD-safe. Commit: ecfbc9e

- 2026-02-13 07:30 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): UI — added a subtle header phase indicator (CALM/CRISIS/RESOLUTION) driven by `phaseParams(t)`; OSD-safe. Commit: ecfbc9e
- 2026-02-13 08:45 (Australia/Melbourne) [project:quine-tv] `duckdebug` (src/channels/rubberduck.js): special moments — added a second rare deterministic PANIC/CORE DUMP overlay+mini-scroll with independent schedule + clean reset. Commit: d3daed2
- 2026-02-13 15:19 (Australia/Melbourne) [project:quine-tv] `forgeanvil` (src/channels/forgeanvil.js): bugfix — added a floor plane + removed wall motion (brick drift). Screenshots: screenshots/autopilot-forgeanvil-floorwall-before + screenshots/autopilot-forgeanvil-floorwall-after. Commit: c97c39d
