// node flows.js <WorkflowsDir> — prints trigger + Dataverse tables per flow
const fs = require("fs"), path = require("path");
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const def = j.properties?.definition ?? j.definition ?? {};
  const out = { triggers: [], reads: new Set(), writes: new Set(), calls: new Set(), other: new Set() };
  for (const [name, t] of Object.entries(def.triggers ?? {})) {
    const p = t.inputs?.parameters ?? {};
    const op = t.inputs?.host?.operationId ?? t.type;
    const msg = { 1: "Create", 2: "Delete", 3: "Create/Delete", 4: "Update", 5: "Create/Update", 6: "Delete/Update", 7: "Create/Update/Delete" }[p["subscriptionRequest/message"]] ?? "";
    out.triggers.push(`${op}${p["subscriptionRequest/entityname"] ? ` on ${p["subscriptionRequest/entityname"]} [${msg}]` : ""}${p["subscriptionRequest/filteringattributes"] ? ` cols=${p["subscriptionRequest/filteringattributes"]}` : ""}${p["subscriptionRequest/filterexpression"] ? ` filter=${p["subscriptionRequest/filterexpression"]}` : ""}`);
  }
  const walk = (acts) => {
    for (const a of Object.values(acts ?? {})) {
      const op = a.inputs?.host?.operationId, p = a.inputs?.parameters ?? {}, ent = p.entityName;
      if (op && ent) {
        if (/^(ListRecords|GetItem|GetRelatedRecords)/i.test(op)) out.reads.add(ent);
        else if (/(Create|Update|Delete|Upsert|Associate|Disassociate|PerformBound|PerformUnbound)/i.test(op)) out.writes.add(`${ent}:${op.replace("Record", "")}`);
        else out.other.add(`${ent}:${op}`);
      } else if (op && !/^(ListRecords|GetItem)/.test(op)) out.calls.add(op);
      if (a.type === "Workflow") out.calls.add("child flow");
      walk(a.actions); walk(a.else?.actions);
      for (const c of Object.values(a.cases ?? {})) walk(c.actions);
    }
  };
  walk(def.actions);
  console.log(`\n## ${f.replace(/-[0-9A-F-]{36}\.json$/, "")}`);
  console.log(`  trigger: ${out.triggers.join(" | ")}`);
  console.log(`  reads:   ${[...out.reads].sort().join(", ") || "-"}`);
  console.log(`  writes:  ${[...out.writes].sort().join(", ") || "-"}`);
  console.log(`  other:   ${[...out.calls, ...out.other].sort().join(", ") || "-"}`);
}
