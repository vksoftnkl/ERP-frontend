"use client";

/**
 * "Validation" — what the server says before a post, the Qt warning strip's
 * popup.
 *
 *  - A REFUSAL cannot be overridden: the document has to change. Only Back.
 *  - A WARNING can be posted past. An overridable WARN needs ticking, by a user
 *    with the override right on the type's menu; the ticked codes travel as
 *    `overrides`.
 */
import { useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import styles from "@/features/accounts/cheques/cheques.module.scss";
import type { VoucherRefusal, VoucherWarning } from "../vouchers.types";
import { TonePill } from "@/features/accounts/cheques/components/pill";

export type ReviewDialogProps = {
  refusals: VoucherRefusal[];
  warnings: VoucherWarning[];
  canOverride: boolean;
  onBack: () => void;
  onProceed: (overrides: string[]) => void;
};

function where(entry: VoucherRefusal): string {
  return entry.line !== undefined ? `line ${entry.line} — ` : "";
}

export function ReviewDialog({ refusals, warnings, canOverride, onBack, onProceed }: ReviewDialogProps) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const refused = refusals.length > 0;
  const needed = warnings.filter((warning) => warning.level === "WARN" && warning.overridable);
  const blockedByWarn = warnings.some((warning) => warning.level === "WARN" && !warning.overridable);
  const allTicked = needed.every((warning) => ticked.has(warning.code));
  const mayProceed = !refused && !blockedByWarn && allTicked;

  return (
    <ModalShell
      title="Validation"
      isOpen
      wide
      onClose={onBack}
      footer={
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onBack} autoFocus={refused}>
            Back
          </button>
          {refused ? null : (
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!mayProceed}
              onClick={() => onProceed(Array.from(ticked))}
            >
              Save
            </button>
          )}
        </div>
      }
    >
      <div className={styles.dialogBody}>
        <p className={styles.dialogNote}>
          {refused
            ? "This document cannot be posted as it stands — a refusal is not something that can be overridden; the document has to change."
            : "The server has notes on this document. Read them before it is posted."}
        </p>
        <table className={styles.dialogTable}>
          <tbody>
            {refusals.map((entry, index) => (
              <tr key={`r-${entry.code}-${index}`}>
                <td>
                  <TonePill pill={{ label: "REFUSED", tone: "red", dimmed: false }} />
                </td>
                <td>{entry.code}</td>
                <td style={{ whiteSpace: "normal" }}>
                  {where(entry)}
                  {entry.message}
                </td>
                <td />
              </tr>
            ))}
            {warnings.map((entry, index) => {
              const overridable = entry.level === "WARN" && entry.overridable;
              return (
                <tr key={`w-${entry.code}-${index}`}>
                  <td>
                    <TonePill
                      pill={{ label: entry.level, tone: entry.level === "WARN" ? "amber" : "blue", dimmed: false }}
                    />
                  </td>
                  <td>{entry.code}</td>
                  <td style={{ whiteSpace: "normal" }}>
                    {where(entry)}
                    {entry.message}
                  </td>
                  <td>
                    {overridable ? (
                      canOverride ? (
                        <label>
                          <input
                            type="checkbox"
                            checked={ticked.has(entry.code)}
                            onChange={(event) => {
                              const next = new Set(ticked);
                              if (event.target.checked) {
                                next.add(entry.code);
                              } else {
                                next.delete(entry.code);
                              }
                              setTicked(next);
                            }}
                          />{" "}
                          Override
                        </label>
                      ) : (
                        <span className={styles.mutedLine}>needs override right</span>
                      )
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
