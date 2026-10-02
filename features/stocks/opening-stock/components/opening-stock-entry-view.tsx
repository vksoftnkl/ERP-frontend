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
 * Keys, as the Qt screen binds them: F5 Save Draft, F6 Save & Post, F8 Show
 * List, F2 Edit, Esc Close, and Ctrl+Enter saves the draft from anywhere —
 * including inside a grid cell. Plain Enter belongs to the grid (it commits the
 * cell and steps on), which is why no button here is a default button.
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
import { formatCurrency } from "@/domain/pricing";
import {
  DateField,
  DropdownCombo,
  ReadOnlyInput,
  SelectField,
  TextField,
} from "@/features/sales/quotation/components/fields";
import { focusFirstCell } from "@/features/sales/quotation/components/grid-focus";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { useGridId } from "@/lib/configured-grids";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { resolveOpeningStockColumns } from "../opening-stock.columns";
import {
  GODOWN_DROPDOWN_KEY,
  ITEM_PICKER_GRID_KEY,
  OPENING_STOCK_GRID_NAME,
  OPENING_STOCK_LINES_UI_TABLE_KEY,
  RATE_SOURCES,
  REMARKS_MAX_LENGTH,
  SUPPLIER_PICKER_GRID_KEY,
  USR_REFNO_MAX_LENGTH,
  type RateSource,
} from "../opening-stock.constants";
import { scopeLabelOf } from "../opening-stock.state";
import type { OpeningStockDocKey } from "../opening-stock.types";
import {
  DATE_FIELD_ID,
  GODOWN_FIELD_ID,
  useOpeningStockDraft,
} from "../use-opening-stock-draft";
import { CancelReasonDialog } from "./cancel-reason-dialog";
import { GridPickerModal, type PickerFallbackColumn } from "./grid-picker-modal";
import { OpeningStockGrid } from "./opening-stock-grid";
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

export type OpeningStockEntryViewProps = {
  initialDocument?: OpeningStockDocKey;
  initialMode: "entry" | "browse";
  onBackToList: () => void;
};

