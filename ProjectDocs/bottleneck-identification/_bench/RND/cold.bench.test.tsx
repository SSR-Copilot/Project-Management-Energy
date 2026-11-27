// @vitest-environment jsdom
// RND bench 6: first-ever mount (Griffel runtime style generation + first hook paths) vs second mount, per component family.
import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { FluentProvider, Button, Table, TableBody, TableRow, TableCell, Dialog, DialogSurface, Dropdown, Option } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { TextField, CostField, FormPanel, ConfirmDialog, PanelButtons, AppShell } from "@/components";
import { MemoryRouter } from "react-router-dom";

const t = (f: () => void) => { const s = performance.now(); f(); return performance.now() - s; };
const mountOnce = (el: () => JSX.Element) => { const v = render(<MemoryRouter><FluentProvider theme={vsbTheme}>{el()}</FluentProvider></MemoryRouter>); v.unmount(); };

describe("RND cold vs warm", () => {
  it("prints", () => {
    const fams: [string, () => JSX.Element][] = [
      ["FluentProvider+Button", () => <Button>x</Button>],
      ["TextField x20", () => <>{Array.from({ length: 20 }, (_, i) => <TextField key={i} label="l" value="v" onChange={() => {}} />)}</>],
      ["CostField x20", () => <>{Array.from({ length: 20 }, (_, i) => <CostField key={i} label="l" value="v" onChange={() => {}} />)}</>],
      ["Dropdown x5", () => <>{Array.from({ length: 5 }, (_, i) => <Dropdown key={i} value="a" selectedOptions={["a"]}><Option value="a">a</Option></Dropdown>)}</>],
      ["Table 20x12", () => <Table><TableBody>{Array.from({ length: 20 }, (_, r) => <TableRow key={r}>{Array.from({ length: 12 }, (_, c) => <TableCell key={c}>x</TableCell>)}</TableRow>)}</TableBody></Table>],
      ["FormPanel (open) + PanelButtons", () => <FormPanel open title="T" onDismiss={() => {}} actions={{ canSave: true, onSave: () => {} }}><TextField label="a" value="" onChange={() => {}} /></FormPanel>],
      ["ConfirmDialog (open)", () => <ConfirmDialog open title="T" description="d" onConfirm={() => {}} onCancel={() => {}} />],
      ["AppShell (no rail)", () => <AppShell showRail={false}><div /></AppShell>],
    ];
    const rows = fams.map(([n, el]) => { const a = t(() => mountOnce(el)); const b = t(() => mountOnce(el)); const c = t(() => mountOnce(el)); return `${n}: 1st ${a.toFixed(1)} ms, 2nd ${b.toFixed(1)} ms, 3rd ${c.toFixed(1)} ms`; });
    console.log("\n" + rows.join("\n"));
  });
});
