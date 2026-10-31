"use client";

/**
 * Delivery Challan (menu 182) — one route, two views: the list (grid 116) and
 * the entry. Which one the menu lands on is Qt `TxnMainView::openForMenu`'s
 * switch, `system.txn_entry_first`. The draft lives in `useDcScreen` at this
 * level, so walking to the list and back keeps it.
 */
import { useState } from "react";
import { useTxnEntryFirst } from "@/features/purchase/shared/use-purchase-scope";
import { DcEntryView } from "./components/dc-entry-view";
import { DcListView } from "./components/dc-list-view";
import { useDcScreen } from "./use-dc-screen";

type View = "list" | "entry";

export default function DeliveryChallanPage() {
  const screen = useDcScreen();
  const { entryFirst, settled } = useTxnEntryFirst(screen.companyId, screen.branchId);
  // Until the operator moves, the view is the setting's; after, it is theirs.
  const [chosen, setView] = useState<View | null>(null);
  const view: View | null = chosen ?? (settled ? (entryFirst ? "entry" : "list") : null);

  if (view === null) {
    return null;
  }
  if (view === "list") {
    return (
      <DcListView
        onCreate={() => {
          screen.actions.resetScreen();
          setView("entry");
        }}
        onOpen={(key, openForEdit) => {
          setView("entry");
          void screen.actions.loadChallan(key, openForEdit);
        }}
      />
    );
  }
  return <DcEntryView screen={screen} onShowList={() => setView("list")} />;
}
