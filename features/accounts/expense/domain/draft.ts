/**
 * The expense voucher's draft, and every change the operator can make to it.
 *
 * A pure reducer: the screen dispatches, nothing here talks to the server.
 * What the server ANSWERS (tax, totals, where the money came from, legs) is
 * never written into the draft — it is shown beside it (`domain/view.ts`), so
 * the draft is only ever what was typed.
 *
 * Rows are addressed by a stable `key`, never by position: the Qt screen
 * re-read every widget back into its list before each change (`readBack()`),
 * because a re-filled table lost its cell widgets; here the row is the state.
 */
import type {
  ExpenseDraft,
  ExpenseHeaderDraft,
  ExpenseLineDraft,
  ExpenseQuickReason,
  ExpenseStatus,
  ExpenseTenderDraft,
} from "../expense.types";

let rowSequence = 0;

function nextKey(prefix: string): string {
  rowSequence += 1;
  return `${prefix}-${rowSequence}`;
}

export function emptyLine(): ExpenseLineDraft {
  return {
    key: nextKey("expense-line"),
    reasonId: "",
    ledgerId: "",
    ledgerName: "",
    description: "",
    amount: "",
    taxId: "",
    taxName: "",
    // ITC is claimed unless the operator says otherwise (the server's default too).
    itc: true,
  };
}

export function emptyTender(tenderId = "", amount = ""): ExpenseTenderDraft {
  return { key: nextKey("expense-tender"), tenderId, tenderName: "", refNo: "", amount };
}

export function emptyHeader(today: string): ExpenseHeaderDraft {
  return {
    voucherDate: today,
    partyId: "",
    partyName: "",
    paidTo: "",
    notes: "",
    gstBill: false,
    supplierGstin: "",
    invoiceNo: "",
    // Qt seeds the invoice date with today, ready for the bill in hand.
    invoiceDate: today,
    placeOfSupply: "",
  };
}

/** A NEW voucher: one empty line, one tender row on cash (when a cash tender is known). */
export function newDraft(today: string, cashTenderId = ""): ExpenseDraft {
  return {
    keys: null,
    status: null,
    voucherNo: null,
    header: emptyHeader(today),
    lines: [emptyLine()],
    tenders: [emptyTender(cashTenderId)],
    dirty: false,
  };
}

/** NEW or DRAFT: everything may change. POSTED and CANCELLED are read-only. */
export function isEditable(status: ExpenseStatus | null): boolean {
  return status === null || status === "DRAFT";
}

/**
 * What picking a reason does to its line (Qt: the reason fills its ledger, and
 * the description when that is empty).
 *
 * The ledger is filled only when it is one the line may use — in the ledger
 * pick list, or the line's own saved ledger — exactly as the Qt combo only
 * moved to a ledger it held. A reason whose ledger was since deleted, or sits
 * outside an Expenses group, leaves the ledger alone.
 */
export function reasonPatch(
  line: ExpenseLineDraft,
  reason: ExpenseQuickReason | null,
  ledgers: readonly { ledgerId: string; name: string }[],
): Partial<ExpenseLineDraft> {
  if (!reason) {
    return { reasonId: "" };
  }
  const patch: Partial<ExpenseLineDraft> = { reasonId: reason.reasonId };
  if (reason.ledgerId) {
    const known = ledgers.find((ledger) => ledger.ledgerId === reason.ledgerId);
    if (known) {
      patch.ledgerId = known.ledgerId;
      patch.ledgerName = known.name;
    } else if (reason.ledgerId === line.ledgerId) {
      patch.ledgerId = line.ledgerId;
    }
  }
  if (!line.description.trim()) {
    patch.description = reason.name;
  }
  return patch;
}

export type ExpenseDraftAction =
  | { type: "RESET"; draft: ExpenseDraft }
  | { type: "SET_HEADER"; patch: Partial<ExpenseHeaderDraft> }
  /** The caller mints the row (`emptyLine()`), so it knows the key to focus. */
  | { type: "ADD_LINE"; line: ExpenseLineDraft }
  | { type: "REMOVE_LINE"; key: string }
  | { type: "SET_LINE"; key: string; patch: Partial<ExpenseLineDraft> }
  | { type: "ADD_TENDER"; row: ExpenseTenderDraft }
  | { type: "REMOVE_TENDER"; key: string }
  | { type: "SET_TENDER"; key: string; patch: Partial<ExpenseTenderDraft> };

export function expenseDraftReducer(state: ExpenseDraft, action: ExpenseDraftAction): ExpenseDraft {
  if (action.type === "RESET") {
    return action.draft;
  }
  if (!isEditable(state.status)) {
    // A posted or cancelled voucher is read; the screen disables its fields,
    // and the reducer refuses anyway rather than trusting that.
    return state;
  }
  switch (action.type) {
    case "SET_HEADER":
      return { ...state, header: { ...state.header, ...action.patch }, dirty: true };
    case "ADD_LINE":
      return { ...state, lines: [...state.lines, action.line], dirty: true };
    case "REMOVE_LINE": {
      // The last line stays: a voucher always shows one row to type into.
      if (state.lines.length <= 1 || !state.lines.some((line) => line.key === action.key)) {
        return state;
      }
      return { ...state, lines: state.lines.filter((line) => line.key !== action.key), dirty: true };
    }
    case "SET_LINE":
      return {
        ...state,
        lines: state.lines.map((line) => (line.key === action.key ? { ...line, ...action.patch } : line)),
        dirty: true,
      };
    case "ADD_TENDER":
      return { ...state, tenders: [...state.tenders, action.row], dirty: true };
    case "REMOVE_TENDER": {
      if (state.tenders.length <= 1 || !state.tenders.some((row) => row.key === action.key)) {
        return state;
      }
      return { ...state, tenders: state.tenders.filter((row) => row.key !== action.key), dirty: true };
    }
    case "SET_TENDER":
      return {
        ...state,
        tenders: state.tenders.map((row) => (row.key === action.key ? { ...row, ...action.patch } : row)),
        dirty: true,
      };
    default:
      return state;
  }
}

/**
 * A NEW voucher pays by cash unless told otherwise (Qt `startNew` /
 * `loadPickers`). The tender masters can land after the voucher was started,
 * so the first tender row of a NEW voucher that names no tender is READ as the
 * cash tender rather than rewritten when the masters arrive: nothing the
 * operator did changed, and the draft stays clean. Picking a tender on that
 * row writes it for real.
 */
export function withDefaultCash(draft: ExpenseDraft, cashTenderId: string): ExpenseDraft {
  const first = draft.tenders[0];
  if (draft.status !== null || !cashTenderId || !first || first.tenderId) {
    return draft;
  }
  return { ...draft, tenders: [{ ...first, tenderId: cashTenderId }, ...draft.tenders.slice(1)] };
}
