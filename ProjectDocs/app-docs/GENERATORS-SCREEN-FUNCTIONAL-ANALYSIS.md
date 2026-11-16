# Project Generators screen: functional analysis of the code app

| | |
|---|---|
| **Screen** | Project Management → Project Generators (`/project/generators?projectId=`) |
| **Code** | `ProjectCosts-CodeApp/src/features/pm/generators/` (`Screen.tsx` 2,675 lines, `rules.ts` 4,824, `hooks.ts` 366, `rules.test.ts` ~2,300, `Screen.test.tsx` 387) and `src/data/generators.ts` |
| **Canvas source** | `ProjectDocs/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml` (about 17,500 lines, 642 controls) |
| **State analysed** | `RounakDev1` at `9d5d03d` (16 Nov 2026), the build deployed to VSBCloud_Dev that day |
| **Method** | `Screen.tsx`, `rules.ts` (all key rules), `hooks.ts`, `data/generators.ts`, `data/flows.ts`, doc 02 / 13 / 16 and the gap analysis were read. Nothing was run in a browser, so what follows describes the code, not observed behaviour |
| **Out of date** | `gap-analysis/pm-generators.md` (20 Oct 2026) says the screen is "not connected" and lists 30 WRONG rows. D27 and later fixed most of them. Use this file for the current state |

---

## 1. What the screen is for

A project has a **plant**: wind turbines, PV modules, inverters, mounting structures and optional storage, hydrogen and substation assets. This screen is where a project manager defines that plant. It does five things:

1. **Picks the generator types** of the project from a catalogue (wind turbine models), with a cascade Supplier → Turbine Type → Hub Height, and creates the individual turbines of each type.
2. **Prices the type** automatically from the model's price bands, an inflation index and the foundation rule.
3. **Maintains the plant roll-ups** on the project (WTG capacity and cost, PV capacity and cost, storage, hydrogen and substation capacity), which feed total capacity and the cost screens.
4. **Enforces the safety rules**: the last generator cannot be removed, a height limit needs the project manager's override, an O&M link blocks deletion.
5. **Starts approval flows** for out-of-country generators and "Other Supplier" equipment, and cancels them.

Total capacity is a Dataverse formula column on the project. The screen reads it and never writes it.

---

## 2. Page structure, top to bottom

| # | Element | Notes |
|---|---|---|
| 1 | **Lock banner** (`con_Milestones_Page_LockMessage_1`) | Shown when the project has no id or no end date. Title "This page is locked. To unlock it, please complete the following sections:" with bullets "• General" (no project id) and "• Milestones" (no start date). The banner tests the end date but the Milestones bullet tests the start date, as the canvas does |
| 2 | **Command bar** (`pcf_Generators_DisplayProject_Body_Form_CommandBar`) | Context-sensitive, section 4 |
| 3 | **Write feedback** | Progress dialog, error bar `generators-write-error`, success bar `generators-write-success` |
| 4 | **Total Capacity [MW(p)]** box | Read-only, right-aligned, in the user's number format |
| 5 | **Seven galleries of cards** | Only when the project has an end date. A gallery with no rows renders nothing |
| 6 | **Eight right-hand panels** | Add Generator Type, Add/Edit Generator (turbine), Add/Edit PV Module Type, Add BESS / Hydrogen / Substation (one shared panel), Add/Edit Inverter, Add/Edit Substructure, Replace Generator, Replace PV Module |
| 7 | **Dialogs** | One confirm dialog, one information pop-up, one OK dialog |

The root element is `data-testid="Project Generators Screen"`. If any of the 16 queries fails, the screen shows only an empty state, "The generator data could not be loaded" with "Reload the page or try again later." (UT-GEN-908).

### The seven galleries

