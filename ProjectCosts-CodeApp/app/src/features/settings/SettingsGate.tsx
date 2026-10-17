/**
 * Gate for every Application Settings route.
 *
 * The canvas hides the header item and every `LeftAdminNavigationMenu` entry unless
 * `Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)`. A URL
 * can be typed, so the same rule guards the routes themselves. Dataverse still enforces table
 * privileges on every write; this only decides what is shown.
 *
 * Three outcomes, never confused with each other:
 *   - still loading           → "Checking access…" (no flash of the denial);
 *   - roles could not be read → say so, offer Retry (the canvas only `Trace`d, App:962-965) —
 *     except when the session has no user object id, where Retry cannot help (NG-3);
 *   - roles read, no admin    → the denial.
 * A user whose admin role WAS read gets in even if another role read failed (fail-closed only for
 * what could not be read — 05-gap-analysis A1).
 */
import { useEffect } from "react";
import { Button, makeStyles } from "@fluentui/react-components";
import { Outlet, useNavigate } from "react-router-dom";
import { EmptyState, LoadingOverlay } from "@/components";
import { useCurrentUser } from "@/app/useCurrentUser";
import { useSession } from "@/app/SessionContext";
import { canOpenApplicationSettings } from "@/data/currentUser";
import { trace } from "@/platform/telemetry";
import { space } from "@/theme/tokens";

const useStyles = makeStyles({
  actions: { display: "flex", gap: space.s, flexWrap: "wrap", justifyContent: "center" },
});

export const ROLES_UNREADABLE_TITLE = "Your security roles could not be read";

export function SettingsGate() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { session } = useSession();
  const noObjectId = !session?.entraObjectId;
  const currentUser = useCurrentUser();
  const allowed = canOpenApplicationSettings(currentUser.data);
  /*
   * No data at all also counts as unreadable (parity round 1, G-3): with no `entraObjectId` the
   * query is disabled, so it is neither loading nor in error — that is "could not read", not "no".
   */
  const unreadable = !allowed && !currentUser.isLoading
    && (currentUser.isError || currentUser.data === undefined || currentUser.data.rolesResolved === false);

  useEffect(() => {
    if (unreadable) {
      trace("warning", "Application Settings: access could not be checked because the security roles could not be read");
    }
  }, [unreadable]);

  if (currentUser.isLoading) return <LoadingOverlay mode="inline" label="Checking access…" />;
  if (allowed) return <Outlet />;

  const backToProjects = () => navigate("/projects");
  if (unreadable && noObjectId) {
    /*
     * Parity round 2, NG-3: the missing id lives in the session, not in the user query, so a
     * Retry (`refetch`) could never succeed. Only reopening the app re-reads the session.
     */
    return (
      <EmptyState
        title={ROLES_UNREADABLE_TITLE}
        description="Application Settings could not identify your user account, so it could not check whether you hold an Application Administrator or Controller role. Close and reopen the app, or go back to Projects."
        action={{ label: "Back to Projects", onClick: backToProjects }}
      />
    );
  }
  if (unreadable) {
    return (
      <EmptyState
        title={ROLES_UNREADABLE_TITLE}
        description="Application Settings could not check whether you hold an Application Administrator or Controller role. Try again, or go back to Projects."
      >
        <div className={styles.actions}>
          <Button
            appearance="primary"
            disabled={currentUser.isFetching}
            onClick={() => void currentUser.refetch()}
          >
            {currentUser.isFetching ? "Checking…" : "Retry"}
          </Button>
          <Button onClick={backToProjects}>Back to Projects</Button>
        </div>
      </EmptyState>
    );
  }
  return (
    <EmptyState
      title="Application Settings are not available"
      description="Only Application Administrators and Controllers can open Application Settings."
      action={{ label: "Back to Projects", onClick: backToProjects }}
    />
  );
}
