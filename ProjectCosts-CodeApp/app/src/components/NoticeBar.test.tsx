// @vitest-environment jsdom
/** C2 — page / section message bar. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { NoticeBar, type NoticeBarProps } from "./NoticeBar";

const mount = (props: Partial<NoticeBarProps> = {}) => render(
  <FluentProvider theme={vsbTheme}>
    <NoticeBar intent="warning" {...props}>{props.children ?? "Body text"}</NoticeBar>
  </FluentProvider>,
);

describe("NoticeBar (C2)", () => {
  it.each(["error", "warning", "info", "success"] as const)("renders intent %s with its body", (intent) => {
    const { container } = mount({ intent, testId: "bar" });
    expect(screen.getByTestId("bar")).toHaveTextContent("Body text");
    expect(container.querySelector(".fui-MessageBar")).not.toBeNull();
  });

  it("renders the title", () => {
    mount({ title: "Not saved" });
    expect(screen.getByText("Not saved")).toBeInTheDocument();
  });

  it("action click, small size, default aria-label = caption", () => {
    const onClick = vi.fn();
    mount({ action: { label: "Retry", onClick, testId: "retry" } });
    const button = screen.getByRole("button", { name: "Retry" });
    expect(button).toHaveAttribute("aria-label", "Retry");
    expect(button).toHaveClass("fui-Button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("retry")).toBe(button);
  });

  it("action ariaLabel passes through", () => {
    mount({ action: { label: "Retry", ariaLabel: "Retry loading tasks", onClick: vi.fn() } });
    expect(screen.getByRole("button", { name: "Retry loading tasks" })).toHaveTextContent("Retry");
  });

  it("onDismiss renders a transparent ✕ named Dismiss", () => {
    const onDismiss = vi.fn();
    mount({ onDismiss });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("no actions block without action or dismiss", () => {
    mount();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("alert sets role=alert; otherwise no alert role", () => {
    const { unmount } = mount();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    unmount();
    mount({ alert: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Body text");
  });

  it("inset 20 adds a margin class; ariaLabel names the bar", () => {
    const { unmount } = mount({ testId: "bar" });
    const plain = screen.getByTestId("bar").className;
    unmount();
    mount({ testId: "bar", inset: 20, ariaLabel: "Tasks could not be loaded" });
    expect(screen.getByTestId("bar").className).not.toBe(plain);
    expect(screen.getByTestId("bar")).toHaveAttribute("aria-label", "Tasks could not be loaded");
  });
});
