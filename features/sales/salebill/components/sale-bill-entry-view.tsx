"use client";

/**
 * Sale Bill Entry — the voucher form. Layout and wiring only: the arithmetic
 * lives in `@/domain/pricing`, the draft in `saleBillSlice`, the network in
 * `use-sale-bill-draft.ts`. Nothing on this page computes a total.
 *
 * The item and charge grids are the QUOTATION's components, fed this screen's
 * 94-column meanings for ui table 22 — the same arrangement the sale order
 * already uses. The source order line's echo (PendingQty, LineStatus) reaches
 * the grid flattened out of each line's readonly `source` branch, so the grid
 * can paint what it may never edit.
 *
 * Phase 1 of the port: header, item grid, charges, place of supply and totals.
 * There is no money and no save yet — see `SaleBillToolbar` for what arrives in
 * which phase.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { toast } from "@/lib/notify";
import { cx } from "@/components/design-system/cx";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import { useCustomerDropdownMaster } from "@/features/masters/sales/customer/use-customer-dropdown-master";
import type { PricedLine } from "@/domain/pricing";
import { formatCurrency } from "@/domain/pricing";
import {
  CHARGE_GRID_NAME,
  ChargeGrid,
  chargeLookupFieldKey,
} from "@/features/sales/quotation/components/charge-grid";
import { ChargePickerModal } from "@/features/sales/quotation/components/charge-picker-modal";
import {
  focusCell,
  focusFirstCell,
  focusNextRowAfterRender,
  focusNextStopFrom,
} from "@/features/sales/quotation/components/grid-focus";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import { moveSectionFocus } from "@/features/sales/quotation/components/section-focus";
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { TermsBlock } from "@/features/sales/quotation/components/header-blocks";
import {
  ITEM_GRID_NAME,
  ItemGrid,
  itemLookupFieldKey,
} from "@/features/sales/quotation/components/item-grid";
import {
  ItemPickerModal,
  type ItemPick,
} from "@/features/sales/quotation/components/item-picker-modal";
import { SizeEntryModal } from "@/features/sales/quotation/components/size-entry-modal";
import { PriceLevelPrompt } from "@/features/sales/quotation/components/price-level-prompt";
import { HeldListModal } from "@/features/sales/quotation/components/held-list-modal";
import { QuotationListModal } from "@/features/sales/quotation/components/quotation-list-modal";
import { SaleOrderListModal } from "@/features/sales/sale-order/components/sale-order-list-modal";
import { TenderDialog } from "@/features/sales/sale-order/components/tender-dialog";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { PURPOSE_CODE } from "@/features/printing/domain/documentPrint";
import { useGetTenderMastersQuery } from "@/store/api/saleOrderApi";
import {
  TotalsFooterStats,
  TotalsStrip,
} from "@/features/sales/quotation/components/totals-strip";
import { useColumnResize } from "@/features/sales/quotation/components/use-column-resize";
import {
  HEADER_FOCUS_ATTR,
  PRICE_LEVEL_COUNT,
  SECTION_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import type {
  ChargeMasterRow,
  DraftChargeRow,
  DraftLine,
} from "@/features/sales/quotation/quotation.types";
import {
  CHARGE_COLUMN_WIDTH_UNIT,
  parseCell,
  toDisplayDate,
  toNullableText,
} from "@/features/sales/quotation/quotation.utils";
import { rateWarning } from "@/features/sales/quotation/quotation.validate";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import {
  chargeFieldSet,
  chargeMasterApplied,
  chargeRemoved,
  customerFieldSet,
  headerFieldSet,
  lineAdded,
  lineDuplicated,
  lineFieldSet,
  lineInserted,
  lineRemoved,
  lineSizesApplied,
  peopleFieldSet,
  posSet,
  tendersReplaced,
  termsFieldSet,
} from "@/store/slices/saleBillSlice";
import type { CreditFieldConfig } from "@/features/sales/sale-order/components/order-header-blocks";
import {
  CHARGE_GRID_UI_TABLE_KEY,
  SALE_BILL_CREDIT_FIELD_KEYS,
  SALE_BILL_HOLD_DOC_TYPE,
  SALE_BILL_HOLD_KIND,
  SALE_BILL_ITEM_COLUMN_WIDTH_UNIT,
  SALE_BILL_ITEM_GRID_UI_TABLE_KEY,
} from "../salebill.constants";
import { lastFilledLineBefore } from "../salebill.state";
import { isBillHold } from "../salebill.hold";
import type { BillAutosave } from "../salebill.hold";
import { totalAdjusted } from "../salebill.validate";
import type {
  BillAdjustmentRow,
  SaleBillDocKey,
  SaleBillDraftLine,
  SavedBillRef,
} from "../salebill.types";
import { useSaleBillDraft, type SaveOutcome } from "../use-sale-bill-draft";
import { AdjustPanel } from "./adjust-panel";
import { AskText } from "./ask-text";
import { BillQuickStrip } from "./bill-quick-strip";
import { useBillVisibleSettings } from "./bill-visible-settings";
import { BillListModal } from "./bill-list-modal";
import {
  BillCreditPanel,
  BillCustomerBlock,
  BillFactsLine,
  BillInfoBlock,
  BillPeopleBlock,
} from "./bill-header-blocks";
import { SaleBillToolbar } from "./sale-bill-toolbar";
import { AmendRemarkPrompt, CancelBillPrompt, CancelLinePrompt } from "./cancel-prompts";
import { ValidationPopup, WarningStrip } from "./warning-strip";
import { verbState } from "../salebill.verbs";
import styles from "../page.module.scss";
import { useUiTableId } from "@/lib/ui-tables";

const STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: "statusDraft",
  POSTED: "statusAccepted",
  CANCELLED: "statusCancelled",
};

/** §21: GENERATED green · FAILED/REJECTED red · PENDING amber · the rest grey. */
const GST_BADGE_CLASS: Record<string, string> = {
  GENERATED: styles.postingBadgeGenerated,
  FAILED: styles.postingBadgeFailed,
  REJECTED: styles.postingBadgeFailed,
  PENDING: styles.postingBadgePending,
};

/**
 * Line fields whose cells hold TEXT, so an edit must not go through
 * `parseCell` — a batch number with a leading zero is not the number 7.
 *
 * `serialNo` is deliberately absent: grid 22's SerialNo column is display-only
 * until there is a batch picker to fill it (§18.2), so no edit can arrive for
 * it. It belongs here the day that changes.
 */
const TEXT_LINE_FIELDS = new Set<keyof SaleBillDraftLine>([
  "barcode",
  "batchNo",
  "batchDate",
  "expiryDate",
  "remarks",
  "itemSize",
]);

/**
 * Every action that would throw unsaved work away has to ask first. Named rather
 * than booleaned so the confirmation knows what it is confirming.
 */
type PendingGuard = "clear" | "back" | "list" | "importQuotation" | "importOrder" | "held" | null;

export type SaleBillEntryViewProps = {
  /** Opened on a document, or `undefined` for a fresh bill. */
  initialDocument?: SaleBillDocKey;
  initialMode?: "browse" | "entry";
  onClose: () => void;
};

const NEW_DOCUMENT = " new";

