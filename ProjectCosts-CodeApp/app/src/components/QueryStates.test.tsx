// @vitest-environment jsdom
/** C3 — loading / fatal / empty / ready switch. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import type { QueryHealth } from "@/app/useQueryHealth";
import { QueryStates, type QueryStatesProps } from "./QueryStates";

const health = (over: Partial<QueryHealth> = {}): QueryHealth => ({
  phase: "ready", retryFailed: vi.fn(), retryAll: vi.fn(), ...over,
});

const mount = (props: Partial<QueryStatesProps> = {}) => {
  const children = props.children ?? vi.fn(() => <span>content</span>);
  render(
    <FluentProvider theme={vsbTheme}>
      <QueryStates
        health={health()} loadingLabel="Loading things…"
        fatal={{ title: "Things could not be loaded", text: (e) => `Reason: ${(e as Error).message}` }}
        {...props}
      >
        {children}
      </QueryStates>
    </FluentProvider>,
  );
  return children;
};

describe("QueryStates (C3)", () => {
  it("loading: the inline spinner; children not called", () => {
    const children = mount({ health: health({ phase: "loading" }) });
    expect(screen.getByRole("status")).toHaveTextContent("Loading things…");
    expect(children).not.toHaveBeenCalled();
  });

  it("fatal (empty-state): title, screen text, Retry → retryFailed by default", () => {
    const h = health({ phase: "fatal", fatalError: new Error("403") });
    const children = mount({ health: h });
    expect(screen.getByText("Things could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("Reason: 403")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.retryFailed).toHaveBeenCalledTimes(1);
    expect(h.retryAll).not.toHaveBeenCalled();
    expect(children).not.toHaveBeenCalled();
  });

  it("fatal retry 'all' + custom label (Project Gates 'Try again')", () => {
    const h = health({ phase: "fatal", fatalError: new Error("x") });
    mount({ health: h, fatal: { text: () => "t", retry: "all", retryLabel: "Try again" } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(h.retryAll).toHaveBeenCalledTimes(1);
  });

  it("fatal as notice: an error NoticeBar with the retry aria-label", () => {
    const h = health({ phase: "fatal", fatalError: new Error("x") });
    const { container } = render(
      <FluentProvider theme={vsbTheme}>
        <QueryStates health={h} loadingLabel="l" fatal={{ text: () => "Tabs failed", as: "notice", retryAriaLabel: "Retry loading tabs" }}>
          {() => null}
        </QueryStates>
      </FluentProvider>,
    );
    expect(container.querySelector(".fui-MessageBar")).toHaveTextContent("Tabs failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading tabs" }));
    expect(h.retryFailed).toHaveBeenCalledTimes(1);
  });

  it("empty.when: EmptyState; children not called", () => {
    const children = mount({ empty: { when: true, title: "No countries found", description: "None active." } });
    expect(screen.getByText("No countries found")).toBeInTheDocument();
    expect(screen.getByText("None active.")).toBeInTheDocument();
    expect(children).not.toHaveBeenCalled();
  });

  it("ready: children rendered", () => {
    const children = mount({ empty: { when: false, title: "x" } });
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(children).toHaveBeenCalled();
  });
});
