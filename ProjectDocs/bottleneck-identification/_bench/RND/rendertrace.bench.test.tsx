// @vitest-environment jsdom
// RND bench 5: does an error state trace once per RENDER? (QueryStates + userErrorText, the Admin Gates wiring)
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { QueryStates } from "@/components";
import { userErrorText } from "@/platform/userMessage";
import { clearTraces, traces } from "@/platform/telemetry";
import { DataError } from "@/platform/errors";

describe("RND render-phase trace", () => {
  it("counts trace entries after N re-renders of an error state", () => {
    clearTraces();
    const health = { phase: "fatal" as const, fatalError: new Error("boom"), retryFailed: () => {}, retryAll: () => {} };
    const el = (n: number) => (
      <FluentProvider theme={vsbTheme}>
        <span data-n={n} />
        <QueryStates health={health} loadingLabel="l" fatal={{ title: "t", text: (e) => userErrorText(e, "load the gate approvals") }}>{() => null}</QueryStates>
      </FluentProvider>
    );
    const v = render(el(0));
    for (let i = 1; i <= 9; i++) v.rerender(el(i));
    console.log(`\n10 renders of one error state -> ${traces().length} trace entries (ring buffer max 200)`);
    expect(traces().length).toBeGreaterThan(1);
  });
});
