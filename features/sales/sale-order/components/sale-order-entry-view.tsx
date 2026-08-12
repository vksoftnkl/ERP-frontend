"use client";
/**
 * Sale Order Entry — the voucher form. Layout and wiring only: the arithmetic
 * lives in `@/domain/pricing` and `tender/arithmetic.ts`, the draft in
 * `saleOrderSlice`, the network in `use-sale-order-draft.ts`, the translations
 * in `sale-order.payload.ts`. Nothing on this page computes a total.
 *
 * The item and charge grids are the QUOTATION's components, fed this screen's
 * 96-column meanings — the fulfilment quartet reaches them flattened out of
 * each line's readonly branch, so the grid can paint what it may never edit.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { cx } from "@/components/design-system/cx";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import type { PricedLine } from "@/domain/pricing";
import { formatCurrency, money } from "@/domain/pricing";
import { ChargeGrid } from "@/features/sales/quotation/components/charge-grid";
import { ChargePickerModal } from "@/features/sales/quotation/components/charge-picker-modal";
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import {
  GridSplitter,
  useChargesPaneSplit,
} from "@/features/sales/quotation/components/grid-splitter";
import { ItemGrid } from "@/features/sales/quotation/components/item-grid";
import {
  ItemPickerModal,
  type ItemPick,
} from "@/features/sales/quotation/components/item-picker-modal";
import { PriceLevelPrompt } from "@/features/sales/quotation/components/price-level-prompt";
import { QuotationListModal } from "@/features/sales/quotation/components/quotation-list-modal";
import { TermsBlock } from "@/features/sales/quotation/components/header-blocks";
import {
  TotalsFooterStats,
  TotalsStrip,
} from "@/features/sales/quotation/components/totals-strip";
import { useColumnResize } from "@/features/sales/quotation/components/use-column-resize";
import {
  CHARGE_GRID_UI_TABLE_ID,
  PRICE_LEVEL_COUNT,
} from "@/features/sales/quotation/quotation.constants";
import type {
  ChargeMasterRow,
  DraftChargeRow,
  DraftLine,
  QuotationDocKey,
} from "@/features/sales/quotation/quotation.types";
import {
  CHARGE_COLUMN_WIDTH_UNIT,
  parseCell,
  toDisplayDate,
  toNullableText,
} from "@/features/sales/quotation/quotation.utils";
import { rateWarning } from "@/features/sales/quotation/quotation.validate";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import {
  chargeFieldSet,
  chargeMasterApplied,
  chargeRemoved,
  customerFieldSet,
  headerFieldSet,
  lineAdded,
  lineFieldSet,
  lineInserted,
  lineRemoved,
  posSet,
  tendersReplaced,
  termsFieldSet,
} from "@/store/slices/saleOrderSlice";
import { SALE_ORDER_ITEM_GRID_UI_TABLE_ID } from "../sale-order.constants";
import { netSettledOf } from "../tender/arithmetic";
import type { SaleOrderDocKey, SaleOrderDraftLine } from "../sale-order.types";
import {
  SALES_ITEM_COLUMN_WIDTH_UNIT,
  useSaleOrderDraft,
} from "../use-sale-order-draft";
import { CreditPanel } from "./credit-panel";
import { SaleOrderListModal } from "./sale-order-list";
import { SaleOrderToolbar } from "./sale-order-toolbar";
import { TenderDialog } from "./tender-dialog";
import styles from "../page.module.scss";
import {
  OrderCustomerBlock,
  OrderInfoBlock,
  OrderSalesInfoBlock,
} from "./order-header-blocks";

const STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: "statusDraft",
  CONFIRMED: "statusSent",
  PARTIAL: "statusSent",
  COMPLETED: "statusAccepted",
  CLOSED: "statusConverted",
  CANCELLED: "statusCancelled",
  EXPIRED: "statusExpired",
};

const TEXT_LINE_FIELDS = new Set<keyof DraftLine>([
  "barcode",
  "batchNo",
  "batchDate",
  "expiryDate",
  "remarks",
  "itemSize",
]);

type PendingGuard = "list" | "clear" | "back" | "import" | null;

const NEW_DOCUMENT = " new";

export type SaleOrderEntryViewProps = {
  initialDocument?: SaleOrderDocKey;
  initialMode?: "browse" | "entry";
  onBackToList: () => void;
};

export function SaleOrderEntryView({
  initialDocument,
  initialMode = "browse",
  onBackToList,
}: SaleOrderEntryViewProps) {
  const api = useSaleOrderDraft();
  const {
    draft,
    dispatch,
    pricing,
    busy,
    canEditPrice,
    customerLocked,
    itemColumns,
    chargeColumns,
    priceLevelOptions,
    chargeMasters,
    tenderMasters,
    tenderMasterError,
    unitOptionsFor,
  } = api;

  const editable = draft.mode === "entry" && !draft.isDeleted;
  const canAlter = Boolean(draft.docId) && !draft.isDeleted;

  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [itemPickerRow, setItemPickerRow] = useState<string | null>(null);
  const [chargePickerRow, setChargePickerRow] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tenderOpen, setTenderOpen] = useState(false);
  const [priceLevelPrompt, setPriceLevelPrompt] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [creditQuestion, setCreditQuestion] = useState<string | null>(null);
  const [pendingGuard, setPendingGuard] = useState<PendingGuard>(null);
  const [invalidCells, setInvalidCells] = useState<Record<string, true>>({});

  const gridsRowRef = useRef<HTMLDivElement | null>(null);
  const bottomRowRef = useRef<HTMLDivElement | null>(null);
  const gridSplit = useChargesPaneSplit(gridsRowRef, bottomRowRef);
  const itemResize = useColumnResize(
    itemColumns,
    SALE_ORDER_ITEM_GRID_UI_TABLE_ID,
    SALES_ITEM_COLUMN_WIDTH_UNIT,
  );
  const chargeResize = useColumnResize(
    chargeColumns,
    CHARGE_GRID_UI_TABLE_ID,
    CHARGE_COLUMN_WIDTH_UNIT,
  );
  const itemSettings = useGridSettings({
    label: "Items",
    uiTableId: SALE_ORDER_ITEM_GRID_UI_TABLE_ID,
    columns: itemResize.columns,
    pendingWidthCount: itemResize.pendingCount,
    savingWidths: itemResize.saving,
    onSaveWidths: itemResize.saveWidths,
  });
  const chargeSettings = useGridSettings({
    label: "Additional charges",
    uiTableId: CHARGE_GRID_UI_TABLE_ID,
    columns: chargeResize.columns,
    pendingWidthCount: chargeResize.pendingCount,
    savingWidths: chargeResize.saving,
    onSaveWidths: chargeResize.saveWidths,
  });

  // Load-on-mount, exactly the quotation's dance.
  const openedDocument = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = initialDocument;
    const opening = target?.soId ?? NEW_DOCUMENT;
    if (openedDocument.current === opening) {
      return;
    }
    openedDocument.current = opening;
    api.clear();
    if (!target) {
      return;
    }
    void api.loadDocument(target).then((loaded) => {
      if (loaded && !loaded.isDeleted && initialMode === "entry") {
        api.beginEdit();
      }
    });
  }, [api, initialDocument, initialMode]);

  /**
   * The grids read a merged `{line, priced}` view by flat key, so the readonly
   * fulfilment branch is flattened into the priced rows here — display only;
   * no write path exists for those four columns.
   */
  const pricedView = useMemo(
    () =>
      pricing.lines.map((priced, index) => {
        const fulfilment = (draft.lines[index] as SaleOrderDraftLine | undefined)?.fulfilment;
        return (fulfilment ? { ...priced, ...fulfilment } : priced) as PricedLine;
      }),
    [pricing.lines, draft.lines],
  );

  const setLineField = useCallback(
    (rowKey: string, field: keyof DraftLine, raw: string) => {
      const line = draft.lines.find((row) => row.key === rowKey);
      if (!line) {
        return;
      }
      if (TEXT_LINE_FIELDS.has(field)) {
        dispatch(lineFieldSet({ key: rowKey, field, value: toNullableText(raw) }));
        return;
      }
      const value = parseCell(raw);
      if (field === "rate") {
        const warning = rateWarning(value, line.minPrice, line.mrp);
        if (warning) {
          toast.warn(warning);
        }
        if (line.minPrice > 0 && value > 0 && value < line.minPrice) {
          return;
        }
      }
      dispatch(lineFieldSet({ key: rowKey, field, value }));
      if (field === "caseQty" && value !== 0 && !line.toBaseFactorKnown) {
        void api.recoverBaseFactor(rowKey);
      }
    },
    [api, dispatch, draft.lines],
  );

  const toggleLineField = useCallback(
    (rowKey: string, field: keyof DraftLine, checked: boolean) => {
      dispatch(lineFieldSet({ key: rowKey, field, value: checked }));
    },
    [dispatch],
  );

  const setChargeField = useCallback(
    (rowKey: string, field: keyof DraftChargeRow, raw: string) => {
      if (field === "rate" || field === "amount") {
        dispatch(chargeFieldSet({ key: rowKey, field, value: Math.abs(parseCell(raw)) }));
        return;
      }
      dispatch(chargeFieldSet({ key: rowKey, field, value: toNullableText(raw) }));
    },
    [dispatch],
  );

  const onPickItem = useCallback(
    (pick: ItemPick) => {
      const rowKey = itemPickerRow;
      setItemPickerRow(null);
      if (!rowKey) {
        return;
      }
      const duplicate = draft.lines.some(
        (line) => line.key !== rowKey && line.itemId === pick.itemId,
      );
      if (duplicate) {
        toast.info(`${pick.itemName} is already on this order.`);
      }
      void api.pickItem(rowKey, pick.itemId, pick.itemUnitId);
    },
    [api, draft.lines, itemPickerRow],
  );

  const onPickCharge = useCallback(
    (master: ChargeMasterRow) => {
      const rowKey = chargePickerRow;
      setChargePickerRow(null);
      if (!rowKey) {
        return;
      }
      dispatch(chargeMasterApplied({ key: rowKey, master }));
    },
    [chargePickerRow, dispatch],
  );

  const onRemoveLine = useCallback(
    (rowKey: string) => {
      dispatch(lineRemoved(rowKey));
      if (activeRowKey === rowKey) {
        setActiveRowKey(null);
      }
    },
    [activeRowKey, dispatch],
  );

  // ----------------------------------------------------------------- actions
  const runSave = useCallback(
    async (print: boolean) => {
      const violation = api.validate();
      setInvalidCells(
        violation?.lineKey ? { [`${violation.lineKey}:${violation.field}`]: true } : {},
      );
      const outcome = await api.save();
      if (outcome.status === "confirm-credit") {
        setCreditQuestion(outcome.message);
        return;
      }
      if (outcome.status !== "saved") {
        return;
      }
      if (print) {
        toast.info("Saved. Printing is not available yet — the server has no print endpoint.");
      }
      api.clear();
      setActiveRowKey(null);
      setInvalidCells({});
    },
    [api],
  );

  const onCreditConfirmed = useCallback(async () => {
    setCreditQuestion(null);
    const outcome = await api.confirmCreditAndSave();
    if (outcome.status === "saved") {
      api.clear();
      setActiveRowKey(null);
      setInvalidCells({});
    }
  }, [api]);

  const guardedRun = useCallback(
    (action: Exclude<PendingGuard, null>) => {
      if (draft.isDirty) {
        setPendingGuard(action);
        return;
      }
      if (action === "list") setListOpen(true);
      if (action === "import") setImportOpen(true);
      if (action === "clear") api.clear();
      if (action === "back") onBackToList();
    },
    [api, draft.isDirty, onBackToList],
  );

  const onGuardConfirm = useCallback(() => {
    const action = pendingGuard;
    setPendingGuard(null);
    if (action === "list") setListOpen(true);
    if (action === "import") setImportOpen(true);
    if (action === "clear") api.clear();
    if (action === "back") onBackToList();
  }, [api, onBackToList, pendingGuard]);

  const onPickDocument = useCallback(
    (key: SaleOrderDocKey, mode: "browse" | "entry") => {
      setListOpen(false);
      void api.loadDocument(key).then((loaded) => {
        if (loaded && !loaded.isDeleted && mode === "entry") {
          api.beginEdit();
        }
      });
    },
    [api],
  );

  const onPickQuotation = useCallback(
    (key: QuotationDocKey) => {
      setImportOpen(false);
      void api.importQuotation(key);
    },
    [api],
  );

  const requestEdit = useCallback(() => {
    if (draft.mode === "entry" || draft.isDeleted) {
      return;
    }
    setEditConfirmOpen(true);
  }, [draft.isDeleted, draft.mode]);

  const onEditConfirmed = useCallback(() => {
    setEditConfirmOpen(false);
    api.beginEdit();
  }, [api]);

  const applyPriceLevel = useCallback(
    (scope: "selected" | "all") => {
      const level = priceLevelPrompt;
      setPriceLevelPrompt(null);
      if (level === null) {
        return;
      }
      void api.applyPriceLevel(level, scope, activeRowKey ? [activeRowKey] : []);
    },
    [activeRowKey, api, priceLevelPrompt],
  );

  const onPriceLevelShortcut = useCallback(
    (level: number) => {
      if (!canEditPrice) {
        toast.warn("You do not have permission to change prices.");
        return;
      }
      setPriceLevelPrompt(level);
    },
    [canEditPrice],
  );

  const openTender = useCallback(() => {
    if (!editable) {
      toast.warn("Open the order for editing before recording an advance.");
      return;
    }
    if (pricing.totals.bill <= 0) {
      toast.warn("Add at least one item before recording an advance.");
      return;
    }
    setTenderOpen(true);
  }, [editable, pricing.totals.bill]);

  // --------------------------------------------------------------- shortcuts
  const modalOpen =
    itemPickerRow !== null ||
    chargePickerRow !== null ||
    listOpen ||
    importOpen ||
    tenderOpen ||
    priceLevelPrompt !== null ||
    deleteOpen ||
    editConfirmOpen ||
    creditQuestion !== null ||
    pendingGuard !== null;

  const shortcutsRef = useRef({ runSave, guardedRun, requestEdit, copyAsNew: api.copyAsNew, modalOpen });
  shortcutsRef.current = { runSave, guardedRun, requestEdit, copyAsNew: api.copyAsNew, modalOpen };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shortcutsRef.current.modalOpen || event.repeat) {
        return;
      }
      switch (event.key) {
        case "F5":
          event.preventDefault();
          void shortcutsRef.current.runSave(false);
          break;
        case "F6":
          event.preventDefault();
          void shortcutsRef.current.runSave(true);
          break;
        case "F7":
          event.preventDefault();
          shortcutsRef.current.guardedRun("clear");
          break;
        case "F8":
          event.preventDefault();
          shortcutsRef.current.guardedRun("list");
          break;
        case "F3":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            shortcutsRef.current.guardedRun("import");
          } else if (canAlter) {
            event.preventDefault();
            setDeleteOpen(true);
          }
          break;
        case "F9":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            shortcutsRef.current.copyAsNew();
          }
          break;
        case "F2":
          if (draft.mode === "browse" && !draft.isDeleted) {
            event.preventDefault();
            shortcutsRef.current.requestEdit();
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canAlter, draft.isDeleted, draft.mode]);

  useEffect(() => {
    if (!draft.isDirty) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draft.isDirty]);

  const usedItemIds = useMemo(
    () => draft.lines.map((line) => line.itemId).filter(Boolean),
    [draft.lines],
  );
  const usedChargeIds = useMemo(
    () => draft.charges.map((row) => row.chgId).filter(Boolean),
    [draft.charges],
  );

  // Advance tendered / balance due — always visible (the plan's §7.3).
  const netSettled = netSettledOf(
    draft.settlement.tenderAmt,
    draft.settlement.surchargeAmt,
    draft.settlement.refundAmt,
  );
  const balanceDue = money(Math.max(0, pricing.totals.bill - netSettled));

  return (
    <div className={quotationStyles.page}>
      <header className={quotationStyles.titleBar}>
        <span className={quotationStyles.gridHeadActions}>
          <button type="button" className={quotationStyles.button} onClick={() => guardedRun("back")}>
            ‹ Sale Orders
          </button>
          <h1 className={quotationStyles.title}>Sale Order entry</h1>
        </span>
        <span
          className={cx(
            quotationStyles.statusBadge,
            quotationStyles[STATUS_BADGE_CLASS[draft.status] ?? "statusDraft"],
          )}
        >
          {draft.status}
        </span>
        {draft.source ? (
          // Reads the RAW srcDocType, so a future MOBILE_ORDER needs no change.
          <span
            className={styles.sourceChip}
            title={
              customerLocked
                ? "Raised from this document — the customer is locked to it."
                : "Raised from this document."
            }
          >
            FROM {draft.source.docType || "DOCUMENT"}
            {draft.source.refno ? (
              <>
                <span className={styles.sourceChipDivider}>·</span>
                {draft.source.refno}
              </>
            ) : null}
            {draft.source.date ? (
              <>
                <span className={styles.sourceChipDivider}>·</span>
                {toDisplayDate(draft.source.date)}
              </>
            ) : null}
          </span>
        ) : null}
        <div className={quotationStyles.titleMeta}>
          {draft.isDeleted ? (
            <span className={quotationStyles.deletedBadge} title="A deleted order cannot be edited.">
              Deleted
            </span>
          ) : null}
          {draft.mode === "browse" ? (
            <span className={quotationStyles.readOnlyBadge}>Read only</span>
          ) : null}
          {draft.pricing === "stored" ? <span>showing saved figures</span> : null}
          {draft.isDirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
          <span>
            Year <strong>{draft.accYear || "—"}</strong>
          </span>
          {draft.orderRefno ? (
            <span>
              Order <strong>{draft.orderRefno}</strong>
            </span>
          ) : null}
          <span>
            Pay <strong>{draft.settlement.payStatus}</strong>
          </span>
        </div>
      </header>

      <div className={quotationStyles.headerRow}>
        <OrderCustomerBlock
          customer={draft.customer}
          header={draft.header}
          source={draft.source}
          customerLocked={customerLocked}
          disabled={!editable}
          onPickCustomer={(customerId) => void api.pickCustomer(customerId)}
          onSetCustomerField={(field, value) => dispatch(customerFieldSet({ field, value }))}
          onSetPos={(stateCode, stateName) => dispatch(posSet({ stateCode, stateName }))}
        />
        <OrderSalesInfoBlock
          header={draft.header}
          disabled={!editable}
          onSetHeader={(field, value) => dispatch(headerFieldSet({ field, value }))}
          onSetSalesman={(id, name) => {
            dispatch(headerFieldSet({ field: "salesmanId", value: id }));
            dispatch(headerFieldSet({ field: "salesmanName", value: name }));
          }}
          onSetAgent={(id, name) => {
            dispatch(headerFieldSet({ field: "agentId", value: id }));
            dispatch(headerFieldSet({ field: "agentName", value: name }));
          }}
        />
        <OrderInfoBlock
          header={draft.header}
          orderRefno={draft.orderRefno}
          priceLevelOptions={priceLevelOptions}
          disabled={!editable}
          onSetHeader={(field, value) => dispatch(headerFieldSet({ field, value }))}
        />
        <CreditPanel credit={draft.partyCredit} hasCustomer={Boolean(draft.customer.custId)} />
      </div>

      {draft.docId && draft.fulfilment.status ? (
        <div className={styles.fulfilmentStrip}>
          <span>
            <span className={styles.fulfilmentLabel}>Fulfilment </span>
            <span className={styles.fulfilmentValue}>{draft.fulfilment.status}</span>
          </span>
          <span>
            <span className={styles.fulfilmentLabel}>Billed </span>
            <span className={styles.fulfilmentValue}>
              {formatCurrency(draft.fulfilment.billedAmt)}
            </span>
          </span>
          <span>
            <span className={styles.fulfilmentLabel}>Pending </span>
            <span className={styles.fulfilmentValue}>
              {formatCurrency(draft.fulfilment.pendingAmt)}
            </span>
          </span>
          <span>
            <span className={styles.fulfilmentLabel}>Cancelled </span>
            <span className={styles.fulfilmentValue}>
              {formatCurrency(draft.fulfilment.cancelledAmt)}
            </span>
          </span>
          <span>
            <span className={styles.fulfilmentLabel}>Advance Held </span>
            <span className={styles.fulfilmentValue}>
              {formatCurrency(draft.advance.balanceAmt)}
            </span>
          </span>
        </div>
      ) : null}

      <div
        ref={gridsRowRef}
        className={cx(quotationStyles.gridsRow, gridSplit.dragging && quotationStyles.gridsRowDragging)}
      >
        <section
          className={`${quotationStyles.gridShell} ${quotationStyles.itemGridShell}`}
          onContextMenu={itemSettings.onContextMenu}
        >
          <div className={quotationStyles.gridHead}>
            <span className={quotationStyles.gridHeadTitle}>Items</span>
            <span className={quotationStyles.gridHeadActions}>
              <span className={quotationStyles.modalNote}>
                Enter next cell · F4 unit · Ctrl+± row · Ctrl+1..{PRICE_LEVEL_COUNT} price level ·
                back-orders allowed
              </span>
            </span>
          </div>
          <ItemGrid
            columns={itemResize.columns}
            resizingKey={itemResize.resizingKey}
            onColumnResizeStart={itemResize.onResizeStart}
            lines={draft.lines}
            priced={pricedView}
            editable={editable}
            canEditPrice={canEditPrice}
            invalidCells={invalidCells}
            activeRowKey={activeRowKey}
            unitOptionsFor={unitOptionsFor}
            onActiveRowChange={setActiveRowKey}
            onSetField={setLineField}
            onToggleField={toggleLineField}
            onOpenItemPicker={setItemPickerRow}
            onCommitBarcode={(rowKey, barcode) => void api.resolveBarcode(rowKey, barcode)}
            onSetUnit={(rowKey, itemUnitId) => void api.setLineUnit(rowKey, itemUnitId)}
            onSetPriceLevel={(rowKey, level) => void api.applyPriceLevel(level, "selected", [rowKey])}
            onAddLine={() => dispatch(lineAdded())}
            onInsertLine={(rowKey) => dispatch(lineInserted(rowKey))}
            onRemoveLine={onRemoveLine}
            onSwitchUnit={(rowKey) => void api.switchUnit(rowKey)}
            onPriceLevelShortcut={onPriceLevelShortcut}
          />
        </section>

        <GridSplitter split={gridSplit} />

        <div
          ref={bottomRowRef}
          className={cx(
            quotationStyles.bottomRow,
            gridSplit.height === null && quotationStyles.bottomRowAuto,
          )}
          style={gridSplit.height === null ? undefined : { height: gridSplit.height }}
        >
          <section
            className={cx(quotationStyles.gridShell, quotationStyles.chargeGridShell)}
            onContextMenu={chargeSettings.onContextMenu}
          >
            <div className={quotationStyles.gridHead}>
              <span className={quotationStyles.gridHeadTitle}>Additional charges</span>
            </div>
            <ChargeGrid
              columns={chargeResize.columns}
              resizingKey={chargeResize.resizingKey}
              onColumnResizeStart={chargeResize.onResizeStart}
              rows={draft.charges}
              priced={pricing.charges}
              editable={editable}
              onOpenChargePicker={setChargePickerRow}
              onSetField={setChargeField}
              onRemoveRow={(rowKey) => dispatch(chargeRemoved(rowKey))}
            />
          </section>

          <TermsBlock
            terms={draft.terms}
            disabled={!editable}
            onSetTerms={(field, value) => dispatch(termsFieldSet({ field, value }))}
          />
          <div>
            <TotalsStrip totals={pricing.totals} stored={draft.pricing === "stored"} />
            <div className={styles.fulfilmentStrip} style={{ marginTop: 6 }}>
              <span>
                <span className={styles.fulfilmentLabel}>Advance Tendered </span>
                <span className={styles.fulfilmentValue}>
                  {formatCurrency(draft.settlement.tenderAmt)}
                </span>
              </span>
              {draft.settlement.surchargeAmt > 0 ? (
                <span>
                  <span className={styles.fulfilmentLabel}>Surcharge </span>
                  <span className={styles.fulfilmentValue}>
                    {formatCurrency(draft.settlement.surchargeAmt)}
                  </span>
                </span>
              ) : null}
              <span>
                <span className={styles.fulfilmentLabel}>Balance Due </span>
                <span className={styles.fulfilmentValue}>{formatCurrency(balanceDue)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <TotalsFooterStats totals={pricing.totals} />

      <SaleOrderToolbar
        mode={draft.mode}
        busy={busy}
        canEdit={!draft.isDeleted}
        canDelete={canAlter}
        canCopyAsNew={Boolean(draft.docId)}
        canTender={editable && pricing.totals.bill > 0}
        onShowList={() => guardedRun("list")}
        onEdit={requestEdit}
        onDelete={() => setDeleteOpen(true)}
        onClear={() => guardedRun("clear")}
        onImportQuotation={() => guardedRun("import")}
        onOpenTender={openTender}
        onCopyAsNew={api.copyAsNew}
        onSave={() => void runSave(false)}
        onSaveAndPrint={() => void runSave(true)}
        onCancel={() => guardedRun("back")}
      />

      {itemSettings.overlays}
      {chargeSettings.overlays}

      <ItemPickerModal
        isOpen={itemPickerRow !== null}
        usedItemIds={usedItemIds}
        onClose={() => setItemPickerRow(null)}
        onPick={onPickItem}
      />
      <ChargePickerModal
        isOpen={chargePickerRow !== null}
        charges={chargeMasters}
        usedChargeIds={usedChargeIds}
        onClose={() => setChargePickerRow(null)}
        onPick={onPickCharge}
      />
      <SaleOrderListModal
        isOpen={listOpen}
        companyId={draft.companyId}
        branchId={draft.branchId}
        onClose={() => setListOpen(false)}
        onPick={onPickDocument}
      />
      <QuotationListModal
        isOpen={importOpen}
        companyId={draft.companyId}
        branchId={draft.branchId}
        accYear={draft.accYear}
        onClose={() => setImportOpen(false)}
        onPick={onPickQuotation}
      />
      <TenderDialog
        isOpen={tenderOpen}
        purpose="advance"
        documentAmount={pricing.totals.bill}
        documentDate={draft.header.orderDate}
        documentRefno={draft.orderRefno}
        existingRows={draft.tenders}
        masters={tenderMasters}
        masterError={tenderMasterError}
        refundAmt={draft.settlement.refundAmt}
        onClose={() => setTenderOpen(false)}
        onApply={(tenders, settlement) => {
          dispatch(tendersReplaced({ tenders, settlement }));
          setTenderOpen(false);
        }}
      />
      <PriceLevelPrompt
        priceLevel={priceLevelPrompt}
        hasSelection={Boolean(activeRowKey)}
        onClose={() => setPriceLevelPrompt(null)}
        onApply={applyPriceLevel}
      />
      <DeleteConfirmModal
        isOpen={deleteOpen}
        itemName={draft.orderRefno || "this order"}
        message="The order, its lines, charges and advance receipts will be marked deleted. An order still holding an advance balance is refused by the server — refund it first."
        loading={busy === "deleting"}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          void api.deleteDocument();
        }}
      />
      <DeleteConfirmModal
        isOpen={editConfirmOpen}
        title="Enable Editing"
        message="Switch this order to edit mode?"
        itemName={draft.orderRefno || undefined}
        iconVariant="replace"
        confirmLabel="Yes"
        cancelLabel="No"
        onCancel={() => setEditConfirmOpen(false)}
        onConfirm={onEditConfirmed}
      />
      <DeleteConfirmModal
        isOpen={creditQuestion !== null}
        title="Credit check"
        itemName={draft.customer.name || "this customer"}
        message={creditQuestion ?? ""}
        iconVariant="replace"
        confirmLabel="Take the order"
        cancelLabel="Go back"
        onCancel={() => setCreditQuestion(null)}
        onConfirm={() => void onCreditConfirmed()}
      />
      <DeleteConfirmModal
        isOpen={pendingGuard !== null}
        title="Discard unsaved changes?"
        itemName="unsaved changes"
        message="This order has changes that have not been saved."
        iconVariant="replace"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onCancel={() => setPendingGuard(null)}
        onConfirm={onGuardConfirm}
      />
    </div>
  );
}
