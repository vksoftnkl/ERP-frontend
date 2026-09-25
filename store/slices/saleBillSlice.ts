/**
 * Sale Bill Entry — the draft reducer, as a Redux slice.
 *
 * The quotation slice's architecture verbatim (see `quotationSlice.ts` for the
 * two consequences of the state being global): every transition delegates to the
 * pure functions in the feature folder, the trailing-blank-row invariant is
 * applied last, and the wrapper stamps `isDirty` / flips `pricing` to `live` on
 * the first real edit.
 *
 * One rule is this screen's own and is worth finding here rather than by reading
 * every case: **changing the customer is guarded, not reactive** (§4.3). A bill
 * that already carries tendered money or adjustments loses both when the party
 * changes, so `customerApplied` refuses to run while they stand and the screen
 * must clear them first — through `customerBoundStateCleared`, which is what the
 * confirmation dialog dispatches. Expressed as a guard rather than as an effect
 * that reacts to a changed id, because the difference is whether the operator is
 * asked before their settlement disappears or after.
 */
import { createSlice, original, type PayloadAction } from "@reduxjs/toolkit";
import type { VoucherPolicy } from "@/domain/pricing";
import { DISCOUNT_ALTERNATES } from "@/features/sales/quotation/quotation.constants";
import { applySizeEntry } from "@/features/sales/quotation/quotation.sizes";
import type { SizeEntryRow } from "@/features/sales/quotation/quotation.sizes";
import {
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
import type {
  PartyCreditSummary,
  TenderDraftRow,
} from "@/features/sales/sale-order/sale-order.types";
import { applyBillLifecycle, applyBillSaveResponse } from "@/features/sales/salebill/salebill.payload";
import { overridesAgainst } from "@/features/sales/salebill/salebill.notes";
import {
  applyBillHeaderField,
  applyBillItemPrice,
  clearCustomerBoundState,
  createBillDraft,
  createBillDraftLine,
  customerChangeCosts,
  duplicateBillDraftLine,
  lastFilledLineBefore,
  seedCreditPeriod,
  shouldSeedWalkInCustomer,
} from "@/features/sales/salebill/salebill.state";
import type {
  AdjustableCredit,
  BillAdjustmentRow,
  BillPeople,
  BillPayload,
  BillRights,
  BillSettlement,
  ValidationNote,
  SaleBillDraft,
  SaleBillDraftLine,
  SaleBillHeader,
  SaleBillMode,
  SaleBillTerms,
} from "@/features/sales/salebill/salebill.types";
import type { RootState } from "@/store/store";

export type SaleBillState = SaleBillDraft;

/**
 * A blank draft with no tenant. The form replaces it on mount — for a new bill
 * with `clear()`, for an existing one with the loaded document — so this value
 * is a placeholder, not a starting point the operator ever keys into.
 */
const initialState: SaleBillState = createBillDraft({
  companyId: "",
  branchId: "",
  accYear: "",
  companyStateCode: "",
});

/**
 * Put a customer master's answer onto the draft.
 *
 * Shared by the operator's own pick and by the walk-in seed, which differ only
 * in what they are allowed to run on — never in what applying a customer means.
 */
function applyCustomerDetail(state: SaleBillDraft, detail: CustomerDetailPayload): void {
  const customer = customerFromDetail(detail);
  // Read before the snapshot is swapped in: a changed distance invalidates
  // the cached freight bands, and the contact fields below have to be able to
  // tell the outgoing customer's own details from the operator's.
  const previousDistance = state.customer.distanceKm;
  const previousName = state.customer.name;
  const previousPhone = state.customer.phone ?? "";
  state.customer = customer;
  // The customer's state and the PLACE OF SUPPLY are two different facts
  // (§5). Picking a customer moves the POS to their state because that is
  // the overwhelmingly common case, but the operator may then override it
  // for a ship-to across a state line, and `sbCustStcd` keeps the master's
  // answer either way.
  state.header.posStateCode = customer.stateCode || state.header.posStateCode;
  state.header.posStateName = customer.stateName || state.header.posStateName;
  state.header.people.salesmanId = detail.salesman_id ?? state.header.people.salesmanId;
  state.header.people.salesmanName = detail.salesman_name ?? state.header.people.salesmanName;
  // A contact the operator keyed is theirs and stays. One that is only the
  // OUTGOING customer's own name or number, echoed in when that customer was
  // applied, belongs to the party being replaced and goes with them —
  // otherwise every bill seeded with the walk-in customer would print
  // "WALK IN CUSTOMER" as the contact for whoever the operator then picked.
  if (!state.header.contactPerson || state.header.contactPerson === previousName) {
    state.header.contactPerson = customer.name;
  }
  if (!state.header.contactNo || state.header.contactNo === previousPhone) {
    state.header.contactNo = customer.phone ?? "";
  }
  state.header.priceLevel = customer.priceLevel;
  // The customer master's own charge applicability drives the header flags.
  state.header.hasFreight = detail.freight_charge;
  state.header.hasLoad = detail.cooly;
  state.header.hasUnload = detail.unloading_charge;
  state.header.hasPromo = detail.allow_promotion;
  state.header.hasLoyalty = detail.allow_loyalty;
  // A customer the master lets buy on credit bills CREDIT; one it does not
  // bills CASH. The operator can still change it — this is the default, not
  // the decision.
  state.header.billType = detail.debit_allowed ? "CREDIT" : "CASH";
  state.header = seedCreditPeriod(state.header, customer);
  // `local_sales` is computed server-side against this company, so it is
  // authoritative — and it tells us the company's own state code whenever it
  // is true. It is the FALLBACK for the tax basis, not the source: once a
  // POS is on the document, `resolveLocalSale` reads that instead.
  state.isLocalSale = resolveLocalSale(
    state.header.posStateCode,
    state.companyStateCode,
    detail.local_sales,
  );
  if (detail.local_sales && customer.stateCode && !state.companyStateCode) {
    state.companyStateCode = customer.stateCode;
  }
  if (customer.distanceKm !== previousDistance) {
    state.freightBands = [];
  }
  // A different party is a different credit decision.
  state.partyCredit = null;
}

const saleBillSlice = createSlice({
  name: "saleBill",
  initialState,
  reducers: {
    /** Replace the whole draft — used by Clear and by load. */
    draftReplaced(_state, action: PayloadAction<SaleBillDraft>) {
      return action.payload;
    },
    modeSet(state, action: PayloadAction<SaleBillMode>) {
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
     * The company's own state, and with it the DEFAULT place of supply (§5).
     *
     * A new bill's POS is where the company is — not a hard-coded 33 / Tamil
     * Nadu — so this seeds the header's POS too, but only while the document has
     * none: once a customer has been picked or the operator has chosen a POS,
     * the company arriving late must not overwrite it.
     */
    companyStateSet(
      state,
      action: PayloadAction<{ stateCode: string; stateName?: string }>,
    ) {
      state.companyStateCode = action.payload.stateCode;
      state.companyStateName = action.payload.stateName ?? state.companyStateName;
      if (!state.header.posStateCode) {
        state.header.posStateCode = action.payload.stateCode;
        state.header.posStateName = action.payload.stateName ?? state.header.posStateName;
      }
      state.isLocalSale = resolveLocalSale(
        state.header.posStateCode,
        action.payload.stateCode,
        state.isLocalSale,
      );
    },
    policyPatched(state, action: PayloadAction<Partial<VoucherPolicy>>) {
      Object.assign(state.policy, action.payload);
    },
    headerFieldSet(
      state,
      action: PayloadAction<{ field: keyof SaleBillHeader; value: string | number | boolean }>,
    ) {
      state.header = applyBillHeaderField(state.header, action.payload.field, action.payload.value);
      // Switching TO credit is when the customer's own terms become relevant;
      // `seedCreditPeriod` declines if the operator already keyed a period.
      if (action.payload.field === "billType" && action.payload.value === "CREDIT") {
        state.header = seedCreditPeriod(state.header, state.customer);
      }
    },
    /** One of the six people a bill names, plus the vehicle. */
    peopleFieldSet(
      state,
      action: PayloadAction<{ field: keyof BillPeople; value: string | null }>,
    ) {
      const people = state.header.people as unknown as Record<string, string | null>;
      people[action.payload.field] = action.payload.value;
    },
    posSet(state, action: PayloadAction<{ stateCode: string; stateName: string }>) {
      state.header.posStateCode = action.payload.stateCode;
      state.header.posStateName = action.payload.stateName;
      state.isLocalSale = resolveLocalSale(
        action.payload.stateCode,
        state.companyStateCode,
        state.isLocalSale,
      );
      // The charge grid's own tax block follows the place of supply.
      //
      // The Qt bug this does not reproduce: `ChargeGridController::clear()`
      // drops the rows but KEEPS the inter-state flag, so a reset after an
      // inter-state bill left the next bill's own-GST charge rows on IGST. Here
      // the flag is not stored at all — `recalcDocument` is handed
      // `flags.isLocalSale` on every pass — so there is nothing to leave behind.
      // This comment is the guard rail: do not cache it onto the rows.
    },
    termsFieldSet(state, action: PayloadAction<{ field: keyof SaleBillTerms; value: string }>) {
      state.terms[action.payload.field] = action.payload.value;
    },
    statusSet(state, action: PayloadAction<string>) {
      state.status = action.payload;
    },
    // ----- the lifecycle (§16, §17) -----------------------------------------
    /**
     * A `/get`-shaped answer from post, amend or a reload: status, revision,
     * rights, locks, posting. The lines are left as the operator sees them.
     */
    lifecycleApplied(state, action: PayloadAction<BillPayload>) {
      return applyBillLifecycle(state as SaleBillDraft, action.payload);
    },
    /**
     * A NEW bill's first `/create` answered (§17.5 step 4): adopt the key and
     * the number so a retry UPDATES instead of duplicating — the missing id was
     * the duplicate-bill cause. `draftFromAutoPost` marks the draft as one a
     * refused post must delete again.
     */
    draftAdopted(
      state,
      action: PayloadAction<{ payload: BillPayload; fromAutoPost: boolean }>,
    ) {
      const { payload, fromAutoPost } = action.payload;
      state.docId = payload.sbId;
      state.billRefno = payload.sbBillRefno ?? state.billRefno;
      state.billSlno = payload.sbBillSlno ?? state.billSlno;
      state.status = "DRAFT";
      state.versionNo = payload.sbVersionNo ?? state.versionNo;
      state.revisionNo = payload.sbRevisionNo ?? state.revisionNo;
      state.isNewEntry = false;
      state.draftFromAutoPost = fromAutoPost;
    },
    /** A refused auto-post deleted its draft (§17.6): an unsaved bill again. */
    draftDisowned(state) {
      state.docId = null;
      state.billRefno = "";
      state.billSlno = "";
      state.status = "DRAFT";
      state.versionNo = 0;
      state.revisionNo = 0;
      state.isNewEntry = true;
      state.draftFromAutoPost = false;
      state.lines = state.lines.map((line) => ({ ...line, sbiId: null }));
      state.charges = state.charges.map((row) => ({ ...row, cdId: null }));
      state.tenders = state.tenders.map((row) => ({ ...row, tdId: null }));
    },
    /**
     * What the server said (§16). Replaced whole; the override ticks are kept
     * only for codes the NEW answer still raises as overridable, and only while
     * the user holds the right (rule 4).
     */
    notesSet(
      state,
      action: PayloadAction<{ notes: ValidationNote[]; rights?: Partial<BillRights> | null }>,
    ) {
      const { notes, rights } = action.payload;
      if (rights && typeof rights.override === "boolean") {
        state.rights = {
          post: rights.post ?? state.rights?.post ?? false,
          cancel: rights.cancel ?? state.rights?.cancel ?? false,
          amend: rights.amend ?? state.rights?.amend ?? false,
          override: rights.override,
          retender: rights.retender ?? state.rights?.retender ?? false,
        };
      }
      state.notes = notes;
      state.overrides = overridesAgainst(notes, state.overrides, state.rights?.override === true);
    },
    notesCleared(state) {
      state.notes = [];
      state.overrides = [];
    },
    /** The Override tick on one note. Never passes for a refusal (rule 1). */
    overrideToggled(state, action: PayloadAction<string>) {
      const code = action.payload;
      const note = state.notes.find((entry) => entry.code === code);
      if (!note || !note.overridable || state.rights?.override !== true) {
        return;
      }
      state.overrides = state.overrides.includes(code)
        ? state.overrides.filter((entry) => entry !== code)
        : [...state.overrides, code];
    },
    /** Edit (F2) on a POSTED bill (§17.8): the fields open, the strip clears. */
    amendBegun(state) {
      state.amending = true;
      state.mode = "entry";
      state.notes = [];
      state.overrides = [];
    },
    amendAbandoned(state) {
      state.amending = false;
      state.mode = "browse";
    },
    /**
     * Which `txn_hold` row this cart is parked as — set when it is held or
     * resumed, cleared when the hold is converted or dropped.
     *
     * It is what makes Hold idempotent: holding a resumed cart UPDATES that row
     * back to HELD instead of leaving the original behind and creating a second.
     *
     * Not an operator edit: parking a cart and pulling it back leave the
     * document itself untouched, so neither may mark it dirty — which would then
     * pop the discard guard on the very next F7.
     */
    holdSet(state, action: PayloadAction<{ holdId: string | null; holdNo: string }>) {
      state.holdId = action.payload.holdId;
      state.holdNo = action.payload.holdNo;
    },
    /**
     * Apply a picked customer.
     *
     * Refuses while the bill carries settled money (§4.3): the screen asks
     * first, dispatches `customerBoundStateCleared` on a yes, and only then
     * repeats this. A no leaves the document exactly as it was.
     */
    customerApplied(state, action: PayloadAction<CustomerDetailPayload>) {
      if (customerChangeCosts(state as SaleBillDraft).blocked) {
        return;
      }
      applyCustomerDetail(state as SaleBillDraft, action.payload);
    },
    /**
     * The walk-in customer a new bill opens on — settings
     * `sales.pop_default_customer` and `sales.default_customer_id` (§4.1).
     *
     * The same apply, under two differences that are the whole point of it
     * being its own action. It refuses on anything but a bill that has only
     * just been opened, so it can never overwrite a party somebody chose; and
     * it is a NON_EDIT_ACTION, because the screen opening on a default is not
     * the operator typing. Were it dirty, F7 and the close guard would prompt
     * about work nobody did and the auto-apply charges — which decline on a
     * dirty draft — would never seed at all.
     *
     * Nothing here locks the seeded customer in: picking a real one is an
     * ordinary `customerApplied`, and it replaces this outright.
     */
    walkInCustomerSeeded(state, action: PayloadAction<CustomerDetailPayload>) {
      if (!shouldSeedWalkInCustomer(state as SaleBillDraft)) {
        return;
      }
      applyCustomerDetail(state as SaleBillDraft, action.payload);
    },
    /**
     * A hand-keyed customer detail.
     *
     * The document stores its own copy of these (`sbCustName`, `sbCustAddr`, …)
     * rather than pointing at the master, so editing them amends THIS bill only.
     * `sbCustId` is nullable server-side, so a walk-in may be billed to a name
     * alone: these can stand in for a master record as well as amend one. What
     * that does NOT relax is accounts — a credit bill still needs a party
     * ledger to post against.
     */
    customerFieldSet(
      state,
      action: PayloadAction<{ field: EditableCustomerField; value: string }>,
    ) {
      state.customer[action.payload.field] = action.payload.value;
      if (action.payload.field === "name") {
        state.header.contactPerson = state.header.contactPerson || action.payload.value;
      }
    },
    /** The confirmation's "yes": drop what the customer change invalidates. */
    customerBoundStateCleared(state) {
      return clearCustomerBoundState(state as SaleBillDraft);
    },
    customerCleared(state) {
      state.customer = emptyCustomer();
      state.freightBands = [];
      state.partyCredit = null;
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
    /**
     * The settlement roll-ups — `updateSettlementDisplay()` in one assignment
     * (§9). Every path that can change tendered, adjusted, credit or refund ends
     * here, so the four can never be reconciled in two places and disagree.
     *
     * Inert until the tender dialog lands in phase 4; declared now so the totals
     * strip has something real to read.
     */
    settlementSet(state, action: PayloadAction<BillSettlement>) {
      state.settlement = action.payload;
    },
    /**
     * The tender dialog's OK (§9): its rows, and the roll-ups they computed.
     *
     * The dialog owns the arithmetic and this owns nothing but the assignment —
     * which is what makes `updateSettlementDisplay()` one place rather than
     * every path that can change a figure.
     *
     * The adjustments are NOT here even though the dialog shows them: its ADJUST
     * row is a read-only mirror of `adjustments`, and writing them back through
     * the tender path would post the same money twice.
     */
    tendersReplaced(
      state,
      action: PayloadAction<{ tenders: TenderDraftRow[]; settlement: BillSettlement }>,
    ) {
      state.tenders = action.payload.tenders;
      state.settlement = { ...state.settlement, ...action.payload.settlement };
    },
    /**
     * The adjustment panel's apply (§10) — from either mount point.
     *
     * `from` records which side wrote last, so reopening the other panel shows
     * what is actually set off rather than resurrecting a stale set. Applying at
     * all flips `adjustmentsTouched`, and only then does the save start SENDING
     * the array: until it does, omitting the key leaves a loaded bill's stored
     * settlement alone, which is the difference between editing a bill and
     * silently reversing its credits.
     */
    adjustmentsApplied(
      state,
      action: PayloadAction<{ rows: BillAdjustmentRow[]; from: "bill" | "tender" }>,
    ) {
      state.adjustments = action.payload.rows;
      state.adjustmentsFrom = action.payload.from;
      state.adjustmentsTouched = true;
      state.settlement.adjustedAmt =
        Math.round(action.payload.rows.reduce((sum, row) => sum + (row.amount || 0), 0) * 100) /
        100;
    },
    /** The open credits as last fetched. Not an edit: it is an answer arriving. */
    openCreditsSet(state, action: PayloadAction<AdjustableCredit[]>) {
      state.openCredits = action.payload;
    },
    /**
     * Fold the server-owned identity out of a save response into whatever the
     * state is NOW. Applied here rather than in the thunk because the operator
     * can commit another cell while the POST is in flight, and merging against
     * the captured pre-save draft would throw that edit away.
     */
    saveResponseApplied(
      state,
      action: PayloadAction<{ payload: BillPayload; sentDraft: SaleBillDraft }>,
    ) {
      // `applyBillSaveResponse` asks whether the draft the request was built
      // from is still the current one — an IDENTITY test, which the Immer draft
      // standing in for the state would never match, so the underlying object is
      // handed over instead.
      const base = (original(state) ?? state) as SaleBillDraft;
      return applyBillSaveResponse(base, action.payload.payload, action.payload.sentDraft);
    },
    lineAdded(state) {
      state.lines.push(createBillDraftLine({ priceLevel: state.header.priceLevel }));
    },
    lineInserted(state, action: PayloadAction<string>) {
      const line = createBillDraftLine({ priceLevel: state.header.priceLevel });
      const index = state.lines.findIndex((row) => row.key === action.payload);
      if (index < 0) {
        state.lines.push(line);
        return;
      }
      state.lines.splice(index, 0, line);
    },
    /**
     * Copy a line (Alt+R). TWO shapes, because the cursor is usually not on the
     * row worth copying.
     *
     * On a FILLED row it inserts the copy right under it — a dozen
     * near-identical lines, keyed once.
     *
     * On a BLANK row it fills THAT ROW from the last filled row above, in
     * place. This is the common press: the grid always keeps a blank row
     * waiting, so the moment an item is picked focus moves into it and the row
     * under the cursor is the empty one. Declining there — which is what this
     * used to do — reads as the shortcut being broken, since nothing happens
     * and nothing says why. Ctrl++ remains the way to open a row that stays
     * blank.
     *
     * The blank row keeps its OWN key rather than taking the copy's, so the
     * grid updates the row the operator is standing in instead of unmounting it
     * and losing the cursor.
     *
     * With nothing filled above, the state is left untouched — and because the
     * wrapper below tests `next === state`, a press that copied nothing leaves
     * a pristine draft clean rather than dirtying it and prompting on close.
     */
    lineDuplicated(state, action: PayloadAction<string>) {
      const index = state.lines.findIndex((row) => row.key === action.payload);
      if (index < 0) {
        return;
      }
      if (state.lines[index].itemId) {
        state.lines.splice(index + 1, 0, duplicateBillDraftLine(state.lines[index]));
        return;
      }
      const source = lastFilledLineBefore(state.lines as SaleBillDraftLine[], index);
      if (!source) {
        return;
      }
      state.lines[index] = {
        ...duplicateBillDraftLine(source),
        key: state.lines[index].key,
      };
    },
    /**
     * Drop a line.
     *
     * A line that came from a sales order is NOT removed here: that is a
     * three-way question (§8) whose "Cancel on Order" branch must drop the row
     * only in the server's success callback, or a refused cancellation leaves
     * the order and the bill disagreeing. The screen asks, then dispatches this
     * for the two branches that end in the row going.
     */
    lineRemoved(state, action: PayloadAction<string>) {
      state.lines = state.lines.filter((line) => line.key !== action.payload);
    },
    /**
     * Replace one item's run of size rows with the Size Entry dialog's rows —
     * the same transition the quotation screen raises, over the same pure
     * function (`applySizeEntry`), because a bill line is a quotation line plus
     * the bill's own columns.
     *
     * `duplicateBillDraftLine` is what makes it a BILL's row-replace: a row the
     * operator added in the dialog sheds `sbiId` and the whole `srcDoc*` trail,
     * so three sizes cut from an imported line cannot make one order line look
     * billed three times. The row that came from the document keeps itself, cap
     * and trail included — it IS that order line, now sized.
     */
    lineSizesApplied(
      state,
      action: PayloadAction<{ anchorKey: string; rows: SizeEntryRow<SaleBillDraftLine>[] }>,
    ) {
      state.lines = applySizeEntry(
        state.lines as SaleBillDraftLine[],
        action.payload.anchorKey,
        action.payload.rows,
        duplicateBillDraftLine,
      );
    },
    lineFieldSet(
      state,
      action: PayloadAction<{ key: string; field: keyof SaleBillDraftLine; value: unknown }>,
    ) {
      const { key, field, value } = action.payload;
      const line = state.lines.find((row) => row.key === key);
      if (!line) {
        return;
      }
      // The order-quantity cap PUTS THE VALUE BACK (§7.3) — unlike the
      // negative-stock gate, which is a condition an operator may knowingly
      // accept. Over-billing an order line is not, so the cell is read-only on
      // an imported line and this is the enforcement behind that: a cap the
      // operator can raise by hand is no cap at all.
      if (field === "orderQty" && line.orderQtyLocked) {
        return;
      }
      (line as unknown as Record<string, unknown>)[field] = value;
      const alternates = DISCOUNT_ALTERNATES[field as keyof typeof DISCOUNT_ALTERNATES];
      if (!alternates) {
        return;
      }
      // One-of-three: keying a percentage clears the per-qty rate and the keyed
      // amount (and the two symmetric cases), which is what makes
      // `applyLineDiscounts`'s precedence unambiguous.
      //
      // Zeroing a member clears nothing. "No percentage" is not a statement
      // about the per-qty rate, and treating it as one would let a stray 0 wipe
      // the discount that is actually in force.
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
      state.lines[index] = applyBillItemPrice(state.lines[index] as SaleBillDraftLine, lookup, {
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
      // Rate and Amount are two ways of pricing the same row and the engine
      // reads `rate === 0 && amount !== 0` as "the operator priced it by total",
      // so setting one takes over from the other. Clearing one clears nothing.
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
     * Pre-load the charges the master flags `chgAutoApply` (§6) — the module's
     * `S` charges plus the `B` (both) ones, in `chgDispOrder` then name order.
     *
     * Every guard is here rather than at the call site, so the effect that
     * dispatches this can stay a plain "the masters have arrived" and fire as
     * often as it likes:
     *
     *  - **only a pristine new entry.** A loaded document has its own saved
     *    charges — including, legitimately, none at all — and a dirty one has
     *    been worked on; seeding either would inject rows under the operator.
     *  - **only once.** Seeding leaves rows carrying a `chgId`, which fails the
     *    check below; and removing a seeded row dirties the draft, so a charge
     *    the operator deleted stays deleted instead of reappearing.
     *
     * Lookup failure never reaches here at all: a bill without its standing
     * charges is worse, not broken, so the fetch is allowed to fail silently.
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
    /**
     * Give a charge row its identity from the master.
     *
     * **One charge, one row.** The engine sums the grid, so the same charge on
     * two rows is added to the bill twice.
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
        // Keep the row's identity so the grid does not lose focus and an
        // existing server line is updated rather than replaced.
        key: existing.key,
        cdId: existing.cdId,
        remarks: existing.remarks,
      };
    },
  },
});

export const {
  draftReplaced,
  modeSet,
  tenantSet,
  companyStateSet,
  policyPatched,
  headerFieldSet,
  peopleFieldSet,
  posSet,
  termsFieldSet,
  statusSet,
  lifecycleApplied,
  draftAdopted,
  draftDisowned,
  notesSet,
  notesCleared,
  overrideToggled,
  amendBegun,
  amendAbandoned,
  holdSet,
  customerApplied,
  walkInCustomerSeeded,
  customerFieldSet,
  customerBoundStateCleared,
  customerCleared,
  freightBandsSet,
  partyCreditSet,
  settlementSet,
  tendersReplaced,
  adjustmentsApplied,
  openCreditsSet,
  saveResponseApplied,
  lineAdded,
  lineInserted,
  lineDuplicated,
  lineRemoved,
  lineSizesApplied,
  lineFieldSet,
  itemPriceApplied,
  linePriceLevelSet,
  chargeAdded,
  chargeRemoved,
  chargeFieldSet,
  chargeMasterApplied,
  autoChargesSeeded,
} = saleBillSlice.actions;

/** Actions that do not count as an operator edit. */
const NON_EDIT_ACTIONS = new Set<string>([
  draftReplaced.type,
  modeSet.type,
  tenantSet.type,
  companyStateSet.type,
  holdSet.type,
  freightBandsSet.type,
  partyCreditSet.type,
  openCreditsSet.type,
  // A save is not an operator edit: `applyBillSaveResponse` decides the dirty
  // flag itself (clear when the response matches what was sent, still dirty when
  // the operator committed something while it was in flight), and the wrapper
  // below would otherwise stamp it back to dirty on every successful save.
  saveResponseApplied.type,
  // None of the lifecycle bookkeeping is an operator edit: what the server said
  // about the bill, and adopting the id it handed back, leave the document as
  // the operator keyed it.
  lifecycleApplied.type,
  draftAdopted.type,
  draftDisowned.type,
  notesSet.type,
  notesCleared.type,
  overrideToggled.type,
  amendBegun.type,
  amendAbandoned.type,
  // Seeding the auto-apply charges is the screen opening, not the operator
  // typing: a new bill that has only been pre-loaded is still pristine, and
  // dirtying it here would make Clear and the close guard prompt about work
  // nobody did.
  autoChargesSeeded.type,
  // The walk-in customer is the same kind of pre-load: a bill that has only
  // been opened on the counter's default party is still pristine, and marking
  // it dirty would both prompt about work nobody did and — because
  // `autoChargesSeeded` declines on a dirty draft — cost the bill its standing
  // charges.
  walkInCustomerSeeded.type,
]);

/**
 * One empty row always waiting at the bottom of BOTH grids, the way the Qt
 * screen behaves: a fresh bill opens on a blank row, and picking an item — or a
 * charge — on the last row opens the next one. Neither grid has an "add row"
 * button to press.
 *
 * A blank row costs nothing downstream: the payload builder, the validator and
 * the totals all key off `itemId` / `chgId` and skip rows that have none. The
 * engine is told so explicitly, through `LineBasis.chargeable`, so a lump-sum
 * charge spread FLAT is not divided by the row nobody has typed in yet.
 *
 * Browse mode gets no blank rows — there is nothing to type into them.
 */
function withTrailingBlankRows(state: SaleBillState): SaleBillState {
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
      ? [...state.lines, createBillDraftLine({ priceLevel: state.header.priceLevel })]
      : state.lines,
    charges: needsCharge ? [...state.charges, createDraftChargeRow()] : state.charges,
  };
}

/**
 * The reducer. Three cross-cutting rules live here rather than in every case:
 *
 *  - an operator edit marks the draft dirty, so the close guard can ask before
 *    throwing work away;
 *  - the first edit to a loaded document flips `pricing` from `stored` to
 *    `live`. Until then every figure on screen is the one that was saved — which
 *    is how a bill keeps the numbers it was raised with after the masters have
 *    moved on;
 *  - both grids always end on an empty row. Applied LAST, so opening that row is
 *    never itself an edit.
 */
export function saleBillReducer(
  state: SaleBillState | undefined,
  action: { type: string },
): SaleBillState {
  const next = saleBillSlice.reducer(state, action);
  if (state === undefined || next === state || NON_EDIT_ACTIONS.has(action.type)) {
    return withTrailingBlankRows(next);
  }
  if (next.isDirty && next.pricing === "live") {
    return withTrailingBlankRows(next);
  }
  return withTrailingBlankRows({ ...next, isDirty: true, pricing: "live" });
}

export const selectSaleBillDraft = (state: RootState): SaleBillState => state.saleBill;
export const selectSaleBillLines = (state: RootState) => state.saleBill.lines;
export const selectSaleBillCharges = (state: RootState) => state.saleBill.charges;
export const selectSaleBillIsDirty = (state: RootState) => state.saleBill.isDirty;
export const selectSaleBillMode = (state: RootState) => state.saleBill.mode;
export const selectSaleBillDocId = (state: RootState) => state.saleBill.docId;

export default saleBillReducer;
