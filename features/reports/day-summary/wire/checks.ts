/**
 * A check's code + facts → a heading and one line (plan §7.5).
 *
 * The server sends codes and facts, never sentences (backend §8); the words
 * are the client's, here and nowhere else. An unknown code is SHOWN: its code
 * is the heading and its level picks the colour. The server adds codes.
 *
 * The facts read below are the server's (`day-summary.service.ts`, read
 * 2026-10-12), and every fact is optional: a missing one drops a clause, it
 * never invents a figure. A few richer keys the react plan's wording assumed
 * (draft and pair voucher numbers) are read when sent and skipped when not:
 *
 *   BALANCED          { debit, credit, unbalancedVouchers, voucherIds }
 *   AMOUNT_TIES       { typeAmount, groupDebit, groupCredit, moneyChecked, moneyMismatches }
 *   LEGLESS           { count, voucherIds }
 *   DRAFTS            { count, amount }                     (+ items?: [{ voucherNo, amount }])
 *   CANCELLED_PAIRS   { pairs, loneHalves }                 (+ items?: [{ original, mirror }])
 *   CLEARING_PENDING  { ledgers: [{ ledgerId, ledgerName, closing: { amount, side } }] }
 *   BUSINESS_DAY      { status, zNo, sessions: { total, closed } }
 *   FUTURE_DATED      { count, lastDate, today }
 *   NUMBER_GAPS       { series: [{ short, branchName, lo, hi, deletedCount, unusedCount, deleted, unused }] }
 *                     (only the series WITH gaps: OK sends an empty list)
 *
 * No arithmetic on money: amounts in facts are strings, printed as sent.
 */
import { displayDate } from "@/features/reports/shared/wire/dates";
import { formatAmount, formatBal, isAmountString } from "@/features/reports/shared/wire/money";
import type { Check, CheckLevel } from "./types";

export type CheckText = { heading: string; line: string | null };

export const KNOWN_CHECKS = [
  "BALANCED",
  "AMOUNT_TIES",
  "LEGLESS",
  "DRAFTS",
  "CANCELLED_PAIRS",
  "CLEARING_PENDING",
  "BUSINESS_DAY",
  "FUTURE_DATED",
  "NUMBER_GAPS",
] as const;

/** Checks with rows behind them on `/checks/detail` (backend §5.6). */
const DETAIL_CHECKS: ReadonlySet<string> = new Set(["LEGLESS", "DRAFTS", "FUTURE_DATED", "NUMBER_GAPS"]);

/** A broken day leads with what is broken. */
const LEVEL_ORDER: Record<CheckLevel, number> = { FAIL: 0, WARN: 1, INFO: 2, OK: 3 };

export const LEVEL_MARK: Record<CheckLevel, string> = { OK: "✓", WARN: "!", INFO: "i", FAIL: "✕" };

/** FAIL, WARN, INFO, OK; the server's order within a level. */
export function sortChecks(checks: readonly Check[]): Check[] {
  return checks
    .map((check, index) => ({ check, index }))
    .sort((a, b) => LEVEL_ORDER[a.check.level] - LEVEL_ORDER[b.check.level] || a.index - b.index)
    .map(({ check }) => check);
}

/** Does "show" have rows to fetch? Nothing sits behind an OK check. */
export function hasDetail(check: Check): boolean {
  return DETAIL_CHECKS.has(check.code) && check.level !== "OK";
}

/* ------------------------------------------------------------ fact readers */

type Facts = Record<string, unknown>;

function isObj(value: unknown): value is Facts {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function int(facts: Facts, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = facts[key];
    if (typeof value === "number" && Number.isInteger(value)) return value;
  }
  return null;
}

