/**
 * One-time sign-in. Opens a visible browser, waits for you to finish signing in (MFA by hand),
 * then saves the session to e2e/.auth/<target>.json (git-ignored). No password is read or stored.
 *
 *   node e2e/auth.mjs codeapp   uses CODEAPP_URL, or the default pac play URL
 *   node e2e/auth.mjs canvas    uses CANVAS_URL (required)
 *
 * It saves when the page shows the app (a heading, the left rail or the canvas player frame), up to 5 minutes.
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const target = process.argv[2];
const DEFAULT_CODEAPP_URL =
  "https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/app/local"
  + "?_localAppUrl=http://localhost:3000&_localConnectionUrl=http://localhost:8080";
const DEFAULT_CANVAS_PM_URL =
  "https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/a/67054ad6-e70b-4738-a3e6-125384fe2b4b?tenantId=e3bab30b-3902-4ce6-b575-f005f94c78c1";
const url = target === "canvas" ? (process.env.CANVAS_URL ?? DEFAULT_CANVAS_PM_URL) : (process.env.CODEAPP_URL ?? DEFAULT_CODEAPP_URL);
if (!["codeapp", "canvas"].includes(target) || !url) {
  console.error("Usage: node e2e/auth.mjs <codeapp|canvas>");
  process.exit(1);
}

mkdirSync("e2e/.auth", { recursive: true });
// Real Chrome, not the bundled Chromium: the play page calls http://localhost:3000 / :8080, and a fresh
// Chromium blocks that "local network" access silently, which shows as a blank page. Falls back to Chromium.
let browser;
// The disabled features are Chrome's local-network checks (a prompt this fresh profile cannot show).
const args = ["--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests"];
try { browser = await chromium.launch({ headless: false, channel: "chrome", args }); }
catch { browser = await chromium.launch({ headless: false, args }); }
// Same Microsoft account for both apps: start from the other app's saved session when there is one, so no second sign-in is needed.
const seedFile = target === "canvas" ? "e2e/.auth/codeapp.json" : "e2e/.auth/canvas.json";
const seed = existsSync(seedFile) ? { storageState: seedFile } : {};
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, ...seed });
for (const permission of ["local-network-access", "loopback-network"]) {
  try { await context.grantPermissions([permission]); } catch { /* not known to this Playwright version */ }
}
const page = await context.newPage();
// Say what the page does, so a blank screen can be explained from this log.
page.on("console", (m) => { if (m.type() === "error") console.log("console error:", m.text().slice(0, 300)); });
page.on("requestfailed", (r) => console.log("request failed:", r.url().slice(0, 160), r.failure()?.errorText ?? ""));
page.on("framenavigated", (f) => console.log("navigated:", f.url().slice(0, 160)));
await page.goto(url);
console.log("Sign in in the browser window. Waiting up to 5 minutes for the app to appear...");

// The play page hosts the app in an iframe. Ready = the app frame shows a navigation landmark (code app)
// or controls (canvas). A screenshot and the frame list are written every 10 s as e2e/.auth/diag.png / diag.txt.
const deadline = Date.now() + 300_000;
let ok = false;
while (Date.now() < deadline && !ok) {
  // The canvas player stops at a "Sign in required" dialog until the button is pressed (the session itself is already there).
  for (const frame of page.frames()) {
    const signIn = frame.getByRole("button", { name: "Sign in", exact: true });
    if (await signIn.count().catch(() => 0)) await signIn.first().click({ timeout: 3000 }).catch(() => {});
  }
  for (const frame of page.frames()) {
    const hit = target === "canvas"
      ? await frame.locator("[data-control-name]").count().catch(() => 0)
      : await frame.locator("[data-testid='header-user']").count().catch(() => 0);
    if (hit > 0) { ok = true; break; }
  }
  if (!ok) {
    await page.screenshot({ path: "e2e/.auth/diag.png" }).catch(() => {});
    writeFileSync("e2e/.auth/diag.txt", page.frames().map((f) => f.url()).join(String.fromCharCode(10)));
    await page.waitForTimeout(10_000);
  }
}
if (!ok) { console.error("Timeout: the app never appeared. See e2e/.auth/diag.png"); await browser.close(); process.exit(2); }
await page.waitForTimeout(4000);
await context.storageState({ path: `e2e/.auth/${target}.json` });
console.log(`Saved e2e/.auth/${target}.json`);
await browser.close();
