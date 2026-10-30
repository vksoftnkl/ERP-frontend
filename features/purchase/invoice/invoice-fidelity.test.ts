import { describe, expect, it } from "vitest";
import {
  billFromOptions,
  checkChips,
  dueText,
  factsOf,
  headerExtDto,
  headerExtFromHeader,
  pickBillFrom,
  placeOfSupplyText,
  priceKeptText,
  refusalsOfError,
  reverseChargeText,
  sourceText,
  totalsRows,
  EMPTY_HEADER_EXT,
} from "./invoice-fidelity";

describe("purchase invoice rebuild — header", () => {
  it("sends the new keys as Qt buildPayload does", () => {
    expect(headerExtDto(EMPTY_HEADER_EXT)).toEqual({ mode: "CREDIT", agentId: null });
    const dto = headerExtDto({ ...EMPTY_HEADER_EXT, creditDays: "30", irn: " X ", billFromGstin: "33A", goodsReceivedOn: "2026-10-29", goodsTyped: true, transportTouched: true, transport: null });
    expect(dto).toEqual({ goodsReceivedOn: "2026-10-29", mode: "CREDIT", creditDays: 30, irn: "X", agentId: null, billFromGstin: "33A", transport: null });
    // goods received not typed = the server's own
    expect(headerExtDto({ ...EMPTY_HEADER_EXT, goodsReceivedOn: "2026-10-29" })).not.toHaveProperty("goodsReceivedOn");
  });
  it("reads a stored bill (transport + vehicle / driver)", () => {
    const ext = headerExtFromHeader({ piMode: "CREDIT", piCreditDays: 30, piAgentId: "a1", agentName: "ZT Agent", billFromGstin: "33A", piVehicleNo: "TN38", transport: { lrNo: "1" } });
    expect(ext.creditDays).toBe("30");
    expect(ext.creditDaysTyped).toBe(true);
    expect(ext.agentName).toBe("ZT Agent");
    expect(ext.transport).toEqual({ lrNo: "1", vehicleNo: "TN38", driverName: null });
    expect(ext.transportTouched).toBe(false);
  });
  it("words the facts the server works out", () => {
    const facts = factsOf({ posStcd: "33", isReverseCharge: false, reverseChargeReason: "regular supplier", creditDueDate: "2026-11-28" }, false);
    const options = billFromOptions({ billFrom: [{ gstin: "33A", stateCode: "33", stateName: "Tamil Nadu", isDefault: true }] });
    expect(placeOfSupplyText(facts, options, "33A")).toBe("Tamil Nadu (33) · local");
    expect(reverseChargeText(facts)).toBe("No — regular supplier");
    expect(dueText(facts)).toBe("→ due 28/11/2026");
    expect(pickBillFrom(options, "")).toBe("33A");
    expect(options[0].label).toBe("33A · Tamil Nadu");
  });
  it("Source says where the lines came from", () => {
    expect(sourceText([])).toBe("Direct — goods came with the bill");
    expect(sourceText([{ itemId: "i", grnItemId: "g", srcRefno: "00255" }])).toBe("From GRN 00255");
    expect(sourceText([{ itemId: "i", poItemId: "p", srcRefno: "00180" }])).toBe("From PO 00180 — goods came with the bill");
  });
});

describe("purchase invoice rebuild — Check, totals, refusals", () => {
  it("chips in Qt's order", () => {
    expect(checkChips(0, 0, null, false)).toEqual([{ text: "OK", tone: "success" }]);
    const chips = checkChips(2, 0, { rate: { basis: "LAST", diffPct: "3.2", over: true }, newMrp: { mrp: "16.00" }, serials: { have: 4, need: "5" } }, true);
    expect(chips.map((c) => c.text)).toEqual(["SHORT 2", "RATE +3.2% LAST", "NEW MRP 16", "PRICE KEPT", "4 / 5 SN"]);
    expect(chips[4].tone).toBe("danger");
    expect(priceKeptText([5])).toMatch(/^Line 5: Price not updated/);
  });
  it("the boxed TOTALS from the server's totals", () => {
    const rows = totalsRows({ taxable: "1988.00", gstTotal: "298.20", difference: "14.00", amountMatches: false, netPayable: "2286.00" }, false);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.gst.caption).toBe("GST (CGST + SGST)");
    expect(byKey.gst.value).toBe("298.20");
    expect(byKey.difference.tone).toBe("bad");
    expect(totalsRows({ difference: "0", amountMatches: true }, true).find((r) => r.key === "difference")?.value).toBe("0.00 ✓");
    expect(totalsRows(null, false).every((r) => r.value === "")).toBe(true);
  });
  it("a 422's errors[] become refusals", () => {
    const rows = refusalsOfError({ status: 422, data: { errors: [{ code: "PUR_INVOICE_AMOUNT_MISMATCH", message: "does not match" }] } });
    expect(rows).toEqual([{ code: "PUR_INVOICE_AMOUNT_MISMATCH", level: "REFUSE", lineNo: null, field: "", message: "does not match", needsRight: null }]);
    expect(refusalsOfError(new Error("x"))).toEqual([]);
  });
});
