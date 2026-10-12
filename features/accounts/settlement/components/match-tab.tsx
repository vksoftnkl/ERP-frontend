"use client";

/**
 * The Match tab — Qt tabMatch: PAYOUTS (grid 138, newest first, pick one to
 * work it), the payout's facts, its lines against our tender rows on the left
 * (status chips, the lines table, the payout's totals) and on the right the
 * line under the cursor side by side with our row, why the engine thinks they
 * are one payment, and the TSet once posted. Void / Post under it.
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import type { GridColumn } from "../domain/grid-columns";
import {
  CHIP_KEYS,
  chipLabels,
  kindTone,
  legRows,
  lineCells,
  lineStatusTone,
  linesTotalText,
  payoutFacts,
  rowSide,
  statementSide,
  suggestCaption,
  suggestNote,
  suggestTone,
  voucherNote,
  whyLines,
  type Fact,
  type Tone,
} from "../domain/match";
import { MATCH_KEYS_HINT } from "../domain/keys";
import type { MatchState } from "../hooks/use-match";
import type { GridList } from "../hooks/use-grid-list";
import { GridTable } from "./grid-table";
import styles from "../page.module.scss";

const TONE_CLASS: Record<Tone, string | undefined> = {
  success: styles.toneSuccess,
  partial: styles.tonePartial,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  muted: styles.toneMuted,
  info: styles.toneInfo,
  "": undefined,
};

const LINE_COLUMNS: { key: keyof ReturnType<typeof lineCells>; header: string; right?: boolean; width: number }[] = [
  { key: "time", header: "Time", width: 3.4 },
  { key: "terminal", header: "TID", width: 4.5 },
  { key: "kind", header: "Kind", width: 5.2 },
  { key: "ref", header: "RRN / UTR", width: 8 },
  { key: "auth", header: "Auth · last4", width: 7 },
  { key: "gross", header: "Gross", right: true, width: 6 },
  { key: "feeGst", header: "Fee+GST", right: true, width: 5 },
  { key: "net", header: "Net", right: true, width: 6 },
  { key: "status", header: "Status", width: 6 },
  { key: "rule", header: "Rule", width: 6.4 },
  { key: "ours", header: "Our row", width: 9 },
];

function Side({ head, facts }: { head: string; facts: Fact[] | null }) {
  return (
    <div className={styles.side}>
      <span className={styles.sideHead}>{head}</span>
      {facts === null ? (
        <span className={styles.sideLabel} style={{ gridColumn: "1 / -1" }}>
          — none —
        </span>
      ) : (
        facts.map((fact) => (
          <FactRow key={fact.label} fact={fact} />
        ))
      )}
    </div>
  );
}

function FactRow({ fact }: { fact: Fact }) {
  return (
    <>
      <span className={styles.sideLabel}>{fact.label}</span>
      <span className={styles.sideValue} title={fact.value}>
        {fact.strong ? <strong>{fact.value}</strong> : fact.value}
      </span>
    </>
  );
}

export function MatchTab({
  match,
  payouts,
  payoutColumns,
  payoutCursor,
  onPayoutCursor,
  onImport,
  onFormat,
  hidden,
}: {
  match: MatchState;
  payouts: GridList;
  payoutColumns: readonly GridColumn[];
  payoutCursor: number;
  onPayoutCursor: (index: number) => void;
  onImport: () => void;
  onFormat: () => void;
  hidden: boolean;
}) {
  const { payout, line, actions } = match;
  const facts = payoutFacts(payout);
  const chips = chipLabels(payout);
  const legs = legRows(match.legs);
  const showVoucher = payout !== null;
  const why = line ? whyLines(line) : [];

  return (
    <div className={styles.tabBody} hidden={hidden} role="tabpanel" aria-label="Match">
      <div className={styles.toolbar}>
        <span className={styles.sectionCap}>Payouts</span>
        <span className={styles.muted}>newest first · pick one to work it</span>
        <span className={styles.spacer} />
        <button type="button" className={styles.button} disabled={!actions.importFile} onClick={onImport}>
          Import file…
        </button>
        <button type="button" className={styles.button} onClick={onFormat}>
          Statement format…
        </button>
        <button type="button" className={styles.button} disabled={!actions.runMatch} onClick={match.runMatch}>
          Run match  (Ctrl+M)
        </button>
      </div>

      <GridTable
        className={styles.gridPayouts}
        columns={payoutColumns}
        rows={payouts.rows}
        loading={payouts.loading}
        error={payouts.error}
        current={payoutCursor}
        onCurrent={onPayoutCursor}
        activateOnClick
        onActivate={(index) => {
          const row = payouts.rows[index];
          if (row) match.openRow(row);
        }}
        emptyText="No payout imported in this year yet — Import file… to bring in a provider statement."
        ariaLabel="Payouts"
      />

      <div className={styles.facts}>
        {(
          [
            ["Payout", facts.payout],
            ["UTR", facts.utr],
            ["Provider", facts.provider],
            ["Lines", facts.lines],
            ["Gross", facts.gross],
            ["Fee", facts.fee],
            ["GST on fee", facts.gst],
            ["Net to bank", facts.net],
            ["Status", facts.status],
          ] as const
        ).map(([caption, value]) => (
          <div key={caption} className={styles.fact}>
            <span className={styles.factCap}>{caption}</span>
            <span className={cx(styles.factValue, caption === "Net to bank" && payout && styles.factNet)}>
              {value || "—"}
            </span>
          </div>
        ))}
        <span className={styles.bankFile}>{facts.bankFile.join("\n")}</span>
      </div>

      <div className={styles.matchBody}>
        <div className={styles.matchLeft}>
          <div className={styles.chips} role="group" aria-label="Line filter">
            {CHIP_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={cx(styles.chip, match.chip === key && styles.chipOn)}
                aria-pressed={match.chip === key}
                onClick={() => match.setChip(key)}
              >
                {chips[key]}
              </button>
            ))}
            <span className={styles.spacer} />
            <span className={styles.muted}>statement lines ← → our tender rows</span>
          </div>
          <LinesTable match={match} />
          <div className={styles.linesTotal}>{linesTotalText(payout)}</div>
        </div>

        <div className={styles.matchRight}>
          {line ? (
            <section
              className={cx(
                styles.panel,
                suggestTone(line) === "warning" && styles.panelWarning,
                suggestTone(line) === "danger" && styles.panelDanger,
              )}
              aria-label="The line under the cursor"
            >
              <span className={styles.panelCap}>{suggestCaption(line)}</span>
              <div className={styles.sides}>
                <Side head="Statement line" facts={statementSide(line)} />
                <Side head="Our tender row" facts={rowSide(line.tenderRow)} />
              </div>
              {why.length > 0 ? (
                <ul className={styles.why}>
                  {why.map((entry, index) => (
                    <li key={index} className={entry.mark === "✓" ? styles.whyOk : styles.whyWarn}>
                      {entry.mark} {entry.text}
                    </li>
                  ))}
                </ul>
              ) : null}
              {suggestNote(line) ? <p className={styles.note}>{suggestNote(line)}</p> : null}
              <div className={styles.panelButtons}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={!actions.confirm}
                  onClick={match.confirmLine}
                >
                  Confirm  (Enter)
                </button>
                <button type="button" className={styles.button} disabled={!actions.unlink} onClick={match.unlinkLine}>
                  Not this one
                </button>
                <button type="button" className={styles.button} disabled={!actions.pickRow} onClick={match.pickRow}>
                  Pick another row…
                </button>
                <button type="button" className={styles.button} disabled={!actions.ignore} onClick={match.ignoreLine}>
                  Ignore line…
                </button>
              </div>
            </section>
          ) : null}

          {showVoucher ? (
            <section className={styles.panel} aria-label="TSet voucher">
              <span className={styles.sectionCap}>TSet — Tender Settlement</span>
              <span className={styles.muted}>one voucher per payout · dated the payout date</span>
              {legs.length > 0 ? (
                <table className={styles.legs}>
                  <thead>
                    <tr>
                      <th scope="col">Ledger</th>
                      <th scope="col" className={styles.alignRight}>
                        Dr
                      </th>
                      <th scope="col" className={styles.alignRight}>
                        Cr
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {legs.map((leg, index) => (
                      <tr key={index} className={leg.total ? styles.legTotal : undefined}>
                        <td>{leg.ledger}</td>
                        <td className={styles.alignRight}>{leg.dr}</td>
                        <td className={styles.alignRight}>{leg.cr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <p className={styles.note}>{voucherNote(payout, match.legs)}</p>
            </section>
          ) : null}
        </div>
      </div>

      <div className={styles.bar}>
        <span className={styles.keyHints}>{MATCH_KEYS_HINT}</span>
        <button type="button" className={styles.dangerButton} disabled={!actions.void} onClick={match.voidPayout}>
          Void payout…
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!actions.post}
          title={actions.postTitle || undefined}
          onClick={() => void match.postPayout()}
        >
          Post TSet  (Ctrl+P)
        </button>
      </div>
    </div>
  );
}

/** The payout's lines — the Qt tblLines, with its InkDelegate colours. */
function LinesTable({ match }: { match: MatchState }) {
  const { shown, cursor, setCursor, payout } = match;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (cursor < 0) return;
    viewportRef.current?.querySelector<HTMLElement>(`tr[data-at="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, shown]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || shown.length === 0) return;
    const last = shown.length - 1;
    const moves: Record<string, (from: number) => number> = {
      ArrowDown: (from) => Math.min(from + 1, last),
      ArrowUp: (from) => Math.max(from - 1, 0),
      PageDown: (from) => Math.min(from + 10, last),
      PageUp: (from) => Math.max(from - 10, 0),
      Home: () => 0,
      End: () => last,
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setCursor(move(cursor < 0 ? -1 : cursor));
  };

  return (
    <div className={cx(styles.gridShell, styles.gridGrow)}>
      <div
        ref={viewportRef}
        className={styles.gridViewport}
        tabIndex={0}
        role="grid"
        aria-label="Statement lines"
        data-settlement-lines="true"
        onKeyDown={onKeyDown}
      >
        <table className={styles.table}>
          <colgroup>
            {LINE_COLUMNS.map((column) => (
              <col key={column.key} style={{ width: `calc(${column.width} * var(--erp-q-u, 1rem))` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {LINE_COLUMNS.map((column) => (
                <th key={column.key} scope="col" className={column.right ? styles.alignRight : undefined}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={LINE_COLUMNS.length}>
                  {payout ? "No line under this filter." : "Pick a payout above."}
                </td>
              </tr>
            ) : (
              shown.map(({ line, index }, at) => {
                const cells = lineCells(line);
                return (
                  <tr
                    key={line.aslId || index}
                    data-at={at}
                    aria-selected={at === cursor}
                    className={cx(
                      styles.row,
                      cells.status === "SUGGESTED" && styles.rowSuggested,
                      at === cursor && styles.rowCurrent,
                    )}
                    onClick={() => setCursor(at)}
                  >
                    {LINE_COLUMNS.map((column) => {
                      const tone =
                        column.key === "status"
                          ? lineStatusTone(line)
                          : column.key === "kind"
                            ? kindTone(line)
                            : column.key === "ours" && cells.status === "PARTIAL"
                              ? "partial"
                              : "";
                      return (
                        <td
                          key={column.key}
                          className={cx(column.right && styles.alignRight, TONE_CLASS[tone])}
                          title={cells[column.key]}
                        >
                          {cells[column.key]}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
