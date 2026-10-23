# Open decisions — Project Costs code app

Each item is something the rebuild has already had to take a position on, where the position
is visible in one place and reversible. Nothing here is a blocker for the Contracts slice;
all of it has to be settled before anything goes to UAT.

Format: **what was decided** · why · where it lives · what changes if you decide otherwise.

---

## D1 · Command greying: the SDK has no `DataSourceInfo` / `RecordInfo`

**Decided (provisionally): commands are enabled, the server refuses, and a 403 becomes a
clear message.** `src/platform/privileges.ts`

The canvas app greyed out commands from the platform's own answer:

```
ItemEnabled: DataSourceInfo('BoP Projects Contracts', DataSourceInfo.CreatePermission)
ItemEnabled: And(Not(IsBlank(rec)), RecordInfo(rec, RecordInfo.EditPermission))
```

`@microsoft/power-apps` 1.3.1 has **no equivalent**. `DataClient` gives CRUD plus
`executeAsync`, and `executeAsync` accepts only two Dataverse request shapes:
`getEntityMetadata` and `customapi`. `RetrievePrincipalAccess` is a Web API *function* (GET
with parameters), so it is not reachable through the `customapi` action path, and table
metadata describes which privileges **exist**, not which ones the caller **holds**.

Nothing can be wrongly *allowed* — Dataverse still enforces. What is lost is the pre-emptive
greying, so a user without rights learns on click rather than on sight.

**The alternatives, both one file away:**

| | What it buys | What it costs |
|---|---|---|
| A role→table matrix read at bootstrap | pre-emptive greying, fast | the app holds a second opinion about security that can drift from the server's |
| A Dataverse Custom API returning the caller's effective privileges | correct **and** pre-emptive | a solution component someone has to build and deploy |

**Needed from you:** which of the three. If it is the Custom API, it should be scoped now,
because five screens will want it.

---

## D2 · The BoP standard-assumption margin: Fabric SQL or Dataverse?

**Decided (provisionally): read it from Dataverse.**
`src/data/contracts.ts` → `findBopStandardAssumption`

The canvas app seeds a new Development or Construction contract's margin from the **Fabric SQL
mirror**:

```
ClearCollect(colBoPStandardContractsFabric,
  Filter('Assumptions BoP Contracts', countryname = …, technology = …))
```

via connection reference `vsb_VSBCloudFabricSQL`, with the server, database and table name all
coming from environment variables (`vsb_FabricSQLServer`, `vsb_FabricSQLDatabase`,
`vsb_AssumptionsBoPContracts`).

The same data is in Dataverse as `vsb_bopcontractsstandardassumptionses`. Reading it there:

- drops the premium SQL connector and its connection reference from the code app entirely;
- drops the environment-variable indirection, which a code app data source cannot express
  anyway — a code-app data source is bound at design time, so dev and prod would need
  different bindings;
- gives fresher numbers, because the Fabric copy lags by `vsb_FabricSyncDelayMinutes`.

**Needed from you:** is the Fabric copy ever *deliberately* different from Dataverse? If yes,
this has to go back onto the SQL connector and the dev/prod binding problem needs an answer.

---

## D3 · The `Margin = No` calculation (source defect C-6)

**Decided: fixed, and the canvas behaviour kept as a testable twin.**
`src/features/contracts/rules.ts` → `totalCostOfContract` /
`totalCostOfContractCanvasParity`

The canvas `Total cost of contract` calculation adds the fixed margin **even when Margin is
set to No** — the `Margin = No` branch is byte-identical to the fixed-value branch. It is
masked while a user toggles the radio (that handler zeroes the field), but reachable on Edit of
a stored row, and on a NEW contract seeded from a standard assumption whose `marginvalue` is
non-zero while its `margin` flag is not set.

Second half of the same defect: the percentage branch has no `else`, so a non-numeric
percentage silently yields `Blank()` and wipes the stored total.

**This changes stored numbers.** UT-CON-029 and UT-CON-030 pin both behaviours, so the
difference is one line to flip.

**Needed from you:** confirm the fix, or say "parity" and we ship the defect knowingly.

---

## D4 · Blank required fields now say why (divergence D-4)

**Decided: diverged.** `src/features/contracts/rules.ts` → `contractErrors`

Every canvas `*_ErrorMessage.Visible` requires `Not(IsBlank(field))`, so a required field left
empty showed **no message** while still disabling Save. The user got a greyed-out Save button
and no explanation. The rebuild reports `"Input must not be blank"`.

Low risk, but it is a visible difference in a parity test, so it is recorded.

---

## D5 · Delete gated on Delete permission, not Edit (source defect D-5)

**Decided: the seam exists, the canvas behaviour is still what ships.**
`src/features/contracts/rules.ts` → `contractCommands`

`cmd_Contracts_CommandBar.Items` gates the **Delete** command on
`RecordInfo(rec, RecordInfo.EditPermission)`. A user who may edit but not delete sees Delete
enabled and gets a 403 from the server. `contractCommands` takes `canDelete` separately, so
passing the real answer fixes it — but under D1 there is no real answer to pass yet, so today
it receives the same value as `canWrite`.

Resolves itself once D1 is settled.

---

## D6 · Contract save is not transactional

**Decided: unchanged from the canvas app, and called out rather than inherited silently.**
`src/features/contracts/hooks.ts` → `useSaveContract`

A contract save is three separate requests: write the contract, delete its old DevCo links,
create the new ones. An interruption between them leaves the contract saved with the wrong
links. The canvas app had exactly the same exposure (`Patch` … `RemoveIf` … `Patch`), and the
SDK's `DataClient` has no changeset API, so making it atomic needs a Dataverse Custom API.

**Needed from you:** is this worth a Custom API? It is the same answer as D1's third option,
so the two should be decided together.

---

## D7 · Payment date stays free text

**Decided: kept as text.** `src/features/contracts/Screen.tsx`, the payment-target panel

`vsb_paymentdate` on `vsb_BoPContractsPaymentTargets` is an **`nvarchar`** column, not a date,
and the canvas control is a `TextInput` with an `MM/YYYY` placeholder. Substituting a date
picker would change the stored format and make existing rows incomparable with new ones.

The `MM/YYYY` format check and the "must be later than the project start" check are both
ported exactly (UT-CON-044 … UT-CON-049).

**Worth raising separately:** a date stored as text cannot be sorted, filtered or reported on
in Fabric without parsing. Changing the column type is a schema decision with a data migration
behind it, so it is not this project's call — but somebody should own it.

---

## D8 · InfoCenter opens in a new tab

**Decided: diverged.** `src/components/AppHeader.tsx`

The canvas Help menu used `Launch(gblInfoCenterLaunchUrl, Blank(), LaunchTarget.Replace)`,
which navigates the app away and discards anything unsaved in an open panel. A new tab is
strictly safer. Trivial to revert.

---

## D9 · "Report a problem" does not file anything yet (source defect B-1)

**Decided: the panel is honest about it.**
`src/features/report-problem/ReportProblemPanel.tsx`

The canvas Save button's entire body is commented out, including both notifications, so the
panel closes and the user believes a bug was filed. The flow `ReportDevOpsBug` **does exist in
the solution** — it is the only flow the Cost app references at all — so re-enabling it is a
decision, not a build.

Until then the panel shows the captured technical detail and offers "Copy report" rather than a
Save that does nothing. `onSubmit` is where the flow call goes.

**Needed from you:** re-enable the flow, or replace it with something else. Related: the
canvas `App.OnError` also has its `Notify` commented out, so today errors are silent
app-wide (B-4).

---

## D10 · Two constants the canvas save always writes

**Decided: copied unchanged.** `src/data/contracts.ts` → `contractPayload`

The canvas contract save always writes:

```
'BoP Standard Assumption Contract': Blank()
'Is Standard Contract':             No
```

…even when the margin **did** come from a standard assumption, and even though it separately
records `'Is Margin Standard Assumption?': locIsStandardAssumtions`. So the contract remembers
that a margin came from an assumption but never which one, and never identifies itself as a
standard contract.

That is probably deliberate — BoP standard contracts are created by the
`vsb_InitialP50StandardBoPContractsCreation` plugin, not by this screen — but it is worth
confirming, because the two fields disagree with each other.

---

## D11 · Screen1 and Screen2 are not ported

**Decided: dropped.**

Both are developer scratch screens, referenced by nothing except `_EditorState.pa.yaml`, so
they are unreachable in the canvas app too. `Screen1` still instances `cmp_Header` and
`cmp_ReportErrorRightPanel`, so it costs load time for nothing. Worth deleting from the canvas
app as well.

---

## D12 · Delete Project is disabled on the overview

**Decided: visible, permanently disabled, with a tooltip saying where to do it.**
`src/features/project-overview/Screen.tsx`

The Main Project Overview is now this app's landing screen, so its ten-command bar came with
it. Nine of those commands are serviceable here — `Edit Costs` navigates into the cost module,
and the rest are `Launch(url)` calls the canvas already made (the PM app deep-linked, the
Analytics app, the Power BI reports, SharePoint, Teams, the dashboard).

`Delete Project` is the exception. It removes a project row and everything hanging off it, and
its confirmation flow, its two notifications and its post-delete refresh all belong to Project
Management. Shipping a destructive action from the *Cost* app on the strength of a ported
`ItemEnabled` formula is not a call to make silently.

Its gate is still implemented and tested (`commandBarState`, UT-OV-049 — an approved project
cannot be deleted whatever your privileges), so enabling it is one line plus a mutation.

**Needed from you:** should the Cost app be able to delete projects at all? If yes, it also
needs an answer on D1, because the canvas gate reads `RecordInfo(record, EditPermission)`.

---

## D13 · Five gates in the skeleton disagreed with the canvas

**Decided: the canvas source wins, and each difference is marked `SKELETON FIX`.**
`src/features/project-overview/rules.ts`

The skeleton's `src/features/pm/project-main/rules.ts` is a careful piece of work and most of
it was reused verbatim. Five things in it did not match `Project Main Screen.pa.yaml`:

| | Skeleton | Canvas |
|---|---|---|
| keyword search, 4th field | `_vsb_countryarea_value` | `'Project ID'` (`vsb_name`) |
| Simulate visibility | `environmentName === "Dev"` | `User().Email in colAnalyticsAppUsers` |
| Dashboard, Portfolio Overview | gated on selection | no `ItemEnabled` — always enabled |
| `REPORT_VIEWERS` | 3 addresses not in the canvas, 3 missing | the 10 in `OnVisible` |
| SharePoint/Teams/PowerBI labels, icons | paraphrased | "View Sharepoint Site", "Show Project Overview (Beta)", … all icon `View` |

The first would have been a hard failure, not a cosmetic one: `contains()` on a GUID column is
a 400 against live Dataverse. The mock backend the skeleton tests against accepts it, which is
why its own suite is green.

Each is pinned by a test (UT-OV-005, 051, 057, 058, 053) so the difference is reviewable.

**Needed from you:** the two hard-coded address lists — `colReportViewers` (in the canvas
source) and `colAnalyticsAppUsers` (already an environment variable, `vsb_AnalyticsAppUsers`) —
should both be environment variables before go-live. Only one is.

## D14 · Administration and Project Management screens are built UI-first, not connected

> **Superseded.** Every Admin and PM screen is now connected (D18–D34). The six admin screens were then replaced on 22 Oct 2026 (D36).

**Decided (15 Oct 2026): their UI and pure rules are in the app now, and their data comes later.**
`src/features/admin/*`, `src/features/pm/*` (except `project-main`), `src/data/notConnected.ts`

The 16 Admin and PM screens follow this app's concept: Fluent v9, `@/components`, `@/theme/tokens`, `canvas.css`, verbatim canvas strings in `rules.ts`, and the app's own route table and rail.

- **No data is read or written yet.** Each screen's `hooks.ts` returns `notConnected(empty)`, and `Screen.tsx` shows `NotConnectedNotice` listing the tables to connect. Every write command is disabled.
- **There is no mock mode, and this is not one.** Lists are empty; nothing is invented.
- **Connecting a screen** is MIGRATION-STRATEGY steps 4 and 6:
  1. Register its `TABLES` with `pac code add-data-source`.
  2. Replace the `hooks.ts` body with queries over the generated services, via `data/client.ts`.
- **The query checklist** for each hook (table, filter, `$select`, writes) is in the JSDoc at the top of each `hooks.ts`.
- **Entity-set names** are in `src/data/dataverseNames.ts`, checked against `ProjectDocs/reference/dataverse-entities.json`. Two were corrected there:
  - `vsb_projectmemberdescriptionses`
  - `vsb_projectmemberses`

  Three are not in the reference and are marked `UNVERIFIED`.

**Needed from you:** the `pac` sign-in to VSBCloud_Dev, so the tables can be registered.

## D15 · Divergences and canvas mismatches found while building the D14 screens

None of these has been fixed silently. Each needs a decision before its screen is connected.

| # | Where | What | Current state |
|---|---|---|---|
| a | `app/navigation.ts` `ADMIN_NAV_ITEMS` | The canvas shows admin rail rows only when `Or(IsApplicationAdministrator, IsControllerOwnData)` is true. The app's `CurrentUser` does not load those role flags. | **Resolved 19 Oct 2026** (see D18): role-gated as in the canvas, with a local-run bypass. |
| b | `pm/finance/Screen.tsx` | With no rows, the canvas shows no category cards. | **Resolved D34:** the cards render from the Dataverse categories, only for a set, non-Draft cluster state, as the canvas. |
| c | `pm/generators/Screen.tsx` | The canvas nests BESS / Hydrogen / Substation under "Add Others". The app's `CommandBar` has no sub-menus. | Rendered flat after "Add Others" (`DIVERGENCE`). |
| d | `admin/admin-contract/rules.ts` | `CHOICE_ADMIN.bopContractTypes` is development 952850000 and construction 952850001. The real option set is None 952850000, Development 952850001, Construction 952850002 (`CHOICE_COST.bopContractTypes` is right). | Rule logic unchanged. **Fix before connecting.** |
| e | `pm/planning/rules.ts` | `MAX_LENGTH.cooperationDetails` is 55; the canvas counter uses `DefaultLongMaxLength` (300). | **Resolved 20 Oct 2026** (D31): 300, as the canvas and the column. |
| f | `pm/revenues/rules.ts` `pageLock` | The fifth bullet reads "• Cluster State"; the canvas reads "• Change the project status from Draft". It is shared with Finance. | **Resolved D33:** the canvas text (Finance shares it). |
| g | `pm/revenues/rules.ts` | `balancingYearOptions` offers 0–35; the canvas `colYearsForBalancingPriceDuration` offers 0–30. | **Resolved D33:** 0–30. |
| h | `admin/admin-gates-approvals/rules.ts` | `MSG.deleteChecklistTitle` is not the canvas text ("Delete Check List Approval Item?"). | The screen uses the canvas text from `SCREEN_LABELS`. |
| i | `admin/admin-cost/devexRules.ts` | `UNIT_ERROR` wording differs from the canvas label "{EUR\|PLN}/WTG only applicable for Wind". | Not shown yet. |
| j | Revenues, Production, Milestones, Finance | "Assumptions Revenues / Debt / Banks / KfW Tranche SQL" are Fabric SQL sources, not Dataverse tables. | Documented in each `hooks.ts`. How they connect is undecided (see D2). |

## D16 · Control labelling (aria-label + data-testid): what the gate cannot fix by itself

**Done (16 Oct 2026):** every interactive control in `ProjectCosts-CodeApp/src` now has an explicit
`aria-label` and a `data-testid` (`ProjectDocs/instructions/CONVENTIONS.md` rule 16). This is enforced by
`scripts/check-control-labels.mjs` / UT-LABELS, and the run reports 0 missing and 0 duplicates.
About 230 controls were fixed, and most of the test ids are canvas control names.

The open gaps below need a decision or a hand fix:

| # | Gap | Where |
|---|---|---|
| a | **The PCF grid renderer is outside the static check.** It builds its controls with the DOM API, and several have no `aria-label` and no `data-testid`: the account/subaccount +/− toggles, the "•••" actions button, the "Add" menu button and its items, the month-cell "Set as paid/unpaid" and "Comments" items, and Edit/Comment/Delete in `ActionDropdown.js`. Month-cell and comment-dot `aria-label`s carry bound data (amount, comment text). | `features/cost/capex-costs/pcf/ui/GridRenderer.js`, `ActionDropdown.js` |
| b | **Rule-2 deviations.** About 30 existing `aria-label`s are built from record data. They were left unchanged because tests and Tosca key on them, and each control now has a stable-id `data-testid`. They are listed by `npm run check:labels` (warnings). Decide whether to switch them to configuration captions. | `pm/project-main`, `cost/contracts`, `cost/periods`, `pm/{team,general-data,generators,checklist,production}`, all admin rails and tabs |
| c | **Per-row test ids that are not unique.** These are existing literal ids repeated on every row or card. They were not renamed, because existing values stay. Tosca can reach them only by position until a row id is appended, which would change ids existing modules use. | admin-capex-accounts, admin-contract, admin-gates-approvals, admin-cost, admin-default-checklists, admin-milestones (the same input id in every technology column), `pm/checklist` rows, `pm/revenues` individual-volume rows, `pm/planning` acquisition Edit, `pm/generators` WTG-card fields |
| d | **Older kebab ids where a canvas name exists,** for example `lease-start` / `opex-start` (`dte_…StartDate`), `lease-secured`, `opex-years`. They were kept. | `cost/periods/*` |
| e | **`aria-labelledby` instead of `aria-label`** on the Project Main manager suggestions and the Opex O&M card header, because the only caption there is bound data. Tosca may not resolve `aria-labelledby`, so confirm on a scan. | `pm/project-main`, `cost/periods/OpexScreen` |
| f | **New configuration labels with no canvas source**, used where the visible caption is data: "Select contract", "Expand account", "Payment target", "Select period", "Select cost". | `cost/contracts`, `cost/periods/*` |
| g | **Weak or inferred canvas names.** The CAPEX panel Save/Cancel names were inferred from position. The comment-filter controls are canvas defaults (`modernDropdown1`, `CheckboxCanvas1`). | `cost/capex-costs/*` |
| h | **Fluent `Switch` has no explicit `value`.** It is a checkbox underneath, so decide whether rule 3 covers it. | admin-cost, admin-default-checklists, admin-gates-approvals |

## D17 · Build-readiness audit (16 Oct 2026): what was fixed, and the consolidation backlog

**Done:**
- **Gates:**
  - `npm run verify` passes: typecheck 0 errors, lint warnings only, both label gates clean, 82 test files and 2,548 tests pass, and the build succeeds.
  - The new `check:power` gate runs first in `verify`, and `ProjectDocs/instructions/CONVENTIONS.md` now has a "Before pushing to DEV" checklist.
- **Fixed:**
  - Dates on Finance and Revenues were formatted with `toISOString()`, which stores the previous day east of UTC. Both now use `dateOnly`.
  - Contracts and Land Lease had no load-error state; both now render `EmptyState` on a failed read.
  - Seven unsafe optional-chaining lint warnings in tests.
- **De-duplicated, with no behaviour change:**
  - `bind`, `numberOf`, `money` and `idIn` (11 copies) are now in `data/odata.ts`.
  - `PlannedWrite`, `WritePlan`, `emptyPlan` and `refuse` (7 copies) are now in `data/writePlan.ts`, and `admin-cost/plan.ts` was removed.
  - A same-file twin of `isoToMonthYear` in capex rules was removed.
  - The dead `versionLabel` in `domain/session.ts` was removed.
- **Component kit:** the canvas field primitives moved from `features/cost/costing/Fields.tsx` to `components/CanvasFields.tsx` and are exported from `@/components`. That folder was imported by 18 files.
- **Dependencies:** removed the unused skeleton dependencies `zod`, `zustand` and `@tanstack/react-virtual`.

**Backlog — not changed, because each one alters rendered UI or the write path and needs a decision or a canvas check:**

| # | Item | Risk |
|---|---|---|
| a | **Two numeric libraries.** `domain/numeric.ts` and `domain/powerFxNumeric.ts` differ in behaviour: `undefined` vs `NaN`, and the locale source. Cost screens use one, Admin and PM the other. Pick one before Admin and PM are connected. | medium |
| b | **Option-set values re-declared in cost data and rules** instead of using `CHOICE_COST` / `CHOICE_PRODUCTION`: payer, distribution, aggregation, threshold, secured, period and contract type. | high (writes) |
| c | **`/businessunits(…)` owner binding hand-written about 45 times.** Some copies omit the field when there is no business-unit id; general-data, milestones and team write `null`. Add `owningBusinessUnitBind()` to `data/odata.ts` and settle omit vs `null`. | high (writes) |
| d | **No kit `DateField`.** Date entry is built four ways: Fluent `DatePicker`, `Input type=date`, `CostField type=date`, and a raw input. | medium (UI) |
| e | **No kit select.** There are five local Dropdown wrappers (generators, finance, planning, general-data, revenues). Extend `CostSelect` with `disabled`, `placeholder` and `{value,label}` options, then adopt it. | medium (UI) |
| f | **Page lock.** The banner is rendered 8 ways across the PM screens. `PAGE_LOCK_TITLE` has 8 copies, and grid-operator/planning have identical `pageLock` functions. Build one `PageLockNotice` plus a shared rule. | medium (UI) |
| g | **Info dialogs.** Four single-OK dialogs use a raw Fluent `Dialog` instead of the canvas-styled `ConfirmDialog`. Add an `InfoDialog` or a single-button mode. | medium (UI) |
| h | **Error notices.** Write errors appear in four styles (`.canvas-error`, two MessageBar variants, a custom div), and there are three error reds. Use one notice component and one token. | medium (UI) |
| i | **Admin and PM screens ignore `error`, and most ignore `isLoading`.** Fix each as part of connecting that screen (CONVENTIONS rule 19). | medium |
| j | **Opex and Land Lease copy `CommandBar` line for line**, and share about 100 lines of styles. Add a test-id prefix prop to `CommandBar` so the existing ids stay unchanged. | medium |
| k | **Four people pickers** (project-main, general-data, team, admin-gates). | medium-low |
| l | **Generators `PanelFooter` duplicates `PanelButtons`.** Add a `saveLabel` prop to `PanelButtons`. | low |
| m | **Small duplicates:** month-name arrays (5), `dd.mm.yy` formatters, `numericOr`, `canEditScope` (5), `charCounter` (3), and the project-states loader with its two query keys (two fetches). | low |
| n | **`milestones/rules.ts` `deriveNextDate` / `contractDates` use `toISOString()`.** The result is correct for UTC+ users only by accident; switch them to `dateOnly` when that screen is connected. | low now |
| o | **`pm/production/rules.ts` writes `vsb_startdate` as a full ISO timestamp.** The cost screens write `yyyy-mm-dd`. Check the column behaviour before connecting Production. | medium |
| p | **Remaining lint warnings (20):** 13 `only-export-components`, 4 `preserve-manual-memoization`, 2 `set-state-in-effect`, and 1 unused variable in vendored PCF code. These are behavioural refactors; do them alongside the screen they affect. | low |

## D18 · Admin Default Checklists (screen 001) redeveloped from the canvas YAML (19 Oct 2026)

> **Implementation replaced on 22 Oct 2026 (D36).** The decisions below still record the canvas analysis; the code is the RounakDev1 version.

Scope approved by the product owner: business rules, UI and docs. **No data connection yet**: the screen is still D14 "not connected", and the four tables below are not registered. Gap report: 69 requirements (37 covered, 20 partial, 3 missing, 9 wrong before this change). Flow and plugin effects come from `ProjectDocs/migration-plans/04-flow-inventory.md` (verified section).

**Decided with the product owner (19 Oct 2026):**

| # | Item | Canvas | Code app now |
|---|---|---|---|
| a | New task Active toggle | Off (`tgl_Active_ChecklistForm.Checked` false with no selection) | **Off, like the canvas.** `emptyTaskForm().active = false` |
| b | Reorder UX | PowerDragDrop list | Native drag-and-drop plus Move up/down buttons, no new library |
| c | Per-row test ids (D16-c) | Same id on every row | **Unchanged for now** |
| d | Canvas bugs | — | Fixed and documented (rows e–k below) |

**SOURCE DEFECTs fixed (each marked in `rules.ts` with the canvas original):**

| # | Defect | Fix | Parity twin / test |
|---|---|---|---|
| e | `vsb_order` on Checklist Country And Technology is TEXT, so the canvas sorts "10" before "2" | Numeric-aware sort; blanks last | `sortScopesCanvasParity`, UT-ADCHK-003c |
| f | Default tab is the first by name while the strip is sorted by order | First tab by order (already in code; now logged) | `defaultScopeCanvasParity`, UT-ADCHK-003b |
| g | "Decativate" typo in the title and the confirm button | "Deactivate" in both | UT-ADCHK-019c |
| h | Progress, success and error texts are set but never shown (the screen has no loading pop-up) | Texts ported verbatim for notifications (`savingText`, `MSG.saved`, `saveErrorText`, …). They are shown once the writes are connected | UT-ADCHK-019d |
| i | Delete text misspelt ("Deleteing") and names the Add/Edit panel's text box, not the row | "Deleting", names the row | UT-ADCHK-019d |
| j | Delete renumbering and reorder include rows already marked To Delete | Excluded | UT-ADCHK-016b |
| k | The row Activate/Deactivate writes Status only; the panel writes Status and Status Reason | Both paths write both | `toggleActiveCanvasParity`, UT-ADCHK-017b |

**Corrected to the canvas (they were wrong in code):**
- Text limit is `DefaultDefMaxLength` = 256, not 100.
- Gate captions map stored names through the canvas `Switch` ("Draft" shows "Draft to Cluster 1" … "Cluster 6" shows "Criteria After Cluster 6 Entry").
- `btn_Select` selects without folding; `ico_Down`/`ico_Up` fold and select.
- The Completion Date row button has its handler.
- Reorder has the `NumberedList` icon (added to the shared `CommandBar`); rows have activation icons.
- Every panel close resets all five fields (the hidden `but_Admin_Checklist_Form_Buttons_Reset`).
- Loading and load-error states added (rule 19).
- A blank Approval Mode locks the row, as Power Fx `Blank() <> X` does (UT-ADCHK-014b).

**Server-side automation: why the write plan is shaped this way.** The flow `SynchroniseProjectTaskList-Add_Update` fires on every add or modify of `vsb_projectdefaultchecklists` (Business Unit scope). It copies tasks into the project checklists of every project still working through that gate, but copies status only on update. On `vsb_todelete = true` it deletes the project copies and then the row itself. Therefore:
- a create stays the canvas **create-then-update** pair (`planSaveTask`, `CREATED_ROW_ID`). An earlier code version merged it into one write, which would have given every project an Active copy of a task created Inactive.
- delete stays a **soft delete**, never a real delete.
- the Owning Business Unit is the scope row's, on both writes.
- the app copies nothing into `vsb_projectchecklists`.

UT-ADCHK-012c and 012d test this.

**Shared header:** the canvas user menu's "Application Settings" item (`appSettingsKey`, the entry into this screen) was missing. It has been added (UT-HEADER-001/002).

**D14 a resolved (19 Oct 2026): admin entries are role-gated, with a local-run bypass.** Product owner decision.
- `loadCurrentUser` now derives `isApplicationAdministrator` / `isControllerOwnData` from the same VSB roles it already reads for the badge (`VSB - Application Administrator`, `VSB - Controller Own Data`, verbatim from `App.OnStart`).
- The header item and every admin rail row follow the canvas `ItemVisible: Or(IsApplicationAdministrator, IsControllerOwnData)`. The Dataverse "System Administrator" role does **not** count (canvas roles only).
- **Local-run bypass:** under `npm run dev` / `pac code run` (Vite DEV) every admin entry is shown, as for a system administrator, so the app can be validated without the roles. Any `npm run build`, and so any `pac code push`, applies the real check.
- No route guard was added: the canvas has none either (a deep link still opens the screen). This is UI hiding, not security (D1).
- Code: `app/adminAccess.ts`. Tests: UT-ADMINACCESS-001..007.

**Still open for the data step:**
- Register `vsb_checklistcountryandtechnologies`, `vsb_projectdefaultchecklistses`, `vsb_checklistdefaultapprovalses` and `vsb_projectdefaultapprovalses` (the last is refreshed only).
- Wire `canEditScope` once the role flags load.
- Show the progress texts as notifications.
- Confirm whether the PowerDragDrop `Position` is 1-based.
- Hidden canvas controls on this screen: the Reset button (ported as the form reset) and `lbl_ClusterName_Checklist_AdminScreen` (unreferenced, dropped).

**D18 follow-up (19 Oct 2026): screen 001 is now CONNECTED.** The product owner asked for every redeveloped screen to be connected.
- **Tables:** `vsb_checklistcountryandtechnologies`, `vsb_projectdefaultchecklistses`, `vsb_checklistdefaultapprovalses` and `vsb_projectdefaultapprovalses` were registered with `pac code add-data-source`, one at a time.
  - `dataSourcesInfo.ts` grew 38 → 42, one entry per table, with nothing dropped.
  - pac changed nothing outside `.power/` and the new generated files, apart from `power.config.json` (the new entries) and `src/generated/index.ts`.
- **Reads:** `data/adminDefaultChecklists.ts`.
- **Writes:** run through the shared `data/executePlan.ts` / `data/usePlanWrite.ts`, in plan order (create-then-update, soft delete only).
- **Messages:** progress, success and error texts are shown with `WriteFeedback`.
- **canEdit** is the admin rule (`useAdminAccess`). The country-scope gate (`canEditScope`, new and not in the canvas) is not wired; the canvas has none.

## D19 · Admin CAPEX Accounts (screen 002) redeveloped and connected (19 Oct 2026)

> **Implementation replaced on 22 Oct 2026 (D36).** The decisions below still record the canvas analysis; the code is the RounakDev1 version.

**Scope:** rules, UI, data and docs. All three tables (`vsb_capexaccountlists`, `vsb_capexprojectcontracts`, `vsb_capexcosts`) were already registered.
- No flow and no plugin step fires on them (04-flow-inventory.md, verified section).
- The screen has no hidden controls.
- `vsb_month` is the system option set `yearlymonth_options`, valued 1–12 (generated model). The cascade filter `vsb_month gt N` is therefore the canvas `Month > Month(Today())`.

**Product-owner decisions (19 Oct 2026):**
- **Delete Account:** also blocked when a contract references the account ITSELF (the canvas checks the subaccounts only). Safer, and it avoids orphaned contracts. A divergence.
- **Reorder subaccounts:** always enabled, exactly as the canvas (its `ItemEnabled` is commented out). Dataverse refuses the write for a user without the privilege.

**SOURCE DEFECTs fixed and documented in `rules.ts`:**

