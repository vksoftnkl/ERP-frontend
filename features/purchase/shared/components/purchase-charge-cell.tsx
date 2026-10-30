"use client";

/**
 * A charge row's Rate / Amount cell — one for Purchase Entry and the GRN (Qt
 * `PurchaseInvoiceDelegate` on ui_table 62 in both). The cell keeps a local copy
 * while it is typed in and hands it back once — on Enter or on leaving it —
 * only when it changed; Esc puts the stored value back. A typed Amount is sent
 * as the amount (the screens' rules decide; this cell only types).
 */
import { useState } from "react";

export type PurchaseChargeNumberCellProps = {
  /** What the row holds. */
  value: string;
  /** What the cell shows while not typed in (a priced amount as money); default `value`. */
  display?: string;
  /** The typed text must match it (digits, one point, n places). */
  pattern: RegExp;
  className?: string;
  label: string;
  title?: string;
  disabled?: boolean;
  /** Extra attributes on the input (a screen's own focus marker). */
  attrs?: Record<string, string>;
  onCommit: (raw: string) => void;
  /** Enter, after the commit (the next cell). */
  onEnter?: () => void;
};

/** Typed numbers lose their grouping commas. */
function clean(raw: string): string {
  return raw.replace(/,/g, "").trim();
}

export function PurchaseChargeNumberCell({
  value,
  display,
  pattern,
  className,
  label,
  title,
  disabled,
  attrs,
  onCommit,
  onEnter,
}: PurchaseChargeNumberCellProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const commit = () => {
    if (editing === null) {
      return;
    }
    setEditing(null);
    if (clean(editing) !== value) {
      onCommit(clean(editing));
    }
  };
  return (
    <input
      className={className}
      value={editing ?? display ?? value}
      disabled={disabled}
      aria-label={label}
      title={title}
      inputMode="decimal"
      autoComplete="off"
      data-uppercase="off"
      {...attrs}
      onFocus={(event) => {
        setEditing(value);
        event.currentTarget.select();
      }}
      onBlur={commit}
      onChange={(event) => {
        const next = clean(event.target.value);
        if (pattern.test(next)) {
          setEditing(next);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          onEnter?.();
        } else if (event.key === "Escape" && editing !== null && editing !== value) {
          // the typed text back to the stored value; a second Esc goes on to the screen
          event.preventDefault();
          event.stopPropagation();
          setEditing(value);
        }
      }}
    />
  );
}
