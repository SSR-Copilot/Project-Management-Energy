/**
 * UT-CONTR-251..264 — the strings that were inline literals of `Screen.tsx` (RB-7, CONVENTIONS rule 7), now in `MSG` or
 * a function of `rules.ts`. Each is pinned byte for byte against its canvas source (`Contracts Screen.pa.yaml`), or marked
 * NEW TEXT where the canvas has none, so a reword fails here.
 */
import { describe, expect, it } from "vitest";
import {
  CARD_LABEL, MSG, confirmDeleteContractDescription, confirmDeletePaymentTargetDescription, rightsTotalLabel,
} from "./rules";

describe("the delete confirmations (canvas :7745, :7773, :7781, :7817)", () => {
  it("UT-CONTR-251 the contract title is 'Delete Contract?' (:7817)", () => {
    expect(MSG.deleteContractTitle).toBe("Delete Contract?");
  });

  it("UT-CONTR-252 the payment-target title is 'Delete Payment Target?' (:7773)", () => {
    expect(MSG.deletePaymentTargetTitle).toBe("Delete Payment Target?");
  });

  it("UT-CONTR-253 the contract description quotes the description (:7781)", () => {
    expect(confirmDeleteContractDescription("Grid works")).toBe(
      'Are you sure that you want to permanently delete "Grid works" contract?',
    );
  });

  it("UT-CONTR-254 the payment-target description quotes the description (:7745)", () => {
    expect(confirmDeletePaymentTargetDescription("Period 1")).toBe(
      'Are you sure that you want to permanently delete "Period 1" payment target?',
    );
  });

  it("UT-CONTR-255 a missing description reads as empty quotes, as a blank Power Fx text does", () => {
    expect(confirmDeleteContractDescription(undefined)).toBe(
      'Are you sure that you want to permanently delete "" contract?',
    );
    expect(confirmDeletePaymentTargetDescription(undefined)).toBe(
      'Are you sure that you want to permanently delete "" payment target?',
    );
  });
});

describe("the labels", () => {
  it("UT-CONTR-256 the Project Rights total label carries the currency, EUR when it is blank (:3619)", () => {
    expect(rightsTotalLabel("USD")).toBe("Total Costs Contract [USD]");
    expect(rightsTotalLabel("")).toBe("Total Costs Contract [EUR]");
    expect(rightsTotalLabel("  ")).toBe("Total Costs Contract [EUR]");
    expect(rightsTotalLabel(undefined)).toBe("Total Costs Contract [EUR]");
  });

  it("UT-CONTR-257 the card captions (:899, :976, :1266, :1361)", () => {
    expect(CARD_LABEL.costsUntilClosing("EUR")).toBe("Costs Until Closing [EUR]");
    expect(CARD_LABEL.margin("%")).toBe("Margin [%]");
    expect(CARD_LABEL.margin("PLN")).toBe("Margin [PLN]");
    expect(CARD_LABEL.costsAfterClosing("EUR")).toBe("Costs After Closing [EUR]");
    expect(CARD_LABEL.totalCosts("EUR")).toBe("Total Costs [EUR]");
  });

  it("UT-CONTR-258 the Margin radio's options are the Dataverse choice labels Yes and No (:5952)", () => {
    expect(MSG.marginYes).toBe("Yes");
    expect(MSG.marginNo).toBe("No");
  });

  it("UT-CONTR-259 the margin-type radio's options are Percentage and Fixed Value (:5890)", () => {
    expect(MSG.marginTypePercentage).toBe("Percentage");
    expect(MSG.marginTypeFixedValue).toBe("Fixed Value");
  });
});

describe("NEW TEXT (no canvas source)", () => {
  it("UT-CONTR-260 the accessible-name suffix of a DevCo account another contract claimed", () => {
    expect(MSG.usedByAnotherContractSuffix).toBe(" (used by another contract)");
  });

  it("UT-CONTR-261 the failure banner's title", () => {
    expect(MSG.failureBannerTitle).toBe("Could not complete that");
  });

  it("UT-CONTR-262 the no-project and project-not-found states", () => {
    expect(MSG.noProjectTitle).toBe("No project selected");
    expect(MSG.noProjectDescription).toBe("Pick a project from the overview and use Edit Costs to open its costs.");
    expect(MSG.projectNotFoundTitle).toBe("That project could not be opened");
    expect(MSG.projectNotFoundDescription).toBe(
      "It may have been deleted, or it may belong to a business unit your account cannot see. " +
      "Ask your administrator if you believe you should have access.",
    );
    expect(MSG.goToProjects).toBe("Go to Projects");
  });

  it("UT-CONTR-263 the failed-read state", () => {
    expect(MSG.costDataUnavailableTitle).toBe("Cost data is unavailable");
    expect(MSG.costDataUnavailableDescription).toBe("This project's Cost data could not be loaded.");
  });

  it("UT-CONTR-264 the inline loading caption", () => {
    expect(MSG.loadingContracts).toBe("Loading contracts…");
  });
});
