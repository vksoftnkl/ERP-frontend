/**
 * What the screen SHOWS beside the draft: the server's answer to
 * `/expenses/validate` (or a loaded voucher's saved figures), laid out the way
 * Qt `showValidate()` / `showLegs()` lays it out, in Qt's words.
 *
 * ── Fresh, or not ────────────────────────────────────────────────────────
 * The Qt screen showed the LAST answer until the next one landed, 400 ms
 * after an edit, whatever had been typed since. Here every answer carries the
 * body it answered (`bodyKey`), and a figure from an answer to a body that no
 * longer stands is not shown as if it were current:
 *  - without a GST bill the total IS the sum of the typed amounts (no tax can
 *    arise), so the lines, the total and the balance are summed here in
 *    integer paise — the server's own rule, exact;
 *  - with a GST bill the tax needs the rates, so a figure waits ("…") for the
 *    server rather than being guessed;
 *  - the refusals, warnings, approval and legs of a stale answer are kept but
 *    marked stale, and Post waits for a fresh check.
 *
 * The lines' own figures (tax, totals, the tax note) are current while the
 * LINES are what the answer was for (`linesKey`): the first tender follows
 * the total, so an answer that moves the total also changes the body, and
 * keying those cells on the whole body would blank them for a round trip on
 * every edit while the tender caught up.
 */
import type {
  ExpenseDraft,
  ExpenseLinePayload,
  ExpenseStatus,
  ExpenseTenderOption,
  ExpenseTenderPayload,
  ExpenseTillSession,
  ExpenseValidatePayload,
} from "../expense.types";
import { formatPaise, paiseOfNumber, paiseOfText, sumPaise } from "./money";
import { isEmptyLine } from "./payload";

/** The INFO warning that duplicates the approval band; Qt leaves it out of the list. */
export const APPROVAL_WARNING_CODE = "TILL_APPROVAL_REQUIRED";

export type ExpenseAnswer = {
  /**
   * `validated` — `/expenses/validate`'s answer: Post may go on it.
   * `saved` — a loaded voucher's own figures (Qt "unchecked"): shown at once,
   * never a check, so a draft is validated for real before Post opens. It
   * stands until the draft is edited (`bodyKey` is not used for it: the body
   * depends on the tender masters, which may land after the voucher).
   */
  kind: "validated" | "saved";
  bodyKey: string;
  /** The body the answer was for, less its tenders (`linesKeyOf`). */
  linesKey: string;
  payload: ExpenseValidatePayload;
};

export type Tone = "success" | "danger" | "warning" | "neutral" | "pending";

export type ExpenseView = {
  /** The answer is for exactly what is on screen: refusals, warnings, legs. */
  fresh: boolean;
  /** The answer is for these lines: their tax, totals and the tax note. */
  linesFresh: boolean;
  lineCells: { tax: string; total: string }[];
  linesSummary: string;
  tendersSummary: string;
  balance: { text: string; tone: Tone };
  tenderAccounts: string[];
  moneyFrom: string;
  taxNote: string;
  refusals: string[];
  warnings: string[];
  approval: { code: string; amount: string; text: string } | null;
  legs: { columns: { side: "Dr" | "Cr"; name: string; amount: string }[][]; balance: string; balanced: boolean };
};

export type ExpenseViewInput = {
  draft: ExpenseDraft;
  answer: ExpenseAnswer | null;
  currentBodyKey: string;
  currentLinesKey: string;
  /** The HTTP error /validate answered for the current body, if it did. */
  validateError: string | null;
  session: ExpenseTillSession | null;
  tenders: readonly ExpenseTenderOption[];
};

export const DEFAULT_TAX_NOTE =
  "Without a GST bill the amount is the whole cost; with one it is the taxable value and the server works out the tax (CGST+SGST or IGST from the place of supply). ITC YES books the tax to Input GST; NO adds it to the expense.";

export const TENDER_NOTE =
  "CASH = this till's drawer (back office: the default safe). UPI / bank rows are information-only at the till's close. A cheque is a bill-wise Payment.";

const PENDING = "…";

function taxOf(line: { cgst: number; sgst: number; igst: number; cess: number }): number {
  return sumPaise([line.cgst, line.sgst, line.igst, line.cess].map(paiseOfNumber));
}

/** A figure cell: blank for nothing, so the ones that matter stand out (Qt `moneyOrBlank`). */
function paiseOrBlank(paise: number): string {
  return paise === 0 ? "" : formatPaise(paise);
}

/**
 * The input tax credit: the tax of every line whose ITC class is not
 * ineligible (a line ticked ITC NO comes back INELIGIBLE; one without a rate
 * comes back with none).
 */
export function itcPaise(lines: readonly ExpenseLinePayload[]): number {
  return sumPaise(
    lines
      .filter((line) => Boolean(line.itcEligibility) && line.itcEligibility !== "INELIGIBLE")
      .map(taxOf),
  );
}

/** The statuses' pill: NEW and DRAFT amber, POSTED green, CANCELLED red (Qt tones). */
export function statusPill(status: ExpenseStatus | null): { label: string; tone: Tone } {
  if (status === "POSTED") return { label: "POSTED", tone: "success" };
  if (status === "CANCELLED") return { label: "CANCELLED", tone: "danger" };
  return { label: status ?? "NEW", tone: "warning" };
}

