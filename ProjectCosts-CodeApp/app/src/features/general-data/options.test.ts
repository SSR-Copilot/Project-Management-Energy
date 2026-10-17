import { describe, expect, it } from "vitest";
import { TECHNOLOGY } from "@/domain/project";
import {
  OWNERSHIP_TYPE_OPTIONS, SHAREHOLDER_TYPE_OPTIONS, SPV_LEGAL_STRUCTURE_OPTIONS, START_CLUSTER_OPTIONS,
  TECHNOLOGY_OPTIONS, DEVELOPMENT_TYPE_OPTIONS,
} from "./options";
import { DEV_TYPE_ACQUIRED, SHAREHOLDER_TYPE_THIRD_PARTY } from "./rules";

describe("General Data dropdown options (SDK 1.5 display labels)", () => {
  it("excludes Hybrid by option value, keeps the rest", () => {
    expect(TECHNOLOGY_OPTIONS.map((o) => o.value)).not.toContain(TECHNOLOGY.hybrid);
    expect(TECHNOLOGY_OPTIONS.map((o) => o.label)).toEqual(["Wind", "PV", "BESS", "Hydrogen", "Hydro", "Substation"]);
  });

  it("excludes Greenfield (0) and Cluster 1 (1) from Start Cluster by option value", () => {
    expect(START_CLUSTER_OPTIONS).toEqual([
      { value: 2, label: "Cluster 2" }, { value: 3, label: "Cluster 3" }, { value: 4, label: "Cluster 4" },
      { value: 5, label: "Cluster 5" }, { value: 6, label: "Cluster 6" },
    ]);
  });

  it("shows the Dataverse display labels verbatim (as the canvas Choices do)", () => {
    expect(SPV_LEGAL_STRUCTURE_OPTIONS.map((o) => o.label)).toEqual(["GmbH", "GmbH & Co. KG"]);
    expect(OWNERSHIP_TYPE_OPTIONS.map((o) => o.label))
      .toEqual(["3rd Party", "Green Yield One (IPP2)", "VSB Group", "IPP1"]);
    expect(DEVELOPMENT_TYPE_OPTIONS.find((o) => o.value === DEV_TYPE_ACQUIRED)?.label).toBe("Acquired Project");
    expect(SHAREHOLDER_TYPE_OPTIONS.find((o) => o.value === SHAREHOLDER_TYPE_THIRD_PARTY)?.label).toBe("Third Party");
    expect(SHAREHOLDER_TYPE_OPTIONS.find((o) => o.value === 952850010)?.label).toBe("VSB Beteiligung GmbH");
  });
});
