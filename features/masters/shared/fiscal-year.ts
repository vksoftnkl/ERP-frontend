/**
 * The Indian financial year as the Company master seeds it (notes 72 A1).
 *
 * A year is always 1 April – 31 March; on create the server derives the
 * company's first `fiscal_years` row from the three dates and answers 400
 * when they disagree with that. These helpers compute the running year for a
 * new company and run the same three checks the Qt form runs (`company_entry
 * .cpp`, `extraValidate`) before the request leaves the browser.
 *
 * Dates are the form's `YYYY-MM-DD` strings throughout, compared as text —
 * no Date arithmetic, no time zones.
 */

export type IsoDate = string;

export type FiscalYearRange = {
  /** 1 April. */
  from: IsoDate;
  /** The 31 March after it. */
  to: IsoDate;
};

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { year, month, day };
}

/** `dd-MM-yyyy`, the Qt message's spelling; the input when it is not a date. */
export function formatIsoDateDmy(value: IsoDate): string {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return value;
  }
  return `${pad2(parsed.day)}-${pad2(parsed.month)}-${parsed.year}`;
}

/** The year running on `today`: 1 April of this year when April has come, else of last year. */
export function currentIndianFiscalYear(today: Date = new Date()): FiscalYearRange {
  const startYear = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

/** `from` + one year − one day, or null when `from` is not a date. */
export function fiscalYearEndFor(from: IsoDate): IsoDate | null {
  const parsed = parseIsoDate(from);
  if (!parsed) {
    return null;
  }
  // Day arithmetic on a UTC timestamp: no DST, no local offsets.
  const end = new Date(Date.UTC(parsed.year + 1, parsed.month - 1, parsed.day));
  end.setUTCDate(end.getUTCDate() - 1);
  return `${end.getUTCFullYear()}-${pad2(end.getUTCMonth() + 1)}-${pad2(end.getUTCDate())}`;
}

export type FiscalYearFieldKey = "from" | "to" | "books";

export type FiscalYearFieldError = {
  field: FiscalYearFieldKey;
  message: string;
};

export const FISCAL_YEAR_FROM_MESSAGE = "Financial Year From must be 1 April.";
export const BOOKS_BEGIN_MESSAGE = "Books Begin From must fall inside the financial year.";

export function fiscalYearToMessage(from: IsoDate): string {
  const end = fiscalYearEndFor(from);
  return `Financial Year To must be ${end ? formatIsoDateDmy(end) : "the 31 March after Financial Year From"}.`;
}

/**
 * The Qt form's three checks, first failure wins:
 *  1. From is a 1 April;
 *  2. To is From + 1 year − 1 day;
 *  3. Books Begin From lies inside [From, To].
 * Blank dates are not checked (the server fills them from today).
 */
export function validateFiscalYearFields(dates: {
  from: string;
  to: string;
  books: string;
}): FiscalYearFieldError | null {
  const from = parseIsoDate(dates.from);
  const to = parseIsoDate(dates.to);
  const books = parseIsoDate(dates.books);
  if (from && (from.day !== 1 || from.month !== 4)) {
    return { field: "from", message: FISCAL_YEAR_FROM_MESSAGE };
  }
  if (from && to && dates.to.trim() !== fiscalYearEndFor(dates.from.trim())) {
    return { field: "to", message: fiscalYearToMessage(dates.from.trim()) };
  }
  if (books && from && to) {
    const booksText = dates.books.trim();
    if (booksText < dates.from.trim() || booksText > dates.to.trim()) {
      return { field: "books", message: BOOKS_BEGIN_MESSAGE };
    }
  }
  return null;
}
