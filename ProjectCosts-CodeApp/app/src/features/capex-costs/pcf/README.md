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

A third replacement is a PERFORMANCE fix, not an integration one. Upstream
`formatCostValue` constructs an `Intl.NumberFormat` per grid cell — twice for a month cell,
which also builds an aria-label — i.e. ~27 constructions per row, at ~80 µs each: 266 ms of
a 100-row render and 772 ms at 300 rows, against 10 ms and 29 ms with one pooled formatter.
The browser's language list is still re-read on every call, so a host that changes it gets a
fresh formatter, and `Intl.NumberFormat` carries no per-call state, so the output is
byte-identical. `../pcfGridFormat.test.ts` pins that against the upstream implementation.
The script throws rather than silently no-opping if upstream moves the code it patches.
