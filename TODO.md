if `TODO.md` has no ready items:
  - Pick a least reviewed channel and perform a detailed review (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).

# TODO Queue

- [ ] [project:quine-tv] `synthwave` (src/channels/synthwave.js): determinism — remove `rand()` usage from `drawTitle()` glitch jitter; derive jitter from `hashUnit32(seed ^ timeBucket)` so 30fps/60fps screenshot captures match.

- [ ] [project:quine-tv] `synthwave` (src/channels/synthwave.js): long-run interest — POLICE LIGHTS moment appears implemented; verify it reliably triggers ~2–5 min, is unmistakable in motion, and consider a subtle one-shot siren sting (OSD-safe label, clean reset).

- [ ] [project:quine-tv] `synthwave` (src/channels/synthwave.js): visuals — add an occasional deterministic foreground silhouette pass (road sign / billboard / bridge segment) to break up the large empty grid over minutes (keep OSD clear).

- [ ] [project:quine-tv] `traveldesk` (src/channels/traveldesk.js): postcard — postcard looks meh and text is not postcard like - redesign and add better parody postcard text and layout

# pending - do not do

- [ ] [project:quine-tv] `traveldesk` (src/channels/traveldesk.js): postcard — flip the postcard for the last 15 seconds showing parody postcard image for location on the other side
