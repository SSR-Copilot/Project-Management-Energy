/**
 * `Approval States` decoration — spec rule 15 on the Project Main Screen.
 *
 * The canvas ran three parallel `Switch`es over `Text('Approval States')` to produce an icon,
 * a tag and a colour. They branch on the same value, so they are one function here, and this
 * is where the icon/tag/colour triples are pinned to the spec's table.
 */
import { describe, it, expect } from "vitest";
import { CHOICE } from "@/data/entities";
import { palette } from "@/theme/tokens";
import { approvalDecoration, approvalLabel, rowAccentColor } from "./approval";

const A = CHOICE.approvalState;

describe("approvalDecoration", () => {
  it("maps Draft to a circle, the draft tag and akzent2", () => {
    expect(approvalDecoration(A.notStarted)).toEqual({
      label: "Draft",
      tag: "draft",
      icon: "circle",
      color: palette.akzent2,
    });
  });

  it("maps Approving to the inreview tag — not 'approving' — and akzent4", () => {
    // The canvas tag string is `inreview`; the option-set LABEL is `Approving`. Both are
    // preserved verbatim because downstream CSS/telemetry keys off the tag.
    const d = approvalDecoration(A.inProgress);
    expect(d.tag).toBe("inreview");
    expect(d.label).toBe("Approving");
    expect(d.color).toBe(palette.akzent4);
  });

  it("maps Approved to akzent3 — the screenshot's green bar", () => {
    const d = approvalDecoration(A.approved);
    expect(d.tag).toBe("approved");
    expect(d.icon).toBe("check");
    expect(d.color).toBe(palette.akzent3);
    expect(d.color).toBe("#82a51e");
  });

  it("maps Rejected to akzent5 — the screenshot's red bar", () => {
    const d = approvalDecoration(A.rejected);
    expect(d.tag).toBe("rejected");
    expect(d.icon).toBe("dismiss");
    expect(d.color).toBe(palette.akzent5);
    expect(d.color).toBe("#d20532");
  });

  it("maps Canceled to akzent4, the same hue as Approving", () => {
    // Not a mistake in the transcription — the canvas colour switch really does reuse
    // akzent4 for both Approving and Canceled.
    expect(approvalDecoration(A.cancelled).color).toBe(palette.akzent4);
    expect(approvalDecoration(A.cancelled).tag).toBe("canceled");
  });

  it("covers every member of the option set", () => {
    for (const [name, value] of Object.entries(A)) {
      expect(approvalDecoration(value).tag, `approvalState.${name}`).not.toBe("unknown");
    }
  });

  it("degrades to a neutral decoration for blank or unrecognised states", () => {
    // A freshly created project can legitimately have no approval state, so this must not
    // throw and must not claim a state.
    for (const v of [null, undefined, 0, 999999]) {
      const d = approvalDecoration(v as number | null | undefined);
      expect(d.tag).toBe("unknown");
      expect(d.label).toBe("");
    }
  });

  it("returns an icon TOKEN, never a React element, so the rule stays pure", () => {
    const d = approvalDecoration(A.approved);
    expect(typeof d.icon).toBe("string");
  });
});

describe("approvalLabel", () => {
  it("renders the option-set label", () => {
    expect(approvalLabel(A.approved)).toBe("Approved");
    expect(approvalLabel(A.notStarted)).toBe("Draft");
  });

  it("is empty for a blank state rather than the word undefined", () => {
    expect(approvalLabel(null)).toBe("");
  });
});

describe("rowAccentColor — the grid's 4px left bar", () => {
  it("prefers the approval state", () => {
    expect(rowAccentColor(A.approved, "Cluster 3")).toBe(palette.akzent3);
    expect(rowAccentColor(A.rejected, "Cluster 2")).toBe(palette.akzent5);
    expect(rowAccentColor(A.notStarted, null)).toBe(palette.akzent2);
  });

  it("falls back to the cluster label when no approval state is set", () => {
    // Rows with no approval state still need a bar; Draft is the only cluster label the
    // screenshot shows a colour for.
    expect(rowAccentColor(null, "Draft")).toBe(palette.akzent2);
    expect(rowAccentColor(undefined, "Abandoned")).toBe(palette.Grayscale10);
  });

  it("returns undefined when neither field carries a signal, so no bar is drawn", () => {
    expect(rowAccentColor(null, "Cluster 4")).toBeUndefined();
    expect(rowAccentColor(null, null)).toBeUndefined();
  });
});
