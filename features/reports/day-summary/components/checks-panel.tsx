/**
 * Checks (plan §7.5): one card per `checks[]` entry, FAIL first. The words
 * come from `wire/checks.ts`; the server sends codes and facts only. A card
 * with rows behind it offers "show".
 */
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import { checkText, hasDetail, LEVEL_MARK, sortChecks } from "../wire/checks";
import type { Check } from "../wire/types";

type Props = {
  checks: readonly Check[];
  /** "Count drafts" off hides the DRAFTS card (a display switch, §6). */
  countDrafts: boolean;
  onShow: (check: Check) => void;
};

export function ChecksPanel({ checks, countDrafts, onShow }: Props) {
  const shown = sortChecks(checks).filter((check) => countDrafts || check.code !== "DRAFTS");
  if (shown.length === 0) return <div className={styles.footNote}>The server sent no checks.</div>;
  return (
    <div className={styles.checks}>
      {shown.map((check, i) => {
        const { heading, line } = checkText(check);
        return (
          <div key={`${check.code}-${i}`} className={cx(styles.checkCard, styles[`level-${check.level}`])}>
            <span className={styles.checkMark} aria-label={check.level}>
              {LEVEL_MARK[check.level]}
            </span>
            <div>
              <div className={styles.checkHeading}>{heading}</div>
              {line ? <div className={styles.checkLine}>{line}</div> : null}
            </div>
            {hasDetail(check) ? (
              <button type="button" className={styles.showLink} onClick={() => onShow(check)}>
                show
              </button>
            ) : (
              <span />
            )}
          </div>
        );
      })}
    </div>
  );
}