| Gallery | Detail captions on an expanded card |
|---|---|
| **WTG types** | Supplier, Total Height [m], Number of Generators, Hub Height [m], Rotor Diameter [m], Height Limitation [m], Generators Capacity [MW], plus the turbine grid |
| **PV module types** | Supplier, Total Module Type Capacity [MWp], Degradation 1st Year / Remaining Years [% per annum] |
| **Inverters** | Inverter Type, Supplier, Cost per Inverter [ISO], Number of Inverters, Total Inverter Type Cost [ISO], Nominal Power [kW], Warranty [y] |
| **Substructures** | Supplier, Substructure Type, Substructure Cost [ISO] |
| **BESS** | Power Capacity [MW], Energy Capacity [MWh], Supplier |
| **Hydrogen** | Hydrogen Capacity [MW], Supplier |
| **Substation** | Substation Capacity [MW], Supplier |

"[ISO]" is the project country's currency code, or "EUR" when there is none.

### What a card does

- Every card starts **collapsed**. There is **one selection across the whole screen**: selecting a card clears any other.
- The selection dot and the chevron both select. For PV, inverter, substructure and the three simple families, a click also toggles the fold. A WTG card always stays selected when it folds. The canvas deselected it, which the code treats as a defect (`wtgFoldSelection`, with a parity twin).
- Header chips: the WTG **status** ("Active" / "Inactive"), a **"Height Limitation"** tag when any turbine of the type is over the limit, and the **permission chip** for WTG, PV, inverter and substructure: Request Approved, Declined, Pending or Canceled.
- A card with an open approval request shows a **Cancel** button. Its visibility rule: PV when the state is Pending; the others when both the flow run id and approval id are set and the state is not Approved.
- A substructure card whose plant has no PV capacity shows "* Please add Module Type in order to calculate cost." and an info button.

### The turbine grid inside a WTG card

- **Add Generator** bar. It is enabled when the type is Active and has fewer than 200 turbines. Otherwise "Generators can only be added to an active generator type" shows, with an info button.
- A table with the turbine name (with an info icon when over the height limit), Total Height, Effective Generator Capacity [MW], and Edit and Delete icons. Edit and Delete work only while the type is Active.
- A pager shows when there are more than 30 turbines: "Generators: N", "Page: p from n" and first / previous / next buttons. The page is kept per type.

---

## 3. Data the screen needs

All reads are server-filtered with an explicit `$select`. Everything project-scoped sits under the query key `["generators", projectId, part, …]`, so one invalidation refreshes the screen.

| Read | Table | Filter / order |
|---|---|---|
| Project and country | `vsb_projects`, `vsb_countries` | by id |
| Planning (height limit) | `vsb_projectplannings` | project, top 1 |
| WTG catalogue | `vsb_generators` | `vsb_earliestphaseout > FID`, order by display name. Empty when the FID is blank. No status filter |
| WTG types of the project | `vsb_generatortypeinprojects` | project, order by created on |
| Turbines of the project | `vsb_generatorinprojects` | by the type ids, chunks of 40. Covers the whole project, because the next index and the duplicate check are project-wide |
| PV catalogue, PV types | `vsb_pvmodules`, `vsb_pvmoduletypeinprojects` | catalogue by display name; types by created on, then name |
| Inverters, substructures | `vsb_invertertypeinprojects`, `vsb_substructuretypeinprojects` and the supplier tables | project |
| BESS, hydrogen, substation | `vsb_storagetypeinprojects`, `vsb_hydrogentypeinprojects`, `vsb_substationtypeinprojects` | project |
| Device costs | `vsb_devicecosts` | Modules / Inverter / Mounting systems fix / tracker. The project's country wins, otherwise the first row of any country (D27 divergence) |
| Inflation index | `vsb_estimationpriceinflations` | FID year and FID year − 1 |
| All-WTG land-lease costs | `vsb_landleaseprojectcosts` | project and `allwtgallocated = true` |
| O&M dependency | `vsb_devicetypesinprojects`, then `vsb_opexprojectcosts` | for the selected WTG or PV type |

The catalogues are cached for 30 minutes.

**Permissions** are `SERVER_DECIDES`: the screen assumes the user may edit and delete, because the SDK has no record-privilege check. Dataverse refuses a write the user is not allowed to make, and the refusal appears in the error bar.

---

## 4. The command bar

Items appear in the canvas order. A command is enabled only while the page is not locked and no background reload from the last save is still running.

