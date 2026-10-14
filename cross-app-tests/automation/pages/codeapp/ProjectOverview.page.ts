import type { FrameLocator, Page } from "@playwright/test";
import { resolveAppFrame } from "../../fixtures/app-frame";

/** Project Overview — `ProjectCosts-CodeApp/app/src/features/project-overview/Screen.tsx`. */
export class ProjectOverviewPage {
  private app?: FrameLocator;

  constructor(private readonly page: Page) {}

  private async frame(): Promise<FrameLocator> {
    this.app ??= await resolveAppFrame(this.page);
    return this.app;
  }

  async searchByName(name: string): Promise<void> {
    const app = await this.frame();
    await app.getByPlaceholder(/Search for Project Name/i).fill(name);
  }

  /** Reads the GUID off a filtered row's own `data-testid="select-<id>"` attribute. */
  async firstMatchingProjectId(): Promise<string | undefined> {
    const app = await this.frame();
    const testId = await app.locator('[data-testid^="select-"]').first().getAttribute("data-testid");
    return testId?.replace("select-", "");
  }

  async openEditCosts(): Promise<void> {
    const app = await this.frame();
    await app.getByTestId("command-editCosts").click();
  }

  watchForErrors(onError: (message: string) => void): void {
    this.page.on("pageerror", (err) => onError(`pageerror: ${err.message}`));
    this.page.on("console", (msg) => {
      if (msg.type() === "error") onError(`console.error: ${msg.text()}`);
    });
  }
}
