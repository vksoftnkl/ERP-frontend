"use client";

/**
 * Cheque Books (menu 263) — the Qt `ChequeBookDialog`, as a panel.
 *
 * One panel, mounted twice, as in Qt: as the Cheque Books page (its own menu,
 * where Done closes the screen), and in the popup Issued Cheques' "Cheque
 * books" button opens. Top to bottom, Qt's layout:
 *
 *   Bank [any bank]   Status [Active ▾]
 *   ┌ grid 120, MAIN LIST - CHEQUE BOOKS ─────────────────────────────────┐
 *   ┌ Book ───────────────────────────────┬─ Leaf · Paid to · Amount · … ─┐
 *   │ Bank account / Book no / Leaves     │  every leaf the book handed    │
 *   │ from … to … / Remarks / figures     │  out, and where it went        │
 *   └─────────────────────────────────────┴────────────────────────────────┘
 *   the message line
 *   [New book] [Save] [Close book…]                                 [Done]
 *
 * The list is grid 120 with its own column configuration — order, widths,
 * hidden columns — like every configured list. Moving the cursor in it (mouse
 * or ↑/↓) loads that book onto the form. Enter in the form moves to the next
 * field, never saves: there is no default button, as on the Qt popup.
 *
 * Rights are menu 263's whichever way the panel was opened — the menu the
 * server judges every `/cheque-books` route on. (Qt's popup took menu 52's,
 * and so offered Save to users the server then refused.) Once a book has
 * handed out a leaf, its bank and first leaf are on paper and lock.
 *
 * The list is re-read 1.1 s after a save or close: the grid runner caches a
 * URL for a moment, and an immediate re-read showed the book as it was.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { useGridId } from "@/lib/configured-grids";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import { useConfiguredGridSettings } from "@/components/master/use-configured-grid-settings";
import type { GridColumnConfig } from "@/store/slices/gridColumnsSlice";
import {
  useCloseChequeBookMutation,
  useGetChequeBookListQuery,
  useGetChequeBookQuery,
  useSaveChequeBookMutation,
} from "@/store/api/issuedChequesApi";
import { chequeError } from "../api-errors";
import { formatAmount } from "../domain/chequeRow";
import { issuedStatusPill } from "../issued/domain/pills";
import {
  CLOSE_BOOK_REASONS,
  blankBookForm,
  bookFigures,
  bookFormOf,
  buildBookBody,
  validateBookForm,
  type BookForm,
} from "./book-form";
import styles from "../cheques.module.scss";

/** The runner caches a URL briefly; re-read after it has let go. */
const RELIST_DELAY_MS = 1100;
/** The `#` column, roughly — only for the grid's minimum width. */
const ROW_NO_WIDTH_PX = 40;

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "FINISHED", label: "Finished" },
  { value: "CLOSED", label: "Closed" },
  { value: "", label: "All" },
] as const;

// ─── Grid 120's columns ──────────────────────────────────────────────────────

/** The migration's visible columns, with Qt widths — until the config is read. */
const FALLBACK_COLUMNS: readonly { field: string; header: string; qtWidth: number }[] = [
  { field: "bank_name", header: "Bank", qtWidth: 16 },
  { field: "acb_book_no", header: "Book No", qtWidth: 8 },
  { field: "leaf_from", header: "From", qtWidth: 8 },
  { field: "leaf_to", header: "To", qtWidth: 8 },
  { field: "next_leaf", header: "Next Leaf", qtWidth: 8 },
  { field: "leaves_left", header: "Left", qtWidth: 6 },
  { field: "acb_status", header: "Status", qtWidth: 8 },
  { field: "acb_remarks", header: "Remarks", qtWidth: 18 },
];
const QT_WIDTH = new Map(FALLBACK_COLUMNS.map((column) => [column.field, column.qtWidth]));
/** Leaf numbers and the status sit centred, the count right — until the config says otherwise. */
const FALLBACK_ALIGN: Record<string, BookColumn["align"]> = {
  leaf_from: "center",
  leaf_to: "center",
  next_leaf: "center",
  leaves_left: "right",
  acb_status: "center",
};

type BookColumn = { field: string; header: string; width: number; align: "left" | "center" | "right" };

