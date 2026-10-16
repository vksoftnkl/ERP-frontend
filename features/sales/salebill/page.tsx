"use client";

/**
 * Sales Entry — the route. The same two-view shape the quotation and the sale
 * order use: the menu lands on the register, and Create / View / Edit hand off
 * to the voucher form on the same route.
 *
 * Nothing goes in the URL because there is nothing worth deep-linking to — a
 * bill is identified by FOUR fields (id, company, branch and accounting year),
 * not by one id, since `sale_bill` is partitioned by the year.
 *
 * A bill left half-entered when the operator went to another screen is kept in
 * screen memory (lib/screen-memory), and the route then reopens ON it instead
 * of on the register — the Qt MDI window that was simply still there.
 */
import { useCallback, useMemo, useState } from "react";
import { SALE_BILL_MEMORY_KEY } from "@/features/sales/document-memory";
import { useAppStore } from "@/store/hooks";
import { selectSaleBillDraft } from "@/store/slices/saleBillSlice";
import { SaleBillEntryView } from "./components/sale-bill-entry-view";
import { SaleBillListView } from "./components/sale-bill-list-view";
import type { SaleBillDocKey } from "./salebill.types";
import { saleBillResumeSource, useBillDraftScope } from "./use-sale-bill-draft";

type View =
  | { screen: "list" }
  | {
      screen: "entry";
      document?: SaleBillDocKey;
      mode: "browse" | "entry";
      /** Reopened on the remembered bill, not on an explicit Create / Open. */
      resume?: boolean;
    };

const RESUME_VIEW: View = { screen: "entry", mode: "entry", resume: true };

export default function SaleBillPage() {
  const store = useAppStore();
  const scope = useBillDraftScope();
  const canResume = useCallback(
    () =>
      saleBillResumeSource(selectSaleBillDraft(store.getState()), SALE_BILL_MEMORY_KEY, scope) !==
      null,
    [scope, store],
  );
  const [view, setView] = useState<View>(() => (canResume() ? RESUME_VIEW : { screen: "list" }));
  // The header's tenant can still be resolving on the first render, and a
  // header switch back to the tenant a bill was left in brings it into reach.
  // Until the operator does something here, a remembered bill that turns up is
  // reopened — otherwise the next Create would write over it. Adjusted while
  // rendering, when the tenant changes, rather than one render late in an effect.
  const [operatorActed, setOperatorActed] = useState(false);
  const [scopeSeen, setScopeSeen] = useState(scope);
  if (scopeSeen !== scope) {
    setScopeSeen(scope);
    if (!operatorActed && view.screen === "list" && canResume()) {
      setView(RESUME_VIEW);
    }
  }

  const onOpen = useCallback((document: SaleBillDocKey, mode: "browse" | "entry") => {
    setOperatorActed(true);
    setView({ screen: "entry", document, mode });
  }, []);
  const onCreate = useCallback(() => {
    setOperatorActed(true);
    setView({ screen: "entry", mode: "entry" });
  }, []);
  const onBackToList = useCallback(() => {
    setOperatorActed(true);
    setView({ screen: "list" });
  }, []);

  const resume = view.screen === "entry" && Boolean(view.resume);
  const memory = useMemo(() => ({ key: SALE_BILL_MEMORY_KEY, resume }), [resume]);

  return view.screen === "list" ? (
    <SaleBillListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <SaleBillEntryView
      // Remounting on the document is what makes Create / Open start clean
      // rather than merging into the one on screen: the draft is a global
      // slice, so it outlives the form.
      key={view.resume ? "resume" : view.document?.sbId ?? "new"}
      initialDocument={view.document}
      initialMode={view.mode}
      onClose={onBackToList}
      memory={memory}
    />
  );
}
