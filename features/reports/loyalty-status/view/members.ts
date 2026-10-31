/**
 * Tab 1 — the member grid, its Total row, its six tiles and its note
 * (Qt `fillMembers()` + `LoyaltyMemberCols` + the delegate's Members branch).
 *
 * Every figure is the server's. The Total row's Balance and Value are the
 * route's `summary` (the whole filtered set); Earned / Redeemed / Expired are
 * the rows' sums, written only when every row is in — as Qt does.
 */
import type { MembersFilters } from "../query/params";
import { daysBetween } from "../query/params";
import { blank, chip, plain, type Cell, type Column, type Tone } from "./cells";
import { dayMonth, money, num, pts, showDate, txt } from "./format";
import type { MemberItem, MembersSummary } from "../wire/types";

/** Next expiry reads amber inside this many days (Qt `kSoonDays`). */
export const SOON_DAYS = 30;

/** Card no · Customer · Mobile · Scheme · Status · Earned · Redeemed · Expired · Balance · Value ₹ · Next expiry · Best gift · Gift qty · Last visit */
export function memberColumns(period: boolean): Column[] {
  return [
    { title: "Card no", min: 6.4 },
    { title: "Customer", min: 11, fr: 2 },
    { title: "Mobile", min: 6.9 },
    { title: "Scheme", min: 9, fr: 1.2 },
    { title: "Status", min: 6.4 },
    { title: period ? "Earned*" : "Earned", min: 5.6, num: true },
    { title: "Redeemed", min: 5.9, num: true },
    { title: "Expired", min: 5.1, num: true },
    { title: "Balance", min: 6, num: true },
    { title: "Value ₹", min: 6, num: true },
    { title: "Next expiry", min: 10 },
    { title: "Best gift", min: 9, fr: 1.2 },
    { title: "Gift qty", min: 4.3, num: true },
    { title: "Last visit", min: 6.1 },
  ];
}

/** The Best gift text (Qt `fillMembers`): a blocked wallet, the gift, or why there is none. */
export function bestGiftText(o: MemberItem): { text: string; qty: string } {
  const status = txt(o.status);
  if (status !== "ACTIVE") return { text: `blocked — ${status.toLowerCase()}`, qty: "" };
  if (o.bestGift) return { text: txt(o.bestGift.name), qty: pts(o.bestGift.qty) };
  return { text: txt(o.lscId) ? "— none reachable" : "— no scheme", qty: "" };
}

export function memberCells(o: MemberItem, today: string): Cell[] {
  const gift = bestGiftText(o);
  const next = showDate(o.nextExpiryOn);
  let nextCell: Cell;
  if (!next) {
    nextCell = plain("no open lots", { tone: "muted" });
  } else {
    const soon = daysBetween(today, txt(o.nextExpiryOn).slice(0, 10)) <= SOON_DAYS;
    const due = num(o.nextExpiryPoints) > 0 ? `${pts(o.nextExpiryPoints)} pts` : "";
    nextCell = {
      text: next,
      tone: soon ? "amber" : null,
      bold: soon,
      aside: due ? { text: due, tone: soon ? "amber" : "grey" } : null,
    };
  }
  return [
    plain(txt(o.cardNo)),
    plain(txt(o.customerName)),
    plain(txt(o.mobile)),
    plain(txt(o.schemeName)),
    chip(txt(o.status)),
    plain(pts(o.earned)),
    plain(pts(num(o.redeemed) + num(o.gift))),
    plain(num(o.expired) !== 0 ? pts(o.expired) : "—"),
    plain(pts(o.balance), { tone: "brand", bold: true }),
    plain(o.value === null || o.value === undefined ? "—" : money(o.value)),
    nextCell,
    plain(gift.text, { tone: gift.qty ? "teal" : "muted" }),
    gift.qty ? plain(`× ${gift.qty}`, { tone: "teal", bold: true }) : blank,
    plain(showDate(o.lastActivityOn)),
  ];
}

/** "Total  (N)", or "Total  (x of N shown)" when the 20,000 cap cut the list. */
export function totalLabel(shown: number, total: number): string {
  return shown >= total ? `Total  (${total})` : `Total  (${shown} of ${total} shown)`;
}

export function memberTotals(items: readonly MemberItem[], summary: MembersSummary | null, total: number): Cell[] {
  const cells: Cell[] = memberColumns(false).map(() => blank);
  const complete = items.length >= total;
  cells[1] = plain(totalLabel(items.length, total));
  if (complete) {
    let earned = 0;
    let redeemed = 0;
    let expired = 0;
    for (const o of items) {
      earned += num(o.earned);
      redeemed += num(o.redeemed) + num(o.gift);
      expired += num(o.expired);
    }
    cells[5] = plain(pts(earned));
    cells[6] = plain(pts(redeemed));
    cells[7] = plain(pts(expired));
  }
  cells[8] = plain(pts(summary?.outstanding));
  cells[9] = plain(money(summary?.outstandingValue));
  return cells;
}

export type Tile = { id: string; caption: string; value: string; sub: string; tone?: Tone | null };

export function memberTiles(summary: MembersSummary | null, f: MembersFilters): Tile[] {
  const s = summary;
  const period = f.earned;
  return [
    {
      id: "members",
      caption: "MEMBERS",
      value: s ? pts(s.members) : "—",
      sub: s ? `${pts(s.active)} active · ${pts(s.suspended)} suspended` : "",
    },
    {
      id: "outstanding",
      caption: "POINTS OUTSTANDING",
      value: s ? pts(s.outstanding) : "—",
      sub: s ? `= ₹ ${money(s.outstandingValue)}` : "",
      tone: "brand",
    },
    {
      id: "earned",
      caption: period ? `EARNED  ${dayMonth(f.earnedFrom)} → ${dayMonth(f.earnedTo)}` : "EARNED  (LIFETIME)",
      value: s ? pts(s.earnedInPeriod) : "—",
      sub: s ? `on ${pts(s.earnedBills)} bills` : "",
      tone: "green",
    },
    {
      id: "redeemed",
      caption: "REDEEMED",
      value: s ? pts(s.redeemedInPeriod) : "—",
      sub: s ? `₹ ${money(s.redeemedValue)} as tender` : "",
      tone: "blue",
    },
    {
      id: "eligible",
      caption: "GIFT-ELIGIBLE NOW",
      value: s ? pts(s.giftEligible) : "—",
      sub: s ? `members · ${pts(s.giftsLowOnStock)} gifts low on stock` : "",
      tone: "teal",
    },
    {
      id: "expiring",
      caption: "EXPIRING ≤ 30 DAYS",
      value: s ? pts(s.expiring30Points) : "—",
      sub: s ? `${pts(s.expiring30Members)} members · see Expiring soon` : "",
      tone: "amber",
    },
  ];
}

export const MEMBERS_LEGEND =
  "Redeemed includes gifts.  Best gift = the highest gift the redeemable points reach; " +
  "Gift qty = points ÷ gift points when the gift repeats, else 1.";

export function membersNote(count: number, f: MembersFilters): string {
  if (count === 0) return "No member matches these filters.";
  const period = f.earned ? `* Earned in the period (${showDate(f.earnedFrom)} → ${showDate(f.earnedTo)}).  ` : "";
  return period + MEMBERS_LEGEND;
}
