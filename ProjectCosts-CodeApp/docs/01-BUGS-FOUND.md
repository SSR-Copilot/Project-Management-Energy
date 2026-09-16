# Bugs and defects found — Project Costs

**Nothing here has been changed.** Each item says what it is, how I verified it, and what
happens if we carry it forward unchanged. Decide per item: *fix in the rebuild* / *keep
bug-for-bug* / *fix in the canvas app first*.

Severity: **A** = data loss or wrong money · **B** = user-visible wrong behaviour ·
**C** = correctness/maintenance · **D** = cosmetic or dead code.

---

## Part 1 — In the canvas Project Costs app

### A-1 · "Add Cost from Table" deletes contracts that have historical costs

`Src/Add Costs from Table.pa.yaml` → `tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd`

The save path computes the contracts that must be protected:

```
locContractsWithPastCosts: Distinct(
    Filter('CAPEX Costs', Year < locCurrentYear, Not(IsBlank(Cost)),
           Contract.'CAPEX Project Contract' in locrows),
    Contract.'CAPEX Project Contract')
```

…and then never uses it, because the guard that consumed it is commented out:

```
ClearCollect(ColContractstoDelete,
    Filter(colCapexProjectContracts, 'CAPEX Project Contract' in locrows
    /*, IsBlank(LookUp(locContractsWithPastCosts, Value = 'CAPEX Project Contract')) */ ));
RemoveIf('CAPEX Project Contracts', 'CAPEX Project Contract' in ColContractstoDelete.'CAPEX Project Contract')
```

Any contract whose description a user clears in the spreadsheet is deleted outright, including
one with booked costs in prior years. `vsb_capexcosts` rows cascade or orphan with it.
The dead variable proves the guard was intended.

**Also in the same statement:** `in` is not delegable to Dataverse, and the app's
`DefaultConnectedDataSourceMaxGetRowsCount` is **2000**. On a project with more than 2000
`CAPEX Costs` rows (40 contracts × 15 years × 12 months = 7,200) the protection query would
have been evaluated against a truncated set anyway.

---

### A-2 · The app has a hard-coded test-project fallback in production

`App.OnStart` and `Capex Costs Screen.OnVisible`, both:

```
If(Not(IsBlank(Param("projectId"))),
   Set(gblSelectedProject, LookUp(Projects, Project = GUID(Param("projectId")))),
   Set(gblSelectedProject, LookUp(Projects, Project = GUID("33b9cc79-5b4f-f111-bec6-000d3a3855c2"))))
```

Open the Cost app without `projectId` — a bookmark, a refresh that drops the query string, a
user pasting the play URL — and it silently opens **one specific project** and lets you edit
its costs. There is no "no project selected" state. The second copy in `OnVisible` means even a
correct start can be re-pointed at the test project.

The skeleton already refuses to port this (`capex-costs/Screen.tsx` header, test UT-CAPEX-058).
Confirm the GUID is a throwaway test project and not a real one.

---

### B-1 · "Report a problem" reports nothing

`Src/Components/cmp_ReportErrorRightPanel.pa.yaml:400`

The Save button's `OnChange` is:

```
=/*
If(IsError(ReportDevOpsBug.Run(title, description, "1632")), Notify("Error: …"), Notify("… successfully reported"))
*/
Set(gblReportError, Blank());
Set(gblShowReportProblemPanel, false);
```

The flow call **and both notifications** are commented out. The panel closes, the user believes
a bug was filed, and nothing reaches DevOps. Used from all five Cost screens
(`cmp_ReportErrorRightPanel` is instanced 5×).

---

### B-2 · `fn_Percentage.IsPercentage` is `=true`

`Src/Components/fn_Percentage.pa.yaml`

```
IsPercentage: =true
```

The whole component. Every percentage input that calls it validates, including `"abc"` and
`""`. Two call sites in the Cost app.

> **Correction to the manager's spec, defect #8.** It also claims `fn_Numeric`'s regexes are
> unanchored so `"12.34abc"` validates. That part is **not** right: `IsMatch` defaults to
> `MatchOptions.Complete`, which anchors both ends, so the missing `$` is redundant, not a
> hole. `IsPercentage: =true` is real. There *is* a separate real inconsistency in `fn_Numeric`:
> `IsTwoDecimal` accepts a leading `-` (`^((\+|-?)?…`) while `IsOneDecimal` and
> `IsThreeDecimal` accept only `+` (`^((\+?)?…`) — so a negative number passes two-decimal
> validation and fails one- and three-decimal validation. Probably unintended; needs a
> business answer on whether negative costs are legal at all.

