import { describe, expect, it } from "vitest";
import { defaultMembers } from "../query/params";
import { cashCustomer, lakshmi, membersSummary, noScheme, TODAY, velan } from "../testing/fixtures";
import { bestGiftText, memberCells, memberColumns, membersNote, memberTiles, memberTotals } from "./members";

const texts = (cells: { text: string }[]) => cells.map((c) => c.text);

describe("a member row (Qt fillMembers + delegate)", () => {
  it("reads the live Cash Customer row column by column", () => {
    const cells = memberCells(cashCustomer, TODAY);
    expect(texts(cells)).toEqual([
      "",
      "Cash Customer",
      "",
      "Loyalty concurrency test",
      "ACTIVE",
      "42",
      "0",
      "—",
      "42",
      "42.00",
      "22/10/2027",
      "— none reachable",
      "",
      "29/10/2026",
    ]);
    expect(cells[4].chip).toBe("green");
    expect(cells[8]).toMatchObject({ tone: "brand", bold: true });
    // A year away: not "soon", the points grey on the right.
    expect(cells[10]).toMatchObject({ tone: null, bold: false, aside: { text: "42 pts", tone: "grey" } });
    expect(cells[11].tone).toBe("muted");
  });

  it("adds gifts to Redeemed, shows the best gift and its qty, ambers a near expiry", () => {
    const cells = memberCells(lakshmi, TODAY);
    expect(cells[6].text).toBe("1,400");
    expect(cells[7].text).toBe("200");
    expect(cells[9].text).toBe("650.00");
    expect(cells[10]).toMatchObject({ text: "15/11/2026", tone: "amber", bold: true, aside: { text: "204 pts", tone: "amber" } });
    expect(cells[11]).toMatchObject({ text: "Pressure cooker", tone: "teal" });
    expect(cells[12]).toMatchObject({ text: "× 1", tone: "teal", bold: true });
  });

  it("says why there is no gift", () => {
    expect(bestGiftText(velan).text).toBe("blocked — suspended");
    expect(bestGiftText(noScheme).text).toBe("— no scheme");
    expect(bestGiftText(cashCustomer).text).toBe("— none reachable");
    const none = memberCells(noScheme, TODAY);
    expect(none[9].text).toBe("—");
    expect(none[10]).toMatchObject({ text: "no open lots", tone: "muted" });
    expect(memberCells(velan, TODAY)[4].chip).toBe("amber");
  });

  it("stars Earned when the period is on", () => {
    expect(memberColumns(false)[5].title).toBe("Earned");
    expect(memberColumns(true)[5].title).toBe("Earned*");
  });
});

describe("the Total row, tiles and note", () => {
  it("sums the rows only when every row is in; Balance and Value from the summary", () => {
    const totals = memberTotals([cashCustomer, lakshmi], membersSummary, 2);
    expect(texts(totals)).toEqual(["", "Total  (2)", "", "", "", "4,242", "1,400", "200", "51", "51.00", "", "", "", ""]);
    const cut = memberTotals([cashCustomer], membersSummary, 11);
    expect(texts(cut).slice(1, 10)).toEqual(["Total  (1 of 11 shown)", "", "", "", "", "", "", "51", "51.00"]);
  });

  it("fills the six tiles from the summary", () => {
    const tiles = memberTiles(membersSummary, defaultMembers(TODAY));
    expect(tiles.map((t) => [t.caption, t.value, t.sub])).toEqual([
      ["MEMBERS", "11", "11 active · 0 suspended"],
      ["POINTS OUTSTANDING", "51", "= ₹ 51.00"],
      ["EARNED  (LIFETIME)", "51", "on 38 bills"],
      ["REDEEMED", "0", "₹ 0.00 as tender"],
      ["GIFT-ELIGIBLE NOW", "0", "members · 0 gifts low on stock"],
      ["EXPIRING ≤ 30 DAYS", "0", "0 members · see Expiring soon"],
    ]);
    const period = memberTiles(membersSummary, { ...defaultMembers(TODAY), earned: true });
    expect(period[2].caption).toBe("EARNED  01/04 → 31/10");
    expect(memberTiles(null, defaultMembers(TODAY))[0]).toMatchObject({ value: "—", sub: "" });
  });

  it("explains the columns, with the period when it is on", () => {
    expect(membersNote(0, defaultMembers(TODAY))).toBe("No member matches these filters.");
    expect(membersNote(3, { ...defaultMembers(TODAY), earned: true })).toMatch(
      /^\* Earned in the period \(01\/04\/2026 → 31\/10\/2026\)\. {2}Redeemed includes gifts\./,
    );
  });
});
