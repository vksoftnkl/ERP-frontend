/**
 * Books = drawers / safe — Qt `TillBusinessDayEntry::fetchBooks` and its two
 * checklist rows (NexERP 425fa80, notes 126; user 2026-10-16: "the Day Book
 * by tender, to find missing transactions"): what the BOOKS say against what
 * the till says, right now. Neither row ever blocks the close; an amber one
 * is counted in the verdict as any other amber.
 *
 *   Books = drawers  the CASH tender's ledger (Cash In Hand — named by the
 *                    tender master, `/vouchers/instruments`, never a guess) as
 *                    on today (`/vouchers/ledger-balance`, CR read as a
 *                    minus) against the cash every live drawer should hold
 *                    (`../../shared/live-cash.ts`, any date): a cash line
 *                    posted around the till shows here. Today's day only —
 *                    the books are read as of now.
 *   Books = safe     each safe's ledger against its safe book: the server's
 *                    own `bookBalance`, `expected` and `drift`
 *                    (`/till/safes/balance`), on any day shown, as Qt.
 *
 * Money in paise (`decimal.ts`): a gap under half a paisa is no gap (Qt
 * `qAbs(gap) < 0.005`), which is what rounding to the paisa leaves as zero.
 */
import { liveTotalPaise, type LiveSession } from "../../shared/live-cash";
import { cashOfficeHref, type Check } from "./day-reading";
import { formatMoney, toPaise } from "./decimal";
import { isoDateOfLocal, text, type TillDay } from "./wire";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** The envelope's `data`, or the value itself when it is already the payload. */
function payloadOf(raw: unknown): unknown {
  if (isRecord(raw) && "data" in raw && (raw.success === true || raw.success === undefined)) return raw.data;
  return raw;
}

/** The CASH tender's ledger, as the tender master names it. */
export type CashTender = { ledgerId: string; ledgerName: string };

/** The CASH tender's ledger as on today: its name, and its balance in paise (CR a minus). */
export type CashBooks = { ledgerName: string; paise: bigint };

/** One safe of `/till/safes/balance`; the figures are null under a blind count without the override. */
export type SafeBook = { name: string; bookBalance: bigint | null; expected: bigint | null; drift: bigint | null };

/**
 * `/vouchers/instruments` → the first tender that is cash and names a
 * ledger (Qt reads them in the server's order); null when none does.
 */
export function cashTenderOf(raw: unknown): CashTender | null {
  const data = payloadOf(raw);
  const tenders = isRecord(data) && Array.isArray(data.tenders) ? data.tenders.filter(isRecord) : [];
  for (const tender of tenders) {
    const ledgerId = text(tender.ledgerId).trim();
    if (tender.isCash === true && ledgerId) return { ledgerId, ledgerName: text(tender.ledgerName).trim() };
  }
  return null;
}

/** `/vouchers/ledger-balance` → the balance in paise, a CR balance as a minus; null when it is not one. */
export function cashBooksOf(ledgerName: string, raw: unknown): CashBooks | null {
  const data = payloadOf(raw);
  if (!isRecord(data)) return null;
  const amount = toPaise(data.amount);
  if (amount === null) return null;
  return { ledgerName, paise: text(data.side).trim().toUpperCase() === "CR" ? -amount : amount };
}

/** `/till/safes/balance` → `safes[]`, each with its name and the three figures this check reads. */
export function safeBooksOf(raw: unknown): SafeBook[] {
  const data = payloadOf(raw);
  const safes = isRecord(data) && Array.isArray(data.safes) ? data.safes.filter(isRecord) : [];
  return safes.map((safe) => ({
    name: text(safe.name).trim() || text(safe.code).trim(),
    bookBalance: toPaise(safe.bookBalance),
    expected: toPaise(safe.expected),
    drift: toPaise(safe.drift),
  }));
}

/**
 * The day shown is today's (Qt compares the calendar date, cut-off or not);
 * a day without a date counts as today, as Qt counts it.
 */
export function isTodaysDay(day: TillDay, now: Date): boolean {
  return !day.tbdBusinessDate || day.tbdBusinessDate.slice(0, 10) === isoDateOfLocal(now);
}

const DRAWERS = "Books = drawers";
const SAFE = "Books = safe";
const ZERO = BigInt(0);

export type BooksInput = {
  /** The day shown; no day, no rows. */
  day: TillDay | null;
  now: Date;
  /** The CASH tender's ledger as on today; null until read (or when no tender names one). */
  cash: CashBooks | null;
  /** Every live drawer of the branch and its cash; null until the live read has answered. */
  live: readonly LiveSession[] | null;
  /** The branch's safes; null until read. */
  safes: readonly SafeBook[] | null;
};

/** Books = drawers: null while either side is unread (Qt adds no row then). */
function drawersCheck({ day, now, cash, live }: BooksInput): Check | null {
  if (!day) return null;
  if (!isTodaysDay(day, now)) {
    return { tone: "grey", title: DRAWERS, detail: "Checked on today's day only (the books are read as of now)" };
  }
  if (!cash || live === null) return null;
  const name = cash.ledgerName || "Cash ledger";
  const books = formatMoney(cash.paise);
  if (live.some((session) => session.cashPaise === null)) {
    return {
      tone: "grey",
      title: DRAWERS,
      detail: `${name} ${books} — a drawer's cash is hidden (needs the Till Sessions override)`,
    };
  }
  const drawers = BigInt(liveTotalPaise(live));
  const gap = cash.paise - drawers;
  if (gap === ZERO) return { tone: "green", title: DRAWERS, detail: `${name} ${books} = cash in the drawers` };
  return {
    tone: "amber",
    title: DRAWERS,
    detail:
      `${name} says ${books}, the drawers should hold ${formatMoney(drawers)} — ` +
      `${formatMoney(gap)} posted outside the till`,
  };
}

/**
 * Books = safe: amber names every safe whose ledger has drifted from its safe
 * book, with the Cash Office's count (where the safe book is kept). Qt reads a
 * hidden drift (a blind count, no override) as zero and says green; here
 * that is a grey "hidden" rather than a green nobody checked.
 */
function safeCheck({ day, safes }: BooksInput): Check | null {
  if (!day || !safes || safes.length === 0) return null;
  const off = safes
    .filter((safe) => safe.drift !== null && safe.drift !== ZERO)
    .map(
      (safe) =>
        `${safe.name}: ledger ${formatMoney(safe.bookBalance ?? ZERO)}, safe book ${formatMoney(safe.expected ?? ZERO)}`,
    );
  if (off.length > 0) {
    return {
      tone: "amber",
      title: SAFE,
      detail: off.join("; "),
      action: { label: "Cash Office  →", session: null, href: cashOfficeHref("count") },
    };
  }
  if (safes.some((safe) => safe.drift === null)) {
    return {
      tone: "grey",
      title: SAFE,
      detail: "The safe's figures are hidden (a blind count: needs the Cash Office or Till Sessions override)",
    };
  }
  return { tone: "green", title: SAFE, detail: "Every safe's ledger = its safe book" };
}

/** The two rows, in Qt's order; either is left out while what it compares is unread. */
export function booksChecks(input: BooksInput): Check[] {
  return [drawersCheck(input), safeCheck(input)].filter((check): check is Check => check !== null);
}
