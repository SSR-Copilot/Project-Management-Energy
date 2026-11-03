/**
 * Land Lease validation parity: the same inputs typed into the same fields of both apps (E2E-PARITY-PROMPT.md section 5a.4).
 * Inputs and the hand-derived canvas outcomes: ProjectDocs/app-docs/e2e/RULEMAP-land-lease.md section 4.
 *
 * Canvas FIRST (standing order): for each field and input it records the validation messages that are visible (verbatim) and whether
 * Save is enabled, writes `e2e/reference/landlease.validation.canvas.json`, and lists where the Canvas disagrees with the rule map's
 * hand-derived expectation (those rows of the rule map need correcting). The code app run then replays the same inputs and compares
 * with the Canvas; a difference fails unless it is in KNOWN (lib/known.ts), and a KNOWN entry that no longer occurs fails too.
 * Read-only: the panel is only ever cancelled (a fresh screen per field group); Save is never pressed.
 *
 * Baseline (rule map 4, "B-rate"): "Edit" on a period row of a NON-standard contract with One-Time Payment OFF and Inflation OFF.
 *   LANDLEASE_CARD  the card that holds it (default 0)      LANDLEASE_ROW  its row in that card (default 0)
 *   LANDLEASE_PROJECT_ID required; never written into a file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Browser, type FrameLocator, type Locator, type Page, expect, test } from "@playwright/test";
import { openCanvasCost, openCodeCost, projectIdOrSkip, selectLeaseRow, toggleLeaseCard, waitForStable, type Kind } from "./lib/cost";
import { checkKnown, noteDiff, type Known } from "./lib/known";

const REF = "e2e/reference/landlease.validation.canvas.json";
const OUT = "e2e/parity-out";
const CARD = Number(process.env.LANDLEASE_CARD ?? 0);
const ROW = Number(process.env.LANDLEASE_ROW ?? 0);

const P = "txt_LandLease_RightPanel_NewEditPeriod_BodyContent_";
const C = "txt_LandLease_RightPanel_NewEditCost_BodyContent_";
const SAVE = "pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1";
const TOGGLE = {
  otp: { canvas: "tgl_LandLease_RightPanel_NewEditContractPeriod_BodyContent_OneTimePayment", code: "lease-otp" },
  inflation: { canvas: "tgl_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1", code: "lease-inflation" },
};

/** The verbatim messages per kind (rule map 4.1–4.8 headings). "yes" in a row = the field's single message. */
const MSG = {
  rateDecimal: "Value must be a numeric with two decimal place.",
  rateRange: "Please select a value between 0 and 100,000,000.0.",
  fixRange: "Value must be between 0 and 1,000,000,000.0.",
  shareDecimal: "Enter a number with no more than two decimal places.",
  shareRange: "Please select a value between 0 and 10,000.0.",
  otpDecimal: "Value must be a number",
  otpRange: "Please select a value between 0 and 1,000,000,000.0.",
  inflOneDecimal: "Value must be a numeric with 1 decimal place",
  inflRange: "Please select a value between 0 and 100.",
  year: "Year value must be in format YYYY.",
  dueDate: "Due Date must be in format MM/YYYY.",
  standard: 'The term "Standard" is applicable only for system-prefilled contracts.',
} as const;
type MsgKey = keyof typeof MSG;

/** One input row: what to type and the canvas outcome the rule map derived (null = "to confirm"). */
interface Row { input: string; message: MsgKey | "none" | null; save: boolean | null }
interface Group { key: string; field: string; baseline: "rate" | "otp" | "infl"; prefill?: Record<string, string>; rows: Row[] }

const r = (input: string, message: Row["message"], save: Row["save"]): Row => ({ input, message, save });
const rateRows = (decimal: MsgKey, range: MsgKey, max: string): Row[] => [
  r("abc", decimal, false), r("-1", range, false), r("0", "none", true), r("1", "none", true), r("1.5", "none", true),
  r("1,5", decimal, false), r("0.555", decimal, false), r("1e3", decimal, false), r(" ", decimal, false), r("", "none", true),
  r(max, "none", true), r(String(BigInt(max) + 1n), range, false), r(`${max}.01`, range, false), r("1.", null, null),
];

