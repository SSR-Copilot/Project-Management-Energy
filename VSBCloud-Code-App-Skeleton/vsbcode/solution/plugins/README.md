# `solution/plugins` — the custom-API handlers

Five `IPlugin` **skeletons**, one per message in `../customapi/`. They unpack their
arguments, retrieve the rows they need, assert they are running inside the platform
transaction, and then stop at the point where the business arithmetic belongs — with a
`// PORT FROM:` comment naming the exact TypeScript function that already specifies the
behaviour and the unit-test IDs that pin it.

**They do not implement the business rules and they are not meant to look as though they
do.** Every unimplemented step throws `NotImplementedException` with a message saying what
to port and from where. That is deliberate: a plausible-looking wrong number written by a
plugin gets believed, and an exception gets fixed. Nothing in these files invents a
formula, a rounding rule, an option-set value or an identifier format.

---

## The assembly

| | |
|---|---|
| Assembly name | `VSB.Cloud.Plugins` |
| Output | `VSB.Cloud.Plugins.dll` |
| Namespace | `VSB.Cloud.Plugins` |
| Target framework | `net462` — Dataverse sandbox plug-ins are .NET Framework 4.6.2, not .NET |
| Package reference | `Microsoft.CrmSdk.CoreAssemblies` |
| Signing | required. Sandbox-isolated assemblies must be strong-name signed. |
| Isolation mode | **Sandbox**. Never `None`: full-trust registration is not available in an online environment and asking for it is the wrong instinct anyway. |

There is no `.csproj` in this folder. Adding one would imply a build that has never run;
the project file belongs in whatever plug-in solution the team keeps its C# in, and it
needs exactly the two references above plus these six files.

```
PluginArguments.cs               argument unpacking + the transaction guard, shared
CreateCapexStandardContract.cs   vsb_CreateCapexStandardContract
CancelGateApproval.cs            vsb_CancelGateApproval
CancelCheckListApproval.cs       vsb_CancelCheckListApproval
CancelModulePermission.cs        vsb_CancelModulePermission
AllocateProjectId.cs             vsb_AllocateProjectId
```

---

## Registration

Order matters: the message has to exist before a plugin type can be bound to it.

1. **Create the messages.** `node solution/customapi/apply-customapis.mjs --apply`.
   Until step 4 each message exists and answers a call with its response properties
   unpopulated — `apply-customapis.mjs` reports that state as
   `! no plugintypeid bound`.
2. **Build the assembly**, signed, against `net462`.
3. **Register the assembly** in the target environment, isolation **Sandbox**, using the
   Plugin Registration Tool (`pac tool prt`) or the Power Platform Tools extension.
   Register the assembly into the same unmanaged solution the messages went into, or the
   two halves ship separately and the message arrives in the next environment with nothing
   behind it.
4. **Bind each plugin type to its message.** In the maker portal this is the Custom API
   row's *Plugin Type* lookup; in the Plugin Registration Tool it is a step on the custom
   API message. **This step cannot be scripted from here** and `apply-customapis.mjs`
   deliberately leaves `customapi.plugintypeid` alone rather than guessing a plugin-type id.
5. **Set every step to SYNCHRONOUS, on the MAIN OPERATION stage.** Each handler calls
   `context.RequireTransaction(...)` and throws if it is not inside the platform
   transaction, so a step registered asynchronously fails loudly on its first call instead
   of half-applying. Do not "fix" that by removing the guard.
6. **Decide the execution context per step, in writing.** Four of the five run correctly as
   the calling user. Two need a decision recorded on the step:
   - `vsb_CancelGateApproval` and `vsb_CancelCheckListApproval` write columns that
     `../security/apply-columnsecurity.mjs` takes away from everyone but the flow identity.
     Either run the step as that identity, or add this assembly's application user to the
     profile and justify making the profile list two principals. The first is the intent.
   - `vsb_AllocateProjectId` writes `vsb_country`, which no VSB role holds write on because
     `src/security/matrix.json` does not model that table. Give the step a dedicated
     application user scoped to that one table rather than running the whole handler as
     SYSTEM — the same handler also updates `vsb_project`, which must stay subject to the
     matrix.
7. **Re-run the gate.** `node scripts/gsec.mjs`. Adding a plugin is adding a write path,
   and a write path that bypasses the role matrix is exactly what G-SEC exists to catch.

---

## Why each message exists

Not one of them is a convenience wrapper. Each closes a hole that cannot be closed in the
client, because **`dataClient.batch()` bounds concurrency over individual writes and is not
a transactional `$batch` changeset** — so any plan with two or more writes can half-apply,
and no layer of the code app's harness can see it happen.

| Message | The hole |
|---|---|
| `vsb_CreateCapexStandardContract` | A write the app **computes, tests, and cannot make**: `Screen.tsx`'s `addStandard` ends at `setNotice("… will be created with N cost period(s).")`. A contract plus N cost rows is not atomic from the client, and a half-applied standard contract is a cost line with a total and no schedule. |
| `vsb_CancelGateApproval` | A cancellation is two writes rather than one transaction, so a mid-sequence failure leaves the approval **cancelled with the entity un-reset**. |
| `vsb_CancelCheckListApproval` | Same shape, three writes. The flow already answers `{success:false}` when its scope fails, and the canvas read `.success` and did nothing with a `false`. |
| `vsb_CancelModulePermission` | Same shape, worse consequence, already recorded as SOURCE DEFECT (ambiguity 10): a failed cancellation followed by a delete **orphans a live approval**. |
| `vsb_AllocateProjectId` | A `Do-until` over `vsb_countries.vsb_lastprojectid` is a **lost-update race** on the human-facing project identifier. A plugin can take the row lock; a flow cannot. |

