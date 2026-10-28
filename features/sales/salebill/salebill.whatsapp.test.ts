/**
 * Sale Bill — WhatsApp send: which number the chat opens on, the message, and
 * the link. Pure.
 */
import { describe, expect, it } from "vitest";
import {
  buildBillWhatsappMessage,
  customerContactsOf,
  formatLinkExpiry,
  formatWhatsappNumber,
  normalizeWhatsappNumber,
  whatsappCandidates,
  whatsappBlockedReason,
  whatsappChatUrl,
  whatsappPdfFilename,
  whatsappTargetOfBill,
} from "./salebill.whatsapp";
import type { BillPayload } from "./salebill.types";

describe("normalizeWhatsappNumber", () => {
  it("dials a 10-digit Indian mobile under +91, however it was keyed", () => {
    expect(normalizeWhatsappNumber("9876543210")).toBe("919876543210");
    expect(normalizeWhatsappNumber("98765 43210")).toBe("919876543210");
    expect(normalizeWhatsappNumber("98765-43210")).toBe("919876543210");
    expect(normalizeWhatsappNumber("(98765) 43210")).toBe("919876543210");
  });

  it("drops the trunk 0", () => {
    expect(normalizeWhatsappNumber("09876543210")).toBe("919876543210");
  });

  it("keeps a number that already carries its country code", () => {
    expect(normalizeWhatsappNumber("+91 98765 43210")).toBe("919876543210");
    expect(normalizeWhatsappNumber("919876543210")).toBe("919876543210");
    expect(normalizeWhatsappNumber("0091 98765 43210")).toBe("919876543210");
  });

  it("takes a +-prefixed foreign number as keyed", () => {
    expect(normalizeWhatsappNumber("+971 50 123 4567")).toBe("971501234567");
    expect(normalizeWhatsappNumber("+44 20 7946 0958")).toBe("442079460958");
  });

  it("refuses an Indian landline keyed with its STD code", () => {
    expect(normalizeWhatsappNumber("044-28123456")).toBeNull();
    expect(normalizeWhatsappNumber("4428123456")).toBeNull();
  });

  it("dials a 10-digit number under another country code without the mobile rule", () => {
    expect(normalizeWhatsappNumber("2025550123", "1")).toBe("12025550123");
  });

  it("refuses blanks, stubs and over-long numbers", () => {
    expect(normalizeWhatsappNumber(null)).toBeNull();
    expect(normalizeWhatsappNumber("")).toBeNull();
    expect(normalizeWhatsappNumber("   ")).toBeNull();
    expect(normalizeWhatsappNumber("12345")).toBeNull();
    expect(normalizeWhatsappNumber("+1234567890123456")).toBeNull();
    expect(normalizeWhatsappNumber("abc")).toBeNull();
  });
});

describe("formatWhatsappNumber", () => {
  it("groups an Indian mobile the way it is read aloud", () => {
    expect(formatWhatsappNumber("919876543210")).toBe("+91 98765 43210");
  });

  it("prefixes anything else with +", () => {
    expect(formatWhatsappNumber("971501234567")).toBe("+971501234567");
  });
});

describe("customerContactsOf", () => {
  it("reads the three numbers off /customers/get", () => {
    expect(
      customerContactsOf({
        cusId: "x",
        cusWhatsappNo: " 9876543210 ",
        cusPhone1: "9000000001",
        cusPhone2: "",
      }),
    ).toEqual({ whatsappNo: "9876543210", phone1: "9000000001", phone2: null });
  });

  it("answers no numbers for anything that is not a record", () => {
    expect(customerContactsOf(null)).toEqual({ whatsappNo: null, phone1: null, phone2: null });
    expect(customerContactsOf([])).toEqual({ whatsappNo: null, phone1: null, phone2: null });
  });
});

describe("whatsappCandidates", () => {
  it("puts the WhatsApp number first, then the bill's phone, then the master's", () => {
    expect(
      whatsappCandidates({
        whatsappNo: "9876543210",
        billPhone: "9123456780",
        contactNo: "9988776655",
        phone1: "9000000001",
        phone2: "9000000002",
      }),
    ).toEqual([
      { number: "919876543210", label: "WhatsApp no." },
      { number: "919123456780", label: "Phone on the bill" },
      { number: "919988776655", label: "Contact no." },
      { number: "919000000001", label: "Phone 1" },
      { number: "919000000002", label: "Phone 2" },
    ]);
  });

  it("offers each number once, under the first name it appears by", () => {
    expect(
      whatsappCandidates({
        whatsappNo: "+91 98765 43210",
        billPhone: "9876543210",
        phone1: "09876543210",
      }),
    ).toEqual([{ number: "919876543210", label: "WhatsApp no." }]);
  });

  it("skips numbers that cannot be dialled", () => {
    expect(
      whatsappCandidates({ whatsappNo: "", billPhone: "044-28123456", phone1: "9000000001" }),
    ).toEqual([{ number: "919000000001", label: "Phone 1" }]);
  });

  it("is empty for a walk-in with no phone", () => {
    expect(whatsappCandidates({})).toEqual([]);
  });
});

