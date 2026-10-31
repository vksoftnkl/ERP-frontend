/**
 * Tab 1, bottom — the points statement and the member card (Qt
 * `fillStatement()`, `fillLeftColumn()`, `fillMemberCard()`,
 * `clearMemberPanels()` and the delegate's Statement branch).
 *
 * One grid for history AND position: each earning row also shows what is
 * LEFT of its lot, matched by the row's own id (a lot's `lotId` IS its
 * earning row's `lldId`) against `…/member` `lots[]`. A row that is no open
 * lot was spent or lapsed: 0, muted.
 */
import type { StatementFilters } from "../query/params";
import { blank, chip, plain, type Cell, type Column, type Tone } from "./cells";
import { money, num, pointsValue, pts, showDate, txt } from "./format";
import type { MemberLot, MemberPayload, StatementPayload, StatementRow } from "../wire/types";

/** Date · Type · Source · Scheme / reason · Bill ₹ · Points · Balance · Left · Lot expires */
export const STATEMENT_COLUMNS: Column[] = [
  { title: "Date", min: 6.1 },
  { title: "Type", min: 6.4 },
  { title: "Source", min: 6.7 },
  { title: "Scheme / reason", min: 12, fr: 2 },
  { title: "Bill ₹", min: 6.4, num: true },
  { title: "Points", min: 5.6, num: true },
  { title: "Balance", min: 6, num: true },
  { title: "Left", min: 6.4, num: true },
  { title: "Lot expires", min: 6.4 },
];

export type StatementLine = { key: string; cells: Cell[] };

/** The Left cell of one row: what its lot still holds, COOLING while it cannot be spent. */
export function leftCell(row: StatementRow, member: MemberPayload | null, lots: Map<string, MemberLot>): Cell {
  const key = txt(row.lldId);
  const earning = !row.isReversal && num(row.points) > 0;
  if (!earning || !key || !member) return blank;
  const lot = lots.get(key);
  if (!lot) return plain("0", { tone: "muted" });
  const left = pts(lot.left);
  const state = txt(lot.state);
  if (state === "COOLING") return { text: `COOLING ${left}`, chip: "amber" };
  if (!state) return plain(left, { tone: "muted" });
  return plain(left, { tone: "brand", bold: true });
}

export function statementLines(
  data: StatementPayload | null,
  st: StatementFilters,
  member: MemberPayload | null,
): StatementLine[] {
  if (!data) return [];
  const lots = new Map<string, MemberLot>();
  for (const lot of member?.lots ?? []) lots.set(txt(lot.lotId), lot);
  const lines: StatementLine[] = [];
  const opening = num(data.opening);
  if (opening !== 0) {
    lines.push({
      key: "opening",
      cells: [
        plain(showDate(st.from)),
        chip("OPENING"),
        blank,
        plain("balance brought forward"),
        blank,
        blank,
        plain(pts(opening), { bold: true }),
        blank,
        blank,
      ],
    });
  }
  for (const row of data.rows ?? []) {
    const points = num(row.points);
    const source = txt(row.srcDocRefno);
    const pointsTone: Tone = points >= 0 ? "green" : "red";
    lines.push({
      key: txt(row.lldId) || `row-${lines.length}`,
      cells: [
        plain(showDate(row.txnDate)),
        chip(row.isReversal ? "REVERSAL" : txt(row.txnType)),
        plain(source || "—", { tone: txt(row.srcDocId) ? "blue" : null }),
        plain(txt(row.reason), { tone: row.isReversal ? "grey" : null }),
        plain(num(row.baseAmount) !== 0 ? money(row.baseAmount) : ""),
        plain(points > 0 ? `+${pts(points)}` : pts(points), { tone: pointsTone }),
        plain(pts(row.runningBalance), { bold: true }),
        leftCell(row, member, lots),
        plain(showDate(row.expiresOn)),
      ],
    });
  }
  return lines;
}

export function statementTotals(data: StatementPayload | null, member: MemberPayload | null): Cell[] {
  const cells: Cell[] = STATEMENT_COLUMNS.map(() => blank);
  if (!data) return cells;
  cells[3] = plain(`Closing  ${showDate(data.to)}`);
  cells[6] = plain(pts(data.closing));
  const worth = pointsValue(num(data.closing), member?.rules?.redeemValuePerPoint);
  if (worth) cells[8] = plain(`= ₹ ${worth}`);
  return cells;
}

