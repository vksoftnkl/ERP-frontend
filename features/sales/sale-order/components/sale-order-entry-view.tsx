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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { toast } from "@/lib/notify";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { PURPOSE_CODE } from "@/features/printing/domain/documentPrint";
import { moveHeaderFocus } from "@/features/sales/quotation/components/header-focus";
import { cx } from "@/components/design-system/cx";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import type { PricedLine } from "@/domain/pricing";
import { formatCurrency, money } from "@/domain/pricing";
import {
  CHARGE_GRID_NAME,
  ChargeGrid,
  chargeLookupFieldKey,
} from "@/features/sales/quotation/components/charge-grid";
import { ChargePickerModal } from "@/features/sales/quotation/components/charge-picker-modal";
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import {
  ITEM_GRID_NAME,
  ItemGrid,
  itemLookupFieldKey,
} from "@/features/sales/quotation/components/item-grid";
import {
  focusNextRowAfterRender,
  focusNextStopFrom,
} from "@/features/sales/quotation/components/grid-focus";
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
import { CHARGE_GRID_UI_TABLE_KEY } from "@/features/sales/quotation/quotation.constants";
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
  lineDuplicated,
  lineFieldSet,
  lineInserted,
  lineRemoved,
  linesDiscountPercApplied,
  linesRateScaled,
  posSet,
  tendersReplaced,
  termsFieldSet,
} from "@/store/slices/saleOrderSlice";
import { SALE_ORDER_ITEM_GRID_UI_TABLE_KEY } from "../sale-order.constants";
import { tenderRouteApplies } from "../sale-order.settings";
import { findDuplicateLine } from "../sale-order.state";
import { netSettledOf } from "../tender/arithmetic";
import type { SaleOrderDocKey, SaleOrderDraftLine, SaleOrderHeader } from "../sale-order.types";
import {
  SALES_ITEM_COLUMN_WIDTH_UNIT,
  useSaleOrderDraft,
  type SavedOrderRef,
} from "../use-sale-order-draft";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { NumberPromptModal } from "./number-prompt-modal";
import { OrderIconToolbar } from "./order-icon-toolbar";
import { SaleOrderListModal } from "./sale-order-list-modal";
import { SaleOrderToolbar } from "./sale-order-toolbar";
import { TenderDialog } from "./tender-dialog";
import styles from "../page.module.scss";
import {
  OrderCreditBlock,
  OrderCustomerBlock,
  OrderInfoBlock,
  OrderSalesInfoBlock,
} from "./order-header-blocks";
import { useUiTableId } from "@/lib/ui-tables";

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

/** The four option boxes the Qt screen confirms before it flips them. */
const OPTION_LABELS: Partial<Record<keyof SaleOrderHeader, string>> = {
  hasFreight: "Freight",
  hasLoad: "Load",
  hasUnload: "Unload",
  hasPromo: "Promo",
};

type OptionQuestion = { field: keyof SaleOrderHeader; label: string; checked: boolean };
type DuplicateQuestion = { rowKey: string; pick: ItemPick; rowNo: number };

