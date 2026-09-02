/**
 * Quotation Entry — the draft reducer, as a Redux slice.
 *
 * This was a hand-written reducer driven by `useReducer` inside
 * `use-quotation-draft.ts`. Only the *plumbing* moved: every transition below is
 * the same rule it was in `quotation.state.ts`, and the pure factories and
 * mappers it leans on (`createDraft`, `applyItemPrice`, `chargeRowFromMaster`,
 * `customerFromDetail`, `applySaveResponse`, …) stayed in the feature folder,
 * where the payload builders and the tests also use them.
 *
 * Two consequences of the state being global rather than component-local, both
 * handled rather than inherited:
 *
 *  - **The draft outlives the form.** `useReducer` gave a fresh draft on every
 *    mount; a slice does not. So starting a new quotation is an explicit
 *    `clear()` on mount (see `QuotationEntryView`) instead of an implicit
 *    consequence of unmounting. `initialState` below is only ever the state
 *    before that first reset — nothing the operator sees.
 *  - **A case reducer is handed an Immer draft, not the state object.** That
 *    matters in exactly one place: `applySaveResponse` decides the dirty flag by
 *    an *identity* test, which needs the real object (see `saveResponseApplied`).
 */
import { createSlice, original, type PayloadAction } from "@reduxjs/toolkit";
import type { VoucherPolicy } from "@/domain/pricing";
import { DISCOUNT_ALTERNATES } from "@/features/sales/quotation/quotation.constants";
import {
  applyHeaderField,
  applyItemPrice,
  applySaveResponse,
  chargeRowFromMaster,
  clampPriceLevel,
  createDraft,
  createDraftChargeRow,
  createDraftLine,
  customerFromDetail,
  emptyCustomer,
  resolveLocalSale,
} from "@/features/sales/quotation/quotation.state";
import type {
  ChargeMasterRow,
  CustomerDetailPayload,
  DraftChargeRow,
  DraftLine,
  EditableCustomerField,
  FreightBand,
  ItemPriceLookupPayload,
  QuotationDraft,
  QuotationHeader,
  QuotationMode,
  QuotationPayload,
  QuotationTerms,
} from "@/features/sales/quotation/quotation.types";
import type { RootState } from "@/store/store";
export type QuotationState = QuotationDraft;
/**
 * A blank draft with no tenant. The form replaces it on mount — for a new
 * quotation with `clear()`, for an existing one with the loaded document — so
 * this value is a placeholder, not a starting point the operator ever keys into.
 */
