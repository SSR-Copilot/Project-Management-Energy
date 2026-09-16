// @vitest-environment jsdom
/**
 * Render tests for the Cost panel field primitives.
 *
 * `CostSelect` stopped being a raw `<select>` when the client asked for "all the Dropdowns
 * should be fixed into correct UI" — these assert it is a real Fluent combobox that still
 * reports the value the caller expects, and that the red `*` marker reaches the radio groups
 * (Distribution / Equal Distribution), which previously had no way to show one.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { Choices, CostField, CostSelect } from "./Fields";

const mount = (ui: React.ReactNode) =>
  render(<FluentProvider theme={vsbTheme}>{ui}</FluentProvider>);

describe("CostSelect", () => {
  it("renders a Fluent combobox, not a native select", () => {
    const { container } = mount(
      <CostSelect label="Distribution Frequency" value="1 month"
        options={["1 month", "3 months", "6 months", "12 months"]} onChange={vi.fn()} />,
    );
    expect(container.querySelector("select")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Distribution Frequency" }))
      .toHaveValue("1 month");
  });

  it("reports the chosen option", () => {
    const onChange = vi.fn();
    mount(
      <CostSelect label="Distribution Frequency" value="1 month"
        options={["1 month", "3 months"]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Distribution Frequency" }));
    fireEvent.click(screen.getByRole("option", { name: "3 months" }));
    expect(onChange).toHaveBeenCalledWith("3 months");
  });

  it("marks a required field and surfaces an error", () => {
    const { container } = mount(
      <CostSelect label="Distribution Frequency" required error="Pick one"
        value="1 month" options={["1 month"]} onChange={vi.fn()} />,
    );
    expect(container.querySelector('span[data-required="true"]')).not.toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Pick one");
  });
});

describe("Choices", () => {
  it("puts the required marker on the group legend", () => {
    const { container } = mount(
      <Choices label="Equal Distribution" required value="By Cluster"
        options={["By Cluster", "By Start and End Date"]} onChange={vi.fn()} />,
    );
    expect(container.querySelector('legend > span[data-required="true"]')).not.toBeNull();
  });

  it("selects the current value and reports a change", () => {
    const onChange = vi.fn();
    mount(
      <Choices label="Cost Paid By" value="SPV" options={["DevCo", "SPV"]} onChange={onChange} />,
    );
    expect(screen.getByRole("radio", { name: "SPV" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "DevCo" }));
    expect(onChange).toHaveBeenCalledWith("DevCo");
  });

  it("puts an action beside the legend", () => {
    // The Contracts panel's Reload icon sits at `X: =90`, just right of the `Margin` caption.
    mount(
      <Choices label="Margin" value="Yes" options={["Yes", "No"]} onChange={vi.fn()}
        action={<button type="button" aria-label="Reset to standard assumption." />} />,
    );
    const action = screen.getByRole("button", { name: "Reset to standard assumption." });
    expect(action.closest("legend")).not.toBeNull();
  });

  it("drops the legend entirely when there is no label and no action", () => {
    // `rad_Contracts_RightPanel_NewEdit_MarginType` has no `lbl_` of its own — it simply
    // follows the Yes/No group, so an empty caption must not reserve a line.
    const { container } = mount(
      <Choices label="" value="Percentage" options={["Percentage", "Fixed Value"]}
        onChange={vi.fn()} />,
    );
    expect(container.querySelector("legend")).toBeNull();
    expect(screen.getByRole("radio", { name: "Percentage" })).toBeChecked();
  });
});

describe("CostField", () => {
  it("carries the MM/YYYY placeholder the canvas date boxes use", () => {
    mount(
      <CostField label="Start Date" required placeholder="MM/YYYY" value="04/2025"
        onChange={vi.fn()} />,
    );
    expect(screen.getByPlaceholderText("MM/YYYY")).toHaveValue("04/2025");
  });

  it("puts the character counter on the label line, not under the box", () => {
    // `lbl_…_PaymentTarget_Note_Details` is `Align: =Align.Right`, `Y: =8` — level with the
    // caption. Ours used to sit below the textarea.
    const { container } = mount(
      <CostField label="Notes" counter="2/55">
        <textarea aria-label="Notes" defaultValue="22" />
      </CostField>,
    );
    const caption = container.querySelector('span[data-counter="true"]');
    expect(caption).not.toBeNull();
    expect(caption).toHaveTextContent("Notes");
    expect(caption?.querySelector(".canvas-field-counter")).toHaveTextContent("2/55");
  });

  it("flags the input when an error is present", () => {
    mount(
      <CostField label="Total Costs [EUR]" value="0"
        error="Value must be between 1 and 500,000,000." onChange={vi.fn()} />,
    );
    expect(screen.getByRole("alert"))
      .toHaveTextContent("Value must be between 1 and 500,000,000.");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });
});