export function OpeningStockEntryView({
  initialDocument,
  initialMode,
  onBackToList,
}: OpeningStockEntryViewProps) {
  const api = useOpeningStockDraft({ initialDocument, initialMode, onLeave: onBackToList });
  const { draft, totals, busy } = api;

  // Menu permissions, as `applyPermissions()` applies them: create gates New,
  // Save and Post; edit gates Edit; delete gates Cancel — the one destructive
  // action left.
  const { permissions } = usePagePermissions();

  const uiTableId = useUiTableId(OPENING_STOCK_LINES_UI_TABLE_KEY);
  const { data: layoutRows } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(() => resolveOpeningStockColumns(layoutRows), [layoutRows]);

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

  const isDraft = draft.status === "DRAFT";
  const editable = draft.mode === "entry" && isDraft;
  const working = busy !== "idle";
  const canSave = isDraft && permissions.canCreate;
  const canCancel = Boolean(draft.svhId) && draft.status !== "CANCELLED" && permissions.canDelete;
  const canEdit = isDraft && permissions.canEdit;

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
      if (working || !canSave) {
        return;
      }
      commitActiveCell();
      void api.saveDraft(post);
    },
    [api, canSave, commitActiveCell, working],
  );

  // ── Window keys ───────────────────────────────────────────────────────
  const keyStateRef = useRef({ runSave, api, editable, canEdit, isDraft, working, mode: draft.mode });
  useLayoutEffect(() => {
    keyStateRef.current = { runSave, api, editable, canEdit, isDraft, working, mode: draft.mode };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey) {
        return;
      }
      // A dialog over the screen owns the keyboard — but F5 must not reload the
      // page behind it and take the unsaved document with it.
      if (document.querySelector('[aria-modal="true"]')) {
        if (event.key === "F5") {
          event.preventDefault();
        }
        return;
      }
      const state = keyStateRef.current;
      // Ctrl+Enter — save the draft, from anywhere (both Enter keys arrive as "Enter").
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        if (state.mode === "browse" || !state.isDraft) {
          return; // a posted document has nothing to save
        }
        state.runSave(false);
        return;
      }
      if (event.ctrlKey || event.shiftKey) {
        return;
      }
      switch (event.key) {
        case "F5":
          event.preventDefault();
          state.runSave(false);
          return;
        case "F6":
          event.preventDefault();
          state.runSave(true);
          return;
        case "F8":
          event.preventDefault();
          if (!state.working) {
            void state.api.showList();
          }
          return;
        case "F2":
          event.preventDefault();
          if (!state.working && state.canEdit) {
            state.api.edit();
          }
          return;
        case "Escape":
          event.preventDefault();
          if (!state.working) {
            void state.api.close();
          }
          return;
        default:
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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

  /** Enter walks the header; Enter on its last field hands over to the grid. */
  const onHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.ctrlKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.getAttribute("aria-expanded") === "true") {
      return;
    }
    if (moveHeaderFocus(event.currentTarget, event.target, event.shiftKey ? -1 : 1)) {
      event.preventDefault();
      return;
    }
    if (!event.shiftKey && focusFirstCell(OPENING_STOCK_GRID_NAME, "itemName")) {
      event.preventDefault();
    }
  };

  const problemLines = draft.lines.filter((line) => line.problem);

  return (
    <div className={quotationStyles.page}>
      <header className={quotationStyles.titleBar}>
        <span className={styles.titleLeft}>
          <button type="button" className={quotationStyles.button} onClick={() => void api.close()}>
            ‹ Opening Stock
          </button>
          <h1 className={quotationStyles.title}>Opening Stock</h1>
          <span
            className={styles.scope}
            title="The company, branch and accounting year this document belongs to. A voucher is saved back to its own, never the session's."
          >
            {scopeLabelOf(draft)}
          </span>
        </span>
        <div className={quotationStyles.titleMeta}>
          {draft.audit ? <span className={styles.audit}>{draft.audit}</span> : null}
          {busy === "loading" ? <span>loading…</span> : null}
          {draft.mode === "browse" ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
          {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
          <span
            className={cx(quotationStyles.statusBadge, STATUS_CLASS[draft.status])}
            title="DRAFT, POSTED or CANCELLED — there is no fourth state."
          >
            {draft.status}
          </span>
        </div>
      </header>

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
          - Line
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={!editable || working}
          title="Copy this line as another allocation of the same item — one line drawn from two batches is two rows sharing a line number"
          onClick={() => api.splitLine(activeRowKey)}
        >
          Split batch
        </button>
        <span className={styles.gridHint}>
          Greyed cells are greyed by the ITEM, not by the screen — batch, expiry, MRP and serial open only when its
          tracking policy says so.
        </span>
      </div>

      <div className={styles.headerPanel} onKeyDown={onHeaderKeyDown}>
        <ReadOnlyInput
          id="opening-stock-refno"
          label="Voucher No"
          value={draft.refno}
          placeholder="minted on save"
        />
        <DateField
          id={DATE_FIELD_ID}
          label="Date"
          value={draft.header.docDate}
          disabled={!editable}
          onChange={(value) => api.setHeaderField("docDate", value)}
        />
        <DropdownCombo
          id={GODOWN_FIELD_ID}
          label="Godown *"
          dropdownId={godownDropdownId}
          valueKey="gdl_id"
          labelKey="gdl_name"
          value={draft.header.godownId}
          selectedLabel={draft.header.godownName}
          disabled={!editable}
          placeholder=""
          onSelect={(id, name) => api.setGodown(id, name)}
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

      <div className={quotationStyles.gridsRow}>
        <section className={cx(quotationStyles.gridShell, quotationStyles.itemGridShell)}>
          <div className={quotationStyles.gridHead}>
            <span className={quotationStyles.gridHeadTitle}>Lines</span>
            <span className={quotationStyles.gridHeadActions}>
              <span className={quotationStyles.modalNote}>
                Enter next cell · + / - line · F4 unit · type on Item to search · ↓ on Barcode opens the picker
              </span>
            </span>
          </div>
          {problemLines.length ? (
            <p className={styles.problemStrip} role="alert">
              {problemLines.map((line) => line.problem).join("\n")}
            </p>
          ) : null}
          <OpeningStockGrid
            columns={columns}
            lines={draft.lines}
            editable={editable}
            activeRowKey={activeRowKey}
            flagged={api.flagged}
            onActiveRowChange={setActiveRowKey}
            onSetField={api.setLineField}
            onOpenItemPicker={api.openItemPicker}
            onOpenSupplierPicker={api.openSupplierPicker}
            onInsertLine={api.insertLine}
            onRemoveLine={(rowKey) => void api.removeLine(rowKey)}
            onSwitchUnit={api.switchUnit}
            onCtrlEnter={() => {
              // A posted document has nothing to save.
              if (draft.mode === "entry" && isDraft) {
                runSave(false);
              }
            }}
          />
        </section>
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
        <span className={styles.footerHint}>Ctrl+Enter saves the draft</span>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canSave}
          title="Writes the document and nothing else. No stock moves."
          onClick={() => runSave(false)}
        >
          {busy === "saving" ? "Saving…" : "Save Draft"} <span className={quotationStyles.buttonHint}>F5</span>
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          disabled={working || !canSave}
          title="Saves, runs the pre-post check, then posts. Posting is one way: the document is frozen afterwards and can only be cancelled."
          onClick={() => runSave(true)}
        >
          {busy === "posting" ? "Posting…" : "Save & Post"} <span className={quotationStyles.buttonHint}>F6</span>
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working}
          onClick={() => void api.showList()}
        >
          Show List <span className={quotationStyles.buttonHint}>F8</span>
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canEdit}
          onClick={api.edit}
        >
          Edit <span className={quotationStyles.buttonHint}>F2</span>
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canCancel}
          title="Writes one reversing ledger row per posted row. Never a delete, never an edit — and it can legitimately fail if the stock has since been sold."
          onClick={api.requestCancel}
        >
          {busy === "cancelling" ? "Cancelling…" : "Cancel Voucher"}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !permissions.canCreate}
          onClick={() => void api.newDocument()}
        >
          New
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={() => void api.close()}>
          Close <span className={quotationStyles.buttonHint}>Esc</span>
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
    </div>
  );
}
