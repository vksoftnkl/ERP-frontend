"use client";

/**
 * Opening Stock — the voucher screen (`OpeningStockEntry`, menu 44).
 *
 * One screen, one document, one button that matters. SAVE writes the document
 * and nothing else; POST is the one-way door; a posted document is never edited,
 * only CANCELLED, which writes reversing rows and keeps the voucher. There is no
 * Delete — the route was retired, and a posted document is cancelled, never
 * hidden.
 *
 * Layout and wiring only. What a change does to the document is
 * `opening-stock.state.ts`; the round trips, questions and messages are
 * `use-opening-stock-draft.ts`.
 *
 * ── Layout (Qt .ui, 2026-10-23) ───────────────────────────────────────────
 * The title block on the left — name, scope, status pill, who created / posted
 * it and a notice line — and the voucher details on the right in a four-column
 * card: Voucher No, Date, Rate Source, and the godown in its own highlighted box
 * at the right end (red until chosen: no item can be keyed before it is). Enter
 * and Tab follow the reading order: Date, Rate Source, Godown, Your Ref No,
 * Remarks, then the grid.
 *
 * ── Keys: the shared transaction set (`lib/txn-keys`) ─────────────────────
 * Alt+N New, Ctrl+S Save Draft, Ctrl+Enter Save & Post (it still asks), F2 Edit,
 * Alt+X Cancel, Ctrl+O Show List, Ctrl+H History, Esc Close, Ctrl+D Split batch,
 * Alt+PgUp / Alt+PgDn the previous / next document, F1 the key sheet. A key runs
 * only what its button may. Plain Enter belongs to the grid (it commits the cell
 * and steps on), which is why no button here is a default button. Bare F5 — Save
 * Draft until the Qt rework — is swallowed so a habit press cannot reload the
 * page and lose the document.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { TxnHistoryDialog, type TxnHistoryTarget } from "@/components/txn/txn-history-dialog";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { formatCurrency } from "@/domain/pricing";
import {
  DateField,
  DropdownCombo,
  ReadOnlyInput,
  SelectField,
  TextField,
} from "@/features/sales/quotation/components/fields";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { useGridId } from "@/lib/configured-grids";
import { documentRights } from "@/lib/permissions/document-rights";
import { keySheetRows, withKey, type TxnKeyRow } from "@/lib/txn-keys";
import { useUiTableId } from "@/lib/ui-tables";
import type { ScreenMemoryOption } from "@/lib/use-screen-memory";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { useColumnResize } from "@/features/sales/quotation/components/use-column-resize";
import { resolveOpeningStockColumns } from "../opening-stock.columns";
import {
  GODOWN_DROPDOWN_KEY,
  ITEM_PICKER_GRID_KEY,
  OPENING_STOCK_LINES_UI_TABLE_KEY,
  RATE_SOURCES,
  REMARKS_MAX_LENGTH,
  SUPPLIER_PICKER_GRID_KEY,
  USR_REFNO_MAX_LENGTH,
  type RateSource,
} from "../opening-stock.constants";
import { hasItem } from "../opening-stock.lines";
import { auditLinesOf, scopeLabelOf } from "../opening-stock.state";
import type { OpeningStockDocKey } from "../opening-stock.types";
import {
  DATE_FIELD_ID,
  GODOWN_FIELD_ID,
  useOpeningStockDraft,
} from "../use-opening-stock-draft";
import { CancelReasonDialog } from "./cancel-reason-dialog";
import { GridPickerModal, type PickerFallbackColumn } from "./grid-picker-modal";
import { focusEntryCellOfRow, OpeningStockGrid } from "./opening-stock-grid";
import styles from "../page.module.scss";

const RATE_SOURCE_OPTIONS = RATE_SOURCES.map((source) => ({ value: source, label: source }));

const ITEM_PICKER_FALLBACK: readonly PickerFallbackColumn[] = [
  { field: "item_name_en", header: "Name" },
  { field: "unit_name", header: "Uom" },
];
const SUPPLIER_PICKER_FALLBACK: readonly PickerFallbackColumn[] = [
  { field: "sup_name", header: "Supplier" },
];

const STATUS_CLASS: Record<string, string | undefined> = {
  DRAFT: quotationStyles.statusDraft,
  POSTED: styles.statusPosted,
  CANCELLED: styles.statusCancelledTone,
};

/** F1 — the grid's own keys, under "Lines" (Qt `installHelp()`). */
const LINE_KEYS: readonly TxnKeyRow[] = [
  { label: "Item list (type a name in Barcode)", keyText: "↓" },
  { label: "Change the line's unit", keyText: "F4" },
  { label: "Add a line", keyText: "+" },
  { label: "Remove a line", keyText: "−" },
  { label: "Next cell", keyText: "Enter" },
  { label: "Leave the grid", keyText: "Tab" },
];

