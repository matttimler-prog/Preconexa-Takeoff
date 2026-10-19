# What people love about Bluebeam Revu, and where we stand

We copy conventions and workflows only, never Bluebeam code, icons or branding.

## How this was researched (and its limits)
Read: Capterra review pages 10, 11, 12, 30, 37 (about 125 of 978 reviews), the TrustRadius product page, the Bluebeam blog post "An Electrician's 4 Favorite Revu Features", Bluebeam's Count tool support article, a NovEdge tip on symbol-based counting, an IPVM subscriber discussion, and Capterra/NovEdge tips on batch and compare tools.
Not usable: G2 (page text did not load, only a 4.6/5 rating from 494 reviews), Reddit (r/Construction, r/estimators, r/electricians: search returned no readable threads), Bluebeam community forum (only one thread title seen), YouTube comments (not reachable). So "how often" below means "how many of the review pages I read mention it", not a survey. Treat as directional.

Status was checked against `README.md`, `src/lib/tools.ts` and `src/App.tsx`. "Built" means I saw it in those files; it does not mean tested on real prints.

## Table

| Feature | How often / strongly praised (sources) | Status in our app | Browser-feasible? |
|---|---|---|---|
| Markup tools (highlight, cloud, callout, text, pen, arrows) | Most mentioned item. Nearly every Capterra page ("second to none", "much quicker than by hand"); G2; TrustRadius | Built (30 tools in `tools.ts`, cloud, callout, text box, pen, highlight, etc.) | Yes: SVG overlay already works |
| Measure and count (length, area, count, volume) | Very strong. Capterra p10, 11, 12, 30, 37; TrustRadius ("Digital Takeoffs"); IPVM ("minutes rather than hours") | Built (length, polylength, perimeter, area, volume, cutouts, count, diameter, radius, angle) | Yes |
| Scale calibration | Strong. Capterra p10, 12; Bluebeam electrician blog ("other software struggles to read scales") | Built (calibrate, typed scale, auto-read from sheet text, per-page, viewport scale) | Yes |
| Snap to drawing lines while measuring | Named as a favorite on Capterra p10 ("snaps to the layer you want") | Built (S key; vector PDFs only, not scans) | Yes |
| Tool Chest / custom tool sets (reusable symbols and tools, shareable) | Strong. Capterra p11, p12 (customization), TrustRadius ("Customized Toolbox"), electrician blog (#1 pick), NovEdge, IPVM | Built (Tool Chest, add from markup, capture symbol Shift+S, JSON export/import) | Yes |
| Manual Count with named, colored, numbered marks and running totals | Strong for electricians/estimators. IPVM (long-time user prefers it to auto search), Bluebeam Count article, NovEdge | Built (Count tool, banner total, Counts panel with "+ Count") | Yes |
| Layers, groups, labels to organize markups | Capterra p12 ("key to the functionality"), p37 | Partly (layers and grouping built; no "Spaces" and no labels/subject field) | Yes |
| Overlay / compare two revisions of a sheet | Strong. Capterra p10, p11 (split-screen and overlay), p37 (old vs new rev); electrician blog (Overlay Pages) | Missing (no overlay or compare found in App.tsx) | Yes: render two PDFs to canvas, tint and blend; align by 2-3 click points |
| Visual Search: find all matching symbols and count them | Praised by vendor docs and tips; IPVM user says manual count is more accurate, auto misses and false-finds | Missing (we capture a symbol to the chest, but nothing finds other copies; Phase 2 research in README) | Yes, with limits: normalized template match on canvas pixels in a worker; accuracy needs real-print testing |
| Markups List with columns, sort, filter, CSV/Excel export | Strong. NovEdge, Count article, Capterra p12 (CSV/Excel), IPVM thread on exports | Partly (list with text filter, summary CSV and detail CSV; no columns, subject, status, sort, or custom columns) | Yes |
| Custom columns (unit cost, SKU) that total automatically | NovEdge workflow; seen as a pro for estimators | Missing | Yes: simple per-label fields and a computed total |
| Spaces (group counts and areas by room or zone) | Capterra p37 ("layers, spaces and labels"); Count article | Missing | Yes: assign a polygon as a space, tag items inside by point-in-polygon |
| Count statuses and legends that update live | Count article; NovEdge | Missing | Yes: status field on a count group, legend drawn as an SVG table |
| Stamps (one click, editable, dated) | Capterra p10 (shop drawing review), p12 ("stamp all sheets with one click") | Built (stamps with date, custom stamp); "stamp all sheets" not seen | Yes |
| Copy markups to the same place on other pages | Capterra p12 | Partly (copy/paste across pages exists; paste is at the cursor or a place, not "same spot on all pages") | Yes |
| Hyperlinks between sheets and details | Capterra p10 ("linking details and pages") | Built (Hyperlink tool, page or web address, links from printed URLs). No auto-link from sheet index | Yes |
| Batch tools (slip-sheet, header/footer, flatten, merge many PDFs) | Capterra p11 ("batch tools work well"); NovEdge tips | Partly (flatten and export PDF with markups only; no merging, slip-sheet or header/footer) | Yes: pdf-lib handles merge, pages, headers |
| Page operations (merge, extract, insert, rotate, combine files) | Capterra p12, p30, p37 | Missing (single PDF viewer; export only) | Yes: pdf-lib |
| Studio Sessions / Projects (real-time shared markup) | Strong with teams. G2, Capterra p11, p12, p30, p37 | Missing (no sharing or accounts; planned Preconexa link) | Yes in principle, but needs a backend (Supabase or similar). Not a pure browser feature |
| Mobile / iPad and offline field use | Capterra p12, p30 | Partly (runs in a browser; touch not tuned; offline not built) | Yes: PWA, touch pointer events |
| OCR on scanned sheets | Capterra p30 ("I love that I can OCR documents") | Missing (documented as not built) | Yes: tesseract.js in a worker; slow on big sheets |
| Search text in sheets | Implied in "all-in-one" praise; support docs | Built (Ctrl+F, search panel) | Yes |
| Snapshot (copy a region of a sheet and paste it elsewhere) | Electrician blog (#4 pick) | Partly (Shift+S captures a symbol into the Tool Chest; not a general paste-onto-another-sheet snapshot) | Yes: canvas crop to image markup (Image tool exists) |
| Fillable forms, digital signatures | Capterra p10 (forms); minor | Missing (documented) | Forms yes via pdf-lib; certified signatures no (needs server or crypto trust chain) |
| Procore / system integration | Capterra p10 (one reviewer) | Missing | Needs API and backend |
| Easy to learn, familiar layout, training videos | Capterra p11, p12, p30, p37 | Partly (same shortcut conventions, Ctrl+K command search, Keys tab; no tutorials) | Yes: short in-app tour or tip cards |
| Value vs alternatives | Capterra p11, p37 | Business, not code | n/a |

## Build next
Missing or partial, browser-feasible, most praised first.

1. **Overlay / compare revisions**: load a second PDF (or page), tint old red and new blue, adjustable opacity, align by two matching points. Needs no backend.
2. **Markups List upgrade**: sortable columns (label, page, layer, qty, unit), group by label, multi-select filter, status and comment column, CSV that matches the on-screen columns.
3. **Spaces**: tag areas as rooms; report counts and quantities per room; add a Space column to the CSV.
4. **Custom columns with live totals** (unit cost, SKU, vendor) on label groups; extended cost in the summary and CSV.
5. **Visual Search for count**: pick a captured symbol, scan pages for matches, show hits to confirm or reject, then convert to counts. Must show a confidence setting and never auto-apply.
6. **Count statuses and Legend**: status per count group (ordered, installed, existing), and a legend markup that draws symbol, label and live total on the sheet.
7. **Page and file operations**: merge PDFs, extract, insert, delete, rotate pages, with pdf-lib.
8. **Batch tools**: stamp all pages, header/footer or page numbers, batch flatten, slip-sheet a revised set.
9. **Snapshot**: drag a region of a sheet and drop it as an image on another page (reuses the Image markup).
10. **Copy to same spot on other pages** (and "stamp all sheets"), to match a praised time saver.
11. **Touch and PWA mode**: pinch zoom, two-finger pan, offline cache, larger hit targets for iPad use.
12. **OCR for scans** with tesseract.js on demand per page, so scale detection and search work on scanned sets.

Not on the list because they need a server: Studio-style live sessions, Procore integration, certified signatures. Revisit when the Preconexa API link exists.
