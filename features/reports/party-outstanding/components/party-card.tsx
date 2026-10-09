"use client";
/**
 * The focused party's card (plan §10): facts, ageing, less on-account, net,
 * and the post-dated cheques.
 *
 * It prints three server figures — the ageing amounts, the on-account items
 * and `net` — and computes none of them: no "ageing total − on-account" here.
 *
 * PDC: `pdcInHand` are cheques dated after As on (not yet counted). The
 * muted line under them names the OTHER list, cheques dated on or before As
 * on that have not cleared: they are already counted as received, and
 * without the line people deduct them a second time in their heads.
 */
import { cx } from "@/components/design-system/cx";
import { displayDate } from "@/features/reports/shared/wire/dates";
import { formatAmount } from "@/features/reports/shared/wire/money";
import styles from "../page.module.scss";
import { netCell } from "../view/cells";
import type { AgeBy, OutstandingSide, PartyCardPayload } from "../wire/types";
import { AgeingBars } from "./ageing-bars";
import { toneClass } from "./tone";

type Props = {
  card: PartyCardPayload;
  side: OutstandingSide;
  ageBy: AgeBy;
  deductPdc: boolean;
};

const ON_ACCOUNT_SHOWN = 2;

export function PartyCard({ card, side, ageBy, deductPdc }: Props) {
  const receivable = side === "RECEIVABLE";
  const { party, lastSettlement } = card;
  const net = netCell(card.net, side);
  const shown = card.onAccountItems.slice(0, ON_ACCOUNT_SHOWN);
  const more = card.onAccountItems.length - shown.length;
  const uncleared = card.pdcEffectiveUncleared.length;

  const credit = [
    party.creditDays !== null ? `${party.creditDays} days` : null,
    receivable && party.creditLimit ? `limit ${formatAmount(party.creditLimit)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={styles.card}>
      <dl className={styles.factsBox}>
        {party.isDualRole ? (
          <div className={cx(styles.fact, styles.factWide)}>
            <dd className={styles.partyHeadLine}>
              <span>{party.name}</span>
              <span className={`${styles.chip} ${styles.chipInfo}`}>
                {receivable ? "also a supplier" : "also a customer"}
              </span>
            </dd>
          </div>
        ) : null}
        <div className={styles.fact}>
          <dt>Group</dt>
          <dd title={party.ledgerGroup ?? undefined}>{party.ledgerGroup ?? "—"}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Phone</dt>
          <dd>{party.phone || "—"}</dd>
        </div>
        <div className={styles.fact}>
          <dt>GSTIN</dt>
          <dd>{party.gstin || "—"}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Credit</dt>
          <dd>{credit || "—"}</dd>
        </div>
        <div className={cx(styles.fact, styles.factWide)}>
          <dt>{receivable ? "Last receipt" : "Last payment"}</dt>
          <dd>
            {lastSettlement
              ? `${displayDate(lastSettlement.date)}  ${lastSettlement.voucherNo ?? ""}  ${formatAmount(lastSettlement.amount)}`
              : "—"}
          </dd>
        </div>
      </dl>

      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>Ageing</span>
        <span className={styles.sectionNote}>
          pending bills, by {ageBy === "DUE_DATE" ? "due-date" : "bill-date"} age
        </span>
      </div>
      <AgeingBars labels={card.ageing.labels} amounts={card.ageing.amounts} />

      <div className={styles.netBlock}>
        {shown.map((item) => (
          <div key={`${item.accYear}|${item.billId}`} style={{ display: "contents" }}>
            <span className={styles.muted}>less on-account {item.docRefno ?? item.type.toLowerCase()}</span>
            <span className={cx(styles.num, styles.tCredit)}>− {formatAmount(item.amount)}</span>
          </div>
        ))}
        {more > 0 ? (
          <>
            <span className={styles.muted}>+ {more} more on-account</span>
            <span />
          </>
        ) : null}
        <span className={styles.netTotalLabel}>Net outstanding</span>
        <span className={cx(styles.netTotal, toneClass(net.tone))}>{net.text}</span>
      </div>

      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>PDC in hand</span>
        <span className={styles.sectionNote}>{deductPdc ? "deducted from net" : "not deducted (Deduct PDC)"}</span>
      </div>
      <div className={styles.pdcList}>
        {card.pdcInHand.length === 0 ? <span className={styles.muted}>None dated after As on.</span> : null}
        {card.pdcInHand.map((pdc) => (
          <div key={`${pdc.accYear}|${pdc.pdcId}`} className={styles.pdcItem}>
            <span>
              chq {pdc.chequeNo ?? "—"}
              {pdc.bank ? ` · ${pdc.bank}` : ""} · dated {displayDate(pdc.chequeDate)}
            </span>
            <span className={styles.num}>{formatAmount(pdc.amount)}</span>
          </div>
        ))}
        {uncleared > 0 ? (
          <span className={styles.pdcNote}>
            {uncleared} {uncleared === 1 ? "cheque" : "cheques"} dated on or before {displayDate(card.asOn)}, not yet
            cleared: already counted as {receivable ? "received" : "paid"}.
          </span>
        ) : null}
      </div>
    </div>
  );
}
