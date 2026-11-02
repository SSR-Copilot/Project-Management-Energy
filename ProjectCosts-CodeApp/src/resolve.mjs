import fs from "node:fs";
/** resolve(file, [choice per hunk]) — choice: "ours" | "theirs" | "both" | string (custom text, no trailing newline). */
export function resolve(file, choices, after) {
  let s = fs.readFileSync(file, "utf8"); const crlf = s.includes("\r\n"); if (crlf) s = s.replace(/\r\n/g, "\n");
  let i = 0;
  s = s.replace(/<<<<<<< [^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]*\n/g, (_m, ours, theirs) => {
    const c = choices[i++];
    if (c === undefined) throw new Error(`${file}: no choice for hunk ${i}`);
    if (typeof c === "function") return c(ours, theirs);
    if (c === "ours") return ours;
    if (c === "theirs") return theirs;
    if (c === "both") return ours + theirs;
    return c.endsWith("\n") ? c : c + "\n";
  });
  if (i !== choices.length) throw new Error(`${file}: ${i} hunks, ${choices.length} choices`);
  if (after) after((o, n) => { if (s.split(o).length !== 2) throw new Error(`${file}: no unique match ${o.slice(0, 60)}`); s = s.replace(o, () => n); });
  if (crlf) s = s.replace(/\n/g, "\r\n"); fs.writeFileSync(file, s); console.log("resolved", file, i);
}