function resolveBookColumns(config: readonly GridColumnConfig[] | undefined): BookColumn[] {
  const visible = (config ?? []).filter((column) => column.visible);
  const source =
    visible.length > 0
      ? visible.map((column) => ({
          field: column.sqlFieldName || column.accessorKey || column.key,
          header: column.header,
          width: column.width,
          align: column.align,
        }))
      : FALLBACK_COLUMNS.map((column) => ({
          field: column.field,
          header: column.header,
          width: undefined,
          align: undefined,
        }));
  return source.map((column) => {
    const px = Number.parseFloat(column.width ?? "");
    return {
      field: column.field,
      header: column.header,
      width: Number.isFinite(px) && px >= 32 ? Math.round(px) : Math.max(56, (QT_WIDTH.get(column.field) ?? 10) * 11),
      align: column.align ?? FALLBACK_ALIGN[column.field] ?? "left",
    };
  });
}

function bookCell(raw: Record<string, unknown>, field: string) {
  const value = raw[field];
  if (field === "next_leaf") {
    return value === null || value === undefined || value === "" ? "—" : String(value);
  }
  return value === null || value === undefined ? "" : String(value);
}

function alignClass(align: BookColumn["align"]): string | undefined {
  return align === "right" ? styles.alignRight : align === "center" ? styles.alignCenter : undefined;
}

/** Enter moves to the next field that can take the caret, as Qt's EnterNavigation. */
function advanceOnEnter(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter" || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }
  const target = event.target as HTMLElement;
  if (!(target instanceof HTMLInputElement) || target.type === "checkbox") {
    return;
  }
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("input:not([type=hidden]):not(:disabled), select:not(:disabled)"),
  );
  const at = controls.indexOf(target);
  event.preventDefault();
  controls[at + 1]?.focus();
}

// ─── The panel ───────────────────────────────────────────────────────────────

export type ChequeBooksPanelProps = {
  companyId: string;
  branchId: string;
  canCreate: boolean;
  canEdit: boolean;
  /** Rights still loading: read-only for now, not reported as a refusal. */
  rightsLoading: boolean;
  /** Called after a book was opened, saved or closed — the caller re-reads its tiles. */
  onChanged?: () => void;
  /** Done: the page closes the screen, the popup closes itself. */
  onDone: () => void;
  /** On the page the list takes the free height; in the popup it is a fixed band. */
  fill?: boolean;
};