---

### B-3 · The app ships with one Power Fx formula that does not compile

`Properties.json` → `"ParserErrorCount": 1` (and `BindingErrorCount: 0`).

The export records exactly one formula that fails to parse. A published app can carry this; the
affected property simply does nothing when it runs. I could not pin it down from the YAML with
certainty — **please open the app in Studio and read App Checker → Formula errors**, it is a
two-minute check and it tells us whether a code path we are about to port is dead today.

The suspicious construct I did find, in the same `OnTimerEnd` as A-1, is a stray argument
separator after a statement chain:

```
Set(gblTimerAfterNavigation8, Text(Now(), "hh:mm:ss"));
,
UpdateContext({ locVisibleSubAccountsError: true, … });
```

Power Fx does tolerate a trailing `;`, so this may parse — which is exactly why the Studio
check matters rather than my guess.

---

### C-1 · Off-by-one in the year range that feeds the Capex summary grid

`Add Costs from Table` → `colReference`:

```
Sequence(Max(Year(gblSelectedProject.'End Date') - Year(gblSelectedProject.'Project Start Date'), 15),
         Year(gblSelectedProject.'Project Start Date'))
```

`Sequence(n, start)` yields `start … start+n-1`. A 2026–2041 project has a difference of 15, so
it produces **2026–2040 and drops 2041**. Projects shorter than ~15 years are saved by the `15`
floor; longer ones lose their final year from `colReference` → `colCapexContractCostGrouped_V1`
→ `colFinatCostDataOptimized`, the collection the summary grid binds to.

The Capex screen gets the same calculation right 20 000 lines away
(`Capex Costs Screen.pa.yaml:210`): `Sequence(Max(max - min + 1, 1), min, 1)`. The `+ 1` is the
difference.

---

### C-2 · Validation error messages can name the wrong account

Same `OnTimerEnd`. The duplicate-contract check builds its message with:

```
locRow: LookUp(colValidationPCFOutRow, Description = Current.Description)
```

Description alone. Two different sub-accounts holding a contract with the same description
return whichever row `LookUp` reaches first, so the error text can cite the wrong
`Name`/`Number`. The neighbouring `locMissingValues` check does it correctly
(`Description = … && Name = … && Number = …`).

---

### C-3 · A validation column is computed twice under two names

Same `OnTimerEnd`:

```
AddColumns(colPCFDataOut As Current,
    CostCountRows,       CountIf(colPCFDataOut, Name = Current.Name, CurrentYear = …, row_ID = …, Number = …, Description = …),
    SubaccountCountRows, CountIf(colPCFDataOut, Name = Current.Name, CurrentYear = …, row_ID = …, Number = …, Description = …))
```

Byte-identical expressions. `SubaccountCountRows` is never read. Presumably it was meant to
count per sub-account (without `Description`), which would be the duplicate-sub-account check —
so this may be a *missing* check rather than only dead work.

---

### C-4 · N+1 server round trips when recomputing contract totals

Same `OnTimerEnd`, and the same shape appears on the Capex screen:

```
Patch('CAPEX Project Contracts',
  ForAll(Filter(colCapexProjectContracts, …) As Item,
    { 'CAPEX Project Contract': Item.'CAPEX Project Contract',
      'Total Cost': Round(Sum(Filter('CAPEX Costs', Contract.'CAPEX Project Contract' = Item.'CAPEX Project Contract'), Cost), 0) }))
```

One `Filter` against the server per contract, inside a `ForAll`. This is the largest single
contributor to the "Please wait, saving costs…" wait. In the rebuild it is one grouped query.

---

### C-5 · 654 App Checker findings are baked into the export

`AppCheckerResult.sarif` inside the `.msapp`:

