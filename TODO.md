if `TODO.md` has no ready items:
  - Pick an **unreviewed** channel and perform a **detailed review** (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).


# TODO Queue

- [quine-tv] `duckdebug` (src/channels/rubberduck.js): add more bugs and fix dialog, allow multiline
<!-- DONE (moved to TODONE): duckdebug add variation to the usernames and dialog -->

- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Buttons — replace simple chase light with persistent “selected floor” LEDs tied to CALL/QUEUE, plus press animation when a call is queued.
- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Long-run interest — add 1–2 rare deterministic “special moments” (~45–120s) (e.g., fire-service key mode, overload alarm, inspection glitch) with clear visual signature and clean reset.
- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Visual depth — add subtle glass reflection + edge vignette/panel bloom that varies by segment (MOVE/ARRIVE/SERVICE) without cluttering OSD.
- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Text/dialog — expand the status strip into themed, mildly funny annunciator messages that can last 5 minutes (seeded rotation, no repeats too quickly).

- [quine-tv] `kintsugi` (src/channels/kintsugiclinic.js): Determinism — decouple audio randomness from visual PRNG (no `rand()` consumption inside `if (audio.enabled)` paths); use separate RNG or deterministic hash based on time/phase.
- [quine-tv] `kintsugi` (src/channels/kintsugiclinic.js): Perf pass — cache gradients created in render path (`drawBench`, `drawPotteryBase`, `drawGoldSeams`, vignette) and rebuild on resize/regen/ctx swap (0 `create*Gradient()` calls per frame in steady state).
- [quine-tv] `kintsugi` (src/channels/kintsugiclinic.js): Long-run interest — make the polish glint a true rare “special moment” (~45–120s) with a more dramatic, clearly visible signature + clean reset.
- [quine-tv] `kintsugi` (src/channels/kintsugiclinic.js): Text/dialog — add a rotating “case notes” line/panel (seeded, no repeats too quickly) with ~40–80 variants so it stays entertaining over 5 minutes; keep it subtle and OSD-safe.
- [quine-tv] `kintsugi` (src/channels/kintsugiclinic.js): Visual correctness — clip cracks/dust/gold seams to the pottery ellipse (so no seam/glow lines render outside the bowl). Keep shadow/bench unaffected.
- [quine-tv] `kintsugi` (src/channels/kintsugiclinic.js): Visual polish — improve CRACK phase readability by varying crack thickness/opacity by depth and adding tiny branching micro-cracks near endpoints (deterministic per crack) without adding per-frame RNG.

- [quine-tv] `flow` (src/channels/flowfield.js): Determinism — replace `for (const p of pts) { p.x += ... * dt; ... }` integration with a fixed-timestep update loop (accumulate `dt`, step at e.g. 1/60) so 30fps vs 60fps yields identical captures for the same seed.
- [quine-tv] `flow` (src/channels/flowfield.js): Perf — remove per-point template-literal `hsla(...)` allocations in `render()` by quantizing hue to N buckets (e.g. 48) and precomputing `fillStyle` strings per bucket; vary per-point intensity via `globalAlpha`.
- [quine-tv] `flow` (src/channels/flowfield.js): Long-run interest — add a 2–4 min phase cycle (CALM→SURGE→DRIFT) that modulates `fieldScale`, fade amount, and speed; schedule phase boundaries deterministically from `seed`.
- [quine-tv] `flow` (src/channels/flowfield.js): Special moment — add 1–2 rare deterministic events (~45–120s) (e.g., brief “field inversion” or ripple shockwave that temporarily bends trajectories) with a clear visual signature + clean reset.
- [quine-tv] `flow` (src/channels/flowfield.js): Visual identity — add a subtle, cached background gradient + slow midground “mist”/grain layer (seeded) so the scene reads less empty/digital; keep OSD-safe and avoid per-frame allocations.
- [quine-tv] `flow` (src/channels/flowfield.js): Long-run composition — prevent particle collapse into a couple of bright ribbons after ~5 min (e.g., deterministic periodic re-seed of a small % of points, or gentle divergence/jitter schedule) so coverage stays even.

- [quine-tv] `lava` (src/channels/lava.js): Perf — remove per-blob `createRadialGradient()` allocations in `render()` by pre-rendering blob sprites (bucket by radius + hue) to offscreen canvases and blitting with blur/composite. Accept: steady-state `render()` creates 0 gradients/frame.
- [quine-tv] `lava` (src/channels/lava.js): Time structure — add a 2–4 min phase cycle (CALM→BLOOP→SURGE) that modulates blob speed/blur/intensity and schedules 1–2 deterministic rare events (~45–120s) beyond the simple flash.
- [quine-tv] `lava` (src/channels/lava.js): Text/dialog — add a seeded rotating caption/subtitle line (40–80 variants, no repeats too quickly) so the channel stays entertaining over 5 minutes; keep OSD-safe.
- [quine-tv] `lava` (src/channels/lava.js): Audio polish — replace plain brown-noise hum with a gentle low drone + filtered noise that breathes with phase/flash; keep `onAudioOn()` idempotent and clear current only when owned.

- [quine-tv] `stitchalong` (src/channels/constellationstitch.js): Audio hygiene — make `onAudioOn()` idempotent (stop existing `ambience` we own before starting new sources) and have `onAudioOff()`/`destroy()` stop+clear and clear `audio.current` only when owned.
- [quine-tv] `stitchalong` (src/channels/constellationstitch.js): Determinism — decouple audio randomness from visual PRNG: remove `rand()` consumption from dt-dependent `if (rand() < dt*p)` audio clicks; use a separate RNG or schedule click times deterministically (FPS-stable).
- [quine-tv] `stitchalong` (src/channels/constellationstitch.js): Perf pass — cache gradients created in render path (fabric vignette, hoop wood radial, inner hoop vignette, stitch background radial) and/or pre-render weave texture to an offscreen tile; steady-state `render()` should call 0 `create*Gradient()`.
- [quine-tv] `stitchalong` (src/channels/constellationstitch.js): Long-run interest — expand pattern variety (more constellations/edge sets) and add a rare deterministic “special moment” (~45–120s) (e.g., shooting-star sweep that briefly re-threads a segment) with clean reset and OSD-safe flash.
