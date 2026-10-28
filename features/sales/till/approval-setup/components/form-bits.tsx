"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "@/components/design-system/cx";
import { focusNextInteractiveControl } from "@/components/design-system/ui/focus-next-control";
import type { Tone } from "../domain/approval-setup";
import styles from "../page.module.scss";
import { DateInput } from "@/components/design-system/ui/date-input";

const INK: Partial<Record<Tone, string>> = {
  danger: styles.inkDanger,
  warning: styles.inkWarning,
  muted: styles.inkMuted,
  info: styles.inkInfo,
  branch: styles.inkBranch,
  success: styles.inkSuccess,
};

export function inkOf(tone: Tone | undefined): string | undefined {
  return tone ? INK[tone] : undefined;
}

const PILL_TONE: Partial<Record<Tone, string>> = {
  info: styles.toneInfo,
  branch: styles.toneBranch,
  warning: styles.toneWarning,
};

export function Pill({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx(styles.pill, tone && PILL_TONE[tone])}>{children}</span>;
}

/**
 * The Qt dialog's Enter: a text box, date or tick hands focus to the next
 * control. A dropdown whose list is open takes Enter first (and prevents it);
 * a button still presses itself.
 */
export function advanceOnEnter(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter" || event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  event.preventDefault();
  focusNextInteractiveControl(target);
}

/** A caption and its control. */
export function Field({
  id,
  label,
  span,
  children,
}: {
  id?: string;
  label: string;
  /** The control takes two grid cells. */
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <label className={styles.fieldCap} htmlFor={id}>
        {label}
      </label>
      <div className={cx(span && styles.span2)} style={{ minWidth: 0 }}>
        {children}
      </div>
    </>
  );
}

export function Check({
  label,
  checked,
  disabled,
  onChange,
  className,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}) {
  return (
    <label className={cx(styles.checkLine, disabled && styles.checkDisabled, className)}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

/** A figure held as the text typed: digits and, with places, one point. */
export function NumberBox({
  id,
  value,
  onChange,
  disabled,
  decimals = 2,
  max,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  decimals?: number;
  max?: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const pattern = decimals > 0 ? new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`) : /^\d*$/;
  return (
    <input
      id={id}
      className={cx(styles.textInput, styles.numberInput)}
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      data-uppercase="off"
      autoComplete="off"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => {
        const next = event.target.value.replace(/,/g, "");
        if (!pattern.test(next)) return;
        // A ceiling on the typed figure only; the digits are compared, never added.
        if (max !== undefined && next !== "" && Number(next) > max) return;
        onChange(next);
      }}
      onFocus={(event) => event.target.select()}
    />
  );
}

export function DateBox({
  id,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <DateInput
      block
      id={id}
      className={styles.textInput}
      data-uppercase="off"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      // A cleared date is not a date: keep the last one.
      onChange={(value) => {
        if (value) onChange(value);
      }}
    />
  );
}

export type Column<T> = {
  key: string;
  label: string;
  align?: "right" | "center";
  stretch?: boolean;
  tick?: boolean;
  text: (row: T) => string;
  tone?: (row: T) => Tone | undefined;
};

/**
 * A plain list with one selected row: click or ↑/↓ selects (the screen asks
 * first when the form has unsaved changes). Without `onSelect` it is read-only
 * — as Till Approval Authority's "Who can approve?" table uses it.
 */
export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  selectedId,
  onSelect,
  emptyText,
  short,
  className,
}: {
  label: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  emptyText: ReactNode;
  /** A table that shares its pane: no taller than about six rows. */
  short?: boolean;
  className?: string;
}) {
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);

  useEffect(() => {
    if (!selectedId || !bodyRef.current) return;
    bodyRef.current.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [selectedId, rows]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onSelect || (event.key !== "ArrowDown" && event.key !== "ArrowUp") || rows.length === 0) return;
    event.preventDefault();
    const index = rows.findIndex((row) => rowKey(row) === selectedId);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = index < 0 ? (step > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, index + step));
    if (next !== index) onSelect(rowKey(rows[next]));
  };

  return (
    <div
      className={cx(styles.tableWrap, short && styles.tableShort, className)}
      tabIndex={onSelect ? 0 : -1}
      role="grid"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <table className={cx(styles.table, onSelect && styles.selectable)}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cx(
                  column.align === "right" && styles.alignRight,
                  column.align === "center" && styles.alignCenter,
                  column.stretch && styles.stretch,
                  column.tick && styles.tick,
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rows.map((row) => {
            const id = rowKey(row);
            const selected = Boolean(onSelect) && id === selectedId;
            return (
              <tr
                key={id}
                data-row-id={id}
                aria-selected={selected}
                className={cx(selected && styles.rowSelected)}
                onClick={onSelect ? () => onSelect(id) : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cx(
                      column.align === "right" && styles.alignRight,
                      column.align === "center" && styles.alignCenter,
                      inkOf(column.tone?.(row)),
                    )}
                  >
                    {column.text(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? <div className={styles.tableEmpty}>{emptyText}</div> : null}
    </div>
  );
}