/** The tender rows the server is sent: a known master and a non-zero amount. */
export function countedTenderPaise(draft: ExpenseDraft, tenders: readonly ExpenseTenderOption[]): number {
  return sumPaise(
    draft.tenders
      .filter((row) => tenders.some((option) => option.tenderId === row.tenderId))
      .map((row) => paiseOfText(row.amount)),
  );
}

/** Σ of the lines the server is sent, as typed (the taxable value with a GST bill). */
export function countedLinePaise(draft: ExpenseDraft): number {
  return sumPaise(draft.lines.filter((line) => !isEmptyLine(line)).map((line) => paiseOfText(line.amount)));
}

/** What a new tender row takes: what is still unpaid, never below zero (Qt `addTender`). */
export function unpaidPaise(totalPaise: number | null, tenderPaise: number): number {
  return totalPaise === null ? 0 : Math.max(0, totalPaise - tenderPaise);
}

function lineFigure(answer: ExpenseAnswer, index: number): ExpenseLinePayload | undefined {
  const lines = answer.payload.derived.lines;
  return answer.kind === "saved" ? lines[index] : lines.find((line) => line.rowNo === index + 1);
}

function tenderFigure(answer: ExpenseAnswer, index: number): ExpenseTenderPayload | undefined {
  const rows = answer.payload.derived.tenders;
  return answer.kind === "saved" ? rows[index] : rows.find((row) => row.rowNo === index + 1);
}

/** The voucher's total in paise, or null while only the server can say (a GST bill, unchecked). */
export function voucherTotalPaise(draft: ExpenseDraft, answer: ExpenseAnswer | null, fresh: boolean): number | null {
  if (answer && fresh) {
    return paiseOfNumber(answer.payload.derived.total);
  }
  return draft.header.gstBill ? null : countedLinePaise(draft);
}

/**
 * What the first tender follows (Qt `balanceAutoTender`): the server's total
 * while its taxable value is still what the lines come to — it adds the tax —
 * and the typed amounts until it does, or Post would wait on a tender that
 * waits on the check.
 */
export function autoTenderTotalPaise(draft: ExpenseDraft, answer: ExpenseAnswer | null): number {
  const lines = countedLinePaise(draft);
  if (answer && paiseOfNumber(answer.payload.derived.taxable) === lines) {
    return paiseOfNumber(answer.payload.derived.total);
  }
  return lines;
}

