/**
 * Sale Order Entry — the draft reducer, as a Redux slice.
 *
 * The quotation slice's architecture verbatim (see `quotationSlice.ts` for the
 * two consequences of the state being global): every transition delegates to
 * the pure functions in the feature folder, the trailing-blank-row invariant is
 * applied last, and the wrapper stamps `isDirty` / flips `pricing` to `live` on
 * the first real edit.
 */
import { createSlice, original, type PayloadAction } from "@reduxjs/toolkit";
import type { VoucherPolicy } from "@/domain/pricing";
import { DISCOUNT_ALTERNATES } from "@/features/sales/quotation/quotation.constants";
import {
  applyItemPrice,
  chargeRowFromMaster,
  clampPriceLevel,
  createDraftChargeRow,
  customerFromDetail,
  emptyCustomer,
  resolveLocalSale,
} from "@/features/sales/quotation/quotation.state";
import type {
  ChargeMasterRow,
  CustomerDetailPayload,
  DraftChargeRow,
  EditableCustomerField,
  FreightBand,
  ItemPriceLookupPayload,
} from "@/features/sales/quotation/quotation.types";
import {
  applyOrderHeaderField,
  applyOrderSaveResponse,
  createOrderDraft,
  createOrderDraftLine,
} from "@/features/sales/sale-order/sale-order.state";
import type {
  PartyCreditSummary,
  SaleOrderDraft,
  SaleOrderDraftLine,
  SaleOrderHeader,
  SaleOrderMode,
  SaleOrderPayload,
  SaleOrderTerms,
  SettlementState,
  TenderDraftRow,
} from "@/features/sales/sale-order/sale-order.types";
import type { RootState } from "@/store/store";

export type SaleOrderState = SaleOrderDraft;

const initialState: SaleOrderState = createOrderDraft({
  companyId: "",
  branchId: "",
  accYear: "",
  companyStateCode: "",
});

