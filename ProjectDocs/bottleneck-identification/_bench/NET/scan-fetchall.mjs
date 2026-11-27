// Throwaway static scan (NET audit): every fetchAll( call site in non-test src, flagging those with no `filter` text in the call.
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (f) => path.relative(root, f).split(path.sep).join("/");
const files = walk(root).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && !/^(generated|test)\//.test(rel(f)));
let total = 0;
let big5000 = 0;
const unfiltered = [];
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  let i = 0;
  while ((i = s.indexOf("fetchAll(", i)) >= 0) {
    total += 1;
    let depth = 0;
    let j = i + 8;
    for (; j < s.length; j += 1) {
      if (s[j] === "(") depth += 1;
      else if (s[j] === ")") { depth -= 1; if (depth === 0) break; }
    }
    const body = s.slice(i, j);
    if (/maxPageSize:\s*5000/.test(body)) big5000 += 1;
    if (!/\bfilter\b/.test(body)) {
      const line = s.slice(0, i).split("\n").length;
      unfiltered.push(`${rel(f)}:${line} ${(body.match(/"([^"]+)"/) || [])[1]}`);
    }
    i += 9;
  }
}
console.log(`fetchAll call sites: ${total}; with maxPageSize 5000: ${big5000}; without any filter text: ${unfiltered.length}`);
console.log(unfiltered.join("\n"));
