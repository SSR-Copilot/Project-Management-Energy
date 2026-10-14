/**
 * Deep-link URL builders for the two canvas apps and the code app.
 *
 * `hint`/`sourcetime` from a Studio-shared link are deliberately dropped — they are
 * ephemeral cache/analytics tokens regenerated on every share, not something a deep link
 * needs to function. This mirrors the shape `projectManagementAppUrl`/`analyticsAppUrl` in
 * `ProjectCosts-CodeApp/app/src/app/navigation.ts` already build, without those two params.
 *
 * See TEST-STRATEGY.md §9 for the provenance of the two different casings below — confirmed
 * from the canvas `Launch()` calls, not guessed:
 *   PM:    Launch(gblPMAppURL, {projectid: GUID(...)})        — lowercase
 *   Costs: Launch(gblCostAppLaunchUrl, {projectId: GUID(...)}) — capital I
 */

export const ENVIRONMENT_ID = "be41add6-6f60-ebb0-9c73-2480d6bc615d";
export const TENANT_ID = "e3bab30b-3902-4ce6-b575-f005f94c78c1";

const PM_CANVAS_APP_ID = "67054ad6-e70b-4738-a3e6-125384fe2b4b";
const COSTS_CANVAS_APP_ID = "ab3554c5-a4fc-4436-8825-8a84484ec5ea";
const CODE_APP_ID = "807a2fba-665c-40f3-b158-ffe822aa7da4";

const playUrl = (appId: string) =>
  `https://apps.powerapps.com/play/e/${ENVIRONMENT_ID}/a/${appId}?tenantId=${TENANT_ID}`;

/** Bare canvas PM app URL, no project — lands on whatever App.StartScreen is. */
export const canvasPmBaseUrl = (): string => playUrl(PM_CANVAS_APP_ID);

/** Deep-linked canvas PM app URL. Confirm in Phase 0 whether the landing screen honours this. */
export const canvasPmUrl = (projectId: string): string =>
  `${playUrl(PM_CANVAS_APP_ID)}&projectid=${projectId}`;

/** Bare canvas Project Costs app URL, no project. */
export const canvasCostsBaseUrl = (): string => playUrl(COSTS_CANVAS_APP_ID);

/** Deep-linked canvas Project Costs app URL. Confirm in Phase 0, same as above. */
export const canvasCostsUrl = (projectId: string): string =>
  `${playUrl(COSTS_CANVAS_APP_ID)}&projectId=${projectId}`;

/**
 * Code app URL. Note the DIFFERENT path shape (`/app/<id>` not `/a/<id>`) — this is how
 * `pac code push` prints it, and it is what we've been using all session; the two canvas
 * apps above use the classic player's `/a/<id>` shape.
 */
export const codeAppBaseUrl = (): string =>
  `https://apps.powerapps.com/play/e/${ENVIRONMENT_ID}/app/${CODE_APP_ID}?tenantId=${TENANT_ID}`;

/** The code app has no project pre-selected without its own `?projectId=`, same param the
 *  PM canvas app's own "Edit Costs"/"Edit Project" launches use (see navigation.ts). */
export const codeAppUrl = (projectId: string): string =>
  `${codeAppBaseUrl()}&projectId=${projectId}`;