| Rule | Count | Level |
|---|---:|---|
| `acc-TabIndexShouldBeDefinedForInteractiveControl` | 275 | Medium |
| `acc-AccessibleLabelNeeded` | 239 | Medium |
| `app-CollectingReadOnlyTable` | 38 | Medium |
| `app-UnusedVariables` | 28 | Medium |
| `acc-FocusBorderShouldBeVisible` | 18 | Medium |
| `app-ForAllWithMutation` | 16 | Medium |
| `app-WarnInvalidTypeForVariableDefinition` | 12 | Medium |
| `app-SuggestRemoteExecutionHint` (delegation) | 10 + 1 | Medium |
| `app-InefficientDelayLoading` | 7 | Medium |
| `app-ScreenHasManyControls` | 4 | Medium |
| `app-DataSourceDefaultMaxRowsLimit` | 1 | Medium |
| `app-CollectDelegatableDataSource` | 1 | Medium |
| `app-CountRowsGalleryAllItems` | 1 | Medium |
| others | 3 | Low/Medium |

**532 of the 654 are accessibility.** The Cost app is not keyboard-navigable or
screen-reader-usable in any meaningful way today. Fluent v9 + real semantic HTML fixes most of
this for free in the rebuild — worth stating as a deliverable rather than letting it recur.

The 11 delegation hints all sit on `Capex Costs Screen` and land on `Lower()`, `Max()` and
`in`-style `Filter`s over `Devex/Capex Standard Assumptions` and `CAPEX Project Contracts`,
plus `Contracts Screen.OnVisible` doing `Collect` on a delegable source. Combined with the
2000-row cap these are silent-truncation risks, not just slowness.

---

### D-1 · Two orphaned developer scratch screens ship with the app

`Screen1` (15 controls, a `Table` bound to `CAPEX Costs`, a stray ComboBox, two TextInputs) and
`Screen2` (4 controls). Neither is referenced from anywhere except `_EditorState.pa.yaml`, so
they are unreachable — but `Screen1` does instance `cmp_Header` and `cmp_ReportErrorRightPanel`,
so it still costs load time. Do not port; consider deleting from the canvas app too.

---

### D-2 · `CollapseResetKey` is a shipped bug workaround

`vsb_Dev.DevexCapexSummaryPCF` manifest, verbatim:

> `description-key="Bug 13472: change this value (on tab switch / screen OnVisible) to collapse all accounts and subaccounts"`

A workaround promoted to public API. Before copying it into the React component, confirm what
13472 actually was — if the underlying cause is fixed, the rebuild should not inherit the prop.

---

### B-4 · App-wide errors are captured and then never mentioned

`Src/App.pa.yaml` → `App.OnError`

```
=Set(gblReportError, { User: …, ErrorScreen: …, ErrorSource: …, ErrorMessage: …, Timestamp: Now() });
/*
Notify("An error has occurred! If you encounter the issue, please report them via Help --> Report problem. …",
       NotificationType.Error);
*/
```

The capture works; the `Notify` that tells the user is commented out. Combined with B-1 — the
Report-a-problem panel whose flow call is also commented out — a Dataverse fault today produces
**no user-visible signal anywhere and no report**. The only trace is the red warning triangle
next to Help, which is easy to miss (it appears in screenshot r07 and not in r06).

---

### C-6 · The `Margin = No` branch adds the margin anyway

`Src/Contracts Screen.pa.yaml:7551` →
`but_Contracts_RightPanel_NewEdit_Buttons_Recalculate.OnSelect`

```
locSelectedContractTotalCostOfContract: If(
    rad_..._Margin.Selected.Value = 'Margin (BoP Projects Contracts)'.Yes,
    If(
        rad_..._MarginType.Selected.Value = 'Contract Margin Type'.Percentage,
        If(Or(<numeric checks>), Value(calculated) * (1 + Value(pct) / 100)),   <-- no else
        Sum(Value(calculated), Value(fixedValue))
    ),
    Sum(Value(calculated), Value(fixedValue))                                   <-- Margin = No
)
```

Two defects in one expression:

**C-6a — no margin still adds the fixed margin.** The `Margin = No` branch is byte-identical
to the fixed-value branch. It is masked while a user *toggles* the radio, because
`rad_..._Margin.OnChange` sets `locSelectedContractMarginFixedValues: 0` and resets the
control. It is **not** masked when:

- editing a stored contract that has `Margin = No` and a non-zero `Margin Fixed Value`, since
  `OnChange` never fires and the values load straight from the record; or
- creating a Development or Construction contract, where `cmd_Contracts_CommandBar.OnSelect`
  seeds `locSelectedContractMarginFixedValues` from the Fabric standard assumption's
  `marginvalue` and then immediately calls `Select(Recalculate)` — regardless of whether that
  assumption's `margin` flag is set.

