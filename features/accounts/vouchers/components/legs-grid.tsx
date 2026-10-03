"use client";

/**
 * The typed legs — `ui_tables` 39, "VOUCHER REGISTER - LEGS".
 *
 * Its layout (order, headings, widths, visibility) is the configured one, read
 * through the receipt's join; on top of it the TYPE hides what it cannot use —
 * the Qt `applyLegColumns`: no GST / HSN without a GST register, no TDS
 * without TDS, no Instrument without instruments, and never the Generated
 * flag. On a Contra that leaves # · Dr/Cr · Ledger · Group · Debit · Credit ·
 * Role · Leg narration.
 *
 * Keys, as in Qt: a typed character, Enter or F2 on the Ledger cell opens the
 * picker; Insert (or + on a non-text cell) adds a line below; Ctrl+Delete (or
 * − on a non-text cell) removes this one. The blank line at the bottom is
 * where the next line is typed, and is never removed. Enter on an amount
 * opens a party line's bill-wise popup (else moves to the next line); Enter
 * or Ctrl+Q on the Instrument cell opens its dialog.
 *
 * Under the typed lines, the legs the SERVER adds (an instrument's money leg,
 * a payment's TDS): locked, grey — amber when they post later, on a
 * post-dated cheque's own voucher. Editing one is refused with the reason.
 *
 * On a receipt or payment the side follows the ledger: once picked, the
 * Dr/Cr cell refuses a change and the other amount column hands the cursor
 * to the line's own.
 *
 * On a GST-band type each line opposite the party takes a rate (the GST
 * cell, `/vouchers/tax-rates`) and an HSN/SAC; the amount typed is the
 * TAXABLE value and the server adds the tax legs. A party-side line carries
 * no rate — the server would add tax to it, never take it off.
 */
import { useMemo, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  resolveReceiptColumns,
  type ReceiptColumnMeaning,
  type ResolvedReceiptColumn,
} from "@/features/accounts/receipt/columns";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { scaledWidth, totalColumnWidth } from "@/features/sales/quotation/quotation.utils";
import styles from "@/features/accounts/receipt/page.module.scss";
import own from "../vouchers.module.scss";
import { generatedInstrumentText, type GeneratedRow } from "../domain/generated";
import { instrumentChip, instrumentSummary } from "../domain/instruments";
import { formatPaise, sideLocked, typeAmount, type VoucherLine } from "../domain/lines";
import type { DrCr, InstrumentTenderRow, TaxRateRow, VoucherTypeRules } from "../vouchers.types";

export type LegColumnKey =
  | "rowNo"
  | "drCr"
  | "ledger"
  | "group"
  | "gst"
  | "hsn"
  | "tds"
  | "debit"
  | "credit"
  | "role"
  | "remarks"
  | "generated"
  | "instrument";

const LEG_MEANINGS: ReceiptColumnMeaning<LegColumnKey>[] = [
  { key: "rowNo", token: "#", kind: "serial", align: "right" },
  { key: "drCr", token: "Dr/Cr", kind: "flag", align: "center" },
  { key: "ledger", token: "Ledger", kind: "picker", align: "left" },
  { key: "group", token: "Group", kind: "text", align: "left" },
  { key: "gst", token: "GST", kind: "text", align: "left" },
  { key: "hsn", token: "HSN/SAC", kind: "text", align: "left" },
  { key: "tds", token: "TDS", kind: "flag", align: "center" },
  { key: "debit", token: "Debit", kind: "money", align: "right" },
  { key: "credit", token: "Credit", kind: "money", align: "right" },
  { key: "role", token: "Role", kind: "text", align: "left" },
  { key: "remarks", token: "Leg narration", kind: "text", align: "left" },
  { key: "generated", token: "Generated", kind: "flag", align: "center" },
  { key: "instrument", token: "Instrument", kind: "text", align: "left" },
];

const LEG_NUMBERS: Record<LegColumnKey, number> = {
  rowNo: 0,
  drCr: 1,
  ledger: 2,
  group: 3,
  gst: 4,
  hsn: 5,
  tds: 6,
  debit: 7,
  credit: 8,
  role: 9,
  remarks: 10,
  generated: 11,
  instrument: 12,
};

/** Every configured column, hidden ones included — what the Admin settings dialog lists. */
export function allLegColumns(rows: UiTableColumnRow[] | undefined): ResolvedReceiptColumn<LegColumnKey>[] {
  return resolveReceiptColumns(rows, LEG_MEANINGS, LEG_NUMBERS);
}

