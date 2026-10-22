// @vitest-environment jsdom
/**
 * The two optional props added to master's `ConfirmDialog` for the Application Settings screens
 * (`error`, `lockWhileBusy`). Master's own behaviour is covered by `ConfirmDialog.test.tsx`.
 * UT-CONFIRM-S-nnn.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { ConfirmDialog } from "./ConfirmDialog";

type Props = Partial<Parameters<typeof ConfirmDialog>[0]>;

function mount(props: Props = {}) {
  const onCancel = vi.fn();
  render(
    <FluentProvider theme={vsbTheme}>
      <ConfirmDialog
        open title="Delete account" description="Are you sure?" confirmText="Delete" cancelText="Cancel"
        onConfirm={vi.fn()} onCancel={onCancel} {...props}
      />
    </FluentProvider>,
  );
  return { onCancel };
}

describe("ConfirmDialog — Application Settings additions", () => {
  it("UT-CONFIRM-S-001 no error bar by default", () => {
    mount();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("UT-CONFIRM-S-002 an error renders as an alert after the description", () => {
    mount({ error: "Deleting the account failed: forbidden" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Deleting the account failed: forbidden");
    const description = screen.getByText("Are you sure?");
    expect(description.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("UT-CONFIRM-S-003 lockWhileBusy disables the header close while busy", () => {
    mount({ busy: true, lockWhileBusy: true });
    expect(screen.getByTestId("ico_PopUpConfirmation_BodyHeader_3")).toBeDisabled();
  });

  it("UT-CONFIRM-S-004 without lockWhileBusy a busy dialog's ✕ still cancels (master behaviour)", async () => {
    const { onCancel } = mount({ busy: true });
    await userEvent.click(screen.getByTestId("ico_PopUpConfirmation_BodyHeader_3"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
