import { describe, expect, it } from "vitest";
import type { VoucherPayload } from "../vouchers.types";
import { billRows, billsFromDraft, buildAllocations, editCardBill, PARTY_KEY, picksOf } from "./bills";
import { readPosted } from "./generated";
import { blankLine, buildHeader, buildLines, linesFromDraft, newLineSide, type HeaderDraft, type VoucherLine } from "./lines";

const HEADER: HeaderDraft = {
  voucherId: null,
  companyId: "co",
  branchId: "br",
  accYear: "2026-2027",
  typeCode: "PurA",
  date: "2026-10-03",
  docRefno: "SFS/42",
  docDate: "",
  remarks: "",
  employeeId: "",
  partyId: "supplier",
  partyName: "Sundaram",
  posStcd: "29",
  reverseCharge: true,
  dueDays: 30,
};

function line(partial: Partial<VoucherLine>): VoucherLine {
  return { ...blankLine("DR"), ledgerId: "led", ledgerName: "L", ...partial };
}

describe("one-party header", () => {
  it("sends the party, the chosen place of supply and the reverse charge — only where the type has them", () => {
    expect(buildHeader(HEADER, { partyOne: true, gstBand: true, gstInput: true })).toMatchObject({
      partyId: "supplier",
      posStcd: "29",
      reverseCharge: true,
      docRefno: "SFS/42",
    });
    // An output type says no reverse charge at all; no band, no place of supply.
    const sale = buildHeader(HEADER, { partyOne: true, gstBand: true, gstInput: false });
    expect(sale).not.toHaveProperty("reverseCharge");
    const journal = buildHeader(HEADER, {});
    expect(journal).not.toHaveProperty("partyId");
    expect(journal).not.toHaveProperty("posStcd");
    // The server's default place of supply is not sent back to it.
    expect(buildHeader({ ...HEADER, posStcd: "" }, { partyOne: true, gstBand: true })).not.toHaveProperty("posStcd");
  });

  it("opens a new line opposite the party", () => {
    expect(newLineSide([], { partyMode: "ONE", partySide: "DR" })).toBe("CR"); // a sale's income lines
    expect(newLineSide([], { partyMode: "ONE", partySide: "CR" })).toBe("DR"); // a purchase's expenses
    expect(newLineSide([], { partyMode: "MANY", partySide: "ANY" })).toBe("DR"); // a journal
  });
});

describe("the GST band on the lines", () => {
  it("sends a rate only on the tax side, with HSN and ITC when said", () => {
    const lines = [
      line({ drCr: "DR", amount: "25000", taxId: "gst18", hsn: " 998533 ", itcEligibility: "INPUT_SERVICES" }),
      line({ drCr: "DR", amount: "4000", taxId: "gst12" }),
      line({ drCr: "CR", amount: "10", taxId: "gst18" }),
      line({ drCr: "DR", amount: "100", taxId: "" }),
    ];
    expect(buildLines(lines, { gstSide: "DR" }).lines.map((body) => body.gst ?? null)).toEqual([
      { taxId: "gst18", hsn: "998533", itcEligibility: "INPUT_SERVICES" },
      { taxId: "gst12" },
      null,
      null,
    ]);
    // No band: never a gst object.
    expect(buildLines(lines).lines.every((body) => !("gst" in body))).toBe(true);
  });

  it("reads a draft's rates back", () => {
    const [read] = linesFromDraft({
      lines: [{ rowNo: 1, drCr: "DR", ledgerId: "x", amount: "100.00", gst: { taxId: "gst18", hsn: "4820", itcEligibility: null } }],
    });
    expect(read).toMatchObject({ taxId: "gst18", hsn: "4820", itcEligibility: "" });
  });
});

describe("the one-party bill card", () => {
  const bills = [
    { ablId: "adv", ablAccYear: "2026-2027", refno: "pmv00129", docRefno: "pmv00129", date: "2026-09-28", dueDate: null, billType: "ADVANCE", side: "DR" as const, billAmount: 82, pending: 82 },
  ];

  it("keeps the figures on the party leg — lineRowNo 0 — never above what the bill owes", () => {
    const rows = editCardBill(billRows(bills, []), 0, "500");
    expect(rows[0].thisPaise).toBe(8200);
    const kept = { [PARTY_KEY]: { picks: picksOf(rows), auto: false } };
    expect(buildAllocations(kept, new Map([[1, "line-a"]]))).toEqual([
      { lineRowNo: 0, billId: "adv", billAccYear: "2026-2027", amount: "82.00" },
    ]);
  });

  it("reads a draft's party-leg allocations back onto the card", () => {
    expect(billsFromDraft({ allocations: [{ lineRowNo: 0, billId: "adv", billAccYear: "2026-2027", amount: "40.00" }] }, new Map())).toEqual({
      [PARTY_KEY]: { picks: [{ billId: "adv", billAccYear: "2026-2027", label: "", paise: 4000 }], auto: false },
    });
  });
});

describe("a posted purchase read back", () => {
  it("takes each line's rate from the GST document and names the server's legs", () => {
    const leg = (partial: Record<string, unknown>) => ({ remarks: null, groupName: null, generated: false, role: null, ...partial });
    const payload = {
      header: { voucherId: "pua", partyId: "sundaram" },
      legs: [
        leg({ avId: "1", rowNo: 1, drCr: "DR", ledgerId: "hk", ledgerName: "Housekeeping", amount: 25000 }),
        leg({ avId: "2", rowNo: 2, drCr: "DR", ledgerId: "ps", ledgerName: "Printing & Stationery", amount: 4000 }),
        leg({ avId: "3", rowNo: 3, drCr: "DR", ledgerId: "icgst", ledgerName: "Input CGST", amount: 2490, generated: true, role: "INPUT_CGST" }),
        leg({ avId: "5", rowNo: 5, drCr: "CR", ledgerId: "tds", ledgerName: "TDS Payable", amount: 500, generated: true, role: "TDS_PAYABLE", remarks: "TDS 194C @ 2% on 25000.00" }),
        leg({ avId: "6", rowNo: 6, drCr: "CR", ledgerId: "sundaram", ledgerName: "Sundaram", amount: 33480, generated: true, remarks: "Balances the voucher" }),
      ],
      gstDoc: {
        lines: [
          { rowNo: 1, taxId: "gst18", hsn: "998533", isService: true, taxable: 25000, ratePerc: 18, cgst: 2250, sgst: 2250, igst: 0, cess: 0, itcEligibility: "INPUT_SERVICES" },
          { rowNo: 2, taxId: "gst12", hsn: "4820", isService: false, taxable: 4000, ratePerc: 12, cgst: 240, sgst: 240, igst: 0, cess: 0, itcEligibility: "INPUTS" },
        ],
      },
    } as unknown as VoucherPayload;
    const read = readPosted(payload);
    expect(read.lines.map((row) => [row.ledgerName, row.taxId, row.hsn, row.itcEligibility])).toEqual([
      ["Housekeeping", "gst18", "998533", "INPUT_SERVICES"],
      ["Printing & Stationery", "gst12", "4820", "INPUTS"],
    ]);
    expect(read.generated.map((row) => [row.ledgerName, row.narration])).toEqual([
      ["Input CGST", "from the GST band"],
      ["TDS Payable", "TDS 194C @ 2% on 25000.00 · from the party's TDS section"],
      ["Sundaram", "Balances the voucher"],
    ]);
  });
});
