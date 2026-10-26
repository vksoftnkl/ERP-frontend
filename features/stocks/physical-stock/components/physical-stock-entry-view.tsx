"use client";

/**
 * Physical Stock Count — the count screen (`PhysicalStockEntry`, menu 45).
 * Layout and wiring only: the arithmetic is `physical-stock.state.ts`, the
 * network `use-physical-stock-draft.ts`.
 *
 * The sheet is GENERATED, not keyed: every line is a holding off
 * `/stock/physical/count-sheet` — drawn whole by Load Sheet (F9), or resolved
 * one item at a time from the Item picker, a scanned barcode or a textile
 * batch label on the blank row. The operator types ONE number per line, what
 * was found; only the difference posts.
 *
 * ── Layout (Qt 74b755c, "same behaviour as Opening Stock", 2026-10-24) ─────
 * The title block on the left — name, scope, status pill, who created / posted
 * it and the latest notice — and the sheet's details on the right in a card:
 * Sheet No, Count Date, Rate Source and the godown in its own highlighted box
 * at the right end (red until chosen: nothing can be counted before it is);
 * Reason, Your Ref No, Remarks; the freeze window and Blind count. Enter and
 * Tab follow the reading order — Date, Rate Source, Godown, Reason, Ref No,
 * Remarks, Freeze, Freeze From, Freeze To, Blind — then the grid.
 *
 * ── Keys: the shared transaction set (`lib/txn-keys`) ─────────────────────
 * Alt+N New, Ctrl+S Save Draft, Ctrl+Enter Save & Post (it still asks), F2
 * Edit, Alt+X Cancel, Ctrl+O Show List, Ctrl+H History, Esc Close, Alt+PgUp /
 * Alt+PgDn the sheet before / after, F1 the key sheet. F9 stays this screen's
 * own: drawing the sheet has no counterpart on the other documents. A key runs
 * only what its button may. Plain Enter belongs to the grid — on a 300-line
 * sheet it is the key pressed most. Bare F5 — Save Draft until this rework —
 * is swallowed so a habit press cannot reload the page and lose the count.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cx } from "@/components/design-system/cx";
import { TxnHistoryDialog, type TxnHistoryTarget } from "@/components/txn/txn-history-dialog";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { keySheetRows, withKey, type TxnKeyRow } from "@/lib/txn-keys";
import type { ScreenMemoryOption } from "@/lib/use-screen-memory";
import {
  CheckField,
  DateField,
  DropdownCombo,
  ReadOnlyInput,
  SelectField,
  TextField,
} from "@/features/sales/quotation/components/fields";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { rowStops } from "../physical-stock.columns";
import {
  CANCEL_REASON_PRESETS,
  GODOWN_DROPDOWN_KEY,
  ITEM_POPUP_GRID_KEY,
  PhysicalStockCols as Cols,
  RATE_SOURCES,
  STATUS_CANCELLED,
  STATUS_DRAFT,
  STATUS_POSTED,
  STOCK_REASON_DROPDOWN_KEY,
  STOCK_REASON_POPUP_GRID_KEY,
} from "../physical-stock.constants";
import { formatNetQty, formatNetValue } from "../physical-stock.format";
import { auditLinesOf } from "../physical-stock.state";
import type { PhysicalStockDocKey } from "../physical-stock.types";
import { HEADER_FIELD_IDS, usePhysicalStockDraft } from "../use-physical-stock-draft";
import { AskTextModal } from "./ask-text-modal";
import { CountGrid, focusGridCell, type PickerKind } from "./count-grid";
import { DateTimeField } from "./date-time-field";
import { GridPickerModal, type PickerColumn } from "./grid-picker-modal";
import { anyDialogOpen } from "./notice";
import styles from "../page.module.scss";

export type PendingLoad = {
  key: PhysicalStockDocKey;
  openForEdit: boolean;
  nonce: number;
};

export type PhysicalStockEntryViewProps = {
  /** False while the list is up over it — its keys stand down. */
  active: boolean;
  /** A document the list handed over, to be loaded into this screen. */
  pendingLoad: PendingLoad | null;
  onShowList: () => void;
  onClose: () => void;
  /**
   * Screen memory (lib/screen-memory): the page names the slot, and says whether
   * it reopened ON a remembered count — the operator coming back from another
   * screen — rather than on an explicit Create / Open.
   */
  memory?: ScreenMemoryOption;
  /** `stock.auto_batch_no` — a scanned code may be a textile batch label. */
  autoBatchNo?: boolean;
};

