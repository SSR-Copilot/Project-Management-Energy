/**
 * Parity manifest: OPEX, the two tabs of the canvas `Opex Costs Screen` (D80, plan section 5a "Dynamic screens").
 *
 * The second screen of the one-hour harness, written to prove the harness is screen-agnostic: nothing under
 * `e2e/harness/` knows OPEX, and this file uses only the harness's public pieces (contract types, `readers.ts`, `waits.ts`)
 * and the shared `lib/cost.ts` primitive `unclippedIndexesOf`. Coverage per layer, and what is left with the reasons:
 * `ProjectDocs/app-docs/e2e/COVERAGE-MAP-opex.md`. Started from the generator's `manifest.draft.ts` beside this file.
 *
 * Sources checked for every name below:
 *   canvas   `ProjectDocs/_extracted/msapp/projectcosts/Src/Opex Costs Screen.pa.yaml` (solution 1.21.709), `App.pa.yaml`
 *            (`LeftNavigationMenu`), `Components/cmp_PopUp_Confirmation.pa.yaml`
 *   code app `src/features/cost/periods/OpexScreen.tsx` + `opexRules.ts` (one screen, `mode` "om" | "other"), routes
 *            `/costs/opex/om` and `/costs/opex/other` (`src/app/routes.tsx`, `navigation.ts`), `components/LeftNav.tsx`
 *            (`rail-<ItemKey>`), `components/CanvasFields.tsx` (CostField: the input's test id is the canvas name)
 *
 * TWO TABS, ONE SCREEN. The canvas serves "Operation & Maintenance" and "Other OPEX Costs" from one screen and switches on
 * `gblLeftNavigationSelected`; the code app has one `OpexScreen` with a `mode`. The harness opens O&M (`open`); the Other
 * OPEX states (`other-*`) switch tab first. A switch always goes THROUGH ANOTHER SCREEN (Land Lease), in both apps: in the
 * canvas, navigating to the screen already shown does not run `OnVisible` again (its `locSelectedAccount`,
 * `locSelectedOpexCost` and the folded device cards stay as they were); in the code app, a route change between the two
 * modes keeps the component mounted. Leaving and coming back gives both apps a fresh screen. The direct O&M -> Other switch
 * a user can also make is therefore NOT covered (coverage map).
 *
 * REST. `reset` (below) closes the delete prompt and the panel, then, when a step of this manifest changed the screen,
 * leaves to Land Lease and comes back to O&M: both apps then show the screen as first loaded (the canvas `OnVisible` folds
 * the device cards and clears the selection; the code app remounts, with its first card open by default). Other OPEX cards
 * are folded first on the canvas, because their fold state lives in `colOpexSubaccounts`, which `OnVisible` does not reload.
 *
 * DATA, from environment variables only (0-based indexes in screen order; never ids, never written into a file):
 *   OPEX_CARD        O&M card used by the card / row / panel states (default 0). Must hold a non-standard ROOT cost, on a WTG
 *                    device for the EUR/WTG field (the canvas hides it for a PV module).
 *   OPEX_ROW         row of that card (default 0): a non-standard chain root, so Edit, Delete and the panel toggles are enabled
 *   OPEX_EMPTY_CARD  an O&M card WITHOUT costs (Add Period with no selection). No default: `om-panel-add` needs it
 *   OPEX_OTHER_CARD  Other OPEX sub-account card (default 0)
 *   OPEX_OTHER_ROW   row of that card. No default: the Other OPEX row states need it (a project may have no Other costs)
 * A step that cannot reach its state throws naming the variable to change, so a wrong index fails loudly instead of
 * recording the wrong state under a right name.
 *
 * READ-ONLY. No step presses Save, Add Standard Contract (it writes at once) or the delete prompt's Delete. `flows` is empty
 * until the write paths have a product decision (see the comment there).
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import type { AppHandle, ControlRef, Kind, ScreenManifest } from "../../harness/contract";
import { appName, codeRoute, fieldInput, isEnabled, locate, normaliseText, routePath, shown } from "../../harness/readers";
import { settle } from "../../harness/waits";
import { unclippedIndexesOf } from "../../lib/cost";

/** What a step needs of the app: the handle without `reset` / `reload` (`reset` below gets only these three). */
type View = Pick<AppHandle, "kind" | "page" | "frame">;
type Tab = "om" | "other";

const T = 15_000;
const SCREEN_T = 60_000;

/* ─────────────────────────────────────────────────────────────── names ── */

/**
 * The two tabs. Canvas names from the YAML (O&M is the `GeneratorsInProject` gallery, whose header and row controls carry
 * the `_1` suffix; Other OPEX is the `Subaccounts` gallery); code ids from OpexScreen.tsx and LeftNav.tsx.
 */
const TABS: Readonly<Record<Tab, {
  menu: string; rail: string; route: string;
  canvasGallery: string; canvasTitle: string; canvasUp: string; canvasDown: string; canvasRow: string;
  codeRowPrefix: string;
}>> = {
  om: {
    menu: "Operation & Maintenance",                                       // App.pa.yaml O&MKey.ItemDisplayName
    rail: "rail-O&MKey",
    route: "/costs/opex/om",
    canvasGallery: "gal_OpexCosts_Content_GeneratorsInProject",            // :2681, Visible: ItemDisplayName = "Operation & Maintenance"
    canvasTitle: "lbl_OpexCosts_Content_SubaccountsCardHeader_SubaccountName_1", // :4781
    canvasUp: "ico_OpexCosts_Content_SubaccountsCardHeader_Up_1",          // :4871, Visible: Not(ThisItem.IsFolded)
    canvasDown: "ico_OpexCosts_Content_SubaccountsCardHeader_Down_1",      // :4904, Visible: ThisItem.IsFolded
    canvasRow: "con_OpexCosts_Content_GeneratorsInProject_CardBody_CostsTableRow", // :3945, covered by btn_…_TransparentButton_1
    codeRowPrefix: "btn_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_TransparentButton_1-",
  },
  other: {
    menu: "Other OPEX Costs",                                              // App.pa.yaml OtherOpexCostsKey.ItemDisplayName
    rail: "rail-OtherOpexCostsKey",
    route: "/costs/opex/other",
    canvasGallery: "gal_OpexCosts_Content_Subaccounts",                    // :320, Visible: ItemDisplayName = "Other OPEX Costs"
    canvasTitle: "lbl_OpexCosts_Content_SubaccountsCardHeader_SubaccountName", // :2282
    canvasUp: "ico_OpexCosts_Content_SubaccountsCardHeader_Up",            // :2330
    canvasDown: "ico_OpexCosts_Content_SubaccountsCardHeader_Down",        // :2363
    canvasRow: "con_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow", // :1482, covered by btn_…_TransparentButton
    codeRowPrefix: "btn_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_TransparentButton-",
  },
};