/** The configured layout, less what the type has no use for. */
export function resolveLegColumns(
  rows: UiTableColumnRow[] | undefined,
  rules: Pick<VoucherTypeRules, "gstRegister" | "tdsMode" | "instruments"> | null,
): ResolvedReceiptColumn<LegColumnKey>[] {
  return legColumnsFor(allLegColumns(rows), rules);
}

/** What the grid draws: the visible columns the type has a use for. */
export function legColumnsFor(
  columns: readonly ResolvedReceiptColumn<LegColumnKey>[],
  rules: Pick<VoucherTypeRules, "gstRegister" | "tdsMode" | "instruments"> | null,
): ResolvedReceiptColumn<LegColumnKey>[] {
  const hidden = new Set<LegColumnKey>(["generated"]);
  if (!rules?.gstRegister) {
    hidden.add("gst");
    hidden.add("hsn");
  }
  if (!rules || rules.tdsMode === "OFF") {
    hidden.add("tds");
  }
  if (!rules?.instruments) {
    hidden.add("instrument");
  }
  return columns.filter((column) => column.visible && !hidden.has(column.key));
}

export type LineNote = { role: string; amountTitle: string; chip: string };

export type LegsGridProps = {
  columns: ResolvedReceiptColumn<LegColumnKey>[];
  lines: VoucherLine[];
  /** The server's legs, drawn under the typed ones. */
  generated: readonly GeneratedRow[];
  /** They answer an earlier state of the lines: dimmed. */
  generatedStale: boolean;
  /** RECEIPT / PAYMENT lock a line's side once its ledger is picked. */
  nature: string | null;
  tenders: readonly InstrumentTenderRow[];
  /** A GST-band type: the rates, and the side a rate may go on (opposite the party). */
  taxRates: readonly TaxRateRow[];
  gstSide: DrCr | null;
  readOnly: boolean;
  /** Per line key: the refusal or warning the server raised about it. */
  problems: ReadonlyMap<string, string>;
  /** Per line key: "net of TDS", the amount's tooltip, the bill-wise chip. */
  notes: ReadonlyMap<string, LineNote>;
  currentKey: string | null;
  onCurrent: (key: string) => void;
  onChange: (key: string, change: (line: VoucherLine) => VoucherLine) => void;
  /** Dr/Cr chosen by hand; the reason when it is refused. */
  onSide: (key: string, side: DrCr) => string | null;
  /** A payment line's TDS base said by hand; null = the ledger's own flag. */
  onTdsBase: (key: string, value: boolean | null) => void;
  /** Open the picker on this line, seeding its search with what was typed. */
  onPickLedger: (key: string, seed: string) => void;
  onOpenInstrument: (key: string) => void;
  /** Enter on an amount. */
  onAmountEnter: (key: string) => void;
  /** Something refused, said where the operator is looking. */
  onRefuse: (message: string) => void;
  onInsertAfter: (key: string) => void;
  onRemove: (key: string) => void;
  /** Right-click: "save column width" and "Admin settings". */
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
  /** A heading dragged to a new width — saved from the right-click menu. */
  resizingKey?: string | null;
  onColumnResizeStart?: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
};

const GENERATED_REFUSAL = "Worked out by the server from the typed lines — change those lines to change this.";

const ALIGN_CLASS: Record<string, string> = {
  left: "",
  right: styles.alignRight,
  center: styles.alignCenter,
};

