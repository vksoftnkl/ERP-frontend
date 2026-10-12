"use client";

/** Duplicate refs (grid 142) and Suspense (grid 143) — read-only lists, the last 30 days as in Qt. */
import { useState } from "react";
import type { GridColumn } from "../domain/grid-columns";
import type { GridList } from "../hooks/use-grid-list";
import { GridTable } from "./grid-table";
import styles from "../page.module.scss";

export function ListTab({
  label,
  hint,
  list,
  columns,
  emptyText,
  hidden,
}: {
  label: string;
  hint: string;
  list: GridList;
  columns: readonly GridColumn[];
  emptyText: string;
  hidden: boolean;
}) {
  const [current, setCurrent] = useState(-1);
  return (
    <div className={styles.tabBody} hidden={hidden} role="tabpanel" aria-label={label}>
      <p className={styles.hint}>{hint}</p>
      <GridTable
        className={styles.gridGrow}
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        error={list.error}
        current={current < list.rows.length ? current : -1}
        onCurrent={setCurrent}
        emptyText={emptyText}
        ariaLabel={label}
      />
    </div>
  );
}
