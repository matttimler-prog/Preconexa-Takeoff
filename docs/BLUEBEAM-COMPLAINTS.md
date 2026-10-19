# What people complain about in Bluebeam, and what we do about it

Sources: Capterra reviews (about 25 recent reviews read, 978 total), the Bluebeam community forum, a 2026 third-party pricing/limits review (Fervor Studio), and Bluebeam's own tool documentation. Counts are from the reviews I could read, not a survey.

| Complaint (how often seen) | What we did | Status |
|---|---|---|
| Steep learning curve, features hard to find (most common) | Same layout and shortcuts as the familiar markup apps, plus **Ctrl+K command search**: type "cloud", "scale", "export" and press Enter. A shortcut cheat sheet is in the right panel. | Done |
| Price and annual-only billing, key features in higher tiers | Our own product; every measuring tool is in the one app. Pricing is a business decision, not code. | Business |
| Slow on large PDFs, high hardware needs | One page rendered at a time, lazy thumbnails, capped canvas size, runs in the browser. Not yet tested on 100 MB sets. | Partly, needs real-file testing |
| Measurements inconsistent after scaling or viewports | Scale is stored per page, never guessed. Uncalibrated pages show "set scale". Calibrating again warns if it differs from the old scale by more than 2%. Scale text on the sheet is read automatically and flagged for reduced prints and "not to scale" sheets. | Done |
| Markups shift slightly after save and reopen | All geometry is stored in PDF page units and restored exactly. Autosave plus undo/redo. Tested. | Done (needs real-file confirmation) |
| Excel export in the wrong order or placement | CSV is sorted in drawing order (page, top to bottom, left to right) and includes each item's position on the sheet in inches. | Done |
| Mouse moved too fast cancels a takeoff | Each click commits one point; there is no timing-based cancel. Esc cancels, Backspace removes the last point, Ctrl+Z undoes. | Done |
| Three-key shortcuts are cumbersome | Bluebeam's chords still work (Shift+Alt+A area, Shift+Alt+C count) and every measure tool also has a **one-key shortcut: 1 length, 2 polylength, 3 perimeter, 4 area, 5 volume, 6 count, 7 diameter, 8 radius, 9 angle**. | Done |
| Hard to move setup between computers | Tool Chest exports and imports as a file; takeoffs save as a file. Browser based, so no install. | Done (cloud sync later) |
| Windows-only desktop app, weak mobile | Runs in any modern browser, including Mac. Touch use is not tuned yet. | Partly |
| OCR and text recognition weak on scans | Scanned sheets are detected and we say so. OCR is not built. | Not done |
| Studio sessions: data retention, session limits | No sessions product yet. | Not applicable yet |
| No link to estimating or accounting | Planned: connect to Preconexa over an API. | Planned |

## Bluebeam tools we did not build (yet)
Dynamic Fill (auto-detect rooms), sketch-to-scale with typed dimensions, viewport scales on one sheet, stamps, hyperlinks, image markups, forms and digital signatures, text-layer markups (underline, strikethrough, typewriter), eraser, grouping, multi-select, copy/paste between pages, and flattening markups into an exported PDF.
