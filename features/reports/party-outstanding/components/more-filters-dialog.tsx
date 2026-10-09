"use client";
/**
 * More filters (F8): the 3.0 filters the mockup's strip has no room for —
 * Salesman, Collection day, Party, Due days ≥ / ≤ (plan §6.1). A deliberate
 * deviation from the mockup, named in the plan so it is not a surprise.
 *
 * It edits a COPY. Cancel (or Esc, or the backdrop) drops the copy, so the
 * draft is exactly what it was. Reset clears the copy. Apply hands it back and
 * runs Show.
 *
 * Party: there is no party search among the report's routes, so the popup
 * offers the party focused in the grid (or the one already applied). Typing a
 * name to find a party is a server ask (`/parties` takes no search key yet).
 *
 * The overlay is the house three-part one (ModalPortal, an isolated overlay
 * with no background, its own backdrop, a pre-promoted panel), so the grid
 * behind it cannot ghost through.
 */
import { useEffect, useState } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { cx } from "@/components/design-system/cx";
import { Z_MODAL } from "@/lib/z-index";
import styles from "../page.module.scss";
import { COLLECTION_DAYS, type CollectionDay, type OptionsPayload, type OutstandingSide } from "../wire/types";

export type MoreFilters = {
  salesmanId: string | null;
  collectionDay: CollectionDay | null;
  partyId: string | null;
  minDueDays: number | null;
  maxDueDays: number | null;
};

export const EMPTY_MORE: MoreFilters = {
  salesmanId: null,
  collectionDay: null,
  partyId: null,
  minDueDays: null,
  maxDueDays: null,
};

const DAY_NAMES: Record<CollectionDay, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

export function dayName(day: CollectionDay): string {
  return DAY_NAMES[day];
}

/** How many of the popup's filters are set, for the button's badge. */
export function moreCount(more: MoreFilters): number {
  return [more.salesmanId, more.collectionDay, more.partyId, more.minDueDays, more.maxDueDays].filter(
    (value) => value !== null,
  ).length;
}

/** "Salesman: Ravi · Collection: Thu · Party: … · Due days ≥ 10" — the line under the strip. */
export function moreSummary(
  more: MoreFilters,
  names: { salesman: (id: string) => string | null; party: (id: string) => string | null },
): string {
  const parts: string[] = [];
  if (more.salesmanId) parts.push(`Salesman: ${names.salesman(more.salesmanId) ?? "(one salesman)"}`);
  if (more.collectionDay) parts.push(`Collection: ${dayName(more.collectionDay)}`);
  if (more.partyId) parts.push(`Party: ${names.party(more.partyId) ?? "(one party)"}`);
  if (more.minDueDays !== null && more.maxDueDays !== null) {
    parts.push(`Due days ${more.minDueDays} – ${more.maxDueDays}`);
  } else if (more.minDueDays !== null) {
    parts.push(`Due days ≥ ${more.minDueDays}`);
  } else if (more.maxDueDays !== null) {
    parts.push(`Due days ≤ ${more.maxDueDays}`);
  }
  return parts.join(" · ");
}

function days(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,5}$/.test(trimmed) ? Number(trimmed) : null;
}

type Props = {
  side: OutstandingSide;
  value: MoreFilters;
  options: OptionsPayload | null;
  /** The party focused in the grid, offered as the Party filter. */
  focused: { partyId: string; name: string } | null;
  partyName: (id: string) => string | null;
  onApply: (next: MoreFilters) => void;
  onCancel: () => void;
};

export function MoreFiltersDialog({ side, value, options, focused, partyName, onApply, onCancel }: Props) {
  const receivable = side === "RECEIVABLE";
  const [copy, setCopy] = useState<MoreFilters>(value);
  const [minText, setMinText] = useState(value.minDueDays === null ? "" : String(value.minDueDays));
  const [maxText, setMaxText] = useState(value.maxDueDays === null ? "" : String(value.maxDueDays));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const apply = () => onApply({ ...copy, minDueDays: days(minText), maxDueDays: days(maxText) });
  const reset = () => {
    setCopy(EMPTY_MORE);
    setMinText("");
    setMaxText("");
  };

  const partyChoice = copy.partyId ?? focused?.partyId ?? null;
  const partyLabel = partyChoice
    ? (partyName(partyChoice) ?? (focused?.partyId === partyChoice ? focused.name : "(the party in the link)"))
    : null;

  return (
    <ModalPortal>
      <div className={styles.overlay} style={{ zIndex: Z_MODAL }}>
        <button type="button" className={styles.backdrop} aria-label="Cancel" tabIndex={-1} onMouseDown={onCancel} />
        <div
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-label="More filters"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.target as HTMLElement).tagName !== "BUTTON") {
              event.preventDefault();
              apply();
            }
          }}
        >
          <div className={styles.dialogHead}>More filters</div>
          <div className={styles.dialogBody}>
            {receivable ? (
              <>
                <label className={styles.fieldLabel} htmlFor="po-more-salesman">
                  Salesman
                </label>
                <select
                  id="po-more-salesman"
                  autoFocus
                  className={styles.select}
                  value={copy.salesmanId ?? ""}
                  onChange={(event) => setCopy((c) => ({ ...c, salesmanId: event.target.value || null }))}
                >
                  <option value="">All salesmen</option>
                  {(options?.salesmen ?? []).map((s) => (
                    <option key={s.salesmanId} value={s.salesmanId}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className={styles.dialogNote}>
                  The customer&apos;s default salesman: bills carry none yet, so customers without one never match.
                </span>

                <label className={styles.fieldLabel} htmlFor="po-more-day">
                  Collection day
                </label>
                <select
                  id="po-more-day"
                  className={styles.select}
                  value={copy.collectionDay ?? ""}
                  onChange={(event) =>
                    setCopy((c) => ({ ...c, collectionDay: (event.target.value || null) as CollectionDay | null }))
                  }
                >
                  <option value="">Any day</option>
                  {COLLECTION_DAYS.map((day) => (
                    <option key={day} value={day}>
                      {dayName(day)}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            <span className={styles.fieldLabel}>Party</span>
            <label className={styles.check}>
              <input
                type="checkbox"
                autoFocus={!receivable}
                disabled={!partyChoice}
                checked={copy.partyId !== null}
                onChange={(event) =>
                  setCopy((c) => ({ ...c, partyId: event.target.checked ? partyChoice : null }))
                }
              />
              {partyLabel ? `Only ${partyLabel}` : "Focus a party in the grid first"}
            </label>

            <span className={styles.fieldLabel}>Due days</span>
            <span className={styles.field}>
              ≥
              <input
                className={cx(styles.input, styles.inputDays)}
                value={minText}
                inputMode="numeric"
                data-uppercase="off"
                onChange={(event) => setMinText(event.target.value)}
              />
              ≤
              <input
                className={cx(styles.input, styles.inputDays)}
                value={maxText}
                inputMode="numeric"
                data-uppercase="off"
                onChange={(event) => setMaxText(event.target.value)}
              />
            </span>
            <span className={styles.dialogNote}>Days overdue of an owed bill, as in 3.0.</span>
          </div>
          <div className={styles.dialogFoot}>
            <button type="button" className={cx(styles.button, styles.dialogFootLeft)} onClick={reset}>
              Reset
            </button>
            <button type="button" className={styles.button} onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className={styles.primaryButton} onClick={apply}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
