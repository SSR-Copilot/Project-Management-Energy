// @vitest-environment jsdom
/**
 * GD-012: `PeoplePicker.errorClassName` puts a caller's class on the validation message; without it the message
 * renders exactly as before (UT-PPICK-001).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { PeoplePicker } from "./PeoplePicker";

/** Fluent numbers its generated ids and its provider class per render; the rest of the markup is what is compared. */
const stable = (html: string) => html.replace(/_r_\d+_/g, "_r_N_");

const mount = (extra: { errorClassName?: string } = {}) => render(
  <FluentProvider theme={vsbTheme}>
    <PeoplePicker
      label="Project Manager" placeholder="Select" testId="pp" value={[]} onChange={() => {}} onPick={(p) => [p]}
      maxPeople={1} term="" onTermChange={() => {}} suggestions={[]} errorMessage="Required" {...extra}
    />
  </FluentProvider>,
);

describe("UT-PPICK PeoplePicker error class", () => {
  it("UT-PPICK-001 errorClassName reaches the message; absent, the message markup is unchanged", () => {
    const plain = mount();
    const before = screen.getByText("Required");
    expect(before.className).not.toContain("my-error-class");
    const markup = stable(plain.container.innerHTML);
    plain.unmount();

    const styled = mount({ errorClassName: "my-error-class" });
    const after = screen.getByText("Required");
    expect(after.className).toContain("my-error-class");
    expect(after.className).toContain("fui-Field__validationMessage");
    styled.unmount();

    // Absent again: byte-identical to the first render.
    expect(stable(mount().container.innerHTML)).toBe(markup);
  });
});