export const STATEMENT_LEGEND =
  "Every line is a ledger row — a return or cancel writes a reversal, never a delete.  " +
  "Left = what is still unspent of that earning.";

export function statementNote(data: StatementPayload | null): string {
  if (data && (data.rows ?? []).length === 0 && num(data.opening) === 0) return "No movement in this period.";
  return STATEMENT_LEGEND;
}

export function statementTitle(name: string, card: string): string {
  if (!name && !card) return "POINTS STATEMENT";
  return card ? `POINTS STATEMENT — ${name} · ${card}` : `POINTS STATEMENT — ${name}`;
}

/* -------------------------------------------------------- member card */

export type Fact = { caption: string; value: string; tone?: Tone | null };

export type CardView = {
  facts: Fact[];
  redeemable: string;
  giftNow: string;
  rules: string;
  /** Shown only when the member holds unlotted points. */
  unlotted: string;
};

const FACT_CAPTIONS = ["CARD", "MOBILE", "ENROLLED", "LIFETIME", "LAST REDEEM", "STATUS"];

/** The card with nothing in it, saying why (Qt `clearMemberPanels`). */
export function emptyCard(why: string): CardView {
  return {
    facts: FACT_CAPTIONS.map((caption) => ({ caption, value: "—" })),
    redeemable: why,
    giftNow: "",
    rules: "",
    unlotted: "",
  };
}

export function cardView(data: MemberPayload): CardView {
  const card = data.card;
  const status = txt(card?.status);
  const block = txt(card?.blockReason);
  const facts: Fact[] = [
    { caption: "CARD", value: txt(card?.cardNo) || "—" },
    { caption: "MOBILE", value: txt(card?.mobile) || "—" },
    { caption: "ENROLLED", value: showDate(card?.enrolledOn) },
    { caption: "LIFETIME", value: `₹ ${money(card?.lifetimeBillAmt)} · ${pts(card?.lifetimeBillCnt)} bills` },
    { caption: "LAST REDEEM", value: txt(card?.lastRedeemOn) ? showDate(card?.lastRedeemOn) : "—" },
    {
      caption: "STATUS",
      value: block ? `${status} — ${block}` : status,
      tone: status === "ACTIVE" ? "green" : "amber",
    },
  ];

  const cooling = num(data.cooling);
  const redeemable =
    cooling > 0
      ? `Redeemable now  ${pts(data.redeemable)} pts  (${pts(cooling)} cooling till ${showDate(data.coolingFrom)})`
      : `Redeemable now  ${pts(data.redeemable)} pts`;

  const tender = data.tenderValue === null || data.tenderValue === undefined ? "" : `₹ ${money(data.tenderValue)} as tender`;
  const gift = data.bestGift;
  const giftNow = gift
    ? `Gift now: ${txt(gift.name)} × ${pts(gift.qty)} (${pts(gift.points)})${tender ? `  ·  or ${tender}` : ""}`
    : tender
      ? `No gift reachable yet  ·  ${tender}`
      : "No gift reachable yet.";

  const r: string[] = [];
  const rules = data.rules;
  if (rules) {
    if (num(rules.minRedeemPoints) > 0) r.push(`Min redeem ${pts(rules.minRedeemPoints)}`);
    if (num(rules.redeemMultiple) > 0) r.push(`multiples of ${pts(rules.redeemMultiple)}`);
    if (num(rules.maxRedeemPerc) > 0 && num(rules.maxRedeemPerc) < 100) r.push(`max ${pts(rules.maxRedeemPerc)} % of bill`);
    if (num(rules.activationDays) > 0) r.push(`points cool ${pts(rules.activationDays)} days`);
  }
  r.push("Oldest expiry first, never-expiring last.");

  const unlotted = num(data.unlotted);
  return {
    facts,
    redeemable,
    giftNow,
    rules: r.join("  ·  "),
    unlotted:
      unlotted !== 0
        ? `Unlotted ${pts(unlotted)} pts — counted in the balance but in no lot, so they can neither be redeemed nor lapse.`
        : "",
  };
}