**C-6b — a bad percentage wipes the total.** The percentage branch has no `else`, so Power Fx
returns `Blank()` and `'Total cost of contract [EUR]'` is written empty rather than left alone.

Both are pinned by tests in the rebuild (UT-CON-029, UT-CON-030) with the canvas behaviour
preserved as `totalCostOfContractCanvasParity`, so the choice is one line. See decision D3.

---

### D-3 · One validation message tests the wrong field, inverted

`Src/Contracts Screen.pa.yaml:4397` →
`lbl_Contracts_RightPanel_NewEdit_CostsUntilClosingDate_Plan_ErrorMessage.Text`

```
=If(
    Not(IsBlank(txt_..._CostsUntilClosingDate_Actual.Value)),   <-- the ACTUAL field, negated
    gblAppResx.InputBlank,
    …
)
```

Every sibling validator tests `IsBlank(Trim(<its own field>))`. Compare the identical control
440 lines later at `:4837`, which is correct. So this one shows "Input must not be blank" when
the *Actual* field has a value, and never when Plan itself is empty.

**Not a save blocker** — the matching `.Visible` property has its own, correct logic and the
Save gate reads `.Visible`, not `.Text`. The symptom is the wrong message in one state: Plan is
filled but invalid *and* Actual also has a value. Worth fixing because the next person to read
this pattern will copy it.

The two sibling error messages also disagree on number format: `"#,##0"` versus `"###,###"` —
the first renders a zero, the second renders blank.

---

### D-4 · A blank required field disables Save and says nothing

Every `*_ErrorMessage.Visible` on the Contracts panel requires `Not(IsBlank(field))`:

```
=And(Not(IsBlank(txt_..._Plan.Value)), Or(Not(IsInteger(…)), Not(InRange(…))))
```

…while `pcf_..._Buttons_Save.DisplayMode` requires `Not(IsBlank(Trim(txt_..._Plan.Value)))`.

So a required field left empty produces **no message** and a greyed-out Save. The user has no
way to know which of nine conditions is unmet. The same shape is on the payment-target panel.

The rebuild reports the blank (decision D4). Listed here because it is a usability defect in
the source, not only a rebuild divergence.

---

### D-5 · Delete is gated on Edit permission

`Src/Contracts Screen.pa.yaml:445` → `cmd_Contracts_CommandBar.Items`

```
{ ItemKey: "deleteContarct", ItemDisplayName: "Delete", ItemIconName: "Delete",
  ItemEnabled: And(Not(IsBlank(locSelectedContract)),
                   RecordInfo(locSelectedContract, RecordInfo.EditPermission)) }
```

`RecordInfo.DeletePermission` exists and is not used. A user who may edit a contract but not
delete it sees Delete enabled and gets a raw Dataverse 403 — which, per B-4, they are not told
about either.

---

### D-6 · The payment date is a date stored as text

`vsb_paymentdate` on `vsb_BoPContractsPaymentTargets` is **`nvarchar`**, and the canvas control
is a `TextInput` with an `MM/YYYY` placeholder rather than a date picker. The validator parses
it with a regex and reconstructs a comparison date by borrowing `Day()` from the project start.

Consequences: the column cannot be sorted, filtered or aggregated as a date, in the app or
downstream in Fabric, without parsing it every time. Changing the column type is a schema
decision with a migration behind it — flagged so somebody owns it, not proposed here.

Related, in the same validator: `varCompareDate` is bound in a `With` **before** the format
check runs, and `With` binds eagerly. For input that does not match `MM/YYYY` it evaluates
`DateValue("--15")`, which errors — and `App.OnError` then swallows it (B-4).

---

### N-4 · A deleted comment rewrites the stored name of comments nobody touched

`Capex Comments` has a client-assigned sequence number that is never stored in a column of its
own. Instead the Save patches it into the row's **primary name**:

```
Name: $"Comment - {_currentComment.SequenceNumber} - {User().FullName}"
```
(`CapexScreenCode.txt:10012`)

The sequence number is recomputed from scratch every time the panel opens — root comments
sorted by `Created On`, numbered 1..n (`CapexScreenCode.txt:7440-7464`). So deleting a thread
renumbers every thread after it, and because the Save loop patches **all** of `colCapexComments`
(`Filter(colCapexComments, IsButton <> true)`), the next save rewrites the `Name` of rows the
user never opened. The stored name also silently disagrees with reality any time two people are
in the same contract, since the number is a position in one client's list, not an identity.

