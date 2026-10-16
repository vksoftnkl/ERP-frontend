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
 *
 * A receipt left half-keyed when the operator went to another screen is kept
 * in screen memory (lib/screen-memory), and the route then reopens ON it
 * instead of on the register. Only this route opts in: the four-key URL never
 * reads or writes it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { screenMemory } from "@/lib/screen-memory";
import ReceiptScreen, { useReceiptScope } from "./receipt-screen";
import { ReceiptListView } from "./components/receipt-list-view";
import { RECEIPT_ROUTE, parseReceiptCollect } from "./domain/collect";
import type { ReceiptKeys } from "./receipt.types";
import {
  RECEIPT_MEMORY_KEY,
  RESUME_RECEIPT_VIEW,
  initialReceiptView,
  type ReceiptView,
} from "./state/memory";
import { parsePartyHandoff } from "@/lib/navigation/party-handoff";

export default function ReceiptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = useReceiptScope();
  // Opened from the Temp Credits register to collect one (`?collect=1…`): the
  // voucher comes up straight away on that party and bill.
  // Or from a report (Party-wise Outstanding's Ctrl+R, `?new=1…`): a new
  // receipt with the party already picked.
  // Or back from another screen with a receipt left unsaved here: on that one.
  // `initialReceiptView` says how the hand-offs meet a remembered receipt.
  const [view, setView] = useState<ReceiptView>(() =>
    initialReceiptView({
      collect: parseReceiptCollect(searchParams),
      party: parsePartyHandoff(searchParams),
      remembered: screenMemory.has(RECEIPT_MEMORY_KEY, scope),
    }),
  );
  // The header's tenant can still be resolving on the first render, and a
  // header switch back to the tenant a receipt was left in brings it into
  // reach. Until the operator does something here, a remembered receipt that
  // turns up is reopened — otherwise the next Add would write over it.
  // Adjusted while rendering, on the tenant changing (React's "storing
  // information from previous renders"), rather than one render late in an
  // effect.
  const [operatorActed, setOperatorActed] = useState(false);
  const [scopeSeen, setScopeSeen] = useState(scope);
  if (scopeSeen !== scope) {
    setScopeSeen(scope);
    if (!operatorActed && view.screen === "list" && screenMemory.has(RECEIPT_MEMORY_KEY, scope)) {
      setView(RESUME_RECEIPT_VIEW);
    }
  }
  // The hand-over is consumed once: the query comes off the URL so a reload
  // or Back lands on a plain receipt, not on a second collection.
  useEffect(() => {
    if (parseReceiptCollect(searchParams) || parsePartyHandoff(searchParams)) {
      router.replace(RECEIPT_ROUTE);
    }
  }, [router, searchParams]);

  const onOpen = useCallback((keys: ReceiptKeys) => {
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
  const memory = useMemo(() => ({ key: RECEIPT_MEMORY_KEY, resume }), [resume]);

  return view.screen === "list" ? (
    <ReceiptListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <ReceiptScreen
      // Keyed on the document, so picking a different receipt from the
      // register starts the screen over rather than leaving it on the last
      // one's state — the open-by-keys effect runs once per mount. A resume is
      // its own mount too: the remembered receipt is read once, at mount.
      key={
        view.resume
          ? "resume"
          : (view.keys?.avhVoucherId ??
            (view.collect ? "collect" : view.party ? `party-${view.party.partyId}` : "new"))
      }
      initialKeys={view.keys}
      collect={view.collect ?? null}
      openOnParty={view.party ?? null}
      onBackToList={onBackToList}
      memory={memory}
    />
  );
}
