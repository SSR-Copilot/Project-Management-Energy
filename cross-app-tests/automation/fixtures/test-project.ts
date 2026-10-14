import type { Page } from "@playwright/test";
import { resolveAppFrame } from "./app-frame";
import { codeAppBaseUrl } from "./canvas-urls";

/**
 * Dynamic project resolution — TEST-STRATEGY.md §9. No test hardcodes a project GUID; every
 * test resolves one by NAME at the start of the run, so any project that exists in
 * VSBCloud_Dev works, and switching the target project is a one-line override.
 */
export const DEFAULT_PROJECT_NAME =
  process.env.TEST_PROJECT_NAME ?? "Revenue Individual Hedge Volume";

export interface TestProject {
  projectId: string;
  name: string;
}

/**
 * Resolves `name` to its Dataverse GUID via the code app's own Project Overview search —
 * already-built, already-tested functionality, so this adds no new query surface to
 * maintain. Reads the GUID off the row's own `data-testid="select-<id>"` attribute (see
 * `ProjectCosts-CodeApp/app/src/features/project-overview/Screen.tsx` and its own test file,
 * which already relies on this exact attribute shape).
 */
export async function resolveTestProject(
  page: Page,
  name: string = DEFAULT_PROJECT_NAME,
): Promise<TestProject> {
  await page.goto(codeAppBaseUrl());
  const app = await resolveAppFrame(page);

  const searchBox = app.getByPlaceholder(/Search for Project Name/i);
  await searchBox.fill(name);

  // Wait for the filtered grid to settle on a row naming this project before reading its id.
  await app.getByText(name, { exact: false }).first().waitFor();

  const selectControl = app.locator('[data-testid^="select-"]').first();
  const testId = await selectControl.getAttribute("data-testid");
  const projectId = testId?.replace("select-", "");

  if (!projectId) {
    throw new Error(
      `Could not resolve project "${name}" to a GUID — no row with a "select-" test id ` +
        "was found after filtering. Confirm the project name exists in VSBCloud_Dev and " +
        "that the search placeholder text still matches " +
        '/Search for Project Name/i (it may have changed if the screen was edited).',
    );
  }

  return { projectId, name };
}
