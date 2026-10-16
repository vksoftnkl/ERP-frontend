/**
 * Screen memory for the payment (lib/screen-memory) — the receipt's rules
 * (`features/accounts/receipt/state/memory.ts`), with the money going out: a
 * payment left half-keyed when the operator goes to another menu screen is
 * still here when they come back; a blank, browsed, saved or posted one is not.
 *
 * Pure: no React, no network.
 */
import type { PartyHandoff } from "@/lib/navigation/party-handoff";
import type { VoucherSnapshot } from "@/features/accounts/receipt/state/memory";
import type { PaymentKeys } from "../payment.types";
import type { PaymentDraft } from "./draft";

/** The payment's screen-memory slot. */
export const PAYMENT_MEMORY_KEY = "accounts/payment";

/** The payment remembers its draft and nothing beside it. */
export type PaymentSnapshot = VoucherSnapshot<PaymentDraft>;

export type PaymentView =
  | { screen: "list" }
  | {
      screen: "entry";
      keys?: PaymentKeys;
      party?: PartyHandoff | null;
      /** Reopened on the remembered payment, not on an explicit Create / Open. */
      resume?: boolean;
    };

export const RESUME_PAYMENT_VIEW: PaymentView = { screen: "entry", resume: true };

/**
 * Where the route opens. A report's party hand-off is dropped when a payment
 * is remembered: `pickParty` would graft the new payee onto the remembered
 * payment's instruments without asking, so the operator finishes that one
 * first and asks the report again.
 */
export function initialPaymentView(args: {
  party: PartyHandoff | null;
  remembered: boolean;
}): PaymentView {
  if (args.remembered) {
    return RESUME_PAYMENT_VIEW;
  }
  return args.party ? { screen: "entry", party: args.party } : { screen: "list" };
}
