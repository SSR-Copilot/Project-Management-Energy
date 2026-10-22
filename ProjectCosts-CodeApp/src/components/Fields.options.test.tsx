// @vitest-environment jsdom
/**
 * Fields — the Application Settings options (`skin="plain"`, counter placement, adornments, ...) and the
 * guarantee that leaving them out keeps the canvas skin. Master's own `Fields.test.tsx` is unchanged.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { ReadOnlyField, TextAreaField, TextField, type TextFieldProps } from "./Fields";

const wrap = (node: React.ReactNode) => render(<FluentProvider theme={vsbTheme}>{node}</FluentProvider>);
const field = (props: Partial<TextFieldProps> = {}) =>
  wrap(<TextField skin="plain" label="Name" value="abc" onChange={vi.fn()} {...props} />);

describe("TextField defaults (unchanged)", () => {
  it("UT-SETFIELDS-001 Aria-label = label, counter text below the field, error wired", () => {
    field({ maxLength: 10, error: "Required", testId: "t", required: true });
    const input = screen.getByTestId("t");
    expect(input).toHaveAttribute("aria-label", "Name");
    expect(input).toHaveAttribute("maxlength", "10");
    expect(screen.getByText("3/10")).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("UT-SETFIELDS-002 OnChange reports the value", () => {
    const onChange = vi.fn();
    field({ onChange, testId: "t" });
    fireEvent.change(screen.getByTestId("t"), { target: { value: "abcd" } });
    expect(onChange).toHaveBeenCalledWith("abcd");
  });
});

describe("TextField E4 options", () => {
  it("UT-SETFIELDS-003 Counter='hint' moves the count into the Field hint; counter='none' hides it", () => {
    const { unmount, container } = field({ maxLength: 256, counter: "hint" });
    const hint = container.querySelector(".fui-Field__hint");
    expect(hint).toHaveTextContent("3/256");
    unmount();
    field({ maxLength: 30, counter: "none" });
    expect(screen.queryByText("3/30")).not.toBeInTheDocument();
  });

  it("UT-SETFIELDS-004 CountMode='powerFxTrim' counts Len(Trim(value)); a hint is joined with the count", () => {
    const { container } = field({ value: "  a   b  ", maxLength: 50, counter: "hint", countMode: "powerFxTrim", hint: "Optional" });
    expect(container.querySelector(".fui-Field__hint")).toHaveTextContent("Optional 3/50");
  });

  it("UT-SETFIELDS-005 ContentBefore / contentAfter render", () => {
    field({ contentBefore: <span>4711_</span>, contentAfter: <span>%</span> });
    expect(screen.getByText("4711_")).toBeInTheDocument();
    expect(screen.getByText("%")).toBeInTheDocument();
  });

  it("UT-SETFIELDS-006 AriaLabel overrides; null falls back to the caption (master rule 16: always an explicit aria-label)", () => {
    const { unmount } = field({ ariaLabel: "Subaccount Number", testId: "t" });
    expect(screen.getByTestId("t")).toHaveAttribute("aria-label", "Subaccount Number");
    unmount();
    field({ ariaLabel: null, testId: "t" });
    expect(screen.getByTestId("t")).toHaveAttribute("aria-label", "Name");
    expect(screen.getByRole("textbox", { name: "Name" })).toBe(screen.getByTestId("t"));
  });

  it("UT-SETFIELDS-007 OnBlur, inputMode, id, readOnly pass through", () => {
    const onBlur = vi.fn();
    field({ onBlur, inputMode: "decimal", id: "margin", readOnly: true, testId: "t" });
    const input = screen.getByTestId("t");
    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).toHaveAttribute("id", "margin");
    expect(input).toHaveAttribute("readonly");
  });

  it("UT-SETFIELDS-008 ErrorClassName styles the message; validationIcon null hides the icon; semibold label", () => {
    const { container } = field({ error: "Bad", errorClassName: "my-error", validationIcon: null, labelWeight: "semibold" });
    expect(screen.getByText("Bad").closest(".my-error")).not.toBeNull();
    expect(container.querySelector(".fui-Field__validationMessageIcon")).toBeNull();
  });

  it("UT-SETFIELDS-009 The default keeps the validation icon", () => {
    const { container } = field({ error: "Bad" });
    expect(container.querySelector(".fui-Field__validationMessageIcon")).not.toBeNull();
  });
});

describe("TextAreaField", () => {
  it("UT-SETFIELDS-010 Defaults unchanged; E4 counter='hint' with powerFxTrim and resize", () => {
    const { container } = wrap(
      <TextAreaField skin="plain" label="Comment" value=" x  y " onChange={vi.fn()} maxLength={50} counter="hint" countMode="powerFxTrim" resize="vertical" ariaLabel={null} testId="c" />,
    );
    expect(container.querySelector(".fui-Field__hint")).toHaveTextContent("3/50");
    expect(screen.getByTestId("c")).toHaveAttribute("aria-label", "Comment");
    expect(screen.getByRole("textbox", { name: "Comment" })).toBe(screen.getByTestId("c"));
  });

  it("UT-SETFIELDS-011 Wave C rows: default 3, a number passes through, 'auto' leaves the attribute off (browser default)", () => {
    const area = (rows?: number | "auto") => {
      const r = wrap(<TextAreaField skin="plain" label="Comment" value="" onChange={vi.fn()} testId="c" {...(rows !== undefined ? { rows } : {})} />);
      const attr = screen.getByTestId("c").getAttribute("rows");
      r.unmount();
      return attr;
    };
    expect(area()).toBe("3");
    expect(area(6)).toBe("6");
    expect(area("auto")).toBeNull();
  });
});

describe("ReadOnlyField (E5)", () => {
  it("UT-SETFIELDS-012 Default: disabled + readOnly, no asterisk", () => {
    wrap(<ReadOnlyField skin="plain" label="Category" value="Grid" testId="r" />);
    const input = screen.getByTestId("r");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveValue("Grid");
  });

  it("UT-SETFIELDS-013 Required shows the asterisk", () => {
    const { container } = wrap(<ReadOnlyField skin="plain" label="Category" value="Grid" required />);
    expect(container.querySelector(".fui-Label__required")).not.toBeNull();
  });

  it("UT-SETFIELDS-014 Disabled={false}: readOnly with aria-readonly, not disabled", () => {
    wrap(<ReadOnlyField skin="plain" label="Start Date" value="01/2027" disabled={false} testId="r" />);
    const input = screen.getByTestId("r");
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveAttribute("aria-readonly", "true");
  });

  it("UT-SETFIELDS-015 Wave C error: no message by default; `error` shows it, wired to the input", () => {
    const { container, unmount } = wrap(<ReadOnlyField skin="plain" label="Gate" value="" testId="r" />);
    expect(screen.getByTestId("r")).not.toHaveAttribute("aria-invalid");
    expect(container.querySelector(".fui-Field__validationMessage")).toBeNull();
    unmount();
    wrap(<ReadOnlyField skin="plain" label="Gate" value="" testId="r" error="The cluster cannot be blank." />);
    const input = screen.getByTestId("r");
    expect(screen.getByText("The cluster cannot be blank.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeDisabled();
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
  });
});

describe("The canvas skin is unchanged by the Settings options (defaults)", () => {
  it("UT-SETFIELDS-016 Canvas TextField: counter on the caption row by default, hidden by counter={false} / 'none', in the hint with 'hint'", () => {
    const { unmount, container } = wrap(<TextField label="Name" value="abc" onChange={vi.fn()} maxLength={10} testId="t" />);
    const counter = screen.getByText("3/10");
    // The caption-row counter is absolutely positioned inside the anchor, which also holds the input.
    expect(counter.parentElement!.contains(screen.getByTestId("t"))).toBe(true);
    expect(container.querySelector(".fui-Field__hint")).toBeNull();
    unmount();
    const off = wrap(<TextField label="Name" value="abc" onChange={vi.fn()} maxLength={10} counter={false} />);
    expect(screen.queryByText("3/10")).not.toBeInTheDocument();
    off.unmount();
    const none = wrap(<TextField label="Name" value="abc" onChange={vi.fn()} maxLength={10} counter="none" />);
    expect(screen.queryByText("3/10")).not.toBeInTheDocument();
    none.unmount();
    const hint = wrap(<TextField label="Name" value="abc" onChange={vi.fn()} maxLength={10} counter="hint" />);
    expect(hint.container.querySelector(".fui-Field__hint")).toHaveTextContent("3/10");
  });

  it("UT-SETFIELDS-017 The skins differ: canvas and plain render different input chrome (classes)", () => {
    const canvas = wrap(<TextField label="A" value="" onChange={vi.fn()} testId="c" />);
    const canvasRoot = screen.getByTestId("c").parentElement!;
    canvas.unmount();
    wrap(<TextField skin="plain" label="A" value="" onChange={vi.fn()} testId="p" />);
    const plainRoot = screen.getByTestId("p").parentElement!;
    expect(canvasRoot.className).not.toBe(plainRoot.className);
  });

  it("UT-SETFIELDS-018 Canvas ReadOnlyField is read-only but NOT disabled by default; disabled is opt-in; plain defaults to disabled", () => {
    const a = wrap(<ReadOnlyField label="Project ID" value="DE-1" testId="r" />);
    expect(screen.getByTestId("r")).not.toBeDisabled();
    expect(screen.getByTestId("r")).toHaveAttribute("aria-readonly", "true");
    a.unmount();
    const b = wrap(<ReadOnlyField label="Project ID" value="DE-1" testId="r" disabled />);
    expect(screen.getByTestId("r")).toBeDisabled();
    b.unmount();
    wrap(<ReadOnlyField skin="plain" label="Project ID" value="DE-1" testId="r" />);
    expect(screen.getByTestId("r")).toBeDisabled();
  });

  it("UT-SETFIELDS-019 Canvas TextField still takes the Settings adornments (contentBefore, onBlur, aria-label null)", () => {
    const onBlur = vi.fn();
    wrap(<TextField label="Name" value="x" onChange={vi.fn()} contentBefore={<span>4711_</span>} onBlur={onBlur} ariaLabel={null} testId="t" />);
    expect(screen.getByText("4711_")).toBeInTheDocument();
    fireEvent.blur(screen.getByTestId("t"));
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("t")).toHaveAttribute("aria-label", "Name");
  });
});
