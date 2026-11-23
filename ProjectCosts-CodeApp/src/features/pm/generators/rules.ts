/**
 * Project Generators Screen — every business rule as a pure function (canvas screen `Project Generators Screen`, PM app).
 *
 * The rules are split by job (D159, audit finding 7); this file re-exports all of them, so
 * `import … from "./rules"` and `@/features/pm/generators/rules` work as before. The screen's overview, what was deleted
 * as a workaround and the SOURCE DEFECT list are at the top of `rulesCore.ts`.
 *  - `rulesCore.ts`: the columns, types, catalogue, pricing, turbines, command bar, guards, validation, save gates and permissions
 *  - `captions.ts`: the screen captions of the cards, panels and dialogs
 *  - `display.ts`: the selection, folding, card display values and the turbine / BESS / Hydrogen / Substation panel forms
 *  - `plans.ts`: the write plans of a type's Save, Delete and the turbine grid
 *  - `rollback.ts`: the rollback of a failed create save and what a failed delete job did and did not remove
 *  - `panelPlans.ts`: the Add / Edit Inverter and Substructure panels, and the module-permission flows' texts
 *  - `replacePlans.ts`: Replace Generator / PV Module Type, the write plans
 */
export * from "./rulesCore";
export * from "./captions";
export * from "./display";
export * from "./plans";
export * from "./rollback";
export * from "./panelPlans";
export * from "./replacePlans";
