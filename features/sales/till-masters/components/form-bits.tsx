"use client";

import type { ReactNode } from "react";

import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";

/** A caption and its control, in the form's two-pairs-per-line grid. */
export function Field({
  id,
  label,
  required,
  wide,
  children,
}: {
  id?: string;
  label: string;
  required?: boolean;
  /** Take the rest of the line. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <label className={styles.fieldCap} htmlFor={id}>
        {label}
        {required ? <span className={styles.required}> *</span> : null}
      </label>
      <div className={cx(styles.fieldControl, wide && styles.fieldWide)}>{children}</div>
    </>
  );
}

export function Check({
  label,
  checked,
  disabled,
  onChange,
  span,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  /** In the form grid: a caption + control pair's width, or the whole line. */
  span?: "pair" | "full";
}) {
  return (
    <label
      className={cx(
        styles.checkLine,
        span === "pair" && styles.fieldPair,
        span === "full" && styles.fieldFull,
        disabled && styles.checkDisabled,
      )}
    >
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

/** A numeric box held as text: digits, one point, two places for an amount. */
export function NumberBox({
  id,
  value,
  onChange,
  disabled,
  decimals = 2,
  max,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  decimals?: number;
  max?: number;
}) {
  const pattern = decimals > 0 ? new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`) : /^\d*$/;
  return (
    <input
      id={id}
      className={cx(styles.textInput, styles.numberInput)}
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value.replace(/,/g, "");
        if (!pattern.test(next)) return;
        if (max !== undefined && Number(next) > max) return;
        onChange(next);
      }}
      onFocus={(event) => event.target.select()}
    />
  );
}

/** "FACTS read-only": figures the grid derives, never typed. */
export function Facts({ items }: { items: readonly { label: string; value: string; tone?: "danger" }[] }) {
  return (
    <div className={styles.facts}>
      {items.map((item) => (
        <div key={item.label} className={styles.fact}>
          <span className={styles.factCap}>{item.label}</span>
          <span className={cx(styles.factValue, item.tone === "danger" && styles.toneDanger)}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Warning({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return <p className={styles.warning}>{lines.join(" · ")}</p>;
}
