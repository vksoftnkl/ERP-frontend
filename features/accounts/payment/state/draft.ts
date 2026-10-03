/**
 * The one mutable thing on the Payment screen — the receipt's reducer with the
 * money going the other way.
 *
 * The same three shapes hold (receipt/state/draft.ts says why): held items and
 * bills are two lists in one table, instruments and role lines are two lists
 * in one grid, and the bills are NEVER re-sorted — the server's order is the
 * order it pours, and the preview must pour the same way.
 *
 * What is the payment's own:
 *
 *  - every seeded line is DERIVED (TDS from the instruments, the charge, the
 *    mirrors, a round-up) and is rebuilt after every edit that could move it;
 *  - a bill cell may round a bill UP (`domain/bill-cells.ts`);
 *  - a cash or bank ledger picked as the payee is refused the moment its facts
 *    say so — that is a Contra, not a payment;
 *  - the side and the settling flag of a role line are the role's, not keyed.
 *
 * Refusals are RETURNED, never raised, so no caller can drop one.
 */
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import { autoAllocate, clearAllocations } from "@/features/accounts/receipt/domain/allocate";
import { toPaise } from "@/features/accounts/receipt/domain/money";
import type {
  BillRow,
  CreditRow,
  PaymentHeaderDraft,
  PaymentLineRow,
  PaymentOpenItemsPayload,
  PaymentOpenItemsSummary,
  PaymentPartyContextPayload,
  PaymentPartyFacts,
  PaymentRole,
  PaymentScope,
  PaymentTenderRow,
} from "../payment.types";
import { clampHeldApply, setPaymentBillCell, type PaymentBillColumn } from "../domain/bill-cells";
import { PAYMENT_SETTLEMENT, defaultsForRole } from "../domain/roles";
import { rebuildPaymentSeededLines, seededRemovalMessage } from "../domain/seeded-lines";
import {
  paymentTenderRowFrom,
  resetToTender,
  retargetPaymentTender,
} from "../domain/tenders";
import { emptyPaymentParty, parsePayableBills, parsePaymentParty } from "../payload/parse";
import { parseOpenCredits } from "@/features/accounts/receipt/payload/parse";
import type { PaymentProblem } from "../validate";

export type PaymentDraft = {
  header: PaymentHeaderDraft;
  party: PaymentPartyFacts;
  bills: BillRow[];
  /** The DEBITS we hold of theirs — spent before money is. */
  credits: CreditRow[];
  tenders: PaymentTenderRow[];
  lines: PaymentLineRow[];
  summary: PaymentOpenItemsSummary | null;
  context: PaymentPartyContextPayload | null;
  itemsLoaded: boolean;
  dirty: boolean;
  amending: boolean;
  baseRevision: number;
  problems: PaymentProblem[];
  notice: string | null;
  /** RESET on every new or loaded document — see the receipt's note. */
  duplicateAsked: number | null;
};

export function initialPaymentDraft(scope: PaymentScope, voucherDate: string): PaymentDraft {
  return {
    header: {
      voucherId: null,
      scope,
      voucherDate,
      partyId: "",
      partyName: "",
      areaId: "",
      employeeId: "",
      usrRefno: "",
      docRefno: "",
      docDate: "",
      remarks: "",
      status: "DRAFT",
      voucherRefno: null,
      revisionNo: 0,
      againstVoucherId: null,
      cancelReason: null,
    },
    party: emptyPaymentParty(),
    bills: [],
    credits: [],
    tenders: [],
    lines: [],
    summary: null,
    context: null,
    itemsLoaded: false,
    dirty: false,
    amending: false,
    baseRevision: 0,
    problems: [],
    notice: null,
    duplicateAsked: null,
  };
}

export type PaymentRefusal = { message: string };
export type PaymentDraftResult = { draft: PaymentDraft; refusal?: PaymentRefusal; note?: string };

