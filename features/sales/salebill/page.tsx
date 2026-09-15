"use client";

/**
 * Sales Entry — the route. The same two-view shape the quotation and the sale
 * order use: the menu lands on the register, and Create / View / Edit hand off
 * to the voucher form on the same route.
 *
 * Nothing goes in the URL because there is nothing worth deep-linking to — a
 * bill is identified by FOUR fields (id, company, branch and accounting year),
 * not by one id, since `sale_bill` is partitioned by the year.
 */
import { useCallback, useState } from "react";
import { SaleBillEntryView } from "./components/sale-bill-entry-view";
import { SaleBillListView } from "./components/sale-bill-list-view";
import type { SaleBillDocKey } from "./salebill.types";

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
    <SaleBillListView onCreate={onCreate} onOpen={onOpen} />
  ) : (
    <SaleBillEntryView
      // Remounting on the document is what makes "open another bill from the
      // F8 picker" start clean rather than merging into the one on screen: the
      // draft is a global slice, so it outlives the form.
      key={view.document?.sbId ?? "new"}
      initialDocument={view.document}
      initialMode={view.mode}
      onClose={onBackToList}
    />
  );
}
