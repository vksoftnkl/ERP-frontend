"use client";

/**
 * The Open Sources dialog (§13.4): the party's open challans or orders, as a
 * tree — document (tristate tick; red + "past the return window" when
 * `pastWindow`) → lines (tick + Take 0…openQty, default openQty, 3 dp;
 * typing > 0 ticks, 0 unticks). It APPENDS, never replaces; the pure
 * `appendOpenSourceLines` does the putting-on.
 *
 * An error is shown as status text, not a modal.
 */
import { useEffect, useMemo, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { parseCell, toDisplayDate } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import type { OpenSourceDoc, OpenSourceLine } from "@/features/sales/testbill/api/bills";
import { openSourcesSummary, type OpenSourcePick } from "@/features/sales/testbill/domain/import";
import styles from "@/features/sales/testbill/page.module.scss";

export type OpenSourcesDialogProps = {
  isOpen: boolean;
  kind: "DC" | "ORDER";
  docs: OpenSourceDoc[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onApply: (picks: OpenSourcePick[]) => void;
};

type LineState = { ticked: boolean; take: number; text: string };

function lineKey(doc: OpenSourceDoc, line: OpenSourceLine): string {
  return `${doc.docId}|${line.lineId}`;
}

function clampTake(value: number, openQty: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.min(Math.round(value * 1000) / 1000, Math.round(openQty * 1000) / 1000);
}

export function OpenSourcesDialog({ isOpen, kind, docs, loading, error, onClose, onApply }: OpenSourcesDialogProps) {
  const [state, setState] = useState<Record<string, LineState>>({});

  // Every open starts with every line ticked at its open quantity.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const next: Record<string, LineState> = {};
    for (const doc of docs) {
      for (const line of doc.lines) {
        const take = clampTake(line.openQty, line.openQty);
        next[lineKey(doc, line)] = { ticked: take > 0, take, text: String(take) };
      }
    }
    setState(next);
  }, [docs, isOpen]);

  const picks = useMemo<OpenSourcePick[]>(() => {
    const out: OpenSourcePick[] = [];
    for (const doc of docs) {
      for (const line of doc.lines) {
        const entry = state[lineKey(doc, line)];
        if (entry?.ticked && entry.take > 0) {
          out.push({ doc, line, takeQty: entry.take });
        }
      }
    }
    return out;
  }, [docs, state]);

  const setLine = (key: string, patch: Partial<LineState>) =>
    setState((current) => ({ ...current, [key]: { ...(current[key] ?? { ticked: false, take: 0, text: "" }), ...patch } }));

  const docState = (doc: OpenSourceDoc): "all" | "none" | "some" => {
    const entries = doc.lines.map((line) => state[lineKey(doc, line)]?.ticked ?? false);
    if (entries.every(Boolean)) return "all";
    if (entries.some(Boolean)) return "some";
    return "none";
  };

  const toggleDoc = (doc: OpenSourceDoc) => {
    const tickAll = docState(doc) !== "all";
    setState((current) => {
      const next = { ...current };
      for (const line of doc.lines) {
        const key = lineKey(doc, line);
        const entry = next[key] ?? { ticked: false, take: 0, text: "" };
        const take = tickAll ? (entry.take > 0 ? entry.take : clampTake(line.openQty, line.openQty)) : entry.take;
        next[key] = { ticked: tickAll && take > 0, take, text: String(take) };
      }
      return next;
    });
  };

  const commitTake = (doc: OpenSourceDoc, line: OpenSourceLine) => {
    const key = lineKey(doc, line);
    const entry = state[key];
    if (!entry) return;
    const take = clampTake(parseCell(entry.text), line.openQty);
    // Typing > 0 ticks, 0 unticks.
    setLine(key, { take, text: String(take), ticked: take > 0 });
  };

  const noun = kind === "DC" ? "challan" : "order";

  return (
    <ModalShell
      title={kind === "DC" ? "Open challans — take lines onto this bill" : "Open orders — take lines onto this bill"}
      isOpen={isOpen}
      wide
      fixedHeight
      onClose={onClose}
      footer={
        <>
          <span className={quotationStyles.modalNote}>{openSourcesSummary(picks)}</span>
          <button type="button" className={quotationStyles.button} onClick={onClose}>
            Cancel <span className={quotationStyles.buttonHint}>Esc</span>
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={picks.length === 0}
            onClick={() => onApply(picks)}
          >
            Take {picks.length > 0 ? `${picks.length} line${picks.length === 1 ? "" : "s"}` : "lines"}
          </button>
        </>
      }
    >
      {error ? <p className={quotationStyles.warning}>{error}</p> : null}
      {loading ? <p className={quotationStyles.modalNote}>Reading the open {noun}s…</p> : null}
      {!loading && !error && docs.length === 0 ? (
        <p className={quotationStyles.modalNote}>This customer has no open {noun} lines.</p>
      ) : null}
      <div className={styles.sourceTree}>
        {docs.map((doc) => {
          const docTick = docState(doc);
          return (
            <div key={`${doc.docId}|${doc.accYear}`} className={styles.sourceDoc}>
              <label className={cx(styles.sourceDocHead, doc.pastWindow && styles.sourceDocPastWindow)}>
                <input
                  type="checkbox"
                  checked={docTick === "all"}
                  ref={(node) => {
                    if (node) node.indeterminate = docTick === "some";
                  }}
                  onChange={() => toggleDoc(doc)}
                />
                <span className={styles.sourceDocTitle}>
                  {doc.refno ?? doc.docId.slice(0, 8)} · {doc.date ? toDisplayDate(doc.date) : "—"} · {doc.ageDays} day
                  {doc.ageDays === 1 ? "" : "s"} old{doc.purpose ? ` · ${doc.purpose}` : ""}
                  {doc.pastWindow ? " — past the return window" : ""}
                  {doc.convertRequired ? " · conversion required" : ""}
                </span>
              </label>
              <table className={styles.sourceLines}>
                <thead>
                  <tr>
                    <th />
                    <th>#</th>
                    <th>Item</th>
                    <th>Unit</th>
                    <th className={quotationStyles.alignRight}>Doc qty</th>
                    <th className={quotationStyles.alignRight}>Open</th>
                    <th className={quotationStyles.alignRight}>Take</th>
                    <th className={quotationStyles.alignRight}>Rate</th>
                    <th>Batch</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((line) => {
                    const key = lineKey(doc, line);
                    const entry = state[key] ?? { ticked: false, take: 0, text: "" };
                    return (
                      <tr key={key}>
                        <td>
                          <input
                            type="checkbox"
                            checked={entry.ticked}
                            disabled={line.openQty <= 0}
                            onChange={(event) =>
                              setLine(key, {
                                ticked: event.target.checked,
                                take: event.target.checked && entry.take <= 0 ? clampTake(line.openQty, line.openQty) : entry.take,
                                text: event.target.checked && entry.take <= 0 ? String(clampTake(line.openQty, line.openQty)) : entry.text,
                              })
                            }
                          />
                        </td>
                        <td>{line.lineNo}</td>
                        <td>{line.itemName ?? line.itemId}</td>
                        <td>{line.unitName ?? ""}</td>
                        <td className={quotationStyles.alignRight}>{line.docQty}</td>
                        <td className={quotationStyles.alignRight}>{line.openQty}</td>
                        <td className={quotationStyles.alignRight}>
                          <input
                            className={cx(quotationStyles.cellInput, quotationStyles.alignRight)}
                            inputMode="decimal"
                            value={entry.text}
                            disabled={line.openQty <= 0}
                            aria-label={`Take of ${line.itemName ?? line.itemId}`}
                            onChange={(event) => setLine(key, { text: event.target.value })}
                            onBlur={() => commitTake(doc, line)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitTake(doc, line);
                              }
                            }}
                          />
                        </td>
                        <td className={quotationStyles.alignRight}>{line.rate.toFixed(2)}</td>
                        <td>{line.batchNo ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
