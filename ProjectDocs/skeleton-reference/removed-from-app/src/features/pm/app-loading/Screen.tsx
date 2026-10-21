/**
 * App Loading Screen (PM StartScreen) — 21 controls, 515 loc, 6 substantive blocks, XS.
 *
 * What the canvas screen does: shows `cmp_PopUp_Loading` while `App.OnStart` finishes and
 * while its own `OnVisible` pre-loads the German and French local-tax assumption tables in
 * 2,000-row batches; a 500 ms `Timer1` polls `gblAppStarted && locLoading` and then fires a
 * hidden button that either deep-links on `Param("projectid")` or falls back to Project Main.
 *
 * DELETED WORKAROUNDS:
 *  - the `ForAll(Sequence(RoundUp(max/2000)))` batching loop existed only to keep `Filter`
 *    delegable. The code app pages with `@odata.nextLink` and does not pre-materialise
 *    those tables at all — General Data queries them on demand.
 *  - `Timer1` + `varStopTimer` are replaced by query state.
 */
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LoadingOverlay } from "@/components";
import { resolveLaunchRoute } from "@/domain/navigation";
import { selectProjectById } from "@/features/shared/useProjectContext";
import { useAppStore } from "@/store/appStore";
import { trace } from "@/platform/telemetry";

export default function AppLoadingScreen() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const clearProject = useAppStore((s) => s.clearProject);

  useEffect(() => {
    let cancelled = false;
    const target = resolveLaunchRoute("pm", params);
    trace("information", "launch", { route: target.route, projectId: target.projectId });

    (async () => {
      if (target.projectId) {
        const record = await selectProjectById(target.projectId);
        if (cancelled) return;
        if (!record) {
          // Deep link to a project the user cannot see, or that no longer exists.
          clearProject();
          nav("/projects", { replace: true });
          return;
        }
      } else {
        clearProject();
      }
      if (!cancelled) nav(target.route, { replace: true });
    })();

    return () => { cancelled = true; };
  }, [params, nav, clearProject]);

  return <LoadingOverlay mode="inline" label="Please wait..." />;
}
