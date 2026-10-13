/**
 * The expense voucher's draft, and every change the operator can make to it.
 *
 * A pure reducer: the screen dispatches, nothing here talks to the server.
 * What the server ANSWERS (tax, totals, where the money came from, legs) is
 * never written into the draft — it is shown beside it (`domain/view.ts`), so
 * the draft is only ever what was typed.
 *
 * Rows are addressed by a stable `key`, never by position.
 *
 * ── The trailing blank row (Qt d97cdd4 `ensureTrailingRows`) ─────────────
 * While the voucher can be edited, BOTH grids end in one blank row: typing
 * into it is how a line or a tender is added, and the moment it carries
 * anything the next blank one appears. "+" only puts the caret there. A blank
 * row is furniture — it cannot be removed, it is never sent, and it does not
 * count as a line. A posted voucher has none.
 */
import type {
  ExpenseDraft,
  ExpenseHeaderDraft,
  ExpenseLedgerPick,
  ExpenseLineDraft,
  ExpenseReasonPick,
  ExpenseStatus,
  ExpenseTenderDraft,
} from "../expense.types";
import { paiseOfText, paiseToDecimal, parseAmountText, sumPaise, tidyAmountText } from "./money";

let rowSequence = 0;

function nextKey(prefix: string): string {
  rowSequence += 1;
  return `${prefix}-${rowSequence}`;
}

export function emptyLine(): ExpenseLineDraft {
  return {
    key: nextKey("expense-line"),
    reasonId: "",
    reasonName: "",
    ledgerId: "",
    ledgerName: "",
    description: "",
    hsn: "",
    amount: "",
    taxId: "",
    taxName: "",
    // ITC is claimed unless the operator says otherwise (the server's default too).
    itc: true,
  };
}

export function emptyTender(tenderId = "", amount = "", autoAmount = false): ExpenseTenderDraft {
  return { key: nextKey("expense-tender"), tenderId, tenderName: "", refNo: "", amount, autoAmount };
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
    placeOfSupplyPicked: false,
  };
}

/** A typed amount of zero — blank or `0.00`; an unreadable entry is NOT zero (it is something). */
function isZeroAmount(text: string): boolean {
  return parseAmountText(text) === 0;
}

/** Qt `Line::isBlank`: no reason, no ledger, no amount, no description. */
export function isBlankLine(line: ExpenseLineDraft): boolean {
  return !line.reasonId && !line.ledgerId && isZeroAmount(line.amount) && !line.description.trim();
}

/** Qt `Tender::isBlank`: no tender, no amount, no ref. */
export function isBlankTender(row: ExpenseTenderDraft): boolean {
  return !row.tenderId && isZeroAmount(row.amount) && !row.refNo.trim();
}

/** NEW or DRAFT: everything may change. POSTED and CANCELLED are read-only. */
export function isEditable(status: ExpenseStatus | null): boolean {
  return status === null || status === "DRAFT";
}

/**
 * F8 over a voucher (Qt `showList`, 6f15977): opening another one asks first
 * only while this one can still change and has a line typed into it — a
 * blank voucher, or one that can only be read, is simply replaced.
 */
export function asksBeforeOpeningAnother(lines: readonly ExpenseLineDraft[], editable: boolean): boolean {
  return editable && lines.some((line) => !isBlankLine(line));
}

/** Both grids end in exactly one blank row while the voucher can be edited. */
export function withTrailingRows(draft: ExpenseDraft): ExpenseDraft {
  if (!isEditable(draft.status)) {
    return draft;
  }
  const lastLine = draft.lines.at(-1);
  const lastTender = draft.tenders.at(-1);
  const needLine = !lastLine || !isBlankLine(lastLine);
  const needTender = !lastTender || !isBlankTender(lastTender);
  if (!needLine && !needTender) {
    return draft;
  }
  return {
    ...draft,
    lines: needLine ? [...draft.lines, emptyLine()] : draft.lines,
    tenders: needTender ? [...draft.tenders, emptyTender()] : draft.tenders,
  };
}

/**
 * A NEW voucher: one blank line, and one tender on cash (when a cash tender is
 * known) that takes the balance until its amount is typed — then the blank
 * row each grid ends in.
 */
export function newDraft(today: string, cashTenderId = ""): ExpenseDraft {
  return withTrailingRows({
    keys: null,
    status: null,
    voucherNo: null,
    header: emptyHeader(today),
    lines: [emptyLine()],
    tenders: [emptyTender(cashTenderId, "", true)],
    dirty: false,
  });
}

/**
 * What picking a reason in grid 155 does to its line (Qt `onPopupPicked`):
 * the reason, its ledger when it names one, that ledger's GST rate and HSN
 * where the line has none, and the description when that is empty.
 */
export function reasonPickPatch(line: ExpenseLineDraft, pick: ExpenseReasonPick): Partial<ExpenseLineDraft> {
  const patch: Partial<ExpenseLineDraft> = { reasonId: pick.reasonId, reasonName: pick.name };
  if (pick.ledgerId) {
    patch.ledgerId = pick.ledgerId;
    patch.ledgerName = pick.ledgerName;
    Object.assign(patch, ledgerFactsPatch(line, pick));
  }
  if (!line.description.trim()) {
    patch.description = pick.name;
  }
  return patch;
}

/** What picking a ledger in grid 156 does to its line: the ledger, and its GST facts where blank. */
export function ledgerPickPatch(line: ExpenseLineDraft, pick: ExpenseLedgerPick): Partial<ExpenseLineDraft> {
  return { ledgerId: pick.ledgerId, ledgerName: pick.name, ...ledgerFactsPatch(line, pick) };
}

