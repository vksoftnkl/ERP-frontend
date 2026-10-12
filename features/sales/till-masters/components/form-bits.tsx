"use client";

/**
 * The pieces every till master popup is built from — the web side of Qt's
 * NexCrudForm fields: a heading per section, caption + control pairs two to a
 * line, check boxes that carry their own text, and amount / count boxes held as
 * the text typed.
 */
import type { ReactNode } from "react";

import { cx } from "@/components/design-system/cx";
import type { TillMasterKind } from "../domain/till-masters";
import styles from "../page.module.scss";

/** The DOM id of a popup field — also how a refused Save puts the caret back. */
export function fieldId(kind: TillMasterKind, field: string): string {
  return `till-${kind}-${field}`;
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h3 className={styles.sectionHeading}>{children}</h3>;
}

/** A caption and its control. `wide` takes the whole line. */
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
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cx(styles.field, wide && styles.fieldWide)}>
      <label className={styles.fieldCaption} htmlFor={id}>
        {label}
        {required ? <span className={styles.required}> *</span> : null}
      </label>
      <div className={styles.fieldControl}>{children}</div>
    </div>
  );
}

/** A check box with its own text, in a field's place (Qt `F::checkBox`). */
export function Check({
  id,
  label,
  checked,
  disabled,
  autoFocus,
  onChange,
}: {
  id?: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldCaption} aria-hidden="true" />
      <label className={cx(styles.checkLine, disabled && styles.checkDisabled)}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
    </div>
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
  placeholder,
  required,
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  decimals?: number;
  max?: number;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const pattern = decimals > 0 ? new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`) : /^\d*$/;
  return (
    <input
      id={id}
      className={cx(styles.textInput, styles.numberInput)}
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      autoFocus={autoFocus}
      data-required={required ? "true" : undefined}
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

/** The facts line (muted) and the warning lines (amber) under a form; nothing when empty. */
export function Notes({ facts, warnings }: { facts: string; warnings: readonly string[] }) {
  if (!facts && warnings.length === 0) return null;
  return (
    <div className={styles.notes}>
      {facts ? <p className={styles.facts}>{facts}</p> : null}
      {warnings.length > 0 ? (
        <ul className={styles.warnings}>
          {warnings.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
