# Open product-owner questions: PM screens D26–D34 (20 Oct 2026)

All 16 Admin/PM screens are redeveloped and connected. These are the questions that still need an answer, collected from the D-entries in `02-OPEN-DECISIONS.md` (the D-entry has the detail). Where nothing has been decided, the app currently does what the "Now" column says. Answer by number, e.g. "M2: canvas", "G4: country first".

## Cross-cutting (affect several screens)

| # | Question | Now |
|---|---|---|
| X1 | **"Unsaved changes" leave guard.** General Data, Milestones, Production, Planning, Grid Operator and Finance lack the canvas "Unsaved data" dialog when you navigate away. It needs one shared app-shell change (a router that can block navigation). Build it? | **Implemented 20 Oct 2026 (D35)**: shared `UnsavedChangesGuard` on General Data, Milestones, Planning, Grid Operator; Production wired with the canvas outcome (never asks); Finance has no canvas dialog |
| X2 | **Fabric SQL sources (D2).** Revenue assumptions (Milestones seed, Production seasonality/negative prices, Revenues standards) and debt assumptions (Finance) are Fabric SQL, so standard values are missing and users type values by hand. Acceptable until Fabric is connected, or disable the affected toggles/buttons? | Hand entry plus a notice. **29 Oct 2026:** `Assumptions Revenues SQL` is connected for Milestones, Production and Revenues (D57); Finance (debt sources) still hand entry |
| X3 | **Approval / permission flows.** Gate and checklist approval requests and cancellations (Checklist), and the module-permission request and cancellation (Generators), are disabled. When should they be connected, as flows or custom APIs? `PerformRequestofCheckListApprovalCancellation` is not in the export. | Disabled, with a reason tooltip |
| X4 | **Test timeout.** Raise Vitest's per-test timeout from 5 s to 30 s, so that `npm run verify` stops failing on one random slow UI test on the OneDrive checkout? | 5 s |
| X5 | **Overview visuals.** Close the six small differences from the canvas: grey funnel boxes, tick/cross approval icons, the selected-row tick, the outlined Project Manager box, the boxed pager, and the header version line with its (i) icon? | Not done |
| X6 | **Map (D25 Q7).** Parked until an Azure Maps account/key is available. | Lat/Lng inputs only |

## Milestones (D26)

| # | Question | Now |
|---|---|---|
| M1 | The Fabric cost recalculation on a milestone save stays off (commented out in the canvas; the flow is missing from the export). Confirm? | Off |
| M2 | Price-inflation rows missing: skip re-pricing and keep the stored costs, or write 0 (canvas)? | Skip |
| M3 | Cancel resets the whole form to how the page opened. Confirm? | Full reset |
| M4 | 'Foundation cost included': the canvas text check may always add the foundation cost; the app reads it as a real yes/no. Which is intended? | Real yes/no |
| M5 | Show the "revenue contract not created" notice while the seed is unconnected? Should the seed target 1.21.753 (Italy changes)? | Notice shown |

## Generators (D27)

| # | Question | Now |
|---|---|---|
| G1 | Type delete: remove a land-lease cost only if all its allocations belong to the type, otherwise only the type's allocations. Confirm? | As described |
| G2 | PV delete removes no O&M costs, land lease or PV unit, although its message says it does. Should it? | Removes none |
| G3 | The height limit for a new turbine checks the stored height, so a new turbine is never blocked. Use the height being typed instead? | Stored (canvas) |
| G4 | Device cost: the project country's row first, or the first row of any country (canvas)? | Country first |
| G5 | Keep the supplier filter on the hub-height list? | Kept |
| G6 | Replace Generator / Replace PV Module Type (1.21.753): port them, or keep them disabled? | Disabled |
| G7 | The 1.21.753 PV back-fill of land-lease allocations: wanted? | Not ported |
| G8 | Add the missing edit-permission check to Substation? | Not added |
| G9 | Inverter and Substructure lists: keep them view-and-delete only (their Add panels are hidden in the canvas)? | View and delete |

## Production (D28)

