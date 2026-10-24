"use client";

/**
 * Enter on a change — Qt `PriceLogDetailDialog` (price_log_dialogs.cpp):
 * every changed field Before | After | Change (the unchanged ones on request),
 * who, when, which device and screen, the reason. `GET /item-price-log/get`.
 *
 * F3 / "Item history" opens the item's whole story over this dialog — or,
 * when this detail was itself opened FROM that history (`onItemHistory`),
 * goes back to it. Mounted only while open.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { toast } from "@/lib/notify";
import { useGetPriceLogChangeMutation } from "../api/price-log-api";
import styles from "../page.module.scss";
import { detailMetaParts, detailTitle, fieldLines, sameSaveText } from "../view/detail-model";
import { isNoAccessError, NO_ACCESS_MESSAGE } from "../view/errors";
import { IPCL_CODE, type PriceLogDetail } from "../wire/types";
import { apiRefusalOf } from "@/lib/api/error-text";
import { PRICE_LOG_DIALOG_ATTR, useDialogKeys } from "./dialog-keys";
import { PriceLogHistoryDialog } from "./price-log-history-dialog";

export type PriceLogDetailDialogProps = {
  ipclId: string;
  /** How many other rows the same save changed (counted by the report from its rows); -1 = unknown. */
  sameSaveOthers: number;
  companyId: string;
  branchId?: string;
  onClose: () => void;
  /**
   * F3 handled by the caller. Left out, the detail opens the item's history
   * itself, over this dialog.
   */
  onItemHistory?: (itemId: string, itemName: string) => void;
};

type Load =
  | { status: "loading" }
  | { status: "ready"; detail: PriceLogDetail }
  | { status: "failed"; message: string }
  | { status: "denied" };

export function PriceLogDetailDialog({
  ipclId,
  sameSaveOthers,
  companyId,
  branchId,
  onClose,
  onItemHistory,
}: PriceLogDetailDialogProps) {
  const markerRef = useRef<HTMLDivElement | null>(null);
  const [fetchChange] = useGetPriceLogChangeMutation();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [history, setHistory] = useState<{ itemId: string; itemName: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetchChange(ipclId)
      .unwrap()
      .then((detail) => {
        if (live) setLoad({ status: "ready", detail });
      })
      .catch((error: unknown) => {
        if (!live) return;
        if (isNoAccessError(error)) {
          setLoad({ status: "denied" });
          return;
        }
        const notFound = apiRefusalOf(error).code === IPCL_CODE.NOT_FOUND;
        setLoad({
          status: "failed",
          message: notFound ? "This change is no longer in the log." : "This change could not be read",
        });
        if (!notFound) toast.apiError(error, { fallback: "This change could not be read." });
      });
    return () => {
      live = false;
    };
  }, [fetchChange, ipclId]);

  const detail = load.status === "ready" ? load.detail : null;

  const askHistory = useCallback(() => {
    if (!detail) return;
    const itemId = detail.itemId;
    const itemName = detail.itemName ?? "";
    if (onItemHistory) {
      onItemHistory(itemId, itemName);
    } else {
      setHistory({ itemId, itemName });
    }
  }, [detail, onItemHistory]);

  const close = useDialogKeys(markerRef, onClose, { F3: askHistory });
  const lines = useMemo(() => (detail ? fieldLines(detail, showUnchanged) : []), [detail, showUnchanged]);

  const title =
    load.status === "ready"
      ? detailTitle(load.detail)
      : load.status === "loading"
        ? "Loading…"
        : load.status === "denied"
          ? "Price change"
          : load.message;
  const same = sameSaveText(sameSaveOthers);

  return (
    <>
      <ModalShell
        title={detail?.priceTable === "IQP" ? "Qty slab change" : "Price change"}
        isOpen
        panelClassName={styles.detailPanel}
        onClose={close}
        footer={
          <>
            <div className={styles.detailFootLeft}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={showUnchanged}
                  disabled={!detail}
                  onChange={(event) => setShowUnchanged(event.target.checked)}
                />
                Show unchanged fields
              </label>
              {same ? <span className={styles.dialogNote}>{same}</span> : null}
            </div>
            <div className={styles.detailFootRight}>
              <button type="button" className={styles.button} onClick={askHistory} disabled={!detail}>
                Item history<span className={styles.key}>F3</span>
              </button>
              <button type="button" className={styles.button} onClick={close} autoFocus>
                Close<span className={styles.key}>Esc</span>
              </button>
            </div>
          </>
        }
      >
        <div ref={markerRef} className={styles.dialogBody} {...{ [PRICE_LOG_DIALOG_ATTR]: "detail" }}>
          <h3 className={styles.detailTitle}>{title}</h3>
          {load.status === "denied" ? <p className={styles.dialogSub}>{NO_ACCESS_MESSAGE}</p> : null}
          {detail ? (
            <>
              <p className={styles.detailMeta}>
                {detailMetaParts(detail).map((part, i) => (
                  <span key={`${part}-${i}`}>
                    {i > 0 ? <span className={styles.metaSep}>·</span> : null}
                    {part}
                  </span>
                ))}
              </p>
              {detail.reason ? <p className={styles.detailReason}>{detail.reason}</p> : null}
            </>
          ) : null}
          <div className={styles.fieldsViewport}>
            <table className={styles.fieldsTable}>
              <thead>
                <tr>
                  <th>Field</th>
                  <th className={styles.num}>Before</th>
                  <th className={styles.num}>After</th>
                  <th className={styles.num}>Change</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className={line.changed ? styles.fieldChanged : styles.fieldSame}>
                    <td className={cx(line.changed && styles.strong)}>{line.label}</td>
                    <td className={cx(styles.num, !line.changed && styles.muted)}>{line.before}</td>
                    <td className={cx(styles.num, line.changed ? styles.strong : styles.muted)}>{line.after}</td>
                    <td
                      className={cx(
                        styles.num,
                        line.direction > 0 && styles.tUp,
                        line.direction < 0 && styles.tDown,
                      )}
                    >
                      {line.change}
                    </td>
                  </tr>
                ))}
                {detail && lines.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.muted}>
                      No field changed value.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </ModalShell>
      {history ? (
        <PriceLogHistoryDialog
          itemId={history.itemId}
          itemName={history.itemName}
          companyId={companyId}
          branchId={branchId}
          onClose={() => setHistory(null)}
        />
      ) : null}
    </>
  );
}
