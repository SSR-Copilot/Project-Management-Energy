/**
 * Stand-in for `fast-formula-parser` (D162, FE-C1-01), aliased in `vite.config.ts` like `use-context-selector` (D140).
 *
 * `react-spreadsheet` (the Add Cost from Table grid) imports the formula engine statically and builds a `DepParser` at module load,
 * then a new `FormulaParser` on every cell commit, although this app never evaluates a formula: month cells are whole numbers
 * (`SpreadSheet.tsx`, `wholeNumberCell`), and the read-back, Save and Copy Table read the raw `cell.value`, never the evaluated
 * data. The engine and its dependencies (chevrotain, jstat, regexp-to-ast, bessel, bahttext) were 278 kB of the screen's 360 kB.
 *
 * DIVERGENCE (D162 D-2, approved 25 Nov 2026): a text cell typed as `=x` now SHOWS `=x`, which is also what is saved. With the real
 * engine it showed the evaluated value (e.g. `#NAME?`) while the raw `=x` was saved. Every other cell is unaffected: the library only
 * calls these for values that start with `=` and are longer than one character (`isFormulaValue`).
 *
 * Only the members `react-spreadsheet` 0.9.x uses exist (`dist/es/index.js`): `new FormulaParser(config).parse(formula, position)`,
 * `new DepParser().parse(formula, position)` (the cells a formula refers to: none), `FormulaError` (`instanceof` checks and
 * `FormulaError.REF`, reached only for a circular reference, which cannot occur without references).
 */

export class FormulaError extends Error {
  static readonly REF = "#REF!";
}

export default class FormulaParser {
  /** The formula is shown as typed, with its `=`: the text the cell holds and Save writes. */
  parse(formula: string): string {
    return `=${formula}`;
  }
}

export class DepParser {
  parse(): [] {
    return [];
  }
}
