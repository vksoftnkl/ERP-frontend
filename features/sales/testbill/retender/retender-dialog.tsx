"use client";

/**
 * The re-tender dialog (§22): "As it was tendered — tick what did NOT
 * happen" over "What really happened", a footer "Voided X · New Y" (green
 * when they match), a required remark, and OK only when ≥ 1 void is ticked,
 * the figures match and the bill can be re-tendered.
 *
 * It computes nothing `retender-payload.ts` does not. A CHEQUE / CARD
 * replacement gets its instrument fields (G2): reference, bank, date, the
 * card's last four, the cheque's drawer / branch / IFSC / MICR.
 */
import { useMemo, useState } from "react";
import { toast } from "@/lib/notify";
import { cx } from "@/components/design-system/cx";
import { formatCurrency, money } from "@/domain/pricing";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { DateField, DropdownCombo, Field } from "@/features/sales/quotation/components/fields";
import { parseCell, todayIso, toDisplayDate } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import orderStyles from "@/features/sales/sale-order/page.module.scss";
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import { instrumentSpecOf } from "@/features/sales/sale-order/tender/instruments";
import { tenderRowFromMaster, usableTenders } from "@/features/sales/sale-order/tender/rows";
import { useDropdownId } from "@/lib/configured-dropdowns";
import type { TenderContext } from "@/features/sales/testbill/api/bills";
import { RETENDER_VOID_REASONS } from "@/features/sales/testbill/constants";
import { IFSC_PATTERN, MICR_PATTERN } from "@/features/sales/testbill/engines/settle";
import type { BillTenderRow } from "@/features/sales/testbill/types";
import {
  liveTenderRows,
  replacementTenderAllowed,
  retenderBlocker,
  retenderFigures,
  retenderRefusal,
  tenderRowNote,
  type VoidPick,
} from "./retender-payload";
import styles from "@/features/sales/testbill/page.module.scss";

export type RetenderDialogProps = {
  isOpen: boolean;
  context: TenderContext | null;
  loading: boolean;
  masters: TenderMasterRow[];
  billDate: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (voids: VoidPick[], replacements: BillTenderRow[], remark: string) => void | Promise<void>;
};

function widen(row: ReturnType<typeof tenderRowFromMaster>): BillTenderRow {
  return { ...row, tempCredit: null, cheque: null, loyaltyPoints: 0, loyaltyRate: 0 };
}

export function RetenderDialog(props: RetenderDialogProps) {
  if (!props.isOpen) {
    return null;
  }
  return <RetenderDialogBody {...props} key={props.context?.sbBillRefno ?? "loading"} />;
}

