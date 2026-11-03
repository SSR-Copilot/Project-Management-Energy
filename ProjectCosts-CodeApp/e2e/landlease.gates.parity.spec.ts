/**
 * Land Lease Stage A parity, read-only (rule map B, C/D load, D options, H): E2E-LANDLEASE-050…054.
 *
 * Canvas FIRST: it records into `e2e/reference/landlease.gates.canvas.json`
 *   050 command gates: enabled / disabled of the five commands with each card opened in turn (nothing selected), and with the
 *       first period of LANDLEASE_CARD selected (rule map B2–B6)
 *   051 the Save gate of an empty "Add Contract Type" panel, and after a Description only (D, E)
 *   052 the Edit panel of that period: what loads into every field (text values, dropdown values, toggle states; C, D)
 *   053 the dropdown option lists, in order (D: Duration years / months, Currency, Aggregation, Distribution Frequency)
 *   054 accessible names (canvas AccessibleLabel vs code aria-label, rule 16 / H1–H3) and hover texts (H6, the panel ✕)
 * The code app run then reads the same and compares; a difference fails unless it is in KNOWN (lib/known.ts).
 * Nothing is saved: panels are cancelled by opening the screen fresh.
 *
 *   $env:LANDLEASE_PROJECT_ID = "<guid>"; npx playwright test --project=parity landlease.gates.parity
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Browser, type FrameLocator, type Locator, type Page, expect, test } from "@playwright/test";
import {
  control, leaseCardTitles, leaseCommandStates, openCanvasCost, openCodeCost, projectIdOrSkip, selectLeaseRow,
  toggleLeaseCard, waitForStable, type Kind,
} from "./lib/cost";
import { checkKnown, noteDiff, type Known } from "./lib/known";

const REF = "e2e/reference/landlease.gates.canvas.json";
const OUT = "e2e/parity-out";
const CARD = Number(process.env.LANDLEASE_CARD ?? 0);
const P = "txt_LandLease_RightPanel_NewEditPeriod_BodyContent_";
const C = "txt_LandLease_RightPanel_NewEditCost_BodyContent_";
const SAVE = "pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1";

/** Canvas control -> code app test id, per kind of field. */
const DROPDOWNS = {
  durationYears: { canvas: "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationYears_1", code: "lease-years" },
  durationMonths: { canvas: "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationMonths_1", code: "lease-months" },
  currency: { canvas: "drp_LandLease_RightPanel_NewEditCost_BodyContent_Currency_1", code: "lease-currency" },
  aggregation: { canvas: "drp_LandLease_RightPanel_NewEditPeriod_BodyContent_Aggregation_1", code: "lease-aggregation" },
  distributionFrequency: { canvas: "drp_LandLease_RightPanel_NewEditCost_BodyContent_DistributionFrequency_Month_1", code: "lease-frequency" },
} as const;
const TEXTS = {
  description: `${C}Description_1`, euroMWh: `${P}EuroMWh_1`, euroMW: `${P}EuroMW_1`, euroWTG: `${P}EuroWTG_1`,
  fixCosts: `${P}FixedCosts_1`, shareOfRevenues: `${P}PercentOfRevenues_1`,
} as const;
const TOGGLES = {
  secured: { canvas: "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_Secured", code: "lease-secured" },
  allWtg: { canvas: "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_AllocationToAllWTGs", code: "lease-all-wtg" },
  oneTimePayment: { canvas: "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_OneTimePayment", code: "lease-otp" },
  inflation: { canvas: "tgl_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1", code: "lease-inflation" },
} as const;

/**
 * Accepted differences, key -> reason. Rule map section 5 has no marked entry for these areas; H1–H3 (the "Year" / "Month"
 * accessible names) and H6 (the row tooltip) are unmarked, so they are expected to show up as unexpected until decided.
 */
const KNOWN: Known = {};

interface Snapshot {
  cards: string[];
  gates: Record<string, Record<string, boolean>>;
  saveGate: { empty: boolean; descriptionOnly: boolean };
  edit: {
    texts: Record<string, string>;
    dropdowns: Record<string, { value: string; enabled: boolean; options: string[]; label: string | null }>;
    toggles: Record<string, boolean | null>;
  };
  hovers: { rowTitle: string | null; panelClose: string | null };
}

const open = (kind: Kind, page: Page, projectId: string): Promise<FrameLocator> =>
  kind === "canvas" ? openCanvasCost(page, projectId, "Land Lease") : openCodeCost(page, projectId, "/costs/land-lease");

/** The hover text of a canvas control: the `title` sits on an element INSIDE the named control, not on its outer div. */
const titleIn = (host: Locator): Promise<string | null> =>
  host.evaluate((e) => (e.closest("[title]") ?? e.querySelector("[title]"))?.getAttribute("title") ?? null).catch(() => null);

