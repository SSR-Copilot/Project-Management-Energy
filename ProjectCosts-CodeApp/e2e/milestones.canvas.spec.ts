/**
 * E2E-MILESTONES (Canvas): the REFERENCE run. Standing order (29 Oct 2026): the Canvas app runs first.
 * It measures the Project Management canvas app's Application Settings > Milestones screen and writes what it finds to
 * `e2e/reference/milestones.canvas.json`; `milestones.codeapp.spec.ts` (E2E-MILESTONES-008) then compares the code app with it.
 * Read-only: Edit is opened and cancelled, no Save is ever pressed. Canvas data values are NOT recorded, only structure and behaviour.
 * Needs `npm run e2e:auth:canvas` once.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type FrameLocator, type Page } from "@playwright/test";

const REFERENCE = "e2e/reference/milestones.canvas.json";
const SUFFIX = "_MilestonesStandardAssumptions_AdminScreen";
const FORM = "Admin_MilestoneAssumption_Form_Fields";

/** Inputs tried in the Edit panel. The same lists are replayed on the code app (E2E-MILESTONES-008). */
const DURATION_INPUTS = ["abc", "6.5", "-1", "7", "0", " 6", "101", "1001"];
const RATE_INPUTS = ["1.5", "0.555", "x", "-0.1", "0", "1", "0.55", "0,5", "1."];

const reference: Record<string, unknown> = {};

async function openCanvasMilestones(page: Page): Promise<FrameLocator> {
  await page.goto(test.info().project.use.baseURL ?? "");
  const app = page.frameLocator("iframe[name='fullscreen-app-host'], iframe#fullscreen-app-host");
  // The player stops at "Sign in required" until the button is pressed; the session itself is already saved.
  for (let i = 0; i < 40; i++) {
    if ((await app.locator("[data-control-name]").count().catch(() => 0)) > 20) break;
    for (const f of page.frames()) {
      const signIn = f.getByRole("button", { name: "Sign in", exact: true });
      if (await signIn.count().catch(() => 0)) await signIn.first().click({ timeout: 2000 }).catch(() => {});
    }
    await page.waitForTimeout(4000);
  }
  await expect(app.locator("[data-control-name='cml_Main_User_Badge']").first()).toBeVisible({ timeout: 60_000 });
  await app.locator("[data-control-name='cml_Main_User_Badge']").first().click();
  await app.getByRole("menuitem", { name: "Application Settings" }).click();
  // Application Settings opens Check List Settings; Milestones sits in the left menu under Standard Assumptions.
  await app.getByText("Milestones", { exact: true }).first().click();
  await expect(app.locator(`[data-control-name='btn_Select${SUFFIX}']`).first()).toBeVisible({ timeout: 60_000 });
  return app;
}

/** Geometry and text style of the real text node inside a canvas control. */
async function describe(app: FrameLocator, name: string, nth = 0): Promise<Record<string, unknown>> {
  return app.locator(`[data-control-name='${name}']`).nth(nth).evaluate((e: Element) => {
    const r = e.getBoundingClientRect();
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const textEl = walker.nextNode()?.parentElement ?? null;
    const cs = textEl ? getComputedStyle(textEl) : null;
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      text: (e as HTMLElement).innerText.trim(),
      fontSize: cs?.fontSize ?? null, fontWeight: cs?.fontWeight ?? null, fontFamily: cs?.fontFamily.split(",")[0]?.replace(/"/g, "") ?? null,
      color: cs?.color ?? null, textAlign: cs?.textAlign ?? null,
    };
  }, undefined, { timeout: 15_000 });
}

test.describe.configure({ mode: "serial", timeout: 300_000 });

