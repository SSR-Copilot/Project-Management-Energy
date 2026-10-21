/**
 * Project General Data — NOT YET IMPLEMENTED.
 *
 * Canvas screen: `Project General Data Screen.pa.yaml` in the Project Management app. This is
 * screen **#9** in `migration-plans/README.md`'s build order and it is the next one to build;
 * nothing in this file is a migration of it.
 *
 * **Why a placeholder exists at all.** `CONVENTIONS.md` says not to ship placeholders, and
 * that rule is right. It is suspended here deliberately and only for these two routes, because
 * General Data is the destination of the Main Project Overview's `Add Project` and
 * `Edit Project` commands — the app's ONLY project-creation path — and the alternative was to
 * leave the two commands dead. Opening this screen is therefore a real navigation to a real
 * route that says, accurately, that the screen is not built. It does not pretend to be a form,
 * it reads nothing from Dataverse, and it writes nothing.
 *
 * **What replacing it involves** — this is the whole reason it is not done in passing:
 *   - the real create, `Patch(Projects, If(IsBlank(record), Defaults(Projects), record), {…})`,
 *     with `'Approval States'` defaulting to Draft, `'Cluster State'` to the "Draft" row,
 *     `'Share of Farmdown'` to 50, and `'Start Cluster'` branching on the development type;
 *   - the SECOND patch that copies the server-generated autonumber `'Project ID'` into
 *     `'Internal Project ID'` — which is what the overview grid's "Project ID" column shows;
 *   - the owning-business-unit write every `projectData` table needs (`CONVENTIONS.md` rule 6),
 *     taken from the chosen country, not from the caller;
 *   - gate approvals, which depend on screen #4.
 *
 * Until then: `/projects/new` and `/projects/:projectId/general` land here.
 */
import { useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "@/components";

export default function GeneralDataScreen() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const creating = projectId === undefined;

  return (
    <EmptyState
      title={creating ? "Creating a project is not available yet" : "Project General Data is not available yet"}
      description={
        creating
          ? "The Project General Data screen, which is where a new project is created, has not been migrated yet. It is the next screen scheduled for build."
          : "The Project General Data screen has not been migrated yet. It is the next screen scheduled for build. Costs for this project can be opened from the project list."
      }
      action={{ label: "Back to Projects", onClick: () => navigate("/projects") }}
    />
  );
}
