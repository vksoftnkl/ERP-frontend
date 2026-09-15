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
import { toast } from "react-toastify";
import { cx } from "@/components/design-system/cx";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import type { PricedLine } from "@/domain/pricing";
import { formatCurrency } from "@/domain/pricing";
import {
  CHARGE_GRID_NAME,
  ChargeGrid,
  chargeLookupFieldKey,
} from "@/features/sales/quotation/components/charge-grid";
import { ChargePickerModal } from "@/features/sales/quotation/components/charge-picker-modal";
import {
  focusFirstCell,
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
import { PriceLevelPrompt } from "@/features/sales/quotation/components/price-level-prompt";
import { HeldListModal } from "@/features/sales/quotation/components/held-list-modal";
import { QuotationListModal } from "@/features/sales/quotation/components/quotation-list-modal";
import { SaleOrderListModal } from "@/features/sales/sale-order/components/sale-order-list-modal";
import { TenderDialog } from "@/features/sales/sale-order/components/tender-dialog";
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
  lineFieldSet,
  lineInserted,
  lineRemoved,
  peopleFieldSet,
  posSet,
  tendersReplaced,
  termsFieldSet,
} from "@/store/slices/saleBillSlice";
import type { CreditFieldConfig } from "@/features/sales/sale-order/components/order-header-blocks";
import {
  CHARGE_GRID_UI_TABLE_ID,
  SALE_BILL_CREDIT_FIELD_KEYS,
  SALE_BILL_HOLD_DOC_TYPE,
  SALE_BILL_HOLD_KIND,
  SALE_BILL_ITEM_COLUMN_WIDTH_UNIT,
  SALE_BILL_ITEM_GRID_UI_TABLE_ID,
} from "../salebill.constants";
import { isBillHold } from "../salebill.hold";
import type { BillAutosave } from "../salebill.hold";
import { totalAdjusted } from "../salebill.validate";
import type { BillAdjustmentRow, SaleBillDocKey, SaleBillDraftLine } from "../salebill.types";
import { useSaleBillDraft } from "../use-sale-bill-draft";
import { AdjustPanel } from "./adjust-panel";
import { useBillVisibleSettings } from "./bill-visible-settings";
import { BillListModal } from "./bill-list-modal";
import {
  BillCreditBlock,
  BillCustomerBlock,
  BillInfoBlock,
  BillPeopleBlock,
} from "./bill-header-blocks";
import { SaleBillToolbar } from "./sale-bill-toolbar";
import { CancelLinePrompt, CancelOrderPrompt } from "./cancel-prompts";
import styles from "../page.module.scss";

