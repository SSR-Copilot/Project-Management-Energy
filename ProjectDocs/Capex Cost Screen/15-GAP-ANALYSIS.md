# 15 — DEVEX/CAPEX Costs: consolidated and verified gap analysis

Date: 27 Oct 2026. Code-app commit: `a94ec68` (branch `RounakDev1`). Canvas source: solution
**1.21.709** (`ProjectDocs/_extracted/VSBCloud/solution.xml`).

Audience: the developers, testers and product owner on this migration.

Path shorthand used below:

- **Capex L*n*** — `ProjectDocs/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml`.
- **Save › *n*** — line *n* of the Save button's `OnSelect` (Capex L17574) after decoding its escaped
  single-line string. The decoded line numbers match the ones the analysts used.
- **Timer › *n*** — the same for `tmr_Capex_Initial_Load.OnTimerEnd` (Capex L782).
- **txt L*n*** — `ProjectDocs/Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/Powerapps code/CapexScreenCode.txt`.
- Code paths are relative to `ProjectCosts-CodeApp/src/`.

---

## 1. Purpose and method

**Purpose.** This file merges the 14 analyst files (`01`–`14`) into one register. It verifies the
strongest claims against the sources and gives one backlog.

**What was raised.**

- The 14 files hold **380 gap-table rows**.
- **75** are "Covered" rows or groups.
- **305** are non-Covered gaps: 16 High, about 77 Medium and about 212 Low.
- Many of the 305 are the same finding seen from different angles. After merging they become
  **95 consolidated gaps (CG-001 to CG-095)**.

**How they were checked.**

- Every **High** gap was re-opened at its cited canvas and code lines.
- So was every gap reported by **two or more files**, including the 17 named candidates.
- **34 Medium or Low gaps** were also sampled, from all 14 files.
- The escaped formulas were decoded and read in full:
  - the Save button (Capex L17574, 1,918 decoded lines);
  - `tmr_Capex_Initial_Load` (L782, 100 lines).
- `CapexScreenCode.txt` was compared line by line with the `.pa.yaml`. This settled the
  canvas-version question in §5.2.
- The relationship cascade settings were read from `customizations.xml` inside
  `ProjectDocs/Existing Solution/VSBCloud (3).zip`.
- No test was run, nothing was run live, and no file other than `15` and `00` was written.

**What the verdicts mean.**

| Verdict | Meaning |
|---|---|
| **CONFIRMED** | I read the cited canvas formula and the cited code myself, and the gap holds as stated |
| **PARTLY** | Part of the claim holds; the row says which part |
| **REFUTED** | The source contradicts the claim |
| **NEEDS LIVE RUN** | The source settles the formula, but its effect depends on runtime behaviour or live data |
| **analyst** | Not re-verified here; taken from the analyst file with its citation |

Severity is given **after verification**. Where it changed, §4 says why.

---

## 2. Executive summary

### 2.1 Counts after verification (consolidated gaps)

| Type | High | Medium | Low | Total |
|---|---|---|---|---|
| UI | 1 | 5 | 17 | 23 |
| UX (incl. accessibility, Tosca) | 0 | 10 | 11 | 21 |
| Functional | 3 | 7 | 7 | 17 |
| Data (writes, reads, Dataverse) | 6 | 9 | 11 | 26 |
| Perf | 0 | 6 | 2 | 8 |
| **Total** | **10** | **37** | **48** | **95** |

Verdicts:

- **All 17 named candidates were checked.**
  - 14 are CONFIRMED.
  - Two are confirmed in source but **need a live run** for their effect: #5, the author gate, and
    #16, the blanked standard link.
  - #12, the landing tab, is **PARTLY** right. Both analysts are each half right.
- Of the 34 sampled gaps:
  - 33 are CONFIRMED (two of them as formula only, with the rendering inferred);
  - 1 is PARTLY right (GAP-UX-17).
