"use client";

/**
 * Shortage Receipt (menu 195) — the Qt `ShortageReceiptEntry` (NexERP b8f615e,
 * plan-purchase-frontend F8). Layout and wiring only: every rule is in
 * `shortage.state.ts`, the network in `use-shortage-receipt.ts`.
 *
 * Pick the supplier: every open shortage of theirs is a row (billed-not-came,
 * short on a challan, a replacement due) with its source batch and cost. Type
 * what came on the rows it came for: Save Draft holds that qty against the
 * shortages; Post (Ctrl+Enter) brings the stock in at the shortage's own cost,
 * clears the receivable and releases the parked GST. Cancel (Alt+X) undoes a
 * draft or a posted receipt — the shortage is open again.
 *
 * A shortage the supplier will never send is closed from here too, on a NEW
 * receipt's open list: Supplier CN… (bill-wise credit) or Write off… closes the
 * selected row's whole open qty; Undo close… takes the last close of the
 * selected row back (a part-closed one — a fully closed shortage has no row).
 *
 * Keys: Alt+N New, Ctrl+S Save Draft, Ctrl+Enter Post, F2 Edit, Alt+X Cancel,
 * Ctrl+H History, Ctrl+O Show List, Esc Close; F1 the sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { NexDropdownMulti } from "@/components/design-system/dropdown";
import { TxnHistoryDialog, type TxnHistoryTarget } from "@/components/txn/txn-history-dialog";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { useBusinessContext } from "@/components/layout/business-context";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { DateField, DropdownCombo, Field, ReadOnlyInput, TextField } from "@/features/sales/quotation/components/fields";
import { settingsColumnsFromLayout, useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import { documentRights } from "@/lib/permissions/document-rights";
import { keySheetRows, withKey, type TxnKeyRow } from "@/lib/txn-keys";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { PURCHASE_DOC_TYPES } from "../../shared/purchase.doc-types";
import { qtyText } from "../../shared/purchase.format";
import type { PurchaseEntryViewProps } from "../../shared/purchase.types";
import {
  CHALLAN_MAX_LENGTH,
  COL,
  CREW_DROPDOWN_KEY,
  CREW_EMPTY_PARAMS,
  CREW_ROLE,
  DISCARD_MESSAGE,
  FALLBACK_COLUMN_TITLES,
  GODOWN_DROPDOWN_KEY,
  LINE_GRID_NAME,
  LINES_UI_TABLE_KEY,
  REMARKS_MAX_LENGTH,
  SUPPLIER_DROPDOWN_KEY,
} from "../shortage.constants";
import {
  closeDescription,
  computeTotals,
  isEditable,
  isFresh,
  lineProblems,
  resolveColumns,
  titleLine,
  totalsText,
} from "../shortage.state";
import type { ShortageCloseRow } from "../shortage.types";
import { useShortageReceipt } from "../use-shortage-receipt";
import { CnNoDialog } from "./cn-no-dialog";
import { ShortageLinesTable } from "./shortage-lines-table";
import styles from "../page.module.scss";

const CONFIG = PURCHASE_DOC_TYPES.shortage;

const IDS = {
  supplier: "shortage-receipt-supplier",
  godown: "shortage-receipt-godown",
  date: "shortage-receipt-date",
  refno: "shortage-receipt-refno",
  challan: "shortage-receipt-challan",
  crew: "shortage-receipt-crew",
  remarks: "shortage-receipt-remarks",
} as const;

const STATUS_CLASS: Record<string, string> = {
  DRAFT: styles.statusDraft,
  POSTED: styles.statusPosted,
  CANCELLED: styles.statusCancelled,
};

const LINE_KEYS: readonly TxnKeyRow[] = [
  { label: "Next cell (Received, Batch)", keyText: "Enter" },
  { label: "Same column, row above / below", keyText: "↑ / ↓" },
  { label: "Put the cell back", keyText: "Esc" },
];
const KEY_SHEET = keySheetRows(["new", "saveDraft", "post", "edit", "cancelDoc", "history", "open", "close"], LINE_KEYS);

const CANCEL_REASONS = ["Keyed in error", "Goods sent back", "Wrong supplier"] as const;

type Ask =
  | { kind: "cancel" }
  | { kind: "cn"; key: string; message: string }
  | { kind: "writeOff"; key: string; message: string }
  | { kind: "undo"; key: string; close: ShortageCloseRow; message: string };

export function ShortageReceiptEntryView({ initialDocument, initialMode, onBackToList, memory }: PurchaseEntryViewProps) {
  const api = useShortageReceipt(memory);
  const { draft, draftRef } = api;
  const { activeCompany, activeBranch } = useBusinessContext();
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);

  const [ask, setAsk] = useState<Ask | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  /** Held, not derived: the trail dialog refetches whenever its target object changes. */
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  const linesRef = useRef<HTMLElement | null>(null);

  // ------------------------------------------------------------- layout
  const uiTableId = useUiTableId(LINES_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(() => resolveColumns(layout), [layout]);
  const settingsColumns = useMemo(() => settingsColumnsFromLayout(layout, FALLBACK_COLUMN_TITLES), [layout]);
  const gridSettings = useGridSettings({
    label: "Shortage receipt lines",
    uiTableId,
    columns: settingsColumns,
    pendingWidthCount: 0,
    savingWidths: false,
    focusNote: "Focus is where Enter stops on a row; with none ticked it stops on Received and Batch.",
  });
  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const crewDropdownId = useDropdownId(CREW_DROPDOWN_KEY);
  const godownParams = useMemo(() => ({ ibranch_id: draft.branchId }), [draft.branchId]);
  const crewParams = useMemo(() => ({ iemp_branch_id: draft.branchId, iemp_role: CREW_ROLE }), [draft.branchId]);

  // --------------------------------------------------------------- derived
  const working = api.busy !== null;
  const saved = draft.psrId !== "";
  const editable = isEditable(draft);
  const fresh = isFresh(draft);
  const totals = useMemo(() => computeTotals(draft), [draft]);
  const problems = useMemo(() => lineProblems(draft), [draft]);
  const problemKeys = useMemo(() => new Set(problems.map((problem) => problem.key)), [problems]);
  const activeLine = draft.lines.find((line) => line.key === draft.activeKey) ?? null;

  const canSaveDraft = editable && rights.maySaveDraft(saved);
  const canPost = editable && rights.mayPost;
  const canCancel = saved && draft.status !== "CANCELLED" && rights.mayCancelDocument(draft.status === "POSTED");
  const canEdit = saved && draft.status === "DRAFT" && draft.mode === "browse" && rights.mayEdit;
  // The closes act on a NEW receipt's open list; the server judges them on Post / Cancel.
  const closesLive = fresh && editable && activeLine !== null;
  const canClose = closesLive && rights.mayPost;
  const canUndoClose = closesLive && rights.mayCancelDocument(true);

  // ------------------------------------------------------------- opening
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) {
      return;
    }
    opened.current = true;
    if (initialDocument && !memory.resume) {
      void api.load(initialDocument, initialMode === "entry");
    }
    // Once, on mount: the page remounts this view for every Open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusFirstReceived = useCallback(() => {
    linesRef.current
      ?.querySelector<HTMLElement>(`[data-quotation-grid="${LINE_GRID_NAME}"][data-quotation-field="${COL.Received}"]`)
      ?.focus();
  }, []);

  // ------------------------------------------------------------- actions
  const guardDirty = useCallback(
    async (run: () => void) => {
      if (draftRef.current.dirty) {
        const ok = await confirm({ title: "Discard entry", message: DISCARD_MESSAGE, confirmLabel: "Discard" });
        if (!ok) {
          return;
        }
        api.forgetRemembered();
      }
      run();
    },
    [api, draftRef],
  );
  const runClose = useCallback(() => void guardDirty(onBackToList), [guardDirty, onBackToList]);
  const runNew = useCallback(() => void guardDirty(api.reset), [api.reset, guardDirty]);
  const runSave = useCallback((post: boolean) => void api.save(post), [api]);

  const startCancel = useCallback(() => {
    const current = draftRef.current;
    if (!current.psrId || current.status === "CANCELLED") {
      toast.warn("Open a saved receipt first.", { title: "Nothing to cancel" });
      return;
    }
    setAsk({ kind: "cancel" });
  }, [draftRef]);

  const selectedRowOrWarn = useCallback(() => {
    const current = draftRef.current;
    const line = current.lines.find((candidate) => candidate.key === current.activeKey);
    if (!line || !isFresh(current)) {
      toast.warn("Select an open shortage row on a new receipt first.", { title: "Pick a short row" });
      return null;
    }
    return line;
  }, [draftRef]);

  const startClose = useCallback(
    (kind: "cn" | "writeOff") => {
      const line = selectedRowOrWarn();
      if (!line) {
        return;
      }
      const short = line.shortQty === null ? "" : qtyText(line.shortQty);
      setAsk(
        kind === "cn"
          ? { kind, key: line.key, message: `${short} short of ${line.itemName} — the supplier's credit note no:` }
          : { kind, key: line.key, message: `${short} short of ${line.itemName} will never come. Why?` },
      );
    },
    [selectedRowOrWarn],
  );

  const startUndoClose = useCallback(async () => {
    const line = selectedRowOrWarn();
    if (!line) {
      return;
    }
    const closes = await api.standingCloses(line.key);
    if (closes === null) {
      return;
    }
    const last = closes[0];
    if (!last) {
      toast.warn("This shortage has no close standing.", { title: "Nothing to undo" });
      return;
    }
    setAsk({
      kind: "undo",
      key: line.key,
      close: last,
      message: `Undo ${closeDescription(last)} on ${line.itemName}? Why is it being undone?`,
    });
  }, [api, selectedRowOrWarn]);

  const openHistory = useCallback(() => {
    const current = draftRef.current;
    if (!current.psrId) {
      return;
    }
    setHistoryTarget({ docId: current.psrId, companyId: current.companyId, accYear: current.accYear, refNo: current.refno });
  }, [draftRef]);

  // ------------------------------------------------------------ shortcuts
  // A handler left null is not intercepted at all: its button is off. A dialog
  // is `aria-modal`, so the hook stands down under one.
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? runNew : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: !working && canPost ? () => runSave(true) : null,
      edit: !working && canEdit ? api.beginEdit : null,
      cancelDoc: !working && canCancel ? startCancel : null,
      history: saved ? openHistory : null,
      open: !working ? runClose : null,
      close: !working ? runClose : null,
    },
    { onHelp: () => setKeysOpen(true), enabled: !gridSettings.active },
  );

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

  /** Enter walks the header; its last field hands over to the first Received. */
  const onHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (moveHeaderFocus(event.currentTarget, event.target, event.shiftKey ? -1 : 1)) {
      event.preventDefault();
      return;
    }
    if (!event.shiftKey && editable && draft.lines.length > 0) {
      event.preventDefault();
      focusFirstReceived();
    }
  };

  const emptyText = !draft.supplierId
    ? "Pick the supplier — every open shortage of theirs comes in as a row."
    : api.busy === "loading"
      ? "Reading the open shortages…"
      : fresh
        ? "Nothing of this supplier's is short."
        : "No lines.";

  return (
    <div className={quotationStyles.page}>
      <div className={styles.topBand}>
        {/* ── the title block ─────────────────────────────────────────── */}
        <div className={styles.titleBlock}>
          <div className={styles.titleLine}>
            <button type="button" className={quotationStyles.button} onClick={runClose}>
              ‹ {CONFIG.listTitle}
            </button>
            <h1 className={quotationStyles.title}>{CONFIG.title}</h1>
          </div>
          <span className={styles.docTitle}>{titleLine(draft)}</span>
          <span className={styles.scope} title="The company and branch this receipt belongs to.">
            {[activeCompany?.name, activeBranch?.name, draft.accYear].filter(Boolean).join(" · ")}
          </span>
          <div className={styles.statusLine}>
            <span
              className={cx(styles.statusPill, STATUS_CLASS[draft.status] ?? styles.statusDraft)}
              title="DRAFT holds the qty against the shortages; POSTED brought the goods in; CANCELLED opened the shortage again."
            >
              {draft.status}
            </span>
            {draft.mode === "browse" ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
            {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
            {api.busy ? <span className={styles.scope}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
          </div>
        </div>

        {/* ── the header: Supplier · Godown · Date · Receipt No / Challan · Unloaded by · Remarks ── */}
        <div className={styles.fieldsCard} onKeyDown={onHeaderKeyDown}>
          <DropdownCombo
            id={IDS.supplier}
            label="Supplier"
            dropdownId={supplierDropdownId}
            valueKey="sup_id"
            labelKey="sup_name"
            value={draft.supplierId}
            selectedLabel={draft.supplierName}
            disabled={!editable || !fresh || working}
            required
            placeholder="Whose shortages came"
            onSelect={api.chooseSupplier}
          />
          <DropdownCombo
            id={IDS.godown}
            label="Godown"
            dropdownId={godownDropdownId}
            valueKey="gdl_id"
            labelKey="gdl_name"
            value={draft.godownId}
            selectedLabel={draft.godownName}
            disabled={!editable}
            required
            params={godownParams}
            placeholder="Where the goods land"
            onSelect={(godownId, godownName) => api.patchHeader({ godownId, godownName })}
          />
          <DateField
            id={IDS.date}
            label="Date"
            value={draft.docDate}
            disabled={!editable}
            onChange={(docDate) => api.patchHeader({ docDate })}
          />
          <ReadOnlyInput id={IDS.refno} label="Receipt No" value={draft.refno} placeholder="given on save" />
          <TextField
            id={IDS.challan}
            label="Challan No"
            value={draft.challanNo}
            disabled={!editable}
            maxLength={CHALLAN_MAX_LENGTH}
            onChange={(challanNo) => api.patchHeader({ challanNo })}
          />
          <Field label="Unloaded by" htmlFor={IDS.crew}>
            <NexDropdownMulti
              dropdownId={crewDropdownId}
              params={crewParams}
              keepEmptyParams={CREW_EMPTY_PARAMS}
              value={draft.receivedBy}
              disabled={!editable}
              placeholder="Who unloaded"
              aria-label="Unloaded by"
              onChange={(receivedBy) => api.patchHeader({ receivedBy })}
            />
          </Field>
          <Field label="Remarks" htmlFor={IDS.remarks}>
            <input
              id={IDS.remarks}
              className={cx(quotationStyles.input, styles.remarksInput)}
              value={draft.remarks}
              disabled={!editable}
              maxLength={REMARKS_MAX_LENGTH}
              autoComplete="off"
              data-quotation-focus={IDS.remarks}
              onChange={(event) => api.patchHeader({ remarks: event.target.value })}
            />
          </Field>
        </div>
      </div>

      <section className={cx(quotationStyles.gridShell, styles.gridShell)} ref={linesRef}>
        <div className={quotationStyles.gridHead}>
          <span className={quotationStyles.gridHeadTitle}>{fresh ? "Open shortages" : "Lines"}</span>
          <span className={quotationStyles.modalNote}>
            {editable ? "Type what came on its row; blank = not this time. Qty is in the item's base unit." : ""}
          </span>
        </div>
        {gridSettings.overlays}
        <ShortageLinesTable
          lines={draft.lines}
          columns={columns}
          editable={editable}
          activeKey={draft.activeKey}
          problemKeys={problemKeys}
          emptyText={emptyText}
          onEdit={api.patchLine}
          onSelect={api.selectLine}
          onContextMenu={gridSettings.onContextMenu}
        />
      </section>

      <p className={styles.totalsLine} aria-live="polite">
        {draft.lines.length > 0 ? totalsText(draft, totals) : ""}
      </p>
      {problems.length > 0 ? <p className={styles.validation}>{problems.map((problem) => problem.text).join(" · ")}</p> : null}
      <p className={styles.hintLine}>{api.hint}</p>
      <div className={styles.spacer} />

      <div className={styles.buttonBar}>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canClose}
          title="The supplier will not send it — they credit us (selected row)"
          onClick={() => startClose("cn")}
        >
          Supplier CN…
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canClose}
          title="It will never come and no one pays — write it off (selected row)"
          onClick={() => startClose("writeOff")}
        >
          Write off…
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canUndoClose}
          title="Take back the last close of the selected row"
          onClick={() => void startUndoClose()}
        >
          Undo close…
        </button>
        <span className={styles.footerHint}>F1 lists the keys</span>
        <button type="button" className={quotationStyles.button} disabled={working || !rights.mayStartNew} onClick={runNew}>
          {withKey("New", "new")}
        </button>
        {canEdit ? (
          <button type="button" className={quotationStyles.button} disabled={working} onClick={api.beginEdit}>
            {withKey("Edit", "edit")}
          </button>
        ) : null}
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canSaveDraft}
          title="Holds the qty against the shortages. Nothing comes in."
          onClick={() => runSave(false)}
        >
          {api.busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          disabled={working || !canPost}
          title="Stock in at the shortage's own cost, the receivable cleared, the parked GST released."
          onClick={() => runSave(true)}
        >
          {api.busy === "posting" ? "Posting…" : withKey("Post", "post")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canCancel}
          title={draft.status === "POSTED" ? "The goods go out again and the shortage is open again." : "Drop this draft's hold on the shortages."}
          onClick={startCancel}
        >
          {withKey("Cancel", "cancelDoc")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={!saved} onClick={openHistory}>
          {withKey("History", "history")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={runClose}>
          {withKey("Show List", "open")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={runClose}>
          {withKey("Close", "close")}
        </button>
      </div>

      {ask?.kind === "cancel" ? (
        <ReasonDialog
          title={`Cancel ${draft.refno}`}
          message="Why is this receipt being cancelled?"
          placeholder="Type the reason"
          presets={CANCEL_REASONS}
          onCancel={() => setAsk(null)}
          onConfirm={(reason) => {
            setAsk(null);
            void api.cancel(reason);
          }}
        />
      ) : null}
      {ask?.kind === "writeOff" ? (
        <ReasonDialog
          title="Write off"
          message={ask.message}
          placeholder="Type the reason"
          onCancel={() => setAsk(null)}
          onConfirm={(reason) => {
            const key = ask.key;
            setAsk(null);
            void api.closeShortage(key, "WRITE_OFF", reason);
          }}
        />
      ) : null}
      {ask?.kind === "undo" ? (
        <ReasonDialog
          title="Undo the last close"
          message={ask.message}
          placeholder="Type the reason"
          onCancel={() => setAsk(null)}
          onConfirm={(reason) => {
            const close = ask.close;
            setAsk(null);
            void api.undoClose(close, reason);
          }}
        />
      ) : null}
      {ask?.kind === "cn" ? (
        <CnNoDialog
          message={ask.message}
          onCancel={() => setAsk(null)}
          onConfirm={(cnNo) => {
            const key = ask.key;
            setAsk(null);
            void api.closeShortage(key, "SUPPLIER_CN", cnNo);
          }}
        />
      ) : null}
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
      <TxnHistoryDialog target={historyTarget} docLabel={CONFIG.title} onClose={() => setHistoryTarget(null)} />
    </div>
  );
}
