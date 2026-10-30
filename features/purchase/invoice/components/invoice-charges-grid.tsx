"use client";

/**
 * Purchase Entry's charges grid — ui_table 62 "PURCHASE INVOICE - CHARGES"
 * (Qt NexERP 88cd3f2, `tblCharges`): Charge, On bill, Basis, Rate, Amount,
 * Payee, GST, Net.
 *
 * Charge-master rows only (module P / B); the server prices them. On a draft the
 * Rate and the Amount open: a typed Amount is sent as the amount, typing the
 * Rate hands pricing back to the server. An off-bill charge (our own cost —
 * unloading coolie and the like) names who is owed it: Payees… or a
 * double-click on its Payee cell.
 *
 * Keys in a cell: Enter commits and moves Rate → Amount → the next row's Rate;
 * Delete on the row's Charge cell (or the ✕) removes the charge. "Add charge"
 * (or Insert anywhere in the grid) opens the picker.
 */
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { PurchaseChargeNumberCell } from "../../shared/components/purchase-charge-cell";
import { money } from "../../shared/purchase.format";
import { basisText, intoCostText, masterOnBill, payeeText } from "../invoice-charges";
import type { InvoiceChargeRow, PurchaseChargeMasterRow } from "../invoice-header.types";
import { purchaseFigureClass } from "../../shared/components/purchase-parts";
import styles from "./invoice-side.module.scss";

/** Qt `PurchaseChargeCols` — the ui_table 62 column numbers this grid draws. */
const CCOL = { Charge: 0, OnBill: 1, Basis: 2, Rate: 3, Amount: 4, Payee: 5, Gst: 6, Net: 7 } as const;
/** The mockup's order (Qt moveSection: Payee · Into cost · GST — Into cost sits in ui_table 62's Net column). */
const SHOWN = [CCOL.Charge, CCOL.OnBill, CCOL.Basis, CCOL.Rate, CCOL.Amount, CCOL.Payee, CCOL.Net, CCOL.Gst];
const FALLBACK_TITLES: Record<number, string> = {
  [CCOL.Charge]: "Charge",
  [CCOL.OnBill]: "On bill",
  [CCOL.Basis]: "Basis",
  [CCOL.Rate]: "Rate",
  [CCOL.Amount]: "Amount",
  [CCOL.Payee]: "Payee",
  [CCOL.Gst]: "GST",
  [CCOL.Net]: "Into cost",
};
const FALLBACK_WIDTHS: Record<number, number> = { 0: 18, 1: 6, 2: 16, 3: 8, 4: 10, 5: 18, 6: 8, 7: 10 };
const NUMBER_COLUMNS = new Set<number>([CCOL.Rate, CCOL.Amount, CCOL.Gst]);
const MONEY_PATTERN = /^\d*(\.\d{0,4})?$/;

type ChargeColumn = { no: number; header: string; widthPct: number };

/** ui_table 62's titles, widths (as weights), order and visibility; Charge never hides. */
function resolveChargeColumns(rows: readonly UiTableColumnRow[] | undefined): ChargeColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const placed = SHOWN.flatMap((no, index) => {
    const row = byNumber.get(no);
    if (row && row.uiTblClmColumnVisibility === false && no !== CCOL.Charge) {
      return [];
    }
    const width = row && typeof row.uiTblClmColumnWidth === "number" && row.uiTblClmColumnWidth > 0 ? row.uiTblClmColumnWidth : FALLBACK_WIDTHS[no];
    // Qt: the mockup's order, and "Into cost" on the Net column whatever the registration calls it
    const header = no === CCOL.Net ? FALLBACK_TITLES[no] : (row?.uiTblClmName ?? "").trim() || FALLBACK_TITLES[no];
    return [{ no, header, width, position: index }];
  });
  placed.sort((left, right) => left.position - right.position);
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map((column) => ({ no: column.no, header: column.header, widthPct: (column.width / total) * 100 }));
}

const CELL_ATTR = "data-pi-charge-cell";

function focusChargeCell(key: string, field: "rate" | "amount"): void {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLInputElement>(`[${CELL_ATTR}="${key}:${field}"]`)?.focus();
  });
}

/** A Rate / Amount cell (shared with the GRN): the typed copy is committed on Enter or on leaving it. */
function NumberCell({
  row,
  field,
  editable,
  onCommit,
  onEnter,
}: {
  row: InvoiceChargeRow;
  field: "rate" | "amount";
  editable: boolean;
  onCommit: (raw: string) => void;
  onEnter: () => void;
}) {
  const stored = field === "rate" ? row.rate : row.amount;
  return (
    <PurchaseChargeNumberCell
      className={styles.cellInput}
      value={stored}
      display={field === "amount" && row.priced && !row.typed && stored ? money(Number(stored)) : stored}
      pattern={MONEY_PATTERN}
      label={`${row.name} ${field}`}
      disabled={!editable}
      title={
        field === "amount"
          ? row.typed
            ? "Typed — sent as the amount. Type the Rate to let the server price it again."
            : "Priced by the server. Type an amount to send it instead."
          : "Type the rate; the server prices the amount."
      }
      attrs={{ [CELL_ATTR]: `${row.key}:${field}` }}
      onCommit={onCommit}
      onEnter={onEnter}
    />
  );
}

