"use client";

/**
 * F3 — one item's whole price story, newest first — Qt `PriceLogHistoryDialog`
 * (price_log_dialogs.cpp). `GET /item-price-log/item-history`, shown in the
 * report's own grid (day headers, change chips). Enter or a double-click on a
 * row opens its detail.
 *
 * Mounted only while open. Also opened by the quick rate popup.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { toast } from "@/lib/notify";
import { useGetPriceLogItemHistoryMutation } from "../api/price-log-api";
import styles from "../page.module.scss";
import { isNoAccessError, NO_ACCESS_MESSAGE } from "../view/errors";
import { countText } from "../view/words";
import type { PriceLogRow } from "../wire/types";
import { PRICE_LOG_DIALOG_ATTR, useDialogKeys } from "./dialog-keys";
import { PriceLogDetailDialog } from "./price-log-detail-dialog";
import { PriceLogGrid, type PriceLogGridHandle } from "./price-log-grid";

export type PriceLogHistoryDialogProps = {
  itemId: string;
  itemName: string;
  companyId: string;
  branchId?: string;
  onClose: () => void;
};

/** The server answers the latest 200 when no limit is asked (item-history's default). */
const SERVER_DEFAULT_LIMIT = 200;

type Load =
  | { status: "loading" }
  | { status: "ready"; rows: PriceLogRow[] }
  | { status: "failed" }
  | { status: "denied" };

const EMPTY_ROWS: PriceLogRow[] = [];

export function historySubtitle(load: Load): string {
  switch (load.status) {
    case "loading":
      return "Every change to this item's prices and qty slabs, newest first. Enter shows one change.";
    case "denied":
      return NO_ACCESS_MESSAGE;
    case "failed":
      return "The history could not be read.";
    default: {
      const n = load.rows.length;
      if (n === 0) return "No price change of this item has been recorded.";
      const latest = n >= SERVER_DEFAULT_LIMIT ? ` (the latest ${n})` : "";
      return `${countText(n, "change", "changes")}${latest}, newest first. Enter shows one change.`;
    }
  }
}

export function PriceLogHistoryDialog({ itemId, itemName, companyId, branchId, onClose }: PriceLogHistoryDialogProps) {
  const markerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<PriceLogGridHandle | null>(null);
  const [fetchHistory] = useGetPriceLogItemHistoryMutation();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchHistory({ itemId, companyId: companyId || undefined, branchId: branchId || undefined })
      .unwrap()
      .then((rows) => {
        if (!live) return;
        setLoad({ status: "ready", rows });
        setSelectedId(rows[0]?.ipclId ?? null);
      })
      .catch((error: unknown) => {
        if (!live) return;
        if (isNoAccessError(error)) {
          setLoad({ status: "denied" });
          return;
        }
        setLoad({ status: "failed" });
        toast.apiError(error, { fallback: "The item's price history could not be read." });
      });
    return () => {
      live = false;
    };
  }, [branchId, companyId, fetchHistory, itemId]);

  const close = useDialogKeys(markerRef, onClose);

  const openDetail = useCallback((row: PriceLogRow) => {
    setSelectedId(row.ipclId);
    setDetailId(row.ipclId);
  }, []);
  const closeDetail = useCallback(() => {
    setDetailId(null);
    // The detail's portal took the focus with it; the grid gets it back.
    window.setTimeout(() => gridRef.current?.focus(), 0);
  }, []);

  const rows = load.status === "ready" ? load.rows : EMPTY_ROWS;
  const title = `Price history — ${itemName || "item"}`;

  return (
    <>
      <ModalShell
        title={title}
        isOpen
        panelClassName={styles.historyPanel}
        onClose={close}
        footer={
          <>
            <span className={styles.dialogNote}>
              {load.status === "ready" && rows.length ? "↑↓ move · Enter details · Esc close" : ""}
            </span>
            <button type="button" className={styles.button} onClick={close}>
              Close<span className={styles.key}>Esc</span>
            </button>
          </>
        }
      >
        <div ref={markerRef} className={styles.dialogBody} {...{ [PRICE_LOG_DIALOG_ATTR]: "history" }}>
          <p className={styles.dialogSub}>{historySubtitle(load)}</p>
          <PriceLogGrid
            rows={rows}
            selectedId={selectedId}
            onSelect={(row) => setSelectedId(row.ipclId)}
            onOpen={openDetail}
            ariaLabel={title}
            emptyText={load.status === "loading" ? "Loading…" : ""}
            autoFocus
            handleRef={gridRef}
          />
        </div>
      </ModalShell>
      {detailId ? (
        <PriceLogDetailDialog
          ipclId={detailId}
          sameSaveOthers={-1}
          companyId={companyId}
          branchId={branchId}
          onClose={closeDetail}
          // This IS the item's history: F3 on the detail comes back to it.
          onItemHistory={closeDetail}
        />
      ) : null}
    </>
  );
}
