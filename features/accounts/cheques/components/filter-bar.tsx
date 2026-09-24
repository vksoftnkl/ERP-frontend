"use client";

/**
 * Status ticks, the instrument-date window, bank, party and the search box.
 *
 * The search is debounced at ~300 ms and fires at once on Enter. A register of
 * four thousand cheques answers in its own time, and eight searches in flight
 * race each other to paint the grid. It lands in `isearch` (see
 * `domain/filters.ts`), never in the runner's own `search`.
 */
import { useEffect, useRef, useState } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { STATUS_TICKS, type ChequeFilters, type StatusTick } from "../domain/filters";
import styles from "../cheques.module.scss";

const SEARCH_DEBOUNCE_MS = 300;

export type FilterBarProps = {
  filters: ChequeFilters;
  onChange: (patch: Partial<ChequeFilters>) => void;
  onClear: () => void;
};

export function FilterBar({ filters, onChange, onClear }: FilterBarProps) {
  const bankDropdownId = useDropdownId("bankLedger");
  const partyDropdownId = useDropdownId("ledgerAll");

  // The box holds what is typed; `filters.search` holds what was searched.
  const [text, setText] = useState(filters.search);
  const committed = useRef(filters.search);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // A reset from outside (Clear filters) puts the box back too.
  useEffect(() => {
    if (filters.search !== committed.current) {
      committed.current = filters.search;
      setText(filters.search);
    }
  }, [filters.search]);

  useEffect(() => {
    if (text === committed.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      committed.current = text;
      onChangeRef.current({ search: text });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const searchNow = () => {
    if (text !== committed.current) {
      committed.current = text;
      onChange({ search: text });
    }
  };

  const toggle = (key: StatusTick) => {
    const on = filters.ticks.includes(key);
    onChange({
      ticks: on ? filters.ticks.filter((tick) => tick !== key) : [...filters.ticks, key],
    });
  };

  return (
    <section className={styles.filterBar} aria-label="Filters">
      <div className={styles.field}>
        <span className={styles.fieldLabel} title="Nothing ticked shows every status">
          Status
        </span>
        <div className={styles.ticks}>
          {STATUS_TICKS.map((tick) => {
            const on = filters.ticks.includes(tick.key);
            return (
              <label
                key={tick.key}
                className={`${styles.tick} ${on ? styles.tickOn : ""}`}
                title={tick.key === "RETURNED" ? "Returned and cancelled cheques" : undefined}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(tick.key)} />
                {tick.label}
              </label>
            );
          })}
        </div>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Dated from</span>
        <input
          type="date"
          className={`${styles.input} ${styles.dateInput}`}
          value={filters.from}
          max={filters.to || undefined}
          onChange={(event) => onChange({ from: event.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>To</span>
        <input
          type="date"
          className={`${styles.input} ${styles.dateInput}`}
          value={filters.to}
          min={filters.from || undefined}
          onChange={(event) => onChange({ to: event.target.value })}
        />
      </label>

      <div className={`${styles.field} ${styles.dropdownField}`}>
        <span className={styles.fieldLabel}>Into bank</span>
        <NexDropdownSingle
          dropdownId={bankDropdownId}
          aria-label="Bank"
          placeholder="Any bank"
          value={
            filters.bankLedgerId
              ? { id: filters.bankLedgerId, text: filters.bankLedgerName }
              : null
          }
          onChange={(selection) =>
            onChange({ bankLedgerId: selection?.id ?? "", bankLedgerName: selection?.text ?? "" })
          }
        />
      </div>

      <div className={`${styles.field} ${styles.dropdownField}`}>
        <span className={styles.fieldLabel}>Party</span>
        <NexDropdownSingle
          dropdownId={partyDropdownId}
          aria-label="Party"
          placeholder="Any party"
          value={filters.partyId ? { id: filters.partyId, text: filters.partyName } : null}
          onChange={(selection) =>
            onChange({ partyId: selection?.id ?? "", partyName: selection?.text ?? "" })
          }
        />
      </div>

      <label className={`${styles.field} ${styles.fieldGrow}`}>
        <span className={styles.fieldLabel}>Search</span>
        <input
          type="search"
          className={styles.input}
          value={text}
          data-uppercase="off"
          placeholder="Cheque no, party, drawer or bank"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              searchNow();
            }
          }}
        />
      </label>

      <button type="button" className={styles.secondaryButton} onClick={onClear}>
        Clear filters
      </button>
    </section>
  );
}
