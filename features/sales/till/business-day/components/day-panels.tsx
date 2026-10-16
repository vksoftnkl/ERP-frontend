"use client";

import { cx } from "@/components/design-system/cx";
import {
  CHECK_TONE_NAMES,
  type Check,
  type CheckTone,
  type DayHead,
  type NumberSection,
  type PillTone,
  type Verdict,
} from "../domain/day-reading";
import type { SessionKeys } from "../domain/wire";
import styles from "../page.module.scss";

const PILL_TONE: Record<Exclude<PillTone, "">, string> = {
  info: styles.toneInfo,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
};

export function pillToneClass(tone: PillTone): string | undefined {
  return tone ? PILL_TONE[tone] : undefined;
}

const CHECK_TONE: Record<CheckTone, string> = {
  red: styles.checkRed,
  amber: styles.checkAmber,
  green: styles.checkGreen,
  info: styles.checkInfo,
  grey: styles.checkGrey,
};

/** Status · Opened · Sessions · Store Z · Cut-off · Reopened. */
export function FactsStrip({ facts }: { facts: DayHead["facts"] }) {
  const cells: [string, string][] = [
    ["Status", facts.status],
    ["Opened", facts.opened],
    ["Sessions", facts.sessions],
    ["Store Z", facts.storeZ],
    ["Cut-off", facts.cutoff],
    ["Reopened", facts.reopened],
  ];
  return (
    <div className={styles.facts}>
      {cells.map(([cap, value]) => (
        <div key={cap} className={styles.fact}>
          <span className={styles.factCap}>{cap}</span>
          <span className={styles.factValue}>{value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The checklist rows: tone pill, title over detail, and the jump that fixes
 * it — a session's cockpit, or another screen (Till Sessions; the Cash Office
 * on its count or remit tab). A jump with nowhere to go (a session the day
 * cannot name) is off.
 */
export function Checklist({
  checks,
  onOpenSession,
  onOpenHref,
}: {
  checks: readonly Check[];
  onOpenSession: (keys: SessionKeys) => void;
  onOpenHref: (href: string) => void;
}) {
  return (
    <div className={styles.checks}>
      {checks.map((check, index) => {
        const session = check.action?.session ?? null;
        const href = check.action?.href ?? "";
        const live = Boolean(session || href);
        return (
          <div key={`${index}-${check.title}`} className={cx(styles.checkRow, CHECK_TONE[check.tone])}>
            <span className={cx(styles.pill, styles.checkPill)}>{CHECK_TONE_NAMES[check.tone]}</span>
            <div className={styles.checkText}>
              <span className={styles.checkTitle}>{check.title}</span>
              <span className={styles.checkDetail}>{check.detail}</span>
            </div>
            {check.action ? (
              <button
                type="button"
                className={styles.checkAction}
                disabled={!live}
                onClick={() => {
                  if (session) onOpenSession(session);
                  else if (href) onOpenHref(href);
                }}
              >
                {check.action.label}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** THE DAY IN NUMBERS: sections of name — value lines. */
export function DayNumbers({ sections, emptyText }: { sections: readonly NumberSection[]; emptyText: string }) {
  if (sections.length === 0) {
    return <div className={cx(styles.numbers, styles.numbersEmpty)}>{emptyText}</div>;
  }
  return (
    <div className={styles.numbers}>
      {sections.map((section) => (
        <div key={section.name} className={styles.numSection}>
          <div className={styles.numSectionName}>{section.name}</div>
          {section.lines.map((line) => (
            <div key={line.name} className={styles.numLine}>
              <span className={styles.numName}>{line.name}</span>
              <span className={cx(styles.numValue, pillToneClass(line.tone))}>{line.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const VERDICT_FRAME: Record<Exclude<PillTone, "">, string> = {
  info: styles.verdictInfo,
  success: styles.verdictSuccess,
  warning: styles.verdictWarning,
  danger: styles.verdictDanger,
};

export function VerdictBand({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return <div className={styles.verdict} />;
  return (
    <div className={cx(styles.verdict, verdict.tone && VERDICT_FRAME[verdict.tone])} role="status">
      <span className={cx(styles.pill, styles.verdictPill, pillToneClass(verdict.tone))}>{verdict.pill}</span>
      <span className={styles.verdictText}>{verdict.text}</span>
    </div>
  );
}
