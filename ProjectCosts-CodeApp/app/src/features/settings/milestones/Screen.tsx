/**
 * Application Settings — Milestones. Replaces the canvas 'Admin Milestones Screen'.
 *
 * Standard milestone assumptions per Country × Technology: average cluster durations (months)
 * and cluster success rates, used by project screens as default milestone timings.
 *
 * Composition only: rules in `./rules.ts`, queries in `./hooks.ts`, Dataverse I/O in
 * `@/data/settings/milestones.ts`. Requirements and canvas analysis:
 * `codeapp-knowledge-base/screens/application-settings/milestones/` (build log: 07-build-log.md).
 *
 * Not built, by decision (FR-10 default): Apply, Apply All and the "currently recalculating"
 * indicator — disabled/dead in the canvas, and their tables have no generated service.
 */
import { useCallback, useMemo, useState } from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import {
  CommandBar, InlineEmpty, LoadingOverlay, NoticeBar, QueryStates, SettingsAccordion, useNotify,
} from "@/components";
import { useBeforeUnload } from "@/app/unsavedChanges";
import { useQueryHealth } from "@/app/useQueryHealth";
import { usePanelState } from "@/app/usePanelState";
import { localeInfo } from "@/domain/locale";
import { userReason } from "@/platform/userMessage";
import type { MilestoneCountry } from "@/data/settings/milestones";
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
  /** Canvas Medium, `FontWeight.Normal`, black (AMS:814, 822-824, 833; parity R1 GAP-2). */
  countryName: { ...TYPOGRAPHY.countryName },
  /** The section's stack; its padding is the shared accordion's `panelPadding` (10/10/12). */
  details: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
});

/** The accordion's 10 / 10 / 12 px panel padding (canvas parity, unchanged by C8). */
const PANEL_PADDING = { left: 10, top: 10, bottom: 12 } as const;

/**
 * The reason sentence after a canvas prefix: the shared permission wording, else the shared
 * hint for the failure (M11, shared E12). Never raw SDK / server text (gap C9).
 */
const reasonOf = (error: unknown): string => userReason(error, MSG.permissionAction);

/** The open editor: the edited country itself (gap B7) and the user's typed text. */
interface EditPanel { country: MilestoneCountry; draft: Draft }
const EMPTY_DRAFT: Draft = {};

export default function MilestonesSettingsScreen() {
  const styles = useStyles();
  const notify = useNotify();
  const locale = useMemo(() => localeInfo().tag, []);

  const countriesQuery = useMilestoneCountries();
  const assumptionsQuery = useMilestoneAssumptions();
  const save = useSaveMilestones();
  /*
   * Gap C-1 / B1: in TanStack Query v5 a failed REFETCH sets `error` but keeps `data`. Only a
   * query with nothing to show is fatal; a failed background refresh keeps the list and shows
   * an out-of-date warning with Retry (shared H1).
   */
  const health = useQueryHealth([countriesQuery, assumptionsQuery]);

  /** Every section starts collapsed on every visit (FR-2, AMS:37). */
  const [openItems, setOpenItems] = useState<string[]>([]);
  /*
   * The edited country itself, not just its id (gap B7): if a refetched country list no longer
   * contains it (e.g. it was deactivated), the panel and the draft stay instead of vanishing.
   */
  const {
    panel: editPanel, open: openPanel, patch: patchPanel, close: closePanel,
    error: panelError, setError: setPanelError,
  } = usePanelState<EditPanel>();
  const [preparing, setPreparing] = useState(false);
  /**
   * Why Edit could not open (gap C-1 / B2): an inline page message that stays until dismissed
   * or the next Edit. A save success is a toast (`useNotify`, M5).
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

  // Unsaved-changes guard for a reload or tab close while a draft is open (shared M7, gap B6).
  useBeforeUnload(panelOpen && panel.touched);

  /**
   * FR-5 + DR-5: refetch so the editor starts from current values, then open. If the refetch
   * fails the panel is NOT opened on the stale cache (gap B2); the page says why instead.
   * Cancel / ✕ / Escape on a dirty draft confirm first (`FormPanel`, FR-9), then `closePanel`
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
  }, [panel.canSave, panel.patches, save, closePanel, setPanelError, notify]);

  const toggleSection = useCallback((id: string) => {
    setOpenItems((open) => (open.includes(id) ? open.filter((x) => x !== id) : [...open, id]));
  }, []);

  return (
    <div className={styles.page}>
      {/* No in-page h1: the app header shows "Milestones" (shared M1). */}
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
                title: <Text className={styles.countryName}>{country.name}</Text>,
                content: (
                  <div className={styles.details}>
                    <CommandBar
                      ariaLabel={`${country.name} actions`}
                      commands={[{ key: "edit", label: "Edit", icon: "Edit", enabled: groups.length > 0 && !preparing }]}
                      onCommand={() => { void openEdit(country); }}
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
        saving={save.isPending}
        error={panelError}
        duplicates={duplicatesWarning(editGroups)}
        onChange={(key, text) => patchPanel((p) => ({ ...p, draft: { ...p.draft, [key]: text } }))}
        onSave={() => { void onSave(); }}
        onClose={closePanel}
      />

      {/*
        Portalled (gap B8, shared M8 `portal`) so the fixed scrim joins the body-level stacking
        order AFTER the Drawer's own portal and covers it, whatever stacking contexts the shell creates.
      */}
      {save.isPending && editCountry ? (
        <LoadingOverlay portal label={MSG.saving(editCountry.name)} />
      ) : null}
      {preparing ? <LoadingOverlay portal label="Loading current values…" /> : null}
    </div>
  );
}