export function ChequeBooksPanel(props: ChequeBooksPanelProps) {
  const { companyId, branchId, canCreate, canEdit, rightsLoading, onChanged, onDone, fill } = props;
  const bankDropdownId = useDropdownId("bankLedger");
  const bookCaptionId = useId();

  // ── The list (grid 120) ───────────────────────────────────────────────────
  const gridId = useGridId("chequeBookList");
  const { data: columnConfig } = useGetGridColumnsQuery({ gridId: Number(gridId) }, { skip: !gridId });
  const columns = useMemo(() => resolveBookColumns(columnConfig), [columnConfig]);
  // Right-click on the list: the master tables' grid settings (filter, visibility, Admin).
  const gridSettings = useConfiguredGridSettings({ gridId, columns: columnConfig });

  const [bankFilter, setBankFilter] = useState<{ id: string; name: string }>({ id: "", name: "" });
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  // All three tokens, always — a missing one fails the whole run.
  const list = useGetChequeBookListQuery(
    companyId
      ? {
          params: { icompany_id: companyId, ibank_ledger_id: bankFilter.id, istatus: statusFilter },
          page: 1,
          limit: 100,
        }
      : skipToken,
    { refetchOnMountOrArgChange: true },
  );
  const rawRows = useMemo(() => list.currentData?.items ?? [], [list.currentData]);
  const idOf = (raw: Record<string, unknown>) => String(raw.acb_id ?? "");

  // ── The book on the form ──────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailQuery = useGetChequeBookQuery(
    selectedId && companyId ? { companyId, chequeBookId: selectedId } : skipToken,
    { refetchOnMountOrArgChange: true },
  );
  const detail =
    detailQuery.currentData && detailQuery.currentData.chequeBookId === selectedId
      ? detailQuery.currentData
      : null;

  const [form, setForm] = useState<BookForm>(() => blankBookForm());
  const [message, setMessage] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [closing, setClosing] = useState(false);
  const [saveBook, saveState] = useSaveChequeBookMutation();
  const [closeBook, closeState] = useCloseChequeBookMutation();
  const busy = saveState.isLoading || closeState.isLoading;
  const bookNoRef = useRef<HTMLInputElement | null>(null);

  // The form follows the loaded book — once per load of it, so an edit in
  // progress is not overwritten by a refetch of the same book.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!detail) {
      return;
    }
    const stamp = `${detail.chequeBookId}|${detail.status}|${detail.used}|${detail.leafTo}|${detail.bookNo}|${detail.remarks ?? ""}`;
    if (loadedFor.current === stamp) {
      return;
    }
    loadedFor.current = stamp;
    setForm(bookFormOf(detail));
  }, [detail]);

  const isNew = form.chequeBookId === null;
  const closed = !isNew && String(detail?.status ?? "").toUpperCase() === "CLOSED";
  const used = isNew ? 0 : (detail?.used ?? 0);
  const mayWrite = isNew ? canCreate : canEdit && !closed;
  // Once a leaf is out, the bank and the first leaf are the book's history.
  const rangeOpen = mayWrite && used === 0;

  const pick = (chequeBookId: string) => {
    if (!chequeBookId || chequeBookId === selectedId) {
      return;
    }
    setMessage(null);
    setSelectedId(chequeBookId);
  };

  const rereadBook = useCallback(
    (chequeBookId: string) => {
      if (chequeBookId === selectedId && !detailQuery.isUninitialized) {
        void detailQuery.refetch();
      }
    },
    [detailQuery, selectedId],
  );

  const relistTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (relistTimer.current !== null) {
        window.clearTimeout(relistTimer.current);
      }
    },
    [],
  );
  const relistSoon = useCallback(() => {
    if (relistTimer.current !== null) {
      window.clearTimeout(relistTimer.current);
    }
    relistTimer.current = window.setTimeout(() => {
      relistTimer.current = null;
      void list.refetch();
    }, RELIST_DELAY_MS);
  }, [list]);

  const startNew = () => {
    setSelectedId(null);
    loadedFor.current = null;
    // A new book on the bank the list is filtered to is the common case.
    setForm(blankBookForm(bankFilter.id ? bankFilter : undefined));
    setMessage(null);
    window.setTimeout(() => bookNoRef.current?.focus(), 0);
  };

  const save = async () => {
    if (!mayWrite || busy) {
      return;
    }
    const why = validateBookForm(form);
    if (why) {
      setMessage({ text: why, tone: "error" });
      return;
    }
    setMessage(null);
    try {
      const result = await saveBook(buildBookBody(form, { companyId, branchId })).unwrap();
      setMessage({ text: result.message || `Book ${result.data.bookNo} saved`, tone: "info" });
      loadedFor.current = null;
      rereadBook(result.data.chequeBookId);
      setSelectedId(result.data.chequeBookId);
      setForm(bookFormOf(result.data));
      relistSoon();
      onChanged?.();
    } catch (error) {
      setMessage({ text: chequeError(error), tone: "error" });
    }
  };

  const close = async (reason: string) => {
    if (!form.chequeBookId) {
      return;
    }
    try {
      const result = await closeBook({ companyId, chequeBookId: form.chequeBookId, reason }).unwrap();
      setClosing(false);
      setMessage({ text: result.message || `Book ${result.data.bookNo} closed`, tone: "info" });
      loadedFor.current = null;
      setForm(bookFormOf(result.data));
      rereadBook(result.data.chequeBookId);
      relistSoon();
      onChanged?.();
    } catch (error) {
      setClosing(false);
      setMessage({ text: chequeError(error), tone: "error" });
    }
  };

  // ── The message line, loudest first ───────────────────────────────────────
  const line: { text: string; tone: "info" | "error" | "muted" } | null = message
    ? message
    : !rightsLoading && !canCreate && !canEdit
      ? { text: "read-only — your login may not create or edit cheque books", tone: "muted" }
      : rawRows.length === 0 && !list.isFetching && isNew && !list.error
        ? { text: "No book matches — open one with New book.", tone: "muted" }
        : null;

  const currentIndex = rawRows.findIndex((raw) => idOf(raw) === selectedId);
  const columnsWidth = Math.max(
    1,
    columns.reduce((sum, column) => sum + column.width, 0),
  );

  return (
    <div className={`${styles.booksPanel} ${fill ? styles.booksPanelFill : ""}`}>
      <section className={styles.booksFilters} aria-label="Book filters">
        <div className={styles.booksFilter}>
          <span>Bank</span>
          <NexDropdownSingle
            className={`${styles.booksPicker} ${styles.booksBankFilter}`}
            dropdownId={bankDropdownId}
            aria-label="Bank"
            placeholder="any bank"
            value={bankFilter.id ? { id: bankFilter.id, text: bankFilter.name } : null}
            onChange={(selection) => setBankFilter({ id: selection?.id ?? "", name: selection?.text ?? "" })}
          />
        </div>
        <label className={styles.booksFilter}>
          <span>Status</span>
          <select
            className={`${styles.booksSelect} ${styles.booksStatusFilter}`}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {gridSettings.overlays}
      <div
        className={`${styles.booksGrid} ${fill ? styles.booksGridFill : ""}`}
        tabIndex={0}
        aria-label="Cheque books"
        onContextMenu={gridSettings.onContextMenu}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || rawRows.length === 0) {
            return;
          }
          const at = currentIndex < 0 ? -1 : currentIndex;
          const go = (index: number) => {
            event.preventDefault();
            pick(idOf(rawRows[Math.max(0, Math.min(rawRows.length - 1, index))]));
          };
          if (event.key === "ArrowDown") {
            go(at + 1);
          } else if (event.key === "ArrowUp") {
            go(at - 1);
          } else if (event.key === "Home") {
            go(0);
          } else if (event.key === "End") {
            go(rawRows.length - 1);
          }
        }}
      >
        {/* The columns share the width in their configured proportions; below
            their configured widths the grid scrolls instead of squeezing. */}
        <table className={styles.booksTable} style={{ minWidth: `${columnsWidth + ROW_NO_WIDTH_PX}px` }}>
          <colgroup>
            <col className={styles.booksRowNoCol} />
            {columns.map((column) => (
              <col key={column.field} style={{ width: `${(column.width / columnsWidth) * 100}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              {columns.map((column) => (
                <th key={column.field} title={column.header}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rawRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className={styles.booksEmptyCell}>
                  {list.error ? chequeError(list.error) : list.isFetching ? "Reading the books…" : ""}
                </td>
              </tr>
            ) : null}
            {rawRows.map((raw, index) => {
              const id = idOf(raw);
              return (
                <tr
                  key={id}
                  className={[
                    id === selectedId ? styles.booksRowCurrent : "",
                    String(raw.acb_status ?? "").toUpperCase() === "CLOSED" ? styles.booksRowClosed : "",
                  ].join(" ")}
                  onMouseDown={() => pick(id)}
                >
                  <td className={styles.booksRowNo}>{index + 1}</td>
                  {columns.map((column) => (
                    <td key={column.field} className={alignClass(column.align)}>
                      {bookCell(raw, column.field)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className={styles.booksGroup} aria-labelledby={bookCaptionId}>
        <span id={bookCaptionId} className={styles.booksCaption}>
          Book
        </span>
        <div className={styles.booksBox}>
          <div className={styles.booksForm} role="group" aria-label="Book" onKeyDown={advanceOnEnter}>
            <label className={styles.booksFormRow}>
              <span>Bank account</span>
              <NexDropdownSingle
                className={styles.booksPicker}
                dropdownId={bankDropdownId}
                aria-label="Bank account"
                placeholder="bank account"
                disabled={!rangeOpen}
                value={form.bankLedgerId ? { id: form.bankLedgerId, text: form.bankName } : null}
                onChange={(selection) =>
                  setForm({ ...form, bankLedgerId: selection?.id ?? "", bankName: selection?.text ?? "" })
                }
              />
            </label>
            <label className={styles.booksFormRow}>
              <span>Book no</span>
              <input
                ref={bookNoRef}
                className={styles.booksInput}
                value={form.bookNo}
                maxLength={30}
                disabled={!mayWrite}
                onChange={(event) => setForm({ ...form, bookNo: event.target.value })}
              />
            </label>
            <label className={styles.booksFormRow}>
              <span>Leaves</span>
              <span className={styles.booksRange}>
                <input
                  className={styles.booksInput}
                  value={form.leafFrom}
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="000451"
                  disabled={!rangeOpen}
                  title={!isNew && used > 0 ? "Leaves have been handed out — the first leaf is on paper." : undefined}
                  onChange={(event) => setForm({ ...form, leafFrom: event.target.value.replace(/\D/g, "") })}
                />
                to
                <input
                  className={styles.booksInput}
                  value={form.leafTo}
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="000500"
                  disabled={!mayWrite}
                  onChange={(event) => setForm({ ...form, leafTo: event.target.value.replace(/\D/g, "") })}
                />
              </span>
            </label>
            <label className={styles.booksFormRow}>
              <span>Remarks</span>
              <input
                className={styles.booksInput}
                value={form.remarks}
                maxLength={250}
                disabled={!mayWrite}
                onChange={(event) => setForm({ ...form, remarks: event.target.value })}
              />
            </label>
            <label className={styles.booksFormRow}>
              <span>Every branch</span>
              <input
                type="checkbox"
                className={styles.booksCheck}
                checked={form.everyBranch}
                disabled={!mayWrite}
                title="Kept for every branch of the company. Unticked, the book belongs to this branch."
                onChange={(event) => setForm({ ...form, everyBranch: event.target.checked })}
              />
            </label>
            <span className={styles.booksFigures}>
              {isNew ? "New book — no leaf used yet." : detail ? bookFigures(detail) : "reading the book…"}
            </span>
          </div>

          <div className={styles.booksLeaves}>
            <div className={styles.booksLeavesScroll}>
              <table className={styles.booksTable}>
                <colgroup>
                  <col className={styles.booksLeafCol} />
                  <col className={styles.booksLeafCol} />
                  <col className={styles.booksLeafCol} />
                  <col className={styles.booksLeafCol} />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>Leaf</th>
                    <th>Paid to</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Voucher</th>
                  </tr>
                </thead>
                <tbody>
                  {(isNew ? [] : (detail?.leaves ?? [])).map((leaf) => (
                    <tr key={`${leaf.apdId}-${leaf.leaf}`}>
                      <td className={styles.alignCenter}>{leaf.leaf}</td>
                      <td title={leaf.partyName ?? undefined}>{leaf.partyName ?? ""}</td>
                      <td className={styles.alignRight}>{formatAmount(leaf.amount)}</td>
                      <td className={styles.alignCenter}>{issuedStatusPill(leaf.status).label}</td>
                      <td>{leaf.voucherRefno ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <div
        className={`${styles.booksLine} ${
          line?.tone === "error" ? styles.booksLineError : line?.tone === "info" ? styles.booksLineInfo : ""
        }`}
        role="status"
      >
        {line?.text ?? ""}
      </div>

      <div className={styles.booksButtons}>
        <button type="button" className={styles.booksButton} disabled={!canCreate || busy} onClick={startNew}>
          New book
        </button>
        <button
          type="button"
          className={`${styles.booksButton} ${styles.booksPrimary}`}
          disabled={!mayWrite || busy}
          onClick={() => void save()}
        >
          {saveState.isLoading ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={styles.booksButton}
          disabled={isNew || closed || !canEdit || busy}
          onClick={() => setClosing(true)}
        >
          Close book…
        </button>
        <span className={styles.actionSpacer} />
        <button type="button" className={styles.booksButton} onClick={onDone}>
          Done
        </button>
      </div>

      {closing && form.chequeBookId ? (
        <CloseBookDialog
          bookNo={form.bookNo}
          used={used}
          busy={closeState.isLoading}
          onCancel={() => setClosing(false)}
          onConfirm={(reason) => void close(reason)}
        />
      ) : null}
    </div>
  );
}

function CloseBookDialog(props: {
  bookNo: string;
  used: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { bookNo, used, busy, onCancel, onConfirm } = props;
  const [reason, setReason] = useState("");
  const ready = reason.trim().length > 0 && !busy;
  return (
    <ModalShell
      title={`Close book ${bookNo}`}
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!ready}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? "Closing…" : "Close book"}
          </button>
        </div>
      }
    >
      <div className={styles.dialogBody}>
        <p className={styles.dialogNote}>
          No more leaves will be handed out from this book. The {used} leaf
          {used === 1 ? "" : "s"} already used stay as they are.
        </p>
        <input
          className={styles.input}
          list="close-book-reasons"
          value={reason}
          maxLength={250}
          autoFocus
          placeholder="why"
          onChange={(event) => setReason(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && ready) {
              event.preventDefault();
              onConfirm(reason.trim());
            }
          }}
        />
        <datalist id="close-book-reasons">
          {CLOSE_BOOK_REASONS.map((preset) => (
            <option key={preset} value={preset} />
          ))}
        </datalist>
      </div>
    </ModalShell>
  );
}
