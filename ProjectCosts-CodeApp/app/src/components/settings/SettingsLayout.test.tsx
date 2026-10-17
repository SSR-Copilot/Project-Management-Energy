// @vitest-environment jsdom
/** C7 SettingsTabStrip, C8 SettingsAccordion, C9 ScopeHeaderBand. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Button, FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { SettingsTabStrip } from "./SettingsTabStrip";
import { SettingsAccordion, type SettingsAccordionProps } from "./SettingsAccordion";
import { ScopeHeaderBand } from "./ScopeHeaderBand";

const wrap = (node: React.ReactNode) => render(<FluentProvider theme={vsbTheme}>{node}</FluentProvider>);
const TABS = [{ id: "a", label: "Germany Wind" }, { id: "b", label: "France PV" }];

describe("SettingsTabStrip (C7)", () => {
  it("renders the tabs in a named tablist and reports the selection", () => {
    const onSelect = vi.fn();
    wrap(<SettingsTabStrip tabs={TABS} selected="a" onSelect={onSelect} ariaLabel="Country and technology" />);
    expect(screen.getByRole("tablist", { name: "Country and technology" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Germany Wind" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "France PV" }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("size and band options change the rendering", () => {
    wrap(<>
      <SettingsTabStrip tabs={TABS} selected="a" onSelect={vi.fn()} ariaLabel="one" testId="ca" />
      <SettingsTabStrip tabs={TABS} selected="a" onSelect={vi.fn()} ariaLabel="two" size="small" bandHeight={52} layout="block" testId="cl" />
    </>);
    expect(screen.getByTestId("ca")).toHaveStyle({ minHeight: "50px", display: "flex" });
    expect(screen.getByTestId("cl")).toHaveStyle({ minHeight: "52px" });
    expect(screen.getByTestId("cl")).not.toHaveStyle({ display: "flex" });
    const tabClass = (list: string) => within(screen.getByRole("tablist", { name: list })).getAllByRole("tab")[0]!.className;
    expect(tabClass("two")).not.toBe(tabClass("one"));
  });
});

const ITEMS: SettingsAccordionProps["items"] = [
  { id: "g", title: "Germany", content: <p>DE body</p>, testId: "item-g" },
  { id: "f", title: "France", content: <p>FR body</p>, testId: "item-f" },
];

describe("SettingsAccordion (C8)", () => {
  it("controlled open items and the toggle callback with the id", () => {
    const onToggle = vi.fn();
    wrap(<SettingsAccordion variant="light" items={ITEMS} openItems={["g"]} onToggle={onToggle} />);
    expect(screen.getByText("DE body")).toBeInTheDocument();
    expect(screen.queryByText("FR body")).not.toBeInTheDocument();
    const france = screen.getByRole("button", { name: "France" });
    expect(france).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(france);
    expect(onToggle).toHaveBeenCalledWith("f");
  });

  it("border 'folded' rules only folded items; 'always' rules no item", () => {
    const { unmount } = wrap(<SettingsAccordion variant="light" border="folded" items={ITEMS} openItems={["g"]} onToggle={vi.fn()} />);
    const openCls = screen.getByTestId("item-g").className;
    const foldedCls = screen.getByTestId("item-f").className;
    expect(openCls).not.toBe(foldedCls);
    unmount();
    wrap(<SettingsAccordion variant="light" border="always" items={ITEMS} openItems={["g"]} onToggle={vi.fn()} />);
    expect(screen.getByTestId("item-g").className).toBe(screen.getByTestId("item-f").className);
  });

  it("variants render different header classes; grey wraps a string title; panel padding applies", () => {
    const { unmount } = wrap(<SettingsAccordion variant="light" items={ITEMS} openItems={["g"]} onToggle={vi.fn()} panelPadding={{ left: 20, top: 10, bottom: 12 }} />);
    const lightHeader = screen.getByTestId("item-g").firstElementChild!.className;
    expect(screen.getByText("DE body").parentElement).toHaveStyle({ paddingLeft: "20px", paddingTop: "10px", paddingBottom: "12px" });
    unmount();
    wrap(<SettingsAccordion variant="grey" items={ITEMS} openItems={["g"]} onToggle={vi.fn()} />);
    expect(screen.getByTestId("item-g").firstElementChild!.className).not.toBe(lightHeader);
    expect(screen.getByText("Germany")).toHaveStyle({ fontSize: "16px" });
  });
});

describe("ScopeHeaderBand (C9)", () => {
  it("renders the title tag; no toolbar role without actions; live attribute", () => {
    wrap(<ScopeHeaderBand title="Standard Assumptions / Costs / Germany / Wind" live testId="b" />);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    const title = screen.getByText("Standard Assumptions / Costs / Germany / Wind");
    expect(title.tagName).toBe("SPAN");
    expect(title).toHaveAttribute("aria-live", "polite");
  });

  it("with actions: role=toolbar named by ariaLabel; titleAs h2", () => {
    wrap(<ScopeHeaderBand title="Contracts / Germany / Wind" titleAs="h2" ariaLabel="Contracts" actions={<Button>Add</Button>} />);
    expect(screen.getByRole("toolbar", { name: "Contracts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Contracts / Germany / Wind" })).not.toHaveAttribute("aria-live");
  });
});
