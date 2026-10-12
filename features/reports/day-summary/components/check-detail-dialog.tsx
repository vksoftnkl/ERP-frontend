"use client";
/**
 * "show" on a check → the rows behind it (plan §7.5, backend §5.6): the
 * legless vouchers, the gap numbers, the future-dated vouchers, the drafts.
 * Their shape is per check and not yet specified, so the table is built from
 * the rows' own keys, and each value is printed as sent (dates and amount
 * strings formatted). Capped at 500 rows by the server.
 */
import { useMemo } from "react";
import styles from "../page.module.scss";
import type { DaySummaryClient } from "../api/day-summary";
import { checkDetailQuery, queryKey, type Filters, type Session } from "../query/params";
import { useOneShot } from "../query/use-one-shot";
import { checkText } from "../wire/checks";
import { toDaySummaryError } from "../wire/errors";
import type { Check } from "../wire/types";
import { displayDate, isIsoDate, isoDay } from "@/features/reports/shared/wire/dates";
import { formatAmount, formatBal, isAmountString } from "@/features/reports/shared/wire/money";
import { DialogShell } from "./dialog-shell";

type Props = {
  check: Check;
  client: DaySummaryClient;
  session: Session;
  filters: Filters;
  onClose: () => void;
};

const AMOUNT_KEY = /amount|debit|credit|total|balance/i;

/** `voucherNo` → "Voucher no". */
function heading(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function cellText(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    if (AMOUNT_KEY.test(key) && isAmountString(value)) return formatAmount(value);
    if (isIsoDate(isoDay(value)) && /^\d{4}-\d{2}-\d{2}/.test(value)) return displayDate(value);
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => cellText(key, v)).join(", ");
  if (typeof value === "object" && "amount" in value && typeof value.amount === "string" && isAmountString(value.amount)) {
    const side = "side" in value && (value.side === "DR" || value.side === "CR") ? value.side : null;
    return formatBal({ amount: value.amount, side });
  }
  return JSON.stringify(value);
}

export function CheckDetailDialog({ check, client, session, filters, onClose }: Props) {
  const query = checkDetailQuery(session, filters, check.code);
  const shot = useOneShot(queryKey("checks/detail", query), (signal) => client.getCheckDetail(query, signal));
  const rows = useMemo(() => shot.data?.rows ?? [], [shot.data]);
  const columns = useMemo(() => {
    const keys: string[] = [];
    for (const row of rows.slice(0, 50)) for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
    // Ids are for machines.
    return keys.filter((key) => !/id$/i.test(key) || key === "id");
  }, [rows]);
  const error = shot.error ? toDaySummaryError(shot.error, { route: "checks/detail", accYear: session.accYear }) : null;
  const { heading: title } = checkText(check);
  const data = shot.data;
  const more = data && data.truncated ? ` · first ${rows.length} of ${data.totalRows ?? "more"}` : "";

  return (
    <DialogShell title={title} sub={data ? `${rows.length} rows${more}` : null} onClose={onClose}>
      {shot.loading ? <div className={styles.emptyState}>Loading…</div> : null}
      {error ? (
        <div className={styles.bodyError} role="alert">
          <span>{error.message}</span>
          {error.retryable ? (
            <button type="button" className={styles.linkButton} onClick={shot.retry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {data ? (
        rows.length === 0 ? (
          <div className={styles.emptyState}>Nothing behind this check now.</div>
        ) : (
          <div className={styles.tableBox} tabIndex={0} autoFocus aria-label="Rows behind the check">
            <table className={styles.table}>
              <thead>
                <tr>
                  {columns.map((key) => (
                    <th key={key} className={AMOUNT_KEY.test(key) ? styles.num : undefined}>
                      {heading(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((key) => (
                      <td key={key} className={AMOUNT_KEY.test(key) ? styles.num : undefined}>
                        {cellText(key, row[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </DialogShell>
  );
}
