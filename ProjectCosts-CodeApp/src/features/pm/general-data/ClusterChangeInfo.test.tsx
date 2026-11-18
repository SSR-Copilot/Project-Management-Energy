// @vitest-environment jsdom
/**
 * GD-015: the Start-Cluster change explanation sits in the canvas info box (A:7271-7332).
 * jsdom has no layout, so the Griffel rules are read back (`appliedRules`).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { appliedRules } from "@/test/appliedRules";
import { ClusterChangeInfo } from "./ClusterChangeInfo";

afterEach(cleanup);

describe("UT-GDATA ClusterChangeInfo", () => {
  it("UT-GDATA-109 the text keeps its canvas id; the box has the canvas fill, radius and minimum height; the icon is decorative", () => {
    const { container } = render(
      <FluentProvider theme={vsbTheme}>
        <ClusterChangeInfo text="The Start Cluster has been updated from A to B." />
      </FluentProvider>,
    );
    const label = screen.getByTestId("lbl_ClusterChange_RightPanel_Info");
    expect(label.textContent).toBe("The Start Cluster has been updated from A to B.");
    const box = label.parentElement as HTMLElement;
    const rules = appliedRules(box);
    expect(rules["background-color"]).toBe("rgba(204, 226, 241, 0.75)");
    expect(rules["border-radius"]).toBe("3px");
    expect(rules["min-height"]).toBe("64px");
    const text = appliedRules(label);
    expect(text["font-size"]).toBe("12px");
    expect(text["font-weight"]).toBe("600");
    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });
});
