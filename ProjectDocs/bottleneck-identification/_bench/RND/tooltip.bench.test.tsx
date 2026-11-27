// @vitest-environment jsdom
// RND bench 4: mount cost per Fluent Tooltip+Button / Button / ExpandChevron / StatusPill-like row control (jsdom dev, relative).
import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { Button, FluentProvider, Tooltip, Dropdown, Option, Combobox } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { ExpandChevron } from "@/components";

const N = 250;
const mountMs = (el: () => JSX.Element) => { const t = performance.now(); const v = render(<FluentProvider theme={vsbTheme}>{el()}</FluentProvider>); const d = performance.now() - t; v.unmount(); return d; };
const best = (el: () => JSX.Element) => { mountMs(el); return Math.min(mountMs(el), mountMs(el), mountMs(el)); };

describe("RND per-instance mount", () => {
  it("prints", () => {
    const arr = Array.from({ length: N }, (_, i) => i);
    const out: string[] = [];
    out.push(`${N} x <button>: ${best(() => <>{arr.map((i) => <button key={i} aria-label="x">x</button>)}</>).toFixed(0)} ms`);
    out.push(`${N} x Fluent Button: ${best(() => <>{arr.map((i) => <Button key={i} aria-label="x">x</Button>)}</>).toFixed(0)} ms`);
    out.push(`${N} x Tooltip+Button: ${best(() => <>{arr.map((i) => <Tooltip key={i} content="tip" relationship="description"><Button aria-label="x">x</Button></Tooltip>)}</>).toFixed(0)} ms`);
    out.push(`${N} x ExpandChevron: ${best(() => <>{arr.map((i) => <ExpandChevron key={i} open={i % 2 === 0} />)}</>).toFixed(0)} ms`);
    out.push(`${N} x Dropdown (5 opts, closed): ${best(() => <>{arr.map((i) => <Dropdown key={i} aria-label="d" value="a" selectedOptions={["a"]}>{["a","b","c","d","e"].map((o) => <Option key={o} value={o}>{o}</Option>)}</Dropdown>)}</>).toFixed(0)} ms`);
    out.push(`${N} x Dropdown w/ 100 opts, closed: ${best(() => <>{arr.slice(0, 20).map((i) => <Dropdown key={i} aria-label="d" value="a" selectedOptions={["a"]}>{Array.from({ length: 100 }, (_, k) => <Option key={k} value={`o${k}`}>{`o${k}`}</Option>)}</Dropdown>)}</>).toFixed(0)} ms for 20 instances`);
    out.push(`2000 Options inside one Combobox, closed: ${best(() => <Combobox aria-label="c" value="a" selectedOptions={["a"]}>{Array.from({ length: 2000 }, (_, k) => <Option key={k} value={`o${k}`}>{`o${k}`}</Option>)}</Combobox>).toFixed(0)} ms`);
    console.log("\n" + out.join("\n"));
  });
});
