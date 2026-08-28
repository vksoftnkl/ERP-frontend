"use client";
/**
 * Quotation Entry — the draft, its derived pricing, and every action that needs
 * the network.
 *
 * The draft itself lives in the Redux store (`@/store/slices/quotationSlice`);
 * this hook is the screen's façade over it. The reducer never calls the API — the
 * thunks in here fetch and then dispatch the result. Everything below the grids
 * is `recalcDocument` in a `useMemo`, so no handler ever has to remember to
 * recalculate — which is the single biggest difference from the Qt screen this
 * ports.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { recalcDocument } from "@/domain/pricing";
import type { DocumentPricing } from "@/domain/pricing";
import { useBusinessContext } from "@/components/layout/business-context";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { AppDispatch } from "@/store/store";
import {
  getAuthSession,
  getAuthSessionId,
  getAuthUserId,
  getOrCreateClientDeviceId,
  getUserInfo,
} from "@/lib/auth/session";
import { API_BASE, extractApiErrorMessage, getAuthHeaderValue } from "@/lib/api/client";
import {
  quotationApi,
  useConvertTransactionHoldMutation,
  useDeleteQuotationMutation,
  useForceReleaseTransactionHoldMutation,
  useLazyGetTransactionHoldQuery,
  useReleaseTransactionHoldMutation,
  useResumeTransactionHoldMutation,
  useSaveTransactionHoldMutation,
  useGetCompanyStateCodeQuery,
  useGetQuotationGridLayoutQuery,
  useGetPriceLevelsQuery,
  useGetSalesChargesQuery,
  useGetUserCapabilitiesQuery,
  useLazyGetCustomerDetailQuery,
  useLazyGetFreightBandsQuery,
  useLazyGetQuotationItemByBarcodeQuery,
  useLazyGetItemPriceQuery,
  useLazyGetItemUnitsQuery,
  useLazySwitchItemUomQuery,
  useSaveQuotationMutation,
} from "@/store/api/quotationApi";
import type { ItemPriceQuery } from "@/store/api/quotationApi";
import {
  companyStateCodeSet,
  customerApplied,
  draftReplaced,
  freightBandsSet,
  holdSet,
  itemPriceApplied,
  lineFieldSet,
  linePriceLevelSet,
  modeSet,
  saveResponseApplied,
  selectQuotationDraft,
  tenantSet,
} from "@/store/slices/quotationSlice";
import {
  CHARGE_GRID_UI_TABLE_ID,
  DEFAULT_FREIGHT_CALC_TYPE,
  DEFAULT_LOADING_CALC_TYPE,
  FREIGHT_CALC_TYPES,
  HOLD_DEVICE_ID_HEADER,
  ITEM_GRID_UI_TABLE_ID,
  LOADING_CALC_TYPES,
  PRICE_LEVEL_OPTIONS,
  SESSION_CAPABILITIES,
  transactionHoldLockEndpoint,
} from "./quotation.constants";
import {
  buildHoldPayload,
  draftFromHold,
  holdAccYearOf,
  holdConversionOf,
  holdLockMessage,
  holdLockScope,
  nextHoldNo,
  readHoldUiState,
} from "./quotation.hold";
import { buildSavePayload, parseLoadedDocument } from "./quotation.payload";
import type { SaveActor } from "./quotation.payload";
import { clampPriceLevel, copyDraftAsNew, createDraft } from "./quotation.state";
import type {
  ChargeMasterRow,
  DraftLine,
  ItemUnitOption,
  QuotationDocKey,
  QuotationDraft,
  SavedQuotationRef,
  TransactionHoldLockScope,
  TransactionHoldPayload,
  Violation,
} from "./quotation.types";
import { validateSaveInputs, type ValidationContext } from "./quotation.validate";
import { accountingYearOf, resolveChargeColumns, resolveItemColumns, todayIso } from "./quotation.utils";
/**
 * An RTK Query rejection reaches a `catch` as `unknown`; every message the user
 * sees goes through here so the three error envelopes this API family uses
 * (class-validator, service throw, module filter) all read the same.
 *
 * `errors[0].message` is preferred over the envelope's own `message`, which is
 * usually the useless summary `"Validation failed"` while the detail underneath
 * names the actual field and reason.
 */
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
/**
 * `user_master.usr_language` is an ISO-ish code, not a language name — the only
 * live value is `'en'`. Anything that is not recognisably English asks the
 * lookups for the regional name; an unset value means "no opinion", so the
 * caller's default stands.
 */