/** The ledger's GST rate and HSN/SAC fill only what the line has not got. */
function ledgerFactsPatch(
  line: ExpenseLineDraft,
  facts: { taxId: string; taxName: string; hsn: string },
): Partial<ExpenseLineDraft> {
  const patch: Partial<ExpenseLineDraft> = {};
  if (!line.taxId && facts.taxId) {
    patch.taxId = facts.taxId;
    patch.taxName = facts.taxName;
  }
  if (!line.hsn && facts.hsn) {
    patch.hsn = facts.hsn;
  }
  return patch;
}

/** Where the caret goes after a pick: a reason with its ledger is a whole line but the money. */
export function cellAfterPick(column: "reason" | "ledger", line: ExpenseLineDraft): "amount" | "ledger" | "description" {
  if (column === "ledger") {
    return "description";
  }
  return line.ledgerId ? "amount" : "ledger";
}

export type ExpenseDraftAction =
  | { type: "RESET"; draft: ExpenseDraft }
  | { type: "SET_HEADER"; patch: Partial<ExpenseHeaderDraft> }
  | { type: "REMOVE_LINE"; key: string }
  | { type: "SET_LINE"; key: string; patch: Partial<ExpenseLineDraft> }
  | { type: "REMOVE_TENDER"; key: string }
  | { type: "SET_TENDER"; key: string; patch: Partial<ExpenseTenderDraft> }
  /**
   * The tender masters landed after a NEW voucher was started: its first
   * tender, still unnamed, goes on cash (Qt `loadPickers`). Nothing the
   * operator did changed, so the draft stays clean.
   */
  | { type: "DEFAULT_CASH"; tenderId: string };

function edited(state: ExpenseDraft, next: Partial<ExpenseDraft>): ExpenseDraft {
  return withTrailingRows({ ...state, ...next, dirty: true });
}

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
    case "REMOVE_LINE": {
      // A blank row is furniture: there is nothing on it to remove.
      const line = state.lines.find((candidate) => candidate.key === action.key);
      if (!line || isBlankLine(line)) {
        return state;
      }
      return edited(state, { lines: state.lines.filter((candidate) => candidate.key !== action.key) });
    }
    case "SET_LINE":
      return edited(state, {
        lines: state.lines.map((line) => (line.key === action.key ? { ...line, ...action.patch } : line)),
      });
    case "REMOVE_TENDER": {
      const row = state.tenders.find((candidate) => candidate.key === action.key);
      if (!row || isBlankTender(row)) {
        return state;
      }
      return edited(state, { tenders: state.tenders.filter((candidate) => candidate.key !== action.key) });
    }
    case "SET_TENDER":
      return edited(state, {
        tenders: state.tenders.map((row) => (row.key === action.key ? { ...row, ...action.patch } : row)),
      });
    case "DEFAULT_CASH": {
      // Only the row the voucher started with (it is the one that follows the
      // balance): a blank row left first by removing the cash tender stays blank.
      const first = state.tenders[0];
      if (state.status !== null || !action.tenderId || !first || first.tenderId || !first.autoAmount) {
        return state;
      }
      return withTrailingRows({
        ...state,
        tenders: [{ ...first, tenderId: action.tenderId }, ...state.tenders.slice(1)],
      });
    }
    default:
      return state;
  }
}

/**
 * The first tender, until its amount is typed, is whatever the others leave
 * of `totalPaise` (Qt `balanceAutoTender`). Derived on every render, so the
 * draft never stores a figure the operator did not type.
 */
export function withAutoTender(draft: ExpenseDraft, totalPaise: number): ExpenseDraft {
  const first = draft.tenders[0];
  if (!isEditable(draft.status) || !first?.autoAmount) {
    return draft;
  }
  const others = sumPaise(draft.tenders.slice(1).map((row) => paiseOfText(row.amount)));
  const amount = tidyAmountText(paiseToDecimal(Math.max(0, totalPaise - others)));
  if (amount === first.amount) {
    return draft;
  }
  return { ...draft, tenders: [{ ...first, amount }, ...draft.tenders.slice(1)] };
}

/**
 * Cancel & re-enter (Qt 5e25760 `cancelPosted(true)`): the server has no
 * amend, so a posted voucher is cancelled and its copy opens as a NEW voucher
 * to correct and post. The copy keeps the lines, the tenders, the party, the
 * remarks and the GST bill — the same supplier invoice no too, which a
 * cancelled voucher no longer holds — and takes today's date. A single tender
 * follows the corrected total; several stay as typed.
 *
 * `reasonNames` names a reason the loaded voucher carried only by id.
 */
export function reenterCopy(
  posted: ExpenseDraft,
  today: string,
  reasonNames: ReadonlyMap<string, string>,
): ExpenseDraft {
  const lines = posted.lines
    .filter((line) => !isBlankLine(line))
    .map((line) => ({
      ...line,
      key: nextKey("expense-line"),
      reasonName: line.reasonId ? line.reasonName || reasonNames.get(line.reasonId) || "" : "",
    }));
  const tenders = posted.tenders
    .filter((row) => !isBlankTender(row))
    .map((row) => ({ ...row, key: nextKey("expense-tender"), autoAmount: false }));
  if (tenders.length === 1) {
    tenders[0] = { ...tenders[0], autoAmount: true };
  }
  return withTrailingRows({
    keys: null,
    status: null,
    voucherNo: null,
    header: { ...posted.header, voucherDate: today },
    lines: lines.length > 0 ? lines : [emptyLine()],
    tenders: tenders.length > 0 ? tenders : [emptyTender("", "", true)],
    // Typed, not saved: Close asks before it is thrown away.
    dirty: true,
  });
}
