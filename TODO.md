if `TODO.md` has no ready items:
  - Pick an **unreviewed** channel and perform a **detailed review** (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).


# TODO Queue

- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Visual - show a diagram of the building on the right with the elevator shafts and elevators highlighted
- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Visual - call queue should be populated at random and serviced by elevators
- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Buttons — replace simple chase light with persistent “selected floor” LEDs tied to CALL/QUEUE, plus press animation when a call is queued.
- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Long-run interest — add 1–2 rare deterministic “special moments” (~45–120s) (e.g., fire-service key mode, overload alarm, inspection glitch) with clear visual signature and clean reset.

- [quine-tv] `kintsugi` (src/channels/kintsugiclinic.js): Long-run interest — make the polish glint a true rare “special moment” (~45–120s) with a more dramatic, clearly visible signature + clean reset.

- [quine-tv] `flow` (src/channels/flowfield.js): Long-run interest — add a 2–4 min phase cycle (CALM→SURGE→DRIFT) that modulates `fieldScale`, fade amount, and speed; schedule phase boundaries deterministically from `seed`.
- [quine-tv] `flow` (src/channels/flowfield.js): Special moment — add 1–2 rare deterministic events (~45–120s) (e.g., brief “field inversion” or ripple shockwave that temporarily bends trajectories) with a clear visual signature + clean reset.

- [quine-tv] `lava` (src/channels/lava.js): Perf — remove per-blob `createRadialGradient()` allocations in `render()` by pre-rendering blob sprites (bucket by radius + hue) to offscreen canvases and blitting with blur/composite. Accept: steady-state `render()` creates 0 gradients/frame.
- [quine-tv] `lava` (src/channels/lava.js): Time structure — add a 2–4 min phase cycle (CALM→BLOOP→SURGE) that modulates blob speed/blur/intensity and schedules 1–2 deterministic rare events (~45–120s) beyond the simple flash.

- [quine-tv] `stitchalong` (src/channels/constellationstitch.js): Long-run interest — expand pattern variety (more constellations/edge sets) and add a rare deterministic “special moment” (~45–120s) (e.g., shooting-star sweep that briefly re-threads a segment) with clean reset and OSD-safe flash.
