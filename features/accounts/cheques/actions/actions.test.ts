import { describe as suite, expect, it } from "vitest";
import { chequeRow } from "../domain/fixtures";
import { RECEIVED_VOCABULARY } from "../domain/vocabulary";
import { bounceSpec, parseBounceReasons, DEFAULT_BOUNCE_REASONS } from "./bounce";
import { clearSpec } from "./clear";
import { depositSpec, representSpec } from "./deposit";
import { replaceSpec } from "./replace";
import { returnSpec } from "./returnCancel";
import { applyPatch } from "./types";

const TODAY = "2026-09-24";

suite("deposit", () => {
  const rows = [chequeRow({ instrumentDate: "2026-09-01" }), chequeRow({ instrumentDate: "2026-09-10" })];
  const form = {
    ...depositSpec.initial(rows, TODAY),
    bankLedgerId: "bank-1",
    bankLedgerName: "KVB Current",
    slipNo: " D-121 ",
  };

  it("hoists the scope and sends {apdId, apdAccYear} refs only", () => {
    const body = depositSpec.build(rows, form);
    expect(body).toEqual({
      cheques: rows.map((row) => ({ apdId: row.apdId, apdAccYear: row.accYear })),
      apdCompanyId: rows[0].companyId,
      apdBranchId: rows[0].branchId,
      bankLedgerId: "bank-1",
      depositDate: TODAY,
      slipNo: "D-121",
    });
  });

  it("sends remarks only when there are some", () => {
    expect(depositSpec.build(rows, { ...form, remarks: "  " })).not.toHaveProperty("remarks");
    expect(depositSpec.build(rows, { ...form, remarks: "morning run" })).toHaveProperty(
      "remarks",
      "morning run",
    );
  });

  it("is fresh every time — dated today, no bank, no slip", () => {
    expect(depositSpec.initial(rows, TODAY)).toEqual({
      bankLedgerId: "",
      bankLedgerName: "",
      depositDate: TODAY,
      slipNo: "",
      remarks: "",
    });
  });

  it("passes a complete form", () => {
    expect(depositSpec.validate(rows, form, TODAY)).toBeNull();
  });

  it("refuses a date before a cheque's own date, naming the cheque", () => {
    const early = { ...form, depositDate: "2026-09-05" };
    expect(depositSpec.validate(rows, early, TODAY)).toContain(rows[1].instrumentNo);
  });

  it("refuses a future date", () => {
    expect(depositSpec.validate(rows, { ...form, depositDate: "2026-09-25" }, TODAY)).toMatch(
      /future/,
    );
  });

  it("wants a bank and a slip number", () => {
    expect(depositSpec.validate(rows, { ...form, bankLedgerId: "" }, TODAY)).toMatch(/bank/);
    expect(depositSpec.validate(rows, { ...form, slipNo: "" }, TODAY)).toMatch(/slip/);
  });

  it("refuses a mixed company/branch set by name", () => {
    const stranger = chequeRow({ branchId: "b-other" });
    const message = depositSpec.validate([rows[0], stranger], form, TODAY);
    expect(message).toContain(stranger.instrumentNo);
    expect(message).toMatch(/branch/);
  });

  it("refuses an empty set", () => {
    expect(depositSpec.validate([], form, TODAY)).not.toBeNull();
  });

  it("is titled by the verb and names the slip's count and total underneath", () => {
    expect(depositSpec.verb(rows, form, RECEIVED_VOCABULARY)).toBe("Deposit");
    expect(depositSpec.summary?.(rows)).toBe("2 cheque(s) on this slip — 2,000.00");
  });
});

