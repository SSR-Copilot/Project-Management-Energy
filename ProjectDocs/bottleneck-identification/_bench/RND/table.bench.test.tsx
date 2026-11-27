// @vitest-environment jsdom
// RND bench 3: mount / update cost of the Overview-shaped Fluent Table (200 rows x 12 cells), and a plain <table> of the same shape.
import { describe, it } from "vitest";
import { act, render } from "@testing-library/react";
import { FluentProvider, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@fluentui/react-components";
import { Profiler, memo } from "react";
import { vsbTheme } from "@/theme/fluent";

type Row = { id: string; name: string; short: string; status: string; manager: string; country: string; area: string; tech: string; cap: string; pid: string };
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `id${i}`, name: `Project ${i}`, short: `P${i}`, status: "Planning", manager: "Some Manager", country: "Germany", area: "Bavaria", tech: "Wind", cap: "12.5", pid: `DE-${i}` }));

const FluentRow = memo(function FluentRow({ row, selected }: { row: Row; selected: boolean }) {
  return (
    <TableRow aria-selected={selected}>
      <TableCell><input type="radio" name="s" checked={selected} onChange={() => {}} aria-label="s" /></TableCell>
      <TableCell><span /></TableCell>
      <TableCell>{row.name}</TableCell><TableCell>{row.short}</TableCell><TableCell>{row.status}</TableCell><TableCell>{row.manager}</TableCell>
      <TableCell>{row.country}</TableCell><TableCell>{row.area}</TableCell><TableCell>{row.tech}</TableCell><TableCell>{row.cap}</TableCell>
      <TableCell>{row.pid}</TableCell><TableCell><span role="img" aria-label="ok" /></TableCell>
    </TableRow>
  );
});
const PlainRow = memo(function PlainRow({ row, selected }: { row: Row; selected: boolean }) {
  return (
    <tr aria-selected={selected}>
      <td><input type="radio" name="s" checked={selected} onChange={() => {}} aria-label="s" /></td><td><span /></td>
      <td>{row.name}</td><td>{row.short}</td><td>{row.status}</td><td>{row.manager}</td><td>{row.country}</td><td>{row.area}</td><td>{row.tech}</td><td>{row.cap}</td><td>{row.pid}</td><td><span role="img" aria-label="ok" /></td>
    </tr>
  );
});

function timeMount(el: () => JSX.Element): number {
  const t0 = performance.now();
  const v = render(el());
  const d = performance.now() - t0;
  v.unmount();
  return d;
}

describe("RND table", () => {
  it("prints", () => {
    const data = rows(200);
    const fluent = (sel: string) => <FluentProvider theme={vsbTheme}><Table size="small" aria-label="P"><TableHeader><TableRow>{Array.from({ length: 12 }, (_, i) => <TableHeaderCell key={i}>H{i}</TableHeaderCell>)}</TableRow></TableHeader><TableBody>{data.map((r) => <FluentRow key={r.id} row={r} selected={r.id === sel} />)}</TableBody></Table></FluentProvider>;
    const plain = (sel: string) => <table><tbody>{data.map((r) => <PlainRow key={r.id} row={r} selected={r.id === sel} />)}</tbody></table>;
    timeMount(() => fluent("id1")); // warm module / griffel caches
    const f = [1, 2, 3].map(() => timeMount(() => fluent("id1")));
    const p = [1, 2, 3].map(() => timeMount(() => plain("id1")));
    // selection change with memo rows
    let upd = 0, commits = 0;
    const view = render(<Profiler id="t" onRender={(_i, ph, a) => { if (ph === "update") { upd += a; commits++; } }}>{fluent("id1")}</Profiler>);
    for (let i = 2; i < 12; i++) act(() => { view.rerender(<Profiler id="t" onRender={(_i, ph, a) => { if (ph === "update") { upd += a; commits++; } }}>{fluent(`id${i}`)}</Profiler>); });
    view.unmount();
    console.log(`\nFluent Table 200x12 mount (jsdom, dev): ${f.map((x) => x.toFixed(0)).join(" / ")} ms\nPlain <table> 200x12 mount: ${p.map((x) => x.toFixed(0)).join(" / ")} ms\nselection change (memo rows, 2 rows re-render) render time: ${(upd / commits).toFixed(2)} ms per commit`);
  });
});