| Defect | Fix | Test |
|---|---|---|
| Deactivating an account sets its subaccounts to **Active**, though the dialog promises they are deactivated | Subaccounts are deactivated with the parent | `childStatusOnDeactivateCanvasParity`, UT-ADCAPEX-019b |
| The subaccount Activate icon can never appear (the Inactive branch tests `Status = Active`) | Shown for an inactive subaccount | `subaccountActivateIconCanvasParity`, UT-ADCAPEX-021 |
| The subaccount status dialog's Title reads the PARENT's status | Reads the subaccount | (Screen) |
| Reorder accounts is enabled from a different set (roots plus children of 10005) than the panel lists (the category's accounts) | Counts the category's accounts | `canReorderAccountsCanvasParity`, UT-ADCAPEX-004 |
| Duplicate number shown only after a failed Save | Shown inline, and re-checked on the server just before create | UT-ADCAPEX-011 |
| The spinner texts are set but the screen has no spinner | Shown while each write runs | UT-ADCAPEX-020b |
| Names stored untrimmed | Trimmed on save (minor) | UT-ADCAPEX-014 |

**Corrected to the canvas:**
- The Category dropdown is always disabled.
- The `<parent>_` prefix shows only for a new subaccount.
- Name `maxLength` is 55.
- The account panel uses its own "Account number must contain numbers only." text.
- The ordering panel lists the category's accounts by name, with drag plus Move up/down (shared `ReorderList`).
- Selection: a second click deselects; the chevrons and the subaccount actions select the parent; New clears it.
- The account reorder and the account delete clear the selection; a new account is selected after save.
- The canvas icons NumberedList, ActivateOrders and DeactivateOrders were added (shared `CommandBar`).
- Non-verbatim duplicate dialog strings in `MSG` were removed; the canvas texts are in `CAPEX_SCREEN_TEXT`.

**Kept as the canvas:** new accounts and subaccounts are created, then set Inactive (two writes). A Web API create cannot reliably set `statecode`.

**Data:**
- **Reads:** `data/adminCapexAccounts.ts`. Unlike the cost-screen loaders, these read every account, active or not.
- **Privileges:** `platform/privileges.ts` `serverEnforcedProvider` (Dataverse decides; a 403 becomes a message).
- **Cache:** every write also refreshes the cost screens' cached chart (`qk.capexAccounts`).

**Not ported:** Apply / Apply All, which is out of scope for the whole migration (D20). None of it exists on this screen.

## D20 · Apply / Apply All is out of scope for the whole migration (19 Oct 2026)

> **Contradicted by the code since 22 Oct 2026:** Admin Contract and Admin Cost show the Apply bars disabled. Decision needed: D36 §5.

Product-owner decision: no Apply or Apply All button, label or function is migrated. On the canvas screens these are:
- the hard-disabled Apply buttons on **Admin Milestones**, **Admin Contract** and **Admin Cost**;
- their commented-out flow calls (`SynchronizeStandardAssumptionCosts`, `ForCountriestriggerFabricrecalculationsforProjects`, the Fabric Sync Jobs patches);
- the per-card "last Apply" labels;
- the `Apply and Apply All Trackings` row the Admin Cost screen writes on every DEVEX delete.

Each screen's requirement doc notes the exclusion when that screen is redeveloped.

## D21 · Admin Milestones (screen 003) redeveloped and connected (19 Oct 2026)

> **Implementation replaced on 22 Oct 2026 (D36).** The decisions below still record the canvas analysis; the code is the RounakDev1 version.

**Scope:** rules, UI, data and docs.
- Both tables, `vsb_countries` and `vsb_milestonesstandardassumptionses`, were already registered.
- No flow and no plugin step fires on them.
- The plan's "blocked by missing flow" status was wrong: the flow call is commented out.

**Not ported (D20):** Apply All (`CommandBar1`), the per-country Apply, both Apply confirmations, and the "Currently recalculating…" badge (`Icon3_1`). The badge only shows Fabric jobs that Apply would create, so `vsb_fabricsyncjob` is **not** registered. Product decision, 19 Oct 2026.

**Corrected (would have failed or shown wrong data):**
- **Primary key:** `vsb_milestonesstandardassumptionsid`. The code had a singular `…assumptionid`.
- **"Sales End" column:** `vsb_salesduration`. The code had `vsb_salesend`, which does not exist. The old "documented defect" note had the mapping backwards.
- **Country order:** `Value(Key)`, where Key is `vsb_title`, sorted numerically in the app with blanks first. The hooks' plan named the non-existent `vsb_order` / `vsb_key`.
- **Grid cells, as each canvas cell builds them:**
  - FID: `Coalesce(D, 0.75)` / 1.
  - Cluster 5: D / 1.
  - Operational Lifetime: dash when blank.
  - Sales Start and Sales End: D or dash / dash.
- **Editor pre-fill:** "0" for FID, Cluster 5, Operational Lifetime, Sales Start and Sales End (`Coalesce(…,"0")`).
- **Technology labels** come from the generated choice map, so "BESS" no longer shows as "Bess".
- **Inputs:**
  - canvas control names as test ids;
  - `maxLength` 256;
  - a red border per invalid cell, including blank initial cells;
  - success-rate decimals validated in the player's language;
  - durations validated with no trim, as `IsMatch` does.
- **Save** is wired: one update per changed row, changed columns only.
- **Removed:** `SUMMARY_TABLE_FIELDS` and `buildMilestoneSummaryRows`, which followed a screenshot rather than the canvas.

**SOURCE DEFECTs fixed:**
- The save texts were set and cleared in the same step, so they were never seen. They are now shown, and the "Standart" typo is corrected to "Standard".

**DIVERGENCE kept from the canvas:** the duration message says "positive", but 0 is accepted.

**Tests:** UT-ADMILE-006, 007, 032 and 034–038, and screen tests 901–904.

## D22 · Admin Project Gates Approvals (screen 004) redeveloped and connected (19 Oct 2026)

> **Implementation replaced on 22 Oct 2026 (D36).** The decisions below still record the canvas analysis; the code is the RounakDev1 version. `src/components/PeoplePicker.tsx` is still used by PM; this screen now uses its own `PeoplePickerField`.

**Scope:** rules, UI, data and docs (`src/features/admin/admin-gates-approvals/`, `src/data/adminGatesApprovals.ts`, new kit control `src/components/PeoplePicker.tsx`).
- **Tables:** none registered. All seven were already in `power.config.json`: `vsb_countries`, `vsb_projectstates`, `vsb_projectdefaultapprovalses`, `vsb_checklistdefaultapprovalses`, `vsb_projectdefaultchecklistses`, `vsb_checklistcountryandtechnologies`, and `'Microsoft Entra IDs'` = the virtual table `aadusers` (key `microsoftentraids`). `ES.aadUsers = "aadusers"` was added to `dataverseNames.ts`; the unverified `ES.microsoftEntraIds` (`vsb_microsoftentraids`) is left for the not-yet-connected General Data and Team screens.
- **Flows and plugins:** none fires on `vsb_projectdefaultapprovals` or `vsb_checklistdefaultapprovals` (04-flow-inventory.md, verified 19 Oct 2026; no Dataverse trigger and no SDK step). `PerformCommonRequestofGateApproval`, `PerformCommonRequestofCheckListApproval`, `ComposeChecklistItems` and `RequestApproverApprovals` only **read** these rows later, from PM Checklist, so the persona JSON shape (`PersonaKey` / `PersonaName` / `PersonaRole`) is kept exactly. This screen starts no approval flow and sends no mail, so nothing on it falls under brief rule 4.
- **Permission:** `canEdit = useAdminAccess()`. The invented country-scope rule (`canEditScope`) was removed (brief rule 8).
- **Hidden controls:** `but_…_Form_Buttons_Reset` (Select()-ed by Save, Cancel, Close and Reset Gate) = `closePanel`; `lbl_…_Item_Hidden_Order` (read by the check-list gallery) = the gate row's id.

**Corrected (would have failed or shown wrong data):**
- **Columns:** check-list `Gate active` is `vsb_gateisactive` (the code wrote `vsb_gateactive`); check-list PM nav `vsb_PortfolioManagerId` (was the gate nav); template nav `vsb_ProjectDefaultCheckListId` (was `vsb_ProjectDefaultCheckList`); gate PM nav `vsb_Approvalparticipant1` (case). Two payload builders now, one per table.
- **People source:** `aadusers` (`accountenabled eq true` — a Boolean, not `952850000`; `contains` on `displayname`, `givenname`, `surname`, `mail`). `PersonaKey` = `aadusers.id`; the PM bind is `/aadusers(<PersonaKey>)` (for `aaduser` the key is the object id, as in `data/comments.ts`).
- **Country rail:** Spain, Greece and Romania are excluded, as the canvas `Countries` input does (`UT-ADGATE-001d` asserted the opposite).
- **Draft rule:** keyed on the gate's STATE name ("Draft"), not the transition label, and only on the gate branch. The panel toggle's lock uses the state name too.
- **Reset Gate:** writes exactly `{Gate active: false, Portfolio Manager, Default Contributors, Default Approvals, Default Notifications: blank}`, `false` also for Draft (canvas parity).
- **Save:** country, cluster state, technology (gate) and the template (check list) are written on every save, as the canvas does (they were create-only).
- **Gate description:** `Switch(Order, 0, "Draft to Cluster 1", "Cluster n to Cluster n+1")`.
- **Gate dropdown labels:** next state looked up over all states (not only visible ones), text sort on Order.
- **Person cells:** "Name / (mail)" blocks, collapsed to "N Contributors / N Approvers / N Notifications" from 4 people; the check-list Notifications rule (`(C<4 && A<4 && N<4) || N = 1`, ";" separators); per-cell tooltips; gate PM shows the name only.
- **Pickers:** `MaxPeople` 1 / 20 / 5 / 20; remove (×) per person; suggestions hide people already selected (not on the PM picker); canvas tooltips.
- **Add Task** stays visible when its gate is collapsed; Collapse shows whenever the gate has check-list rows.
- **Check List options** exclude templates already approved in the gate (create) or show only the record's own (edit).
- **Check-list status chip** wired (it was hard-disabled). **Gate chip** toggles with no confirmation (the invented dialog was removed).
- **Duplicate gate rows:** the first wins, as `LookUp`.
- **Asterisks:** none on Gate or Approval Mode (canvas `Visible: =false`).
- **Texts:** the canvas progress texts (save gate / save check list / delete), the success text "Approvals was successfully saved." and the save error text are shown through `WriteFeedback`.
- **Removed:** `NotConnectedNotice`, `canEditScope`, `planDeleteGateApproval` / `MSG.noGateDelete` (no canvas source), `MSG.deactivate*`, `MSG.deleteChecklistTitle`, `PANEL_LABELS.titleTask`, `MSG.noApprovals`, `MSG.addTaskAllApproved`, `personLines`.

**SOURCE DEFECTs fixed:**
- A blank Check List combobox showed "The cluster cannot be blank." but left Save enabled, and the save failed on the required template lookup. Save is now blocked; the wording is kept.
- The delete dialog's last line and the delete progress text read the panel combobox (`drp_…_State_1.Selected.Name`), i.e. a stale name. The deleted row's own template name is used.
- The check-list panel title tested the gate variable, so it showed whichever title the last gate panel left. Now "Add Approvers" for a new check-list approval, "Edit Approvers" for an existing one (gates stay "Edit Approvers", as the canvas always had a gate row).
- The check-list Edit pre-filled the Portfolio Manager from `Users` with columns the picker does not read, so it always showed empty. It is resolved from Entra, as for gates.

**DIVERGENCEs kept:**
- No row is created when Edit / Add Task is clicked (the canvas leaves an orphan on Cancel); the row is created on Save. Reset Gate is therefore disabled until the gate has a row.
- The canvas silently resets a non-Wind/PV gate on Edit; a banner is shown instead (unreachable from the Wind/PV picker).
- The Add Task check is scoped to the country × technology; for real data it equals the canvas whole-table check (a template belongs to one scope), pinned by `canAddChecklistApprovalCanvasParity`.
- New progress texts (marked NEW) for the status chips and Reset Gate, which had none.
- A placeholder gate (no row) shows no status chip; the canvas showed a disabled chip with the table default.
- Not ported: the rail flag images (`'Flag Image'`), and canvas test ids on the non-interactive error labels.

**Tests:** UT-ADGATE-001, 001c–e, 002–003, 005–027 (001d, 010, 017–019b, 021, 025 rewritten), 028–033f, 035–049, and screen tests 901–909. Removed: 001b (country scope), 004 (no assertion) and 034 (gate delete). `ScreenRoutes.test.tsx` lists the screen as connected.

**Product-owner answers (19 Oct 2026):**
1. Reset Gate on the Draft gate writes `Gate active = false`, while Save forces Draft to active. **Keep both, as the canvas does.** No change.
2. `contains` / `eq` on the Graph-backed `aadusers` virtual table (people search and PM lookup) is still **untested live**. The product owner asked to be told when to try it. It is item 1 of the next local smoke test (`pac code run`); see `08-SESSION-HANDOFF-2026-10-19.md`.
3. Non-Wind/PV banner: **kept** ("Yes, same as Canvas App"). Note: the canvas itself shows no message there; it silently resets the row on Edit. The banner stays because the answer was "Yes" and the case cannot be reached from the Wind/PV picker. If "same as Canvas" was meant literally, replace `nonWindPvBanner` with a silent reset in the Edit handler.
4. Dataverse privilege on the two default-approval tables: **same as today**. Only the client-side admin rule (`useAdminAccess`) guards them; no Dataverse privilege is planned.

## D23 · Admin Contract (screen 005) redeveloped and connected (19 Oct 2026)

> **Implementation replaced on 22 Oct 2026 (D36).** The decisions below still record the canvas analysis; the code is the RounakDev1 version.

**Scope:** rules, UI, data and docs.
- **Code:** `src/features/admin/admin-contract/` and `src/data/adminContract.ts`.
- **Shared changes:**
  - `data/executePlan.ts` and `data/writePlan.ts` gained `createdRowRef(n)`, an indexed created-row reference that also works inside a bind (UT-PLAN-005/006).
  - `FormPanel` takes an optional `closeTestId`.
  - `buildCountryPicker` takes an optional `technologies` list.
  - `CHOICE_ADMIN.bopContractTypes` now has the right values (D15-d).
- **Tables:** **registered `vsb_bopcontractsstandardassumptiondevcocosts`** (43 in total; exactly one added, none dropped). Also read: `vsb_countries` (with `vsb_isocurrencycode`), `vsb_capexaccountlists` (via the shared `listAllCapexAccounts`, same key) and `vsb_bopcontractsstandardassumptionses`.
- **Flows and plugins** (assemblies read from the solution zip, 04-flow-inventory.md updated):
  - Creating a DevCo cost fires `DevCoCostRootCapexPlugin`, which sets `vsb_rootcapexaccount`.
  - Deleting a contract fires `VSB.BoPContractAssumptionDeletion`, which removes the contract's template DevCo costs, every project's `vsb_bopcontractsdevcocosts`, and every `vsb_bopprojectscontracts` built from it. The DevCo-cost relationship is `CascadeDelete = Cascade` as well.
  - No flow fires.
- **Permission:** `canEdit = useAdminAccess()`. The invented country-scope rule (`canEditScope`) was removed (brief rule 8).
- **Hidden controls:**
  - `btn_Add_Edit_AdminContracts_Reset` → the panel form is rebuilt on open.
  - `btnGeneralPurposeReset` → query invalidation after a write; the caps come from the live list.
  - `fn_Numeric_AdminContracts` → `domain/powerFxNumeric`.
  - Not ported: the hidden duplicate tri-state checkbox and the debug label.
- **Not ported:** Apply / Apply to All, their info texts, the last-Apply labels and the `Apply and Apply All Trackings` write (D20). Also the rail flag images.

**Corrected (would have failed or shown wrong data):**
- **Contract types:** 952850001 / 952850002 (the code used 952850000 = None and 952850001). The caps, card types and payload were all off by one.
- **Primary keys:** `vsb_bopcontractsstandardassumptionsid` and `vsb_bopcontractsstandardassumptiondevcocostsid`.
- **DevCo Country and Technology:** `crc36_country` (bind `crc36_Country`) and `crc36_technology`.
- **No client RootCapexAccount write:** the plugin sets it, and the code's level-2 "root" was wrong anyway. No Owning Business Unit is written on either table, as the canvas.
- **Delete:** the parent row only. Dataverse and the plugin remove the rest; the code's explicit child deletes were removed.
- **Rail:** Wind, PV and BESS under every country (the canvas `Nestings`). The rail opens on Germany / Wind.
- **DevCo Cost Form:** grouped by **level-1** category, with all its level-3 accounts listed flat and sorted by number. Every category is listed. The open header is highlighted. A used account renders **ticked**, locked and orange (`Or(Selected, Used)`).
- **Cards:**
  - They fold independently; a saved card opens.
  - Margin Type and value show only when Margin = Yes.
  - The fixed-value heading uses the country's ISO currency code (fallback EUR). The panel keeps its Poland → PLN rule, as the canvas.
  - The DevCo group headers end in " :". The names are resolved from the account chart.
- **Panel defaults:** Closing Date Reference defaults to Cluster 4 (new or blank), and Margin Type to Percentage for a new contract. Changing Margin or Margin Type resets both values to 0.
- **Validation texts are the canvas `gblAppResx` strings:** "Input must not be blank", "Numeric value with maximum of one decimals" / "… two decimals", and "Please select a value between 0 and 100.0" / "… 1,000,000,000". The label is hidden for blank input. The invented "Select a margin type." was removed: a non-Percentage type takes the Fixed branch, as the canvas.
- **Payload:** every save writes Name, Description, Country, Technology and Contract Types, untrimmed, as the canvas (they were create-only and trimmed).
- **Test ids:**
  - `btn_AdminContract_Add_*`: the buttons are in the scope bar, as on the canvas.
  - `ico_Add_Edit_AdminContracts_Close`.
  - `img_Parent_TriState_Checkbox` (it had the hidden checkbox's id).
  - Description `maxLength` 256; Margin values 130.
- **Progress and error texts:** "Please wait, saving...", "Please wait, deleting..." and "Error saving Contract: …", shown through `WriteFeedback`.

**SOURCE DEFECTs fixed:**
- **Save stayed enabled after one tick.** `locContractDevCoCostsCahnged` is never reset, so after the first DevCo tick on the screen, Save's "changed" test passed in every later panel. The panel now always opens clean.
- **The month opened empty.** The month textbox prefill tested `'BoP Projects Contracts'` (the relationship), so a contract no project uses yet opened with an empty month. The stored value is now always shown; `monthPrefillCanvasParity` keeps the canvas rule.
- **Save accepted any month value.** Save checked the month only for non-blank, so "abc" or "123" saved. The month must now match `^\d{1,2}$`; `monthDifferenceSaveTermCanvasParity` keeps the canvas term.
- **Delete failures were silent.** Delete had no `IfError`; a refused delete is now shown.

**DIVERGENCEs kept:**
- The zero month difference opens with "-", exactly as the canvas `> 0` rule. Noted only; it saves 0 either way.
- The canvas could count a header's parent tick as a selection with no accounts. Here only level-3 accounts count.
- Rule 19 load-error and loading states are shown (NEW texts).

**Tests:**
- `rules.test.ts`: UT-ADCONTR-001–044, with 001b, 026 (old meaning), 032 and 033 removed.
- Screen tests 901–905.
- UT-PLAN-005/006.
- `ScreenRoutes.test.tsx` lists the screen as connected.

**Product-owner answers (19 Oct 2026):**
1. The delete dialog **keeps the canvas wording**, even though the server plugin also deletes the project contracts and DevCo costs built from the contract. No change.
2. Technologies on each admin rail: **follow each screen's own canvas, as today.** Contract offers Wind, PV and BESS; Gates offers Wind and PV; Admin Cost (006) takes its list from its own YAML.

## D24 · Admin Cost (screen 006) redeveloped and connected (19 Oct 2026)

> **Implementation replaced on 22 Oct 2026 (D36).** The decisions below still record the canvas analysis; the code is the RounakDev1 version.

**Scope:** rules, UI, data and docs.
- **Code:** `src/features/admin/admin-cost/` and `src/data/adminCost.ts`. The screen is now split into `Screen.tsx` (rail, breadcrumb, the four cards), `DevexSection.tsx`, `OpexSection.tsx` and a shared `styles.ts`.
- **Tables:** none registered; all ten were already in `power.config.json` (see 006 §7).
  - `ES.currencies` was corrected to `transactioncurrencies`. It was the unverified `vsb_currencies`, which the not-yet-connected PM Milestones and Revenues also use.
  - `ES_ADMIN.opexAccounts` and `ES_ADMIN.spvDevCoMapping` were added.
- **Option sets corrected in `CHOICE_ADMIN`:**
  - `costPaidType`: DevCo 952850001, SPV 952850002 (they were swapped, with an invented "Shared").
  - `thresholdType`: Net Yield p75 / p90 / Individual 952850002 (it had an invented "Portfolio").
- **Labels corrected from customizations.xml:** cost units "EUR/MW(p)" / "PLN/MW(p)" (not "EUR/MW"), and aggregation "SUM / MAX / MIN".
- **Flows and plugins:**
  - Deleting a DEVEX/CAPEX standard cost fires `VSB_CapexAssumptionDeletion`, which deletes the project CAPEX contracts and costs built from it (read from the DLL).
  - Nothing fires on the OPEX & Land Lease table. No flow.
- **Permission:** `canEdit = useAdminAccess()`.
  - Removed: the invented country scope (`canEditScope`).
  - Removed: the client privilege gates standing in for `DataSourceInfo` / `RecordInfo`. Per D1, the server decides and its refusal is shown.
- **Hidden controls:**
  - `btn_Filter_Devex_Capex_Assumptions` → `devexRows` and the open-category set.
  - The delete-confirm button → `planDeleteStandardCost`.
  - Both panel reset buttons → the forms are rebuilt on open.
  - `fn_Numeric_CC` → `domain/powerFxNumeric`.
- **Not ported (D20):** Apply / Apply to All, their info texts and tags, the Apply dialog, and the `Apply and Apply All Trackings` upsert, including the one the canvas appends to every DEVEX delete. Also the rail flag images.

**Corrected (would have failed or shown wrong data):**
- **Scope:** the screen opens on the first rail country and Wind, as the canvas picker does. The code app used to show nothing until a pick.
- **Cards:** all four start folded (`IsFolded: true`). The code had them open.
- **DEVEX grid:**
  - children sorted by account order, then subaccount order (the code sorted by description);
  - the Sub-Account cell is "Name - Number", with no account prefix;
  - clusters joined with ",";
  - a comment button with the canvas tooltip;
  - after a save or delete, only the touched category is open.
- **DEVEX payload:**
  - every column on every save (Country, Category, Subaccount and Technology were create-only, so an edited subaccount was lost);
  - Apply VAT and Depreciation `true`, Distribution Frequency 3 (fixed and disabled, as the canvas);
  - Name and Description untrimmed;
  - no Owning Business Unit (the canvas writes none).
- **DEVEX panel:**
  - Category and Sub-Account options (fewer than 50 costs per subaccount);
  - a category change clears the subaccount; a subaccount change back-fills the category and takes the SPV/DevCo mapping default;
  - unit options per technology and country, with the canvas unit error "EUR/WTG only applicable for Wind" (it read "A per-WTG unit can only be used for Wind.");
  - MaxLength 30 / 10 / 55.
- **OPEX grid:**
  - Period 1 rows with the +/− contract collapse; later periods hidden while collapsed;
  - Delete only on Period 1 and the last period;
  - "Add Period" only under the last period;
  - the OTP column for Land Lease only;
  - the canvas cell formats: cumulative end date "COD + y Years m Months", "n years" / "n months", the currency name, and inflation "No" / "Country Inflation" / %. The number formats reuse the Cost Land Lease grid's.
- **"Add Contract Type":** a menu with one item per family subaccount ("TCMA" / "E&CM" relabels), disabled once a contract of that subaccount exists in the scope.
- **OPEX panel:**
  - Description and Start Date are derived and locked.
  - Inflation Start Year is the literal "Cluster 6 : Operation + 1 Year".
  - Currency is locked to EUR / PLN.
  - Secured, Allocate to all WTGs, One-Time Payment, Threshold and Align are hard-wired, as the canvas.
  - The inflation, Area, payment and External Contract fields are editable only for Period 1 or a new contract.
  - The canvas defaults: inflation on for O&M / Other, Sum, and months 0 once a year is chosen.
  - Every field error uses the verbatim canvas text.
  - The "at least one commercial figure" hint blocks Save.
- **OPEX payload:**
  - now also writes `vsb_startdatestring`, the currency bind and `vsb_externalcontract`;
  - `vsb_inflationarea` and `vsb_inflationcountryarea` get the Area text (they got a boolean or an id);
  - no Owning Business Unit (its write is commented out in the canvas).
- **Texts:** the canvas progress texts ("Please wait, saving...", `Please wait, saving "<description>"...`, "Please wait, deleting...") and the three error texts are shown through `WriteFeedback`.

**SOURCE DEFECTs fixed (each with a parity twin where it applies):**
- **Save stayed enabled.** DEVEX `locEditSaveButtonEnabled` was never reset when Add Cost or Edit opened the panel. The panel now opens clean.
- **DEVEX save failures were silent.** The save had no `IfError`; a failure is now shown.
- **The Cost Paid By default could go missing.** It tested the SPV mapping by account number but read it by subaccount lookup. It now matches by lookup, else by number (`mappedCostPaidByCanvasParity`).
- **External Contract flipped on Edit.** A stored "No" opened and saved as "Yes", and the TCMA test was case-sensitive (`externalContractDefaultCanvasParity`).
- **An 11th "Add Period" created a second Period 1.** Add Period is now blocked at ten periods (`nextPeriodCanvasParity`).
- **The wrong row became the last period.** After a period delete the new tail was picked by Description, so "X - 10" sorted before "X - 2". It is now the highest remaining period (`newTailCanvasParity`).
- **A stored 0 rate opened blank.** `Text(0, "#")` printed nothing, so a stored 0 was saved back as blank. It now shows "0".
- **Payment sections went stale on Edit.** Edit kept the previous Add Period's second and third payment sections; they now come from the reference row on Add Period only.

**DIVERGENCEs kept:**
- Grid Yes/No columns show the two-option labels "Yes" / "No".
- Rule 19 load-error and loading states are shown (NEW texts).
- The DEVEX category and subaccount pickers are dropdowns, not searchable combo boxes; the canvas search placeholders are kept.

**Tests:**
- `rules.test.ts` rewritten. Ids were kept where the case survives; 001b, 028 (old meaning), 030/031, 041–045, 047 and 049 were removed with their code.
- Screen tests 901–908.
- The jsdom dialog lookups in 004 / 005 / 006 now use `hidden: true`. Tabster's modalizer can leave the dialog surface `aria-hidden` in jsdom, which caused the earlier flaky failures.

**Open questions for the product owner:** none blocking. The hard-wired toggles, the Apply exclusion and the opening scope follow the canvas or standing decisions.

## D25 · PM General Data (also New Project) redeveloped and connected (19 Oct 2026)

**Scope:** rules, UI, a live Dataverse connection for **editing an existing project and creating a new one** (creation added by the PO on 20 Oct 2026, see below), and docs.
- Code: `src/features/pm/general-data/` and `src/data/generalData.ts`.
- Gap report: `gap-analysis/pm-general-data.md`.

**Tables registered** with `pac code add-data-source`, one at a time. The `"primaryKey"` count went from 43 to 48: exactly one table was added each time and none was dropped. `check:power` reports 48 registered and 0 problems.
- `vsb_projectstatetracking` (`vsb_projectstatetrackings`).
- `vsb_shareholderentitiy` (`vsb_shareholderentitiies`). This is the canvas `ShareholderEntityInProjects`. `ES.shareholderEntityInProjects` is corrected to this name; it was the unverified `vsb_shareholderentityinprojects`.
- `vsb_customchoicevalue` (Terrain Utilization).
- `vsb_assumptionslocaltaxgermany` and `vsb_assumptionslocaltaxfrance`. These are **Dataverse tables**, not Fabric SQL, despite the canvas names `colAssumptions…SQL`. They are connected.

Already registered and reused:
- `vsb_project`, `vsb_country`, `vsb_countryarea`, `vsb_projectstate`;
- `aaduser` (the canvas `'Microsoft Entra IDs'`), read through `searchEntraPeople` / `getEntraPeople`;
- `vsb_milestonesstandardassumptions`, read through `loadMilestoneDurations`.

`Project Default Approvals` is not read: it only fed the cancellation flow, which is not called.

**Left out (product decisions):**
- ~~Creating a project~~ — **reversed by the PO on 20 Oct 2026; creation is now in scope** (see "Creating a project" below). `MSG.createExcluded` was removed from the code.
- **The gate-approval cancellation flow** (`PerformRequestofGateApprovalCancellation`, which sends mails and Teams cards). It is never called.
  - A start-cluster change is **refused**: Save is disabled and the NEW text `MSG.approvalInProgress` is shown.
  - This happens exactly where the canvas would have called the flow: the Draft tracking has a `FlowRunId` and is In Progress.
  - This is the safest option. A rebuild without the flow would blank `FlowRunId` and leave the approval live in Outlook and Teams, with nothing pointing at it.
  - Every other start-cluster change saves and rebuilds the trackings as the canvas does.
  - **Decided (PO, 19 Oct):** keep the refusal. The Power Automate flow owns that change; when it has responded, the user refreshes.
- **Not ported, because it is dead in the canvas:**
  - the generator re-price (`locNeedPlantCostsRecalculation` is never set true);
  - `locIsUserInControllingGroup` and `locSubTechnologyVisibility`;
  - the hidden `…_Save_2` / `…_Reset_3`.
- **Documented gaps:**
  - **The map control.** No map library was added. Lat and Lng stay typed inputs, a placeholder is kept, and the location confirmation never opens.
  - **The unsaved-data leave guard.** The app uses a `HashRouter`, so it needs a data router in the shell, which is outside this screen's remit. The dialog texts are kept in `rules.ts`. **→ Built 20 Oct 2026: the shared `UnsavedChangesGuard` (D35).**

**Server automation fired by the writes** (verified against `04-flow-inventory.md`):
- **`UpdateTeamsandSPOSite`**, on `vsb_clusterstate`. Every save writes this column, as the canvas does. The flow acts only when the audit shows a real change and the country is Croatia.
- **`SynchroniseProjectState`**, on the tracking column `vsb_approvalclusterstate`. It fires for the tracking rebuild and for the Draft tracking create.
- **Plugin steps:** none fire. This screen writes none of the filtered project columns.
- **`WhenProjectDatagetsupdated-SendE-MailCardtoPortfolioManagers`** — not needed (PO, 19 Oct); no longer an open item.

**Creating a project (PO decision, 20 Oct 2026).** Add Project creates and saves a draft project from General Data with no `projectId` (`/project/general`).
- **Validation:** the same canvas required-field list and Save gates as an edit, including the exactly-100 % ownership gate. The canvas has no create-only validation.
- **Create defaults** come from Patch #1's `If(IsBlank(project), Defaults(Projects), project)`: Approval States Draft, Cluster State Draft, Share of Farmdown 50, Is Standard Share of Farmdown Yes, Standard Cost Created No, and Start Cluster Greenfield unless Acquired. The owning business unit is `Countries.'Besitzer (Unternehmenseinheit)'` of the selected country (`planProjectCreate`). A create carries no `@odata.bind: null` keys.
- **Two write jobs, in the canvas order:**
  1. Patch #1 creates the `vsb_projects` row.
  2. The new row is re-read, because Patch #2 needs the autonumber 'Project ID' (`vsb_name`) that only exists after the create — the canvas does the same `LookUp`. The follow-ups are then written (`planSaveFollowUps`): Patch #2 (the Internal Project ID back-fill and `Countries.'Business Unit'`), the shareholders, and the Draft tracking create. For an Acquired project with a start cluster, the full tracking rebuild runs instead, because the pre-save start cluster is Greenfield (`createdProjectSnapshot`).

  `CREATED_ROW_ID` is not used, because the follow-ups need the re-read *value* of `vsb_name`, not only the id; they bind to the returned id directly.
- **Server automation:** `CreatingTeamsandSPOSite-ProjectCreation` (`vsb_project` Added, Organization scope) fires on the server. The client never calls it and does none of its work.
- **After the save:** the canvas success text is shown, and the screen switches to the new project with `navigate("/project/general?projectId=<new>", { replace: true })`, so the session loads it and the left navigation works, as the canvas sets `gblRecordSelectedProject`. The navigation waits until the form is clean, so the leave guard (D35) never blocks it. If the follow-up job fails, the screen still switches to the new project, because the project already exists and must not be created twice. The error stays visible.
- **Errors** use the canvas text "Error: Project could not be saved. …". There is one NEW text, `MSG.createReadBackFailed`, for a create that cannot be read back.
- **Tests:** UT-GDATA-027 (updated), 080–082, and screen tests 906 (updated) and 909 (create plan, payload, binds, defaults, follow-ups, post-create navigation).

**Write order.** One `WritePlan` (`planGeneralDataSave`) runs these writes in turn:
1. Patch #1.
2. Patch #2: Internal Project ID and `Countries.'Business Unit'`.
3. On a start-cluster change only: Cluster State is forced to Draft, then one tracking is written per checklist cluster.
4. When the shareholders changed: their creates and updates.
5. When it is absent: the Draft tracking create.

The owning business unit is bound as follows:
- Patch #1 uses `Countries.'Besitzer (Unternehmenseinheit)'`.
- Patch #2 uses `Countries.'Business Unit'`.
- The child rows take the Patch #2 value.

The cluster panel's milestone patch runs as its own job, before the main save. A shareholder delete runs at once from the dialog, as on the canvas.

**Corrected (would have failed or shown wrong data):**
- **Logical names:**
  - 'Project Name' is `vsb_projectname`. The code wrote it into `vsb_name`, which is the Project ID.
  - 'Project ID' is `vsb_name`.
  - 'Is 2-Project development Standard Assumption ?' is `vsb_feasibilitystudiesstandardassumption`.
  - The navigation properties are `vsb_CountryArea`, `vsb_TerrainUtilizationLookUp`, `vsb_Projectmanager` and `vsb_DeputyprojectmanagerEntra`. The two manager lookups bind to `aadusers`.
  - A country's areas are filtered on `_vsb_areascountry_value`.
  - The Countries `Key` is `vsb_title`.
- **Choice columns** are written as Dataverse option values; the labels are transcribed from the solution option sets. Every hard-coded value list (Project Type, SPV Legal Structure, Development Type, Start Cluster, Technology, Shareholder Entity Types, and the approval values the save writes) is **pinned to the pac-generated enums** by UT-GDATA-076–078, so a schema change in Dataverse fails the suite (PO answer 9).
- **Area:** when nothing is picked, the existing value is kept (`Coalesce`) instead of being cleared.
- **Reverted to the canvas.** These had been changed to match GUIDE screenshots, without a log entry:
  - the ownership sum must be exactly 100 % to save (confirmed by the PO, 19 Oct);
  - SPV Company Code is required once SPV Name is set (confirmed by the PO, 19 Oct);
  - the Latitude format text is `##<sep>######` with no final period, and Longitude is `###<sep>######.`; the separator follows the language (confirmed by the PO, 19 Oct).
- **Validation and the Required-fields list:**
  - the list follows the canvas `ibtn` order, including the "…has to be 100 %" row and the terrain row's own text;
  - terrain size is checked only for country key 25;
  - the range and price bounds are formatted per language;
  - Custom Name shows only for Third Party, with "Input must not be blank";
  - the ownership range text is the canvas one;
  - Add is disabled at 100 %, and the panel hides its fields when the sum is full.
- **Field side effects:** `Reset` restores the record's value, not a blank:
  - on Country: terrain, French municipality and SPV legal;
  - when SPV Name is emptied: code and legal;
  - on Development Type: start cluster, acquisition date and acquisition price.

  Tax Factor goes blank on a Country or Area change and on a French pick.
- **Locks wired:** Technology (Order ≥ 1); Development Type and Start Cluster (Order > 0, Acquired only); Acquisition Date; Area; and Country (Approved, or out of scope). The name asterisks are hidden when the project is Approved. Project Name and Short Name stay editable, per the 1.21.753 delta; `fieldModesCanvas709` keeps the old rule.
- **The cluster-change panel:**
  - an upward view, read-only, listing what will be deleted;
  - pickers are editable only for `new ≤ i < previous`;
  - FID, Cluster 5 and Cluster 6 are read-only and never report "blank";
  - the canvas info text and the canvas Start text;
  - CalendarAdd buttons: Wind/PV only, previous date plus the average duration, marked standard;
  - the exact canvas payload: each flag is `false` above its threshold and `null` below it.
- `startClusterChanged` is `old ≠ new`, not the classifier's result.
- The invented log line "Draft approval tracking was created." is removed.
- **Rule 16 (labels):**
  - every field carries its canvas `AccessibleLabel`. To allow this, the shared components gained optional props: `ariaLabel` and `counter` on `TextField`, `ReadOnlyField` and `PeoplePicker`; `closeLabel` on `FormPanel`; `saveLabel` and `cancelLabel` on `PanelButtons`;
  - the Project Name label has no trailing spaces: the spaces in the YAML sit outside the string;
  - three canvas names differ from their control names: the French combobox is `…_France` (no `_1`), the panel pickers have no `_1`, and the close icon reads "Close Cluster Change panel";
  - the Shareholder Entity dropdown reads "Shareholder Entity", not the canvas typo (see SOURCE DEFECTs);
  - the footer name and date have their own test ids and the canvas three-space join.

**SOURCE DEFECTs fixed:**
- **Empty Project Manager picker.** The canvas lookup picked the first Entra row. The plan is now refused.
- **Ownership error label.** Its Text and Visible disagreed, so an out-of-range decimal showed the shape text. It now shows the range text.
- **Duplicate shareholder entity.** It could be saved although "already added" was shown. It is now blocked; the canvas gate is kept as `canSaveShareholderPanelCanvasParity`.
- **AccessibleLabel typo (PO decision, 19 Oct).** The canvas AccessibleLabel of `drp_GeneralData_RightPanel_ShareholdingEntity_InpForm_BodyForm_EntityName` is "hareholder Entity". The aria-label is now "Shareholder Entity" everywhere in the code app. The element carries `canvas-identity-ignore` with the canvas original cited, because it now differs from the canvas (C4).
- **Tax Factor fallback by municipality.** The canvas looked the project's municipality up in the German trade-tax table for any country. Only that table carries a rate (`vsb_tradetaxrate`; the French table is a municipality list, and no other table holds a rate). Fixed (PO decision, 19 Oct): the fallback applies to German projects only (`taxFactorFallbackMunicipality`). France keeps the canvas behaviour (a French pick clears the tax %); other countries are manual entry. The canvas rule is kept as `taxFactorFallbackMunicipalityCanvasParity` (UT-GDATA-079).
- **Delete dialog name.** It named saved rows by their type and unsaved non-Third-Party rows by a blank. It now uses the gallery's name; the canvas version is kept as `deleteShareholderNameCanvasParity`.

**DIVERGENCEs:**
- Dirty is derived from the save-relevant fields, so reverting a value makes the form clean again.
- Cancel also discards the edited shareholding list. The canvas kept it and wrote it on the next Save.
- The picker search and pre-selection use `aadusers`, not Office 365 Users — **approved by the PO, 19 Oct**.
- The municipality lists are server searches of 50 rows. The German one needs at least one typed character.
- The Notify texts name the table instead of `FirstError.Source`.
- NEW texts: the load-error state and the two exclusion reasons.

**Tests:**
- `rules.test.ts`: 88 tests. Ids were kept where the case survives; 060–079 are new.
- Screen tests 901–907.
- `ScreenRoutes.test.tsx`: General Data is now in `CONNECTED_PROJECT_HEADING`, with `@/data/generalData` mocked.

**Decided by the product owner (19 Oct 2026):**
1. Start-cluster change while a Draft gate approval runs: stays refused; the flow owns it and the user refreshes afterwards.
2. `WhenProjectDatagetsupdated-SendE-MailCardtoPortfolioManagers`: not needed.
3. Ownership must total exactly 100 % to save: yes.
4. SPV Company Code required once SPV Name is filled: yes.
5. The restored Latitude / Longitude format texts: correct.
6. `aadusers` instead of Office 365 Users: accepted.
8. The AccessibleLabel typo "hareholder Entity": corrected to "Shareholder Entity" (SOURCE DEFECT above).
9. Option sets: labels kept; the values are pinned to the generated schema by tests.
10. Tax Factor fallback: German projects only (SOURCE DEFECT above).

**Still open:**
7. **The map control — PARKED (product owner, 19 Oct 2026).** The PO wants both the map (with click-to-set location) and the Lat/Lng inputs, using the same map service as the canvas app. The canvas `Map@1.8.27` control uses Azure Maps through a Microsoft-managed Power Platform account that is not exposed, so a code app cannot reuse it. To build the map, the app needs its own Azure Maps account: Azure portal → create an "Azure Maps" resource → Authentication (a primary key, or Entra auth, which is preferred for a browser app). The key or client id then goes in a Dataverse environment variable, and `atlas.microsoft.com` must be allowed in the code app's content security policy. Until then the Lat/Lng inputs work and the map area stays a placeholder.

- **UI layout pass (20 Oct 2026).** Layout only, from the canvas containers: the "General" header band (70 px, Grayscale30, bold 16), the group headers (50 px, Semibold 16, default colour, 1-px Grayscale20 rule inset 20), 300 × 70 field cells in wrapping rows instead of a stretched 3-column grid, Placement fields (FillPortions 3) beside the map placeholder (FillPortions 2), the Shareholding block capped at 3 cells wide (command bar 40 px, info strip, 38-px header, 26-px rows, 20-px icon-only Edit / Delete), and the bottom bar in canvas order (Cancel, Save, Required fields left; the record stamp right), sticky at the bottom of the scrolling content. Not matched: the canvas `LGroup.Width = Parent.Width / 2` would make the Placement cells ~113 px at 1366, so they stay `Min(…/3, 300)` of the fields column. No behaviour, caption, `aria-label` or `data-testid` changed. The shared layout pieces are in `general-data/pmLayout.ts` (also used by Milestones) until consolidated into `@/components`.
- **Modern field skin + General Data parity (20 Oct 2026).** UI only; no rule, hook or data change (one new pure helper, `auditStampParts`, UT-GDATA-083). The product owner compared the live canvas with the code app. The shared field primitives (`components/Fields.tsx`, skin in `components/fieldSkin.ts`) now render the canvas modern controls (`ModernTextInput` / `ModernCombobox` / `ModernDatePicker` / `DropDown@0.0.45`): a filled grey box with no outline (Fluent `filled-darker`, fill `Grayscale30`), the red `*` before the caption, and the `{Len}/N` counter right-aligned on the caption row. Read-only now follows the canvas `DisplayMode`. `View` (`readOnly`, also `ReadOnlyField`) keeps black text and stays focusable. `Disabled` keeps the greyed look. On General Data: Project ID, and Project Name / Short Name / Technology / Country / Area when locked, are View. Development Type, Start Cluster and Acquisition Date are Disabled, as their canvas formulas say. Latitude / Longitude are right-aligned (`Align.Right`). The shared `PeoplePicker` (also Admin Gates Approvals) shows each person as a chip (initials, name, ✕) inside a box with a dark 1-px outline; the full "Name (mail)" is the chip tooltip. Municipality Germany / France is a searchable `Combobox`. Shareholding: grid ≤ 910 px, Add + note ≤ 810 px, Ownership / Actions headers right-aligned, Add / Edit / Delete icons filled `themePrimary`. The Add button's 100 % gate (`Sum < 1`, Y:4533) already existed. Footer stamp: right-aligned labels, then the name and the date in separate columns. The "General" band is sticky while the form scrolls. Placement cells are 270 px, and the map placeholder is ~580 px (3 : 2, capped). Not matched: a View-mode dropdown keeps its chevron (the list just never opens). Dropdowns stay 2 px taller than text inputs (Fluent sizes). The other PM screens' own local `Dropdown`s do not wear the skin yet; they can adopt `useFieldControlClass` + `FIELD_APPEARANCE`. The Cost screens' `CostField` / `CostSelect` are unchanged.
- **PO feedback (21 Oct 2026), N6–N8 in `PM-OPEN-QUESTIONS-2026-10-20.md`.**
  - **DIVERGENCE N6:** the grey "General" band is removed; the groups start at the top of the form.
  - **N7:** the user badge now sits inside the header on every screen. Its margins are in the Griffel `userPill` style; Fluent dropped the plain `canvas-user-pill` class.
  - **N8:** Placement uses the same 300 px cells as Basic Information (it was 270 px), and Municipality fills its cell. The shared skin's `Field` gets `alignContent: start`, so a dropdown no longer sits 6 px lower and taller than a text input in the same row. This supersedes the "2 px taller" note above, for every form that uses the skin.

## D26 · PM Milestones (Project General Milestones Screen) redeveloped and connected (19 Oct 2026)

**Scope:** rules, UI, a live Dataverse connection (reads and the save), and docs.
- Code: `src/features/pm/milestones/` and `src/data/milestones.ts`. `data/costBook.ts` gained `loadMilestoneAssumptionValues` (the same assumption query, blanks kept); `loadMilestoneDurations` now wraps it. `data/usePlanWrite.ts` gained an optional `success(plan)` function (additive).
- Gap report: `gap-analysis/pm-milestones.md`. Canvas: `Project General Milestones Screen.pa.yaml` (solution 1.21.709).

**The "formally blocked" status is cleared.** `PROJECT-MAP.md` / plan 010 call the screen blocked by the missing `ForaProjecttriggerFabricDEVEX/CAPEXrecalculation` flow. That call and its `Fabric Sync Jobs` insert sit inside a `/* … */` block in the save (Y:475-501): the live canvas never runs them. Nothing on the screen calls a flow, so no control had to be disabled for a flow. What the missing flow would have done: after each save, insert a `Fabric Sync Jobs` row (`Job Status` Dirty, `Job Type` "Project Milestones changed", regarding the project) and ask Fabric to recompute the project's DEVEX/CAPEX costs for the new dates.

**Tables registered** with `pac code add-data-source`, one at a time. The `"primaryKey"` count went from 48 to 52: exactly one was added each time, none dropped. `check:power` reports 52 registered and 0 problems.
- `vsb_projectrevenue` — the COD guard (individual-volume contracts) and the seed-notice row count.
- `vsb_estimationpriceinflation` — the FID re-pricing index.
- `vsb_fabricsyncjob` and `vsb_fabricjobtype` — the "Currently recalculating this projects CAPEX costs." notice (`Icon3.Visible`). `ES.fabricJobTypes` was added.

Already registered and reused: `vsb_project`, `vsb_country` (the country's `'Business Unit'`), `vsb_projectstate` (via `listProjectStates`), `vsb_milestonesstandardassumptions`, `vsb_generatortypeinproject`, `vsb_generator`.

**Not connected (product decisions):**
- **The default `Project Revenues` seed** (Y:509-1135). Its inputs are `Assumptions Revenues SQL`, which really is a Fabric SQL source (`References/DataSources.json`: `[dbo].[AssumptionsRevenue]` on a Fabric datawarehouse), so it stays unconnected (D2). The rules (`buildDefaultRevenue`) are kept and tested; the save passes no draft. A NEW notice (`MILESTONES_SCREEN_TEXT.revenueSeedNotConnected`) shows while the canvas seed would run (Draft / Cluster 1, no revenue rows). `vsb_revenuesubaccount` is therefore not registered. When the seed is connected, re-check `REVENUE_COL` against `Vsb_projectrevenuesModel` (not done here) and the 1.21.753 Italy changes (gap D20-D22).
- **The unsaved-data leave guard** (`cmp_PopUp_Leave_Milestones_Confirmation`): the header logo and left navigation are the app shell's, and the `HashRouter` has no navigation blocker. Same gap as D25. The dialog texts stay in `rules.ts`. **→ Built 20 Oct 2026: the shared `UnsavedChangesGuard` (D35).**
- No approval, project-create or Apply control exists on this screen.

**Server automation fired by the writes** (verified against `04-flow-inventory.md` and the workflow JSON filters):
- **Plugin steps on `vsb_project` Update:** `vsb_operationsstartdatecod` (COD shift: senior-debt repayment rebalancing, balancing-price date sync, negative-price sync), `vsb_construction` (senior-debt financial-close shift), and `vsb_construction, vsb_enddate, vsb_operationsstartdatecod` (decommissioning date sync, async). The canvas `Patch` writes all three columns on every save, and so does this app; the plugins do their own work.
- **No flow fires:** `UpdateTeamsandSPOSite` filters on `vsb_clusterstate` and `LoadDevexCapexCostTotalCapacityTrigger` on the plant capacity columns; neither is written. `WhenProjectDatagetsupdated-…` is not needed (D25).

**Write order** (one `WritePlan`, `planSaveMilestones`, run by `usePlanWrite`), as the canvas:
1. Patch Projects: the date chain (skipped clusters blanked), the nine flags, `'Operational Lifetime'` text, Share of Farmdown, and the owner bound to the country's `'Business Unit'` (omitted when the country has none).
2. When the saved FID differs from the stored one: one update per `GeneratorTypeInProjects` row (`vsb_generatorscost`), then a second Patch Projects with `'Plant WTG Cost [EUR]'` = the sum. (Before D26 the plant cost was folded into patch 1.)
Texts: progress "The project is being saved, please wait..", success = the `colProcessingSteps` lines joined `"{Value} \n"`, error = the canvas "Error: Project could not be saved. …" (`projectSaveErrorText`). After a save the project is re-read and nothing is dirty.

**Corrected (would have failed or shown wrong data):**
- Assumption columns: `vsb_cluster6` does not exist. Cluster 5 ← FID + `'Final Investment Decision'`; Cluster 6 ← Cluster 5 + `'Cluster 5'`; the End Date (`Coalesce('Operational Lifetime', 360)` months − 1 day), Sales Start (Cluster 4 + `'Sales Start'`) and Sales Completion (FID + `'Sales End'` = `vsb_salesduration`) buttons now work.
- Generator columns: `vsb_numberofgenerators`, `_vsb_generator_value`, `vsb_generatorscost` (the write went to a non-existent `vsb_totalcosteur`), and `vsb_wtgprice` … `vsb_wtgprice5`.
- Hedge Type "Individual Volumes" is **3** (`CHOICE_FINANCE`); `CHOICE.hedgingType.individualVolumes` (952850001) is wrong and is no longer used here. Option values are pinned to the generated enums by UT-MSTONE-076.
- The "Required fields" list uses the canvas row texts ("Check input for … date."; "Cluster 6 Date." with the capital D); the field-label copy stays under the fields. UT-MSTONE-007/010/047–053 had pinned the wrong text.
- Field error labels follow their own `Visible` formulas (hidden while the predecessor is blank).
- FID `Dirty` is `stored ≠ selected`; every other change sets Dirty.
- Share of Farmdown shows `Text(…, "##0.0")` ("50.0"); the ⓘ tooltip keeps its three lines and is disabled when locked.
- Rule 16: the 11 date pickers and the Save / Cancel buttons now carry the canvas `AccessibleLabel` (their control names) as `aria-label`; the captions stay as field labels / button text. The Required-fields InfoButton (`ibtn_…_Requered_Fileds_1`) and the footer values (Created By / Created / Modified By / Modified, ShortDateTime24) were added with their canvas test ids.
- The lock banner uses the canvas fill RGBA(89,89,89) with white text and icon.
- The CalendarAdd buttons are no longer disabled by the page lock (the canvas has no lock gate there; Save is still blocked).
- Dates are formatted from local parts (rule 18) and durations are whole months.
- The invented step "A default revenue contract was created." is removed.

**SOURCE DEFECTs fixed** (each with a `…CanvasParity` twin and a test):
- **FID set by the CalendarAdd button never re-prices the plant cost** — the canvas loads and re-prices the generators only in the FID picker's `OnChange`. Now the saved FID decides (`needsPlantCostRecalculation`; twin `…CanvasParity`, UT-MSTONE-072).
- **A missing `Estimation Price Inflations` row writes every generator cost as 0** — blanks are 0 in the index. Now re-pricing is skipped and the stored costs are kept (`accumulatedIndex` → null; twin, UT-MSTONE-025b). Before D26 the code assumed index 1.
- **A missing assumption row copies the predecessor date** (`DateAdd(x, Blank())`) and flags it standard, so it fails its own check. Now a no-op (`recalculateMilestone`; twin, UT-MSTONE-065).
- **Cancel keeps every row Dirty and keeps the typed farmdown**, so Save stays enabled after Cancel. Now Cancel returns to the page-entry state (`cancelMilestones`; twin, UT-MSTONE-070).
- (Kept from before) the `Text(Order)` label sort is numeric.

**DIVERGENCEs:**
- `DataSourceInfo` / `RecordInfo` have no SDK equivalent: the Save gate passes permitted and Dataverse decides (D1).
- The re-pricing inputs are read when Save runs, not on every FID keystroke; generator costs are written unrounded (as the canvas; Dataverse applies the column precision) and a blank rung price is 0 (as the canvas).
- Only `vsb_generatorscost` is written per generator type; the canvas `Patch(GeneratorTypeInProjects, colProjectGenerators)` sent the whole records back unchanged.
- The assumption read keeps `statecode eq 0` (shared with CAPEX); the canvas reads the whole table.
- The gap report's D24 item (`Year(COD)` default) is not a defect: it is the `Switch` default for non-Wind/PV technologies, where the type switch never applies.
- NEW texts: the load-error state and the revenue-seed notice.

**Tests:** `rules.test.ts` 93 (ids kept where the case survives; 063–079 new), `Screen.test.tsx` 901–909, `ScreenRoutes.test.tsx` (Milestones now checked as connected by its Save button — the canvas screen has no heading — with `@/data/milestones` mocked).

**Open questions for the product owner:**
1. **Fabric recalculation on a milestone save** stays off (commented out in the canvas, flow missing from the export). Confirm; if it should be restored, the server-side job pattern (insert a `Fabric Sync Jobs` row) is the way, not a client flow call.
2. **Missing inflation rows:** skip re-pricing (this app) or write 0 (canvas)?
3. **Cancel:** confirm the corrected behaviour (full reset, nothing dirty).
4. ~~**`Text('Foundation cost included') = "Yes"`**~~ — **answered (M4, 20 Oct 2026): canvas behaviour, implemented.** See below.
5. **The default revenue seed** stays unconnected until Fabric SQL is (D2). Is the notice wanted, and is 1.21.753 (the Italy changes in the rules) the target for it?
6. **The leave guard** needs a shell navigation blocker (shared with General Data). Build it as a shared change? **→ Built 20 Oct 2026: the shared `UnsavedChangesGuard` (D35).**

**Product-owner answers implemented (20 Oct 2026, `PM-OPEN-QUESTIONS-2026-10-20.md`):**
- **M4 — foundation cost: canvas behaviour, live.** Verified: `vsb_foundationcostincluded` is a Dataverse Yes/No column (`boolean` in `Vsb_generatorsModel`), which a canvas app reads as a Boolean; `Text()` of a Boolean is "true" / "false", never the label "Yes", so `varFoundationCostIncluded = "Yes"` (Y:2407, 2424) is always false and the canvas ALWAYS adds `'Additional foundation cost'`. `repriceGenerators` now does exactly that, whatever the flag. The previous boolean reading (included → no extra cost) is kept, NOT live, as `repriceGeneratorsBooleanReading` (UT-MSTONE-080 pins both; UT-MSTONE-027b updated: 48 → 54). Note: the Generators screen carries the same canvas formula (`Project Generators Screen.pa.yaml` Y:11631, 14994, 15862, 17111) and still reads the flag as a boolean; it was not touched here (another work stream owns it).
- M1, M2, M3, M5 confirmed with no code change; X1 (leave guard) is a separate shared build.

- **UI layout pass (20 Oct 2026).** Layout only, from the canvas containers: the screen no longer locks itself to the viewport (the shell scrolls); the date columns are `Min(380, Parent.Width)` wide in wrapping rows instead of two stretched halves; 70-px date cells (90 px for Sales, Share of Farmdown and Operation) inset 20 px; the 1-px `ButtonDisabledBg` separators are two columns wide; the lock message is `con_Milestones_Page_LockMessage` (dark fill, 50 px); the bottom bar is the canvas `…_Body_Content_Buttom` (record stamp left in two 300-px blocks, buttons right-aligned), sticky at the bottom. Not changed: the `con_Milestones_Tip` banner is not built (its `Visible` is a commented-out formula), and "Created:" stays shown although the canvas sets `Visible: false` on it. No behaviour, caption, `aria-label` or `data-testid` changed.

## D27 · PM Generators (Project Generators Screen) redeveloped and connected (19 Oct 2026)

**Scope:** rules, UI, a live Dataverse connection (reads and writes), and docs.
- Code: `src/features/pm/generators/` and `src/data/generators.ts`. Additive shared changes: `data/odata.ts` gained `gtDate` (an unquoted date literal), `data/keys.ts` the generator keys, `data/dataverseNames.ts` `ES_PLANT.pvModules / inverters / substructures`, and `components/CommandBar.tsx` an optional `reason` (the tooltip of a disabled command).
- Gap report: `gap-analysis/pm-generators.md`. Canvas: `Project Generators Screen.pa.yaml` (solution 1.21.709), `App.pa.yaml`.

**Tables registered** with `pac code add-data-source`, one at a time. The `"primaryKey"` count went from 52 to 62: exactly one was added each time, none dropped (checked by key list after every call). `check-power-sources` reports 62 registered and 0 problems.
- `vsb_projectplanning` (the height limitation), `vsb_invertertypeinproject`, `vsb_substructuretypeinproject`, `vsb_storagetypeinproject`, `vsb_hydrogentypeinproject`, `vsb_substationtypeinproject`, `vsb_devicecost` (`gblDiviceCoststConstants`), `vsb_pvmodule` (the PV Supplier combobox, App:1506), `vsb_inverter` and `vsb_substructure` (the `Supplier` the inverter / substructure cards show).
- All are Dataverse tables (`References/DataSources.json`, `default.cds`); no Fabric SQL source is read on this screen.

Already registered and reused: `vsb_project`, `vsb_country`, `vsb_generator`, `vsb_generatortypeinproject`, `vsb_generatorinproject`, `vsb_pvmoduletypeinproject`, `vsb_devicetypesinproject`, `vsb_landleaseprojectcost`, `vsb_landleaseallocationwtg`, `vsb_opexprojectcost`, `vsb_estimationpriceinflation` (through `loadPriceInflation`, `data/milestones.ts`).

**Left out (product decisions):**
- **The module-permission flows.** `RequestModulePermission` (the out-of-country "Request permission" save) and `Requestpermissioncancellation` (the cards' Cancel buttons) send mails / Teams cards. Both controls are visible and disabled, with `EXCLUDED.*` as tooltip; `planCreateGeneratorType` refuses the out-of-country plan.
- **A delete of a type with an open request** (`FlowRunId` set — WTG, PV, inverter, substructure). The canvas would run the cancellation flow first; the delete is refused (`EXCLUDED.deleteWithOpenRequest`), as D25 refuses the start-cluster change.
- ~~**Replace Generator / Replace PV Module Type**~~ (1.21.753) — superseded 20 Oct 2026 (G6): ported and enabled; see "PO answers implemented" below.
- ~~**Add Inverter / Add Substructure**~~ (`ItemVisible: false`) — superseded 20 Oct 2026 (G9): built and shown; see below.
- No Apply control exists on this screen (D20).

**Server automation fired by the writes** (verified against `04-flow-inventory.md`):
- **`LoadDevexCapexCostTotalCapacityTrigger`** — `vsb_project` Modified on the plant WTG / PV / storage / hydrogen / substation capacity columns. Every save and delete here writes a roll-up, as the canvas does, so the flow inserts its `Fabric Sync Jobs` row on the server. `'Total Capacity'` is a Dataverse formula column: re-read, never written.
- **No plugin step** filters on these tables or columns; `UpdateTeamsandSPOSite` (`vsb_clusterstate`) is not written.

**Write order** (each a `WritePlan` from `rules.ts`, run in order by `usePlanWrite`). Where a later write needs a value the first creates (an autonumber `Name`, the new turbine ids), a second job follows — the canvas' queued `Select`s also ran after the main formula:
1. **WTG type** (`planCreateGeneratorType`): the type (`'Cost per WTG'` = `Value(Text(cost, "#0.00"))`), N turbines named `WTG <Short Name>_<max + i>` (max over the whole project), the WTG roll-up. Second job (`planGeneratorTypeFollowUp`): the `DeviceTypesInProjects` shadow (`btn_AutomatedFlow_TriggerWork_ForWTG_PV`) when absent, then the AllWTG land-lease allocations (`btn_Trigger_New_AllocateWTGs_To_Land_Lease`).
2. **Turbine** (`planSaveTurbine`): the turbine, the apply-to-all patches, the type re-banded from its turbines, the roll-up, and — new turbine — its AllWTG allocations.
3. **Turbine delete** (`planDeleteTurbine`), **type delete** (`planDeleteGeneratorType`), **activate / deactivate** (`planToggleStatus`).
4. **PV type** (`planSavePvType`), second job `planPvFollowUp`: the PV unit (`GeneratorInProjects`), `'Plant PV Capacity / Cost'`, the device-type shadow. **PV delete** (`planDeletePvType`): delete, PV capacity, every substructure cost re-computed, PV cost.
5. **BESS / Hydrogen / Substation** save and delete (`planSaveSimple`, `planDeleteSimple`); **inverter / substructure delete** (`planDeleteInverterOrSubstructure`).

Every create binds `owningbusinessunit@odata.bind` to the project's owner (`'Besitzer (Unternehmenseinheit)'`), and the turbine updates carry it as the canvas `UpdateIf`s do. Polymorphic lookups use their per-table navigation properties (`vsb_ModuleTypeInProjectId_vsb_generatortypeinproject`, `…_vsb_pvmoduletypeinproject`, `vsb_TypeInProjectId_…`, from `customizations.xml`). Texts: the canvas progress, success and `Error: …` texts; the error names the table instead of `FirstError.Source` (as D25).

**Corrected (would have failed or shown wrong data):**
- **Type Save could never enable** (S7): the Cost row validated the hidden, always-blank field. It now reads the derived cost (`locGeneratorCostsPerWtg > 0`).
- **PV supplier** (W6, D12): the code wrote the supplier text to the hidden `vsb_type`; the canvas writes the `vsb_PVModule` lookup and `'Other Supplier'`. The combobox offers the `PVModules` catalogue (no "Imported" rows, "Other Supplier" last), not the project's own suppliers; Other Supplier shows only for that module.
- **Selection and folding** (B2, B3): one card selected screen-wide; every card starts collapsed; a non-WTG row click folds, the WTG row only selects; details show only while expanded.
- **Height gate** (S5): the non-PM block applies whenever a limit is set, flag or not; the approval popup opens for every user who can press Save (the code silently closed the panel for non-PMs).
- **Turbine panel**: the duplicate-name check and the next index are project-wide (B11, S12); new-turbine defaults come from the catalogue (S17); the plinth rule is −100…100, one decimal, not blank (S15); the panel shows an edited turbine's own name prefix (B12; the save writes `WTG <Short Name>_<n>`, as the canvas); the Reset button is hidden (U20); the apply-to-all hub-height / plinth patch carries `'Total Height'` (W2).
- **Type panel**: Number of Generators says "Numeric value without decimals" (S8) and is disabled until a height is chosen (S9); the Dummy hub-height input appears only for a Dummy supplier, captioned "Hub Height [m]" (S10); the cascade clears the number and the revised height (B15); the catalogue has no `statecode` filter (D8).
- **PV panel** (S19–S22): the canvas ranges and texts (capacity 2 dp 0…500; degradations 3 dp 0…100; "Value cannot be blank."; "Value must be a number with three decimal"); MaxLength 512 / 6 / 10 / 512; no dirty conjunct on Save; no asterisks on the degradations.
- **BESS / Hydrogen / Substation** (B7, S23, S24): the panel opens bound to the selected row; the canvas validation and Save gate; the hidden Type selects are gone.
- **Cards** (U3, U4, U7, U10–U14): the WTG tooltip is `Generator.DisplayName`; the WTG status label; Total Height is the catalogue column (`vsb_totalheight`), the Dummy hub height the first turbine's; the canvas formats (`#.0`, `#0.0`, `#,##0.00`, `#,##0.0`, `#,###.00`, `Int ? "#" : …`); PV supplier precedence; inverter types / count / power / warranty / cost; the substructure "* Please add Module Type…" note and ⓘ.
- **Command bar**: disabled while the lock shows (S2); "Add Others" does nothing (B8, extends D15c); the default selection after a delete (B20); the pager hides at one page and has its tooltips (B14, U9).
- **Rule 16**: the canvas `AccessibleLabel`s (control names) on the type, PV and BESS / Hydrogen / Substation inputs (U27), the fold icons and the plant capacity field; the selection radios use the selection-dot name, not bound data (D16b).
- `'Prevent capacity'` popup: back to the single 1.21.709 title "Generator can’t be deleted/deactivated" and body (U25).
- `substructureCost` defaults to 0 for an unknown type (W7).
- The load-error state (U31).

**SOURCE DEFECTs fixed** (each with a twin and a test where it applies):
- **Type-delete land lease** (Q1, G-05b): the 1.21.709 canvas filters the allocations by `locSelectedGeneratorInProject` — one turbine, usually blank — so a type's own land-lease costs stayed (and a blank turbine matched allocations with none). Now every allocation of the type's turbines follows the turbine-delete rule (`planTypeLandLeaseCleanup`, UT-GEN-122), as 1.21.753 does.
- **Apply-to-all total height**: the canvas wrote the edited turbine's total to every sibling. Each sibling now gets its own (`siblingTotalHeight`; twin `planApplyToAll`, UT-GEN-120).
- **Approval popup with no limit**: flag on and blank limit asked to approve every save (`heightLimitExceededCanvasParity`, UT-GEN-110).
- **Type-panel blank messages** never showed (filter on a non-existent `"Generator"` row); they show once touched (`typeFieldBlankMessageCanvasParity`, UT-GEN-112).
- **PV Other Supplier**: the error label tested the module label; and a stale other supplier was written for other modules (`pvOtherSupplierValueCanvasParity`, UT-GEN-103).
- **Expanding a WTG card deselected it** (the queued `Select`); it stays selected (`wtgFoldSelectionCanvasParity`, UT-GEN-099).
- **Country availability** was a substring match on the joined labels; now exact (`isAvailableInCountryCanvasParity`, UT-GEN-096).
- Kept from before: ambiguity 4 (capacity range on a Production-screen control), 5 (Substation without `CanEditSelectedProject` — still reproduced; Q11 in the gap report), 6 (no capacity guard on inverter / substructure), the substructure-cancellation `ModuleType.Inverter`.

**DIVERGENCEs:**
- `DataSourceInfo` / `RecordInfo` have no SDK equivalent: the command-bar privileges pass and Dataverse decides (D1).
- Dirty and valid are derived from the values; the canvas validation tables kept stale rows.
- Device costs: the project country's row wins, else the first of any country (canvas: first of any) — Q6.
- Add Generator uses each type's own turbine count (the canvas used one screen variable).
- The PV save creates the type's unit when an edited type has none (the canvas `Patch` of a blank lookup fails).
- BESS / Hydrogen / Substation: the hidden Type value is not re-written; Hydrogen / Substation prefill `"#0.0"`, not `"#,##0.0"`.
- The hub-height list keeps the supplier filter (canvas: turbine type only) — Q7.
- The selection radios and the turbine-grid Edit / Delete stay table controls (D15c layout); BESS / Hydrogen / Substation render flat after "Add Others".
- NEW texts: `EXCLUDED.*`, the load-error state, `WRITE_MSG.working` (the canvas shows no progress for deletes).

**Tests:** `rules.test.ts` 130 (ids kept where the case survives; UT-GEN-051 and the PV panel cases rewritten because they pinned the defects; 095–126 new, incl. the option values pinned to the generated enums, UT-GEN-095); `Screen.test.tsx` 901–909; `ScreenRoutes.test.tsx` (Generators checked as connected by its root test id, `@/data/generators` mocked). **20 Oct 2026:** `rules.test.ts` 144 (UT-GEN-127…140 new; UT-GEN-124 now pins the canvas PV-delete twin), `Screen.test.tsx` 13 (UT-GEN-909 rewritten, 910…913 new).

**PO answers implemented (20 Oct 2026)** — `gap-analysis/PM-OPEN-QUESTIONS-2026-10-20.md`. No table registered: the `"primaryKey"` count stays 81 (`vsb_inverter`, `vsb_substructure`, `vsb_devicetypesinproject`, `vsb_opexprojectcost` and the land-lease tables were already registered). Additive shared changes: `data/keys.ts` (`qk.plantSupplierCatalog`); `data/generators.ts` gained `listPlantSupplierCatalogue` and the inverter / substructure `label` / `typeValues`.
- **G1 / G3 / G4 / G5 / G8 confirmed** — no change (the type-delete land-lease rule, the stored height, country-first device cost, the supplier filter, no Substation edit check).
- **G2 — PV delete, SOURCE DEFECT fixed.** The confirmation says "All related cost in O&M and Land Lease will be removed", but the canvas only `Remove`s the type. Dataverse cascades the unit and the device-type row (`CascadeDelete` in `customizations.xml`), while the unit's allocations and the device-type row's O&M costs are only unlinked (`RemoveLink`) and keep their cost. `planDeletePvType` now writes, children first: the land-lease clean-up of the PV unit(s) with the G1 rule (`planTypeLandLeaseCleanup`), the O&M costs of the type's first device-type row, the PV unit(s), then the canvas body. Twin `planDeletePvTypeCanvasParity`; UT-GEN-127 (rules), UT-GEN-912 (screen). The device-type row still goes by cascade, as on the WTG type delete.
- **G6 — Replace Generator Type / Replace PV Module Type, ported from solution 1.21.753 and enabled.** No 1.21.753 YAML with these panels is on disk. Sources: `migration-plans/10-solution-1.21.753-gap-register.md` (G-05, G-05b, G-05c), `VSBCloud-Code-App-Skeleton/CHANGES-1.21.753.md`, the skeleton port (`hooks.ts` `replaceGeneratorTypeImpl` / `replacePvModuleTypeImpl`, `replace.test.ts`) and its `reference/canvas-labels.json` / `canvas-accessible-labels.json` (captions, control names, AccessibleLabels). Re-derived against this app's names and write plans, in two jobs each:
  - Job 1 (`planReplaceGeneratorType` / `planReplacePvType`), built after the T2a read (`loadReplaceInputs`): Detach (the O&M costs of the old device-type row get `vsb_DeviceTypeInProject@odata.bind: null`), Delete (old units, old device-type rows, old type), Add (`planCreateGeneratorType` with the OLD type's number of generators, names continuing after the other types' turbines; or `planSavePvType`).
  - Job 2 (`…FollowUp`): the new device-type row when absent; the AllWTG back-fill for the new units; the old manual allocations moved to the new units BY POSITION, surplus removed (`replaceSuccessText` counts them); the old units' AllWTG rows removed by id; for PV the `Plant PV Capacity / Cost` roll-up; then the O&M costs re-linked to the new device-type row.
  - SOURCE DEFECT 1.21.753-2 (G-05c) not reproduced: the allocations of the turbine selected at the time are re-pointed, not deleted.
  - Refused (D27 / X3): a replace out of country (`RequestModulePermission`) and a replace of a type with an open request (`EXCLUDED.replaceWithOpenRequest`, NEW text). The non-PM height block applies (`HEIGHT_LIMIT_PM_MESSAGE`).
  - Panels: "Replace from" (read-only) and "Replace to", with the 1.21.753 names (`cmb_Supplier_3…8`, `txt_…NumberOfGenerator_1/_2`, `txt_…HubHeight_2`, `tgl_…Filter_Country_1`, `txt_…PvModuleType_Fields_*_1/_2`, `pcf_btn_…Buttons_Save_1/Cancel_1`, `pcf_btn_…PvModuleType_Buttons_Save_2/Cancel_1`) and their canvas AccessibleLabels. The only literal 1.21.753 test id (the country Switch) carries `canvas-identity-ignore: 1.21.753-only control`. The PV "Replace to" Other Supplier input has no name in the corpora: stable id `generators-replace-pv-other-supplier`. The PV "Replace to" form reuses the PV panel's validation (the same rules as `replacePvSaveable`).
  - Tests: UT-GEN-137…140 (rules); UT-GEN-909 (rewritten: it pinned the disabled command) and UT-GEN-913 (screen). `EXCLUDED.replace` is removed.
- **G7 — PV land-lease back-fill (1.21.753, G-05b).** A NEW PV type's unit is allocated to every `AllWTGAllocated = Yes` land-lease cost (`planPvFollowUp`, `isNew`); an edit never back-fills, as the canvas gates it on `varIsNewPvModule`. UT-GEN-128.
- **G9 — Add / Edit Inverter and Substructure, DIVERGENCE (PO-approved).** The canvas panels exist but their commands are `ItemVisible: false`; `commandBarState(…, { exposeInverterSubstructure: true })` shows them (the default stays the canvas, UT-GEN-129). Ported from `Project Generators Screen.pa.yaml` (Y:8246, Y:9114):
  - fields, captions and error texts; the `colPanel…FormValidation` Save gates; the supplier catalogues (`colInverterSuppliers` keeps every "Other Supplier" row, `colSubstructuresSuppliers` only the first) shown as `FullDisplayName`; the type defaults from the chosen supplier;
  - the `Patch` payloads — `planSaveInverter` (cost per inverter = Inverter device cost × nominal power / 1000, type cost × count) and `planSaveSubstructure` (Fixed / Tracker mounting cost × `Plant PV Capacity`) — then the `Plant PV Cost` roll-up;
  - Add Substructure with no PV capacity opens the canvas information popup ("Add Substructure information", OK). Edit binds to the selected row; the supplier is read-only once stored (`DisplayMode: View`).
  - A non-blank Other Supplier is the excluded permission request: Save reads "Request permission" and is disabled with the reason.
  - SOURCE DEFECTs fixed, each with a twin: the inverter Save let a value through that its own error label rejects (`canSaveInverterCanvasParity`); the Other Supplier error labels never showed, and the substructure ones read the inverter panel's table (`plantOtherSupplierErrorCanvasParity`); the substructure type row was seeded inverted (`canSaveSubstructureCanvasParity`).
  - Tests: UT-GEN-129…136 (rules), UT-GEN-910 / 911 (screen).
- Not yet clicked through against VSBCloud_Dev (`pac code run`); the unit and render suites pass.

- **M4 applies here too (20 Oct 2026, cross-screen sweep D35) — foundation cost, canvas behaviour, live.** The Generators cost band uses the same canvas formula as Milestones: `With({varFoundationCostIncluded: Text(varRecordGenerator.'Foundation cost included')}, If(varFoundationCostIncluded = "Yes", net * index, (net + 'Additional foundation cost') * index))` (Y:14994, 15862, 17111). `Text()` of the Yes/No column is never "Yes", so the additional foundation cost is ALWAYS added. `costPerWtg` (and everything that uses it: the type form, the turbine save/delete re-banding, Replace) now reproduces that, through ONE shared rule for both screens, `foundationCostAdded` in `src/domain/foundationCost.ts` (Milestones' `repriceGenerators` uses it too). The boolean reading this screen used before is the twin `costPerWtgBooleanReading` (via `foundationCostAddedBooleanReading`). Tests: UT-GEN-914 (live and twin), UT-FOUND-001/002; UT-GEN-012/014 are unchanged (their models have no additional foundation cost, or the flag is No).
**Open questions after the PO answers (20 Oct 2026):**
1. **Replace and the height popup:** the 1.21.753 sources show the non-PM block on the Replace panel (`lbl_…ErrorMessageProjectManager_2`) but not whether the "Height Limitation Exceeded" approval popup also opens. The app applies the block only. Add the popup?
2. **Replace keeps no per-turbine data:** the new turbines get the new model's catalogue heights and capacity; the old turbines' plinths and edited capacities are not carried over (as in the skeleton port). Confirm.
3. **Replace runs as two non-transactional jobs** (as every multi-write here, KNOWN-RISKS): if job 2 fails, the new type exists, the O&M costs stay detached and the old allocations stay unlinked. Accept, or a Custom API (as D6)?
4. **Unnamed 1.21.753 controls:** the PV "Replace to" Other Supplier input (a stable id is used) and, on "Replace from", `txt_…HubHeight_3`, `tgl_…Filter_Country_2` and `lbl_…Filter_Message_2` (not rendered: their role cannot be determined from the corpora). Can the 1.21.753 YAML be provided to close them?
5. **Inverter / Substructure with Other Supplier** is always a permission request, so it cannot be saved until the X3 flows are connected. Confirm.
6. **G7 on an edit:** an edited PV type whose unit had to be created (D27 DIVERGENCE) is not back-filled, because the canvas gates the back-fill on a new module. Confirm.

**Open questions for the product owner (19 Oct 2026; answered 20 Oct, see above):**
1. **Type-delete land lease:** the fix removes the land-lease cost when all its allocations belong to the type, otherwise only the type's allocations. Confirm (1.21.709 removed none; 1.21.753 "removes all its units' allocations").
2. **PV delete** removes neither O&M nor land lease, nor the PV unit, although its text says so (gap Q2). Remove them?
3. **Turbine PM height block** uses the STORED total height (canvas, kept): a new turbine, or an edit that raises the height, is not blocked for non-PMs. Use the live height?
4. **Device costs:** country-specific (this app) or first of any country (canvas)?
5. **Hub-height options:** keep the supplier filter?
6. **Permission flows:** when should `RequestModulePermission` / `Requestpermissioncancellation` be connected (connection reference, flow client)? Until then out-of-country types and deletes of requested types are blocked.
7. **Replace (1.21.753):** port it now from the 1.21.753 source, or keep it disabled?
8. **1.21.753 PV backfill** ("a new PV module creates bridge + unit and backfills every AllWTG cost", G-05b) is not in the 1.21.709 source and is not ported. Wanted?
9. **Substation without `CanEditSelectedProject`** (ambiguity 5) is still reproduced; approve `fixSubstationPermission`?
10. **Inverter / substructure galleries:** add is unreachable but delete is live. Keep them visible, read-only and deletable?

- **UI layout pass (20 Oct 2026).** Layout only, from the canvas containers: the seven galleries are lists of CARDS instead of one table whose header row floated above empty cells: a 42-px header (selection dot, title, status / Height Limitation / permission chips right, fold icon, 1-px `RGBA(0,120,212)` rule) and, while expanded, the read-only fields in four 64-px columns (column by column, two rows when there are more than four), then the WTG Add Generator bar, pager and turbine grid (850 wide). The status chip has the canvas Green / SuccessLight fill when Active and Grayscale10 / Grayscale40 otherwise; the Height Limitation tag is `ColorFade(Warning, 60%)`. The plant-capacity cell is 280 × 70; the lock message is the dark `con_Milestones_Page_LockMessage_1` box (it was a Fluent warning bar). The screen no longer locks itself to the viewport. Not matched: the command bar stays in the shell header slot (the app's convention); it wraps to two lines at 1366. No behaviour, caption, `aria-label` or `data-testid` changed.

- **PO screenshot parity (20 Oct 2026):**
  - The command bar is in the body, with "Add Others" as a drop-down (D35).
  - Icons: Replace uses the sync arrows; Activate / Deactivate use the MDL2 document tick / cross.
  - The expanded WTG card has "Add Generator" at its top-left. Its details use the canvas 2 × 4 grid (Supplier · Total Height · Number of Generators · empty / Hub Height · Rotor Diameter · Height Limitation · Generators Capacity), with Semibold captions and right-aligned numbers.
  - The turbine grid has the NEW headers "Generator Name" and "Actions", which the PO asked for (N4); the canvas has none. Its rows are on the Grayscale30 fill.

## D28 · PM Production (Project Production Screen) redeveloped and connected (19 Oct 2026)

**Scope:** rules, UI, a live Dataverse connection (reads and writes), and docs.
- Code: `src/features/pm/production/` and `src/data/production.ts`. Additive shared changes: `data/keys.ts` (`qk.production`, `qk.productionAll`) and `components/CanvasFields.tsx` (`Choices` gained an optional `ariaLabel`, for a canvas `AccessibleLabel` that differs from the group name).
- Gap report: `gap-analysis/pm-production.md`. Canvas: `Project Production Screen.pa.yaml` (solution 1.21.709), `App.pa.yaml`.

**Tables registered** with `pac code add-data-source`, one at a time. The `"primaryKey"` count went from 62 to 65: exactly one was added each time, none dropped (checked by key list after every call).
- `vsb_energyyield`, `vsb_pvseasonalityvalues`, `vsb_pvnegativeprices`.

Already registered and reused: `vsb_project`, `vsb_projectrevenue`, `vsb_generatortypeinproject`, `vsb_pvmoduletypeinproject`, `vsb_generatorinproject`, `vsb_devicetypesinproject` (through `listGeneratorTypes` / `listPvTypes` / `listProjectTurbines` / `listDeviceTypes`, `data/generators.ts`), `vsb_countryinflationprofile` (`loadCountryInflation`, `data/landLease.ts`), `vsb_opexsubaccount`, `vsb_opexlandleasestandardassumptions`, `vsb_landleaseprojectcost`, `vsb_landleaseperiod`, `vsb_landleaseallocationwtg`, `vsb_opexprojectcost`, `vsb_landleasesubaccount`, `transactioncurrencies`, `businessunits`.

**Not connected (product decision D2):** `Assumptions Revenues SQL` is a Fabric SQL source (`[dbo].[AssumptionsRevenue]`, as D26 found), not a Dataverse table. The standard seasonality months and negative-price reductions it supplies are therefore blank: the seasonality seed shows empty months (the canvas `LookUp` is blank), the negative-price curve 0 and not standard. A NEW notice (`PRODUCTION_SCREEN_TEXT.fabricNotConnected`) shows in the panel while either toggle is on. The parsing rule (`parseFabricNumber`) is kept and tested. No approval flow, project create or Apply control exists on this screen, so nothing had to be disabled.

**Server automation fired by the writes** (verified against `04-flow-inventory.md`):
- **No flow is called.** `SynchroniseRecalculationCapexStandardCost` and its `Fabric Sync Jobs` insert are inside a `/* … */` block (Y:9062-9081).
- **Plugin steps on `vsb_project` Update**, fired by the flag write that closes the one-shot generation (`vsb_initialp50trigger` = Yes; `vsb_capexstandardcontractscreated`, `vsb_capexstandardcostscreated`, `vsb_bopstandardcontractscreated` = No): InitialP50StandardCapexContractCreate, InitialP50StandardBOPContractsCreate and InitialCapexCostsCreate (all async). The app does not do their work.
- No server-triggered flow fires: the plant capacity columns and `vsb_clusterstate` are not written; no step filters on the yield, seasonality, negative-price, revenue or generated cost tables.

**Write order.** Each step is a `WritePlan` from `rules.ts`, built from a fresh read when its job starts and run in order by `usePlanWrite`, as the canvas:
1. **Save** (`planSaveYield`): the yield; the seasonality upsert, or its `Remove` when the toggle is off; the negative-price upserts, or the removal of every stored year when the toggle is off; the revenue negative-price sync; an External assessment sets the project's active Internals of its type Inactive.
   - **Delete** (`planDeleteYield`): the yield, then the sync. Its seasonality and negative prices are removed by Dataverse: both relationships are `CascadeDelete` in `customizations.xml` (this answers gap Q5).
   - **Activate / deactivate** (`planStatusChange`): `statecode` + `statuscode`, then the sync.
2. **"Recalc"** (`btn_Load_StandardContracts_For_Project`), after every write: the project roll-up (`planRollUp`).
3. Only when `Net Yield p50 > 0` and `Standard Cost Created = No`: the standard contracts (`planStandardContracts`), then the four flags. In order: Land Lease costs (each followed by its AllWTG allocations), Land Lease periods, Other OPEX costs and periods, O&M costs and periods per device type. Each family is skipped when the project already has standard contracts of it.

Every create binds `owningbusinessunit@odata.bind` to the project's owner (`'Besitzer (Unternehmenseinheit)'`); children bind their parent through `createdRowRef`. Texts: "Please wait, saving...." and "Please wait, loading standard assumption contract..." (the canvas spinner). The canvas has no error text, so a failed save says "Energy yield could not be saved: …" (NEW).

**Corrected (would have failed or shown wrong data):**
- **Selection and order:** yields are sorted by `vsb_name` (Name), not `vsb_description`. The first yield is pre-selected on entry and after a delete. A save or a panel close clears the selection (`btn_Seasonality_NegativePrice_Reset_Hidden`).
- **Net p50 in "Input losses"** is derived (`Gross × (1 − Losses/100)`, whole MWh); the code saved a null p50. PV "Input Irradiation" derives Gross = `Round('Plant PV Capacity [MWp]' × Irradiation, 0)` (`vsb_plantpvcapacitymwp`).
- **Edit:** the three stored radio modes are restored; the modes and the assessment are locked once a yield exists; the PV Gross / Irradiation fields follow the allocation mode; the radio changes reset the fields the canvas resets.
- **Payload:** per technology (WTG: Wind, Allocation = Whole plant; PV: Irradiation, Production Allocation), with the Project and owner binds.
- **Validators the code lacked:** Wind Speed (two decimals, 0…15, "Please enter value between 0 and 15 " with its trailing space), Gross Yield (per-technology wording), Irradiation (three decimals, 0…3000); PV Total Losses' own range text; MaxLength on every field; the PV irradiation Save checks.
- **Cells:** the seasonality and negative-price cells keep the typed text (`TextValue`), so a decimal can be typed and an invalid entry reaches the validation.
- **Generation:** the Other OPEX family (it was missing); the Project / Subaccount / Currency / owner / parent binds; the Opex → Land Lease aggregation and period translation (pinned by test); date-only start dates from local parts (rule 18); a blank one-time amount stays blank.
- **Roll-up:** the averages skip blank values, as Power Fx `Average` does.
- **Display:** the summary shows the project's STORED roll-up in the canvas formats (it was recomputed client-side, with "—"); the card label is `Production - {Type} {Description}`; the details show "Yes"/"No", wind as `0.0#` and irradiation as `###,##0.0`.
- **Command bar and cards:** the bar is disabled while the page lock shows; Activate / Deactivate have their icons; the card header button only selects, and the chevrons fold (and select).
- **Panel close:** the close X and Cancel close at once. The code had added an "Unsaved data" confirmation that the canvas never shows.
- **Rule 16:** every summary, detail and panel input carries its canvas `AccessibleLabel`. That is the control name, including the canvas copy-paste labels on the two detail boxes and "rad_ProductionDataPV_Assessment". The command bar's label is its name, and the prevent popup has its close X. The selection image is decorative, because the gate does not allow an Image name on a span.

**SOURCE DEFECTs fixed** (each with a canvas twin and a test):
1. PV uncertainty allowed 0…3000 ("Please select a value between 0 and 3 000."). It is a percentage, so it is now 0…100 with the WTG text (`validateUncertaintyCanvasParity`, UT-PROD-093).
2. The revenue sync read the yields before an External assessment superseded the Internals. It now syncs against the superseded set (`revenueSyncYieldsCanvasParity`, UT-PROD-103).
3. A re-seeded negative-price curve left the stored years outside it behind, and they came back on the next Edit. They are now removed (`planNegativePriceWritesCanvasParity`, UT-PROD-086).
4. Edit with "Consider Negative Prices" on and no stored rows showed the previous panel's collection. The curve is now seeded (UT-PROD-087).
5. The seasonality total's error label compared the unrounded float sum. It now follows the rounded Save gate (`seasonalityTotalErrorCanvasParity`, UT-PROD-083).
6. Other OPEX periods 3+ chained from the last period of ANY subaccount. They now chain within their own subaccount (`otherOpexChain: "canvasParity"`, UT-PROD-097).
7. The PV Save ignored an invalid Gross Yield in "Input Net Yield p50" (UT-PROD-096).
8. PV "Input Net Yield p50": the losses never recomputed, because the `OnChange` tests a radio value that never occurs. They are now derived as for WTG (UT-PROD-081).
9. After Activate / Deactivate the bar kept the stale selection's status. The selection is now by id (UT-PROD-114).

Also fixed: a land-lease period whose subaccount has no Period-1 contract had a blank required lookup in the canvas; it is skipped (UT-PROD-098).

Reproduced and documented:
- WTG Total Losses shows "Please ensure Gross Yield > Net Yield p50" when the value is out of range (its own message is commented out).
- The Description error label never shows.
- The WTG "Each turbine" allocation is unreachable: the radio is always View, on Whole plant.
- The "Unsaved data" leave dialog never opens: its Dirty flag is never set.

**DIVERGENCEs:**
- `DataSourceInfo` / `RecordInfo` have no SDK equivalent: `CanEditSelectedProject` passes and Dataverse decides (D1).
- Unchanged stored negative-price years are not re-written.
- The typed cell text is not re-formatted to `#0.0` when the user leaves the cell.
- "Recalc" plans are built from fresh reads instead of the canvas collections.
- The O&M family is skipped when no "Operation & Maintenance" subaccount exists. When the project has no COD, the contracts are skipped but the flags are written (the canvas Patches would fail on a blank start date).
- Status writes set both `statecode` and `statuscode`.
- NEW texts: the load-error state, the Fabric notice and the save-error prefix.
- The leave guard (header logo / left navigation) belongs to the shell. It is the same documented gap as D25 / D26; the dialog texts stay in `rules.ts`. **→ D35: the shared guard is wired with the canvas outcome (`shouldConfirmLeave` is always false, twin `shouldConfirmLeaveWhilePanelOpen`).**

**Tests:**
- `rules.test.ts`: 97 tests. Ids were kept where the case survives; 080–115 are new, including the option values pinned to the generated enums (UT-PROD-095).
- `Screen.test.tsx`: 901–910.
- `ScreenRoutes.test.tsx`: Production is checked as connected by its root test id, with `@/data/production` mocked.

**Open questions for the product owner:**
1. **PV uncertainty range:** confirm 0…100 (fixed) rather than the canvas 0…3000.
2. **Fabric standards (D2):** until `Assumptions Revenues SQL` is reachable, users type every seasonality month and negative-price year by hand. Is that acceptable, or should the two toggles stay disabled until Fabric is connected?
3. **Negative-price years outside the curve:** confirm that they are deleted on save (fix 3).
4. **Revenue sync after an External supersede:** confirm fix 2. It can switch a revenue contract's "Consider Negative Prices" off where the canvas left it on.
5. **Other OPEX chaining:** confirm that periods 3+ chain within their own subaccount (fix 6).
6. **No COD:** the generation writes the CAPEX flags but no contracts. Should a save without a COD be refused instead, or should the flags not be written?
7. **Leave guard:** the canvas one never fires. Drop it for this screen, or build the shared shell blocker (D25 / D26)? **→ D35: wired with the canvas outcome (never asks); still open whether to arm the twin.**
- **UI layout pass (20 Oct 2026).** Layout only, from the canvas containers: the screen no longer has a gap-12 stack; the two summary rows are the canvas wrapping rows of 300 × 74 tiles (`Min(Parent.Width, 1200)`, PaddingTop 20, label and input at X 20, Semibold labels, right-aligned values) instead of three stretched thirds. The yield gallery is cards that touch (TemplatePadding 0, `Parent.Width - 10`): a 42-px #fdffff header with a 1-px Grayscale20 rule, the 18-px selection dot at X 10, the Medium (14.67 px) title, the Internal/External chip LEFT of the status chip (72 × 24, 1-px border, 12-px Grayscale00 text; status SuccessLight + Green border when Active, else Grayscale40 + Grayscale10; assessment hoverButton + Green when External, else Grayscale20) and the 40-px chevron; expanded, the details are the canvas four 260-wide columns (Description · Gross · Seasonality / Wind · p50 · Negative / Losses · p75 / Uncertainty · p90) with Semibold 14.67-px labels and right-aligned numbers. The panel is the canvas columns: a 450-wide fields column (280 beside a side column; gap 2, padding 5, inputs `Parent.Width/2 + 20`, the info button 10 right of Irradiation) and 360-wide Seasonality / Negative Prices columns (330-wide rows, 100-px month, 180-px value). Not matched: the panel width is the nearest `FormPanel` preset to the canvas 450 / 640 / 1000 (narrow, period 660, wide `min(960px, 50vw)`), so with both side columns open they shrink below 360. No behaviour, caption, `aria-label` or `data-testid` changed.

- **PO screenshot parity (20 Oct 2026):** the Internal/External and status chips are rounded pills. An expanded record is a raised card (shadow, 4 px radius), and its four detail columns share the card width. The selection radio is the theme blue. A thin rule sits under the command bar.
## D29 · PM Checklist (Project General CheckList Screen) redeveloped and connected (19 Oct 2026)

**Scope:** rules, UI, a live Dataverse connection (reads and the writes that start no flow), and docs.
- Code: `src/features/pm/checklist/` and `src/data/checklist.ts`. Additive shared change: `data/keys.ts` (`qk.checklistAll`, `qk.checklist`).
- Gap report: `gap-analysis/pm-checklist.md`. Canvas: `Project General CheckList Screen.pa.yaml` (solution 1.21.709), `App.pa.yaml`, `Components/cmp_Project_States.pa.yaml`, `Components/fn_Common.pa.yaml` (`ChecklisAsHTMLTable`).

**Tables registered** with `pac code add-data-source`, one at a time. The `"primaryKey"` count went from 65 to 68: exactly one was added each time, none dropped (checked by key list after every call). pac changed only `.power/`, the new generated files and `power.config.json`.
- `vsb_projectchecklist` (`vsb_projectchecklists`), `vsb_projectstatetrackingnote` (`vsb_projectstatetrackingnotes`), `vsb_projectchecklisttrackingnote` (`vsb_projectchecklisttrackingnotes`).
- All are Dataverse tables; the screen reads no Fabric SQL source.

Already registered and reused (rule 17): `vsb_project`, `vsb_projectstate` (`listProjectStates`, `data/generalData.ts`), `vsb_projectstatetracking`, `vsb_projectdefaultapprovals` / `vsb_checklistdefaultapprovals` / `vsb_checklistcountryandtechnology` (`listGateApprovals`, `listChecklistApprovals`, `findScopeCountryTechId`, `data/adminGatesApprovals.ts`), `vsb_projectdefaultchecklists`, `aaduser` (`getEntraPeople`, for the Portfolio Manager mails in the tooltips).

**Left out (product decisions):** every control that runs an approval flow (mails / Teams cards) is visible and disabled, with an `EXCLUDED.*` tooltip; no flow is called and `power.config.json` has no connection reference.
- **Request Approval** (panel, both modes, including the Only-Notifications "Move to …" / "Complete" captions) — `PerformCommonRequestofGateApproval` / `PerformCommonRequestofCheckListApproval`. Its pre-flow patch, persona snapshot and notes are not written.
- **Cancel Approval Request** — `PerformRequestofGateApprovalCancellation`. While a gate approval runs, the change stays refused: the flow owns it and the user refreshes (PO, D25-Q1).
- **The row's cancel ✕** — `PerformRequestofCheckListApprovalCancellation` (not in the solution export).
- Their payload rules (`gateApprovalArgs`, `checklistApprovalArgs`, `flowWriteBackPatch`, `approvalPersonaSnapshot`, `planGateCancel`) are kept and tested, corrected to the canvas (persona lists `Concat(PersonaRole, Char(13))` with "None"; the cancel note name ends with the user's display name).
- Not ported, dead in the canvas: the panel's `pcf_…_Buttons_Return` (`Visible: false`), `but_…_ApplyDefaultChecklist` (`Visible: false`, D20), `con_…_Form_Info` (`Visible: false`), the leave confirmation (`locLeaveGeneralDataConfirmationDialog` is never set true), `RefreshButtonVisibility` (developers only).

**Live writes** (each a `WritePlan`, run in order by `usePlanWrite`, built from a fresh read):
1. **Back-fill** (`btn_CheckList_EnsureSkippedClusterStatesCompleted`), once per visit, when the `OnVisible` guard holds (start cluster > 0, still Draft, no real gate progress, a state differs).
2. **Per selected cluster** (`but_Project_States_CheckList_Refresh`): create the missing tracking, then — tracking not Completed and NO checklist row of any status — copy the active templates of the project's country × technology for that cluster.
3. **Row:** Complete (straight to Completed when no ACTIVE approval row exists — it always opened the panel before), In Progress (toggle + Approval Checklist State Not Started), Completion Date, the comment form (`Comments: Trim(…)`).
4. **Panel Save** (ungated cluster, In Progress): current → Completed, next upserted In Progress, the "Change {current} to {next}" note with the cluster's task table as HTML, then the Projects patch (Cluster State, Approval States Approved).
5. **Reset to …** and **Abandon / Inactivate / Activate**.

Every tracking / project write binds `owningbusinessunit@odata.bind` to the project's `'Besitzer (Unternehmenseinheit)'`, as the canvas Patches do. Texts: the canvas progress / success / error texts (`MSG`, verbatim incl. "will be save" and the double space); the error names the table instead of `FirstError.Source` (as D25).

**Server automation fired by the writes** (verified against `04-flow-inventory.md` and the workflow JSON):
- `SynchroniseProjectState` — tracking `vsb_approvalclusterstate`, acting only on In Progress: sets the project's Cluster State. Fired by the Draft create, the move (next row), Reset to … (previous row) and Activate.
- `UpdateTeamsandSPOSite` — project `vsb_clusterstate` (Croatia only). Fired by the move and the terminal changes.
- No plugin step filters on these tables or columns. The app does neither flow's work.

**Corrected (would have failed or shown wrong data):**
- **Sequences:** every visible state, sorted by `Order` (it was by cluster number, and non-cluster states were dropped from the stepper); Draft takes the gate of the cluster before the start cluster (`varGateSourceNo`); the gate is looked up by the entry's gate id.
- **Abandoned / Inactive** looked up over ALL states, Inactive by "contains" (they were searched among the visible states only).
- **Reset to …** is the LIVE `…_Return_1` in the main bar (confirmation popup): current → Not Started, previous → In Progress with both flow ids blanked. The code had ported the dead panel copy (Request canceled) and rendered it in the panel footer.
- **Terminal change:** nothing is written when no In Progress / Abandoned / Inactive row exists (the Projects patch and the reset ran regardless).
- **Materialisation:** no `Approval Checklist State` (the canvas does not write it).
- **Row icon / caption** read the FIRST approval row of any status; visibility needs an ACTIVE one; `LookUp` first-wins.
- **Panel:** comment block, due-date visibility (`HasGate` + comment block), the due-date default (the milestone of the cluster the approval leads into), the actual-task-state table, the stalled-approval clause.
- **Project mapper:** Project ID is `vsb_name`, Project Name `vsb_projectname` (the lock's "• General" read `vsb_internalprojectid`).
- **Task State** label "None" (was "Not started").
- **History:** the author is `modifiedby` (was `createdby`); the HTML note is shown as a text table (parsed, never injected).
- **UI:** Wind / PV only for the title, headers and table (otherwise the tip); stepper shows the real tracking state of skipped clusters ("Canceled" for Request canceled), description lines, the check, the gate marker with the persona tooltip, the pending clock; Complete green fill and persona tooltip; holding text cut at 100 + " ..."; note-present comment colour; NextCluster / title tooltips; Abandon / Inactive pressed styling; the leave dialog removed.
- **Rule 16:** the canvas `AccessibilityLabel`s (control names) on the command bar, Return_1, NextCluster, Abandon, Inactive, Request Approval, panel Save / Cancel, the panel comment box and the completion-date picker; the lock labels carry their canvas test ids. The approval-mode icons stay decorative (no test id: the gate rejects an `Icon` name on a non-button).
- **Option values** pinned to the pac-generated enums (UT-CHKLST-074).

**SOURCE DEFECTs fixed** (each marked in `rules.ts`, with a twin and a test):
1. **Save in "Checklist Completion" mode** runs the CLUSTER transition (completes the cluster, starts the next, writes the "Change …" note). Save is never offered in that mode (`showSaveCanvasParity`, UT-CHKLST-061). In practice the canvas panel only opens for templates with an active approval row, so the canvas button does not show either.
2. **Request Approval's stalled clause** read a stale `locSelectedCheckListEntity.'Flow Approval Id'` in cluster mode; only the tracking's FlowRunId is tested (`showRequestApprovalCanvasParity`, UT-CHKLST-060).

**DIVERGENCEs:**
- `DataSourceInfo` / `RecordInfo` have no SDK equivalent: `CanEditSelectedProject` passes and Dataverse decides (D1). The canvas never read it either.
- The stepper allows clicking a non-operational step and falls back to the default, as the canvas does (the code had disabled those steps).
- The HTML task table escapes `&`, `<`, `>`; the NextCluster "Gate Relevance Tasks" count is over the active rows (the canvas counts inactive rows too).
- Activate with no current tracking: the Projects patch is skipped (the canvas would blank the project's Cluster State).
- "Please wait..." (a canvas text) is shown while the terminal change runs; the canvas shows nothing.
- NEW texts: `EXCLUDED.*` and the load-error state (`SCREEN_TEXT`). `CHECKLIST_CANCEL_FAILED` (an invented text) is removed.
- Gate Relevance shows "Yes" / "No" (GUIDE recording), in the gallery and in the HTML note; the canvas source reads the raw boolean.

**Tests:** `rules.test.ts` 106 (ids kept where the case survives; 019, 026, 062 and the label / mapper / snapshot cases rewritten because they pinned the old behaviour; 053–076 new). `Screen.test.tsx` 901–912. `ScreenRoutes.test.tsx`: Checklist is checked as connected by its root test id, with `@/data/checklist` mocked.

**Open questions for the product owner:**
1. **Abandon / Inactivate while a gate approval runs:** the canvas allows it (it overwrites the tracking while the approval is still live in Outlook / Teams). Kept as the canvas. Refuse it instead, as D25-Q1 does for the start-cluster change?
2. **Approval flows:** when should the four flows be connected (connection references; `PerformRequestofCheckListApprovalCancellation` must be located in the tenant), and as flows or as the custom APIs the old plan assumed?
3. **Save in Checklist Completion mode** (SOURCE DEFECT 1): confirm that it is never offered.
4. **Gate Relevance:** confirm "Yes" / "No" (recording) over the canvas source's boolean text.
5. **Checklist Completion comment:** the canvas pre-fills it with the CLUSTER tracking's Approval Comment (kept). Matters once Request Approval is connected — keep, or start empty?
- **UI layout pass (20 Oct 2026).** Layout only, from the canvas containers: the page is the white right content with no gap stack. The stepper is `cmp_Project_States` (104 high, `Parent.Width - 8`): equal-width cards with a 24-px status bar in the `gblAppColors.ApprovalClusterStates` fills (Success / Success 60 / Grayscale20 90 / Warning 20, 10, solid), 10-px connector lines (#6C6C6C50), the 30-px gate circle and a white tick when Completed; the bold 12-px title and 12-px state below; the selected card Grayscale40 with a Grayscale30 border, radius 2 and a light shadow. The action row is 86 high (PaddingLeft 12, PaddingTop 8, gap 10) with the canvas button widths (250 / 220 / 260 / 120 / 200 or 100). The title is Semibold 16 px at X 12. The checklist grid has the header label widths as columns (120 / 350 / 482 or 70 / 200 / Status / Complete / comment), a 32-px Grayscale40 header in Semibold 13.33 px, 36-px rows in 12 px with a Grayscale30 rule and two-line clipping; the row buttons are the 80 × 26 pills (radius 14, `ColorFade(Grayscale10, .65)` border) with In Progress themeLight when on, Complete `ColorFade(Green, .4)` when done and History `ColorFade(akzent1, .3)`; the approval-mode icon moved left of In Progress, as in the canvas. Not matched: the canvas grid is a fixed 1388 and scrolls sideways at 1366; here the Country Description column gives way (minimum table 1100) so Status and Complete stay visible. No behaviour, caption, `aria-label` or `data-testid` changed.
- **PO screenshot parity (20 Oct 2026).** Layout only, from the product owner's screenshots of the live canvas (taken at 90 % zoom) checked against the YAML. Strings follow the YAML; layout follows the screenshots.
  - **New component:** `checklist/ProjectStates.tsx` holds the stepper (`ProjectStates`) and the action row (`ClusterActions`). Both are props-driven with no data access; `Screen.tsx` derives every value through `rules.ts` and composes them.
  - **Stepper:** the status bars have radius 4. The gate is the canvas pair `circ_State_Card_Gate_Approval` + `but_State_Card_Gate_Approval`: once the card is Completed, a filled Success circle with the icon in `ApprovalClusterStates.NotStarted`; otherwise a white rounded box with the icon in `Label.Color`, or Success 60 while In Progress. A 10-px line follows each gate. The selected card is #FFFFFF (the PM palette's Grayscale40). The stepper grows instead of clipping when a narrow card wraps to three lines.
  - **Refresh icon (top right):** the canvas shows `cmp_Project_States.btn_Refresh` (ArrowSync, 24 × 24) there to developers only (`RefreshButtonVisibility`, still not ported). This app's own visible refresh, `but_Project_States_CheckList_Refresh` (canvas Width 0, same action as before), moved from beside the title to that place, with the ArrowSync icon. It is still shown for Wind / PV only.
  - **Action buttons:** these are the PowerCAT ActionButtons. Outlined (white, 1-px themePrimary border, themePrimary text and icon, hoverButton on hover) for Cancel Approval Request, Reset to …, Abandon and Inactivate; when the project is in that terminal state, the button is themePrimary with white text. Next cluster is filled themePrimary. Its "TriggerApproval" icon is now a lightning bolt (`FlashRegular`; it was an arrow). All are 32 high with radius 2 and the canvas widths.
  - **Table:** the columns are sized to content: Gate Relevance 120, Holding 25.6 % (~390 at most), Country takes the rest (~540 at most), Completion Date 230, Status 240, table width at most 1520 (it was 1440 over seven columns). The two blank canvas header labels (Complete, comment) are folded into the Status column. The header has no visible fill (the PM Grayscale40 is #FFFFFF) and a Grayscale30 rule. Rows are 40 px. The Country toggle icon sits before the caption, as in the canvas (icon X 0). In the Completion Date cell, the pencil comes before the date (`Text(…, "ddd, mmm. dd, yyyy")`). Status holds In Progress / History, the cancel ✕, Complete and the comment icon in one cell. The toggles are 90 × 30 rectangles with radius 2 (canvas 80 × 26, radius 4). Fills and text colours are the canvas ones: themeLight with Grayscale00 text for In Progress, `ColorFade(Green, .4)` for Complete.
  - **Cluster history panel:** it is `wide` (the canvas context is the right half: `(W/4)·3` from X = W/2). The History row has the IconOnly ArrowSync refresh (32 × 24). Each note has a 4-px themePrimary left bar, "Comment:" Semibold, the comment, the date and the right-aligned user name (with ellipsis), then a 1-px themePrimary rule. The note and the actual-task-state tables use the `ChecklisAsHTMLTable` styles (#eceff1 Semibold 12-px header, #dededf borders, 11-px nowrap rows with ellipsis and the text as tooltip, 10 % / 40 % first columns). The footer without Save is the shared outlined Cancel with ✕ (new `PanelCancelButton` in `@/components`, also used inside `PanelButtons`).
  - **Comment panel:** it already matched: shared `TextAreaField` (red `*` before the label, counter on the label row) and `PanelButtons`.
  - **Not matched:**
    - The PO describes In Progress as blue text; the canvas `Color` is Grayscale00, so that is kept.
    - The passed-gate icon is the canvas NotStarted colour (pale on green), not pure white.
    - Below about 1100 CSS px (for example 1366 at 125 %), the table scrolls inside its own box; the page does not scroll sideways.
  - No behaviour, rule, hook, caption, `aria-label` or `data-testid` changed. The approval-flow actions stay disabled with their `EXCLUDED.*` reason (X3).

## D30 · PM Team (Project General Team Screen) redeveloped and connected (20 Oct 2026)

**Scope:** rules, UI, a live Dataverse connection (reads and writes), and docs.
- Code: `src/features/pm/team/` and `src/data/team.ts`. Additive shared changes: `data/keys.ts` (`qk.teamAll`, `qk.team`, `qk.teamMemberDescriptions`) and an optional `saveTooltip` on `PanelButtons` (`components/CanvasFields.tsx`).
- Gap report: `gap-analysis/pm-team.md`. Canvas: `Project General Team Screen.pa.yaml` (solution 1.21.709), `App.pa.yaml` (`gblAppResx.InputBlank`, `DefaultMiddleMaxLength`, `DefaultDefMaxLength`).

**Tables registered** with `pac code add-data-source`, one at a time. The `"primaryKey"` count went from 68 to 70: exactly one was added each time, none dropped (checked by key list after every call). pac changed only `.power/`, the new generated files and `power.config.json`.
- `vsb_projectmembers` (`vsb_projectmemberses`, key `vsb_projectmembersid`), `vsb_projectmemberdescriptions` (`vsb_projectmemberdescriptionses`, key `vsb_projectmemberdescriptionsid`).
- Both are Dataverse tables; the screen reads no Fabric SQL source.
- Column names come from the generated models. The description lookup is `_vsb_projectdescription_value` / `vsb_ProjectDescription@odata.bind` (the old checklist guessed `vsb_ProjectMemberDescription`). The gallery's `'Project Member Description'.Description` is `vsb_projectdescription`; the dropdown's Name is `vsb_name`. `Member` is a lookup to `aaduser` (`vsb_projectmembers_Member_aaduser`, customizations.xml).

Already registered and reused (rule 17): `vsb_project`, and `aaduser` through `searchEntraPeople` / `getEntraPeople` (`data/adminGatesApprovals.ts`) for the search and for the member and manager names and mails, under the shared `qk.entraPeopleSearch` key.

**Live writes** (each a `WritePlan` from `rules.ts`, run by `usePlanWrite`):
1. **Save** (`pcf_btn_…_Buttons_Save.OnChange`): one create (Add Member) or one update (Edit) of `vsb_projectmembers`. It writes `vsb_name` = `MBR-{mail}`, the project, description and member binds, `Trim(Comment)`, and `owningbusinessunit@odata.bind` = the project's `'Besitzer (Unternehmenseinheit)'`. Add and edit send the same payload, as the canvas `Patch` does. `Position` is not written (commented out in the canvas).
2. **Delete** (`cmp_PopUp_Member_Delete_Confirmation.OnConfirm`): one delete, through `executePlan`, which checks the SDK result (rule 14).

After either, the panel or dialog closes and the selection clears, as in the canvas.

**Server automation:** none. No workflow JSON and no `SdkMessageProcessingStep` in the extract mentions `vsb_projectmembers`, so adding or removing a member grants no Teams / SharePoint membership and sends no mail. The canvas calls no flow (no `.Run(`). Nothing is left out for that reason.

**Not ported (no behaviour of their own):** the `SVGImages` radio images (now the radio's checked state), the unreachable leave dialog (`locLeaveGeneralDataConfirmationDialog` is never set), the `colProjectsPrincipals*` shape template, and the hidden Reset button (the panel draft is rebuilt from the selected member each time it opens). `NotConnectedNotice` is removed.

**Corrected (would have failed or shown wrong data):**
- **Project read:** Project ID is `vsb_name` (was `vsb_internalprojectid`). The Deputy is `_vsb_deputyprojectmanagerentra_value`. The two mails come from Entra (the `*mail` columns did not exist).
- **People search:** reads `aadusers` (was the unverified `vsb_microsoftentraids` with `vsb_*` columns). Blank text searches nothing.
- **Binds:** member `/aadusers(<id>)`; description `vsb_ProjectDescription`; `bind` now comes from `@/data/odata` (it was imported from another feature).
- **Manager rows:** the "Project Manager" row always shows, blank when the project has none (the canvas `ClearCollect`; the code had hidden it).
- **Selection:** the radio is a toggle, so a second click clears it (a native radio could never be cleared). Add Member, close, Cancel, Save and Delete clear it, as in the canvas.
- **People picker:** uses the shared `PeoplePicker` (one person, removable, searchable again). Before, a picked person could not be changed.
- **Lock banner:** with no project it shows all five lines (every condition is blank). It is hidden while loading. Its lines carry their canvas label names.
- **Messages:** `INPUT_BLANK` (`gblAppResx.InputBlank`) shows under each field, with the canvas label names. The invented gate-reason strings are removed (the canvas shows none).
- **Rule 16:** these controls carry the canvas `AccessibilityLabel`s (their control names): the picker, the comment box, the panel close (`psf_…_CommandBar`), Save / Cancel and the radio. Save has its canvas Tooltip "Add Project Member" and the picker its Tooltip "Search member". The Name cell's tooltip is the member's mail.
- **Option values** are pinned to the pac-generated `Vsb_projectmembersesvsb_position` (UT-TEAM-034).

**SOURCE DEFECTs fixed** (each marked in `rules.ts`, with a test):
1. **An empty picker saved the first Entra row.** `LookUp('Microsoft Entra IDs', Or(IsBlank(First(SelectedPeople)), …))` matches the first row when nothing is picked. The plan now refuses (UT-TEAM-024, 031).
2. **The comment counter showed "n/256"** while `MaxLength` is 100. It now shows "n/100" (`commentCounterCanvasParity`, UT-TEAM-033).
3. **The save result was never visible:** the success / error text is written and blanked in the same handler. Both are shown now (`WriteFeedback`, UT-TEAM-032).
4. **The delete error was never visible:** `locDeleteMemberlDialogText` is bound to nothing. It is shown now (UT-TEAM-027).
5. **The lock height and visibility disagree** (Project Start Date vs End Date). Resolved to End Date, the visibility rule (`pageLockCanvasHeightParity`, UT-TEAM-008c). Carried over from the UI build.

**DIVERGENCEs:**
- Edit pre-selection: the canvas reads `Office365Users.UserProfile(Member.Id)`; here the persona is the member's `aaduser` row (D25-Q6). `aaduserid` equals the Entra object id (measured, `data/comments.ts`), so the Member bind is the same row.
- `DataSourceInfo` / `RecordInfo` pass, and Dataverse decides (D1, `TEAM_PERMISSIONS`).
- People search returns at most 25 rows (`PEOPLE_SEARCH_TOP`, shared with General Data and Gates Approvals). The canvas has no cap.
- Save's error text names the table instead of `FirstError.Source` (as in D25). Delete shows no progress overlay, because the canvas shows none.
- NEW texts: `TEAM_SCREEN_TEXT` (the load-error state, rule 19) and the two plan refusals in `MSG` (not reachable through the UI).
- Kept as the canvas:
  - the Description dropdown lists every `Project Member Descriptions` row, unsorted and unfiltered (the old checklist's `$orderby vsb_order` named a column that does not exist);
  - the same person can be added twice.

**Tests:**
- `rules.test.ts`: 44 tests. Ids are kept. 002, 008b, 009–013, 017, 018, 020, 021, 026 and 027 were rewritten because they pinned the old behaviour; 029–037 are new.
- `Screen.test.tsx`: 901–909 (they replace the not-connected 901–905).
- `ScreenRoutes.test.tsx`: Team is checked as connected by its root test id, with `@/data/team` mocked.

**Open questions for the product owner:**
1. **Teams / SharePoint membership:** nothing in the solution adds a project member to the project's Team or SharePoint site (no flow or plugin on `vsb_projectmembers`). Is that expected, or is a process missing from the export?
2. **Description dropdown:** keep the canvas order (unsorted, inactive rows included), or sort by Name and hide inactive descriptions?
3. **Duplicates:** the canvas lets the same person be added twice. Keep that, or refuse a person who is already a member?
- **UI layout pass (20 Oct 2026).** Layout only, from the canvas containers: the lock message is the dark `con_Milestones_Page_LockMessage_4` box (RGBA(89,89,89), white 20-px icon and text, PaddingLeft 20) instead of a light-grey strip with a blue icon; the members grid sits in the canvas content padding (20 left, 10 right, 20 top) and is the fixed 790-wide grid of the header labels (40-px lead with the 16-px selection dot, then Description · Display Name · Comment at 250 each), with the 32-px Grayscale40 header and 34-px rows in 8 pt (10.67 px), instead of a full-width table with 44-px rows. No behaviour, caption, `aria-label` or `data-testid` changed.

## D31 · PM Planning (Project Planning Screen) redeveloped and connected (20 Oct 2026)

**Scope:** rules, UI, a live Dataverse connection (reads and writes), and docs.
- Code: `src/features/pm/planning/` and the new `src/data/planning.ts`. Additive shared change: `data/keys.ts` (`qk.planningAll`, `qk.planning`, `qk.aquisitionTypes`, `qk.planningChoices`). No shared component was changed.
- Gap report: `gap-analysis/pm-planning.md`. Canvas: `Project Planning Screen.pa.yaml` (solution 1.21.709), `App.pa.yaml` (`DefaultMaxLength` 55, `DefaultLongMaxLength` 300, `gblAppResx.NumericTwoDecimals`, `colCustomChoiceValues`).

**Tables registered** with `pac code add-data-source`, one at a time. The `"primaryKey"` count went from 70 to 73: exactly one was added each time, none dropped (checked by key list after every call). pac changed only `.power/`, the new generated files and `power.config.json`.
- `vsb_permit` (`vsb_permits`), `vsb_aquisitionstatus` (`vsb_aquisitionstatuses`), `vsb_aquisitiontype` (`vsb_aquisitiontypes`).
- All three are Dataverse tables; the screen reads no Fabric SQL source.
- Already registered and reused: `vsb_project`, `vsb_projectplanning` (D27) and `vsb_customchoicevalue` (D25). The `loadProjectPlanning` in `data/generators.ts` reads only the height columns, so `data/planning.ts` has the full read.
- Column names come from the generated models. The acquisition type's caption is `'Status Name'` (`vsb_statusname`); `vsb_name` is its Id (the earlier hook doc and the skeleton mapped `vsb_name`). The status's project lookup is `vsb_projectid` (`vsb_ProjectId@odata.bind`).

**Live reads:** the project (`vsb_name` = Project ID, `vsb_projectname` = Project Name); the planning row (`$top=1` by project); the planning row's permits (no sort, as the canvas; the old hook doc added an `$orderby`); the two acquisition kinds' types by `Order`; the project's acquisition statuses, joined to their type and sorted by the type's `Order` on the client (the Web API cannot order by a lookup's column); the Legal Planning Basis and Permit Procedure choices, country-neutral or the project's country, by `Order`. With no project country every row is offered, as in the canvas (the old filter returned only the neutral rows then).

**Live writes** (each a `WritePlan` from `rules.ts`; every create and every canvas update carries `owningbusinessunit@odata.bind`):
1. **On visit** (`OnVisible`), inside the reads, guarded so a second run writes nothing: no planning row → one create (Project, Name, the project's business unit); a type with no acquisition row → one create per type, In personam first, then In rem, each by `Order`. A refused seed is traced and the read continues, as the canvas `Patch` has no `IfError`.
2. **Save** (`pcf_…_ButtonsSave`): one update of `vsb_projectplannings` (a create when the row is missing), with the canvas columns on every save: Project, Name, the form fields, the two `Custom Choice Values` binds, the project's business unit. Secured Access and Repowering Details are blank for Repowering = No; the height is blank while the toggle is off.
3. **Permit Save**: one create or update of `vsb_permits` with the Project Planning bind, the five fields and the PLANNING row's business unit, on create and update alike. **Permit Delete**: one delete through `executePlan`, which checks the SDK result (rule 14).
4. **Acquisition Save** (Save_UnderLaw / Save_InRem): one update with Secured, Required, the fraction and, as the canvas re-writes them, Project, Type and the project's business unit. **Clear & Save**: one update blanking the three values.

Texts: the canvas loading texts ("Loading, Please wait...", "Project Planning will be saved, please wait...", "Saving Aquisition Status..."), the Notify texts ("Project Planning data was successfully saved!", "Permit was successfully added!" (after an edit too, as the canvas), "Permit deleted.") and the `Error: …` texts, which name the table instead of `FirstError.Source` (as D25). The acquisition error is the canvas text verbatim, typo and wrong entity included: "Error: assosiated Shareholder Entity could not be saved." (Q2).

**Server automation:** none. No workflow and no `SdkMessageProcessingStep` in the extract is triggered by `vsb_projectplanning`, `vsb_permit`, `vsb_aquisitionstatus` or `vsb_aquisitiontype`. `CreatingTeamsandSPOSite-ProjectCreation`, `UpdateTeamsandSPOSite`, `ManualTrigger-UpdateTeamsandSPOSite` and the gate / checklist approval flows only READ the planning row. The canvas calls no flow (no `.Run(`); nothing is left out for a flow.

**Not ported (no behaviour of their own):** `colPlanningFormValidation` (dirty and valid are derived), the commented-out bulk save, the `SVGImages` selection dot (now the row's radio state), the `Trace` warning, the report-problem panel (the shell's). **Documented gap:** the leave dialog (`cmp_PopUp_Leave_Planning_Confirmation`) is not rendered, because the shell's `HashRouter` cannot block navigation (same gap as D25 / D26); its texts stay in `rules.ts`. `NotConnectedNotice` is removed.

**Corrected (would have failed or shown wrong data):**
- Cooperation Details `MaxLength` 300 (D15e, resolved): the 55-character slice would have truncated a stored value on Save.
- Acquisition gallery columns in the canvas order: Types · Secured · Required · Aquisition Status [%] (the code had Required before Secured).
- Gallery % cell: the stored fraction × 100, not rounded down, blank fraction 0, "N/A" for Required = 0 (canvas). The panel % is computed as `Secured × 100 / Required`, so 29 of 100 shows 29 (binary floating point gave 28).
- Reset semantics: Repowering = No / Unknown and unchecking the height toggle restore the STORED values (`Reset`); they do not blank them. With Repowering = Unknown the stored Secured Access is kept on Save, as in the canvas. Cooperation no longer clears Partner and Details (the canvas OnChange only marks dirty).
- The height display rounds like `"#0.0#"` (it truncated).
- The permit grid shows `Text(date, "d/mm/yyyy")`, blank for no date (the earlier "19 Oct 2026 (Plan)" came from a GUIDE screenshot without a log entry).
- New Permit, the panel close and Cancel, and the footer Cancel clear the permit selection, as in the canvas.
- Every write's Owning Business Unit and binds follow the canvas `Patch`: Project and OBU on every planning save; the planning bind and the planning row's OBU on every permit save; Project, Type and OBU on the acquisition Save.
- The lock banner shows all five lines with no project, hides while loading, and its lines carry their canvas label names. The invented hint and gate-reason strings and the unused "permit incomplete" text are removed (the canvas shows none).
- Comments corrected: `fn_Numeric_Revenues` lives on Project Revenues Screen and is reachable cross-screen, so the canvas height validation is live; "Clear & Save" is honestly labelled in the canvas (there is no "Cancel that clears" defect).
- **Rule 16:** every control now carries its canvas `AccessibleLabel` (its control name) as `aria-label`: the five dropdowns, the five text inputs, the footer Save / Reset, the permit panel Save / Cancel / close (`pcf_com_…_CommandBar`), the acquisition panel buttons, close, LLA Type and % fields. The earlier captions were wrong against the canvas (C4). The permit row radio uses the selection-dot name with the row id appended. Secured / Required have `MaxLength` 3; the multiline fields are text areas. All ids are literals now, so the canvas-identity gate verifies 33 of them (0 findings).
- **Option values** are pinned to the pac-generated enums (`Vsb_projectplanningsvsb_cooperation` / `_repowering` / `_planningbasiscategory`, `Vsb_permitsvsb_*datetype`, `Vsb_aquisitiontypesvsb_type`) by UT-PLAN-060.

**SOURCE DEFECTs fixed** (each marked in `rules.ts`, with a `…CanvasParity` twin and a test):
1. **Height error label** uses `And` where `Or` is meant, and its range branch is un-negated (`validateHeightLimitCanvasParity`, UT-PLAN-017/018). Carried over.
2. **"Secured must be between 0 and 100."** contradicts its own 0–999 check; the message says 999 (`MSG_CANVAS.securedRange100`). Carried over.
3. **In-rem acquisition Save** divides without `IfError`, so Required = 0 fails the Patch; both kinds now store 0, as In personam does (`aquisitionFractionCanvasParity`).
4. **Acquisition seed** is all-or-nothing per kind, so a type added later never gets a row; the missing types are seeded (`planAquisitionSeedCanvasParity`).
5. **Lock banner** height tests Project Start Date, visibility End Date; End Date is used (`pageLockCanvasHeightParity`). Carried over.
6. **`Text(0, "#")`** showed a stored height of 0 as blank, which blocked Save with the toggle on; 0 shows "0" (`formatOneToTwoPlacesCanvasParity`).
7. **Footer Cancel** reset ten fields but not the height toggle and value, while clearing every dirty flag; it now resets everything (`resetPlanningFormCanvasParity`).
8. **Footer Cancel after a save** stayed disabled for the rest of the visit (`locAllowPlanningReset` is only set back by OnVisible); it now follows the dirty state (`canResetCanvasParity`).

**DIVERGENCEs:**
- `DataSourceInfo` / `RecordInfo` (`CanEditSelectedProject`, permit Edit / Delete) have no SDK equivalent: they pass and Dataverse decides (D1, `PLANNING_CAN_EDIT`).
- Clear & Save does not arm the planning Save (the canvas marks the `AquisitionStatus` row dirty, so an unchanged planning patch could be sent); `canSaveCanvasParity`.
- The panel % shows nothing while Secured or Required is blank (L4; canvas 0), "N/A" for a non-numeric input (canvas 0) and for Required = 0 (canvas).
- Secured Access stops at 100 characters (the column's maximum); the canvas sets no `MaxLength`.
- A whitespace-only permit name does not enable Save (the canvas `IsBlank` accepts it); the name is trimmed on save.
- Dirty is derived from the values, so reverting a value makes the form clean again (as D25).
- NEW texts: `PLANNING_SCREEN_TEXT` (the load-error state, rule 19) and the plan refusals in `REFUSAL` (not reachable through the UI).

**Tests:**
- `rules.test.ts`: 65 tests. Ids are kept where the case survives; 008–010, 014, 020, 023, 026, 030 and 037–039 were rewritten because they pinned the old behaviour; 042–049 and 060 are new.
- `Screen.test.tsx`: 901–908 (they replace the not-connected 901–905).
- `ScreenRoutes.test.tsx`: Planning is checked as connected by its root test id, with `@/data/planning` mocked.

**Open questions for the product owner:**
1. **Hidden values are saved:** as in the canvas, Cooperation Partner / Details stay stored when Cooperation changes to No or Unknown, and Secured Access stays stored for Repowering = Unknown. Keep that, or blank hidden fields on Save?
2. **Acquisition error text:** the canvas says "Error: assosiated Shareholder Entity could not be saved." (a typo, and the wrong entity). Keep it verbatim, or correct it to name the Aquisition Status?
3. ~~**Permit dates**~~ — **answered (L3, 20 Oct 2026): new format, implemented.** See below.
4. ~~**Panel percentage**~~ — **answered (L4, 20 Oct 2026): show nothing, implemented.** See below.
5. **Leave guard:** a router blocker needs a data router in the shell (shared with D25 / D26). Approve that shell change? **→ Built 20 Oct 2026: the shared `UnsavedChangesGuard` (D35).**

**Product-owner answers implemented (20 Oct 2026):**
- **L3 — permit dates.** Grid (`lbl_…_PermitsRowSubmitted` / `…Approved`): `dd/mm/yyyy` with a two-digit day (`permitDateCell`; DIVERGENCE from the canvas `"d/mm/yyyy"`, kept as `permitDateCellCanvasParity`), built from the stored date's own parts. Colour: the canvas `FontColor` (Y:1627, 1638) is `If('… Date Type' = Actual, ColorValue(gblAppTheme.palette.themePrimary))`, so an Actual date is `palette.themePrimary` blue and a Plan (or untyped) date the default black text (`permitDateIsActual`). Panel input: the canvas `DatePicker` has `Format: LongAbbreviated` and `StartOfWeek: Monday`; the date now shows as "Mon, Oct 19, 2026" (`permitInputDate`, local parts) with a "Plan" / "Actual" tag from the date's own type (`permitDateTag`, NEW — the canvas shows the type only in the radio). New shared component `components/TaggedDateField.tsx` (Fluent `DatePicker` + `Badge`, exported from `index.ts`); the picker keeps the canvas name on `aria-label` / `data-testid`; the tags are `planning-permit-submission-date-tag` / `planning-permit-approval-date-tag`. Tests: UT-PLAN-030 (rewritten), 061–063, 901 (updated), 909 (new).
- **L4 — panel %.** `securedPercent` returns "" while Secured or Required is blank (neither "N/A" nor 0); the canvas 0 is `securedPercentCanvasParity`. The stored fraction is unchanged (blank cannot be saved). UT-PLAN-020 rewritten.
- L1, L2 parked (current behaviour kept). Note for the identity gate: the two `dte_…` ids now go through `TaggedDateField`'s `name` prop, which the gate does not parse (Planning reports 31 verified ids instead of 33; both names are unchanged).
- **UI layout pass (20 Oct 2026).** Layout only, from the canvas containers: the screen no longer locks itself to the viewport with an inner scroll box (that box cut off the Height limitation field and the Permits grid); the shell scrolls and the Save / Cancel row is the canvas 50-px row (gap 10, PaddingRight 10, 96 × 32) at the bottom of the white panel. The lock message is the dark `con_Milestones_Page_LockMessage_5` box; the tab strip is 50 px with the TabList half wide. General is the canvas wrapping row of two 380-wide forms (Cooperation · Partner · Details with PaddingTop/Bottom 20; Legal Planning Basis · Category · Procedure · Details with PaddingTop 20), 70 / 94 / 178-px field boxes inset 20 px with Semibold labels, then the Height limitation row (40-px toggle row at X 10, a 380-wide field) and the Permits block (command bar at X 40; a #FAFAFA 36-px header and 34-px rows at X 20, `Min(700)` wide, columns 30 / 240 / 180 / 180). Repowering is one 380 column. Aquisition Status is two `Min(780)` blocks (gap 10) with a #FAFAFA header (Semibold 14.67-px name over the captions), 29-px rows with a hoverButton rule, 14.67-px RGBA(50,49,48) text and right-aligned Semibold counts (Name 300, Secured 100, Required 100, % 160, action 60). Not matched: the `{Len}/N` counters stay under the field (the shared `TextAreaField` places them); the canvas header puts the block name and "Types" in one 44-px cell, here the name is a band above the table's header row. No behaviour, caption, `aria-label` or `data-testid` changed.

## D32 · PM Grid Operator (Grid Operator Screen) redeveloped and connected (20 Oct 2026)

**Scope:** rules, UI, a live Dataverse connection (reads and writes), and docs.
- Code: `src/features/pm/grid-operator/` and the new `src/data/gridOperator.ts`. Additive shared change: `data/keys.ts` (`qk.gridOperatorAll`, `qk.gridOperator`). No shared component was changed. The project is read with Planning's `loadPlanningProject` (`data/planning.ts`, reused, not copied).
- Gap report: `gap-analysis/pm-grid-operator.md` (53 requirements: 24 covered, 12 partial, 10 missing, 7 wrong before this change). Canvas: `Grid Operator Screen.pa.yaml` (solution 1.21.709), `App.pa.yaml` (`DefaultMaxLength` 55, `gblAppResx.NumericOneDecimals` / `NumericThreeDecimals`), `Components/fn_Numeric`. The hidden-controls tool reports 0 hidden controls on this screen.

**Table registered** with `pac code add-data-source -a dataverse -t vsb_gridoperator`: the `"primaryKey"` count went from 73 to 74, exactly one added (`vsb_gridoperators`), none dropped (checked by key list). pac changed only `.power/`, the new generated files and `power.config.json`. `vsb_project` was already registered. It is a Dataverse table; the screen reads no Fabric SQL source.
- Column names come from the generated `Vsb_gridoperatorsModel` (the reference JSON has no `vsb_GridOperator` attributes): all ten columns of `GRID_OPERATOR_COL` are confirmed, the project lookup is `vsb_projectid` (`vsb_ProjectId@odata.bind`), and both option sets are 952850000–2 Yes / No / Unknown (pinned by UT-GRIDOP-040). `customizations.xml`: Operator / Expansion Details hold 100 characters, Substation Operator 256; lengths have 4 decimals, diameters and voltage 2.

**Live reads:** the project (`vsb_name` = Project ID, End Date, Project Start Date, Total Capacity, Net Yield p50, Cluster State, business unit), re-read on every visit as `OnVisible`; the project's `Grid Operators` row, `$top=1` by `_vsb_projectid_value` (no row is the normal state; Save then creates).

**Live write** (a `WritePlan` from `rules.ts`, run by `usePlanWrite`): **Save** (`pcf_…_ButtonsSave`) — one update of `vsb_gridoperators`, or one create when the project has no row, with the ten form columns plus the Project bind and the project's business unit (`owningbusinessunit@odata.bind`) on every save, as the canvas `Patch`. The row is then re-read, as the canvas re-`LookUp`s it. Texts: the canvas success Notify "Grid operator data was saved successfully!" and the error Notify "Error: Grid operator data could not be saved. Internal error: originated on vsb_gridoperators. Message: …" (the table stands in for `FirstError.Source`, as D25). The canvas shows no progress text for this save, so none is shown (Save is disabled while it runs). Nothing is written on visit.

**Server automation:** none. No workflow and no `SdkMessageProcessingStep` in the extract is triggered by or reads `vsb_gridoperator`, and no plugin is registered on it. The screen writes no `vsb_projects` column. The canvas calls no flow (no `.Run(`); nothing is left out for a flow. Apply / Apply All do not exist here (D20).

**Not ported (no behaviour of their own):** `colGridOperatorFormValidation` (dirty and valid are derived), the ten `Reset()` calls (Cancel restores the bound values), `locAllowGridOperatorReset` (see defect 6), the header and report-problem panel (the shell's). **Documented gap:** the leave dialog (`cmp_PopUp_Leave_GridOperator_Confirmation`) is not rendered, because the shell's `HashRouter` cannot block navigation (same gap as D25 / D26 / D31); its texts and `shouldPromptOnLeave` stay in `rules.ts`. `NotConnectedNotice` is removed.

**Corrected (would have failed or shown wrong data):**
- Numbers display ROUNDED like `Text(x, "#0.0#")` / `"#0.0##"` (1.2345 km shows 1.235). The code truncated, citing a spec test rather than the canvas (gap U13; resolved as Planning's height, D31).
- Text fields are not cut to 55 characters on save: the input stops typing at 55 (`MaxLength`), but a longer stored value (the columns hold 100 / 100 / 256) is no longer truncated by an unrelated save (as D31).
- Project and Owning Business Unit are written on every save, as the canvas `Patch` (they were sent on create only — gap D6).
- The save error text is the canvas one; the old comment said the canvas had no error Notify (gap B8).
- With no project the lock banner shows all five bullets (it showed only "• General"); the banner, its title, icon and bullets carry their canvas names (`con_Milestones_Page_LockMessage_6`, `icon_milestones_lock_6`, `lbl_…_VisibilityMessage_27`–`_32`). The invented per-bullet hints, the Save-reason strings and the tab error badge are removed (the canvas shows none).
- **Rule 16:** every field's `aria-label` is its canvas `AccessibleLabel` (the control name), and Save / Cancel carry `pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsSave` / `…ButtonsReset` (they had the captions — gap U3, U5). All ids are literals; the canvas-identity gate verifies 16 of them (0 findings).
- Operator, Grid expansion details and Substation operator are multiline (`TextAreaField`) with `maxLength` 55 and the counter; each tab is one column, at most 380 px wide (`Min(380, Parent.Width)`); Save has the CheckMark icon, Cancel the Dismiss icon in outline style.
- Loading and load-error states (rule 19): an `EmptyState` on a failed read; fields and Save disabled while loading.

**SOURCE DEFECTs fixed** (each marked in `rules.ts`, with a `…CanvasParity` twin and a test):
1. **Operator `OnChange`** updates the `GridExpansionRequired` validation row (`dirtyFieldsCanvasParity`). Carried over.
2. ~~**Grid Connection fields**~~ — **REVERTED (R1, 20 Oct 2026).** The canvas has no `DisplayMode` or lock / Draft validation on the six Grid Connection controls, so they stay editable on a locked or Draft project, as the canvas. See below.
3. **Lock banner** height tests Project Start Date, visibility End Date; End Date is used (`pageLockCanvasHeightParity`). Carried over.
4. **Save gate** omits the grid-voltage error label, so an invalid voltage could be saved (`canSaveCanvasParity`, UT-GRIDOP-018). Carried over.
5. **`Text(0, "#")`** shows a stored 0 as blank, and because the canvas Save writes `Value()` of every field, the next save of any field overwrote that 0 with blank. 0 now shows "0" (`formatDecimalCanvasParity`, UT-GRIDOP-033). New.
6. **Cancel after a save** stayed disabled for the rest of the visit (`locAllowGridOperatorReset` is only set back by `OnVisible`); it now follows the dirty state (`canCancelCanvasParity`, UT-GRIDOP-035). New, as D31 defect 8.

**DIVERGENCEs:**
- `CanEditSelectedProject` (`DataSourceInfo` / `RecordInfo`) has no SDK equivalent: it passes and Dataverse decides (D1, `GRID_OPERATOR_CAN_EDIT`). The fields are gated on it as well as Save (gap S5); with the constant `true` this changes nothing today.
- The tab persists through `?tab=` instead of resetting to Grid Operator on every visit (gap B1), as Planning.
- Dirty is derived from the values, so typing a value back makes the form clean again (as D25 / D31).
- Numbers are formatted, validated and parsed in en-US (dot) notation, as the other connected PM screens; the canvas `fn_Numeric` branches on `Language()` (gap S12). The voltage guard itself rejects a comma.
- The lock banner keeps the shared PM style (light grey, as Planning and Team); the canvas is dark grey (RGBA 89, 89, 89) with white text. One shared `PageLockNotice` is the D17 f backlog item.
- The character counter sits under the field (the kit's `TextAreaField`); the canvas puts it right-aligned on the label row.
- NEW texts: `GRID_OPERATOR_SCREEN_TEXT` (the load-error state, rule 19) and `REFUSAL.noProject` (not reachable through the UI).

**Tests:**
- `rules.test.ts`: 55 tests. 002, 005, 006, 016, 018, 020, 023–026 and 028 were rewritten because they pinned the old behaviour (truncation, create-only binds, the 55 cut, `allowReset`, the invented reasons); 033–040 are new.
- `Screen.test.tsx`: 901–908 (they replace the not-connected 901–904): bound values, canvas ids and `AccessibleLabel`s, lock and Draft gating of both tabs, the update and create jobs, an inline error, the load-error state.
- `ScreenRoutes.test.tsx`: Grid Operator is checked as connected by its root test id (`Grid Operator Screen`), with `@/data/gridOperator` mocked.

**Open questions for the product owner:**
1. ~~**Grid Connection gating**~~ — **answered (R1): canvas behaviour, implemented.**
2. ~~**Diameter decimals**~~ — **answered (R2): one decimal (canvas); already implemented, no change.**
3. **Leave guard:** a router blocker needs a data router in the shell (shared with D25 / D26 / D31). Approve that shell change? **→ Built 20 Oct 2026: the shared `UnsavedChangesGuard` (D35).**

**Product-owner answers implemented (20 Oct 2026):**
- **R1 — Grid Connection fields follow the canvas.** Checked `Grid Operator Screen.pa.yaml` Y:935-1507: the six controls (Substation construction required, Substation operator, the two lengths and two diameters) and their containers carry no `DisplayMode` and no lock / Draft validation; only the tab strip and the four Grid Operator controls do. So `canEditField` now returns the canvas gating for them (editable on a locked or Draft project); Save stays disabled there (its own `DisplayMode` tests Draft and the lock). The reverted fix is kept, NOT live, as `canEditFieldAllGated`. `canEdit` (constant `true`, D1) is still folded in. Tests inverted: UT-GRIDOP-022, the Draft case, 903 (fields enabled, Save disabled).
- **R2 — Diameter: one decimal.** `validateDiameter` already uses `isDecimalWithPlaces(…, 1)`, as the canvas `fn_Numeric_GridOperator.IsOneDecimal` (Y:1196, 1409); no code change, comment updated (the stored-12.75 inconsistency stays as the canvas has it).
- Leave guard (Q3) is the separate shared X1 build.
- **UI layout pass (20 Oct 2026).** Layout only, from the canvas containers: the screen no longer locks itself to the viewport (the shell scrolls; the Save / Cancel row stays at the bottom of the white panel); the lock message is the dark `con_Milestones_Page_LockMessage_6` box (RGBA(89,89,89), white text, PaddingLeft 20) instead of a light-grey strip; the tab strip is 50 px with the TabList half the width; each tab is one `Min(380, Parent.Width)` column with PaddingTop 20, 70-px single-line and 102-px multiline field boxes inset 20 px and Semibold labels; the button row is the canvas 50-px row (gap 10, PaddingRight 10, 96 × 32 buttons) without the extra top border. Not matched: the `{Len}/55` counters stay under the field (the shared `TextAreaField` places them; the canvas puts them right-aligned on the label row). No behaviour, caption, `aria-label` or `data-testid` changed.

## D33 · PM Revenues (Project Revenues Screen) redeveloped and connected (20 Oct 2026)

**Scope:** rules, UI, a live Dataverse connection (reads and writes), and docs.
- Code: `src/features/pm/revenues/` and the new `src/data/revenues.ts`. Additive shared changes: `data/odata.ts` (`leDate`, `geDate`, as `gtDate`), `data/keys.ts` (`qk.revenuesAll`, `qk.revenues`, `qk.revenuesReference`). The currencies, the country inflation profiles and the cluster states are read through the existing `loadCurrencies` / `loadCountryInflation` (`data/landLease.ts`) and `listProjectStates` (`data/generalData.ts`), not copied. No shared component was changed.
- `data/dataverseNames.ts`: the stale `CHOICE.hedgingType` entry was removed (see "Hedge-type fix").
- Gap report: `gap-analysis/pm-revenues.md` (118 requirements: 45 covered, 27 partial, 23 missing, 23 wrong before this change). Canvas: `Project Revenues Screen.pa.yaml` (solution 1.21.709), `App.pa.yaml` (`gblAppResx`, `colRevenueSubaccounts`). The hidden-controls tool's five live items are ported: `btn_IndividualHedgeVolumeDuration_Recalculate` (`generateVolumeRows`, now run on every start / duration / Reset-to-COD change), `btn_ProjectRevenue_AddEdit_SaveFunctionality` (the save), the inflation-profile text input; `drp_…_AreaInflationProfile_3` and its container are hidden and their payload use is commented out, so they are not rendered.

**Tables registered** with `pac code add-data-source`, one at a time. The `"primaryKey"` count went from 74 to 77: exactly one was added each time, none dropped (checked by key list after every call). `check-power-sources` reports 77 registered and 0 problems.
- `vsb_balancingprice` (`vsb_balancingprices`), `vsb_revenueindividualhedgevolume` (`vsb_revenueindividualhedgevolumes`), `vsb_revenuesubaccount` (`vsb_revenuesubaccounts`).
- Already registered and reused: `vsb_project`, `vsb_projectstate`, `vsb_projectrevenue` (D26), `vsb_energyyield` (D28), `vsb_countryinflationprofile`, `transactioncurrencies` (the canvas `Currencies`, D24).
- Column names come from the generated models (`Vsb_projectrevenuesModel`, `Vsb_balancingpricesModel`, `Vsb_revenueindividualhedgevolumesModel`); `dataverse-attributes.json` has none of the three revenue tables. All 14 `Is … Standard Assumption?` columns exist. Binds: `vsb_Project`, `vsb_Subaccount` (`/vsb_revenuesubaccounts`), `vsb_Currency` (`/transactioncurrencies`), `vsb_RevenueContract`, `owningbusinessunit`.

**Not connected (product decision D2):** `Assumptions Revenues SQL` is a Fabric SQL source (`[dbo].[AssumptionsRevenue]`, as D26/D28 found), not a Dataverse table. The standard-assumption engine (`applyRevenueEngine`, the old in-Screen `applyAssumptions` moved to `rules.ts`) therefore runs over no rows: nothing is standard, no price, duration, inflation or hedged volume is derived, and the description is the bare "<type> <country>". A NEW notice (`REVENUE_SCREEN_TEXT.assumptionsNotConnected`) shows in the contract panel. Every engine rule stays tested. `Tarrif Price Standard Assumptions` is only in commented-out formulas and is not read. The other sources (Energy Yields, Country Inflation Profiles, Revenue Subaccounts, Currencies) are Dataverse tables and are connected.

**Live reads** (`data/revenues.ts`): the project (with `'Cluster State'.Order` from `vsb_projectstates`; `countryCode` is the country GUID — `Country.Country` is the primary key in Power Fx, the old "code" note was wrong); the project's contracts and balancing prices (`createdon asc`); the edited contract's individual volumes; the negative-price yield check (`$top=1`, active, Consider Negative Prices); `First(Sort('Revenue Subaccounts', Order))`; the EUR / PLN currency; the project country's inflation profiles; at Save time, the contracts overlapping the new term (`le` / `ge` date-only filters, the edited row excluded).

**Live writes** (each a `WritePlan` from `rules.ts`, run in order by `usePlanWrite`):
1. **Contract Save** (`planSaveContract`, after the hedge 100 % check for the % type and the Individual Volumes confirmation): the contract create / update with every canvas column — Name, Project, Subaccount, Label, Description, Currency, the German FiT numbers (0 when hidden), Tariff, Tariff p90, dates and durations, the inflation group, `'Inflation Country Area'` = the project's Area name, the project's Owning Business Unit, the 14 flags, Consider Negative Prices, NegativePriceManualOverride, Hedge Type, Hedged Volume, FixedContractedmwhpa — then the deletion of EVERY stored individual volume of an edited contract (any hedge type, as the canvas `RemoveIf`), then, for Individual Volumes, one create per year `{Year, RevenueContract, StartDate, EndDate, Owning Business Unit, IndividualContractedmwhpa}` (a new contract's rows bind `@created#0`).
2. **Contract Delete** (`planDeleteContract`): the contract only. `vsb_projectrevenue` → `vsb_revenueindividualhedgevolume` is `CascadeDelete: Cascade` (`customizations.xml`), so the canvas' following `RemoveIf(RevenueIndividualHedgeVolumes, …)` has nothing left to do; the app does not redo it. This answers the gap's D18 question.
3. **Balancing Save** (`planSaveBalancing`): Name `"Balancing Price " & n`, Project, Periods, Shift of COD (first / sole period only, else blank), Duration Year / Month, Price — no start / end date (see below). **Balancing Delete**: one delete.

Texts: the canvas spinner texts ("Validating Hedged Volume...", "Please wait, saving...", "Deleting Contract...", "Please wait, deleting..."), the info pop-up "Hedged Volume more than 100%" with the canvas range text, and the save `Notify` "Error: Contract could not be saved correctly. Internal error: originated on <table>. Message: …" (the table stands in for `FirstError.Source`, as D25). Deletes have no canvas error text; the shared write message is shown.

**Server automation** (verified against `04-flow-inventory.md`):
- **Plugin step "Balancing-price period date sync"** on `vsb_balancingprice` Create (`vsb_name, vsb_project`) / Update (`vsb_shiftofcoddatemonths`) computes the period dates. Neither the canvas nor this app writes them; this answers the gap's question 5. The COD-shift plugin on `vsb_projects` re-syncs them when the COD moves (D26).
- **No flow** is called (no `.Run(`) or triggered by these tables; the screen writes no `vsb_projects` column. No approval, project-create or Apply control exists here, so nothing had to be disabled.

**Hedge-type fix (the known bug).** The wrong value was `CHOICE.hedgingType.individualVolumes = 952850001` (`data/dataverseNames.ts:117`), not `CHOICE_FINANCE`: `CHOICE_FINANCE.hedgingType` was already 1 / 2 / 3 and matches the generated `Vsb_projectrevenuesvsb_hedgetype` (`HedgedVolume___` / `FixedVolumep_a__MWh_` / `IndividualVolumes`). Blast radius, by repo-wide grep: `CHOICE.hedgingType` had **no user** left — `milestones/rules.ts:72` (`HEDGE_TYPE_INDIVIDUAL_VOLUMES`) and `data/milestones.ts` already read `CHOICE_FINANCE` (D26), and `revenues/rules.ts` always did. The stale entry was removed rather than duplicated (rule 17), with a comment pointing at `CHOICE_FINANCE`. UT-REV-120 pins the whole `CHOICE_FINANCE.hedgingType` map to the generated enum and asserts `CHOICE` has no copy; UT-REV-121 pins Revenue Labels and Periods. `milestones/` was not changed; its suite passes.

**Corrected (would have failed or shown wrong data):**
- Every hook returned `notConnected()`; Save, Delete and Confirm wrote nothing. `NotConnectedNotice` is removed.
- The 14 standard flags were discarded (`const [, setFlags]`); they are now kept per field in the form (`FormStandard`) and written (`buildStandardFlags`). Edit reads them back (`standardFromStored`).
- Payload: `'Inflation Country Area'` and the Owning Business Unit added; Site Quality p90 / Correction Factor p90 follow their `= Wind` containers (a German Hybrid FiT wrote values where the canvas writes 0); a blank visible number is `Value("")` = null, not 0.
- Save gate (`pcf_…_Save_1.DisplayMode`, term for term): Site Quality p90 may be blank, an invalid Site Quality p50 blocks, `Trim(Description)`, and the inflation profile text is required even with the country toggle on (it then holds the country value).
- Add Contract opens with an EMPTY Type; the engine runs on the first Type selection (it pre-selected "PPA"). Add is gated on the page lock / Draft only; a missing subaccount shows in the panel and blocks Save (S4).
- Field behaviour: any edit makes the contract non-standard and removes "Standard " from the description (B8 — `MSG.standardDescription` is now the canvas text, so the description error can fire); a new start date sets the inflation start year; start / duration / Reset-to-COD regenerate the individual volumes; Tariff p90 = Bidding × CF p90 for Germany FiT, else the p50 tariff (B12); the country-inflation toggle and the start year look the value up (Italy adds the Area on the start year only, as the canvas); the negative-price re-sync icon; switching to % keeps the % value.
- Gates: the tabs, grids and commands are disabled, not hidden, while locked or Draft (S3); the inflation toggle is disabled for Germany & FiT (S14); the country toggle is always shown (S15); Balancing Price needs `'Cluster State'.Order >= 4` and < 10 rows, with the Cluster-4 message, the empty info tag and the grid each on its own canvas `Visible` (S6–S8); Shift of COD shows while editing the sole period (S21). The invented "Only the most recent period can be …" tooltips are removed.
- Texts (rule 7): the numeric errors are the canvas ones ("Numeric value without decimals", "… two decimals", "… three decimals", "… one decimals", "… two decimals."), the balancing ranges "Value must be between -25 and +50." / "-5 and +10."; the fifth lock bullet "• Change the project status from Draft" (D15 f; Finance shares `pageLock` and its canvas has the same text); balancing years 0…30 (D15 g).
- Grid (U7/U9/U11/U18): `dd.mm.yyyy` dates, `#,##0.00` tariff, `# / #0.0#` Site Quality, "x %" / "#,##0 MWh" hedged volume (blank for Individual), the currency NAME, the inflation cell `"#0.00 "` or the country / " Italy - <region>", the per-row Area (`'Inflation Country Area'`, Italy with the country profile).
- Rule 16: every `txt_` / `drp_` / `dte_` input carries its canvas `AccessibleLabel` (its name) as `aria-label` (it carried the caption); the tab list its `AccessibleLabel`; Add Contract / Add Balancing Price their canvas names; Save / Cancel their `pcf_…` names; the contract bar keys are the canvas `ItemKey`s (`editRevenueContract` / `deleteRevenueContract`); the balancing row actions `con_Main_Project_Overview_Header_SuitBar_CommandBar_1-<id>-editProject|deleteProject`. The lock banner uses the canvas fill RGBA(89, 89, 89) with white text and carries its control names. The canvas-identity gate verifies 31 ids (0 findings).
- `ITALY_PRICE_REGION` accepts the canvas "Valle d’Aosta" (U+2019) as well as U+0027.
- The load-error state (rule 19).

**SOURCE DEFECTs fixed** (each marked in `rules.ts`, with a twin and a test where it applies):
1. **`'Is Use Custom Inflation Standard Assumption?'`** tests `locRevenueInflationCountryProfile.StandardAssumptionValue` (what the standard says) instead of `.IsStandardAssumption`; the field's own standardness is written (`buildStandardFlagsCanvasParity`, UT-REV-116).
2. **Balancing create writes no Owning Business Unit**, unlike the contract and its volumes (CONVENTIONS rule 4); the create binds the project's business unit, updates leave the owner alone (`ownerCanvasParity`, UT-REV-109).
3. **Contract Edit / Delete `ItemEnabled`** asks `RecordInfo` of the previously selected contract; the selected row is the one asked about (no twin: `RecordInfo` passes under D1).
4. (Carried over) the price-curve fallback compares prices to years: the nearest-YEAR selection is used (`priceForYearCanvasParity`).
5. (Carried over) Shift of COD bounds: the inclusive visibility rule wins (`shiftOfCodMessageRuleCanvasParity`).
Reproduced and documented: the hard-coded `true` start-date flag (ambiguity 5); the balancing row bar's tooltip "Home screen navigation" (a copy-paste, kept verbatim); the Individual Volume rows' repeated literal ids (D16 c).

**DIVERGENCEs:**
- `CanEditSelectedProject` / `RecordInfo` have no SDK equivalent: they pass and Dataverse decides (D1).
- ~~The card gallery … is one table~~ — **reverted (V6, 20 Oct 2026):** the canvas card gallery is rebuilt (see below).
- The tab persists through `?tab=` (the canvas resets it on every visit), shown on the default tab while the tabs are disabled (B1, as D31/D32).
- The inflation Area term ignores the spaces around the hyphen (`sameInflationArea`; twin `countryInflationValueCanvasParity`, UT-REV-131): the region map follows 1.21.753 ("Centre-North") but the measured profile rows are spelled "Centre - North".
- The form's errors show inline under each field; the canvas collects them in the info button (U22). The subaccount error is inline in the panel.
- Numbers display in en-US notation, as the other connected PM screens (the canvas follows `Language()`).
- The hedge check reads the overlapping contracts in one server query when Save is pressed (the canvas `Sum(Filter(…))` per month).
- After a contract save the panel closes before the write, as the canvas; a failure is shown on the page.
- This canvas screen has no unsaved-data leave dialog; the shell's navigation-blocker gap (D25/D26) does not apply here.
- NEW texts: `REVENUE_SCREEN_TEXT` (the load-error state, the Fabric notice, the plan refusals).

**Tests:**
- `rules.test.ts`: 141 tests. Ids kept where the case survives; UT-REV-072, the inflation-branch case, UT-REV-062/066 (signatures) and the fixtures were rewritten because they pinned the old behaviour; UT-REV-100…136 are new, including the enum pins (120, 121).
- `Screen.test.tsx`: 901–910 (they replace the not-connected 901–907): captions, formats and canvas ids; lock / Draft gating with the grid still shown; the empty-Type Add panel; the edit save job (update + volume deletes); the hedge > 100 % pop-up; the contract and balancing deletes; the Cluster-4 gate; the balancing create with the owner; the load-error state.
- `ScreenRoutes.test.tsx`: Revenues is checked as connected by its heading "Revenue", with `@/data/revenues` mocked.

**Open questions for the product owner:**
1. **Target version:** 1.21.753 (Italy prefix slice, "Centre-North" zone spelling, zone-only price pool — what the rules follow) or the 1.21.709 YAML on disk? It decides the Italian description, prices and inflation Area once Fabric is connected.
2. **Fabric SQL:** until `Assumptions Revenues SQL` is reachable, every contract is typed by hand and nothing is marked standard. Acceptable, or keep Add Contract disabled until then?
3. **Balancing owner:** confirm binding the project's business unit on a new balancing price (fix 2), where the canvas leaves the creating user's.
4. **Custom-inflation flag:** confirm writing the field's own standardness (fix 1).
5. **Price fallback:** nearest year (this app) or the canvas year-vs-price comparison, once prices flow?
6. **Individual volumes:** they are regenerated — and typed values lost — on every start / duration / Reset-to-COD change, as the canvas. Keep?
7. ~~**Layout**~~ — **answered (V6): rebuild the card gallery, implemented.**

**Product-owner answers implemented (20 Oct 2026):**
- **V6 — the contracts are the canvas card gallery** (`gal_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_1`, Y:795-2953), replacing the table:
  - one white card per contract (`Sort(…, 'Created On')`), header `Label & " - " & Description` (semibold) with the fold chevrons `ico_…_CardHeader_Up_1` (unfolded) / `ico_…_CardHeader_Up_2` (folded; their canvas AccessibleLabels on `aria-label`). The chevron flips `IsFolded` and selects the card; every card starts unfolded and a saved card is unfolded again (`toggleContractFold`, `unfoldContract`). The header button's `OnSelect` is commented out in the canvas, so clicking the header does nothing;
  - unless folded: the card's own Edit / Delete bar (`pcf_ProjectRevenues_Content_ContractCommandBar_3`, keys `editRevenueContract` / `deleteRevenueContract`) — its `OnSelect` selects that card, then edits it or asks to delete; disabled while locked / Draft (the gallery and bar `DisplayMode`). The page-level Edit / Delete bar is gone (the canvas has none);
  - the field tiles in canvas order, each with its `Visible`, caption, format and `FontColor` / `FontItalic` pair exactly as the canvas (`contractCardFields`): Currency (always blue), Contract Start / End Date (`dd.mm.yyyy`, blue + italic when standard), Contract Duration (two values, "n year(s)" / "n month(s)", blue + italic when both duration flags are standard), Bidding Price, Site Quality (p50), Correction Factor (p50) (German FiT, not PV), the p90 tiles (German wind FiT), Inflation Profile (always shown; "[%]" caption unless the country profile; blue when the custom profile is standard), Inflation Start Year (Germany with inflation), Tariff / Price (`#,##0.00`, blue — the canvas sets no italic there) and p90, Area (Italy with the country profile; blue on the TARIFF P90 flag, a canvas copy-paste kept), Hedged Volume Type (blue on the hedged-volume flag; its value carries the canvas AccessibleLabel `txt_…_HedgedVolume_1`, as the canvas) and Hedged Volume (% or fixed only; blue + italic for a standard %). Per CONVENTIONS rule 20 the screen's local `standard` (themePrimary + italic) and `blue` (themePrimary) styles are used; the coordinator will move them to the shared style. The card Tariff caption keeps its canvas double space ("Tariff / Price  [EUR/MWh]", `cardTariffPriceCaption`);
  - ids: every card element is `${canvasName}-${contract.id}`; the gallery keeps `gal_…_GridContracts_1`; the per-card commands are `pcf_ProjectRevenues_Content_ContractCommandBar_3-<id>-editRevenueContract` / `…-deleteRevenueContract` (they were `command-…`, not a canvas name). Additive shared change: `CommandBar` gained an optional `testIdPrefix` (default `"command"`, so every other screen is unchanged).
  - Tests: `rules.test.ts` UT-REV-137–140 (new); `Screen.test.tsx` 901 (card values), 904–906 (per-card commands), 911 (fold), 912 (locked cards), all passing.
- V1–V5 confirmed or parked with no code change.
- **UI layout pass (20 Oct 2026).** Layout only, from the canvas containers: the page has the canvas padding (15 / 15 / 20) and gap 3 on white; the lock message comes first and has the canvas box (PaddingLeft 20, gap 10, 20-px lock); the "Revenue" heading is Large (16 px) Semibold, not 20 px; the tab strip is 60 px, half wide; the add buttons are the canvas Transparent buttons with a 2-px themePrimary border (140 / 190 wide). Contract cards: no gap between cards, `Parent.Width - 10`, a 50-px #fdffff header with a 1-px themePrimary rule, Medium (14.67 px) Semibold title, 45 × 30 chevrons, and the field tiles in a wrapping row (gap 20, `(Parent.Width - 60) / 4`, 70 high, 32-px captions). Balancing: the Cluster-4 gate is the dark 50-px RGBA(0,0,0,0.75) bar, the empty-state tag the 40-px RGBA(204,226,241,0.5) strip, and the grid is 1100 wide (scrolls) with the header `FillPortions` as column widths, 30-px header (13.33 px, #595959) and 45-px rows (14.67 px, #2c2c2c). The contract panel uses a 300-px left section beside the right one, labels Lighter. Not matched: the contract panel is 750 wide (nearest `FormPanel` preset to `Min(760, …)`), and the balancing panel stays 450 (`narrow`) against the canvas 360 — no shared preset fits. No behaviour, caption, `aria-label` or `data-testid` changed; the lock message now renders before the heading, as in the canvas.
- **PO screenshot parity + validation audit (20 Oct 2026).** The product owner asked for the live canvas layout ("the cleanness I am looking for") and for every Power Fx validation of the contract panel to be checked again. The full table is in `gap-analysis/REVENUES-CONTRACT-VALIDATION-AUDIT.md`: 93 rows, 59 MATCH, 29 FIXED, 5 DIVERGENCE (documented), 0 MISSING.
  - **Fixed behaviour** (in `rules.ts`, tests UT-REV-141…155 and UT-REV-916):
    - New contract, start date: with no standard (always, while Fabric is unconnected, X2) it is the project COD. Before, it was today.
    - New contract, durations: blank. Before, 0 / 0.
    - The engine end date has no one-day guard.
    - The Custom Inflation Profile shows `Text(…, "0.00")`, so "0.00" without a standard.
    - Picking the years fills blank months with 0. Either picker makes both durations non-standard.
    - A new start date with blank years or months gives a blank end date.
    - Reset to COD keeps the contract standard and derives the end date's standardness (`resetStartToCod`).
    - Edit shows the canvas value formats:
      - CF blank shows "1.000";
      - German FiT tariff = Bidding × CF;
      - Site Quality `#` / `#0.0#`;
      - Hedged % `0` / `#0.0#`;
      - inflation `0.00`;
      - a stored start year 0 shows "0".
    - The country toggle shows "0.00" values. Switching it off on an edited contract brings the stored profile back.
    - The Inflation Start Year re-looks the country value up on every change.
    - Bidding Price, Custom Inflation Profile and Hedged % change their standardness only once the value is valid (`editFieldIfValid`).
    - These only mark the form dirty and do not make the contract non-standard (`touchField`): Site Quality p50 / p90, Fixed Volume, the Individual Volumes, the Consider Negative Prices toggle and its re-sync icon.
    - The negative-price toggle is editable on a new contract until a Type is chosen.
    - **Corrects S15:** the Country Inflation Profile toggle is seen only while the Inflation Profile toggle is on. Its container is 36 px high when the inflation toggle is off, and the country toggle sits at Y 40.
    - The 100 % hedge check reads the % with the locale-aware `Value()`.
  - **New DIVERGENCE (evaluation order).** Reset to COD computes the end date from the reset date. The canvas reads the picker's `SelectedDate` before its `Reset`, i.e. a date the user may have typed.
  - **Layout** (PO screenshot):
    - Page:
      - the "Revenue" title is ~35 px in;
      - the selected tab is Semibold with a themePrimary underline;
      - the add buttons have a 1-px themePrimary outline, radius 2 (the YAML says 2 px).
    - Cards:
      - Semibold 16-px title, a dark 1-px rule (the YAML uses the theme blue);
      - Edit · Delete in themePrimary;
      - the fields in a 4-column grid with 22-px gutters (2 columns on a tablet, 1 on a phone);
      - Regular 16-px captions;
      - values in filled grey 40-px boxes, left-aligned, with the standard blue + italic kept.
    - Contract panel:
      - 860 wide, via the new additive `FormPanel` preset `twoColumn` (the YAML has `Min(760, …)`);
      - two sections that each scroll on their own (`con_…_LeftSection_…` / `con_…_RightSection_…`);
      - one "* Contract Duration" caption over the two pickers;
      - red `*` before the toggle captions;
      - each Individual Volume row: the 180-px period box beside "* Individual Volume [MWh]" and its input (the caption is repeated per row, as the gallery template does).
    - Unchanged: every caption, `aria-label` and `data-testid`. The individual-volume caption keeps `lbl_ProjectRevenue_RightPanel_IndividualVolume_Header`.
  - **Open questions:**
    - the copy-pasted `AccessibleLabel` of `txt_…_FixedVolume` (`…_HedgedVolume_1`) is kept as the existing `aria-label`;
    - the Reset-to-COD order;
    - the screenshot-led values: 860, 1 px, the dark rule.

## D34 · PM Finance (Project Finance Screen) redeveloped and connected (20 Oct 2026)

**Scope:** rules, UI, a live Dataverse connection (reads and writes), and docs. This is the last PM screen; all 16 Admin/PM screens are now done.
- Code: `src/features/pm/finance/` and the new `src/data/finance.ts`. Additive shared changes: `data/keys.ts` (`qk.financeAll`, `qk.finance`, `qk.financeReference`); `data/revenues.ts` exports its project mapper (`toRevenueProject`, `PROJECT_SELECT`, `day`) so Finance reads the project without a copy (`loadRevenueProject` behaves as before). No shared component was changed.
- `data/dataverseNames.ts`: `CHOICE_FINANCE.yesNo` and `CHOICE_FINANCE.isFolded` are now `true` / `false` (see "Boolean fix"). They had no user outside Finance.
- Gap report: `gap-analysis/pm-finance.md` (126 requirements: 50 covered, 33 partial, 12 missing, 31 wrong before this change). Canvas: `Project Finance Screen.pa.yaml` (solution 1.21.709), `App.pa.yaml` (`colFinancingCategories`, `colYearsForDuration`, `colMonthsForDuration`, `colFrequencyInMonths`), `References/DataSources.json`. The hidden-controls tool reports 8 live hidden items: the five `btn_…_Form_Button_Reset*` buttons only `Reset()` a panel's controls (each panel draft is rebuilt from the stored row when it opens), `lbl_ColumnsToShowValue` is the column count (the CSS grid), and the two hidden DSRA reset icons have no `OnSelect` that runs.

**Tables registered** with `pac code add-data-source`, one at a time. The `"primaryKey"` count went from 77 to 81: exactly one was added each time, none dropped (key lists diffed after every call). pac changed only `.power/`, the new generated files and `power.config.json`. `check-power-sources` reports 81 registered and 0 problems.
- `vsb_financingcategory` (`vsb_financingcategories`), `vsb_financinginput` (`vsb_financinginputs`), `vsb_financinginputsrepaymentamount` (`vsb_financinginputsrepaymentamounts`), `vsb_financinginputstepupmargins` (`vsb_financinginputstepupmarginses`).
- Already registered and reused: `vsb_project`, `vsb_projectstate`, `vsb_capexprojectcontract`, `vsb_capexcost`, `vsb_generatortypeinproject`, `vsb_generatorinproject` (through `listGeneratorTypes` / `listProjectTurbines`, `data/generators.ts`).
- Column names come from the generated models (`dataverse-attributes.json` has none of the four tables). Every `INPUT_COL` / `REPAYMENT_COL` / `STEPUP_COL` name exists. Binds: `vsb_Project`, `vsb_FinancingCategory`, `vsb_FinancingInput`, `owningbusinessunit`. The four date columns are Date Only (`Behavior 3`) and are written as `yyyy-mm-dd`.

**Not connected (product decision D2):** `Assumptions Debt SQL`, `Assumptions Banks SQL` and `AssumptionsKfWTrancheSQL` are Fabric SQL (`shared_sql`, `[dbo].[AssumptionsDebt]` / `[AssumptionsBanks]` / `[AssumptionsKfWTranche]` on `Lakehouse_Gold`, `References/DataSources.json`), not Dataverse. Their hooks return no rows, and a NEW notice (`FINANCE_SCREEN_TEXT.assumptionsNotConnected`) shows on the page and in the tranche panel. Consequences, each documented at its rule:
- the senior-debt, DSRA/DSRF and decommissioning standards are empty (every builder stays tested);
- **seeds:** only the Equity (10 / 90) and VAT-Financing (base rate by country, 1.5, Calculated) seeds are created; the Senior Debt, DSRA/DSRF and Decommissioning seeds are built from the SQL standard and are withheld (`seedsAllowed`, DIVERGENCE) rather than storing zeros flagged "standard";
- the bank and KfW pickers offer only the stored value (an existing tranche keeps its bank; a new non-standard tranche cannot pick one); the bank name shows only for the "Other" sentinel;
- the SQL-based reset icons (Financial Close, decommissioning value / guarantee / duration) are disabled; the constant and project-date resets work; the DSRA Type change does not re-standardise.

**Live reads** (`data/finance.ts`): the project with `'Financing Options'`; the six categories by `Order`; the project's financing inputs (`createdon asc`, the tranche sort), repayment amounts and step-up margins; the total DEVEX/CAPEX (the project's CAPEX contracts, then their costs by `_vsb_contract_value`, chunked — the canvas loaded the whole contracts table); the active turbine count through the project's generator types and `vsb_moduletypeinprojectid` (`vsb_generatorinproject` has no project lookup — answers gap D8); at Save time, the tranche duplicate check by `vsb_uniquekeystring` over all projects, as the canvas `LookUp`.

**Live writes** (each a `WritePlan` from `rules.ts`, run by `usePlanWrite`; every status change writes `statecode` with its `statuscode`):
1. **On visit:** `'Financing Options' = Debt Financing` only while the column is blank (SOURCE DEFECT 2, carried over, twin `unconditionalDebtFinancingCanvasParity`); then each missing seed as its own job with its canvas `Notify` text ("Error while creating <X> financing input: …"). Run once per visit.
2. **Financing Options:** the project, then the VAT input (unless deactivated by button), every tranche (from `'Track Status Active?'`), then the DSRA/DSRF input (from `'DSRA/DSRF Original Status Active?'`) — the canvas order; the categories fold, as the canvas VAT branch does. Text "Please wait, Saving...".
3. **Activate / Deactivate:** VAT / Decommissioning — status and `'Is Deactivated By Button'` = Yes, or Blank on activate; tranche — status, `'Track Status Active?'` = the new status and `'Is Deactivated By Button'` = Yes on deactivate (error "<msg> : Error Occured while Tranche Status change"); DSRA/DSRF — status and its memory column only. The canvas spinner texts.
4. **Tranche Delete:** its step-up margins, its repayment amounts, then the tranche, through `executePlan` (rule 14).
5. **Saves:** Equity (Name, Category, mode, value, Shareholder Loan, Project, flags JSON for Percentage / Blank for Fixed Value, no owner); VAT (Name, Category, base rate, margin, mode, amount, Project, flags JSON); Decommissioning (type, value, guarantee, three dates, MMYY, flags JSON); DSRA/DSRF (Name, Category, type, base rate, margin, the DSRF-only fields Blank for DSRA, percentage, end date, MMYY, Project, flags JSON, owner); tranche (about 45 columns incl. the crossed swap columns, `IsFolded = true`, `Coalesce('Track Status Active?', Yes)`, the FC JSON only while the FC is standard, `UniqueKeyString`, owner; then the repayment diff — Individual: delete the years that left, upsert each `{Year} - Value`; otherwise delete all — and the step-ups `{DurationYY} - Value`, each child with Project, Category, the tranche (`@created#0` for a new one) and the owner). The canvas spinner and error texts.

**Server automation** (verified against `04-flow-inventory.md`): no flow and no plugin step is registered on the four finance tables. The only `vsb_projects` column written is `vsb_financingoptions`, which no flow or plugin filters on (the COD-shift repayment rebalancing, the financial-close shift and the decommissioning date sync filter on project DATES and run when other screens move them). The canvas calls no flow (no `.Run(`); there is no approval, project-create or Apply control here.

**Boolean fix (found while connecting).** The generated model types `vsb_isfolded`, `vsb_kfwtranche`, `vsb_trackstatusactive`, `vsb_isdeactivatedbybutton`, `vsb_stepupbankmargin` and `vsb_swapafterfixedperiod` as `boolean`, but `CHOICE_FINANCE.yesNo` / `isFolded` were `1` / `0`: every comparison would have read "No" and every write sent a number. Both are now `true` / `false`, pinned by UT-FIN-200; UT-FIN-201 pins every Finance option set (and `statecode` / `statuscode`, `Financing Options`) to the generated enums.

**Corrected (would have failed or shown wrong data):**
- **Memory columns** (gap W5/W6, high risk): `'Track Status Active?'` and `'DSRA/DSRF Original Status Active?'` were written as the INVERSE of the new status, so switching back to Debt Financing restored the wrong statuses; the DSRA toggle also wrote `'Is Deactivated By Button'`. Now as the canvas (UT-FIN-035, the round-trip test). The category toggle is its own rule (`toggleCategoryStatus`, gap W4).
- **Senior-debt Save gate** (gap S16): the swap fields were checked the wrong way round, so Save stayed disabled for every tranche without Swap After. The DSCR errors now count whatever the gearing; an Individual profile with no rows passes, as the canvas (UT-FIN-092, 095, 095b).
- **Texts (rule 7):** every validation message is the canvas one (the generic "Numeric value expected" / "Please select a value between …" are gone); the DSCR text; the six decommissioning date checks (S21) and the POFDS check (S29) are added; Hedging and Cost of Guarantee error on blank, as the canvas.
- **Save gates:** Decommissioning (dirty, guarantee, duration, the date errors), DSRA/DSRF (margin, base rate, the DSRF fields, POFDS) and VAT (no dirty term) follow their `DisplayMode` term for term.
- **Standard flags** are kept per panel (each edit sets its flag false, each reset true), read from the row's JSON when the panel opens and written on Save (gap B7).
- **Form behaviour:** cards start folded and folding a category folds its tranches; per-tranche fold icons; Add Tranche opens dirty; the Tranche Status change re-applies or resets the form; the whole Status radio is disabled for a stored Credit Agreement (canvas; the earlier "GUIDE q26" per-option disabling had no recorded decision); the base-rate lists offer all six options in Poland (canvas, same note); the VAT base rate opens as Wibor 3M in Poland / Euribor 3M while standard; KfW uncheck clears the value; Gearing resets the fixed-amount option; the step-up toggle and the FIR change seed row 1 only with a valid FIR; the FC reset is disabled while the FC is standard; the Duration-of-Saving reset icon is added.
- **Card formats** (U2–U6): `"##0.0"` / `"#0.0#"` / `"0.0"`, `LongDate` for Financial Close, a blank Commitment Fee Free Period when a part is blank, the unpadded DSRA period ("2 Years 0 Month "), "0 Year" for a zero DSRA duration.
- **Gallery gates** (D15 b resolved): the cards render only for a set, non-Draft cluster state, from the categories in Dataverse (no invented shells), and are disabled while the page is locked. The fifth lock bullet is "• Change the project status from Draft" (D15 f, already shared with Revenues).
- **Rule 16:** every control's `aria-label` is its canvas `AccessibleLabel` (its control name) — radios, dropdowns, dates, text and read-only fields, the five panel closes (`ico_EditEquity_RightPanel_BodyHeaderCancel`, `…_1`, `…_2`, `Icon5`, `ico_EditDSRA_DRSF_RightPanel_BodyHeaderCancel`), Save / Cancel (the VAT Cancel carries the canvas's copy-paste `btn_GeneralData_RightPanel_VATFinancing_Form_Button_Reset`), the command bars (`pcf_FinancingInputs_Content_SeniroDebtTranche_CommandBar`, `pcf_ProjectRevenues_Content_ContractCommandBar_2`), the status chips and the lock labels. The cards carry `con_ProjectFinance_DisplayProject_Body_Form_FinancingInputs_Card-<category id>`. The canvas-identity gate verifies 88 ids (0 findings).
- Required asterisks follow the canvas: the VAT base rate, margin, facility radio and amount show none (their `Visible` is a copy-paste that is never true, U17); the DSRA base rate shows one.
- The invented command tooltips ("The last active tranche cannot be deactivated." and three more) are removed; the canvas shows none.
- The load-error state (rule 19).

**SOURCE DEFECTs fixed** (each marked in `rules.ts`, with a `…CanvasParity` twin and a test):
1. (Carried over) `OnVisible` overwrites All Equity with Debt Financing on every visit (`unconditionalDebtFinancingCanvasParity`).
2. (Carried over) `MarginDSRA` reads "margin dsrf" (`marginDsraCanvasParity`); moot while Fabric is unconnected.
3. **Drawdown "Pro Rate"** never matches "Pro Rata", so a stored Pro Rata reopened as Equity First and was overwritten on Save (`drawdownDefaultCanvasParity`, UT-FIN-211).
4. **DSRA duration months** default `Coalesce(Value(0), …)` is always 0, so every edit reset the stored months (`dsraDurationMonthsCanvasParity`, UT-FIN-212).
5. **Remove Last Period** left the removed step-up row stored, so it came back on the next edit (`stepUpWritesCanvasParity`, UT-FIN-210).
6. **Shareholder Loan** (percentage) is computed only for an INTEGER free equity, so 12.5 % saved a blank loan (`shareholderLoanCanvasParity`, UT-FIN-209).
7. **Date of Expiry = Date of Issue** blocks Save with an empty message (`Visible` tests `<=`, `Text` `<`); the message shows (`dateOfExpiryMessageCanvasParity`, UT-FIN-206).
Reproduced and documented: the VAT panel title "Add Tranche"; the "Trache" dialog title; the DSRA base rate re-standardises to the DSRF base rate whatever the type; the category toggle never changes `CostsofDecommissioning`'s flag; the per-tranche duplicate test ids (D16 c).

**DIVERGENCEs:**
- `CanEditSelectedProject`, `DataSourceInfo` and `RecordInfo` have no SDK equivalent: they pass and Dataverse decides (D1).
- The senior-debt Save checks the stored bank id, not the bank name (the names are Fabric SQL).
- The Fabric-dependent seeds are withheld; the DSRA Type change keeps the values (see "Not connected").
- Edit Tranche uses the loaded row; the canvas re-reads it with `LookUp` first (the query is refreshed after every write).
- Fold state is local to the visit (as the canvas collections); the tranche Save still writes `IsFolded = true`.
- Standard values are not shown in italics / theme colour (the canvas `FontItalic` / `FontColor`); the flags themselves are tracked and written. **→ Fixed 20 Oct 2026 (D35, rule 20): cards via `financeCardStandard` / `trancheFinancialCloseIsStandard`, panels via each form's flags.**
- Numbers are entered and shown in en-US notation, as the other connected PM screens.
- The unsaved-data leave guard is the shared shell gap (D25); not built. **→ D35: the canvas Finance screen has no leave dialog (its logo / rail set Planning's `locLeavePlanningConfirmationDialog`, which no control here shows), so no guard is added.**
- NEW texts: `FINANCE_SCREEN_TEXT` (the load-error state, the Fabric notice, the plan refusals).

**Tests:**
- `rules.test.ts`: 170 tests. Rewritten because they pinned the old behaviour: UT-FIN-074 (the zero singular), 035 and the DSRA toggle (the memory columns), 081 / 082 and the VAT dirty case (the VAT gate), 092 / 093 / 095 (the swap and DSCR terms; the fixture's swap fields), the two "GUIDE q26" status cases and the Poland base rates. New: UT-FIN-095b and 200–233 (enum pins, verbatim texts, the date checks, the panel gates, each SOURCE DEFECT and its twin, every write plan, the panel opens, folding, card formats).
- `Screen.test.tsx`: 901–910 (they replace the not-connected 901–9xx): folded cards and canvas ids, the Draft gate, the financing-option job, the visit seeds, the Equity save, the tranche toggle, the decommissioning date check and resets, the DSRA toggle, the load-error state.
- `ScreenRoutes.test.tsx`: Finance is checked as connected by its root test id (`Project Finance Screen`), with `@/data/finance` mocked.

**Open questions for the product owner:**
1. **Fabric SQL:** until `Assumptions Debt SQL` / `Assumptions Banks SQL` / `AssumptionsKfWTrancheSQL` are reachable, a new project gets no Senior Debt, DSRA/DSRF or Decommissioning input, and a new Term Sheet / Credit Agreement tranche cannot pick a bank. Acceptable for now, or should those seeds be created with blank (non-standard) values?
2. **Debt Financing on visit:** keep writing it only while the column is blank (this app), or overwrite All Equity on every visit as the canvas?
3. **Tranche Status and base rates:** confirm the canvas behaviour now shipped — the whole Status radio disabled for a stored Credit Agreement, and all six base rates in Poland — over the earlier "GUIDE q26" variant.
4. **Empty Individual schedule:** the canvas (and now this app) lets a tranche with the Individual profile and no repayment rows be saved. Keep, or block?
5. **Leave guard:** a router blocker needs a data router in the shell (shared with D25 / D26 / D31 / D32). Approve that shell change? **→ D35: not applicable — the canvas Finance screen has no leave dialog.**
- **UI layout pass (20 Oct 2026).** Layout only, from the canvas containers: page padding 15 / 15 on white; the lock message has the canvas box; Financing Options is the 110-px block (Semibold caption at X 20). The category gallery is inset 20 px with no card borders or gaps; each card header is 42 px with the name at X 10, the status pill (24 px, radius 34, Green / SuccessLight when Active, Grayscale10 / Grayscale40 otherwise, 12-px text) and the fold chevron on the RIGHT (they were left), above a 1-px RGBA(0,120,212) rule. Field rows are wrapping rows of 320 × 70 tiles (300 on Equity / VAT) with Semibold labels and plain View-mode values (no input box), replacing the stretched auto-fill grid; DSRA / DSRF labels are Regular Grayscale10 with PaddingLeft 10, the Type tile is full width, and its buttons are Edit (80) then Activate / Deactivate (110), transparent with a 2-px themePrimary border. Senior-debt tranches sit in a `Parent.Width - 30` list with a 42-px shadowed header (Semibold name, pill, chevron right, 2-px Grayscale20 rule); the General / Conditions tags are a Semibold caption over a 5-px Grayscale20 bar. The tranche panel is the canvas columns (350 / 340 for an Individual schedule / 350) instead of one long column. Not matched: the tranche panel is 750 / 960 wide (nearest presets to 700 / 1040), and the read-only tile values keep the shared `ReadOnlyField` input underneath (only its box is hidden). No behaviour, caption, `aria-label` or `data-testid` changed; the header controls are only reordered.
- **PO screenshot parity + validation audit (21 Oct 2026).** The product owner compared the live canvas Finance screen (screenshots) and asked for every panel validation to be re-checked. Full table: `gap-analysis/FINANCE-VALIDATION-AUDIT.md` (134 rows: 90 MATCH, 27 FIXED, 17 DIVERGENCE (documented), 0 MISSING).
  - **Layout** (no caption, `aria-label` or `data-testid` changed): the page fills the content area and the category list scrolls on its own (`Height: Parent.Height - 130`), so Financing Options stays at the top; card headers 46 px (canvas 42), title Regular 15 px, status pill 28 × ≥90 (canvas 24 × 80), as in the screenshots; the View-mode tiles show their filled grey box again (D34's "no box" look undone), Equity / VAT 320-wide with ~290 boxes, Decommissioning / tranches / DSRA in 320-px columns, at most four; DSRA/DSRF values plain Semibold text with Regular Grayscale10 captions; Shareholder Loan and End Date of Saving have the `DisplayMode.Disabled` look (white, grey border, grey text); the `cmb_…` ComboBoxes keep their underline; a disabled panel Save is a transparent text button with a black ✓ (PowerCAT `ActionButton`, `IconColor` black when disabled) through the new additive `PanelButtons subtleWhenDisabled` prop. The command bars keep D35 §7.
  - **Fixed** (rules in `rules.ts`, UT-FIN-234…241 and UT-FIN-913): the Fixed Value Shareholder Loan is saved as shown (whole units, `shareholderLoanToSave`); the Fixed Amount option is blank on Add and after a Gearing change, and its value field shows only once an option is picked; a blank tranche month reads 0 once its years are set (`trancheMonthDefault`); a status change to / from Standard Assumption blanks the selection as the canvas does (the stored status no longer triggers a second reset, Track Status is saved Yes, the title reads "Add Tranche", `trancheFormTitle`); the repayment schedule is rebuilt only for Individual with all four dropdowns set (`shouldRegenerateRepayments`); Add Step-Up Period is disabled with no row, and Add / Remove need the FIR months too (`stepUpPeriodChangeAllowed`); a new step-up row shows its margin error at once and a stored margin reopens as `"##0.00"`; Drawdown / Energy Yield / Spot Curve / Gearing / Repayment Profile are View (not greyed) for a Standard Assumption tranche; the invented DSCR placeholder is removed; the canvas `MaxLength` (Free Equity 9, VAT margin 6, decommissioning value 15, others 20, `PANEL_MAX_LENGTH`) and placeholders ("Find Bank", "Year", "Month") are added.
  - **Recorded divergences (new, SOURCE DEFECTs not reproduced):** the canvas never resets `locFormIsDirty`, so after the first change of a visit every Edit Tranche opens with Save enabled — Edit opens clean here; `cmb_SeniorDebt_Data_Bank`, `txt_SeniorDebtData_BankName` and the Operational-phase margin have no `OnChange`, so on a fresh visit editing only them leaves the canvas Save disabled — every change marks the form dirty here; after a Gearing change the canvas still saves the hidden old fixed value (rounded) — Blank here; Add does not reset the canvas FC context variables (stale from the last Edit) — Add shows the standard FC here.
  - **Open questions:** see the audit's list (the command-bar edge vs the title, the screenshot sizes, Add Tranche opening with 0 rather than blank values while Fabric is unconnected, the two dirty-flag defects, the Gearing write).
  - **Verified:** before / after screenshots at 1919 × 1018 and 1366 × 768 of every expanded category and every panel (`preview-layoutC/shots/po-before-*`, `po-after-*` in the session scratchpad). Not yet clicked through against VSBCloud_Dev.

## D35 · Cross-screen: standard-assumption styling + unsaved-changes guard (20 Oct 2026)

**Scope:** four cross-screen tasks in one sweep: product-owner rule 20 (standard-assumption styling), X1 (the leave guard), M4 on Generators, and the Planning identity gate. No table was registered, and `.power/` and `src/generated/` were not touched.

### 1. Standard-assumption styling (CONVENTIONS rule 20)

**The shared style.** There is one definition, `src/components/standardValue.ts` (`useStandardValueClass`, `useStandardValueStyles`, `StandardProp` / `StandardVariant`), exported from `@/components`.
- The variants are `"standard"` (themePrimary + italic), `"blue"` and `"italic"`. The rule reaches a nested `input` / `textarea` / `button` / `td`.
- The field primitives gained a `standard` prop: `CostField` (on the input, never on the caption), `CostSelect`, `TextField`, `NumericField`, `TextAreaField`, `ReadOnlyField` and `TaggedDateField`.
- Tests: UT-STDVAL-001…003.

**Audit.** 168 canvas controls carry the pair, on 10 screens; no Admin screen has one. The full table is in `STANDARD-ASSUMPTION-STYLING-AUDIT.md`.
- 80 were already right and now use the shared style: General Data, Milestones, Production, the Revenues cards, CAPEX's cluster checkboxes, Land Lease and OPEX. The local copies (`standard`, `derived`, `standardText`, `rowStandard`, `standardDate`, `blue`) are removed.
- 56 are fixed:
  - Finance, all 40 (D34 "not shown"). The cards use `financeCardStandard` and `trancheFinancialCloseIsStandard` (UT-FIN-911/912). The panels use each form's own flags.
  - The Revenues panel, 11 (`revenuePanelStandard`, UT-REV-913…915).
  - Five Revenues card values: Tariff, Tariff p90, Area, Inflation Profile and Hedged Volume Type. D33 had them blue-only ("the canvas sets no italic"), but their canvas `txt_…` TextInputs DO set `FontItalic` on the same flag. UT-REV-139 is updated.
  - Currency, which is unconditionally blue AND italic in the canvas (`FontItalic: =true`).
- 1 deliberate variant: the Revenues panel Contract End Date is italic only, because its colour is not conditional in the canvas.
- 32 are not applied:
  - 20 N/A or out of scope: Generators' 4 (the formulas are commented out), Milestones' 2 icon-only buttons, and the 14 CAPEX grid labels in the vendored PCF renderer.
  - 12 are open; see the questions below.
- The Cost screens' behaviour is unchanged, apart from the move to the shared style. Two visible effects of that move:
  - OPEX standard rows now show blue as well as italic. The `td` colour had hidden the row colour; the canvas colours every cell.
  - The General Data cluster dates and the Land Lease start date now show blue in the input text. The old class on the Fluent root never reached it.

### 2. The unsaved-changes leave guard (PO X1)

**Router.** `app/Providers.tsx` now uses `createHashRouter` + `RouterProvider` in place of `<HashRouter>`.
- Hash routing is kept, so the URLs are unchanged (`#/costs/capex?projectId=…`). `appTabUrl` / `resolvePlayAppUrl` are unaffected.
- The route table stays in `app/routes.tsx` as `<Routes>` (lazy screens, `Suspense`, the gates). It is mounted under one splat route. This is React Router's documented first migration step, so routing and relative links behave as before.
- The element order is unchanged: ErrorBoundary > SessionProvider > App. The CommandSlot portal lives in `AppShell` and is unaffected.
- The route's `errorElement` re-throws into the same `ErrorBoundary`.
- Risks:
  - (a) React Router's descendant-routes mode is a supported pattern, but it does not enable loaders or actions. None is used.
  - (b) A screen can no longer be rendered under a plain `<MemoryRouter>` once it contains the guard, because `useBlocker` throws. Tests use `src/test/DataMemoryRouter.tsx` (a memory data router), and `ScreenRoutes.test.tsx` and the five guarded screens' tests are switched to it.
  - (c) The running dev server hot-reloads the provider change. A full reload may be needed once.

**Component.** `components/UnsavedChangesGuard.tsx` (`UnsavedChangesGuard`, `isLeaving`, `LeaveDialogText`).
- It takes `useBlocker` plus the shared `ConfirmDialog`, a `when` condition, and the screen's verbatim canvas texts.
- It blocks any change of path or query while dirty. Confirm ("Yes") proceeds and Cancel or ✕ stays. If the screen becomes clean while the dialog is open, the block is reset.
- **DIVERGENCE (new behaviour):** while the screen is dirty, a tab close or reload raises the browser's own `beforeunload` prompt.
- Tests: UT-LEAVE-001…007 (blocks when dirty, proceeds on Confirm, stays on Cancel, nothing when clean, clean after save, `beforeunload`, `isLeaving`).

**Wired on the five canvas screens whose leave dialog has a live trigger** (header `OnLogoClick` and left navigation `OnSelect`). Each uses the condition from its `rules.ts` and the texts `LEAVE_DIALOG` (Title "Unsaved data", Description "You have unsaved data. Do you really want to leave current form without saving?", "Yes", "Cancel"):
- General Data: `shouldConfirmLeave(isDirty)`.
- Milestones: `shouldConfirmLeave(dirtyKeys)`.
- Planning: the new `shouldConfirmLeave(form, baseline)` (UT-PLAN-910).
- Grid Operator: `shouldPromptOnLeave(form, baseline)` (UT-GRIDOP-909).
- Production: **SOURCE DEFECT reproduced.** `colProductionFormValidation` never gets a Dirty row, so the canvas never asks. The live rule is `shouldConfirmLeave`, which is always false, and the twin is `shouldConfirmLeaveWhilePanelOpen` (UT-PROD-911).

**Not wired, because the canvas has no live leave dialog:**
- Team and Checklist: the dialog exists, but `locLeaveGeneralDataConfirmationDialog` is never set true there.
- Finance: there is no dialog. The logo and rail test Planning's `colPlanningFormValidation` and set `locLeavePlanningConfirmationDialog`, which nothing on the Finance screen shows. When Planning's collection is dirty, the canvas navigation is silently dropped. That defect is not reproduced (it depends on another screen's state).
- Revenues, Generators, Project Main, all six Admin screens and all five Cost screens: none has a leave dialog.

### 3. Generators foundation cost (M4)

See D27: one shared rule, `domain/foundationCost.ts`. The live behaviour now always adds the foundation cost, as the canvas does. The boolean reading is the twin. Tests: UT-GEN-914 and UT-FOUND-001/002.

### 4. Planning identity check

`scripts/check-canvas-identities.mjs` treats `TaggedDateField` like `CostField`: its `name` is the canvas identity on both `data-testid` and `aria-label` (`NAME_PRIMITIVES`, `DatePicker` type family, `INTERACTIVE_TAGS`). `scripts/check-control-labels.mjs` lists it as a primitive with `name` → label/testid. Planning verifies 33 of 33 again.

### 5. Shell parity (20 Oct 2026)

UI-only fix of the app shell on the PM (`/project/*`) and admin (`/admin/*`) routes, after the product owner compared screenshots with the live canvas app. Cost (`/costs/*`) and the Project Overview (`/projects`) are unchanged: the Cost app's own `cmp_Header` has no back arrow and its `cmp_Left_Navigation` has the header row on top; the overview has no `cmp_Header`.
- **Back arrow** (`cmp_Header` `Image3`, the canvas SVG verbatim, `data-testid="Image3"`, `aria-label="Back"` because the canvas sets no label or tooltip). `OnSelect: =cmp_Header.OnLogoClick()`, which every PM and admin screen sets to `Navigate('Project Main Screen')` (General Data asks first when dirty). It calls `navigate("/projects")`, so `UnsavedChangesGuard` still blocks it. Admin screens get the arrow too, because they instance the same `cmp_Header`; their titles stay in the screen body.
- **Project name** 24 px Semibold (`con_cmp_Header_HeaderText`, `Size: =20`, matched to the PO's screenshot). "New Project" with no `projectId` (`pmHeaderTitle`). The approval bar is `Container7`: 4 x 35 (`Parent.Height/2`) on PM headers.
- **Status line** (`con_cmp_Header_ProjectStatus`): the project's Cluster State name (`gblProjectHeaderData.Status`). The text is "Active" unless the name is "Abandoned" or contains "Inactive". The icon is Information, Blocked or Lock. The colour is `palette.Success` at alpha 0x60, or `akzent5` for Abandoned / Inactive. The line is hidden in QA and Prod. Rules are in `components/headerRules.ts` (UT-HEADER-005…009). `loadProject` now also selects `vsb_name` on the one `vsb_projectstate` row it already read (`ProjectContext.clusterStateName`).
- **Left rail** (PM app `cmp_Left_Navigation`): no hamburger row at the top. A "Collapse Menu" row at the bottom: the canvas panel SVGs (`Image2`), `lbl_Left_Navigation_Expand` 11 pt, and the tooltip "Decrease / Expand left naviagtion panel" (canvas spelling). It keeps `data-testid="icon_Left_Navigation_Expand"`. Collapsed, the rail is 32 px (`gblAppSizes.LeftNavigation.DecreasedWidth`) with icons only, and the caption does not change (the canvas has one caption). Icons: Cluster Check List is now a numbered list, and Revenue is now a banknote (`MoneyRegular`); the others were already mapped. Tests: UT-RAIL-001/002.
- **Error icon:** the existing red warning button already matches `pcf_HeaderContainerReportError_WarningIcon`, so it is unchanged.
- **Not matched:**
  - The canvas `ItemIconColor` (pale #8FBCE4 until the project has the data) is not applied.
  - The logo click (`img_cmp_Header_Button`, the same `OnLogoClick`) is not wired.
  - Fluent `Text` drops the plain `canvas-brand-title` / `canvas-project-title` classes, so those older stylesheet rules never applied. The PM title uses a plain span. The Cost header is untouched.

### 6. Modern controls sweep (20 Oct 2026)

UI-only pass after the product owner compared the Milestones screen with the canvas app. The PM canvas screens use modern controls (`ModernDatePicker@1.0.1`, `DatePicker@0.0.46`, `TextInput@0.0.54`, `DropDown@0.0.45`). Screens that built their own controls did not get the modern field skin (D25). No rule, hook or data change.
- **Shared date field** (`components/DateField.tsx`: `DateField` and the bare `DateInput`). It is built on Fluent `DatePicker` and has:
  - the filled grey box with the calendar icon at the right, Monday as the first day, and the `*` before the caption;
  - `readOnly` for `DisplayMode.View` and `disabled` for `DisplayMode.Disabled`;
  - `standard` for the blue + italic standard value (rule 20);
  - typing a date where the canvas sets `IsEditable: true`;
  - date-only values through `dateOnly` (rule 18).

  The box text follows each control's canvas `Format`, through `domain/canvasDate.ts` (UT-CDATE-001…006):
  - `"LongDate"`, e.g. "Tuesday, January 20, 2015": a `ModernDatePicker` with no `Format`;
  - `"LongAbbreviated"`, e.g. "Tue, Jan 19, 2016": a `DatePicker@0.0.46` with no `Format`, or with `LongAbbreviated`;
  - `"dd.mm.yyyy"`: that literal `Format`.

  `name` puts the canvas name on both `aria-label` and `data-testid`. `testId` + `ariaLabel` are used where the two differ. Component tests: UT-DATEFIELD-001…004.
- **Shared dropdown** (`components/ChoiceField.tsx`). General Data's own skinned `ChoiceField` was moved here (rule 17), with `standard` and `multiselect` added (UT-CHOICE-001).
- **Gates:** both scripts know the new primitives. `check-control-labels.mjs` lists them in `CONTROLS` / `PRIMITIVE_PROPS`. `check-canvas-identities.mjs` adds `DateField` / `DateInput` to `NAME_PRIMITIVES` and to the date-picker type families, adds `ChoiceField` to the dropdown families, and adds a new `ARIA_PROP_PRIMITIVES` list, so an `ariaLabel` prop is compared with the canvas `AccessibleLabel`. `TaggedDateField` now renders `DateInput`.
- **Milestones** (the reference screen):
  - All eleven dates use `DateField`. Project Start and Cluster 3 (`ModernDatePicker`) show the long date. The others (`DatePicker@0.0.46`) show LongAbbreviated.
  - Captions are Semibold with the `*` before them.
  - The CalendarAdd buttons are the canvas `Button@0.0.45` `Appearance: Secondary`, so an outlined 32 × 32 box (`Width: 32`, default height). Project Start / Cluster 1 keep the button's 32 px free, as the canvas width formula does.
  - Share of Farmdown: a filled input. The ⓘ (`Icon1_2`, 16 px) sits right after the caption. The reset icon (18 px, no box) sits right of the input.
  - Operational Lifetime years / months are `DisplayMode.View`: black text in the grey box, read-only, no longer disabled.
  - Footer: "Created By:" / "Modified By:" with the name, and the date under the name. The canvas "Created:" / "Modified:" captions are `Visible: false`, so they are no longer rendered.
  - `formatShortDateTime24` now gives `Text(…, ShortDateTime24)`, e.g. "4/7/2025 22:08" in en-US (no comma; English short dates keep the language's own padding). UT-MSTONE-077 extended.
  - Save, then Cancel, are transparent (subtle) text buttons with their icons, at the right. This follows the PowerCAT `IconType: ActionButton` and the product owner's screenshot.
- **Other PM screens:**
  - General Data: Acquisition Date and the eight cluster-change panel dates use the long date (`ModernDatePicker`). The local `ChoiceField` is now the shared one.
  - Checklist: Completion Date (LongAbbreviated, no `IsEditable`) and Approval Due Date use `DateField`.
  - Finance: `DateBox` is now `DateField`. The three Decommissioning dates are `dd.mm.yyyy`. Financial Close and End of debt service savings are LongAbbreviated. `SelectBox` has the skin. UT-FIN-908 now types "01.01.2025" and asserts that the box shows it.
  - Revenues: Contract Start Date (editable) and End Date (Disabled), and the balancing panel's Start / End Date (Disabled), use `DateField` in `dd.mm.yyyy`. `TextInputField` / `SelectField` have the skin, and a field with no `onChange` is View.
  - Planning: its own `ChoiceField` is now the shared one. The permit dates come through `TaggedDateField` → `DateInput`.
  - Team (Position), Grid Operator (both dropdowns), Production (seasonality and negative-price cells) and Generators (`SelectField` / `MultiSelectField`) have the skin.

  Every `data-testid` / `aria-label` is unchanged. Tests that typed into a native date input now type the date and leave the box.
- **Screenshots** (preview harnesses, before / after): `shots-sweep/` in the session scratchpad.
- **Not matched:**
  - The product owner asked for 40 × 40 CalendarAdd boxes. The canvas says 32 (`Width: 32`, default height), so the screen uses 32.
  - Canvas Save sets `FillColor: themePrimary` and `FontColor: white`. The screenshot shows a transparent ActionButton, and that look was followed. Confirm.
  - General Data's footer buttons still use the primary / outline look. They are the same PowerCAT ActionButtons, so they can follow if confirmed.
  - The `.canvas-field` native inputs (Generators `InputField`, Planning / Production `CostField`) already render the filled `#f4f4f4` box and were left as they are. On them View and Disabled both show black text.
  - The pickers follow the session language, as the canvas follows `Language()`.
  - Not yet clicked through against VSBCloud_Dev.

### 7. Command bar alignment (21 Oct 2026)

- **Command bar alignment (21 Oct 2026).** UI only, after the product owner compared the live canvas: every command bar's FIRST icon sits on the left edge of the content under it ("+ Add WTG Type" over "Total Capacity", "+ Add Production WTG" over "Gross Yield", the Revenue card's "Edit" over "Currency"). No behaviour, caption, `aria-label` or `data-testid` changed.
  - **Shared fix.** `components/commandRow.ts` (`useCommandRowStyles`, exported from `@/components`): a command has no horizontal padding and no 96 px minimum width, commands sit 16 px apart (label end to next icon box), and the first command is pulled 3 px left so the icon glyph (drawn ~3 px inside its 20 px box) lands on the edge. `CommandBar` uses it and its `Toolbar` has no horizontal padding. Before, Toolbar 8 px + Button 12 px put the icon 20-23 px in, and short labels were centred in 96 px, so gaps varied (28-42 px).
  - **Each screen pads the bar's WRAPPER to its content edge:** Generators main bar 20 px (Total Capacity) and expanded-card "Add Generator" 20 px (Supplier); Production 20 px (was 10; Gross Yield); Team 20 px (the members table edge); Planning permits 53 px (was 40; the Permit column text); Finance category and tranche bars 20 px (Free Equity / Base Rate / Term Sheet / Total Costs of Decommissioning); Revenues cards 0 (Currency; the local Toolbar/Button override was removed, its colour rule kept); Admin CAPEX Accounts card, Default Checklists and Admin Milestones cards 8 px (the table's first column caption, Fluent cell padding); Admin Cost OPEX "Add Contract Type" 8 px (`opexCommandRow`); Contracts main bar 10 px (`.canvas-contract-commandbar`, the cards' radio at X 10) and the payment-target bar on the card body's 20 px edge; OPEX and Land Lease card toolbars keep their 12 px (the table's select column); the CAPEX `.canvas-cost-toolbar` is 15 px on the left (the PCF host's 5 px + the grid's 10 px cell padding) and only its first button loses its left inset, so the spacing to the switches is unchanged.
  - **Header command slot** (Project Overview, Admin CAPEX Accounts): `AppHeader`'s slot pads 23 px, so the first icon stays exactly where it was; only the gaps between commands shrink to the shared 16 px.
  - **General Data "Add"** (`btn_general_data_shareholding_entity_add_new`, a ModernButton, not a command bar): the canvas `Align: =Align.Left` / `PaddingRight: =0` is now honoured (was centred in its 80 px), with 5 px left padding so the `+` sits over the "Description" column caption.
  - **Not aligned:** Add Costs from Table's toolbar (Add Row / Delete Row / Copy Table) is unchanged: the `react-spreadsheet` grid under it starts flush on the panel edge (row-indicator column), so matching it would put the icon on the edge. Confirm the wanted edge. Checklist, Milestones and Grid Operator have no in-body command bar. The vendored PCF grid renderer is out of scope.
  - **Verified:** PM screens and the Project Overview header measured in the preview harnesses (first icon glyph vs content left edge, ±1 px). Admin and Cost screens have no harness; their insets are computed from the styles above, not rendered.

**Open questions for the product owner:**
1. **Production leave guard:** the canvas never asks (its Dirty flag is never set). Keep that, or arm the guard while an Add/Edit yield panel is open (`shouldConfirmLeaveWhilePanelOpen`)?
2. **Finance leave behaviour:** the canvas has no dialog on Finance. Its logo and rail silently refuse to navigate while Planning's form is dirty (a copy-paste defect). This app navigates. Confirm.
3. **Team / Checklist:** both canvas screens carry an unreachable "Unsaved data" dialog. Their edits are panel-based, so leave them without a guard?
4. **`beforeunload` (DIVERGENCE):** keep the browser's tab-close prompt on the guarded screens? Inside the Power Apps player the prompt depends on the host frame.
5. **Cost screens, rule 20 gaps (not changed in this sweep):** CAPEX panel inputs (Description, Distribution by, Total Costs, Cost paid by, Apply VAT, Depreciation), Contracts margins (card and the two panel inputs), and the OPEX start-date picker. Style them?
6. **Revenues balancing panel:** `dte_…_ContractStartDate_2` / `txt_…_BiddingPrice_2` read the MAIN contract's standard state in the canvas. Port that, or wait for the Fabric SQL standards (X2)?
7. **Revenues card italics (corrected from D33):** confirm the canvas look. Tariff, Tariff p90, Area, Inflation Profile and Hedged Volume Type are blue + italic when standard, and Currency is always blue + italic.
8. Not yet clicked through against VSBCloud_Dev (`pac code run`). The router change especially needs a smoke test: deep links, Edit Costs tabs, the rail and the logo, and the browser back button.
9. **Add Costs from Table toolbar (21 Oct 2026):** its spreadsheet starts flush on the panel edge. Align the Add Row icon to that edge, to the header title (20 px), or keep it at 10 px?

## D36 · Application Settings port: the six admin screens replaced from RounakDev1 (22 Oct 2026)

**Decided (owner, 22 Oct 2026): replace, not graft.** Commit `864056b` replaced the six `/admin`
screens (D18, D19, D21–D24) with the versions developed on branch `RounakDev1`. Routes, left
navigation, shell and header are unchanged. Open points: `09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md`.
Rollback: `git revert 864056b`.

D14, D18, D19 and D21–D24 still describe the screens they built. Where they disagree with the
code, this entry and the code win; each of them now carries a pointer here.

### 1. No bulk Dataverse services

`CreateMultiple`, `UpdateMultiple` and `UpsertMultiple` are deliberately not used. Every bulk path
in the ported code is a per-row write (`src/data/adminRowWrites.ts`). Same reason as
KNOWN-RISKS: there is no changeset, so a bulk call gains speed but not atomicity, and a
per-row write reports which row failed. Revisit only with a Custom API (D6).

### 2. Component merge

`FormPanel`, the field components and `PanelButtons` gained optional props for the settings
screens. The defaults reproduce the previous behaviour and are pinned by `UT-FORMPANEL-*`,
`UT-PANELBTN-*` and `UT-SETFIELDS-*`. Kept separate on purpose (CONVENTIONS rule 17, "deliberate
variant"):
- `ReorderPanel` / `ReorderItems`: a different contract from the old `ReorderList`. `ReorderList`
  had no callers after the port and is no longer exported from `@/components` (22 Oct 2026).
- The gates `PeoplePickerField`: it owns the Entra search.
- `useNotify` / `AppToaster`: toasts, where the other screens use inline `WriteFeedback`.

### 3. Write-path exception (CONVENTIONS rule 17)

`executePlan` has an opt-in `guarded` update step: a PATCH to a row deleted meanwhile reports
"record deleted" instead of recreating it (an upsert). 14 single-request admin writes run as
`WritePlan`s through `src/data/runPlan.ts`, each with a wire-equivalence test (`writes.test.ts`
in the CAPEX accounts, default checklists, gates and cost folders). These multi-request flows stay
in the data layer as a documented exception to "write plans live in `data/writePlan.ts`":
- **CAPEX:** create, reorder, delete, deactivate account and subaccount (cascade and forecast clean-up).
- **Checklists:** create-then-set-status, soft delete with renumber, reorder.
- **Milestones:** save.
- **Contracts:** save (ownership re-check, partial-save retry), delete.
- **Costs:** OPEX period save, OPEX contract delete, period delete with last-period flag repair.

The checklist-approval repository methods (`createChecklistApproval`, `updateChecklistApproval`,
`deleteChecklistApproval` in `src/data/adminChecklistTables.ts`) were only called by their own
tests once the Gates writes moved onto WritePlans. They were removed on 22 Oct 2026
(UT-ADCHKTBL-003/012/013 now pin the task table; UT-ADCHKTBL-014 is retired, not renumbered).

### 4. Behaviours that differ from the canvas — product decision needed (keep, or revert)

Each is marked `DIVERGENCE:` at its code site. None has been reverted.

| Screen | Behaviour in the code app |
|---|---|
| Checklists, Gates, Contracts | The panel stays open on a failed save, with the error in it (the canvas closes it first) |
| Gates | Reset Gate asks for confirmation. **Check against D22** ("keep both Reset Gate and Save as the canvas has them") |
| Gates | Inactive and "To Delete" tasks are hidden |
| Gates | People search starts at 2 characters |
| Gates | Status toggles are optimistic |
| CAPEX | Paid costs are skipped on deactivate |
| CAPEX | Activate only when the parent account is active |
| CAPEX | Subaccount reorder needs 2 or more rows |
| Milestones | Only active countries are shown |
| Milestones | Durations have a column maximum; blanks show a "0" placeholder; a duplicate-row warning |
| Checklists | The default tab is the left-most by order, not the first by name |
| Checklists | The whole cluster header toggles, not only the chevron |

What the canvas does for each, verified against the YAML, is in the per-screen results in §6.

Per-screen marker lists from the 22 Oct traceability pass: see §6.

### 5. Apply / Apply to All — contradicts D20

D20 says no Apply or Apply All button, label or function is migrated. The ported screens render
them **disabled**, with their canvas info text: `admin-contract/ApplyBar.tsx` (screen bar and
per-contract bar) and `admin-cost/ApplyStrip.tsx` (screen bar and per-section strip). No data
calls, no writes, no tracking row. **Decide:** remove them (D20 as written), or amend D20 to
"shown disabled, as the canvas ships them".

### 6. Canvas traceability restored (22 Oct 2026)

The port dropped most canvas-named `data-testid`s, verbatim citations and divergence markers on
the admin screens (09 §2). `check-canvas-identities` stayed green only because it exempts
kebab-case ids. Restored screen by screen from `ProjectDocs/_extracted/msapp/projectmanagement/Src/`;
results below.

**Ids changed on purpose.** CONVENTIONS rule 16 says never change an existing test id. Here the
port had already replaced the canvas names that Tosca recorded with kebab-case ids, so the canvas
names were put back. Where a control has no canvas counterpart, its id was kept. Each screen's
tests were updated; no `UT-` id was renumbered and no behaviour assertion changed. **Any Tosca
module or test recorded against the port's kebab ids (22 Oct only) must be re-pointed.**

| Screen | Canvas-named ids verified by the gate (before → after) | Literal AccessibleLabels compared | Divergence / defect markers |
|---|---|---|---|
| CAPEX Accounts | 1 → 18 | 0 (canvas sets none) | about 24 DIVERGENCE, 12 SOURCE DEFECT |
| Default Checklists | 0 → 15 | 0 (canvas sets none) | about 23 / 15 |
| Gates Approvals | 0 → 33 | 1 ("Project Status") | about 35 / 8 |
| Contract | 0 → 39 | 0 (canvas sets none) | about 43 lines |
| Milestones | 2 → 12 | 0 (canvas sets none) | about 32 lines |
| Cost | 0 → 60 | 3 (Year, Month, Month) | about 43 / 16 |

The full per-control lists (old → new ids, changed aria-labels, each marker) are in the code at
each site. `check-canvas-identities.mjs` was tightened the same day: it now also reads
`closeTestId` and `toggleTestId`, resolves a literal `<canvasName>-<ItemKey>` id, and knows
`SettingsTabStrip` (TabList) and `SearchCombo` (ComboBox), so the four `canvas-identity-ignore`
exemptions on the admin screens are gone. Whole app after the change: C1–C5 all 0.

**Aria-labels with record data removed** (rule 16): row Edit / Delete / Apply / Add Task / Add
Period buttons now read the canvas caption ("Edit", "Delete", …) instead of "Edit <name>";
CAPEX row icons add `aria-describedby` to the number and name cells. **Still containing data,
for lack of any canvas caption** (decide): CAPEX "Select account …" and its chevron; Contract
card chevron "Expand / Collapse …" and the DevCo "Select all accounts in …" / "Expand …";
Milestones inputs "<Technology> <Cluster n> duration in months"; the Checklists Completion Date
spinner. Panel ✕ buttons keep "Close panel": the canvas tooltip is "Cancel" (clashes with the
footer Cancel) and the command-bar item's display name is "Home".

**Visible strings restored to the canvas wording** (rule 7; the port had reworded them):
- Gates `DUPLICATE_GATE_MESSAGE`: "Default Approval for the selected Gate allready exists." (canvas typo kept).
- Checklists reorder panel title: "Reoder checklist" (canvas typo kept, as D18 had it).
- Cost Sub-Account placeholder: "Find supplier" (`cmb_…_Subaccount.InputTextPlaceholder`).

**Contradictions with earlier decisions — product owner to decide (not changed):**
1. **Gates Reset Gate** asks "Reset Gate?" first; the canvas writes at once, and D22 said keep it as the canvas.
2. **Gates non-Wind/PV banner**: D22 answer 3 kept it; the port removed it (unreachable from the Wind/PV picker today).
3. **Gates `CHECKLIST_BLANK_MESSAGE`**: "The check list item cannot be blank." vs the canvas "The cluster cannot be blank."; D22 kept the canvas wording, and `rules.test.ts` now pins the reworded text.
4. **CAPEX subaccount reorder** needs 2 or more rows; D19 had kept the canvas "always enabled".
5. **Cost DEVEX description and comment are trimmed**; D24 recorded "untrimmed", as the canvas writes them.
6. **Apply bars** (§5).

**Rule 8 gap: `…CanvasParity` twins dropped by the port, not restored** (marked at each site):
Checklists `sortScopesCanvasParity`, `defaultScopeCanvasParity`, `toggleActiveCanvasParity`;
CAPEX `canReorderAccountsCanvasParity`, `subaccountActivateIconCanvasParity`,
`childStatusOnDeactivateCanvasParity`; Cost `mappedCostPaidByCanvasParity`,
`externalContractDefaultCanvasParity`, `nextPeriodCanvasParity`, `newTailCanvasParity`. Only Cost
`fmtCanvasPercent` remains.

**Canvas controls that still have no id** because a shared component cannot carry one yet. Next
step, additive optional props with today's defaults:
- `ConfirmDialog`: root, Confirm and Cancel ids (fixed `confirm-dialog-*` today); used for the `cmp_*PopUp*` confirmations.
- `LoadingOverlay`: `testId` (`cmp_Admin_Loading`, `cmp_PopUp_Loading_*`).
- `FormPanel`: `titleTestId`.
- `ScopeHeaderBand`: title id.
- `SettingsAccordion`: root and header-button ids.
- `ReorderPanel`: `closeTestId` and `listTestId`.
- `StatusPill`: an `ariaLabel` override (the canvas caption is "Active" / "Inactive").
- `CollapsibleCard`: header and body ids.
- Field validation messages: an id for the `lbl_*_ErrorMessage` labels.

**Hard-coded colours with no theme token** (09 §4), per file: Gates `GateTable.tsx`
(`rgba(0,0,0,0.1)`, `rgba(255,255,255,0.5)`, `#B0B0B0`, `#B3B5B5`) and `ApprovalsPanel.tsx`
(`rgba(180,214,250,0.35)`); Cost `ApplyStrip.tsx` (`rgba(204,226,241,0.5)`, `#323130`),
`OpexContractTable.tsx` (`rgba(0,0,0,0.04)`, `#F5F5F5`, `rgba(0,0,0,0.06)`), `treeStyles.ts`
(`#0078D4`); Contract (`#0078D4`, `#323130`, `rgba(204,226,241,0.5)`, `#EDF4F8`, `#f4f4f4`,
`rgba(238,148,12,0.125)`); Checklists `TaskTable.tsx` (`#F5F5F5`); shared `RowActions`
(`#0078D4`), `ExpandToggle` (`#353D3F`, `#EDEDED`), `SettingsAccordion` (`#323130`, `#fdffff`,
`#E3E3E322`).

**Comments.** The script-reworded comments in the six admin folders were read through, and the
wrong ones fixed: references to the porting branch, to docs not in this repo, to code that no
longer exists (a route guard, `ReorderList`, old paths), and two that stated the canvas behaviour
backwards. Comments outside the admin folders were not part of this pass.

## D37 · DEV push of 22 Oct 2026 (master `6a73ffa`): checklist step 5 waived

`pac code push` to VSBCloud_Dev, app `807a2fba-665c-40f3-b158-ffe822aa7da4` ("Project App"), from
master `6a73ffa`, on the owner's instruction. Profile `ServiceAccount_DEV`
(flow.serviceuser.vsbcloud@vsb.energy); `pac org who` confirmed environment
`be41add6-6f60-ebb0-9c73-2480d6bc615d`.

- Steps 1–4 and 6 ran: `npm ci`; `check:power` 81 / 0; `npm run verify` exit 0 (145 files, 3,859
  tests, build OK); knip shows no new unused files or dependencies (the 8 unused files are pac
  output, declaration files and `read-pcf-port.mjs`); no byte-identical files in `src/`.
- **Step 5 (local smoke test with `pac code run`) was not run by the agent**: it needs an
  interactive, signed-in browser session. The step 7 smoke test on the deployed app is owed by the
  owner, and should cover the six admin screens (D36) and the collapsed admin rail (CA-1).
- 09 §6 still applies: the Dev app is shared by every branch, so this push replaces whatever was
  deployed before it.

## D38 · DEVEX/CAPEX parity remediation (23 Oct 2026) — all items PROPOSED

A read-only parity pass over the Cost app's DEVEX/CAPEX screen against
`ProjectDocs/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml` (20,082 lines, 355
controls). The full row-by-row comparison is
`ProjectDocs/app-docs/gap-analysis/cost-capex-costs.md`; this entry records only the decisions it
asks for.

**Nothing in D38 is decided.** Every item below is marked *proposed, awaiting the product owner*.
Two of them are behaviour changes that must be signed off **before** any code lands — **M-3** (the
four verbatim strings, including whether the delete dialog keeps its red styling) and **M-5** (the
1.21.753 arithmetic). The rest are defect fixes whose direction is not in doubt, but which still
need the usual approval before a commit.

Some of this work now exists in the **working tree** — uncommitted, ungated and unapproved; §4
marks which part, and why that part is only half of its item. Being in the tree is not approval,
and nothing here has been committed.

Caveats that apply to the whole entry: the canvas source on disk is solution **1.21.709**, and
none of this has been exercised against live `VSBCloud_Dev` — these are source-level findings, and
H-2 in particular is the class of defect that `MIGRATION-STRATEGY.md` step 9 says only a real
click-through confirms.

### §1 H-1 · Distribution Frequency is missing "2 months" — *proposed*

- **Canvas:** `drp_AddContract_RightPanel_PaymentFrequency_1.Items` (L11838) is
  `colDistributionFrequency`, the five-row `App.Formulas` table (`App.pa.yaml` L161): **1, 2, 3, 6,
  12 months**.
- **Code:** `features/cost/capex-costs/rules.ts` declares `FREQUENCY_OPTIONS = [1, 3, 6, 12]`, with
  a comment asserting the canvas offers four. Consumed at `Screen.tsx:822`.
- **Effect:** a bi-monthly schedule cannot be created in CAPEX, and a contract stored with
  `vsb_distributionfrequency = 2` renders a Dropdown `value` that is absent from its own options.
  It is also a rule 17 violation: the correct list already exists once, at
  `data/dataverseNames.ts:621`, and both OPEX (`UT-OPEX-073`) and Land Lease use it.
- **Proposed:** derive `FREQUENCY_OPTIONS` from `DISTRIBUTION_FREQUENCY`, keeping the export name
  and shape so no caller changes. Add tests.
- **Cost of not doing it:** the gap stays invisible until a user needs a two-month schedule, and
  the duplicate definition keeps drifting.

### §2 H-2 · CAPEX delete paths bypass `deleteRecord` — *proposed*

- **Rule:** `CONVENTIONS.md` rule 14 — a delete must surface an SDK refusal. The generated
  `delete()` discards the `IOperationResult` and the SDK never throws, so a 403 or a cascade
  restriction resolves exactly like success.
- **Code:** `data/capexWrites.ts` calls `Vsb_capexcostsService.delete(...)` and
  `Vsb_capexprojectcontractsService.delete(...)` **directly** — once in `saveCostLine`'s tombstone
  loop and twice in `deleteCostLine`. Every admin module routes through `deleteRecord`
  (`data/client.ts:113`; e.g. `data/adminCapexAccounts.ts:297` with its refusal test
  `UT-ADCAPEX-019`).
- **Effect:** this is the live risk named in `KNOWN-RISKS-AND-DECISIONS.md` ("several delete paths
  discard the SDK's failure result silently"), now located in CAPEX specifically. A user whose
  delete Dataverse refuses sees the row disappear from the grid and reappear on reload.
- **Proposed:** route all three through `deleteRecord`, add refusal tests.
- **Cost of not doing it:** silent data-state divergence between the UI and Dataverse, with no
  telemetry.

### §3 M-3 · Four visible strings diverge from the canvas — *proposed, needs sign-off*

Rule 7 says visible strings are transcribed verbatim, typos included.

| Canvas | Code |
|---|---|
| `lbl_GeneratorData_…_Fields_Label_17` (L11684) = "Start Date Distribution" | `Screen.tsx:810` "Start Date" |
| `lbl_GeneratorData_…_Fields_Label_18` (L11770) = "End Date Distribution" | `Screen.tsx:814` "End Date" |
| Delete dialog (L8088) Title "Delete Contract"; Confirm "Confirm"; Cancel "Cancel"; Description `$"Are you sure you want to delete the costs for ""{description}"" of the selected Subaccount ""{account}""?"` | `Screen.tsx:904` Title "Delete Cost", Confirm "Delete", description "Delete this cost and its monthly values?" |

- **Note on how this escaped the gates.** The two date inputs' `AccessibleLabel` is each control's
  own **name**, so the code's `aria-label` matches and `check:canvas` passes while the visible
  caption is wrong. This is exactly the missing automated **G-LABEL** that
  `TESTING-AND-HARNESS.md` describes; the canvas-identity gate cannot see caption drift.
- **Proposed:** restore all four, in a `MSG` object with `Control.Property` citations. Leave every
  `aria-label` untouched.
- **Also for decision:** the code's delete confirm is styled `destructive` (red). The canvas uses
  the standard confirm button with `WidthConfirmButton: =96`. Keep the red button as a deliberate
  improvement, or revert to canvas parity?
- **Cost of reverting the captions:** none technically; the longer labels are wider, which the
  panel's two-column layout already accommodates.

### §4 M-4 · Categories are only half Dataverse-driven — *proposed, PARTIALLY IMPLEMENTED*

**Amended 23 Oct 2026, after the Phase 2 work.** This item is no longer a single change: half of it
now exists in the working tree (unapproved, uncommitted) and half remains open, and the half that
landed introduces a **new failure mode** a reviewer should weigh before approving.

- **Canvas:** `tab_Costs_ContentAssignableAccountCategories.Items` (L2431) is
  `SortByColumns(Filter(colCapexAccountCategoriesNew, Not(Name="Overleveraging")), "vsb_order")`,
  and `gal_Costs_ContentCostsSummary.Items` (L7786) is the matching
  `Filter(colDevexCapexSummaryView, Not(Name="Overleveraging"))`. In the canvas the same live
  collection drives both the strip **and** the accounts beneath it, so the two cannot disagree.

**Done (in the tree, awaiting approval).** `Screen.tsx` now calls `useCapexCategories()` and feeds
the result to all four consumers: the tab strip (`categoryTabs(categoriesQuery.data)`), the URL
resolution (`resolveCategory(raw, categoryNames.length)`), the Summary table rows, and the comments
breadcrumb. The empty/failed-load fallback to `CATEGORY_LABELS` already lived in `rules.ts` and was
reused rather than re-implemented. `useCapexCategories()` was added to
`features/cost/costing/useCostBook.ts` over `loadCapexCategories` (`data/costBook.ts:742`, tested as
`UT-BOOK-047`).

**Still open.** `loadCostAccounts` (`data/costBook.ts:806-807`) derives the category index from the
same hard-coded list and drops anything it does not recognise:

```
const category = CATEGORIES.indexOf(level1.name as (typeof CATEGORIES)[number]);
if (category === -1) continue;
```

The `continue` skips the whole level-1 subtree, so none of that category's accounts, sub-accounts
or contracts is ever emitted into the cost book.

- **The new failure mode, stated plainly.** Before the Phase 2 change, a category an administrator
  added in Dataverse was **absent**: no tab, no summary row, nothing to click. After it, that
  category **gets a tab and a summary row with no accounts behind them** — the grid renders empty.
  That is arguably the worse of the two, because an empty category reads as "configured but
  unused" rather than as "missing", and a user has no way to tell the difference from the screen.
  Neither state is reachable on VSBCloud_Dev today (the five names still match), so this is latent
  either way — but it is a behaviour change, not purely an improvement, and it is the reason this
  section is being corrected rather than marked done.
- **Closing it fully** means re-basing `CostAccount.category` off the loaded category list instead
  of `CATEGORIES.indexOf(...)`. That is **a separate piece of work with a wider blast radius**: the
  numeric `category` index is consumed by `accountsInCategory`, the per-category fetch scoping in
  `useCostBook`, `CapexCategoryTotal.category` on the Summary totals, and the `?category=` URL
  contract — every one of them would have to move from "index into a literal" to "index into a
  loaded list" at the same time, including the behaviour when the list has not loaded yet.
  `loadCapexCategories`' own doc comment (`data/costBook.ts:718-724`) anticipated exactly this.
  **Flagged as a follow-up; deliberately not folded into this decision.**
- **Also owed by that follow-up:** the doc comment at `data/costBook.ts:718-724` now describes the
  old behaviour ("the new one would simply never get a tab") and will be wrong once the Phase 2
  change is approved. It should be corrected in the same pass.
- **Cost of reverting the Phase 2 half:** low — it is additive wiring plus one hook, and the
  fallback path is the previous behaviour exactly.

### §5 M-5 · The three 1.21.753 arithmetic changes are still unapplied — *proposed, needs sign-off*

From `1.21.753-REQUIRED-CHANGES.md`, re-verified as still outstanding:

- **R2** — `% Values` months should use `RoundDown`, not `Round` (`rules.ts`
  `individualDistribution` currently rounds).
- **R3** — flooring every month leaves a shortfall; 1.21.753 hands it to the **latest month
  carrying a positive amount**, so the contract sums exactly to the typed Total Cost. Not
  implemented.
- **R4** — a `% Values` contract should open in percent mode only when
  `Coalesce('Total Cost', 0) <> 0`; a `% Values` contract with no total opens showing amounts. Not
  implemented.

- **Why this needs the owner:** all three change stored figures, and none can be verified against
  the 1.21.709 YAML in this workspace. `VSBCloud_managed (2).zip` (1.21.753) exists in
  `VSBCloud_CodeApps/` and could be unpacked to confirm before anything is built.
- **Cost of reverting later:** low — each is a localised arithmetic change with a
  `…CanvasParity` twin available.

### §6 L-6 · The equal-distribution save always recomputes — *proposed, comment only*

- **Canvas:** the whole `RemoveIf('CAPEX Costs', contract)` + re-`Patch` block runs only when
  `Or(locChangedByDate, locChangedDistribution, locChangedFrequency, locClusterChanged,
  loctotalCostChanged)` and the contract is not blank. Editing only the description writes no cost
  rows at all.
- **Code:** recomputes the schedule and reconciles on every save.
- **Effect:** because the code reconciles rather than deletes, the end state matches — but it
  issues PATCHes the canvas would not, on rows whose values are unchanged.
- **Proposed:** no behaviour change; add the `DIVERGENCE:` comment so the next reader is not
  misled. Revisit only if write volume becomes a concern (**R-11**).

### §7 L-7 · Delete order diverges from the canvas — *proposed, comment only*

- **Canvas:** `cmp_PopUp_SubaccountCostsDeletion_Confirmation.OnConfirm` (L8088) removes the
  comments and then the contract. **Its `RemoveIf('CAPEX Costs', …)` is commented out** — it
  relies on the Dataverse cascade.
- **Code:** `deleteCostLine` removes comments, then each cost row explicitly, then the contract.
- **Effect:** safer and more requests. Already listed in
  `09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md` §8 as a deliberate "not ported" candidate
  ("Contract delete relying on the Dataverse cascade"), but not marked at the call site.
- **Proposed:** add the marker; keep the behaviour unless the owner prefers the cascade.

### §8 L-8 · Two canvas defects handled silently — *proposed, comment only*

Both are newly registered in `01-BUGS-FOUND.md` (**C-7** and **D-7**) and are cross-referenced
here rather than restated.

- **C-7** (new-contract `Average Payment` / `Linked Cluster` never written): the code **writes
  both on create**, i.e. it silently fixes the canvas. Rule 8 requires that be marked and recorded;
  whether to keep the fix is question 4 below.
- **D-7** (the two entry paths land on different tabs): the code has one deterministic path driven
  by the URL and does not reproduce the inconsistency.
- **Proposed:** add `SOURCE DEFECT:` markers at both sites. No behaviour change proposed.
- **Follow-up on where the C-7 marker lives (noted 23 Oct 2026, after Phase 2).** The marker was
  written into `features/cost/capex-costs/Screen.tsx`, which is where the defect was *found*, but
  not where it is *answered*: the create that actually writes `vsb_averagepayment` and
  `vsb_LinkedCluster@odata.bind` is in `data/capexWrites.ts` (`saveCostLine`). A reader auditing
  the write path — the likeliest person to need it — would not see it. Moving the marker to the
  create site, leaving at most a pointer in `Screen.tsx`, is a comment-only follow-up. Recorded
  here so it is not lost; **not** done in this pass, because `capexWrites.ts` belonged to another
  agent while Phase 2 ran and a comment is not worth a write conflict.

### §9 What the owner is being asked

1. M-5: apply R2, R3 and R4, or defer until 1.21.753 is unpacked and confirmed?
2. M-3: keep the delete dialog's red `destructive` confirm, or revert to the canvas' plain
   Confirm? (The four strings are proposed for restoration either way.)
3. L-7: keep the explicit cost-row deletes, or adopt the canvas' cascade reliance?
4. C-7: keep writing `Average Payment` and `Linked Cluster` on create, or revert to canvas parity
   and leave a new contract without them?
5. The in-panel error strip `cmp_ShowErrorInContract` (L19760) is not ported — add it, or leave
   Save silently disabled?
6. The Add/Edit panel's year list: canvas `costStartYear … costEndYear + 3`, or the grid's
   navigation window as the code currently uses?
7. Confirm that **D1**'s provisional answer (the server refuses; a 403 becomes a message) still
   stands for this screen's `DataSourceInfo` permission gates.

## D39 · DEVEX/CAPEX UI/UX parity pass — popups and dialog chrome (23 Oct 2026) — all items PROPOSED

A second read-only pass over the same screen, this time comparing what the user **sees**: the popup
components' own geometry, fill, typography and padding, and what each click renders. The row-by-row
comparison is §5 of `ProjectDocs/app-docs/gap-analysis/cost-capex-costs.md`, where the items are
numbered **UX-1 … UX-11**; this entry records only the decisions they ask for.

**Nothing in D39 is decided.** Every item is *proposed, awaiting the product owner*.

> **Amended 23 Oct 2026**, after the agents that implemented these items reported back with
> evidence that corrected two of my own characterisations:
> - **UX-7's blast radius was overstated** and is now **zero visible change** — §7. I had grouped it
>   with the cross-cutting items; enumerating all 42 call sites disproved that.
> - **UX-8 was not an open question but a real defect**, wrong in two ways, and is now **§8** rather
>   than a question in §9.
> - **UX-2 has two per-instance dimensions, not one** — `TextHeight` as well as `BoxHeight`.

**Read this before approving anything below.** Three of the eight findings are not CAPEX fixes at
all — they are corrections to a **shared** component. `ConfirmDialog` has **36 call sites across 22
files** (admin ×7, cost ×11, pm ×15, plus `discardGuard` and `UnsavedChangesGuard`), so **UX-4, UX-5
and UX-6 change how dialogs look on every screen in the app**, not only on DEVEX/CAPEX. They are
still the faithful values — the canvas components they replace are themselves shared, so the canvas
number is right for every caller — but this is a decision about a **cross-cutting visual change**,
not a local fix. A reviewer who approves them is approving a change to the whole app's dialog
chrome.

**UX-7 is not in that group**, despite what the first draft of this entry said. `LoadingOverlay`
has 42 call sites across 27 files, but the branch it corrects is unreachable today — see §7.

Two further things a reviewer should know up front:

- **UX-1 changes user-facing copy**, in what is probably the relink dialog's most common case.
- **UX-3 makes this app reproduce a canvas inconsistency it had previously smoothed over.** The
  paid-toggle dialog will now read "Cluster-linked Costs" in its header and "milestone-linked" in
  its body. That is rule 7 behaviour, but **it will look like a typo to anyone who does not know
  why** — see §3 for the evidence about which half is actually stale.

Caveats for the whole entry, as for D38: the canvas source on disk is solution **1.21.709**, and
none of this has been exercised against live `VSBCloud_Dev`. Geometry findings in particular are
the class that only a rendered comparison settles, which is why the remediation plan ends with a
verification agent that measures the rendered dialogs rather than reading the code again.

Part of this work exists in the **working tree** — uncommitted, ungated and unapproved. §5.5 of the
gap report records which part. Being in the tree is not approval.

### §1 UX-1 · The relink dialog's single-condition copy is missing entirely — *proposed*

- **Canvas:** `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup` (L19884) builds its
  `Description` as `If(locCount > 1, <header + one bullet per condition>, <a tailored single
  sentence>)`. The one-condition arm is **three different sentences**, not the bulleted text with
  the bullet stripped. For the payer case the canvas says
  `Are you sure you want to switch the 'Cost Paid by' to {payer}? This will influence the liquidity
  planning and BoP.` — single quotes, lower-case "by", "influence the liquidity planning" — against
  the multi-condition `• Switch the "Cost Paid By" to {payer}. This will impact liquidity planning
  and BoP.` The cluster and the paid-marker cases differ likewise, each ending in its own question
  ("Would you like to proceed?", "Do you want to continue?").
- **Code:** `rules.ts` `clusterLinkageConfirmation` always emits the header plus one bullet per
  condition, so the single-condition dialog shows a header and a lone bullet where the canvas shows
  one plain sentence.
- **Proposed:** branch on the condition count and transcribe all three single-condition sentences
  verbatim, each citing its canvas source.
- **One character that is load-bearing.** `locMsg3` (`:19989`) ends in a **trailing space**. The
  single-condition branch concatenates `locMsg3 & "Do you want to continue?"` with no separator, so
  that space is the only thing parting the two sentences; the multi-condition branch uses `locMsg3`
  as-is, so that bullet genuinely ends in a space. The previous code dropped it. It is restored and
  pinned by `UT-CAPEXR-119` — precisely the kind of detail a later "tidy the whitespace" commit
  destroys silently.
- **Not a canvas defect.** This is deliberate design, not an oversight: the instance's `BoxHeight`
  is `Switch(locCount, 1, 200, 2, 250, 3, 280)`, and the 200 exists precisely because the
  single-condition form has no header. It is therefore recorded here as a **port gap** and
  deliberately **not** added to `01-BUGS-FOUND.md`.
- **Cost of not doing it:** the most common case of this dialog reads as a one-item checklist
  rather than a question, and the box is sized for copy it is not showing (see §2).

### §2 UX-2 · The ⓘ dialog's height is per instance, not fixed — *proposed*

*Amended 23 Oct 2026: this item has **two** live per-instance dimensions, not one. `TextHeight` is
as live as `BoxHeight`, and both must be carried.*

- **Canvas:** the ⓘ component parameterises **both** the card and the description band:
  - `con_PopUpConfirmation_Body_2.Height = cmp_PopUp_Confirmation_New.BoxHeight`
    (`cmp_PopUp_Confirmation_New.pa.yaml:104`; custom-property default `=260`, `:14-19`).
  - `con_PopUpConfirmation_BodyDescription_2.Height` and the label itself
    `= cmp_PopUp_Confirmation_New.TextHeight` (`_New:167`, `:205`; default `=100`, `:62-67`).
  - The paid-toggle instance passes `BoxHeight: =200` / `TextHeight: =75` (L19868, L19878). The
    relink instance **computes both from the bullet count**:
    `BoxHeight = Switch(locCount, 1, 200, 2, 250, 3, 280)` (`:19906-19936`) and
    `TextHeight = Switch(locCount, 1, 60, 2, 120, 3, 150)` (`:20096-20126`). Each has two
    commented-out predecessors above the live formula (rule 10), and **neither `Switch` has a
    default arm**, so `locCount = 0` yields `Blank()` — unreachable, because
    `needsClusterLinkageConfirmation` will not open the dialog with no conditions.
- **Code:** `ConfirmDialog.tsx` hard-codes `surfaceInfo: { height: "320px" }` for every ⓘ dialog and
  has no notion of a description-band height. The 320 is the component's own **authoring canvas
  size** (`_New:81`), not the dialog box.
- **Effect:** a single-condition ⓘ dialog is 120 px taller than the canvas renders it, with the gap
  above the buttons, and the description band does not shrink with the content either.
- **Proposed:** optional `boxHeight` / `textHeight` props whose **defaults keep every existing
  caller pixel-identical**, with the CAPEX screen passing the canvas values and reproducing the
  blank-at-zero case as `undefined`.
- **Blast radius:** nil if the defaults are preserved — only CAPEX passes the new props.

### §3 UX-3 · The paid-toggle dialog's body says "milestone", its title says "Cluster" — *proposed*

- **Canvas**, instance `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation` (L19864):
  - `:19869` — `Description: ="Setting the milestone-linked cost to ‘Paid’ will remove the
    milestone link for all costs in the contract. Do you want to proceed?"` (the quotes around
    Paid are U+2018 / U+2019, not ASCII).
  - `:19879` — `Title: ="Cluster-linked Costs"`.
- **Code, before this pass:** both halves said "cluster-linked" / "cluster link" — the app had
  silently reconciled the canvas' own contradiction, which rule 7 forbids ("not paraphrased, not
  corrected for style") and rule 8 requires to be marked.
- **Which half is stale is answerable, and the evidence points at the body.** The same instance's
  `OnConfirm` (`:19875`) patches `'CAPEX Project Contracts'` with `{'Linked Cluster': Blank()}` —
  it clears the **cluster** link. The column is `'Linked Cluster'`; there is no milestone column in
  play. So the behaviour agrees with the **title**, and the body's "milestone" wording is the
  canvas' own stale text rather than a second concept. (It is the same vocabulary drift visible
  elsewhere on this screen, where the Add/Edit panel's cluster dropdown is captioned "Link to
  Milestone" while writing `'Linked Cluster'`.)
- **Proposed:** the code now reproduces **both halves verbatim**, as rule 7 requires, with a
  `SOURCE DEFECT:` comment in `panelRules.ts` recording the contradiction. The likely **resolution**
  is to correct the canvas body text to "cluster" rather than to keep reproducing it — but that is
  a change to the canvas app, and it is **the product owner's call, not taken here**. Nothing in
  the code anticipates the answer.
- **Cost of not doing it:** the app keeps quietly disagreeing with the canvas on user-facing copy,
  and the next person to notice re-opens the same question with no record of the evidence.

### §4 UX-4 · The plain dialog's description band is wrong on three edges, not one — *proposed*

*Amended 23 Oct 2026: the first draft described this as "inset 10 px instead of 20". The precise
canvas values are below; the code was wrong on **left, right and bottom**.*

- **Canvas:** `cmp_PopUp_Confirmation` splits the padding between the band and the label. The band
  `con_PopUpConfirmation_BodyDescription` sets **only** `PaddingTop: =16` (`:155`); the label
  `lbl_PopUpConfirmation_BodyDescription` sets `PaddingBottom: =0`, `PaddingLeft: =20`,
  `PaddingRight: =20`, `PaddingTop: =0` (`:176-179`). So the faithful effective values are
  **top 16, left/right 20, bottom 0**.
- **Code:** `ConfirmDialog.tsx` padded the container **16 / 10 / 16 / 10** for both variants — too
  narrow on left and right, and 16 px of bottom padding the canvas does not have.
- **The ⓘ variant already matched and was deliberately not touched.** `_New` pads its *band*
  `PaddingTop/Bottom: =16`, `PaddingLeft/Right: =10` (`_New:172-175`), which is exactly what the
  code had. The two components genuinely differ and must not be unified; the fix moves the plain
  values into their own class so it cannot leak into the ⓘ one. A reviewer would otherwise assume
  both were changed.
- **Proposed:** top 16, left/right 20, bottom 0 for the plain variant only.
- **Blast radius:** **every plain dialog in the app** — 36 call sites, 22 files. The canvas value is
  correct for all of them, because they all replace the same shared canvas component.
- **Consequence:** see §5 — removing the bottom padding exposes an element the canvas does not have.

### §5 UX-12 · The faithful bottom padding pushes the Application Settings error bar flush against the buttons — *proposed, product owner's call*

*Added 23 Oct 2026. Not an independent defect: this is a **consequence of UX-4**. If UX-4 is
reverted, this disappears with it.*

- **What happens:** `ConfirmDialog`'s optional `error` MessageBar — an Application Settings addition
  with no canvas counterpart — renders *inside* the description band with `marginTop: 12px` and no
  bottom margin. With the band's bottom padding now faithfully **0** (§4), that bar sits flush
  against the 60 px actions row.
- **Who sees it:** the **7 admin screens** that pass `error`.
- **Why there is no obvious fix.** The canvas has no error bar at all, so **there is no canvas value
  to copy**. Any spacing would be invented, which is exactly what rule 6 ("theme values are
  transcribed, not chosen") exists to prevent. The candidate fix is a `marginBottom` on
  `styles.error`, but the number cannot be sourced.
- **What was done:** nothing — deliberately. Inventing a value silently would be the worse error.
  Where the bar sits today is pinned by `UT-CONFIRM-S-006`, so whichever way this is decided, the
  change is visible in a diff rather than discovered later.
- **Decision needed:** accept the flush bar as the price of canvas fidelity; add an invented
  `marginBottom` (and if so, what value); or revert UX-4 and keep the app's own 16 px bottom padding
  on the plain band. This is a judgement about an element the canvas does not define, so it is the
  product owner's, not a transcription question.

### §6 UX-5 · The ⓘ block has square corners in the canvas — *proposed*

- **Canvas:** `con_PopUpConfirmation_BodyDescription_Inside_2` (`_New:182-193`) sets **no**
  `Radius*` property, so it renders square.
- **Code:** `infoBlock` had `borderRadius: "4px"`.
- **Blast radius:** see §7 — **not CAPEX-only**.

### §7 UX-6 · The ⓘ block has no vertical padding in the canvas — *proposed*

- **Canvas:** the same container sets only `PaddingLeft: =10` and `PaddingRight: =5` (`_New:191-192`)
  — note the right padding is **5**, not 10 — with the outer band carrying `PaddingTop/Bottom: =16`.
- **Code:** `infoBlock` added `paddingTop/Bottom: "10px"` on top of the band's 16, so the ⓘ block is
  inset further than the canvas renders it.

**Blast radius for UX-5 and UX-6 — amended 23 Oct 2026.** The first draft of this entry said "ⓘ
dialogs only" and left "does any screen other than CAPEX use the variant?" as a review check. That
check has now been run exhaustively over `src/`, and **the premise was wrong**. There are exactly
**three** `variant="info"` call sites:

- `features/cost/capex-costs/Screen.tsx` — the relink confirmation
- `features/cost/capex-costs/Screen.tsx` — the paid-toggle confirmation
- **`features/pm/revenues/Screen.tsx:1302` — the hedge-over-100 dialog**

So these two changes square an ⓘ block and shrink it by 20 px of vertical padding on a **Project
Management screen as well as in Cost**. **PM Revenues must be in the smoke test**; a reviewer
approving D39 on the assumption that the ⓘ variant is CAPEX-only would miss it.

### §8 UX-7 · The save spinner is 120 px tall when it has no text — *proposed, latent*

*Amended 23 Oct 2026. The first draft of this entry listed UX-7 with UX-4/5/6 as a cross-cutting
visual change. **That was wrong**, and enumerating every call site disproved it. The corrected
characterisation is below; no reviewer should be asked to weigh a visual change that does not
occur.*

- **Canvas:** `spi_PopUpLoading_Spinner.Height = If(cmp_PopUp_Loading.InformationText = "", 120, 90)`
  (`cmp_PopUp_Loading.pa.yaml:48-53`).
- **Code:** `LoadingOverlay.tsx` hard-coded a 90 px spinner box, so the no-text branch was absent.
- **Blast radius: zero visible change.** All 42 `<LoadingOverlay>` JSX sites across 27 files were
  read. Exactly four pass no `label`, and **all four are `mode="inline"`** —
  `pm/revenues/Screen.tsx:620`, `pm/grid-operator/Screen.tsx:142`, `pm/production/Screen.tsx:666`,
  `pm/generators/Screen.tsx:1649`. `mode="inline"` is this app's own addition with no canvas
  counterpart and is untouched. **No `mode="blocking"` site renders without a label today**: every
  one passes a literal, a `MSG`/`SPINNER` constant, or a value already guarded truthy. So the
  canvas' 120 px branch is currently **unreachable in production**.
- **Why it is still worth having.** The path exists and is one careless caller away from being
  taken: `FormPanel.tsx:132` (`busyLabel`) and `:133` (`coverLabel`) gate on `!== undefined` rather
  than truthiness, so they would pass `""` straight through. No caller does today —
  `ContractPanel.tsx:126-127`, `DevexCostDrawer.tsx:82` and `ContractPeriodDrawer.tsx:127` all pass
  a string or `undefined` — but if one ever did, the pre-fix code rendered a 90 px box with no label
  beneath it, which is neither the canvas' layout nor a sensible one. `UT-LOADOVL-007` now pins the
  `label=""` case to the 120 px branch.
- **How to read this item:** a latent-parity fix, correct against the canvas, changing nothing a
  user sees today. It needs approval as a code change, not as a design decision.

### §9 UX-8 · The relink dialog's title was wrong in two ways — *proposed (a defect, now fixed in the tree)*

*Amended 23 Oct 2026. The first draft of this entry listed UX-8 as an open question pending a read
of the canvas formula. That read has been done and it settles the matter: this was **a defect, not
a question**, and the code was wrong in two independent ways.*

- **Canvas** (`Capex Costs Screen.pa.yaml:20127-20170`, the relink instance's `Title`):

  ```
  With({locCountOfMessages: C1 + C2filtered + C3},
    If(locCountOfMessages >= 2,                                "Confirm Changes",
       locCostPaidByChanged,                                   "Change Cost Paid By",
       And(locClusterLinkageChanged, CountRows(Filter(…)) > 0), "Change Cluster Link",
       locMilestoneRelinkResetNeeded,                          "Cluster-linked Costs"))
  ```

  `C2filtered` excludes the cluster being linked to, the same filtered count the bullets use.
- **Defect 1 — wrong predicate.** The code keyed on `showC1 && showC2`, not on the **count**. So the
  two-message combinations **C1+C3** and **C2+C3** were mis-titled: each has
  `locCountOfMessages = 2` and must read **"Confirm Changes"**, but the code's test was false and it
  fell through to a single-condition title.
- **Defect 2 — a missing fourth arm.** A milestone-relink reset **on its own** titles the dialog
  **"Cluster-linked Costs"**; the code said "Change Cluster Link". The code had only three arms.
  Note that this is the **same title as the set-as-Paid dialog** (L19879) — which fits the canvas'
  broader cluster/milestone wording confusion already recorded under **UX-3**, and is a further
  reason to treat that vocabulary as one decision rather than several.
- **Proposed:** key the title on the filtered count with all four arms, exactly as above.
- **Worth recording:** four existing tests — `UT-CAPEXR-109`, `-110`, `-111` and `-113` — were
  **pinning the defective behaviour** and had to be corrected rather than added to. A suite
  asserting the wrong thing is precisely why this survived the earlier parity pass, which read the
  tests as evidence of correctness.
- **Blast radius:** CAPEX only.

### §10 Open questions and unexamined area — no proposal yet

- **UX-9 — the in-panel error strip.** `cmp_ShowErrorInContract` (L19760) is not ported; Save is
  simply disabled with no explanation. Same item as the gap report's `S15` and D38's question 5.
- **UX-10 — the Report a problem panel.** `cmp_ReportErrorRightPanel_CapexCosts` (L8081) exists on
  this screen; `features/shared/report-problem` exists in the code. Their **appearance was not
  compared**.
- **UX-11 — the screen's own container geometry: NOT YET ANALYSED.** The toolbar, tab strip, grid
  host and right-panel layout have not been measured against `src/styles/canvas.css`, `PcfGrid.tsx`
  and the 1,270-line vendored PCF stylesheet. **This pass covered popups and interactions only. The
  UI of this screen is not fully audited**, and closing UX-11 is a comparable amount of work again.

### §11 What the product owner is being asked

1. **UX-1.** Approve transcribing the three single-condition sentences, changing what the relink
   dialog says in its most common case?
2. **UX-2.** Approve the per-instance `BoxHeight` **and** `TextHeight` (200/250/280 and 60/120/150)
   in place of the fixed 320 and an unconstrained band?
3. **UX-3.** The paid-toggle dialog now says "Cluster-linked Costs" over a body that says
   "milestone-linked". Keep reproducing the canvas verbatim, or correct the canvas body text to
   "cluster" — which the `OnConfirm` evidence in §3 supports? Note **UX-8** turns up a third place
   the same vocabulary appears, so this is one decision, not three.
4. **UX-4, UX-5, UX-6.** Approve three **cross-cutting** visual corrections that change dialog
   chrome on every screen, not just CAPEX?
5. **UX-7, UX-8.** Approve as ordinary code changes — neither needs a design decision. UX-7 is a
   latent fix with **no visible change today**; UX-8 is a defect fix with the canvas formula quoted.
6. **UX-9.** Add the in-panel error strip, or leave Save silently disabled? (Duplicate of D38 Q5 —
   answer once.)
7. **UX-10 / UX-11.** Commission the two unexamined areas — the Report a problem panel's appearance,
   and the screen's container geometry — or accept them as known-unaudited?
