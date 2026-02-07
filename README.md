# Quine TV

HTML5 virtual TV: a CRT-ish shell UI + a pile of animated channels.

## Run

Option A (recommended):
```bash
cd ~/x/quine-tv
npm run dev
# open http://localhost:5176
```

Option B:
```bash
cd ~/x/quine-tv
python3 -m http.server
```

## Controls
- Space: power
- ↑ / ↓: channel
- 0–9: type a channel number, Enter to tune
- Backspace: edit tuning
- A: audio on/off (first click is required to allow audio)
- I: toggle info overlay (OSD)
- G: toggle channel guide
- H / ?: help

## Notes
- Each channel is a module in `src/channels/`.
- Audio is optional per-channel and only starts after user gesture.

## Channel Screenshots
Generate one screenshot per channel (discovered dynamically from `src/channels/channelList.js`):

```bash
cd ~/x/quine-tv
npm run screenshots:install   # first time only
npm run screenshots
```

Output goes to `screenshots/channels-YYYYMMDD-HHMMSS/` with:
- one PNG per channel (for example `01-synthwave.png`)
- `report.json` (captures + console/page errors)

Optional env vars:
- `BASE_URL` (default `http://localhost:5176`)
- `OUT_DIR` (custom output folder)
- `WAIT_MS` (default `1200`, wait after tune input)
- `SETTLE_MS` (default `500`, extra wait after transition noise clears)
- `CHANNEL_LIMIT` (default `0`, capture first N channels only)
- `SHOT_SCOPE` (`screen-wrap` | `screen` | `page`)
- `FAIL_ON_ERRORS=1` (exit non-zero if runtime errors are detected)
