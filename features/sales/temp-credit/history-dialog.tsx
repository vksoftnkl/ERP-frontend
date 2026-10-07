"use client";

/**
 * Ctrl+H — one temp credit's whole trail, from grid 132 "POPUP - TEMP CREDIT
 * HISTORY" (server notes 90): the credit given, the bill's own steps, every
 * follow-up, and the money — received at the counter or by a receipt,
 * written off, reversed. The Qt `TxnHistoryDialog` over the `tempCredits()`
 * trail: "History · <bill>", the register and year under it, a summary line
 * once the rows land, and the Event column as pills coloured by what happened.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { Chip } from "@/features/accounts/receipt/components/chip";
import { formatTotal } from "@/features/accounts/receipt/domain/money";
import { getGridId } from "@/lib/configured-grids";
import { eventTone, historySummary, toHistoryRows, type HistoryRow } from "./history";
import type { TempCreditRow } from "./row";

const GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

/** What the Qt dialog names the document by: the register's own title. */
const DOC_LABEL = "Temp Credits";

const NO_ROWS: HistoryRow[] = [];

export type HistoryDialogProps = {
  row: TempCreditRow | null;
  onClose: () => void;
};

export function HistoryDialog({ row, onClose }: HistoryDialogProps) {
  const { getAll, loading, error } = useApi<unknown>(GRID_RUN_ENDPOINT, {
    toast: { error: false },
  });
  // The answer, with the credit it is about: a dialog reopened on another
  // row shows nothing until that row's own trail lands.
  const [loaded, setLoaded] = useState<{ forId: string; rows: HistoryRow[] } | null>(null);
  const rows = row && loaded?.forId === row.atc_id ? loaded.rows : NO_ROWS;

  useEffect(() => {
    if (!row) {
      return;
    }
    let cancelled = false;
    const forId = row.atc_id;
    void getAll({
      grid_id: getGridId("tempCreditHistory"),
      page: "1",
      // A trail is short; one page holds it.
      limit: "100",
      grid_param: JSON.stringify({
        iatc_id: row.atc_id,
        iacc_year: row.atc_acc_year,
        icompany_id: row.atc_company_id,
      }),
    })
      .then((payload) => {
        if (!cancelled && payload !== undefined) {
          setLoaded({ forId, rows: toHistoryRows(payload) });
        }
      })
      .catch(() => {
        // `error` below says so.
      });
    return () => {
      cancelled = true;
    };
  }, [getAll, row]);

  const summary = useMemo(() => (row ? historySummary(row, rows) : []), [row, rows]);
  const ref = row?.atc_bill_refno ?? "";

  return (
    <ModalShell
      title={ref ? `History · ${ref}` : "History"}
      isOpen={row !== null}
      wide
      fixedHeight
      onClose={onClose}
      footer={
        <button type="button" className={quotationStyles.button} onClick={onClose}>
          Close - Esc
        </button>
      }
    >
      <p className={quotationStyles.modalNote}>
        {DOC_LABEL} · {row?.atc_acc_year || "—"} · every step, oldest first
      </p>
      {summary.length > 0 ? (
        <p className={quotationStyles.modalNote}>
          {summary.map((part, index) => (
            <Fragment key={index}>
              {index > 0 ? "\u00a0\u00a0·\u00a0\u00a0" : null}
              {part.lead}
              {part.strong ? <strong>{part.value}</strong> : part.value}
            </Fragment>
          ))}
        </p>
      ) : null}
      <div className={quotationStyles.listViewport}>
        <table className={quotationStyles.listTable}>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Event</th>
              <th scope="col">Detail</th>
              <th scope="col" className={quotationStyles.alignRight}>
                Amount
              </th>
              <th scope="col">By</th>
              <th scope="col">Ref No</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.th_key}>
                <td>{entry.th_when}</td>
                <td>
                  <Chip value={entry.th_event} tone={eventTone(entry.th_event)} />
                </td>
                <td>{entry.th_detail}</td>
                <td className={quotationStyles.alignRight}>
                  {entry.th_amount === null ? "" : formatTotal(entry.th_amount)}
                </td>
                <td>{entry.th_user}</td>
                <td>{entry.th_ref}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={cx(quotationStyles.emptyGrid)}>
                  {loading
                    ? "Loading…"
                    : error
                      ? `The history could not be loaded: ${error}`
                      : "No history is recorded for this document."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
