"use client";

/**
 * History on a transaction — one document's status trail, read-only. The Qt
 * `TxnHistoryDialog` (status-trail view): "History · <ref>", the document
 * type and year under it, a summary line once the rows land, then every step
 * oldest first with the Event column as pills coloured by what happened.
 *
 * Rows come from grid 126 "POPUP - TXN HISTORY" over `txn_status_log`, and the
 * columns — which, in what order, aligned how — from that grid's own config,
 * so Grid Master moves them without touching this file. A trail is short: one
 * page of 100 holds it.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { getGridId, useGridId } from "@/lib/configured-grids";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import {
  TXN_HISTORY_FALLBACK_COLUMNS,
  TXN_HISTORY_FIELDS,
  toTxnHistoryRows,
  txnEventTone,
  txnHistorySummary,
  type TxnEventTone,
  type TxnHistoryRow,
} from "./txn-history";

const GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

/** The document the trail is about — its id, the partition it lives in, and what to call it. */
export type TxnHistoryTarget = {
  docId: string;
  companyId: string;
  accYear: string;
  /** The document's own number — "bil00972". Blank names it by `docLabel`. */
  refNo: string;
};

export type TxnHistoryDialogProps = {
  /** `null` = closed. */
  target: TxnHistoryTarget | null;
  /** What the document type is called: "Sales Bill", "Sales Order". */
  docLabel: string;
  onClose: () => void;
};

type TrailColumn = { field: string; header: string; align: "left" | "center" | "right" };

const NO_ROWS: TxnHistoryRow[] = [];

/*
 * The Qt `QDialog#TxnHistoryDialog` skin over the shared `ModalShell`. Lengths
 * are n × `--erp-q-u`, the sales screens' fluid unit (declared on `:root` by
 * the quotation skin the shell already loads). The `!` marks beat that skin's
 * own panel, viewport and list-table rules, which sit outside Tailwind's layers.
 */

/** The Qt dialog's 1000px. */
const PANEL_CLASS = "w-[min(calc(62*var(--erp-q-u,1rem)),100%)]!";
const HEAD_CLASS =
  "flex flex-col gap-[calc(0.2*var(--erp-q-u,1rem))] pb-[calc(0.5*var(--erp-q-u,1rem))] border-b border-(--border-light)";
const TITLE_CLASS = "m-0 text-(--text-main) text-[length:calc(1.05*var(--erp-q-u,1rem))] font-bold";
const SUBTITLE_CLASS = "m-0 text-(--text-muted) text-[length:calc(0.7*var(--erp-q-u,1rem))]";
/** Who made it and where it stands, before anyone reads the grid. */
const SUMMARY_CLASS =
  "m-0 px-[calc(0.75*var(--erp-q-u,1rem))] py-[calc(0.45*var(--erp-q-u,1rem))] border border-(--border-light) rounded-[calc(0.35*var(--erp-q-u,1rem))] bg-[#fafafa] text-(--text-main) text-[length:calc(0.72*var(--erp-q-u,1rem))]";
/** As tall as the trail, up to about twelve steps; then it scrolls. */
const VIEWPORT_CLASS = "flex-[0_1_auto]!";
/**
 * The last column (Remarks) takes the slack; the ones before it keep Qt's
 * breathing room rather than shrinking to their text.
 */
const TABLE_CLASS = [
  "[&_th]:px-[calc(0.6*var(--erp-q-u,1rem))]! [&_th]:py-[calc(0.3*var(--erp-q-u,1rem))]!",
  "[&_td]:px-[calc(0.6*var(--erp-q-u,1rem))]! [&_td]:py-[calc(0.3*var(--erp-q-u,1rem))]!",
  "[&_th]:min-w-[calc(6.5*var(--erp-q-u,1rem))] [&_th:first-child]:min-w-[calc(2.5*var(--erp-q-u,1rem))]",
  "[&_th:last-child]:w-full [&_td:last-child]:w-full",
  "[&_tbody_tr]:cursor-default!",
].join(" ");
const PILL_CLASS =
  "inline-block px-[calc(0.6*var(--erp-q-u,1rem))] py-[calc(0.05*var(--erp-q-u,1rem))] border rounded-full text-[length:calc(0.7*var(--erp-q-u,1rem))] font-bold leading-normal whitespace-nowrap";

/**
 * The Event pill's hue. One formula per hue, as Qt's `TxnBadgePalette`: a pale
 * wash (HSL lightness 236/255) behind dark text of the same hue (86/255), grey
 * with the saturation pulled out.
 */
const TONE_CLASS: Record<TxnEventTone, string> = {
  green: "border-[hsl(142deg_35%_85%)] bg-[hsl(142deg_35%_92.5%)] text-[hsl(142deg_63%_34%)]",
  amber: "border-[hsl(38deg_35%_85%)] bg-[hsl(38deg_35%_92.5%)] text-[hsl(38deg_63%_34%)]",
  red: "border-[hsl(2deg_35%_85%)] bg-[hsl(2deg_35%_92.5%)] text-[hsl(2deg_63%_34%)]",
  blue: "border-[hsl(212deg_35%_85%)] bg-[hsl(212deg_35%_92.5%)] text-[hsl(212deg_63%_34%)]",
  grey: "border-[hsl(0deg_0%_85%)] bg-[hsl(0deg_0%_92.5%)] text-[hsl(0deg_0%_34%)]",
};

function keyOf(target: TxnHistoryTarget): string {
  return `${target.docId}|${target.accYear}|${target.companyId}`;
}

