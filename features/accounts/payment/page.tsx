"use client";

/**
 * Payments — the route.
 *
 * The receipt's two views on one page: the menu lands on the REGISTER, and
 * Add / Edit / Enter hand off to the voucher in place. One payment also has a
 * URL of its own — `/accounts/payment/:company/:branch/:year/:id` — for the
 * drill-through from the issued-cheque register and anything that links to
 * one payment.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parsePartyHandoff, type PartyHandoff } from "@/lib/navigation/party-handoff";
import PaymentScreen from "./payment-screen";
import { PaymentListView } from "./components/payment-list-view";
import type { PaymentKeys } from "./payment.types";

const PAYMENT_ROUTE = "/accounts/payment";

type View = { screen: "list" } | { screen: "entry"; keys?: PaymentKeys; party?: PartyHandoff | null };

export default function PaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Opened from a report (Party-wise Outstanding's Ctrl+R, `?new=1…`): a new
  // payment with the party already picked.
  const [view, setView] = useState<View>(() => {
    const party = parsePartyHandoff(searchParams);
    return party ? { screen: "entry", party } : { screen: "list" };
  });
  // Consumed once: the query comes off the URL, so a reload lands on the register.
  useEffect(() => {
    if (parsePartyHandoff(searchParams)) {
      router.replace(PAYMENT_ROUTE);
    }
  }, [router, searchParams]);

  const onOpen = useCallback((keys: PaymentKeys) => {
    setView({ screen: "entry", keys });
  }, []);
  const onCreate = useCallback(() => {
    setView({ screen: "entry" });
  }, []);
  const onBackToList = useCallback(() => {
    setView({ screen: "list" });
  }, []);

  return view.screen === "list" ? (
    <PaymentListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <PaymentScreen
      // Keyed on the document: the open-by-keys effect runs once per mount.
      key={view.keys?.avhVoucherId ?? (view.party ? `party-${view.party.partyId}` : "new")}
      initialKeys={view.keys}
      openOnParty={view.party ?? null}
      onBackToList={onBackToList}
    />
  );
}
