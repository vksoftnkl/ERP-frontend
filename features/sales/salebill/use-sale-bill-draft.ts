"use client";
/**
 * Sale Bill Entry — the screen's whole conversation with the server, and the one
 * place `recalcDocument` is called.
 *
 * The lifecycle lives here too (§17 of `docs/plan-react-sale-bill.md`): save,
 * validate, post, amend, cancel, delete. The client prices the bill and settles
 * it; the SERVER decides whether it may post, and every refusal is a
 * `/bills/validate` answer painted in the strip — never a verdict recomputed
 * here.
 *
 * Two things are deliberately NOT here, and both are the plan's §3:
 *
 *  - **No arithmetic.** `@/domain/pricing` is imported, never forked. The bill
 *    adds exactly two rules of its own and neither is a price: the
 *    negative-stock gate (§7.2) and the order-quantity cap (§7.3), which are
 *    quantity rules living in `salebill.validate.ts` and the reducer.
 *  - **No second engine call.** `recalcDocument` is a `useMemo` over the draft,
 *    so the Qt discipline of "every handler must end in exactly one
 *    `recalcDocumentTotals()`" has no counterpart — it cannot be called twice
 *    and it cannot be forgotten.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/notify";
import { recalcDocument, type DocumentPricing } from "@/domain/pricing";
import {
  POS_DROPDOWN_KEY,
  PRICE_LEVEL_OPTIONS,
  SESSION_CAPABILITIES,
} from "@/features/sales/quotation/quotation.constants";
import { clampPriceLevel } from "@/features/sales/quotation/quotation.state";
import type {
  ChargeMasterRow,
  ItemUnitOption,
} from "@/features/sales/quotation/quotation.types";
import {
  accountingYearOf,
  resolveChargeColumns,
  resolveItemColumnsWith,
  todayIso,
} from "@/features/sales/quotation/quotation.utils";
import type { ItemPriceQuery } from "@/store/api/quotationApi";
import {
  useConvertTxnHoldMutation,
  useForceReleaseTxnHoldMutation,
  useGetCompanyStateCodeQuery,
  useGetPriceLevelsQuery,
  useGetQuotationGridLayoutQuery,
  useGetSalesChargesQuery,
  useGetUserCapabilitiesQuery,
  useLazyGetCustomerDetailQuery,
  useLazyGetFreightBandsQuery,
  useLazyGetItemPriceQuery,
  useLazyGetItemUnitsQuery,
  useLazyGetQuotationQuery,
  useLazyGetTxnHoldQuery,
  useLazyRunDropdownQuery,
  useLazySwitchItemUomQuery,
  useReleaseTxnHoldMutation,
  useResumeTxnHoldMutation,
  useSaveTxnHoldMutation,
} from "@/store/api/quotationApi";
import { useLazyGetSaleOrderQuery } from "@/store/api/saleOrderApi";
import {
  saleBillApi,
  useAmendBillMutation,
  useCancelBillMutation,
  useCancelOrderLineMutation,
  useDeleteBillMutation,
  usePostBillMutation,
  useValidateBillMutation,
  useLazyGetOpenCreditsQuery,
  useLazyGetPartyContextQuery,
  useLazyGetBillItemByBarcodeQuery,
  useListPromotionSchemesQuery,
  useSaveBillMutation,
} from "@/store/api/saleBillApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  overrideToggled,
  notesSet,
  notesCleared,
  draftDisowned,
  draftAdopted,
  amendBegun,
  amendAbandoned,
  adjustmentsApplied,
  autoChargesSeeded,
  companyStateSet,
  customerApplied,
  customerBoundStateCleared,
  creditAlertConsumed,
  discountAppliedToAll,
  draftReplaced,
  freeLineInserted,
  freightBandsSet,
  holdSet,
  itemPriceApplied,
  lineFieldSet,
  lineRemoved,
  linePriceLevelSet,
  modeSet,
  openCreditsSet,
  partyContextSet,
  pricesAdjusted,
  promotionsApplied,
  saveResponseApplied,
  selectSaleBillDraft,
  tenantSet,
  walkInCustomerSeeded,
} from "@/store/slices/saleBillSlice";
import {
  selectAppSettingBool,
  selectAppSettingNumber,
  selectAppSettingText,
} from "@/store/slices/appSettingsSlice";
import type { AppDispatch } from "@/store/store";
import {
  getAuthSessionId,
  getAuthUserId,
  getOrCreateClientDeviceId,
  getUserInfo,
} from "@/lib/auth/session";
import type { SaveActor } from "@/features/sales/quotation/quotation.payload";
import { useBusinessContext } from "@/components/layout/business-context";
import type {
  QuotationListRow,
  TxnHoldPayload,
} from "@/features/sales/quotation/quotation.types";
import type { SaleOrderDocKey } from "@/features/sales/sale-order/sale-order.types";
import {
  ALLOW_BILL_OVER_ORDER_QTY_SETTING_KEY,
  ALLOW_CUSTOMER_CHANGE_ON_IMPORT_SETTING_KEY,
  ALLOW_DUPLICATE_ITEM_SETTING_KEY,
  ALLOW_EXCESS_TENDER_SETTING_KEY,
  ALLOW_PAYMENT_TERM_CHANGE_SETTING_KEY,
  AUTO_POP_QTY_SETTING_KEY,
  AUTO_POST_SETTING_KEY,
  AUTO_SAVE_TEMP_BILL_SETTING_KEY,
  AUTOSAVE_DEBOUNCE_MS,
  CANCEL_LINES_SRC_MODULE,
  CHARGE_GRID_UI_TABLE_KEY,
  CLEAR_DELIVERY_ON_CLEAR_SETTING_KEY,
  DEFAULT_TENDER_TYPE,
  FREE_ITEM_TAX_SETTING_KEY,
  MULTI_ORDER_BILL_SETTING_KEY,
  SALE_BILL_HOLD_DOC_TYPE,
  SALE_BILL_INJECTED_ITEM_COLUMNS,
  SALE_BILL_ITEM_COLUMN_COUNT,
  SALE_BILL_ITEM_COLUMN_MEANINGS,
  SALE_BILL_ITEM_COLUMN_NUMBERS,
  SALE_BILL_ITEM_COLUMN_WIDTH_UNIT,
  SALE_BILL_ITEM_GRID_UI_TABLE_KEY,
  SALESMAN_MANDATORY_SETTING_KEY,
  TEMP_CREDIT_BLOCK_OPEN_SETTING_KEY,
  TEMP_CREDIT_MAX_AMOUNT_SETTING_KEY,
  TEMP_CREDIT_MAX_DAYS_SETTING_KEY,
  TENDER_PRINT_ONLY_SETTING_KEY,
  TENDER_TYPE_SETTING_KEY,
  WALK_IN_CUSTOMER_ENABLED_SETTING_KEY,
  WALK_IN_CUSTOMER_ID_SETTING_KEY,
  WEIGHT_BARCODE_SETTING_KEY,
} from "./salebill.constants";
import {
  copyBillDraftAsNew,
  createBillDraft,
  customerChangeCosts,
  nowStamp,
  resetBillDraft,
  resolveWalkInCustomerId,
  shouldSeedWalkInCustomer,
} from "./salebill.state";
import { creditAlertMessage, termForcedToParty } from "./salebill.party";
import { decodeWeightBarcode, parseWeightBarcodeConfig } from "./salebill.scan";
import {
  evaluatePromotions,
  promotionHint,
  reconcileFreeLines,
  type PromotionNote,
} from "./promotions/evaluate";
import type { PromotionContext } from "./promotions/match";
import {
  adjustmentsForWire,
  billKeyOf,
  buildAmendBody,
  buildPostBody,
  buildSavePayload,
  buildValidateBody,
  parseLoadedBill,
} from "./salebill.payload";
import {
  validateAdjustments,
  validateSaveInputs,
  type BillValidationContext,
} from "./salebill.validate";
import {
  creditsRaisedBy,
  importOrder,
  importQuotation,
  orderImportRefusal,
  quotationImportRefusal,
} from "./salebill.import";
import {
  buildBillHoldPayload,
  clearAutosave,
  draftFromAutosave,
  draftFromBillHold,
  holdAccYearOf,
  holdLockMessage,
  holdLockScope,
  isWorthAutosaving,
  nextHoldNo,
  nextHoldSlno,
  readAutosave,
  readBillHoldUiState,
  writeAutosave,
  type BillAutosave,
} from "./salebill.hold";
import { confirm } from "@/lib/confirm";
import { amendBlockedReason, cancelBlockedReason } from "./salebill.verbs";
import {
  errorCodeOf,
  errorMessageOf,
  errorStatusOf,
  notesFromError,
  parseValidateRights,
  parseValidationNotes,
  unresolvedWarnings,
} from "./salebill.notes";
import type {
  AdjustableCredit,
  BillAdjustmentRow,
  BillKey,
  PendingScanValue,
  SaleBillDocKey,
  SaleBillDraft,
  SaleBillDraftLine,
  SaleBillViolation,
  SavedBillRef,
} from "./salebill.types";
import { useUiTableId } from "@/lib/ui-tables";
import { getDropdownId } from "@/lib/configured-dropdowns";
/**
 * What a save attempt came to.
 *
 * `confirm-needed` is NOT a failure: the gate asked a question — the stock
 * position could not be established, the customer is not allowed credit, the
 * credit limit is breached — and the screen may put it to the operator and
 * repeat the call with `confirmed`.
 */
export type SaveOutcome =
  | { status: "saved"; ref: SavedBillRef }
  /** The bill went through `/post` (auto-post, F6, Ctrl+Enter) or `/amend`. */
  | { status: "posted"; ref: SavedBillRef }
  | { status: "invalid"; violation: SaleBillViolation }
  | { status: "confirm-needed"; violation: SaleBillViolation }
  /** The server said no (§16): the notes are painted, and there is nothing to retry. */
  | { status: "refused" }
  /** Amending: the screen must ask "what did you change?" and call `amend` (§17.8). */
  | { status: "remark-needed" }
  /** The operator answered Back on the Validation popup, or a confirm with No. */
  | { status: "abandoned" }
  | { status: "failed" }
  | { status: "busy" };
export type SaveOptions = {
  context?: BillValidationContext;
  /** The operator answered the gate's question with yes. */
  confirmed?: boolean;
  /** Print after the post (F6, Ctrl+Enter). Ctrl+Shift+Enter posts without. */
  print?: boolean;
};
/** `/bills/validate` as the hook reports it. A 422 is `refused`, not `unreachable`. */
export type ServerValidation =
  | { status: "ok"; warnings: number }
  | { status: "refused" }
  | { status: "unreachable"; message: string };
/** `useAppSelector` on an object: only re-render when a value moved. */
function shallowSettingsEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) {
    return false;
  }
  return keys.every((key) => left[key] === right[key]);
}
function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const data = (error as { data?: { message?: string | string[] } }).data;
    const message = data?.message;
    if (Array.isArray(message)) {
      return message.join(", ");
    }
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return "Something went wrong. Please try again.";
}
const ENGLISH_LANGUAGE_CODES = new Set([
  "en",
  "eng",
  "en-in",
  "en_in",
  "english",
]);
function isRegionalLanguage(
  language: string | null | undefined,
): boolean | null {
  const value = (language ?? "").trim().toLowerCase();
  return value ? !ENGLISH_LANGUAGE_CODES.has(value) : null;
}
/** Both are closed sets server-side and a stray value is a 400. */
function clampLoadingType(value: string): string {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "auto" || normalized === "item" ? normalized : "manual";
}
function clampFreightType(value: string): string {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "item" ? normalized : "manual";
}
export type SaleBillBusy =
  "idle" | "loading" | "pricing" | "saving" | "holding" | "resuming";
export type PriceLevelScope = "selected" | "all";

/** `sales.*`, as this screen reads them (§25). */
export type BillScreenSettings = {
  tenderType: "none" | "cash_bills" | "all_bills";
  tenderPrintOnly: boolean;
  allowExcessTender: boolean;
  allowPaymentTermChange: boolean;
  allowCustomerChangeOnImport: boolean;
  allowDuplicateItem: boolean;
  allowBillOverOrderQty: boolean;
  salesmanMandatory: boolean;
  multiOrderBill: boolean;
  autoPopQty: boolean;
  autoSaveTempBill: boolean;
  clearDeliveryOnClear: boolean;
  freeItemTax: boolean;
  tempCreditMaxDays: number;
  tempCreditMaxAmount: number;
  /** Read as an enum (§15.7 D7); the catalogue types it BOOL, so `true` reads REFUSE. */
  tempCreditBlockOpen: "OFF" | "WARN" | "REFUSE";
  weightBarcode: ReturnType<typeof parseWeightBarcodeConfig>;
};