suite("clear", () => {
  const row = chequeRow({ status: "DEPOSITED", depositDate: "2026-09-15" });

  it("has no allocations key", () => {
    const body = clearSpec.build([row], clearSpec.initial([row], TODAY));
    expect(body).not.toHaveProperty("allocations");
    expect(body).toMatchObject({
      apdId: row.apdId,
      apdAccYear: row.accYear,
      apdCompanyId: row.companyId,
      apdBranchId: row.branchId,
      clearDate: TODAY,
      bankDate: TODAY,
    });
  });

  it("lets bankDate follow clearDate until it is edited", () => {
    let form = clearSpec.initial([row], TODAY);
    form = applyPatch(clearSpec, form, { clearDate: "2026-09-20" });
    expect(form.bankDate).toBe("2026-09-20");
    form = applyPatch(clearSpec, form, { bankDate: "2026-09-19" });
    form = applyPatch(clearSpec, form, { clearDate: "2026-09-21" });
    expect(form.bankDate).toBe("2026-09-19");
  });

  it("refuses a date before the deposit date", () => {
    const form = { ...clearSpec.initial([row], TODAY), clearDate: "2026-09-14" };
    expect(clearSpec.validate([row], form, TODAY)).toMatch(/deposited/);
  });

  it("refuses a future date", () => {
    const form = applyPatch(clearSpec, clearSpec.initial([row], TODAY), { clearDate: "2026-09-30" });
    expect(clearSpec.validate([row], form, TODAY)).toMatch(/future/);
  });

  it("acts on one row only", () => {
    expect(clearSpec.validate([row, row], clearSpec.initial([row], TODAY), TODAY)).toMatch(
      /one cheque/,
    );
  });

  it("explains the posting mode", () => {
    const form = clearSpec.initial([row], TODAY);
    expect(clearSpec.note?.([row], form)).toMatch(/Cheques In Hand/);
    expect(clearSpec.note?.([{ ...row, postingMode: "ON_CLEARING" }], form)).toMatch(/oldest first/);
  });
});

suite("bounce", () => {
  const row = chequeRow({ status: "DEPOSITED", depositDate: "2026-09-15" });
  const form = { ...bounceSpec.initial([row], TODAY), reason: "Funds insufficient" };

  it("uses reason / bankCharge / partyCharge, with zero charges present", () => {
    const body = bounceSpec.build([row], form);
    expect(body).toMatchObject({ reason: "Funds insufficient", bankCharge: 0, partyCharge: 0 });
    expect(body).not.toHaveProperty("bounceReason");
    expect(body).not.toHaveProperty("bounceCharges");
    expect(body).not.toHaveProperty("reasonText");
  });

  it("sends the charges as numbers", () => {
    const body = bounceSpec.build([row], { ...form, bankCharge: "150", partyCharge: "300.5" });
    expect(body).toMatchObject({ bankCharge: 150, partyCharge: 300.5 });
  });

  it("wants a reason", () => {
    expect(bounceSpec.validate([row], { ...form, reason: "  " }, TODAY)).toMatch(/reason/);
  });

  it("refuses a date before the deposit date, and a future one", () => {
    expect(bounceSpec.validate([row], { ...form, bounceDate: "2026-09-10" }, TODAY)).toMatch(
      /deposited/,
    );
    expect(bounceSpec.validate([row], { ...form, bounceDate: "2026-10-01" }, TODAY)).toMatch(
      /future/,
    );
  });

  it("refuses a negative or non-numeric charge", () => {
    expect(bounceSpec.validate([row], { ...form, bankCharge: "-1" }, TODAY)).toMatch(/negative/);
    expect(bounceSpec.validate([row], { ...form, partyCharge: "abc" }, TODAY)).toMatch(/number/);
  });

  it("names the money in the confirmation", () => {
    const text = bounceSpec.confirm([row], { ...form, bankCharge: "150", partyCharge: "300" }, RECEIVED_VOCABULARY);
    expect(text).toContain("the bank's 150.00 goes to bank charges");
    expect(text).toContain("the party is billed 300.00");
  });

  it("reads the reasons setting and falls back to the seeded seven", () => {
    expect(parseBounceReasons('["A", " B ", ""]')).toEqual(["A", "B"]);
    expect(parseBounceReasons("not json")).toEqual([...DEFAULT_BOUNCE_REASONS]);
    expect(parseBounceReasons(null)).toHaveLength(7);
  });
});

suite("re-present", () => {
  const row = chequeRow({ status: "BOUNCED", instrumentDate: "2026-09-01" });
  const form = {
    ...representSpec.initial([row], TODAY),
    bankLedgerId: "bank-2",
    slipNo: "D-140",
  };

  it("has no allocations key and names the row by its four keys", () => {
    const body = representSpec.build([row], form);
    expect(body).not.toHaveProperty("allocations");
    expect(body).toEqual({
      apdId: row.apdId,
      apdAccYear: row.accYear,
      apdCompanyId: row.companyId,
      apdBranchId: row.branchId,
      bankLedgerId: "bank-2",
      depositDate: TODAY,
      slipNo: "D-140",
    });
  });

  it("validates like a deposit, for one row", () => {
    expect(representSpec.validate([row], form, TODAY)).toBeNull();
    expect(representSpec.validate([row, row], form, TODAY)).toMatch(/one cheque/);
    expect(representSpec.validate([row], { ...form, slipNo: "" }, TODAY)).toMatch(/slip/);
  });
});