---

## Which tests in the code app pin the expected behaviour

These are the specification. Port the pure function, then check it against the case IDs.

### `vsb_CreateCapexStandardContract`
`src/features/cost/capex-costs/rules.ts` · `src/features/cost/capex-costs/rules.test.ts`

| Test | What it pins |
|---|---|
| `UT-CAPEX-031` | `standardAssumptionAmount` for EUR/WTG and PLN/WTG: `activeWtgCount` sums `vsb_numberofgenerators` over **active rows only** (6 + 4, the inactive 99 excluded), × 1500 = 15 000 |
| `UT-CAPEX-032` | EUR/MW(p) and PLN/MW(p): 42.5 × 2000 = 85 000 |
| `UT-CAPEX-033` | `eligibleClusters` drops clusters below the project start cluster |
| `UT-CAPEX-034` | `applicableStartCluster` caps 6 and 7 to 5; 0 stays 0 |
| `UT-CAPEX-035` | no eligible cluster ⇒ `MSG.noApplicableCluster`, verbatim, and nothing is created |
| `UT-CAPEX-036` | an assumption already used for this sub-account is not offered again |
| `UT-CAPEX-037` | the click-time re-check: `MSG.duplicateStandard` + `removeOption: true` |
| *(unnamed)* | "clusters 5 and 6 are never synthesised from the milestone durations" |
| *(unnamed)* | "a cluster with an inverted or missing date range never counts" |
| `UT-CAPEX-058` | a missing project id is an error state, never a hard-coded fallback project |

Also relevant, for the distribution the handler writes: `distributionSchedule`,
`equalDistributionAmounts` (whole remainder on the **last** payment, stored average is
`RoundDown(total / n, 0)`), and `pfxRound` in `src/domain/numeric.ts` — Power Fx `Round`
is half-away-from-zero and is **not** `Math.Round`'s banker's rounding.

### `vsb_CancelGateApproval`
`src/features/pm/checklist/rules.ts` · `src/features/pm/checklist/rules.test.ts`

| Test | What it pins |
|---|---|
| `UT-CHKLST-033` | the gate cancel takes the tracking id **alone** — no 13-field JSON blob, no `AppId` (ambiguity 3). **This test must change** when the note write moves inside the message: `gateCancelArgs()` grows a `Comment`. |
| `UT-CHKLST-034` | `checklistCancelSucceeded` and `CHECKLIST_CANCEL_FAILED`, verbatim |
| `UT-CHKLST-024` | a blank comment disables all four panel buttons — the client half of the comment requirement |
| *(unnamed)* | "the gate cancel's local writes reopen the cluster and record a note": `vsb_approvalclusterstate` → In Progress, `vsb_flowrunid` → null, and the note's comment is exactly `Request canceled - {comment}` |

### `vsb_CancelCheckListApproval`
`UT-CHKLST-034` again — and note what it pins: anything that is not an explicit
`success:false` / `ok:false` counts as **success**, including `{}` and `null`. A custom API
answers `Success` with a capital S, which that function does not read, so as it stands a
`Success:false` would be read as a pass. Widen `checklistCancelSucceeded` in the same change
that registers the plugin.

The three writes themselves are **not specified anywhere in the code app** — the app makes
no local writes on this path — so they have to be transcribed from the flow definition
`PerformRequestofCheckListApprovalCancellation` in the solution export.
`UT-CHKLST-020` / `UT-CHKLST-021` (`rowActionLabel`, `showCancelApprovalIcon`) describe how
each approval state renders and are the cross-check on whatever the flow turns out to say.

### `vsb_CancelModulePermission`
`src/features/pm/generators/rules.ts` · `src/features/pm/generators/rules.test.ts`

| Test | What it pins |
|---|---|
| `UT-GEN-040/041` | `needsPermissionCancellation` — a cancellation is issued only when a flow run is open. It is a **client-side** pre-check over a value that can be stale on arrival, which is why the handler must answer `AlreadyClosed` rather than fault. |
| `UT-GEN-054` | the permission-state chip colours, i.e. the four `requestPermissionState` values the handler writes one of |
| `UT-GEN-004` | Delete items require `DeletePermission` on the concrete row — the delete this cancellation gates |

`buildCancellationPayload` is the full extent of what the app knows about the flow's
payload; the `msdyn_flow_approval` writes come from the flow definition.

### `vsb_AllocateProjectId`
**No test pins this, and there is no pure function to port.** The composition rule for
`vsb_internalprojectid` lives in an expression inside `PerformCommonRequestofGateApproval`
and nowhere else — the app only ever reads the finished value (`projectNumber`, rendered as
a Badge in every project header, e.g. `DE-1021`). Do not infer the format from that example:
a guessed zero-padding renumbers the estate the first time a country crosses a power of ten,
and those identifiers are already printed on documents outside this system.

The test this handler *does* need is one that does not exist yet and cannot be written in
this repository: **two concurrent calls must return two different numbers.** That assertion
is the only evidence the handler is worth having, since the whole point is to fix a race.