/** The screen a tab switch and a reset pass through (another canvas screen, so the OPEX `OnVisible` runs on the way back). */
const AWAY = { menu: "Land Lease", rail: "rail-LandLeaseKey", route: "/costs/land-lease" } as const;

/** The canvas left menu (`cmp_Left_Navigation` -> `pcf_Left_Navigation_Menu`) and the screen's root container. */
const CANVAS_MENU = "pcf_Left_Navigation_Menu";
const CANVAS_SCREEN = "con_OpexCosts_Screen";
/** `lbl_OpexCosts_Content_GeneratorsInProject_Instruction.Text` (:317) = `OPEX_MSG.noGenerators`: O&M with no device. */
const NO_GENERATORS = "Please add a generator and refresh this page to enter Operation & Maintenance costs";

const P = "OpexCosts_RightPanel_NewEditCost_";
/** Panel controls. A text field's code test id is its canvas name (CostField), except the custom inflation profile. */
const PANEL = {
  save: { canvas: `pcf_${P}BodyButtons_Save`, code: `pcf_${P}BodyButtons_Save` },
  cancel: { canvas: `pcf_${P}BodyButtons_Cancel`, code: `pcf_${P}BodyButtons_Cancel` },
  close: { canvas: `ico_${P}BodyheaderCancel`, code: "panel-close" },                       // FormPanel's ✕
  description: { canvas: `txt_${P}BodyContent_Description`, code: `txt_${P}BodyContent_Description` },
  fixCosts: { canvas: `txt_${P}BodyContent_FixCosts`, code: `txt_${P}BodyContent_FixCosts` },
  revenues: { canvas: `txt_${P}BodyContent_ProcentOfRevenues`, code: `txt_${P}BodyContent_ProcentOfRevenues` },
  eurMwh: { canvas: `txt_${P}BodyContent_EuroPerMwh`, code: `txt_${P}BodyContent_EuroPerMwh` },
  eurMw: { canvas: `txt_${P}BodyContent_EuroPerMw`, code: `txt_${P}BodyContent_EuroPerMw` },
  eurWtg: { canvas: `txt_${P}BodyContent_EuroPerWtg`, code: `txt_${P}BodyContent_EuroPerWtg` },
  inflationStartYear: { canvas: `txt_${P}BodyContent_InflationStartYear`, code: `txt_${P}BodyContent_InflationStartYear` },
  inflationProfile: { canvas: `txt_${P}BodyContent_InflationProfile`, code: "opex-inflation-profile" },
  thresholdIndividual: { canvas: `txt_${P}BodyContent_Threshold_Individual`, code: `txt_${P}BodyContent_Threshold_Individual` },
  inflationToggle: { canvas: `tgl_${P}BodyContent_InflationProfile`, code: "opex-inflation" },              // :7351
  countryInflationToggle: { canvas: `tgl_${P}BodyContent_CountryInflationProfile`, code: "opex-country-inflation" }, // :7325
  thresholdToggle: { canvas: `togl_${P}BodyContent_Threshold`, code: "opex-threshold" },                   // :8416
  thresholdRadio: { canvas: `rdg_${P}BodyContent_Threshold`, code: "opex-threshold-952850002" },          // :8295; THRESHOLD_TYPE.individual
  resetStartDate: { canvas: "ico_ResetStartDay_NewEditCost_OPEXCosts", code: "opex-reset-start" },           // :5942
  externalInfo: { canvas: "InfoButtonCanvas1", code: "InfoButtonCanvas1" },                                // :8556
} as const satisfies Record<string, ControlRef>;

/** The `Choices(Thresholds)` option the individual-threshold field needs (code: THRESHOLD_OPTIONS label). */
const INDIVIDUAL = "Individual";

/**
 * The card command bars (`pcf_con_…_SubaccountsCommandBar`, :413; `pcf_con_…_GeneratorsInProject_CardBody_CommandBar`,
 * :2772): canvas by caption (PCF CommandBar items have no control name of their own), code by `opex-<ItemKey>`. O&M has no
 * "Add Contract Type"; the gates reader leaves out a command that does not show.
 */
const COMMANDS = {
  "Add Contract Type": { canvas: "Add Contract Type", code: "opex-newOpexProjectCostType", by: "caption" },
  "Add Period": { canvas: "Add Period", code: "opex-newOpexProjectCost", by: "caption" },
  "Add Standard Contract": { canvas: "Add Standard Contract", code: "opex-addStandardContract", by: "caption" },
  "Edit": { canvas: "Edit", code: "opex-editOpexProjectCost", by: "caption" },
  "Delete": { canvas: "Delete", code: "opex-deleteOpexProjectCost", by: "caption" },
} as const satisfies Record<string, ControlRef>;
type Command = keyof typeof COMMANDS;