Replies get it worse: their `SequenceNumber` is blanked (`UpdateIf(colCapexComments, IsRoot =
false, {SequenceNumber: Blank()})`) and then interpolated anyway, so every reply is saved as
`Comment -  - {name}`.

Reproduced, not fixed, per the source-parity rule: `commentName` still builds the name from the
sequence number, `renumberThreads` still renumbers after a delete, and `UT-CMT-037` pins the
behaviour. Marked `// SOURCE DEFECT: N-4` in `data/comments.ts` (`saveComment`) and in
`CommentsPanel.tsx` (`commit`). A real fix is a `vsb_sequencenumber` column plus a name that
does not encode position — a schema decision, so it is flagged rather than taken here.

---

### N-5 · Resolving one comment thread resolves every thread on the contract

The resolve and reopen handlers both scope their `UpdateIf` with this condition:

```
Not(IsBlank(_CurrentId) And ParentCommentID = GUID(_CurrentId))
```
(`CapexScreenCode.txt:9677-9690` for `img_Read_Comment_Check.OnSelect`, `:9824-9835` for
`img_Read_Comment_Reset.OnSelect`)

The `Not()` wraps the **whole** `And`, which is almost certainly not what was meant — the
intent reads as "this row, or a reply belonging to it". For any saved root `_CurrentId` is
populated, so `IsBlank(_CurrentId)` is `false`, the whole `And` short-circuits to `false`, and
`Not(false)` is **`true` for every row in the collection**. Ticking resolve on one thread
therefore resolves every comment on the contract, and Reset reopens all of them.

The damage is bounded — `Resolved` is a flag, nothing is deleted, and a user can reopen what
was wrongly closed — but it silently hides other people's open threads, and the grid's red dot
disappears with them (dots only count unresolved threads).

**Not reproduced**, and this is a deliberate divergence from the bug-for-bug rule: unlike the
other entries here, reproducing it would mean writing incorrect `vsb_resolved` values to rows
the user never selected, which is a data change rather than a behavioural quirk. Our
`resolveThread` / `reopenThread` (`features/capex-costs/comments.ts`) scope to the root and its
own replies, as the canvas plainly intended. Raised for the client to confirm; if they want
literal parity here it is a one-line change in those two functions.

---

## Part 1c — In the OPEX screen (O&M and Other OPEX)

Found while porting `OpexCostScreenCode.txt` (8,932 lines) into
`features/periods/opexRules.ts`. Line references are into that file unless stated. Every one is
reproduced bug-for-bug with a `…CanvasParity` twin where our corrected behaviour differs, and
each is pinned by a `UT-OPEX-###` test.

