/**
 * Ported from the PCF's `SpreadSheet/util_datset.ts` — only `findNearestAccountHeaderRow`
 * matters outside the PCF dataset-binding boilerplate (this app has its own Dataverse
 * services, not PCF datasets).
 */
export type GridCell = { value: string; Row_ID?: string };

const ACCOUNTNUMBER_COL = 0;
const ACCOUNTNAME_COL = 1;

export function findNearestAccountHeaderRow<Cell extends GridCell>(
  data: Cell[][],
  startIndex: number,
  accountNoCol = ACCOUNTNUMBER_COL,
  accountNameCol = ACCOUNTNAME_COL,
): { row: Cell[]; index: number } | null {
  for (let i = startIndex; i >= 0; i--) {
    const row = data[i];
    if (!row) continue;
    const accNo = (row[accountNoCol]?.value ?? "").toString().trim();
    const accName = (row[accountNameCol]?.value ?? "").toString().trim();
    if (accNo !== "" && accName !== "") {
      return { row, index: i };
    }
  }
  return null;
}
