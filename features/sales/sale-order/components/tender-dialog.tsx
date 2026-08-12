"use client";
/**
 * The tender dialog — ONE component, two purposes (the plan's §5). `purpose`
 * is not a preference; the two are different transactions:
 *
 *   settlement — the bill's: the total must be covered, every row is offered,
 *   a shortfall is red.
 *   advance — this screen's: a deposit is partial by nature, RRN / LOYALTY /
 *   CREDIT / TEMP_CR are never offered, a shortfall is amber and normal.
 *
 * Instrument fields are DERIVED from the selected type (`instruments.ts`),
 * never toggled imperatively — a new tender type can never show a cheque's
 * date labelled "Expiry". All arithmetic is `computeTenders`; this component
 * computes nothing itself.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { cx } from "@/components/design-system/cx";
import { formatCurrency } from "@/domain/pricing";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { DateField, Field } from "@/features/sales/quotation/components/fields";
import { parseCell } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import type {
  SettlementState,
  TenderDraftRow,
  TenderMasterRow,
} from "../sale-order.types";
import { computeTenders, payStatusOf, type TenderPurpose } from "../tender/arithmetic";
import { instrumentSpecOf, isPdc } from "../tender/instruments";
import { fallbackTenderRows, tenderRowFromMaster, usableTenders } from "../tender/rows";
import { toArithRow } from "../sale-order.payload";
import styles from "../page.module.scss";

export type TenderDialogProps = {
  isOpen: boolean;
  purpose: TenderPurpose;
  documentAmount: number;
  /** `yyyy-mm-dd` — effective-date filter AND the PDC comparison base. */
  documentDate: string;
  documentRefno: string;
  existingRows: TenderDraftRow[];
  masters: TenderMasterRow[];
  /** Why the dialog is degraded, when it is — said in the hint bar (§5.2). */
  masterError: string | null;
  refundAmt: number;
  onClose: () => void;
  onApply: (tenders: TenderDraftRow[], settlement: SettlementState) => void;
};

const CAPTIONS: Record<TenderPurpose, { total: string; tendered: string; balance: string }> = {
  settlement: { total: "Bill Total", tendered: "Tendered", balance: "Balance" },
  advance: { total: "Order Amount", tendered: "Advance Received", balance: "Balance to Collect" },
};

/**
 * The dialog's working rows: every usable master row (keyed 0 until touched),
 * with the draft's existing rows folded in by tender id so a reopened dialog
 * shows what was keyed — and keeps `tdId`, so the save updates rather than
 * duplicates. An existing row whose master vanished is appended as-is: money
 * already taken does not disappear because a master was deactivated.
 */
function buildRows(
  masters: TenderMasterRow[],
  existing: TenderDraftRow[],
  documentDate: string,
  purpose: TenderPurpose,
): TenderDraftRow[] {
  const offered = usableTenders(masters, documentDate, purpose).map(tenderRowFromMaster);
  const base = offered.length > 0 ? offered : fallbackTenderRows(purpose);
  const byTenderId = new Map(base.map((row) => [row.tenderId, row]));
  const merged: TenderDraftRow[] = [...base];
  for (const row of existing) {
    const target = row.tenderId ? byTenderId.get(row.tenderId) : undefined;
    if (target) {
      const index = merged.indexOf(target);
      merged[index] = {
        ...target,
        tdId: row.tdId,
        keyed: row.keyed,
        settleStatus: row.settleStatus,
        refNo: row.refNo,
        authCode: row.authCode,
        bankName: row.bankName,
        cardDigits: row.cardDigits,
        instrumentDate: row.instrumentDate,
        notes: row.notes,
      };
    } else {
      merged.push(row);
    }
  }
  return merged;
}

