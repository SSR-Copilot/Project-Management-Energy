import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path";
const dir = process.argv[2];
const out = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".js"))) {
  const mp = path.join(dir, f + ".map");
  if (!fs.existsSync(mp)) continue;
  const m = JSON.parse(fs.readFileSync(mp, "utf8"));
  const srcs = m.sources.filter(s => !s.includes("node_modules"));
  const admin = srcs.filter(s => /features\/admin|features\/shared\/report-problem|SettingsAccordion|SettingsTabStrip|data\/admin|ReportProblem/i.test(s));
  if (!admin.length) continue;
  const buf = fs.readFileSync(path.join(dir, f));
  out.push({ f, raw: buf.length, gz: zlib.gzipSync(buf).length, nSrc: srcs.length, admin: admin.map(s => s.replace(/^.*src\//, "")).slice(0, 40) });
}
for (const o of out.sort((a,b)=>b.raw-a.raw)) console.log(JSON.stringify(o));