/** The keys this screen binds, in the Qt `bind()` order; Split batch is listed by its button's name. */
const KEY_SHEET = keySheetRows(
  [
    "new",
    "saveDraft",
    "post",
    "edit",
    "cancelDoc",
    "history",
    "open",
    "close",
    { action: "duplicateLine", label: "Split batch" },
    "previous",
    "next",
  ],
  LINE_KEYS,
);

const GRID_HINT =
  "Barcode: scan, or type a name and press ↓ for the item list  ·  F4 changes the unit  ·  + / − add or remove a line  ·  greyed cells are ones the item is not tracked by";

export type OpeningStockEntryViewProps = {
  initialDocument?: OpeningStockDocKey;
  initialMode: "entry" | "browse";
  onBackToList: () => void;
  /**
   * Screen memory (lib/screen-memory): the page names the slot, and says whether
   * it reopened ON a remembered document — the operator coming back from another
   * screen — rather than on an explicit Create / Open.
   */
  memory?: ScreenMemoryOption;
};

export function OpeningStockEntryView({
  initialDocument,
  initialMode,
  onBackToList,
  memory,
}: OpeningStockEntryViewProps) {
  const api = useOpeningStockDraft({ initialDocument, initialMode, onLeave: onBackToList, memory });
  const { draft, totals, busy } = api;

  // Reopened on the document the operator left here (screen memory): it is
  // already on screen, so all that is left is to say so — once.
  const announceResume = useRef(Boolean(memory?.resume && api.resumed));
  const { finishResume } = api;
  useEffect(() => {
    if (!announceResume.current) {
      return;
    }
    announceResume.current = false;
    void finishResume();
  }, [finishResume]);

  // Menu permissions as document rights, ANDed with the status the way Qt's
  // `applyStatus()` does: Create saves a new draft and Edit a saved one; Post
  // gates Save & Post; Cancel reverses a posted voucher and Delete drops a
  // draft; New needs Create or Post. Each key obeys its button's gate.
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);

  const uiTableId = useUiTableId(OPENING_STOCK_LINES_UI_TABLE_KEY);
  const { data: layoutRows } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const configuredColumns = useMemo(() => resolveOpeningStockColumns(layoutRows), [layoutRows]);
  // Right-click on the lines: "save column width" for a dragged heading and
  // "Admin settings" (visibility, order, focus) — the shared layout.
  const columnResize = useColumnResize(configuredColumns, uiTableId);
  const gridSettings = useGridSettings({
    label: "Opening stock lines",
    uiTableId,
    columns: columnResize.columns,
    pendingWidthCount: columnResize.pendingCount,
    savingWidths: columnResize.saving,
    onSaveWidths: columnResize.saveWidths,
  });
  const columns = columnResize.columns;

  const itemGridId = useGridId(ITEM_PICKER_GRID_KEY);
  const supplierGridId = useGridId(SUPPLIER_PICKER_GRID_KEY);
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);

  // The pickers are scoped to the DOCUMENT's company and branch, so they cannot
  // offer an item the lookup will then refuse. Grid 100 does not bind its pair
  // yet; the runner ignores a token its SELECT has no placeholder for.
  const itemPickerParams = useMemo(
    () => ({ iitem_company_id: draft.companyId, iitem_branch_id: draft.branchId }),
    [draft.branchId, draft.companyId],
  );
  const supplierPickerParams = useMemo(
    () => ({ isup_company_id: draft.companyId, isup_branch_id: draft.branchId }),
    [draft.branchId, draft.companyId],
  );

  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  /** Held, not derived: the trail dialog refetches whenever its target object changes. */
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);

  const isDraft = draft.status === "DRAFT";
  const isPosted = draft.status === "POSTED";
  const saved = Boolean(draft.svhId);
  const editable = draft.mode === "entry" && isDraft;
  const working = busy !== "idle";
  const canSaveDraft = isDraft && rights.maySaveDraft(saved);
  const canPost = isDraft && rights.mayPost;
  const canCancel = saved && (isDraft || isPosted) && rights.mayCancelDocument(isPosted);
  const canEdit = isDraft && rights.mayEdit;
  const godownChosen = Boolean(draft.header.godownId);

  /**
   * Commit whatever is being typed into a cell before acting on the document:
   * the cell holds its edit until it loses focus, and the save reads the draft.
   */
  const commitActiveCell = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && typeof active.blur === "function") {
      active.blur();
    }
  }, []);

  const runSave = useCallback(
    (post: boolean) => {
      // The keys land here too: a key runs only what its button may.
      if (working || !(post ? canPost : canSaveDraft)) {
        return;
      }
      commitActiveCell();
      void api.saveDraft(post);
    },
    [api, canPost, canSaveDraft, commitActiveCell, working],
  );

  const openHistory = useCallback(() => {
    if (!draft.svhId) {
      return;
    }
    setHistoryTarget({
      docId: draft.svhId,
      companyId: draft.companyId,
      accYear: draft.accYear,
      refNo: draft.refno,
    });
  }, [draft.accYear, draft.companyId, draft.refno, draft.svhId]);

  // ── Window keys — the shared transaction set ──────────────────────────
  // A handler left null is not intercepted at all: its button is off.
  const postKey = !working && canPost ? () => runSave(true) : null;
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? () => void api.newDocument() : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: postKey,
      // In browse mode only: on a draft already open for entry the key is the
      // grid's (F2 opens a picker cell), and Edit would only move the cursor.
      edit: !working && canEdit && draft.mode === "browse" ? api.edit : null,
      cancelDoc: !working && canCancel ? api.requestCancel : null,
      open: !working ? () => void api.showList() : null,
      close: !working ? () => void api.close() : null,
      history: saved ? openHistory : null,
      previous: !working ? () => void api.stepDocument(true) : null,
      next: !working ? () => void api.stepDocument(false) : null,
      duplicateLine: !working && editable ? () => api.splitLine(activeRowKey) : null,
    },
    { onHelp: () => setKeysOpen(true) },
  );

  // F5 was Save Draft until the Qt rework moved it to Ctrl+S. A habit press
  // must not reload the page and take the unsaved document with it — swallowed,
  // under a dialog too (capture), and nothing else.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F5" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // An unsaved document asks before the tab closes, as Close does.
  useEffect(() => {
    if (!draft.dirty) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draft.dirty]);

  /**
   * Enter and Tab walk the header in reading order — Date, Rate Source,
   * Godown, Your Ref No, Remarks (Qt `setTabOrder`) — and the last field hands
   * over to the grid: the first row still without an item, on its Barcode.
   * Tab is taken here rather than left to the browser so it cannot step into
   * the godown's open option list.
   */
  const onHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const isTab = event.key === "Tab";
    if ((event.key !== "Enter" && !isTab) || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!isTab && target?.getAttribute("aria-expanded") === "true") {
      return; // Enter picks from the open list
    }
    if (moveHeaderFocus(event.currentTarget, event.target, event.shiftKey ? -1 : 1)) {
      event.preventDefault();
      return;
    }
    if (!event.shiftKey && editable) {
      const row = draft.lines.find((line) => !hasItem(line)) ?? draft.lines[draft.lines.length - 1];
      if (row) {
        event.preventDefault();
        focusEntryCellOfRow(row.key);
      }
    }
  };

  const problemLines = draft.lines.filter((line) => line.problem);
  const auditLines = auditLinesOf(draft);
  const notice = draft.notice ?? "";

  return (
    <div className={quotationStyles.page}>
      <div className={styles.topBand}>
        {/* ── the title block ─────────────────────────────────────────── */}
        <div className={styles.titleBlock}>
          <div className={styles.titleLine}>
            <button type="button" className={quotationStyles.button} onClick={() => void api.close()}>
              ‹ Opening Stock
            </button>
            <h1 className={quotationStyles.title}>Opening Stock</h1>
          </div>
          <span
            className={styles.scope}
            title="The godown and accounting year this document belongs to. A voucher is saved back to its own, never the session's."
          >
            {scopeLabelOf(draft)}
          </span>
          <div className={styles.statusLine}>
            <span
              className={cx(quotationStyles.statusBadge, styles.statusPill, STATUS_CLASS[draft.status])}
              title="DRAFT, POSTED or CANCELLED — there is no fourth state."
            >
              {draft.status}
            </span>
            {draft.mode === "browse" ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
            {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
            {busy === "loading" ? <span className={styles.scope}>loading…</span> : null}
          </div>
          <div
            className={styles.audit}
            title="Who created this opening and when — and, once posted, who posted it"
          >
            {auditLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
            {notice ? (
              <span className={styles.notice} role="status">
                {notice}
              </span>
            ) : null}
          </div>
        </div>

        {/* ── the voucher details: four columns, the godown at the right end ── */}
        <div className={styles.fieldsCard} onKeyDown={onHeaderKeyDown}>
          <ReadOnlyInput
            id="opening-stock-refno"
            label="Voucher No"
            value={draft.refno}
            placeholder="given on save"
          />
          <DateField
            id={DATE_FIELD_ID}
            label="Date"
            value={draft.header.docDate}
            disabled={!editable}
            onChange={(value) => api.setHeaderField("docDate", value)}
          />
          <SelectField
            id="opening-stock-rate-source"
            label="Rate Source"
            value={draft.header.rateSource}
            options={RATE_SOURCE_OPTIONS}
            disabled={!editable}
            title="What fills a line LEFT AT COST 0. On an opening it is normally MANUAL: on go-live day stock_item_cost is empty, so AVG_COST and LAST_PURCHASE have nothing to read. A cost typed on the line wins over this."
            onChange={(value) => api.setRateSource(value as RateSource)}
          />
          <div
            className={cx(styles.godownBox, godownChosen ? styles.godownSet : styles.godownMissing)}
            data-tone={godownChosen ? "set" : "missing"}
            title="Where the stock arrives. Required: an opening is inward, and every line's godown is copied from this one."
          >
            <DropdownCombo
              id={GODOWN_FIELD_ID}
              label="Godown *  — where the stock opens"
              dropdownId={godownDropdownId}
              valueKey="gdl_id"
              labelKey="gdl_name"
              value={draft.header.godownId}
              selectedLabel={draft.header.godownName}
              disabled={!editable}
              placeholder="Choose the godown"
              onSelect={(id, name) => api.setGodown(id, name)}
            />
          </div>
          <TextField
            id="opening-stock-usr-refno"
            label="Your Ref No"
            value={draft.header.usrRefno}
            maxLength={USR_REFNO_MAX_LENGTH}
            disabled={!editable}
            title="The shop's own reference. Free text; neither the engine nor any report reads it."
            onChange={(value) => api.setHeaderField("usrRefno", value)}
          />
          <TextField
            id="opening-stock-remarks"
            label="Remarks"
            value={draft.header.remarks}
            maxLength={REMARKS_MAX_LENGTH}
            disabled={!editable}
            title="Describes the opening. NOT the cancellation reason: cancelling asks for its own."
            onChange={(value) => api.setHeaderField("remarks", value)}
          />
        </div>
      </div>

      <div className={quotationStyles.gridsRow}>
        <section className={cx(quotationStyles.gridShell, quotationStyles.itemGridShell)}>
          <div className={quotationStyles.gridHead}>
            <span className={quotationStyles.gridHeadTitle}>Lines</span>
            <span className={quotationStyles.gridHeadActions}>
              <span className={quotationStyles.modalNote}>F1 lists the keys</span>
            </span>
          </div>
          {problemLines.length ? (
            <p className={styles.problemStrip} role="alert">
              {problemLines.map((line) => line.problem).join("\n")}
            </p>
          ) : null}
          {gridSettings.overlays}
          <OpeningStockGrid
            columns={columns}
            onContextMenu={gridSettings.onContextMenu}
            resizingKey={columnResize.resizingKey}
            onColumnResizeStart={columnResize.onResizeStart}
            lines={draft.lines}
            editable={editable}
            activeRowKey={activeRowKey}
            flagged={api.flagged}
            onActiveRowChange={setActiveRowKey}
            onSetField={api.setLineField}
            onOpenItemPicker={api.openItemPicker}
            onSearchItems={api.searchItemsFromBarcode}
            onOpenSupplierPicker={api.openSupplierPicker}
            onInsertLine={api.insertLine}
            onRemoveLine={(rowKey) => void api.removeLine(rowKey)}
            onSwitchUnit={(rowKey) => void api.switchUnit(rowKey)}
            onPostKey={postKey}
          />
        </section>
      </div>

      <div className={styles.quickBar}>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={!editable || working}
          title="Insert a line above the current one (or just press + on the grid)"
          onClick={() => api.insertLine(activeRowKey)}
        >
          + Line
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={!editable || working}
          title="Remove the current line (or press - on the grid)"
          onClick={() => void api.removeLine(activeRowKey)}
        >
          − Line
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={!editable || working}
          title="Copy this line as another allocation of the same item — one line drawn from two batches is two rows sharing a line number"
          onClick={() => api.splitLine(activeRowKey)}
        >
          {withKey("Split batch", "duplicateLine")}
        </button>
        <span className={styles.gridHint}>{GRID_HINT}</span>
      </div>

      <div className={styles.footerRow}>
        <p className={styles.postNote}>
          {"Save writes the document and nothing else — no stock moves.\nPost is the one-way door: it writes the ledger and freezes the document."}
        </p>
        <dl className={styles.totals}>
          <dt title="svh_line_count counts LINES. The ledger writes one row per line x split, so a document with one line drawn from three batches is 1 line and 3 ledger rows.">
            Lines
          </dt>
          <dd>{totals.lines}</dd>
          <dt title="In BASE units, free goods included — the quantity the ledger will carry.">Total Qty</dt>
          <dd>{formatCurrency(totals.qty, 3, true)}</dd>
          <dt>Value w/o Tax</dt>
          <dd>{formatCurrency(totals.valueWot, 2, true)}</dd>
          <dt>Total Value</dt>
          <dd className={styles.totalStrong}>{formatCurrency(totals.value, 2, true)}</dd>
        </dl>
      </div>

      <div className={quotationStyles.buttonBar}>
        <span className={styles.footerHint}>
          F1 · keys on this screen · Alt+PgUp / Alt+PgDn previous / next opening
        </span>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !rights.mayStartNew}
          onClick={() => void api.newDocument()}
        >
          {withKey("New", "new")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canSaveDraft}
          title="Writes the document and nothing else. No stock moves."
          onClick={() => runSave(false)}
        >
          {busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          disabled={working || !canPost}
          title="Saves, runs the pre-post check, then posts. Posting is one way: the document is frozen afterwards and can only be cancelled."
          onClick={() => runSave(true)}
        >
          {busy === "posting" ? "Posting…" : withKey("Save & Post", "post")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canCancel}
          title="Writes one reversing ledger row per posted row. Never a delete, never an edit — and it can legitimately fail if the stock has since been sold."
          onClick={api.requestCancel}
        >
          {busy === "cancelling" ? "Cancelling…" : withKey("Cancel", "cancelDoc")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canEdit}
          onClick={api.edit}
        >
          {withKey("Edit", "edit")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={!saved}
          title="Every step of this document — who saved, posted or cancelled it, when, on which device, and why."
          onClick={openHistory}
        >
          {withKey("History", "history")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working}
          onClick={() => void api.showList()}
        >
          {withKey("Show List", "open")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={() => void api.close()}>
          {withKey("Close", "close")}
        </button>
      </div>

      <GridPickerModal
        isOpen={api.picker?.kind === "item"}
        title="Select item"
        gridId={itemGridId}
        params={itemPickerParams}
        initialQuery={api.picker?.kind === "item" ? api.picker.query : ""}
        searchPlaceholder="Search by item name…"
        fallbackColumns={ITEM_PICKER_FALLBACK}
        rowKeyField="item_uom_id"
        onClose={api.closePicker}
        onPick={api.pickItem}
      />
      <GridPickerModal
        isOpen={api.picker?.kind === "supplier"}
        title="Select supplier"
        gridId={supplierGridId}
        params={supplierPickerParams}
        initialQuery={api.picker?.kind === "supplier" ? api.picker.query : ""}
        searchPlaceholder="Search by supplier name…"
        fallbackColumns={SUPPLIER_PICKER_FALLBACK}
        rowKeyField="sup_id"
        onClose={api.closePicker}
        onPick={api.pickSupplier}
      />
      <CancelReasonDialog
        isOpen={api.reasonOpen}
        title={`Cancel ${draft.refno}`}
        question="Why is this opening being reversed?"
        onCancel={api.closeReason}
        onAccept={(reason) => void api.acceptCancelReason(reason)}
      />
      <TxnKeysSheet
        open={keysOpen}
        onClose={() => setKeysOpen(false)}
        document={KEY_SHEET.document}
        lines={KEY_SHEET.lines}
      />
      <TxnHistoryDialog
        target={historyTarget}
        docLabel="Opening Stock"
        onClose={() => setHistoryTarget(null)}
      />
    </div>
  );
}
