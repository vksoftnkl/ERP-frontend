"use client";

/**
 * Sister company bill (Qt NexERP 4c09536, DOC-08 `PurchaseSisterDialog`): the
 * sale bills our other companies raised on this company. Pull one (Enter, or a
 * double-click): its lines come with item, unit, qty, rate before tax, MRP,
 * batch and expiry, and each keeps its sale line — the server links the two and
 * locks the sale bill once the purchase is saved. A bill can be pulled once.
 */
import { useCallback, useEffect, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { money, num, purchaseRefusalText } from "../../shared/purchase.format";
import { usePurchaseInvoiceSisterBillLinesMutation, usePurchaseInvoiceSisterBillsMutation } from "../invoice-header.api";
import type { SisterBill, SisterBillPull } from "../invoice-header.types";
import styles from "./invoice-side.module.scss";

function shortDate(iso: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** Mounted only while open: each opening reads the list afresh. */
export type SisterBillDialogProps = {
  companyId: string;
  branchId: string;
  onClose: () => void;
  onPulled: (pull: SisterBillPull) => void;
};

export function SisterBillDialog({ companyId, branchId, onClose, onPulled }: SisterBillDialogProps) {
  const [listBills] = usePurchaseInvoiceSisterBillsMutation();
  const [readLines] = usePurchaseInvoiceSisterBillLinesMutation();
  const [bills, setBills] = useState<SisterBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [hint, setHint] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    let live = true;
    listBills({ companyId, branchId })
      .unwrap()
      .then((rows) => {
        if (!live) {
          return;
        }
        setBills(rows);
        setHint(rows.length > 0 ? "" : "No sister company has raised a bill on this company.");
      })
      .catch((error: unknown) => {
        if (live) {
          setHint(purchaseRefusalText(error));
        }
      })
      .finally(() => {
        if (live) {
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [branchId, companyId, listBills]);

  const pull = useCallback(
    async (index: number) => {
      const bill = bills[index];
      if (!bill || pulling) {
        return;
      }
      if (bill.blocked) {
        setHint(bill.blocked);
        return;
      }
      setPulling(true);
      try {
        const answer = await readLines({ companyId, branchId, sbId: bill.sbId, accYear: bill.accYear }).unwrap();
        onPulled(answer);
      } catch (error) {
        setHint(purchaseRefusalText(error));
      } finally {
        setPulling(false);
      }
    },
    [bills, branchId, companyId, onPulled, pulling, readLines],
  );

  return (
    <ModalShell
      title="Sister company bill"
      isOpen
      wide
      fixedHeight
      onClose={onClose}
      footer={
        <div className={styles.dialogFooter}>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={pulling || !bills[cursor]}
            onClick={() => void pull(cursor)}
          >
            {pulling ? "Pulling…" : "Pull · Enter"}
          </button>
          <button type="button" className={quotationStyles.button} onClick={onClose}>
            Close · Esc
          </button>
        </div>
      }
    >
      <div
        className={styles.dialogBody}
        tabIndex={-1}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setCursor((at) => Math.min(bills.length - 1, at + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setCursor((at) => Math.max(0, at - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            void pull(cursor);
          }
        }}
      >
        <p className={styles.dialogHint}>
          Sale bills our other companies raised on this company. Pull one: its lines come with item, unit, qty, rate before tax,
          MRP, batch and expiry. A bill can be pulled once.
        </p>
        <table className={styles.dialogTable}>
          <thead>
            <tr>
              <th scope="col">Bill</th>
              <th scope="col">Date</th>
              <th scope="col">From company</th>
              <th scope="col" className={styles.num}>
                Amount
              </th>
              <th scope="col" className={styles.num}>
                Items
              </th>
              <th scope="col">Our supplier</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill, index) => (
              <tr
                key={`${bill.sbId}:${bill.accYear}`}
                className={cx(index === cursor ? styles.rowActive : undefined, bill.blocked ? styles.rowBlocked : undefined)}
                onClick={() => setCursor(index)}
                onDoubleClick={() => void pull(index)}
              >
                <td>{bill.refno}</td>
                <td>{shortDate(bill.billDate)}</td>
                <td>{bill.sisterCompanyName ?? ""}</td>
                <td className={styles.num}>{money(num(bill.amount))}</td>
                <td className={styles.num}>{bill.items ?? ""}</td>
                <td>{bill.supplierName ?? "— not set up as a supplier"}</td>
                <td>{bill.blocked ?? "Ready"}</td>
              </tr>
            ))}
            {loading ? (
              <tr>
                <td colSpan={7}>Loading…</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {hint ? <p className={styles.dialogError}>{hint}</p> : null}
      </div>
    </ModalShell>
  );
}
