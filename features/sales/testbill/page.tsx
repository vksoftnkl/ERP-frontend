"use client";

/**
 * Sales Entry (menu 12) — the route. The menu lands on the register, and
 * Create / View / Edit hand off to the bill screen on the same route.
 *
 * Nothing goes in the URL because there is nothing worth deep-linking to — a
 * bill is identified by FOUR fields (id, company, branch and accounting year),
 * not by one id, since `sale_bill` is partitioned by the year (§3.1).
 */
import { useCallback, useState } from "react";
import { SaleBillScreen } from "./components/sale-bill-screen";
import { BillListView } from "./lists/bill-list-view";
import type { SaleBillDocKey } from "./types";

type View =
  | { screen: "list" }
  | { screen: "entry"; document?: SaleBillDocKey; mode: "browse" | "entry" };

export default function SaleBillPage() {
  const [view, setView] = useState<View>({ screen: "list" });

  const onOpen = useCallback((document: SaleBillDocKey, mode: "browse" | "entry") => {
    setView({ screen: "entry", document, mode });
  }, []);
  const onCreate = useCallback(() => {
    setView({ screen: "entry", mode: "entry" });
  }, []);
  const onBackToList = useCallback(() => {
    setView({ screen: "list" });
  }, []);

  return view.screen === "list" ? (
    <BillListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <SaleBillScreen
      // Remounting on the document is what makes "open another bill from the
      // F8 picker" start clean: the draft is the screen's own `useReducer`, so
      // a new key is a new draft.
      key={view.document?.sbId ?? "new"}
      initialDocument={view.document}
      initialMode={view.mode}
      onClose={onBackToList}
    />
  );
}
