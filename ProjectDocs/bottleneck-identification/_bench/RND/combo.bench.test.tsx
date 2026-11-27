// @vitest-environment jsdom
// RND bench 8: an OPEN Fluent Combobox with N Options (what focusing the German municipality box mounts, FE-P1-02b / RND-02).
import { describe, it } from "vitest";
import { act, render } from "@testing-library/react";
import { Combobox, FluentProvider, Option } from "@fluentui/react-components";
import { Profiler, useState } from "react";
import { vsbTheme } from "@/theme/fluent";

const opts = (n: number) => Array.from({ length: n }, (_, k) => <Option key={k} value={`u${k}`}>{`Municipality number ${k}`}</Option>);
function Box({ n, open }: { n: number; open: boolean }) {
  return <FluentProvider theme={vsbTheme}><Combobox aria-label="m" freeform open={open} value="" selectedOptions={[]}>{opts(n)}</Combobox></FluentProvider>;
}
async function mountOpen(n: number) {
  const t0 = performance.now();
  const v = render(<Box n={n} open />);
  await act(async () => {});
  const d = performance.now() - t0;
  v.unmount();
  return d;
}
describe("RND open combobox", () => {
  it("prints", async () => {
    await mountOpen(50);
    const out: string[] = [];
    for (const n of [200, 1000, 2000, 5000]) out.push(`open Combobox, ${n} Options: mount ${(await mountOpen(n)).toFixed(0)} ms, then ${(await mountOpen(n)).toFixed(0)} ms`);
    // per-keystroke: results replaced (new array of N)
    let upd = 0, c = 0;
    const view = render(<Profiler id="p" onRender={(_i, ph, a) => { if (ph === "update") { upd += a; c++; } }}><Box n={2000} open /></Profiler>);
    for (let i = 0; i < 4; i++) await act(async () => { view.rerender(<Profiler id="p" onRender={(_i, ph, a) => { if (ph === "update") { upd += a; c++; } }}><Box n={2000} open /></Profiler>); });
    out.push(`open Combobox 2000 Options re-render with a NEW options array (a new search result): ${(upd / Math.max(c, 1)).toFixed(0)} ms per commit`);
    view.unmount();
    console.log("\n" + out.join("\n"));
  });
});