function str(facts: Facts, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = facts[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** An amount fact, formatted from its string. Anything else is not printed as money. */
function money(facts: Facts, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = facts[key];
    if (typeof value === "string" && isAmountString(value.trim())) return formatAmount(value.trim());
  }
  return null;
}

function list(facts: Facts, ...keys: string[]): Facts[] {
  for (const key of keys) {
    const value = facts[key];
    if (Array.isArray(value)) return value.filter(isObj);
  }
  return [];
}

function strings(facts: Facts, key: string): string[] {
  const value = facts[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === "string" || typeof v === "number").map(String);
}

/**
 * A money ledger's bal fact (`{ amount, side }`) or a bare amount string. Its
 * natural side is Dr, so it prints bare, and only a Cr says so (as the grid).
 */
function balText(value: unknown): string | null {
  if (typeof value === "string" && isAmountString(value.trim())) return formatAmount(value.trim());
  if (isObj(value) && typeof value.amount === "string" && isAmountString(value.amount.trim())) {
    const amount = value.amount.trim();
    return value.side === "CR" ? formatBal({ amount, side: "CR" }) : formatAmount(amount);
  }
  return null;
}

/** A count for a sentence. Grouped Indian-style; a count is not money. */
function count(value: number): string {
  return value.toLocaleString("en-IN");
}

function plural(n: number, one: string, many: string): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

/* ---------------------------------------------------------------- wording */

function balanced(check: Check): CheckText {
  const f = check.facts;
  const debit = money(f, "debit");
  const credit = money(f, "credit");
  if (check.level === "OK") {
    return {
      heading: "Dr = Cr",
      line: debit && credit ? `${debit} = ${credit} — every posted voucher balanced` : "every posted voucher balanced",
    };
  }
  const n = int(f, "unbalancedVouchers", "unbalanced", "count");
  // A day can fail on the totals with every single voucher balanced.
  const parts = [n ? `${plural(n, "voucher does", "vouchers do")} not balance` : null];
  if (!n && debit && credit) parts.push(`Dr ${debit} ≠ Cr ${credit}`);
  return { heading: "Dr ≠ Cr", line: parts.filter(Boolean).join(" — ") || null };
}

function amountTies(check: Check): CheckText {
  const amount = money(check.facts, "typeAmount", "amount");
  if (check.level === "OK") {
    const line = amount ? `types grid total ${amount}` : null;
    // Under a voucher-type filter the money ledgers are not cross-checked (no balances).
    const unchecked = check.facts.moneyChecked === false ? "money ledgers not cross-checked for one type" : null;
    return { heading: "Voucher amount = Σ Dr", line: [line, unchecked].filter(Boolean).join(" · ") || null };
  }
  return { heading: "Voucher amount = Σ Dr", line: "the report disagrees with itself — tell support" };
}

function legless(check: Check): CheckText {
  const n = int(check.facts, "count");
  if (check.level === "OK") return { heading: "Vouchers with no entries", line: "none — every voucher has ledger lines" };
  return {
    heading: "Vouchers with no entries",
    line: n !== null ? `${plural(n, "voucher carries", "vouchers carry")} no ledger lines` : "some vouchers carry no ledger lines",
  };
}

function drafts(check: Check): CheckText {
  const f = check.facts;
  const n = int(f, "count");
  if (check.level === "OK" || n === 0) return { heading: "No drafts", line: "every voucher in range is posted" };
  const items = list(f, "items", "drafts")
    .slice(0, 3)
    .map((item) => {
      const label = str(item, "voucherNo", "short", "name") ?? "draft";
      const amount = money(item, "amount");
      return amount ? `${label} · ${amount}` : label;
    });
  const amount = money(f, "amount");
  return {
    heading: n !== null ? `${plural(n, "draft", "drafts")} not in figures` : "Drafts not in figures",
    line: items.length ? items.join("   ·   ") : amount ? `${amount} in draft documents` : null,
  };
}

function cancelledPairs(check: Check): CheckText {
  const f = check.facts;
  const pairs = int(f, "pairs", "count");
  const lone = int(f, "loneHalves");
  const items = list(f, "items", "pairs")
    .slice(0, 2)
    .map((item) => {
      const original = str(item, "original", "originalNo");
      const mirror = str(item, "mirror", "mirrorNo");
      return original && mirror ? `${original} / ${mirror} (mirror) · net 0.00` : (original ?? mirror ?? "");
    })
    .filter(Boolean);
  const heading =
    pairs !== null ? `${plural(pairs, "cancelled pair", "cancelled pairs")}` : "Cancelled pairs";
  const tail = lone ? `+ ${plural(lone, "lone half", "lone halves")} (other half outside the range)` : null;
  // Without the numbers, say where the pair is and what it nets to.
  const where = !items.length && pairs ? "both halves listed on the Vouchers tab · net 0.00" : null;
  return { heading, line: [items.join(" · ") || where, tail].filter(Boolean).join(" · ") || null };
}

function clearingPending(check: Check): CheckText {
  const f = check.facts;
  const ledgers = list(f, "ledgers");
  const amount = money(f, "amount");
  const settles = "settles T+1 (Settlement, menu 278)";
  if (check.level === "OK") return { heading: "Clearing settled", line: "no money waiting in a clearing ledger" };
  if (ledgers.length === 1) {
    const name = str(ledgers[0], "ledgerName", "name") ?? "Clearing";
    const closing = balText(ledgers[0].closing) ?? balText(ledgers[0].amount) ?? amount;
    return { heading: closing ? `${name} ${closing}` : name, line: settles };
  }
  const named = ledgers
    .map((ledger) => {
      const name = str(ledger, "ledgerName", "name");
      const closing = balText(ledger.closing) ?? balText(ledger.amount);
      return name && closing ? `${name} ${closing}` : name;
    })
    .filter(Boolean);
  return {
    heading: amount ? `Clearing ${amount}` : "Clearing pending",
    line: named.length ? `${named.join(" · ")} — ${settles}` : settles,
  };
}

function businessDay(check: Check): CheckText {
  const f = check.facts;
  const status = str(f, "status");
  const sessions = isObj(f.sessions) ? f.sessions : null;
  const total = sessions ? int(sessions, "total") : null;
  const closed = sessions ? int(sessions, "closed") : null;
  const tills = total !== null && closed !== null ? `tills ${count(closed)} of ${count(total)} closed` : null;
  switch (status) {
    case "CLOSED": {
      const z = str(f, "zNo");
      return { heading: "Business day CLOSED", line: z ? `Day Close done · Z ${z}` : "Day Close done" };
    }
    case "NONE":
      return { heading: "No till day", line: "this branch runs no till business day for the date" };
    case "MIXED":
      return { heading: "Business day differs by branch", line: "pick one branch to see its status" };
    case "CLOSING":
      return { heading: "Business day CLOSING", line: ["Day Close (menu 274) in progress", tills].filter(Boolean).join(" — ") };
    case "OPEN":
      return { heading: "Business day OPEN", line: ["Day Close (menu 274) not run", tills].filter(Boolean).join(" — ") };
    default:
      return { heading: status ? `Business day ${status}` : "Business day", line: tills };
  }
}

function futureDated(check: Check): CheckText {
  const f = check.facts;
  const n = int(f, "count");
  const latest = str(f, "lastDate", "latest");
  if (check.level === "OK" || n === 0) return { heading: "No vouchers dated after today", line: null };
  return {
    heading: n !== null ? `${plural(n, "voucher", "vouchers")} dated after today` : "Vouchers dated after today",
    line: latest ? `the latest on ${displayDate(latest)}` : null,
  };
}

function numberGaps(check: Check): CheckText {
  const series = list(check.facts, "series");
  if (check.level === "OK") {
    const ranges = series
      .map((s) => {
        const lo = str(s, "lo");
        const hi = str(s, "hi");
        return lo && hi ? `${lo}–${hi}` : null;
      })
      .filter(Boolean);
    return { heading: "Numbering", line: ranges.length ? `no gaps: ${ranges.join(", ")}` : "no gaps" };
  }
  const parts = series
    .map((s) => {
      const name = str(s, "series") ?? ([str(s, "short"), str(s, "branchName")].filter(Boolean).join(" · ") || "series");
      // The counts when sent: the lists stop at 50.
      const deleted = int(s, "deletedCount") ?? strings(s, "deleted").length;
      const unused = int(s, "unusedCount") ?? strings(s, "unused").length;
      // A count of numbers, for a sentence; never a figure.
      const missing = int(s, "missing") ?? deleted + unused;
      if (missing === 0) return null;
      const why = [deleted ? `${count(deleted)} deleted` : null, unused ? `${count(unused)} unused` : null]
        .filter(Boolean)
        .join(", ");
      return `${name} ${count(missing)} missing${why ? ` (${why})` : ""}`;
    })
    .filter(Boolean);
  return { heading: "Numbering", line: parts.length ? parts.join(" · ") : null };
}

/** Code + facts → heading + line. Unknown code → the code itself, no line. */
export function checkText(check: Check): CheckText {
  switch (check.code) {
    case "BALANCED":
      return balanced(check);
    case "AMOUNT_TIES":
      return amountTies(check);
    case "LEGLESS":
      return legless(check);
    case "DRAFTS":
      return drafts(check);
    case "CANCELLED_PAIRS":
      return cancelledPairs(check);
    case "CLEARING_PENDING":
      return clearingPending(check);
    case "BUSINESS_DAY":
      return businessDay(check);
    case "FUTURE_DATED":
      return futureDated(check);
    case "NUMBER_GAPS":
      return numberGaps(check);
    default:
      return { heading: check.code, line: null };
  }
}

/** The one-line sentence of a check, for the tie-out note and the Excel sheet. */
export function checkSentence(check: Check): string {
  const { heading, line } = checkText(check);
  return line ? `${heading} — ${line}` : heading;
}
