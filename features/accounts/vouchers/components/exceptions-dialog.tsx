"use client";

/**
 * Exceptions — bills settled by hand (the Qt `VoucherExceptionsDialog`,
 * grid 118 "VOUCHER REGISTER - EXCEPTIONS"): the journals, debit notes and
 * credit notes of this branch and year that settle a SALES or PURCHASE bill.
 * A bill is normally settled by a receipt, a payment or a return — these did
 * it by hand, and an auditor asks for exactly this list.
 *
 * All five tokens are sent, always (blank dates = the whole year). Enter or a
 * double-click on a row opens its voucher — on a type's own menu only that
 * type's (another is said), on the register any.
 */
import { useMemo, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useGridId } from "@/lib/configured-grids";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import { useConfiguredGridSettings } from "@/components/master/use-configured-grid-settings";
import { useListVoucherExceptionsQuery } from "@/store/api/vouchersApi";
import { chequeError } from "@/features/accounts/cheques/api-errors";
import receiptStyles from "@/features/accounts/receipt/page.module.scss";
import styles from "../vouchers.module.scss";
import { formatPaise } from "../domain/lines";
import type { VoucherKeys } from "../vouchers.types";

const PAGE_SIZE = 200;
/** Keys, not columns: the grid carries them for opening a row. */
const KEY_FIELDS = new Set(["avh_voucher_id", "avh_company_id", "avh_branch_id", "avh_acc_year"]);
const FALLBACK = [
  { field: "type_name", header: "Type" },
  { field: "avh_voucher_refno", header: "Voucher No" },
  { field: "avh_voucher_date", header: "Date" },
  { field: "party_name", header: "Party" },
  { field: "abl_bill_type", header: "Bill Type" },
  { field: "bill_refno", header: "Bill" },
  { field: "abj_adj_type", header: "Adj Type" },
  { field: "abj_amount", header: "Amount" },
  { field: "avh_voucher_status", header: "Status" },
  { field: "avh_remarks", header: "Narration" },
];

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function cellText(field: string, value: unknown): string {
  if (field === "avh_voucher_date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(value));
    return match ? `${match[3]}-${match[2]}-${match[1]}` : text(value);
  }
  if (field === "abj_amount") {
    const amount = Number(value);
    return Number.isFinite(amount) ? formatPaise(Math.round(amount * 100)) : text(value);
  }
  return text(value);
}

export type ExceptionsDialogProps = {
  companyId: string;
  branchId: string;
  accYear: string;
  /** The type this screen serves, by name — its rows open here; "" = any (the register). */
  typeName: string;
  onOpen: (keys: VoucherKeys) => void;
  onElsewhere: (message: string) => void;
  onClose: () => void;
};

export function ExceptionsDialog(props: ExceptionsDialogProps) {
  const { companyId, branchId, accYear, typeName, onOpen, onElsewhere, onClose } = props;
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [asked, setAsked] = useState({ fromDate: "", toDate });
  const [active, setActive] = useState(0);

  const gridId = useGridId("voucherExceptions");
  const { data: config } = useGetGridColumnsQuery({ gridId: Number(gridId) }, { skip: !gridId });
  const columns = useMemo(() => {
    const visible = (config ?? [])
      .filter((column) => column.visible)
      .map((column) => ({ field: column.sqlFieldName || column.accessorKey || column.key, header: column.header }))
      .filter((column) => !KEY_FIELDS.has(column.field));
    return visible.length > 0 ? visible : FALLBACK;
  }, [config]);

  const list = useListVoucherExceptionsQuery({
    companyId,
    branchId,
    accYear,
    fromDate: asked.fromDate,
    toDate: asked.toDate,
    page: 1,
    limit: PAGE_SIZE,
  });
  const rows = list.currentData?.items ?? [];
  // Right-click on the list: the master tables' grid settings (filter, visibility, Admin).
  const refetchList = list.refetch;
  const gridSettings = useConfiguredGridSettings({ gridId, columns: config, onSaved: () => void refetchList() });
  const at = Math.min(active, Math.max(0, rows.length - 1));

  const open = (row: Record<string, unknown> | undefined) => {
    if (!row || !text(row.avh_voucher_id)) {
      return;
    }
    if (typeName && text(row.type_name) !== typeName) {
      onElsewhere(`${text(row.avh_voucher_refno)} is a ${text(row.type_name)}, which has no screen in this client yet.`);
      return;
    }
    onOpen({
      companyId: text(row.avh_company_id),
      branchId: text(row.avh_branch_id),
      accYear: text(row.avh_acc_year).trim(),
      voucherId: text(row.avh_voucher_id),
    });
  };

  return (
    <ModalShell
      title="Voucher exceptions — bills settled by hand"
      isOpen
      wide
      fixedHeight
      onClose={onClose}
      footer={
        <div className={receiptStyles.dialogActions}>
          <button type="button" className={receiptStyles.button} onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div
        className={receiptStyles.dialogBody}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement) {
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(Math.min(rows.length - 1, at + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(Math.max(0, at - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            open(rows[at]);
          }
        }}
      >
        <p className={styles.hint}>
          Journals, debit notes and credit notes that settle a SALES or PURCHASE bill. A bill is normally settled by a
          receipt, a payment or a return — these did it by hand. Enter opens the voucher.
        </p>
        <div className={styles.checkRow} style={{ marginBottom: "0.5em" }}>
          <label className={styles.formLabel} htmlFor="exc-from">
            From
          </label>
          <input
            id="exc-from"
            type="date"
            className={receiptStyles.input}
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
          <label className={styles.formLabel} htmlFor="exc-to">
            To
          </label>
          <input
            id="exc-to"
            type="date"
            className={receiptStyles.input}
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
          <button
            type="button"
            className={receiptStyles.button}
            onClick={() => {
              setAsked({ fromDate, toDate });
              setActive(0);
            }}
          >
            Show
          </button>
        </div>
        {list.error ? <p className={styles.error}>{chequeError(list.error)}</p> : null}
        {gridSettings.overlays}
        <div
          tabIndex={0}
          className={styles.billsViewport}
          style={{ maxHeight: "none" }}
          onContextMenu={gridSettings.onContextMenu}
        >
          <table className={receiptStyles.panelTable}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.field}>{column.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className={receiptStyles.panelEmpty}>
                    {list.isFetching ? "Reading…" : "No bill was settled by hand in this window."}
                  </td>
                </tr>
              ) : null}
              {rows.map((row, index) => (
                <tr
                  key={`${text(row.avh_voucher_id)}-${index}`}
                  className={index === at ? receiptStyles.registerRowActive : undefined}
                  onClick={() => setActive(index)}
                  onDoubleClick={() => open(row)}
                >
                  {columns.map((column) => (
                    <td key={column.field} className={column.field === "abj_amount" ? styles.alignRight : undefined}>
                      {cellText(column.field, row[column.field])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ModalShell>
  );
}
