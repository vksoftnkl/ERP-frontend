"use client";

/**
 * Receipts — the route.
 *
 * Two views on one page, as the quotation and the sale order have: the menu
 * lands on the REGISTER, and Add / Edit / Enter hand off to the voucher in
 * place. The voucher also has a URL of its own —
 * `/accounts/receipt/:company/:branch/:year/:id` — for the drill-through from
 * the cheque register and for anything that wants to link to one receipt; this
 * page is what the menu points at.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReceiptScreen from "./receipt-screen";
import { ReceiptListView } from "./components/receipt-list-view";
import { RECEIPT_ROUTE, parseReceiptCollect, type TempCreditCollect } from "./domain/collect";
import type { ReceiptKeys } from "./receipt.types";
import { parsePartyHandoff, type PartyHandoff } from "@/lib/navigation/party-handoff";

type View =
  | { screen: "list" }
  | { screen: "entry"; keys?: ReceiptKeys; collect?: TempCreditCollect | null; party?: PartyHandoff | null };

export default function ReceiptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Opened from the Temp Credits register to collect one (`?collect=1…`): the
  // voucher comes up straight away on that party and bill.
  // Or from a report (Party-wise Outstanding's Ctrl+R, `?new=1…`): a new
  // receipt with the party already picked.
  const [view, setView] = useState<View>(() => {
    const collect = parseReceiptCollect(searchParams);
    if (collect) return { screen: "entry", collect };
    const party = parsePartyHandoff(searchParams);
    return party ? { screen: "entry", party } : { screen: "list" };
  });
  // The hand-over is consumed once: the query comes off the URL so a reload
  // or Back lands on a plain receipt, not on a second collection.
  useEffect(() => {
    if (parseReceiptCollect(searchParams) || parsePartyHandoff(searchParams)) {
      router.replace(RECEIPT_ROUTE);
    }
  }, [router, searchParams]);

  const onOpen = useCallback((keys: ReceiptKeys) => {
    setView({ screen: "entry", keys });
  }, []);
  const onCreate = useCallback(() => {
    setView({ screen: "entry" });
  }, []);
  const onBackToList = useCallback(() => {
    setView({ screen: "list" });
  }, []);

  return view.screen === "list" ? (
    <ReceiptListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <ReceiptScreen
      // Keyed on the document, so picking a different receipt from the
      // register starts the screen over rather than leaving it on the last
      // one's state — the open-by-keys effect runs once per mount.
      key={view.keys?.avhVoucherId ?? (view.collect ? "collect" : view.party ? `party-${view.party.partyId}` : "new")}
      initialKeys={view.keys}
      collect={view.collect ?? null}
      openOnParty={view.party ?? null}
      onBackToList={onBackToList}
    />
  );
}