export type PaymentDraftAction =
  | { type: "NEW_DOCUMENT"; scope: PaymentScope; voucherDate: string }
  | { type: "SET_HEADER"; patch: Partial<PaymentHeaderDraft> }
  | { type: "PARTY_PICKED"; partyId: string; partyName: string }
  | { type: "OPEN_ITEMS_LOADED"; partyId: string; payload: PaymentOpenItemsPayload }
  | { type: "CONTEXT_LOADED"; partyId: string; payload: PaymentPartyContextPayload }
  | { type: "CONTEXT_FAILED" }
  | { type: "SET_BILL_CELL"; billId: string; column: PaymentBillColumn; value: number }
  | { type: "SET_BILL_NOTE"; billId: string; note: string }
  | { type: "SET_HELD_APPLY"; billId: string; value: number }
  | { type: "AUTO_ALLOCATE" }
  | { type: "CLEAR_ALLOCATIONS" }
  | { type: "ADD_TENDER"; master: TenderMasterRow; amount?: number }
  | { type: "REMOVE_ROW"; rowKey: string }
  | { type: "SET_TENDER"; rowKey: string; patch: Partial<PaymentTenderRow> }
  | { type: "RETARGET_TENDER"; rowKey: string; master: TenderMasterRow }
  | { type: "RESET_TENDER"; rowKey: string; master: TenderMasterRow }
  | { type: "CONVERT_TO_LINE"; rowKey: string; role: PaymentRole }
  | { type: "CONVERT_TO_TENDER"; rowKey: string; master: TenderMasterRow }
  | { type: "SET_LINE"; rowKey: string; patch: Partial<PaymentLineRow> }
  | { type: "SET_LINE_ROLE"; rowKey: string; role: PaymentRole }
  | { type: "REPLACE_BILLS"; bills: BillRow[]; credits: CreditRow[] }
  | { type: "REPLACE_DOCUMENT"; draft: PaymentDraft }
  | { type: "PROBLEMS"; problems: PaymentProblem[] }
  | { type: "NOTICE"; notice: string | null }
  | { type: "DUPLICATE_ASKED"; amount: number }
  | { type: "SAVED"; voucherId: string; status: PaymentHeaderDraft["status"] }
  | { type: "BEGIN_AMEND"; bills: BillRow[]; credits: CreditRow[] }
  | { type: "END_AMEND" };

/** Rebuild the seeded lines around whatever the operator has keyed. */
export function withSeeded(draft: PaymentDraft): PaymentDraft {
  return {
    ...draft,
    lines: rebuildPaymentSeededLines({
      bills: draft.bills,
      tenders: draft.tenders,
      lines: draft.lines,
      party: draft.party,
    }),
  };
}

export function isPaymentEditable(draft: PaymentDraft): boolean {
  return draft.amending || draft.header.status === "DRAFT";
}

function replaceBill(bills: BillRow[], billId: string, next: BillRow): BillRow[] {
  return bills.map((bill) => (bill.billId === billId ? next : bill));
}

/** A pin on a bill the grid no longer lists is one the operator cannot see — dropped. */
function dropStalePins(lines: PaymentLineRow[], bills: readonly BillRow[]): PaymentLineRow[] {
  const listed = new Set(bills.map((bill) => bill.billId));
  return lines.map((line) =>
    line.againstBillId && !listed.has(line.againstBillId)
      ? { ...line, againstBillId: null, againstBillAccYear: null }
      : line,
  );
}

/** The title-row notice the party's facts call for, most important first. */
export function openItemsNotice(
  party: PaymentPartyFacts,
  bills: readonly BillRow[],
  credits: readonly CreditRow[],
): string | null {
  const name = party.ledName || "This party";
  if (!party.isBillByBill) {
    return (
      `${name} is not kept bill by bill — there is nothing to allocate against, and anything ` +
      "paid goes on account as an advance."
    );
  }
  if (party.isTdsApplicable && (party.tdsRate === null || !party.tdsSection)) {
    return (
      `${name} is TDS-applicable under ${party.tdsSection || "no section"}, and no rate is in ` +
      "force for it in the TDS rates table — the server refuses the payment until one is."
    );
  }
  if (bills.length === 0 && credits.length > 0) {
    const refs = credits
      .slice(0, 3)
      .map((credit) => credit.docRefno)
      .join(", ");
    return (
      `We owe ${party.ledName || "this party"} no open bill. The ${credits.length} row(s) listed ` +
      `(${refs}${credits.length > 3 ? ", …" : ""}) are DEBITS it holds of ours — advances, debit ` +
      "notes or an opening balance entered Dr — and typing on one spends it, it does not pay it. " +
      "If these are bills we owe, correct their side to Cr on Opening Balance."
    );
  }
  return null;
}

