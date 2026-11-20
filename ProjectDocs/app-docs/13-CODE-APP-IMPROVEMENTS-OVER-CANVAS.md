# Code app vs canvas app — improvements so far, by screen

For the team and the product owner. Part 1 gives the cross-cutting improvements; Part 2 goes
screen by screen (23 screens: 6 Admin, 10 Project Management, Project Overview and 6 Cost
screens); Part 3 lists what is **not** improved yet.

Sources: `01-BUGS-FOUND.md` (item ids in brackets), `02-OPEN-DECISIONS.md` (D-numbers),
`gap-analysis/*.md`, `CONVENTIONS.md`, and commits to 26 Oct 2026.

**How to read "improved".** It means the code app has a mechanism, fix or test that the canvas
lacks. It does not mean the behaviour is product-approved. By default a canvas defect is
**reproduced bug-for-bug** (CONVENTIONS rules 7–8); a fix is only made under a recorded decision,
marked `SOURCE DEFECT:` / `DIVERGENCE:` and usually kept reversible by a `…CanvasParity` twin.
Where this file says **reproduced**, the code app deliberately keeps the canvas behaviour.
Where it says **fixed**, a decision recorded it. D38–D45 are still PROPOSED, not approved.
Live performance is unmeasured (R-11), and the two latest DEV pushes had no smoke test (D37, D40).

> **Admin screens:** the six were built and connected 19 Oct (D18–D24), then replaced on 22 Oct by
> the RounakDev1 versions (D36). The canvas findings under D18–D24 still stand, but the code now
> follows D36. `PROJECT-MAP.md` still calls the Admin/PM screens "not connected"; that is stale.
> `gap-analysis/README.md` records them as connected.

---

## Part 1 — Cross-cutting improvements

### 1.1 Data volume and delegation
| Canvas challenge | Code app |
|---|---|
| `ClearCollect(col, Filter(T, …))` caps at 2,000 rows (`DefaultConnectedDataSourceMaxGetRowsCount`) with no warning; `in` is not delegable, so A-1's protection query ran on truncated data | Server-side OData `$filter` only, built with the `f.*` helpers in `data/odata.ts` (rule 2) |
| No column list, so Dataverse returns every column (112 on `vsb_projects`) | `$select` on every query (rule 1) |
| Whole-table collections; N+1 round trips (C-4) | Scoped, paged reads; Project Overview uses a skip-token cache, one `@odata.count` per query, prefetch of the next page |

### 1.2 Errors and silent failures
| Canvas challenge | Code app |
|---|---|
| Write errors ignored; app errors captured and never shown (B-4); "Report a problem" does nothing (B-1) | Every read and write goes through `unwrap` (rule 3); `platform/userMessage.ts` maps SDK errors to wording; B-1 is recorded, not copied (D9) |
| Generated `delete()` discards the SDK result, so a 403 looks like success | `deleteRecord` in `data/client.ts` checks it (rule 14) |
| A failed read looks like an empty list | Load-error state "Cost data is unavailable" on every data screen (rule 19), shared `QueryStates` / `useQueryHealth` |

### 1.3 Data safety
| Canvas challenge | Code app |
|---|---|
| Rows created without an owning business unit become invisible to colleagues, with no error | Every project-scoped create writes `OwningBusinessUnit@odata.bind` (rule 4) |
| Multi-request saves can half-apply | Declared as a `WritePlan` (`data/writePlan.ts`, `executePlan`, `runPlan`), invalidated after each accepted write. Still non-transactional (D6) |
| Date-only values shift a day east of UTC | `dateOnly` from local parts (rule 18) |
| A record deleted by someone else | `recordGone` and `updateRecordIfExists` give a defined outcome |
| A save that fails part-way leaves what it wrote (Generators: a type without its allocations) | **Proposed (not approved), D115:** Add WTG type and an out-of-country type are rolled back when they fail, with **Retry cleanup** if the cleanup fails; flag `createRollback`, off until its DEV check. Replace and apply-to-all are not covered |
| A bulk write without the owning business unit succeeds and hides the rows | **Proposed (not approved), D115:** the Generators bulk transport refuses a target without `owningbusinessunit@odata.bind`, with an empty or repeated id, or with a reserved key, before anything is sent; bulk updates are guarded by an existence read |
| The canvas had no bulk Dataverse actions, so no such failure existed | **Fixed (build gate), D115:** `check:power` now fails when the bulk actions are registered but `power.config.json` has no `environment_<id>` entry. Losing that entry (a CLI rewrite) answered HTTP 501 to every bulk Save and silently dropped each tab to one request per row (D51, 27 Oct 2026). Tests UT-POWERSRC-001..006. Also part of the delete work of D116 |
| A delete that fails transiently, or that answers 404 or "does not exist", is taken as done with nothing read back (Generators) | **Proposed (not approved), D116:** every Generators delete is retried on 429, 503 with `Retry-After`, 500, 504 and network errors (3 tries), counts only 404 or `0x80040217` as gone, and reads "gone" rows back; `confirm` rows are read back after a successful delete when `verifyDeletes` is on (off). Live with no flag, not run against DEV |
| A failed delete or rollback does not say what it removed (Generators) | **Proposed (not approved), D116:** a failed delete job shows `Removed: ... Not removed: ... Press Delete again to finish.`; a failed rollback names only the rows really left. Not run against DEV |
| A type delete cleans up the O&M costs of the first bridge row only (Generators) | **Proposed (not approved), D116:** the O&M clean-up and its guard cover every bridge row and chain member, in any status |
| Two users: a stale save re-creates a row the other user deleted (Generators) | **Proposed (not approved), D116:** the listed updates are guarded (`guardedUpdates`, off until its DEV check); the version check is not built |
| Orphan rows from a failed or declined save are invisible | **Proposed (not approved), D116:** `npm run orphans:generators` reports them read-only and deletes only a reviewed manifest, with a backup first |

### 1.4 Logic, traceability and release control
| Canvas challenge | Code app |
|---|---|
| Logic scattered in `OnSelect` / `OnVisible` / timers across 20,000-line YAML; no tests | Pure functions in `rules.ts` (rule 5); about 3,989 tests in 148 files (last reported run 26 Oct); stable `UT-…` ids (rule 13) |
| Commented-out formulas beside live ones | Rule 10: check which formula is live; rule 11: keep `OnSelect` validation apart from `ItemEnabled` |
| Hard to prove a control matches the canvas | `check-canvas-identities.mjs` (UT-CANVASID) checks name, type and `AccessibleLabel`; canvas-named ids on admin screens went from about 3 to 177 (D36) |
| Tosca cannot find controls | `aria-label` + `data-testid` on every control, enforced by `check-control-labels.mjs` (rule 16) |
| Wording drift | Verbatim strings in `MSG` objects with the canvas control cited (rule 7) |
| No gate before publishing | `npm run verify` plus a pre-push checklist; per-screen gap reports with COVERED / PARTIAL / MISSING / WRONG rows |
| Standard-assumption blue/italic rebuilt per control | One shared style, `components/standardValue.ts` (rule 20, D35); 168 canvas controls audited on 10 screens, 56 fixed |
| A version footer strip on every screen takes 32 px of height and repeats the version already in the header (`lbl_…_FooterVersion`) | **Divergence, proposed (not approved), 27 Oct 2026:** removed once in the shared `AppShell`, so every screen gains the height; the version stays in the header and user menu (D63) |
| Fold chevrons drawn per screen: small and grey on some, blue and large on others | **One shared `ExpandChevron`** on every accordion and card header, enforced by UT-EXPAND (27 Oct 2026, D64, proposed) |
| Same feature built in different ways per screen | Shared kit: `FormPanel`, `ConfirmDialog`, `CountryTechnologyPicker`, `StatusPill`, `RowActions`, `ReorderPanel`, `SettingsAccordion` and others, so one fix reaches every screen |
| Unsaved-changes guard missing or inconsistent | Shared guards: leave guard between screens (PO X1, D35), panel discard guard and `beforeunload` |

---

## Part 2 — Screen by screen

Status legend: **Connected** = reads and writes live Dataverse. **Reproduced** = canvas defect kept
on purpose. **Fixed** = changed under a recorded decision.

### A. Administration (Application Settings) — 6 screens

All six: connected, no Apply / Apply All (D20; the disabled bars on Contract and Cost were removed too, D67), canvas-named test ids and `AccessibleLabel`s
(D36), shared `FormPanel` / `ConfirmDialog` / `ReorderPanel`, and a per-screen `messages.ts`,
`fixtures.ts` and `writes.test.ts`. None of their tables fires a flow or plugin unless noted.

| Screen | Canvas problem found | What the code app does |
|---|---|---|
| **Default Checklists** (001, D18) | Gap report found 69 requirements: 37 covered, 20 partial, 3 missing, 9 wrong. Reordering relied on the PowerDragDrop component | Native drag-and-drop plus Move up / Move down buttons, no extra library (drag-and-drop was missing from the D36 port until D152, 20 Nov 2026); canvas defects fixed and documented; New-task Active toggle off as in canvas |
| **CAPEX Accounts** (002, D19) | Delete Account checked only the subaccounts; Reorder's `ItemEnabled` is commented out | Delete is also blocked when a contract references the account itself (safer, a documented divergence); reorder kept enabled as in canvas, Dataverse refuses without the privilege; the cascade filter `vsb_month gt N` reproduces `Month > Month(Today())` |
| **Milestones** (003, D21) | The plan called it "blocked by a missing flow", but the flow call is commented out in the canvas | Block cleared and screen connected. Two column errors corrected (primary key `vsb_milestonesstandardassumptionsid`; "Sales End" is `vsb_salesduration`). Apply, per-country Apply and the recalculating badge left out (D20) |
| **Gates & Approvals** (004, D22) | Several column names wrong in earlier code (`vsb_gateisactive`, navigation properties); people search used a wrong source | Two payload builders (one per table); people search through Entra (`aadusers`, enabled users only); Spain, Greece and Romania excluded from the country rail as in canvas; hidden controls (Reset, hidden order label) ported; no invented country-scope rule. A live people-search test is still pending |
| **Contract** (005, D23) | Plugin `DevCoCostRootCapexPlugin` sets the root CAPEX account on DevCo cost creation | Client does not redo the plugin's work. `createdRowRef(n)` lets one write plan reference rows it has just created. DevCo cost table registered. Option-set values corrected |
| **Cost** (006, D24) | Option sets had swapped or invented values (DevCo / SPV, an invented "Portfolio"); currency table name wrong | `costPaidType`, `thresholdType` and unit labels ("EUR/MW(p)", "SUM / MAX / MIN") corrected from `customizations.xml`; DEVEX and OPEX split into tree, drawers and contract table; 10 tables connected |

**Check List Settings UI parity (27 Oct 2026, D64, proposed, not approved):** measured against the live canvas screenshot and
`Admin Project Default Checklists Screen.pa.yaml`.
- **Page title in the header band** (`cmp_Header.Project.Name`) on all six admin screens, as on the PM screens; a visually hidden
  heading stays for screen readers.
- **Text sizes corrected:** row values 12 px (a modern Text `Size` is px) under 14 px Semibold headers; the earlier port had them inverted
  (16 px values, 12 px header).
- **Canvas action icons restored** on the Completion Date and Active buttons (an earlier divergence removed).
- **Hover hints on every panel and dialog ✕** ("Cancel", or "Close" where the canvas says so): the shared `FormPanel` and `ConfirmDialog` carry
  them, so no screen can miss one (D65, proposed). The canvas has 33 such hints; the earlier port had none.
- **12 canvas Save buttons showed a wrong hint** ("Filter projects details list view.", pasted from the filter icon). Fixed: they say "Save"; a test
  (UT-HINTS-001) keeps the pasted text out (D65).
