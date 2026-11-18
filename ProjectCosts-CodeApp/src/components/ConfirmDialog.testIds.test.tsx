// @vitest-environment jsdom
/**
 * GD-016: the confirmation pop-up's test ids. Without `testIds` the three ids are the ones the dialog has always
 * carried (Tosca modules and tests key on them); the PM pop-ups pass `PM_POPUP_IDS`, the control names of the PM
 * app's `cmp_PopUp_Confirmation`. Also the guard forwarding them (UT-UNSAVED-008).
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { createMemoryRouter, RouterProvider, useNavigate } from "react-router-dom";
import { vsbTheme } from "@/theme/fluent";
import { ConfirmDialog, PM_POPUP_IDS } from "./ConfirmDialog";
import { UnsavedChangesGuard } from "./UnsavedChangesGuard";

afterEach(cleanup);

const mount = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => render(
  <FluentProvider theme={vsbTheme}>
    <ConfirmDialog open title="Confirm Changes" description="Are you sure?" onConfirm={vi.fn()} onCancel={vi.fn()} {...props} />
  </FluentProvider>,
);

const ids = () => ({
  close: document.querySelector(".fui-DialogSurface h2 + button")?.getAttribute("data-testid"),
  confirm: screen.getByRole("button", { name: "Confirm", hidden: true }).getAttribute("data-testid"),
  cancel: screen.getByRole("button", { name: "Cancel", hidden: true }).getAttribute("data-testid"),
});

describe("UT-CONFIRMIDS ConfirmDialog test ids", () => {
  it("UT-CONFIRMIDS-001 without testIds the ids are the ones the dialog has always had", () => {
    mount();
    expect(ids()).toEqual({
      close: "ico_PopUpConfirmation_BodyHeader_3", confirm: "confirm-dialog-confirm", cancel: "confirm-dialog-cancel",
    });
  });

  it("UT-CONFIRMIDS-002 testIds reach the ✕, Confirm and Cancel; a missing key keeps its default", () => {
    mount({ testIds: PM_POPUP_IDS });
    expect(ids()).toEqual({
      close: "ico_PopUpConfirmation_BodyHeader",
      confirm: "pcf_PopUpConfirmation_BodyButtons_Confirm",
      cancel: "pcf_PopUpConfirmation_BodyButtons_Cancel",
    });
    cleanup();
    mount({ testIds: { confirm: "only-confirm" } });
    expect(ids()).toEqual({ close: "ico_PopUpConfirmation_BodyHeader_3", confirm: "only-confirm", cancel: "confirm-dialog-cancel" });
  });

  const canvasFile = path.resolve(
    __dirname, "../../../ProjectDocs/_extracted/msapp/projectmanagement/Src/Components/cmp_PopUp_Confirmation.pa.yaml",
  );
  it.skipIf(!fs.existsSync(canvasFile))("UT-CONFIRMIDS-003 the PM_POPUP_IDS are control names of the PM cmp_PopUp_Confirmation", () => {
    const yaml = fs.readFileSync(canvasFile, "utf8");
    for (const name of Object.values(PM_POPUP_IDS)) {
      expect(new RegExp(String.raw`^\s*- ${name}:\s*$`, "m").test(yaml), name).toBe(true);
    }
  });
});

function Editor({ testIds }: { testIds?: typeof PM_POPUP_IDS }) {
  const navigate = useNavigate();
  return <>
    <h1>Editor</h1>
    {/* control-labels-ignore: test fixture */}
    <button type="button" aria-label="leave" data-testid="leave" onClick={() => navigate("/projects")}>leave</button>
    <UnsavedChangesGuard
      when dialog={{ title: "Unsaved data", description: "Leave?", confirm: "Yes", cancel: "Cancel" }}
      {...(testIds ? { testIds } : {})}
    />
  </>;
}

async function openGuard(testIds?: typeof PM_POPUP_IDS) {
  const router = createMemoryRouter([
    { path: "/project/general", element: <Editor {...(testIds ? { testIds } : {})} /> },
    { path: "/projects", element: <h1>Projects</h1> },
  ], { initialEntries: ["/project/general"] });
  render(<FluentProvider theme={vsbTheme}><RouterProvider router={router} /></FluentProvider>);
  screen.getByTestId("leave").click();
  return screen.findByRole("button", { name: "Yes", hidden: true });
}

describe("UT-UNSAVED UnsavedChangesGuard test ids", () => {
  it("UT-UNSAVED-008 the guard forwards testIds to its dialog and keeps the default ids without them", async () => {
    expect((await openGuard()).getAttribute("data-testid")).toBe("confirm-dialog-confirm");
    cleanup();
    const yes = await openGuard(PM_POPUP_IDS);
    expect(yes.getAttribute("data-testid")).toBe("pcf_PopUpConfirmation_BodyButtons_Confirm");
    expect(screen.getByRole("button", { name: "Cancel", hidden: true }).getAttribute("data-testid")).toBe("pcf_PopUpConfirmation_BodyButtons_Cancel");
  });
});
