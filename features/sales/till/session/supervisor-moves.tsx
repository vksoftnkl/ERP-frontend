"use client";

/**
 * Pickups and top-ups — the cashier's view of the cash a supervisor took out
 * of or brought into their drawer (Qt `TillSupervisorMoves`, 2026-10-12: "how
 * does the cashier know a supervisor recorded a pickup?"). Every Pickup and
 * Top-up on the session, with the time, the amount and the supervisor who
 * signed it, so one the cashier never handed over is questioned BEFORE the
 * drawer is counted. Since notes 110 the cashier enters them at the counter
 * and the supervisor signs with a PIN; older rows were the supervisor's own.
 *
 * Shown on Open Till's live panel and at the top of End Shift; read from grid
 * 147 (the Session Cockpit's money documents). Context, not a gate: hidden
 * with no session, with nothing to show, and when the grid cannot be read.
 * `reloadKey` re-reads it without a new session (End Shift's reload).
 */
import { useEffect, useState } from "react";
import { useTillSessionClient } from "../shared/api/till-session-api";
import styles from "../shared/till.module.scss";
import { supervisorMoveLines } from "./supervisor-moves-lines";

export function SupervisorMoves({ tssId, reloadKey = 0 }: { tssId: string | null; reloadKey?: number }) {
  const client = useTillSessionClient();
  const [loaded, setLoaded] = useState<{ tssId: string; lines: string[] } | null>(null);

  useEffect(() => {
    if (!tssId) return;
    let cancelled = false;
    client
      .gridRows("tillSessionMoneyDocs", { itss_id: tssId })
      .then((rows) => {
        if (!cancelled) setLoaded({ tssId, lines: supervisorMoveLines(rows) });
      })
      .catch(() => {
        if (!cancelled) setLoaded(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, tssId, reloadKey]);

  // A stale read (another session's) is never shown while the new one loads.
  const lines = tssId && loaded?.tssId === tssId ? loaded.lines : [];
  if (lines.length === 0) return null;

  return (
    <section className={styles.band} aria-label="Pickups and top-ups on your session">
      <span className={styles.strong}>Pickups and top-ups on your session</span>
      <div className={styles.moveLines}>
        {lines.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
      <p className={styles.muted}>
        Check each one: if you did not hand it over or receive it, tell the manager before you count.
      </p>
    </section>
  );
}
