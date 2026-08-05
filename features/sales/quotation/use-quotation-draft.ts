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
  getAuthSessionId,
  getAuthUserId,
  getOrCreateClientDeviceId,
  getUserInfo,
} from "@/lib/auth/session";
import { extractApiErrorMessage } from "@/lib/api/client";
import {
  quotationApi,
  useDeleteQuotationMutation,
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
  ITEM_GRID_UI_TABLE_ID,
  LOADING_CALC_TYPES,
  PRICE_LEVEL_OPTIONS,
  SESSION_CAPABILITIES,
} from "./quotation.constants";
import { buildSavePayload, parseLoadedDocument } from "./quotation.payload";
import type { SaveActor } from "./quotation.payload";
import { clampPriceLevel, copyDraftAsNew, createDraft } from "./quotation.state";
import type {
  ChargeMasterRow,
  DraftLine,
  ItemUnitOption,
  QuotationDocKey,
  QuotationDraft,
  Violation,
} from "./quotation.types";
import { validateSaveInputs } from "./quotation.validate";
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
export type QuotationBusy = "idle" | "loading" | "saving" | "deleting" | "pricing";

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
  save: () => Promise<boolean>;
  /** The loaded draft, or `null` when the fetch failed. */
  loadDocument: (key: QuotationDocKey) => Promise<QuotationDraft | null>;
  deleteDocument: () => Promise<boolean>;
  clear: () => void;
  copyAsNew: () => void;
  beginEdit: () => void;
  validate: () => Violation | null;
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

  const [busy, setBusy] = useState<QuotationBusy>("idle");
  /**
   * `busy` cannot guard re-entry on its own: `setBusy` is asynchronous, so two
   * F5 presses inside one render both see "idle". The voucher number is
   * allocated inside the server's create transaction, so a second in-flight save
   * stores a SECOND quotation with its own refno.
   */
  const inFlight = useRef(false);
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

  const validate = useCallback(
    () => validateSaveInputs(draft, pricing, { skipMrp: SESSION_CAPABILITIES.skipMrp }),
    [draft, pricing],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) {
      return false;
    }
    const violation = validate();
    if (violation) {
      toast.error(violation.message);
      return false;
    }
    if (!actor.userId) {
      toast.error("Your session has no user id — sign in again before saving.");
      return false;
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
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      inFlight.current = false;
      setBusy("idle");
    }
  }, [actor, draft, pricing, saveQuotation, validate]);

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
   * Copy as new (F9). Starts a fresh, unsaved document pre-filled from the one
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
        "This quotation is deleted and cannot be edited. Use Copy as new (F9) to raise a fresh one from it.",
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
    loadDocument,
    deleteDocument,
    clear,
    copyAsNew,
    beginEdit,
    validate,
  };
}
