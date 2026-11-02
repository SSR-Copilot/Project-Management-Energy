/**
 * Exploration: the default view of each Application Settings screen in BOTH apps (Canvas first), as screenshots plus the number of
 * named controls found. Used to design the per-screen states of the parity run; not a gate.
 */
import { mkdirSync } from "node:fs";
import { type Browser, test } from "@playwright/test";
import { collectFacts, openCanvas, openCode, openSettingsScreen, shot } from "./lib/parity";

const SCREENS = ["Check List Settings", "Project Gates", "CAPEX Accounts", "Costs", "Contracts"] as const;
const OUT = "e2e/results/parity";

async function context(browser: Browser, session: string) {
  return browser.newContext({ storageState: `e2e/.auth/${session}.json`, viewport: { width: 1920, height: 1040 } });
}

test.describe.configure({ mode: "serial", timeout: 900_000 });

test("EXPLORE Canvas first: default view of every settings screen", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const ctx = await context(browser, "canvas");
  const page = await ctx.newPage();
  const app = await openCanvas(page);
  for (const name of SCREENS) {
    await openSettingsScreen("canvas", app, name);
    await page.waitForTimeout(6000);
    await shot(page, `${OUT}/canvas-${name.replace(/\s+/g, "")}.png`);
    const facts = await collectFacts(app, "canvas");
    console.log(`canvas ${name}: ${facts.length} visible named controls, ${new Set(facts.map((f) => f.name)).size} distinct`);
  }
  await ctx.close();
});

test("EXPLORE code app: default view of every settings screen", async ({ browser }) => {
  const ctx = await context(browser, "codeapp");
  const page = await ctx.newPage();
  const app = await openCode(page);
  for (const name of SCREENS) {
    await openSettingsScreen("code", app, name);
    await page.waitForTimeout(4000);
    await shot(page, `${OUT}/code-${name.replace(/\s+/g, "")}.png`);
    const facts = await collectFacts(app, "code");
    console.log(`code ${name}: ${facts.length} visible testids, ${new Set(facts.map((f) => f.name)).size} distinct`);
  }
  await ctx.close();
});