const saleOrderSlice = createSlice({
  name: "saleOrder",
  initialState,
  reducers: {
    draftReplaced(_state, action: PayloadAction<SaleOrderDraft>) {
      return action.payload;
    },
    saveResponseApplied(
      state,
      action: PayloadAction<{ payload: SaleOrderPayload; sentDraft: SaleOrderDraft }>,
    ) {
      const base = (original(state) ?? state) as SaleOrderDraft;
      return applyOrderSaveResponse(base, action.payload.payload, action.payload.sentDraft);
    },
    modeSet(state, action: PayloadAction<SaleOrderMode>) {
      state.mode = action.payload;
    },
    tenantSet(
      state,
      action: PayloadAction<{ companyId: string; branchId: string; accYear: string }>,
    ) {
      state.companyId = action.payload.companyId;
      state.branchId = action.payload.branchId;
      state.accYear = action.payload.accYear;
    },
    companyStateCodeSet(state, action: PayloadAction<string>) {
      state.companyStateCode = action.payload;
      state.isLocalSale = resolveLocalSale(
        state.header.posStateCode,
        action.payload,
        state.isLocalSale,
      );
    },
    policyPatched(state, action: PayloadAction<Partial<VoucherPolicy>>) {
      Object.assign(state.policy, action.payload);
    },
    headerFieldSet(
      state,
      action: PayloadAction<{ field: keyof SaleOrderHeader; value: string | number | boolean }>,
    ) {
      state.header = applyOrderHeaderField(state.header, action.payload.field, action.payload.value);
    },
    posSet(state, action: PayloadAction<{ stateCode: string; stateName: string }>) {
      state.header.posStateCode = action.payload.stateCode;
      state.header.posStateName = action.payload.stateName;
      state.isLocalSale = resolveLocalSale(
        action.payload.stateCode,
        state.companyStateCode,
        state.isLocalSale,
      );
    },
    termsFieldSet(state, action: PayloadAction<{ field: keyof SaleOrderTerms; value: string }>) {
      state.terms[action.payload.field] = action.payload.value;
    },
    statusSet(state, action: PayloadAction<string>) {
      state.status = action.payload;
    },
    customerApplied(state, action: PayloadAction<CustomerDetailPayload>) {
      const detail = action.payload;
      const customer = customerFromDetail(detail);
      const previousDistance = state.customer.distanceKm;
      state.customer = customer;
      state.header.posStateCode = customer.stateCode || state.header.posStateCode;
      state.header.posStateName = customer.stateName || state.header.posStateName;
      state.header.salesmanId = detail.salesman_id ?? state.header.salesmanId;
      state.header.salesmanName = detail.salesman_name ?? state.header.salesmanName;
      state.header.contactPerson = state.header.contactPerson || customer.name;
      state.header.contactNo = state.header.contactNo || (customer.phone ?? "");
      state.header.priceLevel = customer.priceLevel;
      state.header.hasFreight = detail.freight_charge;
      state.header.hasLoad = detail.cooly;
      state.header.hasUnload = detail.unloading_charge;
      state.header.hasPromo = detail.allow_promotion;
      // A customer the master lets buy on credit books a CREDIT order; one it
      // does not books CASH — the operator can still change it.
      state.header.orderType = detail.debit_allowed ? "CREDIT" : "CASH";
      state.isLocalSale = detail.local_sales;
      if (detail.local_sales && customer.stateCode) {
        state.companyStateCode = customer.stateCode;
      }
      if (customer.distanceKm !== previousDistance) {
        state.freightBands = [];
      }
      // A different party is a different credit decision.
      state.partyCredit = null;
      state.creditOverride = false;
    },
    customerFieldSet(
      state,
      action: PayloadAction<{ field: EditableCustomerField; value: string }>,
    ) {
      state.customer[action.payload.field] = action.payload.value;
      if (action.payload.field === "name") {
        state.header.contactPerson = state.header.contactPerson || action.payload.value;
      }
    },
    customerCleared(state) {
      state.customer = emptyCustomer();
      state.freightBands = [];
      state.partyCredit = null;
      state.creditOverride = false;
    },
    freightBandsSet(state, action: PayloadAction<FreightBand[]>) {
      state.freightBands = action.payload;
    },
    /**
     * The credit panel's data landing is not an operator edit: it must neither
     * dirty the draft nor flip a loaded document off its stored figures.
     */
    partyCreditSet(state, action: PayloadAction<PartyCreditSummary | null>) {
      state.partyCredit = action.payload;
    },
    /** "Put this on credit anyway?" — answered once, remembered for this settle. */
    creditOverrideSet(state, action: PayloadAction<boolean>) {
      state.creditOverride = action.payload;
    },
    /** The tender dialog's OK: its rows and the roll-ups they compute. */
    tendersReplaced(
      state,
      action: PayloadAction<{ tenders: TenderDraftRow[]; settlement: SettlementState }>,
    ) {
      state.tenders = action.payload.tenders;
      state.settlement = action.payload.settlement;
    },
    lineAdded(state) {
      state.lines.push(createOrderDraftLine({ priceLevel: state.header.priceLevel }));
    },
    lineInserted(state, action: PayloadAction<string>) {
      const line = createOrderDraftLine({ priceLevel: state.header.priceLevel });
      const index = state.lines.findIndex((row) => row.key === action.payload);
      if (index < 0) {
        state.lines.push(line);
        return;
      }
      state.lines.splice(index, 0, line);
    },
    lineRemoved(state, action: PayloadAction<string>) {
      state.lines = state.lines.filter((line) => line.key !== action.payload);
    },
    lineFieldSet(
      state,
      action: PayloadAction<{ key: string; field: keyof SaleOrderDraftLine; value: unknown }>,
    ) {
      const { key, field, value } = action.payload;
      const line = state.lines.find((row) => row.key === key);
      if (!line) {
        return;
      }
      (line as unknown as Record<string, unknown>)[field] = value;
      const alternates = DISCOUNT_ALTERNATES[field as keyof typeof DISCOUNT_ALTERNATES];
      if (!alternates || !Number(value)) {
        return;
      }
      for (const sibling of alternates) {
        (line as unknown as Record<string, unknown>)[sibling] = 0;
      }
    },
    itemPriceApplied(
      state,
      action: PayloadAction<{
        key: string;
        lookup: ItemPriceLookupPayload;
        unitName?: string;
        unitId?: string;
      }>,
    ) {
      const { key, lookup, unitName, unitId } = action.payload;
      const index = state.lines.findIndex((row) => row.key === key);
      if (index < 0) {
        return;
      }
      const existing = state.lines[index] as SaleOrderDraftLine;
      state.lines[index] = {
        // `applyItemPrice` returns the quotation shape; the order-only fields
        // are carried over from the existing row so a re-pick cannot drop the
        // source trail or the fulfilment paint.
        ...existing,
        ...applyItemPrice(existing, lookup, { unitName, unitId }),
      };
    },
    linePriceLevelSet(
      state,
      action: PayloadAction<{ keys: string[]; priceLevel: number; commitDocument: boolean }>,
    ) {
      const level = clampPriceLevel(action.payload.priceLevel);
      const keys = new Set(action.payload.keys);
      if (action.payload.commitDocument) {
        state.header.priceLevel = level;
      }
      for (const line of state.lines) {
        if (keys.has(line.key)) {
          line.priceLevel = level;
        }
      }
    },
    chargeAdded(state, action: PayloadAction<DraftChargeRow | undefined>) {
      state.charges.push(action.payload ?? createDraftChargeRow());
    },
    chargeRemoved(state, action: PayloadAction<string>) {
      state.charges = state.charges.filter((row) => row.key !== action.payload);
    },
    chargeFieldSet(
      state,
      action: PayloadAction<{ key: string; field: keyof DraftChargeRow; value: unknown }>,
    ) {
      const { key, field, value } = action.payload;
      const row = state.charges.find((candidate) => candidate.key === key);
      if (!row) {
        return;
      }
      (row as unknown as Record<string, unknown>)[field] = value;
      if (!Number(value)) {
        return;
      }
      if (field === "amount") {
        row.rate = 0;
      }
      if (field === "rate") {
        row.amount = 0;
      }
    },
    /**
     * Give a charge row its identity from the master — one charge, one row.
     * The engine sums the grid, so the same charge on two rows is added to the
     * order twice; the invariant is held here, at the only place a row gets a
     * `chgId`, and the picker's greyed rows are the explanation, not the
     * enforcement. Same rule as the quotation slice.
     */
    chargeMasterApplied(state, action: PayloadAction<{ key: string; master: ChargeMasterRow }>) {
      const index = state.charges.findIndex((row) => row.key === action.payload.key);
      if (index < 0) {
        return;
      }
      const duplicate = state.charges.some(
        (row) => row.key !== action.payload.key && row.chgId === action.payload.master.chgId,
      );
      if (duplicate) {
        return;
      }
      const existing = state.charges[index];
      state.charges[index] = {
        ...chargeRowFromMaster(action.payload.master),
        key: existing.key,
        cdId: existing.cdId,
        remarks: existing.remarks,
      };
    },
  },
});

