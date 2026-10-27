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

## Round 4 additions
- Select: Shift/Ctrl-click or drag a box to select several; they move, lock, delete, copy and array together. Ctrl+G groups, Ctrl+Shift+G ungroups. Ctrl+C/X/V copy, cut and paste (also onto another page); right-click empty space for Paste here. Ctrl+A selects the page.
- New tools: Dynamic Fill (J), Eraser (Shift+E), Stamp (Shift+M), Typewriter (Shift+T), Hyperlink (Shift+H), Image (I), Viewport scale (Shift+Alt+W), sketch rectangle/ellipse to scale, underline / strikethrough / squiggly / highlight text (drag over printed text).
- Ctrl+F searches the sheets' text; bookmarks live in the left rail; Ctrl+S saves the takeoff.
- File > Export PDF with markups draws everything into the PDF pages (uses pdf-lib).
- Not built: forms, digital signatures, OCR for scans. See `docs/BLUEBEAM-COMPLAINTS.md`.

## Round 4b
- **Cover and replace text** (markup tool): drag over printed text, it is covered in white and you type the replacement (prefilled with the old text). Cover and text are grouped. The original is hidden, not deleted; exported PDFs include the cover.
- **Count**: labeled Count button, key 6 or Shift+Alt+C. Name the item once, then every click counts it (a banner shows the running total). Marks are numbered; Counts panel (right rail) lists totals per item with "+ Count" to keep going.

## Round 5: auto count
- **Auto count similar symbols** (Shift+Alt+N, or Measure menu): drag a tight box around ONE symbol. The app renders the sheet, finds copies by pixel matching (rotated copies included), and shows them boxed for review. Adjust sensitivity, click a box to exclude or include it, then "Count these" or "Count on all pages" (same sheet size only). Counts become numbered ring marks you can still move or delete. Always check the result against the sheet: it is an assist, not an authority.
- Test harness: `tools/backtest/` makes a synthetic electrical plan with known symbol positions (`gen_synthetic.py`) and scores the matcher (`run.mjs`). Synthetic results at sensitivity 0.7 with rotations: duplex 64-80% recall, switch 97-100%, light fixture 94-98%, with 0-3 false hits. Real prints not yet tested. Symbols touching a wall line are the weak spot.
- Research on what reviewers praise: `docs/BLUEBEAM-FAVORITES.md`.

## Round 5b: what reviewers praise
- Markups list: sortable columns, group by item, status and comment, CSV (right rail, list icon).
- Unit costs: type a price per item in the Measurements panel; extended totals show there and in the summary CSV.
- Spaces: draw a Space (room/zone); the Spaces panel totals what is inside each. Legend: live count table you can place on the sheet. Snapshot: copy a region, Ctrl+V on any page.
- Copy to other pages: select, Edit > Copy to other pages (same spot; this is also how to stamp every sheet).
- Document menu: extract, delete, rotate, merge, header/footer/page numbers (each saves a new PDF).
- File > Compare with an older revision: old sheet shows red on the current one; align by two points.

## Round 6: fewer Bluebeam seats
- **Import markups already in a PDF** (File menu): reads the standard PDF markups (lines, polylines, polygons, boxes, circles, pen, highlights/underlines/strikes, text boxes, notes) that Bluebeam, Acrobat and others write, onto an "Imported markups" layer you can edit. A polyline or polygon whose text looks like a quantity (`12' 6"`, `340 sf`) becomes a length/area measurement measured with THIS sheet's scale, with the original text kept in the comment so you can compare. Not imported: stamps, forms, signatures, Bluebeam's private data. Slanted lines are flagged because the PDF reader returns their end points sorted, so direction can be mirrored. The PDF's own copies are hidden on screen and left out on export so nothing doubles (View: "Show the PDF's own markups").
- **Send quantities to Preconexa (JSON)** (File menu): `preconexa-takeoff.json` with summary rows (quantity, unit, unit cost, extended cost), every item, per-page scale and warnings (uncalibrated pages and missing depths are null, never guessed). Schema `preconexa-takeoff/1`. The Preconexa-side "Import takeoff" screen is queued with the Preconexa build.
- **Rotated pages export correctly** (and crop boxes that don't start at 0,0): markups are drawn through one transform (`lib/pagexform.ts`, tested for all four rotations).
- **Dynamic Fill islands** (Measure menu: "Dynamic Fill cuts out columns and islands", off by default): solid blocks inside the filled space become Cutout markups you can delete. Fixtures drawn as closed shapes would also be cut out, which is why it is off by default.
- **OCR** (File menu: "Read this scanned sheet"): reads the current page's text in the browser (tesseract.js, downloads its language data on first use, so it needs internet then). Makes search and the text markups work on scans. Small drawing text may be misread.
- **Offline**: a service worker keeps the app itself available without a connection (built app only; PDFs and takeoffs never leave the browser). Install prompts depend on the browser. NOT verified in a real browser by the author.
- Still not built: crop image, forms and digital signatures, live shared sessions (needs a server), touch-first layout.
