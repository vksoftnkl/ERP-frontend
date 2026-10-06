import { describe, expect, it } from "vitest";
import {
  buildReceiptCollectHref,
  collectNotice,
  parseReceiptCollect,
  tempCreditReceive,
} from "./collect";

const ARGS = {
  partyId: "019f0000-0000-7000-8000-0000000000aa",
  partyName: "WALK-IN CUSTOMER",
  mobile: "9876543210",
  billId: "019f0000-0000-7000-8000-0000000000bb",
  ref: "SB/0042",
  name: "Ravi",
};

describe("the receipt collect hand-over", () => {
  it("round-trips through the URL", () => {
    const href = buildReceiptCollectHref(ARGS);
    expect(href.startsWith("/accounts/receipt?")).toBe(true);
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(parseReceiptCollect(params)).toEqual(ARGS);
  });

  it("keeps a name with spaces and a blank mobile", () => {
    const href = buildReceiptCollectHref({ ...ARGS, mobile: "", name: "A & B" });
    const parsed = parseReceiptCollect(new URLSearchParams(href.split("?")[1]));
    expect(parsed?.mobile).toBe("");
    expect(parsed?.name).toBe("A & B");
  });

  it("answers null for a plain receipt URL or one with no party", () => {
    expect(parseReceiptCollect(new URLSearchParams(""))).toBeNull();
    expect(parseReceiptCollect(new URLSearchParams("partyId=x"))).toBeNull();
    expect(parseReceiptCollect(new URLSearchParams("collect=1&partyId="))).toBeNull();
    expect(parseReceiptCollect(null)).toBeNull();
  });
});

describe("tempCreditReceive", () => {
  it("ticks what is pending less the deductions already on the row", () => {
    expect(tempCreditReceive({ pendingAmount: 200, discount: 10, writeOff: 0, roundOff: 0.4 })).toBe(189.6);
    expect(tempCreditReceive({ pendingAmount: 10, discount: 15, writeOff: 0, roundOff: 0 })).toBe(0);
  });
});

describe("collectNotice", () => {
  it("names the borrower and the party, or says there is nothing", () => {
    expect(collectNotice("9876543210", "Ravi", "WALK-IN", 2)).toBe(
      "Temp credit · Ravi — showing only Ravi's temp-credit bills (mobile 9876543210). Clear the mobile to see every bill of WALK-IN.",
    );
    expect(collectNotice("9876543210", "", "WALK-IN", 0)).toBe(
      "No open temp credit on WALK-IN for mobile 9876543210. Clear the mobile to see every bill.",
    );
    expect(collectNotice("", "Ravi", "WALK-IN", 2)).toBeNull();
  });
});
