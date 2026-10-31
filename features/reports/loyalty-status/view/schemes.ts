/**
 * Tab 3 — the scheme summary, its Total row, the month-wise chart and the
 * scheme's gifts (Qt `fillSchemes()`, `fillMonthly()`, `fillGifts()` and the
 * delegate's Schemes / Gifts branches).
 */
import type { SchemeSplit } from "../query/params";
import { blank, chip, plain, type Cell, type Column } from "./cells";
import { money, monthShort, monthYear, num, pts, showDate, txt } from "./format";
import type { Bar } from "./expiring";
import type { GiftItem, SchemeItem, SchemeMonth, SchemesSummary } from "../wire/types";

/** Scheme · Status · Valid · Holders · Bills · Opening · Earned · Redeemed · Gift · Expired · Adjust · Outstanding · Value ₹ · Used % */
export const SCHEME_COLUMNS: Column[] = [
  { title: "Scheme", min: 11, fr: 2 },
  { title: "Status", min: 6 },
  { title: "Valid", min: 11, fr: 1.2 },
  { title: "Holders", min: 5.1, num: true },
  { title: "Bills", min: 4.8, num: true },
  { title: "Opening", min: 6.1, num: true },
  { title: "Earned", min: 6.1, num: true },
  { title: "Redeemed", min: 6.1, num: true },
  { title: "Gift", min: 5.3, num: true },
  { title: "Expired", min: 5.6, num: true },
  { title: "Adjust", min: 4.7, num: true },
  { title: "Outstanding", min: 6.9, num: true },
  { title: "Value ₹", min: 6.7, num: true },
  { title: "Used %", min: 4.7, num: true },
];

/** The row's name: the scheme, with its branch or month on a split. */
export function schemeRowName(o: SchemeItem, split: SchemeSplit): string {
  let name = txt(o.schemeName);
  if (split === "scheme_branch" && txt(o.branchName)) name += ` · ${txt(o.branchName)}`;
  if (split === "scheme_month" && txt(o.month)) name += ` · ${monthYear(txt(o.month))}`;
  return name;
}

/** A zero reads "—", muted (Qt `dashOr` + the delegate's "—" rule). */
function dashOr(value: number, shown: string): Cell {
  return value !== 0 ? plain(shown) : plain("—", { tone: "muted" });
}

export function schemeCells(o: SchemeItem, split: SchemeSplit): Cell[] {
  const status = txt(o.status);
  const ended = status === "CLOSED" || status === "DELETED";
  const valid =
    ended && txt(o.pointsValidTill)
      ? `points valid till ${showDate(o.pointsValidTill)}`
      : `${showDate(o.startDate)} → ${showDate(o.endDate)}`;
  const adjusted = num(o.adjusted);
  const earned = num(o.earned);
  return [
    plain(schemeRowName(o, split)),
    chip(status),
    plain(valid, { tone: "grey" }),
    o.holders === null || o.holders === undefined ? plain("—", { tone: "muted" }) : plain(pts(o.holders)),
    dashOr(num(o.bills), pts(o.bills)),
    dashOr(num(o.opening), pts(o.opening)),
    dashOr(earned, pts(earned)),
    dashOr(num(o.redeemed), pts(o.redeemed)),
    dashOr(num(o.gift), pts(o.gift)),
    dashOr(num(o.expired), pts(o.expired)),
    adjusted !== 0 ? plain(`${adjusted > 0 ? "+" : ""}${pts(adjusted)}`, { tone: "violet" }) : plain("—", { tone: "muted" }),
    plain(pts(o.outstanding), { tone: "brand", bold: true }),
    plain(money(o.value)),
    o.usedPct === null || o.usedPct === undefined || earned === 0
      ? plain("—", { tone: "muted" })
      : plain(`${num(o.usedPct).toFixed(1)} %`),
  ];
}

