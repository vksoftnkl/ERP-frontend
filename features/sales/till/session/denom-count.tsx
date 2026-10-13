"use client";

/**
 * The cash count by denomination — Qt `TillDenomCount`, the widget S1 (the
 * opening float), S3 (pickup / top-up / paid-in) and S4 (End Shift) share.
 *
 * Two grids side by side — the notes on the left, the coins on the right —
 * a Qty box per denomination with its amount beside it, and a last "Loose /
 * other" line on the right for coin in a bag or a torn note, typed as one
 * figure. Enter in a Qty box moves down the left grid, then the right, then
 * to the loose box; Enter there hands the focus on (`onDone`). Every box
 * selects its text on focus (a click too), so a typed figure replaces it.
 *
 * The arithmetic is `../shared/denom.ts` (integer paise, tested); this file
 * only draws it.
 */
import { useMemo, useRef, type KeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import {
  layoutDenominations,
  lineAmountPaise,
  loosePaise,
  parseQty,
  qtyOf,
  withQty,
  type DenomCountValue,
  type Denomination,
} from "../shared/denom";
import { formatMoney, isAmountDraft } from "../shared/money";
import { selectOnFocus } from "../shared/select-on-focus";
import styles from "../shared/till.module.scss";

export type DenomCountProps = {
  denominations: readonly Denomination[];
  value: DenomCountValue;
  onChange: (next: DenomCountValue) => void;
  /** Ids are `${idPrefix}-qty-<n>` in Enter order, then `${idPrefix}-loose`. */
  idPrefix: string;
  disabled?: boolean;
  /** Enter on the loose box (the last one). */
  onDone?: () => void;
  autoFocusFirst?: boolean;
  /** The list has not come back yet. */
  loading?: boolean;
};

/** Focus a count's first Qty box (from the field before it). */
export function focusFirstQty(idPrefix: string): void {
  const input = document.getElementById(`${idPrefix}-qty-0`) as HTMLInputElement | null;
  if (input) {
    input.focus();
    input.select();
  }
}

export function DenomCount({
  denominations,
  value,
  onChange,
  idPrefix,
  disabled,
  onDone,
  autoFocusFirst,
  loading,
}: DenomCountProps) {
  const layout = useMemo(() => layoutDenominations(denominations), [denominations]);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const order = useMemo(() => new Map(layout.ordered.map((d, index) => [d.id, index])), [layout]);
  const looseIndex = layout.ordered.length;

  const move = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (index >= looseIndex) {
      onDone?.();
      return;
    }
    const next = inputs.current[index + 1];
    if (next) {
      next.focus();
      next.select();
    }
  };

  const row = (denom: Denomination) => {
    const index = order.get(denom.id) ?? 0;
    const qty = qtyOf(value, denom.id);
    const amount = lineAmountPaise(denom, value);
    return (
      <tr key={denom.id}>
        <td>{denom.label}</td>
        <td className={styles.right}>
          <input
            id={`${idPrefix}-qty-${index}`}
            ref={(element) => {
              inputs.current[index] = element;
            }}
            className={styles.qtyInput}
            inputMode="numeric"
            autoComplete="off"
            aria-label={`${denom.label} qty`}
            value={qty ? String(qty) : ""}
            disabled={disabled}
            autoFocus={autoFocusFirst && index === 0}
            onFocus={selectOnFocus}
            onKeyDown={(event) => move(event, index)}
            onChange={(event) => {
              const parsed = parseQty(event.target.value);
              if (parsed !== null) onChange(withQty(value, denom.id, parsed));
            }}
          />
        </td>
        <td className={cx(styles.right, amount === 0 && styles.amountIdle)}>{formatMoney(amount)}</td>
      </tr>
    );
  };

  const head = (
    <thead>
      <tr>
        <th scope="col">Denomination</th>
        <th scope="col" className={styles.right}>
          Qty
        </th>
        <th scope="col" className={styles.right}>
          Amount
        </th>
      </tr>
    </thead>
  );

  if (loading && denominations.length === 0) {
    return <p className={styles.muted}>Reading the denominations…</p>;
  }

  const loose = loosePaise(value);
  return (
    <div className={styles.denomGrid}>
      <table className={styles.table}>
        {head}
        <tbody>{layout.left.map(row)}</tbody>
      </table>
      <table className={styles.table}>
        {head}
        <tbody>
          {layout.right.map(row)}
          <tr>
            <td>Loose / other</td>
            <td className={styles.right}>
              <input
                id={`${idPrefix}-loose`}
                ref={(element) => {
                  inputs.current[looseIndex] = element;
                }}
                className={styles.qtyInput}
                inputMode="decimal"
                autoComplete="off"
                aria-label="Loose / other amount"
                value={value.loose}
                disabled={disabled}
                autoFocus={autoFocusFirst && looseIndex === 0}
                onFocus={selectOnFocus}
                onKeyDown={(event) => move(event, looseIndex)}
                onChange={(event) => {
                  const text = event.target.value.trim();
                  if (isAmountDraft(text)) onChange({ qty: value.qty, loose: text });
                }}
              />
            </td>
            <td className={cx(styles.right, loose === 0 && styles.amountIdle)}>{formatMoney(loose)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