const initialState: QuotationState = createDraft({
  companyId: "",
  branchId: "",
  accYear: "",
  companyStateCode: "",
});
const quotationSlice = createSlice({
  name: "quotation",
  initialState,
  reducers: {
    /** Replace the whole draft — used by Clear and by load. */
    draftReplaced(_state, action: PayloadAction<QuotationDraft>) {
      return action.payload;
    },
    /**
     * Fold the server-owned identity out of a save response into whatever the
     * state is NOW. Applied here rather than in the thunk because the operator
     * can commit another cell while the POST is in flight, and merging against
     * the captured pre-save draft would throw that edit away.
     */
    saveResponseApplied(
      state,
      action: PayloadAction<{ payload: QuotationPayload; sentDraft: QuotationDraft }>,
    ) {
      // `applySaveResponse` asks whether the draft the request was built from is
      // still the current one — `sentDraft !== draft`. That is an identity test,
      // and the Immer draft standing in for the state would never match, so the
      // underlying object is handed over instead.
      const base = (original(state) ?? state) as QuotationDraft;
      return applySaveResponse(base, action.payload.payload, action.payload.sentDraft);
    },
    modeSet(state, action: PayloadAction<QuotationMode>) {
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
    /**
     * Which `txn_hold` row this cart is parked as — set when it is held
     * or resumed, cleared when the hold is converted or dropped.
     *
     * Not an operator edit: parking a cart and pulling it back leave the
     * document itself untouched, so neither may mark it dirty (which would then
     * pop the discard guard on the very next F7 / F8).
     */
    holdSet(state, action: PayloadAction<{ holdId: string | null; holdNo: string }>) {
      state.holdId = action.payload.holdId;
      state.holdNo = action.payload.holdNo;
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
      action: PayloadAction<{ field: keyof QuotationHeader; value: string | number | boolean }>,
    ) {
      state.header = applyHeaderField(state.header, action.payload.field, action.payload.value);
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
    termsFieldSet(
      state,
      action: PayloadAction<{ field: keyof QuotationTerms; value: string }>,
    ) {
      state.terms[action.payload.field] = action.payload.value;
    },
    statusSet(state, action: PayloadAction<string>) {
      state.status = action.payload;
    },
    customerApplied(state, action: PayloadAction<CustomerDetailPayload>) {
      const detail = action.payload;
      const customer = customerFromDetail(detail);
      // Read before the snapshot is swapped in: a changed distance invalidates
      // the cached freight bands.
      const previousDistance = state.customer.distanceKm;
      state.customer = customer;
      state.header.posStateCode = customer.stateCode || state.header.posStateCode;
      state.header.posStateName = customer.stateName || state.header.posStateName;
      state.header.areaId = customer.areaId;
      state.header.salesmanId = detail.salesman_id ?? state.header.salesmanId;
      state.header.salesmanName = detail.salesman_name ?? state.header.salesmanName;
      state.header.contactPerson = state.header.contactPerson || customer.name;
      state.header.contactNo = state.header.contactNo || (customer.phone ?? "");
      state.header.priceLevel = customer.priceLevel;
      // The customer master's own charge applicability drives the four header
      // checkboxes.
      state.header.hasFreight = detail.freight_charge;
      state.header.hasLoad = detail.cooly;
      state.header.hasUnload = detail.unloading_charge;
      state.header.hasPromo = detail.allow_promotion;
      // `local_sales` is computed server-side against this company, so it is
      // authoritative — and it tells us the company's own state code whenever it
      // is true.
      state.isLocalSale = detail.local_sales;
      if (detail.local_sales && customer.stateCode) {
        state.companyStateCode = customer.stateCode;
      }
      if (customer.distanceKm !== previousDistance) {
        state.freightBands = [];
      }
    },
    /**
     * A hand-keyed customer detail.
     *
     * The document stores its own copy of these (`sqCustName`, `sqCustAddr`, …)
     * rather than pointing at the master, so editing them here amends THIS
     * quotation only — and lets a walk-in be keyed without a master record at
     * all, which is what the server's optional `sqCustId` allows for.
     */
    customerFieldSet(
      state,
      action: PayloadAction<{ field: EditableCustomerField; value: string }>,
    ) {
      state.customer[action.payload.field] = action.payload.value;
      if (action.payload.field === "name") {
        // The contact person defaults to the customer until it is keyed itself.
        state.header.contactPerson = state.header.contactPerson || action.payload.value;
      }
    },
    /**
     * The Beat (route) this quotation is raised on. One id — `sq_cust_area_id` —
     * seeded from the customer master and overridable per document; the name
     * rides along on the snapshot purely so the picker can show it back.
     */
    beatSet(state, action: PayloadAction<{ areaId: string; areaName: string }>) {
      state.header.areaId = action.payload.areaId || null;
      state.customer.areaName = action.payload.areaName || null;
    },
    customerCleared(state) {
      state.customer = emptyCustomer();
      state.freightBands = [];
    },
    /** Cached freight bands for the customer's distance. */
    freightBandsSet(state, action: PayloadAction<FreightBand[]>) {
      state.freightBands = action.payload;
    },
    lineAdded(state) {
      state.lines.push(createDraftLine({ priceLevel: state.header.priceLevel }));
    },
    lineInserted(state, action: PayloadAction<string>) {
      const line = createDraftLine({ priceLevel: state.header.priceLevel });
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
      action: PayloadAction<{ key: string; field: keyof DraftLine; value: unknown }>,
    ) {
      const { key, field, value } = action.payload;
      const line = state.lines.find((row) => row.key === key);
      if (!line) {
        return;
      }
      (line as unknown as Record<string, unknown>)[field] = value;
      const alternates = DISCOUNT_ALTERNATES[field];
      if (!alternates) {
        return;
      }
      // One-of-three: keying a percentage clears the per-qty rate and the keyed
      // amount (and the two symmetric cases), which is what makes
      // `applyLineDiscounts`'s precedence unambiguous.
      //
      // Zeroing a member clears nothing. "No percentage" is not a statement about
      // the per-qty rate, and treating it as one would let a stray 0 wipe the
      // discount that is actually in force.
      if (!Number(value)) {
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
      state.lines[index] = applyItemPrice(state.lines[index] as DraftLine, lookup, {
        unitName,
        unitId,
      });
    },
    linePriceLevelSet(
      state,
      action: PayloadAction<{ keys: string[]; priceLevel: number; commitDocument: boolean }>,
    ) {
      const level = clampPriceLevel(action.payload.priceLevel);
      const keys = new Set(action.payload.keys);
      // Only "Apply to All" commits the document's own level.
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
      // Rate and Amount are two ways of pricing the same row and the engine reads
      // `rate === 0 && amount !== 0` as "the operator priced it by total", so
      // setting one takes over from the other.
      //
      // Clearing one clears nothing: emptying the Amount cell means "no manual
      // override, keep the rate", and zeroing the rate along with it would drop
      // the charge off the bill entirely.
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
     * Pre-load the charges the master flags `chgAutoApply` — freight, loading
     * and the standing cash discount — the way the Qt screen opens a new entry.
     *
     * Every guard is here rather than at the call site, so the effect that
     * dispatches this can stay a plain "the masters have arrived" and fire as
     * often as it likes:
     *
     *  - **only a pristine new entry.** A loaded document has its own saved
     *    charges, and a dirty one has been worked on — seeding either would
     *    inject rows under the operator.
     *  - **only once.** Seeding leaves rows carrying a `chgId`, which fails the
     *    check below; and removing a seeded row dirties the draft, so a charge
     *    the operator deleted stays deleted instead of reappearing.
     */
    autoChargesSeeded(state, action: PayloadAction<ChargeMasterRow[]>) {
      if (state.mode !== "entry" || !state.isNewEntry || state.docId || state.isDirty) {
        return;
      }
      if (action.payload.length === 0 || state.charges.some((row) => row.chgId)) {
        return;
      }
      // The blank row this drops is put back by `withTrailingBlankRows`, which
      // runs after every action — the seeded rows have to come before it.
      state.charges = action.payload.map(chargeRowFromMaster);
    },
    chargeMasterApplied(
      state,
      action: PayloadAction<{ key: string; master: ChargeMasterRow }>,
    ) {
      const index = state.charges.findIndex((row) => row.key === action.payload.key);
      if (index < 0) {
        return;
      }
      const existing = state.charges[index];
      state.charges[index] = {
        ...chargeRowFromMaster(action.payload.master),
        // Keep the row's identity so the grid does not lose focus and an existing
        // server line is updated rather than replaced.
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
  holdSet,
  companyStateCodeSet,
  policyPatched,
  headerFieldSet,
  posSet,
  termsFieldSet,
  statusSet,
  beatSet,
  customerApplied,
  customerCleared,
  customerFieldSet,
  freightBandsSet,
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
  autoChargesSeeded,
} = quotationSlice.actions;
/** Actions that do not count as an operator edit. */
const NON_EDIT_ACTIONS = new Set<string>([
  draftReplaced.type,
  modeSet.type,
  tenantSet.type,
  holdSet.type,
  companyStateCodeSet.type,
  freightBandsSet.type,
  // Seeding the auto-apply charges is the screen opening, not the operator
  // typing: a new quotation that has only been pre-loaded is still pristine, and
  // dirtying it here would make Clear and the close guard prompt about work
  // nobody did.
  autoChargesSeeded.type,
  // A save is not an operator edit: `applySaveResponse` decides the dirty flag
  // itself (clear when the response matches what was sent, still dirty when the
  // operator committed something while it was in flight), and the wrapper below
  // would otherwise stamp it back to dirty on every successful save.
  saveResponseApplied.type,
]);
/**
 * One empty row always waiting at the bottom of BOTH grids, the way the Qt
 * screen behaves: a fresh quotation opens on a blank row, and picking an item —
 * or a charge — on the last row opens the next one. Neither grid has an "add
 * row" button to press.
 *
 * Expressed here as an invariant rather than as an append inside every case, so
 * it holds after a pick, a delete, a load, a Clear and a copy-as-new alike. A
 * blank row costs nothing downstream: the payload builder, the validator and the
 * totals all key off `itemId` / `chgId` and skip rows that have none.
 *
 * Browse mode gets no blank rows — there is nothing to type into them.
 */
function withTrailingBlankRows(state: QuotationState): QuotationState {
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
      ? [...state.lines, createDraftLine({ priceLevel: state.header.priceLevel })]
      : state.lines,
    charges: needsCharge ? [...state.charges, createDraftChargeRow()] : state.charges,
  };
}

/**
 * The reducer. Three cross-cutting rules live here rather than in every case:
 *
 *  - an operator edit marks the draft dirty, so the close/F8 guard can ask
 *    before throwing work away;
 *  - the first edit to a loaded document flips `pricing` from `stored` to
 *    `live`. Until then every figure on screen is the one that was saved, which
 *    is why a document keeps the numbers it was quoted with even after the
 *    masters and the policy have moved on. Qt needed an `m_loading` guard at the
 *    top of the recalc for this; here it is one assignment;
 *  - both grids always end on an empty row (see `withTrailingBlankRows`).
 *    It is applied LAST, so opening that row is never itself an edit — a
 *    pristine draft with its one blank row is still clean.
 *
 * An action the slice does not handle — every other slice's, and every RTK Query
 * action — leaves the state object identical and so cannot dirty the draft.
 */
export function quotationReducer(
  state: QuotationState | undefined,
  action: { type: string },
): QuotationState {
  const next = quotationSlice.reducer(state, action);
  if (state === undefined || next === state || NON_EDIT_ACTIONS.has(action.type)) {
    return withTrailingBlankRows(next);
  }
  if (next.isDirty && next.pricing === "live") {
    return withTrailingBlankRows(next);
  }
  return withTrailingBlankRows({ ...next, isDirty: true, pricing: "live" });
}
export const selectQuotationDraft = (state: RootState): QuotationState => state.quotation;
export const selectQuotationLines = (state: RootState) => state.quotation.lines;
export const selectQuotationCharges = (state: RootState) => state.quotation.charges;
export const selectQuotationIsDirty = (state: RootState) => state.quotation.isDirty;
export const selectQuotationMode = (state: RootState) => state.quotation.mode;
export const selectQuotationDocId = (state: RootState) => state.quotation.docId;
export default quotationReducer;