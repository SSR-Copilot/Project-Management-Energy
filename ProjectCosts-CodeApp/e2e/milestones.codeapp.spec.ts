/**
 * E2E-MILESTONES: Admin Milestones in the code app, read-only (no save is ever clicked).
 * Rule map: ProjectDocs/app-docs/e2e/RULEMAP-admin-milestones.md. Canvas twin: milestones.canvas.spec.ts (not written until a Canvas URL exists).
 * Needs a signed-in session (`node e2e/auth.mjs codeapp`) and `npm run dev` + `pac code run` running.
 */
import { expect, test, type Page } from "@playwright/test";
import { surface, waitForReady, watchProblems } from "./lib/ui";

/** Everything inside the app frame. */
const ui = (page: Page) => surface(page, "codeapp").root;

const MSG = {
  durationInvalid: "Enter a positive value without decimals",
  rateInvalid: "Enter a value between 0 and 1 with a maximum of 2 decimals",
};
const MATRIX_HEADERS = ["Technology", "Cluster 1", "Cluster 2", "Cluster 3", "Cluster 4", "FID", "Cluster 5", "Operational Lifetime", "Sales Start", "Sales End"];

/** `beforeMilestones` runs just before the Milestones route opens, to mark where this screen's own messages start. */
async function openMilestones(page: Page, beforeMilestones?: () => void): Promise<void> {
  // The play URL carries the local app and connection hosts in its query string, so go to it whole.
  await page.goto(test.info().project.use.baseURL ?? "");
  await waitForReady(surface(page, "codeapp"));
  await ui(page).getByTestId("header-user").click();
  await ui(page).getByTestId("header-user-app-settings").click();
  const nav = ui(page).getByRole("navigation");
  await nav.getByText("Check List Settings", { exact: true }).waitFor();
  // Milestones sits under the Standard Assumptions group, which now opens expanded as in the canvas; expand it only if it is not.
  if ((await nav.getByText("Milestones", { exact: true }).count()) === 0) await nav.getByText("Standard Assumptions", { exact: true }).click();
  beforeMilestones?.();
  await nav.getByText("Milestones", { exact: true }).click();
  await expect(ui(page).getByRole("heading", { name: "Milestones", level: 1 })).toBeAttached();
}

/** The first country section (all start folded) opened. Returns its header button's name. */
async function openFirstCountry(page: Page): Promise<string> {
  const header = ui(page).locator("[data-testid^='con_Main_MilestonesStandardAssumptions-'] button").first();
  const name = ((await header.innerText()) || "").trim();
  await header.click();
  await expect(ui(page).getByTestId("gal_MilestonesStandardAssumptions_AdminScreen").first()).toBeVisible();
  return name;
}

async function openEditPanel(page: Page): Promise<void> {
  await ui(page).locator("[data-testid$='-editCountryMilestoneAssumtions']").first().click();
  await expect(ui(page).getByRole("dialog", { name: /^Edit Milestones for / })).toBeVisible();
}