| # | Question | Now |
|---|---|---|
| P1 | PV uncertainty range 0–100 % (fixed) instead of the canvas 0–3000? | 0–100 |
| P2 | Negative-price years outside the new curve are deleted on save. Confirm? | Deleted |
| P3 | After an External assessment supersedes the Internals, the revenue sync can switch "Consider Negative Prices" off where the canvas left it on. Confirm? | Fixed behaviour |
| P4 | Other OPEX periods 3+ chain within their own subaccount. Confirm? | Own subaccount |
| P5 | No COD: Recalc writes the standard-cost flags but no contracts. Refuse the save, or leave the flags unset? | Flags written |

## Checklist (D29)

| # | Question | Now |
|---|---|---|
| C1 | Abandon / Inactivate while a gate approval is running: refuse, as for the start-cluster change (D25-Q1)? | Allowed (canvas) |
| C2 | Save is never offered in "Checklist Completion" mode (it used to move the project on). Confirm? | Not offered |
| C3 | Gate Relevance shows Yes/No (recording), not true/false (canvas source). Confirm? | Yes/No |
| C4 | Completion comment pre-filled from the cluster's approval comment (canvas), or empty? Matters only once approvals are connected. | Pre-filled |

## Team (D30)

| # | Question | Now |
|---|---|---|
| T1 | Nothing adds a new member to the project's Teams team or SharePoint site. Expected, or is a process missing from the export? | Nothing happens |
| T2 | Description dropdown: unsorted with inactive rows (canvas), or sorted by name with active rows only? | Canvas |
| T3 | The same person can be added twice (canvas). Refuse duplicates? | Allowed |

## Planning (D31)

| # | Question | Now |
|---|---|---|
| L1 | Hidden fields (Cooperation Partner/Details, Secured Access) stay stored when hidden (canvas). Clear them on save? | Kept |
| L2 | The error text "Error: assosiated Shareholder Entity could not be saved." (typo, wrong entity): correct it to name Aquisition Status? | Verbatim |
| L3 | Permit dates `d/mm/yyyy` without Plan/Actual (canvas), or "19 Oct 2026 (Plan)"? | Canvas |
| L4 | Panel % while blank: "N/A" or 0 (canvas)? | N/A |

## Grid Operator (D32)

| # | Question | Now |
|---|---|---|
| R1 | Grid Connection fields locked like the Grid Operator tab on a locked or Draft project (the canvas left them editable). Keep the fix? | Locked |
| R2 | Diameter: allow two decimals (the column stores two), or keep one (canvas)? | One |

## Revenues (D33)

| # | Question | Now |
|---|---|---|
| V1 | Rules follow 1.21.753 or 1.21.709 (Italian descriptions, prices, inflation areas once Fabric is connected)? | 1.21.753 |
| V2 | New balancing price owned by the project's business unit (fix), not the creator's? | Project BU |
| V3 | Custom-inflation flag written with the corrected test? | Fixed |
| V4 | Price fallback: nearest year, or the canvas comparison? | Nearest year |
| V5 | Individual volumes are regenerated (typed values lost) when the start date or duration changes (canvas). Keep that? | Kept |
| V6 | Table layout, or rebuild the canvas card gallery? | ~~Table~~ **Card gallery (answered, D33); live-canvas parity pass 29 Oct 2026 (D57)** |
| V7 | **New (D57).** Font: keep Segoe UI (text 4–8 % narrower than the canvas Open Sans), or load Open Sans for Revenues only? Card captions 16 px or 14.67 px? | Segoe UI, 14.67 px |
| V8 | **New (D57).** Keyboard focus: the add buttons, tabs and ✕ show no focus ring (as the canvas). Add a ring for keyboard focus only? | No ring |
| V9 | **New (D57).** A failed Fabric read leaves the contract panel empty without a message. Show an error line? | Silent |

## Finance (D34)

| # | Question | Now |
|---|---|---|
| F1 | Without the Fabric debt sources, a new project gets no Senior Debt, DSRA/DSRF or Decommissioning seed, and a new Term Sheet or Credit Agreement tranche can't pick a bank. Accept that, or seed blank, non-standard rows? | Withheld |
| F2 | Debt Financing written on visit only while blank (fix), or overwrite All Equity on every visit (canvas)? | Only while blank |
| F3 | The whole tranche Status radio is disabled for a stored Credit Agreement, and Poland gets all six base rates (canvas). Confirm? | Canvas |
| F4 | An Individual-profile tranche with no repayment rows can be saved (canvas). Block it? | Allowed |

