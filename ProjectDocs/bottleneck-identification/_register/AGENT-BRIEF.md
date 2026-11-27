# Stage 1 agent brief — bottleneck identification (READ-ONLY audit)

Worktree (the ONLY tree you may touch): `c:\Personal\Code App Mordenization\Project-Management-Energy-WorkDev1-BottleneckOptimization`
Branch `feature/bottleneck-identification-optimization`, base commit `dde9e92` (= `origin/RounakDev1`). App code: `ProjectCosts-CodeApp/` (React 19 + TS + Vite + Fluent v9 + TanStack Query on `@microsoft/power-apps`, live Dataverse).
`node_modules` is installed and a production build exists in `ProjectCosts-CodeApp/dist/` (with source maps).

## Hard rules
1. **Read-only audit.** Do NOT edit anything under `ProjectCosts-CodeApp/` (src, e2e, scripts, configs, tests, package files). Do not run git commands that change state (no add/commit/stash/checkout/reset/clean/push/fetch). Never touch the other worktree `c:\Personal\Code App Mordenization\Project-Management-Energy` (another session is using it).
2. You may write ONLY under `ProjectDocs/bottleneck-identification/` (your own files named in your assignment, and throwaway measurement scripts under `ProjectDocs/bottleneck-identification/_bench/<your-prefix>/`). Never write into `src/`.
3. No live Dataverse, no `pac`, no `pa app run`, no browser sign-in, no dev server. Anything needing the live environment is SUSPECTED unless a repo artifact (telemetry doc, probe doc, test) measures it.
4. Allowed measurement: reading code; `npm run bundle:report` / reading `dist/`; running a SINGLE existing vitest file or a throwaway script (`npx vitest run <file>` from `ProjectCosts-CodeApp/`, never the whole suite, never `npm run verify`); counting patterns with grep. Existing benchmark tests exist (e.g. `src/features/cost/add-costs-from-table/prepare.bench.test.ts`).
5. **Never fabricate numbers.** Distinguish MEASURED (you ran something; state the command and the output) from DERIVED (counted from code, e.g. "N sequential awaits") from ESTIMATED (reasoning). Label every finding:
   - **CONFIRMED** = reproduced and supported by a measurement you ran or a measurement recorded in a repo document (cite it);
   - **HIGH-CONFIDENCE** = strong source evidence and a traceable execution path, not measured;
   - **SUSPECTED** = plausible, needs instrumentation.
6. Business behaviour is out of scope for change; you are only finding where time/memory/requests are lost. Do not propose removing validations or business checks.

## Prior art — read before you start, do not redo it
This code is already past two optimisation programmes. Your value is what they MISSED or what is STILL true in the current code (verify against the current source; many were fixed).
- Frontend (D162): `ProjectDocs/app-docs/frontend-optimization/` (01–11) and older `ProjectDocs/app-docs/optimization/`.
- Dataverse/network (D165): `ProjectDocs/app-docs/dataverse-network-performance-optimization/` (00–35; 83 findings with IDs like CA-01, CB-03, PA-02, AD-01; 13 switches shipped OFF; doc 12 = register, doc 27 = tracker).
- Earlier perf decisions: D140 (react-spreadsheet context selector), D141/D142 (persisted reference data), D161 (Application Insights telemetry), D41–D46 (Project Overview pagination). Switches live in code as constants/flags; check whether each is ON or OFF in the current source before calling something fixed.
- Rules of the app: `ProjectDocs/instructions/CONVENTIONS.md`, `AGENT-GUIDE.md`.
When a finding was already raised by a prior programme, cite its ID and state its CURRENT status (fixed / switched OFF / open / regressed) after checking the code. Tag such rows `PRIOR:<id>`; new findings tag `NEW`.

## Output contract
A. Your narrative doc(s) (named in your assignment), Markdown, written for engineers: scope inspected (list the folders/files actually read — be honest about what you did not read), method, findings with `file:line` links, execution paths, evidence, what you checked and found NOT to be a bottleneck (important: avoid false positives; a "negative finding" list is valuable), limitations.
B. Your register file `ProjectDocs/bottleneck-identification/_register/<PREFIX>.md`: a header row + one row per finding, EXACTLY these 15 pipe-separated columns, one row per line, no line breaks inside a cell, no `|` inside a cell (use `/`):

`ID | Priority | Category | Screen | Source Location | Root Cause | Evidence | User Impact | Frequency | Severity | Confidence | Dependencies | Remediation Direction | Complexity | Risk | Validation | Origin`

(That is 16 columns including `Origin` = `NEW` or `PRIOR:<id>`.) ID format `<PREFIX>-NN`. Priority P0–P3 (P0 severe degradation/failure; P1 high impact on important screens or critical journeys; P2 moderate measurable; P3 minor) — do not rank by code complexity alone. Category from: CPU-bound, Network-bound, Dataverse-bound, Rendering-bound, Memory-bound, I/O-bound, Architecture-bound, Data-bound, Initialization-bound, Concurrency-bound (a finding may list several, joined by `+`). Confidence = CONFIRMED / HIGH / SUSPECTED. Complexity and Risk = Low/Medium/High. Screen = screen name(s) or `Cross-cutting`. Evidence must cite file:line and say MEASURED/DERIVED/ESTIMATED.
C. Your final reply to the orchestrator: at most 350 words: files written, finding counts by priority and confidence, your top 5 findings (ID + one line), what you could not inspect or measure. Do not paste the register into the reply.

Be selective: 10–30 well-evidenced findings beat 80 shallow ones. Open the code; do not infer from file names.
