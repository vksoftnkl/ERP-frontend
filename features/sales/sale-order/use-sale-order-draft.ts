"use client";
/**
 * Sale Order Entry — the draft, its derived pricing, and every action that
 * needs the network. The quotation hook's architecture: the draft lives in
 * Redux (`saleOrderSlice`), the reducer never calls the API, everything below
 * the grids is `recalcDocument` in a `useMemo`.
 *
 * What this hook adds over the quotation's: the party-credit fetch (customer
 * picked / document loaded / import / copy — today's standing, not the day the
 * order was raised), the tender dialog's master rows, the quotation import
 * (Ctrl+F3), and a save that asks the credit question instead of refusing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/notify";
import { recalcDocument } from "@/domain/pricing";
import type { DocumentPricing } from "@/domain/pricing";
import { useBusinessContext } from "@/components/layout/business-context";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { AppDispatch } from "@/store/store";
import {
  getAuthSessionId,
  getAuthUserId,
  getOrCreateClientDeviceId,
  getUserInfo,
} from "@/lib/auth/session";
import { extractApiErrorMessage } from "@/lib/api/client";
import {
  quotationApi,
  useGetCompanyStateCodeQuery,
  useGetPriceLevelsQuery,
  useGetQuotationGridLayoutQuery,
  useGetSalesChargesQuery,
  useGetUserCapabilitiesQuery,
  useLazyGetCustomerDetailQuery,
  useLazyGetFreightBandsQuery,
  useLazyGetItemPriceQuery,
  useLazyGetItemUnitsQuery,
  useLazyGetQuotationItemByBarcodeQuery,
  useLazySwitchItemUomQuery,
} from "@/store/api/quotationApi";
import type { ItemPriceQuery } from "@/store/api/quotationApi";
import {
  saleOrderApi,
  useDeleteSaleOrderMutation,
  useGetTenderMastersQuery,
  useLazyGetPartyCreditQuery,
  useSaveSaleOrderMutation,
} from "@/store/api/saleOrderApi";
import {
  companyStateCodeSet,
  creditOverrideSet,
  customerApplied,
  draftReplaced,
  freightBandsSet,
  itemPriceApplied,
  lineFieldSet,
  linePriceLevelSet,
  modeSet,
  partyCreditSet,
  saveResponseApplied,
  selectSaleOrderDraft,
  tenantSet,
} from "@/store/slices/saleOrderSlice";
import {
  CHARGE_GRID_UI_TABLE_KEY,
  FREIGHT_CALC_TYPES,
  LOADING_CALC_TYPES,
  DEFAULT_FREIGHT_CALC_TYPE,
  DEFAULT_LOADING_CALC_TYPE,
  PRICE_LEVEL_OPTIONS,
  SESSION_CAPABILITIES,
} from "@/features/sales/quotation/quotation.constants";
import type { SaveActor } from "@/features/sales/quotation/quotation.payload";
import { clampPriceLevel } from "@/features/sales/quotation/quotation.state";
import type {
  ChargeMasterRow,
  ItemUnitOption,
  QuotationDocKey,
} from "@/features/sales/quotation/quotation.types";
import {
  accountingYearOf,
  resolveChargeColumns,
  resolveItemColumnsWith,
  todayIso,
} from "@/features/sales/quotation/quotation.utils";
import type { ColumnWidthUnit } from "@/features/sales/quotation/quotation.utils";
import {
  SALES_ITEM_COLUMN_COUNT,
  SALES_ITEM_COLUMN_MEANINGS,
  SALE_ORDER_ITEM_GRID_UI_TABLE_KEY,
} from "./sale-order.constants";
import { buildSavePayload, importQuotationAsOrder, parseLoadedDocument } from "./sale-order.payload";
import {
  copyOrderDraftAsNew,
  createOrderDraft,
  deliveryDefaultsToKeep,
  isCustomerLocked,
  type OrderHeaderDefaults,
} from "./sale-order.state";
import { newOrderStatusFor, toEnginePolicy, type SaleOrderSettings } from "./sale-order.settings";
import type {
  SaleOrderDocKey,
  SaleOrderDraft,
  SaleOrderViolation,
  TenderMasterRow,
} from "./sale-order.types";
import { validateSaveInputs, type OrderValidationContext } from "./sale-order.validate";
import { useSaleOrderSettings } from "./use-sale-order-settings";
import { useUiTableId } from "@/lib/ui-tables";

/** Table 24 stores Qt-style percent widths, not pixels. */
export const SALES_ITEM_COLUMN_WIDTH_UNIT: ColumnWidthUnit = "qtPercent";

