import { describe, expect, it } from "vitest";
import {
  isVoucherWorthRemembering,
  voucherScopeOf,
} from "@/features/accounts/receipt/state/memory";
import { initialPaymentDraft, paymentDraftReducer, type PaymentDraft, type PaymentDraftAction } from "./draft";
import { RESUME_PAYMENT_VIEW, initialPaymentView } from "./memory";

const SCOPE = { companyId: "co", branchId: "br", accYear: "2026-2027" };
const PARTY = { partyId: "p1", partyName: "Murugan Traders" };

function run(draft: PaymentDraft, ...actions: PaymentDraftAction[]): PaymentDraft {
  return actions.reduce((state, action) => paymentDraftReducer(state, action).draft, draft);
}

const blank = () => initialPaymentDraft(SCOPE, "2026-10-16");

describe("payment screen memory", () => {
  it("keeps a keyed payment until it is put down", () => {
    const keyed = run(blank(), { type: "PARTY_PICKED", ...PARTY });
    expect(isVoucherWorthRemembering({ draft: blank() })).toBe(false);
    expect(isVoucherWorthRemembering({ draft: keyed })).toBe(true);
    expect(
      isVoucherWorthRemembering({
        draft: run(keyed, { type: "NEW_DOCUMENT", scope: SCOPE, voucherDate: "2026-10-16" }),
      }),
    ).toBe(false);
    expect(voucherScopeOf({ draft: keyed })).toEqual(SCOPE);
  });

  it("opens on the register, or on the remembered payment", () => {
    expect(initialPaymentView({ party: null, remembered: false })).toEqual({ screen: "list" });
    expect(initialPaymentView({ party: null, remembered: true })).toBe(RESUME_PAYMENT_VIEW);
  });

  it("drops a report's party hand-off rather than re-target the remembered payment", () => {
    expect(initialPaymentView({ party: PARTY, remembered: true })).toBe(RESUME_PAYMENT_VIEW);
    expect(initialPaymentView({ party: PARTY, remembered: false })).toEqual({
      screen: "entry",
      party: PARTY,
    });
  });
});
