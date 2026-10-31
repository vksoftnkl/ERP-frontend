import { describe, expect, it } from "vitest";
import { defaultStatement } from "../query/params";
import { memberCard, statement, TODAY } from "../testing/fixtures";
import { cardView, emptyCard, statementLines, statementNote, statementTitle, statementTotals } from "./statement";

const st = defaultStatement(TODAY);

describe("the points statement (Qt fillStatement + fillLeftColumn)", () => {
  it("reads the live rows: chips, signs, sources, and what is LEFT of each lot", () => {
    const lines = statementLines(statement, st, memberCard);
    expect(lines.map((l) => l.cells.map((c) => c.text))).toEqual([
      ["22/10/2026", "EARN", "bil00017", "Earned on bil00017 (Loyalty concurrency test)", "4,200.00", "+42", "42", "42", "22/10/2027"],
      ["22/10/2026", "EARN", "bil00018", "Earned on bil00018 (Loyalty concurrency test)", "2,600.00", "+26", "68", "0", "22/10/2027"],
      ["22/10/2026", "REVERSAL", "bil00018", "Reversed: Earned on bil00018 (Loyalty concurrency test)", "", "-26", "42", "", ""],
    ]);
    const [open, spent, reversal] = lines;
    expect(open.cells[1].chip).toBe("green");
    expect(open.cells[2].tone).toBe("blue");
    expect(open.cells[5].tone).toBe("green");
    expect(open.cells[7]).toMatchObject({ tone: "brand", bold: true });
    expect(spent.cells[7].tone).toBe("muted");
    expect(reversal.cells[1].chip).toBe("red");
    expect(reversal.cells[3].tone).toBe("grey");
    expect(reversal.cells[5].tone).toBe("red");
  });

  it("leaves Left blank until the member card is in, and chips a cooling lot", () => {
    expect(statementLines(statement, st, null)[0].cells[7].text).toBe("");
    const cooling = { ...memberCard, lots: [{ ...memberCard.lots[0], left: 291, state: "COOLING" }] };
    expect(statementLines(statement, st, cooling)[0].cells[7]).toMatchObject({ text: "COOLING 291", chip: "amber" });
  });

  it("opens with the balance brought forward, closes with the balance and its worth", () => {
    const withOpening = { ...statement, opening: 1200 };
    const first = statementLines(withOpening, st, memberCard)[0];
    expect(first.cells.map((c) => c.text)).toEqual(["01/04/2026", "OPENING", "", "balance brought forward", "", "", "1,200", "", ""]);
    expect(first.cells[1].chip).toBe("amber");
    const totals = statementTotals(statement, memberCard).map((c) => c.text);
    expect(totals[3]).toBe("Closing  31/10/2026");
    expect(totals[6]).toBe("42");
    expect(totals[8]).toBe("= ₹ 42.00");
    expect(statementTotals(statement, null)[8].text).toBe("");
  });

  it("says when nothing moved, and titles the member", () => {
    expect(statementNote({ ...statement, rows: [] })).toBe("No movement in this period.");
    expect(statementNote(statement)).toMatch(/^Every line is a ledger row/);
    expect(statementTitle("Lakshmi Stores", "LC000412")).toBe("POINTS STATEMENT — Lakshmi Stores · LC000412");
    expect(statementTitle("Cash Customer", "")).toBe("POINTS STATEMENT — Cash Customer");
  });
});

describe("the member card (Qt fillMemberCard)", () => {
  it("reads the live card", () => {
    const view = cardView(memberCard);
    expect(view.facts.map((f) => [f.caption, f.value])).toEqual([
      ["CARD", "—"],
      ["MOBILE", "—"],
      ["ENROLLED", "06/10/2026"],
      ["LIFETIME", "₹ 95,200.00 · 36 bills"],
      ["LAST REDEEM", "—"],
      ["STATUS", "ACTIVE"],
    ]);
    expect(view.facts[5].tone).toBe("green");
    expect(view.redeemable).toBe("Redeemable now  42 pts");
    expect(view.giftNow).toBe("No gift reachable yet  ·  ₹ 42.00 as tender");
    expect(view.rules).toBe("Oldest expiry first, never-expiring last.");
    expect(view.unlotted).toBe("");
  });

  it("words cooling, the gift, the rules, a block reason and unlotted points", () => {
    const view = cardView({
      ...memberCard,
      card: { ...memberCard.card, status: "SUSPENDED", blockReason: "card lost" },
      cooling: 291,
      coolingFrom: "2026-11-09",
      redeemable: 2309,
      bestGift: { lsgId: "g", itemId: "i", name: "Pressure cooker", points: 2000, qty: 1 },
      tenderValue: "577.25",
      rules: { ...memberCard.rules!, minRedeemPoints: 500, redeemMultiple: 100, maxRedeemPerc: 20, activationDays: 7 },
      unlotted: 12,
    });
    expect(view.facts[5]).toMatchObject({ value: "SUSPENDED — card lost", tone: "amber" });
    expect(view.redeemable).toBe("Redeemable now  2,309 pts  (291 cooling till 09/11/2026)");
    expect(view.giftNow).toBe("Gift now: Pressure cooker × 1 (2,000)  ·  or ₹ 577.25 as tender");
    expect(view.rules).toBe(
      "Min redeem 500  ·  multiples of 100  ·  max 20 % of bill  ·  points cool 7 days  ·  Oldest expiry first, never-expiring last.",
    );
    expect(view.unlotted).toMatch(/^Unlotted 12 pts — counted in the balance/);
    expect(cardView({ ...memberCard, tenderValue: null }).giftNow).toBe("No gift reachable yet.");
  });

  it("is empty with the reason before a member is picked", () => {
    const empty = emptyCard("Pick a member to see the points statement.");
    expect(empty.facts.every((f) => f.value === "—")).toBe(true);
    expect(empty.redeemable).toBe("Pick a member to see the points statement.");
  });
});
