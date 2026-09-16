# DEVEX/CAPEX renderer port

Source: `Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF`, commit `5f12280`.
The renderer, dropdown, parser, and CSS are the supplied control implementation. TypeScript
was transpiled to JavaScript to isolate its PCF-specific ambient types from the Code App.
The React-facing boundary is typed in `PcfGrid.tsx` and the two declaration files.

`scripts/read-pcf-port.mjs` prints the reproducible port for application with apply_patch.
Two integration fixes scope the rerender event and comment-dot lookup to the owning grid.
The adapter supplies numeric values (avoiding locale-dependent string parsing), explicit
all-years totals, valid positive dimensions, and per-instance cleanup. Dataset values are
supplied by the application; this renderer performs no Dataverse writes.