- GAP-FN-20 (candidate #17) is CONFIRMED, but with wrong line numbers.
- **No gap was refuted outright.**
- Some claims were refuted or downgraded (listed in §4.4):
  - one analyst premise (D39 §3);
  - four severities;
  - several line references.

### 2.2 Top 10

1. **CG-045 (High, Data)** — Accepting the relink dialog deletes every "Comments to payment date"
   comment. The live 1.21.709 canvas only resets Paid. The code follows the older
   `CapexScreenCode.txt`.
2. **CG-046 (High, Data)** — Confirming "Cluster-linked Costs" never clears `'Linked Cluster'`, though
   the dialog promises it.
3. **CG-047 (High, Data)** — Standard contracts store the full assumption amount over the eligible
   clusters. The canvas stores only the eligible share of a schedule built over all ticked clusters.
4. **CG-048 (High, Functional)** — Editing a `% Values` contract opens the months as money. Every
   month shows a range error, and Save is blocked.
5. **CG-049 (High, Data)** — On a `% Values` contract, changing Total Cost converts the months against
   the **old** stored total.
6. **CG-050 (High, Functional)** — Comment Save closes the panel before writing. A failure is silent and
   the edits are lost.
7. **CG-051 (High, Data)** — `deleteComment` uses the raw generated `delete()` (rule 14). Three delete
   paths can report success on a refusal.
8. **CG-052 (High, Data)** — A new contract defaults Cost Paid By to SPV, not the sub-account's
   `SPVDevCo Mapping`. The Add path never asks "Change Cost Paid By".
9. **CG-053 (High, Functional)** — There is no comment author gate. Anyone can edit, delete or reset
   anyone's comment.
10. **CG-001 (High, UI)** — Rule 20 blue/italic styling is on 5 of the canvas's 11 standard-styled
    panel controls.

---

## 3. Consolidated gap register

Column key: **Status** is the merged analyst status:

- **M** — Missing;
- **DU** — Divergent-unmarked;
- **DM** — Divergent-marked;
- **P** — Partial;
- **CO** — Code-app-only.

**Action** uses the brief's four options:

- **port** — port the canvas;
- **mark** — keep and mark `DIVERGENCE:`, with a D-entry;
- **PO** — a product decision;
- **fix** — fix a code-app defect.

### 3.1 UI gaps — layout, themes, typography, PCF visuals

| CG id | Title | Source gap ids | Canvas (cite) | Code app (cite) | Type | Status | Severity | Verdict | D-entry / bug | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| CG-001 | Standard blue + italic on 6 of 11 panel controls missing; `Choices` has no `standard` prop | TH-01, PNL-016, TH-03 | 11 `FontColor`/`FontItalic` pairs: L10476, L10866, L10982, L11112–L11311 (×5), L12256, L12335, L12395 | Only cluster labels styled (`features/cost/capex-costs/Screen.tsx:842`); Description, Equal Distribution, Total Costs, Cost Paid By, VAT, Depreciation plain (`:773-897`); `Choices` signature (`components/CanvasFields.tsx:178-188`) | UI | P | High | CONFIRMED | Rule 20 (PO 20 Oct); gap-analysis U13 wrongly COVERED | fix |
| CG-002 | "Edited from PCF" warning banner not rendered; its two columns not selected | UI-03, TH-06, PNL-021, DV-05 | `con_Warning_OnEditFromPCF` L12426–12495 (`Visible` L12444-12451, akzent4 #f5911e @ 50 %, HTML L12492) | No reference in `features/cost/`; `loadCostLines` selects neither column (`data/costBook.ts:1025-1035`, `features/cost/costing/useCostBook.ts:430-431`) | UI | M | Med | CONFIRMED | none | port (depends on CG-054 writing `Initial Contract Source`) |
| CG-003 | Standard option name falls back to nothing, no AutoId sort, blank-name options dropped by the parser | DV-13, PCF-12, PCF-13 | `Name: Coalesce(vsb_description, vsb_descriptioninput, "Standard Contract " & autoid)` L703-707; `SortByColumns(…"AutoId")` L715-716 | `name: o.assumption.description` (`Screen.tsx:384-386`); no `vsb_autoid`/`vsb_descriptioninput` (`data/standardContracts.ts:27-41`); parser drops blank name (`pcf/services/DatasetParser.js:539-544`) | UI | DU | Med | CONFIRMED | none | port |
| CG-004 | Select Cluster shown for Equal-by-dates contracts with stored clusters | UI-04 | `Visible` = Equal && (By Cluster ‖ any `locClusterRecord` flag) L11044-11051 | Only `equalMode === "cluster"` (`Screen.tsx:829-853`) | UI | DU | Med | CONFIRMED | none | PO → port or mark |
| CG-005 | Summary amounts and the Total Costs message ignore the user's language | TY-02, TY-03, PNL-020 | `Text(n,"###,###,###,##0")` L7865-7867, L7969; language-prefix literals L10937 | `numberFormat("en-GB")` (`features/cost/capex-costs/rules.ts:103-106`); `validateTotalCost(costValue, countryName)` without locale (`Screen.tsx:481`) | UI | DU | Med | CONFIRMED (code); canvas `Text()` separators inferred | none | fix (wire `useSession().locale`) |
| CG-006 | Open Sans declared but never shipped; canvas mixes Open Sans (classic) and theme face (modern, PCF) | TY-01 | `gblAppStyles.Label.Font` (`App.pa.yaml:205`) | Stack starts `'Open Sans'` (`theme/tokens.ts:102`); `@font-face` only mentioned in a comment (`styles/global.css:6-8`); no `fonts.css` | UI | DU | Med | CONFIRMED | D49 §1 (partly wrong, §8) | PO (supply font files) |
| CG-007 | Month range message groups the number (`500,000,000.`); canvas interpolates a raw Number | TY-04, PNL-019 | `$"Value must be between 0 and {If(Poland,2250000000,500000000)}."` L13364-13368 | `` `${grouped(max)}.` `` (`rules.ts:442-461`); pinned by UT-CAPEXR-062 | UI | DU | Low | CONFIRMED (formula); ungrouped rendering inferred | gap-analysis S8 wrongly COVERED | port + test change (rule 7) |
| CG-008 | Average Amount per Payment display format (`1,000` vs `1000.0`) | TY-05, PNL-017 | `Text(v,"########0.0#")` L12084-12087 | `amount(average)` (`Screen.tsx:885`, `costing/model.ts:279`) | UI | DU | Low | analyst | none | port |
| CG-009 | Distribution Scheme option order and New default (`% Values` first in canvas) | UI-07, PNL-010 | `Items: =colContractDistributionScheme` L10754; `First(...)` L10747-10749 | `["Absolute Values","% Values"]` (`Screen.tsx:803`); default `absolute` (`rules.ts:115`) | UI | DU | Low | PARTLY (order inferred from option values 952850000/1) | none | NEEDS LIVE RUN, then port |
| CG-010 | Footer prints "Version X" on CAPEX; canvas footer is empty | MOD-09, UI-02 | `lbl_Costs_FooterVersion.Text: =""` L8076 | `components/AppShell.tsx:86-88` | UI | DU | Low | CONFIRMED | gap-analysis U15 wrongly COVERED | PO → port or mark |
| CG-011 | PCF cluster band: canvas always sends a date (fallback year/month); code sends `null` and drops the band | FN-14, VAR-10, PCF-11 | `Cluster{n}Date: Date(Coalesce(StartYear, locNavigationMinYear, gblSelectedProjectYear), Coalesce(StartMonth,1),1)` L7238-7273 | `features/cost/capex-costs/PcfGrid.tsx:79-84` | UI | DU | Low | CONFIRMED (formula); visual NEEDS LIVE RUN | none | mark |
| CG-012 | Contract row label and sort prefer `vsb_description`; canvas uses `CPC.Name` | FN-11, PCF-18 | `vsb_costdescription: CPC.Name` L1205; sort L1408-1414 | `contractLabel(description, name)` (`data/costBook.ts:1088`); `gridRows.ts:105-112` | UI | DU | Low | CONFIRMED | none | port (differs only when the two columns differ) |
| CG-013 | Year gallery: one open year at a time; whole row is the hit area | UI-05, UI-06, PNL-022 | Per-row fold L12706, L13133-13138; row button `OnSelect: =` L12676 | `openYear` (`Screen.tsx:247-248, 910-919`); pinned `Screen.test.tsx:352` | UI | DU | Low | analyst | none | mark |
| CG-014 | Header chrome: environment tint, version/title placement, info icon, height 70 vs 74 | MOD-10, MOD-11, MOD-12, TH-07, UI-21 | `cmp_Header.pa.yaml` L80-97, L200-219, L422-490; Capex L2328 | `components/AppHeader.tsx:40, 254-257`; `headerRules.ts:16`; `canvas.css:9` | UI | M/DU | Low | analyst | X5 (partly) | port |
| CG-015 | Left rail: collapsed width 32 vs 56, collapsed flat list, " DEVEX/CAPEX" leading space, content width fixed | MOD-23, MOD-24, UI-08, UI-09 | `gblAppSizes` `App.pa.yaml:205`; Capex L2370, L2413 | `theme/tokens.ts:71`; `components/LeftNav.tsx:163, 197-209`; `navigation.ts:57` | UI | DU/DM | Low | analyst | UT-NAV-004 | mark |
| CG-016 | Panel skins: insets, divider colour, disabled boxes, scrim, month-error colour and weight, year-row skin and type | UI-12, UI-13, UI-14, TH-05, TH-10, TH-11, TH-12, TH-13, TY-06, TY-08 | e.g. month error `palette.Error` (#B22727), Semibold, 8 pt L13322-13340 | `.canvas-field-error` #d20532 12 px (`Screen.tsx:941`, `canvas.css:280`) | UI | DU/P | Low | CONFIRMED for TH-05; rest analyst | none | port |
| CG-017 | Screen skins: toolbar geometry, Add icon, Summary rows and dividers, screen background, text colour, focus colour, theme-default modern controls, grid minimum width | UI-10, UI-15, UI-16, UI-17, TH-08, TH-09, TH-14, TH-15, TH-17, TY-09 | L2547-3063, L7769-8024, L12, L2537 | `canvas.css:3, 161, 190-212`; `Screen.tsx:95-96, 711` | UI | DU/P | Low | analyst | none | port |
| CG-018 | Theme plumbing: no Error/Success/Warning alias layer; 15 re-typed hexes; non-palette write-error colour | TH-04, TH-18, TH-19 | `gblAppColors` `App.pa.yaml:205` | `theme/fluent.ts:56-57`; `canvas.css`, `global.css`, `CommentsPanel.tsx`, `ConfirmDialog.tsx`; `canvas.css:275` | UI | DU/CO | Low | analyst | D36 (list incomplete) | fix (add `appColors` to `tokens.ts`) |
| CG-019 | Comments panel skins, font weights and icon glyphs | TH-16, TY-10, TY-11, CMT-22 | L8205-9979 | `CommentsPanel.tsx:26-27, 61-196, 535-620` | UI | P/DU | Low | analyst | none | port |
| CG-020 | Verbatim drift: "Cluster 3" caption has a leading TAB; `% Allocated` decimal separator | PNL-024, TY-14 | `="\tCluster 3: Permitting"` L11215 (TAB confirmed) | `costing/model.ts:8`; `panelRules.ts:75-76` | UI | DU | Low | CONFIRMED (PNL-024) | none | PO (typo?) then mark |
| CG-021 | Report Error panel: title, prefill and Clear Warning differ | MOD-18, POP-17 (MOD-17 marked) | `cmp_ReportErrorRightPanel.pa.yaml` L72, L150, L264-278, L428-456 | `components/ReportProblemPanel.tsx:81-145` | UI | P | Low | analyst | B-1 (Save only); D39 UX-10 | port strings |
| CG-022 | Add Costs from Table renders under the app shell; canvas screen has no chrome | MOD-28 | Add Costs from Table L35-58 | `App.tsx:48-55`; `add-costs-from-table/Screen.tsx:271-276` | UI | DU | Low | analyst | none | mark |
| CG-023 | Dialog ✕ tooltip, hover colour and shared test id | POP-18 | `cmp_PopUp_Confirmation` :129-144; `_New` :145-160 | `components/ConfirmDialog.tsx:99-108, 369-372` | UI | DU | Low | analyst | none | port |

### 3.2 UX gaps — interaction, feedback, pop-ups, accessibility, Tosca identities

| CG id | Title | Source gap ids | Canvas (cite) | Code app (cite) | Type | Status | Severity | Verdict | D-entry / bug | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| CG-024 | No dirty-flag Save gate: Save is enabled on an untouched Edit | UX-01, VAR-03, PNL-034 | `locEditSaveButtonEnabled` in Save `DisplayMode` L17548, Execute L17648, Recalculate L17712, strip L19816; reset at L33 and Edit warm-up L19700, not on Add; set by 27 handlers | `disabled={!valid ‖ busy}` (`Screen.tsx:753`); validity substituted (`panelRules.ts:362-364`) | UX | DU | Med | CONFIRMED | none (`02-OPEN-DECISIONS.md:717` is the Admin screen) | PO (ties to D38 §6) → port or mark |
| CG-025 | Escape or a backdrop click closes the Add/Edit and Comments panels and discards input | UX-02, PNL-047, CMT-19 | Scrim has no `OnSelect` L10249-10264, L8161; only ✕ and Cancel | Overlay `Drawer`, `onOpenChange` → close (`components/FormPanel.tsx:112-114`); no `dirty` passed (`Screen.tsx:750`) | UX | DU | Med | CONFIRMED | none | fix (pass `dirty`) or mark |
| CG-026 | In-panel error badge `cmp_ShowErrorInContract` missing; Save is grey with no reason | UI-11, POP-04, PNL-031, VAR-08, PCF-30 | L19760-19834 ("Total percentage is over 100%" / "…below 100%" / "No cost is allocated."); set at Save › 1223-1230 | Save disabled silently (`rules.ts:260-280, 824-830`) | UX | M | Med | CONFIRMED | D38 §9 Q5; D39 UX-9; gap-analysis S15 | port (click-time check + badge) |
| CG-027 | A failed read looks like zero or empty: Summary totals, comments panel, grid dots, standard assumptions | UI-18, UX-06, UX-07, FN-15, CMT-11 | n/a (canvas reads collections) | Summary checks `isLoading` only, so the rows are blank and "Total CAPEX 0" (`Screen.tsx:691-708`); comments panel renders no `error` (`CommentsPanel.tsx:556`); `Screen.tsx:277-299` | UX | M | Med | CONFIRMED | Rule 19 | fix |
| CG-028 | Write errors show raw SDK text instead of the canvas messages | POP-10, POP-11, POP-12, FN-07, FN-08, PNL-032, PCF-14, PCF-15 | "Could not update paid status…" L7753-7757; "No monthly cost row found for selected…" L7740-7744; delete prefix L8136-8139; "Something went wrong saving the Capex data…" Save › 1151, 1840 | `(writeError as Error).message` (`Screen.tsx:1050-1056`); "…for **the** selected…" (`Screen.tsx:441`, `rules.ts:854`); string exists in `add-costs-from-table/rules.ts:95` | UX | DU | Med | CONFIRMED | none | port (reuse the string, rule 17) |
| CG-029 | Notifications: a persistent red `div` and a blocking `alert()` instead of toasts | POP-14, POP-16, FN-06, PCF-17 | `Notify(…, NotifyTimeOut 500)` L7373-7389 | `globalThis.alert` (`Screen.tsx:395`); `.canvas-error` with no dismiss or testid (`:1050-1056`); `useNotify` unused | UX | DU | Med | CONFIRMED | none | fix (use `useNotify`) + PO on duration |
| CG-030 | 7 `aria-label`s differ from the canvas `AccessibleLabel`, and the identity gate cannot see them | UX-08, UX-09, PNL-025, PNL-026 | `AccessibleLabel` = control name: L11100, L11151, L11201, L11250, L11299, L11402, L11841 | Checkbox `aria-label` "Cluster N: …" (`Screen.tsx:840`); `CostSelect` puts the caption on `aria-label` (`CanvasFields.tsx:163`); composed ids skip C3/C4 (`scripts/check-canvas-identities.mjs:229-241`); `CostSelect` has no literal at the call site (`:255-268`) | UX (Tosca) | DU | Med | CONFIRMED | Rule 16; gap-analysis U3 overstates | fix after Tosca owner check ("never change an existing value") + harden gate |
| CG-031 | PCF DOM controls (+/−, •••, Add, menu items, zero-cell dots) have no `aria-label` or `data-testid` | UX-13, PCF-09, PCF-10 | Upstream PCF sets none | `pcf/ui/GridRenderer.js` (6 test-id hits, data cells only); `ActionDropdown.js` | UX (Tosca) | P/M | Med | analyst (test-id count checked) | D16 (a) | fix (in the vendored port; see CG-067) |
| CG-032 | Year, toolbar toggles, payer filter and tab reset after visiting another screen | MOD-04, MOD-06, MOD-07, VAR-01, VAR-02 | `gblSelectedProjectYear` global, only clamped L238-257; tab kept by `OnVisible` L259-276 | `useState` (`Screen.tsx:220-222, 240-242`); back link carries `category` only (`add-costs-from-table/Screen.tsx:161`) | UX | DU | Med | CONFIRMED (year); toggles inferred | D50 covers the seed only | PO → port (URL or context) |
| CG-033 | Landing tab: the warm entry lands on the previous or first real category; code always lands on Summary | MOD-05, UI-01, FN-16, VAR-11 | Warm path: `OnVisible` L259-293; cold path: `tmr_Capex_Initial_Load` L778-784, Timer › 21-32 → Summary | `resolveCategory(null)` → Summary (`rules.ts:92-100`, `Screen.tsx:182`) | UX | DM (no code marker) | Med | PARTLY (see §5.1) | D-7; D38 §8 | mark (`SOURCE DEFECT:` as D38 §8 proposed) or PO |
| CG-034 | Spinner texts and regions differ: delete, paid, tab load, validation, Add Cost from Table, loader fallback | UI-20, UX-03, UX-05, POP-05, POP-06, POP-07, POP-08, FN-09, PCF-16 | Delete: spinner, no text L8108; paid "Please wait, saving..." L7665; content-area spinner L19749-19759; L2568-2576; L18211-18215 | `SAVING_COSTS` for every write (`Screen.tsx:205, 1045-1049`); full-body inline loader (`:301`); `panelRules.ts:237-242` | UX | DU/M | Low | CONFIRMED | none | port |
| CG-035 | Panel ✕ identity: `panel-close`/"Close panel", no "Cancel" tooltip | UX-11, PNL-027, CMT-19 | `ico_GeneratorData_…_Header_Cancel_2` L10317-10359; comments `Icon2` L8226-8242 | `FormPanel.tsx:119-121` (`closeTestId`/`closeLabel` exist) | UX | DU | Low | CONFIRMED | none | fix |
| CG-036 | Shell identities: header controls, rail name and tooltip | MOD-20, MOD-21, MOD-22, PCF-26, PCF-27 | `cmp_Header.pa.yaml` L150, L507, L605-609; `cmp_Left_Navigation.pa.yaml` L148, L154 | `AppHeader.tsx:324-371`; `LeftNav.tsx:79, 168-189` | UX | DU | Low | analyst | Rule 16 | PO (rule 16 forbids silent renames) |
| CG-037 | Accessible names: radio group name vs caption, year row with bound data, tab keyboard model | UX-10, UX-12, UX-14 | L12657; `rad_…` none; `ModernTabList` L2431-2516 | `Screen.tsx:683-687, 910-912`; `CanvasFields.tsx:197` | UX | DU/P | Low | analyst | rule 16 vs 09-tosca "Reversed" | PO (reconcile the two docs) |
| CG-038 | Tooltips missing: required star "ToolTip", comment actions, comments header title | UX-15, CMT-20, CMT-21 | L10527, L11395…; L9752-L10014; L8224 | `CommentsPanel.tsx:665-697` | UX | M/DU | Low | analyst | none | port (or mark the placeholder) |
| CG-039 | Every dialog shares the `confirm-dialog-confirm`/`-cancel` test ids | POP-19 | `pcf_PopUpConfirmation_BodyButtons_Confirm(_1)` | `ConfirmDialog.tsx:414, 426` | UX | P | Low | analyst | none | fix |
| CG-040 | Month inputs: `type="number"`, no `0.00` placeholder, blank shown for 0 | TY-07, TY-13, PNL-018 | `Placeholder: ="0.00"` L13623-13625; Add shows 0 L19641 | `Screen.tsx:928-939` | UX | P | Low | analyst | none | port |
| CG-041 | Comments panel: filter state survives reopen; Save enablement edge cases | CMT-17, CMT-18 | L7634-7635; L9800-9808, L10009 | `CommentsPanel.tsx:247-249, 429-446` | UX | DU | Low | analyst | none | port |
| CG-042 | Header behaviours: approval tooltip text, Help in new tab, clickable warning icon, unconditional exit prompt, app-wide error capture | MOD-13, MOD-14, MOD-15, MOD-16, MOD-27, PCF-28, PCF-29, POP-22 | `cmp_Header.pa.yaml` L322, L491-545; `App.pa.yaml` L11, L188-198 | `AppHeader.tsx:288, 320-361`; `discardGuard.tsx:26-39`; `App.tsx:103` | UX | DU/DM/P | Low | analyst | D8 (Help) | mark |
| CG-043 | Focus is lost when the PCF repaints after a mutation | UX-16 | No `SetFocus` except comments Save L10137 | `PcfGrid.tsx:64-68` | UX | P | Low | analyst (inferred) | none | fix |
| CG-044 | Code-only UX improvements left unrecorded: live month preview, dialog Escape, a11y baseline, no initial-load stall | PNL-023, POP-20, UX-18, UX-17 | Cold path waits on `CountRows(gblClusterDurations) > 0` (Timer › 9) | `Screen.tsx:454-458, 214-223`; `ConfirmDialog.tsx:355-359` | UX | CO | Low | PARTLY (UX-17: no endless spinner, see §4.4) | none | mark (record, keep) |

### 3.3 Functional gaps — business rules, data writes, network, state

| CG id | Title | Source gap ids | Canvas (cite) | Code app (cite) | Type | Status | Severity | Verdict | D-entry / bug | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| CG-045 | Accepting the relink dialog deletes every payment-date comment, and the trigger counts comments | PNL-030, POP-02, POP-03, DV-07, NET-07, NET-08 (part) | Live `OnConfirm`: `UpdateIf(…'Cost Paid' = false)` only; `RemoveIf('Capex Comments')` commented out L20052-20066; trigger has only the paid count L11468-11479; dead copy in `Visible: false` popup L396-399, L425-427 | `capexWrites.ts:244-252` (deletes via raw `deleteComment`); trigger counts comments (`rules.ts:970-978`, `Screen.tsx:537-544`); pinned by UT-BOOK-058, UT-CAPEXR-104; comments cite `CapexScreenCode.txt` | Data | DU | **High** | CONFIRMED | none (gap-analysis B11 wrong) | fix (port 1.21.709) after PO confirms the version (§5.2) |
| CG-046 | Paid toggle on a milestone-linked Individual contract does not clear `'Linked Cluster'` | FN-01, DV-01, POP-01, NET-06 | Gate L7422-7437; `OnConfirm` patches `{'Linked Cluster': Blank()}` then selects the paid button L19875; dialog text L19869 | `onConfirm` → `writes.setPaid.mutate` only (`Screen.tsx:1033-1035`); `setCostPaid` writes `vsb_costpaid` only (`data/capexWrites.ts:53-58`); text promises removal (`panelRules.ts:280-282`) | Data | M | **High** | CONFIRMED | none (gap-analysis S12 wrong; D39 §3 cites the formula only) | port (PO: also on un-pay?) |
| CG-047 | Standard contract money: code distributes the full amount over eligible clusters; canvas builds over all ticked clusters, writes only the eligible rows, and stores their sum | FN-02, DV-02 | All selected clusters L18521-18598; schedule L18704-18757; avg/last over all payments L18799-18820; eligible-only rows L18839-18889; `Total Cost = Sum(written)` L18890-18899 | `clusterPayments(amt, eligible…)` (`Screen.tsx:396-420`; `rules.ts:198-225`); `totalCost: amt` (`:413`); average from the eligible count (`capexWrites.ts:174-180`) | Data | DU | **High** | CONFIRMED | none | PO → port, or mark + `…CanvasParity` twin + D-entry |
| CG-048 | Editing a `% Values` contract opens the months as money | PNL-008 | Enrich loader `Round(m / 'Total Cost' * 100, 1)` when `schemeIsPct` L19136-19253 (started by warm-up L19733-19737) | `open()` clones `line.payments` (`Screen.tsx:327-334`); payments are money (`data/costBook.ts:1097-1107`); range gate blocks Save (`Screen.tsx:513-516`) | Functional | M | **High** | CONFIRMED (code path); count of live % contracts NEEDS LIVE RUN | D38 §5 R4 (related) | fix |
| CG-049 | `% Values` contract: a changed Total Cost converts the months against the stored total | PNL-028 | Save › 734-950: if typed total ≠ `locAllYearsCost`, every `<M>Save` is recomputed with the **typed** total | `totalCostForPercent` prefers the stored total (`rules.ts:129-139`) → `resolvedPayments` (`:290-305`, `Screen.tsx:458`) while `vsb_totalcost` gets the typed value (`:644`); no test | Data | DU | **High** | CONFIRMED | none | fix + test |
| CG-050 | Comment Save closes the panel before writing; no `catch`, no message, edits lost | CMT-08, CMT-10, POP-13 | Spinner over the open panel L10138-10143; `IfError` around the writes; close only on success L10208; Notify L10211-10214 | `setSaving(true); onDismiss();` then `try/finally` (`CommentsPanel.tsx:459-518`); `void commit()` (`:525`) | Functional | M | **High** | CONFIRMED | none (CMT-10 comment cites the wrong screenshot) | fix (port the canvas order and message) |
| CG-051 | `deleteComment` calls the raw generated `delete()`, so a refusal reads as success | CMT-09, DV-08, NET-13, PNL-041 | Deletes inside `IfError` L10144-10157, L8114-8140 | `data/comments.ts:218-220`; used by `capexWrites.ts:250`, `:336` and the panel (`useCostBook.ts:612`) | Data | M | **High** | CONFIRMED | Rule 14; KNOWN-RISKS; D38 §2 H-2 half-done | fix (`deleteRecord`) |
| CG-052 | A new contract defaults Cost Paid By to SPV, not the sub-account mapping; Add never asks "Change Cost Paid By" | VAR-04, VAR-05, PNL-006, PNL-007 | `DefaultSelectedItems: Coalesce(contract 'Cost Type', SPVDevCo mapping)` L12234-12254; `locInitialCostPaidBy` L7303-7309; `locCostPaidByChanged` L12287-12292 | `payer: "SPV"` (`rules.ts:111-119`, `Screen.tsx:333`); `costPaidByChanged = Boolean(storedLine) && …` (`:536`); mapping used for stored lines only (`costBook.ts:1091`) | Data | DU | **High** | CONFIRMED | none | port |
| CG-053 | No comment author gate on Edit, Delete and Reset | CMT-07 | `'Created By'.'Primary Email' = User().Email` L9761-9766, L9818-9823; reply edit also needs an unresolved parent L8710-8721; Reset: author or resolver L10023-10032 | `commentEditable` checks `resolved` only (`features/cost/capex-costs/comments.ts:520-530`); `_createdby_value` is loaded (`data/comments.ts:76`), `systemuserid` too (`data/currentUser.ts:151, 178`) | Functional | M | **High** | CONFIRMED (code); canvas effectiveness NEEDS LIVE RUN (09 §5.1: the image under a disabled button may still take the click) | none | port; PO on a server-side role |
| CG-054 | Standard and panel contracts never write `Initial Contract Source`; standard cost rows lack the assumption link | FN-04, DV-03, DV-04, PNL-036 | `Coalesce(existing, Powerapps)` Save › 992-995, 1565-1568, L18668-18671; `'Capex Contract Standard Assumption'` per cost row L18886 | Neither column in `saveCostLine` (`capexWrites.ts:115-190, 270-279`) | Data | M | Med | CONFIRMED | none (gap-analysis D11 wrong) | port |
| CG-055 | The canvas blanks `Capex Standard Assumption Contract` on every panel save; the code keeps it | DV-06, PNL-037 | `If(IsStandardContract, Blank())` (Blank on both arms) Save › 997-1000, 1570-1573 | Bound on create only (`capexWrites.ts:184-189`) | Data | DU | Med | CONFIRMED (formula); effect on re-offer and on the plugin NEEDS LIVE RUN | none | PO → mark `SOURCE DEFECT:` + D-entry |
| CG-056 | Standard option eligibility: canvas option build is **not** floored at 5 and uses raw durations | FN-03 | `Cluster >= Coalesce(locProjectStartClusterNo,0)` L690-696 (the click path floors at 5, L18289-18297) | `applicableStartCluster` floors at 5 (`features/cost/capex-costs/standardContracts.ts:71-74, 81-94`) over synthesised clusters (`Screen.tsx:366-383`) | Functional | DU | Med | CONFIRMED | none | PO → port or mark |
| CG-057 | Changing Distribution, Scheme or Equal Distribution does not reset the months, dates and clusters | PNL-011, PNL-012, PNL-013 | `ClearCollect(colNewEditPanelCost, … Blank())` L10634-10659, L10756-10779; By-change resets L10870-10907 | Keeps the scheme and carries `proposed` into `payments` (`Screen.tsx:789-791, 804-806, 823`) | Functional | DU | Med | CONFIRMED | none | port |
| CG-058 | Clearing a month box writes 0 instead of deleting the row | PNL-014 | Blank → `Remove` (Save › 1157-1170) | `Number("")` = 0 (`Screen.tsx:937`); the delete path in `writeSet.ts:45-48` is unreachable from the panel | Data | DU | Med | CONFIRMED | none | fix |
| CG-059 | Add pre-fills dates `04/2025`–`07/2027` | PNL-005 | `locDistributionDatesRecord: Blank()` L19679 | `newCostLine` (`rules.ts:116`; `Screen.tsx:335-336`) | Data | DU | Med | CONFIRMED | none | fix |
| CG-060 | Standard flag cleared by 2 of the canvas's 12 handlers | TH-02, PNL-015 | `IsStandardContract: false` from Total, Frequency, Link, Payer, VAT, Depreciation, dates, By (e.g. L10985, L11454, L11857, L12268-12285, L12340, L12400) | `clearStandardFlag` only on Description and clusters (`Screen.tsx:316-319, 776, 846`) | Data | P | Med | analyst (pattern spot-checked) | Rule 20 | port |
| CG-061 | Individual Absolute: Total Cost not refreshed from the months | PNL-029 | `locAllYearsCost = Round(Sum(TotalSave),1)` Save › 473-486 → `Coalesce(Value(txt), locAllYearsCost)` Save › 976-979 | `costValue` never updated (box hidden); Add omits `vsb_totalcost`, Edit writes the stale total (`Screen.tsx:644`, `capexWrites.ts:145`) | Data | DU | Med | PARTLY (code confirmed; canvas hidden-input tracking inferred) | none | fix |
| CG-062 | A failed or half-applied save does not refresh the grid and reports no applied count | PNL-033, PNL-043 | Reload runs regardless Save › 1182, 1876 | `onSuccess: invalidate` only (`useCostBook.ts:415`); serial `unwrap`, stops at first failure (`capexWrites.ts:213-291`) | Data | DU/P | Med | CONFIRMED | KNOWN-RISKS "no changeset" | fix (invalidate `onSettled`) |
| CG-063 | Panel year list follows the grid window, not cost start to cost end + 3 | PNL-009, VAR-06 | `locProjectStartyear`/`locProjectDuration` L19596-19628 | `projectPeriods(window.min, window.max)` (`Screen.tsx:902`) | Functional | DU | Med | CONFIRMED | D38 §9 Q6 (open) | PO → port or mark |
| CG-064 | `statecode eq 0` on project, contracts, costs, comments, states and assumptions; canvas has none | MOD-03, DV-10, DV-11, FN-13, VAR-09, CMT-24 | `LookUp(Projects, …)` L40-56; collections without status (`App.pa.yaml:205`, L729-736, L1060-1063) | `data/project.ts:170`; `costBook.ts:1036, 1141, 1280`; `comments.ts:78` | Data | DU | Med | CONFIRMED (project); rest analyst | Same question as D45 G2 | PO |
| CG-065 | Account index hard-codes `CATEGORIES` while the tab strip is data-driven | FN-18 | Tabs and accounts from one collection L2439, L1021-1031 | `CATEGORIES.indexOf(level1.name)` (`data/costBook.ts:808-809`) | Functional | P | Med | CONFIRMED | D38 §4 (M-4) | fix |
| CG-066 | Updates are PATCH-as-upsert (no `If-Match`); a concurrently deleted row is re-created | NET-14, OPT-20 | `Patch` on a deleted row errors (inferred) | `data/client.ts:380-393`; `updateRecordIfExists` unused here | Data | DU | Med | CONFIRMED (code); canvas inferred | R-12 | PO (cost vs safety) |
| CG-067 | Vendored PCF port is not reproducible (4 hand-added test ids), and the renderer has no DOM test | PCF-08, PCF-21 | n/a | `GridRenderer.js:772, 955, 970, 990-1013`; `scripts/read-pcf-port.mjs`; grid mocked (`Screen.test.tsx:126-131`) | Functional | DU/P | Med | analyst | none (`PCF-RENDERER-PORT.md` wrong) | fix |
| CG-068 | The header logo does nothing on the Cost screens | MOD-01 | `OnLogoClick: Launch(gblPMAppURL)` (Capex L2333-2335) | Only with `onBack` (`AppHeader.tsx:229-242`, `App.tsx:75`); `pmAppUrl` unused | Functional | M | Med | analyst | gap-analysis B14 wrong | PO (destination) → port |
| CG-069 | Payment-date comment needs a Year/Month ("Required"), a string with no canvas source | CMT-12 | No check L10095-10131 | `missingPaymentDate` (`CommentsPanel.tsx:441, 794-796`) | Functional | CO | Med | analyst | none | mark (rule 8) |
| CG-070 | Standard click: duplicate check from cache; refusal path unused | FN-05, FN-19, DV-14, NET-11, POP-15 | Live `LookUp` + `RemoveIf` L7378-7393; refusal and roll-back L18609-18635, L18758-18796 | `alreadyExists: !option` (`Screen.tsx:389-393`); `standardContractRefusal` has no caller (`standardContracts.ts:97-101`) | Functional | DU/M | Low | CONFIRMED | none | port |
| CG-071 | Standard: Cost Type "None" stored as SPV; unknown unit gives the full amount | DV-15, FN-22 | `'Cost Type': assumption.'Cost Paid By'` L18665; `Switch(Unit,…)` no default L18252-18278 | `Screen.tsx:408`; `standardContracts.ts:57-58` | Data | DU | Low | analyst | none | mark |
| CG-072 | Contracts filed on a level-2 account are counted; canvas excludes them | FN-12, PCF-19, DV-21 | Contracts filtered to sub-accounts L1043-1048 | `gridRows.ts:162-181, 192-193`; UT-GRID-003; `costBook.ts:1183-1186` | Data | DU/CO | Low | CONFIRMED | none | mark (data-dependent) |
| CG-073 | Grid payer tag uses the mapping fallback; canvas shows `Text('Cost Type')` | FN-24, PCF-20 | L1220-1234 | `resolvePayer` (`costBook.ts:1091, 1118-1127`) | Data | DU | Low | CONFIRMED | none | mark |
| CG-074 | Freshness: year step, relink paid set, paid decision, standard inputs and comments read from cache | NET-04, NET-08, NET-09, NET-10, CMT-26, VAR-13 | Refresh per year step L2939-3058; live `LookUp`s L7426-7435, L18230-18303, L7459 | Query caches (`useCostBook.ts:499, 561`; `Providers.tsx:21`) | Data | DU | Low | analyst | R-12 | mark |
| CG-075 | OBU not re-stamped on update (canvas re-stamps on every Patch) | PNL-042, CMT-15, DV-20 | Save › 991, 1564; L10203 | `capexWrites.ts:215-222, 233-235`; `data/comments.ts:209-211` | Data | DU/P | Low | analyst | Rule 4 | PO (re-homing intended?) |
| CG-076 | Columns written differently: scheme on Equal, frequency on Individual, cost-row `Name` | PNL-038, PNL-039, DV-16, DV-22 | Save › 1513-1520 (commented), 1788; L18855 | `capexWrites.ts:127-164, 270-279` | Data | DU/M | Low | CONFIRMED (Save › 1513-1520) | none | mark |
| CG-077 | Other-cluster interval inclusive for both modes | PNL-040 | Half-open (Individual) Save › 548-684; inclusive (Equal) › 1430-1461 | `rules.ts:994-1006` | Functional | DU | Low | analyst | none | mark |
| CG-078 | Month range errors gate Save; the code comment says the opposite | PNL-035 | No Save `DisplayMode` reads the month labels L13302-13306 | `Screen.tsx:501-516` | Functional | DU | Low | CONFIRMED | none | mark + fix comment |
| CG-079 | Comment data edge cases: N-4 not reproduced, Type/Year keep `RelatedCost`, blank type, root detection, month options, Type disabled without costs, delete order | CMT-14, CMT-16, CMT-23, CMT-27, CMT-28, CMT-29, CMT-31 | L10178, L9142-9151, L7497-7528, L9307-9382, L9129 | `CommentsPanel.tsx:316, 358-364, 415-424, 482-485`; `comments.ts:90, 193-201, 269` | Data | DU/CO | Low | analyst | N-4 (wrong) | mark |
| CG-080 | ◀ floor not re-derived after the panel opens | FN-17 | L19595-19629 | `Screen.tsx:219, 237-239` | Functional | DU | Low | CONFIRMED (L19596-19620 read) | none | mark |
| CG-081 | Routing and session: back link without `projectId`, no test-project fallback, blank start-cluster seed, env-var default, extra user-menu row, screen parameters | MOD-02, MOD-08, MOD-19, MOD-25, MOD-26, MOD-29, MOD-30 | `App.pa.yaml:205`; Capex L49-55 | `add-costs-from-table/Screen.tsx:161`; `routes.tsx:54-84`; `data/project.ts:72`; `panelRules.ts:176` | Functional | DU/DM/CO | Low | analyst | A-2 | fix (MOD-08) / mark |
| CG-082 | Test-ID hygiene: 19 duplicated UT ids; `panelRules.test.ts` has none | FN-20 | n/a | See §4.2 item 17 | Functional | CO | Low | CONFIRMED (lines corrected) | Rule 13; CA-6 | fix |
| CG-083 | Delete writes each cost row explicitly; canvas relies on the cascade | POP-21, FN-10, DV-09, NET-12 | `RemoveIf('CAPEX Costs')` commented L8122-8126; cascade = `Cascade` in `customizations.xml` | `capexWrites.ts:315-343` (`DIVERGENCE:`) | Data | DM | Low | CONFIRMED | D38 §7 L-7 | keep; fix the stale rationale |
| CG-084 | Equal save always recomputes and reconciles in place (keeps paid flags and comment links) | PNL-044, PNL-045, VAR-07, DV-17, NET-15, NET-16 | Gate Save › 1579-1586; `RemoveIf` + re-create › 1776-1831 | `Screen.tsx:614-628`; `capexWrites.ts:254-291` | Data | DM | Low | CONFIRMED | D38 §6, §8 | keep |
| CG-085 | C-7: Average Payment and Linked Cluster written on a new Equal contract | FN-23, PNL-046, DV-18, NET-17 | Final Patch resolves a blank `LookUp` Save › 1846-1863 | `capexWrites.ts:174-181, 207-238`; marker only in `Screen.tsx:629-640` | Data | DM | Low | analyst | C-7; D38 §8 | move the marker |
| CG-086 | Comment save writes only changed rows; cost-only comments not loaded | CMT-13, CMT-25, DV-19, NET-18 | Patch every row L10158-10207; load `contract ‖ cost` L1062 | `CommentsPanel.tsx:482-501`; `data/comments.ts:41-81` | Data | DM (comment only) | Low | CONFIRMED (L1062) | none | add D-entry |
| CG-087 | Numeric locale rule and fallbacks; double-add guard | TY-12, TY-15, VAR-12 | `fn_Numeric.pa.yaml:L115-189`; L3317, L3405 | `locale.ts:17, 54-97`; `Screen.tsx:205` | Functional | DM/CO | Low | analyst | D17 (a) | keep |

### 3.4 Performance / optimisation

| CG id | Title | Source gap ids | Canvas (cite) | Code app (cite) | Type | Status | Severity | Verdict | D-entry / bug | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| CG-088 | Every `Screen` render repaints the grid; a second `ResizeObserver` triggers a full render | OPT-07, OPT-08 | n/a | `useLayoutEffect(…, [props, rows])` (`PcfGrid.tsx:64-68`); `new ResizeObserver(render)` (`:89`) | Perf | CO | Med | CONFIRMED | R-11 | fix |
| CG-089 | Standard assumptions: whole active table read, filtered client-side, per tab key | FN-21, DV-12, OPT-06 | Non-delegable filter L460-486 | `data/standardContracts.ts:19-38`; `useCostBook.ts:483-495` | Perf | P/CO | Med | CONFIRMED | Rule 2 | fix (server `$filter`) |
| CG-090 | Cost-book waterfall and repeated reads (accounts ×3, payer map uncached, project extras) | OPT-09, OPT-10, OPT-11 | One OnStart load | `costBook.ts:744-822, 1047-1051, 1182-1186, 1271-1272`; `project.ts:233-246` | Perf | CO | Med | analyst | none | fix |
| CG-091 | Writes serial; unchanged months PATCHed on every save | OPT-14, OPT-15 | Equal skipped unless changed Save › 1579-1586 | `writeSet.ts:50-51`; `capexWrites.ts:262-291` | Perf | P | Med | CONFIRMED (`writeSet.ts`) | D38 §6 | fix (diff against stored) |
| CG-092 | A paid toggle refetches the whole category book | OPT-13 | Full reload L7752 → L722-777 | `useCostBook.ts:386-402` | Perf | P | Med | CONFIRMED (`invalidate`) | none | fix (optimistic update) |
| CG-093 | Truncation after 50 pages is only traced; the UI cannot tell | OPT-05 | Silent 2,000-row cap | `data/client.ts:47-82` | Perf/Data | P | Med | CONFIRMED | R-10 | fix (surface it) |
| CG-094 | Broad refetches: comment save refetches the book; focus refetch; Summary totals read every cost row | NET-05, NET-19, NET-20, OPT-12, OPT-18, OPT-19 | L10216; L2469-2508 | `useCostBook.ts:365-373, 606`; `Providers.tsx:20-24`; `costBook.ts:1205-1300` | Perf | CO/P | Low | analyst | none | fix (narrow keys) |
| CG-095 | Payment page size 500; 79 source maps in `dist/`; the year change is client-side (an improvement) | OPT-16, OPT-17, UX-04 | n/a | `costBook.ts:1133-1143`; `vite.config.ts:23` | Perf | P/CO | Low | analyst | R-11 (figure wrong, §8) | fix |

---

## 4. Verification log

### 4.1 The 17 named candidates

| # | Claim | Lines read | Verdict and reasoning |
|---|---|---|---|
| 1 | The paid toggle does not clear `'Linked Cluster'` | Capex L7422-7437, L19864-19883 (`OnConfirm` L19875 decoded); `Screen.tsx:1028-1036`; `capexWrites.ts:46-58`; `costRepository.ts:317-322`; `useCostBook.ts:398-402`; `panelRules.ts:280-282` | **CONFIRMED, High.** The canvas `OnConfirm` runs `Patch('CAPEX Project Contracts', varGetContract, {'Linked Cluster': Blank()})` before selecting the paid button. The code sends one `vsb_costpaid` PATCH and nothing else. The verbatim dialog text promises that the link is removed. The canvas gate does not check direction, so the link is also cleared when un-paying (PO question). |
| 2 | Standard money and pro-rating | Capex L18480-18915; `Screen.tsx:355-421`; `rules.ts:184-225`; `standardContracts.ts:71-128` | **CONFIRMED, High.** The canvas builds `colStandardCostAllSelectedClusters` over every ticked cluster with dates. Earlier clusters are back-computed from the start reference, L18480-18519. It then: (a) computes `avgPay`/`lastPay` over **all** payments (L18810-18817); (b) writes only `colEligibleStandardCostClusters` rows (L18839-18848); (c) re-patches `'Total Cost': Sum(written)` (L18895-18898). The code spreads `amt` over the eligible clusters and stores `totalCost: amt`. For a project whose start cluster is past a ticked cluster, the stored total, every month and the average all differ. |
| 3 | The relink deletes payment-date comments | Capex L20040-20070 (live), L376-427 (dead popup, `Visible: =//…` + `false` L425-427), L11468-11479 (trigger); txt L19896-19925, L11301-11318; `capexWrites.ts:81-98, 242-252`; `rules.ts:955-978`; `costBook.test.ts:1205` | **CONFIRMED, High.** The canvas source versions are compared in §5.2: the `.pa.yaml` is the newer source. The code follows the older `.txt`. |
| 4 | Comment save closes first, with no catch | Capex L10136-10222; `CommentsPanel.tsx:450-527` | **CONFIRMED, High.** In the canvas, the spinner rises over the open panel. The writes sit inside `IfError`; the panel closes and the collections clear only on success (L10208-10210). The error branch notifies and leaves the panel open. The code calls `onDismiss()` before the first write and uses `try/finally` with no `catch`. `void commit()` turns a failure into an unhandled rejection: no message, the edits are gone, and `invalidate` is skipped. |
| 5 | No comment author gate | Capex L9757-9770, L9815-9826, L10020-10034, L8706-8724; `comments.ts:515-530`; `data/comments.ts:76`; `data/currentUser.ts:151, 178` | **CONFIRMED (code). The canvas effect NEEDS LIVE RUN.** The canvas disables Edit/Delete for non-authors and Reset for anyone not the author or resolver. The code has no such gate. Its comment says the data is unavailable, but `_createdby_value` and `systemuserid` are both already read, so the gate is feasible (inferred). Whether the canvas gate really blocks a click on the image beneath the disabled button is open (09 §5.1). |
| 6 | `deleteComment` uses the raw generated delete | `data/comments.ts:218-220`; `capexWrites.ts:250, 336`; `data/client.ts` (`deleteRecord` used at `capexWrites.ts:290, 338, 340`) | **CONFIRMED, High.** `await Vsb_capexcommentsesService.delete(id)` discards the result, which CONVENTIONS rule 14 forbids. Contract and cost deletes were moved to `deleteRecord`, but this one was not. |
| 7 | `% Values` edit shows money | Capex L19136-19260, L19585-19738; `Screen.tsx:327-343, 454-516, 920-939`; `costBook.ts:1097-1107` | **CONFIRMED, High.** The enrich loader (started by the warm-up's `locStartBinding: true`, L19736) converts stored money to percent when the scheme is `% Values`. The code puts `line.payments` (money) into the boxes. `monthAmountErrors` then flags every month above 100, `hasMonthRangeError` disables Save, and `resolvedPayments` would multiply money by total/100. How many live `% Values` contracts exist needs a query. |
| 8 | A `%` contract converts against the old total | Save › 734-950; `rules.ts:121-146, 282-305`; `Screen.tsx:458, 641-650` | **CONFIRMED, High.** The canvas recomputes every `<M>Save` from `JanUI` and the **typed** total when it differs from `locAllYearsCost`. The code's `totalCostForPercent(line.totalCost, 0, costValue)` returns the stored total whenever one exists. The months are therefore converted at the old total, while the new total is written to `vsb_totalcost`. |
| 9 | DevCo/SPV defaults to SPV on Add | Capex L7295-7315, L12230-12295; `rules.ts:110-119`; `Screen.tsx:327-336, 533-536`; `costBook.ts:1089-1127` | **CONFIRMED, High.** On Add, `locSelectedCostRow` is the sub-account, so both `DefaultSelectedItems` and `locInitialCostPaidBy` resolve to the `SPVDevCo Mapping` value. The code hard-codes `"SPV"`, and its `costPaidByChanged` needs a stored line, so the canvas's "Change Cost Paid By" confirmation never appears on Add. |
| 10 | Blue italic missing on 6 or more controls | Grep of every `FontItalic` `IsStandard` pair in Capex (11 hits, listed in CG-001); `Screen.tsx:773-897`; `CanvasFields.tsx:151-200` | **CONFIRMED, High (kept).** Exactly 11 pairs exist, and 5 are reproduced (the cluster labels). `CostSelect` has a `standard` prop; `Choices` has none. It is kept High because rule 20 is a standing product-owner instruction, and a prior doc calls it COVERED. |
| 11 | The "Edited from PCF" banner is missing | Capex L12426-12495; Grep of `src/` for "spreadsheet component" and `iseditedfrompcf` | **CONFIRMED, Med.** The banner is absent. The two columns are read only by `data/addCostSheet.ts`. The fill RGBA(245,145,30,0.5) = akzent4 #f5911e at 50 %, so TH-06's colour is right. |
| 12 | Landing tab conflict | Capex L14-38, L238-301, L778-787; Timer › 1-100; `rules.ts:92-100`; `Screen.tsx:182`; `01-BUGS-FOUND.md` D-7 | **PARTLY.** Both analysts are each half right; §5.1 gives the full path. |
| 13 | The year resets on navigation | Capex L238-257; `Screen.tsx:220-235`; `add-costs-from-table/Screen.tsx:161` (cited) | **CONFIRMED, Med.** `gblSelectedProjectYear` is global and only re-clamped. `pickedYear` is route-component state, re-seeded on every mount. |
| 14 | No dirty-flag Save gate | Capex L17530-17552; Grep of `locEditSaveButtonEnabled` (27 `true` sites; `false` at L33 and L19700 only); `Screen.tsx:513-516, 753` | **CONFIRMED, Med.** Edit opens with Save disabled in the canvas; the code enables Save as soon as the form is valid. The flag is not reset on Add, a canvas inconsistency worth recording in the D-entry. |
| 15 | 7 aria-label mismatches pass the gates | Capex `AccessibleLabel` at L11100, L11151, L11201, L11250, L11299, L11402, L11841; `CanvasFields.tsx:151-170`; `Screen.tsx:839-841, 878-882`; `scripts/check-canvas-identities.mjs:225-270` | **CONFIRMED, Med.** The checkbox `data-testid` is a template, so `composed && local` counts it verified and skips C3 and C4 (L241). `CostSelect` gets its `aria-label` inside the component, so `alLit` is undefined at the call site and C4 cannot fire. |
| 16 | The canvas blanks the standard-assumption link on save | Save › 996-1000, 1569-1573; `capexWrites.ts:183-189` | **CONFIRMED (formula); the effect NEEDS LIVE RUN.** `If(cond, Blank())` has no else arm, so both outcomes are Blank, and `Patch` with Blank clears a lookup. Two effects remain inferred and need a live save: (a) the option is offered again (L472-477); (b) the plugin interaction. |
| 17 | Duplicate or missing UT ids | Scan of `rules.test.ts`, `panelRules.test.ts`, `Screen.test.tsx`, `standardContracts.test.ts` | **CONFIRMED, with corrections.** `rules.test.ts` has 138 `it()`s and 19 duplicated ids. 042-049 appear at L358-401 and again at L409-451. 060 and 061 appear at L654 and L661 and again at L1124 and L1129. 062-070 appear at **L471-525** (not L649-661 as GAP-FN-20 says) and again at L1135-1204. `panelRules.test.ts` has 51 `it()`s and 0 ids. `Screen.test.tsx` has 45 `it()`s and 8 ids. `standardContracts.test.ts` has 24 ids with no duplicates. 04 §5.6 lists only 047 and 048, and 08 §5.8 lists "042, 044, 045, 060…070": both are incomplete. |

### 4.2 Medium and Low gaps sampled (34, across all 14 files)

| Gap | Lines read | Verdict |
|---|---|---|
| GAP-TY-02 | `rules.ts:102-106` | CONFIRMED: en-GB fixed |
| GAP-TY-03 / PNL-020 | Capex L10930-10960 (L10937 decoded); `Screen.tsx:481` | CONFIRMED: no locale passed |
| GAP-TY-04 / PNL-019 | Capex L13342-13389; `rules.ts:442-461` | CONFIRMED (formula); downgraded to Low |
| GAP-TY-01 | `theme/tokens.ts:97-103`; `styles/global.css:1-12`; Grep for `@font-face` (comment only); `styles/fonts.css` absent | CONFIRMED |
| GAP-UI-02 / MOD-09 | Capex L8070-8078; `components/AppShell.tsx:76-92` | CONFIRMED |
| GAP-UI-04 | Capex L11044-11053 | CONFIRMED |
| GAP-TH-05 | Capex L13318-13340; `App.pa.yaml:50` (`Error: "#B22727"`) | CONFIRMED |
| GAP-PNL-024 | Capex L11215 (TAB byte present) | CONFIRMED |
| GAP-UX-02 / PNL-047 | Capex L10249-10264 (cited); `FormPanel.tsx:100-125`; `Screen.tsx:750` | CONFIRMED; severity Med (08's "Code-app-only, Low" rejected: the canvas offers no such path, and edits are lost) |
| GAP-UX-09 | `check-canvas-identities.mjs:200-277` | CONFIRMED |
| GAP-POP-04 / PNL-031 | Capex L19760-19834 | CONFIRMED |
| GAP-POP-10 / PCF-15, POP-09 / FN-07 / PCF-14 | Capex L7738-7760; Grep of `src/` (string absent; "the selected" at `Screen.tsx:441`, `rules.ts:854`) | CONFIRMED |
| GAP-POP-11 / PNL-032 | Grep: string only in `add-costs-from-table/rules.ts:95` | CONFIRMED |
| GAP-POP-05 / FN-09 | Capex L8108; `Screen.tsx:1045-1049` | CONFIRMED |
| GAP-FN-03 | Capex L452-720 (eligibility L690-696); L18289-18297 | CONFIRMED |
| GAP-FN-11 / PCF-18 | Capex L1198-1236, L1400-1416; `gridRows.ts:100-112`; `costBook.ts:1083-1088` | CONFIRMED |
| GAP-FN-12 / PCF-19 | Capex L1036-1056; `gridRows.ts:158-196` | CONFIRMED |
| GAP-FN-14 / PCF-11 | Capex L7236-7246; `PcfGrid.tsx:74-85` | CONFIRMED (formula) |
| GAP-FN-15 / UX-06 / UI-18 | `Screen.tsx:682-708` | CONFIRMED |
| GAP-FN-24 / PCF-20 | Capex L1220-1235; `costBook.ts:1117-1127` | CONFIRMED |
| GAP-FN-18 | `costBook.ts:800-812` | CONFIRMED |
| GAP-PNL-005 | Capex L19674-19684; `rules.ts:111-119` | CONFIRMED |
| GAP-PNL-011 / 012 | Capex L10612-10662, L10752-10782; `Screen.tsx:785-806` | CONFIRMED (canvas rebuilds the rows with blank months) |
| GAP-PNL-014 | `Screen.tsx:934-938`; `writeSet.ts:40-56` | CONFIRMED |
| GAP-PNL-033 | `useCostBook.ts:404-416` | CONFIRMED |
| GAP-CMT-10 | Capex L10136-10222 | CONFIRMED |
| GAP-CMT-11 | `CommentsPanel.tsx:552-560` | CONFIRMED (`isLoading` only) |
| GAP-DV-03 / DV-04 / FN-04 / PNL-036 | Capex L18668-18671, L18886; Save › 992-995, 1565-1568; `capexWrites.ts:115-190, 254-282` | CONFIRMED |
| GAP-DV-13 / PCF-12 | Capex L700-717; `data/standardContracts.ts:19-45`; `DatasetParser.js:532-548` | CONFIRMED |
| GAP-DV-09 / FN-10 | `customizations.xml` in `VSBCloud (3).zip`: `vsb_capexcost_Contract_…` = Cascade, `vsb_capexcomments_CapexContract_…` = Cascade, `…CapexCost_…` and `…ParentComment_…` = RemoveLink | CONFIRMED; the `capexWrites.ts:322-327` rationale is stale |
| GAP-NET-14 | `data/client.ts:380-420` | CONFIRMED |
| GAP-OPT-07 / OPT-08 | `PcfGrid.tsx:55-93` | CONFIRMED |
| GAP-VAR-06 / PNL-009 | Capex L19594-19629; `Screen.tsx:902` | CONFIRMED |
| GAP-UX-17 | Capex L14-38, L282-300, L19749-19759; Timer › 1-19 | **PARTLY.** `OnVisible` raises `locIsVisibleLoadingCostSpinner` (L17), but both arms of L282-300 lower it again. A project with no cluster durations therefore does **not** keep a spinner up forever. Instead, `tmr_Capex_Initial_Load` never passes its guard, so the cold path never builds the Summary or the grid, and the screen sits empty. Still Low and still code-only. |

### 4.3 Other multi-file gaps checked

These were checked while reading the files above:

- CG-012 (`CPC.Name`);
- CG-064 (`project.ts:170`);
- CG-082 (test ids);
- CG-083 (cascade);
- CG-084 (Save › 1579-1586);
- CG-086 (L1062).

Each matches its analysts' description.

### 4.4 Claims refuted or downgraded

| Claim | Where | Outcome |
|---|---|---|
| "The live OnVisible skips Summary on purpose, so the screen opens on the first real category" | GAP-UI-01, 02 §5.1 | **Partly refuted.** True only on the warm path. On a cold launch, `tmr_Capex_Initial_Load` sets Summary (Timer › 21-32), which matches the code and the landing screenshot (§5.1) |
| "A project with no milestone dates keeps the spinner up forever" | GAP-UX-17 | **Partly refuted** (see §4.2). The screen stays empty, but no spinner is shown |
| "UT-CAPEXR-060…070 are duplicated at L649-661 and L1124-1204" | GAP-FN-20 | **Line numbers wrong.** The first copies of 062-070 are at L471-525 (§4.1 #17) |
| "Only 047 and 048 are duplicated" / "042, 044, 045, 060…070" | 04 §5.6; 08 §5.8 | **Incomplete.** 19 ids are duplicated: 042-049 and 060-070 |
| D39 §3: "the body's 'milestone' wording is the canvas's own stale text" | `02-OPEN-DECISIONS.md:2312-2318` | **Refuted (inferred).** The older txt has the body "Setting the **cluster**-linked cost to ‘Paid’ will remove the **cluster** link…" (txt L19838). 1.21.709 changed it to "milestone" (Capex L19869) and kept the title "Cluster-linked Costs" (L19879). The body is the edited, newer half; the title is the stale one |
| TH-04 Med | 03 | **Downgraded to Low.** It is a missing alias layer, a code-structure issue with no visible effect of its own beyond GAP-TH-05 |
| TY-04 Med, TY-05 Med | 04 | **Downgraded to Low.** Both are display formatting. TY-05 is a read-only field. TY-04's ungrouped rendering is inferred |
| DV-07 Med | 11 | **Upgraded to High** (as PNL-030 and POP-03). It is an irreversible deletion of user data that the live canvas keeps |
| PNL-034 Low | 08 | **Raised to Med** (as UX-01 and VAR-03). Saving an unchanged Edit rewrites the schedule (D38 §6) |
| PNL-047 "Code-app-only" | 08 | **Re-classified as Divergent-unmarked, Med.** It loses typed months with no prompt |

---

## 5. Conflicts between analyst files, and how they were resolved

### 5.1 The landing tab (GAP-UI-01 vs GAP-FN-16, also MOD-05, VAR-11)

From the YAML, the paths run as follows:

1. **Every entry** runs `OnVisible`.
   - It sets `locCapexInitialLoadPending: true` and the spinner on (L15-38).
   - It then sets `locSelectedCapexAccountCategory` to the **previous category if it has an account
     id**, else the first real category by `vsb_order`, excluding "Overleveraging" (L259-280).
2. **Warm entry.** The `App.OnStart` collections are ready, so the guard at L283 is true. The tab
   list is reset to that category and the grid is built (L284-293). The screen therefore lands on
   the **previous real category**, or the **first real category** when the previous one was Summary
   (Summary has a blank `'CAPEX Account List'`).
   - This is the normal case when returning from Contracts, OPEX, Land Lease or Add Costs from Table.
3. **Cold entry.** The data is not ready yet, typically on app launch, because `StartScreen` is the
   CAPEX screen.
   - The else arm (L294-299) leaves `locCapexInitialLoadPending: true`, so `tmr_Capex_Initial_Load`
     starts (`Start: =locCapexInitialLoadPending`, L784) and repeats every 500 ms.
   - Once the categories, accounts, sub-accounts **and `gblClusterDurations`** exist (Timer › 2-9),
     it sets the category to **"DEVEX/CAPEX Summary"**, resets the tab and builds the Summary
     (Timer › 21-91).
4. **The code** always lands on Summary unless `?category=` is present (`rules.ts:96`). It therefore
   matches the cold path and differs on the warm path.

`01-BUGS-FOUND.md` D-7 already describes this correctly. The `SOURCE DEFECT:` marker that D38 §8
proposed is still absent. Hence CG-033 is Medium and "mark or PO".

### 5.2 Which canvas version the relink reset follows (item 3)

- **`.pa.yaml` (1.21.709)** has the following:
  - the live relink `OnConfirm` resets Paid only, and its `RemoveIf('Capex Comments', …)` is inside
    `/* */` (L20061-20065);
  - the trigger `locMilestoneRelinkResetNeeded` keeps a one-armed `Or(<paid count>)` (L11471-11478);
  - the only live comment delete is in `cmp_PopUp_Confirmation_1`, whose `Visible` is
    `=//locShowClusterLinkageConfirmation` + `false` (L425-427), a dead popup.
- **`CapexScreenCode.txt`** has both the comment clause in the trigger (txt L11311-11316) and a live
  `RemoveIf` (txt L19917-19920).
- **Which is newer.** The line-by-line comparison (245 lines only in the YAML, 32 only in the txt)
  points to the **YAML being the newer edit**:
  - The YAML adds explicit flag resets (`locMilestoneRelinkResetNeeded:false`, …).
  - It adds the layout fixes "Fallback padding … to prevent bottom cut-offs" and "Explicitly set
    height to 0 when no replies exist".
  - It drops `Value()` wrappers on `recCostYear`/`recCostMonth`.
  - It renames the PCF from `dev_DEV.Controls.DevexCapexSummaryPCF` to `vsb_Dev.DevexCapexSummaryPCF`.
  - It changes the paid dialog body from "cluster-linked … cluster link" to "milestone-linked …
    milestone link".
  - The one-armed `Or` is the trace of a deliberately removed clause.
  - Both files carry the Bug 13772 note, so they are close in time.
- **The code** (`capexWrites.ts:84-92`, `rules.ts:960-965`, UT-BOOK-058) follows the txt.

**Resolution.** Treat 1.21.709 as ground truth (CONVENTIONS rule 16 names it) and port it. The
product owner should still confirm against 1.21.753, which is not on disk.

### 5.3 Other conflicts

| Topic | Files | Resolution |
|---|---|---|
| Severity of the relink deletion | 08/06 High; 11/12 Med | High: user data is deleted that the live canvas keeps |
| Escape/backdrop close | 05 Med Divergent-unmarked; 08 Low Code-app-only | Med, Divergent-unmarked (§4.4) |
| Dirty gate severity | 05/10 Med; 08 Low | Med |
| Blue italic severity | 03 High; 08 Med | High (rule 20 is a standing PO instruction) |
| Payer default severity | 10 High; 08 Med | High: a silent wrong `vsb_costtype` feeds liquidity planning and BoP |
| Radio group `aria-label` | 05 (rule 16 says caption) vs the 09-tosca "Reversed" practice (canvas name) | Not resolvable by analysis; PO / Tosca owner (CG-037) |
| Collapsed rail width | 01, 02 (32 per formula) vs `tokens.ts:60-61` (~125 px from screenshots) | Formula is 32, but `LayoutMinWidth: =200` may override it; NEEDS LIVE RUN |
| Line count | The brief stated the YAML as 20,082 lines; 10 §6.1 reports 20,178 | **20,178 is the true count** (`ReadAllLines`). PowerShell's `Measure-Object -Line` reports 20,082 because it skips blank lines, which is the likely origin of the brief's figure |

---

## 6. Decisions needed from the product owner

1. **Paid on a milestone-linked contract (CG-046).** Should confirming Paid clear the contract's
   `'Linked Cluster'`, as the canvas does and the dialog says?
   - (a) Yes, on Paid and on Unpaid, as the canvas does.
   - (b) Yes, on Paid only.
   - (c) No; then reword the dialog and mark a DIVERGENCE.
2. **Relink and comments (CG-045).** Is the 1.21.709 behaviour (reset Paid only, keep payment-date
   comments) the intended one?
   - (a) Yes: remove the comment delete and the comment clause from the trigger.
   - (b) No: keep deleting, as the older version did, and record a D-entry.
3. **Standard-contract money (CG-047).** For an acquired project, should a standard contract store:
   - (a) the canvas's pro-rated share (built over all ticked clusters, keeping the eligible part); or
   - (b) the full assumption amount over the eligible clusters (current code, then a `…CanvasParity`
     twin)?
4. **Standard eligibility (CG-056).** May a project at cluster 6 (COD) be offered cluster-5
   assumptions?
   - (a) No, as the canvas option list does.
   - (b) Yes, as the code floors at 5.
5. **Standard link on edit (CG-055).** When a standard contract is edited and saved:
   - (a) Should `Capex Standard Assumption Contract` be cleared, as the canvas does, so the option
     becomes available again?
   - (b) Or should the link be kept?
6. **Unchanged Save (CG-024).** Should Save stay disabled until a field changes, as the canvas does?
   - (a) Port the dirty flag.
   - (b) Keep "valid is enough" and mark it, given D38 §6's always-recompute.
7. **Landing tab (CG-033).** On returning to CAPEX from another screen, should the tab be:
   - (a) the previous or first real category (canvas warm path);
   - (b) always Summary (current code, the cold path); or
   - (c) carried in the URL?
8. **State across screens (CG-032).** Should the selected year, the toggles and the payer filter
   survive a round trip?
   - (a) Yes, as the canvas does.
   - (b) No, reset them (current code, matching `019-capex-costs.md` §8).
9. **Escape and backdrop (CG-025).**
   - (a) Remove these close paths.
   - (b) Keep them, but prompt when there are unsaved edits.
   - (c) Keep them as they are and mark the divergence.
10. **Comment rights (CG-053).**
    - (a) Port the client-side author gate.
    - (b) Also enforce it with a Dataverse role.
    - (c) Leave it open and mark it.
11. **Notifications (CG-029).**
    - (a) Port the toasts with the canvas 500 ms timeout.
    - (b) Use toasts with a readable timeout.
    - (c) Keep the persistent banners.
12. **Inactive records (CG-064).** Should CAPEX show inactive projects, contracts, costs and
    comments, as the canvas does?
    - (a) Yes.
    - (b) No, and record it alongside D45 G2.
13. **Header logo (CG-068).** Should it:
    - (a) open the external PM app (`gblPMAppURL`, canvas);
    - (b) go to `/projects` in this app; or
    - (c) do nothing?
14. **Panel year range (CG-063).** Should the panel list years from cost start to cost end + 3, as the
    canvas does, or follow the grid window?
15. **Distribution changes (CG-057).** Should switching Distribution, Scheme or Equal Distribution
    clear the typed months, as the canvas does?
16. **Verbatim oddities (CG-007, CG-020).** Should the code reproduce these, or correct them with a
    recorded original?
    - the ungrouped `500000000.`;
    - the leading TAB in "Cluster 3".
17. **Payment-date "Required" (CG-069).** Keep this code-only validation as a recorded divergence?
18. **Footer version on CAPEX (CG-010).** Blank, as the canvas does, or show the version?
19. **Tosca labels (CG-030, CG-036, CG-037).** Do existing Tosca modules key on the canvas
    `AriaLabel`s for these controls? If they do, the code's labels must change, despite rule 16's
    "never change an existing value".
20. **Fonts (CG-006).** Will the client supply Open Sans font files?

---

## 7. Recommended fix order

Markers:

- **[DIV]** — needs a `DIVERGENCE:` or `SOURCE DEFECT:` comment and a D-entry in
  `02-OPEN-DECISIONS.md` (CONVENTIONS rules 7–8).
- **[TWIN]** — also needs a `…CanvasParity` twin under test.
- **[PO]** — waits on a §6 decision.

**(a) Data-integrity and data-loss defects**

1. CG-051: route `deleteComment` through `deleteRecord`. No PO decision needed; do this first.
2. CG-045: drop the payment-date comment delete and the comment clause from the relink path. Update
   UT-BOOK-058 and UT-CAPEXR-104, and fix the `capexWrites.ts` and `rules.ts` doc comments. [PO #2]
3. CG-050: comment Save keeps the panel open until success, catches errors, shows "An error occurred
   while saving. Please try again.", and invalidates on settle.
4. CG-046: clear `'Linked Cluster'` on the paid confirmation. [PO #1]
5. CG-049, then CG-048: convert `%` months against the typed total, and back to `%` on open. Add the
   first direct test of `resolvedPayments`.
6. CG-052: default the payer from the `SPVDevCo Mapping` on Add, and compare against it for the
   confirmation.
7. CG-047: standard-contract money. [PO #3] [DIV] [TWIN] if the code keeps the full amount.
8. CG-058, CG-059, CG-061: blank month = delete; no pre-filled dates; Individual Absolute total
   from the months.
9. CG-062: invalidate `onSettled`, and report how many writes a partial save applied.
10. CG-054, then CG-055: write `Initial Contract Source` and the cost-row assumption link; decide the
    blanking. CG-055 needs [PO #5], and [DIV] if it is not reproduced.
11. CG-053: author gate. [PO #10]
12. CG-066: `updateRecordIfExists` on `setCostPaid` and the contract update. [PO]

**(b) Functional parity**

13. CG-057 [PO #15], CG-060, CG-056 [PO #4] [DIV], CG-063 [PO #14] [DIV], CG-065, CG-070.
14. CG-064 [PO #12] [DIV]; CG-068 [PO #13].
15. Marked items that only need their marker moved or their D-entry written:
    - CG-085: move the C-7 marker to `capexWrites.ts`;
    - CG-086: add a D-entry;
    - CG-069 [DIV];
    - CG-078: fix the comment, then [DIV];
    - CG-083: correct the cascade rationale.
16. Low data items, each with [DIV] where kept: CG-071, CG-072, CG-073, CG-074, CG-075, CG-076,
    CG-077, CG-079, CG-080, CG-081.
17. CG-067 and CG-082: make the PCF port script apply the test ids; add a renderer DOM test; renumber
    the duplicate UT ids **once**, recorded so the trace survives.

**(c) UX and accessibility**

18. CG-026 (error badge), CG-027 (load-error states, rule 19), CG-028 (canvas error strings, reuse
    `add-costs-from-table/rules.ts:95`), CG-029 (`useNotify`) [PO #11].
19. CG-024 [PO #6] [DIV], CG-025 [PO #9], CG-032 [PO #8] [DIV], CG-033 [PO #7], with the
    `SOURCE DEFECT:` marker that D38 §8 proposes.
20. CG-030 and CG-031 [PO #19]. Harden `check-canvas-identities.mjs` so composed ids and `CostSelect`
    labels are compared.
21. CG-034, CG-035, CG-036, CG-037, CG-038, CG-039, CG-040, CG-041, CG-042, CG-043; CG-044 (record as
    [DIV]).

**(d) UI polish**

22. CG-001: add `standard` to `Choices` in `components/` (rule 17) and wire all 11 controls. Do this
    one first within (d): it is a PO rule.
23. CG-002 (after CG-054), CG-003, CG-004 [PO], CG-005, CG-006 [PO #20].
24. CG-007 [PO #16] [DIV], CG-008, CG-009 (after a live check), CG-010 [PO #18], CG-011 [DIV], CG-012,
    CG-013 [DIV].
25. CG-014 to CG-023.

**(e) Performance**

26. CG-088 (memoise, drop the second `ResizeObserver` render), CG-089 (server `$filter`), CG-091 (diff
    against stored months), CG-092 (optimistic paid toggle).
27. CG-090, CG-093, CG-094, CG-095.

---

## 8. Errata for prior docs

These are recommendations only; none of these files was edited. "Source" is what I or the cited
analyst read.

| File | Its claim | The truth | Citation |
|---|---|---|---|
| `app-docs/gap-analysis/cost-capex-costs.md` S12 (L148) | The paid dialog "clears the link for the whole contract", COVERED | The code never clears `'Linked Cluster'` | Capex L19875; `Screen.tsx:1033-1035`; `capexWrites.ts:53-58` |
| same, B11 (L127) | The relink resets paid rows "and payment-date comments", COVERED | The live canvas resets paid rows only | Capex L20061-20065 |
| same, U13 | Standard styling COVERED | 5 of 11 controls | CG-001 |
| same, U15 (L173) | The footer is COVERED and empty in the code | The code prints the version | Capex L8076; `AppShell.tsx:86-88` |
| same, B14 (L130) | The logo launches PM, COVERED | No action on the Cost screens | `AppHeader.tsx:229-242`; `App.tsx:75` |
| same, B1 (L117) | `OnVisible` picks the first non-Overleveraging category, COVERED | The previous category is kept first. The code opens on Summary. B1 contradicts B2 and D-7 | Capex L259-280; `rules.ts:96` |
| same, S8 (L144) | Month messages COVERED; Save is not gated on them | The number grouping differs, and the code **does** gate Save | Capex L13364-13368; `Screen.tsx:515-516` |
| same, D10 / B12 | Standard options and creation COVERED | Eligibility and money differ | CG-047, CG-056 |
| same, D11 (L104) | The individual save writes Initial Contract Source and the assumption link | It writes neither | `capexWrites.ts:115-190` |
| same, D13 | The paid no-row case is COVERED | The wording ("the selected") and the surface differ; the link Patch is missing | Capex L7741; `rules.ts:854` |
| same, D15 / H-2 (L108) | CAPEX deletes bypass `deleteRecord` | Fixed for costs and the contract; only `deleteComment` is raw | `capexWrites.ts:290, 338, 340`; `data/comments.ts:218-220` |
| same, D17 / H-1 (L110) | `FREQUENCY_OPTIONS = [1,3,6,12]` | Derived: 1/2/3/6/12 | `rules.ts:60`; UT-CAPEXR-114 |
| same, U9 | The delete dialog says "Delete Cost" / "Delete" | It uses the verbatim canvas strings | `panelRules.ts:454-497` |
| same, U3 | `check:canvas` 0 findings means rule 16 is satisfied | 7 mismatches are invisible to the gate | CG-030 |
| same, S16 | Spinners COVERED | The delete and paid texts are wrong | CG-034 |
| same, D6 / B13 | Comments are loaded for contracts and costs; the panel is COVERED | The cost clause is dropped; 3 High gaps | `data/comments.ts:41-81`; CG-050, CG-051, CG-053 |
| same, §0 / S14 | The hidden command bar's `ItemEnabled` gates the PCF menu | Its container is `Visible: =false` | Capex L3080 |
| same, B3 | Reload also covers the Summary | It does not rebuild `colDevexCapexSummaryView` | Capex L725-774 |
| same, D1 (L94) | `gblAppResx` is a requirement | Nothing on the screen reads it | 10 §6.2 |
| same, D18 | 7 tables | Plus 4 more: SPV mapping, milestone assumptions, generator types, `aadusers` | 11 §2.0 |
| same, L72 | `btn_SaveCost_Execute____` is invoked by `Select()` | Nothing selects it; it is dead | Capex L20070 selects the visible Save |
| same, §5.4 | Opening the panel shows a spinner | It does not | Capex L7295-7359 |
| same, L76 | `Screen.tsx:629-695` | Now `:682-748` | — |
| `app-docs/01-BUGS-FOUND.md` N-4 | The renumbered `Name` rewrite is "reproduced" | `commit` skips unchanged rows, so it is not reproduced | `CommentsPanel.tsx:482-485` |
| same, N-5 | Resolve affects every thread; a deliberate divergence | 1.21.709 resolves the root and its replies only, which is parity | Capex L9853, L10005 |
| same, S-4 | The PCF replacements do not exist | The renderer is vendored and hosted | `PcfGrid.tsx`; `PCF-RENDERER-PORT.md` |
| `app-docs/02-OPEN-DECISIONS.md` D38 §2 H-2 | `capexWrites.ts` calls the generated `delete()` | Costs and contract now use `deleteRecord`; comments do not | as above |
| same, D38 §6 | Extra PATCHes only on the Equal save | Both modes (`writeSet.ts:50-51`); parity holds for Individual | Save › 1119-1156 |
| same, D38 §8 | The C-7 marker should move to `capexWrites.ts` | Still only in `Screen.tsx:629-640` | — |
| same, D39 §3 (L2312-2318) | The "milestone" body text is the stale half | The older txt said "cluster"; 1.21.709 changed the body. The **title** is the stale half (inferred) | txt L19838, L19848; Capex L19869, L19879 |
| same, L717 | "DEVEX `locEditSaveButtonEnabled` was never reset … now opens clean" | That is the Admin Cost screen; CAPEX models no dirty flag | CG-024 |
| same, L323 (rule-16 table row g) | CAPEX Save/Cancel names inferred from position | The comments panel uses real canvas names; say which panel is meant | Capex L10092, L10224 |
| same, D36 (L1963-1970) | The hard-coded colours, per file | Omits `canvas.css`, `CommentsPanel.tsx`, `ConfirmDialog.tsx` | 03 §3.5 |
| same, D49 §1 | "The canvas draws in Open Sans" | Classic controls only; modern controls and the PCF use the theme face | 04 §2.2 |
| `app-docs/PCF-RENDERER-PORT.md` | The script "prints the reproducible port" | 4 hand-added test ids are not produced | `GridRenderer.js:772, 955, 970, 990-1013` |
| `instructions/PROJECT-MAP.md` | `VSBCloud (3).zip` and `PCF Git Repo Clones/` are "not in this workspace" | **Both are present** in `ProjectDocs/Existing Solution/` (verified 27 Oct) | `Get-ChildItem` |
| `migration-plans/04-flow-inventory.md` L49-51 | The zip lives only in the WorkDev1 sibling | It is present (as above) | — |
| same, L80 | `LoadDevexCapexCostTotalCapacityTrigger` owners include "Capex Costs" | It fires on `vsb_project` capacity columns, which this screen never writes | same file L29 |
| `migration-plans/09-tosca-automation-conventions.md` :132, :152, :156, :170 | `src/features/capex-costs/…` | `src/features/cost/capex-costs/…` | — |
| same, :21 | Menus "Static `aria-label` … No change" | The PCF DOM menus have none (D16 a) | CG-031 |
| same, "Reversed" | Canvas name on `aria-label` | Conflicts with CONVENTIONS rule 16 (caption where none is set) | CG-037 |
| `instructions/KNOWN-RISKS-AND-DECISIONS.md` R-11 | Fluent chunk "~570 kB gzipped" | About 764 kB raw / about 200 kB gzip (26 Oct build, 13's measurement) | 13 §7 |
| `migration-plans/03-pcf-inventory.md` :36/:47, :7-8/:411, :115-117, :18-19, :328 | Namespace `DEV.Controls`; native DataGrid rewrite; second paid block dead; byte-identical manifests; formatter quote | `vsb_Dev…` (Capex L7236); vendored; live but redundant; same shape, not bytes; adds `minimumFractionDigits` | 14 §6; 04 §6.4 |
| `migration-plans/screens/019-capex-costs.md` :16/:39, :47, §8, :84, :96, :112 | Route `/costs/:projectId/capex`; command band; reset state on route; row version; native rebuild; focus return | `/costs/capex?projectId=`; no command band; canvas keeps state; no `If-Match`; vendored PCF; none | 01, 02, 05, 10, 12 §6 |
| `migration-plans/02-global-state-and-data.md:241-247` | `colCapexProjectContracts` is project-scoped only | Reload narrows it to active sub-accounts | Capex L729-736 |
| `app-docs/05-SCREEN-TRACKER.md:33-34, 44-47, 56-73` | Add Cost from Table and Comments are stubs; there is a `demoCostRepository` | Both are built; no `src/demo/` | 01 §6.8-9 |
| `app-docs/guide3-ui-notes-cost-app.md:76` | Green accent on the selected rail item | Blue marker; the green bar is the approval rectangle (screenshot reading) | 03 §6.5 |
| `app-docs/11-CAPEX-PARITY-CHANGE-RECORD-2026-10-23.md:340` | Comments panel "not re-examined" | The gaps in §3 were not reviewed then | 09 §6.14 |
| `instructions/CONVENTIONS.md` rule 12 | `costScreen` travels for Edit Costs | Edit Costs uses `appTabUrl`, which sets none | `project-main/Screen.tsx:462-485` |
| Code: `data/capexWrites.ts:81-98` | The canvas relink runs `RemoveIf('Capex Comments')` | Commented out in 1.21.709 | Capex L20061-20065 |
| Code: `data/capexWrites.ts:315-328` | The cascade "no test or type here can pin" | `customizations.xml`: Cascade on both | verified in the zip |
| Code: `features/cost/capex-costs/rules.ts:955-966` | The trigger includes a comment count | One-armed `Or`, paid only | Capex L11468-11479 |
| Code: `gridRows.ts:105-106`; `:192-193`; `gridRows.test.ts:117-118` | `Coalesce(Description, Name)`; level-2 money is "what the canvas shows" | `CPC.Name`; the canvas excludes level-2 contracts | Capex L1205, L1043-1048 |
| Code: `data/costBook.ts:1089-1091` | The grid's canvas rule is `Coalesce('Cost Type', mapping)` | That is the panel rule; the grid uses `Text('Cost Type')` | Capex L1220-1234 |
| Code: `data/comments.ts:147-149`; `comments.ts:206-207`; `comments.ts:520-528` | The canvas writes no OBU; date format `[$-en-US]`; author gate infeasible | OBU on every Patch; `"dd.mm.yyyy"`; the data is already loaded | Capex L10203, L8627; `data/comments.ts:76`; `currentUser.ts:151` |
| Code: `CommentsPanel.tsx:452-458` + UT-CMT-058; `:405-414`; `:353-356` | "Panel closes and spinner shown"; type change blanks the date; replies first avoids a 400 | The comments screenshot shows the panel open; `RelatedCost` is kept; RemoveLink, so either order works | Capex L10138-10208, L9142-9151; `customizations.xml` |
| Code: `Screen.tsx:247`; `:501-512`; `:990`, `:1019` | One year only; Save not gated on month errors; line refs | Not a canvas rule; it is gated (`:515-516`); the refs are txt lines | Capex L12706 |
| Code: `panelRules.ts:209`; `:242`; `:362-364`; `:483-486` | `LOADING_COST` source; `LOADING_DATA` meaning; validity in place of the dirty flag; delete gate cites the hidden command bar | Add Cost from Table text (L2574); loader fallback (L18211-18215); unmarked; PCF row menu | 05, 06, 07 §6 |
| Code: `features/cost/capex-costs/standardContracts.ts:9-12, 133-138`; `useCostBook.ts:483-487` | A custom API is the canvas equivalent; the click re-checks; the query is "scoped" | The canvas never calls one; same in-memory list; full-table read | `Screen.tsx:389-393`; `data/standardContracts.ts:23-38` |
| Code: `theme/tokens.ts:60-61`, `:98-101`; `theme/fluent.ts:6-8` | ~125 px collapsed; `fonts.css` exists; four invented slots | Formula is 32; no `fonts.css` (verified); three slots plus 50, 130, 150 | `App.pa.yaml:205`; 03 §6.3 |
| Code: `components/headerRules.ts:7-12`; `AppHeader.tsx:15, :334`; `ConfirmDialog.tsx:3-4` | Hotfix branch on `ico_cmp_Header_Info`; `…_CommandBar_1`; 7 instances | That is `_Info_4`; the PM name; 2 + 2 on CAPEX | 01 §6, 06 §6 |
| Code: `routes.tsx:4-6, :27, :39`; `LeftNav.tsx:5-6`; `project-main/Screen.tsx:19`; `vite.config.ts:27`; `rules.ts:394-396`; `GridRenderer.js:131, :1425`; `pcfCascade.test.ts:5` | Various | Stale: see 01 §6, 04 §6.5, 13 §7, 14 §6.5 and §6.9 | — |
| PCF clone docs: `CANVAS_APP_GUIDE.md:106, 285`; `README.md:304, 402`; `Comments_PCF_CodeSnippets.txt:6-14` | `CommentTriggered` unhandled; table and column names | Handled at Capex L7457-7650; live names differ | 09 §6.10-11 |
| `CapexScreenCode.txt` as a citation source (code-wide) | Line numbers cited as canvas truth | An older, flattened copy; it differs from 1.21.709 (§5.2) | — |

---

*Caveat: none of this was run against a live canvas app or VSBCloud_Dev. Items marked NEEDS LIVE
RUN or (inferred) must be checked there before a fix is called done (MIGRATION-STRATEGY step 9).*
