/**
 * Project Generators Screen — option lists for the panels' comboboxes (D143, moved verbatim from `Screen.tsx` via `controls.tsx`).
 */
import { fmtHubHeight } from "../rules";
import type { SelectOption } from "./controls";

export const plainOptions = (values: readonly (string | number)[]): SelectOption[] =>
  values.map((v) => ({ value: String(v), label: String(v) }));

/**
 * The hub-height combobox (`cmb_Supplier_2.Items` = `{Height: Item.Value}`, Y:14674): the canvas shows each height as a
 * number in the user's language ("169,5"). The option value stays the plain number, so the selection still maps.
 */
export const heightOptions = (values: readonly number[], lang: string): SelectOption[] =>
  values.map((v) => ({ value: String(v), label: fmtHubHeight(v, lang) }));

/** `Choices('Inverter Type')` / `Choices('Substructure Type')` as combobox options. */
export const choiceOptions = (labels: Readonly<Record<number, string>>): SelectOption[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