const RATE_SOURCE_OPTIONS = RATE_SOURCES.map((code) => ({ value: code, label: code }));

const ITEM_PICKER_COLUMNS: readonly PickerColumn[] = [
  { field: "item_name_en", header: "Name" },
  { field: "unit_name", header: "Uom" },
];

const REASON_PICKER_COLUMNS: readonly PickerColumn[] = [
  { field: "srm_name", header: "Reason" },
  { field: "srm_code", header: "Code" },
  { field: "srm_direction", header: "Effect" },
];

/** F1 — this screen's own keys, under "Lines" (Qt `installHelp()`). */
const SCREEN_KEYS: readonly TxnKeyRow[] = [
  { label: "Load the godown's holdings", keyText: "F9" },
  { label: "Item list (type a name in Barcode)", keyText: "↓" },
  { label: "Next cell", keyText: "Enter" },
  { label: "Leave the grid", keyText: "Tab" },
];

/** The keys this screen binds, in the Qt `bind()` order. */
const KEY_SHEET = keySheetRows(
  ["new", "saveDraft", "post", "edit", "cancelDoc", "history", "open", "close", "previous", "next"],
  SCREEN_KEYS,
);

/** Under the grid, on the left (Qt lblGridHint). */
const GRID_HINT =
  "F9 loads the godown's holdings  ·  Barcode: scan, or type a name and press ↓ for the item list  ·  type what is on the shelf in Counted Qty — 0 means empty, blank means not counted yet";

function toneClass(status: string): string {
  if (status === STATUS_POSTED) {
    return styles.tonePosted;
  }
  return status === STATUS_CANCELLED ? styles.toneCancelled : styles.toneDraft;
}

