"use client";
/**
 * The tender dialog — ONE component, two purposes (the plan's §6). `purpose` is
 * not a preference; the two are different transactions:
 *
 *   settlement — the bill's: the total must be covered, every row is offered.
 *   advance — the order's: partial by nature, and RRN / LOYALTY / CREDIT /
 *   TEMP_CR are never offered (nothing to redeem against yet).
 *
 * One row per configured tender, ordered by the master's display position, with
 * **exactly one editable column: Amount**. Everything else a row knows —
 * ledgers, limits, surcharge, reference rules, hotkey — lives on the master
 * beside the row, never in hidden columns. That is what keeps this a 1-column
 * table instead of a 30-column one, and it is why a shop can add a second card
 * tender with its own fee and its own ledger without this file knowing.
 *
 * All arithmetic is `domain/arithmetic.ts` and all refusals are
 * `domain/validate.ts`; this component computes nothing and judges nothing.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { cx } from "@/components/design-system/cx";
import { formatCurrency } from "@/domain/pricing";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { DateField, DropdownCombo, Field } from "@/features/sales/quotation/components/fields";
import { parseCell } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import type { SettlementState, TenderDraftRow, TenderMasterRow } from "../sale-order.types";
import {
  computeTenders,
  givesChange,
  payBalanceWithRow,
  payStatusOf,
  presentBalance,
  type TenderPurpose,
} from "../tender/arithmetic";
import { instrumentSpecOf, isPdc } from "../tender/instruments";
import {
  fallbackReasonMessage,
  fallbackTenderRows,
  rowIsPanelOwned,
  rowIsUsable,
  tenderRowFromMaster,
  usableTenders,
  type TenderFallbackReason,
} from "../tender/rows";
import { validateTenderRows } from "../tender/validate";
import styles from "../page.module.scss";

/** `fixed.bank_master` — name only (166 rows); the payload carries the NAME. */
const BANK_DROPDOWN_ID = "46";

export type TenderDialogProps = {
  isOpen: boolean;
  purpose: TenderPurpose;
  documentAmount: number;
  /** `yyyy-mm-dd` — the effective-date filter AND the cheque/PDC comparison. */
  documentDate: string;
  documentRefno: string;
  existingRows: TenderDraftRow[];
  masters: TenderMasterRow[];
  /** True when the master call itself failed (as opposed to returning none). */
  mastersFailed?: boolean;
  mastersError?: string | null;
  refundAmt: number;
  /** The customer may buy on credit. A cash-only customer is asked once (§8). */
  creditAllowed?: boolean;
  onClose: () => void;
  onApply: (tenders: TenderDraftRow[], settlement: SettlementState) => void;
};

const CAPTIONS: Record<TenderPurpose, { total: string; tendered: string; title: string }> = {
  settlement: { total: "Bill Total", tendered: "Tender Amount", title: "Settle Bill" },
  advance: { total: "Order Amount", tendered: "Advance Received", title: "Receive Advance" },
};

/**
 * The dialog's working rows: every offerable master row (0 until keyed), with
 * the draft's existing rows folded in by tender id so a reopened dialog shows
 * what was keyed — and keeps `tdId`, so the save updates rather than
 * duplicates. An existing row whose master vanished is appended as-is: money
 * already taken does not disappear because a master was deactivated.
 */
