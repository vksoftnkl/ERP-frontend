"use client";

/**
 * The Change Selling Price grid: ui table 44's columns under the price-band
 * strip, one row per price-table row, the spare line last.
 *
 * Keys, as the Qt NexTable binds them on this grid (line keys ON):
 *   Enter / Shift+Enter  the layout's Enter chain (`grid-focus.ts`)
 *   ↑ / ↓                the same column one row up / down
 *   +                    the spare line's Barcode cell (scan there, or Item)
 *   −                    take the current row off the grid (Ctrl+− on a
 *                        markup cell, where a bare − is a negative markup)
 *   F12                  the bucket list (bound screen-wide)
 *
 * A grid of thousands of rows (a group filter at a big branch) is drawn a
 * window at a time; the rows on either side of the view are always in the
 * DOM, so the Enter walk and the arrows never step off the drawn rows.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cx } from "@/components/design-system/cx";
import { useUiTableId } from "@/lib/ui-tables";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import { useColumnResize } from "@/features/sales/quotation/components/use-column-resize";
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import {
  GRID_FIELD_ATTR,
  GRID_GRID_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import { scaledWidth, totalColumnWidth } from "@/features/sales/quotation/quotation.utils";
import qs from "@/features/sales/quotation/page.module.scss";
import { priceBands, resolveSellingPriceColumns } from "../selling-price.columns";
import {
  SELLING_PRICE_GRID_NAME,
  SELLING_PRICE_UI_TABLE_KEY,
  isMkupKey,
} from "../selling-price.constants";
import { SPARE_ROW_KEY, type SellingPriceScreen } from "../use-selling-price-screen";
import { PriceRow, SpareRow, type CellFit } from "./price-cells";
import styles from "../page.module.scss";

/** Below this many rows every row is drawn; above it, a window of them. */
const WINDOW_THRESHOLD = 300;
const OVERSCAN = 12;
const DEFAULT_ROW_PX = 24;

type Focusable = HTMLInputElement;

/** The same column one row up or down. */
function moveRowFocus(from: Focusable, delta: 1 | -1): boolean {
  const field = from.getAttribute(GRID_FIELD_ATTR);
  if (!field) {
    return false;
  }
  const cells = Array.from(
    document.querySelectorAll<Focusable>(
      `[${GRID_GRID_ATTR}="${SELLING_PRICE_GRID_NAME}"][${GRID_FIELD_ATTR}="${field}"]`,
    ),
  );
  const index = cells.indexOf(from);
  const target = index >= 0 ? cells[index + delta] : undefined;
  if (!target) {
    return false;
  }
  target.focus();
  target.select();
  return true;
}