function textOf(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function PhysicalStockEntryView({
  active,
  pendingLoad,
  onShowList,
  onClose,
  memory,
  autoBatchNo = false,
}: PhysicalStockEntryViewProps) {
  const api = usePhysicalStockDraft({ memory, autoBatchNo });
  const { draft, totals, editable, busy, columns, rights } = api;
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const reasonDropdownId = useDropdownId(STOCK_REASON_DROPDOWN_KEY);
  const [picker, setPicker] = useState<{
    kind: PickerKind;
    rowKey: string;
    initialQuery: string;
  } | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  /** Held, not derived: the trail dialog refetches whenever its target object changes. */
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  const working = busy !== "idle";
  const isDraft = draft.status === STATUS_DRAFT;
  const isPosted = draft.status === STATUS_POSTED;
  const saved = Boolean(draft.svhId);
  // Document rights ANDed with the status, as Qt's `applyStatus()` does: Create
  // saves a new draft and Edit a saved one; Post gates Save & Post; Cancel
  // reverses a posted sheet and Delete drops a draft; New needs Create or Post.
  // Load Sheet only on a draft open for entry. Each key obeys its button's gate.
  const canSaveDraft = isDraft && rights.maySaveDraft(saved);
  const canPost = isDraft && rights.mayPost;
  const canCancel = saved && (isDraft || isPosted) && rights.mayCancelDocument(isPosted);
  const canEdit = isDraft && rights.mayEdit;
  const canLoadSheet = editable;
  const godownChosen = Boolean(draft.godownId);

  // Scoped to this document's company and branch, so the picker cannot offer
  // an item that has no holding here anyway.
  const itemPickerParams = useMemo(
    () => ({ iitem_company_id: draft.companyId, iitem_branch_id: draft.branchId }),
    [draft.branchId, draft.companyId],
  );

  // A document handed over by the list.
  const loadRef = useRef(api.load);
  useLayoutEffect(() => {
    loadRef.current = api.load;
  });
  useEffect(() => {
    if (pendingLoad) {
      loadRef.current(pendingLoad.key, pendingLoad.openForEdit);
    }
  }, [pendingLoad]);

  // Reopened on the count the operator left here (screen memory): it is already
  // on screen, so all that is left is to say so — once.
  const announceResume = useRef(Boolean(memory?.resume && api.resumed));
  const { finishResume, focusEntryStart } = api;
  useEffect(() => {
    if (!announceResume.current) {
      return;
    }
    announceResume.current = false;
    void finishResume();
  }, [finishResume]);

  // The first show: the cursor goes where keying starts, not wherever the
  // browser left it (Qt `showEvent()`) — unless a sheet is on its way from the
  // list, whose load places it.
  const shownRef = useRef(false);
  useEffect(() => {
    if (shownRef.current) {
      return;
    }
    shownRef.current = true;
    if (!pendingLoad) {
      focusEntryStart();
    }
  }, [focusEntryStart, pendingLoad]);

  const showList = () =>
    api.guardDirty(
      "Open count sheet",
      "This count has unsaved changes. Discard it and open another?",
      onShowList,
    );
  const close = () =>
    api.guardDirty(
      "Discard count",
      "This count sheet has unsaved changes. Close it anyway?",
      () => {
        // A confirmed discard — unlike a menu trip, the count must not be
        // waiting on the next visit.
        api.forgetRemembered();
        onClose();
      },
    );

  /**
   * Commit whatever is being typed into a cell before acting on the document,
   * as the old F5 did: the save reads the draft.
   */
  const commitActiveCell = useCallback(() => {
    const element = document.activeElement as HTMLElement | null;
    if (element && element !== document.body && typeof element.blur === "function") {
      element.blur();
    }
  }, []);

  const runSave = (post: boolean) => {
    // The keys land here too: a key runs only what its button may.
    if (working || !(post ? canPost : canSaveDraft)) {
      return;
    }
    commitActiveCell();
    if (post) {
      api.postDocument();
    } else {
      api.saveDraft();
    }
  };

  const openHistory = () => {
    if (!draft.svhId) {
      return;
    }
    setHistoryTarget({
      docId: draft.svhId,
      companyId: draft.companyId,
      accYear: draft.accYear,
      refNo: draft.refno,
    });
  };

  // ── Window keys — the shared transaction set ──────────────────────────
  // A handler left null is not intercepted at all: its button is off. Quiet
  // while the list is up over this screen, and under any dialog.
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? api.newDocument : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: !working && canPost ? () => runSave(true) : null,
      // In browse mode only: on a draft already open for entry Edit would only
      // move the cursor.
      edit: !working && canEdit && draft.mode === "browse" ? api.edit : null,
      cancelDoc: !working && canCancel ? api.cancelVoucher : null,
      open: !working ? showList : null,
      close: !working ? close : null,
      history: saved ? openHistory : null,
      previous: !working ? () => api.stepDocument(true) : null,
      next: !working ? () => api.stepDocument(false) : null,
    },
    { enabled: active, onHelp: () => setKeysOpen(true) },
  );

  // F9 draws the sheet — this screen's own key, on the button's gate.
  const loadSheetRef = useRef({ api, canLoadSheet, working, picker });
  useLayoutEffect(() => {
    loadSheetRef.current = { api, canLoadSheet, working, picker };
  });
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F9" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }
      const current = loadSheetRef.current;
      if (current.picker || anyDialogOpen() || event.repeat) {
        return;
      }
      event.preventDefault();
      if (current.canLoadSheet && !current.working) {
        current.api.loadCountSheet();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  // F5 was Save Draft until the Qt rework moved it to Ctrl+S. A habit press
  // must not reload the page and take the unsaved count with it — swallowed,
  // under a dialog too (capture), and nothing else.
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F5" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active]);

  useEffect(() => {
    if (!draft.dirty) {
      return undefined;
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
   * Godown, Reason, Your Ref No, Remarks, Freeze, Freeze From, Freeze To, Blind
   * (Qt `setTabOrder`) — and the last field hands over to the grid: the first
   * line's stop. Tab is taken here rather than left to the browser so it
   * cannot step into a dropdown's open option list.
   */
  const onHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const isTab = event.key === "Tab";
    if (
      (event.key !== "Enter" && !isTab) ||
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
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
    if (!event.shiftKey) {
      const stop = rowStops(columns, draft.lines[0])[0];
      if (stop !== undefined) {
        event.preventDefault();
        focusGridCell(0, stop);
      }
    }
  };

  const pickerRowKey = picker?.rowKey ?? "";

  /** A popup closed without a pick: the cursor goes back to the cell that opened it. */
  const closePicker = () => {
    if (picker) {
      const row = draft.lines.findIndex((line) => line.key === picker.rowKey);
      focusGridCell(row, picker.kind === "item" ? Cols.Description : Cols.ReasonName);
    }
    setPicker(null);
  };

  const auditLines = auditLinesOf(draft);

  return (
    <div className={quotationStyles.page}>
      <div className={styles.topBand}>
        {/* ── the title block ─────────────────────────────────────────── */}
        <div className={styles.titleBlock}>
          <div className={styles.titleLine}>
            <button type="button" className={quotationStyles.button} onClick={close}>
              ‹ Physical Stock Counts
            </button>
            <h1 className={quotationStyles.title}>Physical Stock Count</h1>
          </div>
          <span
            className={styles.scope}
            title="The godown and accounting year this sheet belongs to."
          >
            {draft.scope}
          </span>
          <div className={styles.statusLine}>
            <span
              className={cx(styles.statusTone, toneClass(draft.status))}
              title="DRAFT, POSTED or CANCELLED."
            >
              {draft.status}
            </span>
            {draft.mode === "browse" || !isDraft ? (
              <span className={quotationStyles.readOnlyBadge}>Read only</span>
            ) : null}
            {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
            {working ? (
              <span className={styles.scope}>
                {busy === "sheet" ? "drawing the sheet…" : busy === "loading" ? "loading…" : "working…"}
              </span>
            ) : null}
          </div>
          <div
            className={styles.audit}
            title="Who created this sheet and when — and, once posted, who posted it"
          >
            {auditLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
            {draft.notice ? (
              <span className={styles.auditNotice} role="status">
                {draft.notice}
              </span>
            ) : null}
          </div>
        </div>

        {/* ── the sheet's details: the godown box at the right end ──────── */}
        <div className={styles.fieldsCard} onKeyDown={onHeaderKeyDown}>
          <ReadOnlyInput
            id="physical-stock-sheet-no"
            label="Sheet No"
            value={draft.refno}
            placeholder="given on save"
          />
          <DateField
            id={HEADER_FIELD_IDS.docDate}
            label="Count Date"
            value={draft.docDate}
            disabled={!editable}
            onChange={(value) => api.setHeader("docDate", value)}
          />
          <SelectField
            id="physical-stock-rate-source"
            label="Rate Source"
            value={draft.rateSource}
            options={RATE_SOURCE_OPTIONS}
            disabled={!editable}
            title="What an OVERAGE is valued at. AVG_COST by default. A SHORTAGE ignores this and is valued by the item's valuation policy."
            onChange={(value) => api.setHeader("rateSource", value)}
          />
          <div
            className={cx(styles.godownBox, godownChosen ? styles.godownSet : styles.godownMissing)}
            data-tone={godownChosen ? "set" : "missing"}
            title="The godown being counted. Required: every line is a holding in this godown, and changing it clears the sheet."
          >
            <DropdownCombo
              id={HEADER_FIELD_IDS.godown}
              label="Godown *  — the one being counted"
              dropdownId={godownDropdownId}
              valueKey="gdl_id"
              labelKey="gdl_name"
              metaKey="gdl_short"
              value={draft.godownId}
              selectedLabel={draft.godownName}
              disabled={!editable}
              placeholder="Choose the godown"
              onSelect={(id, name) => api.selectGodown(id, name)}
            />
          </div>
          <DropdownCombo
            id="physical-stock-reason"
            label="Reason"
            dropdownId={reasonDropdownId}
            valueKey="srm_id"
            labelKey="srm_name"
            metaKey="srm_code"
            value={draft.reasonId}
            selectedLabel={draft.reasonName}
            disabled={!editable}
            placeholder="Why the variance is accepted"
            onSelect={(id, name) => api.selectReason(id, name)}
          />
          <TextField
            id="physical-stock-usr-refno"
            label="Your Ref No"
            value={draft.usrRefno}
            maxLength={100}
            disabled={!editable}
            title="The shop's own reference."
            onChange={(value) => api.setHeader("usrRefno", value)}
          />
          <TextField
            id="physical-stock-remarks"
            label="Remarks"
            value={draft.remarks}
            maxLength={250}
            disabled={!editable}
            title="Describes the count. NOT the cancellation reason: cancelling asks for its own."
            onChange={(value) => api.setHeader("remarks", value)}
          />
          <span
            className={styles.freezeCheck}
            title="Refuses any movement touching this godown while the sheet is DRAFT and the WALL CLOCK is inside the window. Other godowns keep trading; posting or cancelling lifts it."
          >
            <CheckField
              id="physical-stock-freeze"
              label="Freeze this godown while counting"
              checked={draft.freezeStock}
              disabled={!editable}
              onChange={(checked) => api.toggleFreeze(checked)}
            />
          </span>
          <DateTimeField
            id="physical-stock-freeze-from"
            label="Freeze From"
            value={draft.freezeFrom}
            disabled={!editable || !draft.freezeStock}
            title="Wall-clock start of the freeze window."
            onChange={(value) => api.setFreezeWindow("freezeFrom", value)}
          />
          <DateTimeField
            id={HEADER_FIELD_IDS.freezeTo}
            label="Freeze To"
            value={draft.freezeTo}
            disabled={!editable || !draft.freezeStock}
            title="Wall-clock end of the freeze window."
            onChange={(value) => api.setFreezeWindow("freezeTo", value)}
          />
          <span
            className={styles.blindCheck}
            title="Hides Book Qty, Difference and the variance tint while counting, so the counter records what is on the shelf rather than what the system expected."
          >
            <CheckField
              id="physical-stock-blind"
              label="Blind count"
              checked={draft.blind}
              onChange={(checked) => api.setBlind(checked)}
            />
          </span>
        </div>
      </div>

      <section className={cx(quotationStyles.gridShell, styles.countGridShell)}>
        <div className={quotationStyles.gridHead}>
          <span className={quotationStyles.gridHeadTitle}>Holdings</span>
          <span className={quotationStyles.modalNote}>F1 lists the keys</span>
        </div>
        <CountGrid
          columns={columns}
          lines={draft.lines}
          editable={editable}
          blind={draft.blind}
          focusRequest={api.focusRequest}
          onCountedChange={api.setCounted}
          onRemarksChange={api.setRemarks}
          onBarcodeChange={api.typeBarcode}
          onBarcodeCommit={api.commitBarcode}
          onSearchItems={(rowKey, typed) => {
            if (api.openItemList(rowKey)) {
              setPicker({ kind: "item", rowKey, initialQuery: typed.replace(/\s+/g, " ").trim() });
            }
          }}
          onOpenPicker={(kind, rowKey, initialQuery) => setPicker({ kind, rowKey, initialQuery })}
        />
      </section>

      {/* ── under the grid: the hint on the left, the totals on the right ── */}
      <div className={styles.totalsBar}>
        <span className={styles.gridHint}>{GRID_HINT}</span>
        <span className={styles.totals}>
          <span>
            <span className={styles.totalCaption}>Lines</span>
            <span className={styles.totalValue}>{totals.lines}</span>
          </span>
          <span>
            <span className={styles.totalCaption}>Counted</span>
            <span className={styles.totalValue}>
              {totals.counted} / {totals.lines}
            </span>
          </span>
          <span>
            <span className={styles.totalCaption}>Variance Lines</span>
            <span className={styles.totalValue}>{totals.varianceLines}</span>
          </span>
          <span>
            <span className={styles.totalCaption}>Net Variance Qty</span>
            <span className={cx(styles.totalValue, totals.netQty < 0 && styles.totalNegative)}>
              {formatNetQty(totals.netQty)}
            </span>
          </span>
          <span title="An ESTIMATE — the difference at each holding's average cost. The engine values a shortage by the item's valuation policy and an overage by the rate source, so the posted figure can differ.">
            <span className={styles.totalCaption}>Net Variance Value</span>
            <span className={cx(styles.totalValue, totals.netValue < 0 && styles.totalNegative)}>
              {formatNetValue(totals.netValue)}
            </span>
          </span>
        </span>
      </div>

      <div className={quotationStyles.buttonBar}>
        <span className={styles.footerHint}>
          F1 · keys on this screen · Alt+PgUp / Alt+PgDn previous / next sheet
        </span>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canLoadSheet}
          title="Draw every holding of the chosen godown onto the sheet — one line per lot and bucket."
          onClick={api.loadCountSheet}
        >
          {busy === "sheet" ? "Loading…" : "Load Sheet · F9"}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !rights.mayStartNew}
          onClick={api.newDocument}
        >
          {withKey("New", "new")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canSaveDraft}
          title="Writes the counted lines and nothing else. No stock moves."
          onClick={() => runSave(false)}
        >
          {busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          disabled={working || !canPost}
          title="Saves and posts in one step: the lines that disagree with the book write their variance. If any line is refused, nothing is saved."
          onClick={() => runSave(true)}
        >
          {busy === "posting" ? "Posting…" : withKey("Save & Post", "post")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canCancel}
          title="Writes one reversing row per posted variance row. Never a delete — and it can fail if the stock has since been sold."
          onClick={api.cancelVoucher}
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
          title="Every step of this sheet — who saved, posted or cancelled it, when, and why."
          onClick={openHistory}
        >
          {withKey("History", "history")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={showList}>
          {withKey("Show List", "open")}
        </button>
        <button type="button" className={quotationStyles.button} onClick={close}>
          {withKey("Close", "close")}
        </button>
      </div>

      <GridPickerModal
        isOpen={picker?.kind === "item"}
        title="Select item"
        gridKey={ITEM_POPUP_GRID_KEY}
        params={itemPickerParams}
        fallbackColumns={ITEM_PICKER_COLUMNS}
        initialQuery={picker?.kind === "item" ? picker.initialQuery : ""}
        emptyText="No item matches that name."
        onClose={closePicker}
        onPick={(row) => {
          setPicker(null);
          api.pickItem(pickerRowKey, textOf(row.item_id), textOf(row.item_name_en));
        }}
      />
      <GridPickerModal
        isOpen={picker?.kind === "reason"}
        title="Select reason"
        gridKey={STOCK_REASON_POPUP_GRID_KEY}
        fallbackColumns={REASON_PICKER_COLUMNS}
        initialQuery={picker?.kind === "reason" ? picker.initialQuery : ""}
        emptyText="No reason matches."
        onClose={closePicker}
        onPick={(row) => {
          setPicker(null);
          api.pickReason(pickerRowKey, textOf(row.srm_id), textOf(row.srm_name));
        }}
      />
      <AskTextModal
        isOpen={api.cancelPrompt !== null}
        title={api.cancelPrompt?.title ?? ""}
        message="Why is this count being reversed?"
        placeholder="Type the reason"
        presets={CANCEL_REASON_PRESETS}
        required
        onCancel={api.dismissCancel}
        onConfirm={api.confirmCancel}
      />
      <TxnKeysSheet
        open={keysOpen}
        onClose={() => setKeysOpen(false)}
        document={KEY_SHEET.document}
        lines={KEY_SHEET.lines}
      />
      <TxnHistoryDialog
        target={historyTarget}
        docLabel="Physical Stock"
        onClose={() => setHistoryTarget(null)}
      />
    </div>
  );
}