/** `cmp_OpexCosts_PopUpConfirmation_DeleteCost.Title` (:8923) = `DELETE_DIALOG.title`. */
const DELETE_TITLE = "Delete OPEX cost?";

/* ──────────────────────────────────────────────────────────────── data ── */

/** A 0-based index from the environment, else `fallback`; read when a step runs, so `--list` never fails on it. */
function indexFrom(name: string, fallback?: number): number {
  const v = process.env[name]?.trim();
  if (!v) {
    if (fallback === undefined) throw new Error(`Set ${name} to a 0-based index (see e2e/screens/opex/manifest.ts)`);
    return fallback;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a 0-based index (got "${v}")`);
  return n;
}
const omCard = () => indexFrom("OPEX_CARD", 0);
const omRow = () => indexFrom("OPEX_ROW", 0);
const otherCard = () => indexFrom("OPEX_OTHER_CARD", 0);
const hasEnv = (name: string) => !!process.env[name]?.trim();

/* ──────────────────────────────────────────────────── screen state, per page ── */

/**
 * Whether a step of this manifest changed the screen since it was last at rest (a card unfolded, a row selected, a panel
 * opened, the tab switched). Kept per page; a fresh page (a new worker, or the harness's `reload`) starts clean.
 */
const changed = new WeakMap<Page, boolean>();
const markChanged = (view: View) => { changed.set(view.page, true); };

const canvas = (view: View) => view.kind === "canvas";
const byName = (view: View, name: string): Locator => view.frame.locator(`[data-control-name='${name}']`);

async function waitUntil(what: string, check: () => Promise<boolean>, timeoutMs = SCREEN_T): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`opex: ${what} after ${timeoutMs} ms`);
}

/** The tab the screen shows: the code app's route; on the canvas, which of the two galleries is visible. */
async function currentTab(view: View): Promise<Tab> {
  if (!canvas(view)) return routePath(codeRoute(view.page)) === TABS.other.route ? "other" : "om";
  return (await byName(view, TABS.other.canvasGallery).first().isVisible().catch(() => false)) ? "other" : "om";
}

/** One left-menu item: the canvas menu caption (scoped to the menu: card titles may carry the same words) or the code rail. */
async function clickNav(view: View, item: { menu: string; rail: string }): Promise<void> {
  if (!canvas(view)) {
    await view.frame.getByTestId(item.rail).click({ timeout: T });
    return;
  }
  const scoped = byName(view, CANVAS_MENU).filter({ visible: true }).first().getByText(item.menu, { exact: true }).first();
  const target = (await scoped.count().catch(() => 0)) ? scoped : view.frame.getByText(item.menu, { exact: true }).first();
  await target.click({ force: true, timeout: T });
}

/** The tab has loaded: its first card title (or, on O&M with no device, the instruction) shows and the app is idle. */
async function settleOnTab(view: View, tab: Tab): Promise<void> {
  const ready = canvas(view)
    ? view.frame.locator(`[data-control-name='${TABS[tab].canvasTitle}'], [data-control-name='lbl_OpexCosts_Content_GeneratorsInProject_Instruction']`)
    : view.frame.locator("[data-testid^='opex-card-']").or(view.frame.getByText(NO_GENERATORS, { exact: true }));
  await settle(view, { until: ready.filter({ visible: true }).first(), timeoutMs: SCREEN_T });
}

/** Leaves to Land Lease and comes back on `tab` (file header: why a switch always passes another screen). */
async function goTab(view: View, tab: Tab): Promise<void> {
  await clickNav(view, AWAY);
  if (canvas(view)) await byName(view, CANVAS_SCREEN).first().waitFor({ state: "hidden", timeout: SCREEN_T });
  else await waitUntil("the code app did not reach Land Lease", async () => routePath(codeRoute(view.page)) === AWAY.route);
  await settle(view, { timeoutMs: SCREEN_T });
  await clickNav(view, TABS[tab]);
  if (canvas(view)) await byName(view, CANVAS_SCREEN).first().waitFor({ state: "visible", timeout: SCREEN_T });
  else await waitUntil(`the code app did not reach ${TABS[tab].route}`, async () => routePath(codeRoute(view.page)) === TABS[tab].route);
  await settleOnTab(view, tab);
}

/** Shows `tab`, passing Land Lease when it is not shown already. */
async function ensureTab(view: View, tab: Tab): Promise<void> {
  if ((await currentTab(view)) === tab) return;
  markChanged(view);
  await goTab(view, tab);
}

/* ───────────────────────────────────────────────────────────────── cards ── */

/** Number of cards of the tab now on screen (the canvas gallery renders the cards near the viewport). */
async function cardCount(view: View, tab: Tab): Promise<number> {
  return canvas(view)
    ? byName(view, TABS[tab].canvasTitle).count()
    : view.frame.locator("[data-testid^='opex-card-']").count();
}

/**
 * Card `index`'s fold control and whether the card is open.
 *  canvas  : each card shows ONE chevron, `…_Up…` when open and `…_Down…` when folded (the `Visible` pair, :4871/:4904); the
 *            title is scrolled into view, then the visible chevron on the title's row is taken (`lib/cost.ts`
 *            toggleLeaseCard does the same for Land Lease's own names)
 *  code app: the header button `opex-card-<id>` and its `aria-expanded`
 */
async function cardFold(view: View, tab: Tab, index: number): Promise<{ open: boolean; control: Locator }> {
  if (!canvas(view)) {
    const header = view.frame.locator("[data-testid^='opex-card-']").nth(index);
    await header.waitFor({ state: "visible", timeout: SCREEN_T });
    await header.scrollIntoViewIfNeeded();
    return { open: (await header.getAttribute("aria-expanded")) === "true", control: header };
  }
  const t = TABS[tab];
  const title = byName(view, t.canvasTitle).nth(index);
  await title.scrollIntoViewIfNeeded({ timeout: T });
  const tb = await title.boundingBox();
  if (!tb) throw new Error(`Canvas ${tab} card ${index}: its title is not on screen`);
  for (const [open, name] of [[true, t.canvasUp], [false, t.canvasDown]] as const) {
    const chevrons = byName(view, name);
    for (let k = 0, n = await chevrons.count(); k < n; k++) {
      const c = chevrons.nth(k);
      const b = await c.boundingBox();
      if (b && (await c.isVisible()) && Math.abs(b.y + b.height / 2 - (tb.y + tb.height / 2)) < 24) return { open, control: c };
    }
  }
  throw new Error(`Canvas ${tab} card ${index}: no visible chevron on its header row`);
}

async function setCardOpen(view: View, tab: Tab, index: number, open: boolean): Promise<void> {
  const fold = await cardFold(view, tab, index);
  if (fold.open === open) return;
  markChanged(view);
  await fold.control.click({ force: canvas(view), timeout: T });
  await settle(view);
}

/** Only card `index` of `tab` open, so the command bar and the rows a step reads are that card's. */
async function openOnly(view: View, tab: Tab, index: number): Promise<void> {
  await ensureTab(view, tab);
  const n = await cardCount(view, tab);
  if (index >= n) throw new Error(`${appName(view.kind)}: ${tab} has ${n} card(s) on screen, no card ${index} (check ${tab === "om" ? "OPEX_CARD / OPEX_EMPTY_CARD" : "OPEX_OTHER_CARD"})`);
  for (let i = 0; i < n; i++) if (i !== index) await setCardOpen(view, tab, i, false);
  await setCardOpen(view, tab, index, true);
}

/** Every Other OPEX card folded (the canvas keeps their fold state in `colOpexSubaccounts` across `OnVisible`). */
async function foldAll(view: View, tab: Tab): Promise<void> {
  const n = await cardCount(view, tab);
  for (let i = 0; i < n; i++) await setCardOpen(view, tab, i, false);
}

/* ────────────────────────────────────────────────────────────────── rows ── */

/** The rows a user can see (the canvas lays out a folded card's rows too, clipped). */
async function visibleRows(view: View, tab: Tab): Promise<{ all: Locator; shown: number[] }> {
  const all = canvas(view)
    ? byName(view, TABS[tab].canvasRow)
    : view.frame.locator(`tr[data-testid^='${TABS[tab].codeRowPrefix}']`);
  return { all, shown: await unclippedIndexesOf(all) };
}

/**
 * Selects visible row `n` of the open card. The canvas row is one transparent button (`btn_…_TransparentButton…`), clicked
 * near its left edge (the row is wider than the card and scrolls sideways); the code app's `<tr>` is the select button.
 * A click on the selected row deselects it, in both apps, so steps start from rest.
 */
async function selectRow(view: View, tab: Tab, n: number, variable: string): Promise<void> {
  const { all, shown: idx } = await visibleRows(view, tab);
  const i = idx[n];
  if (i === undefined) throw new Error(`${appName(view.kind)}: the open ${tab} card shows ${idx.length} row(s), no row ${n} (check ${variable})`);
  markChanged(view);
  const row = all.nth(i);
  await row.scrollIntoViewIfNeeded({ timeout: T });
  await row.click(canvas(view) ? { force: true, position: { x: 60, y: 12 }, timeout: T } : { timeout: T });
  await settle(view);
}

/* ────────────────────────────────────────────────────── commands, panel ── */

/** Presses a command of the open card after checking it shows and is enabled (a disabled one names the data to change). */
async function pressCommand(view: View, caption: Command, hint: string): Promise<void> {
  const l = await shown(view, COMMANDS[caption]);
  if (!l) throw new Error(`${appName(view.kind)}: "${caption}" does not show (open a card first)`);
  if (!(await isEnabled(l))) throw new Error(`${appName(view.kind)}: "${caption}" is disabled here (${hint})`);
  markChanged(view);
  await l.click({ force: canvas(view), timeout: T });
}

async function waitPanel(view: View): Promise<void> {
  await settle(view, { until: locate(view, PANEL.save), timeoutMs: SCREEN_T });
}

/**
 * The cost panel on O&M card `OPEX_CARD`: Edit on row `OPEX_ROW` when the card has rows, else Add Period (enabled on an
 * empty card with no selection). Both apps read the same data, so they take the same branch.
 */
async function openFormPanel(view: View): Promise<void> {
  await openOnly(view, "om", omCard());
  if ((await visibleRows(view, "om")).shown.length === 0) {
    await pressCommand(view, "Add Period", "an empty card with no selection");
  } else {
    await selectRow(view, "om", omRow(), "OPEX_ROW");
    await pressCommand(view, "Edit", "OPEX_ROW must be a cost that is not a standard contract");
  }
  await waitPanel(view);
}

/** The edit panel of O&M row `OPEX_ROW` (never the Add branch: the state's name says Edit). */
async function openEditPanel(view: View): Promise<void> {
  await openOnly(view, "om", omCard());
  await selectRow(view, "om", omRow(), "OPEX_ROW");
  await pressCommand(view, "Edit", "OPEX_ROW must be a cost that is not a standard contract");
  await waitPanel(view);
}

/** The switch inside a toggle control: the canvas modern Toggle's input, or the Fluent Switch input that carries the test id. */
function switchOf(view: View, ref: ControlRef): Locator {
  return locate(view, ref).locator("xpath=descendant-or-self::input[@type='checkbox' or @role='switch'] | descendant-or-self::*[@role='switch']").first();
}

/** Turns a panel toggle on or off; throws when it must change but is read-only (the canvas `DisplayMode.View` on a child period). */
async function setToggle(view: View, ref: ControlRef, on: boolean): Promise<void> {
  const input = switchOf(view, ref);
  await input.waitFor({ state: "attached", timeout: T });
  const checked = await input.evaluate((e) => (e instanceof HTMLInputElement ? e.checked : e.getAttribute("aria-checked") === "true"));
  if (checked === on) return;
  if (!(await isEnabled(input))) {
    throw new Error(`${appName(view.kind)}: ${ref.canvas} is read-only here (OPEX_ROW must be a chain root; the threshold toggle also needs EUR/MWh)`);
  }
  await input.click({ force: canvas(view), timeout: T });
  await settle(view);
}

/** Types `value` into an empty panel field and leaves it (the threshold toggle needs a EUR/MWh figure). */
async function fillIfEmpty(view: View, ref: ControlRef, value: string): Promise<void> {
  const box = fieldInput(view, ref);
  if ((await box.inputValue({ timeout: T })).trim() !== "") return;
  await box.click({ force: canvas(view), timeout: T });
  await box.fill(value);
  await box.press("Tab");
  await settle(view);
}

/** Inflation Profile on, Country Inflation Profile off: the custom profile field and the start year show (:7243-7860). */
async function inflationFieldsShown(view: View): Promise<void> {
  await setToggle(view, PANEL.inflationToggle, true);
  await setToggle(view, PANEL.countryInflationToggle, false);
}

/** Threshold on with "Individual" chosen: the individual threshold field shows (:8094-8450; O&M only). */
async function individualThresholdShown(view: View): Promise<void> {
  await fillIfEmpty(view, PANEL.eurMwh, "1");
  await setToggle(view, PANEL.thresholdToggle, true);
  const radio = canvas(view)
    ? locate(view, PANEL.thresholdRadio).getByText(INDIVIDUAL, { exact: true }).first()
    : locate(view, PANEL.thresholdRadio);
  await radio.click({ force: canvas(view), timeout: T });
  await settle(view, { until: locate(view, PANEL.thresholdIndividual) });
}

/** The delete prompt of O&M row `OPEX_ROW`; it is never confirmed here. */
async function openDeletePrompt(view: View): Promise<void> {
  await openOnly(view, "om", omCard());
  await selectRow(view, "om", omRow(), "OPEX_ROW");
  await pressCommand(view, "Delete", "OPEX_ROW must be a chain root or the last period of its chain");
  await settle(view, { until: view.frame.getByText(DELETE_TITLE, { exact: true }).filter({ visible: true }).first() });
}

/* ───────────────────────────────────────────────────────────────── reset ── */

/** Closes the delete prompt (Cancel) and the panel (Cancel); Escape first, which closes the code app's dialog and drawer. */
async function closeOverlays(view: View): Promise<void> {
  await view.page.keyboard.press("Escape").catch(() => {});
  const promptCancel = canvas(view)
    ? view.frame.locator("[data-control-name^='cmp_OpexCosts_PopUpConfirmation_DeleteCost']").getByText("Cancel", { exact: true })
    : view.frame.getByTestId("confirm-dialog-cancel");
  const visibleCancel = promptCancel.filter({ visible: true }).first();
  if (await visibleCancel.isVisible().catch(() => false)) await visibleCancel.click({ force: canvas(view), timeout: T }).catch(() => {});
  const panelCancel = locate(view, PANEL.cancel);
  if (await panelCancel.isVisible().catch(() => false)) await panelCancel.click({ force: canvas(view), timeout: T }).catch(() => {});
}

/** The manifest's `reset` (file header, "REST"). */
async function backToRest(kind: Kind, page: Page, frame: AppHandle["frame"]): Promise<void> {
  const view: View = { kind, page, frame };
  await closeOverlays(view);
  if (!changed.get(page)) return;
  if (canvas(view) && (await currentTab(view)) === "other") await foldAll(view, "other");
  await goTab(view, "om");
  changed.set(page, false);
}

/* ────────────────────────────────────────────────────────────── ux checks ── */

/**
 * Every canvas control with a literal `AccessibleLabel` (generator list, :6000 / :6064 / :7130) and the code app control
 * that stands for it. CONVENTIONS rule 16 wants the canvas label verbatim; the code app's Fluent dropdowns say "Duration
 * months" / "Duration years" / "Distribution Frequency", so a run is expected to report these until that is settled.
 */
const ACCESSIBLE: readonly (readonly [canvasName: string, codeTestId: string, canvasLabel: string])[] = [
  [`drp_${P}BodyContent_DurationMonths`, "opex-months", "Month"],
  [`drp_${P}BodyContent_DurationYears`, "opex-years", "Year"],
  [`drp_${P}BodyContent_DistributionFrequency_Month`, "opex-frequency", "Month"],
];

/** The aria-label each listed control renders: its own, else the first one inside it; null when the control is not on screen. */
async function accessibleNames(app: AppHandle): Promise<Record<string, string | null>> {
  await openFormPanel(app);
  const out: Record<string, string | null> = {};
  for (const [canvasName, code] of ACCESSIBLE) {
    const el = (canvas(app) ? byName(app, canvasName) : app.frame.getByTestId(code)).filter({ visible: true }).first();
    if ((await el.count()) === 0) { out[canvasName] = null; continue; }
    const own = await el.getAttribute("aria-label", { timeout: 2_000 }).catch(() => null);
    const inner = el.locator("[aria-label]").first();
    out[canvasName] = own ?? ((await inner.count()) > 0 ? await inner.getAttribute("aria-label", { timeout: 2_000 }).catch(() => null) : null);
  }
  return out;
}

/** A hover target: the canvas control by name; the code app by test id, or by its visible caption where it has none. */
interface HoverTarget { key: string; canvas: string; code: { testId: string } | { text: string | RegExp } }

/**
 * The hover text a user sees on `target`: a visible `role="tooltip"` (Fluent, and the canvas modern controls), else the
 * nearest `title` attribute (the element, three ancestors, or a descendant). "(not on screen)" when the target does not
 * show, null when it shows but has no hover text. The tooltip is waited for up to 1.5 s (its open delay), not slept for.
 */
async function hoverText(app: AppHandle, target: Locator): Promise<string | null> {
  const el = target.filter({ visible: true }).first();
  if (!(await el.isVisible().catch(() => false))) return "(not on screen)";
  await el.hover({ force: canvas(app), timeout: T }).catch(() => {});
  const tip = app.frame.locator("[role='tooltip']").filter({ visible: true }).first();
  const tipText = await tip.waitFor({ state: "visible", timeout: 1_500 }).then(() => tip.innerText(), () => "");
  const title = tipText ? "" : await el.evaluate((e) => {
    for (let n: Element | null = e, i = 0; n && i < 4; n = n.parentElement, i++) {
      const t = n.getAttribute("title");
      if (t) return t;
    }
    return e.querySelector("[title]")?.getAttribute("title") ?? "";
  }).catch(() => "");
  await app.page.mouse.move(1, 1).catch(() => {});
  const text = normaliseText(tipText || title);
  return text === "" ? null : text;
}

/**
 * Hover texts of panel targets. A code app caption is looked up inside the panel (the drawer, `role="dialog"`): the card
 * table behind it has column headers with the same words ("Description", "Start Date", "Currency", ...).
 */
async function hoverAll(app: AppHandle, targets: readonly HoverTarget[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const panel = app.frame.locator("[role='dialog']").filter({ visible: true }).last();
  for (const t of targets) {
    const loc = canvas(app)
      ? byName(app, t.canvas)
      : "testId" in t.code ? app.frame.getByTestId(t.code.testId) : panel.getByText(t.code.text, { exact: true });
    out[t.key] = await hoverText(app, loc);
  }
  return out;
}

/** The panel's icon buttons with a canvas `Tooltip` (:5477 "Cancel", :5965, InfoButtonCanvas1 :8556). */
const HOVER_PANEL_ICONS: readonly HoverTarget[] = [
  { key: "close", canvas: PANEL.close.canvas, code: { testId: PANEL.close.code } },
  { key: "reset-start-date", canvas: PANEL.resetStartDate.canvas, code: { testId: PANEL.resetStartDate.code } },
  { key: "external-contract-info", canvas: PANEL.externalInfo.canvas, code: { testId: PANEL.externalInfo.code } },
];

/**
 * The panel's field captions: each canvas label has `Tooltip` = its own text (literal, or `Self.Text` where the caption is
 * a formula). The code app's captions carry no test id, so they are found by their verbatim text.
 */
const HOVER_FIELD_CAPTIONS: readonly HoverTarget[] = [
  { key: "description", canvas: `lbl_${P}BodyContentDescription`, code: { text: "Description" } },
  { key: "start-date", canvas: `lbl_${P}BodyContent_StartDate`, code: { text: "Start Date" } },
  { key: "duration", canvas: `lbl_${P}BodyContent_DurationYears`, code: { text: "Duration" } },
  { key: "currency", canvas: `lbl_${P}BodyContent_Currency`, code: { text: "Currency" } },
  { key: "fix-costs", canvas: `lbl_${P}BodyContent_FixCosts`, code: { text: /^Fix Costs p\.a\. \[.+\]$/ } },
  { key: "share-of-revenues", canvas: `lbl_${P}BodyContent_ProcentOfRevenues`, code: { text: "Share of Revenues [%]" } },
  { key: "eur-per-mwh", canvas: `lbl_${P}BodyContent_EuroPerMwh`, code: { text: /^[A-Z]{3}\/MWh p\.a\.$/ } },
  { key: "eur-per-mw", canvas: `lbl_${P}BodyContent_EuroPerMw`, code: { text: /^[A-Z]{3}\/MW p\.a\.$/ } },
  { key: "eur-per-wtg", canvas: `lbl_${P}BodyContent_EuroPerWtg`, code: { text: /^[A-Z]{3}\/WTG p\.a\.$/ } },
  { key: "aggregation", canvas: `lbl_${P}BodyContent_Aggregation`, code: { text: "Aggregation" } },
  { key: "distribution-frequency", canvas: `lbl_${P}BodyContent_DistributionFrequency`, code: { text: "Distribution Frequency" } },
];

/** The O&M card's hover texts: its title (`Tooltip: =ThisItem.Name`, :4849) and the first row's description (`Self.Text`, :4029). */
async function hoverCardAndRow(app: AppHandle): Promise<Record<string, string | null>> {
  await openOnly(app, "om", omCard());
  const card = omCard();
  const { all, shown: idx } = await visibleRows(app, "om");
  const first = idx[0];
  const title = canvas(app)
    ? byName(app, TABS.om.canvasTitle).nth(card)
    : app.frame.locator("[id^='opex-card-title-']").nth(card);
  const description = first === undefined ? null
    : canvas(app) ? all.nth(first).locator("[data-control-name='lbl_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_Description_1']")
    : all.nth(first).locator("td[title]").first();
  return {
    "card-title": await hoverText(app, title),
    "row-description": description ? await hoverText(app, description) : "(no row)",
  };
}

/* ──────────────────────────────────────────────────────────── validation ── */

/** The standard probe list (`scripts/gen-parity-manifest.mjs` PROBE_INPUTS): the same inputs, in this order, in both apps. */
const PROBES = ["abc", "-1", "0", "1", "1.5", "1,5", "0.555", "1e3", " ", "", "1."];
/** Per field, the bounds and decimal places of its canvas `*_ErrorMessage` formula (`OPEX_RANGES` in opexRules.ts). */
const TWO_DECIMAL_1E9 = [...PROBES, "12.34", "12.345", "1000000000", "1000000000.01"];

/* ──────────────────────────────────────────────────────────────── extras ── */

const MUTATIONS_FILE = fileURLToPath(new URL("./mutations.json", import.meta.url));
/** The mutation proof's source edits (`scripts/parity-mutate.mjs`), when a `mutations.json` is added beside this file. */
const mutations: NonNullable<ScreenManifest["mutations"]> | null = existsSync(MUTATIONS_FILE)
  ? JSON.parse(readFileSync(MUTATIONS_FILE, "utf8")) as NonNullable<ScreenManifest["mutations"]>
  : null;

const atRest = async (_app: AppHandle): Promise<void> => {};

/* ────────────────────────────────────────────────────────────── manifest ── */

export const manifest: ScreenManifest = {
  slug: "opex",
  title: "OPEX",
  canvasSource: { app: "projectcosts", yaml: "Opex Costs Screen.pa.yaml" },
  canvasVersion: "1.21.709",
  // The O&M tab: the canvas left-menu caption and the code route Edit Costs opens (`costScreen=/costs/opex/om`).
  open: { app: "cost", canvasMenu: TABS.om.menu, codeRoute: TABS.om.route },

  // The one Dataverse table the screen writes (Patch / RemoveIf in the command bars, the panel's Save and the delete
  // prompt; generator draft section F). Periods of a chain point at their root through `_vsb_parentcost_value` in the SAME
  // table, so there is no child TableSpec. `tagColumn` is where a future write flow types its PW-<run> tag.
  tables: [
    {
      name: "opex-project-costs",
      service: "Vsb_opexprojectcostsService",
      serviceModule: "/src/generated/services/Vsb_opexprojectcostsService.ts",
      entitySet: "vsb_opexprojectcosts",
      primaryKey: "vsb_opexprojectcostid",
      tagColumn: "vsb_description",
      projectLookup: "_vsb_project_value",
      deleteOrder: 1,
    },
  ],

  reset: backToRest,

  controls: {
    save: PANEL.save,
    cancel: PANEL.cancel,
    // The platform lane's "the screen still shows" check (zoom). The custom `reset` does not use it: the screen has no
    // control that shows only at rest (the panel and the prompt overlay it), so rest is restored by leaving and coming back.
    restMarker: { canvas: TABS.om.menu, code: TABS.om.rail, by: "caption" },
    commands: COMMANDS,
  },

  // Verbatim, as the canvas renders them (`*_ErrorMessage.Text`, the hint label; opexRules.ts OPEX_MSG / rangeMessage).
  messages: [
    "The term \"Standard\" is applicable only for system-prefilled contracts.", // lbl_…_Description_ErrorMessage.Text (:5568)
    "Value cannot be blank",                                    // lbl_…_StartDate_ErrorMessage.Text (:5814)
    "Value must be a numeric with two decimal place.",          // lbl_…_FixCosts / EuroPerMwh / EuroPerMw / EuroPerWtg_ErrorMessage.Text
    "Value must be between 0 and 1,000,000,000.0.",             // the same four, range arm: Text(1000000000, "#,###.0#") (:6389)
    "Enter a number with no more than two decimal places.",     // lbl_…_ProcentOfRevenues_ErrorMessage.Text (:6506)
    "Value must be between 0 and 10,000.0.",                    // its range arm: Text(10000, "#,###.0#") (:6523)
    "Year value must be in format YYYY.",                       // lbl_…_InflationStartYear_ErrorMessage.Text (:7466)
    "Value must be a numeric with 1 decimal place",             // lbl_…_InflationProfile_ErrorMessage.Text (:7756)
    "Please select a value between 0 and 100.",                 // its range arm (:7766)
    "Numeric value with maximum of one decimals",               // lbl_…_Threshold_Individual_ErrorMessage.Text (:8181)
    // Its range arm, `$"… {Text(10000000, "###.#")}"` (:8198). Listed with and without the trailing "." that the "###.#"
    // format may leave on a whole number, so whichever form an app renders is read (and the two forms compare unequal).
    "Please select a value between 0 and 10000000",
    "Please select a value between 0 and 10000000.",
    "Please select a threshold option.",                        // lbl_…_ProcentOfRevenues_ErrorMessage_1.Text (:8410)
    "Please fill in at least one commercial figure",            // lbl_…_BodyButtons_Hint.Text (:8771)
  ],

  // Every state starts from `reset` (rest = O&M as first loaded). The O&M states come first, then the Other OPEX ones,
  // so a lane switches tab as few times as the reset allows.
  visual: [
    { name: "default", steps: atRest },
    { name: "om-card-open", steps: async (app) => { await openOnly(app, "om", omCard()); } },
    { name: "om-row-selected", steps: async (app) => { await openOnly(app, "om", omCard()); await selectRow(app, "om", omRow(), "OPEX_ROW"); } },
    { name: "om-panel-edit", steps: openEditPanel },
    {
      name: "om-panel-edit-all-fields",
      steps: async (app) => { await openEditPanel(app); await inflationFieldsShown(app); await individualThresholdShown(app); },
    },
    {
      name: "om-panel-add",
      needsEnv: "OPEX_EMPTY_CARD",
      steps: async (app) => {
        await openOnly(app, "om", indexFrom("OPEX_EMPTY_CARD"));
        await pressCommand(app, "Add Period", "OPEX_EMPTY_CARD must be a card without costs");
        await waitPanel(app);
      },
    },
    { name: "om-delete-prompt", steps: openDeletePrompt },
    { name: "other-default", steps: async (app) => { await ensureTab(app, "other"); } },
    { name: "other-card-open", steps: async (app) => { await openOnly(app, "other", otherCard()); } },
    {
      name: "other-panel-add-contract-type",
      steps: async (app) => {
        await openOnly(app, "other", otherCard());
        await pressCommand(app, "Add Contract Type", "OPEX_OTHER_CARD must be a sub-account without a standard contract");
        await waitPanel(app);
      },
    },
    {
      name: "other-row-selected",
      needsEnv: "OPEX_OTHER_ROW",
      steps: async (app) => { await openOnly(app, "other", otherCard()); await selectRow(app, "other", indexFrom("OPEX_OTHER_ROW"), "OPEX_OTHER_ROW"); },
    },
    {
      name: "other-panel-edit",
      needsEnv: "OPEX_OTHER_ROW",
      steps: async (app) => {
        await openOnly(app, "other", otherCard());
        await selectRow(app, "other", indexFrom("OPEX_OTHER_ROW"), "OPEX_OTHER_ROW");
        await pressCommand(app, "Edit", "OPEX_OTHER_ROW must be a cost that is not a standard contract");
        await waitPanel(app);
      },
    },
  ],

  // One group per validated text input of the panel (generator list), on O&M card OPEX_CARD (Edit on OPEX_ROW, or Add
  // Period on an empty card). Inputs: the standard probes, then the field's own bounds and decimal places.
  validation: [
    {
      key: "description", field: PANEL.description.canvas, baseline: openFormPanel,
      inputs: [...PROBES, "Standard", "standard", "My Standard cost", "Contract A"],
    },
    { key: "fix-costs", field: PANEL.fixCosts.canvas, baseline: openFormPanel, inputs: TWO_DECIMAL_1E9 },
    {
      key: "procent-of-revenues", field: PANEL.revenues.canvas, baseline: openFormPanel,
      inputs: [...PROBES, "12.34", "12.345", "10000", "10000.01"],
    },
    { key: "euro-per-mwh", field: PANEL.eurMwh.canvas, baseline: openFormPanel, inputs: TWO_DECIMAL_1E9 },
    { key: "euro-per-mw", field: PANEL.eurMw.canvas, baseline: openFormPanel, inputs: TWO_DECIMAL_1E9 },
    // Shown on a WTG device only (`con_…_EuroPerWtg.Visible`, :6868): OPEX_CARD must be a WTG card.
    { key: "euro-per-wtg", field: PANEL.eurWtg.canvas, baseline: openFormPanel, inputs: TWO_DECIMAL_1E9 },
    {
      key: "inflation-start-year", field: PANEL.inflationStartYear.canvas,
      baseline: async (app) => { await openFormPanel(app); await inflationFieldsShown(app); },
      inputs: [...PROBES, "2025", "999", "20255", "abcd"],
    },
    {
      key: "inflation-profile", field: PANEL.inflationProfile.canvas, codeField: PANEL.inflationProfile.code,
      baseline: async (app) => { await openFormPanel(app); await inflationFieldsShown(app); },
      inputs: [...PROBES, "2.5", "2.55", "100", "100.1"],
    },
    {
      key: "threshold-individual", field: PANEL.thresholdIndividual.canvas,
      baseline: async (app) => { await openFormPanel(app); await individualThresholdShown(app); },
      inputs: [...PROBES, "2.5", "2.55", "10000000", "10000000.1"],
    },
  ],

  // The command states (enabled / disabled) of the one open card; at rest only the code app shows a bar (its first card
  // opens by default, the canvas `OnVisible` folds every device card), which a run reports.
  gates: [
    { name: "rest", steps: atRest },
    { name: "om-card-open", steps: async (app) => { await openOnly(app, "om", omCard()); } },
    { name: "om-row-selected", steps: async (app) => { await openOnly(app, "om", omCard()); await selectRow(app, "om", omRow(), "OPEX_ROW"); } },
    { name: "other-card-open", steps: async (app) => { await openOnly(app, "other", otherCard()); } },
    // A GateState has no `needsEnv` (contract), so the states that need an optional variable are declared only when it is set.
    ...(hasEnv("OPEX_EMPTY_CARD")
      ? [{ name: "om-empty-card", steps: async (app: AppHandle) => { await openOnly(app, "om", indexFrom("OPEX_EMPTY_CARD")); } }]
      : []),
    ...(hasEnv("OPEX_OTHER_ROW")
      ? [{
        name: "other-row-selected",
        steps: async (app: AppHandle) => {
          await openOnly(app, "other", otherCard());
          await selectRow(app, "other", indexFrom("OPEX_OTHER_ROW"), "OPEX_OTHER_ROW");
        },
      }]
      : []),
  ],

  ux: [
    { name: "accessible-names", run: accessibleNames },
    { name: "hover-panel-icons", run: async (app) => { await openFormPanel(app); return hoverAll(app, HOVER_PANEL_ICONS); } },
    { name: "hover-field-captions", run: async (app) => { await openFormPanel(app); return hoverAll(app, HOVER_FIELD_CAPTIONS); } },
    { name: "hover-card-and-row", run: hoverCardAndRow },
  ],

  /*
   * No write flow yet: writes need a product decision first (which project, which rows, and whether the standard chain may
   * run on DEV). A write flow must cover, in both apps, rows compared by the PW-<run> tag in `vsb_description`:
   *   create          Add Period on an empty O&M card (a chain root) and Add Contract Type on an Other OPEX card: every
   *                   written column (generator draft section F lists 31), the Owning Business Unit, `vsb_name`
   *   add period      Add Period on the last period of a tagged chain: `_vsb_parentcost_value`, the inherited inflation
   *                   and threshold columns, the start date after the previous period
   *   edit            Edit a tagged root: the changed columns, and the child-cost cascade ("Updating inflation profiles on
   *                   child costs...") when the inflation block changes
   *   delete          Delete a tagged root (RemoveIf takes its periods too) and a tagged last period (only itself)
   *   standard chain  Add Standard Contract on an empty card (O&M) and on an Other OPEX sub-account: the rows the
   *                   standard assumption creates, with `vsb_isstandardcontract`
   * and its cleanup deletes every PW- row of the run (`harness/data.ts` deleteByTag).
   */
  flows: [],
  known: {},
  artefacts: [],
  budgets: {},
  ...(mutations ? { mutations } : {}),
};
