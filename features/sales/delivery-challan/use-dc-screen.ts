"use client";

/**
 * Delivery Challan — every read and write the screen makes (the network half
 * of Qt `DeliveryChallanEntry`). The draft lives in a local reducer
 * (`dc.state.ts`); pricing is the shared engine with no charges.
 *
 * Reads that a load fires from an effect go through `endpoint.initiate(…,
 * {subscribe: false, forceRefetch: true})` (a lazy trigger there resolves
 * `undefined`); the challan itself is read with a GET-mutation, so every open
 * is its own request.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { recalcDocument, type DocumentPricing } from "@/domain/pricing";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { documentRights } from "@/lib/permissions/document-rights";
import { getAuthUserId, getOrCreateClientDeviceId, getUserInfo } from "@/lib/auth/session";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import { useUiTableId } from "@/lib/ui-tables";
import { useAppDispatch } from "@/store/hooks";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import {
  quotationApi,
  useConvertTxnHoldMutation,
  useForceReleaseTxnHoldMutation,
  useGetCompanyStateCodeQuery,
  useGetQuotationGridLayoutQuery,
  useGetUserCapabilitiesQuery,
  useReleaseTxnHoldMutation,
  useResumeTxnHoldMutation,
  useSaveTxnHoldMutation,
  type ItemPriceQuery,
} from "@/store/api/quotationApi";
import { saleBillApi } from "@/store/api/saleBillApi";
import {
  DEFAULT_FREIGHT_CALC_TYPE,
  DEFAULT_LOADING_CALC_TYPE,
  FREIGHT_CALC_TYPES,
  LOADING_CALC_TYPES,
} from "@/features/sales/quotation/quotation.constants";
import { clampPriceLevel, customerFromDetail, resolveLocalSale } from "@/features/sales/quotation/quotation.state";
import { holdLockScope, nextHoldNo, nextHoldSlno } from "@/features/sales/quotation/quotation.hold";
import type { TxnHoldPayload } from "@/features/sales/quotation/quotation.types";
import { resolveItemColumnsWith, todayIso } from "@/features/sales/quotation/quotation.utils";
import { parseSaleOrderSettings, toEnginePolicy } from "@/features/sales/sale-order/sale-order.settings";
import { getTillSessionId } from "@/features/sales/till/shared/session-store";
import { notesFromError, overridesAgainst, parseValidationNotes } from "@/features/sales/testbill/domain/notes";
import type { OpenSourcePick } from "@/features/sales/testbill/domain/import";
import { transportBandDto } from "@/features/sales/testbill/domain/shipping";
import type { OpenSourceDoc } from "@/features/sales/testbill/api/bills";
import type { PartyContext, TransportBand, ValidationNote } from "@/features/sales/testbill/types";
import { DC_ITEM_COLUMN_MEANINGS } from "./dc.columns";
import { DC_DOC_TYPE, DC_ITEM_GRID_UI_TABLE_KEY, DC_MENU_ID, DC_SETTING_KEYS } from "./dc.constants";
import { useDcAmendMutation, useDcCancelMutation, useDcConvertPurposeMutation, useDcDeleteMutation, useDcGetMutation, useDcSaveMutation, useDcTransportMutation, useDcValidateMutation } from "./dc.api";
import { verbsOf } from "./dc.lifecycle";
import { buildDcPayload, dcKeyOf, draftFromPayload, linesNeedingNames, type DcSaveActor } from "./dc.payload";
import {
  appendSourceLines,
  applyDcItemNames,
  applyDcItemPrice,
  copyDcAsNew,
  createDcDraft,
  dcReducer,
  discountAll,
  itemLines,
  lineIsFulfilled,
  setLineDiscPerc,
  setLineQty,
  setLineRate,
  type DcPriceLookup,
} from "./dc.state";
import type { DcDocKey, DcDraft, DcDraftLine } from "./dc.types";
import { validateDc, type DcValidationError } from "./dc.validate";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";

const HOLD_KIND = "HOLD";
const HOLD_SRC_MODULE = "SALES";
const HOLD_PARTY_TYPE = "CUSTOMER";
export const DC_HOLD_UI_KIND = "erp.sales.delivery-challan.hold";
const HOLD_UI_VERSION = 1;

function settingOf(rows: readonly EffectiveSetting[] | undefined, key: string, fallback: boolean): boolean {
  const row = rows?.find((candidate) => candidate.asdKey === key);
  const value = (row?.value ?? row?.asdDefaultValue ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(value)) return true;
  if (["false", "0", "no", "n", "off"].includes(value)) return false;
  return fallback;
}

function clampCalc<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const lower = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(lower) ? (lower as T) : fallback;
}

/** A hold this screen wrote — the `txh_payload` stamp says so. */
export function isDcHold(hold: TxnHoldPayload): boolean {
  const payload = hold.txhPayload as Record<string, unknown> | null | undefined;
  return Boolean(payload && payload.kind === DC_HOLD_UI_KIND && payload.draft);
}

export type DcPrompt =
  | { kind: "cancel" }
  | { kind: "amend"; print: boolean }
  | { kind: "convert" }
  | null;

export type ValidationPopupState = { proceedVerb: string | null; onProceed: (() => void) | null } | null;

