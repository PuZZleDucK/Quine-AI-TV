if `TODO.md` has no ready items:
  - Pick an **unreviewed** channel and perform a **detailed review** (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).

# TODO Queue

- [project:quine-tv] Review channel `retroboot` (src/channels/retroboot.js): capture screenshots (0–300s), add `// REVIEWED: 2026-02-15`, and queue concrete follow-ups.

- [project:quine-tv] `retroboot` (src/channels/retroboot.js): determinism — switch `update(dt)` to a fixed-timestep sim loop (`SIM_DT=1/60`) so click/beep schedules are FPS-stable for 30fps/60fps captures.
- [project:quine-tv] `retroboot` (src/channels/retroboot.js): long-run interest — extend the segment cycle to ~3–5 minutes (add Win9x splash/installer, Norton/Scandisk, BSOD/Kernel Panic variants, etc) and include some uncommon and rare operating systems like bsd solaris, beos, etc.
- [project:quine-tv] `retroboot` (src/channels/retroboot.js): perf — cache CRT overlay assets (scanline pattern + vignette gradient / offscreen layer) so steady-state `renderCRT()` does 0 `createPattern()` / `createRadialGradient()` calls.
- [project:quine-tv] `retroboot` (src/channels/retroboot.js): text polish — expand DOS/Linux line pools (more believable device/probe lines + longer directory listing) so each segment runs longer without obvious repeats.
- [project:quine-tv] `retroboot` (src/channels/retroboot.js): visuals — CRT effect is too intense
- [project:quine-tv] `retroboot` (src/channels/retroboot.js): visuals bug — mac os progres bar overlaps text

