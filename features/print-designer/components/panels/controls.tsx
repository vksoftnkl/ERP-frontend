"use client";

/**
 * Property grid primitives.
 *
 * The panel is a Qt-style property grid: one row per property, a name cell and
 * a value cell, editors flush inside the cell with no border until hovered.
 * `Section` is a collapsible category header, `FieldRow` is one row, and
 * `FieldGrid` is `display: contents` so a section can group rows without
 * breaking the two-column alignment that makes the grid readable.
 *
 * Two behaviours everything shares, and both exist because of multi-selection:
 *
 *   * MIXED. When the selected elements disagree about a value the control
 *     shows an empty, dashed box rather than the first element's value. Showing
 *     one element's value would make "8" look like the truth for all six, and
 *     the first keystroke would silently flatten them.
 *   * COMMIT ON REST. Numeric and text inputs hold their own draft and commit
 *     on blur or Enter, so typing "12" into a width does not pass through the
 *     value 1 and resize everything to the minimum on the way.
 */

import {
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import styles from "@/features/print-designer/components/designer.module.scss";

/** Sentinel for "the selection disagrees about this value". */
export const MIXED = Symbol("mixed");
export type MaybeMixed<T> = T | typeof MIXED;

/** Reduce a selection to one value, or MIXED when they differ. */
export function sharedValue<TItem, TValue>(
  items: readonly TItem[],
  read: (item: TItem) => TValue,
): MaybeMixed<TValue> | undefined {
  if (!items.length) {
    return undefined;
  }
  const first = read(items[0]);
  return items.every((item) => Object.is(read(item), first)) ? first : MIXED;
}

export const isMixed = <T,>(value: MaybeMixed<T> | undefined): value is typeof MIXED =>
  value === MIXED;

export function Section({
  title,
  children,
  defaultOpen = true,
  actions,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={styles.section}>
      <button type="button" className={styles.sectionHead} onClick={() => setOpen((it) => !it)}>
        <span>{open ? "▾" : "▸"}</span>
        <span>{title}</span>
        {actions ? <span className={styles.spacer} /> : null}
        {actions}
      </button>
      {open ? <div className={styles.sectionBody}>{children}</div> : null}
    </section>
  );
}

/**
 * One property row. `wide` drops the two-column split for editors that need the
 * width — an expression box, a strip of alignment buttons.
 */
export function FieldRow({
  label,
  children,
  wide = false,
}: {
  label?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (wide) {
    return (
      <div className={`${styles.propRow} ${styles.propRowWide}`}>
        {label ? <div className={styles.propName}>{label}</div> : null}
        <div className={styles.propValue} style={{ padding: 0 }}>
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.propRow}>
      <div className={styles.propName}>{label}</div>
      <div className={styles.propValue}>{children}</div>
    </div>
  );
}

/** Groups rows without breaking the grid: the rows stay direct children. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function NumberInput({
  label,
  value,
  step = 0.5,
  min,
  max,
  suffix,
  disabled,
  onCommit,
}: {
  label: string;
  value: MaybeMixed<number> | undefined;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const mixed = isMixed(value);
  const external = mixed || value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(external);
  // Reset the draft DURING render when the selection's value changes, rather
  // than in an effect: an effect would paint the previous element's number for
  // one frame, which reads as the panel lagging behind the canvas.
  const [lastExternal, setLastExternal] = useState(external);
  if (external !== lastExternal) {
    setLastExternal(external);
    setDraft(external);
  }

  const commit = () => {
    if (draft.trim() === "") {
      setDraft(external);
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(external);
      return;
    }
    onCommit(parsed);
  };

  return (
    <FieldRow label={suffix ? `${label} (${suffix})` : label}>
      <input
        className={`${styles.input} ${mixed ? styles.mixed : ""}`}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        placeholder={mixed ? "Mixed" : undefined}
        value={draft}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          // Arrow keys belong to the input here, not to the canvas nudge.
          event.stopPropagation();
        }}
      />
    </FieldRow>
  );
}

export function TextInput({
  label,
  value,
  placeholder,
  mono = false,
  wide = false,
  disabled,
  onCommit,
}: {
  label: string;
  value: MaybeMixed<string> | undefined;
  placeholder?: string;
  mono?: boolean;
  wide?: boolean;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const mixed = isMixed(value);
  const external = mixed || value === undefined ? "" : value;
  const [draft, setDraft] = useState(external);
  const [lastExternal, setLastExternal] = useState(external);
  if (external !== lastExternal) {
    setLastExternal(external);
    setDraft(external);
  }

  return (
    <FieldRow label={label} wide={wide}>
      <input
        className={`${styles.input} ${mono ? styles.inputMono : ""} ${mixed ? styles.mixed : ""}`}
        type="text"
        disabled={disabled}
        placeholder={mixed ? "Mixed" : placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit(draft);
          }
          event.stopPropagation();
        }}
      />
    </FieldRow>
  );
}

export function SelectInput<T extends string>({
  label,
  value,
  options,
  wide = false,
  disabled,
  onCommit,
}: {
  label: string;
  value: MaybeMixed<T> | undefined;
  options: ReadonlyArray<{ value: T; label: string }>;
  wide?: boolean;
  disabled?: boolean;
  onCommit: (value: T) => void;
}) {
  const mixed = isMixed(value);
  return (
    <FieldRow label={label} wide={wide}>
      <select
        className={`${styles.input} ${mixed ? styles.mixed : ""}`}
        disabled={disabled}
        value={mixed || value === undefined ? "" : value}
        onChange={(event) => onCommit(event.target.value as T)}
      >
        {mixed ? <option value="">Mixed</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

/**
 * A boolean property. The name goes in the name cell like every other row —
 * a checkbox with its own inline label would break the grid's alignment, which
 * is the only reason a property grid is scannable.
 */
export function CheckboxInput({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: MaybeMixed<boolean> | undefined;
  disabled?: boolean;
  onCommit: (value: boolean) => void;
}) {
  const mixed = isMixed(value);
  return (
    <FieldRow label={label}>
      <span className={styles.checkRow}>
        <input
          type="checkbox"
          disabled={disabled}
          checked={!mixed && value === true}
          // A mixed checkbox shows the indeterminate dash, and clicking it turns
          // the whole selection on — the least surprising resolution.
          ref={(node) => {
            if (node) {
              node.indeterminate = mixed;
            }
          }}
          onChange={(event) => onCommit(mixed ? true : event.target.checked)}
        />
        {mixed ? <span className={styles.fieldLabel}>Mixed</span> : null}
      </span>
    </FieldRow>
  );
}

export function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onCommit,
}: {
  label: string;
  value: MaybeMixed<T> | undefined;
  options: ReadonlyArray<{ value: T; label: string; title?: string }>;
  onCommit: (value: T) => void;
}) {
  return (
    <FieldRow label={label}>
      <div className={styles.toggleRow}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.title ?? option.label}
            className={`${styles.toolButton} ${
              !isMixed(value) && value === option.value ? styles.toolButtonActive : ""
            }`}
            onClick={() => onCommit(option.value)}
          >
            <span className={styles.toolIcon}>{option.label}</span>
          </button>
        ))}
      </div>
    </FieldRow>
  );
}

export function ColorInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: MaybeMixed<string | undefined> | undefined;
  onCommit: (value: string | undefined) => void;
}) {
  const mixed = isMixed(value);
  const literal = !mixed && typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <FieldRow label={label}>
      <div className={styles.colorRow}>
        <input
          type="color"
          className={styles.colorSwatch}
          value={literal ? (value as string) : "#000000"}
          onChange={(event) => onCommit(event.target.value)}
          aria-label={label}
        />
        {/* The schema lets a colour be an expression, so the text box stays
            editable even when the swatch cannot represent the value. */}
        <input
          className={`${styles.input} ${styles.inputMono}`}
          type="text"
          placeholder={mixed ? "Mixed" : "inherit"}
          value={mixed ? "" : ((value as string | undefined) ?? "")}
          onChange={(event) => onCommit(event.target.value || undefined)}
          onKeyDown={(event) => event.stopPropagation()}
        />
      </div>
    </FieldRow>
  );
}

export function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className={styles.emptyPanel}>{children}</div>;
}