function RetenderDialogBody({ isOpen, context, loading, masters, billDate, busy, onClose, onSubmit }: RetenderDialogProps) {
  const bankDropdownId = useDropdownId("bank");
  const [voids, setVoids] = useState<Record<string, VoidPick>>({});
  const [remark, setRemark] = useState("");
  const [rows, setRows] = useState<BillTenderRow[]>(() =>
    usableTenders(masters, billDate || todayIso(), "settlement")
      .map((master, index) => widen(tenderRowFromMaster(master, index)))
      .filter((row) => replacementTenderAllowed(row.typeCode, row.tenderTypeId)),
  );
  const [text, setText] = useState<Record<string, string>>({});

  const live = context ? liveTenderRows(context) : [];
  const voidList = useMemo(() => Object.values(voids), [voids]);
  const figures = context ? retenderFigures(context, voidList, rows) : { voided: 0, replaced: 0, matched: false };
  const blocker = context ? retenderBlocker(context, voidList, rows, remark) : "Reading the bill…";
  const refusal = context ? retenderRefusal(context) : null;

  const patchRow = (key: string, patch: Partial<BillTenderRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const commitAmount = (row: BillTenderRow) => {
    const raw = text[row.key];
    if (raw === undefined) return;
    const base = money(Math.abs(parseCell(raw)));
    setText((current) => {
      const next = { ...current };
      delete next[row.key];
      return next;
    });
    if (row.maxAmount !== null && row.maxAmount > 0 && base > row.maxAmount + 0.005) {
      toast.warn(`${row.tenderName} cannot take more than ${formatCurrency(row.maxAmount)}.`);
      patchRow(row.key, { keyed: 0 });
      return;
    }
    if (row.typeCode === "CHEQUE" && base > 0 && !row.instrumentDate) {
      patchRow(row.key, { keyed: base, instrumentDate: todayIso(), cheque: row.cheque ?? { drawerName: null, bankBranch: null, ifsc: null, micr: null } });
      return;
    }
    patchRow(row.key, { keyed: base });
  };

  const submit = () => {
    if (!context) return;
    if (blocker) {
      toast.error(blocker);
      return;
    }
    for (const row of rows) {
      if (row.keyed <= 0.005) continue;
      const spec = instrumentSpecOf(row.typeCode);
      const needsRef = (row.needsRef && row.typeCode !== "UPI") || row.typeCode === "CHEQUE";
      if (needsRef && !(row.refNo ?? "").trim()) {
        toast.error(`${row.tenderName} needs its ${spec.refLabel ?? "reference"}.`);
        return;
      }
      if (row.typeCode === "CHEQUE" && !(row.bankName ?? "").trim()) {
        toast.error(`${row.tenderName} needs the bank the cheque is drawn on.`);
        return;
      }
      if (row.cheque?.ifsc && !IFSC_PATTERN.test(row.cheque.ifsc.toUpperCase())) {
        toast.error("IFSC is 4 letters, a 0, then 6 letters or digits (SBIN0001234).");
        return;
      }
      if (row.cheque?.micr && !MICR_PATTERN.test(row.cheque.micr)) {
        toast.error("MICR is exactly 9 digits.");
        return;
      }
    }
    void onSubmit(voidList.filter((pick) => pick.reason), rows.filter((row) => row.keyed > 0.005), remark);
  };

  return (
    <ModalShell
      title="Re-tender"
      isOpen={isOpen}
      wide
      onClose={onClose}
      footer={
        <>
          <span className={cx(styles.retenderFigures, figures.matched ? styles.factGreen : styles.factAmber)}>
            Voided {formatCurrency(figures.voided)} · New {formatCurrency(figures.replaced)}
          </span>
          <button type="button" className={quotationStyles.button} disabled={busy} onClick={onClose}>
            Cancel <span className={quotationStyles.buttonHint}>Esc</span>
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={busy || loading || Boolean(blocker)}
            title={blocker ?? undefined}
            onClick={submit}
          >
            {busy ? "Re-tendering…" : "OK"}
          </button>
        </>
      }
    >
      {loading || !context ? <p className={quotationStyles.modalNote}>Reading the bill&apos;s tenders…</p> : null}
      {context ? (
        <>
          <p className={styles.retenderHead}>
            Bill <strong>{context.sbBillRefno ?? "—"}</strong> · {context.sbBillDate ? toDisplayDate(context.sbBillDate.slice(0, 10)) : "—"} ·{" "}
            {context.sbCustName ?? "—"} · total {formatCurrency(context.sbBillAmt)} · paid {formatCurrency(context.sbPaidAmt)}
          </p>
          {refusal ? <p className={quotationStyles.warning}>{refusal}</p> : null}

          <div className={quotationStyles.gridHeadTitle}>As it was tendered — tick what did NOT happen</div>
          <table className={styles.retenderTable}>
            <thead>
              <tr>
                <th>Void</th>
                <th>Tender</th>
                <th className={quotationStyles.alignRight}>Amount</th>
                <th>Reason</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {live.map((row) => {
                const pick = voids[row.tdId];
                const note = tenderRowNote(row);
                return (
                  <tr key={row.tdId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(pick?.reason)}
                        disabled={row.pdcMoved || busy}
                        onChange={(event) =>
                          setVoids((current) => {
                            const next = { ...current };
                            if (event.target.checked) {
                              next[row.tdId] = { tdId: row.tdId, reason: current[row.tdId]?.reason || "KEYED_WRONG" };
                            } else {
                              delete next[row.tdId];
                            }
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>{row.tenderName ?? "?"}</td>
                    <td className={quotationStyles.alignRight}>{formatCurrency(row.tdAmount)}</td>
                    <td>
                      <select
                        className={quotationStyles.select}
                        value={pick?.reason ?? ""}
                        disabled={!pick || busy}
                        onChange={(event) =>
                          setVoids((current) => ({ ...current, [row.tdId]: { tdId: row.tdId, reason: event.target.value as VoidPick["reason"] } }))
                        }
                      >
                        <option value="">—</option>
                        {RETENDER_VOID_REASONS.map((reason) => (
                          <option key={reason.value} value={reason.value}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={note?.tone === "red" ? styles.factAmber : styles.factGrey}>{note?.text ?? ""}</td>
                  </tr>
                );
              })}
              {live.length === 0 ? (
                <tr>
                  <td colSpan={5} className={quotationStyles.emptyGrid}>
                    Nothing live to void on this bill.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <div className={quotationStyles.gridHeadTitle}>What really happened</div>
          <table className={styles.retenderTable}>
            <thead>
              <tr>
                <th>Tender</th>
                <th className={quotationStyles.alignRight}>Amount</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const spec = instrumentSpecOf(row.typeCode);
                const isCheque = row.typeCode === "CHEQUE";
                const isCard = row.typeCode === "CARD";
                const showRef = row.needsRef || isCheque || Boolean(spec.refLabel);
                return (
                  <tr key={row.key}>
                    <td>{row.tenderName}</td>
                    <td className={quotationStyles.alignRight}>
                      <input
                        className={cx(orderStyles.tenderAmountInput)}
                        inputMode="decimal"
                        value={text[row.key] ?? (row.keyed ? String(row.keyed) : "")}
                        disabled={busy}
                        aria-label={`${row.tenderName} amount`}
                        onChange={(event) => setText((current) => ({ ...current, [row.key]: event.target.value }))}
                        onBlur={() => commitAmount(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitAmount(row);
                          }
                        }}
                      />
                    </td>
                    <td>
                      {row.keyed > 0.005 && (showRef || isCard || isCheque) ? (
                        <div className={styles.retenderInstrument}>
                          {showRef ? (
                            <input
                              className={quotationStyles.input}
                              value={row.refNo ?? ""}
                              maxLength={100}
                              placeholder={row.typeCode === "UPI" ? "UTR (optional)" : isCard ? "Slip No" : spec.refLabel ?? "Reference"}
                              onChange={(event) => patchRow(row.key, { refNo: event.target.value })}
                            />
                          ) : null}
                          {isCard || isCheque || spec.bank !== "none" ? (
                            <DropdownCombo
                              id={`rt-bank-${row.key}`}
                              label="Bank"
                              dropdownId={bankDropdownId}
                              valueKey="bnk_name"
                              labelKey="bnk_name"
                              value={row.bankName ?? ""}
                              selectedLabel={row.bankName ?? ""}
                              placeholder="Search banks…"
                              onSelect={(value) => patchRow(row.key, { bankName: value })}
                            />
                          ) : null}
                          {isCard ? (
                            <Field label="Card No (last 4 kept)" htmlFor={`rt-card-${row.key}`}>
                              <input id={`rt-card-${row.key}`} className={quotationStyles.input} inputMode="numeric" maxLength={19} value={row.cardDigits ?? ""} onChange={(event) => patchRow(row.key, { cardDigits: event.target.value })} />
                            </Field>
                          ) : null}
                          {isCard ? (
                            <Field label="Expiry" htmlFor={`rt-exp-${row.key}`}>
                              <input id={`rt-exp-${row.key}`} className={quotationStyles.input} type="month" value={row.instrumentDate ? row.instrumentDate.slice(0, 7) : ""} onChange={(event) => patchRow(row.key, { instrumentDate: event.target.value ? `${event.target.value}-01` : null })} />
                            </Field>
                          ) : null}
                          {isCheque ? (
                            <>
                              <DateField id={`rt-chq-date-${row.key}`} label="Cheque Date" value={row.instrumentDate ?? ""} disabled={false} onChange={(value) => patchRow(row.key, { instrumentDate: value || null })} />
                              <Field label="Drawer" htmlFor={`rt-drawer-${row.key}`}>
                                <input id={`rt-drawer-${row.key}`} className={quotationStyles.input} maxLength={150} value={row.cheque?.drawerName ?? ""} onChange={(event) => patchRow(row.key, { cheque: { ...(row.cheque ?? { drawerName: null, bankBranch: null, ifsc: null, micr: null }), drawerName: event.target.value } })} />
                              </Field>
                              <Field label="Bank Branch" htmlFor={`rt-branch-${row.key}`}>
                                <input id={`rt-branch-${row.key}`} className={quotationStyles.input} maxLength={100} value={row.cheque?.bankBranch ?? ""} onChange={(event) => patchRow(row.key, { cheque: { ...(row.cheque ?? { drawerName: null, bankBranch: null, ifsc: null, micr: null }), bankBranch: event.target.value } })} />
                              </Field>
                              <Field label="IFSC" htmlFor={`rt-ifsc-${row.key}`}>
                                <input id={`rt-ifsc-${row.key}`} className={quotationStyles.input} maxLength={11} value={row.cheque?.ifsc ?? ""} onChange={(event) => patchRow(row.key, { cheque: { ...(row.cheque ?? { drawerName: null, bankBranch: null, ifsc: null, micr: null }), ifsc: event.target.value.toUpperCase() } })} />
                              </Field>
                              <Field label="MICR" htmlFor={`rt-micr-${row.key}`}>
                                <input id={`rt-micr-${row.key}`} className={quotationStyles.input} maxLength={9} inputMode="numeric" value={row.cheque?.micr ?? ""} onChange={(event) => patchRow(row.key, { cheque: { ...(row.cheque ?? { drawerName: null, bankBranch: null, ifsc: null, micr: null }), micr: event.target.value.replace(/\D/g, "") } })} />
                              </Field>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className={quotationStyles.emptyGrid}>
                    No tender in the master can replace a payment here.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <label className={quotationStyles.label} htmlFor="rt-remark">
            Remark<span className={quotationStyles.requiredMark}>*</span>
            <input
              id="rt-remark"
              className={quotationStyles.input}
              value={remark}
              maxLength={250}
              disabled={busy}
              placeholder="UPI failed at counter, paid cash"
              onChange={(event) => setRemark(event.target.value)}
            />
          </label>
        </>
      ) : null}
    </ModalShell>
  );
}
