// @vitest-environment jsdom
// RND bench 2: per-instance RENDER cost of shared primitives (jsdom + React 19 DEV build; relative numbers only, not browser ms).
import { describe, it } from "vitest";
import { act, render } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { Profiler, useState, type ReactNode } from "react";
import { vsbTheme } from "@/theme/fluent";
import { TextField, CostField, FormPanel, ConfirmDialog, CostSelect, DateField } from "@/components";
import { AppHeader } from "@/components/AppHeader";
import { MemoryRouter } from "react-router-dom";

const wrap = (c: ReactNode) => <FluentProvider theme={vsbTheme}>{c}</FluentProvider>;
const noop = () => {};

/** Sums React Profiler `actualDuration` (ms of render work in the subtree) over `reps` forced re-renders. */
function measure(make: (tick: number) => ReactNode, reps = 30) {
  let total = 0, commits = 0;
  const onRender = (_id: string, phase: string, actual: number) => { if (phase === "update") { total += actual; commits += 1; } };
  const view = render(wrap(<Profiler id="x" onRender={onRender}>{make(0)}</Profiler>));
  // warm-up
  for (let i = 1; i <= 5; i++) act(() => { view.rerender(wrap(<Profiler id="x" onRender={onRender}>{make(i)}</Profiler>)); });
  total = 0; commits = 0;
  for (let i = 10; i < 10 + reps; i++) act(() => { view.rerender(wrap(<Profiler id="x" onRender={onRender}>{make(i)}</Profiler>)); });
  view.unmount();
  return total / Math.max(commits, 1);
}

describe("RND shared primitive render cost", () => {
  it("prints", async () => {
    const out: string[] = [];
    const N = 50;
    out.push(`TextField (Fluent Field+Input) x${N}: ${measure((t) => <>{Array.from({ length: N }, (_, i) => <TextField key={i} label={`L${i}`} value={`v${t}`} onChange={noop} testId={`t${i}`} />)}</>).toFixed(2)} ms / re-render`);
    out.push(`CostField (plain <input>) x${N}: ${measure((t) => <>{Array.from({ length: N }, (_, i) => <CostField key={i} label={`L${i}`} name={`n${i}`} value={`v${t}`} onChange={noop} />)}</>).toFixed(2)} ms / re-render`);
    out.push(`CostSelect (Fluent Dropdown, 10 options) x${N}: ${measure((t) => <>{Array.from({ length: N }, (_, i) => <CostSelect key={i} label={`L${i}`} value={"a"} options={["a","b","c","d","e","f","g","h","i","j"]} onChange={noop} testId={`s${i}`} />)}</>).toFixed(2)} ms / re-render (tick ${0})`);
    out.push(`DateField x${20}: ${measure((t) => <>{Array.from({ length: 20 }, (_, i) => <DateField key={i} label={`D${i}`} value={"2026-01-05"} onChange={noop} testId={`d${i}`} />)}</>).toFixed(2)} ms / re-render`);
    const panels = (k: number) => (t: number) => <>{Array.from({ length: k }, (_, i) => (
      <FormPanel key={i} open={false} title={`P${i}`} onDismiss={noop} dirty={t % 2 === 0}><div>body</div></FormPanel>
    ))}</>;
    out.push(`closed FormPanel x5 (Finance has 5): ${measure(panels(5)).toFixed(2)} ms / re-render`);
    out.push(`closed FormPanel x1: ${measure(panels(1)).toFixed(2)} ms / re-render`);
    const dialogs = (k: number) => (t: number) => <>{Array.from({ length: k }, (_, i) => (
      <ConfirmDialog key={i} open={false} title="T" description={`d${t}`} onConfirm={noop} onCancel={noop} />
    ))}</>;
    out.push(`closed ConfirmDialog x5: ${measure(dialogs(5)).toFixed(2)} ms / re-render`);
    out.push(`AppHeader (PM header, props change): ${measure((t) => <MemoryRouter><AppHeader pageTitle="Project" userName={`U${t}`} onBack={noop} appVersion="1.0" environmentName="Dev" /></MemoryRouter>).toFixed(2)} ms / re-render`);
    console.log("\n" + out.join("\n"));
  });
});
