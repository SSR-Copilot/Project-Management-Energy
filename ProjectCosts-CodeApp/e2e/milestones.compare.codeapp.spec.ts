/**
 * E2E-MILESTONES-008: the code app compared with the Canvas reference run.
 *
 * `e2e/reference/milestones.canvas.json` is written by milestones.canvas.spec.ts, which runs FIRST (standing order, 29 Oct 2026).
 * A difference fails this test unless it is listed in KNOWN with its reason, and a listed difference that no longer occurs fails too,
 * so the list cannot go stale. Read-only: nothing is saved.
 */
import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { surface, waitForReady } from "./lib/ui";

const REFERENCE = "e2e/reference/milestones.canvas.json";
const ui = (page: Page) => surface(page, "codeapp").root;
const SUFFIX = "_MilestonesStandardAssumptions_AdminScreen";

/** Differences from the Canvas run that are decided or documented, with the reason. Anything else fails the test. */
const KNOWN: Record<string, string> = {
  "commands": "D67: Apply is removed from the code app (the canvas shows it disabled)",
  "topCommands": "D67: Apply All is removed from the code app (the canvas shows it disabled)",
  'validation.duration["101"].saveEnabled': "DIVERGENCE (validateDuration): the column maximum 100 for Cluster 1 is also enforced; the canvas checks only digits",
  'validation.duration["1001"].saveEnabled': "DIVERGENCE (validateDuration): the column maximum is also enforced; the canvas checks only digits",
  'validation.duration[" 6"].saveEnabled': "DIVERGENCE (validateDuration): surrounding spaces are ignored; the canvas rejects \" 6\"",
  'validation.rate["0,5"].saveEnabled': "DIVERGENCE (validateSuccessRate): both . and , are accepted; the canvas accepts only the language's separator (en-US: .)",
};

interface Box { x: number; w: number; h: number; fontSize: string; fontWeight: string }
const box = (loc: Locator): Promise<Box> => loc.evaluate((e) => {
  const r = e.getBoundingClientRect();
  const cs = getComputedStyle(e);
  return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), fontSize: cs.fontSize, fontWeight: cs.fontWeight };
});

interface Outcome { message: string | null; saveEnabled: boolean }

