import type { ReactNode } from "react";
import { makeStyles, tokens, Text, Button } from "@fluentui/react-components";
import { space } from "@/theme/tokens";

const useStyles = makeStyles({
  root: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: space.s, padding: space.xxxl, textAlign: "center",
    color: tokens.colorNeutralForeground3, minHeight: "220px",
  },
  title: { fontSize: "15px", fontWeight: 600, color: tokens.colorNeutralForeground1 },
  body: { maxWidth: "48ch" },
});

export function EmptyState({
  title, description, action, icon,
}: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  const s = useStyles();
  return (
    <div className={s.root}>
      {icon}
      <span className={s.title}>{title}</span>
      {description && <Text className={s.body} size={200}>{description}</Text>}
      {action}
    </div>
  );
}

export function SelectProjectPrompt({ onGo }: { onGo: () => void }) {
  return (
    <EmptyState
      title="No project selected"
      description="This screen works on one project at a time. Pick a project from the portfolio to continue."
      action={<Button appearance="primary" onClick={onGo}>Go to projects</Button>}
    />
  );
}
