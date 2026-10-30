# Session handoff — 29 Oct 2026 (end of day)

Branch `Feature2810`, everything since `4afc364` is **uncommitted**. A draft commit message was prepared in the chat; commit needs `npm run verify`, the E2E-parity question and the user's approval.

## Done today
- Playwright parity suite (`ProjectCosts-CodeApp/e2e/`, Canvas first), reports `E2E-PARITY-REPORT-2026-10-28/29.md` and `E2E-PARITY-REPORT-APPSETTINGS-2026-10-29.md`.
- Application Settings parity fixes: Milestones, Check List, Project Gates, CAPEX Accounts, Costs, Contracts (D65).
- Browser-language number/date formatting (D61–D64).
- Request log in the console, every build (D66) + troubleshooting aids: action ids, ERROR lines, SLOW flag, unhandled errors (D68). CONVENTIONS rule 23 / AGENT-GUIDE item 7.
- Add Cost from Table "Show all years" switch, default current year (D67).
- Decision numbers used: up to D68. Next free: D69 (reserved for the spinner delay rule if approved). Change log up to A34.

## Open for tomorrow
- Run `npm run verify` (blocked locally by `check:power`: regenerate `.power/` for the 8 data sources, D54), then ask about the E2E run, then commit approval.
- Parity items still open: country rail default (Canvas collapsed, code app expanded), grey vs blue section chevrons on Costs/Contracts, CAPEX row-open layout and command colours, Costs DEVEX table, Gates row heights and the tasks shown under "Cluster 1 to Cluster 2", Milestones country-open and Contracts card-open test steps.
- Add Cost year view: product owner to confirm the default (current year vs all years); measure click/Tab timing in the browser. A virtualized grid is still the real fix for the all-years view.
- Spinners: audit found every loader is a real server wait; the user said leave it for now. Proposal kept: delayed show (~300 ms) and Planning's whole-page card to inline (D69).
- Not built, by choice: "Report a problem" copy button, `?debug=1` facts line.
- Console log not yet seen in a browser after the D68 changes: check `[VSB]` lines on a save.