| id | what the canvas does | where | our handling |
|---|---|---|---|
| **O-1** | The **O&M** command bar's Edit and Delete carry neither `Not(IsBlank(locSelectedOpexCost))` nor a `RecordInfo` permission check. With a card selected and no row, Edit renders enabled; a read-only row offers both. The Other-OPEX bar has both checks. | `:2867-2881`, `:2882-2922` | reproduced, parity twins |
| **O-2** | **Save is unreachable on Italian projects.** The Italy `Area` dropdown's container is `Visible: =false` — the real condition sits commented out directly above — yet the Save gate still requires a non-blank Area when an Italian project has both inflation toggles on. | `:7571-7576` vs `:8672-8676` | reproduced; `areaFieldVisibleIntended()` holds the corrected answer, unused pending sign-off |
| **O-3** | The delete dialog branches on `IsBlank(locSelectedOpexCost)` where `OnConfirm` branches on its `'Parent Cost'`, so the cascade warning is unreachable while the confirm cascades. The dead branch also interpolates a record it just asserted is blank, and omits the space before `"Cost"`. | `:8843-8847` vs `:8861-8874` | reproduced |
| **O-4** | The **O&M** card badge judges ONE row for a whole device card (`Last(Sort(Sort(cardCosts,'Start Date'),Description))`), so a second cost type on the same device is ignored; its "lands but not aligned" arm returns `""` where the sub-account badge returns `Duration Match`. | `:5222-5297` | reproduced as a separate `omDurationBadge` |
| **O-4b** | The O&M row warning icon never references `ThisItem` in its condition, so it renders on **every** row of a device card whenever the card's last row misaligns. | `:4682-4757` | reproduced |
| **O-5** | `locLastPeriod` sorts by `Name`, which is text — `… - 10` sorts before `… - 2`. From the tenth period onward, Add Period and Delete enable against the wrong row. | `:557-566`, `:2806-2821`, `:2905-2914` | reproduced; `lastPeriodByStartDate` is the sane alternative |
| **O-6** | The start-date picker's device branch reads years off `varLastRelatedPeriod` but **months off `locSelectedOpexCostParent`** — a different record, blank in that branch's own precondition. The months are silently dropped. | `:5862-5864` | reproduced; `startDateDefault` returns `defectiveMonths` so the loss is visible |
| **O-7** | The two period-numbering formulas disagree. The row-select one anchors on the **first** `" - "` and loses the rest of the stem (`"A - B - 2"` → `"A - 3"`); the panel's version is correct. | `:4620-4641` vs `:5630-5663` | both reproduced separately |
| **O-8** | Other-OPEX *Add Period*'s duplicate guard compares `DeviceTypeInProject` on both sides, and both are blank in that mode — so `Blank() = Blank()` matches **every** Other-OPEX row in the project. The guard is project-wide rather than card-scoped. | `:456-466` | reproduced |
| **O-9** | The Inflation Profile cell's else-branch fires when inflation is simply **off**, rendering an empty string — "no inflation" and "inflation 0.0 %" are indistinguishable. | `:1829-1847`, `:4116-4134` | reproduced |
| **O-10** | The **O&M** standard loader chains period 3+ off `Last(Sort(collection, Description, Asc))` where the Other-OPEX loader uses `Period`. From ten periods on, O&M computes the start off the wrong row. | `:3184-3186` | reproduced |
| **O-11** | The Duration **years** dropdown labels test the 1-based `Sequence` index while the caption uses the 0-based value, so the list reads `"0 year", "1 years", "2 years"…`. The months list is correct. | `:6078-6084` | reproduced |
| **O-12** | The start-date error's `.Text` and `.Visible` are inverted with respect to each other — the label renders empty when a date *is* chosen and hides when it is missing. Cosmetic; the Save gate is independent. Also present in the skeleton. | `:5807-5812` | corrected + parity twin |
| **O-13** | `locSelectedRecordTypeAddPeriod` keys off `Left(deviceRow.Name, 3) = "WTG"` rather than the resolved device type, so a generator row named anything else loses its `EUR/WTG` field. | `:2927-2934` | reproduced |

Lesser smells, recorded but not given ids: `colOtherOpexPeriods` is never cleared inside its own
`ForAll` (harmless only because the outer `OnSelect` clears it); the Threshold Individual error
label has a dead `"##"` else-branch; `'Is Standard Contract?'` is deliberately absent from the
hand-save payload.

---

## Part 1d — In the Land Lease screen

Found while porting `LandLeaseCostScreenCode.txt` (6,132 lines, cited `LL:`) into
`features/periods/landLeaseRules.ts`, diffed against the **newer** `Land Lease Costs Screen.pa.yaml`
export (cited `PA:`). Each is pinned by a `UT-LAND-###` test.

