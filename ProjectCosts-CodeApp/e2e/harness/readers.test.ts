/**
 * UT-PHREAD: the harness's generic readers (`readers.ts`): the pure decisions, and the default readers driven through a
 * fake frame (no browser). The fake answers only what the readers ask: a locator chain by test id, control name or exact
 * text, `count`, `evaluate` (the enabled attributes) and `isVisible`.
 */
import { describe, expect, it } from "vitest";
import type { FrameLocator } from "@playwright/test";
import type { ScreenManifest } from "./contract";
import {
  buttonEnabledFrom, codeSelector, defaultReadGates, defaultReadValidation, enabledFrom, fieldInput, fromNames, isDisplayValueTestId,
  locate, normaliseText, pickVisibleMessages, resetToRest, routePath, type EnabledAttrs,
} from "./readers";

/**
 * One element the fake frame knows: how it is found, whether it shows, its enabled attributes. `clipped`: laid out and
 * "visible" to Playwright, but cut off by an overflow ancestor (a folded Canvas card's command).
 */
interface FakeEl { testId?: string; name?: string; text?: string; visible?: boolean; clipped?: boolean; attrs?: EnabledAttrs }

function fakeFrame(els: FakeEl[], log: string[] = []) {
  const loc = (desc: string, match: (e: FakeEl) => boolean, onlyVisible = false): unknown => {
    const hits = () => els.filter((e) => match(e) && (!onlyVisible || e.visible !== false));
    return {
      desc,
      filter: (o: { visible?: boolean }) => loc(`${desc}.filter(${JSON.stringify(o)})`, match, onlyVisible || o.visible === true),
      first: () => loc(`${desc}.first()`, match, onlyVisible),
      nth: (i: number) => { const target = hits()[i]; return loc(`${desc}.nth(${i})`, (e) => e === target, onlyVisible); },
      evaluateAll: async () => hits().flatMap((e, i) => (e.visible !== false && !e.clipped ? [i] : [])),
      locator: (sel: string) => loc(`${desc} >> ${sel}`, match, onlyVisible),
      count: async () => hits().length,
      isVisible: async () => hits().some((e) => e.visible !== false),
      waitFor: async () => { if (!hits().some((e) => e.visible !== false)) throw new Error("not visible"); },
      evaluate: async () => {
        const e = hits()[0];
        if (!e) throw new Error(`no element for ${desc}`);
        return e.attrs ?? { disabled: false, ariaDisabled: null, selfAriaDisabled: null };
      },
      click: async () => { log.push(`click ${desc}`); },
    };
  };
  const nameOf = (sel: string) => /\[data-control-name='(.*)'\]/.exec(sel)?.[1];
  const prefixOf = (sel: string) => /^\[data-testid\^='(.*)'\]$/.exec(sel)?.[1];
  return {
    getByTestId: (id: string) => loc(`testid=${id}`, (e) => e.testId === id),
    getByText: (t: string) => loc(`text=${t}`, (e) => e.text === t),
    locator: (sel: string) => {
      // `visibleMessages` reads every message in ONE page call (`findShownTexts`, tested in jsdom by readers.dom.test.ts):
      // here, the shown elements whose text is wanted.
      if (sel === ":root") {
        return { evaluate: async (_fn: unknown, arg: { wanted: string[] }) => els.filter((e) => e.visible !== false && e.text !== undefined && arg.wanted.includes(e.text)).map((e) => e.text!) };
      }
      const prefix = prefixOf(sel);
      return prefix !== undefined ? loc(sel, (e) => e.testId?.startsWith(prefix) === true) : loc(sel, (e) => e.name === nameOf(sel));
    },
  } as unknown as FrameLocator;
}

const off: EnabledAttrs = { disabled: true, ariaDisabled: null, selfAriaDisabled: null };
const manifest = (over: Partial<ScreenManifest> = {}) => ({ messages: [], controls: {}, ...over }) as Pick<ScreenManifest, "messages" | "controls">;

