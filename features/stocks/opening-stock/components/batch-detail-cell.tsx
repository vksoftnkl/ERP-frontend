"use client";

/**
 * The Size, Colour and Model cells — the editors Qt 74b755c's
 * `OpeningStockDelegate` creates for the textile columns: an editable combo for
 * Size / Colour (pick from the list, or type a name that is not on it yet) and
 * a line edit with the item's earlier models as its completer for Model.
 *
 * On the web both are one text input with a `<datalist>`: the browser's own
 * completer, which matches anywhere in the name and ignores case, as the Qt
 * completers were set to (`MatchContains`, `CaseInsensitive`). What a typed
 * name MEANS — a list row, or a new name to offer for adding — is decided on
 * commit by the screen (`resolveChoice`), not here.
 *
 * Like `GridCell`, the cell keeps a local buffer while it has focus and commits
 * on blur or Enter, only when the text changed; Escape drops the edit. The
 * `data-quotation-*` attributes are what `grid-focus`'s Enter walk reads.
 *
 * The app-wide capitalisation is left ON (no `data-uppercase="off"`): the Size
 * and Colour masters let it rewrite names, so a size quick-added here is spelt
 * the way the master would have spelt it, and the list match ignores case.
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

export type BatchDetailCellProps = {
  value: string;
  editable: boolean;
  invalid?: boolean;
  /** The `<datalist>` this cell completes from; absent = no suggestions. */
  listId?: string;
  maxLength: number;
  title?: string;
  gridName: string;
  rowKey: string;
  fieldKey: string;
  columnIndex: number;
  focusStop?: boolean;
  onCommit: (raw: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

export function BatchDetailCell(props: BatchDetailCellProps) {
  const {
    value,
    editable,
    invalid,
    listId,
    maxLength,
    title,
    gridName,
    rowKey,
    fieldKey,
    columnIndex,
    focusStop,
    onCommit,
    onKeyDown,
  } = props;
  const [buffer, setBufferState] = useState<string | null>(null);
  /**
   * The buffer as of NOW. Enter commits and the grid's walk then focuses the
   * next cell inside the same keydown, so this cell's blur runs before React
   * re-renders — with the old `buffer` still in its closure. Read through the
   * ref, that second commit sees the buffer already cleared: a new size or
   * colour is offered for adding once, not twice.
   */
  const bufferRef = useRef<string | null>(null);
  const setBuffer = (next: string | null) => {
    bufferRef.current = next;
    setBufferState(next);
  };
  /** The text the buffer was seeded with — an untouched cell is not an edit. */
  const seedRef = useRef("");

  const commit = () => {
    const pending = bufferRef.current;
    if (pending !== null && pending !== seedRef.current) {
      onCommit(pending);
    }
    setBuffer(null);
  };

  return (
    <input
      className={cx(quotationStyles.cellInput, invalid && quotationStyles.cellInvalid)}
      type="text"
      value={buffer ?? value}
      disabled={!editable}
      title={title ?? (value || undefined)}
      maxLength={maxLength}
      list={editable ? listId : undefined}
      // The datalist is the completer; the browser's own form history is not.
      autoComplete="off"
      onFocus={(event) => {
        if (!editable) {
          return;
        }
        seedRef.current = value;
        setBuffer(value);
        event.currentTarget.select();
      }}
      onChange={(event) => setBuffer(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
        }
        if (event.key === "Escape" && buffer !== null) {
          event.preventDefault();
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
        // Absent rather than "false": the walker tests for the attribute.
        ...(focusStop ? { [GRID_FOCUS_STOP_ATTR]: "true" } : {}),
      }}
    />
  );
}