export function useDcScreen() {
  const dispatchStore = useAppDispatch();
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim();
  const yearStart = activeFiscalYear?.beginDate?.slice(0, 10) ?? null;
  const yearEnd = activeFiscalYear?.endDate?.slice(0, 10) ?? null;

  const actor = useMemo<DcSaveActor>(
    () => ({
      userId: getAuthUserId() ?? "",
      userName: getUserInfo()?.userName ?? null,
      // The till session this goes into when one is open — never the login session (Qt bec3f98).
      sessionId: getTillSessionId() ?? null,
      deviceId: getOrCreateClientDeviceId(),
      deviceMasterId: getUserInfo()?.deviceId ?? null,
      deviceType: getUserInfo()?.deviceType ?? null,
    }),
    [],
  );

  const { data: settingRows } = useGetEffectiveSettingsQuery({ companyId, branchId }, { skip: !companyId });
  const settings = useMemo(() => parseSaleOrderSettings(settingRows ?? []), [settingRows]);
  const dcRequiresOrder = settingOf(settingRows, DC_SETTING_KEYS.dcRequiresOrder, false);
  const quickAddCustomer = settingOf(settingRows, DC_SETTING_KEYS.quickAddCustomer, true);
  const { data: companyStateFromMaster = "" } = useGetCompanyStateCodeQuery(companyId, { skip: !companyId });
  const companyStateCode = settings.companyStateCode || companyStateFromMaster;
  const { data: capabilities } = useGetUserCapabilitiesQuery(actor.userId, { skip: !actor.userId });
  const canEditPrice = (capabilities?.editRate ?? true) && settings.editPrice;
  const policy = useMemo(() => toEnginePolicy(settings), [settings]);

  const menu = usePagePermissions({ menuId: DC_MENU_ID });
  const rights = useMemo(() => documentRights(menu.permissions), [menu.permissions]);

  const uiTableId = useUiTableId(DC_ITEM_GRID_UI_TABLE_KEY);
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId });
  const columns = useMemo(
    () => resolveItemColumnsWith(layout, DC_ITEM_COLUMN_MEANINGS, "qtPercent"),
    [layout],
  );

  const freshDraft = useCallback(
    (keepCrewFrom?: DcDraft): DcDraft =>
      createDcDraft({
        companyId,
        branchId,
        accYear,
        dcDate: todayIso(),
        companyStateCode,
        policy,
        header: {
          priceLevel: settings.defaultPriceLevel,
          crew:
            keepCrewFrom && !settings.clearDeliveryOnClear
              ? {
                  salesmanId: keepCrewFrom.header.salesmanId,
                  salesmanName: keepCrewFrom.header.salesmanName,
                  driverId: keepCrewFrom.header.driverId,
                  driverName: keepCrewFrom.header.driverName,
                  loadmanId: keepCrewFrom.header.loadmanId,
                  loadmanName: keepCrewFrom.header.loadmanName,
                  vehicleNo: keepCrewFrom.header.vehicleNo,
                }
              : { salesmanId: null, salesmanName: "", driverId: null, driverName: "", loadmanId: null, loadmanName: "", vehicleNo: "" },
        },
      }),
    [accYear, branchId, companyId, companyStateCode, policy, settings.clearDeliveryOnClear, settings.defaultPriceLevel],
  );

  const [draft, dispatch] = useReducer(dcReducer, undefined, () => freshDraft());
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // A clean new challan follows the tenant and the settings as they arrive.
  useEffect(() => {
    const current = draftRef.current;
    if (!current.docId && !current.isDirty && itemLines(current.lines).length === 0) {
      dispatch({ type: "replace", draft: freshDraft() });
    }
  }, [freshDraft]);

  const pricing: DocumentPricing = useMemo(
    () =>
      recalcDocument(
        // Qt `priceRowGoods`: a free line is priced at rate 0.
        draft.lines.map((line) => (line.isFree ? { ...line, rate: 0 } : line)),
        [],
        draft.policy,
        { isLocalSale: draft.isLocalSale, hasFreight: false, hasLoad: false, hasUnload: false },
      ),
    [draft.isLocalSale, draft.lines, draft.policy],
  );

  const [party, setParty] = useState<PartyContext | null>(null);
  const [notes, setNotes] = useState<ValidationNote[]>([]);
  const [overrides, setOverrides] = useState<string[]>([]);
  const [popup, setPopup] = useState<ValidationPopupState>(null);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<DcPrompt>(null);
  const [openSources, setOpenSources] = useState<{ docs: OpenSourceDoc[]; loading: boolean; error: string | null } | null>(null);
  const [printTarget, setPrintTarget] = useState<{ key: DcDocKey; refno: string } | null>(null);
  const [activeHold, setActiveHold] = useState<TxnHoldPayload | null>(null);
  // What the callbacks read at call time — set before any callback captures them.
  const pricingRef = useRef(pricing);
  const overridesRef = useRef(overrides);
  const activeHoldRef = useRef(activeHold);
  useEffect(() => {
    pricingRef.current = pricing;
    overridesRef.current = overrides;
    activeHoldRef.current = activeHold;
  }, [activeHold, overrides, pricing]);

  const [dcGet] = useDcGetMutation();
  const [dcSave] = useDcSaveMutation();
  const [dcValidate] = useDcValidateMutation();
  const [dcCancel] = useDcCancelMutation();
  const [dcAmend] = useDcAmendMutation();
  const [dcDelete] = useDcDeleteMutation();
  const [dcConvert] = useDcConvertPurposeMutation();
  const [dcTransport] = useDcTransportMutation();
  const [saveHold] = useSaveTxnHoldMutation();
  const [resumeHold] = useResumeTxnHoldMutation();
  const [releaseHold] = useReleaseTxnHoldMutation();
  const [forceReleaseHold] = useForceReleaseTxnHoldMutation();
  const [convertHold] = useConvertTxnHoldMutation();

  const verbs = useMemo(
    () =>
      verbsOf({
        status: draft.status,
        isNew: !draft.docId,
        editable: draft.mode === "entry",
        amending: draft.amending,
        autoPost: settings.autoPost,
        maySaveDraft: rights.maySaveDraft,
        canEditRight: menu.permissions.canEdit,
        posting: draft.posting,
        revisionNo: draft.revisionNo,
      }),
    [draft.amending, draft.docId, draft.mode, draft.posting, draft.revisionNo, draft.status, menu.permissions.canEdit, rights.maySaveDraft, settings.autoPost],
  );

  // ── Reads ────────────────────────────────────────────────────────────────

  const priceQuery = useCallback(
    (itemId: string, unitId: string, level: number, customerId: string | null): ItemPriceQuery => ({
      item_id: itemId,
      price_level: clampPriceLevel(level),
      ...(unitId ? { unit_id: unitId } : {}),
      ...(companyId ? { company_id: companyId } : {}),
      ...(branchId ? { branch_id: branchId } : {}),
      ...(customerId ? { customer_id: customerId } : {}),
      ...(accYear ? { acccyear: accYear } : {}),
      loading_type: clampCalc(settings.loadingCalcType, LOADING_CALC_TYPES, DEFAULT_LOADING_CALC_TYPE),
      freight_type: clampCalc(settings.freightCalcType, FREIGHT_CALC_TYPES, DEFAULT_FREIGHT_CALC_TYPE),
      ...(settings.regional !== null ? { regional: settings.regional } : {}),
    }),
    [accYear, branchId, companyId, settings.freightCalcType, settings.loadingCalcType, settings.regional],
  );

  const fetchPrice = useCallback(
    (query: ItemPriceQuery) =>
      dispatchStore(
        quotationApi.endpoints.getItemPrice.initiate(query, { subscribe: false, forceRefetch: true }),
      ).unwrap() as Promise<DcPriceLookup>,
    [dispatchStore],
  );

  /** Qt `fetchItemPrice` — the full fill. A row's own level wins over the header's. */
  const priceLine = useCallback(
    async (rowKey: string, itemId: string, unitId: string, levelOverride?: number) => {
      const current = draftRef.current;
      const line = current.lines.find((candidate) => candidate.key === rowKey);
      if (!line || !itemId) return;
      const level = levelOverride ?? (line.priceLevel > 0 && line.itemId ? line.priceLevel : current.header.priceLevel);
      try {
        const lookup = await fetchPrice(priceQuery(itemId, unitId, level, current.customer.custId));
        const latest = draftRef.current.lines.find((candidate) => candidate.key === rowKey) ?? line;
        dispatch({
          type: "lineReplace",
          rowKey,
          line: applyDcItemPrice({ ...latest, priceLevel: level }, lookup, { autoPopQty: settings.autoPopQty, priceLevel: level }),
        });
      } catch (error) {
        toast.apiError(error);
      }
    },
    [fetchPrice, priceQuery, settings.autoPopQty],
  );

  /** Qt `fetchItemPrice(displayOnly)` for every loaded line `/get` sent without names. */
  const fillNames = useCallback(
    async (loaded: DcDraft) => {
      for (const line of linesNeedingNames(loaded)) {
        try {
          const lookup = await fetchPrice(priceQuery(line.itemId, line.itemUnitId, line.priceLevel, loaded.customer.custId));
          const latest = draftRef.current.lines.find((candidate) => candidate.key === line.key);
          if (latest) {
            dispatch({ type: "lineDisplay", rowKey: line.key, patch: namesPatch(applyDcItemNames(latest, lookup)) });
          }
        } catch {
          // The id stays on the row; the name is cosmetic (Qt).
        }
      }
    },
    [fetchPrice, priceQuery],
  );

  const fetchPartyContext = useCallback(
    async (customerId: string | null, dcDate: string) => {
      setParty(null);
      if (!customerId) return;
      try {
        const context = await dispatchStore(
          saleBillApi.endpoints.getPartyContext.initiate(
            { partyId: customerId, companyId, branchId, accYear, billDate: dcDate },
            { subscribe: false, forceRefetch: true },
          ),
        ).unwrap();
        if (draftRef.current.customer.custId === customerId) setParty(context);
      } catch {
        setParty(null);
      }
    },
    [accYear, branchId, companyId, dispatchStore],
  );

  // ── Load / reset ─────────────────────────────────────────────────────────

  const resetScreen = useCallback(() => {
    setNotes([]);
    setOverrides([]);
    setParty(null);
    setActiveHold(null);
    dispatch({ type: "replace", draft: freshDraft(draftRef.current) });
  }, [freshDraft]);

  const loadChallan = useCallback(
    async (key: DcDocKey, openForEdit: boolean) => {
      if (!key.sdcCompanyId || !key.sdcBranchId || !key.sdcAccYear) {
        toast.warning("This challan can't be opened: the list didn't supply its company, branch and accounting year.");
        return;
      }
      setBusy(true);
      try {
        const data = await dcGet(key).unwrap();
        if (!data || !data.sdcId) {
          toast.warning("That challan could not be found.");
          return;
        }
        const loaded = draftFromPayload(data, { companyStateCode, policy, openForEdit });
        setNotes([]);
        setOverrides([]);
        setActiveHold(null);
        dispatch({ type: "replace", draft: loaded });
        void fetchPartyContext(loaded.customer.custId, loaded.header.dcDate);
        void fillNames(loaded);
      } catch (error) {
        toast.apiError(error);
      } finally {
        setBusy(false);
      }
    },
    [companyStateCode, dcGet, fetchPartyContext, fillNames, policy],
  );

  // ── Customer ─────────────────────────────────────────────────────────────

  /** Qt `fetchCustomerDetail` + `fetchPartyContext`. */
  const pickCustomer = useCallback(
    async (customerId: string) => {
      if (!customerId) return;
      try {
        const detail = await dispatchStore(
          quotationApi.endpoints.getCustomerDetail.initiate(
            { cus_id: customerId, company_id: companyId, branch_id: branchId, ...(settings.regional !== null ? { regional: settings.regional } : {}) },
            { subscribe: false, forceRefetch: true },
          ),
        ).unwrap();
        const customer = customerFromDetail(detail);
        // Qt shows addr line 2 (else the location) in Place.
        const place = (detail as { cust_eadd2?: string | null }).cust_eadd2 || customer.place;
        const stateCode = customer.stateCode ?? "";
        dispatch({
          type: "customer",
          customer: { ...customer, place },
          isLocalSale: stateCode ? stateCode === companyStateCode : Boolean(detail.local_sales),
          posStateCode: stateCode || undefined,
          posStateName: stateCode ? customer.stateName ?? "" : undefined,
          priceLevel: customer.priceLevel,
        });
        void fetchPartyContext(customerId, draftRef.current.header.dcDate);
      } catch (error) {
        toast.apiError(error);
      }
    },
    [branchId, companyId, companyStateCode, dispatchStore, fetchPartyContext, settings.regional],
  );

  const setPlaceOfSupply = useCallback(
    (code: string, name: string) => {
      if (!code) return;
      dispatch({ type: "pos", code, name, isLocalSale: resolveLocalSale(code, companyStateCode, draftRef.current.isLocalSale) });
    },
    [companyStateCode],
  );

  // ── Lines ────────────────────────────────────────────────────────────────

  /** Qt `applyPickedItem`: a duplicate bumps the other row (or asks), the row locks on its item. */
  const pickItem = useCallback(
    async (rowKey: string, itemId: string, itemUnitId: string) => {
      const current = draftRef.current;
      const target = current.lines.find((line) => line.key === rowKey);
      if (!target || target.itemId) return;
      const duplicate = current.lines.find((line) => line.key !== rowKey && line.itemId === itemId && !line.isFree);
      if (duplicate) {
        if (!settings.allowDuplicateItem) {
          dispatch({ type: "linePatch", rowKey: duplicate.key, patch: { billQty: duplicate.billQty + 1 } });
          return;
        }
        const row = current.lines.indexOf(duplicate) + 1;
        const again = await confirm({ title: "Duplicate Item", message: `This item is already on row ${row}. Add it again?` });
        if (!again) return;
      }
      await priceLine(rowKey, itemId, itemUnitId);
    },
    [priceLine, settings.allowDuplicateItem],
  );

  const resolveBarcode = useCallback(
    async (rowKey: string, barcode: string) => {
      const code = barcode.trim();
      const line = draftRef.current.lines.find((candidate) => candidate.key === rowKey);
      // Qt: a resolved barcode cell takes no editor.
      if (!code || !line || line.itemId) return;
      try {
        const hit = await dispatchStore(
          quotationApi.endpoints.getQuotationItemByBarcode.initiate(code, { subscribe: false, forceRefetch: true }),
        ).unwrap();
        await pickItem(rowKey, hit.itemId, hit.unitId);
      } catch (error) {
        toast.apiError(error);
      }
    },
    [dispatchStore, pickItem],
  );

  /** F4 — the next unit in the item's own cycle, re-priced (Qt `switchRowUom`). */
  const switchUnit = useCallback(
    async (rowKey: string) => {
      const line = draftRef.current.lines.find((candidate) => candidate.key === rowKey);
      if (!line?.itemId || draftRef.current.mode === "browse") return;
      try {
        const next = await dispatchStore(
          quotationApi.endpoints.switchItemUom.initiate(
            { item_id: line.itemId, iuc_id: line.itemUnitId },
            { subscribe: false, forceRefetch: true },
          ),
        ).unwrap();
        if (next.item_id && next.iuc_id) await priceLine(rowKey, next.item_id, next.iuc_id);
      } catch (error) {
        toast.apiError(error);
      }
    },
    [dispatchStore, priceLine],
  );

  /** A grid edit, with the Qt rule each editable column carries. */
  const setLineField = useCallback((rowKey: string, field: keyof DcDraftLine, raw: string) => {
    const line = draftRef.current.lines.find((candidate) => candidate.key === rowKey);
    if (!line) return;
    if (field === "barcode") {
      void resolveBarcode(rowKey, raw);
      return;
    }
    const value = Number.parseFloat(raw.replace(/,/g, ""));
    const n = Number.isFinite(value) ? value : 0;
    let edit: { line: DcDraftLine; warning: string | null };
    if (field === "billQty") edit = setLineQty(line, n);
    else if (field === "rate") edit = setLineRate(line, n);
    else if (field === "discPerc") edit = { line: setLineDiscPerc(line, n), warning: null };
    else return;
    dispatch({ type: "lineReplace", rowKey, line: edit.line });
    if (edit.warning) toast.warning(edit.warning);
  }, [resolveBarcode]);

  /** Qt `removeItemRow`: a billed or returned line stays; otherwise ask. */
  const removeLine = useCallback(async (rowKey: string) => {
    const current = draftRef.current;
    if (current.mode === "browse") return;
    const line = current.lines.find((candidate) => candidate.key === rowKey);
    if (!line || !line.itemId) return;
    if (lineIsFulfilled(line)) {
      toast.warning("This line has been billed or returned against — it stays on the challan.");
      return;
    }
    const ok = await confirm({ title: "Remove Item", message: `Remove "${line.itemName || "this item"}" from this challan?` });
    if (ok) dispatch({ type: "lineRemoved", rowKey });
  }, []);

  /** Qt `changePriceLevel` — Apply to the selected row or to all (order lines keep the order's rate). */
  const applyPriceLevel = useCallback(
    async (level: number, scope: "selected" | "all", rowKey: string | null) => {
      const current = draftRef.current;
      if (!canEditPrice || current.mode === "browse") return;
      const targets = current.lines.filter(
        (line) => line.itemId && !line.srcLineId && (scope === "all" || line.key === rowKey),
      );
      if (scope === "all") dispatch({ type: "header", patch: { priceLevel: clampPriceLevel(level) } });
      for (const line of targets) {
        await priceLine(line.key, line.itemId, line.itemUnitId, clampPriceLevel(level));
      }
    },
    [canEditPrice, priceLine],
  );

  /** Ctrl+± — step THIS row's level (Qt `stepRowPriceLevel`). */
  const stepLinePriceLevel = useCallback(
    async (rowKey: string, delta: 1 | -1) => {
      const line = draftRef.current.lines.find((candidate) => candidate.key === rowKey);
      if (!canEditPrice || !line?.itemId || line.srcLineId || draftRef.current.mode === "browse") return;
      const next = Math.min(Math.max(line.priceLevel + delta, 1), Math.max(1, settings.priceLevelCount));
      if (next !== line.priceLevel) await priceLine(rowKey, line.itemId, line.itemUnitId, next);
    },
    [canEditPrice, priceLine, settings.priceLevelCount],
  );

  const applyDiscountAll = useCallback((perc: number) => {
    dispatch({ type: "lines", lines: discountAll(draftRef.current.lines, perc) });
  }, []);

  // ── Source order (Ctrl+F4) ───────────────────────────────────────────────

  const openImportOrders = useCallback(async () => {
    const current = draftRef.current;
    if (current.mode === "browse") {
      toast.warning("This challan is read-only.");
      return;
    }
    if (!current.customer.custId) {
      toast.warning("Pick the customer first — only their open orders are offered.");
      return;
    }
    setOpenSources({ docs: [], loading: true, error: null });
    try {
      const docs = await dispatchStore(
        saleBillApi.endpoints.getOpenSources.initiate(
          { companyId, branchId, partyId: current.customer.custId, kind: "ORDER", accYear },
          { subscribe: false, forceRefetch: true },
        ),
      ).unwrap();
      setOpenSources({ docs, loading: false, error: null });
    } catch (error) {
      setOpenSources({ docs: [], loading: false, error: errorText(error) });
    }
  }, [accYear, branchId, companyId, dispatchStore]);

  const applySourcePicks = useCallback(
    async (picks: OpenSourcePick[]) => {
      setOpenSources(null);
      const { draft: next, newLineKeys } = appendSourceLines(draftRef.current, picks);
      dispatch({ type: "replace", draft: next });
      draftRef.current = next;
      for (const key of newLineKeys) {
        const line = next.lines.find((candidate) => candidate.key === key);
        if (line) await priceLine(key, line.itemId, line.itemUnitId, next.header.priceLevel);
      }
    },
    [priceLine],
  );

  // ── Validation strip ─────────────────────────────────────────────────────

  const takeNotes = useCallback(
    (fresh: ValidationNote[]) => {
      setNotes(fresh);
      setOverrides((current) => overridesAgainst(fresh, current, draftRef.current.posting?.canOverride ?? false));
    },
    [],
  );

  const clientCheck = useCallback((): DcValidationError | null => {
    const error = validateDc(draftRef.current, {
      salesmanMandatory: settings.salesmanMandatory,
      dcRequiresOrder,
      freeItemTax: settings.freeItemTax,
      yearStart,
      yearEnd,
    });
    if (error) toast.warning(error.message);
    return error;
  }, [dcRequiresOrder, settings.freeItemTax, settings.salesmanMandatory, yearEnd, yearStart]);

  const payload = useCallback(
    () => buildDcPayload(draftRef.current, pricingRef.current, actor),
    [actor],
  );


  /** A failed call: a 422 with notes is the ANSWER (shown in the popup); anything else an error. */
  const answerOrError = useCallback(
    (error: unknown, popupOnNotes: boolean): boolean => {
      const fresh = notesFromError(error);
      if (fresh.length === 0) {
        toast.apiError(error);
        return false;
      }
      takeNotes(fresh);
      if (popupOnNotes) setPopup({ proceedVerb: null, onProceed: null });
      return true;
    },
    [takeNotes],
  );

  const convertActiveHold = useCallback(
    async (saved: Record<string, unknown>) => {
      const hold = activeHoldRef.current;
      const deviceId = actor.deviceMasterId;
      if (!hold || !deviceId) return;
      try {
        await convertHold({
          txhId: hold.txhId,
          deviceId,
          scope: holdLockScope(hold),
          conversion: {
            txhConvertedDocId: String(saved.sdcId ?? ""),
            txhConvertedAccYear: String(saved.sdcAccYear ?? accYear),
            txhConvertedRefno: (saved.sdcDcRefno as string | null) ?? null,
            txhConvertedBy: actor.userId || null,
          },
        }).unwrap();
      } catch {
        // The challan is saved; a hold left LOCKED expires on its own.
      }
      setActiveHold(null);
    },
    [accYear, actor.deviceMasterId, actor.userId, convertHold],
  );

  // ── Verbs ────────────────────────────────────────────────────────────────

  /** Qt `saveChallan`: the draft, then reload so the id, number, locks and rights are the server's. */
  const saveDraft = useCallback(async () => {
    const current = draftRef.current;
    if (!rights.maySaveDraft(Boolean(current.docId))) {
      toast.warning("You may post this challan, not keep it as a draft — use Post.");
      return;
    }
    if (clientCheck()) return;
    setBusy(true);
    try {
      const saved = await dcSave(payload()).unwrap();
      await convertActiveHold(saved);
      const refno = String(saved.sdcDcRefno ?? "");
      toast.success(refno ? `Draft ${refno} saved.` : "Draft saved.");
      setNotes([]);
      await loadChallan(
        { sdcId: String(saved.sdcId), sdcCompanyId: current.companyId, sdcBranchId: current.branchId, sdcAccYear: String(saved.sdcAccYear || current.accYear) },
        true,
      );
    } catch (error) {
      answerOrError(error, true);
    } finally {
      setBusy(false);
    }
  }, [answerOrError, clientCheck, convertActiveHold, dcSave, loadChallan, payload, rights]);

  /** Ctrl+F7 — the dry run only. */
  const validate = useCallback(async () => {
    if (clientCheck()) return;
    setBusy(true);
    try {
      const body = payload();
      if (overridesRef.current.length) body.overrides = overridesRef.current;
      const answer = await dcValidate(body).unwrap();
      const fresh = parseValidationNotes(answer);
      takeNotes(fresh);
      if (fresh.length === 0) toast.success("Nothing to report — this challan is ready to post.");
      else setPopup({ proceedVerb: null, onProceed: null });
    } catch (error) {
      answerOrError(error, true);
    } finally {
      setBusy(false);
    }
  }, [answerOrError, clientCheck, dcValidate, payload, takeNotes]);

  /** The one call answered: number, hold conversion, message, clear (Qt `finishPosted`). */
  const finishPosted = useCallback(
    async (data: Record<string, unknown>, print: boolean) => {
      const current = draftRef.current;
      const id = String(data.sdcId ?? current.docId ?? "");
      const year = String(data.sdcAccYear || current.accYear);
      const refno = String(data.sdcDcRefno ?? "");
      const status = String(data.sdcStatus ?? "").toUpperCase();
      setNotes([]);
      if (status && status !== "POSTED" && id) {
        toast.warning(`Challan ${refno} was saved as a DRAFT but NOT posted. Post it again from here.`);
        await loadChallan({ sdcId: id, sdcCompanyId: current.companyId, sdcBranchId: current.branchId, sdcAccYear: year }, true);
        return;
      }
      await convertActiveHold(data);
      const posting = (data.posting ?? {}) as Record<string, unknown>;
      const voucher = String(posting.voucherRefno ?? "");
      let message = refno ? `Challan ${refno} posted.` : "Challan posted.";
      if (voucher) message += ` COGS ${Number(posting.cogsAmt ?? 0).toFixed(2)} — voucher ${voucher}.`;
      toast.success(message);
      if (print && id) {
        setPrintTarget({ key: { sdcId: id, sdcCompanyId: current.companyId, sdcBranchId: current.branchId, sdcAccYear: year }, refno });
      }
      resetScreen();
    },
    [convertActiveHold, loadChallan, resetScreen],
  );

  /** ONE /create with post:true (server notes 106). A WARN can be ticked and the same call sent again. */
  const createAndPost = useCallback(
    async (print: boolean, firstOverrides: string[] = overridesRef.current) => {
      async function attempt(sentOverrides: string[]): Promise<void> {
        setBusy(true);
        try {
          const body = payload();
          body.post = true;
          if (sentOverrides.length) body.overrides = sentOverrides;
          const data = await dcSave(body).unwrap();
          await finishPosted(data, print);
        } catch (error) {
          const fresh = notesFromError(error);
          if (fresh.length === 0) {
            toast.apiError(error);
            return;
          }
          takeNotes(fresh);
          // The popup is the answer: a refusal offers Back alone; a WARN can be
          // ticked and the same one call sent again.
          setPopup({
            proceedVerb: print ? "Post & Print" : "Post",
            onProceed: () => {
              if (sameCodes(overridesRef.current, sentOverrides)) {
                toast.warning("Nothing new was overridden — tick Override on the warnings to post past them, or correct the challan.");
                return;
              }
              void attempt(overridesRef.current);
            },
          });
        } finally {
          setBusy(false);
        }
      }
      await attempt(firstOverrides);
    },
    [dcSave, finishPosted, payload, takeNotes],
  );

  /** POST POSTS WHAT IS ON SCREEN: the dry run, the popup, then the one call (Qt `postChallan`). */
  const post = useCallback(
    async (print: boolean) => {
      const current = draftRef.current;
      if (current.docId && !current.posting?.canPost) {
        toast.warning("You don't have permission to post challans.");
        return;
      }
      if (clientCheck()) return;
      setBusy(true);
      try {
        const body = payload();
        if (overridesRef.current.length) body.overrides = overridesRef.current;
        const answer = await dcValidate(body).unwrap();
        const fresh = parseValidationNotes(answer);
        takeNotes(fresh);
        if (fresh.length === 0) {
          await createAndPost(print);
          return;
        }
        setPopup({ proceedVerb: print ? "Post & Print" : "Post", onProceed: () => void createAndPost(print) });
      } catch (error) {
        answerOrError(error, true);
      } finally {
        setBusy(false);
      }
    },
    [answerOrError, clientCheck, createAndPost, dcValidate, payload, takeNotes],
  );

  /** Qt `amendChallan` — asks what is being corrected, posts revision + 1. */
  const amend = useCallback(
    async (remark: string) => {
      const current = draftRef.current;
      setBusy(true);
      try {
        const body = payload();
        body.baseRevision = current.revisionNo;
        body.editRemark = remark;
        if (overridesRef.current.length) body.overrides = overridesRef.current;
        const data = await dcAmend(body).unwrap();
        setNotes([]);
        toast.success(`Challan ${current.refno} amended — revision ${Number(data.sdcRevisionNo ?? current.revisionNo + 1)} posted.`);
        setPrompt(null);
        resetScreen();
      } catch (error) {
        setPrompt(null);
        answerOrError(error, true);
      } finally {
        setBusy(false);
      }
    },
    [answerOrError, dcAmend, payload, resetScreen],
  );

  /** F5 / F6 by state (Qt `onPrimaryVerb`): amending → the amendment; auto_post or F6 → post; else the draft. */
  const primaryVerb = useCallback(
    (print: boolean) => {
      const current = draftRef.current;
      if (current.amending) {
        if (clientCheck()) return;
        setPrompt({ kind: "amend", print });
        return;
      }
      if (print || settings.autoPost) void post(print);
      else void saveDraft();
    },
    [clientCheck, post, saveDraft, settings.autoPost],
  );

  const beginAmend = useCallback(async () => {
    const current = draftRef.current;
    if (current.status !== "POSTED") {
      toast.warning("Only a POSTED challan is amended.");
      return;
    }
    if (!current.posting?.canAmend) {
      toast.warning(current.posting?.amendBlockedReason || "This challan cannot be amended.");
      return;
    }
    const ok = await confirm({
      title: "Amend Challan",
      message: `Amend challan ${current.refno}?`,
      note: `It keeps its number and date. Saving will ask for a reason and post revision ${current.revisionNo + 1} — stock is unwound and re-issued.`,
    });
    if (!ok) return;
    setNotes([]);
    dispatch({ type: "mode", mode: "entry", amending: true });
  }, []);

  /** F2 — Edit on a draft opens the fields; on a posted challan Edit IS Amend. */
  const edit = useCallback(() => {
    const current = draftRef.current;
    if (current.status === "POSTED") {
      void beginAmend();
      return;
    }
    if (current.mode === "entry") return;
    if (current.status === "CANCELLED") {
      toast.warning("A cancelled challan can't be edited — raise a new one.");
      return;
    }
    if (!menu.permissions.canEdit) {
      toast.warning("You don't have permission to edit challans.");
      return;
    }
    dispatch({ type: "mode", mode: "entry" });
  }, [beginAmend, menu.permissions.canEdit]);

  const requestCancel = useCallback(() => {
    const current = draftRef.current;
    if (current.status !== "POSTED") {
      toast.warning("Only a POSTED challan is cancelled. A draft is deleted (F3).");
      return;
    }
    if (!current.posting?.canCancel) {
      toast.warning(current.posting?.cancelBlockedReason || "This challan cannot be cancelled.");
      return;
    }
    setPrompt({ kind: "cancel" });
  }, []);

  const cancelChallan = useCallback(
    async (reason: string) => {
      const key = dcKeyOf(draftRef.current);
      if (!key) return;
      setBusy(true);
      try {
        await dcCancel({ ...key, reason }).unwrap();
        setPrompt(null);
        toast.success("Challan cancelled — stock and COGS reversed; it keeps its number on the list.");
        resetScreen();
      } catch (error) {
        setPrompt(null);
        answerOrError(error, true);
      } finally {
        setBusy(false);
      }
    },
    [answerOrError, dcCancel, resetScreen],
  );

  /** DRAFT only — a POST with the keys (Qt `deleteChallan`). */
  const deleteDraft = useCallback(async () => {
    const current = draftRef.current;
    const key = dcKeyOf(current);
    if (!key) {
      toast.warning("Nothing to delete — this is a new challan.");
      return;
    }
    if (current.status !== "DRAFT") {
      toast.warning("Only a draft is deleted. A posted challan is cancelled.");
      return;
    }
    if (!menu.permissions.canDelete) {
      toast.warning("You don't have permission to delete challans.");
      return;
    }
    const ok = await confirm({ title: "Confirm Delete", message: "Delete this draft challan? This cannot be undone.", iconVariant: "delete" });
    if (!ok) return;
    setBusy(true);
    try {
      await dcDelete(key).unwrap();
      toast.success("Draft deleted.");
      resetScreen();
    } catch (error) {
      toast.apiError(error);
    } finally {
      setBusy(false);
    }
  }, [dcDelete, menu.permissions.canDelete, resetScreen]);

  const requestConvert = useCallback(() => {
    const current = draftRef.current;
    if (current.status !== "POSTED") {
      toast.warning("Only a POSTED challan changes purpose — edit a draft directly.");
      return;
    }
    if (!current.posting?.purposeEditable) {
      toast.warning(
        "The purpose is locked: an e-way bill has declared it, or a bill / return has already been raised against this challan.",
      );
      return;
    }
    setPrompt({ kind: "convert" });
  }, []);

  const convertPurpose = useCallback(
    async (purpose: string, remark: string) => {
      const current = draftRef.current;
      const key = dcKeyOf(current);
      if (!key || !purpose || purpose === current.header.purpose.toUpperCase()) {
        setPrompt(null);
        return;
      }
      setBusy(true);
      try {
        await dcConvert({ ...key, purpose, remark }).unwrap();
        setPrompt(null);
        toast.success(`Purpose converted to ${purpose}.`);
        await loadChallan(key, false);
      } catch (error) {
        setPrompt(null);
        toast.apiError(error);
      } finally {
        setBusy(false);
      }
    },
    [dcConvert, loadChallan],
  );

  /** PUT /delivery-challans/transport — the band on its own verb once posted. */
  const saveTransport = useCallback(
    async (band: TransportBand): Promise<boolean> => {
      const key = dcKeyOf(draftRef.current);
      if (!key) {
        toast.warning("Save the challan first.");
        return false;
      }
      try {
        await dcTransport({ ...key, transport: transportBandDto(band) }).unwrap();
        dispatch({ type: "transport", band, vehicleNo: draftRef.current.header.vehicleNo, vehicleId: draftRef.current.header.vehicleId });
        dispatch({ type: "clean" });
        toast.success(`Transport details saved on challan ${draftRef.current.refno}.`);
        return true;
      } catch (error) {
        toast.apiError(error);
        return false;
      }
    },
    [dcTransport],
  );

  const copyAsNew = useCallback(async () => {
    const current = draftRef.current;
    if (!current.docId) {
      toast.warning("Nothing to copy — this is already a new challan.");
      return;
    }
    const ok = await confirm({ title: "Copy as New", message: "Start a new challan from this one? The original is not changed." });
    if (!ok) return;
    setNotes([]);
    dispatch({ type: "replace", draft: copyDcAsNew(current, todayIso()) });
  }, []);

  const clearScreen = useCallback(async () => {
    const ok = await confirm({ title: "Clear Screen", message: "Clear all entered data on this screen?", iconVariant: "replace" });
    if (!ok) return;
    const hold = activeHoldRef.current;
    if (hold && actor.deviceMasterId) {
      try {
        await releaseHold({ txhId: hold.txhId, deviceId: actor.deviceMasterId, scope: holdLockScope(hold) }).unwrap();
      } catch {
        // The lease expires on its own.
      }
    }
    resetScreen();
  }, [actor.deviceMasterId, releaseHold, resetScreen]);

  // ── Hold / pick held (txn_hold, doc type DELIVERY_CHALLAN) ───────────────

  const hold = useCallback(async () => {
    const current = draftRef.current;
    if (current.mode === "browse") return void toast.warning("A read-only challan can't be held.");
    if (itemLines(current.lines).length === 0) return void toast.warning("Nothing to hold — the challan is empty.");
    if (current.docId) return void toast.warning("A saved challan can't be held — it is already on the list.");
    if (!actor.deviceMasterId) return void toast.warning("This browser is not a registered device — a challan can't be held here.");
    const now = new Date();
    const totals = pricingRef.current.totals;
    try {
      const saved = await saveHold({
        txhStatus: "HELD",
        txhKind: HOLD_KIND,
        txhSrcModule: HOLD_SRC_MODULE,
        txhDocType: DC_DOC_TYPE,
        txhCompanyId: current.companyId,
        txhBranchId: current.branchId,
        txhAccYear: current.accYear,
        txhHoldNo: nextHoldNo(now),
        txhHoldSlno: nextHoldSlno({ companyId: current.companyId, branchId: current.branchId, accYear: current.accYear, docType: DC_DOC_TYPE }, now),
        txhHoldOn: now.toISOString(),
        txhDeviceId: actor.deviceMasterId,
        txhHeldBy: actor.userId || undefined,
        txhPartyType: HOLD_PARTY_TYPE,
        txhPartyId: current.customer.custId || null,
        txhPartyName: current.customer.name.slice(0, 150) || null,
        txhPartyMobile: (current.customer.phone ?? "").slice(0, 20) || null,
        txhItemCount: itemLines(current.lines).length,
        txhTotalQty: Math.max(0, totals.totQty),
        txhNetAmount: Math.max(0, totals.bill),
        txhPayload: { kind: DC_HOLD_UI_KIND, version: HOLD_UI_VERSION, screen: DC_DOC_TYPE, heldAt: now.toISOString(), challan: payload(), draft: current },
        txhPayloadVersion: HOLD_UI_VERSION,
        txhCreatedBy: actor.userId || null,
      }).unwrap();
      toast.success(`Challan held as ${saved.txhHoldNo ?? "a hold"}.`);
      resetScreen();
    } catch (error) {
      toast.apiError(error);
    }
  }, [actor.deviceMasterId, actor.userId, payload, resetScreen, saveHold]);

  /** A recalled hold is a NEW challan (Qt `restoreFromSnapshot`). */
  const resumeHeld = useCallback(
    async (txhId: string) => {
      if (!actor.deviceMasterId) {
        toast.warning("This browser is not a registered device — held challans can't be resumed here.");
        return;
      }
      try {
        const listed = await dispatchStore(
          quotationApi.endpoints.getTxnHold.initiate({ txhId, txhAccYear: accYear }, { subscribe: false, forceRefetch: true }),
        ).unwrap();
        const locked = await resumeHold({ txhId, deviceId: actor.deviceMasterId, scope: holdLockScope(listed) }).unwrap();
        const stored = (locked.txhPayload ?? listed.txhPayload) as { draft?: DcDraft } | null;
        if (!stored?.draft) {
          toast.warning("That hold has nothing this screen can show.");
          return;
        }
        const restored: DcDraft = {
          ...stored.draft,
          docId: null,
          status: "DRAFT",
          refno: "",
          revisionNo: 0,
          mode: "entry",
          amending: false,
          posting: null,
          storedTotals: null,
          isDirty: true,
          companyId,
          branchId,
          accYear,
        };
        setNotes([]);
        setActiveHold(locked);
        dispatch({ type: "replace", draft: restored });
        void fetchPartyContext(restored.customer.custId, restored.header.dcDate);
      } catch (error) {
        toast.apiError(error);
      }
    },
    [accYear, actor.deviceMasterId, branchId, companyId, dispatchStore, fetchPartyContext, resumeHold],
  );

  const takeOverHold = useCallback(
    async (held: TxnHoldPayload) => {
      if (!actor.deviceMasterId) return false;
      try {
        await forceReleaseHold({ txhId: held.txhId, deviceId: actor.deviceMasterId, scope: holdLockScope(held) }).unwrap();
        return true;
      } catch (error) {
        toast.apiError(error);
        return false;
      }
    },
    [actor.deviceMasterId, forceReleaseHold],
  );

  /** The e-way bill (Qt `generateEway`) — its GST routes are not on this server yet. */
  const eway = useCallback(() => {
    const current = draftRef.current;
    if (current.status !== "POSTED") {
      toast.warning("Post the challan first.");
      return;
    }
    toast.info("The e-way bill service is not available on this server yet — the GST e-way routes have not landed.");
  }, []);

  return {
    draft,
    dispatch,
    pricing,
    columns,
    uiTableId,
    verbs,
    settings,
    dcRequiresOrder,
    quickAddCustomer,
    companyId,
    branchId,
    accYear,
    companyStateCode,
    canEditPrice,
    permissions: menu.permissions,
    rights,
    party,
    notes,
    overrides,
    setOverrides,
    popup,
    setPopup,
    busy,
    prompt,
    setPrompt,
    openSources,
    setOpenSources,
    printTarget,
    setPrintTarget,
    activeHold,
    actions: {
      loadChallan,
      resetScreen,
      pickCustomer,
      setPlaceOfSupply,
      pickItem,
      resolveBarcode,
      switchUnit,
      setLineField,
      removeLine,
      applyPriceLevel,
      stepLinePriceLevel,
      applyDiscountAll,
      openImportOrders,
      applySourcePicks,
      saveDraft,
      validate,
      post,
      primaryVerb,
      amend,
      beginAmend,
      edit,
      requestCancel,
      cancelChallan,
      deleteDraft,
      requestConvert,
      convertPurpose,
      saveTransport,
      copyAsNew,
      clearScreen,
      hold,
      resumeHeld,
      takeOverHold,
      eway,
    },
  };
}

export type DcScreen = ReturnType<typeof useDcScreen>;

function namesPatch(line: DcDraftLine): Partial<DcDraftLine> {
  return {
    itemName: line.itemName,
    unitName: line.unitName,
    itemCode: line.itemCode,
    decimalCount: line.decimalCount,
    batchConfig: line.batchConfig,
    stockQty: line.stockQty,
    groupId: line.groupId,
    categoryId: line.categoryId,
    brandId: line.brandId,
    sectionId: line.sectionId,
    godownName: line.godownName,
  };
}

function sameCodes(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((code) => set.has(code));
}

function errorText(error: unknown): string {
  const body = (error as { data?: { message?: unknown } } | null)?.data;
  const message = body?.message;
  if (typeof message === "string" && message.trim()) return message;
  return "The open orders could not be read. Please try again.";
}