describe("pure decisions", () => {
  it("UT-PHREAD-001 enabledFrom: disabled or aria-disabled on the control, or aria-disabled on the located element, is disabled", () => {
    expect(enabledFrom({ disabled: false, ariaDisabled: null, selfAriaDisabled: null })).toBe(true);
    expect(enabledFrom({ disabled: false, ariaDisabled: "false", selfAriaDisabled: null })).toBe(true);
    expect(enabledFrom({ disabled: true, ariaDisabled: null, selfAriaDisabled: null })).toBe(false);
    expect(enabledFrom({ disabled: false, ariaDisabled: "true", selfAriaDisabled: null })).toBe(false);
    expect(enabledFrom({ disabled: false, ariaDisabled: null, selfAriaDisabled: "true" })).toBe(false);
  });

  it("UT-PHREAD-002 pickVisibleMessages: verbatim as listed, sorted, once; whitespace-insensitive match", () => {
    const msgs = ["Value must be a number", "Year value must be in format YYYY.", "Please select a value between 0 and 100."];
    expect(pickVisibleMessages(["Year value  must be in format YYYY.", "Other", "Value must be a number", "Value must be a number"], msgs))
      .toEqual(["Value must be a number", "Year value must be in format YYYY."]);
    expect(pickVisibleMessages([], msgs)).toEqual([]);
    expect(normaliseText("  a  b\n")).toBe("a b");
  });

  it("UT-PHREAD-003 isDisplayValueTestId: a row id suffix is fine, a name suffix is not; configured kebab ids are never flagged", () => {
    expect(isDisplayValueTestId("btn_OpexCosts_Row_TransparentButton_2-0f8e9a2c-1b2c-4d5e-8f90-123456789abc")).toBe(false);
    expect(isDisplayValueTestId("leasecard-0f8e9a2c-1b2c-4d5e-8f90-123456789abc")).toBe(false);
    expect(isDisplayValueTestId("txt_Row_Amount-12")).toBe(false);
    expect(isDisplayValueTestId("leasecard-Lease Wind")).toBe(true);
    expect(isDisplayValueTestId("btn_Select_Row-Germany")).toBe(true);
    expect(isDisplayValueTestId("lease-otp")).toBe(false);
    expect(isDisplayValueTestId("header-user-app-settings")).toBe(false);
    expect(fromNames(["leasecard-Lease Wind", "lease-otp", "leasecard-Lease Wind", "btn_A-Zed"])).toEqual(["btn_A-Zed", "leasecard-Lease Wind"]);
  });

  it("UT-PHREAD-004 routePath drops the query", () => {
    expect(routePath("/costs/land-lease?projectId=00000000-0000-4000-8000-000000000001")).toBe("/costs/land-lease");
    expect(routePath("")).toBe("");
  });
});

describe("locating", () => {
  it("UT-PHREAD-010 locate: code by test id, canvas by control name or caption, always the first visible", () => {
    const frame = fakeFrame([]);
    const d = (l: unknown) => (l as { desc: string }).desc;
    expect(d(locate({ kind: "code", frame }, { canvas: "btn_Save", code: "save" }))).toBe('testid=save.filter({"visible":true}).first()');
    expect(d(locate({ kind: "canvas", frame }, { canvas: "btn_Save", code: "save" }))).toBe("[data-control-name='btn_Save'].filter({\"visible\":true}).first()");
    expect(d(locate({ kind: "canvas", frame }, { canvas: "Add Period", code: "add", by: "caption" }))).toBe('text=Add Period.filter({"visible":true}).first()');
    expect(d(fieldInput({ kind: "canvas", frame }, { canvas: "txt_A", code: "a" }))).toContain(">> xpath=descendant-or-self::input | descendant-or-self::textarea");
  });

  it("UT-PHREAD-011 locate with codeMatch prefix: [data-testid^='…'] in the code app, the first VISIBLE match; the Canvas is unchanged", async () => {
    const frame = fakeFrame([{ testId: "leasecard-Hidden", visible: false }, { testId: "leasecard-Locations" }, { testId: "leasecard-Roads" }]);
    const ref = { canvas: "lbl_Card", code: "leasecard-", codeMatch: "prefix" as const };
    const d = (l: unknown) => (l as { desc: string }).desc;
    expect(codeSelector(ref)).toBe("[data-testid^='leasecard-']");
    expect(codeSelector({ code: "leasecard-" })).toBeNull();
    expect(codeSelector({ code: "a'b", codeMatch: "prefix" })).toBe("[data-testid^='a\\'b']");
    expect(d(locate({ kind: "code", frame }, ref))).toBe("[data-testid^='leasecard-'].filter({\"visible\":true}).first()");
    expect(await locate({ kind: "code", frame }, ref).isVisible()).toBe(true);
    expect(await locate({ kind: "code", frame }, { ...ref, code: "leasecard-Hidden" }).isVisible()).toBe(false);
    expect(d(locate({ kind: "canvas", frame }, ref))).toBe("[data-control-name='lbl_Card'].filter({\"visible\":true}).first()");
  });
});

