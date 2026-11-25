// @vitest-environment jsdom
/**
 * D162 (FE-C1-01): `fast-formula-parser` is aliased to `formulaParserStub.ts` (vite.config.ts, also used by Vitest). These run the
 * REAL `react-spreadsheet` through the alias.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import Spreadsheet from "react-spreadsheet";
import FormulaParser, { DepParser, FormulaError } from "fast-formula-parser";
import Stub, { DepParser as StubDep } from "./formulaParserStub";

describe("formula engine stub (D162, FE-C1-01)", () => {
  it("UT-FORMULASTUB-001 the package name resolves to the stub", () => {
    expect(FormulaParser).toBe(Stub);
    expect(DepParser).toBe(StubDep);
    expect(new FormulaParser().parse("SUM(A1:A2)")).toBe("=SUM(A1:A2)");
    expect(new DepParser().parse()).toEqual([]);
    expect(FormulaError.REF).toBe("#REF!");
  });

  it("UT-FORMULASTUB-002 react-spreadsheet shows numbers and text unchanged, and a typed formula as typed (DIVERGENCE D-2)", () => {
    const { container } = render(
      <Spreadsheet data={[[{ value: 120 }, { value: "My Cost" }], [{ value: "=A1*2" }, { value: "=" }]]} />,
    );
    const cells = [...container.querySelectorAll("td")].map((td) => td.textContent);
    expect(cells).toEqual(["120", "My Cost", "=A1*2", "="]);
  });
});
