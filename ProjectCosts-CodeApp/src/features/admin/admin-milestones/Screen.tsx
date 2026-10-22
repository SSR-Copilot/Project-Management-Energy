/**
 * Application Settings — Milestones. Replaces the canvas 'Admin Milestones Screen'.
 *
 * Standard milestone assumptions per Country × Technology: average cluster durations (months)
 * and cluster success rates, used by project screens as default milestone timings.
 *
 * Composition only: rules in `./rules.ts`, queries in `./hooks.ts`, Dataverse I/O in
 * `@/data/adminMilestones.ts`.
 *
 * Route `/admin/milestones`: rendered inside the shell and admin nav, with the in-page h1;
 * writes are per-row (`saveMilestonePatches`, no bulk services).
 *
 * Admin gate: `useAdminAccess` (canvas `Or(IsApplicationAdministrator, IsControllerOwnData)`,
 * with the local-run bypass). A non-admin sees the grid, but Edit is disabled and a save is
 * refused. Client-side only; Dataverse privileges are the real control.
 *
 * Not built, by decision: Apply, Apply All and the "currently recalculating" indicator —
 * disabled/dead in the canvas, and their tables have no generated service.
 */
import { useCallback, useMemo, useState } from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import {
  CommandBar, InlineEmpty, LoadingOverlay, NoticeBar, QueryStates, SettingsAccordion, useNotify,
  useBeforeUnload, useQueryHealth,
} from "@/components";
import { useAdminAccess } from "@/app/useCurrentUser";
import { usePanelState } from "@/features/shared/usePanelState";
import { localeInfo } from "@/domain/locale";
import { userReason } from "@/platform/userMessage";
import type { MilestoneCountry } from "@/data/adminMilestones";
import { palette } from "@/theme/tokens";
import { MSG, TYPOGRAPHY } from "./constants";
import {
  duplicatesWarning, evaluatePanel, groupAssumptions, saveFailureMessage, sortCountries,
  toMilestoneCountries, type Draft, type TechnologyGroup,
} from "./rules";
import { useMilestoneAssumptions, useMilestoneCountries, useSaveMilestones } from "./hooks";
import { AssumptionsMatrix } from "./AssumptionsMatrix";
import { EditMilestonesPanel } from "./EditMilestonesPanel";

const useStyles = makeStyles({
  page: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM,
    paddingTop: "15px", paddingLeft: "10px", paddingRight: "10px", paddingBottom: tokens.spacingVerticalXL,
    backgroundColor: palette.white, minHeight: "100%", boxSizing: "border-box",
  },
  /** Master's admin page heading (as the other master admin screens). */
  title: { fontSize: "20px", lineHeight: "28px", fontWeight: tokens.fontWeightSemibold, margin: 0 },
  /** Canvas Medium, `FontWeight.Normal`, black (AMS:814, 822-824, 833). */
  countryName: { ...TYPOGRAPHY.countryName },
  /** The section's stack; its padding is the shared accordion's `panelPadding` (10/10/12). */
  details: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
});

/** The accordion's 10 / 10 / 12 px panel padding (canvas parity). */
const PANEL_PADDING = { left: 10, top: 10, bottom: 12 } as const;

/**
 * The reason sentence after a canvas prefix: the shared permission wording, else the shared
 * hint for the failure. Never raw SDK / server text.
 */
const reasonOf = (error: unknown): string => userReason(error, MSG.permissionAction);

/** The open editor: the edited country itself (so it survives a refetch) and the user's typed text. */
interface EditPanel { country: MilestoneCountry; draft: Draft }
const EMPTY_DRAFT: Draft = {};