function tempCreditBlockModeOf(text: string | null): BillScreenSettings["tempCreditBlockOpen"] {
  const raw = (text ?? "").trim().toUpperCase();
  if (raw === "WARN" || raw === "REFUSE" || raw === "OFF") {
    return raw;
  }
  if (raw === "TRUE" || raw === "1" || raw === "YES") {
    return "REFUSE";
  }
  return "OFF";
}

function tenderTypeOf(text: string | null): BillScreenSettings["tenderType"] {
  const raw = (text ?? "").trim().toLowerCase();
  return raw === "none" || raw === "cash_bills" || raw === "all_bills" ? raw : DEFAULT_TENDER_TYPE;
}
export type SaleBillDraftApi = {
  draft: SaleBillDraft;
  dispatch: AppDispatch;
  /** The engine's output, or the document's stored figures before the first edit. */
  pricing: DocumentPricing;
  isReady: boolean;
  busy: SaleBillBusy;
  canEditPrice: boolean;
  regional: boolean;
  itemColumns: ReturnType<typeof resolveItemColumnsWith>;
  chargeColumns: ReturnType<typeof resolveChargeColumns>;
  priceLevelOptions: ReadonlyArray<{ value: string; label: string }>;
  chargeMasters: ChargeMasterRow[];
  unitOptionsFor: (itemId: string) => ItemUnitOption[];
  /**
   * What a customer change would cost, for the confirmation the screen must put
   * up BEFORE the change (§4.3) — never as a reaction to it.
   */
  customerChangeCost: ReturnType<typeof customerChangeCosts>;
  /** Drops the settlement and the credit standing; the confirmation's "yes". */
  releaseCustomerBoundState: () => void;
  pickCustomer: (customerId: string) => Promise<void>;
  /** Re-read `/bills/party-context` for the customer on the bill (a hold restore, a copy). */
  refreshPartyContext: () => Promise<void>;
  /**
   * The settings the screen reads (§25), resolved for the session. One object
   * so the view, the validate context and the dialogs read the same values.
   */
  settings: BillScreenSettings;
  /** `sales.tender_type` applied to the term (§15.1): F5 opens the tender, or saves. */
  tenderRoute: boolean;
  /** Disc % All (Alt+D, §6.2). */
  discountAll: (perc: number) => void;
  /** ± Price (§6.2). */
  adjustPrices: (perc: number) => void;
  /** Cost (Alt+O, §6.2): the line's cost text, or null when there is no line. */
  lineCostText: (lineKey: string | null) => string | null;
  /** The promotion hint on the scheme figure and the Promo tick (§11). */
  promotionHintText: string;
  pickItem: (
    lineKey: string,
    itemId: string,
    itemUnitId?: string,
    pending?: PendingScanValue | null,
  ) => Promise<void>;
  recoverBaseFactor: (lineKey: string) => Promise<void>;
  switchUnit: (lineKey: string) => Promise<void>;
  setLineUnit: (lineKey: string, itemUnitId: string) => Promise<void>;
  resolveBarcode: (lineKey: string, barcode: string) => Promise<boolean>;
  applyPriceLevel: (
    priceLevel: number,
    scope: PriceLevelScope,
    lineKeys: string[],
  ) => Promise<void>;
  // ----- the money (§9, §10) -----
  /** Re-read the credits this customer holds. Never cached — see the endpoint. */
  refreshOpenCredits: () => Promise<AdjustableCredit[]>;
  /**
   * Apply the adjustment panel, from either mount point. `false` when the panel
   * would over-adjust — the caller keeps it open.
   */
  applyAdjustments: (
    rows: BillAdjustmentRow[],
    from: "bill" | "tender",
  ) => boolean;
  // ----- the document (§14, §15, §16) -----
  validate: (context?: BillValidationContext) => SaleBillViolation | null;
  save: (options?: SaveOptions) => Promise<SaveOutcome>;
  /** The loaded draft, or `null` when the fetch failed. */
  loadDocument: (key: SaleBillDocKey) => Promise<SaleBillDraft | null>;
  /** Cancels the SOURCE ORDER, not the bill — there is no route for the bill. */
  // --- the lifecycle (§17) ---
  /** `sales.auto_post`: Save is check → create → post. */
  autoPost: boolean;
  /** The registered device the login returned. Without it a post is refused (§3.3). */
  canPostOnThisDevice: boolean;
  /** Ctrl+F7, the operator's dry run (§17.7). */
  validateOnServer: () => Promise<ServerValidation>;
  /**
   * The `/validate` before the tender opens (§15.1): OK → the notes paint
   * without a popup and the dialog opens; a refusal paints WITH the popup and
   * the dialog stays shut; the server away → it opens anyway.
   */
  validateForTender: () => Promise<ServerValidation>;
  /** The customer on the bill is the walk-in (§7.7): party-context's answer, or the setting's. */
  isWalkIn: boolean;
  /** F6 / Ctrl+Enter / Ctrl+Shift+Enter: create → validate → confirm → post (§17.5). */
  post: (options?: SaveOptions) => Promise<SaveOutcome>;
  /** Save while amending, once the operator has said what changed (§17.8). */
  amend: (options: SaveOptions & { editRemark: string }) => Promise<SaveOutcome>;
  /** Edit (F2) on a POSTED bill; asks first. `false` when it could not begin. */
  beginAmend: () => Promise<boolean>;
  /** Cancel bill (POSTED only), by reversal. The bill keeps its number (§17.9). */
  cancelBill: (reason: string) => Promise<boolean>;
  /** Delete (F3), DRAFT only (§17.9). Asks first. */
  deleteDraft: () => Promise<boolean>;
  /** The Override tick on one note (§16.2). */
  toggleOverride: (code: string) => void;
  clearNotes: () => void;
  /** The Validation popup is open (View, or a refusal). */
  notesPopupOpen: boolean;
  setNotesPopupOpen: (open: boolean) => void;
  /**
   * `confirmProceed(verb)` is waiting on the operator (§16.4): the popup shows
   * Back and the verb; `answerProceed` settles it.
   */
  proceedAsk: { verb: string } | null;
  answerProceed: (proceed: boolean) => void;
  /** "Cancel on Order" for ONE line; the row goes only if the server agrees (§8). */
  cancelLineOnOrder: (lineKey: string, reason: string) => Promise<boolean>;
  // ----- imports (§13) -----
  importFromQuotation: (row: QuotationListRow) => Promise<boolean>;
  importFromOrder: (key: SaleOrderDocKey) => Promise<boolean>;
  // ----- hold and crash recovery (§12) -----
  hold: () => Promise<boolean>;
  resumeHold: (txhId: string) => Promise<boolean>;
  takeOverHold: (hold: TxnHoldPayload) => Promise<boolean>;
  findRecovery: () => Promise<BillAutosave | null>;
  acceptRecovery: (record: BillAutosave) => void;
  discardRecovery: () => void;
  clear: () => void;
  copyAsNew: () => void;
  beginEdit: () => void;
};
/**
 * The context a new draft is seeded from. `accYear` prefers the stored fiscal
 * year (already 9 characters) and only falls back to deriving it from the
 * voucher date: the two disagree on a bill back-dated across 1 April, and
 * `sb_acc_year` is immutable after create *and* half the primary key *and* the
 * voucher sequence's period key, so the stored one wins.
 */
