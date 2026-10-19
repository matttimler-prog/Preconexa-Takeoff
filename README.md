# Preconexa Takeoff

Standalone takeoff tool (outside Lovable). Phase 1: PDF viewer, per-page scale calibration, length / area / count measurement, layers, CSV + JSON export. Phase 2 (research, not promised): symbol auto-detection tested against real prints.

## Run
    npm install
    npm test        # measurement math + takeoff logic
    npm run dev

## Controls
Wheel zooms at the cursor; press **W** (or the Wheel button) to make the wheel change pages instead. Press the wheel/middle button and drag, hold Space and drag, or use the Pan tool to move the page. Ctrl+wheel always zooms (trackpad pinch too). Full list: the **Keys** tab in the app.
Tool Chest: click a tool to arm it, then click on the print. Capture a symbol straight from a drawing with Shift+S. Tool sets export/import as JSON.

## Design rules
- All geometry is stored in PDF page units (1/72 in at zoom 1), so zoom never changes results. Scale = feet per page unit, stored per page.
- A page that is not calibrated reports "uncalibrated" and never a guessed number.
- Deleting a layer deletes only its measurements.
- Backtesting: save the takeoff JSON per print, compare to known counts from past jobs (add a /backtest folder with expected values).
- `prints/` is git-ignored; keep client drawings out of the repo.

## Deploy
Vercel builds on every push to `main` (Vite, output `dist`).
