import { describe, expect, it } from "vitest";
import { createScreenMemory } from "@/lib/screen-memory";
import type { TempCreditCollect } from "../domain/collect";
import type { ReceiptScope } from "../receipt.types";
import { draftReducer, initialDraft, type DraftAction, type ReceiptDraft } from "./draft";
import {
  RECEIPT_MEMORY_KEY,
  RESUME_RECEIPT_VIEW,
  initialReceiptView,
  isVoucherWorthRemembering,
  isVoucherWriteInFlight,
  voucherScopeOf,
  type ReceiptSnapshot,
} from "./memory";

const SCOPE: ReceiptScope = { companyId: "co", branchId: "br", accYear: "2026-2027" };
const OTHER_BRANCH: ReceiptScope = { ...SCOPE, branchId: "br-2" };

function run(draft: ReceiptDraft, ...actions: DraftAction[]): ReceiptDraft {
  return actions.reduce((state, action) => draftReducer(state, action).draft, draft);
}

function snapshot(draft: ReceiptDraft, tempCreditMobile = ""): ReceiptSnapshot {
  return { draft, tempCreditMobile };
}

const blank = () => initialDraft(SCOPE, "2026-10-16");
const keyed = () => run(blank(), { type: "PARTY_PICKED", partyId: "p1", partyName: "Murugan" });

const COLLECT: TempCreditCollect = {
  partyId: "walk-in",
  partyName: "Walk-in",
  mobile: "9876543210",
  billId: "abl-1",
  ref: "SB/42",
  name: "Selvi",
};
const PARTY = { partyId: "p1", partyName: "Murugan" };

describe("receipt screen memory — what is kept", () => {
  it("keeps unsaved work and nothing else", () => {
    expect(isVoucherWorthRemembering(snapshot(blank()))).toBe(false);
    expect(isVoucherWorthRemembering(snapshot(keyed()))).toBe(true);
  });

  it("forgets once the receipt is saved, posted or put down", () => {
    // Save, Post, Cancel and Delete all end in NEW_DOCUMENT; a draft save
    // also marks the document SAVED first.
    expect(
      isVoucherWorthRemembering(
        snapshot(run(keyed(), { type: "SAVED", voucherId: "v1", status: "DRAFT" })),
      ),
    ).toBe(false);
    expect(
      isVoucherWorthRemembering(
        snapshot(run(keyed(), { type: "NEW_DOCUMENT", scope: SCOPE, voucherDate: "2026-10-16" })),
      ),
    ).toBe(false);
  });

  it("does not keep a scratch note, a notice or a just-begun amend", () => {
    expect(
      isVoucherWorthRemembering(
        snapshot(run(blank(), { type: "NOTICE", notice: "No tender is configured." })),
      ),
    ).toBe(false);
    const amending = run(
      { ...blank(), header: { ...blank().header, voucherId: "v1", status: "POSTED" } },
      { type: "BEGIN_AMEND", bills: [], credits: [] },
    );
    expect(isVoucherWorthRemembering(snapshot(amending))).toBe(false);
    expect(
      isVoucherWorthRemembering(
        snapshot(run(amending, { type: "SET_HEADER", patch: { remarks: "cheque no" } })),
      ),
    ).toBe(true);
  });
});

describe("receipt screen memory — whose slot", () => {
  it("files the receipt under its own tenant, not the session's", () => {
    const fromOtherBranch = run(
      initialDraft(OTHER_BRANCH, "2026-10-16"),
      { type: "SET_HEADER", patch: { remarks: "x" } },
    );
    expect(voucherScopeOf(snapshot(fromOtherBranch))).toEqual(OTHER_BRANCH);
  });

  it("round-trips through screen memory by the header's tenant", () => {
    const memory = createScreenMemory({ currentUserId: () => "u1" });
    const value = snapshot(keyed(), "9876543210");
    memory.remember(RECEIPT_MEMORY_KEY, voucherScopeOf(value), value);
    expect(memory.has(RECEIPT_MEMORY_KEY, SCOPE)).toBe(true);
    expect(memory.has(RECEIPT_MEMORY_KEY, OTHER_BRANCH)).toBe(false);
    expect(memory.recall<ReceiptSnapshot>(RECEIPT_MEMORY_KEY, { ...SCOPE })).toBe(value);
  });
});

describe("receipt screen memory — writes in flight", () => {
  it("counts the four writes, not a read", () => {
    for (const busy of ["saving", "posting", "cancelling", "deleting"]) {
      expect(isVoucherWriteInFlight(busy)).toBe(true);
    }
    expect(isVoucherWriteInFlight("idle")).toBe(false);
    expect(isVoucherWriteInFlight("loading")).toBe(false);
  });
});

describe("receipt screen memory — where the route opens", () => {
  it("opens on the register, or on the remembered receipt", () => {
    expect(initialReceiptView({ collect: null, party: null, remembered: false })).toEqual({
      screen: "list",
    });
    expect(initialReceiptView({ collect: null, party: null, remembered: true })).toBe(
      RESUME_RECEIPT_VIEW,
    );
  });

  it("runs a collection over the remembered receipt, which it asks about", () => {
    expect(initialReceiptView({ collect: COLLECT, party: null, remembered: true })).toEqual({
      screen: "entry",
      collect: COLLECT,
      resume: true,
    });
    expect(initialReceiptView({ collect: COLLECT, party: PARTY, remembered: false })).toEqual({
      screen: "entry",
      collect: COLLECT,
    });
  });

  it("drops a report's party hand-off rather than re-target the remembered receipt", () => {
    expect(initialReceiptView({ collect: null, party: PARTY, remembered: true })).toBe(
      RESUME_RECEIPT_VIEW,
    );
    expect(initialReceiptView({ collect: null, party: PARTY, remembered: false })).toEqual({
      screen: "entry",
      party: PARTY,
    });
  });
});