/** "created VIJI · 02-10-2026 14:05" — the title bar's audit line. */
function formatAuditStamp(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(date.getDate())}-${two(date.getMonth() + 1)}-${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** Enter walks the header the way the Qt dialog's Enter-as-Tab does. */
function onHeaderKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Enter" || event.defaultPrevented) {
    return;
  }
  // A combo box that is open takes Enter for its own pick.
  const target = event.target as HTMLElement | null;
  if (target?.getAttribute("aria-expanded") === "true") {
    return;
  }
  if (moveHeaderFocus(event.currentTarget, event.target, event.shiftKey ? -1 : 1)) {
    event.preventDefault();
  }
}

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
    settings,
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

  // Menu permissions for this screen (Settings → User Administration). They are
  // folded into the two flags the whole view already reads, so the grids, the
  // header blocks, both toolbars and the F-key shortcuts inherit the limit
  // instead of each re-deriving it. A document that exists is edited on save; a
  // blank one is created — so Save answers to a different flag in each mode.
  const { permissions: menuPermissions } = usePagePermissions();
  const canSaveDoc = draft.docId ? menuPermissions.canEdit : menuPermissions.canCreate;
  const editable = draft.mode === "entry" && !draft.isDeleted && canSaveDoc;
  const canAlter = Boolean(draft.docId) && !draft.isDeleted && menuPermissions.canDelete;
  const canCopyDoc = Boolean(draft.docId) && menuPermissions.canCreate;

  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [itemPickerRow, setItemPickerRow] = useState<string | null>(null);
  /**
   * The row a pick has just been made on — see the focus effect below. A ref,
   * not state: the render the effect needs is the one the pick itself causes.
   */
  const pickedItemRow = useRef<string | null>(null);
  const [chargePickerRow, setChargePickerRow] = useState<string | null>(null);
  /** The charge row a pick has just been made on — the twin of `pickedItemRow`. */
  const pickedChargeRow = useRef<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tenderOpen, setTenderOpen] = useState(false);
  const [priceLevelPrompt, setPriceLevelPrompt] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [creditQuestion, setCreditQuestion] = useState<string | null>(null);
  const [pendingGuard, setPendingGuard] = useState<PendingGuard>(null);
  const [invalidCells, setInvalidCells] = useState<Record<string, true>>({});
  /** The tender dialog closed on Save / Save & Print: write the order on the next render. */
  const [saveAfterTender, setSaveAfterTender] = useState<{ print: boolean } | null>(null);
  /** What F11 (Last Order) reprints — the order saved last on THIS screen. */
  const [lastSaved, setLastSaved] = useState<SavedOrderRef | null>(null);
  const [printTarget, setPrintTarget] = useState<SavedOrderRef | null>(null);
  const [duplicateQuestion, setDuplicateQuestion] = useState<DuplicateQuestion | null>(null);
  const [optionQuestion, setOptionQuestion] = useState<OptionQuestion | null>(null);
  const [discountPromptOpen, setDiscountPromptOpen] = useState(false);
  const [hikePromptOpen, setHikePromptOpen] = useState(false);
  /** Whether the save the credit question interrupted was a Save & Print. */
  const creditSavePrint = useRef(false);

  // `sales.tender_type` — which F5 this order gets (the Qt route).
  const tenderRoute = tenderRouteApplies(settings.tenderType, draft.header.orderType);

  const itemUiTableId = useUiTableId(SALE_ORDER_ITEM_GRID_UI_TABLE_KEY);
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

  const priceRowWithPick = useCallback(
    (rowKey: string, pick: ItemPick) => {
      pickedItemRow.current = rowKey;
      void api.pickItem(rowKey, pick.itemId, pick.itemUnitId);
    },
    [api],
  );

  /**
   * The Qt duplicate rule: the same item picked twice either bumps the row it
   * is already on by one (`sales.allow_duplicate_item` off — the cursor parks
   * there) or asks "Add it again?" (on). A free row is never "the same line".
   */
  const onPickItem = useCallback(
    (pick: ItemPick) => {
      const rowKey = itemPickerRow;
      setItemPickerRow(null);
      if (!rowKey) {
        return;
      }
      const duplicate = findDuplicateLine(draft.lines, pick.itemId, rowKey);
      if (!duplicate) {
        priceRowWithPick(rowKey, pick);
        return;
      }
      if (!settings.allowDuplicateItem) {
        dispatch(
          lineFieldSet({
            key: duplicate.line.key,
            field: "billQty",
            value: duplicate.line.billQty + 1,
          }),
        );
        setActiveRowKey(duplicate.line.key);
        toast.info(`${pick.itemName} is already on row ${duplicate.rowNo} — one more was added there.`);
        return;
      }
      setDuplicateQuestion({ rowKey, pick, rowNo: duplicate.rowNo });
    },
    [dispatch, draft.lines, itemPickerRow, priceRowWithPick, settings.allowDuplicateItem],
  );

  const onDuplicateConfirmed = useCallback(() => {
    const question = duplicateQuestion;
    setDuplicateQuestion(null);
    if (question) {
      priceRowWithPick(question.rowKey, question.pick);
    }
  }, [duplicateQuestion, priceRowWithPick]);

  /**
   * Picking an item hands focus back to the grid, on the next stop of the
   * layout's Enter chain — the same walk the quotation screen makes, since both
   * screens are the same `ItemGrid`. Grid 24 flags no focus column of its own,
   * so here that is simply the next editable cell after Description.
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

  /**
   * The same hand-off for the charges grid: picking a charge lands on the next
   * stop of ITS layout's Enter chain — Rate on grid 26, or Amount when the row
   * is FIXED and the Rate cell comes back disabled. An effect, not a line in
   * `onPickCharge`, because every cell but the name is read-only until the row
   * holds a charge.
   */
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
      // The picker greys applied charges out; this catches the paths that grey
      // cannot reach, such as re-pointing a row that already holds a charge.
      const duplicate = draft.charges.some(
        (row) => row.key !== rowKey && row.chgId === master.chgId,
      );
      if (duplicate) {
        toast.error(`${master.chgName} is already on this order.`);
        return;
      }
      setChargePickerRow(null);
      pickedChargeRow.current = rowKey;
      dispatch(chargeMasterApplied({ key: rowKey, master }));
    },
    [draft.charges, chargePickerRow, dispatch],
  );

  /**
   * Alt+R — copy the row into a fresh one under it.
   *
   * Guarded here as well as in the reducer, because focus is moved on the way
   * out: a blank row copies to nothing, and stepping into the row below it would
   * take the operator somewhere they did not ask to go.
   */
  const onDuplicateLine = useCallback(
    (rowKey: string, fieldKey: string | null) => {
      const source = draft.lines.find((row) => row.key === rowKey);
      if (!source?.itemId) {
        return;
      }
      dispatch(lineDuplicated(rowKey));
      focusNextRowAfterRender(ITEM_GRID_NAME, rowKey, fieldKey);
    },
    [dispatch, draft.lines],
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
  /**
   * After a save: the screen resets for the next order (the Qt
   * `resetScreenState`), the saved document is remembered for F11, and a
   * Save & Print opens the print dialog on it — the same five-button dialog
   * the order list uses, since the server's render endpoint has been there
   * all along.
   */
  const afterSaved = useCallback(
    (document: SavedOrderRef, print: boolean) => {
      setLastSaved(document);
      if (print) {
        setPrintTarget(document);
      }
      api.clear();
      setActiveRowKey(null);
      setInvalidCells({});
    },
    [api],
  );

  const runSave = useCallback(
    async (print: boolean) => {
      if (!canSaveDoc) {
        toast.error("You do not have permission to save orders on this screen.");
        return;
      }
      const violation = api.validate();
      setInvalidCells(
        violation?.lineKey ? { [`${violation.lineKey}:${violation.field}`]: true } : {},
      );
      const outcome = await api.save();
      if (outcome.status === "confirm-credit") {
        creditSavePrint.current = print;
        setCreditQuestion(outcome.message);
        return;
      }
      if (outcome.status !== "saved") {
        return;
      }
      afterSaved(outcome.document, print);
    },
    [afterSaved, api, canSaveDoc],
  );

  const onCreditConfirmed = useCallback(async () => {
    setCreditQuestion(null);
    const outcome = await api.confirmCreditAndSave();
    if (outcome.status === "saved") {
      afterSaved(outcome.document, creditSavePrint.current);
    }
  }, [afterSaved, api]);

  // The tender dialog's Save / Save & Print: its rows were dispatched as it
  // closed, so the save runs on the render that holds them.
  useEffect(() => {
    if (!saveAfterTender) {
      return;
    }
    const { print } = saveAfterTender;
    setSaveAfterTender(null);
    void runSave(print);
  }, [runSave, saveAfterTender]);

  /** F11 — Last Order: reprint the order saved last on this screen. */
  const printLastSaved = useCallback(() => {
    if (!lastSaved) {
      toast.info(
        "No order has been saved on this screen yet. Open one from the order list to print it.",
      );
      return;
    }
    setPrintTarget(lastSaved);
  }, [lastSaved]);

  /** Alt+O — the current line's cost, for the operator's eyes. */
  const showCurrentLineCost = useCallback(() => {
    const line = activeRowKey ? draft.lines.find((row) => row.key === activeRowKey) : undefined;
    if (!line?.itemId) {
      toast.info("Select an item line first.");
      return;
    }
    toast.info(
      `${line.itemName} · Cost: ${formatCurrency(line.costPrice)} · Cost (pre-tax): ${formatCurrency(line.costBeforeTax)}`,
    );
  }, [activeRowKey, draft.lines]);

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
    if (draft.status.toUpperCase().includes("CANCEL")) {
      toast.warn("A cancelled order can't be edited — raise a new one.");
      return;
    }
    setEditConfirmOpen(true);
  }, [draft.isDeleted, draft.mode, draft.status]);

  /**
   * The header's Price Level is the Qt screen's `changePriceLevel`: refused
   * when prices are locked, applied straight away while the order has no priced
   * line, and otherwise a question — the selected line, or every line (only the
   * latter moves the document's own level).
   */
  const onHeaderPriceLevel = useCallback(
    (level: number) => {
      if (level === draft.header.priceLevel) {
        return;
      }
      if (!canEditPrice) {
        toast.warn("You do not have permission to change prices.");
        return;
      }
      if (!draft.lines.some((line) => line.itemId)) {
        dispatch(headerFieldSet({ field: "priceLevel", value: level }));
        return;
      }
      setPriceLevelPrompt(level);
    },
    [canEditPrice, dispatch, draft.header.priceLevel, draft.lines],
  );

  /** Freight / Load / Unload / Promo each ask before they flip (the Qt "Order Option" confirm). */
  const onHeaderField = useCallback(
    (field: keyof SaleOrderHeader, value: string | number | boolean) => {
      const label = OPTION_LABELS[field];
      if (label && typeof value === "boolean") {
        setOptionQuestion({ field, label, checked: value });
        return;
      }
      dispatch(headerFieldSet({ field, value }));
    },
    [dispatch],
  );

  const onOptionConfirmed = useCallback(() => {
    const question = optionQuestion;
    setOptionQuestion(null);
    if (question) {
      dispatch(headerFieldSet({ field: question.field, value: question.checked }));
    }
  }, [dispatch, optionQuestion]);

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

  /**
   * The advance dialog. Open on any editable order — including a brand-new one
   * with no lines yet: a customer who pays a deposit at the counter does it
   * before the operator has finished keying the goods, and the arithmetic
   * treats an unpriced document as "nothing to overpay" rather than handing
   * the whole deposit back as change. The save is the backstop: it needs items
   * and a positive total, and re-judges the tenders against the final bill.
   */
  const openTender = useCallback(() => {
    if (!editable) {
      toast.warn("Open the order for editing before recording an advance.");
      return;
    }
    // On the tender route the dialog's OK WRITES the order, so the order has
    // to be saveable before the money is taken — the Qt screen validates first.
    if (tenderRoute) {
      const violation = api.validate();
      if (violation && !violation.confirm) {
        toast.error(violation.message);
        setInvalidCells(
          violation.lineKey ? { [`${violation.lineKey}:${violation.field}`]: true } : {},
        );
        return;
      }
    }
    setTenderOpen(true);
  }, [api, editable, tenderRoute]);

  /** F5 — Tender on the tender route, a plain Save otherwise (the Qt `btnTender` / `btnSave` pair). */
  const onF5 = useCallback(() => {
    if (tenderRoute) {
      openTender();
    } else {
      void runSave(false);
    }
  }, [openTender, runSave, tenderRoute]);

  /** F6 — Save & Print; on the tender route the dialog's Save & Print does it. */
  const onF6 = useCallback(() => {
    if (tenderRoute) {
      openTender();
    } else {
      void runSave(true);
    }
  }, [openTender, runSave, tenderRoute]);

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
    pendingGuard !== null ||
    printTarget !== null ||
    duplicateQuestion !== null ||
    optionQuestion !== null ||
    discountPromptOpen ||
    hikePromptOpen;

  const shortcuts = {
    onF5,
    onF6,
    guardedRun,
    requestEdit,
    copyAsNew: api.copyAsNew,
    printLastSaved,
    showCurrentLineCost,
    openDiscountPrompt: () => setDiscountPromptOpen(true),
    editable,
    modalOpen,
  };
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shortcutsRef.current.modalOpen || event.repeat) {
        return;
      }
      switch (event.key) {
        // The Qt binding: F5 is Tender or Save by route, F6 is Save & Print.
        case "F5":
          event.preventDefault();
          shortcutsRef.current.onF5();
          break;
        case "F6":
          event.preventDefault();
          shortcutsRef.current.onF6();
          break;
        case "F11":
          event.preventDefault();
          shortcutsRef.current.printLastSaved();
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
        case "F2":
          if (draft.mode === "browse" && !draft.isDeleted && menuPermissions.canEdit) {
            event.preventDefault();
            shortcutsRef.current.requestEdit();
          }
          break;
        default:
          // The Alt+letter keys of the Qt screen. `event.code` is checked as
          // well because Alt+letter is a dead key on some layouts.
          if (event.altKey && !event.ctrlKey) {
            const key = event.key.toLowerCase();
            if (key === "y" || event.code === "KeyY") {
              event.preventDefault();
              shortcutsRef.current.copyAsNew();
            } else if ((key === "d" || event.code === "KeyD") && shortcutsRef.current.editable) {
              event.preventDefault();
              shortcutsRef.current.openDiscountPrompt();
            } else if (key === "o" || event.code === "KeyO") {
              event.preventDefault();
              shortcutsRef.current.showCurrentLineCost();
            }
          }
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canAlter, draft.isDeleted, draft.mode, menuPermissions.canEdit]);

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
          <h1 className={cx(quotationStyles.title, styles.entryTitle)}>Sales Order Entry</h1>
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
          {draft.audit?.createdBy || draft.audit?.createdOn ? (
            <span title="Who raised the order, and who last changed it">
              created {draft.audit.createdBy ?? "—"} · {formatAuditStamp(draft.audit.createdOn)}
              {draft.audit.modifiedOn && draft.audit.modifiedOn !== draft.audit.createdOn ? (
                <>
                  {" "}
                  · modified {draft.audit.modifiedBy ?? "—"} ·{" "}
                  {formatAuditStamp(draft.audit.modifiedOn)}
                </>
              ) : null}
            </span>
          ) : null}
        </div>
      </header>

      <OrderIconToolbar
        editable={editable}
        canTender={editable && tenderRoute}
        canDelete={canAlter}
        canCopy={canCopyDoc}
        onOpenTender={openTender}
        onImportQuotation={() => guardedRun("import")}
        onShowList={() => guardedRun("list")}
        onCopyAsNew={api.copyAsNew}
        onPrint={onF6}
        onClear={() => guardedRun("clear")}
        onDelete={() => setDeleteOpen(true)}
        onDiscountAll={() => setDiscountPromptOpen(true)}
        onHikePrices={() => setHikePromptOpen(true)}
        onShowCost={showCurrentLineCost}
      />

      {/* Enter walks the header fields, as the Qt dialog's Enter-as-Tab does. */}
      <div className={cx(quotationStyles.headerRow, styles.headerRowFour)} onKeyDown={onHeaderKeyDown}>
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
        <OrderInfoBlock
          header={draft.header}
          orderRefno={draft.orderRefno}
          priceLevelOptions={priceLevelOptions}
          disabled={!editable}
          onSetHeader={(field, value) => {
            // The Term is just the term here (the Qt screen): the money is
            // taken by F5, not by switching to Cash. The price level is the
            // one header field with a question behind it.
            if (field === "priceLevel") {
              onHeaderPriceLevel(Number(value) || 1);
              return;
            }
            dispatch(headerFieldSet({ field, value }));
          }}
        />
        <OrderSalesInfoBlock
          header={draft.header}
          disabled={!editable}
          onSetHeader={onHeaderField}
          onSetSalesman={(id, name) => {
            dispatch(headerFieldSet({ field: "salesmanId", value: id }));
            dispatch(headerFieldSet({ field: "salesmanName", value: name }));
          }}
          onSetAgent={(id, name) => {
            dispatch(headerFieldSet({ field: "agentId", value: id }));
            dispatch(headerFieldSet({ field: "agentName", value: name }));
          }}
          onSetPackedBy={(id, name) => {
            dispatch(headerFieldSet({ field: "packedId", value: id }));
            dispatch(headerFieldSet({ field: "packedName", value: name }));
          }}
        />
        <OrderCreditBlock
          credit={draft.partyCredit}
          hasCustomer={Boolean(draft.customer.custId)}
        />
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

      <div className={quotationStyles.gridsRow}>
        <section
          className={`${quotationStyles.gridShell} ${quotationStyles.itemGridShell}`}
          onContextMenu={itemSettings.onContextMenu}
        >
          <div className={quotationStyles.gridHead}>
            <span className={quotationStyles.gridHeadTitle}>Items</span>
            <span className={quotationStyles.gridHeadActions}>
              <span className={quotationStyles.modalNote}>
                Enter next cell · F4 unit · Ctrl+± row price level · Alt+± row · Alt+R copy row ·
                Ctrl+1..{settings.priceLevelCount} price level · back-orders allowed
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
            onDuplicateLine={onDuplicateLine}
            onRemoveLine={onRemoveLine}
            onSwitchUnit={(rowKey) => void api.switchUnit(rowKey)}
            onPriceLevelShortcut={onPriceLevelShortcut}
            priceLevelCount={settings.priceLevelCount}
            onStepPriceLevel={(rowKey, delta) => void api.stepLinePriceLevel(rowKey, delta)}
          />
        </section>

        <div className={quotationStyles.bottomRow}>
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
          {/*
            The order's own money reads in the same grid as the rest of the
            totals: Balance Due under column one, Advance and Refund under
            column two. Advance is what CROSSED THE COUNTER (surcharge
            included); Balance Due is measured on the net, so a card fee never
            looks like it reduced what the customer still owes.
          */}
          <TotalsStrip
            totals={pricing.totals}
            stored={draft.pricing === "stored"}
            extraColumnOne={[{ label: "Balance Due", value: formatCurrency(balanceDue, 2, true) }]}
            extraColumnTwo={[
              {
                label: "Advance",
                value: formatCurrency(draft.settlement.tenderAmt, 2, true),
              },
              { label: "Refund", value: formatCurrency(draft.settlement.refundAmt, 2, true) },
            ]}
          />
        </div>
      </div>

      <TotalsFooterStats totals={pricing.totals} />

      <SaleOrderToolbar
        mode={draft.mode}
        busy={busy}
        saveRoute={tenderRoute ? "tender" : "save"}
        canEdit={!draft.isDeleted && menuPermissions.canEdit}
        canDelete={canAlter}
        canCopyAsNew={canCopyDoc}
        canTender={editable}
        onOpenTender={openTender}
        onSave={() => void runSave(false)}
        onSaveAndPrint={onF6}
        onShowList={() => guardedRun("list")}
        onCopyAsNew={api.copyAsNew}
        onEdit={requestEdit}
        onDelete={() => setDeleteOpen(true)}
        onClear={() => guardedRun("clear")}
        onLastOrder={printLastSaved}
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
        mastersFailed={Boolean(tenderMasterError)}
        mastersError={tenderMasterError}
        creditAllowed={draft.customer.debitAllowed}
        refundAmt={draft.settlement.refundAmt}
        saveOnApply={tenderRoute}
        savePrintOnly={settings.tenderPrintOnly}
        onClose={() => setTenderOpen(false)}
        onApply={(tenders, settlement, print) => {
          dispatch(tendersReplaced({ tenders, settlement }));
          setTenderOpen(false);
          // On the tender route the money and the order are one act (the Qt
          // `onTenderValues` saves at once); the effect above runs the save on
          // the render that holds these rows.
          if (tenderRoute) {
            setSaveAfterTender({ print });
          }
        }}
      />
      <PriceLevelPrompt
        priceLevel={priceLevelPrompt}
        hasSelection={Boolean(activeRowKey)}
        onClose={() => setPriceLevelPrompt(null)}
        onApply={applyPriceLevel}
      />
      <NumberPromptModal
        isOpen={discountPromptOpen}
        title="Discount % on every item"
        label="Apply discount % to every item:"
        min={0}
        max={100}
        note="Every priced line takes this percent; a free line is left alone."
        onClose={() => setDiscountPromptOpen(false)}
        onApply={(value) => {
          setDiscountPromptOpen(false);
          dispatch(linesDiscountPercApplied(value));
        }}
      />
      <NumberPromptModal
        isOpen={hikePromptOpen}
        title="Raise or lower every rate"
        label="Increase (+) / decrease (−) every rate by %:"
        min={-100}
        max={100}
        note="Every priced line's rate is scaled by this percent; free lines stay at nothing."
        onClose={() => setHikePromptOpen(false)}
        onApply={(value) => {
          setHikePromptOpen(false);
          dispatch(linesRateScaled(value));
        }}
      />
      <DeleteConfirmModal
        isOpen={duplicateQuestion !== null}
        title="Duplicate Item"
        itemName={duplicateQuestion?.pick.itemName ?? ""}
        message={`This item is already on row ${duplicateQuestion?.rowNo ?? ""}. Add it again?`}
        iconVariant="replace"
        confirmLabel="Add again"
        cancelLabel="No"
        onCancel={() => setDuplicateQuestion(null)}
        onConfirm={onDuplicateConfirmed}
      />
      <DeleteConfirmModal
        isOpen={optionQuestion !== null}
        title="Order Option"
        itemName={optionQuestion?.label ?? ""}
        message={
          optionQuestion?.checked
            ? `Apply ${optionQuestion.label} on this order?`
            : `Remove ${optionQuestion?.label ?? ""} from this order?`
        }
        iconVariant="replace"
        confirmLabel="Yes"
        cancelLabel="No"
        onCancel={() => setOptionQuestion(null)}
        onConfirm={onOptionConfirmed}
      />
      {printTarget ? (
        <PrintOptionsDialog
          open
          onClose={() => setPrintTarget(null)}
          purposeCode={PURPOSE_CODE.SALE_ORDER}
          documentLabel={printTarget.soOrderRefno ? `Order ${printTarget.soOrderRefno}` : "Order"}
          targets={[
            {
              docId: printTarget.soId,
              companyId: printTarget.soCompanyId,
              accYear: printTarget.soAccYear,
              filename: `order-${(printTarget.soOrderRefno || printTarget.soId).toLowerCase()}`,
            },
          ]}
        />
      ) : null}
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
