/**
 * TC-OV-000 — see cross-app-tests/test-cases/overview/TC-OV-000-deep-link-behaviour.md
 *
 * Phase 0 diagnostic, not a parity test: proves auth + frame-targeting work, and records
 * (rather than asserts a presumed answer for) each canvas app's deep-link behaviour.
 */
import { test, expect } from "../../fixtures/cross-app.fixture";
import { canvasPmBaseUrl, canvasCostsBaseUrl, canvasPmUrl, canvasCostsUrl } from "../../fixtures/canvas-urls";
import { CanvasLandingPage } from "../../pages/canvas/CanvasLanding.page";
import { ProjectOverviewPage } from "../../pages/codeapp/ProjectOverview.page";

test.describe("TC-OV-000 — Phase 0 smoke: auth, frame-targeting, deep links", () => {
  test("code app renders the Project Overview with no errors", async ({ codeAppPage, project }) => {
    const errors: string[] = [];
    const overview = new ProjectOverviewPage(codeAppPage);
    overview.watchForErrors((e) => errors.push(e));

    // `project` fixture already navigated here once to resolve the GUID; re-assert cleanly.
    await overview.searchByName(project.name);
    const resolvedId = await overview.firstMatchingProjectId();

    expect(resolvedId, "project should resolve to a GUID via the search box").toBe(project.projectId);
    expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("canvas PM app renders with no errors (bare URL)", async ({ pmPage }) => {
    const errors: string[] = [];
    const landing = new CanvasLandingPage(pmPage);
    landing.watchForErrors((e) => errors.push(e));

    await pmPage.goto(canvasPmBaseUrl());
    await landing.waitForRender();

    expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("canvas Project Costs app renders with no errors (bare URL)", async ({ costsPage }) => {
    const errors: string[] = [];
    const landing = new CanvasLandingPage(costsPage);
    landing.watchForErrors((e) => errors.push(e));

    await costsPage.goto(canvasCostsBaseUrl());
    await landing.waitForRender();

    expect(errors, `console/page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("records (does not assert) deep-link behaviour for both canvas apps", async ({
    pmPage,
    costsPage,
    project,
  }) => {
    // This test intentionally has no pass/fail opinion on WHICH behaviour is correct — it
    // exists to produce the finding TC-OV-000.md asks you to fill in by hand afterward.
    await pmPage.goto(canvasPmUrl(project.projectId));
    await new CanvasLandingPage(pmPage).waitForRender();
    // eslint-disable-next-line no-console -- deliberate: this is the Phase 0 finding output
    console.log(`[TC-OV-000] PM canvas app after deep link, landed at: ${pmPage.url()}`);

    await costsPage.goto(canvasCostsUrl(project.projectId));
    await new CanvasLandingPage(costsPage).waitForRender();
    console.log(
      `[TC-OV-000] Costs canvas app after deep link, landed at: ${costsPage.url()}`,
    );
  });
});
