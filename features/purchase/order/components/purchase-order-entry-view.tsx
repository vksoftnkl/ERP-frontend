"use client";

/**
 * Purchase Order (menu 23) — the entry screen, the Qt `PurchaseOrderEntry`
 * (NexERP fc46bde; plan-purchase-frontend F3).
 *
 * The header (supplier, PO date, expected date, deliver-to godown, contact,
 * remarks), the lines with the SERVER's figures painted back
 * (/purchase/orders/validate), and Save Draft / Confirm / Cancel / Short-close.
 * Confirm writes no stock and no books: it opens the PO for GRNs and bills. A
 * loaded PO shows what was received and what is still pending per line.
 *
 * Keys (the shared TxnKeys): Alt+N New, Ctrl+S Save Draft, Ctrl+Enter Confirm,
 * F2 Edit (a draft opened read-only), Alt+X Cancel PO, Ctrl+H History, Ctrl+O
 * Show List, Esc Close, F1 the sheet.
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
import { useBusinessContext } from "@/components/layout/business-context";
import { TxnHistoryDialog, type TxnHistoryTarget } from "@/components/txn/txn-history-dialog";
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { PURCHASE_DOC_TYPES } from "@/features/purchase/shared/purchase.doc-types";
import { money } from "@/features/purchase/shared/purchase.format";
import type { PurchaseEntryViewProps } from "@/features/purchase/shared/purchase.types";
import { DateField, DropdownCombo, ReadOnlyInput, TextField } from "@/features/sales/quotation/components/fields";
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
import { toast } from "@/lib/notify";
import { documentRights } from "@/lib/permissions/document-rights";
import { keySheetRows, withKey, type TxnKeyRow } from "@/lib/txn-keys";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { resolvePoColumns } from "../purchase-order.columns";
import {
  COL,
  GODOWN_DROPDOWN_KEY,
  PO_FALLBACK_TITLES,
  PO_LINE_GRID_NAME,
  PURCHASE_ORDER_LINES_UI_TABLE_KEY,
  SUPPLIER_DROPDOWN_KEY,
} from "../purchase-order.constants";
import {
  cancellable,
  isEditable,
  rowHasItem,
  shortClosable,
  statusLabel,
  titleLine,
} from "../purchase-order.state";
import { usePurchaseOrderDraft } from "../use-purchase-order-draft";
import { focusPoBlankLine, focusPoGrid, PoLineGrid } from "./po-line-grid";
import styles from "../page.module.scss";

const CONFIG = PURCHASE_DOC_TYPES.order;

const IDS = {
  supplier: "purchase-order-supplier",
  date: "purchase-order-date",
  expected: "purchase-order-expected",
  refno: "purchase-order-no",
  godown: "purchase-order-godown",
  contact: "purchase-order-contact",
  remarks: "purchase-order-remarks",
} as const;

const LINE_KEYS: readonly TxnKeyRow[] = [
  { label: "Item list (type a name in Barcode)", keyText: "↓" },
  { label: "Go to the blank line", keyText: "+" },
  { label: "Remove a line", keyText: "−" },
  { label: "Next cell", keyText: "Enter" },
  { label: "Leave the grid", keyText: "Tab" },
];

const KEY_SHEET = keySheetRows(
  [
    "new",
    "saveDraft",
    { action: "post", label: "Confirm" },
    "edit",
    { action: "cancelDoc", label: "Cancel PO" },
    "history",
    "open",
    "close",
  ],
  LINE_KEYS,
);

const GRID_NOTE =
  "Barcode: scan, or type a name and press ↓ for the item list · Enter walks Qty → Rate → Disc % · − removes a line · F1 lists the keys";

const STATUS_CLASS: Record<string, string> = {
  DRAFT: styles.statusDraft,
  CONFIRMED: styles.statusPosted,
  "SHORT-CLOSED": styles.statusClosed,
  CANCELLED: styles.statusCancelled,
};

type ItemPickerState = { key: string; query: string; origin: number };
type ReasonAsk = "cancel" | "shortClose" | null;

export function PurchaseOrderEntryView({ initialDocument, initialMode, onBackToList, memory }: PurchaseEntryViewProps) {
  const api = usePurchaseOrderDraft(memory);
  const { draft, draftRef } = api;
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);
  const { activeCompany, activeBranch } = useBusinessContext();

  const [itemPicker, setItemPicker] = useState<ItemPickerState | null>(null);
  const [reasonAsk, setReasonAsk] = useState<ReasonAsk>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  const activeKey = useRef<string | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);

  // ------------------------------------------------------------- layout
  const uiTableId = useUiTableId(PURCHASE_ORDER_LINES_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(() => resolvePoColumns(layout), [layout]);
  const settingsColumns = useMemo(() => settingsColumnsFromLayout(layout, PO_FALLBACK_TITLES), [layout]);
  const gridSettings = useGridSettings({
    label: "Purchase order lines",
    uiTableId,
    columns: settingsColumns,
    pendingWidthCount: 0,
    savingWidths: false,
    focusNote:
      "Where Enter stops is this screen's own rule: Barcode and Item on a blank line, then Qty, Rate and Disc % on a line.",
  });
  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const godownParams = useMemo(() => ({ ibranch_id: draft.branchId }), [draft.branchId]);

  // ------------------------------------------------------- what may be done
  const editable = isEditable(draft);
  const draftStatus = draft.status === "DRAFT";
  const saved = Boolean(draft.poId);
  const working = api.busy !== null;
  const canSaveDraft = draftStatus && editable && rights.maySaveDraft(saved);
  const canConfirm = draftStatus && editable && rights.mayPost;
  const canEdit = draftStatus && saved && draft.viewMode === "browse" && rights.mayEdit;
  const canCancel = cancellable(draft) && rights.mayCancelDocument(draft.status === "POSTED");
  // The server judges short-close on the menu's EDIT right.
  const canShortClose = shortClosable(draft) && permissions.canEdit;
  const shownStatus = statusLabel(draft);

  // ---------------------------------------------------------- open a doc
  const opened = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = initialDocument?.id ?? " new";
    if (opened.current === target) {
      return;
    }
    opened.current = target;
    if (memory?.resume && api.resumed) {
      api.finishResume();
      return;
    }
    if (initialDocument) {
      void api.load(initialDocument, initialMode === "entry").then((loaded) => {
        if (loaded) {
          api.focusEntryStart();
        }
      });
    } else {
      api.focusEntryStart();
    }
  }, [api, initialDocument, initialMode, memory?.resume]);

  // ------------------------------------------------------- focus requests
  useEffect(() => {
    const request = api.focusRequest;
    if (!request) {
      return;
    }
    const frame = window.requestAnimationFrame(() =>
      window.setTimeout(() => {
        const current = draftRef.current;
        switch (request.target) {
          case "cell":
            if (!focusCell(PO_LINE_GRID_NAME, request.key, String(request.column))) {
              focusPoBlankLine(request.key);
            }
            return;
          case "supplier":
            document.getElementById(IDS.supplier)?.focus();
            return;
          case "grid":
            focusPoGrid();
            return;
          default: {
            if (!isEditable(current)) {
              focusPoGrid();
              return;
            }
            if (!current.supplierId) {
              document.getElementById(IDS.supplier)?.focus();
              return;
            }
            const blank = current.lines.find((line) => !rowHasItem(line));
            if (blank) {
              focusPoBlankLine(blank.key);
            } else {
              focusPoGrid();
            }
          }
        }
      }, 0),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [draftRef, api.focusRequest]);

  // ---------------------------------------------------------------- guards
  const guardDirty = useCallback(
    async (title: string, message: string): Promise<boolean> => {
      if (!draftRef.current.dirty) {
        return true;
      }
      return confirm({ title, message, confirmLabel: "Discard" });
    },
    [draftRef],
  );

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
      window.requestAnimationFrame(() => window.setTimeout(() => focusPoBlankLine(target.key, target.origin), 0));
    }
  }, [itemPicker]);

  const onPickItem = useCallback(
    (picked: AdjustmentItemPick) => {
      const target = itemPicker;
      setItemPicker(null);
      if (target) {
        void api.pickItem(target.key, { itemId: picked.itemId, itemName: picked.itemName, uomId: picked.unitId });
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
      void confirm({ title: "Remove line", message: `Remove "${line.itemName}" from this order?`, confirmLabel: "Remove" }).then(
        (yes) => {
          if (yes) {
            api.removeLine(key);
            api.focusEntryStart();
          }
        },
      );
    },
    [api, draftRef],
  );

  const goToBlankLine = useCallback(() => {
    const current = draftRef.current;
    const blank = current.lines.find((line) => !rowHasItem(line));
    if (blank) {
      focusPoBlankLine(blank.key);
    }
  }, [draftRef]);

  // ------------------------------------------------------------ actions
  const runSave = useCallback(
    (post: boolean) => {
      if (api.busy) {
        return;
      }
      // A cell still being typed in commits on blur; read the draft after it lands.
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest(`[data-purchase-order-viewport]`)) {
        active.blur();
      }
      window.setTimeout(() => void api.save(post), 0);
    },
    [api],
  );

  const runCancel = useCallback(() => {
    const current = draftRef.current;
    if (!current.poId || current.status === "CANCELLED") {
      toast.warn("Open a saved purchase order first.", { title: "Nothing to cancel" });
      return;
    }
    if (!cancellable(current)) {
      toast.warn(`${current.refno} has goods received against it — short-close the rest instead.`, {
        title: "Cannot cancel",
      });
      return;
    }
    setReasonAsk("cancel");
  }, [draftRef]);

  const runShortClose = useCallback(() => {
    const current = draftRef.current;
    if (current.status !== "POSTED") {
      toast.warn("Only a confirmed order is short-closed.", { title: "Not confirmed" });
      return;
    }
    setReasonAsk("shortClose");
  }, [draftRef]);

  const onReason = useCallback(
    (reason: string) => {
      const kind = reasonAsk;
      setReasonAsk(null);
      if (kind === "cancel") {
        void api.cancelOrder(reason);
      } else if (kind === "shortClose") {
        void api.shortClose(reason);
      }
    },
    [api, reasonAsk],
  );

  const runNew = useCallback(() => {
    void guardDirty("Discard entry", "This order has unsaved changes. Start a new one anyway?").then((go) => {
      if (go) {
        api.newDocument();
      }
    });
  }, [api, guardDirty]);

  const runEdit = useCallback(() => {
    if (api.beginEdit()) {
      api.focusEntryStart();
    }
  }, [api]);

  const runList = useCallback(() => {
    void guardDirty("Open another", "This order has unsaved changes. Discard it and open the list?").then((go) => {
      if (go) {
        api.forgetRemembered();
        onBackToList();
      }
    });
  }, [api, guardDirty, onBackToList]);

  const runClose = useCallback(() => {
    void guardDirty("Discard entry", "This order has unsaved changes. Close it anyway?").then((go) => {
      if (go) {
        api.forgetRemembered();
        onBackToList();
      }
    });
  }, [api, guardDirty, onBackToList]);

  const openHistory = useCallback(() => {
    if (!draft.poId) {
      return;
    }
    setHistoryTarget({ docId: draft.poId, companyId: draft.companyId, accYear: draft.accYear, refNo: draft.refno });
  }, [draft.accYear, draft.companyId, draft.poId, draft.refno]);

  // ------------------------------------------------------------ shortcuts
  const overlayOpen = itemPicker !== null || reasonAsk !== null || keysOpen || historyTarget !== null || gridSettings.active;
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? runNew : null,
      saveDraft: !working && canSaveDraft ? () => runSave(false) : null,
      post: !working && canConfirm ? () => runSave(true) : null,
      edit: !working && canEdit ? runEdit : null,
      cancelDoc: !working && canCancel ? runCancel : null,
      history: saved ? openHistory : null,
      open: !working ? runList : null,
      close: !working ? runClose : null,
    },
    { onHelp: () => setKeysOpen(true), enabled: !overlayOpen },
  );

  // A habit F5 must not reload the page and take the unsaved order with it.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "F5" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  /** Enter and Tab walk the header in the Qt tab order; the last field hands over to the grid. */
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
      const blank = draft.lines.find((line) => !rowHasItem(line)) ?? draft.lines[draft.lines.length - 1];
      if (blank) {
        event.preventDefault();
        focusPoBlankLine(blank.key);
      }
    }
  };

  // ------------------------------------------------------------- render
  const at = (row: number, column: number, span = 1) => ({
    gridRow: row,
    gridColumn: span > 1 ? `${column} / span ${span}` : String(column),
  });
  const totals = draft.totals;

  return (
    <div className={quotationStyles.page}>
      <div className={styles.topBand}>
        {/* ── the title block ─────────────────────────────────────────── */}
        <div className={styles.titleBlock}>
          <div className={styles.titleLine}>
            <button type="button" className={quotationStyles.button} onClick={runList}>
              ‹ {CONFIG.listTitle}
            </button>
            <h1 className={quotationStyles.title}>{CONFIG.title}</h1>
          </div>
          <span className={styles.docTitle}>{titleLine(draft)}</span>
          <span className={styles.scope} title="The company and branch this document belongs to.">
            {[activeCompany?.name, activeBranch?.name, draft.accYear].filter(Boolean).join(" · ")}
          </span>
          <div className={styles.statusLine}>
            <span
              className={cx(styles.statusPill, STATUS_CLASS[shownStatus] ?? styles.statusDraft)}
              title="DRAFT, CONFIRMED (posted), SHORT-CLOSED or CANCELLED."
            >
              {shownStatus}
            </span>
            {draft.viewMode === "browse" ? <span className={quotationStyles.readOnlyBadge}>Read only</span> : null}
            {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
            {draft.approvalStatus === "AWAITING" ? (
              <span className={styles.approval} title="purchase.po_approval_above — the PO value is above the limit.">
                Waiting for approval
              </span>
            ) : null}
            {api.busy ? <span className={styles.scope}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
          </div>
        </div>

        {/* ── the header: Qt's grid, in tab order ─────────────────────── */}
        <div className={styles.headerCard} ref={headerRef} onKeyDown={onHeaderKeyDown}>
          <div className={styles.pair} style={at(1, 1)} data-tone={editable ? (draft.supplierId ? "set" : "missing") : undefined}>
            <DropdownCombo
              id={IDS.supplier}
              label="Supplier"
              dropdownId={supplierDropdownId}
              valueKey="sup_id"
              labelKey="sup_name"
              metaKey="sup_region_name"
              value={draft.supplierId}
              selectedLabel={draft.supplierName}
              disabled={!editable}
              required
              placeholder="Who the order goes to"
              onSelect={api.setSupplier}
            />
          </div>
          <div className={styles.pair} style={at(1, 2)}>
            <DateField
              id={IDS.date}
              label="PO Date"
              value={draft.docDate}
              disabled={!editable}
              onChange={(value) => api.setHeader({ docDate: value })}
            />
          </div>
          <div className={styles.pair} style={at(1, 3)}>
            <DateField
              id={IDS.expected}
              label="Expected"
              value={draft.expectedDate}
              disabled={!editable}
              onChange={(value) => api.setHeader({ expectedDate: value })}
            />
          </div>
          <div className={styles.pair} style={at(1, 4)}>
            <ReadOnlyInput id={IDS.refno} label="PO No" value={draft.refno} placeholder="given on save" />
          </div>
          <div className={styles.pair} style={at(2, 1)}>
            <DropdownCombo
              id={IDS.godown}
              label="Deliver to"
              dropdownId={godownDropdownId}
              valueKey="gdl_id"
              labelKey="gdl_name"
              value={draft.godownId}
              selectedLabel={draft.godownName}
              disabled={!editable}
              params={godownParams}
              placeholder="The godown it comes to"
              onSelect={api.setGodown}
            />
          </div>
          <div className={styles.pair} style={at(2, 2)}>
            <TextField
              id={IDS.contact}
              label="Contact"
              value={draft.contact}
              disabled={!editable}
              maxLength={150}
              placeholder="who placed / confirmed it"
              onChange={(value) => api.setHeader({ contact: value })}
            />
          </div>
          <div className={styles.pair} style={at(2, 3, 2)}>
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
          <span className={quotationStyles.modalNote}>{GRID_NOTE}</span>
        </div>
        {gridSettings.overlays}
        <PoLineGrid
          draft={draft}
          columns={columns}
          editable={editable}
          onContextMenu={gridSettings.onContextMenu}
          onActiveRow={(key) => {
            activeKey.current = key;
          }}
          onEdit={api.editLine}
          onOpenItemPicker={openItemPicker}
          onScanBarcode={onScanBarcode}
          onSearchItems={searchItemsFromBarcode}
          onRefused={api.setHint}
          onGoToBlankLine={goToBlankLine}
          onRemoveLine={onRemoveLine}
        />
      </section>

      <p className={styles.hintLine} role="status">
        {draft.hint}
      </p>

      <p className={styles.totals} aria-label="Totals">
        <span>
          Taxable<strong>{money(totals?.taxable ?? 0)}</strong>
        </span>
        <span>
          GST<strong>{money(totals?.tax ?? 0)}</strong>
        </span>
        <span className={styles.totalNet}>
          PO value<strong>{money(totals?.net ?? 0)}</strong>
        </span>
        {draft.shortClosed ? (
          <span className={styles.closedNote}>
            Short-closed{draft.shortCloseReason ? `: ${draft.shortCloseReason}` : ""}
          </span>
        ) : null}
      </p>

      <div className={styles.buttonBar}>
        <span className={styles.footerHint}>F1 · keys on this screen</span>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !rights.mayStartNew}
          title="Start a new purchase order."
          onClick={runNew}
        >
          {withKey("New", "new")}
        </button>
        {draftStatus && saved && draft.viewMode === "browse" ? (
          <button
            type="button"
            className={quotationStyles.button}
            title="Edit this DRAFT."
            disabled={!canEdit || working}
            onClick={runEdit}
          >
            {withKey("Edit", "edit")}
          </button>
        ) : null}
        <button
          type="button"
          className={quotationStyles.button}
          title="Save without confirming — the supplier is not committed to yet."
          disabled={!canSaveDraft || working}
          onClick={() => runSave(false)}
        >
          {api.busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          title="Confirm: the order is open for GRNs and bills. No stock and no books are written."
          disabled={!canConfirm || working}
          onClick={() => runSave(true)}
        >
          {api.busy === "posting" ? "Confirming…" : withKey("Confirm", "post")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Stop waiting for the rest — what is pending is closed, what came stays."
          disabled={!canShortClose || working}
          onClick={runShortClose}
        >
          {api.busy === "closing" ? "Closing…" : "Short-close"}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Cancel an order nothing has been received against."
          disabled={!canCancel || working}
          onClick={runCancel}
        >
          {api.busy === "cancelling" ? "Cancelling…" : withKey("Cancel PO", "cancelDoc")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Every step of this order — who saved, confirmed, closed or cancelled it, when, and why."
          disabled={!saved}
          onClick={openHistory}
        >
          {withKey("History", "history")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={runList}>
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
      {reasonAsk ? (
        <ReasonDialog
          title={reasonAsk === "cancel" ? `Cancel ${draft.refno}` : `Short-close ${draft.refno}`}
          message={reasonAsk === "cancel" ? "Why is this order being cancelled?" : "Why stop waiting for the rest?"}
          placeholder="Type the reason"
          onCancel={() => setReasonAsk(null)}
          onConfirm={onReason}
        />
      ) : null}
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
      <TxnHistoryDialog target={historyTarget} docLabel="Purchase order" onClose={() => setHistoryTarget(null)} />
    </div>
  );
}
