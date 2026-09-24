"use client";

/**
 * The summary tiles — `/cheques/list` → `summary`.
 *
 * They cover the WHOLE register for the branch and year, whatever the filters
 * say: "what do we hold", not "what is on screen". The tooltip says so, so
 * nobody reports it as a filter bug.
 *
 * The fifth tile, CHEQUES IN HAND = in hand + with the bank, is the figure the
 * Cheques In Hand ledger should stand at. It is DISPLAYED, not verified: there
 * is no ledger-balance route yet (it comes with the ledger statement), and the
 * tie is not faked by summing vouchers on the client.
 *
 * A failed summary shows dashes — never stale figures beside a freshly read
 * register.
 */
import { formatAmount } from "../domain/chequeRow";
import type { ChequeSummary } from "../domain/types";
import styles from "../cheques.module.scss";

const WHOLE_REGISTER =
  "Over the whole register for this branch and year — the filters above do not change it.";

type TileProps = {
  caption: string;
  amount: number | null;
  count: number | null;
  toneClass: string;
  title: string;
};

function Tile({ caption, amount, count, toneClass, title }: TileProps) {
  return (
    <div className={`${styles.tile} ${toneClass}`} title={title}>
      <span className={styles.tileCaption}>{caption}</span>
      <span className={styles.tileFigure}>{amount === null ? "—" : formatAmount(amount)}</span>
      <span className={styles.tileCount}>
        {count === null ? "—" : `${count} ${count === 1 ? "cheque" : "cheques"}`}
      </span>
    </div>
  );
}

export type SummaryTilesProps = {
  summary: ChequeSummary | undefined;
  failed: boolean;
};

export function SummaryTiles({ summary, failed }: SummaryTilesProps) {
  const s = failed ? undefined : summary;
  const inHandTotal = s ? s.inHandAmount + s.withBankAmount : null;
  const inHandCount = s ? s.inHandCount + s.withBankCount : null;
  return (
    <section className={styles.tiles} aria-label="Summary">
      <Tile
        caption="In hand"
        amount={s?.inHandAmount ?? null}
        count={s?.inHandCount ?? null}
        toneClass={styles.tileAmber}
        title={`Held — in our drawer. ${WHOLE_REGISTER}`}
      />
      <Tile
        caption="With the bank"
        amount={s?.withBankAmount ?? null}
        count={s?.withBankCount ?? null}
        toneClass={styles.tileBlue}
        title={`Deposited, no answer from the bank yet. ${WHOLE_REGISTER}`}
      />
      <Tile
        caption="Bounced"
        amount={s?.bouncedAmount ?? null}
        count={s?.bouncedCount ?? null}
        toneClass={styles.tileRed}
        title={`Came back — re-present or replace. ${WHOLE_REGISTER}`}
      />
      <Tile
        caption="Cleared"
        amount={s?.clearedAmount ?? null}
        count={s?.clearedCount ?? null}
        toneClass={styles.tileGreen}
        title={`The money is ours. ${WHOLE_REGISTER}`}
      />
      <Tile
        caption="Cheques in hand"
        amount={inHandTotal}
        count={inHandCount}
        toneClass={styles.tileSlate}
        title={
          "In hand + with the bank: what the Cheques In Hand ledger should stand at. " +
          "Shown, not checked against the ledger — there is no ledger balance to compare it with yet. " +
          WHOLE_REGISTER
        }
      />
      {failed ? <span className={styles.tilesUnavailable}>Summary unavailable.</span> : null}
    </section>
  );
}
