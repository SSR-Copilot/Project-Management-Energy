# E2E parity report — Application Settings (29 Oct 2026)

Written for: the product owner and the developers who review the Application Settings screens.

Method: Playwright, real Chrome, VSB account. The **Canvas app ran first** and its visible text (size, weight, colour, position) was saved to `e2e/reference/*.canvas.texts.json`; the code app was then compared with it (`npx playwright test --project=parity appsettings.parity`, report with `node e2e/report-parity.mjs <screen>`). Read-only, nothing was saved. Positions are compared as offsets from the typical shift between the two frames.

## Summary

| Screen | State | Differences before | After this pass | Status |
|---|---|---|---|---|
| Milestones (Standard Assumptions) | default | 0 | 0 | matches |
| Milestones | country open | Canvas step did not open | 0 diffs; 53 code-only texts | Canvas state needs a different click, open |
| Check List Settings | default | many | 0 | matches |
| Check List Settings | section open | 11 | 3 (Add Task / Reorder x, first header y) | re-run pending after last x fix |
| Project Gates | default | 93 | 50 | open (see below) |
| CAPEX Accounts | default / row open | 10 / 23 | 7 / 21 | open |
| Costs | default / DEVEX open | 13 / 51 | 4 / 38 | open |
| Contracts | default / card open | 2 / 2 | 2 / 2 | open; card-open step does not open the card in the code app |

## Per screen: found and fixed

**Check List Settings** — found: task table stretched to the container (columns 1.3x), Description column 300 instead of 320 px, 12 px extra left inset from the accordion panel, text colour black instead of #242424, command bar 40 px instead of 32, caption 14.7 px instead of 14.6667. Fixed: fixed 1210 px table with canvas column widths, shared `SettingsAccordion` light panel without Fluent's 12 px margin, colours on cells, command bar `minHeight 32` and 8 px caption inset, shared command text #323130.

**Project Gates** — found: header, people and "-" texts 12 px (Canvas 10.67 px, colour rgb(11,11,11)); gate and task names 14 px (Canvas 12 px, #242424); Add Task 14 px and 24 px too far right; Status column 22 px too wide so Action sat 22 px right. Fixed all of these in `GateTable.tsx`. **Open:** Canvas shows the Germany rail collapsed, the code app expands the selected country; the Canvas run showed no task rows under "Cluster 1 to Cluster 2" while the code app lists five (data or load timing, to be checked); row heights and the pill weight (600 vs 400) differ; Canvas Add Task is greyed.

**CAPEX Accounts** — found: account captions 14 px (Canvas 13.3333 px); Canvas command text black/grey rgb(89,89,89) (disabled Reorder) vs shared #323130; cards 14 px too far right; Edit/Deactivate 10 to 14 px too far right. Fixed: caption size. **Open:** colours, x offsets, and the row-open layout (Canvas shows "Reorder subaccounts", "Add subaccount" and a sub-account table inside the card in a different arrangement).

**Costs** — found: whole page inset 15 px/10 px further than Canvas (rail at x 305 vs 290); breadcrumb 13 px (Canvas about 17 px); Canvas has the "Apply to All" bar and the "Apply was made by" banner (removed in D61); Canvas section chevrons are grey (code app blue by rule 21); DEVEX open: "+" buttons 20 px/600 in Canvas vs 12 px/400, column header 13.3333 vs 13.3 px, columns 16 to 70 px apart. Fixed: page inset, breadcrumb size. **Open:** the "+" buttons and DEVEX table columns.

**Contracts** — found: breadcrumb 17 px in Canvas vs about 13 px; Canvas rail collapsed, code app expanded; Canvas shows "Apply to All" and last-apply banners (D61, removed on purpose); Canvas section chevrons grey. Fixed: breadcrumb size (shared `ScopeHeaderBand`). **Open:** the code-app test step does not open the card, so the card-open comparison is not yet valid.

## Items needing a product decision
1. Country rail default: Canvas starts collapsed on all admin screens, the code app expands the selected country (shows technologies at once).
2. Section chevron colour on Costs/Contracts: Canvas grey, rule 21 says blue.
3. Apply bars: stay removed (D61).