const ENGLISH_LANGUAGE_CODES = new Set(["en", "eng", "en-in", "en_in", "english"]);
function isRegionalLanguage(language: string | null | undefined): boolean | null {
  const code = (language ?? "").trim().toLowerCase();
  if (!code) {
    return null;
  }
  return !ENGLISH_LANGUAGE_CODES.has(code);
}
function clampLoadingType(value: string): string {
  const code = (value ?? "").trim().toLowerCase();
  return (LOADING_CALC_TYPES as readonly string[]).includes(code)
    ? code
    : DEFAULT_LOADING_CALC_TYPE;
}
function clampFreightType(value: string): string {
  const code = (value ?? "").trim().toLowerCase();
  return (FREIGHT_CALC_TYPES as readonly string[]).includes(code)
    ? code
    : DEFAULT_FREIGHT_CALC_TYPE;
}
/** Where the screen is in its life cycle, for the toolbar and the guards. */
export type QuotationBusy =
  | "idle"
  | "loading"
  | "saving"
  | "deleting"
  | "pricing"
  | "holding"
  | "resuming";
export type PriceLevelScope = "selected" | "all";
export type QuotationDraftApi = {
  draft: QuotationDraft;
  /** The store's dispatch, for the slice actions the components raise directly. */
  dispatch: AppDispatch;
  /** The engine's output, or the document's stored figures before the first edit. */
  pricing: DocumentPricing;
  isReady: boolean;
  busy: QuotationBusy;
  canEditPrice: boolean;
  regional: boolean;
  itemColumns: ReturnType<typeof resolveItemColumns>;
  chargeColumns: ReturnType<typeof resolveChargeColumns>;
  /** Price levels as select options, named by the master. */
  priceLevelOptions: ReadonlyArray<{ value: string; label: string }>;
  chargeMasters: ChargeMasterRow[];
  unitOptionsFor: (itemId: string) => ItemUnitOption[];
  pickCustomer: (customerId: string) => Promise<void>;
  pickItem: (lineKey: string, itemId: string, itemUnitId?: string) => Promise<void>;
  recoverBaseFactor: (lineKey: string) => Promise<void>;
  switchUnit: (lineKey: string) => Promise<void>;
  setLineUnit: (lineKey: string, itemUnitId: string) => Promise<void>;
  resolveBarcode: (lineKey: string, barcode: string) => Promise<boolean>;
  applyPriceLevel: (priceLevel: number, scope: PriceLevelScope, lineKeys: string[]) => Promise<void>;
  /** The saved document's key, or `null` when nothing was committed. */
  save: (context?: ValidationContext) => Promise<SavedQuotationRef | null>;
  /** Park the cart in `transaction_hold` and clear the form. */
  hold: () => Promise<boolean>;
  /**
   * Pull a parked cart back onto the screen, taking its edit lock. `false` when
   * another device has it — the screen is left untouched.
   */
  resumeHold: (thId: string) => Promise<boolean>;
  /**
   * Take a cart off the device holding it, so it can be resumed here. Frees the
   * hold; it does not open it.
   */
  takeOverHold: (hold: TransactionHoldPayload) => Promise<boolean>;
  /** The loaded draft, or `null` when the fetch failed. */
  loadDocument: (key: QuotationDocKey) => Promise<QuotationDraft | null>;
  deleteDocument: () => Promise<boolean>;
  clear: () => void;
  copyAsNew: () => void;
  beginEdit: () => void;
  validate: (context?: ValidationContext) => Violation | null;
};
/**
 * The context a new draft is seeded from. `accYear` prefers the stored fiscal
 * year (`fiscal_years.fy_year_name`, already 9 characters) and only falls back to
 * deriving it from the voucher date — the two disagree on a quote back-dated
 * across 1 April, and `sq_acc_year` is immutable after create *and* part of the
 * voucher sequence's period key, so the stored one wins and validation refuses a
 * date that would land in another year.
 */
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
export function useQuotationDraft(): QuotationDraftApi {
  const context = useDraftContext();
  const actor = useSaveActor();
  const dispatch = useAppDispatch();
  const draft = useAppSelector(selectQuotationDraft);
  const { data: companyStateCode = "" } = useGetCompanyStateCodeQuery(context.companyId, {
    skip: !context.companyId,
  });
  const { data: capabilities } = useGetUserCapabilitiesQuery(actor.userId, {
    skip: !actor.userId,
  });
  const { data: itemLayout } = useGetQuotationGridLayoutQuery({
    uiTableId: ITEM_GRID_UI_TABLE_ID,
  });
  const { data: chargeLayout } = useGetQuotationGridLayoutQuery({
    uiTableId: CHARGE_GRID_UI_TABLE_ID,
  });
  const { data: chargeMasters = [] } = useGetSalesChargesQuery();
  const { data: priceLevelNames = [] } = useGetPriceLevelsQuery();
  const [fetchCustomerDetail] = useLazyGetCustomerDetailQuery();
  const [fetchItemPrice] = useLazyGetItemPriceQuery();
  const [fetchNextUnit] = useLazySwitchItemUomQuery();
  const [fetchItemUnits] = useLazyGetItemUnitsQuery();
  const [fetchBarcode] = useLazyGetQuotationItemByBarcodeQuery();
  const [fetchFreightBands] = useLazyGetFreightBandsQuery();
  const [saveQuotation] = useSaveQuotationMutation();
  const [deleteQuotation] = useDeleteQuotationMutation();
  const [saveHold] = useSaveTransactionHoldMutation();
  const [fetchHold] = useLazyGetTransactionHoldQuery();
  const [resumeHoldLock] = useResumeTransactionHoldMutation();
  const [releaseHoldLock] = useReleaseTransactionHoldMutation();
  const [forceReleaseHoldLock] = useForceReleaseTransactionHoldMutation();
  const [convertHoldLock] = useConvertTransactionHoldMutation();
  const [busy, setBusy] = useState<QuotationBusy>("idle");
  /**
   * `busy` cannot guard re-entry on its own: `setBusy` is asynchronous, so two
   * F5 presses inside one render both see "idle". The voucher number is
   * allocated inside the server's create transaction, so a second in-flight save
   * stores a SECOND quotation with its own refno.
   */
  const inFlight = useRef(false);
  /**
   * The same guard for Hold, and it matters more: the hold number is minted
   * client-side, so two F9 presses inside one render would not even collide —
   * they would quietly park the cart TWICE under two different numbers.
   */
  const holdInFlight = useRef(false);
  /**
   * The hold this device currently has LOCKED, if any.
   *
   * A ref rather than a value derived from the draft, because the release has to
   * be able to run when the draft is already gone — replaced by another cart,
   * cleared, or unmounted on the way back to the list. It carries the scope with
   * it for the same reason: the row's own company / branch, captured when the
   * lock was taken, not whatever the screen is showing by then.
   */
  const lockedHold = useRef<{
    thId: string;
    holdNo: string;
    scope: TransactionHoldLockScope;
  } | null>(null);
  const [unitOptions, setUnitOptions] = useState<Record<string, ItemUnitOption[]>>({});
  /** The live draft, for effects that must not re-run when it changes. */
  const draftRef = useRef(draft);
  draftRef.current = draft;
  /** Set below; held in a ref so the unit-prefetch effect has a stable dep list. */
  const loadUnitOptionsRef = useRef<(itemId: string) => Promise<void>>(async () => {});
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
      // The shell's company/branch/year changed while a quotation was being
      // entered. Re-tenanting it would leave company A's prices, freight and
      // loading on a document stamped for company B, and would flip its tax
      // basis underneath the operator. The document keeps the context it was
      // priced in; the change applies to the next one.
      toast.info(
        "The company, branch or year changed. This quotation keeps the one it was started in — clear it (F7) to start in the new context.",
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
  }, [context.companyId, context.branchId, context.accYear]);
  useEffect(() => {
    if (companyStateCode) {
      dispatch(companyStateCodeSet(companyStateCode));
    }
  }, [companyStateCode]);
  // A new quotation starts with NO charges. The masters' `chgAutoApply` flag
  // used to pre-load freight, loading and the standing cash discount here (as
  // the Qt screen does); the operator now picks what the document needs, on the
  // charge grid's own blank row.

  // A loaded document's lines were never picked in this session, so their unit
  // lists have not been fetched — without this the Uom dropdown on a reloaded
  // line offers only the unit it already has, while a line picked in this session
  // offers every conversion.
  const lineItemIds = draft.lines.map((line) => line.itemId).filter(Boolean).join("|");
  useEffect(() => {
    for (const itemId of new Set(lineItemIds.split("|").filter(Boolean))) {
      void loadUnitOptionsRef.current(itemId);
    }
  }, [lineItemIds]);
  const itemColumns = useMemo(() => resolveItemColumns(itemLayout), [itemLayout]);
  const chargeColumns = useMemo(() => resolveChargeColumns(chargeLayout), [chargeLayout]);
  // The master names the levels; the built-in A/B/C/D list is the fallback for a
  // deployment that has not configured one (and for the moment before it loads).
  const priceLevelOptions = useMemo(
    () => (priceLevelNames.length > 0 ? priceLevelNames : PRICE_LEVEL_OPTIONS.map((o) => ({ ...o }))),
    [priceLevelNames],
  );
  const canEditPrice = capabilities?.editRate ?? SESSION_CAPABILITIES.editPrice;
  const regional = isRegionalLanguage(capabilities?.language) ?? SESSION_CAPABILITIES.regional;
  /**
   * The whole screen below the header, in one derived value.
   *
   * A loaded document paints its own stored figures until the first edit flips
   * `pricing` to `live`; from then on the engine runs, under the *document's*
   * policy snapshot rather than the current session settings.
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
  const pricing =draft.pricing === "stored" && draft.storedPricing ? draft.storedPricing : livePricing;
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
  /** Every `/item-price` call quotes the DOCUMENT's scope, never the session's. */
  const priceQueryFor = useCallback(
    (line: DraftLine | undefined, itemId: string, itemUnitId: string | undefined, priceLevel: number): ItemPriceQuery => ({
      item_id: itemId,
      price_level: clampPriceLevel(priceLevel),
      ...(itemUnitId ? { unit_id: itemUnitId } : {}),
      ...(draft.companyId ? { company_id: draft.companyId } : {}),
      ...(draft.branchId ? { branch_id: draft.branchId } : {}),
      ...(draft.customer.custId ? { customer_id: draft.customer.custId } : {}),
      ...(line?.godownId ? { godown_id: line.godownId } : {}),
      ...(draft.accYear ? { acccyear: draft.accYear } : {}),
      // Both are closed sets server-side and a stray value is a 400. A loaded
      // document's snapshot is free text (`NullableString(12)`, not normalised),
      // so a row written by another client can hold `auto` for freight — valid
      // for loading, rejected for freight — or an old `FIXED`.
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
  const pickItem = useCallback(
    async (lineKey: string, itemId: string, itemUnitId?: string) => {
      const line = draft.lines.find((row) => row.key === lineKey);
      const level = line?.priceLevel ?? draft.header.priceLevel;
      setBusy("pricing");
      try {
        const lookup = await fetchItemPrice(priceQueryFor(line, itemId, itemUnitId, level)).unwrap();
        dispatch(itemPriceApplied({ key: lineKey, lookup }));
        void loadUnitOptions(itemId);
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setBusy("idle");
      }
    },
    [draft.lines, draft.header.priceLevel, fetchItemPrice, loadUnitOptions, priceQueryFor],
  );
  /**
   * Recover a loaded line's real unit-conversion factor.
   *
   * `sqi_to_base_factor` is not persisted and cannot be back-derived on a line
   * with no case quantity, so such a line loads with a placeholder 1. Keying a
   * Case Qty against that placeholder would quote `caseQty × 1` instead of
   * `caseQty × 12`, i.e. a fraction of the correct money. Only the factor is
   * taken — nothing else on the line is touched, so this is not a repricing.
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
        dispatch(lineFieldSet({ key: lineKey, field: "toBaseFactorKnown", value: true }));
      } catch (error) {
        toast.error(
          `Could not read the unit conversion for ${line.itemName || "this line"}: ${errorMessage(error)}. Re-pick the item before keying a case quantity.`,
        );
      }
    },
    [fetchItemPrice, priceQueryFor],
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
    [draft.lines, fetchItemPrice, fetchNextUnit, priceQueryFor],
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
        // The barcode lookup's `unitId` is an `iuc_id`, which `/item-price`
        // accepts directly.
        const line = draft.lines.find((row) => row.key === lineKey);
        const lookup = await fetchItemPrice(
          priceQueryFor(line, scanned.itemId, scanned.unitId, line?.priceLevel ?? draft.header.priceLevel),
        ).unwrap();
        dispatch(itemPriceApplied({ key: lineKey, lookup }));
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
      draft.lines,
      draft.header.priceLevel,
      fetchBarcode,
      fetchItemPrice,
      loadUnitOptions,
      priceQueryFor,
    ],
  );
  const pickCustomer = useCallback(
    async (customerId: string) => {
      if (!customerId) {
        return;
      }
      if (!draft.companyId || !draft.branchId) {
        // The shell's company/branch had not resolved yet. Saying so beats a
        // combobox that silently snaps back to blank.
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
        // Freight bands are only worth fetching when the area/distance actually
        // changed and the policy is not manual. Unlike the Qt client, the fetched
        // bands reach the bill immediately: they are draft state and the engine is
        // derived, so the "freight does not apply until some later edit" bug
        // cannot happen here.
        const distance = detail.distance_km;
        const distanceChanged = distance !== draft.customer.distanceKm;
        const manualFreight = draft.policy.freightCalcType.trim().toUpperCase() === "MANUAL";
        if (distance !== null && distance >= 0 && distanceChanged && !manualFreight) {
          try {
            const bands = await fetchFreightBands(Math.trunc(distance)).unwrap();
            dispatch(freightBandsSet(bands));
          } catch {
            // No band for this distance is an ordinary answer, not an error.
          }
        }
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setBusy("idle");
      }
    },
    [
      draft.companyId,
      draft.branchId,
      draft.customer.distanceKm,
      draft.policy.freightCalcType,
      fetchCustomerDetail,
      fetchFreightBands,
      regional,
    ],
  );
  /**
   * CTRL+1..4 / the price-level combo. Changing a level is not a local edit: each
   * affected line has to be repriced from the server at the new level, and only
   * "Apply to All" commits the document's own level.
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
          : lineKeys.filter((key) => draft.lines.some((line) => line.key === key && line.itemId));
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
    [canEditPrice, draft.lines, fetchItemPrice, priceQueryFor],
  );
  // `context` carries what only the screen knows — which header fields the
  // deployment's Visible Settings actually put on the form. Both callers pass
  // the same one: `save` re-runs the check itself so no path can commit a
  // document that was never validated.
  const validate = useCallback(
    (context: ValidationContext = {}) =>
      validateSaveInputs(draft, pricing, {
        skipMrp: SESSION_CAPABILITIES.skipMrp,
        ...context,
      }),
    [draft, pricing],
  );
  const save = useCallback(async (context: ValidationContext = {}): Promise<SavedQuotationRef | null> => {
    if (inFlight.current) {
      return null;
    }
    const violation = validate(context);
    if (violation) {
      toast.error(violation.message);
      return null;
    }
    if (!actor.userId) {
      toast.error("Your session has no user id — sign in again before saving.");
      return null;
    }
    inFlight.current = true;
    setBusy("saving");
    try {
      const payload = buildSavePayload(draft, pricing, actor);
      const saved = await saveQuotation(payload).unwrap();
      // Merged by the reducer, against whatever the state is when the response
      // lands — not against the `draft` this closure captured. An operator can
      // commit another cell while the POST is in flight, and resetting to the
      // pre-save snapshot would throw that edit away.
      //
      // Merged rather than re-parsed, too: the save path performs no joins, so
      // re-parsing the response would blank every item name on screen.
      dispatch(saveResponseApplied({ payload: saved, sentDraft: draft }));
      toast.success(
        saved.sqQuoteRefno
          ? `Quotation ${saved.sqQuoteRefno} saved.`
          : "Quotation saved.",
      );
      // A cart that was parked has now become a real document, so the hold is
      // closed against it rather than left sitting in the held list for someone
      // to resume and bill a second time. Deliberately not fatal: the quotation
      // IS saved by this point, and failing the whole action over the hold row
      // would tell the operator otherwise.
      if (draft.holdId) {
        // Converting ends the lock by closing the hold, so the release paths
        // must not also fire — a CONVERTED hold is terminal and would refuse.
        lockedHold.current = null;
        const deviceId = actor.deviceId;
        const holdLabel = draft.holdNo || draft.holdId;
        if (!deviceId) {
          // Only the holding DEVICE may close a hold, and this browser can no
          // longer say which it is. The quotation is saved either way; the hold
          // is left for the picker's take-over.
          toast.warn(`Saved, but hold ${holdLabel} could not be closed: this browser has no device id.`);
        } else {
          try {
            // Only the device holding the lock may close a hold onto a document,
            // and this is that device — it resumed the cart. The scope comes off
            // the draft here because the hold row is not to hand; both halves are
            // the ones the cart was parked under, which is what the row carries.
            await convertHoldLock({
              thId: draft.holdId,
              deviceId,
              scope: { thCompanyId: draft.companyId, thBranchId: draft.branchId },
              conversion: holdConversionOf(
                { sqId: saved.sqId, quoteRefno: saved.sqQuoteRefno ?? null },
                actor,
              ),
            }).unwrap();
          } catch (error) {
            toast.warn(
              `Saved, but hold ${holdLabel} could not be closed: ` +
                holdLockMessage(error, holdLabel),
            );
          }
        }
        dispatch(holdSet({ holdId: null, holdNo: "" }));
      }
      // The key rather than a flag: `clear()` is the caller's very next act on
      // a successful save, and after it the form no longer knows what it wrote.
      return {
        sqId: saved.sqId,
        sqCompanyId: saved.sqCompanyId,
        sqBranchId: saved.sqBranchId,
        sqAccYear: saved.sqAccYear,
        quoteRefno: saved.sqQuoteRefno ?? null,
      };
    } catch (error) {
      toast.error(errorMessage(error));
      return null;
    } finally {
      inFlight.current = false;
      setBusy("idle");
    }
  }, [actor, convertHoldLock, draft, pricing, saveQuotation, validate]);
  /**
   * Returns the draft it loaded, not just a flag, so the caller can decide what
   * to do with it before the store round-trips back through render — the entry
   * screen's "open ready to edit" path has to know whether the document it just
   * loaded is a deleted one.
   */
  const loadDocument = useCallback(
    async (key: QuotationDocKey): Promise<QuotationDraft | null> => {
      setBusy("loading");
      try {
        // Dispatched through `initiate` rather than a lazy-query trigger: this is
        // also called from a mount effect (the list's Create/Edit route into the
        // form), and a lazy trigger fired before its own subscription exists
        // resolves with `undefined` and never touches the network.
        const payload = await dispatch(
          quotationApi.endpoints.getQuotation.initiate(key, {
            subscribe: false,
            forceRefetch: true,
          }),
        ).unwrap();
        const loaded = parseLoadedDocument(payload, companyStateCode);
        dispatch(draftReplaced(loaded));
        return loaded;
      } catch (error) {
        toast.error(errorMessage(error));
        return null;
      } finally {
        setBusy("idle");
      }
    },
    [companyStateCode, dispatch],
  );
  const clear = useCallback(() => {
    dispatch(
      draftReplaced(
        createDraft({
          companyId: context.companyId,
          branchId: context.branchId,
          accYear: context.accYear,
          companyStateCode,
        }),
      ),
    );
  }, [companyStateCode, context.accYear, context.branchId, context.companyId]);
  const deleteDocument = useCallback(async (): Promise<boolean> => {
    if (!draft.docId) {
      toast.warn("There is nothing saved to delete.");
      return false;
    }
    if (draft.isDeleted) {
      toast.info("This quotation is already deleted.");
      return false;
    }
    setBusy("deleting");
    try {
      await deleteQuotation(draft.docId).unwrap();
      toast.success("Quotation deleted.");
      clear();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setBusy("idle");
    }
  }, [clear, deleteQuotation, draft.docId, draft.isDeleted]);
  /**
   * Hand back the lock this device holds, if it still holds one.
   *
   * The single place a lock is given up on the way out — reached by every route
   * off the cart (opening another hold, Clear, Cancel back to the list,
   * unmounting the screen), so no caller has to remember. The ref is claimed
   * before the request goes out, so two of those firing at once cannot both
   * release.
   *
   * Deliberately quiet: the operator is already leaving, a failed release is not
   * something they can act on, and the picker's take-over is the backstop for
   * exactly this. Nothing here is fatal to whatever the caller was doing.
   */
  const releaseLockedHold = useCallback(async (): Promise<void> => {
    const locked = lockedHold.current;
    if (!locked || !actor.deviceId) {
      return;
    }
    lockedHold.current = null;
    try {
      await releaseHoldLock({
        thId: locked.thId,
        deviceId: actor.deviceId,
        scope: locked.scope,
      }).unwrap();
    } catch {
      // Left LOCKED. Recoverable from the held list, and on this device the
      // resume is re-entrant, so the operator can simply open it again.
    }
  }, [actor.deviceId, releaseHoldLock]);
  /**
   * Hold (F9). Parks the cart in `transaction_hold` and clears the form so the
   * next customer can be served.
   *
   * Nothing is written to `sale_quotation`: this is the alternative to saving,
   * not a step towards it, so it deliberately does NOT run `validate()` — a
   * parked cart is unfinished by definition and refusing to park one because it
   * has no customer yet would defeat the point. The one thing it insists on is
   * something to park.
   *
   * Holding a cart that was itself resumed updates that same hold rather than
   * creating a second one; see `QuotationDraft.holdId`.
   */
  const hold = useCallback(async (): Promise<boolean> => {
    if (holdInFlight.current) {
      return false;
    }
    if (!actor.userId) {
      toast.error("Your session has no user id — sign in again before holding.");
      return false;
    }
    // Guarded here rather than on the button alone, because the F9 shortcut does
    // not go through it. Holding parks work in progress; a document being read
    // has none, and one already saved is not waiting on anything.
    if (draft.mode !== "entry" || draft.isDeleted) {
      toast.warn("Only a quotation being entered can be held — press F2 to edit this one.");
      return false;
    }
    if (!draft.lines.some((line) => line.itemId)) {
      toast.warn("There is nothing to hold — add at least one item first.");
      return false;
    }
    // Checked even when this cart already has a hold row, because the update
    // below can fall back to a create — and the scope is immutable once the row
    // exists, so a hold parked under a half-resolved tenant could never be
    // corrected.
    if (!draft.companyId || !draft.branchId || holdAccYearOf(draft.accYear) === null) {
      toast.warn("The company, branch or year is still loading — try again in a moment.");
      return false;
    }
    if (!actor.deviceId) {
      toast.error("This browser has no device id — holding needs one.");
      return false;
    }

    holdInFlight.current = true;
    setBusy("holding");
    try {
      let holdId = draft.holdId;
      for (let attempt = 0; ; attempt += 1) {
        try {
          const saved = await saveHold(
            buildHoldPayload(draft, pricing, actor, { holdId, holdNo: nextHoldNo() }),
          ).unwrap();
          // Re-parking a cart this device resumed: the row is still LOCKED to
          // it, and only `/release` can put it back to HELD *and* clear
          // `th_locked_by`. Writing the status through the save above would
          // leave the lock pointing at a device that has moved on, and the next
          // operator would find a free-looking hold nobody can take.
          if (holdId) {
            // Claimed before the request so the draft-change effect below does
            // not race this one and release the same lock twice.
            lockedHold.current = null;
            try {
              await releaseHoldLock({
                thId: holdId,
                deviceId: actor.deviceId,
                scope: holdLockScope(saved),
              }).unwrap();
            } catch (error) {
              // The cart IS parked — only the lock is still on this device, and
              // the picker's take-over clears that. Not worth failing F9 over.
              toast.warn(
                `Held as ${saved.thHoldNo}, but it is still locked to this device: ` +
                  holdLockMessage(error, saved.thHoldNo),
              );
              clear();
              return true;
            }
          }
          toast.success(`Held as ${saved.thHoldNo}. Pick held (F10) brings it back.`);
          clear();
          return true;
        } catch (error) {
          const status = (error as { status?: number }).status;
          // The row this cart was resumed from is gone — discarded from the
          // held list by someone else while it was open. Park it as a new hold
          // rather than leaving F9 failing forever against a row that no longer
          // exists. Cannot loop: the retry has no id to 404 on.
          if (status === 404 && holdId) {
            holdId = null;
            continue;
          }
          // `th_hold_no` is minted client-side (nothing generates one
          // server-side) and is unique per company / branch / year / document
          // type. The random tail makes a clash between two tills improbable
          // rather than impossible, so one is answered by minting another
          // instead of by losing the cart.
          if (status === 409 && !holdId && attempt < 2) {
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      holdInFlight.current = false;
      setBusy("idle");
    }
  }, [actor, clear, draft, pricing, releaseHoldLock, saveHold]);

  /**
   * Pick held (F10). Pulls a parked cart back onto the screen — and takes its
   * edit lock, so no other device can open the same cart.
   *
   * The order is deliberate and is the opposite of what it used to be. The lock
   * is taken FIRST and the screen is only redrawn if it was granted: `/resume`
   * is one conditional update (`th_status = 'HELD'` lives in its WHERE clause),
   * so two operators pressing F10 on the same row serialize on it and exactly
   * one wins. Restoring the cart first and then flagging it would put the same
   * cart on two screens and only afterwards discover the clash.
   *
   * The cart itself is restored from the hold's own `th_ui_state`, which the
   * server stores verbatim and never reads into — the resume response carries
   * it, so there is no second fetch. A row this screen did not write cannot be
   * redrawn, and is refused rather than half-drawn; the lock is handed straight
   * back so the refusal costs nobody the cart.
   */
  const resumeHold = useCallback(
    async (thId: string): Promise<boolean> => {
      if (!actor.deviceId) {
        toast.error("This browser has no device id — resuming a held cart needs one.");
        return false;
      }
      // Opening another cart gives up the one this device is on. Done here
      // rather than left to the draft-change effect: the ref is about to be
      // overwritten with the new hold, and the old lock would have nothing left
      // pointing at it — stranded on the server until somebody took it over.
      if (lockedHold.current && lockedHold.current.thId !== thId) {
        await releaseLockedHold();
      }
      setBusy("resuming");
      try {
        // Read first ONLY for the scope: the lock body is keyed on the row's own
        // company / branch (immutable since create), not on whatever tenant the
        // screen happens to be showing.
        const held = await fetchHold(thId).unwrap();
        const scope = holdLockScope(held);
        let locked: TransactionHoldPayload;
        try {
          locked = await resumeHoldLock({ thId, deviceId: actor.deviceId, scope }).unwrap();
        } catch (error) {
          // 409 names the device that has it, 403/404 speak for themselves —
          // all of them mean the cart stays where it is and the screen is
          // untouched.
          toast.error(holdLockMessage(error, held.thHoldNo));
          return false;
        }
        const uiState = readHoldUiState(locked.thUiState);
        if (!uiState) {
          toast.error(
            `Hold ${locked.thHoldNo} was not parked from Quotation entry — it cannot be opened here.`,
          );
          // Nothing was restored, so nothing is being edited: give the lock back
          // rather than leaving a cart nobody can reach.
          void releaseHoldLock({ thId, deviceId: actor.deviceId, scope })
            .unwrap()
            .catch(() => undefined);
          return false;
        }
        lockedHold.current = { thId, holdNo: locked.thHoldNo, scope };
        dispatch(draftReplaced(draftFromHold(locked, uiState)));
        toast.success(`Hold ${locked.thHoldNo} restored — it is locked to this device.`);
        return true;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      } finally {
        setBusy("idle");
      }
    },
    [actor.deviceId, fetchHold, releaseHoldLock, releaseLockedHold, resumeHoldLock],
  );


  /**
   * The cart on screen is no longer the one this device locked — it opened
   * another hold, cleared the form, or went back to the list — so the lock goes
   * back. Paths that end a lock deliberately (re-parking with F9, converting on
   * save) clear the ref themselves, so this does not fire a second time behind
   * them.
   */
  useEffect(() => {
    const locked = lockedHold.current;
    if (locked && draft.holdId !== locked.thId) {
      void releaseLockedHold();
    }
  }, [draft.holdId, releaseLockedHold]);

  /**
   * The tab is going away. `pagehide` rather than `beforeunload` (which mobile
   * Safari never fires), and a bare `fetch` with `keepalive` rather than the
   * mutation: React will not finish an in-flight hook call once the document is
   * unloading. `sendBeacon` cannot be used at all — it takes no custom headers,
   * and the device id IS a header.
   *
   * Best effort by nature: a crash, a lost network or a killed process never
   * reaches this. That is what the picker's take-over exists for.
   */
  useEffect(() => {
    const releaseOnUnload = () => {
      const locked = lockedHold.current;
      if (!locked || !actor.deviceId) {
        return;
      }
      lockedHold.current = null;
      const authorization = getAuthHeaderValue(getAuthSession());
      void fetch(`${API_BASE}${transactionHoldLockEndpoint(locked.thId, "release")}`, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          [HOLD_DEVICE_ID_HEADER]: actor.deviceId,
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify(locked.scope),
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", releaseOnUnload);
    return () => window.removeEventListener("pagehide", releaseOnUnload);
  }, [actor.deviceId]);

  /**
   * Leaving the screen for the list is an ordinary unmount — the document is
   * still alive, so the real request goes rather than the keepalive one.
   *
   * Two effects, not one, and the empty dep array is the point: a cleanup that
   * depended on `releaseLockedHold` would run again every time that callback's
   * identity changed, handing the lock back while the operator was still
   * editing. The ref keeps the latest implementation without making the unmount
   * effect depend on it.
   */
  const releaseOnUnmount = useRef<() => void>(() => {});
  useEffect(() => {
    releaseOnUnmount.current = () => void releaseLockedHold();
  }, [releaseLockedHold]);
  useEffect(() => () => releaseOnUnmount.current(), []);

  /**
   * Take a cart off the device that is holding it.
   *
   * The escape hatch the picker offers on an in-use row, and the only one there
   * is: nothing times a lock out, so a browser that died mid-edit would
   * otherwise strand its cart for good. It frees the row — it does not open it —
   * so the caller resumes afterwards like any other free hold.
   */
  const takeOverHold = useCallback(
    async (hold: TransactionHoldPayload): Promise<boolean> => {
      if (!actor.deviceId) {
        toast.error("This browser has no device id — taking over a held cart needs one.");
        return false;
      }
      try {
        await forceReleaseHoldLock({
          thId: hold.thId,
          deviceId: actor.deviceId,
          scope: holdLockScope(hold),
        }).unwrap();
        toast.success(`Hold ${hold.thHoldNo} is free again — resume it to continue.`);
        return true;
      } catch (error) {
        toast.error(holdLockMessage(error, hold.thHoldNo));
        return false;
      }
    },
    [actor.deviceId, forceReleaseHoldLock],
  );

  /**
   * Copy as new (Ctrl+F9). Starts a fresh, unsaved document pre-filled from the one
   * on screen — including whatever the operator has not saved yet. Nothing
   * about the original is touched: its last save stands in the database
   * exactly as it was.
   */
  const copyAsNew = useCallback(() => {
    if (!draft.docId) {
      toast.info("This is already a new quotation.");
      return;
    }
    dispatch(draftReplaced(copyDraftAsNew(draft, todayIso())));
  }, [dispatch, draft]);

  /**
   * F2. The one gate that turns a loaded document editable — so refusing a
   * deleted one here is what keeps every editor, grid and shortcut on the screen
   * closed, without a guard per handler.
   */
  const beginEdit = useCallback(() => {
    if (draft.isDeleted) {
      toast.warn(
        "This quotation is deleted and cannot be edited. Use Copy as new (Ctrl+F9) to raise a fresh one from it.",
      );
      return;
    }
    dispatch(modeSet("entry"));
  }, [draft.isDeleted]);

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
    canEditPrice,
    regional,
    itemColumns,
    chargeColumns,
    priceLevelOptions,
    chargeMasters,
    unitOptionsFor,
    pickCustomer,
    pickItem,
    recoverBaseFactor,
    switchUnit,
    setLineUnit,
    resolveBarcode,
    applyPriceLevel,
    save,
    hold,
    resumeHold,
    takeOverHold,
    loadDocument,
    deleteDocument,
    clear,
    copyAsNew,
    beginEdit,
    validate,
  };
}
