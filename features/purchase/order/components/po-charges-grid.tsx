"use client";

/**
 * ESTIMATED CHARGES (CHG-07) — Qt `PurchaseOrderEntry::setupChargesGrid`:
 * Charge · On bill (Yes green / No orange) · Basis · Rate · Amount (est.).
 * The rate (or a typed amount) is sent; the server works the estimate; the PO
 * total includes it; nothing posts. The last row picks a charge
 * ("add charge… (freight, coolie — an estimate in the PO total)"); − / Delete
 * on a row removes it.
 */
import { cx } from "@/components/design-system/cx";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import type { PurchaseChargeMasterRow } from "../../invoice/invoice-header.types";
import { purchaseFigureClass } from "../../shared/components/purchase-parts";
import { chargeBasis } from "../po-fidelity";
import type { PoChargeLine } from "../purchase-order.types";
import styles from "../page.module.scss";

export function PoChargesGrid({
  rows,
  editable,
  masters,
  onAdd,
  onEdit,
  onRemove,
}: {
  rows: readonly PoChargeLine[];
  editable: boolean;
  masters: readonly PurchaseChargeMasterRow[];
  onAdd: (master: PurchaseChargeMasterRow) => void;
  onEdit: (key: string, field: "rate" | "amount", raw: string) => void;
  onRemove: (key: string) => void;
}) {
  const live = masters.filter((m) => m.chgIsActive !== false && !m.chgIsDeleted && !rows.some((r) => r.chgId === m.chgId));
  return (
    <div className={cx(quotationStyles.gridViewport, styles.chargesViewport)} data-purchase-order-charges="">
      <table className={cx(quotationStyles.grid, styles.chargesTable)}>
        <colgroup>
          <col style={{ width: "5%" }} />
          <col style={{ width: "33%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "27%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "13%" }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Charge</th>
            <th scope="col">On bill</th>
            <th scope="col">Basis</th>
            <th scope="col" className={quotationStyles.alignRight}>
              Rate
            </th>
            <th scope="col" className={quotationStyles.alignRight}>
              Amount (est.)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.key}
              className={index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven}
              onKeyDown={(event) => {
                if (!editable || event.ctrlKey || event.altKey || event.metaKey) return;
                if (event.key === "-" || (event.key === "Delete" && event.shiftKey)) {
                  event.preventDefault();
                  onRemove(row.key);
                }
              }}
            >
              <td>
                <div className={quotationStyles.cellText}>{index + 1}</div>
              </td>
              <td>
                <div className={quotationStyles.cellText} title={editable ? "− removes this charge" : undefined}>
                  {row.name}
                </div>
              </td>
              <td>
                <div className={cx(quotationStyles.cellText, purchaseFigureClass(row.onBill ? "good" : "warn"))}>{row.onBill ? "Yes" : "No"}</div>
              </td>
              <td>
                <div className={quotationStyles.cellText}>{chargeBasis(row.method, row.onBill, row.type)}</div>
              </td>
              <td>
                {editable ? (
                  <input
                    className={cx(quotationStyles.cellInput, quotationStyles.alignRight)}
                    value={row.rate}
                    inputMode="decimal"
                    aria-label={`${row.name} rate`}
                    onChange={(event) => onEdit(row.key, "rate", event.target.value)}
                  />
                ) : (
                  <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>{row.rate}</div>
                )}
              </td>
              <td>
                {editable ? (
                  <input
                    className={cx(quotationStyles.cellInput, quotationStyles.alignRight)}
                    value={row.amount}
                    inputMode="decimal"
                    aria-label={`${row.name} amount`}
                    title="A typed amount wins over the rate"
                    onChange={(event) => onEdit(row.key, "amount", event.target.value)}
                  />
                ) : (
                  <div className={cx(quotationStyles.cellText, quotationStyles.alignRight)}>{row.amount}</div>
                )}
              </td>
            </tr>
          ))}
          {editable ? (
            <tr className={rows.length % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven}>
              <td>
                <div className={quotationStyles.cellText}>{rows.length + 1}</div>
              </td>
              <td colSpan={5}>
                <select
                  className={cx(quotationStyles.cellInput, styles.chargePick)}
                  value=""
                  aria-label="Add a charge"
                  onChange={(event) => {
                    const master = live.find((m) => m.chgId === event.target.value);
                    if (master) onAdd(master);
                  }}
                >
                  <option value="">add charge…   (freight, coolie — an estimate in the PO total)</option>
                  {live.map((m) => (
                    <option key={m.chgId} value={m.chgId}>
                      {m.chgName}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
