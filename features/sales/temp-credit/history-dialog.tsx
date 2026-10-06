"use client";

/**
 * Ctrl+H — one temp credit's whole trail, from grid 132 "POPUP - TEMP CREDIT
 * HISTORY" (server notes 90): the credit given, the bill's own steps, every
 * follow-up, and the money — received at the counter or by a receipt,
 * written off, reversed. Read in order; the grid has no ORDER BY of its own,
 * so the rows are sorted here on `th_sort`.
 */
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { Chip, type ChipTone } from "@/features/accounts/receipt/components/chip";
import { formatTotal } from "@/features/accounts/receipt/domain/money";
import { extractRows } from "@/app/master/_shared/crud-utils";
import { getGridId } from "@/lib/configured-grids";
import type { TempCreditRow } from "./row";

const GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

type HistoryRow = {
  th_key: string;
  th_sort: string;
  th_when: string;
  th_event: string;
  th_detail: string;
  th_amount: number | null;
  th_user: string;
  th_ref: string;
  th_kind: string;
};

/** What each kind of step means, in the chip colours the receipt uses. */
const KIND_TONES: Record<string, ChipTone> = {
  CREDIT: "amber",
  BILL: "blue",
  FOLLOWUP: "grey",
  COUNTER: "green",
  SETTLE: "green",
};

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function toHistoryRows(payload: unknown): HistoryRow[] {
  return extractRows(payload)
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => {
      const amount = row.th_amount;
      const parsed = typeof amount === "number" ? amount : Number.parseFloat(text(amount));
      return {
        th_key: text(row.th_key),
        th_sort: text(row.th_sort),
        th_when: text(row.th_when),
        th_event: text(row.th_event),
        th_detail: text(row.th_detail),
        th_amount: Number.isFinite(parsed) ? parsed : null,
        th_user: text(row.th_user),
        th_ref: text(row.th_ref),
        th_kind: text(row.th_kind).toUpperCase(),
      };
    })
    .sort((left, right) => left.th_sort.localeCompare(right.th_sort));
}

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
  const rows = row && loaded?.forId === row.atc_id ? loaded.rows : [];

  useEffect(() => {
    if (!row) {
      return;
    }
    let cancelled = false;
    const forId = row.atc_id;
    void getAll({
      grid_id: getGridId("tempCreditHistory"),
      page: "1",
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

  const summary = useMemo(() => {
    if (!row) {
      return "";
    }
    return `${row.atc_name || "—"} · ${row.atc_mobile || "—"} · bill ${row.atc_bill_refno || "—"} · lent ${formatTotal(row.atc_credit_amount)} · balance ${formatTotal(row.atc_balance_amount)} · ${row.atc_status}`;
  }, [row]);

  return (
    <ModalShell title="Temp credit — history" isOpen={row !== null} wide fixedHeight onClose={onClose}>
      <p className={quotationStyles.modalNote}>{summary}</p>
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
                  <Chip value={entry.th_event} tone={KIND_TONES[entry.th_kind] ?? "grey"} />
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
                      ? `The history could not be read: ${error}`
                      : "Nothing has happened to this credit yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