export const {
  draftReplaced,
  saveResponseApplied,
  modeSet,
  tenantSet,
  companyStateCodeSet,
  policyPatched,
  headerFieldSet,
  posSet,
  termsFieldSet,
  statusSet,
  customerApplied,
  customerFieldSet,
  customerCleared,
  freightBandsSet,
  partyCreditSet,
  creditOverrideSet,
  tendersReplaced,
  lineAdded,
  lineInserted,
  lineRemoved,
  lineFieldSet,
  itemPriceApplied,
  linePriceLevelSet,
  chargeAdded,
  chargeRemoved,
  chargeFieldSet,
  chargeMasterApplied,
} = saleOrderSlice.actions;

/** Actions that do not count as an operator edit. */
const NON_EDIT_ACTIONS = new Set<string>([
  draftReplaced.type,
  modeSet.type,
  tenantSet.type,
  companyStateCodeSet.type,
  freightBandsSet.type,
  partyCreditSet.type,
  saveResponseApplied.type,
]);

/** The always-one-blank-row invariant, exactly as the quotation states it. */
function withTrailingBlankRows(state: SaleOrderState): SaleOrderState {
  if (state.mode !== "entry") {
    return state;
  }
  const lastLine = state.lines[state.lines.length - 1];
  const lastCharge = state.charges[state.charges.length - 1];
  const needsLine = !lastLine || Boolean(lastLine.itemId);
  const needsCharge = !lastCharge || Boolean(lastCharge.chgId);
  if (!needsLine && !needsCharge) {
    return state;
  }
  return {
    ...state,
    lines: needsLine
      ? [...state.lines, createOrderDraftLine({ priceLevel: state.header.priceLevel })]
      : state.lines,
    charges: needsCharge ? [...state.charges, createDraftChargeRow()] : state.charges,
  };
}

export function saleOrderReducer(
  state: SaleOrderState | undefined,
  action: { type: string },
): SaleOrderState {
  const next = saleOrderSlice.reducer(state, action);
  if (state === undefined || next === state || NON_EDIT_ACTIONS.has(action.type)) {
    return withTrailingBlankRows(next);
  }
  if (next.isDirty && next.pricing === "live") {
    return withTrailingBlankRows(next);
  }
  return withTrailingBlankRows({ ...next, isDirty: true, pricing: "live" });
}

export const selectSaleOrderDraft = (state: RootState): SaleOrderState => state.saleOrder;

export default saleOrderReducer;
