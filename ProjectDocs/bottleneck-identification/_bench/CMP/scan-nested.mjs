// Throwaway static scan (read-only): finds array lookups (.find/.filter/.some/.includes/.indexOf/.findIndex)
// that sit inside a loop/iteration callback within the next 6 lines. Heuristic: DERIVED candidates only.
import fs from "node:fs";
import path from "node:path";
const root = process.argv[2];
const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) {
  const p = path.join(d,e.name);
  if (e.isDirectory()) { if (!/node_modules|generated|test$/.test(e.name)) walk(p); }
  else if (/\.(ts|tsx|js)$/.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name)) files.push(p);
}})(root);
const loop = /(\.(map|forEach|flatMap|reduce|filter|some|every)\(\s*(\(|\w+\s*=>)|\bfor\s*\(|\bwhile\s*\()/;
const look = /\.(find|filter|some|every|includes|indexOf|findIndex|lastIndexOf)\(/;
const out = [];
for (const f of files) {
  const lines = fs.readFileSync(f,"utf8").split(/\r?\n/);
  for (let i=0;i<lines.length;i++) {
    if (!loop.test(lines[i]) || /^\s*(\/\/|\*)/.test(lines[i])) continue;
    for (let j=i+1;j<=Math.min(i+6,lines.length-1);j++) {
      if (/^\s*(\/\/|\*)/.test(lines[j])) continue;
      if (look.test(lines[j])) { out.push(`${path.relative(root,f)}:${i+1}->${j+1}  ${lines[j].trim().slice(0,110)}`); break; }
    }
  }
}
const byFile = {};
for (const o of out) { const k=o.split(":")[0]; (byFile[k]??=[]).push(o); }
console.log("total", out.length);
for (const [k,v] of Object.entries(byFile).sort((a,b)=>b[1].length-a[1].length)) console.log(v.length, k);
fs.writeFileSync("scan-nested.out.txt", out.join("\n"));
