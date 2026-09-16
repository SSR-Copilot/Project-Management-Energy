/**
 * RecordFooter — NEW component. The fixed bottom bar every project record editor carries.
 *
 * The step-by-step guide shows it identically on General and on Milestones, and it is the
 * one piece of chrome the earlier build inferred wrongly: it is not a right-aligned pair of
 * buttons. Reading left to right it is
 *
 *     [ ⓘ Required fields ]              [ Created By: … ]  [ Cancel ]  [ Save ]
 *                                        [ Modified By: … ]
 *
 * with three behaviours worth stating because a rebuild gets them wrong by default:
 *
 *  1. **Save is disabled until the form is valid**, and stays disabled when a freshly loaded
 *     record has no pending edits (p14: the record is saved, Save is grey).
 *  2. **Cancel is always enabled** — in the canvas it is a local reset, never a navigation.
 *  3. **Created By / Modified By read `..` before the first save** and only then fill in with
 *     the user and the timestamp (p10 vs p14). They are audit output, not fields.
 *
 * "Required fields" is a legend for the red asterisks, not a validation message, so it is
 * always present regardless of state.
 */
import { makeStyles, tokens, Button, Tooltip } from "@fluentui/react-components";
import {
  CheckmarkRegular,
  DismissRegular,
  InfoRegular,
} from "@fluentui/react-icons";
import { space, media, semantic } from "@/theme/tokens";

export interface RecordFooterProps {
  onSave: () => void;
  onCancel: () => void;
  saveDisabled?: boolean;
  cancelDisabled?: boolean;
  busy?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  /** Why Save is unavailable — surfaced as a tooltip rather than a silently dead button. */
  saveDisabledReason?: string;
  /** Pre-formatted, e.g. "Shakti Singh Rajput  03.09.2026 10:49". Absent renders "..". */
  createdBy?: string | null;
  modifiedBy?: string | null;
  requiredLegend?: string;
}

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.m,
    flexWrap: "wrap",
    width: "100%",
    minWidth: 0,
    paddingBlock: space.s,
    paddingInline: space.l,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  legend: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    fontSize: "12px",
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },
  legendIcon: { color: semantic.errorText, display: "grid", placeItems: "center" },
  right: { display: "flex", alignItems: "center", gap: space.m, flexWrap: "wrap", minWidth: 0 },
  audit: {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    fontSize: "11px",
    color: tokens.colorNeutralForeground3,
    fontVariantNumeric: "tabular-nums",
    [media.belowMd]: { display: "none" },
  },
  actions: { display: "flex", alignItems: "center", gap: space.s },
});

export function RecordFooter({
  onSave,
  onCancel,
  saveDisabled = false,
  cancelDisabled = false,
  busy = false,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  saveDisabledReason,
  createdBy,
  modifiedBy,
  requiredLegend = "Required fields",
}: RecordFooterProps) {
  const s = useStyles();

  const save = (
    <Button
      appearance="primary"
      icon={<CheckmarkRegular />}
      disabled={saveDisabled || busy}
      onClick={onSave}
    >
      {saveLabel}
    </Button>
  );

  return (
    <div className={s.root}>
      <span className={s.legend}>
        <span className={s.legendIcon} aria-hidden="true">
          <InfoRegular />
        </span>
        {requiredLegend}
      </span>

      <div className={s.right}>
        <div className={s.audit}>
          <span>Created By: {createdBy ?? ".."}</span>
          <span>Modified By: {modifiedBy ?? ".."}</span>
        </div>

        <div className={s.actions}>
          <Button
            appearance="outline"
            icon={<DismissRegular />}
            disabled={cancelDisabled || busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>

          {saveDisabled && saveDisabledReason ? (
            <Tooltip content={saveDisabledReason} relationship="label" withArrow>
              <span>{save}</span>
            </Tooltip>
          ) : (
            save
          )}
        </div>
      </div>
    </div>
  );
}
