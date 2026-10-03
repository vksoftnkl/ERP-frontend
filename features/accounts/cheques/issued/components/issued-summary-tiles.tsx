"use client";

/**
 * The five tiles — summed on the client (`domain/summary.ts`), over everything
 * still out for this branch and year and the BANK filter. The other filters do
 * not move them: they answer "what is our bank book carrying", not "what is
 * on screen", and each tile's tooltip says so.
 *
 * A failed read shows dashes on EVERY tile — never stale figures beside a
 * freshly read register (the Qt screen reset only the total).
 */
import { formatAmount } from "../../domain/chequeRow";
import { countLine, type IssuedSummary, type LeavesSummary } from "../domain/summary";
import styles from "../../cheques.module.scss";

const SCOPE_NOTE =
  "Over every cheque still out for this branch and year, and the bank chosen above — the other filters do not change it.";

type TileProps = {
  caption: string;
  amount: string;
  line: string;
  toneClass: string;
  title: string;
};

function Tile({ caption, amount, line, toneClass, title }: TileProps) {
  return (
    <div className={`${styles.tile} ${toneClass}`} title={title}>
      <span className={styles.tileCaption}>{caption}</span>
      <span className={styles.tileFigure}>{amount}</span>
      <span className={styles.tileCount}>{line}</span>
    </div>
  );
}

export type IssuedSummaryTilesProps = {
  summary: IssuedSummary | null;
  summaryFailed: boolean;
  leaves: LeavesSummary | null;
  leavesFailed: boolean;
};

export function IssuedSummaryTiles({ summary, summaryFailed, leaves, leavesFailed }: IssuedSummaryTilesProps) {
  const s = summaryFailed ? null : summary;
  const money = (value: number | undefined) => (value === undefined ? "—" : formatAmount(value));
  const count = (value: number | undefined) => (value === undefined ? "—" : countLine(value));
  return (
    <section className={styles.tiles} aria-label="Summary">
      <Tile
        caption="Not presented"
        amount={money(s?.notPresented.amount)}
        line={count(s?.notPresented.count)}
        toneClass={styles.tileAmber}
        title={`Written, dated today or earlier, and not yet paid by our bank. ${SCOPE_NOTE}`}
      />
      <Tile
        caption="Post-dated, out"
        amount={money(s?.postDated.amount)}
        line={count(s?.postDated.count)}
        toneClass={styles.tileBlue}
        title={`Written and handed over, dated after today. ${SCOPE_NOTE}`}
      />
      <Tile
        caption="Returned unpaid"
        amount={money(s?.returned.amount)}
        line={count(s?.returned.count)}
        toneClass={styles.tileRed}
        title={`Our bank returned them; the bills reopened — replace them, or pay another way. ${SCOPE_NOTE}`}
      />
      <Tile
        caption="Bank book uncleared"
        amount={money(s?.uncleared.amount)}
        line={s ? "not presented + post-dated" : summaryFailed ? "summary unavailable" : "—"}
        toneClass={styles.tileSlate}
        title={`What our bank book has paid that the bank statement does not show yet. ${SCOPE_NOTE}`}
      />
      <Tile
        caption="Leaves free"
        amount={leavesFailed || !leaves ? "—" : String(leaves.leaves)}
        line={leavesFailed ? "unavailable" : (leaves?.line ?? "—")}
        toneClass={styles.tileGreen}
        title="Leaves left in the active cheque books, for the company (and the bank chosen above)."
      />
      {summaryFailed ? <span className={styles.tilesUnavailable}>Summary unavailable.</span> : null}
      {s?.truncated ? (
        <span className={styles.tilesUnavailable}>
          Over 2,000 cheques are out — the first 2,000 are counted.
        </span>
      ) : null}
    </section>
  );
}