function errorMessage(error: unknown): string {
  const data = (error as { data?: unknown })?.data ?? error;
  const detail = (data as { errors?: { field?: string; message?: string }[] })?.errors?.[0];
  if (detail?.message) {
    return detail.field && detail.field !== "request"
      ? `${detail.field}: ${detail.message}`
      : detail.message;
  }
  return extractApiErrorMessage(error, "The request failed.");
}

function clampCalcType(value: string, allowed: readonly string[], fallback: string): string {
  const code = (value ?? "").trim().toLowerCase();
  return allowed.includes(code) ? code : fallback;
}

export type SaleOrderBusy = "idle" | "loading" | "saving" | "deleting" | "pricing" | "importing";

/** The order a save wrote — what Save & Print and F11 (Last Order) print. */
export type SavedOrderRef = {
  soId: string;
  soCompanyId: string;
  soBranchId: string;
  soAccYear: string;
  soOrderRefno: string | null;
};

/** What `save` came back with — the credit question is an answer, not a refusal. */
export type SaveOutcome =
  | { status: "saved"; document: SavedOrderRef }
  | { status: "failed" }
  | { status: "confirm-credit"; message: string };

export type SaleOrderDraftApi = {
  draft: SaleOrderDraft;
  dispatch: AppDispatch;
  pricing: DocumentPricing;
  isReady: boolean;
  busy: SaleOrderBusy;
  /** The app settings this screen obeys (`sale-order.settings.ts`). */
  settings: SaleOrderSettings;
  canEditPrice: boolean;
  regional: boolean;
  customerLocked: boolean;
  itemColumns: ReturnType<typeof resolveItemColumnsWith>;
  chargeColumns: ReturnType<typeof resolveChargeColumns>;
  priceLevelOptions: ReadonlyArray<{ value: string; label: string }>;
  chargeMasters: ChargeMasterRow[];
  tenderMasters: TenderMasterRow[];
  /** Non-null when the tender master could not be read — the hint bar's text. */
  tenderMasterError: string | null;
  actor: SaveActor;
  unitOptionsFor: (itemId: string) => ItemUnitOption[];
  pickCustomer: (customerId: string) => Promise<void>;
  refreshPartyCredit: (customerId?: string | null) => Promise<void>;
  pickItem: (lineKey: string, itemId: string, itemUnitId?: string) => Promise<void>;
  recoverBaseFactor: (lineKey: string) => Promise<void>;
  switchUnit: (lineKey: string) => Promise<void>;
  setLineUnit: (lineKey: string, itemUnitId: string) => Promise<void>;
  resolveBarcode: (lineKey: string, barcode: string) => Promise<boolean>;
  applyPriceLevel: (
    priceLevel: number,
    scope: "selected" | "all",
    lineKeys: string[],
  ) => Promise<void>;
  /** Ctrl+± — the row's price level one position up or down, within `inventory.price_level_count`. */
  stepLinePriceLevel: (lineKey: string, delta: 1 | -1) => Promise<void>;
  save: (context?: OrderValidationContext) => Promise<SaveOutcome>;
  /** The credit question answered yes: remember it and go again. */
  confirmCreditAndSave: (context?: OrderValidationContext) => Promise<SaveOutcome>;
  loadDocument: (key: SaleOrderDocKey) => Promise<SaleOrderDraft | null>;
  /** F11 — open the most recent order in this company / branch. */
  loadLastOrder: () => Promise<SaleOrderDraft | null>;
  importQuotation: (key: QuotationDocKey) => Promise<boolean>;
  deleteDocument: () => Promise<boolean>;
  clear: () => void;
  copyAsNew: () => void;
  beginEdit: () => void;
  validate: (context?: OrderValidationContext) => SaleOrderViolation | null;
};

function useDraftContext() {
  const { activeCompany, activeBranch, activeFiscalYear, loading } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());
  return { companyId, branchId, accYear, loading };
}

function useSaveActor(): SaveActor {
  return useMemo(
    () => ({
      userId: getAuthUserId() ?? "",
      userName: getUserInfo()?.userName ?? null,
      sessionId: getAuthSessionId(),
      deviceId: getOrCreateClientDeviceId(),
      deviceType: getUserInfo()?.deviceType ?? null,
    }),
    [],
  );
}

