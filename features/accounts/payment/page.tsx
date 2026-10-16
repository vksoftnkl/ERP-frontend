"use client";

/**
 * Payments — the route.
 *
 * The receipt's two views on one page: the menu lands on the REGISTER, and
 * Add / Edit / Enter hand off to the voucher in place. One payment also has a
 * URL of its own — `/accounts/payment/:company/:branch/:year/:id` — for the
 * drill-through from the issued-cheque register and anything that links to
 * one payment.
 *
 * A payment left half-keyed when the operator went to another screen is kept
 * in screen memory (lib/screen-memory), and the route then reopens ON it
 * instead of on the register. The four-key URL never reads or writes it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parsePartyHandoff } from "@/lib/navigation/party-handoff";
import { screenMemory } from "@/lib/screen-memory";
import PaymentScreen, { usePaymentScope } from "./payment-screen";
import { PaymentListView } from "./components/payment-list-view";
import type { PaymentKeys } from "./payment.types";
import {
  PAYMENT_MEMORY_KEY,
  RESUME_PAYMENT_VIEW,
  initialPaymentView,
  type PaymentView,
} from "./state/memory";

const PAYMENT_ROUTE = "/accounts/payment";

export default function PaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = usePaymentScope();
  // Opened from a report (Party-wise Outstanding's Ctrl+R, `?new=1…`): a new
  // payment with the party already picked — unless a payment was left unsaved
  // here, which is reopened instead (`initialPaymentView`).
  const [view, setView] = useState<PaymentView>(() =>
    initialPaymentView({
      party: parsePartyHandoff(searchParams),
      remembered: screenMemory.has(PAYMENT_MEMORY_KEY, scope),
    }),
  );
  // The header's tenant can still be resolving on the first render, and a
  // header switch back to the tenant a payment was left in brings it into
  // reach. Until the operator does something here, a remembered payment that
  // turns up is reopened — otherwise the next Add would write over it.
  // Adjusted while rendering, on the tenant changing (React's "storing
  // information from previous renders"), rather than one render late in an
  // effect.
  const [operatorActed, setOperatorActed] = useState(false);
  const [scopeSeen, setScopeSeen] = useState(scope);
  if (scopeSeen !== scope) {
    setScopeSeen(scope);
    if (!operatorActed && view.screen === "list" && screenMemory.has(PAYMENT_MEMORY_KEY, scope)) {
      setView(RESUME_PAYMENT_VIEW);
    }
  }
  // Consumed once: the query comes off the URL, so a reload lands on the register.
  useEffect(() => {
    if (parsePartyHandoff(searchParams)) {
      router.replace(PAYMENT_ROUTE);
    }
  }, [router, searchParams]);

  const onOpen = useCallback((keys: PaymentKeys) => {
    setOperatorActed(true);
    setView({ screen: "entry", keys });
  }, []);
  const onCreate = useCallback(() => {
    setOperatorActed(true);
    setView({ screen: "entry" });
  }, []);
  const onBackToList = useCallback(() => {
    setOperatorActed(true);
    setView({ screen: "list" });
  }, []);

  const resume = view.screen === "entry" && Boolean(view.resume);
  const memory = useMemo(() => ({ key: PAYMENT_MEMORY_KEY, resume }), [resume]);

  return view.screen === "list" ? (
    <PaymentListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <PaymentScreen
      // Keyed on the document: the open-by-keys effect runs once per mount. A
      // resume is its own mount too: the remembered payment is read at mount.
      key={
        view.resume
          ? "resume"
          : (view.keys?.avhVoucherId ?? (view.party ? `party-${view.party.partyId}` : "new"))
      }
      initialKeys={view.keys}
      openOnParty={view.party ?? null}
      onBackToList={onBackToList}
      memory={memory}
    />
  );
}