| id | what the canvas does | where | our handling |
|---|---|---|---|
| **LL-D1** | **Period-9 wrap.** The save `Switch` maps P1→P2 … P8→P9 then defaults to **Period 1**, so a tenth period silently becomes a second Period 1. `Add Period` has no cap at all. | `LL:5895`, `LL:388` | corrected; `nextPeriodCanvasParity` / `canvasParityPeriodWrap` twins |
| **LL-D2** | Duration-years `DefaultSelectedItems` compares `Value` where `Items` compares `Value - 1`, so the pre-selected label reads "0 year"/"1 years". | `LL:2619` vs `LL:2635` | reproduced |
| **LL-D3** | `Find` returns the *first* match, so `"A - 3 - 3"` → `"A - 4"`, losing a segment. | `LL:388` | reproduced |
| **LL-D4** | `Add Period` identifies the last period by **`Period`**; `Delete` identifies it by **`Name`**. On an oddly-named chain, Delete is offered on a middle row and refused on the real last one. | `LL:262` vs `LL:370` | both notions exposed; `UT-LAND-110` pins the disagreement |
| **LL-D5** | Deselecting a row clears the sub-account and period but **not** the cost, leaving a stale header. | `LL:1744` | corrected + parity twin |
| **LL-D6** | The blank-start-date error is **inverted**: `Visible: Not(IsBlank(date))` against `Text: If(IsBlank(date), …)`. The message can never be read and a blank start date is written silently. The Save gate never reads this label, so correcting it changes no save behaviour. | `LL:2318-2324` | corrected + parity twin |
| **LL-D7** | With the one-time-payment toggle on and no rate typed, Save requires **no duration, no aggregation, no frequency and no allocation** — writing a period row blank in every economic column. | `LL:5880` clause F | reproduced exactly (`UT-LAND-085`); refusing it would block a shape live data may already hold |
| **LL-D8** | Standard import chains period start dates while iterating assumptions sorted by **Description**, not Period. If the alphabetically-first row is not Period 1, the accumulator never resets and dates chain off the wrong predecessor. | `LL:388` | reproduced (`UT-LAND-120`); callers opt out by pre-sorting |
| **LL-D9** | The import's allocation `Name` uses `'Land Owner'`, which the import never sets, so every row leads with `-`. **Confirmed in live Dataverse**: `"-Standard LL Locations-WTG 111_1"`. | `LL:388` | reproduced |
| **LL-D10** | `% of Revenues` words an identical check differently from every sibling field. | `LL:3068` | reproduced |
| **LL-D11** | Payment amounts say "Value must be a number" where the same validator elsewhere says "Value must be a numeric with two decimal place." | `LL:4953` | reproduced |
| **LL-D12** | Fix Costs calls `fn_Numeric_CC` (the CAPEX instance); every other Land Lease field calls `fn_Numeric_LL`. Harmless until someone edits one instance. | `LL:2942` vs `LL:3071` | noted |
| **LL-D13** | The "Add One-Time payment" delete arm patches the **local collection** only, not Dataverse — the blanking persists only if the user then saves. | `LL:5093`, `LL:5449` | noted |

**LL-A1 (ambiguity, resolved by the client).** `Text(x, "###,###,###,##0.00 %")` — `%` is a ×100
scaling placeholder in .NET, but Power Fx's `Text` reference documents only `0 # . ,`. For the live
`vsb_ofrevenues = 20.00` the two readings give `"2,000.00 %"` and `"20.00 %"`. The client confirmed
against the running canvas app that it displays **`20.00 %`**, so the non-scaling reading ships;
`formatPercentOfRevenuesScaled` keeps the alternative reachable.

---

## Part 2 — In the manager's code-app skeleton

### S-1 · `npm run gates` fails on Windows — path separators

`scripts/check-ownership.mjs:436` and the label gate build baseline keys with
`relative(REPO_ROOT, file)`, which returns `src\features\cost\…` on Windows, while
`reference/ownership-baseline.json` and `reference/label-baseline.json` store
`src/features/cost/…`. Nothing normalises the separator.

Result on this machine:

- `G-OWN`: **16 new, 0 baselined, 16 stale** — every finding unmatched, every baseline stale
- `G-LABEL`: **51 new, 0 baselined, 67 stale** — same signature

The package was verified on Linux (`VSBCloud.md` names `/home/claude/vsb2`), so this was never
seen. Fix is one line per script: `relative(...).split(sep).join("/")`.
**Do not `--update-baseline` to make it green** — that would silently accept 16 real
owning-business-unit omissions.

Everything else passes: G-TYPE, G-LINT, G-IDS, G-MATRIX, G-UNIT (**1,727 tests, 41 files**),
G-BUILD (9.1 s).

---

### S-2 · 12 of the 20 Cost tables are not registered as data sources

`src/data/dataSources.ts` builds the map handed to `getClient()` from `Object.values(ES)` —
and `ES` is the *first*, hand-derived entity-set map in `entities.ts`. The corrected map for
this app is `ES_COST`, declared 700 lines later. Twelve of its tables never reach `getClient`:

```
vsb_capexcommentses            vsb_opexaccounts
vsb_devexcapexstandardassumptionses   vsb_opexsubaccounts
vsb_milestonesstandardassumptionses   vsb_landleasesubaccounts
vsb_spvdevcomappingcapexdevexes       vsb_bopprojectscontractses
vsb_assumptionsbopcontracts           vsb_bopcontractspaymenttargetses
vsb_countryinflationprofiles          vsb_bopcontractsdevcocostses
```