const ENGLISH_LANGUAGE_CODES = new Set(["en", "eng", "en-in", "en_in", "english"]);

export function useSaleOrderDraft(): SaleOrderDraftApi {
  const context = useDraftContext();
  const actor = useSaveActor();
  const dispatch = useAppDispatch();
  const draft = useAppSelector(selectSaleOrderDraft);
  const { settings, loaded: settingsLoaded } = useSaleOrderSettings(
    context.companyId,
    context.branchId,
  );
  const { data: companyStateCodeFromMaster = "" } = useGetCompanyStateCodeQuery(
    context.companyId,
    { skip: !context.companyId },
  );
  // `system.company_state_code` is the Qt screen's source; an installation
  // that never set it falls back to the company master's own state.
  const companyStateCode = settings.companyStateCode || companyStateCodeFromMaster;
  const { data: capabilities } = useGetUserCapabilitiesQuery(actor.userId, {
    skip: !actor.userId,
  });
  const itemUiTableId = useUiTableId(SALE_ORDER_ITEM_GRID_UI_TABLE_KEY);
  const chargeUiTableId = useUiTableId(CHARGE_GRID_UI_TABLE_KEY);
  const { data: itemLayout } = useGetQuotationGridLayoutQuery({
    uiTableId: itemUiTableId,
  });
  const { data: chargeLayout } = useGetQuotationGridLayoutQuery({
    uiTableId: chargeUiTableId,
  });
  const { data: chargeMasters = [] } = useGetSalesChargesQuery();
  const { data: priceLevelNames = [] } = useGetPriceLevelsQuery();
  const {
    data: tenderMasters = [],
    error: tenderMastersError,
  } = useGetTenderMastersQuery();
  const [fetchCustomerDetail] = useLazyGetCustomerDetailQuery();
  const [fetchItemPrice] = useLazyGetItemPriceQuery();
  const [fetchNextUnit] = useLazySwitchItemUomQuery();
  const [fetchItemUnits] = useLazyGetItemUnitsQuery();
  const [fetchBarcode] = useLazyGetQuotationItemByBarcodeQuery();
  const [fetchFreightBands] = useLazyGetFreightBandsQuery();
  const [fetchPartyCredit] = useLazyGetPartyCreditQuery();
  const [saveSaleOrder] = useSaveSaleOrderMutation();
  const [deleteSaleOrder] = useDeleteSaleOrderMutation();
  const [busy, setBusy] = useState<SaleOrderBusy>("idle");
  const inFlight = useRef(false);
  const [unitOptions, setUnitOptions] = useState<Record<string, ItemUnitOption[]>>({});
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const loadUnitOptionsRef = useRef<(itemId: string) => Promise<void>>(async () => {});

  // Tenant seeding — the quotation's rule verbatim: pushed in as it arrives,
  // never over live work.
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
    const hasWork = draftRef.current.lines.some((line) => Boolean(line.itemId));
    if (!firstSeed && (draftRef.current.isDirty || hasWork)) {
      toast.info(
        "The company, branch or year changed. This order keeps the one it was started in — clear it (F7) to start in the new context.",
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

  useEffect(() => {
    if (companyStateCode) {
      dispatch(companyStateCodeSet(companyStateCode));
    }
  }, [companyStateCode, dispatch]);

  // Warn once if the configured layout disagrees with the 96-column map — a
  // mislabelled grid is worse than a missing one (the plan's §4).
  const warnedLayout = useRef(false);
  useEffect(() => {
    if (!itemLayout || warnedLayout.current) {
      return;
    }
    if (itemLayout.length > 0 && itemLayout.length !== SALES_ITEM_COLUMN_COUNT) {
      warnedLayout.current = true;
      toast.warn(
        `The Sale Order item grid is configured with ${itemLayout.length} columns but this client expects ${SALES_ITEM_COLUMN_COUNT} — columns past the mismatch may be mislabelled.`,
      );
    }
  }, [itemLayout]);

  const lineItemIds = draft.lines.map((line) => line.itemId).filter(Boolean).join("|");
  useEffect(() => {
    for (const itemId of new Set(lineItemIds.split("|").filter(Boolean))) {
      void loadUnitOptionsRef.current(itemId);
    }
  }, [lineItemIds]);

  const itemColumns = useMemo(
    () =>
      resolveItemColumnsWith(itemLayout, SALES_ITEM_COLUMN_MEANINGS, SALES_ITEM_COLUMN_WIDTH_UNIT),
    [itemLayout],
  );
  const chargeColumns = useMemo(() => resolveChargeColumns(chargeLayout), [chargeLayout]);
  const priceLevelOptions = useMemo(
    () =>
      priceLevelNames.length > 0 ? priceLevelNames : PRICE_LEVEL_OPTIONS.map((o) => ({ ...o })),
    [priceLevelNames],
  );
  // Both the user's own flag and the installation's `inventory.edit_price`
  // have to allow it — either one off locks the rate and the price levels.
  const canEditPrice =
    (capabilities?.editRate ?? SESSION_CAPABILITIES.editPrice) && settings.editPrice;
  const language = (capabilities?.language ?? "").trim().toLowerCase();
  const regional =
    settings.regional ??
    (language ? !ENGLISH_LANGUAGE_CODES.has(language) : SESSION_CAPABILITIES.regional);

  // What a fresh order starts with — the settings' answer, so a cleared screen
  // and an import both begin where the installation says (the Qt defaults).
  const draftDefaults = useMemo<OrderHeaderDefaults>(
    () => ({
      priceLevel: settings.defaultPriceLevel,
      deliveryMode: settings.defaultDeliveryMode,
      validityDays: settings.defaultValidityDays,
      posStateCode: companyStateCode,
    }),
    [
      companyStateCode,
      settings.defaultDeliveryMode,
      settings.defaultPriceLevel,
      settings.defaultValidityDays,
    ],
  );
  const draftPolicy = useMemo(() => toEnginePolicy(settings), [settings]);

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
    draft.pricing === "stored" && draft.storedPricing ? draft.storedPricing : livePricing;

  const loadUnitOptions = useCallback(
    async (itemId: string): Promise<void> => {
      if (!itemId || unitOptions[itemId]) {
        return;
      }
      try {
        const options = await fetchItemUnits(itemId).unwrap();
        setUnitOptions((current) => ({ ...current, [itemId]: options }));
      } catch {
        // Costs only the Uom dropdown its options.
      }
    },
    [fetchItemUnits, unitOptions],
  );
  loadUnitOptionsRef.current = loadUnitOptions;

  const priceQueryFor = useCallback(
    (
      line: { godownId?: string | null } | undefined,
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
      loading_type: clampCalcType(
        draft.policy.loadingCalcType,
        LOADING_CALC_TYPES,
        DEFAULT_LOADING_CALC_TYPE,
      ),
      freight_type: clampCalcType(
        draft.policy.freightCalcType,
        FREIGHT_CALC_TYPES,
        DEFAULT_FREIGHT_CALC_TYPE,
      ),
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
   * `sales.auto_pop_qty` — a line that has just been priced and carries no
   * quantity yet is given one, the way the Qt screen fills it on the price
   * lookup's answer. The lookup never touches the quantities, so the line as
   * it was BEFORE the fill is the right thing to judge.
   */
  const popQuantity = useCallback(
    (lineKey: string, line: { billQty: number; caseQty: number } | undefined) => {
      if (settings.autoPopQty && (line?.billQty ?? 0) === 0 && (line?.caseQty ?? 0) === 0) {
        dispatch(lineFieldSet({ key: lineKey, field: "billQty", value: 1 }));
      }
    },
    [dispatch, settings.autoPopQty],
  );

  const pickItem = useCallback(
    async (lineKey: string, itemId: string, itemUnitId?: string) => {
      const line = draft.lines.find((row) => row.key === lineKey);
      const level = line?.priceLevel ?? draft.header.priceLevel;
      setBusy("pricing");
      try {
        const lookup = await fetchItemPrice(priceQueryFor(line, itemId, itemUnitId, level)).unwrap();
        dispatch(itemPriceApplied({ key: lineKey, lookup }));
        popQuantity(lineKey, line);
        void loadUnitOptions(itemId);
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setBusy("idle");
      }
    },
    [
      dispatch,
      draft.lines,
      draft.header.priceLevel,
      fetchItemPrice,
      loadUnitOptions,
      popQuantity,
      priceQueryFor,
    ],
  );

  /** A line imported from a quotation can carry the placeholder factor. */
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
          lineFieldSet({ key: lineKey, field: "toBaseFactor", value: lookup.base_factor || 1 }),
        );
        dispatch(lineFieldSet({ key: lineKey, field: "toBaseFactorKnown", value: true }));
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

  const switchUnit = useCallback(
    async (lineKey: string) => {
      const line = draft.lines.find((row) => row.key === lineKey);
      if (!line?.itemId || !line.itemUnitId) {
        return;
      }
      setBusy("pricing");
      try {
        const next = await fetchNextUnit({ item_id: line.itemId, iuc_id: line.itemUnitId }).unwrap();
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
    [dispatch, draft.lines, fetchItemPrice, fetchNextUnit, priceQueryFor],
  );

  const resolveBarcode = useCallback(
    async (lineKey: string, barcode: string): Promise<boolean> => {
      const trimmed = barcode.trim();
      if (!trimmed) {
        return false;
      }
      setBusy("pricing");
      try {
        const scanned = await fetchBarcode(trimmed).unwrap();
        if (!scanned.allowSales) {
          toast.warn(`${scanned.itemName} is not available for sale.`);
          return false;
        }
        const line = draft.lines.find((row) => row.key === lineKey);
        const lookup = await fetchItemPrice(
          priceQueryFor(line, scanned.itemId, scanned.unitId, line?.priceLevel ?? draft.header.priceLevel),
        ).unwrap();
        dispatch(itemPriceApplied({ key: lineKey, lookup }));
        popQuantity(lineKey, line);
        void loadUnitOptions(scanned.itemId);
        return true;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      } finally {
        setBusy("idle");
      }
    },
    [
      dispatch,
      draft.lines,
      draft.header.priceLevel,
      fetchBarcode,
      fetchItemPrice,
      loadUnitOptions,
      popQuantity,
      priceQueryFor,
    ],
  );

  /**
   * The credit panel's fetch (the plan's §7.1): customer picked, order loaded,
   * quotation imported, copy-as-new. A failed call clears the panel and blocks
   * nothing.
   */
  const refreshPartyCredit = useCallback(
    async (customerId?: string | null) => {
      const partyId = customerId ?? draftRef.current.customer.custId;
      if (!partyId) {
        dispatch(partyCreditSet(null));
        return;
      }
      try {
        const summary = await fetchPartyCredit({
          partyId,
          ...(draftRef.current.companyId ? { companyId: draftRef.current.companyId } : {}),
          ...(draftRef.current.branchId ? { branchId: draftRef.current.branchId } : {}),
          ...(draftRef.current.accYear ? { accYear: draftRef.current.accYear } : {}),
        }).unwrap();
        dispatch(partyCreditSet(summary));
      } catch {
        dispatch(partyCreditSet(null));
      }
    },
    [dispatch, fetchPartyCredit],
  );

  const pickCustomer = useCallback(
    async (customerId: string) => {
      if (!customerId) {
        return;
      }
      if (isCustomerLocked(draft.source, settings.allowCustomerChangeOnImport)) {
        toast.warn(
          `The customer is locked: this order was raised from ${draft.source?.refno ?? "another document"}.`,
        );
        return;
      }
      if (!draft.companyId || !draft.branchId) {
        toast.warn("The company and branch are still loading — try again in a moment.");
        return;
      }
      setBusy("loading");
      try {
        const detail = await fetchCustomerDetail({
          cus_id: customerId,
          company_id: draft.companyId,
          branch_id: draft.branchId,
          regional,
        }).unwrap();
        dispatch(customerApplied(detail));
        // The credit panel paints the moment the customer lands (§7.1).
        void refreshPartyCredit(customerId);
        const distance = detail.distance_km;
        const distanceChanged = distance !== draft.customer.distanceKm;
        const manualFreight = draft.policy.freightCalcType.trim().toUpperCase() === "MANUAL";
        if (distance !== null && distance >= 0 && distanceChanged && !manualFreight) {
          try {
            const bands = await fetchFreightBands(Math.trunc(distance)).unwrap();
            dispatch(freightBandsSet(bands));
          } catch {
            // No band for this distance is an ordinary answer.
          }
        }
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setBusy("idle");
      }
    },
    [
      dispatch,
      draft.companyId,
      draft.branchId,
      draft.customer.distanceKm,
      draft.policy.freightCalcType,
      draft.source,
      fetchCustomerDetail,
      fetchFreightBands,
      refreshPartyCredit,
      regional,
      settings.allowCustomerChangeOnImport,
    ],
  );

  const applyPriceLevel = useCallback(
    async (priceLevel: number, scope: "selected" | "all", lineKeys: string[]) => {
      if (!canEditPrice) {
        toast.warn("You do not have permission to change prices.");
        return;
      }
      const level = clampPriceLevel(priceLevel);
      const targets =
        scope === "all"
          ? draft.lines.filter((line) => line.itemId).map((line) => line.key)
          : lineKeys.filter((key) => draft.lines.some((line) => line.key === key && line.itemId));
      if (targets.length === 0) {
        return;
      }
      dispatch(linePriceLevelSet({ keys: targets, priceLevel: level, commitDocument: scope === "all" }));
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
    [canEditPrice, dispatch, draft.lines, fetchItemPrice, priceQueryFor],
  );

  /**
   * Ctrl+`+` / Ctrl+`-` on a row (the Qt screen's `stepRowPriceLevel`): one
   * level up or down, clamped to `inventory.price_level_count`, re-priced; the
   * document's own level is left alone.
   */
  const stepLinePriceLevel = useCallback(
    async (lineKey: string, delta: 1 | -1) => {
      const line = draft.lines.find((row) => row.key === lineKey);
      if (!line?.itemId) {
        return;
      }
      if (!canEditPrice) {
        toast.warn("You do not have permission to change prices.");
        return;
      }
      const next = Math.min(settings.priceLevelCount, Math.max(1, line.priceLevel + delta));
      if (next === line.priceLevel) {
        return;
      }
      await applyPriceLevel(next, "selected", [lineKey]);
    },
    [applyPriceLevel, canEditPrice, draft.lines, settings.priceLevelCount],
  );

  // The settings' three validation switches, under whatever the caller adds.
  const settingsContext = useMemo<OrderValidationContext>(
    () => ({
      skipMrp: settings.skipMrp,
      salesmanMandatory: settings.salesmanMandatory,
      freeItemTax: settings.freeItemTax,
    }),
    [settings.freeItemTax, settings.salesmanMandatory, settings.skipMrp],
  );

  const validate = useCallback(
    (validationContext: OrderValidationContext = {}) =>
      validateSaveInputs(draft, pricing, { ...settingsContext, ...validationContext }),
    [draft, pricing, settingsContext],
  );

  const savedRefOf = useCallback(
    (saved: { soId: string; soCompanyId: string; soBranchId: string; soAccYear: string; soOrderRefno: string | null }): SavedOrderRef => ({
      soId: saved.soId,
      soCompanyId: saved.soCompanyId,
      soBranchId: saved.soBranchId,
      soAccYear: saved.soAccYear,
      soOrderRefno: saved.soOrderRefno,
    }),
    [],
  );

  const save = useCallback(
    async (validationContext: OrderValidationContext = {}): Promise<SaveOutcome> => {
      if (inFlight.current) {
        return { status: "failed" };
      }
      const violation = validate(validationContext);
      if (violation?.confirm) {
        // The credit gate asks; it never blocks (§7.2). The caller shows the
        // question and calls `confirmCreditAndSave` on yes.
        return { status: "confirm-credit", message: violation.message };
      }
      if (violation) {
        toast.error(violation.message);
        return { status: "failed" };
      }
      if (!actor.userId) {
        toast.error("Your session has no user id — sign in again before saving.");
        return { status: "failed" };
      }
      if (!actor.deviceId) {
        toast.error("This browser has no device id — saving an order needs one.");
        return { status: "failed" };
      }
      inFlight.current = true;
      setBusy("saving");
      try {
        // A new order is written CONFIRMED or DRAFT by `sales.auto_post`; an
        // existing one keeps the status it was loaded with.
        const payload = buildSavePayload(draft, pricing, actor, {
          newOrderStatus: newOrderStatusFor(settings),
        });
        const saved = await saveSaleOrder(payload).unwrap();
        dispatch(saveResponseApplied({ payload: saved, sentDraft: draft }));
        toast.success(
          saved.soOrderRefno
            ? `Order ${saved.soOrderRefno} saved successfully.`
            : "Order saved successfully.",
        );
        return { status: "saved", document: savedRefOf(saved) };
      } catch (error) {
        toast.error(errorMessage(error));
        return { status: "failed" };
      } finally {
        inFlight.current = false;
        setBusy("idle");
      }
    },
    [actor, dispatch, draft, pricing, saveSaleOrder, savedRefOf, settings, validate],
  );

  const confirmCreditAndSave = useCallback(
    async (validationContext: OrderValidationContext = {}): Promise<SaveOutcome> => {
      dispatch(creditOverrideSet(true));
      // The dispatched override is not yet in this closure's draft, so the
      // validation is run against a patched copy rather than waiting a render.
      const patched = { ...draft, creditOverride: true };
      const violation = validateSaveInputs(patched, pricing, {
        ...settingsContext,
        ...validationContext,
      });
      if (violation) {
        toast.error(violation.message);
        return { status: "failed" };
      }
      if (inFlight.current) {
        return { status: "failed" };
      }
      if (!actor.userId || !actor.deviceId) {
        toast.error("Your session is missing its user or device id — sign in again.");
        return { status: "failed" };
      }
      inFlight.current = true;
      setBusy("saving");
      try {
        const payload = buildSavePayload(patched, pricing, actor, {
          newOrderStatus: newOrderStatusFor(settings),
        });
        const saved = await saveSaleOrder(payload).unwrap();
        dispatch(saveResponseApplied({ payload: saved, sentDraft: draft }));
        toast.success(
          saved.soOrderRefno
            ? `Order ${saved.soOrderRefno} saved successfully.`
            : "Order saved successfully.",
        );
        return { status: "saved", document: savedRefOf(saved) };
      } catch (error) {
        toast.error(errorMessage(error));
        return { status: "failed" };
      } finally {
        inFlight.current = false;
        setBusy("idle");
      }
    },
    [actor, dispatch, draft, pricing, saveSaleOrder, savedRefOf, settings, settingsContext],
  );

  const loadDocument = useCallback(
    async (key: SaleOrderDocKey): Promise<SaleOrderDraft | null> => {
      setBusy("loading");
      try {
        const payload = await dispatch(
          saleOrderApi.endpoints.getSaleOrder.initiate(key, {
            subscribe: false,
            forceRefetch: true,
          }),
        ).unwrap();
        const loaded = parseLoadedDocument(payload, companyStateCode);
        dispatch(draftReplaced(loaded));
        // Today's standing, not the day the order was raised (§10).
        void refreshPartyCredit(loaded.customer.custId);
        return loaded;
      } catch (error) {
        toast.error(errorMessage(error));
        return null;
      } finally {
        setBusy("idle");
      }
    },
    [companyStateCode, dispatch, refreshPartyCredit],
  );

  /**
   * F11 — the most recent order in this scope. Grid 87 already sorts by order
   * date then slno descending, so "the last one" is its first row; the dates
   * travel empty so the window never hides it.
   */
  const loadLastOrder = useCallback(async (): Promise<SaleOrderDraft | null> => {
    if (!draftRef.current.companyId || !draftRef.current.branchId) {
      toast.warn("The company and branch are still loading — try again in a moment.");
      return null;
    }
    setBusy("loading");
    try {
      const page = await dispatch(
        saleOrderApi.endpoints.listSaleOrders.initiate(
          {
            companyId: draftRef.current.companyId,
            branchId: draftRef.current.branchId,
            fromDate: "",
            toDate: "",
            page: 1,
            limit: 1,
          },
          { subscribe: false, forceRefetch: true },
        ),
      ).unwrap();
      const row = page.items?.[0];
      if (!row) {
        toast.info("There are no orders in this branch yet.");
        return null;
      }
      return await loadDocument({
        soId: row.so_id,
        soCompanyId: row.so_company_id,
        soBranchId: row.so_branch_id,
        soAccYear: row.so_acc_year,
      });
    } catch (error) {
      toast.error(errorMessage(error));
      return null;
    } finally {
      setBusy("idle");
    }
  }, [dispatch, loadDocument]);

  /** Ctrl+F3 — a quotation becomes a fresh order draft with its source stamped. */
  const importQuotation = useCallback(
    async (key: QuotationDocKey): Promise<boolean> => {
      setBusy("importing");
      try {
        const payload = await dispatch(
          quotationApi.endpoints.getQuotation.initiate(key, {
            subscribe: false,
            forceRefetch: true,
          }),
        ).unwrap();
        if (payload.sqIsDeleted === true) {
          toast.warn(`${payload.sqQuoteRefno ?? "That quotation"} is deleted and cannot be imported.`);
          return false;
        }
        const imported = importQuotationAsOrder(
          payload,
          companyStateCode,
          todayIso(),
          draftDefaults,
        );
        dispatch(draftReplaced(imported));
        void refreshPartyCredit(imported.customer.custId);
        toast.success(
          settings.allowCustomerChangeOnImport
            ? `Imported ${payload.sqQuoteRefno ?? "quotation"}.`
            : `Imported ${payload.sqQuoteRefno ?? "quotation"} — the customer is locked to the source document.`,
        );
        return true;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      } finally {
        setBusy("idle");
      }
    },
    [companyStateCode, dispatch, draftDefaults, refreshPartyCredit, settings.allowCustomerChangeOnImport],
  );

  const clear = useCallback(() => {
    dispatch(
      draftReplaced(
        createOrderDraft({
          companyId: context.companyId,
          branchId: context.branchId,
          accYear: context.accYear,
          companyStateCode,
          policy: draftPolicy,
          defaults: {
            ...draftDefaults,
            // The salesman and the packer survive a Clear unless
            // `sales.clear_delivery_on_clear` says otherwise (the Qt rule).
            ...deliveryDefaultsToKeep(draftRef.current.header, settings.clearDeliveryOnClear),
          },
        }),
      ),
    );
  }, [
    companyStateCode,
    context.accYear,
    context.branchId,
    context.companyId,
    dispatch,
    draftDefaults,
    draftPolicy,
    settings.clearDeliveryOnClear,
  ]);

  // The settings land after the first draft was made: an untouched screen is
  // re-seeded so the first order of the session starts on the installation's
  // defaults too, not on the constants. Live work is never replaced.
  const reseededForSettings = useRef(false);
  useEffect(() => {
    if (!settingsLoaded || reseededForSettings.current) {
      return;
    }
    reseededForSettings.current = true;
    const current = draftRef.current;
    const untouched =
      !current.docId && !current.isDirty && !current.lines.some((line) => Boolean(line.itemId));
    if (untouched && current.mode === "entry") {
      clear();
    }
  }, [clear, settingsLoaded]);

  const deleteDocument = useCallback(async (): Promise<boolean> => {
    if (!draft.docId) {
      toast.warn("There is nothing saved to delete.");
      return false;
    }
    if (draft.isDeleted) {
      toast.info("This order is already deleted.");
      return false;
    }
    setBusy("deleting");
    try {
      // An order lives in a year partition: the key is all four fields.
      await deleteSaleOrder({
        soId: draft.docId,
        soCompanyId: draft.companyId,
        soBranchId: draft.branchId,
        soAccYear: draft.accYear,
      }).unwrap();
      toast.success("Order deleted.");
      clear();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setBusy("idle");
    }
  }, [clear, deleteSaleOrder, draft.accYear, draft.branchId, draft.companyId, draft.docId, draft.isDeleted]);

  const copyAsNew = useCallback(() => {
    if (!draft.docId) {
      toast.info("This is already a new order.");
      return;
    }
    dispatch(draftReplaced(copyOrderDraftAsNew(draft, todayIso(), settings.defaultValidityDays)));
    void refreshPartyCredit(draft.customer.custId);
  }, [dispatch, draft, refreshPartyCredit, settings.defaultValidityDays]);

  const beginEdit = useCallback(() => {
    if (draft.isDeleted) {
      toast.warn(
        "This order is deleted and cannot be edited. Use Copy as new (Alt+Y) to raise a fresh one from it.",
      );
      return;
    }
    // The Qt screen's refusal, word for word: a cancelled order is history.
    if (draft.status.toUpperCase().includes("CANCEL")) {
      toast.warn("A cancelled order can't be edited — raise a new one.");
      return;
    }
    dispatch(modeSet("entry"));
  }, [dispatch, draft.isDeleted, draft.status]);

  const unitOptionsFor = useCallback(
    (itemId: string): ItemUnitOption[] => unitOptions[itemId] ?? [],
    [unitOptions],
  );

  return {
    draft,
    dispatch,
    pricing,
    isReady: Boolean(draft.companyId && draft.branchId && draft.accYear),
    busy,
    settings,
    canEditPrice,
    regional,
    customerLocked: isCustomerLocked(draft.source, settings.allowCustomerChangeOnImport),
    itemColumns,
    chargeColumns,
    priceLevelOptions,
    chargeMasters,
    tenderMasters,
    tenderMasterError: tenderMastersError
      ? "The tender list could not be read — only Cash is offered until it loads."
      : null,
    actor,
    unitOptionsFor,
    pickCustomer,
    refreshPartyCredit,
    pickItem,
    recoverBaseFactor,
    switchUnit,
    setLineUnit,
    resolveBarcode,
    applyPriceLevel,
    stepLinePriceLevel,
    save,
    confirmCreditAndSave,
    loadDocument,
    loadLastOrder,
    importQuotation,
    deleteDocument,
    clear,
    copyAsNew,
    beginEdit,
    validate,
  };
}
