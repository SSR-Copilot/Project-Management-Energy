# Functional test cases: the Cost module (4 Nov 2026)

There is one workbook per Project Costs screen. Each one is a copy of
`VSBCloud-Functional-Test-Case-Template.xlsx`, with the sample rows removed and every formula,
dropdown, conditional format and named range kept. The method is in
`ProjectDocs/instructions/FUNCTIONAL-TEST-CASES.md`.

**Source of truth:** the live Power Fx of the Project Costs canvas app
(`ProjectDocs/_extracted/msapp/projectcosts/Src/`, solution 1.21.709). Every case cites its canvas
control and line (column P). Recorded decisions (`02-OPEN-DECISIONS.md`, `01-BUGS-FOUND.md`, file 13)
decide where the expected result follows the code app instead (columns W and X).

## The workbooks

| File | Screen | Cases | FT-ACC | FT-BR | P1 | FT-BR with a UT pin | Automated now |
|---|---|---|---|---|---|---|---|
| `FT-CONTR-Contracts-2026-11-04.xlsx` | Contracts | 108 | 091–095 | 103 | 49 | 70 | 0 |
| `FT-CAPEX-Capex-Costs-Run2-2026-11-05.xlsx` (run 2 recorded; has a "Run 2 Report" sheet) | Capex Costs (DEVEX/CAPEX) | 188 | 096–100 | 183 | 80 | 145 | 0 |
| `FT-OPEX-Opex-Costs-2026-11-04.xlsx` | Opex Costs (both tabs) | 105 | 101–105 | 100 | 38 | 89 | 0 |
| `FT-LEASE-Land-Lease-Costs-2026-11-04.xlsx` | Land Lease Costs | 110 | 106–110 | 105 | 25 | 89 | 68 |
| `FT-ADDCOST-Add-Costs-from-Table-2026-11-04.xlsx` | Add Costs from Table | 87 | 111–115 | 82 | 45 | 66 | 0 |
| **Total** | | **598** | **25** | **573** | **237** | **459** | **68** |

- **Every workbook is all Not Run except Capex, which was run on 5 Nov 2026 (run 2 then a retest of the fixes: 171 Pass, 0 Fail, 6 Blocked, 11 Not Run; see its Run 2 Report sheet).** Execution columns Y–AG and the Execution Log are empty until a run.
- **Excel recalculated each file on 4 Nov 2026.** Every Summary health check reads 0, and every
  row resolves its Phase and Screen Code.
- **FT-ACC ids follow the template's migration order.** Admin takes 001–030, Project Management
  031–090, and Costs 091–115 (23 screens × 5 roles).
- **Land Lease "Automated - passing"** means the case maps to a state, gate, validation group or
  flow step of parity harness run `20261104-1016` (run 16, clean). Column V names the step.
- **OPEX has a parity manifest that has never run live.** Its mapped cases are Semi-automated,
  with the step in column V.
- **Contracts, Capex and Add Costs have no parity manifest yet.**

## How the cases treat roles

The Cost canvas app builds `gblCurrentUser` with each user's roles (`App.pa.yaml` OnStart). No Cost
screen, command or gate reads those roles. So the role never changes what a screen shows or
enables; Dataverse security alone decides what the user can read and write.

Each FT-ACC case therefore checks, per role:
- the screen opens;
- every command's state equals the canvas for the same user;
- the rows shown equal the canvas rows for that user;
- a write outside the role's scope is refused and shown as an error, never as a silent success
  (D1).

The FT-ACC cases stay **Blocked** until there is one test account per role. The parity harness
runs under a single account.

## Suspected canvas-vs-code differences found while writing the cases

The agents that read each canvas screen and the code app reported these. **None is confirmed by a
live run yet, and no decision records any of them.** Each case is written to the canvas behaviour.
Confirm each one in the first run, then record it in `01-BUGS-FOUND.md` (a defect) or
`02-OPEN-DECISIONS.md` (a DIVERGENCE to approve).

**Contracts** (`Contracts Screen.pa.yaml`)
- **Inactive contracts:** the canvas lists them (:62-65); the code app filters `statecode eq 0`.
- **Payment targets:**
  - Sort order: the canvas sorts by Created On (:1627-1635); the code app sorts by payment-date
    text.
  - Add Period: the canvas enables it only on the selected contract's card while targets
    total < 100 % (:1407-1416).
  - Add Period's Description: the canvas pre-fills "<base> - n+1" and locks it (:2365-2424).
- **Rounding:** the canvas uses `RoundUp(…,0)` for plan figures and the calculated total, and
  stores the integer (:4456-4466, :5339-5349, :6167-6180). The code app uses `round()` and stores
  2 decimals.
- **Validation:**
  - Margin Fixed Value: the canvas allows 2 decimals (:5570-5605).
  - Closing-date message: the canvas says "The Contract Closing Date cannot be empty."
    (:4106-4117).
  - Project Rights range: the canvas uses 0..10,000,000 (:3540-3579).
- **Messages:** the payment-target save error (:3125-3128) and the used-account tooltip (:6429)
  differ.
- **Contract card:**
  - blanks and number formats differ (:857-1334);
  - the Margin field shows even when Margin = No (:930-950);
  - the Margin field lacks the blue/italic standard styling (:925-926).
- **Margin defaults:** the new-contract margin type defaults differently (:5887-5907), and on Edit
  the italic follows a different flag (:673-677).