export function LegsGrid(props: LegsGridProps) {
  const {
    columns,
    lines,
    generated,
    generatedStale,
    nature,
    tenders,
    taxRates,
    gstSide,
    readOnly,
    problems,
    notes,
    currentKey,
    onCurrent,
    onChange,
    onSide,
    onTdsBase,
    onPickLedger,
    onOpenInstrument,
    onAmountEnter,
    onRefuse,
    onInsertAfter,
    onRemove,
    onContextMenu,
    resizingKey = null,
    onColumnResizeStart,
  } = props;
  const tableWidth = useMemo(() => totalColumnWidth(columns), [columns]);
  const lastKey = lines[lines.length - 1]?.key ?? null;

  const rowKeys = (event: KeyboardEvent<HTMLElement>, line: VoucherLine) => {
    if (readOnly) {
      return;
    }
    const target = event.target as HTMLElement;
    const textBox = target instanceof HTMLInputElement;
    if (event.key === "Insert" || (event.key === "+" && !textBox)) {
      event.preventDefault();
      onInsertAfter(line.key);
      return;
    }
    if ((event.key === "Delete" && event.ctrlKey) || (event.key === "-" && !textBox)) {
      event.preventDefault();
      onRemove(line.key);
      return;
    }
    if (event.ctrlKey && (event.key === "q" || event.key === "Q")) {
      event.preventDefault();
      onOpenInstrument(line.key);
    }
  };

  const cell = (column: ResolvedReceiptColumn<LegColumnKey>, line: VoucherLine, index: number) => {
    const blank = line.key === lastKey && !line.ledgerId && !line.amount.trim();
    const locked = sideLocked(line, nature);
    const note = notes.get(line.key);
    switch (column.key) {
      case "rowNo":
        return <span className={`${styles.cellText} ${styles.alignRight}`}>{blank ? "" : index + 1}</span>;
      case "drCr":
        return (
          <select
            className={`${styles.cellSelect} ${styles.alignCenter} ${own.drCrSelect}`}
            value={line.drCr}
            disabled={readOnly}
            data-line-key={line.key}
            data-col="drCr"
            title={locked ? "The side follows the ledger on this voucher." : undefined}
            onFocus={() => onCurrent(line.key)}
            onChange={(event) => {
              const refused = onSide(line.key, event.target.value as DrCr);
              if (refused) {
                onRefuse(refused);
              }
            }}
            onKeyDown={(event) => rowKeys(event, line)}
          >
            <option value="DR">Dr</option>
            <option value="CR">Cr</option>
          </select>
        );
      case "ledger":
        return (
          <button
            type="button"
            className={styles.cellSelect}
            disabled={readOnly}
            data-line-key={line.key}
            data-col="ledger"
            title={
              readOnly
                ? "This voucher is read-only."
                : note?.chip
                  ? `${note.chip} — Enter on the amount to change it`
                  : "Enter, F2 or a typed letter opens the ledger picker"
            }
            onFocus={() => onCurrent(line.key)}
            onClick={() => onPickLedger(line.key, "")}
            onKeyDown={(event) => {
              if (readOnly) {
                return;
              }
              if (event.key === "Enter" || event.key === "F2") {
                event.preventDefault();
                onPickLedger(line.key, "");
                return;
              }
              if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.altKey && event.key !== "+" && event.key !== "-") {
                event.preventDefault();
                onPickLedger(line.key, event.key);
                return;
              }
              rowKeys(event, line);
            }}
          >
            {line.ledgerName || (line.ledgerId ? "…" : "")}
          </button>
        );
      case "group":
        return (
          <span className={`${styles.cellText} ${styles.cellMuted}`} title="The group comes with the ledger.">
            {line.groupName}
          </span>
        );
      case "gst": {
        if (!line.ledgerId) {
          return <span className={styles.cellText} />;
        }
        const partySide = gstSide !== null && line.drCr !== gstSide;
        const rateName = taxRates.find((rate) => rate.taxId === line.taxId)?.name ?? (line.taxId ? "…" : "");
        if (readOnly) {
          return <span className={styles.cellText}>{rateName}</span>;
        }
        return (
          <select
            className={styles.cellSelect}
            value={partySide ? "" : line.taxId}
            disabled={partySide}
            data-line-key={line.key}
            data-col="gst"
            title={
              partySide
                ? `Tax goes on the ${gstSide === "DR" ? "Debit" : "Credit"} lines — the party's side carries none.`
                : "The line's GST rate; its amount is the taxable value and the tax is added on top."
            }
            onFocus={() => onCurrent(line.key)}
            onChange={(event) => onChange(line.key, (row) => ({ ...row, taxId: event.target.value }))}
            onKeyDown={(event) => rowKeys(event, line)}
          >
            <option value="">— none —</option>
            {line.taxId && !taxRates.some((rate) => rate.taxId === line.taxId) ? (
              <option value={line.taxId}>{rateName}</option>
            ) : null}
            {taxRates.map((rate) => (
              <option key={rate.taxId} value={rate.taxId}>
                {rate.name}
              </option>
            ))}
          </select>
        );
      }
      case "hsn": {
        const partySide = gstSide !== null && line.drCr !== gstSide;
        if (readOnly || !line.ledgerId || partySide) {
          return <span className={styles.cellText}>{partySide ? "" : line.hsn}</span>;
        }
        return (
          <input
            className={styles.cellInput}
            inputMode="numeric"
            value={line.hsn}
            maxLength={8}
            data-line-key={line.key}
            data-col="hsn"
            title="HSN / SAC — a code starting 99 is a service."
            onFocus={() => onCurrent(line.key)}
            onChange={(event) => {
              const hsn = event.target.value.replace(/\D/g, "").slice(0, 8);
              onChange(line.key, (row) => ({ ...row, hsn }));
            }}
            onKeyDown={(event) => rowKeys(event, line)}
          />
        );
      }
      case "debit":
      case "credit": {
        const side: DrCr = column.key === "debit" ? "DR" : "CR";
        const wrongColumn = locked && line.drCr !== side;
        return (
          <input
            className={`${styles.cellInput} ${styles.alignRight}`}
            inputMode="decimal"
            value={line.drCr === side ? line.amount : ""}
            disabled={readOnly}
            readOnly={wrongColumn}
            tabIndex={wrongColumn ? -1 : undefined}
            data-line-key={line.key}
            data-col={column.key}
            title={line.drCr === side ? note?.amountTitle || undefined : undefined}
            placeholder={line.drCr === side && line.ledgerId && !line.amount ? "0.00" : ""}
            onFocus={(event) => {
              onCurrent(line.key);
              if (wrongColumn) {
                // A locked line's figure goes in its own column: hand the cursor over.
                const ownColumn = line.drCr === "DR" ? "debit" : "credit";
                event.currentTarget
                  .closest("tr")
                  ?.querySelector<HTMLInputElement>(`[data-col="${ownColumn}"]`)
                  ?.focus();
                onRefuse(
                  line.drCr === "CR"
                    ? "This ledger is credited on this voucher: the amount goes in Credit."
                    : "This ledger is debited on this voucher: the amount goes in Debit.",
                );
              }
            }}
            onChange={(event) => {
              const text = event.target.value.replace(/[^\d.,]/g, "");
              onChange(line.key, (row) => typeAmount(row, side, text, sideLocked(row, nature)));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.shiftKey && !readOnly) {
                event.preventDefault();
                onAmountEnter(line.key);
                return;
              }
              rowKeys(event, line);
            }}
          />
        );
      }
      case "tds": {
        const effective = line.tdsBase ?? line.flags?.isTdsApplicable ?? null;
        if (!line.ledgerId) {
          return <span className={styles.cellText} />;
        }
        if (readOnly) {
          return <span className={`${styles.cellText} ${styles.alignCenter}`}>{effective ? "✓" : ""}</span>;
        }
        return (
          <select
            className={`${styles.cellSelect} ${styles.alignCenter}`}
            value={line.tdsBase === null ? "" : line.tdsBase ? "Yes" : "No"}
            data-line-key={line.key}
            data-col="tds"
            title={
              line.tdsBase === null
                ? "The ledger's own TDS flag decides. Yes / No says it for this line."
                : "Said for this line — the ledger's flag is not read."
            }
            onFocus={() => onCurrent(line.key)}
            onChange={(event) =>
              onTdsBase(line.key, event.target.value === "" ? null : event.target.value === "Yes")
            }
            onKeyDown={(event) => rowKeys(event, line)}
          >
            <option value="">{line.flags ? (line.flags.isTdsApplicable ? "✓ ledger" : "— ledger") : "ledger's"}</option>
            <option value="Yes">✓ Yes</option>
            <option value="No">No</option>
          </select>
        );
      }
      case "role":
        return (
          <span className={`${styles.cellText} ${styles.cellMuted}`} title={note?.chip || "Only a worked-out leg carries a role."}>
            {note?.role || (note?.chip ? <span className={own.billsChip}>{note.chip}</span> : "")}
          </span>
        );
      case "instrument": {
        const ins = line.instrument;
        const pdc = Boolean(ins?.isPostDated);
        return (
          <button
            type="button"
            className={own.instrumentCell}
            disabled={readOnly && !ins}
            data-line-key={line.key}
            data-col="instrument"
            title={
              ins && pdc
                ? `Post-dated: its own voucher on ${ins.postsOn.split("-").reverse().join("-")}${
                    ins.voucherRefno ? ` (${ins.voucherRefno})` : ""
                  }`
                : readOnly
                  ? undefined
                  : "Enter, Ctrl+Q or a double-click: the instrument for this line"
            }
            onFocus={() => onCurrent(line.key)}
            onDoubleClick={() => !readOnly && onOpenInstrument(line.key)}
            onKeyDown={(event) => {
              if (!readOnly && (event.key === "Enter" || event.key === "F2")) {
                event.preventDefault();
                onOpenInstrument(line.key);
                return;
              }
              rowKeys(event, line);
            }}
          >
            {ins ? (
              <>
                <span className={`${own.instrumentChip} ${pdc ? own.instrumentChipPdc : ""}`}>
                  {instrumentChip(ins, tenders)}
                </span>
                <span className={own.instrumentText}>{instrumentSummary(ins)}</span>
              </>
            ) : null}
          </button>
        );
      }
      case "remarks":
        return (
          <input
            className={styles.cellInput}
            value={line.remarks}
            maxLength={250}
            disabled={readOnly}
            data-line-key={line.key}
            data-col="remarks"
            onFocus={() => onCurrent(line.key)}
            onChange={(event) => onChange(line.key, (row) => ({ ...row, remarks: event.target.value }))}
            onKeyDown={(event) => rowKeys(event, line)}
          />
        );
      default:
        return null;
    }
  };

  /** A leg the server added: read, never edited. */
  const derivedCell = (column: ResolvedReceiptColumn<LegColumnKey>, row: GeneratedRow): ReactNode => {
    const text = (value: string, extra = "") => (
      <span className={`${styles.cellText} ${extra}`} title={GENERATED_REFUSAL}>
        {value}
      </span>
    );
    switch (column.key) {
      case "rowNo":
        return (
          <span className={`${styles.cellText} ${styles.alignRight}`} title={GENERATED_REFUSAL}>
            <span className={own.lockGlyph} aria-label="generated">
              🔒
            </span>
          </span>
        );
      case "drCr":
        return text(row.drCr === "DR" ? "Dr" : "Cr", styles.alignCenter);
      case "ledger":
        return text(row.ledgerName);
      case "group":
        return text(row.groupName);
      case "debit":
        return text(row.drCr === "DR" ? formatPaise(row.paise) : "", styles.alignRight);
      case "credit":
        return text(row.drCr === "CR" ? formatPaise(row.paise) : "", styles.alignRight);
      case "role":
        return text(row.role);
      case "remarks":
        return text(row.narration);
      case "instrument":
        return row.instrument ? (
          <span className={own.instrumentCell} title={GENERATED_REFUSAL}>
            <span className={`${own.instrumentChip} ${row.postDated ? own.instrumentChipPdc : ""}`}>
              {row.instrument.typeName || row.instrument.tenderName}
            </span>
            <span className={own.instrumentText}>{generatedInstrumentText(row)}</span>
          </span>
        ) : (
          text("")
        );
      default:
        return text("");
    }
  };

  return (
    <div className={styles.gridViewport} onContextMenu={onContextMenu}>
      <table className={styles.grid} style={{ width: scaledWidth(tableWidth), minWidth: "100%" }}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={{ width: scaledWidth(column.widthPx) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={[
                  styles.gridHeaderCell,
                  ALIGN_CLASS[column.align] ?? "",
                  resizingKey === column.key ? styles.gridHeaderCellResizing : "",
                ].join(" ")}
              >
                {column.header}
                {onColumnResizeStart ? (
                  <span
                    className={styles.columnResizeHandle}
                    role="presentation"
                    title="Drag to resize the column"
                    onMouseDown={(event) => onColumnResizeStart(event, column.key)}
                  />
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const problem = problems.get(line.key);
            return (
              <tr
                key={line.key}
                title={problem}
                className={[
                  index % 2 === 0 ? styles.rowOdd : styles.rowEven,
                  line.key === currentKey ? `${styles.rowSelected} ${own.rowCurrent}` : "",
                  problem ? styles.rowIncomplete : "",
                ].join(" ")}
              >
                {columns.map((column) => (
                  <td key={column.key}>{cell(column, line, index)}</td>
                ))}
              </tr>
            );
          })}
          {generated.map((row) => (
            <tr
              key={row.key}
              className={[
                row.postDated ? own.rowPostDated : own.rowGenerated,
                generatedStale ? own.rowStale : "",
              ].join(" ")}
              onClick={() => onRefuse(GENERATED_REFUSAL)}
            >
              {columns.map((column) => (
                <td key={column.key}>{derivedCell(column, row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
