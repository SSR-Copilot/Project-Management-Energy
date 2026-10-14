/**
 * Interactive auth capture — TEST-STRATEGY.md §10. Run this yourself, headed, whenever a
 * suite run fails with a login redirect instead of the expected screen (that redirect is the
 * practical signal a saved session expired).
 *
 *   npm run capture-auth
 *
 * This opens three headed browser windows in turn. In EACH one: complete the Entra ID
 * login (including MFA) by hand, wait for the app to actually render, then come back to
 * the terminal and press Enter when prompted. Nothing here scripts or stores a password —
 * only the resulting session is saved, to `.auth/*.json`, which is gitignored.
 */
import { test } from "@playwright/test";
import { canvasPmBaseUrl, canvasCostsBaseUrl, codeAppBaseUrl } from "../fixtures/canvas-urls";
import * as readline from "node:readline/promises";

async function waitForHumanConfirmation(label: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(
    `\n[${label}] Finish logging in by hand in the opened browser window, wait for the ` +
      "app to render, then press Enter here to save the session...\n",
  );
  rl.close();
}

test("capture canvas Project Management session", async ({ page, context }) => {
  await page.goto(canvasPmBaseUrl());
  await waitForHumanConfirmation("canvas-pm");
  await context.storageState({ path: ".auth/canvas-pm.json" });
});

test("capture canvas Project Costs session", async ({ page, context }) => {
  await page.goto(canvasCostsBaseUrl());
  await waitForHumanConfirmation("canvas-costs");
  await context.storageState({ path: ".auth/canvas-costs.json" });
});

test("capture code app session", async ({ page, context }) => {
  await page.goto(codeAppBaseUrl());
  await waitForHumanConfirmation("codeapp");
  await context.storageState({ path: ".auth/codeapp.json" });
});
