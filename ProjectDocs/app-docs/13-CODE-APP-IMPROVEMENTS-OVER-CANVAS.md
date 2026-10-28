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
| A version footer strip on every screen takes 32 px of height and repeats the version already in the header (`lbl_…_FooterVersion`) | **Divergence, proposed (not approved), 27 Oct 2026:** removed once in the shared `AppShell`, so every screen gains the height; the version stays in the header and user menu (D57) |
| Fold chevrons drawn per screen: small and grey on some, blue and large on others | **One shared `ExpandChevron`** on every accordion and card header, enforced by UT-EXPAND (27 Oct 2026, D58, proposed) |
| Same feature built in different ways per screen | Shared kit: `FormPanel`, `ConfirmDialog`, `CountryTechnologyPicker`, `StatusPill`, `RowActions`, `ReorderPanel`, `SettingsAccordion` and others, so one fix reaches every screen |
| Unsaved-changes guard missing or inconsistent | Shared guards: leave guard between screens (PO X1, D35), panel discard guard and `beforeunload` |

---

## Part 2 — Screen by screen

Status legend: **Connected** = reads and writes live Dataverse. **Reproduced** = canvas defect kept
on purpose. **Fixed** = changed under a recorded decision.

### A. Administration (Application Settings) — 6 screens

All six: connected, no Apply / Apply All (D20; the disabled bars on Contract and Cost were removed too, D61), canvas-named test ids and `AccessibleLabel`s
(D36), shared `FormPanel` / `ConfirmDialog` / `ReorderPanel`, and a per-screen `messages.ts`,
`fixtures.ts` and `writes.test.ts`. None of their tables fires a flow or plugin unless noted.

| Screen | Canvas problem found | What the code app does |
|---|---|---|
| **Default Checklists** (001, D18) | Gap report found 69 requirements: 37 covered, 20 partial, 3 missing, 9 wrong. Reordering relied on the PowerDragDrop component | Native drag-and-drop plus Move up / Move down buttons, no extra library; canvas defects fixed and documented; New-task Active toggle off as in canvas |
| **CAPEX Accounts** (002, D19) | Delete Account checked only the subaccounts; Reorder's `ItemEnabled` is commented out | Delete is also blocked when a contract references the account itself (safer, a documented divergence); reorder kept enabled as in canvas, Dataverse refuses without the privilege; the cascade filter `vsb_month gt N` reproduces `Month > Month(Today())` |
| **Milestones** (003, D21) | The plan called it "blocked by a missing flow", but the flow call is commented out in the canvas | Block cleared and screen connected. Two column errors corrected (primary key `vsb_milestonesstandardassumptionsid`; "Sales End" is `vsb_salesduration`). Apply, per-country Apply and the recalculating badge left out (D20) |
| **Gates & Approvals** (004, D22) | Several column names wrong in earlier code (`vsb_gateisactive`, navigation properties); people search used a wrong source | Two payload builders (one per table); people search through Entra (`aadusers`, enabled users only); Spain, Greece and Romania excluded from the country rail as in canvas; hidden controls (Reset, hidden order label) ported; no invented country-scope rule. A live people-search test is still pending |
| **Contract** (005, D23) | Plugin `DevCoCostRootCapexPlugin` sets the root CAPEX account on DevCo cost creation | Client does not redo the plugin's work. `createdRowRef(n)` lets one write plan reference rows it has just created. DevCo cost table registered. Option-set values corrected |
| **Cost** (006, D24) | Option sets had swapped or invented values (DevCo / SPV, an invented "Portfolio"); currency table name wrong | `costPaidType`, `thresholdType` and unit labels ("EUR/MW(p)", "SUM / MAX / MIN") corrected from `customizations.xml`; DEVEX and OPEX split into tree, drawers and contract table; 10 tables connected |

**Check List Settings UI parity (27 Oct 2026, D58, proposed, not approved):** measured against the live canvas screenshot and
`Admin Project Default Checklists Screen.pa.yaml`.
- **Page title in the header band** (`cmp_Header.Project.Name`) on all six admin screens, as on the PM screens; a visually hidden
  heading stays for screen readers.
- **Text sizes corrected:** row values 12 px (a modern Text `Size` is px) under 14 px Semibold headers; the earlier port had them inverted
  (16 px values, 12 px header).
- **Canvas action icons restored** on the Completion Date and Active buttons (an earlier divergence removed).
- **Hover hints on every panel and dialog ✕** ("Cancel", or "Close" where the canvas says so): the shared `FormPanel` and `ConfirmDialog` carry
  them, so no screen can miss one (D59, proposed). The canvas has 33 such hints; the earlier port had none.
- **12 canvas Save buttons showed a wrong hint** ("Filter projects details list view.", pasted from the filter icon). Fixed: they say "Save"; a test
  (UT-HINTS-001) keeps the pasted text out (D59).