---

## Product-owner answers (20 Oct 2026)

**To build:**

| # | Answer |
|---|---|
| X1 | **Build** the leave guard as one reusable component, and use it on every screen where the condition applies. **Implemented (D35).** |
| X4 | **Yes**, raise the per-test timeout to 30 s. **Implemented** (`vite.config.ts`). |
| X5 | **Yes**, close all six Overview visual differences. **Implemented.** |
| M4 | **Canvas behaviour**: always add the foundation cost, as the canvas does. **Implemented** in Milestones and Generators (shared `domain/foundationCost.ts`). |
| G2 | **Yes**: a PV delete also removes its O&M costs, land lease and PV unit, as its message says. **Implemented (D27).** |
| G6/G7 | **Port now** from the 1.21.753 source: Replace Generator, Replace PV Module Type, and the PV land-lease back-fill. **Implemented (D27)**, from the 1.21.753 gap register and the skeleton (no 1.21.753 YAML on disk). |
| G9 | **Build** the Add panels for Inverter and Substructure. **Implemented (D27).** |
| L3 | **New format.** Input: "Mon, Oct 19, 2026" with a Plan/Actual tag. Table: dd/mm/yyyy, blue for Actual, normal black for Plan. **Implemented (D31).** |
| L4 | **Show nothing** while a value is blank (neither "N/A" nor 0). **Implemented (D31).** |
| R1 | **Canvas behaviour**: lock the Grid Connection fields only if the canvas has a validation that locks them; otherwise leave them editable. **Implemented (D32)**: the canvas has no lock, so they are editable. |
| R2 | **Canvas validation**: one decimal. Already the case (D32). |
| V6 | **Rebuild** the contracts as the canvas card gallery. **Implemented (D33).** |

**Added by the product owner during the session (20 Oct 2026):**

| # | Decision | Status |
|---|---|---|
| N1 | **Standard-assumption styling.** Any value the canvas ties to an "is standard assumption" condition renders in blue (`themePrimary`) and italic. Now CONVENTIONS rule 20 and brief item 8a. | **Implemented (D35)**: one shared style; audit in `app-docs/STANDARD-ASSUMPTION-STYLING-AUDIT.md` |
| N2 | **Add Project creates a draft project.** It opens General Data with all the required validations and saves a new draft project. This reverses the D25 exclusion; the server-side `CreatingTeamsandSPOSite-ProjectCreation` flow then creates the Teams/SharePoint site, as with the canvas. | **Implemented (D25)**: create, then re-read, then follow-ups in canvas order; switches to the new project after saving |
| N3 | **Edit Project opens the selected project's General Data in a NEW tab of the same app** (locally, the local play URL; never the canvas or a published app), from which the user navigates to the other PM screens. | **Implemented**: `projectAppUrl` passes `pmScreen` + `projectId` as launch parameters, and `Landing` routes to `/project/general?projectId=`. Under dev, `resolvePlayAppUrl` prefers the local play URL (CONVENTIONS rule 12 updated). PM routes read the project only from the route, so New Project never picks up a stale launch parameter. |

**Confirmed (no code change):**

| # | Answer |
|---|---|
| X2 | Skip: no change; hand entry and the notice stay. |
| X3 | The PO connects the approval and permission flows later; they stay disabled. |
| M1 | Keep the Fabric recalculation off. |
| M2 | Skip re-pricing when inflation rows are missing. |
| M3 | Full reset on Cancel. |
| M5 | No change for Fabric-related dependencies. |
| G1 | Confirmed. |
| G3 | Same as the canvas (stored height). |
| G4 | Country first. |
| G5 | Keep the supplier filter. |
| G8 | Canvas behaviour (no check on Substation). |
| P2 | Delete the negative-price years outside the new curve. |
| C3 | Yes/No. |
| C4 | Keep the canvas pre-fill. |
| T1 | Expected: members are existing Entra users, so there is nothing to add to Teams or SharePoint. |
| T2 | Canvas behaviour (unsorted, inactive rows included). |
| T3 | Allow duplicates (canvas). |
| V1 | Follow 1.21.753. |
| V2/V3 | Keep both fixes. |
| V4, F1 | Fabric-related: no change. |