- **Hover and press feedback on row action icons** (Edit, Delete, and the Completion Date / Active buttons): a mid grey fill (#D0D0D0) and the
  pointer cursor on hover, darker while pressed, none while busy or locked. The canvas gives no feedback (`HoverFillColor` transparent);
  this is an addition, shared in `RowActions` so every screen has it (D64 row 7, proposed).
- **One expand / collapse chevron everywhere** (blue, 1.4x, as the Cost cards), shared as `ExpandChevron`, with a test (UT-EXPAND)
  that fails if a screen draws its own small grey one (CONVENTIONS rule 21). Applies to every accordion and card header.
- **Milestones matrix text and column width match the canvas** (28 Oct 2026, D68, proposed, not approved): technology name 14 px, values and
  sub-labels 12 px (the earlier port read the modern Text sizes as pt, so they were 20 px and 16 px), and the blank column 110 px instead of 130.
  The columns now keep their fixed canvas widths instead of stretching with the window, and the strip is 32 px (D68 rows 11-12, found by the browser suite).
  The Edit panel follows the same sizes and the 80 px column layout (D68 rows 5-10), and its inputs show long values in full instead of the
  canvas's clipped "3…" and "0…".
- **Canvas-first parity run found three more differences, now fixed** (29 Oct 2026, D68 rows 13-14, D69, proposed, not approved): the admin left menu opens with both
  groups expanded as the Canvas does; Milestones rows are 55 px with 4 px cell padding (the sub-label no longer wraps to three lines); the country name is 14.6667 px.
  The suite compares the code app with a measured Canvas reference on every run and fails on any unexplained difference.
- **Numbers follow the user's language** (29 Oct 2026, D70, proposed, not approved): on Generators, Planning, Grid Operator, Finance and Revenues the boxes now OPEN in the
  decimal separator their validators read (a German user no longer sees "1.80x" in a box that only accepts "1,80x"), cards and range messages use the language, and the Contracts
  and Capex range messages group in it. The Grid Operator voltage stays dot-only, as in the canvas. A unit test per rule proves that each box's opening text passes its own
  validator in five languages (UT-LOCALE). Found by comparing the code app with the Canvas run.
- **Disabled Apply / Apply to All bars removed** from Admin Contract and Admin Cost (28 Oct 2026, D67, proposed, not approved). The canvas ships
  them permanently disabled with the sync call commented out, so they never did anything; the code app no longer draws them. Tests assert
  they are absent (UT-ADCONTR-936, UT-ADCOST-910).
- **"…" overflow menu for the country / technology tabs** instead of a scrollbar, in the shared tab strip (CAPEX Accounts too).
- **Application Settings panel UX fixes (5 Nov 2026, D85, fixed, awaiting approval).** Reported by the product owner on DEV:
  - **The save spinner covers the whole screen, not just the panel.** The shared `FormPanel` drew its blocking spinner inside the drawer; the drawer slides in with a `translate3d` transform, which makes it the containing block of a `position: fixed` child, so the scrim was only as large as the panel. The spinner is now portalled to the page body for every panel (`busyLabel` and `coverLabel`), and the two screen-level delete spinners of Admin Contract and Admin Cost are portalled too. The canvas spinner is a full-screen component (`cmp_PopUp_Loading`). Tests: UT-SETPANEL-007, 018.
  - **Admin Cost, DEVEX/CAPEX Add / Edit panel: the five clusters list one per line** (Cluster 2 and 3 had run onto one line). Test: UT-ADCOST-937.
  - **The panel's Save and Cancel have the canvas hover again** (`hoverButton` fill, `themePrimary` text and icon; Save, `pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save` L10865-10867, and Cancel L10959-10962). The port had left it to Fluent. Applies to every panel that uses the shared footer, so also the Costs and Gates panels. Tests: UT-PANELFTR-011.

- **Cost module side panels, same fixes as Application Settings (5 Nov 2026, D88, fixed, awaiting approval).** All eight Cost panels (Contracts x3, Capex Costs, Capex comments, OPEX, Land Lease, Add Costs from Table):
  - **The write spinner covers the whole screen.** `WriteStatus` now portals its overlay to the page body. Add Costs from Table and the Capex comments panel rendered it inside the panel, so the dimmed layer was panel-sized (same cause as D85). Test: UT-WSTATUS-005.
  - **The ✕ is centred in the header bar, as the canvas icon is** (`ico_…_Cancel`: `Y: =Parent.Height/2-Self.Height/2`). It sat about 2 px low in the 48 px bar and about 7 px high on Land Lease, whose skin zeroes the header padding. `FormPanel centerClose` (opt-in, the Application Settings and PM panels are untouched). Tests: UT-SETPANEL-024, UT-COSTCLOSE-002, 003.
  - **The ✕ hover is the shared one** (translucent white fill, icon stays white). Every Cost panel already inherited it; UT-COSTCLOSE-001 and 004 stop a screen skin from restyling the ✕.

**Net on 22 Oct (D36):** a collapsed-rail defect (CA-1) was fixed to follow the live
`pcf_Left_Navigation_Menu.Items` formula (test `UT-RAIL-003`). Five behaviours still contradict
earlier decisions D19, D22 and D24 and are waiting on the product owner (D36 §6).

### B. Project Management — 10 screens (connected 19–20 Oct, D25–D34)

| Screen | Canvas problem found | What the code app does |
|---|---|---|
| **General Data / New Project** (D25) | Terrain, local tax tables and shareholder entities were thought to be Fabric SQL | Confirmed they are Dataverse tables and connected them (5 tables). **Creating a new project** added on 20 Oct (PO). Cancellation flow for gate approvals left out until D81 (4 Nov 2026), now called between Patch #2 and the Draft return; leave guard added in D35. **3 Nov 2026 (commits 260fb5b / 73e4cc6 on master, merged 4 Nov, D82):** the municipality comboboxes back to the canvas rules (user, 3 Nov) — Germany searches the Area's municipalities from the first letter and lists them all (a 5,000-row page, not 50), France waits for three letters, a click starts a fresh search instead of editing the chosen name; DIVERGENCE recorded in the code: no `DelayOutput` |
| **Milestones** (D26) | Plan said "formally blocked" by a missing flow | Cleared: the flow call sits inside a comment block. 4 SOURCE DEFECTs fixed; the COD guard, FID re-pricing and recalculating notice connected. Default revenue seed stays unconnected (Fabric SQL, D2) |
| **Generators** (D27) | Module-permission flows send mails and Teams cards; a type Save blocker and a PV supplier write error | Both fixed. 7 SOURCE DEFECTs fixed; 10 tables connected; permission-request controls shown but disabled with an `EXCLUDED.*` tooltip; `CommandBar` gained a tooltip for a disabled command. **4 Nov 2026 (D89, proposed):** the WTG type panel names the hidden reason Save is disabled (no price for the count, no inflation index for the FID year, a 0 m hub height), where the canvas shows nothing; the Save rule itself is unchanged |
| **Production** (D28) | Seasonality and negative-price values come from Fabric SQL | Shows a clear "not connected" notice instead of silently blank values; save, delete, activate / deactivate, project roll-up and the one-shot standard Land Lease / Other OPEX / O&M contracts are connected |
| **Checklist** (D29) | Approval buttons start flows (mails, Teams cards) | Everything not tied to a flow is connected: back-fill, tracking, materialisation, Complete / In Progress, comments, ungated moves, Reset, Abandon / Inactivate / Activate. Approval buttons visible but disabled until D81 (4 Nov 2026), now wired to the four flows (Request Approval in both modes, Cancel Approval Request, the row ✕). **3 Nov 2026 parity pass (commits 5271005 / 260fb5b on master, merged 4 Nov, D82):** Country Description stops before Completion Date as on the canvas; no hover / pressed highlight on a record; canvas hover fills on In Progress / Complete, a green Complete keeps its colour and paints at once while its write runs; the stepper tick bold and white; the Comment and Cluster Movement panels no longer close on an outside click; the Request Approval arrow and the cluster-name hover text; the page lock lists all four sections with no project |
| **Checklist, UI parity** (27 Oct, D66, proposed) | Screenshot comparison with the canvas | Mail / People gate icon at 20 px; state text lined up across the stage cards; the clock under the gate; plain refresh icon; 16 px text and a plain ✕ on three action buttons; table capped at 1520 px (a table ignores `max-width`, so it had filled the window); 37 px rows with 80 x 26 toggles; Note comment icon and a 20 px approval icon in the canvas colours |
| **Team** (D30) | Office 365 Users search | Entra (`aadusers`) people search and pre-selection (D25-Q6); 5 SOURCE DEFECTs fixed; add / edit / delete a member |
| **Planning** (D31) | Description lookup name guessed wrongly in earlier code; acquisition type caption mismatch | Correct names from generated models; get-or-create of planning and acquisition rows on visit; permit add / edit / delete; Save and Clear & Save; 33 canvas ids verified |
| **Grid Operator** (D32) | Gap report: 53 requirements, 24 covered, 12 partial, 10 missing, 7 wrong | Save as one create or update with Project and Owning Business Unit; 16 canvas ids verified; no flow or plugin on its table |
| **Revenues** (D33) | Gap report: 118 requirements, 45 covered, 27 partial, 23 missing, 23 wrong | Contract save with the 14 standard flags, hedge 100 % check, individual volumes, balancing price; stale hedge-type choice removed; the five live hidden-control items ported. Standard-assumption engine runs but has no rows until Fabric is connected (D2) |
| **Finance** (D34) | Gap report: 126 requirements, 50 covered, 33 partial, 12 missing, 31 wrong | Financing options and cascade, VAT / Decommissioning / tranche / DSRA activate-deactivate, tranche delete cascade, repayment amounts and step-up margins; Boolean option fix; four Date Only columns written as `yyyy-mm-dd`. Debt, Banks and KfW tranche assumptions are Fabric SQL and stay empty with a visible notice |

**Net on 20 Oct (D35):** standard-assumption styling applied across 10 screens; unsaved-changes guard added; M4 on Generators; Planning identity gate.

### C. Project Overview (landing screen)

| Canvas challenge | Code app |
|---|---|
| App opened one specific hard-coded test project when no `projectId` was given (A-2) | No fallback project; a missing project is a defined state |
| Project grid read through collections, capped at 2,000 rows | Server-paged, 200 per page, with a skip-token cache |
| Page 2 blank, then Next disabled (CA-2) | `maxPageSize` instead of `$top`, which had suppressed the paging cookie (D41, D42) |
| "Page 6 of 7" with Next disabled (CA-3) | `vsb_projectid` tie-breaker and a walk-derived total (D44) |
| Page count 7 against the canvas's 6 (CA-4) | Count follows `RoundUp(TotalRows / PageSize)` over named and blank segments together; property test of 2,704 cases, 0 failures (D45) |
| Next-page lag | Count once per walk, concurrent probe, prefetch of the next page, memoised rows (selection re-renders 1–2 rows, not 200) (D43) |
| New-tab links opened the wrong app during `pac code run` | `resolvePlayAppUrl` is environment-aware; `costScreen` / `pmScreen` / `projectId` parameters carry the target (rule 12) |
| **Open:** Next gate and `clampPage` differ from the canvas (canvas resets to page 1); the code app hides inactive projects, the canvas lists them (G2) | PROPOSED, awaiting the product owner |

### D. Cost — DEVEX / CAPEX

| Canvas challenge | Code app |
|---|---|
| The custom PCF grid is a dependency outside the app | Real PCF renderer ported and vendored (`DatasetParser.js`, `GridRenderer.js`, `ActionDropdown.js` and the stylesheet), documented in `PCF-RENDERER-PORT.md` |
| New equal-distribution contract never gets Average Payment or cluster link (C-7) | **Fixed**: `saveCostLine` computes `vsb_averagepayment` and binds `vsb_LinkedCluster` on create (D38 §9 Q4 asks whether to keep or revert) |
| The two entry paths select different tabs depending on load timing (D-7) | **Fixed**: category comes from `?category=` and defaults to the Summary tab, so the landing tab is deterministic |
| Comment numbering stored in the name; deleting a thread renames others (N-4) | **Reproduced** (marked `SOURCE DEFECT: N-4`, test `UT-CMT-037`); a real fix needs a schema change |
| Resolving one thread resolves them all (N-5, `Not()` wraps the whole `And`) | **Fixed**: `resolveThread` / `reopenThread` scope to the thread and its replies. Raised for client confirmation |
| CAPEX deletes bypassed the result check | Delete safety pass via `deleteRecord` (D38; backlog H-2) |
| Gap report of 23 Oct | 65 rows: 51 covered, 7 partial, 2 missing, 5 wrong; 12-item UI register for popups; D39 popup and dialog chrome fixes (every item PROPOSED) |
| Cost book logic spread across screens | Complete cost-book data layer and domain logic for CAPEX and OPEX (`data/costBook.ts`, `domain/costStandards.ts`, `domain/contractStandards.ts`, 26 Oct) |

- **Capex panel, Total Costs accepts only what the canvas validates (5 Nov 2026, D93, fixed, awaiting approval).** The box was a browser number field: a typed `e` (or `abc`, `-`, `.`) showed in the box while the browser reported an empty value, so no message appeared and the user was never told. The canvas box is a plain text input (`MaxLength: 512`) whose red label `lbl_AddContract_RightPanel_TotalCost_ErrorMessage_1` shows for any non-blank value that is not an integer in range. It is now a text box with a numeric keypad hint, so the existing `validateTotalCost` message shows and Save stays disabled. Tests: UT-CAPEXTOTAL-001..003. The month boxes of an Individual contract have the same pattern and are not changed yet (D93).

- **Capex panel and grid, 15 decisions settled by following the Canvas (5 Nov 2026, D90, reproduced / fixed, awaiting approval).** Following the Canvas here means the code app **loses** some safeguards it had added: month amounts out of range, a payment-date comment with no month, and a spaces-only Description can be saved again; relinking no longer deletes payment-date comments. It also **gains** Canvas features that were missing: the author gate on comment Edit / Delete / Reset, the header logo to the PM app, the standard blue-italic styling on every listed field, the edited-from-spreadsheet warning, the Canvas menu rule for standard contracts (start cluster 6 offers none, refusal at creation as a toast), the grid payer tag from Cost Type alone, the panel year list `Year(start)` to `Year(end)+3`, and the stored start/end JSON in Canvas key order. Full list with canvas lines: D90.

- **Capex panel and grid, the remaining run failures fixed to the Canvas (5 Nov 2026, D91, fixed, awaiting approval).** Linked Cluster is cleared when the cluster-linked paid dialog is confirmed (the contract was staying linked: a data-integrity defect); a contract created in the panel is a Powerapps one and an Individual contract stores the sum of its months as its Total Cost; every cost row of a standard contract carries its assumption; a standard contract is checked live against Dataverse before creation; Save needs a change since the panel opened and, for Individual % Values, a Total Cost; the Average Amount shows `total / n` to two decimals; a new contract's payer follows the sub-account mapping; the cluster timeline never loses a band; month boxes show a typed letter with its message instead of swallowing it; message wording, hover texts and the cluster checkbox `aria-label` follow the Canvas. Full list: D91.

- **Side-panel close icon centred in the bar, root cause fixed (5 Nov 2026, D92, fixed, awaiting approval).** Fluent pins the ✕ to the top of its row (`align-self: start`), which left it 8-10 px above the middle on every Cost panel and the Revenues panels; the first fix (D88) made it worse by stretching the row. The ✕ is now centred as the canvas icon is (`Y: =Parent.Height/2-Self.Height/2`), and the stray Fluent focus box around it is hidden.

- **Capex panel, six more Canvas parities from test run 2 (5 Nov 2026, D96, fixed, awaiting approval).** An Individual contract's months are checked when Save is clicked, with the Canvas strip texts, instead of silently disabling Save; an unreadable or cleared month box is blank after Recalculate; the Link to Milestone and Distribution Frequency dropdowns carry the Canvas control names (and the identity gate now covers `CostSelect`); a duplicate standard contract is an Information notice and leaves the menu; a standard contract whose payments come out empty is refused; the paid write shows the Canvas spinner texts.

### E. Cost — Add Cost from Table

| Canvas challenge | Code app |
|---|---|
| Deleting a contract's description deletes the contract and **all** its historical costs because the guard is commented out (A-1) | **Reproduced on purpose** as `CANVAS_PARITY_DELETION = true` (client-confirmed, rule 15), now with a safety net, `identityRoundTripFailures`, added after the Wirmighausen incident (about 168 CAPEX rows lost to one save) |
| Year range off by one for projects longer than 15 years (C-1) | The CAPEX screen's correct `max − min + 1` form is the one used |
| Duplicate-contract error can name the wrong account (C-2) | Not reproduced |
| Whole save is a long timer in the canvas | Phased save as a write plan; still non-transactional |
| The table opened as a centred 90 % × 90 % pop-up over a scrim, unlike every other form | **Divergence, proposed (not approved), 26 Oct 2026:** opens as the shared right-docked `FormPanel` at about 95 % width (new `grid` preset) over the DEVEX/CAPEX screen, so the grid keeps its room and the panel behaves like the other features. The URL `/costs/add-from-table` stays a deep link. Behaviour, ids and the save logic are unchanged; Cancel still closes without a prompt. Checked in the browser by the user, who found it good; recorded as D62 |

### F. Cost — Contracts

| Canvas challenge | Code app |
|---|---|
| `Margin = No` still adds the fixed margin; a bad percentage wipes the total (C-6, D3) | Fixed in the rebuild, with canvas behaviour kept as `totalCostOfContractCanvasParity`; tests `UT-CON-029` and `UT-CON-030` (needs final sign-off) |
| Wrong field tested in one validation message (D-3); two format strings disagree | Corrected, with the original noted |
| A blank required field greys out Save with no message (D-4) | Blank is reported (D4) |
| Delete is gated on Edit permission (D-5) | Delete gated on Delete permission (D5); until D1 is decided a 403 becomes a message |
| Payment date stored as text (D-6) | Kept as text, flagged as a schema decision (D7); parse errors no longer swallowed |
| Save is three separate requests | Declared and tested as a plan; still non-transactional (D6) |

### G. Cost — OPEX (Operation & Maintenance and Other OPEX)

Found while porting about 8,900 lines of canvas code: 13 numbered defects (O-1 … O-13), each
pinned by a `UT-OPEX-###` test.

- **Reproduced with a parity twin:** Edit / Delete missing selection and permission checks on the
  O&M bar (O-1); Save unreachable on Italian projects (O-2); unreachable cascade warning (O-3);
  one-row badge per device card (O-4); warning icon on every row (O-4b); duplicate guard that is
  project-wide (O-8); inflation "off" and "0.0 %" indistinguishable (O-9); wrong-row month loss
  in the start-date picker (O-6, `defectiveMonths` makes the loss visible).
- **Corrected:** start-date error `.Text` / `.Visible` inverted (O-12). Period ordering by text
  (`… - 10` before `… - 2`, O-5) was corrected, then reproduced again on 26 Oct for the Add
  Period and Delete gates.
- A shared `OpexScreen` now holds the logic that the canvas copied between two tabs.

### H. Cost — Land Lease

Found while porting about 6,100 canvas lines against the newer `.pa.yaml`: 13 defects
(LL-D1 … LL-D13) and one resolved ambiguity, each pinned by a `UT-LAND-###` test.

- **Corrected with a parity twin:** period 9 wraps to a second Period 1, with no cap on Add Period
  (LL-D1, `nextPeriodCanvasParity`); stale cost header after deselect (LL-D5); inverted blank
  start-date error that let a blank date save silently (LL-D6).
- **Reproduced:** one-time payment saving a blank economic row (LL-D7, `UT-LAND-085`, because
  live data may already hold that shape); standard import chaining dates off Description order
  (LL-D8); allocation names beginning with `-`, **confirmed in live Dataverse** (LL-D9).
- **Resolved with the client:** `Text(x, "…0.00 %")` shows `20.00 %`, not `2,000.00 %`.
- **UI parity (26 Oct):** grid, Add/Edit panel and delete popups matched to the canvas (650 px
  panel, 42 px headers, scrollbar, 11 pt captions, canvas date picker, dropdown lists), through an
  optional `canvasFooter` setting on `ConfirmDialog` used only here.
- **Parity run fixes (3 Nov 2026, D79, uncommitted):**
  - **Fixed:** a refused delete now fails visibly. Land Lease, OPEX and Contracts deletes go through `deleteRecord`
    (CA-27; the canvas `Remove` is silent too).
  - **Reproduced:** the text sizes, weights and colours are now the canvas values; the earlier +0.5 pt is gone.
    Validation matches the canvas for spaces and `"1."` (V1–V3), with the earlier trimming kept as the
    `"trimmed"` twin. A Year change clears the custom inflation % (V4, `SOURCE DEFECT` reproduced).
  - **Fixed (rule 16):** the Year / Month / Month accessible names; the period row's hover text (X1, X2).
  - **New gate:** the Land Lease Playwright parity suite (`e2e/landlease.*`; rule map
    `e2e/RULEMAP-land-lease.md`).
- **Parity harness fixes (4 Nov 2026, D80 §3, uncommitted; confirmed live in run 16: 0 new differences):**
  - **Reproduced:** "Add Period" clears the selected row while its panel is open, as the canvas arm `"newLandLeasePeriodKey"`
    (LL:396) blanks `locSelectedLandLeasePeriod` (`leaseSelectionOnAddPeriod`, UT-LEASE-SEL-006, UT-LLUI-017). Edit keeps
    the row, as before.
  - **Reproduced (rule 6):** the panel dropdown values are the modern controls' rgb(36, 36, 36), not this app's #000
    (`MODERN_TEXT`, shared with the toggle captions of D79); the delete pop-up title and description are the canvas 11 pt
    again (D49 §1 had enlarged them to 15.6 / 15.4 px).
  - **Fixed, shared:** the card toolbars' icon box and first-command offset (see the D80 entry below).
- **Period start chain (17 Nov 2026, D118, fixed, awaiting approval):**
  - **Fixed (divergence):** the Start Date picker is disabled on every period after Period 1, so a later period's start cannot
    be typed off the previous period's End Date + 1 day (the canvas leaves it editable). `startDateEditable`,
    canvas twin `startDateEditableCanvasParity`. Tests: UT-PCHAIN-001, 002, 030, 031 (UT-LLUI-009 updated).
  - **Fixed (divergence):** saving a Land Lease period re-chains the periods after it, as OPEX already does
    (`planFollowingLeaseStarts`, UT-PCHAIN-003..011); an aligned contract writes nothing.
  - **Fixed (divergence):** an OPEX Save of an earlier period also repairs following periods whose stored start drifted (hand-typed
    before the picker was disabled, D98); an aligned chain writes nothing. Other OPEX and Operation & Maintenance already
    follow end + 1 on Add Period (UT-PCHAIN-020..025).

---

## Part 3 — What the code app does not improve yet

- **Privileges (D1, D12):** no SDK equivalent of `DataSourceInfo` / `RecordInfo`; the provisional
  answer is "server refuses, a 403 becomes a message". Delete Project is visible but disabled.
- **Non-transactional saves (D6):** the SDK has no changeset; a custom API would be needed.
- **Concurrency (R-12):** no optimistic-concurrency check between two people or tabs.
- **Scale and performance (R-10, R-11):** `fetchAll` caps at 50 pages × 500 rows; `@odata.count`
  caps at 5,000; the Fluent chunk is about 570 kB gzipped; live performance is unmeasured.
- **Fabric SQL assumptions (D2):** Revenues, Finance, Production and Milestones seeds stay empty,
  with a visible notice. Deliberately not touched.
- **Flows that send mails and Teams cards** (approvals, module permissions) are shown disabled, not
  rebuilt.
- **No scripted browser walk (G-WALK)** and no automated check that the owning business unit is
  set (G-OWN). The last two DEV pushes (D37, D40) had the smoke test waived.
- **Canvas defects reproduced until the client signs off (R-16)**, including `CANVAS_PARITY_DELETION`.
- **Not product-approved:** D36 §4–§6, D38, D39 and D41–D45.
- **Waiting on the product owner:** D36 contradictions with D19, D22 and D24; the disabled Apply
  bars (D20); labels still containing record data; the Overview `clampPage` and inactive-project
  questions (G2).

## Parity run, Application Settings (29 Oct 2026, D71) — fixed

- **Project Gates:** header, people and gate/task text sizes and colours now equal the Canvas; Status column and Add Task inset aligned.
- **CAPEX Accounts:** account caption size aligned (13.3333 px).
- **Costs / Contracts:** page inset and breadcrumb size aligned.
- **Check List Settings:** command bar height and caption inset aligned.
- **New gate:** `e2e/appsettings.parity.spec.ts` compares each screen with the Canvas, text by text.

## Request log (29 Oct 2026, D72) — fixed / new

- **Cross-cutting:** every request, data call, page load and save now prints a `[VSB]` line in the browser console (requests, rows, milliseconds), in every build. The canvas has no such trace. The Add Cost from Table lines use the same format.
- **Fixed (3 Nov 2026, D79, CA-28):** a load named by its raw query key printed the project GUID; `keyText` now prints `<id>` (UT-REQLOG-023).

## Add Cost from Table, year view (29 Oct 2026, D73) — removed 19 Nov 2026 (D139)

- A "Show all years" switch limited the table to the current year's columns, so clicking and Tab were fast on big sheets. **Removed (D139):** the sheet always shows every year again, as the canvas does.

## Add Cost from Table, typing with every year shown (19 Nov 2026, D139) — fixed

- **Fixed:** typing in a cell redrew the whole sheet (about 28,000 cells) up to three times per keystroke, and re-read and re-validated the whole sheet each time. Now an edit rebuilds only its own row, the grid is not reloaded when it already shows the typed value, and the read-back and validation wait for a 200 ms pause. Save reads back an edit made within that pause first, so it always saves what the grid shows. In a jsdom benchmark a keystroke went from about 3.5–6.1 s to 1.1–1.8 s. One redraw per keystroke remains, inside `react-spreadsheet` itself.
- **Fixed (D140):** in a real browser typing still took 0.6–1.9 s per key. Now the grid's cells update only when their own state changes (`src/platform/useContextSelector.ts`), and only the cells in view are drawn, with column widths pinned from every row. Measured on the real screen in Edge (production build): a keystroke 21–28 ms, a click 16–33 ms, scrolling smooth. Selection, keys, copy, paste and Save still work on the whole sheet.

## Add Cost from Table, text colour of the read-only rows (20 Nov 2026) — fixed

- **Fixed:** the header row and the grey account rows (`80000`, `Turbine / PV Supply Agreement`, `*Account*`) were drawn in light grey; the canvas draws them black. `react-spreadsheet` adds `.Spreadsheet__cell--readonly { color: rgba(0, 0, 0, 0.4) }` when the sheet loads, after the app's stylesheet, so at equal specificity it beat the ported `.header` / `.filled-row` black. In the PCF the control's CSS loaded last, so black won there. `MySpreadsheet.css` now sets black on `.Spreadsheet__cell.header` and `.Spreadsheet__cell.filled-row`, which outrank the library's rule whatever the load order. Column letters and row numbers stay grey, as in the canvas. CSS only; no test (jsdom does not apply the cascade), checked against the user's DEV and canvas screenshots, 20 Nov 2026; not yet seen in a browser after the change.

## One-hour parity harness, any screen (3–4 Nov 2026, D80) — new gate, proposed (not approved)

- **New gate:** `npm run parity` checks one screen across every layer, in both apps, within an hour. The layers are visual,
  UX, validation (every input in both apps), gates, write flows with Owning Business Unit, and platform. The Land Lease full
  run takes 30 min on DEV (run 9, 4 Nov 2026). A screen is a manifest
  (`e2e/screens/<slug>/manifest.ts`), not new specs. The canvas has no automated parity check.
- **Code app (test-only):** `platform/e2eHook.ts` exposes `window.__vsbIdle()` only when the harness sets `localStorage
  __vsbE2E`, and `LoadingOverlay` marks itself `data-vsb-busy`. Users see no change.
- **Harness defects fixed during the live runs (3–4 Nov 2026):**
  - Lanes now run in default mode, and an over-budget lane only gets a warning; before, one failure cost the rest of the lane.
  - A screen is read only once its rest marker shows (`openScreenReady`).
  - The code-app frame is matched by origin; before, the write cleanup ran in the player page and left 14 `PW-` rows, which
    the new `parity:sweep` removed.
  - Validation messages are read in one page call, down from 23 s to about 4 s per Canvas input.
  - A visual state can wait for its panel (`until`).
  - The Land Lease text window starts at y 80, so the first card title is captured.
  - A folded Canvas card's clipped command is never chosen (the standard import had used the wrong card).
  - A Canvas row selection accounts for the gallery's Selected card.
  - The preflight reloads a Canvas player stuck on "Fetching your app" once, and a row click waits for the rows to show.
  - The Land Lease text window starts at y 50, so an open panel's top fields are compared too.
- **Proved:** the mutation proof (6 deliberate code-app changes, one per layer) is caught 6 of 6 (4 Nov 2026). Runs 12
  and 13 were clean.
- **Found by the harness, then fixed (4 Nov 2026, D80 §3, on the user's go-ahead; confirmed live in run 16, 37 min 10 s,
  0 new differences):**
  - **Fixed (rule 16), CA-30:** every date field's calendar button now carries `<field test id>-calendar` and the caption
    "Open calendar" (shared `DateInput`; UT-DATEFIELD-005). The canvas picker has no separate control for it.
  - **Fixed, shared:** the command rows' icon box is the PowerCAT 16 px, not Fluent's 20 px, and the first command's 3 px
    pull is gone, so every command bar's captions sit where the canvas's do (`commandRow.ts`; measured on Land Lease, the
    other screens are re-measured in their next parity run).
  - **Harness, fixed:** CSS-drawn texts (`::before` / `::after` with a quoted `content`) are read as texts, and a native
    `<select>` value is placed where its text starts (UT-PHREAD-DOM-004…006). Before, 64 of the Land Lease "differences"
    were these two measuring artefacts plus the four code-app differences listed under section H.

## The PM app's cloud flows in the code app (4 Nov 2026, D81) — in progress (not approved for DEV)

- **Connected (Check List, General Data):** the four approval flows the canvas calls are called from the code app through
  one typed module (`data/flows.ts`), each inside one job with the canvas's writes before and after it, in the canvas
  order (`PlanJob.then`). The controls D29 / D25 had disabled (Request Approval, Cancel Approval Request, the row ✕, the
  start-cluster change during a Draft approval) work as the canvas's.
- **Fixed (rule 3):** a flow the platform refuses, or a checklist cancellation that answers `success: false`, is shown as
  an error; the canvas stored the result in a context variable and showed nothing. The General Data cancellation keeps
  the canvas `IfError(…, false)` (the save goes on) but logs the failure with its cause (rule 23).
- **Fixed (rule 23):** every flow call prints a `[VSB] DATA execute flow <name>` line with its time and outcome; the
  canvas had no trace.
- **New gate:** `check:power` verifies each flow's schema and registration and prints the `pa app add flow` command for a
  missing one.
- **Reproduced (DIVERGENCE recorded):** the General Data cancellation's gate record is looked up in the project's own
  country and technology; the canvas `LookUp` ran across all countries and took the first row for that cluster.
- **Connection references:** nothing to add in the code app — the flows' actions run through the solution's connection
  references, all bound in DEV to the service account's connections (`16-PM-FLOWS-IN-THE-CODE-APP.md` §3). Found: two
  Generators flows use *Provided by run-only user* connections, which a code app cannot supply (§3b); they wait for that
  setting.

## Troubleshooting aids (29 Oct 2026, D74) — new

- **Cross-cutting:** console lines carry an action id, errors print their Dataverse root cause with the route, slow requests and actions are flagged `SLOW`, and unhandled errors are logged with the last actions. The canvas silently swallowed these (`App.OnError`, B-1).

## Contracts, OPEX and Land Lease test run 3 (6 Nov 2026, D100, D101) — fixed / reproduced / proposed

Not committed. Where a row says **fixed**, the code app was changed to follow the Canvas; the improvement over the earlier build is that the difference is gone and pinned by a test.

| Screen | Change | Status |
|---|---|---|
| Contracts | Card figures `###,##0` (blank as 0), `RoundUp` for Plan and calculated totals, integer total stored, margin only with Margin = Yes in one decimal, payment-target % one decimal | fixed |
| Contracts | Margin Fixed Value accepts two decimals; range message "0 and 100.0"; Rights total blocked only when not an integer | fixed |
| Contracts | Standard blue/italic on the card and edit-panel margin, restored on Reset; Margin and Margin-type change reset the boxes to 0 | fixed |
| Contracts | A failed DevCo link create is shown (`unwrap`), not silent (CONTR-081) | fixed (a silent-failure bug removed) |
| Contracts | Rights contract written as the Canvas writes it (`BoP RC-…`, 7 columns, 'Total cost of contract [EUR]', no DevCo rows) | fixed (reproduces a Canvas source defect in the name) |
| Contracts | Add Period needs a selected card and a sum under 100, pre-fills "<base> - n+1" and locks Description; Edit and Delete need the selected card; targets sorted by Created On; card expanded and selection cleared after Save; Cancel and ✕ clear the target | fixed |
| Contracts | Contracts, targets and DevCo links re-read on every visit; hover texts on card header, captions and the used-account tooltip; Monday week start and project-start calendar on the closing date | fixed |
| OPEX | No card open at load; Other OPEX keeps its fold state; aria-labels "Year", "Month", "Month"; hover texts; Description limit 100 | fixed |
| OPEX | The live create and the standard import write what the Canvas writes (Name, COD year + 1, area, profile, threshold, `timezoneruleversionnumber` 4, one contract per Period-1 assumption) | fixed (the tests had pinned helpers the live path did not call) |
| OPEX | A lone space is not blank (numeric message, Save off), with the `"trimmed"` twin; Country Inflation Profile on lets Save enable; duplicate description compared without case; Threshold resets; selection cleared after Save | fixed / reproduced |
| OPEX | Start Date flag follows the edited Canvas: Add Contract Type Yes, follow-on from the parent, picker compares with the default date; Start Date editable only on a root; reset icon root-only; a stored Blank flag stays Blank | fixed (edited Canvas confirmed as reference, D100) |
| OPEX | Save re-chains the periods that follow an edited period when its start date or duration changed, and copies the flag to the child periods; failures of those steps are shown, the save continues | fixed || OPEX | Area dropdown hidden on Italian projects but defaulted to the project zone, so Save works | reproduced (O-2) with a working Save |
| Land Lease | Picking a Start Date clears the standard flag; header save writes PLN/EUR by country; picking generators by hand no longer changes "Allocate to all WTGs" or the saved flag; Save needs a generator | fixed |
| Land Lease | Inflation Profile off resets country, year, Area and profile; Start Year and profile follow the Start Date and Area; One-Time Payment restores stored values; payment blocks 2 and 3 follow their own flags | fixed |
| Land Lease | The save runs the header, allocation and period steps independently and reports every failure; the allocation Name uses the new description; case-insensitive "Standard" | fixed |
| Land Lease | F5 keeps the route and "Cost data is unavailable" shows on a failed read | improvement over the Canvas (already built; LEASE-003) |
| All three | Reads keep `statecode eq 0`; Add Period on any period and the Delete last-period gate stay as the 27 Oct 2026 divergence | proposed (not approved), see D101 |

## Finance, Senior Debt tranche: Individual repayment schedule (6 Nov 2026, D102) — fixed

| Screen | Change | Status |
|---|---|---|
| Project Finance | Term Sheet <-> Credit Agreement keeps the Individual repayment schedule and the step-up rows (they were cleared on every status change, and the next Save then deleted the stored repayment rows) | fixed (a data-loss bug removed) |
| Project Finance | Tenor, Start Repayment, Commitment Fee Free Period and Fixed Interest Rate months read 0 once their years are chosen, so the schedule appears and Save can enable without opening the month lists | fixed |

## Project Overview: the Project search accepts spaces (6 Nov 2026, D103) — fixed

| Screen | Change | Status |
|---|---|---|
| Project Overview | The Project search box accepts spaces, as the Canvas does (the typed text is kept as typed; only the query trims it). A space was erased on the keystroke that typed it because the URL copy of the criteria was written trimmed | fixed |

## Finance, Add Tranche panel layout (6 Nov 2026, D104) — fixed (a deliberate divergence)

| Screen | Change | Status |
|---|---|---|
| Project Finance | The Individual repayment column no longer runs under the next column: a long validation message wraps inside its column instead of widening the box, and the row grows with it, so no text sits on the next caption. The Canvas clips the one-line message instead | fixed (DIVERGENCE, readable full text) |

## Azure Maps on Project General Data (6 Nov 2026, D25 map) — new (merged to master 6 Nov 2026)

Branch `feature/azure-maps-integration`; details in `18-AZURE-MAPS-IN-THE-CODE-APP.md`.

| Screen | Change | Status |
|---|---|---|
| General Data | The map placeholder is now an Azure Maps map (`ProjectMap`, lazy-loaded): the labelled project pin, the device dot, zoom 12, a click → *Project Location Confirmation* → Confirm fills Latitude / Longitude, as the canvas `Map@1.8.27` | reproduced |
| General Data | **DIVERGENCE:** the view opens on the project pin, not on the device location (the canvas opened on the user's position, so a distant project's pin was off-screen); a typed position outside the view eases the camera to it | proposed (not approved) |
| General Data | The map's access token comes from a solution flow (`Get Azure Maps SAS Token`) that reads all Azure values from six `vsb_AzureMaps*` environment variables: no key, token or Azure id in the app or the flow; users need no Azure rights; the token is read-only, rate-limited and short-lived (the canvas used a Microsoft-managed account with no control over any of this) | new |
| General Data | Token cache: one flow call per token lifetime per browser, background refresh before expiry, a 401/403 drops the token, no refresh loop on a short-lived token (UT-AZMAP-001…007) | new |
| General Data | A failed token or map load shows one plain sentence per cause in the map area (access not granted / not set up / service did not respond / access denied / unknown, `MAP_MESSAGES`), not the raw error; the technical detail is one console line (`[VSB] ERROR Azure Maps token — <kind> — <code>: <message>`); the rest of the screen keeps working (UT-AZMAP-008/009) | new |
| General Data | The token flow catches its own failure (scope → `Failed_steps` → `Respond_error` → `Terminate_failed`): the app gets `errorcode` / `errormessage` at once instead of a 502 *NoResponse* after a wait, and the run still ends as Failed in the run history | new |
| General Data | After a token failure the app waits 60 s before calling the flow again: panning a broken map no longer starts a flow run per tile (UT-AZMAP-006) | new |
| General Data | A map that cannot load at all (SDK chunk, WebGL, a CSP block) is caught by an error boundary around the map: "The map cannot be displayed. Please reload the page." in the map area, the form and Save unaffected (UT-GDATA-911; found when UT-ROUTES-020/021 crashed the whole route without it) | new |

## Cluster Checklist, Move to Cluster: loading and layers (6 Nov 2026, D105) — fixed / kept

| Screen | Change | Status |
|---|---|---|
| Cluster Checklist | The save spinner now covers the open transition panel, as the Canvas pop-up does; before, it sat under the panel and Save and the ✕ stayed clickable during the write | fixed |
| Cluster Checklist | The panel's ✕ and Escape are locked while a write runs | fixed |
| Cluster Checklist | The panel closes after a failed move or approval request, as the Canvas does (Reset runs after the IfError); the error bar is no longer left behind the panel | fixed (the typed comment is discarded; product to confirm) |
| Cluster Checklist | An error bar with the root cause shows where the Canvas shows nothing (its error text is hidden in the same step) | improvement over the Canvas, kept |

## Cluster Checklist, Move to Cluster: the panel closes when the writes end (6 Nov 2026, D106) — fixed

| Screen | Change | Status |
|---|---|---|
| Cluster Checklist | The transition panel closes as soon as the writes end, success or failure, as the Canvas does, and the "Loading, please wait..." spinner then covers the reload behind it; before, the panel stayed open under the spinner for the whole write and reload | fixed |

## Production: the "can't be deleted/deactivated" pop-up and the disabled Save (6 Nov 2026, D107) — reproduced

| Screen | Change | Status |
|---|---|---|
| Production | Delete or Deactivate of the last active study shows the Canvas pop-up itself (blue 64-px header, ⓘ tag, rule, outlined Close; 550 × 220), not a stock Fluent dialog. The behaviour (both commands, the texts) was already the Canvas's | reproduced |
| Production, Generators | The pop-up is one shared component (`InformationPopUp`) with the per-copy size as props; Generators' inline copy now uses it, unchanged on screen. New tests UT-INFOPOP-001…004, UT-PROD-912 | new (reuse, a new test) |
| Production | The disabled Save of the Add/Edit panel is the Canvas PowerCAT ActionButton (transparent "✓ Save"), not Fluent's grey filled box; enabled it is unchanged. UT-PROD-913 | reproduced |

## Production: faster Save, Delete and Activate / Deactivate (6 Nov 2026, D108) — fixed (divergences proposed, not approved)

| Screen | Change | Status |
|---|---|---|
| Production | After the yield write, the seasonality, negative-price (one per curve year), revenue-sync and superseded-yield writes are sent together, 8 at a time, instead of one round trip each | fixed (DIVERGENCE: a failure among them lets the others finish) |
| Production | The roll-up runs in the same job as the Save / Delete / status change, from a fresh read after the writes: one spinner and one reload instead of two | fixed (DIVERGENCE: a roll-up failure carries the Save's error text) |
| Production | The spinner closes once the writes land; the screen reloads behind it with the command bar off until it has (as Generators) | fixed (DIVERGENCE: the old rows show for about one reload) |
| Production | Tests UT-PROD-130 and UT-PRODHOOK-001…004 pin the plan shape, the single job and reload, the post-write read and the generation rule | new (tests) |

## Production: the first save's standard-contract generation sends its creates together (D135) — fixed (divergence proposed, not approved)

| Screen | Change | Status |
|---|---|---|
| Production | The one-shot generation of the standard Land Lease, Other OPEX and O&M contracts sent every create as its own request, one after the other: 151 requests for 4 land leases over 30 turbines, 831 for 200 turbines. Independent creates now go out together, 8 at a time; a child waits for the run that holds its parent. Same rows, same order, same parent links: 151 requests in 22 awaited round trips, and 831 in 109. The four project flags are still written last and alone | fixed (DIVERGENCE: the canvas created these rows one by one inside `Concurrent` families; the creation order on the server can differ, and a refused create lets the writes already in flight finish, then stops the plan). Switch `PRODUCTION_GENERATION_WAVES` (`rules.ts`), `{ waves: false }` is the old plan |
| Production | A write no longer reloads the session project query: its select list has no yield column and this screen writes only yield columns and the four flags, so it can never change. About six requests and one round trip less in the window where the command bar is off. Milestones and General Data are still marked stale | fixed |
| Production | Tests: UT-PRODPLAN-001…009 (rows identical to the sequential plan for 400 random assumption sets, runs never hold a parent and its child, the real engine sends the same bodies and ids, a refused create stops the plan), UT-PRODHOOK-005, UT-PRODBASE-* (the baseline and the golden master taken before the change) | new (tests) |

## Production: the Save's write group goes out 16 wide (20 Nov 2026, D145, number provisional) — proposed (not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Production | The Save sends its group (seasonality, negative prices, revenue syncs, superseded Internals) 16 at a time instead of 8, as the Generators saves do since D144. The yield still goes first alone. Same writes, same order, same binds. The write rounds are modelled with the real engine and a fixed latency per request (UT-PRODSAVE-010); the pre-read and the roll-up's two rounds are counted from `hooks.ts`, not modelled: a 15-year curve save is 3 write rounds instead of 4 (critical path 7 to 6), a 28-year curve 3 instead of 5 (8 to 6); an edit of the description only, a delete and a status change are unchanged (5; 4 for a delete or status change with no revenue sync). **No real timing exists; the 5x target was NOT achieved** (D145 gives the arithmetic, the cut ideas and the remaining levers) | proposed (DIVERGENCE: the canvas wrote the rows one by one; more are in flight at once, and a throttled request ends a Save part-way as before). Switch `PRODUCTION_WIDE_GROUPS` (`rules.ts`), `{ wide: false }` is the old plan |
| Production | Tests: UT-PRODSAVE-001…005, 010, 011 (rows and binds identical to the 8-wide plan for eleven scenarios, zero / null / negative reductions kept, the real engine sends the same bodies with at most 16 in flight, a refused child reports true counts). The `saveNew` helper of UT-PRODBASE passes `{ wide: false }` so its golden snapshot stays the 8-wide plan | new (tests) |

## Cost: German number audit, the panel boxes open in the user's language (6 Nov 2026, `pm-validation` 4b832e0) — fixed

| Screen | Change | Status |
|---|---|---|
| CAPEX Costs | The month-amount checks read a stored decimal with the user's separator: a German "12.5" no longer flags every decimal % as "Value must be numeric upto one decimal" | fixed |
| Contracts | Every number in the Edit panel (contract figures, margin % / fixed value, payment-target totals) opens with the user's decimal separator (`inputDecimalText`); a stored 7.5 % opened as "7.5", which German read as 75 % in the total | fixed (a wrong-total bug removed) |
| Land Lease | The one-time payments, rates, percentages and inflation profile open in the user's locale (`leaseDecimalText`): an English "65.00" was rejected in German, and a hidden "2.3" was saved as 23 | fixed (a data-corruption bug removed) |
| OPEX | Fix Costs, the EUR rates and the inflation profile open in the user's locale (`opexDecimalText`), and the save reads them in that locale (`opexNumberOrNull`): a German "1234,50" was saved blank and the inflation profile as 0 | fixed (a data-loss bug removed) |

## Revenues: the Balancing Price panel opens as the Canvas (6 Nov 2026, `pm-validation` 4b832e0) — fixed

| Screen | Change | Status |
|---|---|---|
| Revenues | A new balancing period opens with Shift of COD "0" and both duration pickers blank, so the End Date is the day before the Start Date (L3673-3687, L3996-4077, L4185-4197); it opened on "0 Year" / "1 Month" with a blank shift, a month later than the Canvas. A blank picker saves blank, as in the Canvas (L4591-4592). An edited period opens its stored values (`balancingFormFor`). UT-REV-161/162, UT-REV-908 | fixed |

## Cluster Checklist: the information pop-up, the Info notice, and the Only Notifications gate (6 Nov 2026, `pm-validation` 4b832e0) — fixed / new

| Screen | Change | Status |
|---|---|---|
| Cluster Checklist | `cmp_PopUp_CheckList_GeneralData_Information` is the Canvas `cmp_PopUp_Information` (450 × 260, 0.7 scrim, themePrimary header with the ✕, one 90-wide "✓ OK"), the shared `ConfirmDialog` "information" variant; it was a plain Fluent dialog | reproduced |
| Cluster Checklist | The Info notice shows whenever the page is not locked and Next Cluster is disabled, on the last cluster too (`con_…_Buttons_Info.Visible`, S:2026); it also required a next cluster | fixed |
| Cluster Checklist | **NEW (not in the Canvas):** after a gate approval request on an active Only Notifications gate, the loader stays ("Cluster Transition in Progress. Please wait...") and re-reads the trackings every 1.5 s, for up to 30 s, until the gate flow has completed the cluster, so the screen opens on the moved project. The Canvas shows the half-way state and its tooltip asks the user to "wait 30 Seconds and then Refresh the Page" (Y:1972). UT-CHKLST-082 | proposed (not approved) |

## Finance: the page and the panels compared with the Canvas (12 Nov 2026, D109) — fixed / one safer divergence kept

A read of the Canvas YAML against the code (data reads, ~95 page items, ~64 panel opening values, the five Save payloads); everything not listed matched.

| Screen | Change | Status |
|---|---|---|
| Finance, tranche panel | The four month pickers and Frequency of Repayment keep only a listed value (`colMonthsForDuration` 0…11, `colFrequencyInMonths`): an SQL "fixed interest rate time" of 120 now selects nothing with Save off, as the Canvas; the picker looked blank but Save wrote 120 | fixed (a hidden-value save removed) |
| Finance | Duration of Saving (panel, reset icon, card) and the MMYY labels read any length (`"005"` = 5 years), as `Value(Left(v, 2))` / `Value(Right(v, 2))`; "005" opened as 0 / 0 with the zero-duration error and Save off | fixed |
| Finance | Financing Options shows Debt Financing while the column is blank (`Coalesce`, Y:2381) | fixed |
| Finance | VAT Bank Margin shows in the user's language ("1,5" in German / French) | fixed |
| Finance | The six project-scoped reads re-read on every visit, as `OnVisible`; they were kept 30 s, so a change made elsewhere could show stale values | fixed |
| Finance, cards | Blank values show as the Canvas: Decommissioning Total "" (not "0"), year / month parts "", DSRA Type "DSRA" and the bare " Year  Month" duration, Equity "[EUR]" / no loan line for a blank Free Equity choice, the Upfront Fee currency caption and format for a blank option | fixed |
| Finance | The Fabric country re-check ignores case and trailing spaces, as the delegated SQL compare; a differently spelt country dropped every standard | fixed |
| Finance | French / Polish card amounts use one formatter (`textFormat`, D70); the Decommissioning total and the fixed Upfront Fee used Intl grouping | fixed (French grouping still to check live) |
| Finance | The category "Edit …" and DSRA Activate / Deactivate buttons need their row to exist; the Canvas keeps them always enabled | DIVERGENCE (safer, kept) |

## Finance: the Equity, VAT, Decommissioning and DSRA/DSRF panels laid out as the Canvas (12 Nov 2026, D110) — reproduced

| Screen | Change | Status |
|---|---|---|
| Finance panels | The four panels use the Canvas row metrics (`con_GeneralData_RightPanel_*_InpForm`): fixed-height rows, the box at `Parent.Width/2 + X`, year / month pairs 10 apart, the Reload icon 10 right of the box; the boxes ran across the panel and the rows were further apart. The tranche panel's year / month pairs are 10 apart too. UT-FIN-920 | reproduced (sizes need a live look) |

## Finance: Edit panels keep Save off until something changed (12 Nov 2026, D111) — divergence (the user's request) / reproduced

| Screen | Change | Status |
|---|---|---|
| Finance | **NEW (not in the Canvas):** the Equity, VAT-Financing and DSRA/DSRF Edit Saves stay off until the form differs from what it opened with (`formChanged`, values compared, standard flags included); a value typed back turns Save off again. The Canvas `DisplayMode` has no dirty term (Y:7893, Y:8632, Y:16821). Tranche Edit and Decommissioning already had one; Add Tranche is unchanged. UT-FIN-816, UT-FIN-921 | DIVERGENCE (the user's request, 12 Nov 2026) |
| Finance | DSRA/DSRF Edit and Activate / Deactivate keep the Canvas 2-px themePrimary border when hovered, pressed or focused; Fluent's transparent button cleared it | reproduced |

## Locked pages: the disabled radio and the New Project Production bar (12 Nov 2026, D112) — reproduced / divergence

| Screen | Change | Status |
|---|---|---|
| Finance | In New Project mode Financing Options shows Debt Financing, as the Canvas `Coalesce(gblRecordSelectedProject.'Financing Options', 'Debt Financing')` does with no project; it showed nothing chosen. UT-FIN-922/923 | reproduced |
| Finance (and every `.canvas-radio-group`) | A disabled radio draws the Canvas `Radio@0.0.25` look: #e0e0e0 ring, #bdbdbd dot on the chosen option, #bdbdbd captions (the browser's own had a grey filled ring and dark captions) | reproduced |
| Production | In New Project mode the bar shows Add Production WTG / PV, Edit, Delete and Deactivate Production, all disabled, as the Canvas does. The Canvas gets the extra three by selecting a yield that has **no project** (`Filter('Energy Yields', Project.Project = <blank>)`, Y:42); the code app shows them without loading or selecting such a row. UT-PROD-131, UT-PROD-914 | DIVERGENCE (the user's choice, 12 Nov 2026) |

## Revenues: Edit Balancing Price keeps Save off until something changed (12 Nov 2026, D113) — divergence (the user's request)

| Screen | Change | Status |
|---|---|---|
| Revenues | **NEW (not in the Canvas):** editing a balancing period, Save stays off until the form differs from what it opened with; a value typed back turns it off again. The Canvas Save (`pcf_…_Save_2.DisplayMode`, Y:4498) has no dirty term. Add Balancing Price is unchanged; the contract panel already had the Canvas dirty flag (`locRevenueContractFormDirty`). UT-REV-917 | DIVERGENCE (the user's request, 12 Nov 2026) |
| Revenues, Finance | `formChanged` is one shared helper (`@/domain/formChanged`), moved from Finance, which re-exports it | new (reuse) |

## Project overview: the selected project can be deselected (12 Nov 2026, D114) — reproduced

| Screen | Change | Status |
|---|---|---|
| Project overview | The grid's check circle toggles the row, as the PowerCAT Fluent DetailsList with `SelectionAlwaysVisible` (Project Main Screen Y:1759): clicking the selected row's circle (or Space on it, or Ctrl / Cmd + click on the row) deselects it, and Edit Project, Edit Costs and Delete Project turn off again. The native radio could move the selection but never clear it. UT-OVUI-048 | reproduced |

## Generators: faster saves, parallel deletes and rollback of a failed create (16 Nov 2026, D115) — fixed (status toggle) / proposed (not approved)

Implemented and merged on `integration/generators-bulk`, not product-approved, not run against DEV. Every bulk and rollback path is behind a flag in `data/generatorsBulkFlags.ts` that is `false` until its DEV check has passed (`GENERATORS-BULK-DEV-TEST-PLAN.md`). The analysis and plan are `GENERATORS-BULK-DATAVERSE-ANALYSIS-AND-PLAN.md` and `GENERATORS-BULK-IMPLEMENTATION-PLAN.md`. The Canvas patches every row one after another and leaves a partly-saved type behind; the entries below say where the code app differs. Step counts are asserted in tests and request counts are computed from the transport's chunking, not timed live.

| Screen | Change | Status |
|---|---|---|
| Generators | **Activate / Deactivate:** the turbine `statecode` updates are one parallel group (8 in flight) instead of N one after another; the type update stays first and the project roll-up last. For a 10-turbine type that is the same 12 requests in 3 awaited steps instead of 12 (computed). Payloads, messages and ids unchanged; no flag. UT-GEN-123 (D115) | fixed (DIVERGENCE: a failure among the turbine updates lets the others finish) |
| Generators | **Tiered parallel deletes:** leaf rows (allocations, O&M costs, units, bridge rows, turbines deleted one by one) up to 16 at once, cascading deletes (land-lease costs, types) up to 4, children before parents. A single bridge, unit or type delete stays a plain step. In Replace the old-allocation deletes run as their own leaf group after the creates settle, and the O&M detach (8 in flight) still precedes every bridge delete. No flag; the timed DEV test sets the final numbers (D115 §2 item 3). UT-GEN-200...209; UT-GEN-127 and UT-GEN-138 changed shape | proposed (not approved) (DIVERGENCE: parallel deletes, delete order in Replace) |
| Generators | **Bulk allocation creates:** the N × L land-lease allocation rows of Add type, Add turbine, Add PV type and the Replace follow-ups become one `createMany` step of N × L rows instead of N × L single creates; the transport cuts it into HTTP requests (under 20 rows one, from 20 rows chunks of 10 to 500, at most 8 in parallel: 30 rows are 3 requests). Flag `allocations`. UT-GEN-210...220 | proposed (not approved) |
| Generators | **Bulk turbine creates:** Add type with N turbines is 3 steps (type create, one `createMany` of N rows with pre-generated ids, roll-up) instead of N + 2 writes; the type stays a single create. With the flag on the device-type row is no longer wrapped in a group. Flag `turbines`; stays off unless the polymorphic bind passes its DEV probe. UT-GEN-240...247 | proposed (not approved) |
| Generators | **Bulk status and apply-to-all updates:** the status toggle is 3 steps (type update, one `updateMany` of the N turbines, roll-up) instead of N + 2 writes; apply to all is 4 steps (turbine, one `updateMany` of the siblings, type totals, roll-up) instead of S + 3. The turbine edit itself is not part of the bulk; sibling rows keep today's payload, including the owning-business-unit bind. Flags `status`, `applyAll`. UT-GEN-230...239 | proposed (not approved) |
| Generators | **Bulk Replace Generator / PV:** the new turbines, allocations and re-links composed from the bulk steps; the old rows are still deleted and recreated as in the Canvas (single delete requests), as their own leaf group after the creates settle. Flag `replace`. UT-GEN-250...263 | proposed (not approved) (DIVERGENCE: delete order) |
| Generators | **Guarded bulk updates:** before an `UpdateMultiple` chunk (and its per-row fallback) the ids are read; if one is gone, nothing is sent and the user is told to reload, so a row another user deleted is never re-created. The Canvas patches without the check. `data/generatorsBulk.ts`; UT-GENBULK-* | proposed (not approved) |
| Generators | **Roll back a failed create save:** if Add WTG type fails part-way (scenario A) or an out-of-country type's Request Module Permission flow fails to start (B), the rows that landed are deleted (allocations, bridge row, turbines, type) with the progress text "Undoing the failed save, please wait..." and, in country, the project roll-up is recomputed from the remaining types. The error bar shows the original reason plus the undone text. If the cleanup fails, the message lists exactly what is left and a **Retry cleanup** button (`generators-retry-cleanup`) deletes only the recorded rows, with no automatic retries. Not for apply-to-all, a new turbine, a PV type or the simple types, and not possible for Replace. The Canvas leaves the partly-saved type. Flag `createRollback`. UT-GEN-170...186, UT-GEN-930...941. Known limits: after a failed rollback every recorded row is listed as left over even if some deletes landed (Retry is safe, a 404 counts as gone); the failed rollback's own error text is hidden behind the leftover message | proposed (not approved) (DIVERGENCE) |
| Generators | **Fail-closed bulk builder:** a bulk target without `owningbusinessunit@odata.bind`, with an empty or repeated id, or with a reserved key (`@odata.type`, `@odata.id`, the primary key) is refused before anything is sent (CONVENTIONS rule 4: omitting the bind never errors and the row becomes invisible to a colleague). UT-GENBULK-* | new (safety guard, proposed (not approved)) |
| Generators | **Writes land per chunk; failures count rows:** with a bulk flag on, "N of M changes had already been saved" counts rows, not requests; a chunk lands whole or not at all and parallel chunks can land partly. A 501 on an action's first chunk falls back to row-by-row writes for that action (kept per tab); a 429, or a 503 with `Retry-After`, is retried up to three tries in all after the header's wait. D115 | proposed (not approved) (DIVERGENCE) |
| Generators | Every bulk request prints one `[VSB] DATA create|update <entity set>` line with rows and milliseconds (no values, no ids); a rollback and its Retry cleanup print their delete lines (CONVENTIONS rule 23). UT-GENBULK-* | new (traceability) |
| Generators | **Hardened deletes (D116):** every Generators delete is retried up to 3 tries on 429, 503 with `Retry-After`, 500, 504 and network errors (never on 400, 401, 403, 404, 409), counts only HTTP 404 or code `0x80040217` as "already gone" (the free text "does not exist" no longer does), and reads every row that answered "gone" back (one read per 40 ids); a row still present, or a read that fails, stops the plan (`DeleteNotConfirmedError`, counts only). Types, PV types, land-lease costs, units and the inverter, substructure, BESS, hydrogen and substation rows are also read back after a successful delete when `verifyDeletes` is on (off). The canvas sends one request and treats a 404 as done. Live for every Generators delete, no flag. UT-RETRY-002..015, UT-PLAN-911..947 | proposed (not approved) (DIVERGENCE: retry, strict gone, read-back; not run against DEV) |
| Generators | **O&M clean-up for every bridge row (D116):** a type delete, a PV delete and Replace delete or re-link the O&M costs of all the type's bridge rows and their chain members, in any status. The canvas reads the first bridge row only, so a second bridge's costs survived as "Other OPEX"; the delete guard now checks every active bridge row. UT-GENDATA-OPEX-001..023 | proposed (not approved) (DIVERGENCE) |
| Generators | **Failed delete says what was removed (D116):** after a delete job fails part-way the error bar adds `Removed: ... Not removed: ... Press Delete again to finish.`, counted per family from the plan and the rows the engine reports as deleted. The canvas shows one error. New text (`DELETE_PARTIAL_MSG`). UT-GEN-1110..1153 | proposed (not approved) (DIVERGENCE: new text) |
| Generators | **Truthful rollback leftovers (D116):** a failed rollback names only the rows really left (its own deletes subtracted), also undoes rows that may have landed (`maybeLanded`), shows its own error and keeps **Retry cleanup** on the reduced list. D115 listed every recorded row. Needs `createRollback` (off). UT-GEN-1100..1109, UT-GEN-953..998 | proposed (not approved) |
| Generators | **Allocation deletes ordered by land-lease cost (D116, flag `parentOrder`, off):** deletes that share a cost run one after another and other costs in parallel (`serialKey`, `createSerialRunner`). O&M head and period ordering is not built. UT-CONC-020..024, UT-GEN-953..998 | proposed (not approved) (off until a timed DEV test) |
| Generators | **Tier switch (D116, flag `tieredDeletes`, `true`):** the D115 tiers (leaf 16, cascade 4) stay live; `false` restores one group at limit 8, so the old shape is switchable and tested. UT-DELFLAG-001..003 | new (safety switch; tiers proposed (not approved)) |
| Generators | **Guarded updates (D116, flag `guardedUpdates`, off):** the type totals of the turbine save and delete, the type status update, apply-to-all (single-request path) and the O&M re-links of the Replace follow-ups read the row first and refuse when it is gone, so a stale save never re-creates a row another user deleted (a PATCH without `If-Match` is an upsert). The canvas patches without the check. UT-GEN-953..998 | proposed (not approved) (off until its DEV check) |
| Generators | **Orphan report and guarded clean-up (D116):** `npm run orphans:generators` lists allocations with no turbine, O&M costs with no bridge, second bridges and the other orphan classes, read-only by default (counts on the console, ids in a local CSV). `--apply` deletes only a reviewed manifest of one class (not B4, B8), writes a JSON backup first, deletes 4 at a time and reads every id back. The canvas has no such tool. UT-ORPH-001..043 | new (tool, proposed (not approved); filters never run against DEV) |
| Generators | Every delete retry prints one `[VSB] ACTION <entity set>: delete try N of 3 failed (...); trying again in T ms` warning (no ids, no values); the read-back prints its own read line (CONVENTIONS rule 23). UT-RETRY-*, UT-PLAN-922..947 | new (traceability) |

**D116 not built:** the create-first Replace saga (DEL-6), the version check (DEL-7(b)), the server-side options (DEL-9), O&M head and period ordering, the rollback's allocation ordering by parent, and a roll-up-only retry. Nothing of D116 has run against DEV (`GENERATORS-DELETE-DEV-TEST-PLAN.md`).

**Kept as is:** in `planSaveTurbine` and the PV follow-up the allocations come after the roll-up (the canvas order, kept on purpose), so the roll-up is not the last write in those two plans. The type create stays a single request (its autonumber name feeds the device-type row), as do the roll-ups, the device-type bridge create, the flow calls and every single-row save; Replace keeps delete-and-recreate (no repointing).

## Start-up of the Project Overview and Project General Data (17 Nov 2026, D119) — new (not approved, not measured on DEV)

The canvas ran about 40 sequential statements in `App.OnStart` before the first screen. The code app already ran them in parallel (`SessionContext`); this pass shortens what was left.

| Item | What | Status |
|---|---|---|
| First paint no longer waits for the environment variables | The shell and the first screen open when the session is known; the header labels fill in a moment later | **new**, behind `envVarsBlockFirstPaint` |
| The first screen's chunk and reads start from the URL | Project list: page 1 and the two filter lists. General Data (also from Edit Project): the project row, lists, shareholders, state trackings, the country's areas and utilizations | **new**, behind `bootPrefetch` |
| The user's role lookups | Five dependent round trips down to three; only the five roles the badge reads are requested (106 down to a handful of rows in DEV) | **new**, behind `parallelUserLookups`; the badge, the admin gate and the country scope are unchanged (UT-CU-105) |
| The next project page is fetched 1.5 s after the page is on screen | The start-up reads no longer share the line with a 540 kB page the user may never open | **new**, behind `nextPagePrefetchDelayMs`; the pager's arithmetic and the blank-tail probe are untouched (UT-PROJPAGE-*, UT-OVUI-042..045) |
| Application Insights loads on demand | About 270 kB less decoded JavaScript (95 kB less gzip) before the first screen | **new** (no switch; revert to roll back) |
| Gate | `*.har` is git-ignored (a browser capture holds request headers) | **new** |

## Contracts screen: failed saves, loading, deleted rows, panels and smaller fixes (17 Nov 2026, D120) — fixed / new (not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Contracts | A save that fails after the contract was written no longer leaves the list stale or creates a duplicate on retry; the panel reopens with the typed input (the canvas closes and resets it) | **fixed** (DIVERGENCE) |
| Contracts | DevCo links: only the difference is written (an unchanged selection is one read, a +2/-1 edit is 4 requests, before 1 + D + C), deletes tolerate "already gone" | **new** (improvement over the canvas `RemoveIf` + `Patch`) |
| Contracts | A link to an account the picker cannot show (inactive) survives a save | **new** (DIVERGENCE, safer than the canvas) |
| Contracts | Add and Edit wait for the cost rows, DevCo contracts, links and targets; a form can no longer save zero totals or an Edit delete the links before they loaded | **fixed** (a canvas-style gate on every collection) |
| Contracts | A failed secondary read shows a banner; a failed background refresh keeps the screen and an open panel | **new** (rule 19) |
| Contracts | Editing a contract or payment target another user deleted reports "gone" instead of re-creating it | **fixed** (a canvas-equivalent upsert risk removed; not tested on DEV) |
| Contracts | The three panels ignore an outside click, as the canvas overlays | **fixed** (parity) |
| Contracts | The screen resets when the project changes | **new** |
| Contracts | The margin seed runs once per panel and never over a typed margin; both assumptions are preloaded as in the canvas | **fixed** |
| Contracts | A failed delete says "could not be deleted correctly" (the canvas shows nothing) | **new** (NEW TEXT) |
| Contracts | "Total cost of contract" hidden for a Fixed Value margin, Payment Date right-aligned, number grouping in es / it / pl / pt-PT | **fixed** (parity) |
| Contracts | Cost sums cannot overflow on very large projects; the standard-assumption pick is deterministic; a create without an owning business unit is traced | **new** |
| Contracts | Comment-only DIVERGENCE tags (LD-11, 12, 14, 15, 16) and strings moved into `MSG` | **new** (traceability) |
| Contracts | The standard-assumption lookup is not cleared on Edit as the canvas does (WR-3); the card date locale, Payment Description gating, test-id names and raw error text were left | **proposed (not approved)**, see D120 §7 |
| Contracts | Payment targets, DevCo links, DevCo CAPEX contracts and CAPEX cost rows keep `statecode eq 0` (the canvas has no state filter) | **proposed (not approved)**, joins D101 |
## Generators screen: O&M guard, failed second saves, loading, double saves, text length and smaller fixes (17 Nov 2026, D121) — fixed / new (not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Generators | Delete Generator Type, Deactivate and Delete PV wait for the O&M check; a failed check keeps them off and shows a banner (the earlier build let the delete through and removed the O&M costs) | **fixed** (a canvas-style synchronous guard restored) |
| Generators | A failure of the second save step says the type and rows were saved, so it is not added twice | **new** (NEW TEXT) |
| Generators | The turbine and model data are kept while the type set reloads, and Save, Replace and the commands wait while data settles; a turbine, PV or type save no longer writes cost 0 or repeats names before the index and device costs have loaded | **new** |
| Generators | A failed background refresh keeps the screen and an open panel and shows a banner | **new** (rule 19, as Contracts) |
| Generators | A second Save, Replace or delete confirm is refused while a write runs; the progress spinner sits above the drawer | **new** |
| Generators | PV label and Other Supplier, and the BESS, Hydrogen and Substation name and supplier, stop at 100 characters (Dataverse), so Replace PV can no longer delete the old type and then fail | **fixed** (DIVERGENCE: the canvas allowed more) |
| Generators | A project without an owning business unit refuses create plans instead of creating rows other business units cannot see | **new** (fail-closed, rule 4) |
| Generators | Degradation 1st Year opens with the stored value; the AllWTG back-fill also runs when an edit creates the missing PV unit; the pager counts the loaded turbines; Total Height shows 130.4; the screen resets on a project change | **fixed / new** |
| Generators | The data loaders, the write hooks and the real `usePlanWrite` run in tests; permission chip labels and delete texts are pinned | **new** (test gate) |
| Generators | A type left without its O&M row, refusing saves when the index or model is missing, the out-of-country Replace rollback and roll-up, the approval cancel for an Approved type, live reads at write time, retries and the UI parity items | **proposed (not approved)**, see D121 §7 |

## Application Insights in QA: console diagnostics and a recoverable start-up (17 Nov 2026, D122) — new (not approved, not run on QA)

The canvas apps had no Application Insights (`appinsightserrortracing: false`), so this is an improvement over the code app's own first build, not over a canvas rule.

| Item | What | Status |
|---|---|---|
| Console shows the connection string in use | The complete value, the host it sends to, the app id and the exact Content Security Policy entry to allow, as `[VSB] ACTION Application Insights …` lines (console only, never sent as telemetry) | **new** |
| Telemetry off is explained | Empty variable, failed read (with root cause), SDK not starting, SDK chunk blocked, malformed value: each prints its reason | **new** |
| Delivery is reported | `SENT (not confirmed)` for the first batch handed to the browser; `FAILED (status N)` with the meaning; `BLOCKED by the Content Security Policy` from the browser's own violation event; the SDK's warnings and errors in the console | **new** |
| A failed read no longer switches telemetry off for the page's life | A later successful read of the environment variables starts it | **fixed** |
| Tests | `UT-AIDIAG-001…019` | **new** |
| One host to allow, not two (D122 addendum) | The SDK no longer downloads its config from `js.monitor.azure.com`; a Content Security Policy needs only the ingestion host | **new** |
| Quiet console in the player (D122 addendum) | The SDK no longer registers the `unload` event the player forbids (about ten Permissions-Policy violations per load) | **fixed** |
| The "sent" line no longer claims delivery (D122 addendum) | `SENT (not confirmed)` replaces `OK … telemetry is flowing`, which printed for items the browser then blocked | **fixed** |
| Tests | `UT-AISDK-001…003` (the real SDK, network stubbed), `UT-AIDIAG-020` | **new** |

## OPEX: 11 functional differences fixed to match the Canvas (17 Nov 2026, D123) — fixed

| Screen | Change | Status |
|---|---|---|
| O&M, Other OPEX panel | Escape and a click on the dark backdrop no longer close the Add/Edit panel and throw away the form; only ✕ and Cancel close it, as on the Canvas (`FormPanel keepOpenOnEscape`, new and opt-in). UT-SETPANEL-025, UT-OPEXUI-055 | fixed (a data-loss bug removed) |
| O&M, Other OPEX | After Add Contract Type / Add Period and Cancel, no row stays selected, so the commands follow the "nothing selected" rules and one click selects a row again; the row used to stay selected with every command off. UT-OPEX-135, UT-OPEXUI-056 | fixed |
| O&M, Other OPEX panel | Inflation Start Year follows a Start Date moved to another year on a new cost type (and on a row with no stored year), so the year and the country % saved are right. UT-OPEX-136, UT-OPEXUI-057 | fixed (wrong saved values removed) |
| O&M, Other OPEX panel | Italian projects: the hidden Area is always the project's zone, as the Canvas; an Edit no longer keeps an old stored area the user cannot see. UT-OPEXUI-061 | fixed |
| O&M panel | Switching the threshold option back to Individual shows the stored figure again instead of an empty box. UT-OPEXUI-058 | fixed |
| O&M, Other OPEX panel | A stored Custom Inflation of 0.0 % opens as "0.0", so Save is not off for no visible reason; the grid cell still shows it empty (O-9). UT-OPEX-138, UT-OPEXUI-059 | fixed |
| O&M, Other OPEX | A blank Duration or Distribution Frequency shows an empty cell, not "0 years 0 months" / "1" (`CostPeriod` keeps the blank). UT-BOOK-077, UT-OPEXUI-060 | fixed |
| O&M | The Individual Threshold cell uses the user's language, like the other grid cells (the last en-GB cell). UT-OPEX-137 | fixed |
| O&M, Other OPEX | The costs and the O&M device cards are re-read on every visit, as `OnVisible`; a second visit shows the cached rows at once with no loader and refreshes them behind. Add Standard Contract also refreshes the device cards. UT-OPEXLOAD-001…004 | fixed (stale data removed) |
| O&M, Other OPEX | Every Save re-binds the owning business unit to the project's, as the Canvas Patch; it was set on create only. UT-PWRITE-049 | fixed |

## Contracts: the opened DevCo account rows laid out as the Canvas (17 Nov 2026, D124) — reproduced

| Screen | Change | Status |
|---|---|---|
| Contracts, Add / Edit Development Contract | The opened account's rows use the Canvas layout: the list inset 10 px, names at X 40 in 8 pt (no longer cut off), the 120-wide 8 pt total right after them, and the checkbox column under the header's checkbox, also while the list scrolls (a reserved 10 px canvas scrollbar). UT-CONCHECK-004, UT-CONCHECK-006 | reproduced |
| Contracts, Add / Edit Development Contract | A leaf another contract uses shows the Canvas orange square over its checked box, with the "Used in contract" tooltip, and its caption is no longer greyed. UT-CONPANEL-012 | reproduced |
| Contracts, Add / Edit Development Contract | An account with no DevCo cost row shows "-", as the Canvas `Coalesce(Text(Sum(…)), "-")`; it showed "0". UT-CONTR-009, UT-CONPANEL-011 | fixed |

## Cluster Checklist screen: approvals and gates before actions, failed refreshes, quiet visits, stale clicks, accessibility (17 Nov 2026, D127) — fixed / new (not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Cluster Checklist | Complete and In Progress wait for the approval settings; a task that needs approval can no longer be completed directly while they load or after they fail; a failed read shows a banner | **fixed** (the canvas read the approval row live per row) |
| Cluster Checklist | Move, Save, Reset and the stepper wait for the gates and the first load; a loader replaces the false "not available for this technology" tip | **new** |
| Cluster Checklist | A failed Entra lookup only loses the mail in the tooltip, not the approval mode or the gates | **new** |
| Cluster Checklist | A failed refresh keeps the screen and an open panel (banner); the error page has a Refresh button; a failed history read is shown | **new** (rule 19, as Contracts and Generators) |
| Cluster Checklist | Opening a cluster creates its tasks in parallel, skips the write job when there is nothing to write, and no longer reloads the states, gates and Entra lookups | **new** (improvement over the earlier build and the canvas) |
| Cluster Checklist | Guarded updates: a task or tracking an admin deleted is reported as gone instead of re-created without a business unit | **fixed** (also a canvas upsert risk) |
| Cluster Checklist | Save, Reset and Request Approval refuse a stale click; the cancel flow is refused before any change when the app id is blank | **new** |
| Cluster Checklist | The progress text no longer says "successfully" while saving; the panel ✕ says "Cancel" instead of "Home"; notes keep up to their column length; dates use the user's language | **fixed** (SOURCE DEFECT for the "Home" hint) |
| Cluster Checklist | Keyboard focus moves with the date editor, focus rings are back, stepper cards and row buttons describe state and task to screen readers, the busy overlay has a name | **new** (no existing label or test id changed) |
| Cluster Checklist | Real-function tests for the loaders, hooks and screen writes | **new** (test gate) |
| Cluster Checklist | A resume step after a failed Move, re-creating missing tasks, the order of the cancel patch and flow, contrast colours, the cross-screen cache refresh | **proposed (not approved)**, see D127 §10 |

## Milestones: one date style for all date boxes (18 Nov 2026, D128) — fixed (SOURCE DEFECT, not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Milestones | Project Start and Cluster 3 no longer show the long date ("Thursday, May 10, 2018"); all eleven date boxes show "Thu, May 10, 2018", as the canvas shows the other nine. The canvas mixes the two styles because it uses two different picker controls without a `Format` | **fixed** (DIVERGENCE, twin `milestoneDateFormatCanvasParity`) |
| General Data | The Acquisition Date and the cluster-change panel date keep the long date, as the canvas | **proposed (not approved)**, see D128 §3 |

## Project Overview: parity pass, bucket A (18 Nov 2026, D132) — fixed / new, one divergence proposed (not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Project Overview | The column headings that can be sorted (Project Name, Short Name, Technology, Capacity, Project ID, Approval) are focusable buttons: Tab, then Enter or Space sorts, and the heading announces its sort state (`aria-sort`, "none" until sorted). The canvas Fluent DetailsList exposes sortable headings as focusable buttons; the first code-app build only reacted to a mouse click (PO-003). UT-OVFIX-001..006 | **fixed** |
| Project Overview | Tosca hooks: the grid, the seven filter captions, the capacity error message, the command-bar container and the first-load spinner now carry the canvas control names (`psf_MainScreen_DetailList_Container_FluentDetailsList`, `lbl_Main_Project_Overview_Context_Filter_*`, `..._Capacity_ErrorMessage`, `con_Main_Project_Overview_Header_SuitBar_CommandBar`, `cmp_MS_Spinner`) as `data-testid`; the six funnel ids are now written as literals in the screen (they were a computed map) (PO-012a, PO-013). No existing id was changed. UT-OVFIX-010..012, 018 | **fixed** (rule 16) |
| Project Overview | Three canvas hover texts that were missing are shown: the Project caption ("Search (Project name, Short Name, ID)"), the Project Manager box ("Search for project manager") and the grid ("Project overview list") (PO-014). The command-bar text "Home screen navigation" is NOT reproduced: the same string sits on the Revenues grid, a canvas copy-paste. The logo text belongs to the shared header. UT-OVFIX-013..016, 019 | **fixed** / **SOURCE DEFECT** (one text deliberately omitted) |
| Project Overview | Croatian projects: View Sharepoint Site and View Teams now come before Dashboard, as in the canvas `Items` order (PO-015). UT-OVFIX-020, 021 | **fixed** |
| Project Overview | A row's selection circle is named by the project's name cell instead of an `aria-label` built from the name (no bound data in a label) (PO-029). UT-OVFIX-017 | **improvement** |
| Project Overview | SharePoint, Teams and the report link open only when the stored address is http(s); anything else (for example `javascript:`) shows the existing "could not be opened" message and opens nothing (PO-027, R-9). The canvas `Launch()` took any text. UT-OVFIX-080..083 | **fixed** (improvement over the canvas) |
| Project Overview, Simulate | A failed read of the Base cases or of the cluster-state order now says so ("Could not check this project for simulation. ...") instead of "Base data missing" or "only Wind/PV in Clusters 1 to 5"; the click waits for the cluster order instead of reading a stale value; a double click opens one tab; the check is traced as ACTION `simulate project` with its `check base case` read (PO-006, PO-017). The canvas lookups could not fail visibly. UT-OVFIX-040..046 | **fixed** |
| Project Overview | A Project Manager filter that arrives through the address (reload, shared link, a Back step) is shown as a chip with its name and its clear button; before, the list was filtered by a person nobody could see or clear. The name is looked up in `systemusers` (one row, traced as a DATA read); a person picked from the suggestions needs no lookup; a failed or empty lookup shows "Selected project manager" (PO-001). The canvas keeps the picker state for the session only; the code app keeps filters in the address. UT-OVFIX-030..036 | **fixed** |
| Project Overview | A failed read of the Country, Area, Status or Project Manager list shows a message ("The country list could not be loaded. ..."), with Retry for the first three, instead of an empty list (PO-031, CONVENTIONS rule 19). The canvas shows nothing either. UT-OVFIX-070..075 | **fixed** (improvement) |
| Project Overview, Capacity | A capacity that is not a number leaves the list as last filtered, with the red message, as the canvas does (the first build showed every project under the red message); typing is debounced like the keyword (300 ms), so "125.5" is one request, not one per key; a malformed `?cap=` link prefetches under the key the screen reads (PO-007, PO-025). An emptied box clears the filter after the debounce; the canvas leaves a blank box alone until the funnel is pressed (kept as before). UT-OVFIX-050..056, 059..063 | **fixed** / improvement |
| Project Overview | Changing the Country clears the Area filter at once; the canvas keeps a stale Area from the other country until the Country funnel is pressed (Country `OnChange` sets only Country, `Project Main Screen.pa.yaml` 1138-1144) (PO-022). Marked `DIVERGENCE:` in `rules.ts` (`applyFilterPatch`); revert by dropping the `areaId = null` line. UT-OV-021..023 | **proposed (not approved)** |
| Project Overview (tests) | The five duplicate test ids in the two Project Overview suites are renumbered (UT-OV-099, UT-OV-100, UT-OVUI-063..065) and a test (UT-OVFIX-100) fails on any repeated id in those two files (PO-030, D41 14b) | **new test** |

## Project General Data and the canvas-identity gate: parity pass, bucket A (18 Nov 2026, D133, D134) — fixed / new, one divergence proposed (not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| General Data | The Custom Shareholder Entity counter counts `Len(Trim(text))` as the canvas does (A:6504); every other counter stays plain `Len` (GD-010) | **fixed** (D133) |
| General Data | The Manager and Terrain Size error labels are 12 px, as the canvas (`Size: =9`, A:2095, A:3992); the other body error labels stay 10.67 px (GD-012) | **fixed** (D133) |
| General Data | The Start-Cluster change panel is 400 px wide, as the canvas (A:6990), not the 450 px preset (GD-014) | **fixed** (D133) |
| General Data | The Start-Cluster change explanation sits in the canvas info box (fill `RGBA(204,226,241,0.75)`, radius 3, information icon, 12 px semibold text; A:7271-7332) (GD-015) | **fixed** (D133) |
| General Data | The delete, location and leave pop-ups carry the PM component's control names (`ico_PopUpConfirmation_BodyHeader`, `pcf_PopUpConfirmation_BodyButtons_Confirm`, `pcf_PopUpConfirmation_BodyButtons_Cancel`) instead of the Project Costs / generic ids (GD-016) | **fixed** (D133) |
| General Data | The shareholding panel's close button carries the canvas CommandBar identity `con_GeneralData_RightPanel_ShareholdingEntity_CommandBar-closeKey` instead of `panel-close` (GD-017) | **fixed** (D133) |
| General Data | The map area is a named region (`role="region"`) for screen readers; the canvas had no equivalent (GD-025) | **new** (D133) |
| General Data | Validation (`fieldErrors`) runs once per render, not three times; same results (GD-022) | **new** (D133) |
| General Data | The Manager and Deputy search waits for a 250 ms pause in typing instead of querying on every keystroke; the first suggestions appear up to 250 ms later, the final list is the same (the canvas PCF searches per call) (GD-024) | **new** (D133) |
| General Data | DIVERGENCE: the map-click confirmation compares the click with the TYPED Latitude / Longitude; the canvas compares with the last confirmed or saved position (`locChangedLatitude`, A:4412, A:8773, A:8778). Only differs when a new coordinate is typed and then the project's original point is clicked: the canvas shows no dialog, this app shows one (GD-008) | **proposed (not approved)** (D133) |
| General Data | Direct tests for 27 `rules.ts` exports that no test named, and a unique id for the second `UT-GDATA-083` (GD-026, GD-027) | **new** (D133) |
| Cross-cutting (tests and tooling) | The canvas-identity gate can compare against another canvas tree (`--msapp <dir>`), and a new drift tool (`npm run check:canvas:drift -- <liveDir>`) reports renamed or removed controls, changed `AccessibleLabel`s, changed control versions and changed live formulas between the on-disk copy and a freshly downloaded live app (GD-004) | **new** (D134) |
| Cross-cutting (tests and tooling) | `ConfirmDialog`, `UnsavedChangesGuard` take an optional `testIds` (default ids unchanged) and `PeoplePicker` an optional `errorClassName` (default markup unchanged) | **new** (D133) |

## Revenues: faster contract Save, a lighter reload and cheaper loads (19 Nov 2026, D136) — fixed (divergence proposed, not approved)

| Screen | Change | Status |
|---|---|---|
| Revenues | A contract Save sends its stored-volume deletes as one concurrent group (16 at a time) and its new volumes as another (8 at a time), the contract write first and every delete before the first create, as the Canvas orders them. Edit with 12 stored and 12 new volumes: 25 requests in 25 round trips before, 25 in 4 after; 36 and 36: 73 in 73 before, 73 in 9 after (counted with a mock SDK at a fixed 10 ms per request, not timed on DEV). The same rows, ids and payloads, owner bind included. UT-REVPERF-001…023 | fixed (DIVERGENCE: when one row of a group fails, the other rows of that group still run, then the Save stops; before, the rows after the failed one were never sent. Switch `REVENUE_PERF.parallelVolumeWrites`, off = the old sequential plan) |
| Revenues | After a Save or Delete the screen no longer waits for the project, the project states and the energy-yield check to reload (about five parallel reads); the screen writes none of them. A contract write reloads the contracts and volumes, a balancing write reloads the balancing prices (still reloaded: the "Balancing-price period date sync" plugin computes the dates on the server). The Canvas reloads nothing after a Save. UT-REVPERF-030…034, 080…083 | fixed (less server load; the wait is the slowest read, so little wall time) |
| Revenues | The project load takes the project states from the cache General Data shares (30 minutes) instead of reading the whole table again on every load, every reload and every window focus: one request instead of two | fixed |
| Revenues | The contract currency is read after the project is known and filtered on its ISO code. Before: the whole currencies table was read for the "EUR" default first and read again for a Polish project's "PLN". The Milestones screen's lookup is unchanged. UT-REVPERF-040…044, 070…072 | fixed |
| Revenues | A keystroke in the contract or balancing panel no longer rebuilds every contract card (10–16 read-only boxes per card, about 150 inputs with 10 contracts). The card's field grid is a memoized component with the same markup, `aria-label`s and test ids. UT-REVPERF-084…086 | fixed (render cost not measured) |
| Revenues | Tests that run the contract Save through the real plan engine against a recording mock SDK, with the sequential plan as the oracle (24-case equivalence matrix, failure at step k, ordering, owner bind, refusals), and that pin what each write reloads | new (tests) |

## Revenues: a wider volume create group, the Save's two reads side by side, no per-row re-render of the volume gallery (20 Nov 2026, D146) — fixed (divergence proposed, not approved, not run on DEV)

Numbers are MOCK-MODEL (a fixed virtual 10 ms per request through the real plan engine) or LOCAL-MOCK (jsdom, relative only). Nothing was timed against Dataverse and nothing was seen in a browser. The 5x target was not reached (D146 explains why: the screen was already optimized in D136 and what remains is a chain of awaited round trips that protect data integrity).

| Screen | Change | Status |
|---|---|---|
| Revenues | A contract Save sends its NEW individual hedge volumes 16 at a time instead of 8 (the stored-volume deletes were already 16). Same rows, ids, payloads, owner bind and order (contract, every delete, then the creates). Write round trips: New contract with 12 volumes 3 to 2; Edit with 12 stored and 12 new 4 to 3; 36 and 36 9 to 7; the request counts stay 13 / 25 / 73. UT-REVPERF-100…108 | fixed (DIVERGENCE: 16 in flight instead of 8, so lock contention on the parent contract and throttling pressure are higher, not measured; the failure semantics of D136 are unchanged. Switch `REVENUE_PERF.wideCreateGroup`, off = the D136 plan) |
| Revenues | Saving an edited contract of a percentage hedge type starts the read of its stored volume ids beside the hedge check's overlap read, not after it: one serial read less (LOCAL-MOCK, two 60 ms reads: click to plan ready 134–176 ms before, 77 ms after). The read is still a fresh server read, never the cache. UT-REVPERF-121, 125, 126 | fixed (DIVERGENCE (timing): the ids are read about one round trip earlier, so a volume another user added to the same contract in that moment would be missed; a Save blocked by the over-100 % message now also sends one id read whose answer is dropped) |
| Revenues | A keystroke in an Individual-volume box re-renders only that row. Before, every row of the gallery (two Fluent fields each, up to about 74 for a 37-year term) re-rendered: 30 `volumeRowLabel` calls per keystroke for a 30-year contract before, 1 after; commit time of the keystroke in jsdom 52.8–61.7 ms before, 30.5 ms after (relative only; a real browser was not measured). The rows are a memoized `VolumeRow` with a stable functional setter, the same markup, `aria-label`s and test ids. UT-REVPERF-120, 122…124 | fixed (render cost in a real browser not measured) |
| Revenues | Tests that run the contract Save through the real plan engine and a screen with mocked reads: a 48-case equivalence against the D136 plan, the plan shape and limit markers, the order and binds on the wire, the failure semantics at 16 wide, the rollback, a project without a business unit, the default plan with no override, the typed volume values reaching the creates, a failed early id read (no write, no unhandled rejection), a blocked hedge check (no write). Mutation-checked | new (tests) |

## Finance: fewer requests on every visit, reload and save (19 Nov 2026, D137) — new / divergences (not approved, not run on DEV)

Implemented in the worktree `optimize-finance-perf`, uncommitted until approved. Every change is behind a switch in `data/financeFlags.ts` (`FINANCE_PERF_ALL_OFF` gives today's requests exactly) and keeps the rows, columns, binds and write order of the business rules; `rules.ts` is unchanged. The numbers below are MODELLED (a fixed fake latency over the real hooks, reads and write engine: `financePerf.bench.test.ts`), not DEV timings. The Canvas itself runs these writes concurrently (`Concurrent` in `OnVisible` Y:100, the tranche Delete Y:8981-9000, the tranche Save Y:13850).

| Screen | Change | Status |
|---|---|---|
| Finance | **A visit reads 9 requests in 3 serial steps instead of 15 in 5:** the inputs no longer wait for the categories (each row's `Order` is attached when both are in), the CAPEX cost chunks are read together, and the project-state list is cached like the other reference reads. Switch `parallelReads`. UT-FINPERF-001, 160 | new (same rows) |
| Finance | **DIVERGENCE (timing only): the CAPEX total and the active turbine count are read when the Equity panel or the Decommissioning card opens, not at start** (the Canvas computes `locTotalDevexCapexCost` in `OnVisible`, Y:1888-1910). The Equity card never shows the total (its loan line is `100 - value` for a percentage); the panel keeps Save off and its messages hidden while the total loads. Once wanted it stays wanted for the visit. Switch `lazyReads` | proposed (not approved) |
| Finance | **A write reloads only what it can change:** the option switch the project and the inputs, a toggle or panel save the inputs, a tranche Save or Delete the inputs and the two schedules. The CAPEX total and the turbines (the dearest part of the old reload: 11 requests in 5 steps) are never reloaded. A toggle or panel save is 2 requests instead of 12. Switch `targetedReload`. UT-FINPERF-110, 111, 007 | new (same rows) |
| Finance | **First visit of a new project: 8 requests instead of 72.** The option patch and the five seeds are ONE concurrent job with ONE reload (before: six jobs, six reloads of the whole screen). The Canvas `IfError` per seed is kept: a failing seed stops no other. Switch `concurrentWrites`. UT-FINPERF-140..144, 201..203 | new (same rows) |
| Finance | **DIVERGENCE: every failed seed is named** ("Error while creating <X> financing input: ..."), with the text a lone seed job showed. Before, each job cleared the previous message, so only the last failure was visible. New optional `PlanJob.failureText`. UT-FINPERF-142, 143 | proposed (not approved) |
| Finance | **Tranche Delete: 33 requests in 5 steps instead of 41 in 43** (30 deletes + reload): the step-ups and repayments go 16 at a time, then the tranche, as the Canvas `Concurrent`. After a failed child delete the tranche is never deleted. UT-FINPERF-130, 131, 004 | new (same rows) |
| Finance | **Tranche Save: 34 requests in 9 steps instead of 42 in about 45** (duplicate check + tranche + 25 repayments + 4 step-ups + reload): the tranche is written first and alone, then all its repayment and step-up writes go as one concurrent group, as the Canvas `Concurrent`. After the first failure no new write starts (as the sequential save stopped). UT-FINPERF-120..128, 002, 003 | new (same rows) |
| Finance | **Financing Options switch: 8 requests in 3 to 4 steps instead of 17 in about 12:** the project write first, then the status updates together. UT-FINPERF-132, 005 | new (same rows) |
| Finance | **Bulk schedules (`bulkSchedules`, OFF until the live probe on DEV passes):** from 5 rows of a table the repayment and step-up creates and updates go through `CreateMultiple` / `UpdateMultiple` (a tranche Save with 25 repayments and 4 step-ups: 11 requests instead of 34). A create row without the Owning Business Unit stays a single create (CONVENTIONS rule 4). UT-FINPERF-120..127, 150..152 | proposed (not approved) (off) |
| Finance | **DIVERGENCE (bulk only): the bulk update is guarded.** If another user deleted a repayment or step-up row, nothing of that step is sent and the user is told to reload; the per-row PATCH of today re-creates such a row (a PATCH without `If-Match` is an upsert). UT-FINPERF-127 | proposed (not approved) (off) |
| Cross-cutting | `registerBulkTables` adds tables to the bulk backend without touching the frozen Generators list (the repayment and step-up tables; the inputs table is not registered); `PlanJob.failureText` is optional and used only by the Finance seeds | new |
| Cross-cutting (tests) | Before / after benchmark with request counts per flow and a mutation-checked equivalence suite (same rows from the per-row, concurrent and bulk paths). UT-FINPERF-001..008, 099, 101..104, 110..160, 201..203 | **new test** |

**Modelled numbers** (25 ms per call; whole flows, reload included): visit reads 15 → 9 requests; tranche Save (edit) 42 → 34 (11 with bulk), serial steps about 45 → 9; tranche Delete 41 → 33, steps about 43 → 5; option switch 17 → 8; first visit seeds 72 → 8; a toggle or panel save 12 → 2. The step counts vary by about two between runs (timer jitter in the model); the request counts are exact.


## Cluster Checklist: less work per keystroke and per visit (19 Nov 2026, D138) — new (not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Cluster Checklist | Typing in the panel comment no longer rebuilds the cluster sequences, the stepper cards, the history notes or the approval lookups (10 rebuilds per 10 keystrokes before, 0 after); the same screen, texts and behaviour | **new** (performance only) |
| Cluster Checklist | The Portfolio Manager's mail is asked from Entra once per person per visit instead of once in the gates and again in the approval settings; Refresh asks again; a failed lookup is never remembered | **new** |
| Cluster Checklist | The visit effects no longer re-run on every render; Refresh still runs the visit again | **new** |
| Cluster Checklist | The first visit to a cluster can copy its default templates as one bulk create instead of N single creates (switch `CHECKLIST_BULK.materialise`, OFF until the DEV test; projects without an Owning Business Unit keep the single creates) | **new**, behind a switch |
| Cluster Checklist | Request-count and render-count tests (`UT-CHKPERF-*`) pin the baseline and the result | **new** (test gate) |
| Cluster Checklist | Component extraction so typing no longer re-renders the rows; one batched people request; dropping the guarded reads of Move to Cluster (rejected: removes the D127 §5 protection) | **proposed (not approved)**, see D138 |


## Generators screen: targeted reloads, a split load gate and a prefetch (19 Nov 2026, D141, number provisional) — new / divergences (not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Generators | A save reloads only the queries it can change (the types, that type's turbines, the one family it wrote, the project roll-up) instead of every Generators query; rollback and Retry cleanup keep the full reload. A BESS save is modelled at 3 requests instead of 12 to 14 (from the code, not measured). Switch `GENERATORS_PERF.targetedReload`. UT-GENPERF-004..031 | **new** (performance only), behind a switch |
| Generators | **DIVERGENCE:** what no plan writes (planning, other families, unrelated turbines) is no longer refetched after a save; another user's change to it shows at the next visit or window focus. UT-GENPERF-006..012 | **proposed (not approved)** |
| Generators | The first view waits only for what the list shows; the orderable catalogue, price index, device costs and AllWTG costs load when a panel or confirmation that needs them opens. Writes stay held back until they have landed (F3 unchanged), the Delete Turbine and Delete PV confirmations stay open until their read has landed. Switch `GENERATORS_PERF.gateByList`. UT-GENPERF-032..050 | **new** (performance only), behind a switch |
| Generators | **DIVERGENCE:** a panel that needs one of those reads shows its Save disabled for the length of one read; the Canvas loaded everything in `OnVisible`. UT-GENPERF-040..046 | **proposed (not approved)** |
| Generators | The ten reads that need only the project id start before the screen mounts for a Generators deep link, and 1.5 s after any Project Management screen of the project opens (once per project), together with the screen's chunk (D119 pattern). Switch `GENERATORS_PERF.prefetch`. UT-GENPERF-051..064 | **new** (performance only), behind a switch |
| Generators | **DIVERGENCE:** ten small speculative reads per project start whether or not the person goes to Generators. UT-GENPERF-062..064 | **proposed (not approved)** |
| Cross-cutting (tests) | A safety net for the reload map: the real plan builders of every kind are run and every table they write must be covered; `rules.ts` is scanned so a table added to a plan builder fails the suite until it is mapped. UT-GENPERF-015..028 | **new test** |


## Generators screen: reads without load chains, and a catalogue kept across sessions (19 Nov 2026, D142, number provisional) — new / divergences (not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Generators | The id-chunked reads (turbines by type, generator models, inverter and substructure suppliers, the turbines' land-lease allocations) send their chunks together (at most 4 at once) instead of one after another; same rows, same order, a failed chunk still fails the read. Switch `GENERATORS_PERF.parallelChunks`. UT-GENPERF-200..210 | **new** (performance only), behind a switch (ON) |
| Generators | The turbines can be read by the project in one request instead of waiting for the types and then reading by type ids (a filter through the turbine's WTG-type lookup). Not verified against the server: the switch `GENERATORS_PERF.readsByProject` ships OFF until the DEV probe (`GENERATORS-READ-PERF-DEV-PROBE.md`). UT-GENPERF-220..223, 270..275 | **new** (performance only), behind a switch (OFF) |
| Generators | **DIVERGENCE:** with `readsByProject` on, the turbine list is the server's answer for the project's WTG types at read time, not the rows of the type ids an earlier read returned; the two differ only if a type is created or removed between the reads. UT-GENPERF-220, 223 | **proposed (not approved)** |
| Generators | The orderable generator catalogue is kept across sessions in IndexedDB (version key with the build id, 12 h maximum age, shown at once and re-read in the background, any storage failure behaves as an empty cache, only the catalogue's model columns, no personal data). Seeded rows never allow a save before the fresh read has landed. Switch `GENERATORS_PERF.persistCatalogue`. UT-GENPERF-240..265, 280..286 | **new** (performance only), behind a switch (OFF) |
| Generators | **DIVERGENCE:** with `persistCatalogue` on, the catalogue panel can show a copy up to 12 h old for the length of one read at the start of a session, where the Canvas always read it fresh. UT-GENPERF-281, 284 | **proposed (not approved)** |
| Cross-cutting | A reusable `data/persistedReference.ts` (stale-while-revalidate storage in IndexedDB with version, age, timeout and a never-throws fallback) and its tests against a fake `IDBFactory`. UT-GENPERF-240..265 | **new** (reusable module, test gate) |
| Generators | Models by project and PV types without waiting: not done. The generator table has no project column and the SDK has no `$expand`; the PV types are already read by the project and do not wait | **not done**, see D142 section 2 |


## Generators screen: optimistic status toggle, a split screen component, long lists and lazy panels (19 Nov 2026, D143, number provisional) — new / divergences (not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Generators | Activate / Deactivate can show the new status at once (the type's chip and the command caption, its turbines' status) and puts the exact previous rows back if the save fails, is stopped part-way or finds its rows gone, with the existing error and partial-save texts; the targeted reload still runs after a success and after a failure. The write plan is built from the real rows and the screen holds every command back until the reload has replaced the optimistic rows (F3). Switch `GENERATORS_PERF.optimisticToggle`, ships OFF. UT-GENPERF-300..307, 310..316, 320..323 | **new** (perceived speed), behind a switch (OFF) |
| Generators | **DIVERGENCE:** with `optimisticToggle` on, the status changes before the save has landed; the Canvas shows it after the writes and the reload. Twin: `optimisticTypesCanvasParity`, `optimisticTurbinesCanvasParity`; switch off = today. UT-GENPERF-302, 316, 321 | **proposed (not approved)** |
| Generators | The 3,159-line screen is split: seven memoized family sections and eight panels in their own files, stable handlers, memoized id lists and PV rows. An update of one family's query, a card selection or a fold re-renders that family's section only; typing in a panel re-renders none. No visible change; the existing tests pass unedited. UT-GENPERF-330..336, 347..349, 360, 361 | **new** (performance and maintainability, no switch) |
| Generators | An expanded WTG card with 10 or more turbines on its page is skipped by the browser while far off screen (`content-visibility: auto`, no windowing, no new dependency); rows, buttons, test ids and keyboard focus are unchanged. UT-GENPERF-350..352 | **new** (performance only) |
| Generators | The eight form panels are loaded on first use (`React.lazy`), preloaded when the browser is idle; a named loading overlay shows if one is opened before its chunk has arrived. The Generators `Screen` chunk goes from 86.0 kB to 75.1 kB (gzip 22.6 to 22.1 kB). UT-GENPERF-340..346 | **new** (performance only) |
| Generators | **DIVERGENCE (timing only):** a panel opened before its chunk has arrived shows a loading overlay for the length of one small download. UT-GENPERF-341, 343 | **proposed (not approved)** |
| Cross-cutting (tests) | Render-count tests with a render probe (`sections/renderProbe.ts`) for the memoized sections; a hand mutation check (removing `memo`) fails six of the seven tests. UT-GENPERF-330..336 | **new test** |

## Generators: faster saves, parallel deletes and rollback of a failed create (16 Nov 2026, D115) — fixed (status toggle) / proposed (not approved)

Implemented on the integration branches, not product-approved, not run against DEV. Every bulk and rollback path is behind a flag in `data/generatorsBulkFlags.ts` that is `false` until its DEV check has passed (`GENERATORS-BULK-DEV-TEST-PLAN.md`). The analysis and plan are `GENERATORS-BULK-DATAVERSE-ANALYSIS-AND-PLAN.md` and `GENERATORS-BULK-IMPLEMENTATION-PLAN.md`. The Canvas patches every row one after another and leaves a partly-saved type behind; the entries below say where the code app differs. Request counts are computed from the code, not timed live. Packages S and R2 are in progress, so the entries that depend on them say so.

| Screen | Change | Status |
|---|---|---|
| Generators | **Activate / Deactivate:** the turbine `statecode` updates are one parallel group (8 in flight) instead of N one after another; the type update stays first and the project roll-up last. For a 10-turbine type that is the same 12 requests in 3 awaited steps instead of 12 (computed). Payloads, messages and ids unchanged; no flag. UT-GEN-123 (D115) | fixed (DIVERGENCE: a failure among the turbine updates lets the others finish) |
| Generators | **Tiered parallel deletes:** leaf rows (allocations, O&M costs, units, bridge rows, turbines deleted one by one) up to 16 at once, cascading deletes (land-lease costs, types) up to 4, children before parents, the roll-up last. The engine and the two constants exist; the delete plans using them are in progress. No flag; the timed DEV test sets the final numbers (D115 §2 item 3) | proposed (not approved) |
| Generators | **Bulk allocation creates:** the N × L land-lease allocation rows of Add type, Add turbine, Add PV type and the Replace follow-ups go out as `CreateMultiple` instead of one request each (30 rows in about 3 requests, 500 rows in about 8, computed from the splitter). Flag `allocations`; the plan builders (package R2) are in progress. D115 | proposed (not approved) |
| Generators | **Bulk turbine creates:** one `CreateMultiple` for the N new turbines after the type, with pre-generated ids. Flag `turbines`; builders in progress; stays off unless the polymorphic bind passes its DEV probe. D115 | proposed (not approved) |
| Generators | **Bulk status and apply-to-all updates:** one `UpdateMultiple` for the N turbines of a status change and for the N − 1 siblings of "apply to all". Flags `status`, `applyAll`; builders in progress. D115 | proposed (not approved) |
| Generators | **Bulk Replace Generator / PV:** the new turbines, allocations and re-links composed from the bulk steps; the old rows are still deleted and recreated as in the Canvas, the deletes running as a wave after the creates settle. Flag `replace`; in progress. D115 | proposed (not approved) (DIVERGENCE: delete order) |
| Generators | **Guarded bulk updates:** before an `UpdateMultiple` chunk (and its per-row fallback) the ids are read; if one is gone, nothing is sent and the user is told to reload, so a row another user deleted is never re-created. The Canvas patches without the check. `data/generatorsBulk.ts`; UT-GENBULK-* | proposed (not approved) |
| Generators | **Roll back a failed create save:** if Add WTG type fails part-way (scenario A) or an out-of-country type's Request Module Permission flow fails to start (B), the rows that landed are deleted (allocations, bridge row, turbines, type) and the project roll-up is recomputed if it had run; the error says the save was undone. If the cleanup fails, the message lists exactly what is left and a **Retry cleanup** button deletes only the recorded ids. Not for apply-to-all and not possible for Replace. The Canvas leaves the partly-saved type. Flag `createRollback`; the pure builders and the landed-row record exist, the screen wiring (package S) is in progress. UT-GEN-170…186 | proposed (not approved) (DIVERGENCE) |
| Generators | **Fail-closed bulk builder:** a bulk target without `owningbusinessunit@odata.bind`, with an empty or repeated id, or with a reserved key (`@odata.type`, `@odata.id`, the primary key) is refused before anything is sent (CONVENTIONS rule 4: omitting the bind never errors and the row becomes invisible to a colleague). UT-GENBULK-* | new (safety guard, proposed (not approved)) |
| Generators | **Writes land per chunk; failures count rows:** with a bulk flag on, "N of M changes had already been saved" counts rows, not requests; a chunk lands whole or not at all and parallel chunks can land partly. A 501 on an action's first chunk falls back to row-by-row writes for that action (kept per tab); a 429, or a 503 with `Retry-After`, is retried up to three tries in all after the header's wait. D115 | proposed (not approved) (DIVERGENCE) |
| Generators | Every bulk request prints one `[VSB] DATA create|update <entity set>` line with rows and milliseconds (no values, no ids); a rollback and its Retry cleanup print their delete lines (CONVENTIONS rule 23). UT-GENBULK-* | new (traceability) |

**Kept as the Canvas (reproduced):** the type create stays a single request (its autonumber name feeds the device-type row), as do the roll-ups, the device-type bridge create, the flow calls and every single-row save; Replace keeps delete-and-recreate (no repointing).

## Finance: Financial Close without the weekday (20 Nov 2026, D147, number provisional, bug 15290) — fixed (DIVERGENCE, not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Finance, Senior Debt card | Financial Close reads "September 1, 2033" ("1 September 2033" in en-GB) instead of the canvas `DateTimeFormat.LongDate` "Thursday, September 1, 2033": the weekday says nothing about a financial close date. UT-FIN-925, 927 | **fixed** (DIVERGENCE, twin `financialCloseCardTextCanvasParity`) |
| Finance, Add / Edit Tranche | The Financial Close date box shows "Sep 1, 2033" instead of the canvas LongAbbreviated "Thu, Sep 1, 2033", so the panel matches the card; typing a date is unchanged. UT-FIN-926, 927 | **fixed** (DIVERGENCE, twin `financialCloseBoxTextCanvasParity`) |
| Finance | End of debt service savings and the other date boxes keep the canvas format (weekday included) | **reproduced**, see D147 §3 |

## Header: the (i) environment icon removed (20 Nov 2026, D148, number provisional, bug 15341) — DIVERGENCE (the user's request, not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Every header (Cost, PM project and admin, project list) | The (i) environment marker is gone in every environment: the canvas draws it under "Cloud" on Cost screens (`ico_cmp_Header_Info`) and before Help on PM screens (`ico_cmp_Header_Info_4`), with no OnSelect and no Tooltip, so it did nothing when clicked. The band colour, the environment name and the version still show the environment. UT-HEADER-004, 004d | **DIVERGENCE** (the user's request), twins `brandInfoColorCanvasParity`, `environmentInfoColorCanvasParity` (UT-HEADER-003) |
| Header | The project-status glyph, the Help menu's InfoCenter item and the user menu's Version row keep their icons | **reproduced** |

## Check List Settings: Reorder by drag-and-drop, as the canvas (20 Nov 2026, D152, number provisional) — reproduced / fixed (not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Check List Settings, Reorder panel | The task list drags and drops like the canvas `pcf_ReorderTaskList_AdminScreen` (PowerDragDrop), with a grip on every row and the positions renumbering as a row moves. Since the D36 port the panel had Move up / Move down buttons only, although D18 b and the Default Checklists row in Part 2 A said "drag-and-drop plus Move up / Move down". The buttons stay for the keyboard and touch. Save writes the same 1-based Orders. UT-ADCHK-941, UT-REORDITEMS-005 | **reproduced** (canvas behaviour restored) |
| Check List Settings, Reorder panel | The hint is the canvas `TextCanvas1` text verbatim, "To reorder drag and drop listed items", as CAPEX Accounts' (D153). A first version of D152 had added ", or use the move up / move down buttons."; withdrawn the same day. UT-ADCHK-941 | **reproduced** |
| CAPEX Accounts and Check List Settings (shared `ReorderItems`) | A drag now carries the row id (`dataTransfer.setData`), without which Firefox starts no drag at all; Chrome and Edge were unaffected. UT-REORDITEMS-004, 005 | **fixed** |

## Application Settings: canvas parity sweep of all six screens (20 Nov 2026, D153, number provisional) — reproduced / fixed (not approved, not run on DEV, not seen in a browser)

The user: "scan whole application settings … not same as canvas". Each screen was compared control by control with its `.pa.yaml`. Only Application Settings code changed. The shared components got opt-in props only, so no other screen renders differently. The user also asked that every canvas defect the code had already fixed **stays fixed**, so the nine such fixes the sweep had reverted were restored and marked `SOURCE DEFECT (fix kept, D153)`. Details, the items kept, and the open questions are in D153.

| Screen | Change | Status |
|---|---|---|
| All six (delete / confirm dialogs) | The confirm button is the canvas `cmp_PopUp_Confirmation` one: themePrimary, white text, CheckMark, 128 px; Cancel 96 px. Also the 490 px box, the 40 px header and the 0.7 scrim. The red `destructive` Confirm and the bin icon (no canvas counterpart) are gone from Check List Settings, Project Gates, CAPEX Accounts, Costs and Contracts. Milestones' discard prompt has no canvas instance, so it was kept with the red removed. UT-ADCHK-947/948, UT-ADGATE-934, UT-ADCAPEX-951, UT-ADCOST-941/944, UT-ADCONTR-947 | **reproduced** |
| Check List Settings, grid | The Completion Date, Active, Edit and Delete icons were dark grey: TaskTable's own `td span` colour rule beat the icon tone class. They are the canvas akzent3 / themePrimary again, 16 px, with the canvas spacing. Active is centred. Locked rows are grey `#bbb`. Edit / Delete are 34 px. UT-ADCHK-942..945 | **fixed** |
| Check List Settings, Add / Edit Task | Semibold captions; the red `*` before the caption; counters on the caption row; the canvas spacing; the blank-name message shown while the name is blank, in the 9 pt canvas red with no icon. UT-ADCHK-946, 949 | **reproduced** |
| Check List Settings, Reorder | 15 px bold names, no row border, no "1." numbers (PowerDragDrop template); the canvas hint text; the command uses the NumberedList icon; the ✕ is themeTertiary; the list carries `pcf_ReorderTaskList_AdminScreen`. UT-ADCHK-941, UT-REORDITEMS-006 | **reproduced** |
| Check List Settings, delete text | "Are you sure that you want to permanently delete task "…"?" verbatim (L1706). The port had a longer soft-delete explanation with no decision behind it. UT-ADCHK-048, 912 | **reproduced** (PO to confirm) |
| Project Gates, Add / Edit Approvers | A gate always shows "Edit Approvers" (D22). Semibold captions with the canvas `*`. Gate is a disabled dropdown. No invented placeholder. The duplicate-gate error is a plain red label. The people pickers have chips in one box, the canvas tooltips and no invented status texts. The field heights, the Reset Gate band and the save text "Approvals was successfully saved." follow the canvas. The ✕ is themeTertiary. UT-ADGATE-070, 071, 708, 934, 937 | **reproduced** |
| Project Gates, canvas defects kept fixed | The Check List error names its field, "The check list item cannot be blank." (canvas: the Gate's "The cluster cannot be blank." copied onto it). A mode change that will clear saved people warns before Save (the canvas clears them silently). The Draft gate's "Gate active" shows ON, which is what Save writes, with "The Draft gate is always active." (the canvas shows the stored value, which can read OFF). Reset Gate asks "Reset Gate?" first, in the canvas blue look (the canvas writes on click and the write cannot be undone). UT-ADGATE-025, 032, 054, 910, 935, 936 | **fixed** (SOURCE DEFECT, kept) |
| Project Gates, screen | The grid header is filled Grayscale40, 32 px high. The headline is 16 px black. The country rail starts with every country collapsed (`startCollapsed`, PGAS:118-119). UT-ADGATE-938, UT-CTPICK-034 | **reproduced** |
| CAPEX Accounts, grid | The canvas icons (NumberedList, ActivateOrders, DeactivateOrders) on the command bar and the rows, not pause / play. The canvas column widths and radio image. No header tooltip, no line under an open card, no invented "No accounts" / "No subaccounts" texts. UT-ADCAPEX-940, 944, 947..952 | **reproduced** |
| CAPEX Accounts, Order panel | Names only (no "<number> - "), 15 px bold, no row border. The canvas hint verbatim. The lists carry their canvas names. Reorder subaccounts is always enabled (D19). | **reproduced** |
| CAPEX Accounts, New / Edit account and subaccount | Category is a disabled dropdown. Semibold captions with the red `*`. No Name counter, no "Name is required." message. The canvas error-label style. The `<parent>_` prefix at 10 pt. The Deactivate and delete-subaccount texts are verbatim. | **reproduced** |
| CAPEX Accounts, canvas defects kept fixed | Account and subaccount numbers are digits only (the canvas `IsNumeric` let "-5", "+5" and "1e3" through; its rule is the twin `isCanvasNumberCanvasParity`). Activate is offered only under an active account (the canvas allowed an active subaccount under an inactive account). The delete-account text drops "with its all related subaccounts" (Delete is only offered for an account without any). The Activate texts say that previously removed forecast costs are not restored. UT-ADCAPEX-033, 049, 050, 941..943, 945, 946, 950 | **fixed** (SOURCE DEFECT, kept) |
| Costs, side panels | Blue italic follows the canvas per control: 22 fixed `FontColor: themePrimary` / `FontItalic: true` controls (no condition on this screen). The copied all-inputs rule in `drawerStyles.ts` was removed. Currency is plain; Distribution Frequency, Cost Paid By and Comment are italic only; the cluster checkboxes and Unit are blue italic. The Description asterisk is hidden (its `Visible` is commented out). UT-ADCOST-939, 940, 942, 943 | **reproduced** |
| Milestones | Blank cluster cells are empty, not "-". The red border shows as soon as a value fails the check. #BD3133 border, akzent5 message, MaxLength 256, themeTertiary ✕, and the header rule only while folded. UT-ADMILE-934..938 | **reproduced** |
| Contracts | The fixed blue italic on Description, Month, Margin Fixed Value, Margin % and Comment. The canvas `*`, captions and error style; the blank message is never shown. No Month placeholder and no "%" or currency suffix. No Margin Type caption. The PLN / EUR caption. Margin reset to "0". The DevCo hint line is removed. The canvas card sizes and blank values. UT-ADCONTR-947..952 | **reproduced** |
| Contracts, canvas defect kept fixed | An inactive contract keeps its "Inactive" badge: the canvas lists it unmarked, so it looks active although it never seeds project contracts. UT-ADCONTR-928 | **fixed** (SOURCE DEFECT, kept) |
| Shared components (opt-in only) | `FormPanel closeIconColor`, `ReorderPanel closeIconColor`, `ReorderItems listTestId`, `CountryTechnologyPicker startCollapsed`. The `ReorderItems` look (15 px bold, no border) and the Firefox `setData` fix reach CAPEX Accounts and Check List Settings, its only users. UT-SETPANEL-026, UT-REORDITEMS-005/006, UT-CTPICK-034 | **new** (no other screen changes) |

## Check List Settings: tabs A → Z by name, as the live canvas (21 Nov 2026, D154, number provisional) — reproduced (not approved, not run on DEV)

| Screen | Change | Status |
|---|---|---|
| Check List Settings, tab strip | The country / technology tabs sort by name A → Z and the screen opens on the first (Croatia PV), as the live canvas app does. The extracted YAML sorts by Order (Germany Wind first), which the code had followed; the live app had been changed after the extract (parity run 29 Oct 2026, O5). The Order sort stays as `sortTabsByOrderCanvasParity`. UT-ADCHK-013, 017, 901 | **reproduced** (live canvas) |