- **Hover and press feedback on row action icons** (Edit, Delete, and the Completion Date / Active buttons): a mid grey fill (#D0D0D0) and the
  pointer cursor on hover, darker while pressed, none while busy or locked. The canvas gives no feedback (`HoverFillColor` transparent);
  this is an addition, shared in `RowActions` so every screen has it (D58 row 7, proposed).
- **One expand / collapse chevron everywhere** (blue, 1.4x, as the Cost cards), shared as `ExpandChevron`, with a test (UT-EXPAND)
  that fails if a screen draws its own small grey one (CONVENTIONS rule 21). Applies to every accordion and card header.
- **Milestones matrix text and column width match the canvas** (28 Oct 2026, D62, proposed, not approved): technology name 14 px, values and
  sub-labels 12 px (the earlier port read the modern Text sizes as pt, so they were 20 px and 16 px), and the blank column 110 px instead of 130.
  The Edit panel follows the same sizes and the 80 px column layout (D62 rows 5-10), and its inputs show long values in full instead of the
  canvas's clipped "3…" and "0…".
- **Disabled Apply / Apply to All bars removed** from Admin Contract and Admin Cost (28 Oct 2026, D61, proposed, not approved). The canvas ships
  them permanently disabled with the sync call commented out, so they never did anything; the code app no longer draws them. Tests assert
  they are absent (UT-ADCONTR-936, UT-ADCOST-910).
- **"…" overflow menu for the country / technology tabs** instead of a scrollbar, in the shared tab strip (CAPEX Accounts too).

**Net on 22 Oct (D36):** a collapsed-rail defect (CA-1) was fixed to follow the live
`pcf_Left_Navigation_Menu.Items` formula (test `UT-RAIL-003`). Five behaviours still contradict
earlier decisions D19, D22 and D24 and are waiting on the product owner (D36 §6).

### B. Project Management — 10 screens (connected 19–20 Oct, D25–D34)

| Screen | Canvas problem found | What the code app does |
|---|---|---|
| **General Data / New Project** (D25) | Terrain, local tax tables and shareholder entities were thought to be Fabric SQL | Confirmed they are Dataverse tables and connected them (5 tables). **Creating a new project** added on 20 Oct (PO). Cancellation flow for gate approvals left out; leave guard added in D35 |
| **Milestones** (D26) | Plan said "formally blocked" by a missing flow | Cleared: the flow call sits inside a comment block. 4 SOURCE DEFECTs fixed; the COD guard, FID re-pricing and recalculating notice connected. Default revenue seed stays unconnected (Fabric SQL, D2) |
| **Generators** (D27) | Module-permission flows send mails and Teams cards; a type Save blocker and a PV supplier write error | Both fixed. 7 SOURCE DEFECTs fixed; 10 tables connected; permission-request controls shown but disabled with an `EXCLUDED.*` tooltip; `CommandBar` gained a tooltip for a disabled command |
| **Production** (D28) | Seasonality and negative-price values come from Fabric SQL | Shows a clear "not connected" notice instead of silently blank values; save, delete, activate / deactivate, project roll-up and the one-shot standard Land Lease / Other OPEX / O&M contracts are connected |
| **Checklist** (D29) | Approval buttons start flows (mails, Teams cards) | Everything not tied to a flow is connected: back-fill, tracking, materialisation, Complete / In Progress, comments, ungated moves, Reset, Abandon / Inactivate / Activate. Approval buttons visible but disabled |
| **Checklist, UI parity** (27 Oct, D60, proposed) | Screenshot comparison with the canvas | Mail / People gate icon at 20 px; state text lined up across the stage cards; the clock under the gate; plain refresh icon; 16 px text and a plain ✕ on three action buttons; table capped at 1520 px (a table ignores `max-width`, so it had filled the window); 37 px rows with 80 x 26 toggles; Note comment icon and a 20 px approval icon in the canvas colours |
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

### E. Cost — Add Cost from Table

| Canvas challenge | Code app |
|---|---|
| Deleting a contract's description deletes the contract and **all** its historical costs because the guard is commented out (A-1) | **Reproduced on purpose** as `CANVAS_PARITY_DELETION = true` (client-confirmed, rule 15), now with a safety net, `identityRoundTripFailures`, added after the Wirmighausen incident (about 168 CAPEX rows lost to one save) |
| Year range off by one for projects longer than 15 years (C-1) | The CAPEX screen's correct `max − min + 1` form is the one used |
| Duplicate-contract error can name the wrong account (C-2) | Not reproduced |
| Whole save is a long timer in the canvas | Phased save as a write plan; still non-transactional |
| The table opened as a centred 90 % × 90 % pop-up over a scrim, unlike every other form | **Divergence, proposed (not approved), 26 Oct 2026:** opens as the shared right-docked `FormPanel` at about 95 % width (new `grid` preset) over the DEVEX/CAPEX screen, so the grid keeps its room and the panel behaves like the other features. The URL `/costs/add-from-table` stays a deep link. Behaviour, ids and the save logic are unchanged; Cancel still closes without a prompt. Checked in the browser by the user, who found it good; recorded as D56 |

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
