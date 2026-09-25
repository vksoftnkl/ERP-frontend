"use client";

/**
 * The frame the bill's own registers share (§24): a title, a toolbar of
 * verbs, a filter row, a table with the ↑↓ / Enter walk, a server pager and
 * a hint line. The key comes FROM THE ROW, never the session, so the verbs
 * are handed the highlighted row and nothing else.
 */
import type { ReactNode } from "react";
import { cx } from "@/components/design-system/cx";
import { useListKeyboardNav } from "@/features/sales/quotation/components/use-list-keyboard-nav";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import styles from "@/features/sales/testbill/page.module.scss";

export type RegisterColumn<TRow> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render: (row: TRow) => ReactNode;
};

export type RegisterShellProps<TRow> = {
  title: string;
  subtitle?: string;
  toolbar: ReactNode;
  filters: ReactNode;
  columns: RegisterColumn<TRow>[];
  rows: TRow[];
  rowKey: (row: TRow) => string;
  rowClassName?: (row: TRow) => string | undefined;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onRowEnter: (row: TRow) => void;
  loading: boolean;
  emptyText: string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  hint: ReactNode;
  /** Pauses the key walk while a dialog is over the list. */
  paused?: boolean;
};

export function RegisterShell<TRow>(props: RegisterShellProps<TRow>) {
  const { rows, activeIndex, onActiveIndexChange, onRowEnter, page, pageSize, total } = props;
  const { viewportRef } = useListKeyboardNav({
    isOpen: true,
    rowCount: rows.length,
    activeIndex,
    setActiveIndex: (value) => onActiveIndexChange(typeof value === "function" ? value(activeIndex) : value),
    onEnter: () => {
      const row = rows[activeIndex];
      if (row) onRowEnter(row);
    },
    paused: props.paused,
  });
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={cx(quotationStyles.page, styles.registerPage)}>
      <header className={quotationStyles.titleBar}>
        <h1 className={cx(quotationStyles.title, styles.entryTitle)}>{props.title}</h1>
        {props.subtitle ? <span className={quotationStyles.titleMeta}>{props.subtitle}</span> : null}
      </header>
      <div className={quotationStyles.listToolbar}>{props.toolbar}</div>
      <div className={quotationStyles.listFilters}>{props.filters}</div>
      <div className={cx(quotationStyles.listViewport, styles.registerViewport)} ref={viewportRef}>
        <table className={quotationStyles.listTable}>
          <thead>
            <tr>
              {props.columns.map((column) => (
                <th key={column.key} scope="col" className={column.align === "right" ? quotationStyles.alignRight : undefined}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={props.rowKey(row)}
                className={props.rowClassName?.(row)}
                data-selected={index === activeIndex ? "true" : undefined}
                onClick={() => onActiveIndexChange(index)}
                onDoubleClick={() => onRowEnter(row)}
              >
                {props.columns.map((column) => (
                  <td key={column.key} className={column.align === "right" ? quotationStyles.alignRight : undefined}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={props.columns.length} className={quotationStyles.emptyGrid}>
                  {props.loading ? "Loading…" : props.emptyText}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <nav className={quotationStyles.pagerBar} aria-label="Pages">
        <span className={quotationStyles.pagerInfo}>
          {total === 0 ? "Showing 0 entries" : `Showing ${from} to ${to} of ${total} entries`}
        </span>
        <span className={quotationStyles.pagerControls}>
          <button type="button" className={quotationStyles.pagerButton} disabled={page <= 1} onClick={() => props.onPageChange(1)} title="First page">
            «
          </button>
          <button type="button" className={quotationStyles.pagerButton} disabled={page <= 1} onClick={() => props.onPageChange(page - 1)} title="Previous page">
            ‹
          </button>
          <span className={quotationStyles.pagerInfo}>
            {page} / {pages}
          </span>
          <button type="button" className={quotationStyles.pagerButton} disabled={page >= pages} onClick={() => props.onPageChange(page + 1)} title="Next page">
            ›
          </button>
          <button type="button" className={quotationStyles.pagerButton} disabled={page >= pages} onClick={() => props.onPageChange(pages)} title="Last page">
            »
          </button>
        </span>
      </nav>
      <div className={quotationStyles.modalNote}>{props.hint}</div>
    </div>
  );
}
