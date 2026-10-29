import type { GridCallback } from "./GridRenderer";
export class ActionDropdown {
  constructor(onAction: GridCallback);
  /** CA-16 — grey and disable Edit / Comments / Delete while a write runs. */
  setWriteActionsDisabled(disabled: boolean): void;
  destroy(): void;
}
/** CA-16 — grey and disable (or restore) one write-starting menu item. */
export function setWriteItemDisabled(item: HTMLButtonElement, disabled: boolean): void;
