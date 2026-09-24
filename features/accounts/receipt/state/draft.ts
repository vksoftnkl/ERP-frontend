/**
 * The one mutable thing on this screen.
 *
 * Everything the grids show is in here, and every rule about what may change
 * is in here with it — including the refusals, which are returned rather than
 * raised so that no caller can drop one by forgetting to check.
 *
 * Three shapes are load-bearing:
 *
 *  - **Bills and credits are two lists rendered as one table.** Qt needed
 *    row-routing helpers (`isBillRow`, `billIndex`, `creditIndex`) because one
 *    `QTableWidget` held both, and `billRowForRef()` quietly became a model
 *    index rather than a grid row when the credits moved to the top. Keyed by
 *    `billId`, none of that arithmetic exists.
 *  - **Instruments and role lines are likewise two lists in one grid.** The
 *    Type picker lists the tenders and then the roles, and picking the other
 *    kind CONVERTS the row — which is the only way to add a role line, and the
 *    reason there is no second button.
 *  - **The bills are NEVER re-sorted.** They arrive in the server's
 *    `accounts.receipt_bill_sort` order, Auto-allocate walks them in list
 *    order, and that order is what keeps the preview identical to the post.
 *    Column sorting on that grid would be a defect.
 */
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import {
  autoAllocate,
  clampBillCell,
  clampCreditCell,
  clearAllocations,
} from "../domain/allocate";
import { toPaise } from "../domain/money";
import { rebuildSeededLines, seededRemovalMessage } from "../domain/seeded-lines";
import { defaultsForRole } from "../domain/roles";
import { retargetTender, tenderRowFrom } from "../domain/tenders";
import {
  emptyPartyFacts,
  parseOpenBills,
  parseOpenCredits,
  parseParty,
} from "../payload/parse";
import type {
  BillRow,
  CreditRow,
  OpenItemsPayload,
  OpenItemsSummary,
  OtherLineRow,
  PartyContextPayload,
  PartyFacts,
  ReceiptHeaderDraft,
  ReceiptRole,
  ReceiptScope,
  TenderRow,
} from "../receipt.types";
import type { Problem } from "../validate";

export type BillMoneyColumn = "receive" | "discount" | "writeOff" | "roundOff";

export type ReceiptDraft = {
  header: ReceiptHeaderDraft;
  party: PartyFacts;
  bills: BillRow[];
  credits: CreditRow[];
  tenders: TenderRow[];
  otherLines: OtherLineRow[];
  summary: OpenItemsSummary | null;
  /** The two panels and the three party figures. Null = not answered. */
  context: PartyContextPayload | null;
  /** `/open-items` has answered for the party on screen. */
  itemsLoaded: boolean;
  dirty: boolean;
  /** R20 — the grids are unlocked over a POSTED receipt. */
  amending: boolean;
  /** The revision that was LOADED. Sent straight back; never incremented. */
  baseRevision: number;
  problems: Problem[];
  /** The title-row notice. Short here, with the full sentence in its popover. */
  notice: string | null;
  /**
   * The total the duplicate guard has already asked about. RESET on every new
   * or loaded document: in Qt it was not, so the second receipt for the same
   * figure was silently skipped — exactly the case the guard exists for.
   */
  duplicateAsked: number | null;
};