test.describe("Admin Milestones (code app)", () => {
  test("E2E-MILESTONES-001 opens with no console errors, failed calls or Apply controls (rule map B2, B3)", async ({ page }) => {
    const seen = watchProblems(page);
    // Only what happens from opening the Milestones route counts: the landing screen and the other admin screens
    // log their own messages (recorded as findings in the parity report, not blamed on this screen).
    const from = { errors: 0, failed: 0, bad: 0 };
    await openMilestones(page, () => { from.errors = seen.errors.length; from.failed = seen.failed.length; from.bad = seen.bad.length; });
    await openFirstCountry(page);
    await expect(ui(page).getByRole("button", { name: /^Apply/ })).toHaveCount(0);
    await expect(ui(page).getByText(/^Apply standard/)).toHaveCount(0);
    const errors = seen.errors.slice(from.errors);
    const failed = seen.failed.slice(from.failed);
    const bad = seen.bad.slice(from.bad);
    expect(errors, errors.join("\n")).toEqual([]);
    expect(failed, failed.join("\n")).toEqual([]);
    expect(bad, bad.join("\n")).toEqual([]);
  });

  test("E2E-MILESTONES-002 every country starts folded; the title is the country name (A2, A3)", async ({ page }) => {
    await openMilestones(page);
    const sections = ui(page).locator("[data-testid^='con_Main_MilestonesStandardAssumptions-']");
    await expect(sections.first()).toBeVisible();
    await expect(ui(page).getByTestId("gal_MilestonesStandardAssumptions_AdminScreen")).toHaveCount(0);
    const name = await openFirstCountry(page);
    expect(name.length).toBeGreaterThan(0);
    await expect(ui(page).locator("[data-testid^='lbl_ClusterName_MilestonesStandardAssumptions_AdminScreen-']").first()).toBeVisible();
  });

  test("E2E-MILESTONES-003 matrix headers, typography and column widths follow the canvas (A9, A10)", async ({ page }) => {
    await openMilestones(page);
    await openFirstCountry(page);
    const strip = ui(page).getByTestId("con_Header_MilestonesStandardAssumptionsDetails_AdminScreen").first();
    const cells = await strip.locator("th").allInnerTexts();
    expect(cells.map((c) => c.trim()).filter(Boolean)).toEqual(MATRIX_HEADERS);
    const px = (locator: ReturnType<Page["locator"]>, prop: string) => locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
    expect(await px(ui(page).getByTestId("lbl_Technology_MilestonesStandardAssumptions_AdminScreen").first(), "font-size")).toBe("14px");
    expect(Number(await px(ui(page).getByTestId("lbl_Technology_MilestonesStandardAssumptions_AdminScreen").first(), "font-weight"))).toBeGreaterThanOrEqual(600);
    expect(await px(ui(page).locator("[data-testid^='lbl_TechnologyValue_MilestonesStandardAssumptions_AdminScreen-']").first(), "font-size")).toBe("14px");
    expect(await px(ui(page).locator("[data-testid^='lbl_SubLabelsValue_MilestonesStandardAssumptions_AdminScreen-']").first(), "font-size")).toBe("12px");
    expect(await px(ui(page).locator("[data-testid^='lbl_Cluster1Value_MilestonesStandardAssumptions_AdminScreen-']").first(), "font-size")).toBe("12px");
    // Canvas widths (AMS:318-470): Technology 100, blank 110, Cluster 1-4 80, FID 60, Cluster 5 80, Operational Lifetime 160, Sales Start 80, Sales End 100.
    const widths = await strip.locator("th").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    // The twelfth cell is the empty remainder column that carries the grey strip to the right edge.
    expect(widths.slice(0, 11)).toEqual([100, 110, 80, 80, 80, 80, 60, 80, 160, 80, 100]);
    expect(widths[11]).toBeGreaterThan(0);
    const strip32 = await strip.evaluate((e) => Math.round(e.getBoundingClientRect().height));
    expect(strip32).toBe(32);
  });

  test("E2E-MILESTONES-004 Edit opens the panel titled for the country, with the canvas headings and sizes (B1, B4, C1)", async ({ page }) => {
    await openMilestones(page);
    const country = await openFirstCountry(page);
    await openEditPanel(page);
    const dialog = ui(page).getByRole("dialog", { name: `Edit Milestones for ${country}` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Cluster Durations [months]")).toBeVisible();
    await expect(dialog.getByText("Cluster Probabilities - Success Rate [-]")).toBeVisible();
    const size = (text: string) => dialog.getByText(text, { exact: true }).first().evaluate((el) => getComputedStyle(el).fontSize);
    expect(await size("Cluster Durations [months]")).toBe("14px");
    expect(await size("Final Investment Decision")).toBe("14px");
    // Save starts disabled: nothing changed (C7).
    await expect(ui(page).getByTestId("pcf_but_Admin_MilestoneAssumption_Form_Buttons_Save")).toBeDisabled();
  });

  test("E2E-MILESTONES-005 duration and success-rate validation: canvas messages, Save gate (C2 to C7)", async ({ page }) => {
    await openMilestones(page);
    await openFirstCountry(page);
    await openEditPanel(page);
    const save = ui(page).getByTestId("pcf_but_Admin_MilestoneAssumption_Form_Buttons_Save");
    const dur = ui(page).locator("[data-testid^='txt_Admin_MilestoneAssumption_Form_Fields_Durations_Cluster1_Input-']").first();
    const rate = ui(page).locator("[data-testid^='txt_Admin_MilestoneAssumption_Form_Fields_SuccessRates_Cluster1_Input-']").first();
    const durMsg = ui(page).getByTestId("lbl_Admin_MilestoneAssumption_Form_Fields_Durations_InvalidMessage");
    const rateMsg = ui(page).getByTestId("lbl_Admin_MilestoneAssumption_Form_Fields_SuccessRates_InvalidMessage");

    for (const bad of ["abc", "6.5", "-1"]) {
      await dur.fill(bad);
      await expect(durMsg).toHaveText(MSG.durationInvalid);
      await expect(save).toBeDisabled();
    }
    await dur.fill("7");
    await expect(durMsg).toHaveText("");
    await expect(save).toBeEnabled();

    for (const bad of ["1.5", "0.555", "x", "-0.1"]) {
      await rate.fill(bad);
      await expect(rateMsg).toHaveText(MSG.rateInvalid);
      await expect(save).toBeDisabled();
    }
    for (const good of ["0", "1", "0.55", "0,5"]) {
      await rate.fill(good);
      await expect(rateMsg).toHaveText("");
    }
    // Leave nothing behind: close and discard (no save was clicked).
    await ui(page).getByTestId("pcf_but_Admin_MilestoneAssumption_Form_Buttons_Cancel").click();
    await ui(page).getByRole("alertdialog").getByRole("button", { name: "Discard" }).click();
    await expect(ui(page).getByRole("dialog", { name: /^Edit Milestones for / })).toHaveCount(0);
  });

  test("E2E-MILESTONES-006 Cancel on an untouched panel closes at once; on a changed one it asks first (C8)", async ({ page }) => {
    await openMilestones(page);
    await openFirstCountry(page);
    await openEditPanel(page);
    await ui(page).getByTestId("pcf_but_Admin_MilestoneAssumption_Form_Buttons_Cancel").click();
    await expect(ui(page).getByRole("dialog", { name: /^Edit Milestones for / })).toHaveCount(0);
    await openEditPanel(page);
    await ui(page).locator("[data-testid^='txt_Admin_MilestoneAssumption_Form_Fields_Durations_Cluster1_Input-']").first().fill("9");
    await ui(page).getByTestId("pcf_but_Admin_MilestoneAssumption_Form_Buttons_Cancel").click();
    await expect(ui(page).getByRole("alertdialog")).toBeVisible();
    await ui(page).getByRole("alertdialog").getByRole("button", { name: "Discard" }).click();
    await expect(ui(page).getByRole("dialog", { name: /^Edit Milestones for / })).toHaveCount(0);
  });

  test.fixme("E2E-MILESTONES-007 a user without the admin rule sees Edit disabled and a save is refused (B5)", async () => {
    // Needs a second, non-admin test account; see the inputs list in E2E-PARITY-PROMPT.md.
  });
});
