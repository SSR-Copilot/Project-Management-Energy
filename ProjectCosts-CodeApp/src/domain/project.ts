/**
 * Project choice sets, and the decoration the overview grid hangs off them.
 *
 * Every integer here was read out of `src/generated/models/Vsb_projectsModel.ts`, which
 * `pac code add-data-source` produced from the live environment — not inferred from a label.
 *
 * The decoration logic is ported from the skeleton's `src/domain/approval.ts` and checked
 * line-for-line against the canvas source it came from: the three parallel `Switch`es on
 * `Text('Approval States')` in
 * `Project Main Screen.pa.yaml` → `psf_MainScreen_DetailList_Container_FluentDetailsList.Items`
 * (`loc_iconstate`, `loc_statetag`, `loc_iconcolor`). The canvas mapping is reproduced exactly.
 */
import { palette } from "@/theme/tokens";

/** `vsb_approvalstates`. */
export const APPROVAL_STATE = {
  draft: 952850000,
  approving: 952850001,
  approved: 952850002,
  rejected: 952850003,
  canceled: 952850004,
} as const;
export type ApprovalState = (typeof APPROVAL_STATE)[keyof typeof APPROVAL_STATE];

/** `vsb_technology`. */
export const TECHNOLOGY = {
  wind: 952850000,
  pv: 952850001,
  hybrid: 952850002,
  bess: 952850003,
  hydrogen: 952850004,
  hydro: 952850005,
  substation: 952850006,
} as const;

export const TECHNOLOGY_LABEL: Record<number, string> = {
  [TECHNOLOGY.wind]: "Wind",
  [TECHNOLOGY.pv]: "PV",
  [TECHNOLOGY.hybrid]: "Hybrid",
  [TECHNOLOGY.bess]: "BESS",
  [TECHNOLOGY.hydrogen]: "Hydrogen",
  [TECHNOLOGY.hydro]: "Hydro",
  [TECHNOLOGY.substation]: "Substation",
};

const LABEL_TO_TECHNOLOGY = new Map(
  Object.entries(TECHNOLOGY_LABEL).map(([v, label]) => [label.toLowerCase(), Number(v)]),
);

/**
 * Accepts the option-set integer, the same integer as a string (which is how it arrives on a
 * URL search parameter), or the label. Returns null for anything else — never throws, because
 * a hand-edited link must render the default list rather than an error boundary.
 */
export function technologyValue(v: unknown): number | null {
  if (typeof v === "number") return TECHNOLOGY_LABEL[v] === undefined ? null : v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (Number.isFinite(n) && TECHNOLOGY_LABEL[n] !== undefined) return n;
    return LABEL_TO_TECHNOLOGY.get(trimmed.toLowerCase()) ?? null;
  }
  return null;
}

/**
 * Prefers the row's own Dataverse FormattedValue, because that is what the environment's own
 * localisation produced; falls back to the transcribed map. Never returns the raw integer —
 * a cell reading "952850000" is the bug this exists to prevent.
 */
export function technologyLabel(v: unknown, formatted?: unknown): string {
  if (typeof formatted === "string" && formatted !== "") return formatted;
  const n = technologyValue(v);
  return n === null ? "" : TECHNOLOGY_LABEL[n] ?? "";
}

/* ══════════════════════════════════════════════════ approval decoration ══ */

/** Glyph tokens, not React elements, so this module stays free of Fluent and testable. */
export type ApprovalIconToken = "circle" | "clock" | "check" | "dismiss" | "prohibited";

export interface ApprovalDecoration {
  /** What `Text('Approval States')` renders. */
  label: string;
  /** The canvas `loc_statetag` string, verbatim — note `inreview`, not `approving`. */
  tag: "draft" | "inreview" | "approved" | "rejected" | "canceled" | "unknown";
  icon: ApprovalIconToken;
  color: string;
}

/**
 * The canvas `Switch`es, transcribed:
 *   Draft     → icon:StatusCircleOuter · draft    · akzent2
 *   Approving → icon:AwayStatus        · inreview · akzent4
 *   Approved  → icon:SkypeCircleCheck  · approved · akzent3
 *   Rejected  → icon:StatusErrorFull   · rejected · akzent5
 *   Canceled  → icon:Cancel            · canceled · akzent4
 */
const DECORATION: Record<number, ApprovalDecoration> = {
  [APPROVAL_STATE.draft]: {
    label: "Draft", tag: "draft", icon: "circle", color: palette.akzent2,
  },
  [APPROVAL_STATE.approving]: {
    label: "Approving", tag: "inreview", icon: "clock", color: palette.akzent4,
  },
  [APPROVAL_STATE.approved]: {
    label: "Approved", tag: "approved", icon: "check", color: palette.akzent3,
  },
  [APPROVAL_STATE.rejected]: {
    label: "Rejected", tag: "rejected", icon: "dismiss", color: palette.akzent5,
  },
  [APPROVAL_STATE.canceled]: {
    // Canceled shares akzent4 with Approving in the canvas source. Reproduced, not corrected.
    label: "Canceled", tag: "canceled", icon: "prohibited", color: palette.akzent4,
  },
};

const UNKNOWN: ApprovalDecoration = {
  label: "", tag: "unknown", icon: "circle", color: palette.Grayscale20,
};

/**
 * A blank approval state is normal on a freshly created project, so this degrades to a
 * neutral decoration rather than throwing. The canvas `Switch` had no default branch and
 * therefore produced `Blank()` here, which rendered as no icon at all.
 */
export function approvalDecoration(state: number | null | undefined): ApprovalDecoration {
  if (state === null || state === undefined) return UNKNOWN;
  return DECORATION[state] ?? UNKNOWN;
}

/**
 * The 4 px left accent bar on each grid row.
 *
 * `Approval States`.draft is itself labelled "Draft", so keying on the approval state alone
 * reproduces the teal / green / red the screenshots show. `clusterStateName` is a fallback
 * for rows carrying no approval state, where the cluster label is the only signal.
 */
export function rowAccentColor(
  state: number | null | undefined,
  clusterStateName?: string | null,
): string | undefined {
  if (state !== null && state !== undefined && DECORATION[state]) return DECORATION[state].color;
  if (clusterStateName && ACCENT_BY_CLUSTER[clusterStateName]) {
    return ACCENT_BY_CLUSTER[clusterStateName];
  }
  return undefined;
}

const ACCENT_BY_CLUSTER: Record<string, string> = {
  Draft: palette.akzent2,
  Abandoned: palette.Grayscale10,
  "Inactive/ On-hold": palette.Grayscale10,
};
