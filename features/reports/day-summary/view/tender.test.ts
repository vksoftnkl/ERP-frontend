import { describe, expect, it } from "vitest";
import { noTenderFixture, tenderDayBookFixture } from "../testing/fixtures";
import { parseNoTender, parseTenderDayBook } from "../wire/parse";
import {
  isNoTender,
  isUntendered,
  NO_TENDER_CLEAN,
  NO_TENDER_LABEL,
  noTenderCells,
  noTenderHead,
  noTenderTabLabel,
  sumAmounts,
  tenderFootText,
  tenderGroupCells,
} from "./tender";

const byTender = () => parseTenderDayBook(tenderDayBookFixture({ fromDate: "2026-10-09" }));
const byType = () => parseTenderDayBook(tenderDayBookFixture({ fromDate: "2026-10-09", groupBy: "TYPE" }));
const noTender = (q: Record<string, string> = {}) =>
  parseNoTender(noTenderFixture({ fromDate: "2026-10-09", toDate: "2026-10-09", ...q }));

describe("By tender — the grid", () => {
  it("prints opening / closing as Dr / Cr, the way the ledger statement does", () => {
    const cash = tenderGroupCells(byTender().groups[2]);
    expect(cash).toEqual({
      ledger: "Cash in Hand",
      type: "CASH",
      tender: "CASH",
      opening: "18,250.00 Dr",
      debit: "1,10,300.00",
      credit: "86,200.00",
      closing: "42,350.00 Dr",
      danger: false,
    });
    const card = tenderGroupCells(byTender().groups[0]);
    expect([card.type, card.tender, card.opening, card.debit]).toEqual([
      "CARD",
      "CARD – HDFC machine 1",
      "26,400.50 Dr",
      "26,400.50",
    ]);
  });

  it("names a group with no tender and no tender type, and paints it red only when it moved in the range", () => {
    const groups = byTender().groups;
    const moved = tenderGroupCells(groups[3]);
    expect(moved).toMatchObject({ type: NO_TENDER_LABEL, tender: "", opening: "0.00", debit: "0.00", credit: "2,500.00" });
    expect(moved.closing).toBe("2,500.00 Cr");
    expect(moved.danger).toBe(true);
    // HDFC's no-tender group is history only: an opening, nothing in the range.
    const history = tenderGroupCells(groups[5]);
    expect(history).toMatchObject({ type: NO_TENDER_LABEL, opening: "1,200.00 Cr", closing: "1,200.00 Cr", danger: false });
    expect(groups.filter(isNoTender)).toHaveLength(2);
    expect(groups.filter(isUntendered)).toHaveLength(1);
  });

  it("under Tender type, a group with a type is never 'no tender' though its tenderId is null", () => {
    const groups = byType().groups;
    expect(groups.every((g) => g.tenderId === null)).toBe(true);
    expect(groups.filter(isNoTender).map((g) => g.ledgerName)).toEqual(["Cash in Hand", "HDFC Bank CA"]);
    expect(groups.filter(isUntendered).map((g) => g.ledgerName)).toEqual(["Cash in Hand"]);
  });

  it("the footer: groups, Σ debit, Σ credit and the red ones", () => {
    expect(tenderFootText(byTender().groups)).toBe(
      "7 groups · debit 3,40,320.00 · credit 2,47,100.00 · 1 with no tender in the range",
    );
    // The same money by type: fewer groups, the same sums.
    expect(tenderFootText(byType().groups)).toBe(
      "6 groups · debit 3,40,320.00 · credit 2,47,100.00 · 1 with no tender in the range",
    );
    const clean = byTender().groups.filter((g) => !isUntendered(g));
    expect(tenderFootText(clean)).toBe("6 groups · debit 3,40,320.00 · credit 2,44,600.00");
    expect(tenderFootText([])).toBe("0 groups · debit 0.00 · credit 0.00");
  });

  it("sums exactly on the digits: no float, any scale, signs kept", () => {
    expect(sumAmounts(["0.10", "0.20"])).toBe("0.30");
    expect(sumAmounts(["26400.50", "11999.50"])).toBe("38400.00");
    expect(sumAmounts(["-5.5", "2.25"])).toBe("-3.25");
    expect(sumAmounts(["1.005", "0.005"])).toBe("1.010");
    expect(sumAmounts(["99999999999999999.99", "0.01"])).toBe("100000000000000000.00");
    expect(sumAmounts([])).toBe("0.00");
    // Never a silent zero.
    expect(() => sumAmounts(["1,000.00"])).toThrow('not an amount: "1,000.00"');
  });
});

describe("No tender — the head, the tab and the list", () => {
  it("is green and says so when the range is clean", () => {
    const clean = noTender({ fromDate: "2026-10-10", toDate: "2026-10-10" });
    expect(noTenderHead(clean)).toEqual({ tone: "ok", text: NO_TENDER_CLEAN });
    expect(NO_TENDER_CLEAN).toBe("No cash or bank line without a tender in this range. This is how it should be.");
    expect(noTenderTabLabel(clean.count)).toBe("No tender");
  });

  it("is red with the count, the amount and the count per voucher type", () => {
    const d = noTender({ limit: "500" });
    expect(noTenderHead(d)).toEqual({
      tone: "bad",
      text: "2 cash / bank lines with no tender, 2,500.00 — each one is a transaction to look into. · Rev 1, TDrp 1",
    });
    expect(noTenderTabLabel(d.count)).toBe("No tender (2)");
  });

  it("says when only the first lines are listed, and words one line in the singular", () => {
    expect(noTenderHead(noTender({ limit: "1" })).text).toBe(
      "2 cash / bank lines with no tender, 2,500.00 — each one is a transaction to look into. · Rev 1, TDrp 1 (first 1 shown)",
    );
    const one = { count: 1, amount: "1500.00", byVoucherType: [{ voucherTypeCode: null, count: 1, amount: "1500.00" }], rows: [] };
    expect(noTenderHead(one).text).toBe(
      "1 cash / bank line with no tender, 1,500.00 — each one is a transaction to look into. · — 1 (first 0 shown)",
    );
  });

  it("labels the tab only once a count is in", () => {
    expect(noTenderTabLabel(null)).toBe("No tender");
    expect(noTenderTabLabel(0)).toBe("No tender");
    expect(noTenderTabLabel(1234)).toBe("No tender (1,234)");
  });

  it("prints a line as the Qt list: zero side blank, a reversal mirror marked", () => {
    const [drop, mirror] = noTender().rows;
    expect(noTenderCells(drop)).toEqual({
      date: "09/10/2026",
      voucher: "tdr00007",
      kind: "TDrp",
      party: "",
      ledger: "Cash in Hand",
      debit: "",
      credit: "1,500.00",
    });
    expect(noTenderCells(mirror)).toMatchObject({ kind: "Rev (reversal)", party: "Cash Sales", credit: "1,000.00" });
    expect(noTenderCells({ ...drop, voucherNo: null, voucherTypeCode: null }).voucher).toBe("—");
  });
});