test.describe("Admin Milestones (Canvas reference)", () => {
  test("E2E-MILESTONES-C01 matrix geometry, text styles, header strip and commands", async ({ page }) => {
    const app = await openCanvasMilestones(page);
    await app.locator(`[data-control-name='btn_Select${SUFFIX}']`).first().click();
    await expect(app.locator(`[data-control-name='con_Header_MilestonesStandardAssumptionsDetails_AdminScreen']`).first()).toBeVisible({ timeout: 30_000 });

    const strip = await describe(app, "con_Header_MilestonesStandardAssumptionsDetails_AdminScreen");
    const columns = ["lbl_Technology", "lbl_BlankSubLabels", "lbl_Cluster1", "lbl_Cluster2", "lbl_Cluster3", "lbl_Cluster4", "lbl_FID", "lbl_Cluster5",
      "lbl_OperationalLifetime", "lbl_SalesStartDate", "lbl_SalesCompletionDate"];
    const headers: Record<string, unknown>[] = [];
    for (const c of columns) {
      const d = await describe(app, `${c}${SUFFIX}`);
      headers.push({ control: c, text: d.text, xFromStrip: (d.x as number) - (strip.x as number), w: d.w, fontSize: d.fontSize, fontWeight: d.fontWeight });
    }
    const one = async (n: string) => describe(app, `${n}${SUFFIX}`);
    const technologyValue = await one("lbl_TechnologyValue");
    const subLabel = await one("lbl_SubLabelsValue");
    const cluster1Value = await one("lbl_Cluster1Value");
    const opLifetimeValue = await one("lbl_OperationalLifetimeValue");
    const countryName = await one("lbl_ClusterName");
    const countryHeader = await describe(app, "con_Header_MilestonesStandardAssumptions_AdminScreen");

    const commandItems = await app.locator("[data-control-name='cmd_MilestoneStandardAssumptionsDetails_Country_CommandBar']").first().getByRole("menuitem").allInnerTexts();
    const topCommandItems = await app.locator("[data-control-name='CommandBar1']").first().getByRole("menuitem").allInnerTexts().catch(() => []);
    const standardAssumptionsExpanded = await app.getByText("Milestones", { exact: true }).first().isVisible();

    reference.matrix = {
      capturedWith: { viewport: "1920x1040", app: "Project Management canvas app, VSBCloud_Dev" },
      strip: { h: strip.h, wToContentRight: "runs to the right edge", wIsFixed: false, stripWidth: strip.w },
      headers,
      row: { h: technologyValue.h },
      technologyValue: { fontSize: technologyValue.fontSize, fontWeight: technologyValue.fontWeight },
      subLabel: { fontSize: subLabel.fontSize, fontWeight: subLabel.fontWeight, text: subLabel.text },
      value: { fontSize: cluster1Value.fontSize, fontWeight: cluster1Value.fontWeight },
      operationalLifetimeValueLines: String(opLifetimeValue.text).split("\n").length,
      countryName: { fontSize: countryName.fontSize, fontWeight: countryName.fontWeight, fontFamily: countryName.fontFamily, color: countryName.color },
      countryHeaderHeight: countryHeader.h,
      commandItems: commandItems.map((t) => t.trim()),
      topCommandItems: topCommandItems.map((t) => t.trim()),
      leftMenuStandardAssumptionsExpanded: standardAssumptionsExpanded,
    };
    expect(headers.length).toBe(columns.length);
  });

  test("E2E-MILESTONES-C02 Edit panel: title, headings, geometry and validation behaviour", async ({ page }) => {
    const app = await openCanvasMilestones(page);
    await app.locator(`[data-control-name='btn_Select${SUFFIX}']`).first().click();
    await app.locator("[data-control-name='cmd_MilestoneStandardAssumptionsDetails_Country_CommandBar']").first().getByText("Edit", { exact: true }).first().click();
    const dur = app.locator(`[data-control-name='txt_${FORM}_Durations_Cluster1_Input'] input`).first();
    await expect(dur).toBeVisible({ timeout: 30_000 });

    const title = await describe(app, "lblAdmin_ProjectGates_Approvals_Form_Title_2");
    const heading = await describe(app, "lbl_Admin_MilestoneAssumption_Form_SubHeader_ClusterDurations");
    const rowLabel = await describe(app, `lbl_${FORM}_Durations_Cluster1`);
    const fid = await describe(app, `lbl_${FORM}_Durations_FID`);
    const techLabel = await describe(app, "lb_Admin_MilestoneAssumption_Form_Fields_Durations_TechniqueLabel");
    const input = await describe(app, `txt_${FORM}_Durations_Cluster1_Input`);
    const rateHeading = await describe(app, "lbl_Admin_MilestoneAssumption_Form_SubHeader_ClusterSuccessRates");

    const rate = app.locator(`[data-control-name='txt_${FORM}_SuccessRates_Cluster1_Input'] input`).first();
    const saveButton = app.locator("[data-control-name='pcf_but_Admin_MilestoneAssumption_Form_Buttons_Save'] button").first();
    const read = async (kind: "Durations" | "SuccessRates") => {
      const msg = app.locator(`[data-control-name='lbl_${FORM}_${kind}_InvalidMessage']`).first();
      const shown = (await msg.count()) > 0 && (await msg.evaluate((e) => e.getBoundingClientRect().height)) > 0;
      return { message: shown ? (await msg.innerText()).trim() : null, saveEnabled: !(await saveButton.isDisabled()) };
    };

    const durations: Record<string, unknown> = {};
    for (const v of DURATION_INPUTS) { await dur.fill(v); await dur.blur(); await page.waitForTimeout(600); durations[v] = await read("Durations"); }
    await dur.fill("7"); await dur.blur();
    const rates: Record<string, unknown> = {};
    for (const v of RATE_INPUTS) { await rate.fill(v); await rate.blur(); await page.waitForTimeout(600); rates[v] = await read("SuccessRates"); }

    reference.panel = {
      title: { textStartsWith: String(title.text).replace(/ for .*/, " for"), fontWeight: title.fontWeight, h: title.h },
      durationsHeading: { text: heading.text, fontSize: heading.fontSize, fontWeight: heading.fontWeight, h: heading.h, leftFromPanel: heading.x },
      rateHeading: { text: rateHeading.text },
      rowLabel: { fontSize: rowLabel.fontSize, fontWeight: rowLabel.fontWeight, h: rowLabel.h },
      fidLabel: { text: fid.text, h: fid.h },
      technologyLabel: { fontSize: techLabel.fontSize, fontWeight: techLabel.fontWeight, h: techLabel.h },
      input: { w: input.w, h: input.h },
      // Both are measured on the canvas control boxes; the code app compares widths and the pitch between neighbours.
      validation: { durations, rates },
    };
    // Leave nothing behind: Cancel (the canvas closes the panel and discards the typed values).
    await app.locator("[data-control-name='pcf_but_Admin_MilestoneAssumption_Form_Buttons_Cancel'] button").first().click().catch(() => {});

    mkdirSync("e2e/reference", { recursive: true });
    writeFileSync(REFERENCE, JSON.stringify({ capturedAt: new Date().toISOString().slice(0, 10), ...reference }, null, 2));
  });
});
