"use client";

/**
 * GRN — Goods Received Note (menu 196; the Qt `GrnEntry`, NexERP fc46bde): goods
 * in before the supplier's bill. Layout and wiring only — every rule is in
 * `grn.state.ts`, the network in `use-grn-draft.ts`.
 *
 * Pick the supplier; "Against PO" offers its confirmed POs with qty pending,
 * and choosing one fills the lines at the PO's net rate. Key what came
 * (challan / received / damaged / free) and the loadmen who unloaded. Save Draft
 * moves nothing; Post (Ctrl+Enter) brings the stock in at the provisional rate
 * (Dr Stock / Cr GRNI), owes the coolie to each loadman and parks a challan
 * short. A posted GRN that is not billed yet is cancelled (Alt+X), with a reason.
 *
 * Keys: the shared transaction set (`lib/txn-keys`) — Alt+N New, Ctrl+S Save
 * Draft, Ctrl+Enter Post, Alt+X Cancel, F2 Edit, Ctrl+H History, Ctrl+O Show
 * List, Esc Close; F1 is the sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { NexDropdownMulti } from "@/components/design-system/dropdown";
import { TxnHistoryDialog, type TxnHistoryTarget } from "@/components/txn/txn-history-dialog";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { DateField, DropdownCombo, ReadOnlyInput, SelectField, TextField } from "@/features/sales/quotation/components/fields";
import { settingsColumnsFromLayout, useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { focusCell } from "@/features/sales/quotation/components/grid-focus";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import {
  AdjustmentItemPicker,
  type AdjustmentItemPick,
} from "@/features/stocks/stock-adjustment/components/adjustment-item-picker";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { documentRights } from "@/lib/permissions/document-rights";
import { withKey } from "@/lib/txn-keys";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { PURCHASE_DOC_TYPES } from "../../shared/purchase.doc-types";
import { purchaseStatusText } from "../../shared/purchase.format";
import type { PurchaseEntryViewProps } from "../../shared/purchase.types";
import { resolveGrnColumns } from "../grn.columns";
import {
  CANCEL_REASONS,
  COL,
  CREW_DROPDOWN_KEY,
  CREW_EMPTY_PARAMS,
  DISCARD_MESSAGE,
  FALLBACK_COLUMN_TITLES,
  GODOWN_DROPDOWN_KEY,
  GRID_NOTE,
  GRN_GRID_NAME,
  GRN_LINES_UI_TABLE_KEY,
  LOADMAN_ROLE,
  SUPPLIER_DROPDOWN_KEY,
} from "../grn.constants";
import { KEY_SHEET } from "../grn.keys";
import {
  computeTotals,
  expiryIso,
  isDraftStatus,
  isEditable,
  poOptions,
  rowHasItem,
  titleLine,
  totalsParts,
} from "../grn.state";
import { useGrnDraft } from "../use-grn-draft";
import { focusGrnLine, GrnLineGrid } from "./grn-line-grid";
import styles from "../page.module.scss";

const CONFIG = PURCHASE_DOC_TYPES.grn;

const IDS = {
  supplier: "grn-supplier",
  po: "grn-against-po",
  date: "grn-date",
  docNo: "grn-docno",
  godown: "grn-godown",
  challanNo: "grn-challan-no",
  challanDate: "grn-challan-date",
  vehicle: "grn-vehicle",
  loadmen: "grn-loadmen",
  remarks: "grn-remarks",
} as const;

const STATUS_CLASS: Record<string, string> = {
  DRAFT: styles.statusDraft,
  POSTED: styles.statusPosted,
  CANCELLED: styles.statusCancelled,
};

type ItemPickerState = { key: string; query: string; origin: number };

const EMPTY_KEYS: ReadonlySet<string> = new Set();

export function GrnEntryView({ initialDocument, initialMode, onBackToList, memory }: PurchaseEntryViewProps) {
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);
  const crewDropdownId = useDropdownId(CREW_DROPDOWN_KEY);
  const api = useGrnDraft({ memory, godownDropdownId });
  const { draft, draftRef } = api;
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);

  const [itemPicker, setItemPicker] = useState<ItemPickerState | null>(null);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  /** Held, not derived: the trail dialog refetches whenever its target object changes. */
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  const activeKey = useRef<string | null>(null);

  // ------------------------------------------------------------- layout
  const uiTableId = useUiTableId(GRN_LINES_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(() => resolveGrnColumns(layout), [layout]);
  const settingsColumns = useMemo(() => settingsColumnsFromLayout(layout, FALLBACK_COLUMN_TITLES), [layout]);
  const gridSettings = useGridSettings({
    label: "GRN lines",
    uiTableId,
    columns: settingsColumns,
    pendingWidthCount: 0,
    savingWidths: false,
    focusNote:
      "Where Enter stops is this screen's own rule (the Qt screen's): Barcode and Item on a blank line, then Challan, Recd, Dmg and Rate. Tab reaches every open cell.",
  });

  // --------------------------------------------------------------- derived
  const editable = isEditable(draft);
  const draftStatus = isDraftStatus(draft);
  const saved = draft.grnId !== "";
  const working = api.busy !== null;
  const totals = useMemo(() => computeTotals(draft), [draft]);
  const parts = totalsParts(draft, totals);
  const options = useMemo(() => poOptions(draft, api.pendingLoading), [api.pendingLoading, draft]);
  const problemKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const line of draft.lines) {
      if (rowHasItem(line) && line.expiry.trim() !== "" && !expiryIso(line.expiry)) {
        keys.add(line.key);
      }
    }
    return keys.size > 0 ? keys : EMPTY_KEYS;
  }, [draft.lines]);

  const canSaveDraft = editable && rights.maySaveDraft(saved);
  const canPost = draftStatus && rights.mayPost && (editable || saved);
  const canEdit = draftStatus && saved && draft.viewMode === "browse" && rights.mayEdit;
  const canCancel = saved && draft.status === "POSTED" && !draft.billed && rights.mayCancelDocument(true);

  const godownParams = useMemo(() => ({ ibranch_id: draft.branchId }), [draft.branchId]);
  const crewParams = useMemo(() => ({ iemp_branch_id: draft.branchId, iemp_role: LOADMAN_ROLE }), [draft.branchId]);

  // ------------------------------------------------------------- opening
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) {
      return;
    }
    opened.current = true;
    if (initialDocument && !api.resumed) {
      void api.load(initialDocument, initialMode === "entry");
    } else if (!api.resumed) {
      api.requestFocus({ target: "supplier" });
    }
    // Once, on mount: the page remounts this view for every Open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Where the cursor goes next — the hook asks, the DOM answers after the render.
  const focusRequest = api.focusRequest;
  useEffect(() => {
    if (!focusRequest) {
      return;
    }
    const handle = window.requestAnimationFrame(() => {
      if (focusRequest.target === "cell") {
        if (!focusCell(GRN_GRID_NAME, focusRequest.key, String(focusRequest.column))) {
          const line = draftRef.current.lines.find((candidate) => candidate.key === focusRequest.key);
          if (line) {
            focusGrnLine(line);
          }
        }
        return;
      }
      if (focusRequest.target === "lines") {
        const lines = draftRef.current.lines;
        const target = lines.find((line) => !rowHasItem(line)) ?? lines[0];
        if (target) {
          focusGrnLine(target);
        }
        return;
      }
      document.getElementById(focusRequest.target === "supplier" ? IDS.supplier : IDS.godown)?.focus();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [draftRef, focusRequest]);

  // ------------------------------------------------------------- actions
  /** Ask before throwing away unsaved work; true = go ahead. */
  const discardOk = useCallback(async (): Promise<boolean> => {
    if (!draftRef.current.dirty || !isEditable(draftRef.current)) {
      return true;
    }
    return confirm({ title: "Discard entry", message: DISCARD_MESSAGE, confirmLabel: "Discard" });
  }, [draftRef]);

  const runClose = useCallback(() => {
    void (async () => {
      if (await discardOk()) {
        api.discard();
        onBackToList();
      }
    })();
  }, [api, discardOk, onBackToList]);

  const runNew = useCallback(() => {
    void (async () => {
      if (await discardOk()) {
        api.discard();
        api.reset();
      }
    })();
  }, [api, discardOk]);

  const runSave = useCallback((post: boolean) => void api.save(post), [api]);

  const openHistory = useCallback(() => {
    const current = draftRef.current;
    if (!current.grnId) {
      return;
    }
    setHistoryTarget({ docId: current.grnId, companyId: current.companyId, accYear: current.accYear, refNo: current.refno });
  }, [draftRef]);

  // ------------------------------------------------------------ the lines
  const openItemPicker = useCallback(
    (key: string, query: string) => {
      if (!isEditable(draftRef.current)) {
        return;
      }
      activeKey.current = key;
      setItemPicker({ key, query, origin: COL.Item });
    },
    [draftRef],
  );

  /** ↓ in a blank line's Barcode: the item list, searched for what was typed. */
  const searchItemsFromBarcode = useCallback(
    (key: string, typed: string) => {
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === key);
      if (!isEditable(current) || !line || rowHasItem(line)) {
        return;
      }
      activeKey.current = key;
      setItemPicker({ key, query: typed.replace(/\s+/g, " ").trim(), origin: COL.Barcode });
    },
    [draftRef],
  );

  const closeItemPicker = useCallback(() => {
    const target = itemPicker;
    setItemPicker(null);
    if (target) {
      window.requestAnimationFrame(() =>
        window.setTimeout(() => {
          if (!focusCell(GRN_GRID_NAME, target.key, String(target.origin))) {
            focusCell(GRN_GRID_NAME, target.key, String(COL.Item));
          }
        }, 0),
      );
    }
  }, [itemPicker]);

  const onPickItem = useCallback(
    (picked: AdjustmentItemPick) => {
      const target = itemPicker;
      setItemPicker(null);
      if (target) {
        void api.pickItem(target.key, { itemId: picked.itemId, itemName: picked.itemName, unitId: picked.unitId });
      }
    },
    [api, itemPicker],
  );

  const onPickerBarcode = useCallback(
    async (code: string) => {
      const target = itemPicker;
      if (!target) {
        return false;
      }
      const resolved = await api.resolveBarcode(target.key, code);
      if (resolved) {
        setItemPicker(null);
      }
      return resolved;
    },
    [api, itemPicker],
  );

  /** Queued, never run inside the cell's own commit: the resolve rewrites the very line being committed. */
  const onScanBarcode = useCallback(
    (key: string, code: string) => {
      window.setTimeout(() => void api.resolveBarcode(key, code), 0);
    },
    [api],
  );

  const onRemoveLine = useCallback(
    (key: string) => {
      const line = draftRef.current.lines.find((candidate) => candidate.key === key);
      if (!line || !rowHasItem(line) || !isEditable(draftRef.current)) {
        return;
      }
      void (async () => {
        const ok = await confirm({
          title: "Remove line",
          message: `Remove "${line.itemName}" from this GRN?`,
          confirmLabel: "Remove",
          iconVariant: "delete",
        });
        if (ok) {
          api.dropLine(key);
          api.requestFocus({ target: "lines" });
        }
      })();
    },
    [api, draftRef],
  );

  const onGoToBlank = useCallback(() => api.requestFocus({ target: "lines" }), [api]);

  // ------------------------------------------------------------ shortcuts
  // A handler left null is not intercepted at all: its button is off. A dialog
  // is `aria-modal`, so the hook stands down under one.
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? runNew : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: !working && canPost ? () => runSave(true) : null,
      edit: !working && canEdit ? api.beginEdit : null,
      cancelDoc: !working && canCancel ? () => setCancelAsk(true) : null,
      history: saved ? openHistory : null,
      open: !working ? runClose : null,
      close: !working ? runClose : null,
    },
    { onHelp: () => setKeysOpen(true), enabled: !gridSettings.active && itemPicker === null },
  );

  useEffect(() => {
    if (!draft.dirty || !editable) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draft.dirty, editable]);

  /** Enter walks the header; the last field hands over to the grid. */
  const onHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (moveHeaderFocus(event.currentTarget, event.target, event.shiftKey ? -1 : 1)) {
      event.preventDefault();
      return;
    }
    if (!event.shiftKey && editable) {
      event.preventDefault();
      api.requestFocus({ target: "lines" });
    }
  };

  const supplierSet = Boolean(draft.supplierId);
  const godownSet = Boolean(draft.godownId);

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
          <div className={styles.statusLine}>
            <span
              className={cx(styles.statusPill, STATUS_CLASS[draft.status] ?? styles.statusDraft)}
              title="DRAFT moved nothing; POSTED has the stock in; CANCELLED took it out again."
            >
              {purchaseStatusText(draft.status)}
            </span>
            {draft.billed ? (
              <span className={styles.billedPill} title="A purchase bill has taken this GRN's lines.">
                BILLED
              </span>
            ) : null}
            {draftStatus && draft.viewMode === "browse" ? (
              <span className={quotationStyles.readOnlyBadge}>Read only</span>
            ) : null}
            {draft.dirty && editable ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
            {api.busy ? <span className={styles.busy}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
          </div>
        </div>

        {/* ── the header: Qt GrnEntry's grid, in tab order ───────────────── */}
        <div className={styles.headerCard} onKeyDown={onHeaderKeyDown}>
          <div className={styles.pair} data-tone={editable ? (supplierSet ? "set" : "missing") : undefined}>
            <DropdownCombo
              id={IDS.supplier}
              label="Supplier"
              dropdownId={supplierDropdownId}
              valueKey="sup_id"
              labelKey="sup_name"
              value={draft.supplierId}
              selectedLabel={draft.supplierName}
              disabled={!editable}
              required
              placeholder="Who sent the goods"
              onSelect={api.setSupplier}
            />
          </div>
          <div className={styles.pair}>
            <SelectField
              id={IDS.po}
              label="Against PO"
              value={draft.poChoice}
              options={options}
              disabled={!editable || options.length <= 1}
              title="The supplier's confirmed POs with qty still to come — choosing one fills its pending lines at the PO's net rate."
              onChange={api.pickPo}
            />
          </div>
          <div className={styles.pair}>
            <DateField
              id={IDS.date}
              label="GRN Date"
              value={draft.docDate}
              disabled={!editable}
              onChange={(value) => api.setHeader({ docDate: value })}
            />
          </div>
          <div className={styles.pair}>
            <ReadOnlyInput id={IDS.docNo} label="GRN No" value={draft.refno} placeholder="given on save" />
          </div>

          <div className={styles.pair} data-tone={editable ? (godownSet ? "set" : "missing") : undefined}>
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
              placeholder="Where the goods are kept"
              onSelect={api.setGodown}
            />
          </div>
          <div className={styles.pair}>
            <TextField
              id={IDS.challanNo}
              label="Challan No"
              value={draft.challanNo}
              disabled={!editable}
              maxLength={60}
              placeholder="DC / bill no on the papers"
              onChange={(value) => api.setHeader({ challanNo: value })}
            />
          </div>
          <div className={styles.pair}>
            <DateField
              id={IDS.challanDate}
              label="Challan Date"
              value={draft.challanDate}
              disabled={!editable}
              onChange={(value) => api.setHeader({ challanDate: value })}
            />
          </div>
          <div className={styles.pair}>
            <TextField
              id={IDS.vehicle}
              label="Vehicle"
              value={draft.vehicleNo}
              disabled={!editable}
              maxLength={20}
              onChange={(value) => api.setHeader({ vehicleNo: value.toUpperCase() })}
            />
          </div>

          <div className={cx(styles.pair, styles.pairWide)}>
            <label className={quotationStyles.label} htmlFor={IDS.loadmen}>
              Unloaded by
            </label>
            <NexDropdownMulti
              id={IDS.loadmen}
              dropdownId={crewDropdownId}
              params={crewParams}
              keepEmptyParams={CREW_EMPTY_PARAMS}
              value={draft.loadmen}
              disabled={!editable}
              placeholder="Who unloaded — the coolie is owed to each of them"
              aria-label="Unloaded by"
              onChange={(loadmen) => api.setHeader({ loadmen })}
            />
          </div>
          <div className={cx(styles.pair, styles.pairWide)}>
            <TextField
              id={IDS.remarks}
              label="Remarks"
              value={draft.remarks}
              disabled={!editable}
              maxLength={500}
              onChange={(value) => api.setHeader({ remarks: value })}
            />
          </div>
        </div>
      </div>

      <section className={cx(quotationStyles.gridShell, styles.gridShell)}>
        <div className={quotationStyles.gridHead}>
          <span className={quotationStyles.gridHeadTitle}>Lines</span>
          <span className={quotationStyles.modalNote}>{editable ? GRID_NOTE : ""}</span>
        </div>
        {gridSettings.overlays}
        <GrnLineGrid
          draft={draft}
          columns={columns}
          problemKeys={problemKeys}
          onContextMenu={gridSettings.onContextMenu}
          onActiveRow={(key) => {
            activeKey.current = key;
          }}
          onEdit={api.editLine}
          onOpenItemPicker={openItemPicker}
          onScanBarcode={onScanBarcode}
          onSearchItems={searchItemsFromBarcode}
          onRefused={api.setHint}
          onGoToBlank={onGoToBlank}
          onRemoveLine={onRemoveLine}
        />
      </section>

      <p className={styles.totals} aria-label="Totals">
        {parts.lead} · <strong>Value {parts.value}</strong> (provisional — the bill decides)
        {parts.short ? <span className={styles.shortTotal}> · Short on challan {parts.short}</span> : null}
        {parts.coolie ? <> · Coolie {parts.coolie}</> : null}
        {parts.billed ? (
          <>
            {" "}
            · <strong>Billed</strong>
          </>
        ) : null}
      </p>
      <p className={styles.hintLine} role="status">
        {draft.hint}
      </p>

      <div className={styles.buttonBar}>
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
          title="Save without moving stock."
          onClick={() => runSave(false)}
        >
          {api.busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          disabled={working || !canPost}
          title="Saves, then brings the stock in at the provisional rate — coolie owed to each loadman, a challan short parked."
          onClick={() => runSave(true)}
        >
          {api.busy === "posting" ? "Posting…" : withKey("Post", "post")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !canCancel}
          title={draft.billed ? "Billed — cancel the bill first." : "Undo a posted GRN that is not billed yet."}
          onClick={() => setCancelAsk(true)}
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

      <AdjustmentItemPicker
        isOpen={itemPicker !== null}
        initialQuery={itemPicker?.query ?? ""}
        companyId={draft.companyId}
        branchId={draft.branchId}
        onClose={closeItemPicker}
        onPick={onPickItem}
        onBarcode={onPickerBarcode}
      />
      {cancelAsk ? (
        <ReasonDialog
          title={`Cancel ${draft.refno}`}
          message="Why is this GRN being cancelled? The stock goes out again, the coolie rows are withdrawn and a parked short is dropped."
          placeholder="Type the reason"
          presets={CANCEL_REASONS}
          onCancel={() => setCancelAsk(false)}
          onConfirm={(reason) => {
            setCancelAsk(false);
            void api.cancel(reason);
          }}
        />
      ) : null}
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
      <TxnHistoryDialog target={historyTarget} docLabel="GRN" onClose={() => setHistoryTarget(null)} />
    </div>
  );
}
