/**
 * `Approval States` decoration — the three parallel `Switch`es on `Text('Approval States')`
 * that the Project Main Screen's row projection runs (spec rule 15):
 *
 *   icon    Draft -> icon:StatusCircleOuter · Approving -> icon:AwayStatus
 *           Approved -> icon:SkypeCircleCheck · Rejected -> icon:StatusErrorFull
 *           Canceled -> icon:Cancel
 *   tag     draft | inreview | approved | rejected | canceled
 *   colour  akzent2 | akzent4 | akzent3 | akzent5 | akzent4
 *
 * Pure by design: `icon` is a **token**, not a `ReactElement`, so this module stays free of
 * React and can be unit-tested directly. The grid maps token -> Fluent icon at the call site.
 */
import { CHOICE } from "@/data/entities";
import { approvalStateColor, palette } from "@/theme/tokens";

export type ApprovalState = (typeof CHOICE.approvalState)[keyof typeof CHOICE.approvalState];

/** Fluent-agnostic glyph tokens. The canvas icon names are in the block comment above. */
export type ApprovalIconToken = "circle" | "clock" | "check" | "dismiss" | "prohibited";

export interface ApprovalDecoration {
  /** Canonical label, as `Text('Approval States')` renders it. */
  label: string;
  /** Canvas tag string — kept verbatim; note `inreview`, not `approving`. */
  tag: "draft" | "inreview" | "approved" | "rejected" | "canceled" | "unknown";
  icon: ApprovalIconToken;
  color: string;
}

const DECORATION: Record<number, ApprovalDecoration> = {
  [CHOICE.approvalState.notStarted]: {
    label: "Draft",
    tag: "draft",
    icon: "circle",
    color: approvalStateColor[CHOICE.approvalState.notStarted],
  },
  [CHOICE.approvalState.inProgress]: {
    label: "Approving",
    tag: "inreview",
    icon: "clock",
    color: approvalStateColor[CHOICE.approvalState.inProgress],
  },
  [CHOICE.approvalState.approved]: {
    label: "Approved",
    tag: "approved",
    icon: "check",
    color: approvalStateColor[CHOICE.approvalState.approved],
  },
  [CHOICE.approvalState.rejected]: {
    label: "Rejected",
    tag: "rejected",
    icon: "dismiss",
    color: approvalStateColor[CHOICE.approvalState.rejected],
  },
  [CHOICE.approvalState.cancelled]: {
    label: "Canceled",
    tag: "canceled",
    icon: "prohibited",
    color: approvalStateColor[CHOICE.approvalState.cancelled],
  },
};

const UNKNOWN: ApprovalDecoration = {
  label: "",
  tag: "unknown",
  icon: "circle",
  color: palette.Grayscale20,
};

/**
 * Spec rule 15. A blank approval state is normal on a freshly created project, so it
 * degrades to a neutral decoration rather than throwing.
 */
export function approvalDecoration(state: number | null | undefined): ApprovalDecoration {
  if (state === null || state === undefined) return UNKNOWN;
  return DECORATION[state] ?? UNKNOWN;
}

export function approvalLabel(state: number | null | undefined): string {
  return approvalDecoration(state).label;
}

/**
 * The colour for the grid's 4px left accent bar.
 *
 * The screenshot shows teal on rows whose *Status* column reads "Draft", green on Approved
 * and red on Rejected. `Approval States`.notStarted is itself labelled "Draft", so keying on
 * the approval state alone reproduces all three. `clusterState` is accepted as a fallback for
 * rows that carry no approval state at all, where the cluster label is the only signal.
 */
export function rowAccentColor(
  state: number | null | undefined,
  clusterState?: string | null,
): string | undefined {
  if (state !== null && state !== undefined && DECORATION[state]) return DECORATION[state].color;
  if (clusterState && clusterState in ACCENT_BY_CLUSTER) return ACCENT_BY_CLUSTER[clusterState];
  return undefined;
}

const ACCENT_BY_CLUSTER: Record<string, string> = {
  Draft: palette.akzent2,
  Abandoned: palette.Grayscale10,
  "Inactive/ On-hold": palette.Grayscale10,
};
