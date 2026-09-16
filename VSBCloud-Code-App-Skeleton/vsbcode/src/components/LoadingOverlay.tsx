/**
 * Replaces `cmp_PopUp_Loading`, `cmp_PopUp_Loading_1` (Cost) — three canvas popups
 * collapse into one component. The canvas default text is "Please wait...".
 */
import { makeStyles, tokens, Spinner } from "@fluentui/react-components";
import { space } from "@/theme/tokens";

const useStyles = makeStyles({
  overlay: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    backgroundColor: tokens.colorNeutralBackgroundAlpha2,
    backdropFilter: "blur(1px)",
    zIndex: 10,
  },
  inline: { display: "grid", placeItems: "center", padding: space.xxxl, minHeight: "180px" },
  card: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: space.m,
    padding: `${space.xl} ${space.xxl}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    borderRadius: tokens.borderRadiusMedium,
  },
});

export function LoadingOverlay({
  label = "Please wait...", mode = "overlay",
}: { label?: string; mode?: "overlay" | "inline" }) {
  const s = useStyles();
  const body = (
    <div className={s.card} role="status" aria-live="polite">
      <Spinner size="large" />
      <span>{label}</span>
    </div>
  );
  return <div className={mode === "overlay" ? s.overlay : s.inline}>{body}</div>;
}