function useSaveActor(): SaveActor {
  return useMemo(
    () => ({
      userId: getAuthUserId() ?? "",
      userName: getUserInfo()?.userName ?? null,
      sessionId: getAuthSessionId(),
      deviceId: getOrCreateClientDeviceId(),
      // `txn_hold.txh_device_id` is a real FK into `fixed.device_master`, so a
      // hold names the device the LOGIN registered — never the browser's own
      // local uuid, which matches no row there. The two are not interchangeable.
      deviceMasterId: getUserInfo()?.deviceId ?? null,
      deviceType: getUserInfo()?.deviceType ?? null,
    }),
    [],
  );
}
function useDraftContext() {
  const { activeCompany, activeBranch, activeFiscalYear, loading } =
    useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear =
    (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  return { companyId, branchId, accYear, loading };
}
export function useSaleBillDraft(): SaleBillDraftApi {
  const context = useDraftContext();
  const dispatch = useAppDispatch();
  const draft = useAppSelector(selectSaleBillDraft);
  const { data: companyStateCode = "" } = useGetCompanyStateCodeQuery(
    context.companyId,
    {
      skip: !context.companyId,
    },
  );
  const actor = useSaveActor();
  const { data: capabilities } = useGetUserCapabilitiesQuery(actor.userId, {
    skip: !actor.userId,
  });
  const itemUiTableId = useUiTableId(SALE_BILL_ITEM_GRID_UI_TABLE_KEY);
  const chargeUiTableId = useUiTableId(CHARGE_GRID_UI_TABLE_KEY);
  const { data: itemLayout } = useGetQuotationGridLayoutQuery({
    uiTableId: itemUiTableId,
  });
  const { data: chargeLayout } = useGetQuotationGridLayoutQuery({
    uiTableId: chargeUiTableId,
  });
  const { data: chargeMasters = [] } = useGetSalesChargesQuery();
  const { data: priceLevelNames = [] } = useGetPriceLevelsQuery();
  const [fetchCustomerDetail] = useLazyGetCustomerDetailQuery();
  const [fetchItemPrice] = useLazyGetItemPriceQuery();
  const [fetchNextUnit] = useLazySwitchItemUomQuery();
  const [fetchItemUnits] = useLazyGetItemUnitsQuery();
  const [fetchBarcode] = useLazyGetBillItemByBarcodeQuery();
  const [fetchFreightBands] = useLazyGetFreightBandsQuery();
  const [fetchPartyContext] = useLazyGetPartyContextQuery();
  const [runDropdown] = useLazyRunDropdownQuery();
  // --- the settings this screen reads (§25) --------------------------------
  const settingsFromStore = useAppSelector((state) => ({
    tenderType: tenderTypeOf(selectAppSettingText(state, TENDER_TYPE_SETTING_KEY)),
    tenderPrintOnly: selectAppSettingBool(state, TENDER_PRINT_ONLY_SETTING_KEY, false),
    allowExcessTender: selectAppSettingBool(state, ALLOW_EXCESS_TENDER_SETTING_KEY, false),
    allowPaymentTermChange: selectAppSettingBool(state, ALLOW_PAYMENT_TERM_CHANGE_SETTING_KEY, false),
    allowCustomerChangeOnImport: selectAppSettingBool(state, ALLOW_CUSTOMER_CHANGE_ON_IMPORT_SETTING_KEY, false),
    allowDuplicateItem: selectAppSettingBool(state, ALLOW_DUPLICATE_ITEM_SETTING_KEY, true),
    allowBillOverOrderQty: selectAppSettingBool(state, ALLOW_BILL_OVER_ORDER_QTY_SETTING_KEY, false),
    salesmanMandatory: selectAppSettingBool(state, SALESMAN_MANDATORY_SETTING_KEY, false),
    multiOrderBill: selectAppSettingBool(state, MULTI_ORDER_BILL_SETTING_KEY, true),
    autoPopQty: selectAppSettingBool(state, AUTO_POP_QTY_SETTING_KEY, false),
    autoSaveTempBill: selectAppSettingBool(state, AUTO_SAVE_TEMP_BILL_SETTING_KEY, true),
    clearDeliveryOnClear: selectAppSettingBool(state, CLEAR_DELIVERY_ON_CLEAR_SETTING_KEY, false),
    freeItemTax: selectAppSettingBool(state, FREE_ITEM_TAX_SETTING_KEY, false),
    tempCreditMaxDays: selectAppSettingNumber(state, TEMP_CREDIT_MAX_DAYS_SETTING_KEY, 30),
    tempCreditMaxAmount: selectAppSettingNumber(state, TEMP_CREDIT_MAX_AMOUNT_SETTING_KEY, 0),
    tempCreditBlockOpenText: selectAppSettingText(state, TEMP_CREDIT_BLOCK_OPEN_SETTING_KEY),
    weightBarcodeText: selectAppSettingText(state, WEIGHT_BARCODE_SETTING_KEY),
  }), shallowSettingsEqual);
  const settings = useMemo<BillScreenSettings>(
    () => ({
      tenderType: settingsFromStore.tenderType,
      tenderPrintOnly: settingsFromStore.tenderPrintOnly,
      allowExcessTender: settingsFromStore.allowExcessTender,
      allowPaymentTermChange: settingsFromStore.allowPaymentTermChange,
      allowCustomerChangeOnImport: settingsFromStore.allowCustomerChangeOnImport,
      allowDuplicateItem: settingsFromStore.allowDuplicateItem,
      allowBillOverOrderQty: settingsFromStore.allowBillOverOrderQty,
      salesmanMandatory: settingsFromStore.salesmanMandatory,
      multiOrderBill: settingsFromStore.multiOrderBill,
      autoPopQty: settingsFromStore.autoPopQty,
      autoSaveTempBill: settingsFromStore.autoSaveTempBill,
      clearDeliveryOnClear: settingsFromStore.clearDeliveryOnClear,
      freeItemTax: settingsFromStore.freeItemTax,
      tempCreditMaxDays: settingsFromStore.tempCreditMaxDays,
      tempCreditMaxAmount: settingsFromStore.tempCreditMaxAmount,
      tempCreditBlockOpen: tempCreditBlockModeOf(settingsFromStore.tempCreditBlockOpenText),
      weightBarcode: parseWeightBarcodeConfig(settingsFromStore.weightBarcodeText),
    }),
    [settingsFromStore],
  );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // --- the bill's own endpoints -------------------------------------------
  const [saveBill] = useSaveBillMutation();
  const [validateBill] = useValidateBillMutation();
  const [postBillMutation] = usePostBillMutation();
  const [amendBillMutation] = useAmendBillMutation();
  const [cancelBillMutation] = useCancelBillMutation();
  const [deleteBillMutation] = useDeleteBillMutation();
  const autoPost = useAppSelector((state) => selectAppSettingBool(state, AUTO_POST_SETTING_KEY, false));
  const [notesPopupOpen, setNotesPopupOpen] = useState(false);
  const [proceedAsk, setProceedAsk] = useState<{ verb: string } | null>(null);
  const proceedResolver = useRef<((proceed: boolean) => void) | null>(null);
  const [cancelOrderLine] = useCancelOrderLineMutation();
  const [fetchOpenCredits] = useLazyGetOpenCreditsQuery();
  // --- the two import sources ---------------------------------------------
  const [fetchQuotation] = useLazyGetQuotationQuery();
  const [fetchOrder] = useLazyGetSaleOrderQuery();
  // --- holds: one controller, shared with the quotation screen (§12) -------
  const [saveHold] = useSaveTxnHoldMutation();
  const [fetchHold] = useLazyGetTxnHoldQuery();
  const [resumeHoldLock] = useResumeTxnHoldMutation();
  const [releaseHoldLock] = useReleaseTxnHoldMutation();
  const [forceReleaseHoldLock] = useForceReleaseTxnHoldMutation();
  const [convertHoldLock] = useConvertTxnHoldMutation();
  const [busy, setBusy] = useState<SaleBillBusy>("idle");
  /**
   * `busy` cannot guard re-entry on its own: `setBusy` is asynchronous, so two
   * F5 presses inside one render both see "idle". The voucher number is
   * allocated inside the server's create transaction, so a second in-flight
   * save stores a SECOND bill with its own refno.
   */
  const inFlight = useRef(false);
  /**
   * The same guard for Hold, and it matters more: the hold number is minted
   * client-side, so two presses inside one render would not even collide — they
   * would quietly park the cart TWICE under two different numbers.
   */
  const holdInFlight = useRef(false);
  /**
   * The hold this device currently has LOCKED, if any.
   *
   * A ref rather than a value derived from the draft, because the release has to
   * be able to run when the draft is already gone — replaced by another cart,
   * cleared, or unmounted. It carries the scope with it for the same reason: the
   * row's own company / branch, captured when the lease was taken.
   */
  const lockedHold = useRef<{
    txhId: string;
    holdNo: string;
    scope: ReturnType<typeof holdLockScope>;
  } | null>(null);
  const [unitOptions, setUnitOptions] = useState<
    Record<string, ItemUnitOption[]>
  >({});
  /** The live draft, for effects and callbacks that must not re-run when it changes. */
  const draftRef = useRef(draft);
  draftRef.current = draft;
  /** `loadDocument` is declared after the lifecycle verbs that reload through it. */
  const loadDocumentRef = useRef<(key: SaleBillDocKey) => Promise<SaleBillDraft | null>>(
    async () => null,
  );
  /** Set below; held in a ref so the unit-prefetch effect has a stable dep list. */
  const loadUnitOptionsRef = useRef<(itemId: string) => Promise<void>>(
    async () => {},
  );
  // -------------------------------------------------------------------------
  // Context seeding
  // -------------------------------------------------------------------------

  // The draft is created before the business context resolves (the screen must
  // render something), so the tenant scope is pushed in as it arrives. This is
  // deliberately not an edit: it must not mark the document dirty.
  const seededTenant = useRef("");
  useEffect(() => {
    if (!context.companyId || !context.branchId || !context.accYear) {
      return;
    }
    const signature = `${context.companyId}|${context.branchId}|${context.accYear}`;
    if (seededTenant.current === signature) {
      return;
    }
    const firstSeed = seededTenant.current === "";
    seededTenant.current = signature;
    // Populated lines, not `lines.length`: the grid always carries one trailing
    // blank row, which is not work worth protecting.
    const hasWork = draftRef.current.lines.some((line) => Boolean(line.itemId));
    if (!firstSeed && (draftRef.current.isDirty || hasWork)) {
      // Re-tenanting a bill in flight would leave company A's prices, freight
      // and loading on a document stamped for company B, flip its tax basis
      // underneath the operator, and — because the accounting year is half the
      // primary key — file it in the wrong partition.
      toast.info(
        "The company, branch or year changed. This bill keeps the one it was started in — clear it (F7) to start in the new context.",
      );
      return;
    }
    dispatch(
      tenantSet({
        companyId: context.companyId,
        branchId: context.branchId,
        accYear: context.accYear,
      }),
    );
  }, [context.companyId, context.branchId, context.accYear, dispatch]);
  /**
   * The company's own state, which is also the DEFAULT place of supply (§5).
   *
   * The company master carries `comp_state_code` and no state NAME, so the name
   * is read back off the POS dropdown (21, "GST - STATE CODES") — the same list
   * the operator would pick from. `sb_state_name` is a print snapshot, so a name
   * that never resolves costs the document nothing; the code is what decides the
   * tax.
   */
  useEffect(() => {
    if (!companyStateCode) {
      return;
    }
    let cancelled = false;
    dispatch(companyStateSet({ stateCode: companyStateCode }));
    void (async () => {
      try {
        const page = await runDropdown({
          dropdownId: getDropdownId(POS_DROPDOWN_KEY),
          search: companyStateCode,
          limit: 25,
        }).unwrap();
        const match = (page.items ?? []).find(
          (row) => String(row.state_code ?? "").trim() === companyStateCode,
        );
        const stateName = match ? String(match.state_name ?? "").trim() : "";
        if (!cancelled && stateName) {
          dispatch(companyStateSet({ stateCode: companyStateCode, stateName }));
        }
      } catch {
        // The code alone decides the tax; only the printed name is missing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyStateCode, dispatch, runDropdown]);
  // -------------------------------------------------------------------------
  // Grid layout
  // -------------------------------------------------------------------------
  const itemColumns = useMemo(
    () =>
      resolveItemColumnsWith(
        itemLayout,
        SALE_BILL_ITEM_COLUMN_MEANINGS,
        SALE_BILL_ITEM_COLUMN_WIDTH_UNIT,
        SALE_BILL_ITEM_COLUMN_NUMBERS,
        // Table 22 has no Size row of its own; the cell is spliced in after
        // Description so §7.4's size → CFT → Bill Qty conversion is reachable.
        SALE_BILL_INJECTED_ITEM_COLUMNS,
      ),
    [itemLayout],
  );
  const chargeColumns = useMemo(
    () => resolveChargeColumns(chargeLayout),
    [chargeLayout],
  );
  // A layout that has grown or shrunk server-side means the local meaning list
  // no longer describes table 22, and every column past the change is mislabelled
  // — a Rate cell painting a discount. Warned rather than thrown: a mislabelled
  // grid is still usable, and refusing to open the screen over a column count
  // would be worse than telling whoever can fix it.
  const warnedLayout = useRef(false);
  useEffect(() => {
    if (!itemLayout || warnedLayout.current) {
      return;
    }
    if (itemLayout.length !== SALE_BILL_ITEM_COLUMN_COUNT) {
      warnedLayout.current = true;
      console.warn(
        `[sale-bill] ui table ${itemUiTableId} returned ${itemLayout.length} columns; ` +
          `this client maps ${SALE_BILL_ITEM_COLUMN_COUNT}. Columns it cannot name are dropped.`,
      );
    }
  }, [itemLayout, itemUiTableId]);
  const priceLevelOptions = useMemo(
    () =>
      priceLevelNames.length > 0
        ? priceLevelNames
        : PRICE_LEVEL_OPTIONS.map((option) => ({ ...option })),
    [priceLevelNames],
  );
  const canEditPrice = capabilities?.editRate ?? SESSION_CAPABILITIES.editPrice;
  const regional =
    isRegionalLanguage(capabilities?.language) ?? SESSION_CAPABILITIES.regional;
  // -------------------------------------------------------------------------
  // The engine
  // -------------------------------------------------------------------------

  /**
   * The whole screen below the header, in one derived value.
   *
   * A loaded document paints its own stored figures until the first edit flips
   * `pricing` to `live`; from then on the engine runs, under the *document's*
   * policy snapshot rather than the current session settings — which is how a
   * reopened bill keeps the numbers it was raised with.
   *
   * `isLocalSale` comes off the draft, where `posSet` / `customerApplied` keep it
   * in step with the PLACE OF SUPPLY (§5) — never off the customer lookup's
   * `local_sales`, which is only the fallback for a customer master with no
   * state at all.
   */
  const livePricing = useMemo(
    () =>
      recalcDocument(draft.lines, draft.charges, draft.policy, {
        isLocalSale: draft.isLocalSale,
        hasFreight: draft.header.hasFreight,
        hasLoad: draft.header.hasLoad,
        hasUnload: draft.header.hasUnload,
      }),
    [
      draft.lines,
      draft.charges,
      draft.policy,
      draft.isLocalSale,
      draft.header.hasFreight,
      draft.header.hasLoad,
      draft.header.hasUnload,
    ],
  );
  const pricing =
    draft.pricing === "stored" && draft.storedPricing
      ? draft.storedPricing
      : livePricing;
  /**
   * The same figures, for the callbacks that must not re-bind on every keystroke
   * — Hold and the autosave timer both fire against whatever is on screen when
   * they run, not against whatever was there when they were created.
   */
  const pricingRef = useRef(pricing);
  pricingRef.current = pricing;
  // -------------------------------------------------------------------------
  // Auto-apply charges (§6)
  // -------------------------------------------------------------------------
  const autoApplyCharges = useMemo(
    () =>
      chargeMasters.filter(
        (master) => master.chgAutoApply && master.chgIsActive,
      ),
    [chargeMasters],
  );
  // Re-derived from the draft rather than run once on the masters: the masters
  // load exactly once, so an effect keyed only on them would seed the first bill
  // of the session and leave every one opened by Clear empty. Every guard about
  // *whether* to seed lives in the reducer, which is why this only has to say
  // "the masters are here".
  const needsAutoCharges =
    draft.mode === "entry" &&
    draft.isNewEntry &&
    !draft.docId &&
    !draft.isDirty &&
    !draft.charges.some((row) => row.chgId);
  useEffect(() => {
    if (needsAutoCharges && autoApplyCharges.length > 0) {
      dispatch(autoChargesSeeded(autoApplyCharges));
    }
  }, [needsAutoCharges, autoApplyCharges, dispatch]);
  // -------------------------------------------------------------------------
  // Units
  // -------------------------------------------------------------------------
  const loadUnitOptions = useCallback(
    async (itemId: string): Promise<void> => {
      if (!itemId || unitOptions[itemId]) {
        return;
      }
      try {
        const options = await fetchItemUnits(itemId).unwrap();
        setUnitOptions((current) => ({ ...current, [itemId]: options }));
      } catch {
        // A missing unit list only costs the Uom dropdown its options; the line
        // already holds the conversion the price lookup resolved.
      }
    },
    [fetchItemUnits, unitOptions],
  );
  loadUnitOptionsRef.current = loadUnitOptions;
  // A loaded bill's lines were never picked in this session, so their unit lists
  // have not been fetched — without this the Uom dropdown on a reloaded line
  // offers only the unit it already has.
  const lineItemIds = draft.lines
    .map((line) => line.itemId)
    .filter(Boolean)
    .join("|");
  useEffect(() => {
    for (const itemId of new Set(lineItemIds.split("|").filter(Boolean))) {
      void loadUnitOptionsRef.current(itemId);
    }
  }, [lineItemIds]);
  const unitOptionsFor = useCallback(
    (itemId: string): ItemUnitOption[] => unitOptions[itemId] ?? [],
    [unitOptions],
  );
  // -------------------------------------------------------------------------
  // Item pricing
  // -------------------------------------------------------------------------
  /** Every `/item-price` call quotes the DOCUMENT's scope, never the session's. */
  const priceQueryFor = useCallback(
    (
      line: SaleBillDraftLine | undefined,
      itemId: string,
      itemUnitId: string | undefined,
      priceLevel: number,
    ): ItemPriceQuery => ({
      item_id: itemId,
      price_level: clampPriceLevel(priceLevel),
      ...(itemUnitId ? { unit_id: itemUnitId } : {}),
      ...(draft.companyId ? { company_id: draft.companyId } : {}),
      ...(draft.branchId ? { branch_id: draft.branchId } : {}),
      ...(draft.customer.custId ? { customer_id: draft.customer.custId } : {}),
      ...(line?.godownId ? { godown_id: line.godownId } : {}),
      ...(draft.accYear ? { acccyear: draft.accYear } : {}),
      loading_type: clampLoadingType(draft.policy.loadingCalcType),
      freight_type: clampFreightType(draft.policy.freightCalcType),
      regional,
    }),
    [
      draft.companyId,
      draft.branchId,
      draft.customer.custId,
      draft.accYear,
      draft.policy.loadingCalcType,
      draft.policy.freightCalcType,
      regional,
    ],
  );
  /**
   * Price one line from the item master.
   *
   * This is also the ONLY path that establishes the negative-stock gate (§7.2):
   * `allow_negative_stock` and today's `stock` both come back on this payload,
   * and `applyBillItemPrice` marks the line resolved. A line filled any other
   * way — loaded, imported — stays unresolved until it has been through here,
   * which is what stops the gate answering from a month-old snapshot.
   */
  const pickItem = useCallback(
    async (
      lineKey: string,
      itemId: string,
      itemUnitId?: string,
      pending: PendingScanValue | null = null,
    ) => {
      const line = draft.lines.find((row) => row.key === lineKey);
      const level = line?.priceLevel ?? draft.header.priceLevel;
      setBusy("pricing");
      try {
        const lookup = await fetchItemPrice(
          priceQueryFor(line, itemId, itemUnitId, level),
        ).unwrap();
        // Applied by `lineUid`, never by a row index captured across the
        // await (§5.4): a delete in between would price the wrong line.
        dispatch(
          itemPriceApplied({
            key: lineKey,
            lookup,
            autoPopQty: settingsRef.current.autoPopQty,
            pending,
          }),
        );
        void loadUnitOptions(itemId);
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setBusy("idle");
      }
    },
    [
      draft.lines,
      draft.header.priceLevel,
      dispatch,
      fetchItemPrice,
      loadUnitOptions,
      priceQueryFor,
    ],
  );
  /**
   * Recover a loaded line's real unit-conversion factor.
   *
   * The factor is not persisted and cannot be back-derived on a line with no
   * case quantity, so such a line loads with a placeholder 1. Keying a Case Qty
   * against that placeholder would bill `caseQty × 1` instead of `caseQty × 12`
   * — a fraction of the correct money, on the document that takes it. Only the
   * factor is taken; nothing else on the line is touched, so this is not a
   * repricing and it does not resolve the stock gate.
   */
  const recoverBaseFactor = useCallback(
    async (lineKey: string) => {
      const line = draftRef.current.lines.find((row) => row.key === lineKey);
      if (!line?.itemId || line.toBaseFactorKnown) {
        return;
      }
      try {
        const lookup = await fetchItemPrice(
          priceQueryFor(line, line.itemId, line.itemUnitId, line.priceLevel),
        ).unwrap();
        dispatch(
          lineFieldSet({
            key: lineKey,
            field: "toBaseFactor",
            value: lookup.base_factor || 1,
          }),
        );
        dispatch(
          lineFieldSet({
            key: lineKey,
            field: "toBaseFactorKnown",
            value: true,
          }),
        );
      } catch (error) {
        toast.error(
          `Could not read the unit conversion for ${line.itemName || "this line"}: ${errorMessage(error)}. Re-pick the item before keying a case quantity.`,
        );
      }
    },
    [dispatch, fetchItemPrice, priceQueryFor],
  );
  const setLineUnit = useCallback(
    async (lineKey: string, itemUnitId: string) => {
      const line = draft.lines.find((row) => row.key === lineKey);
      if (!line?.itemId) {
        return;
      }
      await pickItem(lineKey, line.itemId, itemUnitId);
    },
    [draft.lines, pickItem],
  );
  /**
   * F4. The backend owns the unit cycle: it returns the next `iuc_id` and no
   * price, so nothing is scaled client-side and nothing is written to the line
   * until the follow-up price lookup returns.
   */
  const switchUnit = useCallback(
    async (lineKey: string) => {
      const line = draft.lines.find((row) => row.key === lineKey);
      if (!line?.itemId || !line.itemUnitId) {
        return;
      }
      setBusy("pricing");
      try {
        const next = await fetchNextUnit({
          item_id: line.itemId,
          iuc_id: line.itemUnitId,
        }).unwrap();
        const lookup = await fetchItemPrice(
          priceQueryFor(line, line.itemId, next.iuc_id, line.priceLevel),
        ).unwrap();
        dispatch(itemPriceApplied({ key: lineKey, lookup }));
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setBusy("idle");
      }
    },
    [draft.lines, dispatch, fetchItemPrice, fetchNextUnit, priceQueryFor],
  );
  /**
   * A scan into an empty line's Barcode cell (§9.2). A weight/price label is
   * split first: its item code goes to the lookup and its VALUE waits, landing
   * only after the price lookup has filled the line — WEIGHT into the
   * quantity, PRICE into the rate — because applied earlier the lookup would
   * overwrite it. `company_id` is always sent.
   */
  const resolveBarcode = useCallback(
    async (lineKey: string, barcode: string): Promise<boolean> => {
      const trimmed = barcode.trim();
      if (!trimmed) {
        return false;
      }
      const decoded = decodeWeightBarcode(trimmed, settingsRef.current.weightBarcode);
      const code = decoded ? decoded.itemCode : trimmed;
      setBusy("pricing");
      try {
        const scanned = await fetchBarcode({ barcode: code, company_id: draft.companyId }).unwrap();
        if (!scanned.allowSales) {
          toast.warn(`${scanned.itemName} is not available for sale.`);
          return false;
        }
        // The barcode lookup's `unitId` is an `iuc_id`, which `/item-price`
        // accepts directly.
        const line = draft.lines.find((row) => row.key === lineKey);
        const lookup = await fetchItemPrice(
          priceQueryFor(
            line,
            scanned.itemId,
            scanned.unitId,
            line?.priceLevel ?? draft.header.priceLevel,
          ),
        ).unwrap();
        dispatch(
          itemPriceApplied({
            key: lineKey,
            lookup,
            autoPopQty: settingsRef.current.autoPopQty,
            pending: decoded?.pending ?? null,
          }),
        );
        void loadUnitOptions(scanned.itemId);
        return true;
      } catch (error) {
        if (errorStatusOf(error) === 404) {
          toast.error(`No item carries barcode ${trimmed}.`);
        } else {
          toast.error(errorMessage(error));
        }
        return false;
      } finally {
        setBusy("idle");
      }
    },
    [
      draft.companyId,
      draft.lines,
      draft.header.priceLevel,
      dispatch,
      fetchBarcode,
      fetchItemPrice,
      loadUnitOptions,
      priceQueryFor,
    ],
  );
  /**
   * Ctrl+1..N / the price-level combo. Changing a level is not a local edit:
   * each affected line has to be repriced from the server at the new level, and
   * only "Apply to All" commits the document's own level.
   */
  const applyPriceLevel = useCallback(
    async (priceLevel: number, scope: PriceLevelScope, lineKeys: string[]) => {
      if (!canEditPrice) {
        toast.warn("You do not have permission to change prices.");
        return;
      }
      const level = clampPriceLevel(priceLevel);
      const targets =
        scope === "all"
          ? draft.lines.filter((line) => line.itemId).map((line) => line.key)
          : lineKeys.filter((key) =>
              draft.lines.some((line) => line.key === key && line.itemId),
            );
      if (targets.length === 0) {
        return;
      }
      dispatch(
        linePriceLevelSet({
          keys: targets,
          priceLevel: level,
          commitDocument: scope === "all",
        }),
      );
      setBusy("pricing");
      try {
        for (const key of targets) {
          const line = draft.lines.find((row) => row.key === key);
          if (!line?.itemId) {
            continue;
          }
          try {
            const lookup = await fetchItemPrice(
              priceQueryFor(line, line.itemId, line.itemUnitId, level),
            ).unwrap();
            dispatch(itemPriceApplied({ key, lookup }));
          } catch (error) {
            toast.error(`${line.itemName || "A line"}: ${errorMessage(error)}`);
          }
        }
      } finally {
        setBusy("idle");
      }
    },
    [canEditPrice, draft.lines, dispatch, fetchItemPrice, priceQueryFor],
  );
  // -------------------------------------------------------------------------
  // Customer
  // -------------------------------------------------------------------------
  const customerChangeCost = useMemo(() => customerChangeCosts(draft), [draft]);
  const releaseCustomerBoundState = useCallback(() => {
    dispatch(customerBoundStateCleared());
  }, [dispatch]);
  /**
   * Apply a customer, and fetch the two things that hang off them: the freight
   * bands for their distance and their credit standing (§4.2).
   *
   * The caller is responsible for having asked first when `customerChangeCost`
   * says the change costs something — the reducer refuses outright while it
   * does, so a screen that forgets gets a no-op rather than a silent loss.
   *
   * `seed: true` is the walk-in default a new bill opens on rather than the
   * operator's own pick: same lookup, same two follow-ups, but it applies
   * through `walkInCustomerSeeded`, which refuses on anything but a blank new
   * bill and leaves the draft pristine. Nothing about it is sticky — the
   * operator picking a real customer is an ordinary call and replaces it.
   */
  /**
   * `/bills/party-context` for the customer on the bill (§7.3). Guarded by
   * the thing it was asked for — the reducer drops a reply for another
   * customer (§5.4). A failure never blocks billing: it clears the panel and
   * `/validate` stays the authority.
   */
  const readPartyContext = useCallback(
    async (target: { custId: string | null; companyId: string; branchId: string; accYear: string; billDate: string }) => {
      if (!target.custId || !target.companyId || !target.branchId) {
        dispatch(partyContextSet(null));
        return;
      }
      try {
        const context = await fetchPartyContext({
          partyId: target.custId,
          companyId: target.companyId,
          branchId: target.branchId,
          accYear: target.accYear,
          billDate: target.billDate,
        }).unwrap();
        dispatch(partyContextSet(context));
        // The one popup per OPERATOR pick (§7.4): a loaded bill and a seed
        // stay silent. Consumed whether or not there was anything to say.
        const current = draftRef.current;
        if (current.creditAlertPending && current.customer.custId === context.partyId) {
          const message = creditAlertMessage(context);
          dispatch(creditAlertConsumed());
          if (message) {
            toast.warn(message);
          }
        }
      } catch {
        dispatch(partyContextSet(null));
      }
    },
    [dispatch, fetchPartyContext],
  );
  const refreshPartyContext = useCallback(async () => {
    const current = draftRef.current;
    await readPartyContext({
      custId: current.customer.custId,
      companyId: current.companyId,
      branchId: current.branchId,
      accYear: current.accYear,
      billDate: current.header.billDate,
    });
  }, [readPartyContext]);
  const applyCustomer = useCallback(
    async (customerId: string, options: { seed?: boolean } = {}) => {
      const seeding = options.seed === true;
      if (!customerId) {
        return;
      }
      if (!draft.companyId || !draft.branchId) {
        if (!seeding) {
          toast.warn(
            "The company and branch are still loading — try again in a moment.",
          );
        }
        return;
      }
      // The seed is the screen opening, not a keystroke waiting on an answer:
      // blocking the whole form behind `busy` while it runs would make a fresh
      // bill unusable for the length of a lookup nobody asked for.
      if (!seeding) {
        setBusy("loading");
      }
      // Both reads fire in parallel and each writes its OWN fields (§7.1):
      // customer-detail the address, the state and the option ticks;
      // party-context the standing, the loyalty membership and `creditAllowed`.
      const partyRead = readPartyContext({
        custId: customerId,
        companyId: draft.companyId,
        branchId: draft.branchId,
        accYear: draft.accYear,
        billDate: draft.header.billDate,
      });
      try {
        const detail = await fetchCustomerDetail({
          cus_id: customerId,
          company_id: draft.companyId,
          branch_id: draft.branchId,
          regional,
        }).unwrap();
        // The term is forced to the party's unless the branch allows a change
        // AND the bill has a source document (§7.2).
        const forceTerm = termForcedToParty(
          settingsRef.current.allowPaymentTermChange,
          Boolean(draftRef.current.source),
        );
        dispatch(seeding ? walkInCustomerSeeded(detail) : customerApplied({ detail, forceTerm }));
        // Freight bands are only worth fetching when the distance actually
        // changed and the policy is not manual (§9.3).
        const distance = detail.distance_km;
        const distanceChanged = distance !== draft.customer.distanceKm;
        const manualFreight =
          draft.policy.freightCalcType.trim().toUpperCase() === "MANUAL";
        if (
          distance !== null &&
          distance >= 0 &&
          distanceChanged &&
          !manualFreight
        ) {
          try {
            const bands = await fetchFreightBands(
              Math.trunc(distance),
            ).unwrap();
            dispatch(freightBandsSet(bands));
          } catch {
            // No band for this distance is an ordinary answer, not an error.
          }
        }
      } catch (error) {
        // A seed that fails costs the bill nothing the operator cannot do
        // themselves — the picker is simply empty, which is where a bill
        // started before there was a default at all. It is not toasted for
        // that reason, and it IS logged: an id that names no customer is a
        // mis-set `sales.default_customer_id`, and the console is where that
        // shows up rather than in front of whoever is billing.
        if (seeding) {
          console.warn(
            `[sale-bill] the walk-in customer (${customerId}) could not be read: ${errorMessage(error)}`,
          );
        } else {
          toast.error(errorMessage(error));
        }
      } finally {
        if (!seeding) {
          setBusy("idle");
        }
      }
      await partyRead;
    },
    [
      draft.companyId,
      draft.branchId,
      draft.accYear,
      draft.header.billDate,
      draft.customer.distanceKm,
      draft.policy.freightCalcType,
      dispatch,
      fetchCustomerDetail,
      fetchFreightBands,
      readPartyContext,
      regional,
    ],
  );
  const pickCustomer = useCallback(
    (customerId: string) => applyCustomer(customerId),
    [applyCustomer],
  );
  // -------------------------------------------------------------------------
  // The walk-in customer (§4.1)
  // -------------------------------------------------------------------------
  /**
   * The party a new bill opens on, from the two settings the catalog states it
   * with. Both are resolved for THIS session's scope by `SessionAppSettings`,
   * so a till that names its own walk-in gets its own.
   */
  const walkInCustomerId = useAppSelector((state) =>
    resolveWalkInCustomerId(
      selectAppSettingBool(state, WALK_IN_CUSTOMER_ENABLED_SETTING_KEY, true),
      selectAppSettingText(state, WALK_IN_CUSTOMER_ID_SETTING_KEY),
    ),
  );
  /** Held in a ref so the effect below does not re-fire on every keystroke. */
  const applyCustomerRef = useRef(applyCustomer);
  applyCustomerRef.current = applyCustomer;
  /**
   * Seeded from the DRAFT rather than once on mount, exactly like the
   * auto-apply charges above: Clear opens another blank bill, and an effect
   * keyed only on the setting would seed the first bill of the session and
   * leave every one after it on an empty picker. Every guard about *whether* to
   * seed lives in `shouldSeedWalkInCustomer`, which the reducer re-checks — so
   * this only has to say "there is an id to seed with, and nothing is already
   * out asking for it".
   *
   * The in-flight ref is not the reducer's job: the lookup is a round trip, and
   * the draft it guards on is still blank while the request is out.
   *
   * A failure is not retried on the spot — the deps have not moved — so a
   * mis-set id costs one lookup per bill and nothing else.
   */
  const seedingWalkIn = useRef(false);
  const needsWalkInCustomer = shouldSeedWalkInCustomer(draft);
  useEffect(() => {
    if (!needsWalkInCustomer || !walkInCustomerId || seedingWalkIn.current) {
      return;
    }
    seedingWalkIn.current = true;
    void (async () => {
      try {
        await applyCustomerRef.current(walkInCustomerId, { seed: true });
      } finally {
        seedingWalkIn.current = false;
      }
    })();
  }, [needsWalkInCustomer, walkInCustomerId]);
  // -------------------------------------------------------------------------
  // Document lifecycle
  // -------------------------------------------------------------------------
  /** Clear (F7) in every state = start a new bill (§17.11). */
  const clear = useCallback(() => {
    dispatch(
      draftReplaced(
        resetBillDraft(
          draftRef.current,
          {
            companyId: context.companyId,
            branchId: context.branchId,
            accYear: context.accYear,
            companyStateCode,
            companyStateName: draftRef.current.companyStateName,
          },
          // A trip bills many customers with the same van (§7.9).
          { keepCrew: !settingsRef.current.clearDeliveryOnClear },
        ),
      ),
    );
  }, [
    companyStateCode,
    context.accYear,
    context.branchId,
    context.companyId,
    dispatch,
  ]);
  const copyAsNew = useCallback(() => {
    dispatch(
      draftReplaced(
        copyBillDraftAsNew(draftRef.current, todayIso(), nowStamp()),
      ),
    );
    // Re-read party-context, silently (§17.10).
    void refreshPartyContext();
  }, [dispatch, refreshPartyContext]);
  // -------------------------------------------------------------------------
  // The quick strip (§6.2)
  // -------------------------------------------------------------------------
  const discountAll = useCallback(
    (perc: number) => {
      dispatch(discountAppliedToAll(perc));
    },
    [dispatch],
  );
  const adjustPrices = useCallback(
    (perc: number) => {
      dispatch(pricesAdjusted(perc));
    },
    [dispatch],
  );
  const lineCostText = useCallback((lineKey: string | null): string | null => {
    const line = lineKey ? draftRef.current.lines.find((row) => row.key === lineKey) : null;
    if (!line?.itemId) {
      return null;
    }
    const money = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${line.itemName}\nCost: ₹${money(line.costPrice)} · Cost (pre-tax): ₹${money(line.costBeforeTax)}`;
  }, []);
  /**
   * Edit (F2). A CANCELLED bill is never edited; a POSTED one is amended
   * (§17.8), and the screen routes that through `beginAmend`; a read-only
   * DRAFT simply opens.
   */
  const beginEdit = useCallback(() => {
    if (draft.isDeleted || draft.status === "CANCELLED") {
      toast.warn("A cancelled bill can't be edited — raise a new one.");
      return;
    }
    if (draft.status === "POSTED") {
      toast.info("A posted bill is corrected with Edit — it keeps its number and date.");
      return;
    }
    dispatch(modeSet("entry"));
  }, [draft.isDeleted, draft.status, dispatch]);
  // -------------------------------------------------------------------------
  // Adjustments (§10)
  // -------------------------------------------------------------------------
  /**
   * The credits this customer holds, for the adjustment panel.
   *
   * Re-read rather than cached: another counter may have spent one since the
   * panel was last opened, and the ceiling this list reports is what the
   * operator adjusts against. The endpoint takes NO accounting year — credits
   * are never carried forward, so a March advance really does settle an April
   * invoice, and each row reports its own.
   */
  const refreshOpenCredits = useCallback(async (): Promise<
    AdjustableCredit[]
  > => {
    const current = draftRef.current;
    if (!current.customer.custId || !current.companyId) {
      dispatch(openCreditsSet([]));
      return [];
    }
    try {
      const credits = await fetchOpenCredits({
        partyId: current.customer.custId,
        companyId: current.companyId,
      }).unwrap();
      dispatch(openCreditsSet(credits));
      return credits;
    } catch (error) {
      // An empty panel is honest; a stale one is not. The operator is told,
      // because "no credits" and "could not ask" are different facts.
      toast.warn(
        `Could not read this customer's credits: ${errorMessage(error)}`,
      );
      dispatch(openCreditsSet([]));
      return [];
    }
  }, [dispatch, fetchOpenCredits]);
  const applyAdjustments = useCallback(
    (rows: BillAdjustmentRow[], from: "bill" | "tender") => {
      const candidate: SaleBillDraft = {
        ...draftRef.current,
        adjustments: rows,
      };
      const violation = validateAdjustments(
        candidate,
        pricingRef.current.totals.bill,
      );
      if (violation) {
        toast.error(violation.message);
        return false;
      }
      dispatch(adjustmentsApplied({ rows, from }));
      return true;
    },
    [dispatch],
  );
  // -------------------------------------------------------------------------
  // Validate and save
  // -------------------------------------------------------------------------
  /** Close a parked cart against the document it became. Never fatal. */
  const convertHoldIfAny = useCallback(
    async (docId: string, accYear: string, refno: string | null) => {
      const holdId = draftRef.current.holdId;
      if (!holdId) {
        return;
      }
      const scope =
        lockedHold.current?.txhId === holdId ? lockedHold.current.scope : null;
      lockedHold.current = null;
      const deviceId = actor.deviceMasterId;
      if (!deviceId) {
        toast.warn(
          "Saved, but the hold could not be closed: this browser has no device id.",
        );
        return;
      }
      try {
        await convertHoldLock({
          txhId: holdId,
          deviceId,
          scope: scope ?? {
            txhCompanyId: draftRef.current.companyId,
            txhBranchId: draftRef.current.branchId,
            txhAccYear: draftRef.current.accYear,
          },
          conversion: {
            txhConvertedDocId: docId,
            txhConvertedAccYear: accYear,
            txhConvertedRefno: refno,
            txhConvertedBy: actor.userId || null,
          },
        }).unwrap();
      } catch {
        // The bill is saved. A hold left open is a housekeeping problem, not a
        // reason to tell the operator their sale failed.
      }
      dispatch(holdSet({ holdId: null, holdNo: "" }));
    },
    [actor.deviceMasterId, actor.userId, convertHoldLock, dispatch],
  );
  const validate = useCallback(
    (extra: BillValidationContext = {}) =>
      validateSaveInputs(draft, pricing, {
        skipMrp: SESSION_CAPABILITIES.skipMrp,
        allowBillOverOrderQty: settings.allowBillOverOrderQty,
        salesmanMandatory: settings.salesmanMandatory,
        allowExcessTender: settings.allowExcessTender,
        freeItemTax: settings.freeItemTax,
        ...extra,
      }),
    [draft, pricing, settings],
  );
  /**
   * The tender route (§15.1): `all_bills`, or `cash_bills` on a non-credit
   * term. An amend never re-opens the tender from Save.
   */
  const tenderRoute =
    !draft.amending &&
    (settings.tenderType === "all_bills" ||
      (settings.tenderType === "cash_bills" && draft.header.billType !== "CREDIT"));
  // -------------------------------------------------------------------------
  // The lifecycle (§16, §17): save, validate, post, amend, cancel, delete
  // -------------------------------------------------------------------------
  //
  // The one line that shapes all of it: the client prices the bill and settles
  // it, the SERVER decides whether it may post. Every rule that can refuse a
  // bill is a `/validate` answer painted in the strip, never a verdict
  // recomputed here; the client's own checks exist only so the operator hears
  // about a zero quantity before a round trip.
  //
  // Post saves first. `/bills/post` takes only the keys, so it posts what the
  // server holds, not what the screen shows. Every post path is therefore
  // create → validate → post, and auto-post validates BEFORE create so a
  // refused bill leaves no draft and burns no number.

  /**
   * `confirmProceed(verb)` (§16.4): with notes in the strip, the Validation
   * popup asks Back or the verb; a refusal offers only Back. With no notes it
   * answers yes without showing anything.
   */
  const confirmProceed = useCallback((verb: string): Promise<boolean> => {
    if (draftRef.current.notes.length === 0) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      proceedResolver.current = resolve;
      setProceedAsk({ verb });
    });
  }, []);
  const answerProceed = useCallback((proceed: boolean) => {
    setProceedAsk(null);
    const resolve = proceedResolver.current;
    proceedResolver.current = null;
    resolve?.(proceed);
  }, []);

  const toggleOverride = useCallback((code: string) => dispatch(overrideToggled(code)), [dispatch]);
  const clearNotes = useCallback(() => dispatch(notesCleared()), [dispatch]);

  /**
   * One `/validate` round trip, painted (§16.1). A 422 is the ANSWER: its
   * refusals go in the strip and the generic error box stays shut. Anything
   * else (the server away) is reported as unreachable, and the caller decides
   * whether a sale may go on without the answer.
   */
  const runServerValidation = useCallback(
    async (payload: ReturnType<typeof buildSavePayload>, options: { popupOnRefusal: boolean }): Promise<ServerValidation> => {
      try {
        const result = await validateBill(buildValidateBody(payload, draftRef.current.overrides)).unwrap();
        const notes = parseValidationNotes({ data: result });
        dispatch(notesSet({ notes, rights: parseValidateRights({ data: result }) }));
        if (notes.some((note) => note.isRefusal)) {
          if (options.popupOnRefusal) {
            setNotesPopupOpen(true);
          }
          return { status: "refused" };
        }
        return { status: "ok", warnings: notes.length };
      } catch (error) {
        const notes = notesFromError(error);
        if (errorStatusOf(error) === 422 || notes.length > 0) {
          dispatch(notesSet({ notes }));
          if (options.popupOnRefusal) {
            setNotesPopupOpen(true);
          }
          return { status: "refused" };
        }
        return { status: "unreachable", message: errorMessageOf(error) };
      }
    },
    [dispatch, validateBill],
  );

  const canPostOnThisDevice = Boolean(actor.deviceMasterId);
  /** §3.3 — the browser must not invent a device id. */
  const refusePostWithoutDevice = useCallback((): boolean => {
    if (canPostOnThisDevice) {
      return false;
    }
    toast.error(
      "Posting is not possible on this device — the login did not return a registered device. Sign in at a registered counter to post.",
    );
    return true;
  }, [canPostOnThisDevice]);

  /** The screen after a bill is written: the autosave gone, the hold closed, a fresh bill. */
  const finishDocument = useCallback(
    async (ref: SavedBillRef) => {
      await convertHoldIfAny(ref.sbId, ref.sbAccYear, ref.billRefno);
      void clearAutosave(actor.deviceId ?? "");
      dispatch(notesCleared());
      clear();
    },
    [actor.deviceId, clear, convertHoldIfAny, dispatch],
  );

  const refOf = (saved: { sbId: string; sbCompanyId: string; sbBranchId: string; sbAccYear: string; sbBillRefno: string | null }): SavedBillRef => ({
    sbId: saved.sbId,
    sbCompanyId: saved.sbCompanyId,
    sbBranchId: saved.sbBranchId,
    sbAccYear: saved.sbAccYear,
    billRefno: saved.sbBillRefno,
  });

  /**
   * A failed auto-post leaves nothing behind (§17.6): the draft the post was
   * attempted on is deleted, and ONE dialog says so — not the strip's popup
   * plus this one.
   */
  const discardFailedAutoPost = useCallback(
    async (key: BillKey, reason: string) => {
      const refno = draftRef.current.billRefno || "this bill";
      try {
        await deleteBillMutation(key).unwrap();
        dispatch(draftDisowned());
        toast.error(
          `The bill could NOT be posted:\n\n${reason}\n\nNothing was saved — correct it and press Save again.`,
        );
      } catch {
        toast.error(
          `Bill ${refno} is saved as a DRAFT but was NOT posted:\n\n${reason}\n\nCorrect it and press Save again — it posts this same bill, it does not create another.`,
        );
      }
    },
    [deleteBillMutation, dispatch],
  );

  /**
   * `POST /bills/post` on a saved draft (§17.5). No second validate: the
   * caller has just run one. `adjustments` ride along whenever the draft has
   * them, or the server picks the party's oldest credits instead (§14.4).
   */
  const postNow = useCallback(
    async (key: BillKey, print: boolean): Promise<SaveOutcome> => {
      const current = draftRef.current;
      const body = buildPostBody(key, {
        overrides: current.overrides,
        adjustments: adjustmentsForWire(current),
        printAfter: print,
      });
      try {
        const posted = await postBillMutation(body).unwrap();
        const refno = posted.sbBillRefno ?? current.billRefno ?? "";
        const voucher = posted.posting?.voucherRefno;
        toast.success(voucher ? `Bill ${refno} posted — voucher ${voucher}.` : `Bill ${refno} posted.`);
        const ref = refOf(posted);
        await finishDocument(ref);
        return { status: "posted", ref };
      } catch (error) {
        const notes = notesFromError(error);
        const reason = errorMessageOf(error);
        if (notes.length > 0) {
          dispatch(notesSet({ notes }));
        }
        if (current.draftFromAutoPost) {
          await discardFailedAutoPost(key, reason);
          return { status: "refused" };
        }
        if (notes.length > 0) {
          setNotesPopupOpen(true);
        } else {
          // The generic error only when the strip stayed empty.
          toast.error(reason);
        }
        return notes.length > 0 ? { status: "refused" } : { status: "failed" };
      }
    },
    [discardFailedAutoPost, dispatch, finishDocument, postBillMutation],
  );

  /** `/create` → adopt the key. A retry then updates instead of duplicating. */
  const createDraft = useCallback(
    async (payload: ReturnType<typeof buildSavePayload>, fromAutoPost: boolean) => {
      const saved = await saveBill(payload).unwrap();
      if (!saved.sbId) {
        return null;
      }
      dispatch(draftAdopted({ payload: saved, fromAutoPost }));
      return saved;
    },
    [dispatch, saveBill],
  );

  /**
   * Auto-post, new bill (§17.5): validate → confirm → create → adopt → post.
   * Validating BEFORE the create is what keeps a refused bill from leaving a
   * draft behind and burning a number.
   */
  const postNewBill = useCallback(
    async (payload: ReturnType<typeof buildSavePayload>, print: boolean): Promise<SaveOutcome> => {
      const validation = await runServerValidation(payload, { popupOnRefusal: false });
      if (validation.status === "refused") {
        setNotesPopupOpen(true);
        return { status: "refused" };
      }
      if (validation.status === "unreachable") {
        toast.error(validation.message);
        return { status: "failed" };
      }
      if (!(await confirmProceed(print ? "Save & Print" : "Save"))) {
        return { status: "abandoned" };
      }
      const saved = await createDraft(buildSavePayload(draftRef.current, pricingRef.current, actor), true);
      if (!saved) {
        toast.error("The server saved the bill but returned no id — reopen it from the list (F8) to post it.");
        return { status: "failed" };
      }
      void clearAutosave(actor.deviceId ?? "");
      return postNow(refOf(saved), print);
    },
    [actor, confirmProceed, createDraft, postNow, runServerValidation],
  );

  /**
   * What a save attempt came to (§17.4). `confirm-needed` is not a failure: the
   * gate asked a question (the stock position could not be established, the
   * customer is not allowed credit, the limit is breached) and the screen may
   * repeat the call with that gate waived.
   *
   * Amending → `remark-needed`: the screen asks what changed and calls `amend`.
   * Auto-post on a new bill → `postNewBill`. Otherwise a draft is written —
   * validated first when the post is a separate verb, so the operator hears
   * about a refusal now rather than at F6 — and the screen resets.
   */
  const save = useCallback(
    async (options: SaveOptions = {}): Promise<SaveOutcome> => {
      if (inFlight.current) {
        return { status: "busy" };
      }
      const current = draftRef.current;
      if (current.amending) {
        return { status: "remark-needed" };
      }
      const violation = validate(options.context);
      if (violation) {
        return violation.confirm && !options.confirmed
          ? { status: "confirm-needed", violation }
          : { status: "invalid", violation };
      }
      if (!actor.userId) {
        toast.error("Your session has no user id — sign in again before saving.");
        return { status: "failed" };
      }
      if (autoPost && refusePostWithoutDevice()) {
        return { status: "failed" };
      }
      // `busy` cannot guard re-entry on its own: `setBusy` is asynchronous, so
      // two F5 presses inside one render both see "idle". The voucher number is
      // allocated inside the server's create transaction, so a second in-flight
      // save would store a SECOND bill with its own refno — against the same
      // customer, for the same goods, with the money taken once.
      inFlight.current = true;
      setBusy("saving");
      try {
        const payload = buildSavePayload(current, pricing, actor);
        if (autoPost && current.isNewEntry) {
          return await postNewBill(payload, options.print === true);
        }
        if (!autoPost) {
          const validation = await runServerValidation(payload, { popupOnRefusal: true });
          if (validation.status === "refused") {
            return { status: "refused" };
          }
          // The server away: the create below will say so in its own words.
        }
        const saved = await createDraft(payload, false);
        if (!saved) {
          toast.error("The server saved the bill but returned no id — reopen it from the list (F8).");
          return { status: "failed" };
        }
        if (autoPost) {
          // A loaded draft re-saved under auto-post: adopted, then posted.
          const validation = await runServerValidation(payload, { popupOnRefusal: true });
          if (validation.status === "refused") {
            return { status: "refused" };
          }
          if (validation.status === "unreachable") {
            toast.error(validation.message);
            return { status: "failed" };
          }
          if (!(await confirmProceed(options.print ? "Save & Print" : "Save"))) {
            return { status: "abandoned" };
          }
          return await postNow(refOf(saved), options.print === true);
        }
        const ref = refOf(saved);
        toast.success(ref.billRefno ? `Bill ${ref.billRefno} saved successfully.` : "Bill saved.");
        await finishDocument(ref);
        return { status: "saved", ref };
      } catch (error) {
        const notes = notesFromError(error);
        if (notes.length > 0) {
          dispatch(notesSet({ notes }));
          setNotesPopupOpen(true);
          return { status: "refused" };
        }
        toast.error(errorMessageOf(error));
        return { status: "failed" };
      } finally {
        inFlight.current = false;
        setBusy("idle");
      }
    },
    [
      actor,
      autoPost,
      confirmProceed,
      createDraft,
      dispatch,
      finishDocument,
      postNewBill,
      postNow,
      pricing,
      refusePostWithoutDevice,
      runServerValidation,
      validate,
    ],
  );

  /**
   * Post from the keyboard or F6 (§17.5): checks → CREATE first, always (the
   * posted document must match the screen) → validate + overrides → confirm →
   * post. Under auto-post on a new bill it is the same as Save.
   */
  const post = useCallback(
    async (options: SaveOptions = {}): Promise<SaveOutcome> => {
      const current = draftRef.current;
      if (current.amending) {
        return { status: "remark-needed" };
      }
      if (autoPost && current.isNewEntry) {
        return save(options);
      }
      if (inFlight.current) {
        return { status: "busy" };
      }
      if (current.status === "POSTED") {
        toast.info("This bill is already posted.");
        return { status: "abandoned" };
      }
      const violation = validate(options.context);
      if (violation) {
        return violation.confirm && !options.confirmed
          ? { status: "confirm-needed", violation }
          : { status: "invalid", violation };
      }
      if (!actor.userId) {
        toast.error("Your session has no user id — sign in again before posting.");
        return { status: "failed" };
      }
      if (refusePostWithoutDevice()) {
        return { status: "failed" };
      }
      inFlight.current = true;
      setBusy("saving");
      try {
        const payload = buildSavePayload(current, pricing, actor);
        const saved = await createDraft(payload, false);
        if (!saved) {
          toast.error(
            "The draft was saved but the server did not return its id, so there is nothing to post against. Reopen the bill from the list (F8) and post it there.",
          );
          return { status: "failed" };
        }
        const validation = await runServerValidation(payload, { popupOnRefusal: true });
        if (validation.status === "refused") {
          return { status: "refused" };
        }
        if (validation.status === "unreachable") {
          toast.error(validation.message);
          return { status: "failed" };
        }
        if (!(await confirmProceed(options.print ? "Post & Print" : "Post"))) {
          return { status: "abandoned" };
        }
        return await postNow(refOf(saved), options.print === true);
      } catch (error) {
        const notes = notesFromError(error);
        if (notes.length > 0) {
          dispatch(notesSet({ notes }));
          setNotesPopupOpen(true);
          return { status: "refused" };
        }
        toast.error(errorMessageOf(error));
        return { status: "failed" };
      } finally {
        inFlight.current = false;
        setBusy("idle");
      }
    },
    [
      actor,
      autoPost,
      confirmProceed,
      createDraft,
      dispatch,
      postNow,
      pricing,
      refusePostWithoutDevice,
      runServerValidation,
      save,
      validate,
    ],
  );

  /** Before the tender opens (§15.1): the checks with `openingTender`, then `/validate`. */
  const validateForTender = useCallback(async (): Promise<ServerValidation> => {
    const violation = validate({ openingTender: true });
    if (violation && !violation.confirm) {
      toast.error(violation.message);
      return { status: "refused" };
    }
    setBusy("saving");
    try {
      const payload = buildSavePayload(draftRef.current, pricing, actor);
      // OK → painted, no popup. Refusal → painted with the popup. Server away
      // → `unreachable`, and the caller opens anyway: a sale must not stop.
      return await runServerValidation(payload, { popupOnRefusal: true });
    } finally {
      setBusy("idle");
    }
  }, [actor, pricing, runServerValidation, validate]);

  /** Ctrl+F7 (§17.7): the operator's dry run, painted WITH the popup. */
  const validateOnServer = useCallback(async (): Promise<ServerValidation> => {
    const violation = validate();
    if (violation && !violation.confirm) {
      toast.error(violation.message);
      return { status: "refused" };
    }
    setBusy("saving");
    try {
      const payload = buildSavePayload(draftRef.current, pricing, actor);
      const validation = await runServerValidation(payload, { popupOnRefusal: true });
      if (validation.status === "ok") {
        if (validation.warnings === 0) {
          toast.success("Nothing to report — this bill is ready to post.");
        } else {
          setNotesPopupOpen(true);
        }
      } else if (validation.status === "unreachable") {
        toast.error(validation.message);
      }
      return validation;
    } finally {
      setBusy("idle");
    }
  }, [actor, pricing, runServerValidation, validate]);

  /**
   * Save while amending (§17.8): validate first and run `confirmProceed`, the
   * same as a post — WARNs become refusals on `/amend` unless overridden.
   */
  const amend = useCallback(
    async (options: SaveOptions & { editRemark: string }): Promise<SaveOutcome> => {
      if (inFlight.current) {
        return { status: "busy" };
      }
      const current = draftRef.current;
      const key = billKeyOf(current);
      if (!current.amending || !key) {
        return { status: "failed" };
      }
      if (!options.editRemark.trim()) {
        toast.error("Say what you changed — the remark is stored with the revision.");
        return { status: "remark-needed" };
      }
      const violation = validate(options.context);
      if (violation) {
        return violation.confirm && !options.confirmed
          ? { status: "confirm-needed", violation }
          : { status: "invalid", violation };
      }
      inFlight.current = true;
      setBusy("saving");
      try {
        const payload = buildSavePayload(current, pricing, actor);
        const validation = await runServerValidation(payload, { popupOnRefusal: true });
        if (validation.status === "refused") {
          return { status: "refused" };
        }
        if (validation.status === "unreachable") {
          toast.error(validation.message);
          return { status: "failed" };
        }
        if (!(await confirmProceed(options.print ? "Save changes & Print" : "Save changes"))) {
          return { status: "abandoned" };
        }
        const body = buildAmendBody(payload, {
          sbId: key.sbId,
          baseRevision: current.revisionNo,
          editRemark: options.editRemark,
          overrides: draftRef.current.overrides,
          printAfter: options.print === true,
        });
        const amended = await amendBillMutation(body).unwrap();
        const ref = refOf(amended);
        toast.success(`Bill ${ref.billRefno ?? current.billRefno} updated.`);
        await finishDocument(ref);
        return { status: "posted", ref };
      } catch (error) {
        const notes = notesFromError(error);
        if (notes.length > 0) {
          dispatch(notesSet({ notes }));
          setNotesPopupOpen(true);
          return { status: "refused" };
        }
        if (errorCodeOf(error) === "SALES_REVISION_STALE") {
          toast.error(
            `Bill ${current.billRefno} was amended by someone else since you opened it. Reload it and make your change again.`,
          );
          return { status: "failed" };
        }
        toast.error(errorMessageOf(error));
        return { status: "failed" };
      } finally {
        inFlight.current = false;
        setBusy("idle");
      }
    },
    [actor, amendBillMutation, confirmProceed, dispatch, finishDocument, pricing, runServerValidation, validate],
  );

  /** Edit (F2) on a POSTED bill (§17.8). */
  const beginAmend = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current;
    if (current.status !== "POSTED") {
      toast.warn("Only a posted bill is edited this way.");
      return false;
    }
    const reason = amendBlockedReason(current.rights, current.locks);
    if (reason) {
      toast.warn(reason);
      return false;
    }
    const ok = await confirm({
      title: `Edit bill ${current.billRefno}?`,
      message: "It keeps its number and date. When you save, you will be asked what you changed.",
      confirmLabel: "Edit",
      cancelLabel: "Back",
      iconVariant: "replace",
    });
    if (!ok) {
      return false;
    }
    dispatch(amendBegun());
    return true;
  }, [dispatch]);

  /** Cancel bill (§17.9): POSTED only, by reversal. Reloads with `/get` after. */
  const cancelBill = useCallback(
    async (reason: string): Promise<boolean> => {
      const current = draftRef.current;
      const key = billKeyOf(current);
      if (!key || current.status !== "POSTED") {
        toast.warn(
          "Only a POSTED bill is cancelled. A draft is deleted (F3) — it has no number, no voucher and no stock behind it.",
        );
        return false;
      }
      const blocked = cancelBlockedReason(current.rights, current.locks);
      if (blocked) {
        toast.warn(blocked);
        return false;
      }
      const text = reason.trim().slice(0, 250);
      if (!text) {
        toast.error("A reason is required to cancel a bill.");
        return false;
      }
      setBusy("saving");
      try {
        await cancelBillMutation({ ...key, reason: text }).unwrap();
        toast.success(
          "Bill cancelled. The stock, the ledger and the register have been reversed — the bill keeps its number and stays on the list.",
        );
        void clearAutosave(actor.deviceId ?? "");
        // Not the `/get` shape: reload for the locks and the badges.
        await loadDocumentRef.current(key);
        return true;
      } catch (error) {
        const notes = notesFromError(error);
        if (notes.length > 0) {
          dispatch(notesSet({ notes }));
          setNotesPopupOpen(true);
        } else {
          toast.error(errorMessageOf(error));
        }
        return false;
      } finally {
        setBusy("idle");
      }
    },
    [actor.deviceId, cancelBillMutation, dispatch],
  );

  /** Delete (F3), DRAFT only (§17.9). */
  const deleteDraft = useCallback(async (): Promise<boolean> => {
    const current = draftRef.current;
    const key = billKeyOf(current);
    if (!key) {
      toast.warn("Nothing to delete — this is a new bill. Open a saved one from the list (F8) to delete it.");
      return false;
    }
    if (current.status !== "DRAFT") {
      toast.warn("Only a DRAFT is deleted. A posted bill is cancelled — it keeps its number.");
      return false;
    }
    const ok = await confirm({
      title: `Delete bill ${current.billRefno || "draft"}?`,
      message: "Delete this bill? This cannot be undone.",
      confirmLabel: "Delete",
      iconVariant: "delete",
    });
    if (!ok) {
      return false;
    }
    setBusy("saving");
    try {
      await deleteBillMutation(key).unwrap();
      toast.success("Bill deleted.");
      void clearAutosave(actor.deviceId ?? "");
      dispatch(notesCleared());
      clear();
      return true;
    } catch (error) {
      toast.error(errorMessageOf(error));
      return false;
    } finally {
      setBusy("idle");
    }
  }, [actor.deviceId, clear, deleteBillMutation, dispatch]);

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------
  const loadDocument = useCallback(
    async (key: SaleBillDocKey): Promise<SaleBillDraft | null> => {
      setBusy("loading");
      try {
        // Dispatched through `initiate` rather than the lazy-query trigger: this
        // also runs from a MOUNT effect — the register's double-click / Edit
        // route into the form with `initialDocument` set — and a lazy trigger
        // fired before its own subscription exists resolves with `undefined`
        // without ever reaching the network. That is what left a double-clicked
        // bill on a blank form while the F8 picker (an event handler, so its
        // subscription is live) opened the same bill correctly.
        const payload = await dispatch(
          saleBillApi.endpoints.getBill.initiate(key, {
            subscribe: false,
            forceRefetch: true,
          }),
        ).unwrap();
        // Built as a WHOLE draft and derived once — never painted row by row
        // through the pricing engine (§16). `pricing` stays `"stored"`, so the
        // screen shows the figures the bill was saved with until the operator's
        // first edit.
        const loaded = parseLoadedBill(payload, {
          companyStateCode,
          companyStateName: draftRef.current.companyStateName,
        });
        dispatch(draftReplaced(loaded));
        // The party's standing is an answer about the party TODAY, not when
        // the bill was raised, so it is asked again rather than read off the
        // record (§19 step 4). Silent: a load never earns the credit popup.
        void readPartyContext({
          custId: loaded.customer.custId,
          companyId: loaded.companyId,
          branchId: loaded.branchId,
          accYear: loaded.accYear,
          billDate: loaded.header.billDate,
        });
        return loaded;
      } catch (error) {
        toast.error(errorMessage(error));
        return null;
      } finally {
        setBusy("idle");
      }
    },
    [companyStateCode, dispatch, readPartyContext],
  );
  loadDocumentRef.current = loadDocument;
  // -------------------------------------------------------------------------
  // Cancel on Order (§8)
  // -------------------------------------------------------------------------
  /**
   * "Cancel on Order" — one line, the selected row's, never the order (§8).
   *
   * The row is dropped in the SUCCESS callback and never optimistically: a
   * refused cancellation that had already removed the row would leave the order
   * and the bill disagreeing about what is still open.
   */
  const cancelLineOnOrder = useCallback(
    async (lineKey: string, reason: string): Promise<boolean> => {
      const line = draftRef.current.lines.find((row) => row.key === lineKey);
      if (!line?.srcItemId) {
        return false;
      }
      if (!reason.trim()) {
        toast.error("Cancelling a line on the order has to say why.");
        return false;
      }
      setBusy("saving");
      try {
        await cancelOrderLine({
          srcModule: CANCEL_LINES_SRC_MODULE,
          // The ORDER LINE id (`soi_id`, §13.5). An order id here would close
          // out every open line of the whole order.
          srcDocId: line.srcItemId,
          srcAccYear: line.srcDocYear ?? draftRef.current.accYear,
          soiCancelReason: reason.trim().slice(0, 250),
        }).unwrap();
        dispatch(lineRemoved(lineKey));
        toast.success(
          "The order line was cancelled and the row removed from this bill.",
        );
        return true;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      } finally {
        setBusy("idle");
      }
    },
    [cancelOrderLine, dispatch],
  );
  // -------------------------------------------------------------------------
  // Imports (§13)
  // -------------------------------------------------------------------------
  const importFromQuotation = useCallback(
    async (row: QuotationListRow): Promise<boolean> => {
      // The guard the Qt picker does not have: an already-converted quotation is
      // refused BEFORE the fetch, so nothing is painted and nothing is lost.
      const refusal = quotationImportRefusal(row);
      if (refusal) {
        toast.error(refusal.reason);
        return false;
      }
      setBusy("loading");
      try {
        const payload = await fetchQuotation({
          sqId: row.sq_id,
          sqCompanyId: row.sq_company_id,
          sqBranchId: row.sq_branch_id,
          // The SOURCE's own accounting year, not this screen's.
          sqAccYear: row.sq_acc_year,
        }).unwrap();
        const outcome = importQuotation(draftRef.current, payload);
        dispatch(draftReplaced(outcome.draft));
        if (outcome.note) {
          toast.info(outcome.note);
        }
        return true;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      } finally {
        setBusy("idle");
      }
    },
    [dispatch, fetchQuotation],
  );
  const importFromOrder = useCallback(
    async (key: SaleOrderDocKey): Promise<boolean> => {
      setBusy("loading");
      try {
        const payload = await fetchOrder(key).unwrap();
        const refusal = orderImportRefusal(payload);
        if (refusal) {
          toast.error(refusal.reason);
          return false;
        }
        const outcome = importOrder(draftRef.current, payload);
        let next = outcome.draft;
        // The credits THIS order raised, pre-filled at their pending amount: an
        // order's advance is held against the order, so importing it should
        // offer that advance back rather than leave the operator hunting for it.
        if (next.customer.custId && next.companyId) {
          try {
            const credits = await fetchOpenCredits({
              partyId: next.customer.custId,
              companyId: next.companyId,
            }).unwrap();
            const seeded = creditsRaisedBy(credits, payload.soId);
            next = {
              ...next,
              openCredits: credits,
              adjustments: seeded,
              adjustmentsTouched: seeded.length > 0,
            };
          } catch {
            // The bill is imported either way; the panel simply opens empty.
          }
        }
        dispatch(draftReplaced(next));
        if (outcome.note) {
          toast.info(outcome.note);
        }
        void readPartyContext({
          custId: next.customer.custId,
          companyId: next.companyId,
          branchId: next.branchId,
          accYear: next.accYear,
          billDate: next.header.billDate,
        });
        return outcome.imported > 0;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      } finally {
        setBusy("idle");
      }
    },
    [dispatch, fetchOpenCredits, fetchOrder, readPartyContext],
  );
  // -------------------------------------------------------------------------
  // Holds (§12)
  // -------------------------------------------------------------------------
  /** Park the cart on the SERVER and clear the form. */
  const hold = useCallback(async (): Promise<boolean> => {
    if (holdInFlight.current) {
      return false;
    }
    const current = draftRef.current;
    if (!current.lines.some((line) => line.itemId)) {
      toast.warn("There is nothing on this bill to hold.");
      return false;
    }
    if (!actor.deviceMasterId) {
      // `txh_device_id` is a real foreign key into `fixed.device_master`, so a
      // hold names the device the LOGIN registered — never the browser's own
      // local uuid, which matches no row there.
      toast.error(
        "This browser has no registered device, so a cart cannot be held from it.",
      );
      return false;
    }
    if (!holdAccYearOf(current.accYear)) {
      toast.error(
        "This bill has no accounting year, and a hold's scope cannot be corrected later.",
      );
      return false;
    }
    holdInFlight.current = true;
    setBusy("holding");
    try {
      const isUpdate = Boolean(current.holdId);
      const body = buildBillHoldPayload(current, pricingRef.current, actor, {
        holdId: current.holdId,
        ...(isUpdate
          ? {}
          : {
              holdNo: nextHoldNo(),
              holdSlno: nextHoldSlno({
                companyId: current.companyId,
                branchId: current.branchId,
                accYear: current.accYear,
                docType: SALE_BILL_HOLD_DOC_TYPE,
              }),
            }),
      });
      const saved = await saveHold(body).unwrap();
      // A resumed cart holds a LEASE; re-parking it has to hand that back or the
      // next device cannot open it.
      if (lockedHold.current?.txhId === saved.txhId) {
        try {
          await releaseHoldLock({
            txhId: saved.txhId,
            deviceId: actor.deviceMasterId,
            scope: lockedHold.current.scope,
          }).unwrap();
        } catch {
          // The lease expires on its own; the cart is parked either way.
        }
        lockedHold.current = null;
      }
      toast.success(`Held as ${saved.txhHoldNo}.`);
      void clearAutosave(actor.deviceId ?? "");
      clear();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      holdInFlight.current = false;
      setBusy("idle");
    }
  }, [actor, clear, releaseHoldLock, saveHold]);
  /** Pull a parked cart back, taking its edit lease. */
  const resumeHold = useCallback(
    async (txhId: string): Promise<boolean> => {
      if (!actor.deviceMasterId) {
        toast.error(
          "This browser has no registered device, so a held cart cannot be opened here.",
        );
        return false;
      }
      setBusy("resuming");
      try {
        const hold = await fetchHold({ txhId }).unwrap();
        const state = readBillHoldUiState(hold.txhPayload);
        if (!state) {
          toast.error(
            "That held cart was parked by another screen and cannot be opened here.",
          );
          return false;
        }
        const scope = holdLockScope(hold);
        await resumeHoldLock({
          txhId,
          deviceId: actor.deviceMasterId,
          scope,
        }).unwrap();
        lockedHold.current = { txhId, holdNo: hold.txhHoldNo, scope };
        dispatch(draftReplaced(draftFromBillHold(hold, state)));
        return true;
      } catch (error) {
        toast.error(holdLockMessage(error, ""));
        return false;
      } finally {
        setBusy("idle");
      }
    },
    [actor.deviceMasterId, dispatch, fetchHold, resumeHoldLock],
  );
  /** Take a cart off the device holding it. Frees the hold; does not open it. */
  const takeOverHold = useCallback(
    async (hold: TxnHoldPayload): Promise<boolean> => {
      if (!actor.deviceMasterId) {
        return false;
      }
      try {
        await forceReleaseHoldLock({
          txhId: hold.txhId,
          deviceId: actor.deviceMasterId,
          scope: holdLockScope(hold),
        }).unwrap();
        toast.info(`${hold.txhHoldNo} was released — it can be opened now.`);
        return true;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      }
    },
    [actor.deviceMasterId, forceReleaseHoldLock],
  );
  // -------------------------------------------------------------------------
  // Autosave (§12) — crash recovery ONLY, never a second source of truth
  // -------------------------------------------------------------------------
  useEffect(() => {
    const deviceId = actor.deviceId ?? "";
    // `sales.auto_save_temp_bill` (§23.2): a NEW bill with at least one line,
    // debounced. A loaded document has a row of its own to fall back on.
    if (
      !deviceId ||
      !settings.autoSaveTempBill ||
      draft.mode !== "entry" ||
      !draft.isNewEntry ||
      !isWorthAutosaving(draft)
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      void writeAutosave(deviceId, draftRef.current, pricingRef.current);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [actor.deviceId, draft, settings.autoSaveTempBill]);
  // -------------------------------------------------------------------------
  // Promotions (§11)
  // -------------------------------------------------------------------------
  //
  // The graph is fetched once per company — NEVER narrowed by branch (the
  // list matches the column literally and drops company-wide schemes) — and
  // the pass runs over the lines' INPUTS whenever one of them moves: term,
  // bill date, qty, size, rate, scheme flag, any discount, the Promo tick, the
  // customer, a cache refresh. Its outputs (the scheme tier, the free lines)
  // are not in its own signature, so it cannot feed back on itself; and the
  // pass is idempotent, so running it once more costs nothing.
  //
  // Skipped on a loaded (stored) bill and in browse mode: a loaded bill is
  // history, and today's campaigns must not touch it (§5.2).
  const { data: promotionSchemes = [], isError: promotionsFailed } = useListPromotionSchemesQuery(
    draft.companyId,
    { skip: !draft.companyId },
  );
  const [promotionNotes, setPromotionNotes] = useState<{ applied: PromotionNote[]; notApplied: PromotionNote[] }>({
    applied: [],
    notApplied: [],
  });
  const promotionSignature = useMemo(() => {
    if (draft.mode !== "entry" || draft.pricing === "stored") {
      return "";
    }
    const lines = draft.lines
      .filter((line) => line.itemId && !(line.isFree && line.schemeId))
      .map((line) =>
        [
          line.key,
          line.itemId,
          line.itemUnitId,
          line.caseQty,
          line.billQty,
          line.lengthQty,
          line.toBaseFactor,
          line.rate,
          line.isInclusiveTax ? 1 : 0,
          line.isFree ? 1 : 0,
          line.schemeFlag ? 1 : 0,
          line.discPerc,
          line.discPerQty,
          line.discAmt,
          line.splDiscPerc,
          line.splDiscPerQty,
          line.splDiscAmt,
          line.priceLevel,
          line.groupId,
          line.brandId,
          line.categoryId,
          line.sectionId,
        ].join(":"),
      )
      .join("|");
    return [
      draft.companyId,
      draft.branchId,
      draft.header.billDate,
      draft.header.billType,
      draft.header.hasPromo ? 1 : 0,
      draft.header.priceLevel,
      draft.customer.custId ?? "",
      draft.customer.areaId ?? "",
      draft.policy.discountAlterBaseRate ? 1 : 0,
      promotionSchemes.length,
      lines,
    ].join("#");
  }, [draft, promotionSchemes.length]);
  const lastPromotionSignature = useRef("");
  useEffect(() => {
    if (!promotionSignature || promotionSignature === lastPromotionSignature.current) {
      return;
    }
    lastPromotionSignature.current = promotionSignature;
    const current = draftRef.current;
    const now = new Date();
    const context: PromotionContext = {
      compId: current.companyId,
      branchId: current.branchId,
      docDate: current.header.billDate,
      docTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      custId: current.customer.custId,
      areaId: current.customer.areaId,
      priceLevelId: current.header.priceLevel,
      billType: current.header.billType === "CREDIT" ? "CREDIT" : current.header.billType === "CASH" ? "CASH" : "ALL",
      promotionsEnabled: current.header.hasPromo && !promotionsFailed,
    };
    const result = evaluatePromotions(promotionSchemes, context, current.lines, current.policy);
    setPromotionNotes({ applied: result.applied, notApplied: result.notApplied });
    const reconciled = reconcileFreeLines(result.lines, result.freeLines);
    if (result.changed || reconciled.changed) {
      dispatch(promotionsApplied(reconciled.lines));
    }
    for (const intent of reconciled.toInsert) {
      dispatch(
        freeLineInserted({
          key: `free-${intent.key}`,
          afterLineKey: intent.afterLineKey,
          schemeId: intent.schemeId,
          schemeName: intent.schemeName,
          itemId: intent.itemId,
          itemUnitId: intent.unitId,
          itemName: intent.itemName,
          qty: intent.qty,
        }),
      );
      // Each inserted free line is priced through the normal lookup; the
      // reducer forces its rate to 0 and keeps the real price in
      // `actualPrice` for the savings figure.
      void pickItem(`free-${intent.key}`, intent.itemId, intent.unitId ?? undefined);
    }
  }, [dispatch, pickItem, promotionSchemes, promotionSignature, promotionsFailed]);
  const promotionHintText = useMemo(
    () => promotionHint(draft.header.hasPromo, promotionNotes.applied, promotionNotes.notApplied),
    [draft.header.hasPromo, promotionNotes],
  );
  /** The snapshot this device left behind, if it is worth offering back. */
  const findRecovery = useCallback(async (): Promise<BillAutosave | null> => {
    const deviceId = actor.deviceId ?? "";
    if (
      !deviceId ||
      !context.companyId ||
      !context.branchId ||
      !context.accYear
    ) {
      return null;
    }
    return readAutosave(deviceId, {
      companyId: context.companyId,
      branchId: context.branchId,
      accYear: context.accYear,
    });
  }, [actor.deviceId, context.accYear, context.branchId, context.companyId]);
  const acceptRecovery = useCallback(
    (record: BillAutosave) => {
      dispatch(draftReplaced(draftFromAutosave(record)));
      void clearAutosave(actor.deviceId ?? "");
    },
    [actor.deviceId, dispatch],
  );
  const discardRecovery = useCallback(() => {
    void clearAutosave(actor.deviceId ?? "");
  }, [actor.deviceId]);
  return {
    draft,
    dispatch,
    pricing,
    isReady: Boolean(draft.companyId && draft.branchId && draft.accYear),
    busy,
    canEditPrice,
    regional,
    itemColumns,
    chargeColumns,
    priceLevelOptions,
    chargeMasters,
    unitOptionsFor,
    customerChangeCost,
    releaseCustomerBoundState,
    pickCustomer,
    refreshPartyContext,
    settings,
    tenderRoute,
    discountAll,
    adjustPrices,
    lineCostText,
    promotionHintText,
    pickItem,
    recoverBaseFactor,
    switchUnit,
    setLineUnit,
    resolveBarcode,
    applyPriceLevel,
    refreshOpenCredits,
    applyAdjustments,
    validate,
    save,
    autoPost,
    canPostOnThisDevice,
    validateOnServer,
    validateForTender,
    isWalkIn:
      draft.party?.party.isWalkIn ??
      (Boolean(walkInCustomerId) && draft.customer.custId === walkInCustomerId),
    post,
    amend,
    beginAmend,
    cancelBill,
    deleteDraft,
    toggleOverride,
    clearNotes,
    notesPopupOpen,
    setNotesPopupOpen,
    proceedAsk,
    answerProceed,
    loadDocument,
    cancelLineOnOrder,
    importFromQuotation,
    importFromOrder,
    hold,
    resumeHold,
    takeOverHold,
    findRecovery,
    acceptRecovery,
    discardRecovery,
    clear,
    copyAsNew,
    beginEdit,
  };
}