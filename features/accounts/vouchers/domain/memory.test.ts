import { describe, expect, it } from "vitest";
import { isVoucherWorthRemembering, resumeTypeCode, voucherMemoryKey } from "./memory";

describe("the slot of a voucher menu", () => {
  it("is the type's own, and the register's for none", () => {
    expect(voucherMemoryKey("Jrl")).toBe("accounts/vouchers/Jrl");
    expect(voucherMemoryKey("")).toBe("accounts/vouchers/register");
    expect(voucherMemoryKey("Con")).not.toBe(voucherMemoryKey("Jrl"));
  });
});

describe("which voucher is worth bringing back", () => {
  it("keeps keying on a NEW voucher, not a blank one", () => {
    expect(isVoucherWorthRemembering({ dirty: true, doc: { status: "NEW", editable: true } })).toBe(true);
    expect(isVoucherWorthRemembering({ dirty: false, doc: { status: "NEW", editable: true } })).toBe(false);
  });

  it("keeps an edited DRAFT only while it is open for editing", () => {
    expect(isVoucherWorthRemembering({ dirty: true, doc: { status: "DRAFT", editable: true } })).toBe(true);
    expect(isVoucherWorthRemembering({ dirty: true, doc: { status: "DRAFT", editable: false } })).toBe(false);
    // Just saved, or read from the register: the server has it.
    expect(isVoucherWorthRemembering({ dirty: false, doc: { status: "DRAFT", editable: true } })).toBe(false);
  });

  it("never keeps a POSTED or CANCELLED voucher", () => {
    expect(isVoucherWorthRemembering({ dirty: true, doc: { status: "POSTED", editable: false } })).toBe(false);
    expect(isVoucherWorthRemembering({ dirty: true, doc: { status: "CANCELLED", editable: false } })).toBe(false);
  });
});

describe("the type a remembered voucher reopens on", () => {
  it("is the menu's own type", () => {
    expect(resumeTypeCode("Jrl", { typeCode: "Jrl" })).toBe("Jrl");
  });

  it("is the remembered type on the register", () => {
    expect(resumeTypeCode("", { typeCode: "CrN" })).toBe("CrN");
    expect(resumeTypeCode("", null)).toBe("");
  });
});
