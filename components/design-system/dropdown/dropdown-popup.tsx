"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/design-system/cx";
import { layoutRect, layoutViewportSize } from "@/lib/ui-scale";
import { Z_POPUP } from "@/lib/z-index";
import { dropdownColumnWidths } from "./config";
import { formatDropdownValue } from "./format";
import styles from "./nex-dropdown.module.scss";
import type { DropdownColumn, DropdownConfig, DropdownRow } from "./types";

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 28;
const FOOTER_HEIGHT = 26;
const VIEWPORT_PADDING = 8;
const MIN_POPUP_WIDTH = 160;
/** Distance from the bottom of the list at which the next page is requested. */
const LOAD_MORE_THRESHOLD = 48;

export type DropdownPopupProps = {
  anchorRef: MutableRefObject<HTMLElement | null>;
  listId: string;
  optionId: (index: number) => string;
  config: DropdownConfig | null;
  columns: readonly DropdownColumn[];
  rows: readonly DropdownRow[];
  highlight: number;
  loading: boolean;
  errorMessage: string | null;
  hasMore: boolean;
  total: number;
  onChoose: (index: number) => void;
  onHighlight: (index: number) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  /** Kept out of the outside-click test by the field that owns it. */
  popupRef: MutableRefObject<HTMLDivElement | null>;
  emptyText?: string;
};

type PopupPosition = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