describe("default readers (fake frame)", () => {
  it("UT-PHREAD-020 defaultReadValidation: the visible listed messages and Save's state", async () => {
    const frame = fakeFrame([
      { text: "Value must be a number" }, { text: "Year value must be in format YYYY.", visible: false },
      { testId: "save", attrs: off },
    ]);
    const m = manifest({ messages: ["Year value must be in format YYYY.", "Value must be a number"], controls: { save: { canvas: "btn_Save", code: "save" } } });
    expect(await defaultReadValidation({ kind: "code", frame }, m)).toEqual({ messages: ["Value must be a number"], save: false });
  });

  it("UT-PHREAD-021 defaultReadValidation: no Save control, or a Save that does not show, reads as not enabled", async () => {
    const frame = fakeFrame([{ name: "btn_Save", visible: false }]);
    expect(await defaultReadValidation({ kind: "canvas", frame }, manifest())).toEqual({ messages: [], save: false });
    expect(await defaultReadValidation({ kind: "canvas", frame }, manifest({ controls: { save: { canvas: "btn_Save", code: "save" } } }))).toEqual({ messages: [], save: false });
  });

  it("UT-PHREAD-025 defaultReadValidation: Save is read through locate(), clipped or not (as the old spec), button disabled / aria-disabled", async () => {
    const save = { canvas: "btn_Save", code: "save" };
    const m = (attrs?: EnabledAttrs) => fakeFrame([{ name: "btn_Save", clipped: true, ...(attrs ? { attrs } : {}) }]);
    // A Save scrolled out of a long panel is clipped: shown() would skip it; the old spec read it anyway.
    expect((await defaultReadValidation({ kind: "canvas", frame: m() }, manifest({ controls: { save } }))).save).toBe(true);
    expect((await defaultReadValidation({ kind: "canvas", frame: m(off) }, manifest({ controls: { save } }))).save).toBe(false);
    expect((await defaultReadValidation({ kind: "canvas", frame: m({ disabled: false, ariaDisabled: "true", selfAriaDisabled: null }) }, manifest({ controls: { save } }))).save).toBe(false);
    expect([buttonEnabledFrom({ disabled: false, ariaDisabled: null }), buttonEnabledFrom({ disabled: false, ariaDisabled: "false" })]).toEqual([true, true]);
  });

  it("UT-PHREAD-022 defaultReadGates: every command that shows, caption -> enabled; one that does not show is left out", async () => {
    const frame = fakeFrame([
      { text: "Edit", attrs: { disabled: false, ariaDisabled: "true", selfAriaDisabled: null } },
      { text: "Add Period" },
      { text: "Delete", visible: false },
    ]);
    const commands = {
      Edit: { canvas: "Edit", code: "edit", by: "caption" as const },
      "Add Period": { canvas: "Add Period", code: "add", by: "caption" as const },
      Delete: { canvas: "Delete", code: "del", by: "caption" as const },
    };
    expect(await defaultReadGates({ kind: "canvas", frame }, manifest({ controls: { commands } }))).toEqual({ Edit: false, "Add Period": true });
  });

  it("UT-PHREAD-024 defaultReadGates: a clipped match (a folded card's command) is passed over for the one a user sees", async () => {
    const frame = fakeFrame([
      { text: "Edit", clipped: true },
      { text: "Edit", attrs: { disabled: false, ariaDisabled: "true", selfAriaDisabled: null } },
      { text: "Delete", clipped: true },
    ]);
    const commands = { Edit: { canvas: "Edit", code: "edit", by: "caption" as const }, Delete: { canvas: "Delete", code: "del", by: "caption" as const } };
    expect(await defaultReadGates({ kind: "canvas", frame }, manifest({ controls: { commands } }))).toEqual({ Edit: false });
  });

  it("UT-PHREAD-023 resetToRest: Escape, Cancel when it shows (forced on the Canvas), reload only when the rest marker stays hidden", async () => {
    const run = async (els: FakeEl[]) => {
      const log: string[] = [];
      const app = {
        kind: "canvas" as const, frame: fakeFrame(els, log),
        page: { keyboard: { press: async (k: string) => { log.push(`key ${k}`); } } } as never,
        reload: async () => { log.push("reload"); },
      };
      await resetToRest(app, { controls: { cancel: { canvas: "btn_Cancel", code: "cancel" }, restMarker: { canvas: "lbl_Title", code: "title" } } });
      return log;
    };
    expect(await run([{ name: "btn_Cancel" }, { name: "lbl_Title" }])).toEqual(["key Escape", "click [data-control-name='btn_Cancel'].filter({\"visible\":true}).first()"]);
    expect(await run([{ name: "lbl_Title", visible: false }])).toEqual(["key Escape", "reload"]);
  });
});
