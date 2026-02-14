if `TODO.md` has no ready items:
  - Pick a least reviewed channel and perform a detailed review (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).

# TODO Queue

- [ ] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): audio hygiene — make `onAudioOn()` idempotent (stop existing ambience we own before starting) and ensure `onAudioOff()`/`destroy()` only clear `AudioManager.current` when owned (prevent stacked hum/noise/drone on audio toggles).

- [ ] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): determinism — switch `update(dt)` to a fixed-timestep sim loop (`SIM_DT=1/60` accumulator) so 30fps/60fps screenshot captures match for the same seed (special-moment schedules + drum rotation cadence-stable).

- [ ] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): text variety — expand the LOST SOCK alert `sock` pool (in `update()`, near the `pick(rand, [...])`) to ~40–80 themed variants and rotate via a seeded shuffle-bag so it doesn’t repeat quickly.

- [ ] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): special moment — add a second rare deterministic event (e.g. “COIN JAM”) with a clearly-visible signature (control-panel strobe + door shake + OSD-safe banner), scheduled via a separate seeded RNG (~90–240s cadence), with clean reset.

- [ ] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): perf — cache static background/window gradients into offscreen layers rebuilt on init/resize so steady-state `render()` allocates 0 gradients/frame (verify).

<!-- done: moved to TODONE.md -->
<!-- done: moved retroboot unixes task to TODONE.md -->
<!-- done: moved to TODONE.md -->
