/**
 * The instrument on a party line of a Receipt / Payment Voucher — the Qt
 * `LineInstrument` and its dialog's rules.
 *
 * One line, one instrument: the line's amount is what the instrument moves,
 * and the server GENERATES its money leg (a receipt's Dr to the tender's
 * ledger, a payment's Cr to our bank). So a line with an instrument balances
 * itself, and the operator never types the cash or bank side for it.
 *
 * Two sides, two different cheques:
 *
 *  - **Receiving** (`RcpV`): somebody else's cheque. Its number, the date on
 *    it and the drawee bank are required; the drawer, branch and IFSC are
 *    kept on the cheque register. No bank of ours is asked for — that is
 *    chosen at Deposit (menu 51).
 *  - **Paying** (`PmtV`): OUR cheque. The bank account and a book on it are
 *    picked; the number is the book's next leaf, taken at Post under a lock,
 *    so no number is ever sent. Favouring defaults to the party, crossed
 *    account-payee unless said otherwise. A UPI / bank transfer names the
 *    bank account and, when the tender wants one, its UTR.
 *
 * A cheque dated after the voucher is post-dated: its line posts as a voucher
 * of its own on that date — the server works that out and says so.
 */
import type {
  DerivedInstrument,
  InstrumentBody,
  InstrumentTenderRow,
  StoredDraft,
  VoucherChequeBook,
  VoucherInstrumentPayload,
} from "../vouchers.types";

export type LineInstrument = {
  tenderId: string;
  tenderName: string;
  /** CASH · UPI · CHEQUE · BANK … — the chip on the cell. */
  typeName: string;
  isCheque: boolean;
  /** A receipt cheque's number, a UTR. Never sent on a payment cheque. */
  refNo: string;
  /** yyyy-mm-dd, or "". */
  instrumentDate: string;
  /** A receipt cheque's drawee bank; on a payment, our bank ledger's name (shown, not sent). */
  bankName: string;
  drawerName: string;
  bankBranch: string;
  ifsc: string;
  micr: string;
  /** A payment: the bank account the money leaves. */
  bankLedgerId: string;
  chequeBookId: string;
  bookNo: string;
  favouring: string;
  /** null = not said (the server crosses it). */
  acPayee: boolean | null;
  // ── the server's answer, never worked out here ──
  /** /validate: the leaf it WOULD take — shown, not promised. */
  nextLeaf: string;
  /** /get: the leaf the post took. */
  leaf: string;
  isPostDated: boolean;
  postsOn: string;
  /** /get: the cheque register's state (HELD, DEPOSITED, BOUNCED…). */
  pdcStatus: string;
  /** /get: the post-dated cheque's own voucher number. */
  voucherRefno: string;
};

