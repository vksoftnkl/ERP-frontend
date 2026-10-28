"use client";

/**
 * Purchase Entry (menu 24) — the supplier's bill keyed as printed, direct mode
 * (Qt `PurchaseInvoiceEntry`, NexERP 3ce8487; plan-purchase-frontend F5, first
 * slice): the header, lines with batch / expiry on the row, the server's
 * calculation painted back, Save Draft / Post / Cancel / reopen.
 *
 * Every money figure on screen comes from `POST /purchase/invoices/validate`
 * (or, on a stored bill, from what the server stored). The list lives on the
 * same route (features/purchase/shared); Show List / Close go back to it.
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
import { TxnKeysSheet } from "@/components/txn/txn-keys-sheet";
import { useTxnKeys } from "@/components/txn/use-txn-keys";
import { ReasonDialog } from "@/features/accounts/vouchers/components/reason-dialog";
import { DateField, DropdownCombo, Field, ReadOnlyInput, TextField } from "@/features/sales/quotation/components/fields";
import { settingsColumnsFromLayout, useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { AdjustmentItemPicker, type AdjustmentItemPick } from "@/features/stocks/stock-adjustment/components/adjustment-item-picker";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { documentRights } from "@/lib/permissions/document-rights";
import { withKey } from "@/lib/txn-keys";
import { useUiTableId } from "@/lib/ui-tables";
import { toast } from "@/lib/notify";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { PURCHASE_DOC_TYPES } from "../../shared/purchase.doc-types";
import { money } from "../../shared/purchase.format";
import type { PurchaseEntryViewProps } from "../../shared/purchase.types";
import { resolveLineColumns } from "../invoice.columns";
import {
  FALLBACK_COLUMN_TITLES,
  GODOWN_DROPDOWN_KEY,
  KEY_SHEET,
  LINE_GRID_NAME,
  LINE_GRID_UI_TABLE_KEY,
  STATUS,
  SUPPLIER_DROPDOWN_KEY,
} from "../invoice.constants";
import { isEditable, rowHasItem } from "../invoice.state";
import { usePurchaseInvoiceDraft } from "../use-purchase-invoice-draft";
import { focusBlankLineEntry, focusLineCell, focusLineGrid, InvoiceLineGrid } from "./invoice-line-grid";
import styles from "../page.module.scss";

const IDS = {
  supplier: "purchase-invoice-supplier",
  invNo: "purchase-invoice-inv-no",
  invDate: "purchase-invoice-inv-date",
  ourNo: "purchase-invoice-our-no",
  docDate: "purchase-invoice-doc-date",
  godown: "purchase-invoice-godown",
  amount: "purchase-invoice-amount",
  remarks: "purchase-invoice-remarks",
} as const;

const STATUS_CLASS: Record<string, string> = {
  DRAFT: styles.statusDraft,
  POSTED: styles.statusPosted,
  CANCELLED: styles.statusCancelled,
};

const GRID_NOTE = "Barcode: scan, or type a name and press ↓ for the item list · + / − add or remove a line · F1 lists the keys";

const AMOUNT_PATTERN = /^[\d,]*(\.\d{0,2})?$/;

/** Commit the cell being typed in before anything reads the lines. */
function commitOpenEditor() {
  const active = document.activeElement as HTMLElement | null;
  if (active && active.closest(`[data-quotation-grid="${LINE_GRID_NAME}"]`)) {
    active.blur();
  }
}

type ItemPickerState = { key: string; query: string };