async function saveEnabled(kind: Kind, app: FrameLocator): Promise<boolean> {
  const btn = control(kind, app, SAVE).locator("xpath=descendant-or-self::button").first();
  return btn.evaluate((b) => !(b as HTMLButtonElement).disabled && b.getAttribute("aria-disabled") !== "true").catch(() => false);
}

/**
 * A dropdown's value, enabled state, accessible name and options. A DISABLED code-app dropdown cannot be opened (a click on it
 * waits for ever: first run, 3 Nov 2026, Currency in the Edit panel), so its options are not read, and options are compared only
 * where both apps' dropdowns are enabled.
 */
async function readDropdown(kind: Kind, page: Page, app: FrameLocator, id: { canvas: string; code: string }) {
  if (kind === "canvas") {
    return control(kind, app, id.canvas).locator("select").first().evaluate((s) => {
      const sel = s as HTMLSelectElement;
      return {
        value: sel.selectedIndex >= 0 ? (sel.options[sel.selectedIndex]?.textContent ?? "").trim() : "",
        enabled: !sel.disabled && sel.getAttribute("aria-disabled") !== "true",
        options: [...sel.options].map((o) => (o.textContent ?? "").trim()).filter(Boolean), label: sel.getAttribute("aria-label") || null,
      };
    });
  }
  const box = app.getByTestId(id.code).first();
  const value = ((await box.textContent()) ?? "").trim();
  const label = await box.getAttribute("aria-label");
  const enabled = await box.isEnabled().catch(() => false);
  if (!enabled) return { value, enabled, options: [] as string[], label };
  await box.click({ timeout: 15_000 });
  const list = app.getByRole("option").filter({ visible: true });
  await list.first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  const options = (await list.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  await box.click({ timeout: 15_000 }); // the trigger toggles the list closed (Escape would also close the panel)
  await waitForStable(page, app, { pollMs: 300, timeoutMs: 5000 });
  return { value, enabled, options, label };
}

async function readToggle(kind: Kind, app: FrameLocator, id: { canvas: string; code: string }): Promise<boolean | null> {
  return control(kind, app, id.canvas, id.code).evaluate((e) => {
    const el = (e.matches("input") ? e : e.querySelector("input, [role='switch'], [aria-checked]")) as HTMLInputElement | null;
    if (!el) return null;
    const aria = el.getAttribute("aria-checked");
    return aria === null ? Boolean(el.checked) : aria === "true";
  }).catch(() => null);
}

async function snapshot(kind: Kind, browser: Browser, projectId: string): Promise<Snapshot> {
  const ctx = await browser.newContext({ storageState: `e2e/.auth/${kind === "canvas" ? "canvas" : "codeapp"}.json`, viewport: { width: 1920, height: 1040 } });
  const page = await ctx.newPage();
  try {
    let app = await open(kind, page, projectId);
    const cards = await leaseCardTitles(kind, app);
    // 050: each card open on its own (opened, read, folded again), then the first period of CARD selected.
    const gates: Snapshot["gates"] = {};
    for (let i = 0; i < cards.length; i++) {
      await toggleLeaseCard(kind, page, app, i);
      gates[`card ${i} "${cards[i]}" open`] = await leaseCommandStates(kind, app);
      await toggleLeaseCard(kind, page, app, i);
    }
    await toggleLeaseCard(kind, page, app, CARD);
    await selectLeaseRow(kind, page, app, 0);
    gates[`card ${CARD} row 0 selected`] = await leaseCommandStates(kind, app);
    // 054 (row hover text) while the row is there.
    const rowTitle = kind === "canvas"
      ? await titleIn(app.locator("[data-control-name='btn_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_TransparentButton_2']").first())
      : await app.locator("[data-testid^='btn_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_TransparentButton_2-']").first().getAttribute("title");
    // 052–054: the Edit panel of that period.
    await app.getByText("Edit", { exact: true }).filter({ visible: true }).first().click({ force: kind === "canvas", timeout: 30_000 });
    await waitForStable(page, app);
    const texts: Record<string, string> = {};
    for (const [key, name] of Object.entries(TEXTS)) {
      texts[key] = await control(kind, app, name).locator("xpath=descendant-or-self::input | descendant-or-self::textarea").first().inputValue().catch(() => "<not found>");
    }
    const dropdowns: Snapshot["edit"]["dropdowns"] = {};
    for (const [key, id] of Object.entries(DROPDOWNS)) dropdowns[key] = await readDropdown(kind, page, app, id);
    const toggles: Record<string, boolean | null> = {};
    for (const [key, id] of Object.entries(TOGGLES)) toggles[key] = await readToggle(kind, app, id);
    const panelClose = kind === "canvas"
      ? await titleIn(app.locator("[data-control-name='ico_LandLease_RightPanel_NewEditPeriod_BodyheaderCancel_1']").first())
      : await app.getByTestId("panel-close").first().getAttribute("title");
    // 051: a fresh "Add Contract Type" panel: Save empty, then after a Description only.
    app = await open(kind, page, projectId);
    await toggleLeaseCard(kind, page, app, CARD);
    await app.getByText("Add Contract Type", { exact: true }).filter({ visible: true }).first().click({ force: kind === "canvas", timeout: 30_000 });
    await waitForStable(page, app);
    const empty = await saveEnabled(kind, app);
    const d = control(kind, app, TEXTS.description).locator("xpath=descendant-or-self::input | descendant-or-self::textarea").first();
    await d.click({ force: kind === "canvas" });
    await d.fill("Parity description only");
    await d.press("Tab");
    await waitForStable(page, app, { pollMs: 400, timeoutMs: 10_000 });
    const descriptionOnly = await saveEnabled(kind, app);
    await page.screenshot({ path: `${OUT}/landlease.gates.${kind}.png` }).catch(() => {});
    return { cards, gates, saveGate: { empty, descriptionOnly }, edit: { texts, dropdowns, toggles }, hovers: { rowTitle, panelClose } };
  } finally {
    await ctx.close();
  }
}

test.describe.configure({ mode: "serial", timeout: 1_800_000 });

test("Canvas first: record gates, the Edit panel load, options, names and hover texts (E2E-LANDLEASE-050…054)", async ({ browser }) => {
  const projectId = projectIdOrSkip();
  mkdirSync(OUT, { recursive: true });
  const canvas = await snapshot("canvas", browser, projectId);
  writeFileSync(REF, JSON.stringify(canvas, null, 1));
  console.log(`canvas: ${canvas.cards.length} cards, ${Object.keys(canvas.gates).length} gate states recorded`);
});

test("code app: the same gates, panel load, options, names and hover texts as the Canvas (KNOWN only)", async ({ browser }) => {
  const projectId = projectIdOrSkip();
  test.skip(!existsSync(REF), "No Canvas reference yet: run the Canvas step first");
  const canvas = JSON.parse(readFileSync(REF, "utf8")) as Snapshot;
  const code = await snapshot("code", browser, projectId);
  const found: Record<string, string> = {};
  noteDiff(found, "cards", canvas.cards, code.cards);
  for (const state of Object.keys(canvas.gates)) {
    for (const cmd of new Set([...Object.keys(canvas.gates[state] ?? {}), ...Object.keys(code.gates[state] ?? {})])) {
      noteDiff(found, `gates.${state}.${cmd}`, canvas.gates[state]?.[cmd], code.gates[state]?.[cmd]);
    }
  }
  noteDiff(found, "saveGate.empty", canvas.saveGate.empty, code.saveGate.empty);
  noteDiff(found, "saveGate.descriptionOnly", canvas.saveGate.descriptionOnly, code.saveGate.descriptionOnly);
  for (const k of Object.keys(TEXTS)) noteDiff(found, `edit.texts.${k}`, canvas.edit.texts[k], code.edit.texts[k]);
  for (const k of Object.keys(DROPDOWNS)) {
    noteDiff(found, `edit.dropdowns.${k}.value`, canvas.edit.dropdowns[k]?.value, code.edit.dropdowns[k]?.value);
    noteDiff(found, `edit.dropdowns.${k}.enabled`, canvas.edit.dropdowns[k]?.enabled, code.edit.dropdowns[k]?.enabled);
    if (canvas.edit.dropdowns[k]?.enabled && code.edit.dropdowns[k]?.enabled) {
      noteDiff(found, `edit.dropdowns.${k}.options`, canvas.edit.dropdowns[k]?.options, code.edit.dropdowns[k]?.options);
    }
    // Rule 16: where the canvas sets an AccessibleLabel, the code app's aria-label must equal it.
    if (canvas.edit.dropdowns[k]?.label) noteDiff(found, `a11y.${k}.ariaLabel`, canvas.edit.dropdowns[k]?.label, code.edit.dropdowns[k]?.label);
  }
  for (const k of Object.keys(TOGGLES)) noteDiff(found, `edit.toggles.${k}`, canvas.edit.toggles[k], code.edit.toggles[k]);
  noteDiff(found, "hover.rowTitle", canvas.hovers.rowTitle, code.hovers.rowTitle);
  noteDiff(found, "hover.panelClose", canvas.hovers.panelClose, code.hovers.panelClose);
  const result = checkKnown(found, KNOWN);
  writeFileSync(`${OUT}/landlease.gates.diff.json`, JSON.stringify({ result, canvas, code }, null, 1));
  expect({ unexpected: result.unexpected, stale: result.stale }).toEqual({ unexpected: {}, stale: [] });
});