export function emptyInstrument(): LineInstrument {
  return {
    tenderId: "",
    tenderName: "",
    typeName: "",
    isCheque: false,
    refNo: "",
    instrumentDate: "",
    bankName: "",
    drawerName: "",
    bankBranch: "",
    ifsc: "",
    micr: "",
    bankLedgerId: "",
    chequeBookId: "",
    bookNo: "",
    favouring: "",
    acPayee: null,
    nextLeaf: "",
    leaf: "",
    isPostDated: false,
    postsOn: "",
    pdcStatus: "",
    voucherRefno: "",
  };
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const day = (value: unknown): string => text(value).slice(0, 10);

/** OUR cheque: a cheque drawn on a bank ledger of ours. */
export function isPaymentCheque(ins: LineInstrument): boolean {
  return ins.isCheque && Boolean(ins.bankLedgerId);
}

/**
 * The wire shape — what the dialog filled, trimmed, empties dropped. The
 * drawee bank goes only where no bank ledger of ours is named, and the
 * cheque's own details only on a received cheque.
 */
export function instrumentBody(ins: LineInstrument): InstrumentBody {
  const out: InstrumentBody = { tenderId: ins.tenderId };
  const put = (key: "refNo" | "instrumentDate" | "bankLedgerId" | "chequeBookId" | "favouring", value: string) => {
    if (value.trim()) {
      out[key] = value.trim();
    }
  };
  put("refNo", ins.refNo);
  put("instrumentDate", ins.instrumentDate);
  if (!ins.bankLedgerId && ins.bankName.trim()) {
    out.bankName = ins.bankName.trim();
  }
  put("bankLedgerId", ins.bankLedgerId);
  put("chequeBookId", ins.chequeBookId);
  put("favouring", ins.favouring);
  if (ins.acPayee !== null) {
    out.acPayee = ins.acPayee;
  }
  if (ins.isCheque && !ins.bankLedgerId) {
    const cheque: NonNullable<InstrumentBody["cheque"]> = {};
    if (ins.drawerName.trim()) cheque.drawerName = ins.drawerName.trim();
    if (ins.bankBranch.trim()) cheque.bankBranch = ins.bankBranch.trim();
    if (ins.ifsc.trim()) cheque.ifsc = ins.ifsc.trim().toUpperCase();
    if (ins.micr.trim()) cheque.micr = ins.micr.trim();
    if (Object.keys(cheque).length > 0) {
      out.cheque = cheque;
    }
  }
  return out;
}

function dayMonth(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}-${match[2]}` : "";
}

/** What the Instrument cell reads, beside its chip. */
export function instrumentSummary(ins: LineInstrument): string {
  const parts: string[] = [];
  if (isPaymentCheque(ins)) {
    if (ins.bankName) parts.push(ins.bankName);
    parts.push(`book ${ins.bookNo}`);
    if (ins.leaf) parts.push(`leaf ${ins.leaf}`);
    else if (ins.nextLeaf) parts.push(`leaf ${ins.nextLeaf} (next)`);
    if (dayMonth(ins.instrumentDate)) parts.push(dayMonth(ins.instrumentDate));
    return parts.join(" · ");
  }
  if (ins.refNo) parts.push(ins.refNo);
  if (dayMonth(ins.instrumentDate)) parts.push(dayMonth(ins.instrumentDate));
  if (ins.bankName) parts.push(ins.bankName);
  return parts.join(" · ");
}

/** The chip: the tender's type — looked up when a reopened draft has the id only. */
export function instrumentChip(ins: LineInstrument, tenders: readonly InstrumentTenderRow[]): string {
  const own = ins.typeName || ins.tenderName;
  if (own) {
    return own;
  }
  return tenders.find((tender) => tender.tenderId === ins.tenderId)?.typeName ?? "…";
}

/** A draft's stored instrument — the payload shape, ids only. */
export function instrumentFromDraft(
  raw: NonNullable<NonNullable<StoredDraft["lines"]>[number]["instrument"]>,
): LineInstrument {
  return {
    ...emptyInstrument(),
    tenderId: text(raw.tenderId),
    refNo: text(raw.refNo),
    instrumentDate: day(raw.instrumentDate),
    bankName: text(raw.bankName),
    drawerName: text(raw.cheque?.drawerName),
    bankBranch: text(raw.cheque?.bankBranch),
    ifsc: text(raw.cheque?.ifsc),
    micr: text(raw.cheque?.micr),
    bankLedgerId: text(raw.bankLedgerId),
    chequeBookId: text(raw.chequeBookId),
    favouring: text(raw.favouring),
    acPayee: typeof raw.acPayee === "boolean" ? raw.acPayee : null,
  };
}

/**
 * The server's answer on an instrument the operator keyed: its names, the
 * leaf it would take, whether it is post-dated. The operator's own fields
 * (number, date, bank) stay as keyed. The same object comes back when nothing
 * changed, so nothing re-renders.
 */
export function adoptDerivedInstrument(ins: LineInstrument, derived: DerivedInstrument, postDated: boolean, postsOn: string | null): LineInstrument {
  const next: LineInstrument = {
    ...ins,
    tenderName: derived.tenderName || ins.tenderName,
    typeName: derived.tenderTypeName || ins.typeName,
    isCheque: derived.isCheque,
    isPostDated: postDated || derived.isPostDated,
    nextLeaf: derived.nextLeaf || ins.nextLeaf,
    bookNo: derived.bookNo || ins.bookNo,
    bankName: ins.bankLedgerId && derived.bankName ? derived.bankName : ins.bankName,
    postsOn: day(postsOn) || day(derived.postsOn),
  };
  const same = (Object.keys(next) as (keyof LineInstrument)[]).every((key) => next[key] === ins[key]);
  return same ? ins : next;
}

/** A posted voucher's instrument, as `/get` reads it back. */
export function instrumentFromPayload(payload: VoucherInstrumentPayload): LineInstrument {
  return {
    ...emptyInstrument(),
    tenderId: payload.tenderId,
    tenderName: payload.tenderName ?? "",
    typeName: payload.tenderTypeName ?? "",
    isCheque: payload.isCheque,
    refNo: payload.issued && payload.isCheque ? "" : (payload.refNo ?? ""),
    instrumentDate: day(payload.instrumentDate),
    bankName: payload.bankName ?? "",
    drawerName: payload.cheque?.drawerName ?? "",
    bankBranch: payload.cheque?.bankBranch ?? "",
    ifsc: payload.cheque?.ifsc ?? "",
    micr: payload.cheque?.micr ?? "",
    bankLedgerId: payload.issued ? (payload.bankLedgerId ?? "") : "",
    chequeBookId: payload.chequeBookId ?? "",
    bookNo: payload.bookNo ?? "",
    favouring: payload.favouring ?? "",
    acPayee: payload.acPayee,
    leaf: payload.leaf ?? "",
    isPostDated: payload.isPostDated,
    postsOn: payload.isPostDated ? day(payload.voucherDate) : "",
    pdcStatus: payload.pdcStatus ?? "",
    voucherRefno: payload.isPostDated ? (payload.voucherRefno ?? "") : "",
  };
}

// ─── The dialog ─────────────────────────────────────────────────────────────

/** What the dialog shows for this tender, on this side (Qt `applyTender`). */
export function instrumentFields(tender: InstrumentTenderRow | null, paying: boolean) {
  const cheque = Boolean(tender?.isCheque);
  const transfer = Boolean(tender && !tender.isCash && !tender.isCheque);
  return {
    cheque,
    transfer,
    /** Paying: our bank account, on anything but cash. */
    bankAccount: paying && (cheque || transfer),
    /** Paying a cheque: its book, the leaf it would take, favouring, crossing. */
    book: paying && cheque,
    /** A receipt cheque's number or a tender's reference; a payment transfer's UTR. */
    reference: (!paying && (cheque || Boolean(tender?.needsRef))) || (paying && transfer),
    referenceCaption: cheque ? "Cheque no *" : "Reference / UTR",
    date: cheque || Boolean(tender?.needsRef),
    dateCaption: cheque ? "Cheque date *" : "Date",
    /** Receiving a cheque: the drawee bank, branch, drawer, IFSC. */
    receivedCheque: !paying && cheque,
  };
}

/**
 * The bank accounts a payment can be drawn on: every bank that has an open
 * book, then the transfer tenders' own ledgers (a transfer needs no book).
 * Distinct, in the order met. A cheque tender's ledger is a holding ledger
 * for cheques RECEIVED (Cheques In Hand) — never a bank we pay from, and the
 * server refuses it — so it is not offered (the Qt list did offer it).
 */
export function payingBanks(
  books: readonly VoucherChequeBook[],
  tenders: readonly InstrumentTenderRow[],
): Array<{ ledgerId: string; name: string }> {
  const seen = new Set<string>();
  const out: Array<{ ledgerId: string; name: string }> = [];
  for (const book of books) {
    if (!seen.has(book.bankLedgerId)) {
      seen.add(book.bankLedgerId);
      out.push({ ledgerId: book.bankLedgerId, name: book.bankName });
    }
  }
  for (const tender of tenders) {
    if (!tender.isCash && !tender.isCheque && tender.ledgerId && !seen.has(tender.ledgerId)) {
      seen.add(tender.ledgerId);
      out.push({ ledgerId: tender.ledgerId, name: tender.ledgerName });
    }
  }
  return out;
}

/** "Book 004 · 000101–000150 · 37 left" */
export function bookLabel(book: VoucherChequeBook): string {
  return `Book ${book.bookNo} · ${book.leafFrom}–${book.leafTo} · ${book.left} left`;
}

export type InstrumentForm = {
  tenderId: string;
  refNo: string;
  instrumentDate: string;
  draweeBank: string;
  bankBranch: string;
  drawerName: string;
  ifsc: string;
  bankLedgerId: string;
  chequeBookId: string;
  favouring: string;
  acPayee: boolean;
};

export function formOf(ins: LineInstrument | null, voucherDate: string, partyName: string, tenders: readonly InstrumentTenderRow[]): InstrumentForm {
  return {
    tenderId: ins?.tenderId || tenders[0]?.tenderId || "",
    refNo: ins?.refNo ?? "",
    instrumentDate: ins?.instrumentDate || voucherDate,
    draweeBank: ins && !ins.bankLedgerId ? ins.bankName : "",
    bankBranch: ins?.bankBranch ?? "",
    drawerName: ins?.drawerName ?? "",
    ifsc: ins?.ifsc ?? "",
    bankLedgerId: ins?.bankLedgerId ?? "",
    chequeBookId: ins?.chequeBookId ?? "",
    favouring: ins?.favouring || partyName,
    // On unless said off.
    acPayee: ins?.acPayee !== false,
  };
}

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * OK on the dialog (Qt `accept`): the instrument, or the reason it is not
 * one yet — said in the dialog, which has the fields, rather than by the
 * server's refusal after it.
 */
export function acceptInstrument(
  form: InstrumentForm,
  context: {
    paying: boolean;
    tenders: readonly InstrumentTenderRow[];
    books: readonly VoucherChequeBook[];
    banks: ReadonlyArray<{ ledgerId: string; name: string }>;
  },
): { instrument: LineInstrument } | { error: string } {
  const tender = context.tenders.find((candidate) => candidate.tenderId === form.tenderId) ?? null;
  if (!tender) {
    return { error: "Pick an instrument." };
  }
  const fields = instrumentFields(tender, context.paying);
  const out: LineInstrument = {
    ...emptyInstrument(),
    tenderId: tender.tenderId,
    tenderName: tender.name,
    typeName: tender.typeName,
    isCheque: tender.isCheque,
  };

  if (context.paying) {
    if (fields.bankAccount && !form.bankLedgerId) {
      return { error: "Pick the bank account it is paid from." };
    }
    const book = context.books.find(
      (candidate) => candidate.chequeBookId === form.chequeBookId && candidate.bankLedgerId === form.bankLedgerId,
    );
    if (fields.cheque && !book) {
      return { error: "This bank has no open cheque book — open one in Issued Cheques (52)." };
    }
    if (fields.cheque && !form.instrumentDate) {
      return { error: "A cheque needs its date." };
    }
    if (fields.bankAccount) {
      out.bankLedgerId = form.bankLedgerId;
      out.bankName = context.banks.find((bank) => bank.ledgerId === form.bankLedgerId)?.name ?? "";
    }
    if (fields.cheque && book) {
      out.chequeBookId = book.chequeBookId;
      out.bookNo = book.bookNo;
      out.nextLeaf = book.nextLeaf;
      out.instrumentDate = form.instrumentDate;
      out.favouring = form.favouring.trim();
      out.acPayee = form.acPayee;
    }
    if (fields.transfer) {
      out.refNo = form.refNo.trim();
      if (fields.date && form.instrumentDate) {
        out.instrumentDate = form.instrumentDate;
      }
    }
    return { instrument: out };
  }

  if (fields.cheque && (!form.refNo.trim() || !form.instrumentDate || !form.draweeBank.trim())) {
    return { error: "A cheque needs its number, date and drawee bank." };
  }
  if (fields.receivedCheque && form.ifsc.trim() && !IFSC.test(form.ifsc.trim().toUpperCase())) {
    // The server's DTO 400s the whole voucher on a malformed IFSC.
    return { error: "The IFSC is 11 characters: four letters, a 0, then six letters or digits." };
  }
  if (fields.cheque || tender.needsRef) {
    out.refNo = form.refNo.trim();
    out.instrumentDate = form.instrumentDate;
  }
  if (fields.cheque) {
    out.bankName = form.draweeBank.trim();
    out.bankBranch = form.bankBranch.trim();
    out.drawerName = form.drawerName.trim();
    out.ifsc = form.ifsc.trim().toUpperCase();
  }
  return { instrument: out };
}

/** A cheque dated after the voucher posts later, on its own voucher. */
export function isPostDatedCheque(tender: InstrumentTenderRow | null, chequeDate: string, voucherDate: string): boolean {
  return Boolean(tender?.isCheque && chequeDate && voucherDate && chequeDate > voucherDate);
}
