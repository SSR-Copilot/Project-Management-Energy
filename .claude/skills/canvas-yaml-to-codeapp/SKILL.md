---
name: canvas-yaml-to-codeapp
description: Read a Power Apps canvas `.pa.yaml` screen/component properly and translate it into this workspace's Power Apps code app (React 19 + TypeScript + Vite + Fluent v9 on Dataverse via @microsoft/power-apps). Use before building or changing any screen, control, rule or data hook in ProjectCosts-CodeApp, when porting Power Fx to TypeScript, when checking a module's technical requirements against its canvas YAML, or when asked about Power Fx, Power Apps, code apps, Dataverse, React, TypeScript, Vite or Vue in this project.
---

# Canvas YAML → Power Apps code app

The source of truth is `ProjectDocs/_extracted/msapp/<projectmanagement|projectcosts>/Src/<Screen>.pa.yaml`
plus `Src/Components/*.pa.yaml` and `Src/App.pa.yaml`. The target is `ProjectCosts-CodeApp/`.
Rules live in `ProjectDocs/instructions/CONVENTIONS.md`; porting steps in `MIGRATION-STRATEGY.md`.
Run the four-item pre-build checklist (`CONVENTIONS.md`, "Before every build") every time.

## 1. Read the YAML properly

- The structure is `Screens: <Screen Name>: Properties:` (screen-level `OnVisible`, `OnHidden`, `Fill`),
  then `Children:`, a tree of `- <ControlName>: Control: <Type>@<ver>`, with `Properties:` and its
  own `Children:`. The control name is the `data-testid`.
- Property values are Power Fx after `=`. With `|`, `|-` or `|+` block scalars, the whole block
  is one formula. Read it to the end; never stop at the first line.
- **Skip `/* … */` and `//` commented formulas.** Port only the live one (rule 10).
- Resolve every name a formula uses:
  - `gbl*` (globals set in `App.pa.yaml` `OnStart` or another screen's `Set()`);
  - `loc*` (`UpdateContext`, screen state);
  - `col*` (`ClearCollect` / `Collect`, cached data);
  - component inputs and outputs (`Components/`);
  - data sources (quoted table display names such as `'BoP Projects Contracts'`).
- Map every table and column display name to its logical name with
  `ProjectDocs/reference/dataverse-attributes.json` / `dataverse-entities.json` and
  `src/data/dataverseNames.ts`. Never guess a logical name.
- Record `AccessibleLabel` exactly as written. It becomes the `aria-label`, verbatim (rule 16).
  If it is unset, use the visible caption.

## 2. Requirements list (write it before coding)

For the module, list each of the following with its canvas `Control.Property` citation:
- **Data:** tables, `$select` columns, filters, sort order, lookups. Also the writes: `Patch`, `Remove` and `Collect` payloads, and the order they run in.
- **Behaviour:** `OnVisible` load sequence, `OnSelect` / `OnChange` actions, `Navigate` targets and params.
- **State:** `DisplayMode`, `Visible` and `ItemEnabled` gates. Validation messages and `Notify` texts.
- **UI:** captions, tooltips, placeholders, column headers (verbatim, rule 7), theme values (`gblAppStyles` → `src/theme/tokens.ts`).
- **Divergences:** anything that will not be ported as-is. Mark it `SOURCE DEFECT:` / `DIVERGENCE:` and log it in `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` (rule 8).

After building, tick each item against the code and tests. Anything unticked is a gap. Report it; don't drop it silently.

## 3. Where each part goes (React + TypeScript)

| Canvas | Code app |
|---|---|
| Decisions, validation, totals, `If`/`Switch` logic, payload shaping | `features/<phase>/<slug>/rules.ts`: pure functions, no React or SDK. Plus `rules.test.ts` (`UT-<SCREEN>-NNN`) |
| `ClearCollect(col, Filter(T, …))`, `LookUp`, `Patch`, `Remove` | `hooks.ts`: TanStack Query `useQuery` / `useMutation` over the generated services. Use `fetchAll`, `fetchPage`, `countedPage` and `deleteRecord` (`@/data/client`), wrap results in `unwrap` (`@/platform/errors`), and build filters with `@/data/odata` (`eq`, `lookupEq`, `and`, `inList`, `idIn`, `bind`, `dateOnly`, `ACTIVE`). Always set `$select` (rule 1); never materialise a whole table (rule 2) |
| `UpdateContext` / `loc*` | `useState` / `useReducer` in `Screen.tsx` (or derived with `useMemo`) |
| `gbl*` session values | `SessionContext` / app providers in `src/app/` |
| `col*` caches | query cache keys (`@/data/keys`), not hand-made arrays |
| Galleries, forms, panels, pop-ups | `@/components`: `CommandBar`, `FormPanel`, `ConfirmDialog`, `EmptyState`, `LoadingOverlay`, `CostField`, `CostSelect`, `Choices`, `PanelButtons`, `TextField`, `NumericField`, etc. Search there first (rule 17) |
| `Navigate(Screen, …)` | `react-router-dom` routes (`src/app/`), `?projectId=` deep link |
| `DisplayMode.Disabled` / `Visible` | `disabled` / conditional render, with the decision coming from `rules.ts` |
| `Notify(…)` / error banners | the error state from `unwrap` → `EmptyState` / message bar (rule 19) |

Power Fx → TypeScript reminders:
- `IsBlank(x)` also covers `""`.
- `Round`, `RoundDown` and `RoundUp` differ, so port the exact one.
- `Text(n, "#,##0")` is locale-sensitive.
- `DateAdd` and `DateDiff` take units.
- `Coalesce` is not `??` (it also skips `""`).
- `First(Filter(...))` → `.find`.
- `Sum(Filter(...), col)` → reduce over numbers made with `numberOf`.
- `With({...})` → local consts.
- `Concurrent` → `Promise.all`.
- `ForAll(… Patch …)` → a `WritePlan` (`@/data/writePlan`) executed in order.
- Date-only values use `dateOnly`, never `toISOString()` (rule 18).

## 4. Power Apps code app / Dataverse / Vite facts for this repo

- Data sources are registered with `pac code add-data-source -a dataverse -t <logical>`. After each one, diff `.power/schemas/appschemas/dataSourcesInfo.ts`.
- `src/generated/` and `.power/` are pac output and must never be edited (rule 9).
- Every create on a project-scoped table writes `OwningBusinessUnit@odata.bind` (rule 4).
- Delete paths surface SDK failures (rule 14).
- Vite: dev on port 3000 (`strictPort`), `base: "./"`, build to `dist/` (required by `power.config.json`). Run locally with `npm run dev` plus `pac code run --appUrl http://localhost:3000`.
- Not-yet-connected screens return `notConnected()` (`@/data/notConnected`) with their `TABLES` listed.

## 5. Vue

This app is **React**. Do not add Vue to `ProjectCosts-CodeApp/`. If a Vue target is ever
requested explicitly, the same split applies:
- `rules.ts` is reused unchanged (it is framework-free);
- `hooks.ts` becomes composables (`@tanstack/vue-query`);
- `useState` becomes `ref` / `reactive`, and `useMemo` becomes `computed`;
- JSX becomes SFC templates, keeping the same `aria-label` / `data-testid`.

## 6. Finish

`npm run verify` from `ProjectCosts-CodeApp/`. Add a new feature folder to `MODULES` in
`scripts/check-canvas-identities.mjs`. Then show the change and **wait for the user's approval
before any commit**.
