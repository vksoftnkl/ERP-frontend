"use client";

/**
 * WHAT this design prints.
 *
 * Three sources, in order of how much they actually know:
 *
 *   1. `print_purpose` itself, through configured dropdown 47 -- the real list,
 *      searchable server-side. See `api/purposes.ts`.
 *   2. The purposes some design or assignment already references, for an
 *      environment where that dropdown row has not been provisioned.
 *   3. A pasted id, for a purpose that exists but neither of the above can see.
 *
 * What it is NOT, at any level, is a hard-coded list of the twelve shipped
 * purposes -- that is 3.0's `PrintUtil(this, 9)`, and the reason purposes became
 * a table. A site that adds a Kitchen Order Ticket gets it from source 1 with no
 * front-end change.
 */

import { useMemo, useState } from "react";

import { useAppSelector } from "@/store/hooks";
import { selectBusinessContext } from "@/store/slices/authSlice";
import { useGetPrintPurposeOptionsQuery } from "@/features/printing/api/purposes";
import { isPurposeId, purposeLabel } from "@/features/printing/domain/purposes";
import type { PrintPurposeRef } from "@/features/printing/types/printing";
import styles from "@/features/printing/printing.module.scss";

export default function PurposePicker({
  value,
  purposes,
  disabled,
  onChange,
}: {
  value: string;
  /** Derived from templates and assignments — the fallback, source 2. */
  purposes: PrintPurposeRef[];
  disabled?: boolean;
  onChange: (ppoId: string) => void;
}) {
  const businessContext = useAppSelector(selectBusinessContext);
  const { data: catalogue, isError } = useGetPrintPurposeOptionsQuery({
    companyId: businessContext?.companyId ?? null,
  });

  /*
   * The catalogue wins, and the derived list fills any gap in it: a design can
   * reference a purpose that is now inactive or belongs to another company, and
   * dropping it from the list would blank the field on a design that is
   * perfectly valid.
   */
  const options = useMemo(() => {
    const byId = new Map<string, PrintPurposeRef>();
    for (const purpose of catalogue ?? []) byId.set(purpose.ppoId, purpose);
    for (const purpose of purposes) {
      if (!byId.has(purpose.ppoId)) byId.set(purpose.ppoId, purpose);
    }
    return [...byId.values()].sort((left, right) =>
      purposeLabel(left).localeCompare(purposeLabel(right)),
    );
  }, [catalogue, purposes]);

  const known = options.some((purpose) => purpose.ppoId === value);
  // Stay in id mode once opened, so a chosen id does not make the field jump
  // back to the dropdown mid-edit.
  const [byId, setById] = useState(() => Boolean(value) && !known);
  const [typed, setTyped] = useState(value);

  if (byId) {
    return (
      <label className={styles.field}>
        <span className={styles.fieldLabel} title="print_purpose.ppo_id">
          Purpose id
        </span>
        <span>
          <input
            className={styles.input}
            value={typed}
            disabled={disabled}
            placeholder="01a041fa-…"
            data-uppercase="off"
            onChange={(event) => {
              const next = event.target.value.trim();
              setTyped(next);
              if (isPurposeId(next)) onChange(next);
            }}
          />
          <span className={styles.cellFinding}>
            {typed === "" || isPurposeId(typed) ? (
              <span className={styles.muted}>Paste the id of a purpose not in the list.</span>
            ) : (
              "That is not a uuid."
            )}
            {options.length > 0 ? (
              <>
                {" "}
                <button type="button" className={styles.link} onClick={() => setById(false)}>
                  Choose from the list
                </button>
              </>
            ) : null}
          </span>
        </span>
      </label>
    );
  }

  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>Purpose</span>
      <span>
        <select
          className={styles.select}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose what this prints…</option>
          {options.map((purpose) => (
            <option key={purpose.ppoId} value={purpose.ppoId}>
              {purposeLabel(purpose)}
              {purpose.ppoCode ? ` — ${purpose.ppoCode}` : ""}
            </option>
          ))}
        </select>
        <span className={styles.cellFinding}>
          {/*
           * Said plainly when the catalogue is unreachable, because the list is
           * then only what other rows happen to reference — which on a fresh
           * installation is nothing at all.
           */}
          {isError ? (
            <span className={styles.muted}>
              The purpose list could not be read — showing only the purposes already in use.{" "}
            </span>
          ) : null}
          <button
            type="button"
            className={styles.link}
            disabled={disabled}
            onClick={() => {
              setTyped(value);
              setById(true);
            }}
          >
            Not listed? Enter a purpose id
          </button>
        </span>
      </span>
    </label>
  );
}
