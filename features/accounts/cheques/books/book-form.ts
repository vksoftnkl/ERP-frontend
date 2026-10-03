/**
 * The cheque-book form — what may be keyed, what is refused, and the body.
 *
 * `/cheque-books/create` is an UPSERT: no id opens a book, an id edits it.
 * Three things the Qt dialog got wrong are kept right here:
 *
 *  - **The branch is the book's own.** Qt sent the session branch on every
 *    save, so editing a book kept for every branch pinned it to one. A blank
 *    branch means every branch (the house rule for a master row), and an edit
 *    sends back whatever the book had.
 *  - **The format survives an edit.** Qt never sent `format`, so every save
 *    nulled it. It is carried through untouched.
 *  - **The reason and the book number must say something.** The server trims
 *    them but accepts an empty string.
 *
 * Once a leaf has been handed out, the bank and the first leaf are on paper:
 * the server refuses to move them, and the form does not offer to.
 */
import type { ChequeBookPayload, SaveChequeBookBody } from "../issued/issued.types";

export type BookForm = {
  chequeBookId: string | null;
  bankLedgerId: string;
  bankName: string;
  bookNo: string;
  leafFrom: string;
  leafTo: string;
  /** True = kept for every branch (`branchId: null`). */
  everyBranch: boolean;
  /** The branch an existing book belongs to — sent back as it was. */
  branchId: string | null;
  /** Carried through, never shown: Qt's save nulled it. */
  format: string | null;
  remarks: string;
};

export function blankBookForm(bank?: { id: string; name: string }): BookForm {
  return {
    chequeBookId: null,
    bankLedgerId: bank?.id ?? "",
    bankName: bank?.name ?? "",
    bookNo: "",
    leafFrom: "",
    leafTo: "",
    everyBranch: false,
    branchId: null,
    format: null,
    remarks: "",
  };
}

export function bookFormOf(book: ChequeBookPayload): BookForm {
  return {
    chequeBookId: book.chequeBookId,
    bankLedgerId: book.bankLedgerId,
    bankName: book.bankName,
    bookNo: book.bookNo,
    leafFrom: book.leafFrom,
    leafTo: book.leafTo,
    everyBranch: book.branchId === null,
    branchId: book.branchId,
    format: book.format,
    remarks: book.remarks ?? "",
  };
}

const LEAF = /^\d{1,12}$/;

export function validateBookForm(form: BookForm): string | null {
  if (!form.bankLedgerId) {
    return "Choose the bank account.";
  }
  if (!form.bookNo.trim()) {
    return "Enter the book number.";
  }
  if (form.bookNo.trim().length > 30) {
    return "The book number is longer than 30 characters.";
  }
  const from = form.leafFrom.trim();
  const to = form.leafTo.trim();
  if (!from || !to) {
    return "Enter the first and last leaf.";
  }
  if (!LEAF.test(from) || !LEAF.test(to)) {
    return "A leaf number is digits only — up to 12 of them.";
  }
  if (Number(from) < 1) {
    return "The first leaf must be 1 or more.";
  }
  if (Number(to) < Number(from)) {
    return "The last leaf is before the first.";
  }
  if (form.remarks.trim().length > 250) {
    return "The remarks are longer than 250 characters.";
  }
  return null;
}

/**
 * The body. `leafWidth` is the longer of the two typed numbers, so `000451`
 * keeps its zeros on every cheque printed from the book.
 */
export function buildBookBody(form: BookForm, scope: { companyId: string; branchId: string }): SaveChequeBookBody {
  const from = form.leafFrom.trim();
  const to = form.leafTo.trim();
  const branchId = form.everyBranch
    ? null
    : form.chequeBookId
      ? (form.branchId ?? scope.branchId)
      : scope.branchId;
  return {
    ...(form.chequeBookId ? { chequeBookId: form.chequeBookId } : {}),
    companyId: scope.companyId,
    branchId: branchId || null,
    bankLedgerId: form.bankLedgerId,
    bookNo: form.bookNo.trim(),
    leafFrom: Number(from),
    leafTo: Number(to),
    leafWidth: Math.min(12, Math.max(from.length, to.length, 1)),
    format: form.format,
    remarks: form.remarks.trim() || null,
  };
}

/** "ACTIVE · 26 used · 24 left · next 000477". */
export function bookFigures(book: ChequeBookPayload): string {
  const parts = [`${book.status}`, `${book.used} used`, `${book.left} left`];
  if (book.nextLeaf) {
    parts.push(`next ${book.nextLeaf}`);
  }
  if (String(book.status).toUpperCase() === "CLOSED") {
    parts.push(
      `closed${book.closedOn ? ` ${book.closedOn.slice(0, 10).split("-").reverse().join("-")}` : ""}` +
        (book.closeReason ? ` — ${book.closeReason}` : ""),
    );
  }
  return parts.join(" · ");
}

export const CLOSE_BOOK_REASONS: readonly string[] = [
  "Book lost",
  "Account closed",
  "Replaced by a new book",
  "Damaged",
];
