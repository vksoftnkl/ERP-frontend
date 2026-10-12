"use client";

/**
 * Ctrl+H on Till Sessions — the session's own journal (`till_event`, grid
 * 145 "TILL SESSION EVENTS"), oldest first, the Event column as pills coloured
 * by what happened (Qt `TxnHistoryTrail` over `tillSessions()`): the summary
 * names the session, its cashier and counter, where it stands and how many
 * events it has.
 */
import { Fragment, useEffect, useState } from "react";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { tillErrorOf } from "../shared/errors";
import { eventTone, sortRowsBy, textOf } from "../shared/format";
import { TillDialog, TonePill } from "../shared/till-dialog";
import type { GridRow } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import { gridCellText } from "./cockpit";
import { FALLBACK_COLUMNS, GridTable } from "./grid-table";
import { journalSummary, type SessionRow } from "./session-list";

export function EventCell({ row, field }: { row: GridRow; field: string }) {
  if (field === "tev_event_code") {
    const code = textOf(row, field);
    return code ? <TonePill tone={eventTone(code)}>{code}</TonePill> : null;
  }
  return <>{gridCellText(row, field)}</>;
}

export function JournalDialog({ session, onClose }: { session: SessionRow | null; onClose: () => void }) {
  return session ? <JournalBody key={session.key.tssId} session={session} onClose={onClose} /> : null;
}

function JournalBody({ session, onClose }: { session: SessionRow; onClose: () => void }) {
  const client = useTillSessionClient();
  const [rows, setRows] = useState<GridRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    client
      .gridRows("tillSessionEvents", { itss_id: session.key.tssId })
      .then((data) => {
        if (!cancelled) setRows(sortRowsBy(data, "tev_event_on"));
      })
      .catch((failure) => {
        if (!cancelled) setError(`The journal could not be loaded: ${tillErrorOf(failure).text}`);
      });
    return () => {
      cancelled = true;
    };
  }, [client, session.key.tssId]);

  const summary = rows ? journalSummary(session, rows.length) : [];

  return (
    <TillDialog
      open
      size="wide"
      title={`Journal · ${session.sessionNo}`}
      onClose={onClose}
      footer={
        <>
          <span className={styles.spacer} />
          <button type="button" className={styles.secondaryButton} autoFocus onClick={onClose}>
            Close - Esc
          </button>
        </>
      }
    >
      <p className={styles.muted}>Till Sessions · {session.key.accYear || "—"} · every event, oldest first</p>
      {summary.length > 0 ? (
        <p className={styles.summary}>
          {summary.map((part, index) => (
            <Fragment key={index}>
              {index > 0 ? "  ·  " : null}
              {index === 0 || part.startsWith("now ") ? <strong>{part}</strong> : part}
            </Fragment>
          ))}
        </p>
      ) : null}
      <div className={styles.tableWrap}>
        <GridTable
          grid="tillSessionEvents"
          rows={rows ?? []}
          fallbackColumns={FALLBACK_COLUMNS.events}
          idField="tev_id"
          loading={rows === null}
          error={error}
          emptyText="No event is recorded for this session."
          cell={(row, field) => <EventCell row={row} field={field} />}
        />
      </div>
    </TillDialog>
  );
}