export function DropdownPopup({
  anchorRef,
  listId,
  optionId,
  config,
  columns,
  rows,
  highlight,
  loading,
  errorMessage,
  hasMore,
  total,
  onChoose,
  onHighlight,
  onLoadMore,
  onRetry,
  popupRef,
  emptyText = "No matches",
}: DropdownPopupProps) {
  const [position, setPosition] = useState<PopupPosition | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const showHeader = config?.showHeader === true && columns.length > 0;
  const maxVisibleItems = config?.maxVisibleItems ?? 10;
  const configuredWidthPercent = config?.widthPercent ?? 0;
  const widths = dropdownColumnWidths(columns);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    // Layout pixels, not the visual pixels the DOM reports: these numbers are
    // written back out as CSS lengths inside a document that is already under the
    // global UI zoom, which would apply the scale a second time. See lib/ui-scale.
    const rect = layoutRect(anchor);
    const viewport = layoutViewportSize();

    // `dropdown_width` is a percent of the viewport; 0 means "match the field",
    // which is what the great majority of dropdowns are configured as.
    const configuredWidth = configuredWidthPercent
      ? (viewport.width * configuredWidthPercent) / 100
      : rect.width;
    const width = Math.min(
      Math.max(configuredWidth, MIN_POPUP_WIDTH),
      viewport.width - VIEWPORT_PADDING * 2,
    );
    const left = Math.max(
      VIEWPORT_PADDING,
      Math.min(rect.left, viewport.width - width - VIEWPORT_PADDING),
    );

    // Sized to content, capped at maxVisibleItems. The Qt widget sets the height
    // to rowHeight * maxVisibleItems unconditionally, so a search matching one row
    // shows one row and nine rows of void.
    const bodyRows = Math.max(rows.length, 1);
    const contentHeight =
      Math.min(bodyRows, maxVisibleItems) * ROW_HEIGHT +
      (showHeader ? HEADER_HEIGHT : 0) +
      (hasMore || (loading && rows.length > 0) ? FOOTER_HEIGHT : 0) +
      2;

    const spaceBelow = viewport.height - rect.bottom - VIEWPORT_PADDING - 4;
    const spaceAbove = rect.top - VIEWPORT_PADDING - 4;
    const placeUp = contentHeight > spaceBelow && spaceAbove > spaceBelow;
    const available = Math.max(placeUp ? spaceAbove : spaceBelow, ROW_HEIGHT * 2);

    setPosition({
      left,
      width,
      maxHeight: Math.min(contentHeight, available),
      ...(placeUp
        ? { bottom: viewport.height - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [anchorRef, configuredWidthPercent, hasMore, loading, maxVisibleItems, rows.length, showHeader]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    const handle = () => updatePosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [updatePosition]);

  // Keep the highlighted row in view when it moved by keyboard.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.children[highlight] as HTMLElement | undefined;
    if (!list || !row) {
      return;
    }
    if (row.offsetTop < list.scrollTop) {
      list.scrollTop = row.offsetTop;
      return;
    }
    const rowBottom = row.offsetTop + row.offsetHeight;
    if (rowBottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = rowBottom - list.clientHeight;
    }
  }, [highlight, rows.length]);

  const handleScroll = useCallback(() => {
    const list = listRef.current;
    if (!list || !hasMore) {
      return;
    }
    if (list.scrollHeight - list.scrollTop - list.clientHeight <= LOAD_MORE_THRESHOLD) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

  if (typeof document === "undefined") {
    return null;
  }

  const style: CSSProperties = {
    position: "fixed",
    zIndex: Z_POPUP,
    left: `${position?.left ?? 0}px`,
    width: `${position?.width ?? MIN_POPUP_WIDTH}px`,
    maxHeight: `${position?.maxHeight ?? ROW_HEIGHT * 4}px`,
    ...(position?.bottom !== undefined
      ? { bottom: `${position.bottom}px` }
      : { top: `${position?.top ?? 0}px` }),
    // Until the first measurement there is nowhere correct to draw it.
    visibility: position ? "visible" : "hidden",
  };

  const body = (() => {
    if (errorMessage) {
      return (
        <div className={cx(styles.notice, styles.noticeError)} role="alert">
          <span>{errorMessage}</span>
          <button
            type="button"
            className={styles.retry}
            // mousedown, not click: the field must not lose focus to this button.
            onMouseDown={(event) => {
              event.preventDefault();
              onRetry();
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    if (rows.length === 0) {
      return <div className={styles.notice}>{loading ? "Searching…" : emptyText}</div>;
    }
    return (
      <ul className={styles.list} id={listId} role="listbox" ref={listRef} onScroll={handleScroll}>
        {rows.map((row, index) => (
          <li
            key={optionId(index)}
            id={optionId(index)}
            role="option"
            aria-selected={index === highlight}
            className={cx(styles.row, index === highlight && styles.rowActive)}
            style={{ height: `${ROW_HEIGHT}px` }}
            // mousedown + preventDefault, not click: the input must keep focus, or
            // the field blurs and closes the list out from under the click.
            onMouseDown={(event) => {
              event.preventDefault();
              onChoose(index);
            }}
            onMouseEnter={() => onHighlight(index)}
          >
            {columns.map((column, columnIndex) => (
              <span
                key={column.jsonKey}
                className={cx(
                  styles.cell,
                  column.align === "center" && styles.cellCenter,
                  column.align === "right" && styles.cellRight,
                )}
                style={{ flex: `0 0 ${(widths[columnIndex] ?? 0) * 100}%` }}
              >
                {formatDropdownValue(row[column.jsonKey], column.dataType)}
              </span>
            ))}
          </li>
        ))}
      </ul>
    );
  })();

  return createPortal(
    <div ref={popupRef} className={styles.popup} style={style}>
      {showHeader && !errorMessage ? (
        <div className={styles.header} style={{ height: `${HEADER_HEIGHT}px` }}>
          {columns.map((column, columnIndex) => (
            <span
              key={column.jsonKey}
              className={cx(
                styles.cell,
                column.align === "center" && styles.cellCenter,
                column.align === "right" && styles.cellRight,
              )}
              style={{ flex: `0 0 ${(widths[columnIndex] ?? 0) * 100}%` }}
            >
              {column.heading}
            </span>
          ))}
        </div>
      ) : null}
      {body}
      {!errorMessage && rows.length > 0 && (hasMore || loading) ? (
        <div className={styles.footer}>
          {loading ? "Loading…" : `Showing ${rows.length} of ${total} — scroll for more`}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