export function buildExpenseView(input: ExpenseViewInput): ExpenseView {
  const { draft, answer, currentBodyKey, currentLinesKey, validateError, session, tenders } = input;
  // A loaded voucher's own figures stand until something is typed; a check
  // stands for exactly the body it answered (its lines' figures, for those lines).
  const fresh =
    answer !== null && (answer.kind === "saved" ? !draft.dirty : answer.bodyKey === currentBodyKey);
  const linesFresh =
    answer !== null && (answer.kind === "saved" ? !draft.dirty : answer.linesKey === currentLinesKey);
  const gst = draft.header.gstBill;
  const derived = answer?.payload.derived ?? null;
  const linesDerived = linesFresh ? derived : null;

  // ── the lines ──────────────────────────────────────────────────────────
  const lineCells = draft.lines.map((line, index) => {
    if (isEmptyLine(line)) {
      return { tax: "", total: "" };
    }
    const figure = answer && linesFresh ? lineFigure(answer, index) : undefined;
    if (figure) {
      const total = paiseOfNumber(figure.total);
      return {
        tax: gst ? paiseOrBlank(taxOf(figure)) : "",
        total: paiseOrBlank(total > 0 ? total : paiseOfText(line.amount)),
      };
    }
    // No GST bill: the total is the amount, exactly. With one: the server's.
    return gst ? { tax: PENDING, total: PENDING } : { tax: "", total: paiseOrBlank(paiseOfText(line.amount)) };
  });

  const linePaise = countedLinePaise(draft);
  const tenderPaise = countedTenderPaise(draft, tenders);
  const totalPaise = voucherTotalPaise(draft, answer, linesFresh);
  const hasLines = draft.lines.some((line) => !isEmptyLine(line));
  const itc = linesDerived ? itcPaise(linesDerived.lines) : null;

  let linesSummary = "";
  if (hasLines) {
    const total = totalPaise === null ? PENDING : formatPaise(totalPaise);
    if (gst) {
      const taxable = linesDerived ? paiseOfNumber(linesDerived.taxable) : linePaise;
      const tax = linesDerived ? formatPaise(taxOf(linesDerived.tax)) : PENDING;
      linesSummary =
        `Taxable ${formatPaise(taxable)} · GST ${tax} · ITC ${itc === null ? PENDING : formatPaise(itc)} · Total ${total}`;
    } else {
      linesSummary = `Total ${total}`;
    }
  }
  const tendersSummary = tenderPaise > 0 || hasLines ? `Tenders  ${formatPaise(tenderPaise)}` : "";

  // ── LINES − TENDERS ────────────────────────────────────────────────────
  let balance: ExpenseView["balance"];
  if (!hasLines && tenderPaise === 0) {
    balance = { text: "0.00", tone: "neutral" };
  } else if (totalPaise === null) {
    balance = { text: PENDING, tone: "pending" };
  } else {
    const diff = totalPaise - tenderPaise;
    balance = diff === 0 ? { text: "0.00  balanced", tone: "success" } : { text: formatPaise(diff), tone: "danger" };
  }

  // ── where each tender's money comes from ───────────────────────────────
  let safeName = derived?.safeName ?? "";
  if (!safeName && derived) {
    safeName = derived.tenders.find((row) => row.moneyFrom === "SAFE")?.ledgerName ?? "";
  }
  const tenderAccounts = draft.tenders.map((row, index) => {
    // Where a tender's money comes from follows the tender (and the till), not
    // its amount: the answer stands for a row while it names the same tender.
    const figure = answer && row.tenderId ? tenderFigure(answer, index) : undefined;
    if (figure && figure.tenderId === row.tenderId) {
      if (figure.moneyFrom === "DRAWER") return "drawer · this session";
      if (figure.moneyFrom === "SAFE") return `safe · ${safeName}`;
      return figure.ledgerName ?? "";
    }
    return tenders.find((option) => option.tenderId === row.tenderId)?.ledgerName ?? "";
  });

  const sessionNo = session?.sessionNo ? ` ${session.sessionNo}` : "";
  let moneyFrom: string;
  if (!derived) {
    moneyFrom = session
      ? `Till session${sessionNo} — cash comes out of this drawer.`
      : "Where the cash comes from shows once the voucher has a line and a tender.";
  } else if (derived.session || derived.tenders.some((row) => row.moneyFrom === "DRAWER")) {
    // A loaded voucher's GET names no session; its CASH rows say DRAWER instead.
    moneyFrom = `Till session${sessionNo} — cash comes out of this drawer; the voucher carries the session.`;
  } else if (safeName) {
    moneyFrom = `Back office — cash comes from the default safe ${safeName}.`;
  } else {
    moneyFrom = "No till here — each tender's money comes from its own ledger.";
  }

  // ── the tax note ───────────────────────────────────────────────────────
  let taxNote = DEFAULT_TAX_NOTE;
  if (gst && linesDerived?.supplyNature) {
    const credit = formatPaise(itc ?? 0);
    taxNote =
      linesDerived.supplyNature === "INTER"
        ? `Inter-state supply → IGST ${formatPaise(paiseOfNumber(linesDerived.tax.igst))}. ITC ${credit} goes to Input GST; the rest is cost.`
        : `Intra-state supply → CGST ${formatPaise(paiseOfNumber(linesDerived.tax.cgst))} + SGST ${formatPaise(paiseOfNumber(linesDerived.tax.sgst))}. ITC ${credit} goes to Input GST; the rest is cost.`;
  }

  // ── refusals, warnings, approval ───────────────────────────────────────
  const payload = answer?.payload ?? null;
  let refusals = payload ? payload.refusals.map((refusal) => `${refusal.code} — ${refusal.message}`) : [];
  if (validateError) {
    refusals = [validateError];
  }
  const warnings = payload
    ? payload.warnings.filter((warning) => warning.code !== APPROVAL_WARNING_CODE).map((warning) => warning.message)
    : [];
  const approval = payload?.approval
    ? {
        code: payload.approval.event,
        amount: formatPaise(paiseOfNumber(payload.approval.amount)),
        text:
          `total ${formatPaise(paiseOfNumber(payload.approval.amount))} is over ` +
          `${formatPaise(paiseOfNumber(payload.approval.threshold))} — needs a ${payload.approval.minRole} ` +
          `(${payload.approval.channel}). Reported only: the approval gate is till build phase 3, so the voucher posts.`,
      }
    : null;

  // ── POSTS ──────────────────────────────────────────────────────────────
  const legs = derived?.legs ?? [];
  const perColumn = Math.max(1, Math.floor((legs.length + 2) / 3));
  const columns: ExpenseView["legs"]["columns"] = [];
  let dr = 0;
  let cr = 0;
  legs.forEach((leg, index) => {
    const amount = paiseOfNumber(leg.amount);
    if (leg.drCr === "DR") dr += amount;
    else cr += amount;
    const column = Math.floor(index / perColumn);
    (columns[column] ??= []).push({
      side: leg.drCr === "DR" ? "Dr" : "Cr",
      name: leg.ledgerName ?? "",
      amount: formatPaise(amount),
    });
  });
  const balanced = dr === cr;
  const legBalance =
    legs.length === 0 ? "" : `Dr ${formatPaise(dr)} ${balanced ? "=" : "≠"} Cr ${formatPaise(cr)}`;

  return {
    fresh,
    linesFresh,
    lineCells,
    linesSummary,
    tendersSummary,
    balance,
    tenderAccounts,
    moneyFrom,
    taxNote,
    refusals,
    warnings,
    approval,
    legs: { columns, balance: legBalance, balanced },
  };
}
