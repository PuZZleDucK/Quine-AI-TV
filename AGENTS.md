# Agent Instructions (Quine TV)

## Screenshot Review Workflow

The repository includes a Playwright-based capture tool: `scripts/capture-channel-screenshots.mjs` (invoked via `npm run screenshots`).

### Prereqs

1. Ensure the dev server is running (default `http://localhost:5176`):

```bash
npm run dev
```

2. If Playwright Chromium is not installed on the machine:

```bash
npm run screenshots:install
```

### Capture A Single Channel For Review

For a good channel review, capture:
- The first few frames shortly after tuning (detect flicker / overly-fast motion / initialization artifacts).
- A frame at ~10 seconds (initial steady state).
- A frame at ~1 minute (sustained behavior).
- A frame at ~5 minutes (long-run drift, perf cliffs, leaks).

Use `OFFSETS_MS` to capture at specific times after tuning:

```bash
OUT_DIR=screenshots/review-aquarium \
  CLEAN_OUT_DIR=1 \
  CHANNEL_ID=aquarium \
  OFFSETS_MS=0,200,400,600,800,10000,60000,300000 \
  FAIL_ON_ERRORS=1 \
  npm run screenshots
```

Notes:
- `CHANNEL_ID` selects a channel by id (e.g. `aquarium`). Alternatively use `CHANNEL_NUM=2`.
- Output includes a `report.json` with `captures`, `errors`, and `warnings`.
- The capture intentionally keeps the OSD visible in the shot (to verify UI remains legible/uncluttered).

### Multi-Frame Capture (Uniform Spacing)

If you want evenly spaced frames (useful for checking animation speed):

```bash
OUT_DIR=screenshots/review-aquarium-frames \
  CLEAN_OUT_DIR=1 \
  CHANNEL_ID=aquarium \
  FRAMES=12 \
  FRAME_GAP_MS=200 \
  FAIL_ON_ERRORS=1 \
  npm run screenshots
```

