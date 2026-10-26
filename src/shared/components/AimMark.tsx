/**
 * AimMark: the KreweAIM (AI Mastery) fleur de lis, pinned to the corner of an
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

/** The Krewe Suite fleur de lis, drawn in the current text color. */
export function Fleur({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M16 2c1.5 3 4 5.5 4 8.5 0 2-1 3.5-2.5 4.5l3.5 2c2.5-1 5-0.5 7 1-2.5 0.5-4.5 2-5.5 4l-2-3.5c0.5 2 0 4.5-1.5 6.5 0-3-1.5-5.5-3-7-1.5 1.5-3 4-3 7-1.5-2-2-4.5-1.5-6.5l-2 3.5c-1-2-3-3.5-5.5-4 2-1.5 4.5-2 7-1l3.5-2C12 14 11 12.5 11 10.5 11 7.5 13.5 5 16 2z" />
    </svg>
  );
}

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
          style={{ width: dim, height: dim }}
        >
          <Fleur size={Math.round(dim * 0.72)} />
        </span>
      </Tooltip>
    </span>
  );
}