export function SaleBillEntryView({
  initialDocument,
  initialMode = "browse",
  onClose,
}: SaleBillEntryViewProps) {
  const api = useSaleBillDraft();
  const {
    draft,
    dispatch,
    pricing,
    busy,
    canEditPrice,
    itemColumns,
    chargeColumns,
    priceLevelOptions,
    chargeMasters,
    unitOptionsFor,
    customerChangeCost,
  } = api;

  // Menu permissions for this screen (Settings → User Administration), folded
  // into the flags the whole view reads, so the grids, the header blocks, the
  // toolbar and the F-key shortcuts inherit the limit instead of each
  // re-deriving it.
  /**
   * The header panel's own right-click, and the config behind it (menu 12).
   *
   * Scoped to the header: the two grids already own right-click for their
   * "Admin settings", which configures `fixed.ui_table_columns` instead. The two
   * never compete for the same click because they are mounted on different
   * elements.
   */
  const visibleFields = useBillVisibleSettings();

  /**
   * Alt+C on the Existing Customer field adds a customer, Alt+A amends the one
   * on the bill — the counter books somebody who is not on file without
   * abandoning a half-keyed bill. The shortcuts are the CUSTOMER master's to
   * grant: this only offers it behind the customer dropdown (see
   * `useCustomerDropdownMaster`).
   */
  useCustomerDropdownMaster();

  /**
   * The credit column's five rows, bridged from their labels to this screen's
   * field keys so the one Visible Settings dialog governs them too.
   */
  const creditFields = useMemo<CreditFieldConfig>(
    () => ({
      isVisible: (label) => visibleFields.isVisible(SALE_BILL_CREDIT_FIELD_KEYS[label]),
      labelFor: (label) => visibleFields.labelFor(SALE_BILL_CREDIT_FIELD_KEYS[label]),
    }),
    [visibleFields],
  );

  const { permissions: menuPermissions } = usePagePermissions();
  const canSaveDoc = draft.docId ? menuPermissions.canEdit : menuPermissions.canCreate;
  const editable = draft.mode === "entry" && !draft.isDeleted && canSaveDoc;
  /** Import lock (§7.7): a bill with a source document, unless the setting allows the change. */
  const customerLocked = Boolean(draft.source) && !api.settings.allowCustomerChangeOnImport;

  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [itemPickerRow, setItemPickerRow] = useState<string | null>(null);
  /** The item row the Size Entry dialog is open on; `null` while it is closed. */
  const [sizeEntryRow, setSizeEntryRow] = useState<string | null>(null);
  /**
   * The row a pick has just been made on — see the focus effect below. A ref,
   * not state: the render the effect needs is the one the pick itself causes.
   */
  const pickedItemRow = useRef<string | null>(null);
  const [chargePickerRow, setChargePickerRow] = useState<string | null>(null);
  const pickedChargeRow = useRef<string | null>(null);
  const [priceLevelPrompt, setPriceLevelPrompt] = useState<number | null>(null);
  const [pendingGuard, setPendingGuard] = useState<PendingGuard>(null);
  const [invalidCells, setInvalidCells] = useState<Record<string, true>>({});
  const [listOpen, setListOpen] = useState(false);
  const [importQuotationOpen, setImportQuotationOpen] = useState(false);
  const [importOrderOpen, setImportOrderOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [tenderOpen, setTenderOpen] = useState(false);
  /**
   * Save opened the settle dialog and is waiting on it: the bill is written the
   * moment the operator OKs the tenders, and not before. Cleared when they back
   * out, so a settle they cancelled never saves behind them.
   *
   * The ref is the same fact held where a render cannot lose it: the state says
   * what the dialog's button should READ, the ref is the one-shot the deferred
   * save consumes (and must clear, or the next render would save again).
   */
  const [settleThenSave, setSettleThenSave] = useState(false);
  const settleThenSaveRef = useRef(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  /** Cancel bill (§17.9): the reason prompt. */
  const [cancelBillOpen, setCancelBillOpen] = useState(false);
  /** Save while amending (§17.8): "what did you change?", and whether to print after. */
  const [amendPrompt, setAmendPrompt] = useState<{ print: boolean } | null>(null);
  /**
   * The gate asked a question (`confirm-needed`) and this is what to run again
   * with the answer yes — a save, a post or an amend, whichever asked.
   */
  const confirmRetry = useRef<(() => void) | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  /**
   * The bill a save has just written, while the print dialog stands over it.
   * Held as the SAVED reference rather than read off the draft: the draft is
   * what the operator may already be clearing, and the paper belongs to the
   * document that was posted.
   */
  const [printTarget, setPrintTarget] = useState<SavedBillRef | null>(null);
  /** A gate that asked a question (§14) — the message and the yes that answers it. */
  const [saveQuestion, setSaveQuestion] = useState<string | null>(null);
  /**
   * The row whose "Cancel on Order" prompt is open, and the reason being keyed
   * into it (§8). `soi_cancel_reason` is mandatory, so there is nowhere to hide
   * a blank one.
   */
  const [cancelLineKey, setCancelLineKey] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  /** The crash-recovery offer, once the snapshot has been found. */
  const [recovery, setRecovery] = useState<BillAutosave | null>(null);
  /**
   * The customer the operator picked while the bill already carried settled
   * money — held, not applied, until they confirm losing it (§4.3).
   */
  const [customerToConfirm, setCustomerToConfirm] = useState<string | null>(null);
  /** Alt+D — Disc % All (§6.2). */
  const [discountPromptOpen, setDiscountPromptOpen] = useState(false);
  /** ± Price (§6.2). */
  const [pricePromptOpen, setPricePromptOpen] = useState(false);
  /** A re-pick of an item already on the bill, waiting on "add it again?" (§8.3). */
  const [duplicatePick, setDuplicatePick] = useState<{ rowKey: string; pick: ItemPick; row: number } | null>(null);

  const itemUiTableId = useUiTableId(SALE_BILL_ITEM_GRID_UI_TABLE_KEY);
  const chargeUiTableId = useUiTableId(CHARGE_GRID_UI_TABLE_KEY);
  const itemResize = useColumnResize(itemColumns, itemUiTableId);
  const chargeResize = useColumnResize(chargeColumns, chargeUiTableId);
  const itemSettings = useGridSettings({
    label: "Items",
    uiTableId: itemUiTableId,
    columns: itemResize.columns,
    pendingWidthCount: itemResize.pendingCount,
    savingWidths: itemResize.saving,
    onSaveWidths: itemResize.saveWidths,
  });
  const chargeSettings = useGridSettings({
    label: "Additional charges",
    uiTableId: chargeUiTableId,
    columns: chargeResize.columns,
    pendingWidthCount: chargeResize.pendingCount,
    savingWidths: chargeResize.saving,
    onSaveWidths: chargeResize.saveWidths,
  });

  const { data: tenderMasters = [], error: tenderMasterError } = useGetTenderMastersQuery();

  // Load-on-mount. The draft is global (a slice, not a `useReducer`), so it
  // outlives the form and starting a new document is an EXPLICIT act rather than
  // a consequence of mounting.
  const openedDocument = useRef<string | null>(null);
  useEffect(() => {
    const opening = initialDocument?.sbId ?? NEW_DOCUMENT;
    if (openedDocument.current === opening) {
      return;
    }
    openedDocument.current = opening;
    api.clear();
    if (!initialDocument) {
      // A fresh bill: offer back whatever this device left behind when it died.
      void api.findRecovery().then((record) => {
        if (record) {
          setRecovery(record);
        }
      });
      return;
    }
    void api.loadDocument(initialDocument).then((loaded) => {
      if (loaded && !loaded.isDeleted && initialMode === "entry") {
        // Edit on a POSTED bill is Amend (§17.8); on a draft it just opens.
        if (loaded.status === "POSTED") {
          void api.beginAmend();
        } else {
          api.beginEdit();
        }
      }
    });
  }, [api, initialDocument, initialMode]);

  /**
   * The grids read a merged `{line, priced}` view by flat key, so the readonly
   * source echo is flattened into the priced rows here — display only; no write
   * path exists for those two columns.
   */
  const pricedView = useMemo(
    () =>
      pricing.lines.map((priced, index) => {
        const source = (draft.lines[index] as SaleBillDraftLine | undefined)?.source;
        return (source ? { ...priced, ...source } : priced) as PricedLine;
      }),
    [pricing.lines, draft.lines],
  );

  const setLineField = useCallback(
    (rowKey: string, field: keyof DraftLine, raw: string) => {
      const line = draft.lines.find((row) => row.key === rowKey);
      if (!line) {
        return;
      }
      if (TEXT_LINE_FIELDS.has(field as keyof SaleBillDraftLine)) {
        dispatch(lineFieldSet({ key: rowKey, field, value: toNullableText(raw) }));
        return;
      }
      const value = parseCell(raw);
      if (field === "rate") {
        // Below the minimum selling price (§8.6): warn and CLEAR the rate.
        // Above MRP is only a warning here; the save check refuses it.
        if (line.minPrice > 0 && !line.isFree && value > 0 && value < line.minPrice) {
          toast.warn("Selling rate < minimum selling price.");
          dispatch(lineFieldSet({ key: rowKey, field, value: 0 }));
          return;
        }
        const warning = rateWarning(value, line.minPrice, line.mrp);
        if (warning) {
          toast.warn(warning);
        }
      }
      if (field === "billQty" || field === "caseQty") {
        // The order cap (§8.6): warn and PUT THE QTY BACK to the pending
        // figure. Lines without an order qty are not capped.
        const nextBill = field === "billQty" ? value : line.billQty;
        if (
          line.orderQtyLocked &&
          line.orderQty > 0 &&
          nextBill > line.orderQty &&
          !api.settings.allowBillOverOrderQty
        ) {
          toast.warn(
            `Only ${line.orderQty} is pending on this order line — billing more than was ordered is not allowed.`,
          );
          dispatch(lineFieldSet({ key: rowKey, field: "billQty", value: line.orderQty }));
          return;
        }
        // Negative stock (§8.6): warn, and the value is NOT reverted. The
        // operator may knowingly accept it; the save gate asks again.
        if (
          !line.allowNegative &&
          !line.isService &&
          line.stockGateResolved &&
          line.stockQty !== null &&
          nextBill > line.stockQty
        ) {
          toast.warn(`Only ${line.stockQty} in stock — this item does not allow negative stock.`);
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

  // ------------------------------------------------------------------ pickers

  /**
   * A picked item (§8.3). A DUPLICATE — another non-free line already carries
   * the item — is either bumped by 1 on that line and focused, with the picker
   * row left empty (`!sales.allow_duplicate_item`), or confirmed: "This item is
   * already on row N. Add it again?".
   */
  const onPickItem = useCallback(
    (pick: ItemPick) => {
      const rowKey = itemPickerRow;
      setItemPickerRow(null);
      if (!rowKey) {
        return;
      }
      const existing = draft.lines.find(
        (line) => line.key !== rowKey && line.itemId === pick.itemId && !line.isFree,
      );
      if (existing) {
        const row = draft.lines.filter((line) => line.itemId).findIndex((line) => line.key === existing.key) + 1;
        if (!api.settings.allowDuplicateItem) {
          dispatch(lineFieldSet({ key: existing.key, field: "billQty", value: existing.billQty + 1 }));
          toast.info(`${pick.itemName} is already on row ${row} — its quantity was bumped by 1.`);
          window.requestAnimationFrame(() => focusCell(ITEM_GRID_NAME, existing.key, "billQty"));
          return;
        }
        setDuplicatePick({ rowKey, pick, row });
        return;
      }
      pickedItemRow.current = rowKey;
      void api.pickItem(rowKey, pick.itemId, pick.itemUnitId);
    },
    [api, dispatch, draft.lines, itemPickerRow],
  );
  const onDuplicateConfirmed = useCallback(() => {
    const pending = duplicatePick;
    setDuplicatePick(null);
    if (!pending) {
      return;
    }
    pickedItemRow.current = pending.rowKey;
    void api.pickItem(pending.rowKey, pending.pick.itemId, pending.pick.itemUnitId);
  }, [api, duplicatePick]);

  /**
   * Picking an item hands focus back to the grid, on the next stop of the
   * layout's Enter chain. Grid 22 flags three focus columns — Description, Bill
   * Qty and Rate — so the walk from Description lands on Bill Qty.
   *
   * An effect, not a line after the `await`: the cells past Description are
   * disabled until the row has an item, so the walk has to run on the render
   * that priced the line.
   */
  /**
   * Whether the item layout shows a Size column — what decides if picking an
   * item opens the Size Entry dialog. Read off the resolved columns rather than
   * assumed: table 22 configures no Size column at all, so on this screen it is
   * the INJECTED one (`SALE_BILL_INJECTED_ITEM_COLUMNS`) that puts it there, and
   * a deployment that seeds its own under either name gets that one instead.
   */
  const sizeColumnVisible = useMemo(
    () => itemResize.columns.some((column) => column.visible && column.write === "itemSize"),
    [itemResize.columns],
  );

  useEffect(() => {
    const rowKey = pickedItemRow.current;
    if (!rowKey) {
      return;
    }
    const line = draft.lines.find((row) => row.key === rowKey);
    if (!line?.itemId) {
      return;
    }
    pickedItemRow.current = null;
    const anchor = itemLookupFieldKey(itemResize.columns);
    if (anchor) {
      focusNextStopFrom(ITEM_GRID_NAME, rowKey, anchor);
    }
    // Keying the sizes is what comes next on a size-priced line, so the dialog
    // opens itself rather than waiting for an F3 the operator has to know about
    // — the same hand-off the quotation screen makes. Focus is moved first
    // regardless, so cancelling leaves the cursor in the grid.
    if (sizeColumnVisible) {
      setSizeEntryRow(rowKey);
    }
  }, [draft.lines, itemResize.columns, sizeColumnVisible]);

  useEffect(() => {
    const rowKey = pickedChargeRow.current;
    if (!rowKey) {
      return;
    }
    const row = draft.charges.find((candidate) => candidate.key === rowKey);
    if (!row?.chgId) {
      return;
    }
    pickedChargeRow.current = null;
    const anchor = chargeLookupFieldKey(chargeResize.columns);
    if (anchor) {
      focusNextStopFrom(CHARGE_GRID_NAME, rowKey, anchor);
    }
  }, [draft.charges, chargeResize.columns]);

  const onPickCharge = useCallback(
    (master: ChargeMasterRow) => {
      const rowKey = chargePickerRow;
      if (!rowKey) {
        setChargePickerRow(null);
        return;
      }
      // One charge, one row — the reducer refuses a duplicate outright, so
      // without this the dialog would close on a pick that quietly did nothing.
      const duplicate = draft.charges.some(
        (row) => row.key !== rowKey && row.chgId === master.chgId,
      );
      if (duplicate) {
        toast.error(`${master.chgName} is already on this bill.`);
        return;
      }
      setChargePickerRow(null);
      pickedChargeRow.current = rowKey;
      dispatch(chargeMasterApplied({ key: rowKey, master }));
    },
    [draft.charges, chargePickerRow, dispatch],
  );

  /**
   * Alt+R — copy a row. Where the copy LANDS decides where the cursor goes, and
   * the two cases go opposite ways (see `lineDuplicated` for the rule itself).
   *
   * On a filled row the copy is inserted beneath, so focus steps down into it.
   * On the blank row the copy fills the row the operator is already standing
   * in, so focus stays — stepping down there would leave them on the fresh
   * blank row that the trailing-row invariant has just opened underneath.
   *
   * Guarded here as well as in the reducer, because focus is moved on the way
   * out: a press that copied nothing must not take the operator somewhere they
   * did not ask to go.
   */
  const onDuplicateLine = useCallback(
    (rowKey: string, fieldKey: string | null) => {
      const index = draft.lines.findIndex((row) => row.key === rowKey);
      if (index < 0) {
        return;
      }
      if (draft.lines[index].itemId) {
        dispatch(lineDuplicated(rowKey));
        focusNextRowAfterRender(ITEM_GRID_NAME, rowKey, fieldKey);
        return;
      }
      if (!lastFilledLineBefore(draft.lines, index)) {
        return;
      }
      dispatch(lineDuplicated(rowKey));
      // Refocusing waits for the PAINTED row. The grid blurred this cell on the
      // way in, and a cell seeds its edit buffer from whatever is on screen when
      // it regains focus — so focusing synchronously would seed the old, empty
      // text straight back over the values just copied in.
      const landing = fieldKey ?? itemLookupFieldKey(itemResize.columns);
      if (landing) {
        window.requestAnimationFrame(() => {
          focusCell(ITEM_GRID_NAME, rowKey, landing);
        });
      }
    },
    [dispatch, draft.lines, itemResize.columns],
  );

  /**
   * Removing a line.
   *
   * A line that came from a sales order is a THREE-way question, not a delete
   * (§8) — Cancel on Order / Remove from Bill / Cancel — and its first branch
   * must drop the row only in the server's success callback. That prompt arrives
   * with the imports in phase 6; until then no line can carry a `srcDocId`, so
   * this path is the whole of it. The guard stays here so the day imports land,
   * a plain delete cannot slip past.
   */
  const onRemoveLine = useCallback(
    (rowKey: string) => {
      const line = draft.lines.find((row) => row.key === rowKey);
      // A line that came from a sales order is not one action but THREE, and the
      // operator has to choose (§8). Anything else silently decides on their
      // behalf whether the order line stays open.
      // Keyed on the LINE's trail (§8.4): a quotation line carries a source
      // line id too, which is why the type is checked, and per line.
      if (line?.srcItemId && line.srcDocType === "SALES_ORDER") {
        setCancelReason("");
        setCancelLineKey(rowKey);
        return;
      }
      dispatch(lineRemoved(rowKey));
      if (activeRowKey === rowKey) {
        setActiveRowKey(null);
      }
    },
    [activeRowKey, dispatch, draft.lines],
  );

  /** "Remove from Bill" — off this bill, still pending on the order. */
  const removeFromBillOnly = useCallback(() => {
    const rowKey = cancelLineKey;
    setCancelLineKey(null);
    if (!rowKey) {
      return;
    }
    dispatch(lineRemoved(rowKey));
    if (activeRowKey === rowKey) {
      setActiveRowKey(null);
    }
  }, [activeRowKey, cancelLineKey, dispatch]);

  /**
   * "Cancel on Order" — the row goes only if the SERVER agrees. A refused
   * cancellation that had already removed the row would leave the order and the
   * bill disagreeing about what is still open, which is why the drop happens in
   * the hook's success path and not here.
   */
  const cancelOnOrder = useCallback(async () => {
    const rowKey = cancelLineKey;
    if (!rowKey) {
      return;
    }
    const done = await api.cancelLineOnOrder(rowKey, cancelReason);
    if (done) {
      setCancelLineKey(null);
      if (activeRowKey === rowKey) {
        setActiveRowKey(null);
      }
    }
  }, [activeRowKey, api, cancelLineKey, cancelReason]);

  // ------------------------------------------------------------------ actions

  /**
   * The customer picker's click. Asks BEFORE the change when it costs something
   * — which is the whole point of §4.3: an operator who is told afterwards has
   * already lost the settlement.
   */
  const onRequestCustomer = useCallback(
    (customerId: string) => {
      if (!customerId) {
        return;
      }
      if (customerChangeCost.blocked) {
        setCustomerToConfirm(customerId);
        return;
      }
      void api.pickCustomer(customerId);
    },
    [api, customerChangeCost.blocked],
  );

  const onCustomerChangeConfirmed = useCallback(() => {
    const customerId = customerToConfirm;
    setCustomerToConfirm(null);
    if (!customerId) {
      return;
    }
    api.releaseCustomerBoundState();
    void api.pickCustomer(customerId);
  }, [api, customerToConfirm]);

  // ------------------------------------------------------------------- save

  /**
   * What every lifecycle verb comes back with, handled once (§17): a violation
   * lights its cell, a question is put to the operator with the verb remembered
   * so a yes repeats it, and a written bill prints when the verb asked to.
   * `refused` needs nothing here — the strip and the popup already say why.
   */
  const handleOutcome = useCallback(
    (outcome: SaveOutcome, retry: () => void, print: boolean) => {
      if (outcome.status === "invalid" || outcome.status === "confirm-needed") {
        const violation = outcome.violation;
        setInvalidCells(
          violation.lineKey ? { [`${violation.lineKey}:${violation.field}`]: true } : {},
        );
        if (outcome.status === "confirm-needed") {
          // A question, not a refusal: the stock position could not be
          // established, or the customer is over their limit. The operator may
          // know better than the screen does.
          confirmRetry.current = retry;
          setSaveQuestion(violation.message);
          return;
        }
        toast.error(violation.message);
        return;
      }
      setInvalidCells({});
      if (outcome.status === "remark-needed") {
        setAmendPrompt({ print });
        return;
      }
      if (outcome.status === "saved" || outcome.status === "posted") {
        // Crash recovery has nothing left to recover.
        setRecovery(null);
        // The counter prints the bill it has just written, without being sent
        // to the list to find it again — the same dialog the F8 picker opens,
        // on the reference the server just allocated. Only when asked to
        // (F6, Ctrl+Enter), and silent when the operator may not print: the
        // bill IS written, and a permission toast on top of the success would
        // read as a failure.
        if (print && menuPermissions.canPrint) {
          setPrintTarget(outcome.ref);
        }
      }
    },
    [menuPermissions.canPrint],
  );

  /** Save (F5 on the plain route, the tender dialog's OK): §17.4. */
  const runSave = useCallback(
    async (options: { confirmed?: boolean; print?: boolean } = {}) => {
      if (!canSaveDoc) {
        toast.error("You do not have permission to save bills on this screen.");
        return;
      }
      const print = options.print === true;
      const outcome = await api.save({ confirmed: options.confirmed, print });
      handleOutcome(outcome, () => void runSave({ confirmed: true, print }), print);
    },
    [api, canSaveDoc, handleOutcome],
  );

  /** Post (F6, Ctrl+Enter, Ctrl+Shift+Enter): create → validate → confirm → post (§17.5). */
  const runPost = useCallback(
    async (options: { confirmed?: boolean; print: boolean }) => {
      if (!canSaveDoc) {
        toast.error("You do not have permission to save bills on this screen.");
        return;
      }
      const outcome = await api.post({ confirmed: options.confirmed, print: options.print });
      handleOutcome(outcome, () => void runPost({ ...options, confirmed: true }), options.print);
    },
    [api, canSaveDoc, handleOutcome],
  );

  /** Save while amending, once the remark is in (§17.8). */
  const runAmend = useCallback(
    async (options: { editRemark: string; confirmed?: boolean; print: boolean }) => {
      const outcome = await api.amend(options);
      if (outcome.status !== "remark-needed") {
        setAmendPrompt(null);
      }
      handleOutcome(outcome, () => void runAmend({ ...options, confirmed: true }), options.print);
    },
    [api, handleOutcome],
  );

  const onSaveQuestionConfirmed = useCallback(() => {
    setSaveQuestion(null);
    const retry = confirmRetry.current;
    confirmRetry.current = null;
    retry?.();
  }, []);

  // --------------------------------------------------------------- settle

  const adjusted = totalAdjusted(draft);

  /**
   * F5 on the tender route (§15.1): read-only → refused; the client checks with
   * `openingTender`; then `/validate` — OK opens with the notes painted, a
   * refusal keeps it shut (counting money for a bill that cannot post is
   * wasted), the server away opens anyway (a sale must not stop).
   */
  const openTender = useCallback(async () => {
    if (!editable) {
      toast.warn("This bill is read-only.");
      return false;
    }
    const validation = await api.validateForTender();
    if (validation.status === "refused") {
      return false;
    }
    // The credits are re-read on the way in: another counter may have spent one
    // since the panel was last opened, and the ceiling this list reports is what
    // the operator adjusts against.
    setCreditsLoading(true);
    void api.refreshOpenCredits().finally(() => setCreditsLoading(false));
    setTenderOpen(true);
    return true;
  }, [api, editable]);

  /**
   * What the Save button and F5 actually do: take the money first. The legacy
   * screen never writes a bill the operator has not settled, so Save opens the
   * settle dialog and the save runs off its OK — see the dialog's `onApply`.
   *
   * Three routes skip the dialog, each because it could not help:
   *
   *  - **The operator may not save at all**, or the bill is not editable. The
   *    refusal is the point, and `runSave` is the one place that words it.
   *  - **The bill would be refused for something tenders cannot fix** — no
   *    lines, a zero quantity, a missing godown. Far better to say so before
   *    money is keyed than after. A gate that asks a QUESTION (`confirm`) is
   *    not a refusal and does not stop the settle: it is answered on the way
   *    out, by the dialog `runSave` puts up.
   *  - **A CREDIT bill is settlement-exempt** (§6 of the save gate): the party
   *    debit is what stays open. The settle dialog refuses a short settlement,
   *    so routing a credit bill through it would make one unsavable.
   */
  /**
   * The tender route: settle, and the save runs off the dialog's OK. Every
   * other route saves directly (§15.1, §17.4).
   */
  const openTenderThenSave = useCallback(
    async (print: boolean) => {
      setSettleThenSave(true);
      settleThenSaveRef.current = true;
      settlePrintRef.current = print;
      const opened = await openTender();
      if (!opened) {
        setSettleThenSave(false);
        settleThenSaveRef.current = false;
      }
    },
    [openTender],
  );
  const requestSave = useCallback(() => {
    if (!canSaveDoc || !editable) {
      void runSave();
      return;
    }
    if (draft.amending) {
      // Amending never re-opens the tender from Save: the remark comes first.
      void runSave();
      return;
    }
    if (api.tenderRoute) {
      void openTenderThenSave(false);
      return;
    }
    void runSave();
  }, [api.tenderRoute, canSaveDoc, draft.amending, editable, openTenderThenSave, runSave]);

  /**
   * The settle dialog's OK does not save directly: `api.save` reads the draft of
   * the render it was built in, so calling it in the same tick as
   * `tendersReplaced` would post the bill with the tenders the operator just
   * keyed missing from it. Arming a flag and saving from an effect puts the save
   * one render later — on the draft that HAS the money.
   */
  /** Whether the settle that Save opened was asked to print after (F6). */
  const settlePrintRef = useRef(false);
  useEffect(() => {
    if (!settleThenSaveRef.current || tenderOpen) {
      return;
    }
    settleThenSaveRef.current = false;
    void runSave({ print: settlePrintRef.current });
  }, [runSave, tenderOpen]);

  /** The verb bar and the keymap read ONE state (§17.1); the route is `sales.tender_type` (§15.1). */
  const tenderRoute = api.tenderRoute;
  const verbs = useMemo(
    () =>
      verbState({
        status: draft.status,
        isNew: draft.isNewEntry,
        editable,
        amending: draft.amending,
        autoPost: api.autoPost,
        tenderRoute,
        rights: draft.rights,
        locks: draft.locks,
        canEditScreen: !draft.isDeleted && menuPermissions.canEdit,
        canDeleteScreen: menuPermissions.canDelete,
      }),
    [
      api.autoPost,
      draft.amending,
      draft.isDeleted,
      draft.isNewEntry,
      draft.locks,
      draft.rights,
      draft.status,
      editable,
      menuPermissions.canDelete,
      menuPermissions.canEdit,
      tenderRoute,
    ],
  );

  /** F6: Save & Print on the plain route, Post & Print otherwise; the tender on its route. */
  const onSaveAndPrint = useCallback(() => {
    if (!verbs.saveAndPrint.visible && !verbs.tender.visible) {
      return;
    }
    if (verbs.tender.visible) {
      void openTenderThenSave(true);
      return;
    }
    if (!verbs.saveAndPrint.enabled) {
      if (verbs.saveAndPrint.tooltip) {
        toast.warn(verbs.saveAndPrint.tooltip);
      }
      return;
    }
    if (verbs.saveRoute === "amend" || verbs.saveRoute === "autoPost") {
      void runSave({ print: true });
      return;
    }
    void runPost({ print: true });
  }, [openTenderThenSave, runPost, runSave, verbs]);

  /** Ctrl+Enter / Ctrl+Shift+Enter: post, with or without the print (§6.3). */
  const onPostFromKeyboard = useCallback(
    (print: boolean) => {
      if (draft.amending) {
        void runSave({ print });
        return;
      }
      if (!editable) {
        return;
      }
      void runPost({ print });
    },
    [draft.amending, editable, runPost, runSave],
  );

  /** Edit (F2): Amend on a posted bill, a confirm on a read-only draft (§17.9). */
  const onEdit = useCallback(() => {
    if (!verbs.edit.visible) {
      return;
    }
    if (!verbs.edit.enabled) {
      if (verbs.edit.tooltip) {
        toast.warn(verbs.edit.tooltip);
      }
      return;
    }
    if (draft.status === "POSTED") {
      void api.beginAmend();
      return;
    }
    setEditConfirmOpen(true);
  }, [api, draft.status, verbs.edit]);

  const onCancelBill = useCallback(() => {
    if (!verbs.cancelBill.visible) {
      return;
    }
    if (!verbs.cancelBill.enabled) {
      if (verbs.cancelBill.tooltip) {
        toast.warn(verbs.cancelBill.tooltip);
      }
      return;
    }
    setCancelBillOpen(true);
  }, [verbs.cancelBill]);

  const onDelete = useCallback(() => {
    if (!verbs.delete.visible) {
      return;
    }
    if (!verbs.delete.enabled) {
      if (verbs.delete.tooltip) {
        toast.warn(verbs.delete.tooltip);
      }
      return;
    }
    void api.deleteDraft();
  }, [api, verbs.delete]);

  /** F4 (§14.3): independent of the tender route and the term. */
  const openAdjust = useCallback(() => {
    if (!editable) {
      toast.warn("This bill is read-only.");
      return;
    }
    if (!draft.customer.custId) {
      toast.warn("Pick the customer first — credits belong to a party.");
      document.getElementById("sale-bill-customer")?.focus();
      return;
    }
    if (pricing.totals.bill <= 0) {
      toast.warn("There is nothing on this bill to adjust against yet.");
      return;
    }
    setCreditsLoading(true);
    void api.refreshOpenCredits().finally(() => setCreditsLoading(false));
    setAdjustOpen(true);
  }, [api, draft.customer.custId, editable, pricing.totals.bill]);
  /** Alt+O (§6.2): the current line's cost. */
  const showLineCost = useCallback(() => {
    const text = api.lineCostText(activeRowKey);
    if (!text) {
      toast.info("Stand on a line to see its cost.");
      return;
    }
    toast.info(text);
  }, [activeRowKey, api]);

  const applyAdjustments = useCallback(
    (rows: BillAdjustmentRow[], from: "bill" | "tender") => {
      const ok = api.applyAdjustments(rows, from);
      if (ok && from === "bill") {
        setAdjustOpen(false);
      }
      return ok;
    },
    [api],
  );

  // ------------------------------------------------------------- documents

  const onPickDocument = useCallback(
    (key: SaleBillDocKey, mode: "browse" | "entry") => {
      setListOpen(false);
      void api.loadDocument(key).then((loaded) => {
        if (loaded && !loaded.isDeleted && mode === "entry") {
          if (loaded.status === "POSTED") {
            void api.beginAmend();
          } else {
            api.beginEdit();
          }
        }
      });
    },
    [api],
  );

  /** Every route off the current document asks first when there is work on it. */
  const runGuarded = useCallback(
    (action: Exclude<PendingGuard, null>) => {
      switch (action) {
        case "clear":
          api.clear();
          break;
        case "back":
          onClose();
          break;
        case "list":
          setListOpen(true);
          break;
        case "importQuotation":
          setImportQuotationOpen(true);
          break;
        case "importOrder":
          setImportOrderOpen(true);
          break;
        case "held":
          setHeldOpen(true);
          break;
      }
    },
    [api, onClose],
  );

  /**
   * Enter walks the header, the way the Qt screen behaves: key a field, press
   * Enter, land on the next one — the operator never reaches for the mouse
   * between Customer Name and Price Level. Shift+Enter walks back.
   *
   * Three things it must NOT do, each of which would be a bug the operator feels
   * before they can name it:
   *
   *  - **Swallow a combobox's own Enter.** The Customer, POS and people pickers
   *    commit the highlighted row on Enter and `preventDefault()` when they do.
   *    Checking `defaultPrevented` is what lets one keypress pick a customer and
   *    the NEXT one move on, rather than picking and jumping in a single press.
   *  - **Steal Enter from a textarea**, where it is a newline. None is in the
   *    header today, but the Terms block is one and blocks move.
   *  - **Trap the operator at the end.** The last header field hands off to the
   *    first line's Description, because that is the next thing keyed on a bill.
   *    Shift+Enter does not: walking backwards out of the header would land in a
   *    grid the operator was trying to leave.
   *
   * The walk reads the DOM rather than a list of ids, so a field Visible
   * Settings has hidden is simply not in it — there is no second list to keep in
   * step.
   */
  const onHeaderKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" || event.defaultPrevented) {
        return;
      }
      if (event.target instanceof HTMLTextAreaElement) {
        return;
      }
      // Only a field that advertises itself is part of the walk. Without this a
      // keypress on anything else inside the header — a button, the panel
      // itself — would be swallowed here and, worse, read as "the end of the
      // header" and jump into the grid.
      const target = event.target as HTMLElement | null;
      if (!target?.hasAttribute?.(HEADER_FOCUS_ATTR)) {
        return;
      }
      const backwards = event.shiftKey;
      if (moveHeaderFocus(event.currentTarget, target, backwards ? -1 : 1)) {
        event.preventDefault();
        return;
      }
      // Backwards out of the first field stays put: walking back OUT of the
      // header would land in a grid the operator was trying to leave.
      if (backwards) {
        return;
      }
      const anchor = itemLookupFieldKey(itemResize.columns);
      if (anchor && focusFirstCell(ITEM_GRID_NAME, anchor)) {
        event.preventDefault();
      }
    },
    [itemResize.columns],
  );

  const guardedRun = useCallback(
    (action: Exclude<PendingGuard, null>) => {
      if (draft.isDirty) {
        setPendingGuard(action);
        return;
      }
      runGuarded(action);
    },
    [draft.isDirty, runGuarded],
  );

  const onGuardConfirm = useCallback(() => {
    const action = pendingGuard;
    setPendingGuard(null);
    if (action) {
      runGuarded(action);
    }
  }, [pendingGuard, runGuarded]);

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

  const onPriceLevelShortcut = useCallback((priceLevel: number) => {
    setPriceLevelPrompt(priceLevel);
  }, []);

  /**
   * Close the dialog and put the cursor back in the Size cell it was opened
   * from. Without it the dialog's own autofocus is abandoned and focus falls to
   * `<body>`: cancelling would leave nowhere to key a size by hand, and F3 —
   * which the grid reads off the focused cell — could not re-open it at all.
   */
  const closeSizeEntry = useCallback(() => {
    const rowKey = sizeEntryRow;
    setSizeEntryRow(null);
    if (!rowKey) {
      return;
    }
    window.requestAnimationFrame(() => focusCell(ITEM_GRID_NAME, rowKey, "itemSize"));
  }, [sizeEntryRow]);

  // --------------------------------------------------------------- shortcuts

  const modalOpen =
    itemPickerRow !== null ||
    sizeEntryRow !== null ||
    chargePickerRow !== null ||
    priceLevelPrompt !== null ||
    customerToConfirm !== null ||
    discountPromptOpen ||
    pricePromptOpen ||
    duplicatePick !== null ||
    cancelLineKey !== null ||
    saveQuestion !== null ||
    recovery !== null ||
    listOpen ||
    importQuotationOpen ||
    importOrderOpen ||
    heldOpen ||
    tenderOpen ||
    printTarget !== null ||
    adjustOpen ||
    editConfirmOpen ||
    cancelBillOpen ||
    amendPrompt !== null ||
    api.notesPopupOpen ||
    api.proceedAsk !== null ||
    visibleFields.isOpen ||
    pendingGuard !== null;

  /**
   * The legacy screen's bindings, and only the ones that DO something:
   *
   *   F5 save · F4 adjust · F6 settle · F8 bill list · F7 clear ·
   *   F9 hold · F10 held carts · Ctrl+F3 import quotation ·
   *   Ctrl+F4 import order · F2 edit · Alt+Y copy · Esc close
   *
   * **F1 steps between PANELS**, which is the walk above the other two: Enter
   * moves within a panel (the header's fields, a grid's cells) and never crosses
   * a boundary, so reaching the charges grid from the header used to mean the
   * mouse. F1 cycles Header → Items → Charges → Terms (or the Adjust panel, when
   * that is what is mounted there) and round again; Shift+F1 goes the other way.
   *
   * F11 (print) is still unbound, but print itself is no longer missing: a save
   * ends in the print dialog (see `runSave`), and the F8 picker prints the
   * highlighted bill. What F11 would add is a REPRINT of the bill on screen
   * without saving it again — the same dialog on `draft.docId`, and a small,
   * separate piece of work.
   *
   * F4 is the ADJUST panel here, and inside the item grid it is the unit switch
   * — the grid scopes its own shortcuts to itself, which is what lets one key
   * mean two things without either checking for the other.
   */
  const shortcuts = {
    guardedRun,
    requestSave,
    openTender,
    openAdjust,
    hold: api.hold,
    copyAsNew: api.copyAsNew,
    onEdit,
    onDelete,
    onSaveAndPrint,
    onPostFromKeyboard,
    validateOnServer: api.validateOnServer,
    openDiscountPrompt: () => setDiscountPromptOpen(true),
    showLineCost,
    modalOpen,
  };
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = shortcutsRef.current;
      if (current.modalOpen || event.repeat) {
        return;
      }
      switch (event.key) {
        case "Escape":
          // Leaves the screen, the same route as the Close button — guarded, so
          // a bill with work on it asks before it goes.
          //
          // Everything layered over the bill owns the key first and this never
          // sees it: a dialog stops Escape in capture (`ModalShell`) and is
          // covered by `modalOpen` besides, while an open dropdown or a
          // half-keyed cell calls `preventDefault()` on it. Only a press with
          // nothing left to dismiss reaches the screen itself.
          if (event.defaultPrevented) {
            break;
          }
          event.preventDefault();
          current.guardedRun("back");
          break;
        case "F1":
          // Always prevented, help or not: the browser's own F1 opens a help
          // window over the screen, and an operator who hit it reaching for the
          // panel walk would lose the bill behind it.
          event.preventDefault();
          moveSectionFocus(event.shiftKey ? -1 : 1);
          break;
        case "F5":
          // Save, not the browser's reload — which is exactly why this is
          // always prevented, keyed bill on screen or not.
          event.preventDefault();
          current.requestSave();
          break;
        case "F4":
          if (event.ctrlKey || event.metaKey) {
            // Ctrl+F4 imports an order — checked FIRST, because the bare F4
            // below would otherwise swallow it.
            event.preventDefault();
            current.guardedRun("importOrder");
            break;
          }
          // Bare F4 is Adjust, but only OUTSIDE the grid: inside it F4 switches
          // the row's unit, and the grid's own handler has consumed the event.
          if (!(event.target as HTMLElement)?.closest?.("[data-quotation-grid]")) {
            event.preventDefault();
            current.openAdjust();
          }
          break;
        case "F6":
          // Post & Print on the plain route, Save & Print under auto-post or an
          // amend, the tender on its route (§6.3).
          event.preventDefault();
          current.onSaveAndPrint();
          break;
        case "Enter":
          // Ctrl+Enter posts & prints; Ctrl+Shift+Enter posts without printing.
          // There is no button for the second.
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            current.onPostFromKeyboard(!event.shiftKey);
          }
          break;
        case "F7":
          event.preventDefault();
          if (event.ctrlKey || event.metaKey) {
            // Ctrl+F7: the operator's dry run (§17.7).
            void current.validateOnServer();
            break;
          }
          current.guardedRun("clear");
          break;
        case "F8":
          event.preventDefault();
          current.guardedRun("list");
          break;
        case "F9":
          event.preventDefault();
          void current.hold();
          break;
        case "F10":
          event.preventDefault();
          current.guardedRun("held");
          break;
        case "F3":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            current.guardedRun("importQuotation");
            break;
          }
          // Bare F3 is Delete (DRAFT only) — outside the grid, where F3 opens
          // the size entry and the grid has already consumed it.
          if (!(event.target as HTMLElement)?.closest?.("[data-quotation-grid]")) {
            event.preventDefault();
            current.onDelete();
          }
          break;
        case "F2":
          event.preventDefault();
          current.onEdit();
          break;
        default:
          if (event.altKey && (event.key === "y" || event.key === "Y")) {
            event.preventDefault();
            current.copyAsNew();
          } else if (event.altKey && (event.key === "d" || event.key === "D")) {
            // Alt+D — Disc % All (§6.2).
            event.preventDefault();
            current.openDiscountPrompt();
          } else if (event.altKey && (event.key === "o" || event.key === "O")) {
            // Alt+O — the current line's cost (§6.2).
            event.preventDefault();
            current.showLineCost();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  const activeLine = useMemo(
    () => (activeRowKey ? draft.lines.find((line) => line.key === activeRowKey) ?? null : null),
    [activeRowKey, draft.lines],
  );
  const usedItemIds = useMemo(
    () => draft.lines.map((line) => line.itemId).filter(Boolean),
    [draft.lines],
  );
  const usedChargeIds = useMemo(
    () => draft.charges.map((row) => row.chgId).filter(Boolean),
    [draft.charges],
  );

  // ------------------------------------------------------------------ render

  return (
    <div className={quotationStyles.page}>
      <header className={quotationStyles.titleBar}>
        <span className={quotationStyles.gridHeadActions}>
          <button
            type="button"
            className={quotationStyles.button}
            onClick={() => guardedRun("back")}
          >
            ‹ Bills
          </button>
          <h1 className={cx(quotationStyles.title, styles.entryTitle)}>Sales Entry</h1>
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
          <span className={styles.sourceChip} title="Raised from this document.">
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
        {draft.posting?.voucherRefno ? (
          <span
            className={cx(styles.postingBadge, styles.postingBadgeGenerated)}
            title={draft.posting.postedOn ? `Posted ${toDisplayDate(draft.posting.postedOn.slice(0, 10))}` : undefined}
          >
            voucher {draft.posting.voucherRefno}
            {draft.posting.cogsAmt > 0 ? ` · COGS ${formatCurrency(draft.posting.cogsAmt, 2, true)}` : ""}
          </span>
        ) : null}
        {draft.status !== "DRAFT" && draft.posting ? (
          <>
            <span className={cx(styles.postingBadge, GST_BADGE_CLASS[draft.posting.irn.status] ?? styles.postingBadgeMuted)} title={draft.posting.irn.message ?? draft.posting.irn.ackNo ?? undefined}>
              IRN {draft.posting.irn.status}
            </span>
            <span className={cx(styles.postingBadge, GST_BADGE_CLASS[draft.posting.ewb.status] ?? styles.postingBadgeMuted)} title={draft.posting.ewb.message ?? draft.posting.ewb.validUpto ?? undefined}>
              EWB {draft.posting.ewb.status}
            </span>
          </>
        ) : null}
        <div className={quotationStyles.titleMeta}>
          {draft.amending ? (
            <span className={quotationStyles.readOnlyBadge}>Amending · rev {draft.revisionNo}</span>
          ) : draft.mode === "browse" ? (
            <span className={quotationStyles.readOnlyBadge}>Read only</span>
          ) : null}
          {draft.pricing === "stored" ? <span>showing saved figures</span> : null}
          {draft.isDirty ? <span className={quotationStyles.dirtyDot}>● unsaved</span> : null}
          <span>
            Year <strong>{draft.accYear || "—"}</strong>
          </span>
          {draft.billRefno ? (
            <span>
              Bill <strong>{draft.billRefno}</strong>
            </span>
          ) : null}
          {/*
            CGST+SGST or IGST, said out loud. It is derived from the PLACE OF
            SUPPLY against the company's own state (§5) and it changes every
            tax figure on the document, so it belongs where the operator can see
            it rather than only in the columns.
          */}
          <span title={`Place of supply ${draft.header.posStateCode || "—"}`}>
            {draft.isLocalSale ? "CGST + SGST" : "IGST"}
          </span>
        </div>
      </header>

      <BillQuickStrip
        editable={editable}
        posted={draft.status === "POSTED"}
        isNew={draft.isNewEntry}
        hasLines={draft.lines.some((line) => Boolean(line.itemId))}
        onQuickAddCustomer={() => {
          document.getElementById("sale-bill-customer")?.focus();
          toast.info("Alt+C on the customer field adds a customer without leaving the bill.");
        }}
        onImportQuotation={() => guardedRun("importQuotation")}
        onImportOrder={() => guardedRun("importOrder")}
        onImportChallan={() => toast.info("Challan import arrives with the Open Sources dialog.")}
        onDiscountAll={() => setDiscountPromptOpen(true)}
        onAdjustPrices={() => setPricePromptOpen(true)}
        onShowCost={showLineCost}
        onShipping={() => toast.info("The shipping dialog arrives with the transport band.")}
        onEinvoice={() => toast.info("e-Invoice actions arrive with the GST band.")}
        onEwaybill={() => toast.info("e-Way actions arrive with the GST band.")}
        onCopyAsNew={api.copyAsNew}
        einvoiceLabel="e-Inv"
        ewaybillLabel="e-Way"
        einvoiceEnabled={false}
        ewaybillEnabled={false}
        shippingSummary="Not filled — opens itself when the e-way rule needs it"
      />
      {/*
        One stop of the F1 panel walk (`section-focus.ts`). The whole header is
        ONE panel, not four: its columns are a single hand-laid-out row that the
        Enter walk already crosses end to end, so F1 stepping between them would
        be a second, finer walk competing with the first.
      */}
      <div
        className={cx(quotationStyles.headerRow, styles.headerRowFour)}
        {...{ [SECTION_ATTR]: "Header" }}
        onContextMenu={visibleFields.onContextMenu}
        onKeyDown={onHeaderKeyDown}
      >
        <BillCustomerBlock
          customer={draft.customer}
          header={draft.header}
          fields={visibleFields}
          disabled={!editable}
          // One derived flag per bill-to field (§7.7): only the walk-in's
          // snapshot is typeable, and an imported bill locks the customer
          // unless the setting allows the change.
          billToEditable={api.isWalkIn && !customerLocked}
          customerLocked={customerLocked}
          customerLockReason={
            customerLocked
              ? `Imported from ${draft.source?.refno ?? "another document"} — the customer belongs to that document and can't be changed here.`
              : undefined
          }
          sourceNote={
            draft.source
              ? `Raised from ${draft.source.refno ?? "another document"}: the imported prices were quoted to the customer below, so re-check them if you repoint the bill at somebody else.`
              : undefined
          }
          onRequestCustomer={onRequestCustomer}
          onSetCustomerField={(field, value) => dispatch(customerFieldSet({ field, value }))}
          onSetPos={(stateCode, stateName) => dispatch(posSet({ stateCode, stateName }))}
        />
        <BillInfoBlock
          header={draft.header}
          billRefno={draft.billRefno}
          priceLevelOptions={priceLevelOptions}
          fields={visibleFields}
          disabled={!editable}
          termLocked={!api.settings.allowPaymentTermChange}
          onSetHeader={(field, value) => dispatch(headerFieldSet({ field, value }))}
        />
        <BillPeopleBlock
          people={draft.header.people}
          header={draft.header}
          fields={visibleFields}
          disabled={!editable}
          onSetPerson={(field, value) => dispatch(peopleFieldSet({ field, value }))}
          onSetHeader={(field, value) => dispatch(headerFieldSet({ field, value }))}
        />
        {/*
          The credit column (§7.4), painted from `/bills/party-context` — never
          a verdict computed here. Its rows are addressed by their shipped
          label, which `SALE_BILL_CREDIT_FIELD_KEYS` maps back to the bill's own
          field keys.
        */}
        <BillCreditPanel
          party={draft.party}
          hasCustomer={Boolean(draft.customer.custId)}
          loyaltyTicked={draft.header.hasLoyalty}
          fields={creditFields}
        />
        <BillFactsLine party={draft.party} customer={draft.customer} isLocalSale={draft.isLocalSale} />
      </div>

      <div className={quotationStyles.gridsRow}>
        <section
          className={`${quotationStyles.gridShell} ${quotationStyles.itemGridShell}`}
          {...{ [SECTION_ATTR]: "Items" }}
          onContextMenu={itemSettings.onContextMenu}
        >
          <div className={quotationStyles.gridHead}>
            <span className={quotationStyles.gridHeadTitle}>Items</span>
            <span className={quotationStyles.gridHeadActions}>
              <span className={quotationStyles.modalNote}>
                Enter next cell · F1 next panel · F3 sizes · F4 unit · Ctrl+± row ·
                Alt+R copy row · Ctrl+1..{PRICE_LEVEL_COUNT} price level
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
            onSetPriceLevel={(rowKey, level) =>
              void api.applyPriceLevel(level, "selected", [rowKey])
            }
            onAddLine={() => dispatch(lineAdded())}
            onInsertLine={(rowKey) => dispatch(lineInserted(rowKey))}
            onDuplicateLine={onDuplicateLine}
            onRemoveLine={onRemoveLine}
            onSwitchUnit={(rowKey) => void api.switchUnit(rowKey)}
            onOpenSizeEntry={setSizeEntryRow}
            onPriceLevelShortcut={onPriceLevelShortcut}
          />
        </section>

        <div className={quotationStyles.bottomRow}>
          <section
            className={cx(quotationStyles.gridShell, quotationStyles.chargeGridShell)}
            {...{ [SECTION_ATTR]: "Charges" }}
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

          {/*
            §10's panel, mount point ONE: on the bill, beside the totals. The
            other is inside the settle dialog. Same component, same state — the
            operator reaches for whichever is in front of them and there is still
            one source of truth.
          */}
          {adjustOpen ? (
            <AdjustPanel
              credits={draft.openCredits}
              rows={draft.adjustments}
              billAmount={pricing.totals.bill}
              tendered={draft.settlement.tenderAmt - draft.settlement.surchargeAmt}
              disabled={!editable}
              loading={creditsLoading}
              hasCustomer={Boolean(draft.customer.custId)}
              onRefresh={() => {
                setCreditsLoading(true);
                void api.refreshOpenCredits().finally(() => setCreditsLoading(false));
              }}
              onApply={(rows) => applyAdjustments(rows, "bill")}
            />
          ) : (
            <TermsBlock
              terms={draft.terms}
              fields={visibleFields.terms}
              disabled={!editable}
              onSetTerms={(field, value) => dispatch(termsFieldSet({ field, value }))}
            />
          )}
          {/*
            The bill's own money reads in the same grid as the rest of the
            totals. All four are zero until the tender dialog and the adjustment
            panel land — shown anyway, because a settlement that is blank is a
            fact about the bill, and a strip that appears only once money exists
            teaches the operator to look for it in a different place each time.

            Tendered is what CROSSED THE COUNTER, surcharge included. Adjusted is
            what was set off out of credits the customer already held, and it is
            NOT a tender (§10): different rows, different tables, different
            postings. Balance is measured against the bill, so a card fee never
            looks like it reduced what is owed.
          */}
          <TotalsStrip
            totals={pricing.totals}
            stored={draft.pricing === "stored"}
            extraColumnOne={[
              {
                label: "Balance",
                value: formatCurrency(
                  Math.max(
                    0,
                    pricing.totals.bill -
                      draft.settlement.tenderAmt -
                      draft.settlement.adjustedAmt -
                      draft.settlement.creditAmt,
                  ),
                  2,
                  true,
                ),
              },
            ]}
            extraColumnTwo={[
              { label: "Tendered", value: formatCurrency(draft.settlement.tenderAmt, 2, true) },
              { label: "Adjusted", value: formatCurrency(draft.settlement.adjustedAmt, 2, true) },
              { label: "Refund", value: formatCurrency(draft.settlement.refundAmt, 2, true) },
            ]}
          />
        </div>
      </div>

      <TotalsFooterStats totals={pricing.totals} />
      <div className={styles.statsLine}>
        {activeLine?.itemId ? (
          <span>
            Stock: {activeLine.stockQty ?? "—"} {activeLine.unitName}
            {activeLine.actualPrice > 0 && Math.abs(activeLine.rate - activeLine.actualPrice) >= 0.005 && !activeLine.isFree ? (
              <span
                className={activeLine.rate > activeLine.actualPrice ? styles.rateVarianceUp : styles.rateVarianceDown}
                title="Rate against the list price"
              >
                {" "}
                {activeLine.rate > activeLine.actualPrice ? "+" : "−"}
                {formatCurrency(Math.abs(activeLine.rate - activeLine.actualPrice), 2, true)}
              </span>
            ) : null}
          </span>
        ) : null}
        <span title={api.promotionHintText}>
          Promotions: {draft.header.hasPromo ? "on ⓘ" : "off"}
        </span>
      </div>

      <WarningStrip notes={draft.notes} onView={() => api.setNotesPopupOpen(true)} />

      <SaleBillToolbar
        verbs={verbs}
        busy={busy}
        onTender={requestSave}
        onSave={requestSave}
        onSaveAndPrint={onSaveAndPrint}
        onHold={() => void api.hold()}
        onShowHeld={() => guardedRun("held")}
        onClear={() => guardedRun("clear")}
        onDelete={onDelete}
        onEdit={onEdit}
        onCopyAsNew={api.copyAsNew}
        onShowList={() => guardedRun("list")}
        onCancelBill={onCancelBill}
        onClose={() => guardedRun("back")}
      />

      {itemSettings.overlays}
      {chargeSettings.overlays}
      {visibleFields.overlays}

      {/* Mounted only while open: the dialog snapshots the lines at mount and
          owns them until OK, so its lifetime has to BE the open. */}
      {sizeEntryRow !== null ? (
        <SizeEntryModal
          anchorKey={sizeEntryRow}
          lines={draft.lines}
          onClose={closeSizeEntry}
          onSave={(anchorKey, rows) => dispatch(lineSizesApplied({ anchorKey, rows }))}
        />
      ) : null}
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
      <PriceLevelPrompt
        priceLevel={priceLevelPrompt}
        hasSelection={Boolean(activeRowKey)}
        onClose={() => setPriceLevelPrompt(null)}
        onApply={applyPriceLevel}
      />
      <DeleteConfirmModal
        isOpen={customerToConfirm !== null}
        title="Change the customer?"
        itemName={draft.customer.name || "this customer"}
        message={`This bill has ${formatCurrency(customerChangeCost.tendered, 2, true)} tendered and ${formatCurrency(customerChangeCost.adjusted, 2, true)} adjusted against credits this customer holds. Changing the customer clears both — the money and the credits belong to the party being replaced.`}
        iconVariant="replace"
        confirmLabel="Change and clear"
        cancelLabel="Keep this customer"
        onCancel={() => setCustomerToConfirm(null)}
        onConfirm={onCustomerChangeConfirmed}
      />
      <DeleteConfirmModal
        isOpen={pendingGuard !== null}
        title="Discard unsaved changes?"
        itemName="unsaved changes"
        message="This bill has changes that have not been saved."
        iconVariant="replace"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onCancel={() => setPendingGuard(null)}
        onConfirm={onGuardConfirm}
      />

      <BillListModal
        isOpen={listOpen}
        companyId={draft.companyId}
        branchId={draft.branchId}
        accYear={draft.accYear}
        onClose={() => setListOpen(false)}
        onPick={onPickDocument}
      />
      {/*
        The quotation picker. Its already-billed guard runs in the hook, BEFORE
        the fetch — the Qt picker has no such check and no status filter, so the
        same quotation can be billed twice (§13). That is the one behaviour the
        plan says to fix rather than carry over.
      */}
      <QuotationListModal
        isOpen={importQuotationOpen}
        companyId={draft.companyId}
        branchId={draft.branchId}
        accYear={draft.accYear}
        onClose={() => setImportQuotationOpen(false)}
        onPick={(_key, row) => {
          setImportQuotationOpen(false);
          void api.importFromQuotation(row);
        }}
      />
      {/*
        The sale order screen's own picker, told what it is being opened FOR.
        Here it is an import source, not a document to alter — and an operator
        about to press Enter should be able to read which.
      */}
      <SaleOrderListModal
        isOpen={importOrderOpen}
        companyId={draft.companyId}
        branchId={draft.branchId}
        title="Select order to bill"
        onClose={() => setImportOrderOpen(false)}
        onPick={(key) => {
          setImportOrderOpen(false);
          void api.importFromOrder(key);
        }}
      />
      {/*
        The held carts — the quotation's own picker, told which screen's rows to
        show. `txn_hold` is ONE shared table (§12's "hold implemented twice" is a
        do-not-port), so the doc type and kind narrow the wire filter and
        `isBillHold` checks the payload stamp that actually says who wrote it.
      */}
      <HeldListModal
        isOpen={heldOpen}
        companyId={draft.companyId}
        branchId={draft.branchId}
        accYear={draft.accYear}
        docType={SALE_BILL_HOLD_DOC_TYPE}
        kind={SALE_BILL_HOLD_KIND}
        recognises={isBillHold}
        title="Held bills"
        onClose={() => setHeldOpen(false)}
        onPick={(txhId) => {
          setHeldOpen(false);
          void api.resumeHold(txhId);
        }}
        onTakeOver={api.takeOverHold}
      />

      {/*
        The settle dialog, with §10's panel as its second mount point. The
        adjustments reduce what the TENDERS must cover — money already taken is
        money already taken — but they are never a tender row and never reach
        `tenders[]`.
      */}
      <TenderDialog
        isOpen={tenderOpen}
        purpose="settlement"
        documentAmount={pricing.totals.bill}
        documentDate={draft.header.billDate}
        documentRefno={draft.billRefno}
        existingRows={draft.tenders}
        masters={tenderMasters}
        mastersFailed={Boolean(tenderMasterError)}
        mastersError={tenderMasterError ? "the tender master could not be read" : null}
        creditAllowed={draft.customer.debitAllowed}
        refundAmt={draft.settlement.refundAmt}
        adjustedAmount={adjusted}
        adjustPanel={
          <AdjustPanel
            credits={draft.openCredits}
            rows={draft.adjustments}
            billAmount={pricing.totals.bill}
            tendered={draft.settlement.tenderAmt - draft.settlement.surchargeAmt}
            disabled={!editable}
            loading={creditsLoading}
            hasCustomer={Boolean(draft.customer.custId)}
            onRefresh={() => {
              setCreditsLoading(true);
              void api.refreshOpenCredits().finally(() => setCreditsLoading(false));
            }}
            onApply={(rows) => applyAdjustments(rows, "tender")}
          />
        }
        confirmLabel={settleThenSave ? "OK & Save" : undefined}
        onClose={() => {
          // Backing out of a settle Save opened cancels the save with it.
          setSettleThenSave(false);
          settleThenSaveRef.current = false;
          setTenderOpen(false);
        }}
        onApply={(tenders, settlement) => {
          // `updateSettlementDisplay()` — the ONE place tendered, adjusted,
          // balance and refund are reconciled (§9). Everything else reads it.
          dispatch(
            tendersReplaced({
              tenders,
              settlement: {
                ...draft.settlement,
                tenderAmt: settlement.tenderAmt,
                surchargeAmt: settlement.surchargeAmt,
                refundAmt: settlement.refundAmt,
                payStatus: settlement.payStatus,
                // A CREDIT tender settles the bill and posts NO accounting leg —
                // the party debit simply stays open (§9). It is reported apart
                // from the rest so the server need not re-derive the type.
                creditAmt: tenders
                  .filter((row) => row.typeCode === "CREDIT")
                  .reduce((sum, row) => sum + Math.max(0, row.keyed), 0),
                adjustedAmt: adjusted,
              },
            }),
          );
          // The ref stays armed: the save runs one render later, off the draft
          // these tenders have just landed in.
          setSettleThenSave(false);
          setTenderOpen(false);
        }}
      />

      {/* §6.2 — Disc % All and ± Price. */}
      <AskText
        isOpen={discountPromptOpen}
        title="Disc % on every line"
        message="For every line that is not free: the per-qty and amount tiers are cleared and this percentage is set."
        label="Discount %"
        placeholder="0 – 100"
        required
        maxLength={6}
        confirmLabel="Apply"
        onCancel={() => setDiscountPromptOpen(false)}
        onConfirm={(value) => {
          const perc = parseCell(value);
          if (perc < 0 || perc > 100) {
            toast.error("Enter a percentage from 0 to 100.");
            return;
          }
          setDiscountPromptOpen(false);
          api.discountAll(perc);
        }}
      />
      <AskText
        isOpen={pricePromptOpen}
        title="Adjust every rate"
        message="rate × (1 + p / 100) on every line that is not free. −100 to 100; 0 changes nothing. MRP and minimum checks apply at save."
        label="Change %"
        placeholder="−100 … 100"
        required
        maxLength={7}
        confirmLabel="Apply"
        onCancel={() => setPricePromptOpen(false)}
        onConfirm={(value) => {
          const perc = parseCell(value);
          if (perc < -100 || perc > 100) {
            toast.error("Enter a percentage from −100 to 100.");
            return;
          }
          setPricePromptOpen(false);
          api.adjustPrices(perc);
        }}
      />
      <DeleteConfirmModal
        isOpen={duplicatePick !== null}
        title="Add it again?"
        itemName={duplicatePick?.pick.itemName}
        message={`This item is already on row ${duplicatePick?.row ?? ""}. Add it again?`}
        iconVariant="replace"
        confirmLabel="Add again"
        cancelLabel="No"
        onCancel={() => setDuplicatePick(null)}
        onConfirm={onDuplicateConfirmed}
      />

      {/*
        Save → print, the counter's own order. `SALE_INVOICE` is the purpose;
        branch and counter are claims on the access token and are deliberately
        not sent (see the dialog). The company and the accounting year ARE sent:
        both are the document's own — the token's company is the user's home
        one and may not be the one this bill was raised in, and a bill saved on
        the far side of 1 April lives in last year's partition.
      */}
      {printTarget ? (
        <PrintOptionsDialog
          open
          onClose={() => setPrintTarget(null)}
          purposeCode={PURPOSE_CODE.SALE_INVOICE}
          documentLabel={printTarget.billRefno ? `Bill ${printTarget.billRefno}` : "Bill"}
          targets={[
            {
              docId: printTarget.sbId,
              companyId: printTarget.sbCompanyId,
              accYear: printTarget.sbAccYear,
              filename: `bill-${printTarget.billRefno || printTarget.sbId}`,
            },
          ]}
        />
      ) : null}

      <DeleteConfirmModal
        isOpen={saveQuestion !== null}
        title="Save this bill?"
        itemName={draft.customer.name || "this bill"}
        message={saveQuestion ?? ""}
        iconVariant="replace"
        confirmLabel="Save anyway"
        cancelLabel="Go back"
        onCancel={() => setSaveQuestion(null)}
        onConfirm={onSaveQuestionConfirmed}
      />
      <DeleteConfirmModal
        isOpen={editConfirmOpen}
        title="Enable editing"
        itemName={draft.billRefno || undefined}
        message="Switch this bill to edit mode?"
        iconVariant="replace"
        confirmLabel="Yes"
        cancelLabel="No"
        onCancel={() => setEditConfirmOpen(false)}
        onConfirm={() => {
          setEditConfirmOpen(false);
          api.beginEdit();
        }}
      />
      {/* §17.9 — a POSTED bill is cancelled by reversal and keeps its number. */}
      <CancelBillPrompt
        isOpen={cancelBillOpen}
        refno={draft.billRefno}
        busy={busy === "saving"}
        onCancel={() => setCancelBillOpen(false)}
        onConfirm={async (reason) => {
          const done = await api.cancelBill(reason);
          if (done) {
            setCancelBillOpen(false);
          }
        }}
      />
      {/* §17.8 — what did you change? */}
      <AmendRemarkPrompt
        isOpen={amendPrompt !== null}
        refno={draft.billRefno}
        busy={busy === "saving"}
        print={amendPrompt?.print === true}
        onCancel={() => setAmendPrompt(null)}
        onConfirm={(editRemark) => void runAmend({ editRemark, print: amendPrompt?.print === true })}
      />
      {/*
        §16.4 — the Validation popup: View from the strip, a refusal, or
        `confirmProceed` (Back and the verb). Never the generic error box.
      */}
      <ValidationPopup
        isOpen={api.notesPopupOpen || api.proceedAsk !== null}
        notes={draft.notes}
        overrides={draft.overrides}
        canOverride={draft.rights?.override === true}
        proceedVerb={api.proceedAsk?.verb ?? null}
        onToggleOverride={api.toggleOverride}
        onBack={() => {
          if (api.proceedAsk) {
            api.answerProceed(false);
          }
          api.setNotesPopupOpen(false);
        }}
        onProceed={() => {
          api.setNotesPopupOpen(false);
          api.answerProceed(true);
        }}
      />
      {/* §8 — three choices, and the operator makes it. */}
      <CancelLinePrompt
        isOpen={cancelLineKey !== null}
        reason={cancelReason}
        busy={busy === "saving"}
        onReasonChange={setCancelReason}
        onCancelOnOrder={() => void cancelOnOrder()}
        onRemoveFromBill={removeFromBillOnly}
        onAbort={() => setCancelLineKey(null)}
      />
      {/* §12 — crash recovery, offered once, never restored behind the operator. */}
      <DeleteConfirmModal
        isOpen={recovery !== null}
        title="Recover the bill this counter was on?"
        itemName={recovery ? `${recovery.itemCount} lines for ${recovery.partyName || "a walk-in"}` : undefined}
        message={
          recovery
            ? `This device stopped mid-bill on ${toDisplayDate(recovery.savedAt.slice(0, 10))} with ${formatCurrency(recovery.netAmount, 2, true)} on screen. Bring it back?`
            : ""
        }
        iconVariant="replace"
        confirmLabel="Bring it back"
        cancelLabel="Start fresh"
        onCancel={() => {
          api.discardRecovery();
          setRecovery(null);
        }}
        onConfirm={() => {
          if (recovery) {
            api.acceptRecovery(recovery);
          }
          setRecovery(null);
        }}
      />
    </div>
  );
}