export default function MilestonesSettingsScreen() {
  const styles = useStyles();
  const notify = useNotify();
  const canEdit = useAdminAccess();
  const locale = useMemo(() => localeInfo().tag, []);

  const countriesQuery = useMilestoneCountries();
  const assumptionsQuery = useMilestoneAssumptions();
  const save = useSaveMilestones();
  /*
   * In TanStack Query v5 a failed REFETCH sets `error` but keeps `data`. Only a query with
   * nothing to show is fatal; a failed background refresh keeps the list and shows an
   * out-of-date warning with Retry.
   */
  const health = useQueryHealth([countriesQuery, assumptionsQuery]);

  /** Every section starts collapsed on every visit (AMS:37). */
  const [openItems, setOpenItems] = useState<string[]>([]);
  /*
   * The edited country itself, not just its id: if a refetched country list no longer
   * contains it (e.g. it was deactivated), the panel and the draft stay instead of vanishing.
   */
  const {
    panel: editPanel, open: openPanel, patch: patchPanel, close: closePanel,
    error: panelError, setError: setPanelError,
  } = usePanelState<EditPanel>();
  const [preparing, setPreparing] = useState(false);
  /**
   * Why Edit could not open: an inline page message that stays until dismissed or the next
   * Edit. A save success is a toast (`useNotify`).
   */
  const [editError, setEditError] = useState<string | null>(null);

  const countries = useMemo(
    () => sortCountries(toMilestoneCountries(countriesQuery.data ?? [])),
    [countriesQuery.data],
  );
  const grouped = useMemo(() => groupAssumptions(assumptionsQuery.data ?? []), [assumptionsQuery.data]);
  const editCountry = editPanel?.country ?? null;
  const editCountryId = editCountry?.id;
  const draft = editPanel?.draft ?? EMPTY_DRAFT;
  const editGroups = useMemo<TechnologyGroup[]>(
    () => (editCountryId ? grouped.get(editCountryId) ?? [] : []),
    [editCountryId, grouped],
  );
  const panel = useMemo(() => evaluatePanel(editGroups, draft, locale), [editGroups, draft, locale]);
  const panelOpen = editCountry !== null;

  // Unsaved-changes guard for a reload or tab close while a draft is open.
  useBeforeUnload(panelOpen && panel.touched);

  /**
   * Refetch so the editor starts from current values, then open. If the refetch fails the
   * panel is NOT opened on the stale cache; the page says why instead.
   * Cancel / ✕ / Escape on a dirty draft confirm first (`FormPanel`), then `closePanel`
   * drops the draft and the save error.
   */
  const openEdit = useCallback(async (country: MilestoneCountry) => {
    setEditError(null);
    setPreparing(true);
    let failed: unknown;
    try {
      const result = await assumptionsQuery.refetch();
      if (result.isError) failed = result.error;
    } catch (error) {
      failed = error;
    } finally {
      setPreparing(false);
    }
    if (failed !== undefined) {
      setEditError(`${MSG.editRefetchFailed} ${reasonOf(failed)}`);
      return;
    }
    openPanel({ country, draft: {} });
  }, [assumptionsQuery, openPanel]);

  const onSave = useCallback(async () => {
    if (!canEdit) {
      setPanelError(MSG.noPermission);
      return;
    }
    if (!panel.canSave) return;
    setPanelError(undefined);
    let outcome;
    try {
      outcome = await save.mutateAsync(panel.patches);
    } catch (error) {
      setPanelError(`${MSG.saveFailed} ${reasonOf(error)}`);
      return;
    }
    if (outcome.failed.length === 0) {
      closePanel();
      notify.success(MSG.saved);
      return;
    }
    // Panel and draft stay; saved rows now equal their stored values and read as untouched.
    setPanelError(saveFailureMessage(
      outcome.saved,
      outcome.failed.map((f) => ({ patch: f.patch, reason: reasonOf(f.error) })),
    ));
  }, [canEdit, panel.canSave, panel.patches, save, closePanel, setPanelError, notify]);

  const toggleSection = useCallback((id: string) => {
    setOpenItems((open) => (open.includes(id) ? open.filter((x) => x !== id) : [...open, id]));
  }, []);

  return (
    <div className={styles.page}>
      {/*
        Master port: master's shell header is not a heading, and every master admin screen names
        itself with an in-page h1 (canvas `cmp_Admin_Milestones_Header`, `Project.Name`).
      */}
      <Text as="h1" className={styles.title}>{MSG.title}</Text>
      {editError ? (
        <NoticeBar intent="error" alert onDismiss={() => setEditError(null)}>{editError}</NoticeBar>
      ) : null}
      {health.phase === "ready" && health.staleError ? (
        <NoticeBar intent="warning" action={{ label: "Retry", onClick: health.retryFailed }}>
          {MSG.staleData} {reasonOf(health.staleError)}
        </NoticeBar>
      ) : null}
      <QueryStates
        health={health}
        loadingLabel="Loading milestone assumptions…"
        fatal={{ title: "Milestone assumptions could not be loaded", text: reasonOf, retry: "all" }}
        empty={{
          when: countries.length === 0,
          title: "No countries found",
          description: "There are no active countries to show milestone assumptions for.",
        }}
      >
        {() => (
          <SettingsAccordion
            variant="light"
            border="always"
            panelPadding={PANEL_PADDING}
            openItems={openItems}
            onToggle={toggleSection}
            items={countries.map((country) => {
              const groups = grouped.get(country.id) ?? [];
              const duplicates = duplicatesWarning(groups);
              return {
                id: country.id,
                testId: `con_Main_MilestonesStandardAssumptions-${country.id}`,
                title: <Text className={styles.countryName}>{country.name}</Text>,
                content: (
                  <div className={styles.details}>
                    <CommandBar
                      ariaLabel={`${country.name} actions`}
                      testIdPrefix={`milestones-command-${country.id}`}
                      commands={[{ key: "edit", label: "Edit", icon: "Edit", enabled: canEdit && groups.length > 0 && !preparing }]}
                      onCommand={() => { if (canEdit) void openEdit(country); }}
                    />
                    {duplicates ? <NoticeBar intent="warning">{duplicates}</NoticeBar> : null}
                    {groups.length > 0 ? (
                      <AssumptionsMatrix countryName={country.name} groups={groups} locale={locale} />
                    ) : (
                      <InlineEmpty>No milestone assumptions are stored for {country.name}.</InlineEmpty>
                    )}
                  </div>
                ),
              };
            })}
          />
        )}
      </QueryStates>

      <EditMilestonesPanel
        open={panelOpen}
        countryName={editCountry?.name ?? ""}
        state={panel}
        canEdit={canEdit}
        saving={save.isPending}
        error={panelError}
        duplicates={duplicatesWarning(editGroups)}
        onChange={(key, text) => patchPanel((p) => ({ ...p, draft: { ...p.draft, [key]: text } }))}
        onSave={() => { void onSave(); }}
        onClose={closePanel}
      />

      {/*
        Portalled (`portal`) so the fixed scrim joins the body-level stacking
        order AFTER the Drawer's own portal and covers it, whatever stacking contexts the shell creates.
      */}
      {save.isPending && editCountry ? (
        <LoadingOverlay portal label={MSG.saving(editCountry.name)} />
      ) : null}
      {preparing ? <LoadingOverlay portal label="Loading current values…" /> : null}
    </div>
  );
}