const GROUPS: Group[] = [
  { key: "euroMWh", field: `${P}EuroMWh_1`, baseline: "rate", rows: [...rateRows("rateDecimal", "rateRange", "100000000"), r("+1", "none", true)] },
  { key: "euroMW", field: `${P}EuroMW_1`, baseline: "rate", rows: [...rateRows("rateDecimal", "rateRange", "100000000"), r("+1", "none", true)] },
  { key: "euroWTG", field: `${P}EuroWTG_1`, baseline: "rate", prefill: { [`${P}FixedCosts_1`]: "1000" }, rows: [...rateRows("rateDecimal", "rateRange", "100000000"), r("+1", "none", true)] },
  { key: "fixCosts", field: `${P}FixedCosts_1`, baseline: "rate", rows: rateRows("rateDecimal", "fixRange", "1000000000") },
  { key: "shareOfRevenues", field: `${P}PercentOfRevenues_1`, baseline: "rate", rows: rateRows("shareDecimal", "shareRange", "10000") },
  {
    key: "otpAmount1", field: `${C}Amount_1`, baseline: "otp",
    rows: rateRows("otpDecimal", "otpRange", "1000000000").map((x) => (x.input === "" ? r("", "none", false) : x.input === " " ? r(" ", "otpDecimal", false) : x)),
  },
  {
    key: "inflationProfile", field: `${C}InflationProfile_1`, baseline: "infl",
    rows: [
      r("abc", "inflOneDecimal", false), r("-1", "inflOneDecimal", false), r("0", "none", true), r("1", "none", true), r("1.5", "none", true),
      r("1,5", "inflOneDecimal", false), r("0.555", "inflOneDecimal", false), r("1e3", "inflOneDecimal", false), r(" ", "inflOneDecimal", false),
      r("", "none", false), r("100", "none", true), r("100.1", "inflRange", false), r("101", "inflRange", false), r("1.", null, null),
    ],
  },
  {
    key: "inflationStartYear", field: `${C}InflationStartYear_1`, baseline: "infl",
    rows: [
      r("abc", "year", false), r("-1", "year", false), r("0", "year", false), r("1", "year", false), r("2027", "none", true), r("0000", "none", true),
      r("99999", "year", false), r("2027.5", "year", false), r(" 2027", "year", false), r(" ", "year", false), r("", "none", false),
    ],
  },
  {
    key: "otpDueDate1", field: `${C}DueDate_1`, baseline: "otp",
    rows: [
      r("01/2027", "none", true), r("12/2027", "none", true), r("1/2027", "dueDate", false), r("13/2027", "dueDate", false), r("00/2027", "dueDate", false),
      r("01-2027", "dueDate", false), r("abc", "dueDate", false), r("29/02/2028", "dueDate", false), r("02/0000", "none", true),
      r(" 01/2027", "dueDate", false), r("", "none", false),
    ],
  },
  {
    key: "description", field: `${C}Description_1`, baseline: "rate",
    rows: [
      r("Lease A", "none", true), r("standard", "standard", false), r("Non-standard lease", "standard", false), r("STANDARD", "standard", false),
      r(" ", "none", true), r("", "none", false), r("x".repeat(56), "none", true),
    ],
  },
];

/**
 * Accepted differences for THIS spec (keys `validation.<group>["<input>"].<message|save>`). Empty on purpose: the rule map
 * (section 5) has no marked or recorded validation divergence; E12 (spaces), E13 ("1.") and E14 (message language) are
 * unmarked, so they must fail as unexpected until a decision is recorded (CONVENTIONS rule 8).
 */
const KNOWN: Known = {};

interface Outcome { messages: string[]; save: boolean }

/** The field's own text box (the canvas renders an input inside its control; the code app puts the id on the input or its wrapper). */
function box(kind: Kind, app: FrameLocator, field: string): Locator {
  const host = kind === "canvas" ? app.locator(`[data-control-name='${field}']`).first() : app.getByTestId(field).first();
  return host.locator("xpath=descendant-or-self::input | descendant-or-self::textarea").first();
}

async function saveEnabled(kind: Kind, app: FrameLocator): Promise<boolean> {
  const host = kind === "canvas" ? app.locator(`[data-control-name='${SAVE}']`).first() : app.getByTestId(SAVE).first();
  const btn = host.locator("xpath=descendant-or-self::button").first();
  const disabled = await btn.evaluate((b) => (b as HTMLButtonElement).disabled || b.getAttribute("aria-disabled") === "true").catch(() => true);
  return !disabled;
}

/** Which of the known messages are visible in the app frame right now (verbatim, sorted). */
async function visibleMessages(app: FrameLocator): Promise<string[]> {
  const out: string[] = [];
  for (const text of Object.values(MSG)) {
    if (await app.getByText(text, { exact: true }).filter({ visible: true }).count()) out.push(text);
  }
  return out.sort();
}

async function type(kind: Kind, page: Page, app: FrameLocator, field: string, value: string): Promise<void> {
  const input = box(kind, app, field);
  await input.click({ force: kind === "canvas" });
  await input.fill(value);
  await input.press("Tab");
  await waitForStable(page, app, { pollMs: 400, timeoutMs: 10_000 });
}

