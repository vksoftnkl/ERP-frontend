"use client";

/**
 * Physical Stock Count — the count screen (`PhysicalStockEntry`, menu 45).
 * Layout and wiring only: the arithmetic is `physical-stock.state.ts`, the
 * network `use-physical-stock-draft.ts`.
 *
 * The sheet is GENERATED, not keyed: every line is a holding off
 * `/stock/physical/count-sheet` — drawn whole by Load Sheet (F9), or resolved
 * one item at a time from the Item picker or a scanned barcode on the blank
 * row. The operator types ONE number per line, what was found; only the
 * difference posts.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { useDropdownId } from "@/lib/configured-dropdowns";
import {
  CheckField,
  DateField,
  DropdownCombo,
  GroupBox,
  ReadOnlyInput,
  SelectField,
  TextField,
} from "@/features/sales/quotation/components/fields";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
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
}: PhysicalStockEntryViewProps) {
  const api = usePhysicalStockDraft();
  const { draft, totals, editable, busy, columns, rights } = api;
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const reasonDropdownId = useDropdownId(STOCK_REASON_DROPDOWN_KEY);
  const [picker, setPicker] = useState<{
    kind: PickerKind;
    rowKey: string;
    initialQuery: string;
  } | null>(null);
  const working = busy !== "idle";
  const isDraft = draft.status === STATUS_DRAFT;
  const isPosted = draft.status === STATUS_POSTED;
  const saved = Boolean(draft.svhId);
  // Document rights ANDed with the status, as Qt's `applyStatus()` does: Create
  // saves a new draft and Edit a saved one; Post gates Save & Post; Cancel
  // reverses a posted sheet and Delete drops a draft; New needs Create or Post.
  const canSaveDraft = isDraft && rights.maySaveDraft(saved);
  const canPost = isDraft && rights.mayPost;
  const canCancel = saved && (isDraft || isPosted) && rights.mayCancelDocument(isPosted);
  const canEdit = isDraft && rights.mayEdit;

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
      onClose,
    );

  // F9 draws the sheet, F8 shows the list, Ctrl+Enter saves — Enter alone
  // belongs to the grid, and on a 300-line sheet it is the key pressed most.
  // Ctrl+Enter is Save Draft's key, so it obeys Save Draft's gate.
  const keysRef = useRef({ api, editable, canSaveDraft, showList, picker });
  useLayoutEffect(() => {
    keysRef.current = { api, editable, canSaveDraft, showList, picker };
  });
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const current = keysRef.current;
      if (current.picker || anyDialogOpen() || event.repeat) {
        return;
      }
      if (event.key === "F9" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        current.api.loadCountSheet();
        return;
      }
      if (event.key === "F8" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        current.showList();
        return;
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        if (!current.editable || !current.canSaveDraft) {
          return;
        }
        event.preventDefault();
        // Close any open cell editor first.
        (document.activeElement as HTMLElement | null)?.blur();
        current.api.saveDraft(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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

  const pickerRowKey = picker?.rowKey ?? "";

  /** A popup closed without a pick: the cursor goes back to the cell that opened it. */
  const closePicker = () => {
    if (picker) {
      const row = draft.lines.findIndex((line) => line.key === picker.rowKey);
      focusGridCell(row, picker.kind === "item" ? Cols.Description : Cols.ReasonName);
    }
    setPicker(null);
  };

  return (
    <div className={quotationStyles.page}>
      <header className={quotationStyles.titleBar}>
        <span className={quotationStyles.gridHeadActions}>
          <button type="button" className={quotationStyles.button} onClick={close}>
            ‹ Physical Stock Counts
          </button>
          <h1 className={cx(quotationStyles.title, styles.entryTitle)}>Physical Stock Count</h1>
        </span>
        <div className={cx(quotationStyles.titleMeta, styles.titleRight)}>
          {draft.mode === "browse" || !isDraft ? (
            <span className={quotationStyles.readOnlyBadge}>Read only</span>
          ) : null}
          {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
          {working ? <span>{busy === "sheet" ? "drawing the sheet…" : "working…"}</span> : null}
          <span className={styles.scope}>{draft.scope}</span>
          <span className={cx(styles.statusTone, toneClass(draft.status))}>{draft.status}</span>
        </div>
      </header>

      <GroupBox title="Sheet" className={styles.sheetFrame}>
        <div className={styles.sheetGrid}>
          <ReadOnlyInput
            id="physical-stock-sheet-no"
            label="Sheet No"
            value={draft.refno}
            placeholder="assigned at save"
          />
          <DateField
            id={HEADER_FIELD_IDS.docDate}
            label="Count Date *"
            value={draft.docDate}
            disabled={!editable}
            onChange={(value) => api.setHeader("docDate", value)}
          />
          <DropdownCombo
            id={HEADER_FIELD_IDS.godown}
            label="Godown *"
            dropdownId={godownDropdownId}
            valueKey="gdl_id"
            labelKey="gdl_name"
            metaKey="gdl_short"
            value={draft.godownId}
            selectedLabel={draft.godownName}
            disabled={!editable}
            placeholder="The godown being counted"
            onSelect={(id, name) => api.selectGodown(id, name)}
          />
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
          <SelectField
            id="physical-stock-rate-source"
            label="Rate Source"
            value={draft.rateSource}
            options={RATE_SOURCE_OPTIONS}
            disabled={!editable}
            title="What an OVERAGE is valued at. AVG_COST by default. A SHORTAGE ignores this and is valued by the item's valuation policy."
            onChange={(value) => api.setHeader("rateSource", value)}
          />
          <TextField
            id="physical-stock-usr-refno"
            label="Your Ref No"
            value={draft.usrRefno}
            maxLength={100}
            disabled={!editable}
            title="svh_usr_refno - free text; nothing reads it."
            onChange={(value) => api.setHeader("usrRefno", value)}
          />
          <TextField
            id="physical-stock-remarks"
            label="Remarks"
            value={draft.remarks}
            maxLength={250}
            disabled={!editable}
            title="svh_remarks - describes the count."
            onChange={(value) => api.setHeader("remarks", value)}
          />
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
          <div className={styles.sheetChecks}>
            <span title="Refuses any movement touching this godown while the sheet is DRAFT and the WALL CLOCK is inside the window above. Other godowns keep trading; posting or cancelling lifts it.">
              <CheckField
                id="physical-stock-freeze"
                label="Freeze this godown while counting"
                checked={draft.freezeStock}
                disabled={!editable}
                onChange={(checked) => api.toggleFreeze(checked)}
              />
            </span>
            <span title="Hides Book Qty, Difference and the variance tint while counting, so the counter records what is on the shelf rather than what the system expected.">
              <CheckField
                id="physical-stock-blind"
                label="Blind count"
                checked={draft.blind}
                onChange={(checked) => api.setBlind(checked)}
              />
            </span>
          </div>
        </div>
      </GroupBox>

      <section className={cx(quotationStyles.gridShell, styles.countGridShell)}>
        <div className={quotationStyles.gridHead}>
          <span className={quotationStyles.gridHeadTitle}>Holdings</span>
          <span className={quotationStyles.modalNote}>
            Enter next line · type on Item or Reason to search · scan on the blank row · F9 load
            sheet · Ctrl+Enter save
          </span>
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
          onOpenPicker={(kind, rowKey, initialQuery) => setPicker({ kind, rowKey, initialQuery })}
        />
      </section>

      <div className={styles.totalsBar}>
        <span className={styles.audit} title={draft.audit || undefined}>
          {draft.audit}
        </span>
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
      </div>

      <div className={quotationStyles.buttonBar}>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !editable}
          title="Draw every holding of the chosen godown onto the sheet — one line per lot and bucket."
          onClick={api.loadCountSheet}
        >
          {busy === "sheet" ? "Loading…" : "Load Sheet"}{" "}
          <span className={quotationStyles.buttonHint}>F9</span>
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !rights.mayStartNew}
          onClick={api.newDocument}
        >
          New
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canSaveDraft}
          onClick={() => api.saveDraft(false)}
        >
          {busy === "saving" ? "Saving…" : "Save Draft"}{" "}
          <span className={quotationStyles.buttonHint}>Ctrl+Enter</span>
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          disabled={working || !canPost}
          onClick={() => api.saveDraft(true)}
        >
          {busy === "posting" ? "Posting…" : "Save & Post"}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canCancel}
          onClick={api.cancelVoucher}
        >
          {busy === "cancelling" ? "Cancelling…" : "Cancel Sheet"}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canEdit}
          onClick={api.edit}
        >
          Edit
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={showList}>
          Show List <span className={quotationStyles.buttonHint}>F8</span>
        </button>
        <button type="button" className={quotationStyles.button} onClick={close}>
          Close
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
    </div>
  );
}
