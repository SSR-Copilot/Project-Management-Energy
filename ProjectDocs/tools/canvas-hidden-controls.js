// node hidden.js <Src dir> [screenFile] — finds hidden controls that still matter.
// Hidden = Visible is literally false, or the control sits under a literally-hidden parent.
// It "matters" if: it is Select()ed / Reset()ed / SetFocus()ed, its properties are read by
// another formula, it is a Timer, or it is a component instance (cmp_*) with behaviour props.
const fs = require("fs"), path = require("path");
const [dir, only] = process.argv.slice(2);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".pa.yaml") && !f.startsWith("_") && (!only || f === only));
for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/);
  // control headers look like:  "- ctlName:" followed by "Control: Type@ver"
  const ctls = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)- (['"]?)([^:'"]+)\2:\s*$/);
    if (m && /^\s*Control:\s*(\S+)/.test(lines[i + 1] ?? "")) {
      ctls.push({ name: m[3].trim(), indent: m[1].length, line: i + 1, type: lines[i + 1].match(/Control:\s*(\S+)/)[1], props: {} });
    }
  }
  // collect each control's direct properties (Visible etc.) by scanning until next control
  for (let c = 0; c < ctls.length; c++) {
    const end = c + 1 < ctls.length ? ctls[c + 1].line - 1 : lines.length;
    for (let i = ctls[c].line; i < end; i++) {
      const p = lines[i].match(/^\s+(Visible|OnTimerEnd|AutoStart|Duration|Repeat):\s*(.*)$/);
      if (p && ctls[c].props[p[1]] === undefined) ctls[c].props[p[1]] = p[2].trim();
    }
  }
  // parent chain via indentation
  const stack = [];
  for (const c of ctls) {
    while (stack.length && stack[stack.length - 1].indent >= c.indent) stack.pop();
    c.parentHidden = stack.some((s) => s.hidden);
    c.hidden = /^=\s*false\s*$/i.test(c.props.Visible ?? "") || c.parentHidden;
    c.condVisible = c.props.Visible && !/^=\s*(true|false)\s*$/i.test(c.props.Visible);
    stack.push(c);
  }
  const live = strip(lines.join("\n"));
  const report = [];
  for (const c of ctls) {
    const n = c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sel = (live.match(new RegExp(`\\b(Select|Reset|SetFocus)\\(\\s*'?${n}'?\\s*[),]`, "g")) || []).length;
    const refs = (live.match(new RegExp(`(?<![\\w])'?${n}'?\\.(\\w+)`, "g")) || []).filter((r) => !/\.(X|Y|Width|Height)$/.test(r));
    const reads = new Set(refs.map((r) => r.split(".").pop()));
    const isTimer = /^Timer/i.test(c.type);
    const isCmp = /^cmp_|Component/i.test(c.type) || /^cmp_/.test(c.name);
    if (c.hidden && (sel || reads.size || isTimer || isCmp))
      report.push(`  HIDDEN  ${c.name} [${c.type}] L${c.line}${c.parentHidden ? " (parent hidden)" : ""}  Select/Reset:${sel}  reads:${[...reads].join(",") || "-"}${isTimer ? "  TIMER" : ""}`);
    else if (!c.hidden && isTimer) report.push(`  TIMER   ${c.name} L${c.line} visible=${c.props.Visible ?? "default"} autostart=${c.props.AutoStart ?? "-"}`);
    else if (c.condVisible && sel) report.push(`  COND    ${c.name} [${c.type}] L${c.line} Select/Reset:${sel} Visible${c.props.Visible.slice(0, 80)}`);
  }
  const hiddenCount = ctls.filter((c) => c.hidden).length;
  console.log(`\n## ${f.replace(".pa.yaml", "")} — ${ctls.length} controls, ${hiddenCount} hidden, ${report.length} that still matter`);
  report.forEach((r) => console.log(r));
}