test("E2E-MILESTONES-008 the code app matches the Canvas reference run", async ({ page }) => {
  test.skip(!existsSync(REFERENCE), "No Canvas reference yet: run `npm run e2e:canvas` first");
  test.setTimeout(240_000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref: any = JSON.parse(readFileSync(REFERENCE, "utf8"));
  const found: Record<string, string> = {};
  const note = (key: string, canvas: unknown, code: unknown) => {
    if (JSON.stringify(canvas) !== JSON.stringify(code)) found[key] = `canvas ${JSON.stringify(canvas)} / code ${JSON.stringify(code)}`;
  };

  await page.goto(test.info().project.use.baseURL ?? "");
  await waitForReady(surface(page, "codeapp"));
  await ui(page).getByTestId("header-user").click();
  await ui(page).getByTestId("header-user-app-settings").click();
  const nav = ui(page).getByRole("navigation");
  // Wait until the menu has rendered before looking at which groups are open (an empty menu would read as "collapsed").
  await nav.getByText("Check List Settings", { exact: true }).waitFor();
  const milestonesItem = nav.getByText("Milestones", { exact: true });
  // How the left menu opens is read BEFORE anything is clicked in it.
  note("leftMenu.standardAssumptionsExpandedOnOpen", ref.matrix.leftMenuStandardAssumptionsExpanded, (await milestonesItem.count()) > 0);
  if ((await milestonesItem.count()) === 0) await nav.getByText("Standard Assumptions", { exact: true }).click();
  await milestonesItem.click();
  await ui(page).locator("[data-testid^='con_Main_MilestonesStandardAssumptions-'] button").first().click();
  const strip = ui(page).getByTestId(`con_Header_MilestonesStandardAssumptionsDetails_AdminScreen`).first();
  await expect(strip).toBeVisible();

  // Matrix: header strip, header labels, rows, text styles, commands.
  const stripBox = await box(strip);
  note("strip.height", ref.matrix.strip.h, stripBox.h);
  for (const h of ref.matrix.headers as { control: string; text: string; xFromStrip: number; w: number; fontSize: string; fontWeight: string }[]) {
    if (!h.text) continue;
    const label = ui(page).getByTestId(`${h.control}${SUFFIX}`).first();
    const th = await box(label.locator("xpath=ancestor::th[1]"));
    const text = await box(label);
    note(`header.${h.text}.width`, h.w, th.w);
    note(`header.${h.text}.fontSize`, h.fontSize, text.fontSize);
    note(`header.${h.text}.fontWeight`, h.fontWeight, text.fontWeight);
    // The canvas labels are one line ("Sales Start" has `Wrap: false`): a wrapped label is about twice as tall as a line.
    note(`header.${h.text}.oneLine`, true, text.h <= 24);
    // The canvas label box starts `xFromStrip` from the strip, 20 px of which is the strip's own left inset: compare the column start.
    note(`header.${h.text}.columnStart`, h.xFromStrip - 20, th.x - stripBox.x);
  }
  const row = await box(ui(page).locator("[data-testid^='con_Details_MilestonesStandardAssumptions_AdminScreen-']").first());
  note("row.height", ref.matrix.row.h, row.h);
  note("technologyValue.fontSize", ref.matrix.technologyValue.fontSize, (await box(ui(page).locator(`[data-testid^='lbl_TechnologyValue${SUFFIX}-']`).first())).fontSize);
  note("subLabel.fontSize", ref.matrix.subLabel.fontSize, (await box(ui(page).locator(`[data-testid^='lbl_SubLabelsValue${SUFFIX}-']`).first())).fontSize);
  note("value.fontSize", ref.matrix.value.fontSize, (await box(ui(page).locator(`[data-testid^='lbl_Cluster1Value${SUFFIX}-']`).first())).fontSize);
  const country = await box(ui(page).locator(`[data-testid^='lbl_ClusterName${SUFFIX}-']`).first());
  note("countryName.fontSize", ref.matrix.countryName.fontSize, country.fontSize);
  note("countryName.fontWeight", ref.matrix.countryName.fontWeight, country.fontWeight);
  note("countryHeader.height", ref.matrix.countryHeaderHeight, (await box(ui(page).locator("[data-testid^='con_Main_MilestonesStandardAssumptions-'] button").first())).h);
  const commands = (await ui(page).locator("[data-testid$='-editCountryMilestoneAssumtions'], [data-testid$='-applyCountryMilestoneAssumtions']").allInnerTexts()).map((t) => t.trim());
  note("commands", (ref.matrix.commandItems as string[]).map((t) => t.trim()), commands);
  note("topCommands", (ref.matrix.topCommandItems as string[]).map((t) => t.trim()), []);

  // Edit panel: sizes and the validation behaviour.
  await ui(page).locator("[data-testid$='-editCountryMilestoneAssumtions']").first().click();
  const dialog = ui(page).getByRole("dialog", { name: /^Edit Milestones for / });
  await expect(dialog).toBeVisible();
  const heading = await box(dialog.getByTestId("lbl_Admin_MilestoneAssumption_Form_SubHeader_ClusterDurations"));
  note("panel.heading.fontSize", ref.panel.durationsHeading.fontSize, heading.fontSize);
  note("panel.heading.fontWeight", ref.panel.durationsHeading.fontWeight, heading.fontWeight);
  const label1 = dialog.getByTestId("lbl_Admin_MilestoneAssumption_Form_Fields_Durations_Cluster1");
  const label2 = dialog.getByTestId("lbl_Admin_MilestoneAssumption_Form_Fields_Durations_Cluster2");
  const l1 = await box(label1);
  note("panel.rowLabel.fontSize", ref.panel.rowLabel.fontSize, l1.fontSize);
  note("panel.rowLabel.fontWeight", ref.panel.rowLabel.fontWeight, l1.fontWeight);
  const y = (l: Locator) => l.evaluate((e) => e.getBoundingClientRect().y);
  note("panel.rowPitch", ref.panel.rowLabel.h, Math.round((await y(label2)) - (await y(label1))));
  const durationInput = dialog.locator("[data-testid^='txt_Admin_MilestoneAssumption_Form_Fields_Durations_Cluster1_Input-']").first();
  const inputBox = await box(durationInput.locator("xpath=ancestor-or-self::*[contains(@class,'fui-Input')][1]"));
  note("panel.input.width", ref.panel.input.w, inputBox.w);
  note("panel.input.height", ref.panel.input.h, inputBox.h);
  note("panel.fidLabelText", ref.panel.fidLabel.text, (await dialog.getByText("Final Investment Decision").first().innerText()).trim());

  const save = ui(page).getByTestId("pcf_but_Admin_MilestoneAssumption_Form_Buttons_Save");
  const rateInput = dialog.locator("[data-testid^='txt_Admin_MilestoneAssumption_Form_Fields_SuccessRates_Cluster1_Input-']").first();
  const durMsg = ui(page).getByTestId("lbl_Admin_MilestoneAssumption_Form_Fields_Durations_InvalidMessage");
  const rateMsg = ui(page).getByTestId("lbl_Admin_MilestoneAssumption_Form_Fields_SuccessRates_InvalidMessage");
  const outcome = async (msg: Locator): Promise<Outcome> => ({ message: (await msg.innerText()).trim() || null, saveEnabled: await save.isEnabled() });
  const replay = async (kind: "duration" | "rate", input: Locator, msg: Locator, table: Record<string, Outcome>) => {
    for (const [value, canvas] of Object.entries(table)) {
      await input.fill(value);
      await input.blur();
      const code = await outcome(msg);
      note(`validation.${kind}[${JSON.stringify(value)}].saveEnabled`, canvas.saveEnabled, code.saveEnabled);
      // Where both apps show a message, it must be the same canvas text.
      if (canvas.message && code.message) note(`validation.${kind}[${JSON.stringify(value)}].message`, canvas.message, code.message);
    }
  };
  await replay("duration", durationInput, durMsg, ref.panel.validation.durations);
  await durationInput.fill("7");
  await replay("rate", rateInput, rateMsg, ref.panel.validation.rates);
  await ui(page).getByTestId("pcf_but_Admin_MilestoneAssumption_Form_Buttons_Cancel").click();
  await ui(page).getByRole("alertdialog").getByRole("button", { name: "Discard" }).click();

  // Every difference must be known, and every known one must still occur.
  const unexpected = Object.keys(found).filter((k) => !(k in KNOWN)).map((k) => `${k}: ${found[k]}`);
  const stale = Object.keys(KNOWN).filter((k) => !(k in found));
  for (const k of Object.keys(found).filter((k) => k in KNOWN)) test.info().annotations.push({ type: "known-difference", description: `${k}: ${found[k]} (${KNOWN[k]})` });
  expect(unexpected, "differences from the Canvas run that nobody has explained").toEqual([]);
  expect(stale, "known differences that no longer occur (remove them from KNOWN)").toEqual([]);
});
