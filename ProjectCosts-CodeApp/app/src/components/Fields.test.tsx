// @vitest-environment jsdom
/** Fields — today's defaults plus the E4 / E5 options. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { ReadOnlyField, TextAreaField, TextField, type TextFieldProps } from "./Fields";

const wrap = (node: React.ReactNode) => render(<FluentProvider theme={vsbTheme}>{node}</FluentProvider>);
const field = (props: Partial<TextFieldProps> = {}) =>
  wrap(<TextField label="Name" value="abc" onChange={vi.fn()} {...props} />);

describe("TextField defaults (unchanged)", () => {
  it("aria-label = label, counter text below the field, error wired", () => {
    field({ maxLength: 10, error: "Required", testId: "t", required: true });
    const input = screen.getByTestId("t");
    expect(input).toHaveAttribute("aria-label", "Name");
    expect(input).toHaveAttribute("maxlength", "10");
    expect(screen.getByText("3/10")).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("onChange reports the value", () => {
    const onChange = vi.fn();
    field({ onChange, testId: "t" });
    fireEvent.change(screen.getByTestId("t"), { target: { value: "abcd" } });
    expect(onChange).toHaveBeenCalledWith("abcd");
  });
});

describe("TextField E4 options", () => {
  it("counter='hint' moves the count into the Field hint; counter='none' hides it", () => {
    const { unmount, container } = field({ maxLength: 256, counter: "hint" });
    const hint = container.querySelector(".fui-Field__hint");
    expect(hint).toHaveTextContent("3/256");
    unmount();
    field({ maxLength: 30, counter: "none" });
    expect(screen.queryByText("3/30")).not.toBeInTheDocument();
  });

  it("countMode='powerFxTrim' counts Len(Trim(value)); a hint is joined with the count", () => {
    const { container } = field({ value: "  a   b  ", maxLength: 50, counter: "hint", countMode: "powerFxTrim", hint: "Optional" });
    expect(container.querySelector(".fui-Field__hint")).toHaveTextContent("Optional 3/50");
  });

  it("contentBefore / contentAfter render", () => {
    field({ contentBefore: <span>4711_</span>, contentAfter: <span>%</span> });
    expect(screen.getByText("4711_")).toBeInTheDocument();
    expect(screen.getByText("%")).toBeInTheDocument();
  });

  it("ariaLabel overrides; null omits it (the Field label still names the input)", () => {
    const { unmount } = field({ ariaLabel: "Subaccount Number", testId: "t" });
    expect(screen.getByTestId("t")).toHaveAttribute("aria-label", "Subaccount Number");
    unmount();
    field({ ariaLabel: null, testId: "t" });
    expect(screen.getByTestId("t")).not.toHaveAttribute("aria-label");
    expect(screen.getByRole("textbox", { name: "Name" })).toBe(screen.getByTestId("t"));
  });

  it("onBlur, inputMode, id, readOnly pass through", () => {
    const onBlur = vi.fn();
    field({ onBlur, inputMode: "decimal", id: "margin", readOnly: true, testId: "t" });
    const input = screen.getByTestId("t");
    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).toHaveAttribute("id", "margin");
    expect(input).toHaveAttribute("readonly");
  });

  it("errorClassName styles the message; validationIcon null hides the icon; semibold label", () => {
    const { container } = field({ error: "Bad", errorClassName: "my-error", validationIcon: null, labelWeight: "semibold" });
    expect(screen.getByText("Bad").closest(".my-error")).not.toBeNull();
    expect(container.querySelector(".fui-Field__validationMessageIcon")).toBeNull();
  });

  it("the default keeps the validation icon", () => {
    const { container } = field({ error: "Bad" });
    expect(container.querySelector(".fui-Field__validationMessageIcon")).not.toBeNull();
  });
});

describe("TextAreaField", () => {
  it("defaults unchanged; E4 counter='hint' with powerFxTrim and resize", () => {
    const { container } = wrap(
      <TextAreaField label="Comment" value=" x  y " onChange={vi.fn()} maxLength={50} counter="hint" countMode="powerFxTrim" resize="vertical" ariaLabel={null} testId="c" />,
    );
    expect(container.querySelector(".fui-Field__hint")).toHaveTextContent("3/50");
    expect(screen.getByTestId("c")).not.toHaveAttribute("aria-label");
    expect(screen.getByRole("textbox", { name: "Comment" })).toBe(screen.getByTestId("c"));
  });

  it("Wave C rows: default 3, a number passes through, 'auto' leaves the attribute off (browser default)", () => {
    const area = (rows?: number | "auto") => {
      const r = wrap(<TextAreaField label="Comment" value="" onChange={vi.fn()} testId="c" {...(rows !== undefined ? { rows } : {})} />);
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
  it("default: disabled + readOnly, no asterisk", () => {
    wrap(<ReadOnlyField label="Category" value="Grid" testId="r" />);
    const input = screen.getByTestId("r");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveValue("Grid");
  });

  it("required shows the asterisk", () => {
    const { container } = wrap(<ReadOnlyField label="Category" value="Grid" required />);
    expect(container.querySelector(".fui-Label__required")).not.toBeNull();
  });

  it("disabled={false}: readOnly with aria-readonly, not disabled", () => {
    wrap(<ReadOnlyField label="Start Date" value="01/2027" disabled={false} testId="r" />);
    const input = screen.getByTestId("r");
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveAttribute("aria-readonly", "true");
  });

  it("Wave C error: no message by default; `error` shows it, wired to the input", () => {
    const { container, unmount } = wrap(<ReadOnlyField label="Gate" value="" testId="r" />);
    expect(screen.getByTestId("r")).not.toHaveAttribute("aria-invalid");
    expect(container.querySelector(".fui-Field__validationMessage")).toBeNull();
    unmount();
    wrap(<ReadOnlyField label="Gate" value="" testId="r" error="The cluster cannot be blank." />);
    const input = screen.getByTestId("r");
    expect(screen.getByText("The cluster cannot be blank.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeDisabled();
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
  });
});