- **Project Rights save:** the name and the payload differ (:3751-3759). The canvas names it from
  the wrong panel's box, a canvas defect that is not in the register.
- **A canvas defect that is not in the register:** the delete spinner never shows (:7788-7794).

**Capex Costs** (`Capex Costs Screen.pa.yaml`)
- **Relink confirm:** the canvas no longer deletes payment-date comments, because its RemoveIf is
  commented out (:20061-20065). The code app still deletes them.
- **Wording:**
  - the month range message: the canvas has no thousands separators (:13364-13368);
  - the "No monthly cost row found…" text (:7741).
- **Panel Save:** the code app has no "something changed" gate (:17548), and it blocks Save on a
  month range error.
- **Comments:**
  - Edit and Delete for the author only, and Reset for the author or resolver (:9761, :9818,
    :10023), are not reproduced;
  - the comments-save Notify exists in the canvas (:10211), although a code comment says it does
    not.
- **Missing in the code app:**
  - the "edited from spreadsheet" warning (:12444-12492);
  - three canvas error and busy texts (:7754, :17574).
- **Other:**
  - a payment-date comment without a month blocks Save in the code app only (:10061);
  - the cluster checkbox `aria-label` differs from the canvas AccessibleLabel (:11100);
  - `newCostLine()` seeds fixed dates with no canvas source.
- **No Draft or cluster-state lock exists in the YAML.** The "Draft" hits are the comment draft
  card. The real cluster-state gates are at :11412, :11102 and :3091.

**Opex Costs** (`Opex Costs Screen.pa.yaml`)
- **O-1 is registered as reproduced, but the screen calls the corrected `canEditCost` /
  `canDeleteCost`** (:2876-2930).
- **Add Period / Delete "last period" gates:** a DIVERGENCE marker dated 27 Oct 2026 goes against
  D47, and there is no D-number (:2780-2838, :538-582).
- **Other OPEX panel title** on Edit and Add Period (:5437-5453).
- **The first device card opens at load;** the canvas folds every card (:100-115).
- **Accessible names "Month" / "Year" / "Month"** (:6000, :6064, :7130), and the panel caption
  hover texts (:5730-8381).
- **The threshold value written when the toggle goes off** (:8703).

**Land Lease Costs** (`Land Lease Costs Screen.pa.yaml`)
- **Inactive rows:** inactive sub-accounts, contracts and generator types are filtered out
  (:14, :141).
- **Standard flag:** picking a Start Date does not clear it (:2342).
- **Saves:**
  - the currency is not rewritten to PLN/EUR on a header save (:2774, :6062);
  - `AllWTGAllocated` (:3945);
  - the allocation name after a rename (:6062);
  - a failed save stops at the first write (:6062).
- **Display:**
  - the allocation asterisk (:4040);
  - Inflation Start Year does not follow the Start Date (:4328);
  - the Italy Area default (:4420);
  - payment block 2 is hidden when its toggle is off (:5152).
- **Save gate:** Save is offered with "Allocate to all WTGs" on and zero generators (:5896). There
  is a code marker but no D-number.
- **Range figures in messages are not localised** (`fn_Numeric`).
- **The 27 Oct 2026 product-owner divergences have no D-number and no `…CanvasParity` twin:** Add
  Period on any period, Delete's last-period rule, and Add Period's parent.
- **LL-D6 is registered as corrected,** but `validateStartDate` is never called.

**Add Costs from Table** (`Add Costs from Table.pa.yaml`)
- **Validation timing:** the code app validates live and disables Save. The canvas validates on
  Save and shows "Click to view validation error", "Data Invalid" and "Required fields"
  (:372-387).
- **Busy texts and message prefixes** differ (:30, :358).
- **Duplicate sub-account check:** the code app adds the year to the key. A DEVIATION comment
  records it, but no decision does.
- **Contract order:** the canvas sorts by ContractName (Capex :2638-2663); the code app has no
  order.
- **Month cells** round decimals and clear minus signs at entry.
- **Possible canvas defect:** the busy indicator can stay up after a second Save with no edit.
- **Housekeeping:**
  - UT-ADDCOST-032…037 are used in two test files;
  - file 13 calls C-1 fixed, but `referenceYears` is unused.

**Duplicate UT ids** were also found in Capex `rules.test.ts` (UT-CAPEXR-042…049, 060…070).
CONVENTIONS rule 13 wants one id per `it()`.

## Rebuilding a workbook

The case rows are in `_source/<CODE>.json`, and the builder is `_source/build_workbook.py`
(openpyxl). The builder checks every row against the template's rules before it saves: the
Lookups values, the ID format, unique ids, the screen code, no GUIDs.

```powershell
python -I _source\build_workbook.py <template.xlsx> _source\CAPEX.json "Capex Costs" CAPEX FT-CAPEX-Capex-Costs-<date>.xlsx
```

Rebuilding overwrites any execution results in that file. Record runs in a copy, or record them
in the Execution Log only.

## Running them

Follow Part 5 of `FUNCTIONAL-TEST-CASES.md`:
1. Ask for the inputs every run. The test project is asked at run time and is never written into
   a file.
2. Run the Canvas app first, then the code app.
3. Run the unit pins with Vitest.
4. Fill columns Y–AH and one Execution Log row per case.
5. Map the harness classes: new → UNEXPECTED, known → EXPECTED, artefact → MATCH.

Cases that start a PM approval flow, read Fabric SQL, or need a limited role, an Italian project or
seeded data are Manual, and column AH gives the reason.