/** Fresh screen -> card -> row -> Edit -> the group's baseline toggles and prefill. */
async function openBaseline(kind: Kind, page: Page, projectId: string, group: Group): Promise<FrameLocator> {
  const app = kind === "canvas" ? await openCanvasCost(page, projectId, "Land Lease") : await openCodeCost(page, projectId, "/costs/land-lease");
  await toggleLeaseCard(kind, page, app, CARD);
  await selectLeaseRow(kind, page, app, ROW);
  await waitForStable(page, app);
  await app.getByText("Edit", { exact: true }).filter({ visible: true }).first().click({ force: kind === "canvas" });
  await waitForStable(page, app);
  const flip = async (t: { canvas: string; code: string }) => {
    const loc = kind === "canvas" ? app.locator(`[data-control-name='${t.canvas}']`).first() : app.getByTestId(t.code).first();
    await loc.click({ force: kind === "canvas" });
    await waitForStable(page, app);
  };
  if (group.baseline === "otp") {
    await flip(TOGGLE.otp);
    await type(kind, page, app, `${C}DueDate_1`, "12/2027");
    await type(kind, page, app, `${C}Amount_1`, "1000");
  }
  if (group.baseline === "infl") {
    await flip(TOGGLE.inflation);
    await type(kind, page, app, `${C}InflationStartYear_1`, "2027");
    await type(kind, page, app, `${C}InflationProfile_1`, "2.0");
  }
  if (group.baseline === "rate" && group.key !== "euroWTG") await type(kind, page, app, `${P}EuroWTG_1`, "1000");
  for (const [field, value] of Object.entries(group.prefill ?? {})) await type(kind, page, app, field, value);
  return app;
}

async function runGroups(kind: Kind, browser: Browser, projectId: string): Promise<Record<string, Record<string, Outcome>>> {
  const ctx = await browser.newContext({ storageState: `e2e/.auth/${kind === "canvas" ? "canvas" : "codeapp"}.json`, viewport: { width: 1920, height: 1040 } });
  const page = await ctx.newPage();
  const result: Record<string, Record<string, Outcome>> = {};
  for (const group of GROUPS) {
    const app = await openBaseline(kind, page, projectId, group);
    result[group.key] = {};
    for (const row of group.rows) {
      await type(kind, page, app, group.field, row.input);
      result[group.key]![row.input] = { messages: await visibleMessages(app), save: await saveEnabled(kind, app) };
    }
    await page.screenshot({ path: `${OUT}/landlease.validation.${group.key}.${kind}.png` }).catch(() => {});
  }
  await ctx.close();
  return result;
}

test.describe.configure({ mode: "serial", timeout: 3_600_000 });

test("Canvas first: record the validation outcome of every rule-map input", async ({ browser }) => {
  const projectId = projectIdOrSkip();
  mkdirSync(OUT, { recursive: true });
  const canvas = await runGroups("canvas", browser, projectId);
  writeFileSync(REF, JSON.stringify(canvas, null, 1));
  // Where the Canvas disagrees with the rule map's hand-derived row, the rule map is what needs correcting.
  const ruleMapCorrections: string[] = [];
  for (const group of GROUPS) {
    for (const row of group.rows) {
      const got = canvas[group.key]![row.input]!;
      const wantMsg = row.message === null ? null : row.message === "none" ? [] : [MSG[row.message]];
      if (wantMsg !== null && JSON.stringify(got.messages) !== JSON.stringify(wantMsg)) ruleMapCorrections.push(`${group.key} ${JSON.stringify(row.input)}: messages ${JSON.stringify(got.messages)} (rule map ${JSON.stringify(wantMsg)})`);
      if (row.save !== null && got.save !== row.save) ruleMapCorrections.push(`${group.key} ${JSON.stringify(row.input)}: save ${got.save} (rule map ${row.save})`);
    }
  }
  writeFileSync(`${OUT}/landlease.validation.rulemap-corrections.txt`, ruleMapCorrections.join("\n"));
  console.log(`canvas validation: ${GROUPS.reduce((n, g) => n + g.rows.length, 0)} inputs; rule-map rows to correct: ${ruleMapCorrections.length}`);
});

test("code app: the same inputs give the Canvas outcome (KNOWN differences only)", async ({ browser }) => {
  const projectId = projectIdOrSkip();
  test.skip(!existsSync(REF), "No Canvas reference yet: run the Canvas step first");
  mkdirSync(OUT, { recursive: true });
  const canvas = JSON.parse(readFileSync(REF, "utf8")) as Record<string, Record<string, Outcome>>;
  const code = await runGroups("code", browser, projectId);
  const found: Record<string, string> = {};
  for (const group of GROUPS) {
    for (const row of group.rows) {
      const a = canvas[group.key]?.[row.input];
      const b = code[group.key]?.[row.input];
      const key = `validation.${group.key}[${JSON.stringify(row.input)}]`;
      noteDiff(found, `${key}.messages`, a?.messages, b?.messages);
      noteDiff(found, `${key}.save`, a?.save, b?.save);
    }
  }
  const result = checkKnown(found, KNOWN);
  writeFileSync(`${OUT}/landlease.validation.diff.json`, JSON.stringify(result, null, 1));
  expect({ unexpected: result.unexpected, stale: result.stale }).toEqual({ unexpected: {}, stale: [] });
});