function buildRows(
  masters: TenderMasterRow[],
  existing: TenderDraftRow[],
  documentDate: string,
  purpose: TenderPurpose,
): { rows: TenderDraftRow[]; fallback: TenderFallbackReason | null } {
  const offerable = usableTenders(masters, documentDate, purpose);
  const fallback: TenderFallbackReason | null =
    masters.length === 0 ? "empty" : offerable.length === 0 ? "none-offerable" : null;
  const base =
    offerable.length > 0
      ? offerable.map((master, index) => tenderRowFromMaster(master, index))
      : fallbackTenderRows(purpose);

  const byTenderId = new Map(base.map((row) => [row.tenderId, row]));
  const merged: TenderDraftRow[] = [...base];
  for (const row of existing) {
    const target = row.tenderId ? byTenderId.get(row.tenderId) : undefined;
    if (target) {
      merged[merged.indexOf(target)] = {
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
  return { rows: merged, fallback };
}

/**
 * The body is mounted only while open and keyed on what its rows are built
 * from, so opening BUILDS the rows in a `useState` initializer rather than
 * syncing them in an effect afterwards — one render, and reopening after the
 * masters or the document date moved genuinely rebuilds.
 */
export function TenderDialog(props: TenderDialogProps) {
  const { isOpen, purpose, documentDate, masters } = props;
  if (!isOpen) {
    return null;
  }
  return <TenderDialogBody {...props} key={`${purpose}|${documentDate}|${masters.length}`} />;
}

function TenderDialogBody({
  isOpen,
  purpose,
  documentAmount,
  documentDate,
  documentRefno,
  existingRows,
  masters,
  mastersFailed,
  mastersError,
  refundAmt,
  creditAllowed = true,
  onClose,
  onApply,
}: TenderDialogProps) {
  const built = useMemo(
    () => buildRows(masters, existingRows, documentDate, purpose),
    [masters, existingRows, documentDate, purpose],
  );
  const [rows, setRows] = useState<TenderDraftRow[]>(built.rows);
  const [activeKey, setActiveKey] = useState<string | null>(
    () => built.rows.find((row) => rowIsUsable(row, creditAllowed))?.key ?? null,
  );
  /**
   * What the cell literally holds while it is being typed into. Kept apart
   * from the row's number so folding the surcharge into the text mid-number
   * cannot move the digits out from under the cursor (§4.1); the number is
   * derived on every keystroke, the TEXT is only rewritten on commit.
   */
  const [rawText, setRawText] = useState<Record<string, string>>({});
  /** "Put this on credit anyway?" — asked once per settle, not per keystroke. */
  const [creditOverridden, setCreditOverridden] = useState(false);
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fallbackReason: TenderFallbackReason | null = mastersFailed
    ? "unavailable"
    : built.fallback;

  const computation = useMemo(
    () =>
      computeTenders(
        rows.map((row) => ({
          key: row.key,
          keyed: row.keyed,
          allowChange: givesChange(row.allowChange, row.typeCode),
          surcharge: { perc: row.surchargePerc, flat: row.surchargeFlat },
        })),
        documentAmount,
      ),
    [rows, documentAmount],
  );
  const pricedByKey = useMemo(
    () => new Map(computation.rows.map((row) => [row.key, row])),
    [computation],
  );
  const captions = CAPTIONS[purpose];
  const balance = presentBalance(computation.totals.balance, purpose);

  const patchRow = useCallback((key: string, patch: Partial<TenderDraftRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }, []);

  const activeRow = rows.find((row) => row.key === activeKey) ?? null;
  const activeSpec = activeRow ? instrumentSpecOf(activeRow.typeCode) : null;

  const focusAmount = useCallback((key: string) => {
    setActiveKey(key);
    window.requestAnimationFrame(() => amountRefs.current[key]?.focus());
  }, []);

  /**
   * Keying an amount onto a cash-only customer's CREDIT row asks once and
   * remembers the answer for this settle. Re-asking per keystroke trains the
   * answer out of anyone.
   */
  const confirmCreditIfNeeded = useCallback(
    (row: TenderDraftRow): boolean => {
      if (row.typeCode !== "CREDIT" || creditAllowed || creditOverridden) {
        return true;
      }
      const answer = window.confirm(
        "This customer is not allowed to buy on credit. Put this bill on credit anyway?",
      );
      if (answer) {
        setCreditOverridden(true);
      }
      return answer;
    },
    [creditAllowed, creditOverridden],
  );

  /** Per keystroke: keep the text, derive the number. */
  const onAmountInput = useCallback(
    (row: TenderDraftRow, text: string) => {
      setRawText((current) => ({ ...current, [row.key]: text }));
      patchRow(row.key, { keyed: Math.abs(parseCell(text)) });
    },
    [patchRow],
  );

  /** On commit: validate the row, then rewrite the cell to the charged amount. */
  const onAmountCommit = useCallback(
    (row: TenderDraftRow) => {
      if (row.keyed > 0 && !confirmCreditIfNeeded(row)) {
        patchRow(row.key, { keyed: 0 });
        setRawText((current) => ({ ...current, [row.key]: "" }));
        return;
      }
      setRawText((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
    },
    [confirmCreditIfNeeded, patchRow],
  );

  /** F1 — settle whatever is outstanding with the row under the cursor. */
  const payBalanceHere = useCallback(() => {
    if (!activeRow || rowIsPanelOwned(activeRow)) {
      return;
    }
    const next = payBalanceWithRow(activeRow.keyed, computation.totals.balance);
    if (next === activeRow.keyed) {
      return;
    }
    if (!confirmCreditIfNeeded(activeRow)) {
      return;
    }
    patchRow(activeRow.key, { keyed: next });
    setRawText((current) => ({ ...current, [activeRow.key]: String(next) }));
  }, [activeRow, computation.totals.balance, confirmCreditIfNeeded, patchRow]);

  const onDialogKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "F1") {
        event.preventDefault();
        payBalanceHere();
        return;
      }
      // A hotkey jumps the cursor to that row's amount. Held with Alt so the
      // letter still types normally into a reference field.
      if (event.altKey && /^[a-zA-Z]$/.test(event.key)) {
        const letter = event.key.toUpperCase();
        const target = rows.find((row) => row.hotkey === letter);
        if (target) {
          event.preventDefault();
          focusAmount(target.key);
        }
      }
    },
    [focusAmount, payBalanceHere, rows],
  );

  const apply = () => {
    const violation = validateTenderRows(rows, {
      purpose,
      documentAmount,
      documentDate,
    });
    if (violation) {
      toast.error(violation.message);
      if (violation.focusRow) {
        focusAmount(violation.focusRow);
      }
      return;
    }
    // Change that nobody can hand back is refused rather than clamped.
    if (computation.totals.balance > 0.005 && documentAmount > 0) {
      const canGiveChange = rows.some(
        (row) => row.keyed > 0 && givesChange(row.allowChange, row.typeCode),
      );
      if (!canGiveChange) {
        toast.error(
          "No tender on this document can give change back. Reduce the over-tendered amount, or add a cash tender.",
        );
        return;
      }
    }
    const kept = rows.filter((row) => row.keyed > 0 || row.tdId);
    onApply(kept, {
      tenderAmt: computation.totals.tendered,
      surchargeAmt: computation.totals.surchargeTotal,
      refundAmt,
      payStatus: payStatusOf(computation.totals.settled - refundAmt, documentAmount),
    });
  };

  return (
    <ModalShell
      title={`${captions.title}${documentRefno ? ` — ${documentRefno}` : ""}`}
      isOpen={isOpen}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className={quotationStyles.button} onClick={onClose}>
            Cancel <span className={quotationStyles.buttonHint}>Esc</span>
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            onClick={apply}
          >
            OK
          </button>
        </>
      }
    >
      <div onKeyDown={onDialogKeyDown}>
        {/* The seeding reason takes the hint bar over for the rest of the
            dialog — it is a fault to fix in the master, not a layout to get
            used to. */}
        {fallbackReason ? (
          <div className={styles.tenderHintBar}>
            {fallbackReasonMessage(fallbackReason, mastersError ?? undefined)}
          </div>
        ) : (
          <div className={styles.tenderKeyHint}>
            F1 pay the balance with this row · Alt+letter jump to a tender · Enter commit · Esc close
          </div>
        )}

        <table className={styles.tenderTable}>
          <thead>
            <tr>
              <th aria-label="Hotkey" />
              <th>Tender</th>
              <th className={styles.tenderAmountCell}>Amount</th>
              <th className={styles.tenderMoney}>Surcharge</th>
              <th className={styles.tenderMoney}>Charged</th>
              <th className={styles.tenderMoney}>Change</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const priced = pricedByKey.get(row.key);
              const spec = instrumentSpecOf(row.typeCode);
              const panelOwned = rowIsPanelOwned(row);
              return (
                <tr
                  key={row.key}
                  className={cx(row.key === activeKey && styles.tenderRowActive)}
                  onClick={() => setActiveKey(row.key)}
                >
                  <td className={styles.tenderHotkey}>{row.hotkey ?? ""}</td>
                  <td>
                    {row.tenderName}
                    {row.minAmount > 0 ? (
                      <span className={styles.tenderRowNote}>
                        min {formatCurrency(row.minAmount)}
                      </span>
                    ) : null}
                  </td>
                  <td className={styles.tenderAmountCell}>
                    <input
                      ref={(node) => {
                        amountRefs.current[row.key] = node;
                      }}
                      className={styles.tenderAmountInput}
                      inputMode="decimal"
                      // Panel-owned rows (RRN, loyalty) are read-only: their
                      // amount is the panel's summary, and typing over it would
                      // only desync the two (§4.2).
                      readOnly={panelOwned}
                      title={
                        panelOwned
                          ? `${row.tenderName} is redeemed from its own panel (not available yet).`
                          : undefined
                      }
                      value={rawText[row.key] ?? (row.keyed ? String(row.keyed) : "")}
                      onFocus={() => setActiveKey(row.key)}
                      onChange={(event) => onAmountInput(row, event.target.value)}
                      onBlur={() => onAmountCommit(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          onAmountCommit(row);
                        }
                      }}
                      aria-label={`${row.tenderName} amount`}
                    />
                  </td>
                  <td className={styles.tenderMoney}>
                    {priced && priced.surchargeAmt > 0 ? formatCurrency(priced.surchargeAmt) : "—"}
                  </td>
                  <td className={styles.tenderMoney}>
                    {priced && priced.amount > 0 ? formatCurrency(priced.amount) : "—"}
                  </td>
                  <td className={styles.tenderMoney}>
                    {priced && priced.refundAmt > 0 ? formatCurrency(priced.refundAmt) : "—"}
                  </td>
                  <td className={styles.tenderRef}>
                    {spec.refLabel && row.refNo ? `${spec.refLabel}: ${row.refNo}` : ""}
                    {row.typeCode === "CHEQUE" && isPdc(row.instrumentDate, documentDate)
                      ? " · PDC"
                      : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* The reference column swaps with the selected row and collapses when
            that row needs nothing — derived from the type, never toggled. */}
        {activeRow &&
        activeSpec &&
        (activeSpec.bank !== "none" ||
          activeSpec.refLabel ||
          activeSpec.cardLast4 ||
          activeSpec.dateLabel) ? (
          <div className={styles.tenderInstrument}>
            {activeSpec.bank !== "none" ? (
              <DropdownCombo
                id="so-tender-bank"
                label={`Bank${activeSpec.bank === "required" ? " *" : ""}`}
                dropdownId={BANK_DROPDOWN_ID}
                // The bank master serves names only, so the value IS the name —
                // which is what `td_bank_name` stores.
                valueKey="bnk_name"
                labelKey="bnk_name"
                value={activeRow.bankName ?? ""}
                selectedLabel={activeRow.bankName ?? ""}
                disabled={false}
                placeholder="Search banks…"
                onSelect={(value) => patchRow(activeRow.key, { bankName: value })}
              />
            ) : null}
            {activeSpec.refLabel ? (
              <Field
                label={`${activeSpec.refLabel}${
                  activeSpec.refRequired || activeRow.needsRef ? " *" : ""
                }`}
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
          {computation.totals.surchargeTotal > 0 ? (
            <span className={styles.tenderTotal}>
              <span className={styles.tenderTotalLabel}>Surcharge</span>
              <span className={styles.tenderTotalValue}>
                {formatCurrency(computation.totals.surchargeTotal)}
              </span>
            </span>
          ) : null}
          {/* One box, three states, and the caption changes with it (§5). */}
          <span className={styles.tenderTotal}>
            <span className={styles.tenderTotalLabel}>{balance.caption}</span>
            <span
              className={cx(
                styles.tenderTotalValue,
                balance.tone === "short" &&
                  (purpose === "advance"
                    ? styles.tenderBalanceToCollect
                    : styles.tenderBalanceShort),
                balance.tone === "over" && styles.tenderBalanceOver,
                balance.tone === "settled" && styles.tenderBalanceSettled,
              )}
            >
              {formatCurrency(balance.value)}
            </span>
          </span>
        </div>
      </div>
    </ModalShell>
  );
}
