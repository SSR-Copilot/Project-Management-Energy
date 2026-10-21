/**
 * Theme token guards.
 *
 * `CLAUDE.md` rule 6: "Theme values are transcribed, not chosen … changing a hex here changes
 * parity." Nothing enforced that. These tests pin the two maps that carry business meaning —
 * `stateColor` and `approvalStateColor` — so an accidental re-edit fails CI instead of quietly
 * shipping a wrong colour.
 *
 * This file is also where the `tokens.ts` <-> `entities.ts` coupling lives: `tokens.ts` is a
 * zero-import leaf module on purpose, so it cannot import `CHOICE` to key its own map. The
 * assertion that every option-set member has a colour therefore belongs here.
 */
import { describe, it, expect } from "vitest";
import { CHOICE } from "@/data/entities";
import { palette, stateColor, approvalStateColor, envAccent } from "./tokens";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("palette — the transcribed AppTheme.palette values", () => {
  it("carries themePrimary and the four approval-state hues verbatim", () => {
    expect(palette.themePrimary).toBe("#006eb9");
    expect(palette.akzent2).toBe("#41aab4"); // Draft
    expect(palette.akzent4).toBe("#f5911e"); // Approving
    expect(palette.akzent3).toBe("#82a51e"); // Approved
    expect(palette.akzent5).toBe("#d20532"); // Rejected
  });
});

describe("stateColor", () => {
  // SOURCE DEFECT regression: Draft used to resolve to Grayscale10 (#6C6C6C) and there was no
  // Approving key at all, leaving akzent2 unreachable from the whole app.
  it("routes Draft to akzent2, not grey", () => {
    expect(stateColor.Draft).toBe(palette.akzent2);
    expect(stateColor.Draft).not.toBe(palette.Grayscale10);
  });

  it("has an Approving key, alongside the legacy In Review label", () => {
    expect(stateColor.Approving).toBe(palette.akzent4);
    expect(stateColor["In Review"]).toBe(palette.akzent4);
  });

  it("routes Approved and Rejected to the canvas hues", () => {
    expect(stateColor.Approved).toBe(palette.akzent3);
    expect(stateColor.Rejected).toBe(palette.akzent5);
  });

  it("accepts both Cancelled and Canceled spellings", () => {
    // The canvas option set is spelled "Canceled"; earlier code used "Cancelled".
    expect(stateColor.Cancelled).toBeDefined();
    expect(stateColor.Canceled).toBeDefined();
  });

  it("resolves every key to a six-digit hex", () => {
    for (const [key, value] of Object.entries(stateColor)) {
      expect(value, `stateColor.${key}`).toMatch(HEX);
    }
  });
});

describe("approvalStateColor", () => {
  it("covers every Approval States option-set member", () => {
    for (const [name, value] of Object.entries(CHOICE.approvalState)) {
      expect(approvalStateColor[value], `approvalState.${name} (${value})`).toMatch(HEX);
    }
  });

  it("matches the spec's akzent2 / akzent4 / akzent3 / akzent5 / akzent4 sequence", () => {
    expect(approvalStateColor[CHOICE.approvalState.notStarted]).toBe(palette.akzent2);
    expect(approvalStateColor[CHOICE.approvalState.inProgress]).toBe(palette.akzent4);
    expect(approvalStateColor[CHOICE.approvalState.approved]).toBe(palette.akzent3);
    expect(approvalStateColor[CHOICE.approvalState.rejected]).toBe(palette.akzent5);
    expect(approvalStateColor[CHOICE.approvalState.cancelled]).toBe(palette.akzent4);
  });

  it("is keyed by number, so a raw Dataverse option-set value indexes it directly", () => {
    expect(approvalStateColor[952850002]).toBe(palette.akzent3);
  });
});

describe("envAccent", () => {
  it("resolves every environment to a six-digit hex", () => {
    for (const [key, value] of Object.entries(envAccent)) {
      expect(value, `envAccent.${key}`).toMatch(HEX);
    }
  });

  it("has no entry for Prod — the badge and stripe are suppressed there", () => {
    expect(envAccent.Prod).toBeUndefined();
  });
});
