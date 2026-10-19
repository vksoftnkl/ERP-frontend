"use client";

/**
 * One typed cell of the New tags grid — the editors `TextileTagDelegate`
 * creates: a money / qty box with a decimal limit, a list name with a
 * completer, free text with a length cap.
 *
 * The cell keeps a local buffer while it has focus and commits on blur or
 * Enter, only if the text changed: an unchanged cell is not an edit, so
 * leaving a price as it was must not turn an "auto" price into a "typed" one
 * (the delegate's `setModelData` rule). The `data-quotation-*` attributes are
 * what `grid-focus`'s Enter walk reads.
 */
import { useRef, useState, type KeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import {
  GRID_COLUMN_INDEX_ATTR,
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
  GRID_GRID_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import type { TagAlign } from "../domain/textile-tag-entity";
import styles from "../page.module.scss";

export type TagCellKind = "text" | "money" | "qty" | "listName";

export type TagCellProps = {
  kind: TagCellKind;
  /** The raw cell text. */
  value: string;
  /** What the cell shows while NOT focused; defaults to the raw text. */
  display?: string;
  align: TagAlign;
  editable: boolean;
  bold?: boolean;
  muted?: boolean;
  title?: string;
  placeholder?: string;
  maxLength?: number;
  /** A `<datalist>` id — the completer of a list column. */
  listId?: string;
  /** Opt the cell out of the app-wide capitalization: codes and sizes keep their case. */
  keepCase?: boolean;
  gridName: string;
  rowKey: string;
  fieldKey: string;
  columnIndex: number;
  focusStop?: boolean;
  onCommit: (raw: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

/** Digits and one point, the fraction cut to `decimals` places. */
export function clampDecimal(text: string, decimals: number): string {
  const cleaned = text.replace(/[^\d.]/g, "");
  const point = cleaned.indexOf(".");
  if (point < 0) {
    return cleaned;
  }
  const integer = cleaned.slice(0, point);
  const fraction = cleaned.slice(point + 1).replace(/\./g, "").slice(0, decimals);
  return decimals === 0 ? integer : `${integer}.${fraction}`;
}

export function TagCell(props: TagCellProps) {
  const {
    kind,
    value,
    display,
    align,
    editable,
    bold,
    muted,
    title,
    placeholder,
    maxLength,
    listId,
    keepCase,
    gridName,
    rowKey,
    fieldKey,
    columnIndex,
    focusStop,
    onCommit,
    onKeyDown,
  } = props;
  const [buffer, setBuffer] = useState<string | null>(null);
  const seedRef = useRef("");
  const numeric = kind === "money" || kind === "qty";
  const decimals = kind === "qty" ? 3 : 2;

  const commit = () => {
    if (buffer !== null && buffer.trim() !== seedRef.current.trim()) {
      onCommit(buffer);
    }
    setBuffer(null);
  };

  const alignClass =
    align === "right" ? quotationStyles.alignRight : align === "center" ? quotationStyles.alignCenter : undefined;

  return (
    <input
      className={cx(
        quotationStyles.cellInput,
        alignClass,
        bold && styles.cellBold,
        muted && styles.cellMuted,
        !editable && styles.cellDisabled,
      )}
      type="text"
      inputMode={numeric ? "decimal" : undefined}
      value={buffer ?? display ?? value}
      disabled={!editable}
      placeholder={placeholder}
      title={title ?? (value || undefined)}
      maxLength={maxLength}
      list={listId}
      autoComplete="off"
      autoCapitalize={keepCase ? "off" : undefined}
      onFocus={(event) => {
        if (!editable) {
          return;
        }
        seedRef.current = value;
        setBuffer(value);
        event.currentTarget.select();
      }}
      onChange={(event) => {
        const text = event.target.value;
        setBuffer(numeric ? clampDecimal(text, decimals) : text);
      }}
      onBlur={commit}
      onWheel={(event) => {
        if (numeric) {
          event.currentTarget.blur();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
        }
        if (event.key === "Escape" && buffer !== null) {
          event.preventDefault();
          event.stopPropagation();
          setBuffer(null);
          return;
        }
        onKeyDown?.(event);
      }}
      {...{
        [GRID_GRID_ATTR]: gridName,
        [GRID_ROW_ATTR]: rowKey,
        [GRID_FIELD_ATTR]: fieldKey,
        [GRID_COLUMN_INDEX_ATTR]: columnIndex,
        ...(focusStop ? { [GRID_FOCUS_STOP_ATTR]: "true" } : {}),
      }}
    />
  );
}