**Parked (current behaviour kept):** P1 (also note that PV and WTG validate the uncertainty % differently), P3, P4, P5, C1, C2, L1, L2, V5, F2, F3, F4. X6 (the map) stays parked.

---

## New open questions (20 Oct 2026, raised by the follow-up work)

### Generators follow-ups (D27)

| # | Question | Now |
|---|---|---|
| G10 | The 1.21.753 Replace panel blocks non-PMs over the height limit. Should the "Height Limitation Exceeded" approval popup also open? | Block only |
| G11 | A replace does not carry over the old turbines' plinths or edited capacities; the new turbines get the new model's catalogue values. Is that right? | Catalogue values |
| G12 | The two replace jobs are not transactional. If the second fails, the O&M costs stay unlinked and the old allocations orphaned. Accept that, or build a Custom API (as for D6)? | Accepted risk |
| G13 | Can someone provide the 1.21.753 YAML, so the four unidentified Replace controls get their real names? | Three not rendered, one with a stable id |
| G14 | Inverter and Substructure saves with an Other Supplier wait for the permission flows (X3). Is that acceptable? | Disabled |
| G15 | An edited PV type whose missing unit is created on save is not back-filled into the land-lease costs. Is that right? | Not back-filled |

### Cross-screen sweep (D35)

| # | Question | Now |
|---|---|---|
| S1 | Production's canvas never marks the screen dirty, so its leave warning never fires. Keep that, or warn while an Add/Edit yield panel is open? | Never warns (canvas) |
| S2 | Finance: the canvas refuses navigation while Planning is dirty (a copy-paste defect); the app navigates. Confirm? | Navigates |
| S3 | Team and Checklist each have a leave dialog that nothing opens. Leave them without a guard? | No guard |
| S4 | Keep the browser's tab-close prompt (new behaviour)? Inside the Power Apps player it depends on the host frame. | Kept |
| S5 | Cost screens: 10 controls are not styled blue/italic yet (6 CAPEX panel inputs, 3 Contracts margin fields, the OPEX start date). Their conditions already exist in code. Style them? | Not styled |
| S6 | In the canvas, the Revenues balancing panel's 2 fields read the main contract's standard state. Port that now, or wait for Fabric (X2)? | Not ported |
| S7 | Revenues cards: the five values are now blue and italic when standard, and Currency is always blue and italic (canvas). Confirm? | As described |
| S8 | **Smoke test needed:** the router change (data router for the leave guard). Check deep links, Edit Costs tabs, the rail and logo, and the browser Back button. | Pending PO test |

### Modern controls sweep (D35 §6, 20 Oct 2026)

| # | Question | Now |
|---|---|---|
| S9 | Save/Cancel look: the canvas Milestones Save is a PowerCAT button with `FillColor: themePrimary`, but the live screenshot shows plain text buttons with icons. Milestones now follows the screenshot. Should General Data's footer (primary Save / outlined Cancel) match it too? | Milestones: text buttons; General Data: unchanged |
| S10 | The CalendarAdd buttons are 32×32 with an outline (the canvas sets `Width: 32`, `Appearance: Secondary`). Is that right, or should they be larger? | 32×32 |

### PO decision N4 (20 Oct 2026)

| # | Decision | Status |
|---|---|---|
| N4 | **Generators turbine grid headers:** the canvas leaves the first column (generator name) and the edit/delete columns without a header. The PO asked for headers: "Generator Name" and "Actions". | **Implemented** (`WTG_CARD_LABELS.generatorNameHeader` / `actionsHeader`; the canvas blank is kept as `turbineNameColumn`) |

### Checklist screenshot parity (D29, 20 Oct 2026)

| # | Question | Now |
|---|---|---|
| S11 | Duplicate refresh on Checklist. | **Decided (PO, 20 Oct 2026, corrected):** keep the top-right refresh ICON and remove the left "Refresh" command. The icon now runs the full refresh (the old command action) for every project, disabled while the page is locked or busy. Implemented. |
| S12 | The Cluster history panel covers about 75 % of the screen in the canvas; here it is the shared "wide" panel (about 50 %). Make it 75 %? | 50 % |
| S13 | In the PO's description the active "In Progress" toggle has blue text; the canvas `Color` is near-black. Which? | Near-black (canvas) |

### PO decision N5 (20 Oct 2026)