describe("buildBillWhatsappMessage", () => {
  it("names the bill, its date and amount, and signs with the company", () => {
    expect(
      buildBillWhatsappMessage({
        customerName: "Ravi Textiles",
        billRefno: "bil00030",
        billDate: "2026-10-28",
        amount: 123456.5,
        companyName: "THE SCM SILK",
      }),
    ).toBe(
      [
        "Dear Ravi Textiles,",
        "",
        "Please find attached your bill bil00030 dated 28-10-2026 for ₹1,23,456.50.",
        "",
        "Thank you for your business.",
        "THE SCM SILK",
      ].join("\n"),
    );
  });

  it("points at the bill's link instead of an attachment when there is one", () => {
    expect(
      buildBillWhatsappMessage({
        customerName: "Balu S",
        billRefno: "bil00016",
        billDate: "2026-10-22",
        amount: 228,
        companyName: "Amazon Retail India Private Limited",
        link: "https://erp.example.com/api/v1/print-share/k3J9xQ2mP7vT5wL8nR4sYb/bill-bil00016.pdf",
      }),
    ).toBe(
      [
        "Dear Balu S,",
        "",
        "Your bill bil00016 dated 22-10-2026 for ₹228.00 is ready. You can view and download it here:",
        "https://erp.example.com/api/v1/print-share/k3J9xQ2mP7vT5wL8nR4sYb/bill-bil00016.pdf",
        "",
        "Thank you for your business.",
        "Amazon Retail India Private Limited",
      ].join("\n"),
    );
  });

  it("leaves out what it does not know", () => {
    expect(
      buildBillWhatsappMessage({ customerName: "  ", billRefno: "", billDate: "", amount: 0 }),
    ).toBe(
      ["Dear Customer,", "", "Please find attached your bill.", "", "Thank you for your business."].join("\n"),
    );
  });
});

describe("whatsappChatUrl", () => {
  it("opens WhatsApp Web on the chat with the message encoded", () => {
    expect(whatsappChatUrl("919876543210", "Dear A & B,\nBill #1", "web")).toBe(
      "https://web.whatsapp.com/send?phone=919876543210&text=Dear%20A%20%26%20B%2C%0ABill%20%231",
    );
  });

  it("opens the installed app through its own scheme", () => {
    expect(whatsappChatUrl("919876543210", "Hi", "app")).toBe(
      "whatsapp://send?phone=919876543210&text=Hi",
    );
  });
});

describe("whatsappPdfFilename", () => {
  it("names the file after the bill, the same stem Print saves under", () => {
    expect(whatsappPdfFilename("bil00030", "id-1")).toBe("bill-bil00030");
    expect(whatsappPdfFilename(null, "id-1")).toBe("bill-id-1");
  });
});

describe("whatsappBlockedReason", () => {
  const saved = { docId: "sb-1", isNewEntry: false, isDirty: false, status: "POSTED", canPrint: true };

  it("lets a saved, unchanged bill go", () => {
    expect(whatsappBlockedReason(saved)).toBeNull();
    expect(whatsappBlockedReason({ ...saved, status: "DRAFT" })).toBeNull();
  });

  it("needs the bill saved", () => {
    expect(whatsappBlockedReason({ ...saved, docId: null })).toMatch(/Save the bill first/);
    expect(whatsappBlockedReason({ ...saved, isNewEntry: true })).toMatch(/Save the bill first/);
  });

  it("needs the print right", () => {
    expect(whatsappBlockedReason({ ...saved, canPrint: false })).toMatch(/right to print/);
  });

  it("refuses unsaved edits, which the PDF would not show", () => {
    expect(whatsappBlockedReason({ ...saved, isDirty: true })).toMatch(/Save your changes/);
  });

  it("refuses a cancelled bill", () => {
    expect(whatsappBlockedReason({ ...saved, status: "cancelled" })).toMatch(/cancelled/);
  });
});

describe("whatsappTargetOfBill", () => {
  it("takes the key, customer, phone, date and amount off /bills/get", () => {
    const bill = {
      sbId: "sb-1",
      sbCompanyId: "co-1",
      sbBranchId: "br-1",
      sbAccYear: "2026-2027",
      sbBillRefno: "bil00030",
      sbBillDate: "2026-10-28T00:00:00.000Z",
      sbCustId: "cus-1",
      sbCustName: "Ravi Textiles",
      sbCustPhone: "9876543210",
      sbBillAmt: "1180.00",
    } as unknown as BillPayload;
    expect(whatsappTargetOfBill(bill)).toEqual({
      docKey: { sbId: "sb-1", sbCompanyId: "co-1", sbBranchId: "br-1", sbAccYear: "2026-2027" },
      billRefno: "bil00030",
      custId: "cus-1",
      customerName: "Ravi Textiles",
      billPhone: "9876543210",
      billDate: "2026-10-28",
      amount: 1180,
    });
  });

  it("reads a walk-in with no master row and no refno", () => {
    const bill = {
      sbId: "sb-2",
      sbCompanyId: "co-1",
      sbBranchId: "br-1",
      sbAccYear: "2026-2027",
      sbBillRefno: null,
      sbBillDate: "2026-10-28",
      sbCustId: null,
      sbCustName: "CASH",
      sbCustPhone: null,
      sbBillAmt: null,
    } as unknown as BillPayload;
    const target = whatsappTargetOfBill(bill);
    expect(target.custId).toBeNull();
    expect(target.billRefno).toBe("");
    expect(target.amount).toBe(0);
  });
});

describe("formatLinkExpiry", () => {
  it("reads an ISO timestamp as a local dd-mm-yyyy date", () => {
    expect(formatLinkExpiry(new Date(2026, 10, 27, 12, 0).toISOString())).toBe("27-11-2026");
  });

  it("is blank for nothing or nonsense", () => {
    expect(formatLinkExpiry(null)).toBe("");
    expect(formatLinkExpiry("soon")).toBe("");
  });
});
