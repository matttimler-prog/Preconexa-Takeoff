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

## Round 2 additions
- **Right-click** a markup: Properties, Lock/Unlock, Move to layer, Duplicate, Bring to front / Send to back, Add to Tool Chest, Add/Delete point, Delete. While drawing: Finish, Remove last point, Cancel.
- **Edit points:** select a markup, drag its white handles to reshape, or drag the markup to move it. Locked markups can't be changed.
- **Snap (S):** on by default. Snaps to ends, centers, midpoints and edges of the PDF's vector lines and of existing markups. Toggle in the toolbar, View menu or with S. Scanned sheets have no vector lines, so only markups snap there.
- **Scale:** type it (`1/8" = 1'-0"`, `1:48`), pick from the list, or let the app read it from the sheet's text (auto on open, "Detect from page text", "Scan all pages"). Reduced prints and "not to scale" sheets are never auto-set.

## Round 3 additions
- Measurement text is written on the drawing as you draw (and after), rotated along the line. Turn it off in the Measure menu, or per markup.
- 30 tools in two toolbar rows: line, arrow, arc, polyline, dimension, callout, rectangle, ellipse, polygon, cloud, cloud+, text box, note, pen, highlight; length, polylength, perimeter, area (polygon/rectangle/ellipse), volume, cutouts, count, diameter, radius (center or 3-point), angle.
- Array: select a markup, Edit > Array. Command search: Ctrl+K.
- Shortcuts now follow the common markup-app keys. Plain letters draw markups; Shift+Alt+letter measures; 1-9 are one-key measure shortcuts. Calibrate moved to Shift+Alt+K; lock moved to Ctrl+L.
- See `docs/BLUEBEAM-COMPLAINTS.md`.