export function TenderDialog(props: TenderDialogProps) {
  const {
    isOpen,
    purpose,
    documentAmount,
    documentDate,
    documentRefno,
    existingRows,
    masters,
    masterError,
    refundAmt,
    onClose,
    onApply,
  } = props;

  const [rows, setRows] = useState<TenderDraftRow[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Rebuilt on every open: the masters, the document date and the draft's rows
  // may all have moved since the last time.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const built = buildRows(masters, existingRows, documentDate, purpose);
    setRows(built);
    setActiveKey(built[0]?.key ?? null);
  }, [isOpen, masters, existingRows, documentDate, purpose]);

  const computation = useMemo(
    () => computeTenders(rows.map(toArithRow), documentAmount),
    [rows, documentAmount],
  );
  const pricedByKey = useMemo(
    () => new Map(computation.rows.map((row) => [row.key, row])),
    [computation],
  );
  const captions = CAPTIONS[purpose];
  const settledNet = computation.totals.settled - refundAmt;
  const shortfall = Math.max(0, documentAmount - computation.totals.settled);
  const overpay = computation.totals.balance > 0.005;

  const patchRow = (key: string, patch: Partial<TenderDraftRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const activeRow = rows.find((row) => row.key === activeKey) ?? null;
  const activeSpec = activeRow ? instrumentSpecOf(activeRow.typeCode) : null;

  const apply = () => {
    // Money on a fallback row has no master to save against.
    const orphan = rows.find((row) => row.keyed > 0 && !row.tenderId);
    if (orphan) {
      toast.error(
        `${orphan.tenderName} is not backed by the tender master (the list did not load) — it cannot be saved.`,
      );
      return;
    }
    // The cheque's own facts, said now rather than at save time.
    for (const row of rows) {
      if (row.keyed <= 0 || row.typeCode !== "CHEQUE") {
        continue;
      }
      if (!(row.refNo ?? "").trim() || !(row.bankName ?? "").trim() || !row.instrumentDate) {
        toast.error("A cheque needs its number, bank and date before it can be taken.");
        setActiveKey(row.key);
        return;
      }
      if (documentDate && row.instrumentDate < documentDate) {
        toast.error("A cheque cannot be dated before the order.");
        setActiveKey(row.key);
        return;
      }
    }
    if (overpay) {
      toast.error(
        `The tenders exceed ${captions.total.toLowerCase()} by ${formatCurrency(computation.totals.balance)} and no row can give change.`,
      );
      return;
    }
    // A settlement must cover the document; an advance is partial by nature.
    if (purpose === "settlement" && shortfall > 0.005) {
      toast.error(`${formatCurrency(shortfall)} is still to be tendered.`);
      return;
    }
    const kept = rows.filter((row) => row.keyed > 0 || row.tdId);
    onApply(kept, {
      tenderAmt: computation.totals.tendered,
      surchargeAmt: computation.totals.surcharge,
      refundAmt,
      payStatus: payStatusOf(settledNet, documentAmount),
    });
  };

  return (
    <ModalShell
      title={purpose === "advance" ? `Advance — ${documentRefno || "new order"}` : `Settle — ${documentRefno || "bill"}`}
      isOpen={isOpen}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className={quotationStyles.button} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} onClick={apply}>
            OK
          </button>
        </>
      }
    >
      {masterError ? <div className={styles.tenderHintBar}>{masterError}</div> : null}
      <table className={styles.tenderTable}>
        <thead>
          <tr>
            <th>Tender</th>
            <th>Type</th>
            <th className={styles.tenderAmountCell}>Amount</th>
            <th className={styles.tenderMoney}>Surcharge</th>
            <th className={styles.tenderMoney}>Total</th>
            <th className={styles.tenderMoney}>Change</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const priced = pricedByKey.get(row.key);
            const spec = instrumentSpecOf(row.typeCode);
            return (
              <tr
                key={row.key}
                className={cx(row.key === activeKey && styles.tenderRowActive)}
                onClick={() => setActiveKey(row.key)}
              >
                <td>{row.tenderName}</td>
                <td>{row.typeCode}</td>
                <td className={styles.tenderAmountCell}>
                  <input
                    className={styles.tenderAmountInput}
                    inputMode="decimal"
                    defaultValue={row.keyed ? String(row.keyed) : ""}
                    key={`${row.key}:${row.keyed}`}
                    onFocus={() => setActiveKey(row.key)}
                    onBlur={(event) =>
                      patchRow(row.key, { keyed: Math.abs(parseCell(event.target.value)) })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        (event.target as HTMLInputElement).blur();
                      }
                    }}
                    aria-label={`${row.tenderName} amount`}
                  />
                </td>
                <td className={styles.tenderMoney}>
                  {priced && priced.surcharge > 0 ? formatCurrency(priced.surcharge) : "—"}
                </td>
                <td className={styles.tenderMoney}>
                  {priced && priced.total > 0 ? formatCurrency(priced.total) : "—"}
                </td>
                <td className={styles.tenderMoney}>
                  {priced && priced.change > 0 ? formatCurrency(priced.change) : "—"}
                </td>
                <td>
                  {spec.refLabel && row.refNo ? `${spec.refLabel}: ${row.refNo}` : ""}
                  {row.typeCode === "CHEQUE" && isPdc(row.instrumentDate, documentDate) ? " · PDC" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {activeRow && activeSpec && activeSpec !== null &&
      (activeSpec.bank !== "none" ||
        activeSpec.refLabel ||
        activeSpec.cardLast4 ||
        activeSpec.dateLabel) ? (
        <div className={styles.tenderInstrument}>
          {activeSpec.bank !== "none" ? (
            <Field
              label={`Bank${activeSpec.bank === "required" ? " *" : ""}`}
              htmlFor="so-tender-bank"
            >
              <input
                id="so-tender-bank"
                className={quotationStyles.input}
                value={activeRow.bankName ?? ""}
                maxLength={150}
                autoComplete="off"
                onChange={(event) => patchRow(activeRow.key, { bankName: event.target.value })}
              />
            </Field>
          ) : null}
          {activeSpec.refLabel ? (
            <Field
              label={`${activeSpec.refLabel}${activeSpec.refRequired || activeRow.needsRef ? " *" : ""}`}
              htmlFor="so-tender-ref"
            >
              <input
                id="so-tender-ref"
                className={quotationStyles.input}
                value={activeRow.refNo ?? ""}
                maxLength={100}
                autoComplete="off"
                onChange={(event) => patchRow(activeRow.key, { refNo: event.target.value })}
              />
            </Field>
          ) : null}
          {activeSpec.cardLast4 ? (
            <Field label="Card No (last 4 kept)" htmlFor="so-tender-card">
              <input
                id="so-tender-card"
                className={quotationStyles.input}
                value={activeRow.cardDigits ?? ""}
                maxLength={19}
                inputMode="numeric"
                autoComplete="off"
                onChange={(event) => patchRow(activeRow.key, { cardDigits: event.target.value })}
              />
            </Field>
          ) : null}
          {activeSpec.dateLabel ? (
            <DateField
              id="so-tender-date"
              label={`${activeSpec.dateLabel}${activeSpec.dateRequired ? " *" : ""}`}
              value={activeRow.instrumentDate ?? ""}
              disabled={false}
              onChange={(value) => patchRow(activeRow.key, { instrumentDate: value || null })}
            />
          ) : null}
        </div>
      ) : null}

      <div className={styles.tenderTotals}>
        <span className={styles.tenderTotal}>
          <span className={styles.tenderTotalLabel}>{captions.total}</span>
          <span className={styles.tenderTotalValue}>{formatCurrency(documentAmount)}</span>
        </span>
        <span className={styles.tenderTotal}>
          <span className={styles.tenderTotalLabel}>{captions.tendered}</span>
          <span className={styles.tenderTotalValue}>
            {formatCurrency(computation.totals.settled)}
          </span>
        </span>
        {computation.totals.surcharge > 0 ? (
          <span className={styles.tenderTotal}>
            <span className={styles.tenderTotalLabel}>Surcharge</span>
            <span className={styles.tenderTotalValue}>
              {formatCurrency(computation.totals.surcharge)}
            </span>
          </span>
        ) : null}
        {computation.totals.change > 0 ? (
          <span className={styles.tenderTotal}>
            <span className={styles.tenderTotalLabel}>Change</span>
            <span className={styles.tenderTotalValue}>
              {formatCurrency(computation.totals.change)}
            </span>
          </span>
        ) : null}
        <span className={styles.tenderTotal}>
          <span className={styles.tenderTotalLabel}>{captions.balance}</span>
          <span
            className={cx(
              styles.tenderTotalValue,
              shortfall > 0 &&
                (purpose === "advance"
                  ? styles.tenderShortfallAdvance
                  : styles.tenderShortfallSettlement),
            )}
          >
            {formatCurrency(purpose === "advance" ? shortfall : computation.totals.balance)}
          </span>
        </span>
      </div>
    </ModalShell>
  );
}