export function PriceGrid({ screen }: { screen: SellingPriceScreen }) {
  const {
    rows,
    current,
    serverProblemKeys,
    saving,
    belowCostPolicy,
    branchCell,
    levelNames,
    spareBarcode,
    setSpareBarcode,
    onCellFocus,
    onCellCommit,
    onCellRefused,
    onBarcodeCommit,
    openPicker,
    goToSpareLine,
    removeCurrentRow,
    registerReveal,
  } = screen;

  // ------------------------------------------------------------- columns
  const uiTableId = useUiTableId(SELLING_PRICE_UI_TABLE_KEY);
  const layout = useGetQuotationGridLayoutQuery({ uiTableId }, { skip: !uiTableId });
  const configured = useMemo(() => resolveSellingPriceColumns(layout.data), [layout.data]);
  const resize = useColumnResize(configured, uiTableId);
  // Right-click on the grid: "save column width" and "Admin settings" — the
  // shared layout, as the other entry grids have.
  const settings = useGridSettings({
    label: "Selling prices",
    uiTableId,
    columns: resize.columns,
    pendingWidthCount: resize.pendingCount,
    savingWidths: resize.saving,
    onSaveWidths: resize.saveWidths,
  });
  const visible = useMemo(() => resize.columns.filter((column) => column.visible), [resize.columns]);
  const bands = useMemo(() => priceBands(visible, levelNames), [levelNames, visible]);
  const tableWidth = totalColumnWidth(visible);

  // ------------------------------------------------------------- drawn widths
  // The table stretches past the configured widths to fill the shell, so the
  // delta chip's fit is judged on what is actually drawn.
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [fit, setFit] = useState<CellFit>({ unitPx: 16, widths: {} });
  useEffect(() => {
    const table = tableRef.current;
    if (!table) {
      return;
    }
    const read = () => {
      const unitPx = Number.parseFloat(window.getComputedStyle(table).fontSize) || 16;
      const widths: Record<string, number> = {};
      table.querySelectorAll<HTMLTableCellElement>("th[data-column]").forEach((cell) => {
        const key = cell.dataset.column;
        if (key) widths[key] = cell.offsetWidth;
      });
      setFit((previous) =>
        previous.unitPx === unitPx && JSON.stringify(previous.widths) === JSON.stringify(widths)
          ? previous
          : { unitPx, widths },
      );
    };
    read();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    observer?.observe(table);
    return () => observer?.disconnect();
  }, [visible]);

  // ------------------------------------------------------------- window
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [rowPx, setRowPx] = useState(DEFAULT_ROW_PX);
  const windowed = rows.length > WINDOW_THRESHOLD;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const measure = () => setViewportHeight(viewport.clientHeight || 600);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    return () => observer?.disconnect();
  }, []);

  // The row height follows the page's fluid unit — read it off a drawn row.
  useLayoutEffect(() => {
    const first = bodyRef.current?.querySelector<HTMLTableRowElement>("tr[data-row-index]");
    const height = first?.getBoundingClientRect().height;
    if (height && Math.abs(height - rowPx) > 0.5) {
      setRowPx(height);
    }
  }, [rowPx, rows, visible]);

  const start = windowed ? Math.max(0, Math.floor(scrollTop / rowPx) - OVERSCAN) : 0;
  const end = windowed
    ? Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / rowPx) + OVERSCAN)
    : rows.length;

  // Bring a row that is not drawn into view, so focus can land on it.
  const rowsRef = useRef(rows);
  const rowPxRef = useRef(rowPx);
  useLayoutEffect(() => {
    rowsRef.current = rows;
    rowPxRef.current = rowPx;
  }, [rowPx, rows]);
  const reveal = useCallback((rowKey: string): boolean => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return false;
    }
    if (rowKey === SPARE_ROW_KEY) {
      viewport.scrollTop = viewport.scrollHeight;
      return true;
    }
    const index = rowsRef.current.findIndex((row) => row.key === rowKey);
    if (index < 0) {
      return false;
    }
    viewport.scrollTop = Math.max(0, index * rowPxRef.current - viewport.clientHeight / 2);
    setScrollTop(viewport.scrollTop);
    return true;
  }, []);
  useEffect(() => registerReveal(reveal), [registerReveal, reveal]);

  // ------------------------------------------------------------- keys
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTableSectionElement>) => {
    const target = event.target as HTMLElement;
    const rowKey = target.getAttribute(GRID_ROW_ATTR);
    const field = target.getAttribute(GRID_FIELD_ATTR);
    if (!rowKey || !field || !(target instanceof HTMLInputElement)) {
      return;
    }
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      moveCellFocus(SELLING_PRICE_GRID_NAME, target, event.shiftKey ? -1 : 1);
      return;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !event.altKey) {
      if (moveRowFocus(target, event.key === "ArrowDown" ? 1 : -1)) {
        event.preventDefault();
      }
      return;
    }
    const plain = !event.altKey && !event.metaKey;
    if (event.key === "+" && plain && !event.ctrlKey) {
      // The scan field takes what it is given; everywhere else + is the line key.
      if (field === "barcodeText") {
        return;
      }
      event.preventDefault();
      goToSpareLine();
      return;
    }
    if (event.key === "-" && plain) {
      // Never the spare line — there is nothing on it to remove. A bare − on a
      // markup is a negative markup, and the scan field takes what it is given.
      if (rowKey === SPARE_ROW_KEY) {
        return;
      }
      if (event.ctrlKey || (!isMkupKey(field) && field !== "barcodeText")) {
        event.preventDefault();
        void removeCurrentRow();
      }
    }
  };

  // ------------------------------------------------------------- render
  const drawn = rows.slice(start, end);
  const topPad = start * rowPx;
  const bottomPad = (rows.length - end) * rowPx;

  return (
    <div className={styles.gridShell}>
      {settings.overlays}
      <div
        ref={viewportRef}
        className={styles.gridViewport}
        data-selling-price-grid="true"
        onContextMenu={settings.onContextMenu}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <table ref={tableRef} className={styles.grid} style={{ width: scaledWidth(tableWidth) }}>
          <colgroup>
            {visible.map((column) => (
              <col key={column.key} style={{ width: scaledWidth(column.widthPx) }} />
            ))}
          </colgroup>
          <thead>
            <tr className={styles.bandRow}>
              {bands.map((band) => (
                <th
                  key={band.key}
                  colSpan={band.span}
                  style={{ background: band.bg, color: band.fg, textAlign: band.align }}
                  title={band.text || undefined}
                >
                  {band.text}
                </th>
              ))}
            </tr>
            <tr className={styles.headRow}>
              {visible.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  data-column={column.key}
                  title={column.header}
                  className={cx(
                    styles.headCell,
                    resize.resizingKey === column.key && styles.headCellResizing,
                  )}
                >
                  {column.header}
                  <span
                    className={styles.resizeHandle}
                    role="presentation"
                    title="Drag to resize the column"
                    onMouseDown={(event) => resize.onResizeStart(event, column.key)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={bodyRef} onKeyDown={onKeyDown}>
            {topPad > 0 ? (
              <tr aria-hidden="true" style={{ height: topPad }}>
                <td colSpan={visible.length} />
              </tr>
            ) : null}
            {drawn.map((row, offset) => {
              const index = start + offset;
              return (
                <PriceRow
                  key={row.key}
                  row={row}
                  index={index}
                  columns={visible}
                  fit={fit}
                  current={current.rowKey === row.key}
                  problem={serverProblemKeys.has(row.key)}
                  saving={saving}
                  belowCostPolicy={belowCostPolicy}
                  branchText={branchCell(row)}
                  onFocus={onCellFocus}
                  onCommit={onCellCommit}
                  onRefused={onCellRefused}
                  onOpenPicker={openPicker}
                />
              );
            })}
            {bottomPad > 0 ? (
              <tr aria-hidden="true" style={{ height: bottomPad }}>
                <td colSpan={visible.length} />
              </tr>
            ) : null}
            <SpareRow
              columns={visible}
              barcode={spareBarcode}
              current={current.rowKey === null && current.column !== null}
              onBarcodeChange={setSpareBarcode}
              onBarcodeCommit={onBarcodeCommit}
              onFocus={onCellFocus}
              onOpenPicker={openPicker}
              onRefused={onCellRefused}
            />
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className={styles.emptyGrid}>
            Nothing on the grid yet — F8 filters and loads the items, or type an item in the Item cell.
          </p>
        ) : null}
      </div>
      {resize.pendingCount > 0 ? (
        <div className={styles.widthsBar}>
          <button type="button" className={qs.button} disabled={resize.saving} onClick={resize.saveWidths}>
            Save column widths ({resize.pendingCount})
          </button>
        </div>
      ) : null}
    </div>
  );
}