| # | Decision | Status |
|---|---|---|
| N5 | **The close ✕ on every right panel must stay visible and highlight on hover.** Before, it disappeared on hover because Fluent turned it blue on the blue header. | **Implemented** (`canvas.css`, `.canvas-panel-header button:hover`: white icon plus a translucent white highlight; also on press and keyboard focus) |

### PO decisions N6–N9 (21 Oct 2026, General Data and panel feedback)

| # | Decision | Status |
|---|---|---|
| N6 | **Remove the grey "General" band** (`lbl_GeneralData_DisplayProject_Body_General_Content_Label`) at the top of General Data, and move Basic Information, Acquisition, Placement, Shareholding Entity etc. up. A deliberate DIVERGENCE from the canvas. | **Implemented** (`features/pm/general-data/Screen.tsx`, comment `DIVERGENCE (PO, 21 Oct 2026)`; UT-GDATA-901 asserts the band is gone) |
| N7 | **The user badge (top right) must sit inside the header, on every screen.** Its margins were in a plain CSS class that Fluent's `mergeClasses` dropped, so the avatar ran past the header edge. | **Implemented** (`components/AppHeader.tsx`: margins moved into the Griffel `userPill` style; the dead `.canvas-user-pill` rule removed from `canvas.css`) |
| N8 | **Align the Placement controls.** Placement now uses the same 300 px cells as Basic Information, and Municipality fills its cell. Dropdowns sat 6 px lower than text inputs in the same row (a stretched Fluent `Field` grid), fixed in the shared skin (`fieldSkin.ts`, `alignContent: start`), so it applies to every form. | **Implemented** |
| N9 | **No white strip on the left of the blue header of every right (Add/Edit) panel.** Fluent's overlay drawer has a 1-px transparent left border, and the white panel surface showed through it. | **Implemented** (`canvas.css`, `.canvas-panel.fui-OverlayDrawer { border-left-width: 0 }`; measured: the header now starts on the drawer's edge) |

**Zoom sweep 75–125 % (21 Oct 2026).** The Overview and the ten PM screens were measured in the preview harness (mocked data) at the CSS widths a 1920-px and a 1366-px screen give at 75, 90, 100, 110 and 125 % browser zoom (2560 → 1092 px), 110 runs. The checks were: no page-level sideways scroll; the header 74 px high with no overlapping items; the badge inside the header (23 px clear); nothing past the right edge outside a scrolling box.
- **Pass at every zoom:** General Data, Milestones, Generators, Production, Team, Planning, Grid Operator, Revenues and Finance.
- **Fixed:** the Cluster Check List table had a 1100-px minimum, one 3 px more than its box on a 1366-px screen at 100 %, so it showed a useless sideways scroll bar. The minimum is now 1060 px. From 110 % on a 1366-px screen the table (and the cluster stepper, from 125 %) scroll sideways inside their own box, as the canvas gallery does.
- **Open, Z1:** the Overview grid keeps the canvas column widths (1719 px in total), so it scrolls sideways inside its box below about 1720 px. That is from 90 % on a 1366-px screen, and from 110 % on a 1920-px screen. Keep the canvas widths, or let Project Name and Project Manager shrink so the grid fits from 1366 px at 100 %? Recommendation: let them shrink, with a sideways scroll only below 1366 px.
- **Fixed, N10 (PO screenshots, 21 Oct 2026): the Production edit panel with Seasonality and Negative Prices on.**
  - The panel opened at the shared "wide" size (half the window, at most 960 px). The canvas panel is 1000 px (fields 280 + Seasonality 360 + Negative Prices 360), so the columns never fitted. At 80 % zoom the per-year reset icons sat under the scroll bar. At higher zoom the year labels ran into the Reduction boxes, and Negative Prices went off the edge.
  - Each Negative Prices row was also a fixed 330 px, too narrow for year + box + reset icon (about 348 px).
  - Now: two shared panel sizes, `fieldsAndSide` (680 px, one toggle on) and `threeColumn` (1040 px, both on); each is the canvas width plus the body padding and never wider than the window. The rows are fluid.
  - **Follow-up (PO, same day):** the side columns must open to the RIGHT and widen the panel, never drop underneath. The wrap rule is removed; the one-toggle panel was 660 px (too narrow for 280 + 360 + padding), which made it wrap. Measured at 2400, 1536 and 1092 px with Seasonality only, Negative Prices only and both: every side column sits to the right of the fields at the same top, the panel is 450 / 680 / 1040 px, and nothing scrolls sideways. They stack only on a phone-sized window (below 900 px).
  - Measured at 2560, 1536 and 1092 px: nothing in the panel runs under its scroll bar.
