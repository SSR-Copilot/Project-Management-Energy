/**
 * Application Settings parity run: Check List Settings, Project Gates, CAPEX Accounts, Costs, Contracts.
 *
 * Standing order (29 Oct 2026): the Canvas app runs FIRST. For each screen and state it collects every visible named control
 * (text, text style, size) into `e2e/reference/<screen>.<state>.canvas.json`; the code app run then collects the same and diffs them
 * control by control (`compareFacts`). Output: `e2e/results/parity/<screen>.<state>.diff.json` plus a screenshot of each app.
 * Read-only: panels are opened and cancelled, nothing is saved.
 *
 *   npx playwright test --project=parity appsettings.parity -g "Canvas"      # step 1
 *   npx playwright test --project=parity appsettings.parity -g "code app"    # step 2
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { type Browser, type FrameLocator, type Page, test } from "@playwright/test";
import { openCanvas, openCode, openSettingsScreen, shot } from "./lib/parity";
import { collectTexts, compareTexts, type TextFact } from "./lib/texts";

type Kind = "canvas" | "code";
interface State {
  name: string;
  /** What to do to reach the state, per app. Both start from the screen's freshly opened default. */
  steps: (kind: Kind, page: Page, app: FrameLocator) => Promise<void>;
}
interface ScreenDef { key: string; menu: string; states: State[] }

const click = async (kind: Kind, app: FrameLocator, text: string, nth = 0): Promise<void> => {
  // A canvas control sits under an invisible button, so the text is clicked at its position, not through its own box.
  await app.getByText(text, { exact: true }).nth(nth).click({ force: kind === "canvas", timeout: 15_000 });
};

/** Canvas toggles are icons / buttons with their own names; the code app opens the same thing from its visible text. */
const canvasClick = async (app: FrameLocator, control: string, nth = 0): Promise<void> => {
  await app.locator(`[data-control-name='${control}']`).nth(nth).click({ force: true, timeout: 15_000 });
};

const SCREENS: ScreenDef[] = [
  {
    key: "milestones", menu: "Milestones",
    states: [
      { name: "default", steps: async (_k, page) => { await page.waitForTimeout(2500); } },
      { name: "country-open", steps: async (kind, page, app) => { if (kind === "canvas") await canvasClick(app, "btn_Select_MilestonesStandardAssumptions_AdminScreen"); else await click(kind, app, "Germany"); await page.waitForTimeout(4000); } },
    ],
  },
  {
    key: "checklist", menu: "Check List Settings",
    states: [
      { name: "default", steps: async (kind, page, app) => { await click(kind, app, "Germany Wind"); await page.waitForTimeout(3000); } },
      { name: "section-open", steps: async (kind, page, app) => { await click(kind, app, "Germany Wind"); await page.waitForTimeout(2500); if (kind === "canvas") await canvasClick(app, "ico_Down_DefaultChecklist_AdminScreen"); else await click(kind, app, "Draft to Cluster 1"); await page.waitForTimeout(4000); } },
    ],
  },
  { key: "gates", menu: "Project Gates", states: [{ name: "default", steps: async (_k, page) => { await page.waitForTimeout(2500); } }] },
  {
    key: "capex", menu: "CAPEX Accounts",
    states: [
      { name: "default", steps: async (_k, page) => { await page.waitForTimeout(2500); } },
      { name: "row-open", steps: async (kind, page, app) => { if (kind === "canvas") await canvasClick(app, "ico_Account_AccountCard_Down"); else await click(kind, app, "80000 - Turbine / PV Supply Agreement"); await page.waitForTimeout(4000); } },
    ],
  },
  {
    key: "costs", menu: "Costs",
    states: [
      { name: "default", steps: async (_k, page) => { await page.waitForTimeout(2500); } },
      { name: "devex-open", steps: async (kind, page, app) => { if (kind === "canvas") await canvasClick(app, "ico_Generators_DisplayProject_Body_Form_GeneratorType_Down_2"); else await click(kind, app, "DEVEX/CAPEX"); await page.waitForTimeout(4500); } },
    ],
  },
  {
    key: "contracts", menu: "Contracts",
    states: [
      { name: "default", steps: async (_k, page) => { await page.waitForTimeout(2500); } },
      { name: "card-open", steps: async (kind, page, app) => { if (kind === "canvas") await canvasClick(app, "ico_Chevron_Expand_Collapse_AdminContracrs"); else await click(kind, app, "Development Contract - Test Description 101"); await page.waitForTimeout(4000); } },
    ],
  },
];

// Not under e2e/results: Playwright empties that folder at the start of every run.
const OUT = "e2e/parity-out";
const REF = "e2e/reference";
const ONLY = process.env.PARITY_SCREENS?.split(",");
const screens = SCREENS.filter((s) => !ONLY || ONLY.includes(s.key));

const context = (browser: Browser, session: string) =>
  browser.newContext({ storageState: `e2e/.auth/${session}.json`, viewport: { width: 1920, height: 1040 } });

test.describe.configure({ mode: "serial", timeout: 1_500_000 });

test("Canvas first: collect the reference facts of every settings screen and state", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(REF, { recursive: true });
  const ctx = await context(browser, "canvas");
  const page = await ctx.newPage();
  const app = await openCanvas(page);
  for (const screen of screens) {
    for (const state of screen.states) {
      await openSettingsScreen("canvas", app, screen.menu);
      await page.waitForTimeout(5000);
      await state.steps("canvas", page, app);
      const facts = await collectTexts(app);
      writeFileSync(`${REF}/${screen.key}.${state.name}.canvas.texts.json`, JSON.stringify(facts, null, 1));
      await shot(page, `${OUT}/${screen.key}.${state.name}.canvas.png`);
      console.log(`canvas ${screen.key}.${state.name}: ${facts.length} controls`);
    }
  }
  await ctx.close();
});

test("code app: compare every settings screen and state with the Canvas reference", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const ctx = await context(browser, "codeapp");
  const page = await ctx.newPage();
  const app = await openCode(page);
  const summary: string[] = [];
  for (const screen of screens) {
    for (const state of screen.states) {
      const refFile = `${REF}/${screen.key}.${state.name}.canvas.texts.json`;
      if (!existsSync(refFile)) { summary.push(`${screen.key}.${state.name}: no Canvas reference`); continue; }
      await openSettingsScreen("code", app, screen.menu);
      await page.waitForTimeout(3500);
      await state.steps("code", page, app);
      const code = await collectTexts(app);
      const canvas = JSON.parse(readFileSync(refFile, "utf8")) as TextFact[];
      const result = compareTexts(canvas, code);
      writeFileSync(`${OUT}/${screen.key}.${state.name}.diff.json`, JSON.stringify(result, null, 1));
      writeFileSync(`${OUT}/${screen.key}.${state.name}.code.json`, JSON.stringify(code, null, 1));
      await shot(page, `${OUT}/${screen.key}.${state.name}.code.png`);
      summary.push(`${screen.key}.${state.name}: matched ${result.matched}, differences ${result.diffs.length}, text only in Canvas ${result.missingInCode.length}, text only in code app ${result.extraInCode.length}`);
    }
  }
  console.log(summary.join("\n"));
  await ctx.close();
});