In `power` mode that is: no comments panel, no standard contracts, no DevCo/SPV defaults, no
OPEX accounts or sub-accounts, no Land Lease sub-accounts, no BoP contracts at all. Mock mode
hides it completely. (Counting all phases the shortfall is 46 entity sets across six `ES_*` maps.)

`ES` and `ES_COST` also **disagree** on three names, and `dataSources` uses the wrong one:

| | `ES` (used) | `ES_COST` (correct) |
|---|---|---|
| capexComments | `vsb_capexcomments` | `vsb_capexcommentses` |
| milestonesStandardAssumptions | `vsb_milestonesstandardassumptions` | `vsb_milestonesstandardassumptionses` |
| bopProjectsContracts | `vsb_bopprojectscontracts` | `vsb_bopprojectscontractses` |

`entities.ts:723` documents these three as wrong, in prose, right above the correct map. The
comment is accurate; the code that matters reads the wrong constant.

---

### S-3 · Derived primary keys are wrong for 22 entity sets (9 in the Cost app)

Same file:

```ts
primaryKey: PRIMARY_KEYS[entitySet] ?? `${entitySet.replace(/s$/, "")}id`
```

Strip one `s`, append `id`. That works for `vsb_capexcosts → vsb_capexcostid`. It does not work
for any set ending `-ses`, `-ies` or `-xes`:

| entity set | derived | actual |
|---|---|---|
| `vsb_bopprojectscontractses` | `vsb_bopprojectscontractseid` | `vsb_bopprojectscontractsid` |
| `vsb_capexcommentses` | `vsb_capexcommentseid` | `vsb_capexcommentsid` |
| `vsb_devexcapexstandardassumptionses` | `…assumptionseid` | `…assumptionsid` |
| `vsb_spvdevcomappingcapexdevexes` | `…devexeid` | `…devexid` |
| `transactioncurrencies` | `transactioncurrencieid` | `transactioncurrencyid` |

22 sets are wrong overall. Retrieve/update/delete by id fails on all of them.

**S-2 and S-3 both disappear the moment we run `pac code add-data-source` per table**, which is
the supported path — the file's own header says it is a placeholder. They are listed here
because they are exactly the class of bug that mock mode cannot show, and because 12 unregistered
tables would read as "the Cost app is broken" rather than "one generated file is missing."

---

### S-4 · The two PCF replacements do not exist

`src/components/` has 24 components; `YearGrid` and `SpreadsheetImport` — both named as required
in the manager's own spec — are not among them. The Capex screen header states:

> `vsb_Dev.DevexCapexSummaryPCF` is replaced by the shared `DataGrid` with twelve month columns

`DataGrid` is a flat virtualised list: sticky header, sortable columns, row select. It has no
parent/child expand-collapse, no sticky Grand Total row, no cluster timeline track and no
per-row action menu — the four things the PCF exists for, all visible in screenshot r06. This is
the single largest piece of work left, and the reason the Cost app is the right pilot: the
`DevexCapexSummaryPCF` source is dependency-free TypeScript with a fully commented stylesheet,
so it ports rather than gets reinvented.

---

### S-5 · 16 creates omit the owning business unit; 2 are on Cost screens

From the G-OWN run (the findings are real regardless of S-1):

- `src/features/cost/land-lease/Screen.tsx:227` → `vsb_landleaseallocationwtgs`
- `src/features/cost/contracts/Screen.tsx:243` → `vsb_bopcontractsdevcocostses`

Dataverse derives the owning BU from the caller, so a row created by a German user on a French
project becomes invisible to the French BU-scoped team. It never errors — the row just is not
there later. The other 14 are on PM screens and out of scope for this phase.

---

## Verification notes

Everything in Part 1 was read out of the unpacked `.msapp` at
`_extracted/msapp/projectcosts/`. Everything in Part 2 was reproduced by running the skeleton's
own gates after `npm install` (Node 24.20.0, npm 11.19.0, `pac` 2.8.1, Windows 11).

Two items are **not** independently confirmed and are marked as such: the identity of the single
parser error (B-3, needs Studio) and whether Bug 13472 is closed (D-2, needs the tracker).
