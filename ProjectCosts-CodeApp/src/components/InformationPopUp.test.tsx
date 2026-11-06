// @vitest-environment jsdom
/** UT-INFOPOP — the shared "can't be deleted/deactivated" canvas pop-up (`InformationPopUp`). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { InformationPopUp } from "./InformationPopUp";

const wrap = (node: React.ReactNode) => render(<FluentProvider theme={vsbTheme}>{node}</FluentProvider>);

afterEach(cleanup);

describe("InformationPopUp", () => {
  it("UT-INFOPOP-001 renders the canvas controls, suffixed per copy, with one Close button", () => {
    wrap(<InformationPopUp open title="Production can’t be deleted/deactivated" message="Add another one first."
      canvasSuffix="_1" onClose={vi.fn()} />);
    expect(screen.getByTestId("txt_PopUp_Common_Generators_PreventTotalCapacity_Title_1").textContent)
      .toBe("Production can’t be deleted/deactivated");
    expect(screen.getByTestId("lbl_PopUp_Common_Generators_PreventTotalCapacity_Information_1").textContent)
      .toBe("Add another one first.");
    expect(screen.getByTestId("icn_PopUp_Common_Generators_PreventTotalCapacity_Cancel_1")).toHaveAttribute("title", "Cancel");
    const close = screen.getByTestId("btn_PopUp_Common_Generators_PreventTotalCapacity_Information_Close_1");
    expect(close.textContent).toBe("Close");
    expect(close).toHaveAttribute("aria-label", "Close");
    // Information only: no confirm button of any kind.
    expect(screen.queryByTestId("confirm-dialog-confirm")).toBeNull();
  });

  it("UT-INFOPOP-002 with no size props the card keeps the Generators defaults (no inline size)", () => {
    wrap(<InformationPopUp open title="T" message="M" onClose={vi.fn()} />);
    const card = screen.getByTestId("con_PopUp_Common_Generators_PreventTotalCapacity_Information");
    expect(card.style.width).toBe("");
    expect(card.style.height).toBe("");
  });

  it("UT-INFOPOP-003 a copy's own Width / Height / gutter / tag height are applied", () => {
    wrap(<InformationPopUp open title="T" message="M" width={550} boxHeight={220} gutter={30} tagHeight={55} onClose={vi.fn()} />);
    const card = screen.getByTestId("con_PopUp_Common_Generators_PreventTotalCapacity_Information");
    expect(card.style.width).toBe("550px");
    expect(card.style.height).toBe("220px");
    const header = screen.getByTestId("txt_PopUp_Common_Generators_PreventTotalCapacity_Title").parentElement as HTMLElement;
    expect(header.style.paddingLeft).toBe("30px");
    expect(header.style.paddingRight).toBe("30px");
    const tag = screen.getByTestId("lbl_PopUp_Common_Generators_PreventTotalCapacity_Information").parentElement as HTMLElement;
    expect(tag.style.minHeight).toBe("55px");
  });

  it("UT-INFOPOP-004 both the ✕ and Close call onClose", () => {
    const onClose = vi.fn();
    wrap(<InformationPopUp open title="T" message="M" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("icn_PopUp_Common_Generators_PreventTotalCapacity_Cancel"));
    fireEvent.click(screen.getByTestId("btn_PopUp_Common_Generators_PreventTotalCapacity_Information_Close"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