| Command | Visible | Enabled when |
|---|---|---|
| Add WTG Type | always | the project has an end date |
| Add / Edit PV Module Type | always (the caption follows the selection) | the project has an end date |
| BESS, Hydrogen, Substation (Add or Edit) | always | that family is selected, or has no rows yet |
| Delete BESS / Hydrogen / Substation | that family selected | selected |
| Add Others | always | any of the three has no rows. **It does nothing**, as in the canvas |
| Delete Generator Type | a WTG type selected | delete permission |
| Replace Generator Type | a WTG type selected | edit permission |
| Delete PV Module Type, Replace PV Module Type | a PV type selected | permission |
| Delete Inverter Type, Delete Substructure Type | selected | permission, with **no capacity guard** |
| Activate | a WTG type selected and not Active | edit permission |
| Deactivate | a WTG type selected and Active | the project has a start date, and edit permission |

BESS, Hydrogen and Substation show as flat items after "Add Others", because there is no sub-menu (DIVERGENCE D15c).

**Add Inverter and Add Substructure are not offered.** The canvas hides them (`ItemVisible: false`). The code once exposed them (D27 G9) and withdrew that on 28 Oct 2026 (UT-GEN-910). Their panels, the "Add Substructure information" dialog and the matching save plans still exist in the code but cannot be reached from the screen. Only their Delete commands are live. Two comments in the code still say the opposite (the header of `Screen.tsx` and a note in `rules.ts` near `commandBarState`).

Every command clears the previous success and error bars first.

---

## 5. Workflows

All writes run through one mechanism: a **write plan** built in `rules.ts`, executed in order by `executePlan` (not transactional: a failure stops the plan and reports how many changes had already been saved). A save ends when the writes land. The screen then reloads in the background and keeps its commands disabled until that finishes.

### 5.1 Add a WTG type

1. **Add WTG Type** opens the panel with the country switch on ("Show generator types which are available in my country and latest possible order date is valid"). The line below it says "Generators available for <Country>" or "not available for".
2. Choose **Supplier**, then **Turbine Type**, then **Hub Height**. A Dummy supplier (name starts with "Dummy") replaces the hub height list with a typed **Revised Hub Height** (1–200 m, two decimals). Toggling the switch resets the form.
3. Enter **Number of Generators** (integer 1–200).
4. The cost per WTG is derived, not typed:
   - **Price band:** the model's `'1 WTG price'` to `'4 WTG price'` for 1 to 4 turbines, and `'5 WTG price'` for 5 or more.
   - **Foundation:** the additional foundation cost is **always** added. The canvas tests `Text(Yes/No) = "Yes"`, which is never true, and the code reproduces that on purpose (product owner decision M4).
   - **Inflation index:** `prev + (curr − prev) × Month(FID) / 12`, from the FID year and the year before.
   - **Cost per WTG** = (band price + additional foundation cost) × index. **Generators Cost** = count × cost per WTG. **Generators Capacity** = count × the model's specific capacity.
5. **Save** is enabled when no error shows, the height is not blocked, and the derived cost is above 0. When Save stays disabled for a reason no field explains, a warning bar says why (no price, no index, hub height 0 m). That bar is new (D89, proposed).
6. The caption is **Save**, or **Request permission** when the model is not available in the project's country.
7. If the height exceeds the project's limit (planning flag on and limit set):
   - the project manager gets the **"Height Limitation Exceeded"** confirmation and may continue;
   - anybody else cannot save, and sees "Total height exceeds Height Limitation, Only Project Managers can Override to Save."

**What the save writes** (job 1, then a follow-up):
- the type row, then N turbine rows named `WTG <ShortName>_<n>`, numbered after the **highest index in the whole project**;
- for an in-country type, the project's WTG capacity and cost roll-up. These count only types that are Active and either have no request state or are Approved;
- then the device-type row (the bridge that O&M costs link to), and a land-lease allocation for every all-WTG land-lease cost times every new turbine;
- for an out-of-country type, no roll-up. The **Request Module Permission** flow is called instead.

Messages: progress `Generator "<name>" will be saved, please wait...` (or `Request Permission for "<name>" has been sent…`), success "Generator type was successfully saved for current project!".

### 5.2 Add, edit and delete a turbine

