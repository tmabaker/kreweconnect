/**
 * AimMark: the KreweAIM (AI Mastery) infinity mark, pinned to the corner of an
 * Avatar for people assigned the program.
 */

import type { ReactNode } from "react";
import { makeStyles, tokens, Tooltip } from "@fluentui/react-components";

const useStyles = makeStyles({
  wrap: { position: "relative", display: "inline-flex", flexShrink: 0 },
  mark: {
    position: "absolute",
    right: "-4px",
    bottom: "-4px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    border: `2px solid ${tokens.colorNeutralBackground1}`,
    fontWeight: tokens.fontWeightBold,
    lineHeight: 1,
  },
});

const LABEL = "KreweAIM member: AI Mastery program";

export function AimMark({ active, size = 48, children }: { active: boolean; size?: number; children: ReactNode }) {
  const styles = useStyles();
  if (!active) return <>{children}</>;
  const dim = Math.max(16, Math.round(size * 0.42));
  return (
    <span className={styles.wrap}>
      {children}
      <Tooltip content={LABEL} relationship="label" withArrow>
        <span
          className={styles.mark}
          role="img"
          aria-label={LABEL}
          style={{ width: dim, height: dim, fontSize: Math.round(dim * 0.75) }}
        >
          ∞
        </span>
      </Tooltip>
    </span>
  );
}
