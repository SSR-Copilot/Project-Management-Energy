/**
 * E2E-LANDLEASE-001…006: Land Lease in the code app, the smoke / logs / accessibility / deep-link / zoom layer
 * (E2E-PARITY-PROMPT.md section 4, layers 1, 2, 7 and 8). Read-only: nothing is saved.
 * Rule map: ProjectDocs/app-docs/e2e/RULEMAP-land-lease.md. Needs `npm run e2e:auth:codeapp`, `npm run dev` + `pac code run`,
 * and $env:LANDLEASE_PROJECT_ID (the specs skip without it; the id is never written into a file).
 */
import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { openCodeCost, projectIdOrSkip, waitForStable } from "./lib/cost";
import { watchProblems } from "./lib/ui";

const COST_SCREEN = "/costs/land-lease";

/** The app frame's own route (the play page's URL never changes; the code app routes by hash inside its frame). */
const appRoute = (page: Page): string => {
  const frame = page.frames().find((f) => f.url().includes("localhost:3000"));
  return frame ? new URL(frame.url()).hash.replace(/^#/, "") : "";
};

/** Every visible interactive control without an explicit aria-label (or aria-labelledby) or without a data-testid (rule 16). */
async function unlabelled(app: FrameLocator): Promise<string[]> {
  return app.locator("body").evaluate((body) => {
    const sel = "button, input, select, textarea, a[href], [role='button'], [role='switch'], [role='checkbox'], [role='radio'], [role='combobox'], [role='tab'], [role='menuitem']";
    const out: string[] = [];
    for (const e of Array.from(body.querySelectorAll<HTMLElement>(sel))) {
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || getComputedStyle(e).visibility === "hidden") continue;
      // A Fluent control puts the test id on its wrapper or its input; either counts.
      const testId = e.getAttribute("data-testid") ?? e.closest("[data-testid]")?.getAttribute("data-testid");
      const label = e.getAttribute("aria-label") ?? e.getAttribute("aria-labelledby");
      if (!testId || !label) out.push(`${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""} testid=${testId ?? "-"} label=${label ?? "-"} text="${(e.innerText || "").trim().slice(0, 30)}"`);
    }
    return out;
  });
}

test.describe("Land Lease (code app): smoke, logs, accessibility, deep link, zoom", () => {
  test("E2E-LANDLEASE-001 opens with no console errors, failed calls or HTTP errors", async ({ page }) => {
    const projectId = projectIdOrSkip();
    const seen = watchProblems(page);
    await openCodeCost(page, projectId, COST_SCREEN);
    // Printed first, so a failure names every URL behind it (and the host's own errors are on record too).
    console.log(JSON.stringify({ errors: seen.errors, failed: seen.failed, bad: seen.bad, hostOnly: seen.benign }, null, 1));
    expect(appRoute(page)).toContain(COST_SCREEN);
    expect(seen.errors, "console errors").toEqual([]);
    expect(seen.failed, "failed requests").toEqual([]);
    expect(seen.bad, "HTTP responses of 400 or more").toEqual([]);
  });

  test("E2E-LANDLEASE-002 the [VSB] request log records the screen's load (CONVENTIONS rule 23)", async ({ page }) => {
    const projectId = projectIdOrSkip();
    const lines: string[] = [];
    page.on("console", (m) => { if (m.text().startsWith("[VSB] ")) lines.push(m.text()); });
    await openCodeCost(page, projectId, COST_SCREEN);
    await expect.poll(() => lines.filter((l) => /^\[VSB\] ACTION Load .*: \d+ ms, \d+ requests?, .*\[a\d+\]$/.test(l)).length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(lines.some((l) => l.startsWith("[VSB] DATA read "))).toBe(true);
    // The host pushes the SDK's `networkRequest` metrics in batches, AFTER the load's ACTION line
    // (CA-28, 3 Nov 2026: present some seconds later). So wait for the HTTP line too.
    await expect.poll(() => lines.some((l) => l.startsWith("[VSB] HTTP GET ")), { timeout: 30_000 }).toBe(true);
    // Counts and names only: no record id in a DATA or ACTION line (a URL's $filter may carry the project id).
    const guid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(lines.filter((l) => !l.startsWith("[VSB] HTTP ") && guid.test(l)), "ids outside HTTP lines").toEqual([]);
  });

  test("E2E-LANDLEASE-003 every visible control has an aria-label and a data-testid, closed and with a card open (rule 16)", async ({ page }) => {
    const projectId = projectIdOrSkip();
    const app = await openCodeCost(page, projectId, COST_SCREEN);
    const closed = await unlabelled(app);
    const firstCard = app.locator("[data-testid^='leasecard-']").first();
    if (await firstCard.count()) { await firstCard.click(); await waitForStable(page, app); }
    const open = await unlabelled(app);
    expect({ closed, open }).toEqual({ closed: [], open: [] });
  });

  test("E2E-LANDLEASE-004 no control id is built from a display value (rule 16: a row id, never a name)", async ({ page }) => {
    const projectId = projectIdOrSkip();
    const app = await openCodeCost(page, projectId, COST_SCREEN);
    const ids = await app.locator("[data-testid]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""));
    // A repeated control is `<base>-<row id>`; a suffix with spaces or letters other than hex is a display value.
    const fromNames = [...new Set(ids.filter((id) => /^[a-z]+(card|row)-/i.test(id) && /\s|[g-z]/i.test(id.split("-").slice(1).join("-"))))];
    expect(fromNames, "test ids that carry a display value").toEqual([]);
  });

  test("E2E-LANDLEASE-005 the Edit Costs deep link and a browser refresh land on the same screen and project", async ({ page }) => {
    const projectId = projectIdOrSkip();
    const app = await openCodeCost(page, projectId, COST_SCREEN);
    const title = async () => (await app.locator(".canvas-project-title").first().innerText()).trim();
    const before = await title();
    expect(before.length).toBeGreaterThan(0);
    await page.reload();
    await app.getByTestId("header-user").waitFor({ state: "visible", timeout: 60_000 });
    await waitForStable(page, app);
    expect(appRoute(page)).toContain(COST_SCREEN);
    expect(await title()).toBe(before);
  });

  test("E2E-LANDLEASE-006 at 75 %, 100 % and 125 % zoom the cards stay reachable and the page does not scroll sideways", async ({ page }) => {
    const projectId = projectIdOrSkip();
    const app = await openCodeCost(page, projectId, COST_SCREEN);
    for (const zoom of ["0.75", "1", "1.25"]) {
      await app.locator("html").evaluate((h, z) => { (h as HTMLElement).style.zoom = z; }, zoom);
      await waitForStable(page, app);
      await page.screenshot({ path: `e2e/parity-out/landlease.zoom-${zoom}.code.png` }).catch(() => {});
      const sideways = await app.locator("html").evaluate((h) => h.scrollWidth > h.clientWidth + 1);
      expect(sideways, `horizontal page scroll at zoom ${zoom}`).toBe(false);
      await expect(app.locator("[data-testid^='leasecard-']").first(), `a card at zoom ${zoom}`).toBeVisible();
    }
  });
});