export function paymentDraftReducer(
  state: PaymentDraft,
  action: PaymentDraftAction,
): PaymentDraftResult {
  switch (action.type) {
    case "NEW_DOCUMENT":
      return { draft: initialPaymentDraft(action.scope, action.voucherDate) };

    case "SET_HEADER": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      return { draft: { ...state, header: { ...state.header, ...action.patch }, dirty: true } };
    }

    case "PARTY_PICKED": {
      if (action.partyId === state.header.partyId) {
        return { draft: state };
      }
      // A new payee's bills are not this payee's bills, and its facts go back
      // to NOT LOADED so nothing reads a default-false flag as a fact.
      return {
        draft: withSeeded({
          ...state,
          header: { ...state.header, partyId: action.partyId, partyName: action.partyName },
          party: emptyPaymentParty(),
          bills: [],
          credits: [],
          summary: null,
          context: null,
          itemsLoaded: false,
          // The last payee's TDS is not this one's: it is worked out again
          // from the new payee's facts when they arrive.
          lines: dropStalePins(
            state.lines.filter((line) => !(line.seeded && line.role === "TDS_PAYABLE")),
            [],
          ),
          dirty: true,
          notice: null,
        }),
      };
    }

    case "OPEN_ITEMS_LOADED": {
      // A late answer for the payee the operator has just left must not paint.
      if (action.partyId !== state.header.partyId) {
        return { draft: state };
      }
      const party = parsePaymentParty(action.payload.party);
      if (party.isMoneyLedger) {
        // The pick's backstop: dropdown 60 lists party ledgers only, but a
        // cash or bank ledger that slipped through is a Contra, and `/create`
        // refuses it. Cleared here so nothing is keyed against it.
        return {
          draft: withSeeded({
            ...state,
            header: { ...state.header, partyId: "", partyName: "" },
            party: emptyPaymentParty(),
            bills: [],
            credits: [],
            summary: null,
            context: null,
            itemsLoaded: false,
            notice: null,
          }),
          refusal: {
            message:
              `${party.ledName || "That ledger"} is one of our own cash or bank accounts. Money ` +
              "moved between them is a Contra (menu 104), not a payment to a party.",
          },
        };
      }
      const bills = parsePayableBills(action.payload.bills);
      const credits = parseOpenCredits(action.payload.credits);
      return {
        draft: withSeeded({
          ...state,
          bills,
          credits,
          party,
          summary: action.payload.summary,
          itemsLoaded: true,
          lines: dropStalePins(state.lines, bills),
          notice: openItemsNotice(party, bills, credits) ?? state.notice,
        }),
      };
    }

    case "CONTEXT_LOADED": {
      if (action.partyId !== state.header.partyId) {
        return { draft: state };
      }
      return { draft: { ...state, context: action.payload } };
    }

    case "CONTEXT_FAILED":
      // Context, not truth: the panels empty and the payment is still takeable.
      return { draft: { ...state, context: null } };

    case "SET_BILL_CELL": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      const bill = state.bills.find((candidate) => candidate.billId === action.billId);
      if (!bill) {
        return { draft: state };
      }
      const result = setPaymentBillCell(bill, action.column, action.value);
      const next = withSeeded({
        ...state,
        bills: replaceBill(state.bills, action.billId, result.bill),
        dirty: true,
      });
      if (!result.message) {
        return { draft: next };
      }
      return result.refused
        ? { draft: next, refusal: { message: result.message } }
        : { draft: next, note: result.message };
    }

    case "SET_BILL_NOTE": {
      // A scratch column: it goes nowhere, so it does not make the document dirty.
      const bill = state.bills.find((candidate) => candidate.billId === action.billId);
      if (!bill) {
        return { draft: state };
      }
      return {
        draft: {
          ...state,
          bills: replaceBill(state.bills, action.billId, { ...bill, note: action.note }),
        },
      };
    }

    case "SET_HELD_APPLY": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      const held = state.credits.find((candidate) => candidate.billId === action.billId);
      if (!held) {
        return { draft: state };
      }
      const clamped = clampHeldApply(held.docRefno, held.pendingAmount, action.value);
      const credits = state.credits.map((candidate) =>
        candidate.billId === action.billId
          ? { ...candidate, apply: clamped.value, applyTyped: true }
          : candidate,
      );
      const next = { ...state, credits, dirty: true };
      return clamped.message ? { draft: next, refusal: { message: clamped.message } } : { draft: next };
    }

    case "AUTO_ALLOCATE": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      if (!state.header.partyId) {
        return { draft: state, refusal: { message: "Choose the payee first." } };
      }
      if (state.itemsLoaded && !state.party.isBillByBill) {
        return {
          draft: state,
          refusal: {
            message:
              `${state.party.ledName || "This party"} is not kept bill by bill — there is ` +
              "nothing to allocate against, and what is paid goes on account.",
          },
        };
      }
      if (state.itemsLoaded && state.bills.length === 0) {
        return {
          draft: state,
          refusal: {
            message:
              "We owe this party no open bill. Anything paid will be kept on account as an advance.",
          },
        };
      }
      // TDS follows the instruments, so the lines are brought up to date
      // BEFORE the engine reads them — it reserves room for the TDS.
      const seeded = withSeeded(state);
      const result = autoAllocate(
        {
          bills: seeded.bills,
          credits: seeded.credits,
          tenders: seeded.tenders,
          otherLines: seeded.lines,
        },
        PAYMENT_SETTLEMENT,
      );
      return {
        draft: withSeeded({ ...seeded, bills: result.bills, credits: result.credits, dirty: true }),
      };
    }

    case "CLEAR_ALLOCATIONS": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      const result = clearAllocations({ bills: state.bills, credits: state.credits });
      return {
        draft: withSeeded({ ...state, bills: result.bills, credits: result.credits, dirty: true }),
      };
    }

    case "ADD_TENDER": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      const row = paymentTenderRowFrom(action.master);
      return {
        draft: withSeeded({
          ...state,
          tenders: [
            ...state.tenders,
            action.amount === undefined ? row : { ...row, amount: action.amount },
          ],
          dirty: true,
        }),
      };
    }

    case "REMOVE_ROW": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      const line = state.lines.find((candidate) => candidate.key === action.rowKey);
      if (line) {
        if (line.seeded) {
          return { draft: state, refusal: { message: seededRemovalMessage(line) } };
        }
        return {
          draft: withSeeded({
            ...state,
            lines: state.lines.filter((candidate) => candidate.key !== action.rowKey),
            dirty: true,
          }),
        };
      }
      const tenders = state.tenders.filter((candidate) => candidate.key !== action.rowKey);
      if (tenders.length === state.tenders.length) {
        return { draft: state };
      }
      return { draft: withSeeded({ ...state, tenders, dirty: true }) };
    }

    case "SET_TENDER": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      const tenders = state.tenders.map((tender) =>
        tender.key === action.rowKey ? { ...tender, ...action.patch } : tender,
      );
      // The amount moves the TDS and the charge moves BANK_CHARGES, so the
      // seeding runs on every instrument edit.
      return { draft: withSeeded({ ...state, tenders, dirty: true }) };
    }

    case "RETARGET_TENDER":
    case "RESET_TENDER": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      const apply = action.type === "RESET_TENDER" ? resetToTender : retargetPaymentTender;
      const tenders = state.tenders.map((tender) =>
        tender.key === action.rowKey ? apply(tender, action.master) : tender,
      );
      return { draft: withSeeded({ ...state, tenders, dirty: true }) };
    }

    case "CONVERT_TO_LINE": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      const tender = state.tenders.find((candidate) => candidate.key === action.rowKey);
      if (!tender) {
        return { draft: state };
      }
      const defaults = defaultsForRole(action.role);
      const line: PaymentLineRow = {
        key: `${tender.key}-as-line`,
        role: action.role,
        ledgerId: null,
        ledgerName: "",
        drCr: defaults.drCr,
        // The amount follows the row: "this 1,400 is interest, not a cheque".
        amount: tender.amount,
        settlesBill: defaults.settlesBill,
        narration: "",
        seeded: false,
        againstBillId: null,
        againstBillAccYear: null,
        approvedBy: null,
      };
      return {
        draft: withSeeded({
          ...state,
          tenders: state.tenders.filter((candidate) => candidate.key !== action.rowKey),
          lines: [...state.lines, line],
          dirty: true,
        }),
      };
    }

    case "CONVERT_TO_TENDER": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      const line = state.lines.find((candidate) => candidate.key === action.rowKey);
      if (!line) {
        return { draft: state };
      }
      if (line.seeded) {
        return { draft: state, refusal: { message: seededRemovalMessage(line) } };
      }
      const tender = { ...paymentTenderRowFrom(action.master), amount: line.amount };
      return {
        draft: withSeeded({
          ...state,
          lines: state.lines.filter((candidate) => candidate.key !== action.rowKey),
          tenders: [...state.tenders, tender],
          dirty: true,
        }),
      };
    }

    case "SET_LINE": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      const line = state.lines.find((candidate) => candidate.key === action.rowKey);
      if (!line) {
        return { draft: state };
      }
      // A seeded line's figure and narration are rebuilt from the grids on
      // every edit (the TDS narration states the base it was worked on); only
      // its PIN is the operator's.
      const patch: Partial<PaymentLineRow> = line.seeded
        ? action.patch.againstBillId !== undefined
          ? {
              againstBillId: action.patch.againstBillId,
              againstBillAccYear: action.patch.againstBillAccYear ?? null,
            }
          : {}
        : action.patch;
      return {
        draft: withSeeded({
          ...state,
          lines: state.lines.map((candidate) =>
            candidate.key === action.rowKey ? { ...candidate, ...patch } : candidate,
          ),
          dirty: true,
        }),
      };
    }

    case "SET_LINE_ROLE": {
      if (!isPaymentEditable(state)) {
        return { draft: state };
      }
      const defaults = defaultsForRole(action.role);
      return {
        draft: withSeeded({
          ...state,
          lines: state.lines.map((line) =>
            line.key === action.rowKey && !line.seeded
              ? {
                  ...line,
                  role: action.role,
                  // A role resolves to its ledger server-side; both is a 400.
                  ledgerId: null,
                  ledgerName: "",
                  drCr: defaults.drCr,
                  settlesBill: defaults.settlesBill,
                  // Only a settling line can be pinned to a bill.
                  againstBillId: defaults.settlesBill ? line.againstBillId : null,
                  againstBillAccYear: defaults.settlesBill ? line.againstBillAccYear : null,
                }
              : line,
          ),
          dirty: true,
        }),
      };
    }

    case "REPLACE_BILLS":
      return {
        draft: withSeeded({
          ...state,
          bills: action.bills,
          credits: action.credits,
          lines: dropStalePins(state.lines, action.bills),
          itemsLoaded: true,
        }),
      };

    case "REPLACE_DOCUMENT":
      return { draft: action.draft };

    case "PROBLEMS":
      return { draft: { ...state, problems: action.problems } };

    case "NOTICE":
      return { draft: { ...state, notice: action.notice } };

    case "DUPLICATE_ASKED":
      return { draft: { ...state, duplicateAsked: action.amount } };

    case "SAVED":
      return {
        draft: {
          ...state,
          header: { ...state.header, voucherId: action.voucherId, status: action.status },
          dirty: false,
          problems: [],
        },
      };

    case "BEGIN_AMEND":
      return {
        draft: withSeeded({
          ...state,
          bills: action.bills,
          credits: action.credits,
          amending: true,
          baseRevision: state.header.revisionNo,
          dirty: false,
          problems: [],
        }),
      };

    case "END_AMEND":
      return { draft: { ...state, amending: false, dirty: false } };

    default:
      return { draft: state };
  }
}

/** The total being paid — what the duplicate guard asks about. */
export function paidTotal(draft: Pick<PaymentDraft, "tenders">): number {
  return draft.tenders.reduce((total, tender) => total + toPaise(tender.amount), 0) / 100;
}