export function schemeTotals(summary: SchemesSummary | null): Cell[] {
  const cells: Cell[] = SCHEME_COLUMNS.map(() => blank);
  cells[0] = plain("Total");
  if (!summary) return cells;
  const keys: Array<[number, keyof SchemesSummary]> = [
    [4, "bills"],
    [5, "opening"],
    [6, "earned"],
    [7, "redeemed"],
    [8, "gift"],
    [9, "expired"],
    [10, "adjusted"],
    [11, "outstanding"],
  ];
  for (const [col, key] of keys) cells[col] = plain(pts(summary[key]));
  cells[12] = plain(money(summary.value));
  const earned = num(summary.earned);
  if (earned > 0) {
    cells[13] = plain(`${(((num(summary.redeemed) + num(summary.gift)) / earned) * 100).toFixed(1)} %`);
  }
  return cells;
}

export const SCHEMES_LEGEND =
  "Outstanding = Opening + Earned − Redeemed − Gift − Expired ± Adjust.  Holders count members " +
  "with a balance on that scheme (a member can hold two), so they do not total.  " +
  "Used % = (Redeemed + Gift) ÷ Earned.";

export function schemesNote(count: number): string {
  return count === 0 ? "No scheme holds points or moved in this period." : SCHEMES_LEGEND;
}

/* ------------------------------------------------------------- monthly */

export const MONTHLY_SERIES = [
  { name: "Earned", tone: "green" },
  { name: "Redeemed + gift", tone: "blue" },
  { name: "Expired", tone: "grey" },
] as const;

/** Three bars a month — earned, redeemed + gift, expired; `*` marks a month to date. */
export function monthlyBars(months: readonly SchemeMonth[]): Bar[] {
  return months.map((m) => {
    const label = `${monthShort(txt(m.month))}${m.partial ? "*" : ""}`;
    const values = [num(m.earned), num(m.redeemedPlusGift), num(m.expired)];
    return {
      label,
      values,
      tones: ["green", "blue", "grey"],
      title: `${monthYear(txt(m.month))}${m.partial ? " (to date)" : ""}: earned ${pts(values[0])} · redeemed + gift ${pts(values[1])} · expired ${pts(values[2])}`,
    };
  });
}

export function monthlyTotals(months: readonly SchemeMonth[]): string {
  let earned = 0;
  let spent = 0;
  let lapsed = 0;
  for (const m of months) {
    earned += num(m.earned);
    spent += num(m.redeemedPlusGift);
    lapsed += num(m.expired);
  }
  const partial = months.length > 0 && Boolean(months[months.length - 1].partial);
  return `Earned ${pts(earned)}  ·  Redeemed + gift ${pts(spent)}  ·  Expired ${pts(lapsed)}${partial ? "     * month to date" : ""}`;
}

/* --------------------------------------------------------------- gifts */

/** Gift · Points · Repeat · Eligible · Issued · In stock */
export const GIFT_COLUMNS: Column[] = [
  { title: "Gift", min: 9, fr: 2 },
  { title: "Points", min: 4.7, num: true },
  { title: "Repeat", min: 4.3 },
  { title: "Eligible", min: 4.9, num: true },
  { title: "Issued", min: 4.3, num: true },
  { title: "In stock", min: 8 },
];

export function giftCells(g: GiftItem): Cell[] {
  const eligible = num(g.eligibleMembers);
  const tracked = !(g.inStock === null || g.inStock === undefined || txt(g.inStock) === "");
  const stock = tracked ? pts(g.inStock) : "";
  const low = tracked && num(g.inStock) < eligible;
  return [
    plain(txt(g.itemName)),
    plain(pts(g.points)),
    plain(g.repeat ? "yes" : "no", { tone: "grey" }),
    plain(pts(eligible), { tone: "teal", bold: true }),
    plain(num(g.issuedInPeriod) !== 0 ? pts(g.issuedInPeriod) : "—"),
    { text: tracked ? stock : "not tracked", badge: low ? { text: "LOW", tone: "red" } : null },
  ];
}

export const GIFTS_LEGEND =
  "Eligible = members whose redeemable points reach the gift today; LOW = stock below eligible.  " +
  "Enter on a gift → Members tab, eligible only.";

export function giftsNote(count: number): string {
  return count === 0 ? "This scheme has no gifts." : GIFTS_LEGEND;
}
