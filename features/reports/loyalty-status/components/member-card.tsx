"use client";
/** Tab 1, bottom right — the member card (Qt frameMemberCard / `fillMemberCard`). */
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import type { CardView } from "../view/statement";
import { toneClass } from "./tone";

export function MemberCardPanel({ view }: { view: CardView }) {
  return (
    <section className={styles.panel} aria-label="Member" data-testid="ls-member-card">
      <div className={styles.heading}>MEMBER</div>
      <div className={styles.facts}>
        {view.facts.map((fact) => (
          <div key={fact.caption} className={styles.fact}>
            <span className={styles.factCaption}>{fact.caption}</span>
            <span className={cx(styles.factValue, toneClass(fact.tone))} title={fact.value}>
              {fact.value || " "}
            </span>
          </div>
        ))}
      </div>
      <div className={styles.redeemable}>{view.redeemable}</div>
      {view.giftNow ? <div className={styles.giftNow}>{view.giftNow}</div> : null}
      {view.rules ? <div className={styles.rules}>{view.rules}</div> : null}
      {view.unlotted ? <div className={styles.unlotted}>{view.unlotted}</div> : null}
    </section>
  );
}