- **Panel sweep:** the same check passed on the Cluster Check List panel, the Finance Equity, VAT, Decommissioning and Tranche panels (Tranche with both the standard and the Individual repayment profile), Generators Add WTG Type and Add PV Module Type, Team, Planning permit, and the Revenues contract panel. Fixed-width panels (450–1040 px) keep their layout at any zoom; only the "wide" panels (half the window) change with it.

### Planning + Revenues screenshot parity (D31/D33, 20 Oct 2026)

**Implemented:**
- **Planning permit panel (PO):** the order is now the caption, then the Plan/Actual radios (horizontal, as the canvas `Layout`), then the date. The radios used to sit after the date.
- **Revenues:**
  - the screen and card layout from the live screenshot;
  - the two-column Add/Edit Contract panel (860 px);
  - a full audit of the contract panel's Power Fx validations, in `gap-analysis/REVENUES-CONTRACT-VALIDATION-AUDIT.md`: 93 formulas, 59 MATCH, 29 FIXED, 5 documented DIVERGENCE, 0 MISSING.

  The most visible fix: a new contract now starts on the project COD (canvas), not today.

| # | Question | Now |
|---|---|---|
| V7 | On the canvas, the Fixed Volume input carries the Hedged Volume field's accessible label (copy-paste). Should it use the canvas label (Tosca), or keep its own? | Its own label |
| V8 | "Reset to COD": the end date is computed from the reset COD. The canvas reads the date the picker showed before the reset (possibly a typed one). Keep the app's way? | From the COD |
| V9 | Values taken from the live screenshot over the 1.21.709 YAML: panel width 860 (YAML `Min(760)`), 1 px Add Contract outline (YAML 2 px), dark card-header rule (YAML theme blue). Confirm? | Screenshot values |

### Command bar alignment + Finance parity (D35 §7, D34; 21 Oct 2026)

**Implemented:**
- **Command bars (PO):** every command bar's first icon is aligned with the content below it. The shared `useCommandRowStyles` sets no toolbar or leading padding; each screen's wrapper sets its inset.
- **Finance:** the screenshot layout (items 1–9). The fixed Financing Options and the scrolling card list, the pills, the DSRA plain values, and the disabled Edit without a box.
- **Finance validation audit:** `gap-analysis/FINANCE-VALIDATION-AUDIT.md` — 134 formulas: 90 MATCH, 27 FIXED (20 fixes), 17 DIVERGENCE (documented), 0 MISSING.

| # | Question | Now |
|---|---|---|
| A1 | The Add Costs from Table toolbar (Add Row / Delete Row / Copy Table): the spreadsheet starts flush on the panel edge, so aligning would put the icons on the edge. Keep the current inset? | **Decided (PO, 21 Oct 2026): keep** the current inset. |
| F5 | Finance "Edit Equity" (and the other card commands): align with the card TITLE (X 10, as the canvas screenshot looks) or with the first field caption (X 20, the D35 rule)? | **Decided (PO, 21 Oct 2026): keep X 20** (aligned with the first field caption). |
| F6 | Sizes taken from the screenshot over the canvas: a 46 px card header and a 28 px pill (canvas 42 / 24). The DSRA captions use the canvas grey #6C6C6C (the screenshot reads about #595959). Confirm? | **Decided (PO, 21 Oct 2026): confirmed.** |
| F7 | While Fabric is unconnected, a new tranche opens with 0 values (tenor 0 years 0 months shows the zero-duration error). The canvas would show blanks. Blank them? | **Decided (PO, 21 Oct 2026): no change** — do not touch anything that depends on Fabric. |
| F8 | Canvas defects not reproduced: the dirty flag never resets; bank / other-bank / Operational margin edits don't mark the form dirty; a stale fixed value is saved after a Gearing change; a stale Financial Close shows on Add. Confirm? | **Decided (PO, 21 Oct 2026): confirmed**, not reproduced. |