- **Fields:** the name's index (non-blank, not 0, an integer, unique **across the project**); Effective Generator Capacity (two decimals, 0.01 up to the model's specific capacity); Foundation Plinth (−100 to 100, one decimal); Hub Height excl. Foundation Plinth (1–200, two decimals); Total Height, read-only.
- **Defaults:** a new turbine opens with the next project-wide index, the model's specific capacity and hub height, and plinth 0.
- **Total height** = hub height + plinth + ½ rotor diameter while editing. A new type uses hub + ½ rotor.
- **Apply to all** checkboxes (capacity, plinth, hub height) copy the value to every turbine of the type. Hub-height and plinth updates also rewrite each turbine's own total height. The canvas did not (SOURCE DEFECT, fixed).
- **Height block:** the turbine panel reads the turbine's **stored** total height, so a brand-new turbine is never blocked for a non-manager. This is a canvas behaviour, kept.
- **Save writes:** the turbine, the sibling updates, then the type's count, capacity and re-banded cost, then the project roll-up. A new turbine also gets its all-WTG land-lease allocations.
- **Delete:**
  - Allowed unless it would take project capacity to zero (see 6).
  - After "Delete Generator?" it removes the turbine's land-lease allocations, or the whole land-lease cost if that turbine held all of its allocations.
  - It then deletes the turbine, recomputes the type, and updates the roll-up. When the last turbine goes, cost per WTG becomes 0.

### 5.3 Delete, activate and deactivate a WTG type

- **Delete** is guarded by the capacity rule and the O&M rule (section 6), then confirmed: "Are you sure to delete the WTG type: …? All related cost in O&M and Land Lease will be removed."
- An open approval request is **cancelled first**, then the plan removes the type's land-lease costs and O&M costs, the type, and updates the roll-up. The canvas did not clean up land lease for a type (SOURCE DEFECT, fixed in D27).
- **Deactivate** uses the same guard. Activate and Deactivate write the type's status and every turbine's status, then the roll-up.
- After a delete, the selection moves to the first remaining row: WTG, else PV, else hydrogen, else BESS, else substation.

### 5.4 PV module type

- **Fields:** Module Label (required, up to 512 characters); Total Module Type Capacity [MWp] (two decimals, 0–500); Supplier (from the PV catalogue, "Imported" entries hidden and "Other Supplier" last); Other Supplier (shown only for that module); two degradation fields (three decimals, 0–100).
- **Save** needs a label, a capacity and a supplier (plus an Other Supplier text for that module). There is no "changed" requirement, so an unchanged edit can be saved.
- **Cost:** cost per power = the Modules device cost. Cost = cost per power × capacity.
- **Writes:** the PV type, then its unit row, land-lease allocations for a new type, the project's PV capacity and PV cost (PV plus inverter plus substructure), and the device-type row.
- **PV does not request permission.** The call is commented out in the canvas.
- **Delete:** guard (capacity and O&M), confirm, cancel any open request, then remove O&M costs, land-lease rows, the unit and the type. Then update the PV capacity, **recompute every substructure's cost** (mounting system rate × new plant PV capacity), and the PV cost.

### 5.5 BESS, Hydrogen and Substation

- One shared panel. Titles are "Add BESS" / "Add Hydrogen" / "Add Substation", also when editing (the canvas has no Edit title).
- **Fields:** label, capacity, supplier, and for BESS also Energy Capacity [MWh].
- **Validation:** BESS power 0–1000 with two decimals, BESS energy 0–10000 with two decimals, hydrogen and substation 0–1000 with **one** decimal. Save needs a change, no error, and every field filled.
- **Editing** opens bound to the selected row.
- **Writes:** the row, then the matching plant capacity column on the project. Delete reverses it. The hidden "Type" combo of the canvas is not written.

### 5.6 Replace Generator Type and Replace PV Module Type

These come from canvas 1.21.753 and are not in the 1.21.709 YAML source.

