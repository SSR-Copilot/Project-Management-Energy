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