export function initialDraft(scope: ReceiptScope, voucherDate: string): ReceiptDraft {
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
    party: emptyPartyFacts(),
    bills: [],
    credits: [],
    tenders: [],
    otherLines: [],
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

export type DraftRefusal = { message: string };
export type DraftResult = { draft: ReceiptDraft; refusal?: DraftRefusal };

export type DraftAction =
  | { type: "NEW_DOCUMENT"; scope: ReceiptScope; voucherDate: string }
  | { type: "SET_HEADER"; patch: Partial<ReceiptHeaderDraft> }
  | { type: "PARTY_PICKED"; partyId: string; partyName: string }
  | { type: "OPEN_ITEMS_LOADED"; partyId: string; payload: OpenItemsPayload }
  | { type: "CONTEXT_LOADED"; partyId: string; payload: PartyContextPayload }
  | { type: "CONTEXT_FAILED" }
  | { type: "SET_BILL_CELL"; billId: string; column: BillMoneyColumn; value: number }
  | { type: "SET_BILL_NOTE"; billId: string; note: string }
  | { type: "SET_WRITEOFF_APPROVER"; billId: string; userId: string | null }
  | { type: "SET_CREDIT_APPLY"; billId: string; value: number }
  | { type: "AUTO_ALLOCATE" }
  | { type: "CLEAR_ALLOCATIONS" }
  /** `amount` is for the Amount box, which adds the first row and fills it in
   * one gesture — the row would not exist yet for a second action to find. */
  | { type: "ADD_TENDER"; master: TenderMasterRow; amount?: number }
  | { type: "REMOVE_ROW"; rowKey: string }
  | { type: "SET_TENDER"; rowKey: string; patch: Partial<TenderRow> }
  | { type: "RETARGET_TENDER"; rowKey: string; master: TenderMasterRow }
  /** The Type picker chose the other kind of row. */
  | { type: "CONVERT_TO_LINE"; rowKey: string; role: ReceiptRole }
  | { type: "CONVERT_TO_TENDER"; rowKey: string; master: TenderMasterRow }
  | { type: "SET_LINE"; rowKey: string; patch: Partial<OtherLineRow> }
  | { type: "SET_LINE_ROLE"; rowKey: string; role: ReceiptRole }
  | { type: "REPLACE_BILLS"; bills: BillRow[]; credits: CreditRow[] }
  | { type: "REPLACE_DOCUMENT"; draft: ReceiptDraft }
  | { type: "PROBLEMS"; problems: Problem[] }
  | { type: "NOTICE"; notice: string | null }
  | { type: "DUPLICATE_ASKED"; amount: number }
  | { type: "SAVED"; voucherId: string; status: ReceiptHeaderDraft["status"] }
  | { type: "BEGIN_AMEND"; bills: BillRow[]; credits: CreditRow[] }
  | { type: "END_AMEND" };

/** Rebuild the derived role lines around whatever the operator has keyed. */
function withSeeded(draft: ReceiptDraft): ReceiptDraft {
  return {
    ...draft,
    otherLines: rebuildSeededLines({
      bills: draft.bills,
      tenders: draft.tenders,
      lines: draft.otherLines,
      party: draft.party,
    }),
  };
}

/** Whether this document may be edited at all. */
export function isEditable(draft: ReceiptDraft): boolean {
  return draft.amending || draft.header.status === "DRAFT";
}

function replaceBill(bills: BillRow[], billId: string, patch: Partial<BillRow>): BillRow[] {
  return bills.map((bill) => (bill.billId === billId ? { ...bill, ...patch } : bill));
}

/**
 * A pin that points at a bill the grid no longer lists is dropped.
 *
 * Changing the party, or reloading the open items, can take a pinned bill off
 * the screen — and a pin the operator cannot see is one they cannot correct.
 */
function dropStalePins(lines: OtherLineRow[], bills: readonly BillRow[]): OtherLineRow[] {
  const listed = new Set(bills.map((bill) => bill.billId));
  return lines.map((line) =>
    line.againstBillId && !listed.has(line.againstBillId)
      ? { ...line, againstBillId: null, againstBillAccYear: null }
      : line,
  );
}

export function draftReducer(state: ReceiptDraft, action: DraftAction): DraftResult {
  switch (action.type) {
    case "NEW_DOCUMENT": {
      // Everything goes, `duplicateAsked` and `amending` included. Leaving
      // either behind is how the next receipt gets keyed on a screen that
      // still thinks it is restating the last one.
      return { draft: initialDraft(action.scope, action.voucherDate) };
    }

    case "SET_HEADER": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      return {
        draft: { ...state, header: { ...state.header, ...action.patch }, dirty: true },
      };
    }

    case "PARTY_PICKED": {
      if (action.partyId === state.header.partyId) {
        return { draft: state };
      }
      // A new party's bills are not this party's bills. The party facts go
      // back to not-loaded so nothing reads a default-false flag as a fact.
      return {
        draft: {
          ...state,
          header: { ...state.header, partyId: action.partyId, partyName: action.partyName },
          party: emptyPartyFacts(),
          bills: [],
          credits: [],
          summary: null,
          context: null,
          itemsLoaded: false,
          otherLines: dropStalePins(state.otherLines, []),
          dirty: true,
          notice: null,
        },
      };
    }

    case "OPEN_ITEMS_LOADED": {
      // A late answer for the party the operator has just left must not paint.
      if (action.partyId !== state.header.partyId) {
        return { draft: state };
      }
      const bills = parseOpenBills(action.payload.bills);
      const credits = parseOpenCredits(action.payload.credits);
      const party = parseParty(action.payload.party);
      const next: ReceiptDraft = {
        ...state,
        bills,
        credits,
        party,
        summary: action.payload.summary,
        itemsLoaded: true,
        otherLines: dropStalePins(state.otherLines, bills),
        notice: party.isBillByBill
          ? state.notice
          : `${party.ledName || "This party"} is not kept bill-by-bill, so there is nothing to ` +
            "allocate against and anything received goes on account.",
      };
      return { draft: withSeeded(next) };
    }

    case "CONTEXT_LOADED": {
      if (action.partyId !== state.header.partyId) {
        return { draft: state };
      }
      return { draft: { ...state, context: action.payload } };
    }

    case "CONTEXT_FAILED": {
      // Context, not truth. The panels empty and the totals show a dash.
      return { draft: { ...state, context: null } };
    }

    case "SET_BILL_CELL": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      const bill = state.bills.find((candidate) => candidate.billId === action.billId);
      if (!bill) {
        return { draft: state };
      }
      const clamped = clampBillCell(bill, action.column, action.value);
      const patch: Partial<BillRow> = { [action.column]: clamped.value };
      if (action.column === "receive") {
        // A typed Receive is an override from now on — Auto-allocate works
        // around it rather than through it.
        patch.receiveTyped = true;
      }
      const next = withSeeded({
        ...state,
        bills: replaceBill(state.bills, action.billId, patch),
        dirty: true,
      });
      return clamped.message ? { draft: next, refusal: { message: clamped.message } } : { draft: next };
    }

    case "SET_BILL_NOTE": {
      // A scratch column. It goes nowhere — there is no per-bill narration on
      // `acc_bill_adjustment` — so it does not make the document dirty either.
      return {
        draft: { ...state, bills: replaceBill(state.bills, action.billId, { note: action.note }) },
      };
    }

    case "SET_WRITEOFF_APPROVER": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      return {
        draft: {
          ...state,
          bills: replaceBill(state.bills, action.billId, {
            writeoffApprovedBy: action.userId,
          }),
          dirty: true,
        },
      };
    }

    case "SET_CREDIT_APPLY": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      const credit = state.credits.find((candidate) => candidate.billId === action.billId);
      if (!credit) {
        return { draft: state };
      }
      const clamped = clampCreditCell(credit, action.value);
      const credits = state.credits.map((candidate) =>
        candidate.billId === action.billId
          ? { ...candidate, apply: clamped.value, applyTyped: true }
          : candidate,
      );
      const next = { ...state, credits, dirty: true };
      return clamped.message
        ? { draft: next, refusal: { message: clamped.message } }
        : { draft: next };
    }

    case "AUTO_ALLOCATE": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      if (!state.party.isBillByBill && state.itemsLoaded) {
        return {
          draft: state,
          refusal: {
            message:
              `${state.party.ledName || "This party"} is not kept bill-by-bill — there is ` +
              "nothing to allocate against, and what is received goes on account.",
          },
        };
      }
      const result = autoAllocate({
        bills: state.bills,
        credits: state.credits,
        tenders: state.tenders,
        otherLines: state.otherLines,
      });
      return {
        draft: withSeeded({
          ...state,
          bills: result.bills,
          credits: result.credits,
          dirty: true,
        }),
      };
    }

    case "CLEAR_ALLOCATIONS": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      const result = clearAllocations({ bills: state.bills, credits: state.credits });
      return {
        draft: withSeeded({
          ...state,
          bills: result.bills,
          credits: result.credits,
          dirty: true,
        }),
      };
    }

    case "ADD_TENDER": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      const row = tenderRowFrom(action.master);
      return {
        draft: {
          ...state,
          tenders: [
            ...state.tenders,
            action.amount === undefined ? row : { ...row, amount: action.amount },
          ],
          dirty: true,
        },
      };
    }

    case "REMOVE_ROW": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      const line = state.otherLines.find((candidate) => candidate.key === action.rowKey);
      if (line) {
        if (line.seeded) {
          // The server seeds it again at post and then refuses the receipt as
          // a disagreement, so refusing here is the kinder of the two.
          return {
            draft: state,
            refusal: { message: seededRemovalMessage(line.role ?? "TDS_RECEIVABLE") },
          };
        }
        return {
          draft: {
            ...state,
            otherLines: state.otherLines.filter((candidate) => candidate.key !== action.rowKey),
            dirty: true,
          },
        };
      }
      const tenders = state.tenders.filter((candidate) => candidate.key !== action.rowKey);
      if (tenders.length === state.tenders.length) {
        return { draft: state };
      }
      return { draft: withSeeded({ ...state, tenders, dirty: true }) };
    }

    case "SET_TENDER": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      const tenders = state.tenders.map((tender) =>
        tender.key === action.rowKey ? { ...tender, ...action.patch } : tender,
      );
      // The MDR column feeds the derived BANK_CHARGES line, so the seeding
      // runs on every instrument edit, not only on the amount.
      return { draft: withSeeded({ ...state, tenders, dirty: true }) };
    }

    case "RETARGET_TENDER": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      const tenders = state.tenders.map((tender) =>
        tender.key === action.rowKey ? retargetTender(tender, action.master) : tender,
      );
      return { draft: withSeeded({ ...state, tenders, dirty: true }) };
    }

    case "CONVERT_TO_LINE": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      const tender = state.tenders.find((candidate) => candidate.key === action.rowKey);
      if (!tender) {
        return { draft: state };
      }
      const defaults = defaultsForRole(action.role);
      // The amount follows the row: the operator has said "this 1,400 is a
      // TDS, not a cheque", not "start again".
      const line: OtherLineRow = {
        key: `${tender.key}-as-line`,
        role: action.role,
        ledgerId: null,
        ledgerName: "",
        drCr: defaults.drCr,
        amount: tender.amount,
        settlesBill: defaults.settlesBill,
        narration: "",
        seeded: false,
        againstBillId: null,
        againstBillAccYear: null,
      };
      return {
        draft: withSeeded({
          ...state,
          tenders: state.tenders.filter((candidate) => candidate.key !== action.rowKey),
          otherLines: [...state.otherLines, line],
          dirty: true,
        }),
      };
    }

    case "CONVERT_TO_TENDER": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      const line = state.otherLines.find((candidate) => candidate.key === action.rowKey);
      if (!line) {
        return { draft: state };
      }
      if (line.seeded) {
        return {
          draft: state,
          refusal: { message: seededRemovalMessage(line.role ?? "TDS_RECEIVABLE") },
        };
      }
      const tender = { ...tenderRowFrom(action.master), amount: line.amount };
      return {
        draft: withSeeded({
          ...state,
          otherLines: state.otherLines.filter((candidate) => candidate.key !== action.rowKey),
          tenders: [...state.tenders, tender],
          dirty: true,
        }),
      };
    }

    case "SET_LINE": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      return {
        draft: {
          ...state,
          otherLines: state.otherLines.map((line) =>
            line.key === action.rowKey ? { ...line, ...action.patch } : line,
          ),
          dirty: true,
        },
      };
    }

    case "SET_LINE_ROLE": {
      if (!isEditable(state)) {
        return { draft: state };
      }
      const defaults = defaultsForRole(action.role);
      return {
        draft: {
          ...state,
          otherLines: state.otherLines.map((line) =>
            line.key === action.rowKey
              ? {
                  ...line,
                  role: action.role,
                  // A role resolves to its ledger server-side, through
                  // `acc_ledger_map`. Sending both is a 400.
                  ledgerId: null,
                  ledgerName: "",
                  drCr: defaults.drCr,
                  settlesBill: defaults.settlesBill,
                }
              : line,
          ),
          dirty: true,
        },
      };
    }

    case "REPLACE_BILLS": {
      return {
        draft: withSeeded({
          ...state,
          bills: action.bills,
          credits: action.credits,
          otherLines: dropStalePins(state.otherLines, action.bills),
          itemsLoaded: true,
        }),
      };
    }

    case "REPLACE_DOCUMENT": {
      return { draft: action.draft };
    }

    case "PROBLEMS": {
      return { draft: { ...state, problems: action.problems } };
    }

    case "NOTICE": {
      return { draft: { ...state, notice: action.notice } };
    }

    case "DUPLICATE_ASKED": {
      return { draft: { ...state, duplicateAsked: action.amount } };
    }

    case "SAVED": {
      return {
        draft: {
          ...state,
          header: { ...state.header, voucherId: action.voucherId, status: action.status },
          dirty: false,
          problems: [],
        },
      };
    }

    case "BEGIN_AMEND": {
      return {
        draft: withSeeded({
          ...state,
          bills: action.bills,
          credits: action.credits,
          amending: true,
          // Held from the document as it was LOADED — the optimistic lock.
          baseRevision: state.header.revisionNo,
          dirty: false,
          problems: [],
        }),
      };
    }

    case "END_AMEND": {
      return { draft: { ...state, amending: false, dirty: false } };
    }

    default:
      return { draft: state };
  }
}

/** The total being received — what the duplicate guard asks about. */
export function receivedTotal(draft: ReceiptDraft): number {
  return draft.tenders.reduce((total, tender) => total + toPaise(tender.amount), 0) / 100;
}
