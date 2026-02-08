# Quine TV

HTML5 virtual TV: a CRT-ish shell UI + a pile of animated channels.

## Run

Development:
```bash
cd ~/x/quine-tv
npm run dev
# open http://localhost:5176
```

Run dev server in background:
```bash
cd ~/x/quine-tv
nohup npm run dev > /tmp/quine-tv-dev.log 2>&1 &
```

Persistent background service (recommended):
```bash
systemctl --user enable --now quine-tv-dev.service
systemctl --user status quine-tv-dev.service
```

Service management:
```bash
systemctl --user restart quine-tv-dev.service
systemctl --user stop quine-tv-dev.service
journalctl --user -u quine-tv-dev.service -n 100 --no-pager
```

Production build (hashed assets):
```bash
cd ~/x/quine-tv
npm run build
npm run preview
# open http://localhost:5176
```

The build output is written to `dist/` with hashed files in `dist/assets/`.

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
- For deploys, serve `index.html` as revalidating (`no-cache`) and hashed assets as immutable.
- Do not use `python -m http.server`; the app uses Vite-only module features during development.

## Channel Screenshots
Generate one screenshot per channel (discovered dynamically from `src/channelList.js`):

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
- `CLEAN_OUT_DIR=1` (delete existing PNGs + `report.json` in `OUT_DIR` before capturing)
- `WAIT_MS` (default `1200`, wait after tune input)
- `SETTLE_MS` (default `500`, extra wait after transition noise clears)
- `CHANNEL_LIMIT` (default `0`, capture first N channels only)
- `SHOT_SCOPE` (`screen-wrap` | `screen` | `page`)
- `FAIL_ON_ERRORS=1` (exit non-zero if runtime errors are detected)

To refresh the checked-in set under `screenshots/all/`:
```bash
npm run screenshots:all
```
