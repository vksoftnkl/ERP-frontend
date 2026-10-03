"use client";

/**
 * Show (status ticks), the cheque-date window, our bank, the payee and the
 * search — the received filter bar's behaviour in the issued screen's words.
 * The search is debounced ~300 ms and fires at once on Enter; it lands in
 * grid 121's `isearch` (leaf, payee or favouring).
 */
import { useEffect, useRef, useState } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { ISSUED_TICKS, type IssuedFilters, type IssuedTick } from "../domain/filters";
import styles from "../../cheques.module.scss";

const SEARCH_DEBOUNCE_MS = 300;

export type IssuedFilterBarProps = {
  filters: IssuedFilters;
  onChange: (patch: Partial<IssuedFilters>) => void;
  onReset: () => void;
};

export function IssuedFilterBar({ filters, onChange, onReset }: IssuedFilterBarProps) {
  const bankDropdownId = useDropdownId("bankLedger");
  const partyDropdownId = useDropdownId("ledgerAll");

  const [text, setText] = useState(filters.search);
  const committed = useRef(filters.search);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

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

  const toggle = (key: IssuedTick) => {
    const on = filters.ticks.includes(key);
    onChange({
      ticks: on ? filters.ticks.filter((tick) => tick !== key) : [...filters.ticks, key],
    });
  };

  return (
    <section className={styles.filterBar} aria-label="Filters">
      <div className={styles.field}>
        <span className={styles.fieldLabel} title="Nothing ticked shows every status">
          Show
        </span>
        <div className={styles.ticks}>
          {ISSUED_TICKS.map((tick) => {
            const on = filters.ticks.includes(tick.key);
            return (
              <label key={tick.key} className={`${styles.tick} ${on ? styles.tickOn : ""}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(tick.key)} />
                {tick.label}
              </label>
            );
          })}
        </div>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Cheque date</span>
        <input
          type="date"
          className={`${styles.input} ${styles.dateInput}`}
          value={filters.from}
          max={filters.to || undefined}
          onChange={(event) => onChange({ from: event.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>to</span>
        <input
          type="date"
          className={`${styles.input} ${styles.dateInput}`}
          value={filters.to}
          min={filters.from || undefined}
          onChange={(event) => onChange({ to: event.target.value })}
        />
      </label>

      <div className={`${styles.field} ${styles.dropdownField}`}>
        <span className={styles.fieldLabel}>Our bank</span>
        <NexDropdownSingle
          dropdownId={bankDropdownId}
          aria-label="Our bank"
          placeholder="any bank"
          value={
            filters.bankLedgerId ? { id: filters.bankLedgerId, text: filters.bankLedgerName } : null
          }
          onChange={(selection) =>
            onChange({ bankLedgerId: selection?.id ?? "", bankLedgerName: selection?.text ?? "" })
          }
        />
      </div>

      <div className={`${styles.field} ${styles.dropdownField}`}>
        <span className={styles.fieldLabel}>Payee</span>
        <NexDropdownSingle
          dropdownId={partyDropdownId}
          aria-label="Payee"
          placeholder="any payee"
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
          placeholder="leaf, payee or favouring"
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

      <button type="button" className={styles.secondaryButton} onClick={onReset}>
        Reset
      </button>
    </section>
  );
}