export function PurchaseInvoiceEntryView({ initialDocument, initialMode, onBackToList, memory }: PurchaseEntryViewProps) {
  const config = PURCHASE_DOC_TYPES.invoice;
  const api = usePurchaseInvoiceDraft(memory);
  const { draft, draftRef } = api;
  const { permissions } = usePagePermissions();
  const rights = useMemo(() => documentRights(permissions), [permissions]);

  const [itemPicker, setItemPicker] = useState<ItemPickerState | null>(null);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const activeKey = useRef<string | null>(null);

  // ------------------------------------------------------------- layout
  const uiTableId = useUiTableId(LINE_GRID_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const columns = useMemo(() => resolveLineColumns(layout), [layout]);
  const settingsColumns = useMemo(() => settingsColumnsFromLayout(layout, FALLBACK_COLUMN_TITLES), [layout]);
  const gridSettings = useGridSettings({
    label: "Purchase invoice lines",
    uiTableId,
    columns: settingsColumns,
    pendingWidthCount: 0,
    savingWidths: false,
    focusNote:
      "Where Enter stops is this screen's own rule: Barcode and Item on a blank line, then Billed, Rate and Disc %. Columns after Check are not shown on this screen yet.",
  });
  const supplierDropdownId = useDropdownId(SUPPLIER_DROPDOWN_KEY);
  const godownDropdownId = useDropdownId(GODOWN_DROPDOWN_KEY);
  const godownParams = useMemo(() => ({ ibranch_id: draft.branchId }), [draft.branchId]);

  // -------------------------------------------------------------- state
  const editable = isEditable(draft);
  const isDraft = draft.status === STATUS.draft;
  const saved = Boolean(draft.piId);
  const working = api.busy !== null;
  const canSaveDraft = isDraft && rights.maySaveDraft(saved);
  const canPost = isDraft && rights.mayPost;
  const canCancel = draft.status === STATUS.posted && saved && rights.mayCancelDocument(true);
  const canEdit = isDraft && saved && draft.viewMode === "browse" && rights.mayEdit;

  // ---------------------------------------------------------- open a doc
  const { load, finishResume, requestFocus, resumed } = api;
  const opened = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = initialDocument?.id ?? " new";
    if (opened.current === target) {
      return;
    }
    opened.current = target;
    if (memory?.resume && resumed) {
      void finishResume();
      return;
    }
    if (initialDocument) {
      void load(initialDocument, initialMode === "entry").then((loaded) => {
        if (loaded) {
          requestFocus({ target: "entryStart" });
        }
      });
    } else {
      requestFocus({ target: "entryStart" });
    }
  }, [finishResume, initialDocument, initialMode, load, memory?.resume, requestFocus, resumed]);

  // ------------------------------------------------------- focus requests
  useEffect(() => {
    const request = api.focusRequest;
    if (!request) {
      return;
    }
    const frame = window.requestAnimationFrame(() =>
      window.setTimeout(() => {
        if (request.target === "cell") {
          focusLineCell(request.key, request.column);
          return;
        }
        const current = draftRef.current;
        if (request.target === "supplier" || (isEditable(current) && !current.supplierId)) {
          document.getElementById(IDS.supplier)?.focus();
          return;
        }
        if (isEditable(current)) {
          const line = current.lines.find((candidate) => !rowHasItem(candidate));
          if (line && focusBlankLineEntry(line.key)) {
            return;
          }
        }
        focusLineGrid();
      }, 0),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [draftRef, api.focusRequest]);

  // ---------------------------------------------------------------- guards
  const guardDirty = useCallback(
    (title: string, message: string, then: () => void) => {
      if (!draftRef.current.dirty) {
        then();
        return;
      }
      void confirm({ title, message, confirmLabel: "Discard" }).then((yes) => {
        if (yes) {
          then();
        }
      });
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
      setItemPicker({ key, query: query.replace(/\s+/g, " ").trim() });
    },
    [draftRef],
  );

  const closeItemPicker = useCallback(() => {
    const target = itemPicker;
    setItemPicker(null);
    if (target) {
      window.requestAnimationFrame(() => window.setTimeout(() => focusBlankLineEntry(target.key), 0));
    }
  }, [itemPicker]);

  const onPickItem = useCallback(
    (picked: AdjustmentItemPick) => {
      const target = itemPicker;
      setItemPicker(null);
      if (target) {
        void api.pickItem(target.key, picked.itemId, picked.itemName, picked.unitId || undefined);
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
      void confirm({ title: "Remove line", message: `Remove "${line.itemName || "this item"}" from the bill?`, confirmLabel: "Remove" }).then(
        (yes) => {
          if (yes) {
            api.removeLine(key);
          }
        },
      );
    },
    [api, draftRef],
  );

  const onAddLine = useCallback(() => {
    api.addLine();
    window.requestAnimationFrame(() =>
      window.setTimeout(() => {
        const current = draftRef.current;
        const blank = current.lines.find((candidate) => !rowHasItem(candidate));
        if (blank) {
          focusBlankLineEntry(blank.key);
        }
      }, 0),
    );
  }, [api, draftRef]);

  // ------------------------------------------------------------ actions
  const runSave = useCallback(
    (post: boolean) => {
      if (api.busy) {
        return;
      }
      commitOpenEditor();
      // The commit above lands synchronously in the draft ref; read it next tick.
      window.setTimeout(() => {
        if (!post) {
          void api.save(false);
          return;
        }
        const current = draftRef.current;
        const net = current.totals ? ` at the net payable ${money(current.totals.netPayable)}` : "";
        void confirm({
          title: `Post ${current.refno || "this bill"}?`,
          message: `The stock comes into ${current.godownName || "the godown"} and ${current.supplierName || "the supplier"} is credited${net}.`,
          note: "A posted bill is not edited — it is cancelled (with a reason) while nothing has paid it.",
          confirmLabel: "Post",
        }).then((yes) => {
          if (yes) {
            void api.save(true);
          }
        });
      }, 0);
    },
    [api, draftRef],
  );

  const runCancel = useCallback(() => {
    const current = draftRef.current;
    if (current.status !== STATUS.posted) {
      toast.warn("Only a posted bill can be cancelled.", { title: "Not posted" });
      return;
    }
    setCancelAsk(true);
  }, [draftRef]);

  const runNew = useCallback(() => {
    guardDirty("Discard entry", "This bill has unsaved changes. Start a new one anyway?", () => api.newDocument());
  }, [api, guardDirty]);

  const runEdit = useCallback(() => {
    if (api.beginEdit()) {
      api.requestFocus({ target: "entryStart" });
    }
  }, [api]);

  const leave = useCallback(
    (title: string) => {
      guardDirty(title, "This bill has unsaved changes. Discard them?", () => {
        api.forgetRemembered();
        onBackToList();
      });
    },
    [api, guardDirty, onBackToList],
  );

  // ------------------------------------------------------------ shortcuts
  useTxnKeys(
    {
      new: !working && rights.mayStartNew ? runNew : null,
      saveDraft: !working && canSaveDraft && editable ? () => runSave(false) : null,
      post: !working && canPost && editable ? () => runSave(true) : null,
      edit: !working && canEdit ? runEdit : null,
      cancelDoc: !working && canCancel ? runCancel : null,
      open: !working ? () => leave("Open another") : null,
      close: !working ? () => leave("Close") : null,
    },
    { onHelp: () => setKeysOpen(true), enabled: !gridSettings.active && itemPicker === null && !cancelAsk },
  );

  // Bare F5 is swallowed: a habit press must not reload the page and take the bill with it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
      const line = draft.lines.find((candidate) => !rowHasItem(candidate)) ?? draft.lines[draft.lines.length - 1];
      if (line) {
        event.preventDefault();
        focusBlankLineEntry(line.key);
      }
    }
  };

  const at = (row: number, column: number) => ({ gridRow: row, gridColumn: String(column) });
  const totals = draft.totals;
  const differenceOk = totals ? Math.abs(totals.difference) < 0.005 : true;

  return (
    <div className={quotationStyles.page}>
      <div className={styles.topBand}>
        <div className={styles.titleRow}>
          <div className={styles.titleLine}>
            <button type="button" className={quotationStyles.button} onClick={() => leave("Close")}>
              ‹ {config.listTitle}
            </button>
            <h1 className={quotationStyles.title}>{config.title}</h1>
            <span className={styles.docTitle}>
              {draft.refno ? `Purchase Invoice — ${draft.refno}` : "Purchase Invoice — new"}
            </span>
          </div>
          <div className={styles.statusBlock}>
            <div className={styles.statusLine}>
              {draft.viewMode === "browse" && isDraft && saved ? (
                <span className={quotationStyles.readOnlyBadge}>Read only</span>
              ) : null}
              {draft.dirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
              {api.busy ? <span className={styles.busy}>{api.busy === "loading" ? "loading…" : "working…"}</span> : null}
              <span
                className={cx(styles.statusPill, STATUS_CLASS[draft.status] ?? styles.statusDraft)}
                title="DRAFT, POSTED or CANCELLED."
              >
                {draft.status}
              </span>
            </div>
          </div>
        </div>

        {/* ── the header: four pairs a row, in the Qt tab order ───────────── */}
        <div className={styles.headerCard} onKeyDown={onHeaderKeyDown}>
          <div className={styles.pair} style={at(1, 1)}>
            <DropdownCombo
              id={IDS.supplier}
              label="Supplier"
              dropdownId={supplierDropdownId}
              valueKey="sup_id"
              labelKey="sup_name"
              metaKey="sup_short"
              value={draft.supplierId}
              selectedLabel={draft.supplierName}
              disabled={!editable}
              required
              placeholder="Who sent the bill"
              onSelect={api.setSupplier}
            />
          </div>
          <div className={styles.pair} style={at(1, 2)}>
            <TextField
              id={IDS.invNo}
              label="Supplier Inv"
              value={draft.supplierInvNo}
              disabled={!editable}
              required
              maxLength={60}
              placeholder="as printed on the bill"
              onChange={(value) => api.setHeader({ supplierInvNo: value })}
            />
          </div>
          <div className={styles.pair} style={at(1, 3)}>
            <DateField
              id={IDS.invDate}
              label="Inv Date"
              value={draft.supplierInvDate}
              disabled={!editable}
              onChange={(value) => api.setHeader({ supplierInvDate: value })}
            />
          </div>
          <div className={styles.pair} style={at(1, 4)}>
            <ReadOnlyInput id={IDS.ourNo} label="Our No" value={draft.refno} placeholder="given on save" />
          </div>
          <div className={styles.pair} style={at(2, 1)}>
            <DateField
              id={IDS.docDate}
              label="Entry Date"
              value={draft.docDate}
              disabled={!editable}
              onChange={(value) => api.setHeader({ docDate: value })}
            />
          </div>
          <div className={styles.pair} style={at(2, 2)}>
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
              placeholder="Where the goods go in"
              onSelect={api.setGodown}
            />
          </div>
          <div className={styles.pair} style={at(2, 3)}>
            <Field label="Inv Amount" htmlFor={IDS.amount} required>
              <input
                id={IDS.amount}
                className={cx(quotationStyles.input, styles.amountInput)}
                value={draft.invoiceAmount}
                disabled={!editable}
                inputMode="decimal"
                autoComplete="off"
                placeholder="as printed on the bill"
                title="The bill's total as printed — compared with the net payable."
                data-quotation-focus={IDS.amount}
                onChange={(event) => {
                  const next = event.target.value.trim();
                  if (AMOUNT_PATTERN.test(next)) {
                    api.setHeader({ invoiceAmount: next });
                  }
                }}
              />
            </Field>
          </div>
          <div className={styles.pair} style={at(2, 4)}>
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
        <InvoiceLineGrid
          lines={draft.lines}
          columns={columns}
          editable={editable}
          onContextMenu={gridSettings.onContextMenu}
          onActiveRow={(key) => {
            activeKey.current = key;
          }}
          onEdit={api.editCell}
          onOpenItemPicker={openItemPicker}
          onScanBarcode={onScanBarcode}
          onSearchItems={openItemPicker}
          onRefused={api.setHint}
          onAddLine={onAddLine}
          onRemoveLine={onRemoveLine}
        />
      </section>

      <p className={styles.hintLine} role="status">
        {draft.hint}
      </p>

      <dl className={styles.totals} aria-label="Totals">
        {totals ? (
          <>
            <div>
              <dt>Taxable</dt>
              <dd>{money(totals.taxable)}</dd>
            </div>
            <div>
              <dt>GST</dt>
              <dd>{money(totals.gst)}</dd>
            </div>
            <div>
              <dt>Round off</dt>
              <dd>{money(totals.roundOff)}</dd>
            </div>
            <div className={styles.totalsNet}>
              <dt>Net payable</dt>
              <dd>{money(totals.netPayable)}</dd>
            </div>
            <div>
              <dt>Invoice amount</dt>
              <dd>{money(totals.invoiceAmount)}</dd>
            </div>
            <div>
              <dt>Difference</dt>
              <dd className={differenceOk ? styles.diffOk : styles.diffBad}>{money(totals.difference)}</dd>
            </div>
            {totals.shortValue > 0 ? (
              <div>
                <dt>Short parked</dt>
                <dd>
                  {money(totals.shortValue)} (GST {money(totals.itcPending)} pending)
                </dd>
              </div>
            ) : null}
          </>
        ) : (
          <div>
            <dt className={styles.totalsEmpty}>The figures appear once the supplier, the godown and a line are in.</dt>
          </div>
        )}
      </dl>

      <div className={styles.buttonBar}>
        <span className={styles.footerHint}>F1 · keys on this screen</span>
        <button
          type="button"
          className={quotationStyles.button}
          disabled={working || !rights.mayStartNew}
          title="Start a new bill."
          onClick={runNew}
        >
          {withKey("New", "new")}
        </button>
        <button
          type="button"
          className={quotationStyles.button}
          title="Save without moving stock or books."
          disabled={!canSaveDraft || !editable || working}
          onClick={() => runSave(false)}
        >
          {api.busy === "saving" ? "Saving…" : withKey("Save Draft", "saveDraft")}
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          title="Saves and posts in one step: the stock comes in, the supplier is credited."
          disabled={!canPost || !editable || working}
          onClick={() => runSave(true)}
        >
          {api.busy === "posting" ? "Posting…" : withKey("Post", "post")}
        </button>
        {isDraft && saved && draft.viewMode === "browse" ? (
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
          title="Undo a posted bill nothing has paid: stock out, books reversed."
          disabled={!canCancel || working}
          onClick={runCancel}
        >
          {api.busy === "cancelling" ? "Cancelling…" : withKey("Cancel", "cancelDoc")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={() => leave("Open another")}>
          {withKey("Show List", "open")}
        </button>
        <button type="button" className={quotationStyles.button} disabled={working} onClick={() => leave("Close")}>
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
          message="Why is this bill being cancelled?"
          placeholder="Type the reason"
          onCancel={() => setCancelAsk(false)}
          onConfirm={(reason) => {
            setCancelAsk(false);
            void api.cancelDocument(reason);
          }}
        />
      ) : null}
      <TxnKeysSheet open={keysOpen} onClose={() => setKeysOpen(false)} document={KEY_SHEET.document} lines={KEY_SHEET.lines} />
    </div>
  );
}
