import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resolveTestProject, type TestProject } from "./test-project";

/**
 * Each of the three apps needs its OWN authenticated browser context — they are different
 * origins with different saved sessions (TEST-STRATEGY.md §10), so a single page/context
 * cannot hold all three at once. This fixture opens one context per app and tears each down
 * after the test, and resolves the dynamic test project once via the code app (§9) so every
 * spec gets a consistent GUID without re-deriving it.
 */
interface CrossAppFixtures {
  pmPage: Page;
  costsPage: Page;
  codeAppPage: Page;
  project: TestProject;
}

export const test = base.extend<CrossAppFixtures>({
  pmPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: ".auth/canvas-pm.json" });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  costsPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: ".auth/canvas-costs.json" });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  codeAppPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: ".auth/codeapp.json" });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  // Depends on codeAppPage, so it reuses that context's auth rather than opening a fourth.
  project: async ({ codeAppPage }, use) => {
    const project = await resolveTestProject(codeAppPage);
    await use(project);
  },
});

export { expect } from "@playwright/test";
