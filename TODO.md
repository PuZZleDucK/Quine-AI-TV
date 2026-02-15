if `TODO.md` has no ready items:
  - Pick a least reviewed channel and perform a detailed review (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).

# TODO Queue

- [ ] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): determinism — switch `update(dt)` to a fixed-timestep sim loop (`SIM_DT=1/60` accumulator) so 30fps/60fps screenshot captures match for the same seed (special-moment schedules + drum rotation cadence-stable).

- [ ] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): special moment — add a second rare deterministic event (e.g. “COIN JAM”) with a clearly-visible signature (control-panel strobe + door shake + OSD-safe banner), scheduled via a separate seeded RNG (~90–240s cadence), with clean reset.

- [ ] [project:quine-tv] `neonlaundromat` (src/channels/neonlaundromat.js): special moment bug — popup does not stay on screen long enough.