- A two-column panel, "Replace from" (read-only) and "Replace to" (the same cascade as Add). The turbine count is copied.
- **Replace Generator** runs one job:
  1. cancel any open request;
  2. detach the O&M costs from the old device-type row;
  3. delete the old units, device-type rows and type;
  4. add the new type exactly as in 5.1.

  A follow-up creates the new device-type row, the all-WTG allocations and moves manual land-lease allocations to the new units by position. It deletes the leftovers and re-links the O&M costs.
- Out of country, the new type goes through the permission flow.
- Success: "Generator type was successfully replaced for current project!". If the new type has fewer turbines than the old one, a note says how many land-lease allocations could not be carried over.
- **Replace PV** is the same shape.
- Not verified: the Replace panel has no height-limit approval pop-up. A blocked manager-only case just disables the button.

### 5.7 Approval flows

| Flow | When it runs | What the flow does |
|---|---|---|
| **Request Module Permission** (`483a3074-9166-b822-9e47-a891cafbe68e`) | An out-of-country WTG type save or replace | Starts an approval to the group in `vsb_PrimarilyApprovalGroupID`. It sets the row to Pending with the run and approval ids. On approval it sets Approved and rolls up the plant totals. On decline it deletes the row |
| **Request permission cancellation** (`1a8b4be8-902b-b90c-dcef-1875f75ba7f3`) | A card's **Cancel** button, and automatically before a delete or replace of a type with an open request | Marks the approval Canceled, sets the row Canceled and clears both ids |

- The inputs come from the session e-mail and the environment variables `vsb_ProjectManagementAppID` and `vsb_PrimarilyApprovalGroupID`. If one is blank, the screen refuses with "The approval flow cannot be started: … is not set in this environment…".
- The screen never writes the request state or the run and approval ids itself. The flows do.
- The Inverter and Substructure permission request exists in code but its save paths cannot be reached.
- **Status:** both flows are registered and wired (D86, D97). They were **not run live** at the time of the D97 record, because each call sends real approvals and mails.

---

## 6. Safety rules

| Rule | Behaviour |
|---|---|
| **Last capacity** | A delete or deactivate is blocked when `project total capacity − the entity's capacity = 0`. It applies to WTG types, turbines, PV, BESS, hydrogen and substation. It does not apply to inverter and substructure (SOURCE DEFECT, kept). The pop-up says "Generator can’t be deleted/deactivated" |
| **O&M dependency** | A WTG type or PV type that is Active and linked to an active O&M cost cannot be deleted or deactivated. The message says to replace the generator or unlink the O&M costs first. The capacity reason wins when both apply |
| **Height limit** | Applies when the planning row has the flag on and a limit set. The project manager may override after a confirmation. For others, Save is disabled |
| **Single selection** | One card selected screen-wide, so the command bar always refers to one record |
| **Lock** | No project id or no end date: banner, disabled commands, galleries hidden when there is no end date |
| **Active-only** | Adding, editing and deleting turbines needs an Active type |
| **200 turbines** | The Add Generator button disables at 200 per type |

---

## 7. Rules and numbers at a glance

| Rule | Value |
|---|---|
| Turbine name | `WTG <Short Name>_<index>`; the next index is the highest index in the whole project plus 1 |
| Page size | 30 turbines, pages = round up (rows / 30) |
| Number of Generators | integer 1–200 |
| Effective hub height | 1–200 m, two decimals |
| Effective capacity | 0.01 up to the model's specific capacity, two decimals |
| Foundation plinth | −100 to 100, one decimal |
| PV capacity | 0–500 MWp, two decimals |
| Degradation | 0–100 %, three decimals |
| BESS power / energy | 0–1000 / 0–10000, two decimals |
| Hydrogen, substation | 0–1000, one decimal |
| Cost per WTG limit (when validated) | 15,000,000 in EUR, 75,000,000 in any other currency |
| Inverter cost per unit | device cost × nominal power (kW) / 1000; type cost = per unit × count |
| Substructure cost | Fixed or Tracker rate × plant PV capacity; any other type costs 0 |
| Plant PV cost | PV + inverters + substructures, with no status or permission filter |
| Plant WTG roll-up | only types that are Active and either have no request state or are Approved |
| Permission state values | Approved 952850000, Declined …01, Pending …02, Canceled …03; status Active 0, Inactive 1 |
| Number formats | follow the user's language (`forLanguage`, `textFormat`) |