export function TxnHistoryDialog({ target, docLabel, onClose }: TxnHistoryDialogProps) {
  const isOpen = target !== null;
  const gridId = useGridId("txnHistory");
  const numericGridId = Number.parseInt(gridId, 10);
  const { data: columnConfig } = useGetGridColumnsQuery(
    { gridId: numericGridId },
    { skip: !isOpen || !Number.isFinite(numericGridId) },
  );
  const { getAll, loading, error } = useApi<unknown>(GRID_RUN_ENDPOINT, {
    toast: { error: false },
  });
  // The answer, with the document it is about: a dialog reopened on another
  // row shows nothing until that row's own trail lands.
  const [loaded, setLoaded] = useState<{ forKey: string; rows: TxnHistoryRow[] } | null>(null);
  const targetKey = target ? keyOf(target) : "";
  const rows = target && loaded?.forKey === targetKey ? loaded.rows : NO_ROWS;
  const pending = target !== null && loaded?.forKey !== targetKey;
  /** The list cursor, as Qt's current row: ↑↓ walk it, a click puts it. Back on the first step for another document. */
  const [cursorAt, setCursorAt] = useState<{ forKey: string; index: number }>({ forKey: "", index: 0 });
  const cursor = cursorAt.forKey === targetKey ? cursorAt.index : 0;

  useEffect(() => {
    if (!target) {
      return;
    }
    let cancelled = false;
    const forKey = keyOf(target);
    void getAll({
      // Read off the directory at fetch time; the hook's value above only
      // drives the column config, which can wait for it.
      grid_id: getGridId("txnHistory"),
      page: "1",
      limit: "100",
      grid_param: JSON.stringify({
        idoc_id: target.docId,
        iacc_year: target.accYear,
        icompany_id: target.companyId,
      }),
    })
      .then((payload) => {
        if (!cancelled && payload !== undefined) {
          setLoaded({ forKey, rows: toTxnHistoryRows(payload) });
        }
      })
      .catch(() => {
        // `error` below says so.
      });
    return () => {
      cancelled = true;
    };
  }, [getAll, target]);

  // ↑↓ / Home / End move the cursor. Capture phase, and stopped there, so the
  // register underneath does not walk its own rows at the same time.
  useEffect(() => {
    if (!isOpen || rows.length === 0) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const last = rows.length - 1;
      const move: Record<string, (index: number) => number> = {
        ArrowDown: (index) => Math.min(index + 1, last),
        ArrowUp: (index) => Math.max(index - 1, 0),
        Home: () => 0,
        End: () => last,
      };
      const step = move[event.key];
      if (!step) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setCursorAt((current) => ({
        forKey: targetKey,
        index: step(current.forKey === targetKey ? current.index : 0),
      }));
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, rows.length, targetKey]);

  const columns = useMemo<TrailColumn[]>(() => {
    const configured = (columnConfig ?? [])
      .filter((column) => column.visible !== false)
      .sort((left, right) => (left.position ?? left.order) - (right.position ?? right.order))
      .map((column) => ({
        field: column.sqlFieldName || column.accessorKey || column.key,
        header: column.header || column.columnName || column.key,
        align: column.align ?? "left",
      }))
      .filter((column) => column.field);
    return configured.length > 0
      ? configured
      : TXN_HISTORY_FALLBACK_COLUMNS.map((column) => ({ ...column }));
  }, [columnConfig]);

  const summary = useMemo(() => txnHistorySummary(rows), [rows]);
  const ref = target?.refNo.trim() ?? "";

  return (
    <ModalShell
      title={`History — ${ref || docLabel}`}
      isOpen={isOpen}
      wide
      panelClassName={PANEL_CLASS}
      onClose={onClose}
      footer={
        <button type="button" className={`${quotationStyles.button} ml-auto`} autoFocus onClick={onClose}>
          Close - Esc
        </button>
      }
    >
      <div className={HEAD_CLASS}>
        <h3 className={TITLE_CLASS}>{ref ? `History · ${ref}` : "History"}</h3>
        <p className={SUBTITLE_CLASS}>
          {docLabel} · {target?.accYear || "—"} · every step, oldest first
        </p>
      </div>
      {summary.length > 0 ? (
        <p className={SUMMARY_CLASS}>
          {summary.map((item, index) => (
            <Fragment key={index}>
              {index > 0 ? "  ·  " : null}
              {item.map((run, runIndex) =>
                run.strong ? <strong key={runIndex}>{run.text}</strong> : <Fragment key={runIndex}>{run.text}</Fragment>,
              )}
            </Fragment>
          ))}
        </p>
      ) : null}
      <div className={`${quotationStyles.listViewport} ${VIEWPORT_CLASS}`}>
        <table className={`${quotationStyles.listTable} ${TABLE_CLASS}`}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.field} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row[TXN_HISTORY_FIELDS.id] || index}
                data-selected={index === cursor ? "true" : undefined}
                onMouseDown={() => setCursorAt({ forKey: targetKey, index })}
              >
                {columns.map((column) => {
                  const value = row[column.field] ?? "";
                  return (
                    <td key={column.field} style={{ textAlign: column.align }}>
                      {column.field === TXN_HISTORY_FIELDS.event && value ? (
                        <span className={`${PILL_CLASS} ${TONE_CLASS[txnEventTone(value)]}`}>{value}</span>
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={quotationStyles.emptyGrid}>
                  {error
                    ? `The history could not be loaded: ${error}`
                    : loading || pending
                      ? "Loading…"
                      : // A document older than the log, or one whose writes never
                        // logged — say so rather than show a grid that looks broken.
                        "No history is recorded for this document."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
