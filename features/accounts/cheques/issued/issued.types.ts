/**
 * Issued Cheques (menu 52) and Cheque Books (menu 263) — the wire contract.
 *
 * The same table as Received Cheques (`acc_pdc_register`, `apd_tra_type =
 * 'P'`), but its own server module (`/issued-cheques`) with its own verbs,
 * keys and shapes — which is why this side has types of its own rather than
 * a second vocabulary over the received ones:
 *
 *  - a row is addressed by BARE keys — `apdId · apdAccYear · companyId ·
 *    branchId` — where `/cheques/*` spells the last two `apdCompanyId` /
 *    `apdBranchId`. The DTOs are whitelisted, so the wrong spelling is a 400;
 *  - `/get` answers one flat `IssuedChequePayload`, not the received
 *    `{cheque, vouchers, bills}`;
 *  - history arrives OLDEST first, and its `changedBy` may be null;
 *  - every POST answers 200 (the received routes answer 201).
 *
 * The statuses are the received ones less DEPOSITED and RETURNED, which a 'P'
 * row never takes.
 */

/** `ck_apd_status`, as a 'P' row uses it. Unknown words are kept as they arrive. */
export type IssuedStatus = "HELD" | "CLEARED" | "BOUNCED" | "CANCELLED" | "REPLACED" | (string & {});

/** Grid 121's computed `state`: HELD split by the cheque date; anything else is the status. */
export type IssuedState = "OUTSTANDING" | "POST-DATED" | IssuedStatus;

/** How every `/issued-cheques` route names a row — the ROW's keys, never the session's. */
export type IssuedChequeKeys = {
  apdId: string;
  apdAccYear: string;
  companyId: string;
  branchId: string;
};

/** The scope the screen was OPENED in. It decides which register is read, nothing else. */
export type IssuedScope = {
  companyId: string;
  branchId: string;
  accYear: string;
};

/** One register row, parsed out of grid 121 (see `domain/row.ts`). */
export type IssuedChequeRow = {
  // ── the key ──
  apdId: string;
  /** The year the cheque was ISSUED — the payment's year, and the partition key. */
  accYear: string;
  companyId: string;
  branchId: string;
  // ── the paper ──
  leaf: string;
  chequeDate: string | null;
  issuedOn: string | null;
  partyId: string;
  partyName: string;
  favouring: string;
  amount: number;
  bankLedgerId: string;
  bankName: string;
  bookNo: string;
  acPayee: boolean;
  // ── where it is ──
  status: IssuedStatus;
  state: IssuedState;
  presentedOn: string | null;
  returnedOn: string | null;
  cancelReason: string;
  // ── what it links to ──
  voucherRefno: string;
  typeCode: string;
  printCount: number;
};

/** `GET /issued-cheques/get` (and the answer of presented / returned / stop / void). */
export type IssuedChequePayload = {
  apdId: string;
  apdAccYear: string;
  companyId: string;
  branchId: string;
  leaf: string;
  chequeDate: string;
  issuedOn: string;
  amount: number;
  partyId: string;
  partyName: string;
  favouring: string | null;
  acPayee: boolean;
  bankLedgerId: string | null;
  bankName: string | null;
  chequeBookId: string | null;
  bookNo: string | null;
  status: IssuedStatus;
  isPostDated: boolean;
  statusOn: string | null;
  presentedOn: string | null;
  returnedOn: string | null;
  returnReason: string | null;
  charges: number | null;
  cancelledOn: string | null;
  /** `STOPPED: …` / `VOIDED: …` / `REPLACED: …` — the only way to tell a stop from a void. */
  cancelReason: string | null;
  /** The voucher carrying the cheque's legs — a post-dated cheque's own voucher. */
  voucherId: string | null;
  voucherAccYear: string | null;
  voucherRefno: string | null;
  voucherDate: string | null;
  /** `Pmt` (Bill-wise Payment, menu 100) or `PmtV` (Payment Voucher, menu 261). */
  typeCode: string | null;
  /** The parent payment — `avh_against_voucher_id ?? apd_voucher_id`. No year comes with it. */
  paymentVoucherId: string | null;
  /** The ChqBnc that took this cheque's line back out. Replace needs one. */
  reversalVoucherId: string | null;
  reversalAccYear: string | null;
  reversalRefno: string | null;
  replacedById: string | null;
  replacedByAccYear: string | null;
  replacedByLeaf: string | null;
  replacesId: string | null;
  printCount: number;
  printedOn: string | null;
  remarks: string | null;
  createdBy: string | null;
};

export type IssuedHistoryEntry = {
  seqNo: number;
  event: string;
  fromStatus: string | null;
  toStatus: string | null;
  changedOn: string;
  changedBy: string | null;
  remarks: string | null;
};

/** `GET /issued-cheques/history`. Entries OLDEST first. */
export type IssuedChequeHistory = {
  apdId: string;
  apdAccYear: string;
  leaf: string;
  issuedOn: string | null;
  issuedBy: string | null;
  voucherRefno: string | null;
  entries: IssuedHistoryEntry[];
};

/** `POST /issued-cheques/replace` → `data`. */
export type ReplacedChequePayload = {
  replaced: IssuedChequePayload;
  replacement: IssuedChequePayload;
};

/** What an action answers, as far as the screen reads it. */
export type IssuedActionResult = {
  message: string;
  data: Partial<IssuedChequePayload> & Partial<ReplacedChequePayload> & Record<string, unknown>;
};

// ─── Cheque books ────────────────────────────────────────────────────────────

export type ChequeBookStatus = "ACTIVE" | "FINISHED" | "CLOSED" | (string & {});

/** One row of grid 120, "MAIN LIST - CHEQUE BOOKS". */
export type ChequeBookListRow = {
  chequeBookId: string;
  bankName: string;
  bookNo: string;
  leafFrom: string;
  leafTo: string;
  /** Null once the book is finished. */
  nextLeaf: string | null;
  leavesLeft: number;
  status: ChequeBookStatus;
  remarks: string;
};

export type ChequeBookLeaf = {
  leaf: string;
  apdId: string;
  apdAccYear: string;
  partyName: string | null;
  amount: number;
  status: IssuedStatus;
  voucherRefno: string | null;
};

/** `/cheque-books/get`, `/create`, `/close` → `data`. */
export type ChequeBookPayload = {
  chequeBookId: string;
  companyId: string;
  /** Null = every branch (the user's rule: blank is shared). */
  branchId: string | null;
  bankLedgerId: string;
  bankName: string;
  bookNo: string;
  leafFrom: string;
  leafTo: string;
  nextLeaf: string | null;
  left: number;
  used: number;
  leafWidth: number;
  format: string | null;
  remarks: string | null;
  status: ChequeBookStatus;
  closedOn: string | null;
  closeReason: string | null;
  leaves: ChequeBookLeaf[];
};

/** `POST /cheque-books/create` — an upsert: no id opens a book, an id edits it. */
export type SaveChequeBookBody = {
  chequeBookId?: string;
  companyId: string;
  /** null = every branch. */
  branchId: string | null;
  bankLedgerId: string;
  bookNo: string;
  leafFrom: number;
  leafTo: number;
  leafWidth: number;
  format: string | null;
  remarks: string | null;
};

export type CloseChequeBookBody = {
  companyId: string;
  chequeBookId: string;
  reason: string;
};