export type InvoiceChargesGridProps = {
  rows: readonly InvoiceChargeRow[];
  /** A draft open for keying. */
  editable: boolean;
  masters: readonly PurchaseChargeMasterRow[];
  mastersLoading: boolean;
  onAdd: (master: PurchaseChargeMasterRow) => void;
  onEdit: (key: string, field: "rate" | "amount", raw: string) => void;
  onRemove: (key: string) => void;
  /** Payees… for this row (the parent opens the dialog, or says why not). */
  onPayees: (key: string | null) => void;
};

export function InvoiceChargesGrid({ rows, editable, masters, mastersLoading, onAdd, onEdit, onRemove, onPayees }: InvoiceChargesGridProps) {
  const uiTableId = useUiTableId("purchaseInvoiceCharges");
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(() => resolveChargeColumns(layout), [layout]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpenState] = useState(false);
  /** Each opening mounts a fresh picker (its search starts empty). */
  const [pickerSeq, setPickerSeq] = useState(0);
  const setPickerOpen = (open: boolean) => {
    if (open) {
      setPickerSeq((seq) => seq + 1);
    }
    setPickerOpenState(open);
  };
  const filled = rows.filter((row) => row.chgId !== "");
  const active = filled.find((row) => row.key === activeKey) ?? null;

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!editable || event.defaultPrevented) {
      return;
    }
    if (event.key === "Insert") {
      event.preventDefault();
      setPickerOpen(true);
    }
  };

  const cell = (row: InvoiceChargeRow, no: number, index: number) => {
    switch (no) {
      case CCOL.Charge:
        return (
          <td key={no} title={row.name}>
            {editable ? (
              <button
                type="button"
                className={styles.linkButton}
                title="Remove this charge"
                aria-label={`Remove ${row.name}`}
                onClick={() => onRemove(row.key)}
                onKeyDown={(event) => {
                  if (event.key === "Delete") {
                    event.preventDefault();
                    onRemove(row.key);
                  }
                }}
              >
                ✕
              </button>
            ) : null}{" "}
            {row.name}
          </td>
        );
      case CCOL.OnBill:
        return <td key={no} className={purchaseFigureClass(row.onBill ? "good" : "warn")}>{row.onBill ? "Yes" : "No"}</td>;
      case CCOL.Basis:
        return (
          <td key={no} title={row.basis}>
            {row.basis}
          </td>
        );
      case CCOL.Rate:
        return (
          <td key={no} className={styles.num}>
            <NumberCell row={row} field="rate" editable={editable} onCommit={(raw) => onEdit(row.key, "rate", raw)} onEnter={() => focusChargeCell(row.key, "amount")} />
          </td>
        );
      case CCOL.Amount:
        return (
          <td key={no} className={styles.num}>
            <NumberCell
              row={row}
              field="amount"
              editable={editable}
              onCommit={(raw) => onEdit(row.key, "amount", raw)}
              onEnter={() => {
                const next = filled[index + 1];
                if (next) {
                  focusChargeCell(next.key, "rate");
                }
              }}
            />
          </td>
        );
      case CCOL.Payee:
        return (
          <td
            key={no}
            className={cx(styles.payeeCell, row.onBill || !editable ? styles.payeeCellOff : undefined)}
            title={row.onBill ? "On the supplier's bill — the supplier is paid for it." : "Double-click: who is owed this charge"}
            onDoubleClick={() => onPayees(row.key)}
          >
            {payeeText(row)}
          </td>
        );
      case CCOL.Gst:
        return (
          <td key={no} className={cx(styles.num, row.priced && row.gst === 0 ? purchaseFigureClass("muted") : undefined)}>
            {row.priced ? (row.gst === 0 ? "—" : money(row.gst)) : ""}
          </td>
        );
      case CCOL.Net:
        return (
          <td key={no} title={row.priced ? `Net ${money(row.net)}` : undefined}>
            {intoCostText(row)}
          </td>
        );
      default:
        return <td key={no} />;
    }
  };

  return (
    <section className={styles.charges} aria-label="Charges">
      <div className={styles.chargesHead}>
        <span className={styles.chargesNote}>Priced by the server · type an Amount to send it as is · Insert adds a charge</span>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={!editable}
          title="Pick a charge from the purchase charge master"
          onClick={() => setPickerOpen(true)}
        >
          Add charge
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={!editable || !active}
          title="Who is owed the selected off-bill charge (double-click its Payee cell does the same)"
          onClick={() => onPayees(active?.key ?? null)}
        >
          Payees…
        </button>
      </div>
      <div className={styles.chargesViewport} onKeyDown={onGridKeyDown}>
        <table className={styles.chargesTable}>
          <colgroup>
            {columns.map((column) => (
              <col key={column.no} style={{ width: `${column.widthPct}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.no} scope="col" className={NUMBER_COLUMNS.has(column.no) ? styles.num : undefined}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filled.map((row, index) => (
              <tr
                key={row.key}
                className={row.key === activeKey ? styles.chargeActive : undefined}
                onFocusCapture={() => setActiveKey(row.key)}
                onMouseDown={() => setActiveKey(row.key)}
              >
                {columns.map((column) => cell(row, column.no, index))}
              </tr>
            ))}
            <tr className={styles.addRow}>
              <td colSpan={columns.length}>
                {editable ? (
                  <button type="button" className={styles.linkButton} onClick={() => setPickerOpen(true)}>
                    + Add a charge
                  </button>
                ) : filled.length === 0 ? (
                  "No charges on this bill."
                ) : null}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PurchaseChargePicker
        key={pickerSeq}
        isOpen={pickerOpen}
        masters={masters}
        loading={mastersLoading}
        usedIds={filled.map((row) => row.chgId)}
        onClose={() => setPickerOpen(false)}
        onPick={(master) => {
          setPickerOpen(false);
          onAdd(master);
        }}
      />
    </section>
  );
}

/** The purchase charge master to pick from (Qt picker grid 82, module P). One row per charge on a bill. */
function PurchaseChargePicker({
  isOpen,
  masters,
  loading,
  usedIds,
  onClose,
  onPick,
}: {
  isOpen: boolean;
  masters: readonly PurchaseChargeMasterRow[];
  loading: boolean;
  usedIds: readonly string[];
  onClose: () => void;
  onPick: (master: PurchaseChargeMasterRow) => void;
}) {
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(0);
  const used = useMemo(() => new Set(usedIds), [usedIds]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return masters.filter(
      (master) =>
        !needle ||
        master.chgName.toLowerCase().includes(needle) ||
        (master.chgCode ?? "").toLowerCase().includes(needle) ||
        (master.chgLedgerName ?? "").toLowerCase().includes(needle),
    );
  }, [masters, search]);
  const selectable = rows.map((row, index) => (used.has(row.chgId) ? -1 : index)).filter((index) => index >= 0);
  const at = rows[cursor] && !used.has(rows[cursor].chgId) ? cursor : selectable[0] ?? -1;
  const step = (delta: 1 | -1) => {
    const position = selectable.indexOf(at);
    const next = position < 0 ? selectable[0] : selectable[position + delta];
    if (next !== undefined) {
      setCursor(next);
    }
  };
  return (
    <ModalShell
      title="Add charge"
      isOpen={isOpen}
      fixedHeight
      onClose={onClose}
      footer={
        <span className={quotationStyles.modalNote}>
          {loading ? "Loading the charge master…" : `${rows.length} of ${masters.length} purchase charges`}
          {used.size > 0 ? ` · ${used.size} already on this bill` : ""}
        </span>
      }
    >
      <input
        className={quotationStyles.input}
        value={search}
        placeholder="Filter by charge, code or ledger…"
        autoFocus
        autoComplete="off"
        onChange={(event) => {
          setSearch(event.target.value);
          setCursor(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            step(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            step(-1);
          } else if (event.key === "Enter" && rows[at]) {
            event.preventDefault();
            onPick(rows[at]);
          }
        }}
      />
      <div className={quotationStyles.listViewport}>
        <table className={quotationStyles.listTable}>
          <thead>
            <tr>
              <th scope="col">Charge</th>
              <th scope="col">On bill</th>
              <th scope="col">Basis</th>
              <th scope="col">Rate</th>
              <th scope="col">Ledger</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((master, index) => {
              const applied = used.has(master.chgId);
              const onBill = masterOnBill(master);
              return (
                <tr
                  key={master.chgId}
                  data-selected={index === at ? "true" : undefined}
                  data-disabled={applied ? "true" : undefined}
                  aria-disabled={applied || undefined}
                  title={applied ? `${master.chgName} is already on this bill.` : undefined}
                  onMouseEnter={() => {
                    if (!applied) {
                      setCursor(index);
                    }
                  }}
                  onClick={() => {
                    if (!applied) {
                      onPick(master);
                    }
                  }}
                >
                  <td>{master.chgName}</td>
                  <td>{onBill ? "Yes" : "No"}</td>
                  <td>{basisText(master.chgMethod ?? "", onBill, Boolean(master.chgBeforeTax), master.chgType ?? "")}</td>
                  <td className={quotationStyles.alignRight}>{String(master.chgDefaultRate ?? 0)}</td>
                  <td>{master.chgLedgerName ?? "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className={quotationStyles.emptyGrid}>
                  {loading ? "Loading…" : "No purchase charge matches that."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