---

## 8. Divergences from the canvas (what is deliberate)

| Topic | Canvas | Code app |
|---|---|---|
| Fold and selection of a WTG card | Expanding deselected it | Stays selected (D27) |
| "Value cannot be blank." on Supplier, Turbine Type, Hub Height | Never shown (filter on a row named "Generator") | Shown once the field was touched (D27) |
| Cost row of the type form | Hidden field, valid when the derived cost > 0 | Same, using the derived cost |
| Turbine name uniqueness and next index | Screen-wide variable | Project-wide, read from all turbines (D27) |
| Apply-to-all | Did not update each turbine's total height | Does |
| Delete a WTG type | Left land-lease costs behind | Removes them (D27) |
| Delete a PV type | Left the unit and did not recompute substructures cleanly | Removes the unit, recomputes substructure costs (G2) |
| Other Supplier on PV | Hidden field's stale value written | Written only for the "Other Supplier" module |
| Device cost | First row of any country | Project country first, then any (Q6) |
| Catalogue status filter | None | None (an earlier `statecode` filter was removed in D27) |
| Cancel before delete | After the O&M deletes | Before any delete (D97) |
| Substructure cancel | Sent the inverter module type | Sends substructure (D97) |
| Add Others / BESS / Hydrogen / Substation | Sub-menu | Flat items; Add Others does nothing |
| Save-blocked warning | None | New (D89, proposed) |
| Progress texts for deletes and status changes | Per-action texts | "Saving changes, please wait..." |
| Write speed | Sequential | Independent writes run in parallel, background reload (D99, not timed live) |
| Typos kept verbatim | | "Request permisson forg", "Delete PVModule Type?", "Please waiting...", "Value must be a integer" |

---

## 9. Tracing and tests

- **Console:** the global `[VSB]` logger covers every HTTP call, every read (rows, pages, ms) and every write (batched by kind and table). The flow calls print `[VSB] DATA execute flow Request Module Permission` and `… Request permission cancellation`. The screen itself logs nothing.
- **Gap:** the writes have no ACTION name of their own. They appear as `Write @ /project/generators`. One WTG type save, including its follow-up and the flow call, is one write action.
- **Tests:** `rules.test.ts` has about 35 groups (UT-GEN-001 to 156). `Screen.test.tsx` has UT-GEN-901 to 915 and covers the command bar, collapsed cards, single selection, the add, replace and PV jobs, delete order, the card Cancel and the lock and load-error states. They mock the hooks and the write mechanism. There is **no screen test** for the turbine panel, the pager or the height-limit pop-up.

---

## 10. Open points and risks

1. **No live click-through is recorded.** D27 says "not yet clicked through against VSBCloud_Dev", and D99's save speed has not been timed live.
2. **The approval flows have not been run live.** A first run sends real mails and approvals to the approval group. Use the test plan in `16-PM-FLOWS-IN-THE-CODE-APP.md` §7 first.
3. **Saves are not transactional.** A failure part-way leaves some rows written. The message tells how many changes were saved. A fully safe save would need a Dataverse custom API.
4. **Doc drift.** `Screen.tsx` and `rules.ts` have comments that contradict the code about Add Inverter and Add Substructure (section 4) and about permission flows. Doc 13 (line ~138) and the gap analysis predate D97. Doc 16 says the flow console line is `HTTP`, but the code prints `DATA`.
5. **Unreachable code:** the inverter and substructure panels, their save plans and the "Add Substructure information" dialog. Decide whether to delete them or bring the commands back.
6. **Replace panels:** no height-limit approval pop-up for a project manager, to be checked against the canvas.
7. **Roll-ups fire a server job.** Every save and delete writes a plant capacity column on the project, which triggers `LoadDevexCapexCostTotalCapacityTrigger` and creates a Fabric sync job row. The plans put the roll-up last, so a failed save does not change the totals.
8. **Product questions still open** (from the earlier gap analysis, not all closed): device cost by country, hub-height options filtered by turbine type only, the Substation permission defect, and whether the last-capacity pop-up text changed in canvas 1.21.753.
