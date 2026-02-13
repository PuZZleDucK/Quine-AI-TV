if `TODO.md` has no ready items:
  - Pick an **unreviewed** channel and perform a **detailed review** (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).

# TODO Queue

## Channel review queue

- [ ] [project:quine-tv] Review channel `tugdispatch` (src/channels/harbortugdispatch.js): capture screenshots (0–300s), do code+audio/perf review, add `// REVIEWED: 2026-02-13`, and queue concrete follow-ups.

## Follow-ups queued from review: tugdispatch

- [ ] [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): perf — cache the tide gauge fill gradient created in `drawHUD()`; rebuild on `onResize()` / ctx swap. Accept: steady-state `drawHUD()` does 0 `createLinearGradient()` calls.
- [ ] [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): perf — replace per-frame scanline `for` loop (many `fillRect`) with a cached scanline pattern/offscreen layer built on resize. Accept: render no longer loops over `y` to draw scanlines each frame.
- [ ] [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): text/dialog — add a seeded rotating “VHF DISPATCH” log strip (funny/immersive harbor chatter), lasting 5+ minutes without repeats; keep OSD-safe.
- [ ] [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): special moment — add 1–2 rare deterministic events (~45–120s) with unmistakable signature + clean reset (e.g. “FOG HORN” + visibility haze sweep, “PILOT BOARDING” stamp, “SECURITY SWEEP” beam). If audio.enabled, add a short non-stacking cue.
- [ ] [project:quine-tv] `tugdispatch` (src/channels/harbortugdispatch.js): determinism — refactor squall lightning scheduling (`nextFlashAt`) so 30fps vs 60fps yields identical flash times at the same capture offsets (e.g., schedule via deterministic timers/accumulators rather than `phaseT >= nextFlashAt` with per-frame drift).

## Follow-ups queued from review: forgeanvil

(none queued)

## Follow-ups queued from review: futurearch

(none queued)
