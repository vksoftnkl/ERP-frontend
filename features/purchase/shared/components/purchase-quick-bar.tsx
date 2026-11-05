"use client";

/**
 * The quick icon bar under a purchase screen's title — Qt `frameQuick` (the
 * PO's strip, NexERP e782e59; Purchase Entry's P1 row, dd59c2c): icon-only
 * buttons, each with its tooltip, the key that does the same, and — while it
 * can't be used — why not.
 *
 * - Every icon draws at the SAME size whatever set it comes from (Qt 721dabe:
 *   the WhatsApp / Print glyphs drew a third smaller than the rest).
 * - A disabled button stays hoverable (its tooltip says why) and a click on it
 *   hands that text to `onRefused` — Qt's Make GRN puts its tooltip on the hint
 *   line when it can't run.
 * - The buttons take no focus (Qt NoFocus): a click leaves the cursor where it
 *   was; the keyboard reaches the same actions through their keys.
 * - Groups are drawn left to right with a thin separator between them.
 *
 * Opt-in: a screen that does not render it is unchanged.
 */
import type { ReactNode } from "react";
import { cx } from "@/components/design-system/cx";
import { quickActionTitle, type PurchaseQuickTitleParts } from "../purchase-parts";
import styles from "./purchase-parts.module.scss";

export type PurchaseQuickAction = PurchaseQuickTitleParts & {
  key: string;
  /** The glyph — any 24×24 icon (react-icons `Fi*` on the PO); the bar sizes it. */
  icon: ReactNode;
  onClick: () => void;
  /** Drawn pressed (a panel this button opened is showing). */
  active?: boolean;
};

export type PurchaseQuickBarProps = {
  /** The toolbar's accessible name ("Purchase order actions"). */
  label: string;
  /** Groups left to right; a separator between two groups. */
  groups: readonly (readonly PurchaseQuickAction[])[];
  /** A click on a disabled button: its tooltip, for the screen's hint line. */
  onRefused?: (why: string) => void;
  /** At the bar's right end (a note). */
  trailing?: ReactNode;
  className?: string;
};

export function PurchaseQuickBar({ label, groups, onRefused, trailing, className }: PurchaseQuickBarProps) {
  const shown = groups.filter((group) => group.length > 0);
  return (
    <div className={cx(styles.quickBar, className)} role="toolbar" aria-label={label} data-purchase-quick-bar="">
      {shown.map((group, index) => (
        <div key={group[0].key} className={styles.quickGroup}>
          {index > 0 ? <span className={styles.quickSeparator} aria-hidden="true" /> : null}
          {group.map((action) => {
            const title = quickActionTitle(action);
            return (
              <button
                key={action.key}
                type="button"
                className={cx(styles.quickButton, action.disabled && styles.quickButtonDisabled, action.active && styles.quickButtonActive)}
                aria-label={action.label}
                aria-disabled={action.disabled ? "true" : undefined}
                aria-pressed={action.active === undefined ? undefined : action.active}
                title={title}
                tabIndex={-1}
                data-quick-action={action.key}
                // Qt NoFocus: the cursor stays in the field or cell it was in
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (action.disabled) {
                    onRefused?.(title);
                    return;
                  }
                  action.onClick();
                }}
              >
                <span className={styles.quickIcon} aria-hidden="true">
                  {action.icon}
                </span>
              </button>
            );
          })}
        </div>
      ))}
      {trailing ? <div className={styles.quickTrailing}>{trailing}</div> : null}
    </div>
  );
}
