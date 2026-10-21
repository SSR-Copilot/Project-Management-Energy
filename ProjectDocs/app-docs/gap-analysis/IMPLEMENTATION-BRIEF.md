# Implementation brief: redeveloping one Admin/PM screen (agreed 19 Oct 2026)

Workspace root W = `Project-Management-Energy-WorkDev2/`. The code repo is `ProjectCosts-CodeApp/`; all docs are in `ProjectDocs/`. **Never create a doc file in the code repo.** Screens 001–003 are the worked examples: `src/features/admin/admin-default-checklists`, `admin-capex-accounts` and `admin-milestones`.

## Product-owner decisions (binding)

1. **Scope:** rules, UI, a LIVE Dataverse connection (reads and writes), and docs.
2. **Canvas parity is the default.**
   - Fix canvas bugs, and document each fix: mark it `SOURCE DEFECT` in `rules.ts` with the canvas original, keep a `…CanvasParity` twin and a test where numbers or behaviour are involved, and log it in the screen's D-entry.
   - Never reword a canvas string silently (rule 7).
   - Keep existing `data-testid` / `aria-label` values unless they are wrong against the canvas (rule 16). Leave per-row duplicate ids as they are (D16-c).
3. **Out of scope (D20):** every Apply / Apply All button, label and function, plus anything that exists only to serve Apply (for example a Fabric "recalculating" badge for Apply-created jobs, or `Apply and Apply All Trackings` writes). Remove them from the UI, and remove their dead rules and tests.
4. **Left out for now (pending, documented):**
   - **creating a project** — it fires the Teams/SharePoint site-creation flow;
   - **any action that starts an approval flow** that sends emails or Teams cards (gate/checklist approvals and cancellations, Generators module-permission request/cancel).

   Keep these controls visible but disabled, with a short reason tooltip if the kit allows. Do not call flows. Edits of existing rows ARE in scope.
5. **Fabric SQL sources ("Assumptions … SQL", D2):** keep these reads not connected. Render the empty state and a short notice; do not invent data.
6. **Server automation:** before writing hooks, read the verified section of `ProjectDocs/migration-plans/04-flow-inventory.md`.
   - Write exactly the rows, columns, write ORDER and Owning Business Unit the canvas writes.
   - Never redo a flow's or plugin's work in the client.
   - Say in the header of `hooks.ts` which flows and plugins the screen's writes fire.
7. **Hidden controls:** run `node ProjectDocs/tools/canvas-hidden-controls.js ProjectDocs/_extracted/msapp/projectmanagement/Src`. Every hidden button the screen calls with `Select()` is a subroutine; port its logic. Hidden fields whose values are read must be honoured.
8a. **Standard-assumption styling (PO, 20 Oct 2026; CONVENTIONS rule 20):** every value the canvas ties to an "is standard assumption" condition renders in `themePrimary` blue and italic while the condition holds. The condition can be:
    - an `Is … Standard Assumption?` column;
    - `IsStandardContract`;
    - a `locIsStandard…` variable;
    - a Description or Name that starts with "Standard".

    Use the shared style from `@/components`, and put the condition in `rules.ts` with a test.
8. **canEdit:** the admin screens use `useAdminAccess()` from `@/app/useCurrentUser`. PM screens follow their own canvas edit gates (project lock, `canEditSelectedProject` and so on) and the existing session data. Do not invent new permission rules.

## Code patterns to REUSE (CONVENTIONS rule 17 — never copy)

- **Reads:** put them in `src/data/<screenName>.ts`, using `fetchAll` / `fetchPage` (`@/data/client`) over the generated services.
  - Always set `$select`.
  - Filters come from `@/data/odata` (`eq`, `lookupEq`, `and`, `or`, `ne`, `gt`, `idIn`, `chunk`).
  - Map the rows to the `rules.ts` row types.
- **Query keys:** add them to `src/data/keys.ts` (`qk.*`), with a prefix key for invalidation.
- **Hooks:** put them in `hooks.ts`, using `useQuery`, and return `{ data, isLoading, error, connected: true }`.
- **Writes:** a `WritePlan` from `rules.ts`, run through `usePlanWrite` (`@/data/usePlanWrite`; it runs `data/executePlan.ts` in order).
  - Use `CREATED_ROW_ID` (`@/data/writePlan`) for "the row just created".
  - Pass the canvas progress, success and error texts in the job.
  - The UI shows them with `<WriteFeedback>` (`@/components`).
- **Privileges:** use `serverEnforcedProvider` from `@/platform/privileges` (Dataverse decides).
- **Owner bind key:** `"owningbusinessunit@odata.bind": "/businessunits(<id>)"`. Lowercase is the form the live cost screens use. For project-scoped tables, bind the project's business unit, as the canvas does.
- **UI kit:** `@/components`.
  - `FormPanel`, `PanelButtons`, `ConfirmDialog`, `EmptyState`, `LoadingOverlay`, `CommandBar` (icons include NumberedList, ActivateOrders and DeactivateOrders; add any missing canvas icon there), `CostField`, `CostSelect`, `Choices`, `TextField`, `NumericField`, `ReorderList`, `WriteFeedback`.
  - If the kit lacks a control, add it to `components/`.
- **Load-error state (rule 19):** use `EmptyState`.
- **Removed state:** remove `NotConnectedNotice` once the screen is connected.
- **Tables not registered:** register them with `pac code add-data-source -a dataverse -t <logicalName>`, **ONE AT A TIME**. Before and after each, count the `"primaryKey"` entries in `.power/schemas/appschemas/dataSourcesInfo.ts`: exactly one must be added and none dropped. Never hand-edit `.power/` or `src/generated/`. Read the column names from the generated model `src/generated/models/<Set>Model.ts`.

## Tests

- **`rules.test.ts`:** update tests that pinned wrong behaviour, and add tests for every fix.
- **`Screen.test.tsx`:**
  - mock `./hooks` with fixed rows;
  - mock `@/app/SessionContext` (and `@/app/useCurrentUser` if it is used);
  - assert the canvas captions and test ids, and the write job handed to `run` (progress text and plan).
- **Panel transitions:** re-query elements and wait (`waitFor` / `findBy…`), because panels re-render while they open.
- **`src/app/ScreenRoutes.test.tsx`:** when a screen becomes connected, add it to `CONNECTED_HEADING`, and mock its new `src/data/*.ts` module.

## Gates to run before you report (from `ProjectCosts-CodeApp/`)

```bash
npx tsc --noEmit -p tsconfig.app.json
npx oxlint src
node scripts/check-control-labels.mjs
node scripts/check-canvas-identities.mjs
npx vitest run src/features/<phase>/<slug> src/app/ScreenRoutes.test.tsx --testTimeout=60000
```

Do NOT run the full `npm run verify`; the coordinator runs it. Do NOT commit. Do NOT stop or start dev servers.

## Docs to update (in `ProjectDocs/` only)

- Append the screen's D-entry to `ProjectDocs/app-docs/02-OPEN-DECISIONS.md`, using the number you were given. Cover the scope, what was not ported and why, the corrections, the SOURCE DEFECTs fixed, the divergences, the tables registered, and the flow/plugin effects.
- Update `ProjectDocs/migration-plans/screens/0NN-*.md`:
  - section 12: the verified flows/plugins and any exclusions;
  - section 20: a status line pointing at the D-entry;
  - section 7: the tables, if changed.
- Update this screen's row in `ProjectDocs/app-docs/gap-analysis/README.md`.

## Blockers

If a decision cannot be defaulted from the rules above, implement everything else and LIST the open questions in your final report. Examples: a product rule the canvas leaves ambiguous, or a table or flow that is missing.
