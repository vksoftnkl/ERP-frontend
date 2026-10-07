import { describe, expect, it } from "vitest";
import { eventTone, historySummary, settledOf, toHistoryRows } from "./history";
import type { TempCreditRow } from "./row";

const ROW: TempCreditRow = {
  atc_id: "019f0000-0000-7000-8000-00000000a7c1",
  atc_company_id: "c-1",
  atc_branch_id: "b-1",
  atc_acc_year: "2026-2027",
  atc_bill_date: "2026-10-01",
  atc_bill_refno: "SB/0042",
  atc_name: "ZT Borrower",
  atc_mobile: "9865500000",
  atc_place: "",
  atc_credit_amount: 210,
  atc_balance_amount: 200,
  atc_due_date: "2026-10-08",
  days_overdue: 0,
  atc_status: "PARTIAL",
  atc_promise_date: "",
  atc_created_by: "vkpos",
  atc_src_doc_id: "sb-1",
  atc_abl_id: "abl-1",
  atc_party_id: "led-1",
  atc_party_name: "WALK-IN",
};

const PAYLOAD = {
  data: [
    { th_key: "j1", th_sort: "20261003101500000000" + "4", th_event: "Received", th_amount: "10.00", th_kind: "SETTLE" },
    { th_key: "c1", th_sort: "20261001090000000000" + "2", th_event: "Credit given", th_amount: 210, th_kind: "CREDIT" },
    { th_key: "b1", th_sort: "20261001090000000000" + "1", th_event: "Bill posted", th_amount: null, th_kind: "bill" },
    { th_key: "j0", th_sort: "20261001090000000001" + "4", th_event: "Paid with the bill", th_amount: 300, th_kind: "COUNTER" },
    { th_key: "f1", th_sort: "20261002120000000000" + "3", th_event: "Follow-up", th_amount: "", th_kind: "FOLLOWUP" },
  ],
};

describe("toHistoryRows", () => {
  const rows = toHistoryRows(PAYLOAD);

  it("reads the trail oldest first on th_sort — the grid has no ORDER BY", () => {
    expect(rows.map((row) => row.th_key)).toEqual(["b1", "c1", "j0", "f1", "j1"]);
  });

  it("keeps a missing amount as null, not zero", () => {
    expect(rows.find((row) => row.th_key === "b1")?.th_amount).toBeNull();
    expect(rows.find((row) => row.th_key === "f1")?.th_amount).toBeNull();
    expect(rows.find((row) => row.th_key === "j1")?.th_amount).toBe(10);
  });

  it("upper-cases the kind", () => {
    expect(rows[0].th_kind).toBe("BILL");
  });
});

describe("settledOf — the loan's money only", () => {
  it("sums SETTLE rows and leaves the till's COUNTER cash out", () => {
    expect(settledOf(toHistoryRows(PAYLOAD))).toBe(10);
  });
});

describe("eventTone — what happened, in the Qt trail's colours", () => {
  it("names the trail's own events", () => {
    expect(eventTone("Bill posted")).toBe("green");
    expect(eventTone("Paid with the bill")).toBe("green");
    expect(eventTone("Follow-up")).toBe("amber");
    expect(eventTone("Bill retendered")).toBe("amber");
    expect(eventTone("Written off")).toBe("red");
    expect(eventTone("Bill cancelled")).toBe("red");
    expect(eventTone("Credit given")).toBe("blue");
    expect(eventTone("Bill created")).toBe("grey");
  });

  it("matches any case", () => {
    expect(eventTone("REVERSED")).toBe("red");
    expect(eventTone("received")).toBe("green");
  });

  it("reads an unnamed event by its words, grey when it says nothing known", () => {
    expect(eventTone("Bill deleted")).toBe("red");
    expect(eventTone("Bill unposted")).toBe("amber");
    expect(eventTone("Bill reopened")).toBe("green");
    expect(eventTone("Something new")).toBe("grey");
  });
});

describe("historySummary", () => {
  it("is empty with no rows, as Qt hides the card", () => {
    expect(historySummary(ROW, [])).toEqual([]);
  });

  it("says who, what was lent, settled and owed, the state, the due date and the count", () => {
    const line = historySummary(ROW, toHistoryRows(PAYLOAD))
      .map((part) => `${part.lead}${part.value}`)
      .join(" · ");
    expect(line).toBe(
      "ZT Borrower · 9865500000 · credit 210.00 · settled 10.00 · balance 200.00 · now PARTIAL · due 08-10-2026 · 5 events",
    );
  });

  it("bolds the name, the balance and the state", () => {
    const strong = historySummary(ROW, toHistoryRows(PAYLOAD))
      .filter((part) => part.strong)
      .map((part) => part.value);
    expect(strong).toEqual(["ZT Borrower", "200.00", "PARTIAL"]);
  });

  it("drops the due date when there is none, and counts one event singular", () => {
    const rows = toHistoryRows({ data: [PAYLOAD.data[1]] });
    const line = historySummary({ ...ROW, atc_due_date: "" }, rows).map((part) => part.value);
    expect(line.some((value) => value.startsWith("due"))).toBe(false);
    expect(line.at(-1)).toBe("1 event");
  });
});