suite("replace", () => {
  const bounced = chequeRow({ status: "BOUNCED", amount: 2500, bankName: "SBI", drawerName: "R. Rao" });
  const held = chequeRow({ status: "HELD" });

  it("seeds amount, bank and drawer from the old cheque, and clears the rest", () => {
    expect(replaceSpec.initial([bounced], TODAY)).toMatchObject({
      instrumentNo: "",
      instrumentDate: TODAY,
      amount: "2500",
      bankName: "SBI",
      drawerName: "R. Rao",
      bankBranch: "",
      ifsc: "",
      micr: "",
    });
  });

  it("nests newCheque and omits empty optional strings", () => {
    const form = { ...replaceSpec.initial([bounced], TODAY), instrumentNo: " 221955 ", ifsc: "  " };
    const body = replaceSpec.build([bounced], form);
    expect(body).not.toHaveProperty("instrumentNo");
    expect(body).not.toHaveProperty("reason");
    expect(body.newCheque).toEqual({
      instrumentNo: "221955",
      instrumentDate: TODAY,
      amount: 2500,
      bankName: "SBI",
      drawerName: "R. Rao",
    });
  });

  it("keeps the new cheque's date within three months back and a year ahead", () => {
    const base = { ...replaceSpec.initial([bounced], TODAY), instrumentNo: "1" };
    expect(replaceSpec.validate([bounced], { ...base, instrumentDate: "2026-06-24" }, TODAY)).toBeNull();
    expect(replaceSpec.validate([bounced], { ...base, instrumentDate: "2026-06-23" }, TODAY)).toMatch(
      /stale/,
    );
    expect(replaceSpec.validate([bounced], { ...base, instrumentDate: "2027-09-24" }, TODAY)).toBeNull();
    expect(replaceSpec.validate([bounced], { ...base, instrumentDate: "2027-09-25" }, TODAY)).toMatch(
      /year ahead/,
    );
  });

  it("wants a positive amount and a number", () => {
    const base = { ...replaceSpec.initial([bounced], TODAY), instrumentNo: "1" };
    expect(replaceSpec.validate([bounced], { ...base, amount: "0" }, TODAY)).toMatch(/amount/);
    expect(replaceSpec.validate([bounced], { ...base, instrumentNo: "" }, TODAY)).toMatch(/number/);
  });

  it("takes a reason from HELD when given, and sends none when blank (the server defaults it)", () => {
    const base = { ...replaceSpec.initial([held], TODAY), instrumentNo: "1" };
    expect(replaceSpec.validate([held], base, TODAY)).toBeNull();
    expect(replaceSpec.build([held], base)).not.toHaveProperty("reason");
    const withReason = { ...base, reason: "Party asked to swap" };
    expect(replaceSpec.build([held], withReason)).toHaveProperty("reason", "Party asked to swap");
    expect(replaceSpec.validate([held], { ...base, reason: "x".repeat(251) }, TODAY)).toMatch(/250/);
  });

  it("does not need a reason from BOUNCED", () => {
    const base = { ...replaceSpec.initial([bounced], TODAY), instrumentNo: "1" };
    expect(replaceSpec.validate([bounced], base, TODAY)).toBeNull();
  });
});

suite("return / cancel", () => {
  const row = chequeRow({ status: "HELD" });

  it("sends the action and no returnDate", () => {
    const body = returnSpec.build([row], {
      action: "CANCELLED",
      reason: "Keyed twice",
      remarks: "",
    });
    expect(body).toEqual({
      apdId: row.apdId,
      apdAccYear: row.accYear,
      apdCompanyId: row.companyId,
      apdBranchId: row.branchId,
      action: "CANCELLED",
      reason: "Keyed twice",
    });
    expect(body).not.toHaveProperty("returnDate");
  });

  it("changes its verb with the choice", () => {
    const form = returnSpec.initial([row], TODAY);
    expect(returnSpec.verb([row], form, RECEIVED_VOCABULARY)).toBe("Return cheque");
    expect(returnSpec.verb([row], { ...form, action: "CANCELLED" }, RECEIVED_VOCABULARY)).toBe(
      "Cancel cheque",
    );
  });

  it("requires a reason of at most 250 characters", () => {
    const form = returnSpec.initial([row], TODAY);
    expect(returnSpec.validate([row], form, TODAY)).toMatch(/reason/);
    expect(returnSpec.validate([row], { ...form, reason: "x".repeat(251) }, TODAY)).toMatch(/250/);
    expect(returnSpec.validate([row], { ...form, reason: "Party asked" }, TODAY)).toBeNull();
  });
});