const STATUS_BADGE_CLASS: Record<string, string> = {
  DRAFT: "statusDraft",
  POSTED: "statusAccepted",
  CANCELLED: "statusCancelled",
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
  const canCopyDoc = Boolean(draft.docId) && menuPermissions.canCreate;

  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [itemPickerRow, setItemPickerRow] = useState<string | null>(null);
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
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [cancelOrderOpen, setCancelOrderOpen] = useState(false);
  const [creditsLoading, setCreditsLoading] = useState(false);
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

  const itemResize = useColumnResize(
    itemColumns,
    SALE_BILL_ITEM_GRID_UI_TABLE_ID,
    SALE_BILL_ITEM_COLUMN_WIDTH_UNIT,
  );
  const chargeResize = useColumnResize(
    chargeColumns,
    CHARGE_GRID_UI_TABLE_ID,
    CHARGE_COLUMN_WIDTH_UNIT,
  );
  const itemSettings = useGridSettings({
    label: "Items",
    uiTableId: SALE_BILL_ITEM_GRID_UI_TABLE_ID,
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
        api.beginEdit();
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
        const warning = rateWarning(value, line.minPrice, line.mrp);
        if (warning) {
          toast.warn(warning);
        }
        // Below the minimum selling price the edit is REFUSED, not warned
        // about: this is the document that takes the money, and a rate under
        // the floor is a loss the counter cannot authorise. Above MRP is only a
        // warning, because a line can legitimately carry one when MRP is stale.
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

  // ------------------------------------------------------------------ pickers

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
        // Not refused: a bill may legitimately carry one item twice, because a
        // line is a BATCH ALLOCATION and two batches of the same item are two
        // lines. Said out loud so a double-pick is still noticed.
        toast.info(`${pick.itemName} is already on this bill.`);
      }
      pickedItemRow.current = rowKey;
      void api.pickItem(rowKey, pick.itemId, pick.itemUnitId);
    },
    [api, draft.lines, itemPickerRow],
  );

  /**
   * Picking an item hands focus back to the grid, on the next stop of the
   * layout's Enter chain. Grid 22 flags three focus columns — Description, Bill
   * Qty and Rate — so the walk from Description lands on Bill Qty.
   *
   * An effect, not a line after the `await`: the cells past Description are
   * disabled until the row has an item, so the walk has to run on the render
   * that priced the line.
   */
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
  }, [draft.lines, itemResize.columns]);

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
      if (line?.srcDocId && draft.source?.docType === "SALES_ORDER") {
        setCancelReason("");
        setCancelLineKey(rowKey);
        return;
      }
      dispatch(lineRemoved(rowKey));
      if (activeRowKey === rowKey) {
        setActiveRowKey(null);
      }
    },
    [activeRowKey, dispatch, draft.lines, draft.source],
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

  const runSave = useCallback(
    async (confirmed = false) => {
      if (!canSaveDoc) {
        toast.error("You do not have permission to save bills on this screen.");
        return;
      }
      const outcome = await api.save({ confirmed });
      if (outcome.status === "invalid" || outcome.status === "confirm-needed") {
        const violation = outcome.violation;
        setInvalidCells(
          violation.lineKey ? { [`${violation.lineKey}:${violation.field}`]: true } : {},
        );
        if (outcome.status === "confirm-needed") {
          // A question, not a refusal: the stock position could not be
          // established, or the customer is over their limit. The operator may
          // know better than the screen does.
          setSaveQuestion(violation.message);
          return;
        }
        toast.error(violation.message);
        return;
      }
      setInvalidCells({});
      if (outcome.status === "saved") {
        // Crash recovery has nothing left to recover.
        //
        // Save-and-PRINT is not wired here yet, but the pipeline does exist —
        // see the note on the F11 binding below. The tender dialog's own print
        // flag is what would drive it.
        setRecovery(null);
      }
    },
    [api, canSaveDoc],
  );

  const onSaveQuestionConfirmed = useCallback(() => {
    setSaveQuestion(null);
    void runSave(true);
  }, [runSave]);

  // --------------------------------------------------------------- settle

  const adjusted = totalAdjusted(draft);

  const openTender = useCallback(() => {
    if (!editable) {
      return;
    }
    // The credits are re-read on the way in: another counter may have spent one
    // since the panel was last opened, and the ceiling this list reports is what
    // the operator adjusts against.
    setCreditsLoading(true);
    void api.refreshOpenCredits().finally(() => setCreditsLoading(false));
    setTenderOpen(true);
  }, [api, editable]);

  const openAdjust = useCallback(() => {
    if (!editable) {
      return;
    }
    setCreditsLoading(true);
    void api.refreshOpenCredits().finally(() => setCreditsLoading(false));
    setAdjustOpen(true);
  }, [api, editable]);

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
          api.beginEdit();
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

  // --------------------------------------------------------------- shortcuts

  const modalOpen =
    itemPickerRow !== null ||
    chargePickerRow !== null ||
    priceLevelPrompt !== null ||
    customerToConfirm !== null ||
    cancelLineKey !== null ||
    saveQuestion !== null ||
    recovery !== null ||
    listOpen ||
    importQuotationOpen ||
    importOrderOpen ||
    heldOpen ||
    tenderOpen ||
    adjustOpen ||
    editConfirmOpen ||
    cancelOrderOpen ||
    visibleFields.isOpen ||
    pendingGuard !== null;

  /**
   * The legacy screen's bindings, and only the ones that DO something:
   *
   *   F5 settle · F4 adjust · F6 save · F8 bill list · F7 clear ·
   *   F9 hold · F10 held carts · Ctrl+F3 import quotation ·
   *   Ctrl+F4 import order · F2 edit · Alt+Y copy
   *
   * **F1 steps between PANELS**, which is the walk above the other two: Enter
   * moves within a panel (the header's fields, a grid's cells) and never crosses
   * a boundary, so reaching the charges grid from the header used to mean the
   * mouse. F1 cycles Header → Items → Charges → Terms (or the Adjust panel, when
   * that is what is mounted there) and round again; Shift+F1 goes the other way.
   *
   * F11 (print) is unbound for now, but NOT for the reason the plan gives: its
   * §18.1 says no print pipeline exists, and that is true of the Qt client and
   * false of this repo. The server registers three sale-bill providers
   * (`sales.bill.header`, `sales.bill.items`, `sales.bill.tax_summary`) and
   * `SALE_INVOICE` ("Tax Invoice") is a seeded purpose — the F8 picker already
   * prints the highlighted bill through it. Binding F11 to the same dialog for
   * the bill ON SCREEN is a small, separate piece of work.
   *
   * F4 is the ADJUST panel here, and inside the item grid it is the unit switch
   * — the grid scopes its own shortcuts to itself, which is what lets one key
   * mean two things without either checking for the other.
   */
  const shortcuts = {
    guardedRun,
    runSave,
    openTender,
    openAdjust,
    hold: api.hold,
    copyAsNew: api.copyAsNew,
    beginEdit: api.beginEdit,
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
        case "F1":
          // Always prevented, help or not: the browser's own F1 opens a help
          // window over the screen, and an operator who hit it reaching for the
          // panel walk would lose the bill behind it.
          event.preventDefault();
          moveSectionFocus(event.shiftKey ? -1 : 1);
          break;
        case "F5":
          event.preventDefault();
          current.openTender();
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
          event.preventDefault();
          void current.runSave();
          break;
        case "F7":
          event.preventDefault();
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
          }
          break;
        case "F2":
          event.preventDefault();
          current.beginEdit();
          break;
        default:
          if (event.altKey && (event.key === "y" || event.key === "Y")) {
            event.preventDefault();
            current.copyAsNew();
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
        <div className={quotationStyles.titleMeta}>
          {draft.mode === "browse" ? (
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
          locked={Boolean(draft.source)}
          lockReason={
            draft.source
              ? `Locked: this bill was raised from ${draft.source.refno ?? "another document"} for this customer.`
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
          The credit column is the sale ORDER's component, fed this screen's
          config: its rows are addressed by their shipped label, which
          `SALE_BILL_CREDIT_FIELD_KEYS` maps back to the bill's own field keys.
        */}
        <BillCreditBlock
          credit={draft.partyCredit}
          hasCustomer={Boolean(draft.customer.custId)}
          fields={creditFields}
        />
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
                Enter next cell · F1 next panel · F4 unit · Ctrl+± row · Ctrl+1..
                {PRICE_LEVEL_COUNT} price level
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
            onRemoveLine={onRemoveLine}
            onSwitchUnit={(rowKey) => void api.switchUnit(rowKey)}
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

      <SaleBillToolbar
        mode={draft.mode}
        busy={busy}
        canEdit={!draft.isDeleted && menuPermissions.canEdit}
        canSave={editable}
        canCopyAsNew={canCopyDoc}
        canCancelOrder={Boolean(draft.docId) && Boolean(draft.source) && menuPermissions.canDelete}
        onOpenTender={openTender}
        onOpenAdjust={openAdjust}
        onSave={() => void runSave()}
        onShowList={() => guardedRun("list")}
        onImportQuotation={() => guardedRun("importQuotation")}
        onImportOrder={() => guardedRun("importOrder")}
        onHold={() => void api.hold()}
        onShowHeld={() => guardedRun("held")}
        onCancelOrder={() => setCancelOrderOpen(true)}
        onCopyAsNew={api.copyAsNew}
        onEdit={() => setEditConfirmOpen(true)}
        onClear={() => guardedRun("clear")}
        onClose={() => guardedRun("back")}
      />

      {itemSettings.overlays}
      {chargeSettings.overlays}
      {visibleFields.overlays}

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
        onClose={() => setTenderOpen(false)}
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
          setTenderOpen(false);
        }}
      />

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
      {/*
        §16. "Cancel bill" is what an operator would call it, and the wording has
        to say what actually happens, because it is NOT what the name suggests:
        the route writes off every open line of the SOURCE ORDER and leaves the
        bill — its lines, charges, tenders and voucher posting — exactly as it is.
        There is no endpoint that cancels a bill.
      */}
      <CancelOrderPrompt
        isOpen={cancelOrderOpen}
        refno={draft.source?.refno ?? null}
        busy={busy === "saving"}
        onCancel={() => setCancelOrderOpen(false)}
        onConfirm={async (reason) => {
          const done = await api.cancelSourceOrders(reason);
          if (done) {
            setCancelOrderOpen(false);
          }
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
