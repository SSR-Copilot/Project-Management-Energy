// Throwaway micro-benchmark (NET audit). Measures the per-call CPU cost of the console-trace layer that every request passes through.
// requestLog.ts / consoleGate.ts are VERBATIM copies of src/platform/*.ts except: the import specifier gained ".ts" and
// `import.meta.env.MODE === "test"` became `false` (so the module runs under plain Node). Nothing else differs.
import { logHttp, logData, beginAction, flushDataLog, redactIds } from "./copy/requestLog.ts";
import { applyEnvironmentName } from "./copy/consoleGate.ts";

const guids = Array.from({ length: 40 }, (_, i) => `${(i + 1).toString(16).padStart(8, "0")}-aaaa-4bbb-8ccc-${(i * 7919).toString(16).padStart(12, "0")}`);
const longUrl = "https://org.crm4.dynamics.com/api/data/v9.2/vsb_capexcosts?$select=vsb_capexcostid,_vsb_contract_value,vsb_year,vsb_month,vsb_cost,vsb_costpaid&$filter=" +
  guids.map((g) => `_vsb_contract_value eq ${g}`).join(" or ");
const metric = { method: "GET", url: longUrl, statusCode: 200, duration: 320, responseSize: 48213 };

function time(label, n, fn) {
  for (let i = 0; i < 2000; i += 1) fn(i); // warm-up
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i += 1) fn(i);
  const ns = Number(process.hrtime.bigint() - t0);
  console.log(`${label}: ${n} calls, total ${(ns / 1e6).toFixed(1)} ms, ${(ns / n / 1000).toFixed(2)} us/call`);
}

const out = [];
const realInfo = console.info; const realWarn = console.warn;
console.info = (...a) => { out.push(a); }; console.warn = (...a) => { out.push(a); };

console.log(`URL length ${longUrl.length} chars; node ${process.version}`);
for (const mode of ["Prod (gate closed)", "non-Prod (gate open, console stubbed to an array push)"]) {
  applyEnvironmentName(mode.startsWith("Prod") ? "Prod" : "Dev");
  // the gate stays closed once closed, so run Prod first (it is the first iteration) and non-Prod needs a fresh process; see runner
  console.log(`--- ${mode}`);
  time("logHttp (3.4 kB URL)", 20000, () => logHttp(metric));
  time("logData (5 targets)", 20000, (i) => logData({ kind: "read", target: `t${i % 5}`, rows: 10, pages: 1, ms: 120, ok: true }));
  flushDataLog();
  time("beginAction+end with 1 open peer", 20000, () => { const end = beginAction("Load [\"cost-book\",\"" + guids[3] + "\",0]"); end(true); });
  time("redactIds on a 90-char key", 20000, () => redactIds(`["cost-book","${guids[3]}",0]`));
  // logHttp while many actions are open (every TanStack fetch opens one): cost is O(open scopes)
  const open = Array.from({ length: 30 }, (_, i) => beginAction(`Load ${i}`));
  time("logHttp with 30 open actions", 20000, () => logHttp(metric));
  open.forEach((e) => e(true));
  break; // one mode per process
}
console.info = realInfo; console.warn = realWarn;
console.log("(lines captured by the stub: " + out.length + ")");
