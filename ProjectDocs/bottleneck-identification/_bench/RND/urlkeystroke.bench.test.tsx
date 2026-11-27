// @vitest-environment jsdom
// RND bench 7: cost of a URL-driven text box (Overview keyword, FE-P1-04) vs a local-state box, with an App-shaped shell around a 200-row memo table.
import { describe, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { FluentProvider, Input, Table, TableBody, TableCell, TableRow } from "@fluentui/react-components";
import { Profiler, memo, useMemo, useState } from "react";
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { AppShell } from "@/components";

const Row = memo(function Row({ id }: { id: number }) {
  return <TableRow>{Array.from({ length: 12 }, (_, c) => <TableCell key={c}>{`r${id}c${c}`}</TableCell>)}</TableRow>;
});
const ids = Array.from({ length: 200 }, (_, i) => i);
let renders = { shell: 0, screen: 0 };

function Table200() {
  return <Table size="small" aria-label="p"><TableBody>{ids.map((i) => <Row key={i} id={i} />)}</TableBody></Table>;
}
function Screen({ urlDriven }: { urlDriven: boolean }) {
  renders.screen++;
  const loc = useLocation(); const navigate = useNavigate();
  const [local, setLocal] = useState("");
  const keyword = urlDriven ? new URLSearchParams(loc.search).get("q") ?? "" : local;
  const body = useMemo(() => <Table200 />, []);
  return (<>
    <Input aria-label="kw" value={keyword} onChange={(_, d) => (urlDriven ? navigate({ pathname: loc.pathname, search: `?q=${encodeURIComponent(d.value)}` }, { replace: true }) : setLocal(d.value))} />
    {body}
  </>);
}
function Shell({ urlDriven }: { urlDriven: boolean }) {
  renders.shell++;
  useLocation(); // App.tsx and SessionProvider both read the location
  return <AppShell showRail={false} pageTitle="x" userName="u" appVersion="1" environmentName="Dev"><Screen urlDriven={urlDriven} /></AppShell>;
}

async function run(urlDriven: boolean) {
  renders = { shell: 0, screen: 0 };
  const router = createMemoryRouter([{ path: "*", element: <FluentProvider theme={vsbTheme}><Shell urlDriven={urlDriven} /></FluentProvider> }], { initialEntries: ["/projects"] });
  let total = 0, n = 0;
  const view = render(<Profiler id="p" onRender={(_i, ph, a) => { if (ph === "update") { total += a; n++; } }}><RouterProvider router={router} /></Profiler>);
  const input = view.getByLabelText("kw") as HTMLInputElement;
  const word = "abcdefghij";
  for (let i = 1; i <= 3; i++) await act(async () => { fireEvent.change(input, { value: word.slice(0, i), target: { value: word.slice(0, i) } }); });
  renders = { shell: 0, screen: 0 }; total = 0; n = 0;
  const t0 = performance.now();
  for (let i = 4; i <= 10; i++) await act(async () => { fireEvent.change(input, { target: { value: word.slice(0, i) } }); });
  const wall = (performance.now() - t0) / 7;
  const out = `${urlDriven ? "URL-driven" : "local state"}: wall ${wall.toFixed(1)} ms/keystroke, React commits ${n}/7 keystrokes (${(total / 7).toFixed(1)} ms render each), Shell renders ${renders.shell}, Screen renders ${renders.screen} over 7 keystrokes`;
  view.unmount();
  return out;
}

describe("RND url keystroke", () => {
  it("prints", async () => { const a = await run(true); const b = await run(false); const a2 = await run(true); const b2 = await run(false); console.log("\n" + [a, b, a2, b2].join("\n")); });
});
