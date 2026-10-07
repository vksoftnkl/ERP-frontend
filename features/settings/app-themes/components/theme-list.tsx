"use client";

import type { KeyboardEvent } from "react";

import type { ThemeListRow } from "../lib/theme-list";
import styles from "../page.module.scss";

type Props = {
  rows: readonly ThemeListRow[];
  selectedId: number | null;
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  showDeleted: boolean;
  onShowDeletedChange: (value: boolean) => void;
  onSelect: (thmId: number) => void;
  onRetry: () => void;
  // the verbs under the list
  canNew: boolean;
  canDelete: boolean;
  canRestore: boolean;
  showRestore: boolean;
  canSetDefault: boolean;
  onNew: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onSetDefault: () => void;
  note: string;
};

/** The left pane: grid 125's themes, searchable, deleted ones on request. */
export default function ThemeList(props: Props) {
  const { rows, selectedId, onSelect } = props;

  // Up / Down walk the list like the Qt table's current row.
  const onKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (rows.length === 0) return;
    event.preventDefault();
    const at = rows.findIndex((row) => row.thmId === selectedId);
    const next = event.key === "ArrowDown" ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1);
    const row = rows[next < 0 ? 0 : next];
    if (row) {
      onSelect(row.thmId);
      document.getElementById(`app-theme-row-${row.thmId}`)?.focus();
    }
  };

  return (
    <section className={styles.listPane} aria-label="Themes">
      <div className={styles.paneHead}>
        <span className={styles.sectionCap}>Themes</span>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search…"
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          aria-label="Search themes"
        />
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Base</th>
              <th className={styles.center}>Default</th>
              <th className={styles.center}>Active</th>
              <th className={styles.right}>Used by</th>
            </tr>
          </thead>
          <tbody onKeyDown={onKeyDown}>
            {rows.map((row) => {
              const selected = row.thmId === selectedId;
              return (
                <tr
                  key={row.thmId}
                  id={`app-theme-row-${row.thmId}`}
                  tabIndex={selected || (selectedId === null && row === rows[0]) ? 0 : -1}
                  aria-selected={selected}
                  className={[
                    styles.listRow,
                    selected ? styles.listRowSelected : "",
                    row.isDeleted ? styles.listRowDeleted : "",
                  ].join(" ")}
                  onClick={() => onSelect(row.thmId)}
                >
                  <td className={styles.listName}>
                    {row.name}
                    {row.isDeleted ? <span className={styles.deletedTag}> (deleted)</span> : null}
                  </td>
                  <td>{row.base}</td>
                  <td className={styles.center}>{row.isDefault ? "★" : ""}</td>
                  <td className={styles.center}>{row.isActive ? "✓" : ""}</td>
                  <td className={styles.right}>{row.usedBy}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {props.loading ? <p className={styles.tableEmpty}>Loading themes…</p> : null}
        {props.error ? (
          <div className={styles.tableEmpty}>
            <p>{props.error}</p>
            <button type="button" className={styles.secondaryButton} onClick={props.onRetry}>
              Try again
            </button>
          </div>
        ) : null}
        {!props.loading && !props.error && rows.length === 0 ? (
          <p className={styles.tableEmpty}>No themes match.</p>
        ) : null}
      </div>

      <label className={styles.checkLine}>
        <input
          type="checkbox"
          checked={props.showDeleted}
          onChange={(event) => props.onShowDeletedChange(event.target.checked)}
        />
        Show deleted
      </label>

      <div className={styles.listButtons}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!props.canNew}
          onClick={props.onNew}
          title="A new theme, starting from the shown one's colours (F2)"
        >
          New
        </button>
        <button type="button" className={styles.secondaryButton} disabled={!props.canDelete} onClick={props.onDelete}>
          Delete
        </button>
        {props.showRestore ? (
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!props.canRestore}
            onClick={props.onRestore}
          >
            Restore
          </button>
        ) : null}
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!props.canSetDefault}
          onClick={props.onSetDefault}
        >
          Set default
        </button>
      </div>
      {props.note ? <p className={styles.mutedNote}>{props.note}</p> : null}
    </section>
  );
}
