export type GridAction = "Edit" | "Comment" | "Delete" | "Add" | "AddStandardContract" | "SetCostPaidUnpaid";
export type GridCallback = (action: GridAction, recordId: string, standardContractId?: string, paid?: { year: number; month: number; paid: boolean }) => void;
import type { ActionDropdown } from "./ActionDropdown";
export class GridRenderer {
  constructor(container: HTMLDivElement, expanded: Set<string>, menu: ActionDropdown, onAction: GridCallback);
  render(context: unknown): void;
  destroy(): void;
}
