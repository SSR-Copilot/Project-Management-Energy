// Throwaway (BND): per-call cost of the string work logHttp does before the console gate (copy of requestLog.ts shortUrl logic, lines 89-98).
function shortUrl(url, max = 180) { let text = url; try { const u = new URL(url, "https://host.invalid"); text = decodeURIComponent(`${u.pathname}${u.search}`).replace(/^\/(api\/data\/v\d+(\.\d+)?\/)?/, ""); } catch {} return text.length > max ? `${text.slice(0, max - 1)}…` : text; }
const url = "https://org.crm4.dynamics.com/api/data/v9.2/vsb_capexcosts?$select=vsb_capexcostid,vsb_name,vsb_amount&$filter=_vsb_project_value%20eq%2033b9cc79-5b4f-f111-bec6-000d3a3855c2%20and%20statecode%20eq%200&$top=500";
for (let w = 0; w < 5; w++) shortUrl(url);
const N = 200000; const s = performance.now(); let k = 0; for (let i = 0; i < N; i++) k += shortUrl(url).length; const ms = performance.now() - s;
console.log(`${N} calls: ${ms.toFixed(1)} ms total, ${(ms / N * 1000).toFixed(2)} us per call (checksum ${k})`);
