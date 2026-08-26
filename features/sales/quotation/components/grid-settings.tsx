"use client";

/**
 * The right-click menu both entry grids carry, and the dialog behind its
 * "Admin settings" item — the same two affordances the master tables have.
 *
 * Both act on `fixed.ui_table_columns`, the layout the grid is built from, so
 * they are deliberately explicit: a drag stays local until "save column width"
 * commits it, and the dialog is a draft until Save. Neither is per-operator —
 * the layout is shared, which the dialog says out loud.
 *
 * The dialog edits everything `PUT /ui-table-masters/layout-settings` accepts
 * bar the width, which has its own gesture: visibility, the column order
 * (`uiTblClmColumnPosition`, which the grids now sort on), and the layout's two
 * flags. Reordering and hiding change what the grid draws; `focus` and
 * `necessity` are stored config that no entry screen reads yet — the dialog
 * says so rather than implying a behaviour that is not there.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import { cx } from "@/components/design-system/cx";
import { useSaveQuotationColumnLayoutMutation } from "@/store/api/quotationApi";
import { ModalShell } from "./modal-shell";
import styles from "../page.module.scss";
import { layoutPointer, layoutViewportSize } from "@/lib/ui-scale";

/** Keeps the menu on screen when the click lands near an edge. */
const MENU_WIDTH = 190;
const MENU_HEIGHT = 92;
const MENU_EDGE_PADDING = 8;

export type GridSettingsColumn = {
  key: string;
  header: string;
  visible: boolean;
  focus: boolean;
  necessity: boolean;
  /** `ui_tbl_clm_column_position` — what the grid is ordered by. */
  position: number;
  /** `ui_tbl_clm_id`; null on the local fallback layout, which cannot be saved. */
  columnId: string | null;
};

/** One row's editable state while the dialog is open. */
type SettingsDraftEntry = {
  visible: boolean;
  focus: boolean;
  necessity: boolean;
};

type SettingsDraft = {
  /** Column keys in the drafted order. */
  order: string[];
  flags: Record<string, SettingsDraftEntry>;
};

const EMPTY_DRAFT: SettingsDraft = { order: [], flags: {} };

function draftOf(columns: GridSettingsColumn[]): SettingsDraft {
  return {
    order: columns.map((column) => column.key),
    flags: Object.fromEntries(
      columns.map((column) => [
        column.key,
        { visible: column.visible, focus: column.focus, necessity: column.necessity },
      ]),
    ),
  };
}

/**
 * The positions to save for a reordered list.
 *
 * The dialog only ever holds the columns this screen has a meaning for, so the
 * configured layout can carry rows it never shows — renumbering densely from 1
 * would walk over those rows' positions. Instead the drafted order is written
 * back over the SAME position numbers the dialog's own rows already occupy,
 * sorted, so nothing outside the dialog moves. The running `previous + 1` floor
 * repairs a layout that stored a duplicate position (grid 24 ships two), which
 * would otherwise leave the two columns' order undecided forever.
 */
function positionsFor(ordered: GridSettingsColumn[]): number[] {
  const available = ordered.map((column) => column.position).sort((left, right) => left - right);
  const positions: number[] = [];
  let previous = Number.NEGATIVE_INFINITY;
  for (const candidate of available) {
    const position = Math.max(candidate, previous + 1);
    positions.push(position);
    previous = position;
  }
  return positions;
}

/**
 * The drafted order with the row at `from` lifted out and dropped at `to`.
 *
 * Returns null when the move is not one the layout can hold. A row with no
 * `ui_tbl_clm_id` — the injected serial column, and every row of the local
 * fallback — has no position to save against, so it can neither be dragged nor
 * be shoved out of its slot by a row that lands on top of it; the second check
 * catches that second case, which the splice would otherwise do silently.
 */
function reordered(
  order: string[],
  from: number,
  to: number,
  isPinned: (key: string) => boolean,
): string[] | null {
  if (from < 0 || to < 0 || from >= order.length || to >= order.length || from === to) {
    return null;
  }
  if (isPinned(order[from])) {
    return null;
  }
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  for (let index = 0; index < order.length; index += 1) {
    if (isPinned(order[index]) && next[index] !== order[index]) {
      return null;
    }
  }
  return next;
}

export type UseGridSettingsOptions = {
  /** The grid's name, for the dialog title. */
  label: string;
  uiTableId: string;
  /** Every configured column, hidden ones included. */
  columns: GridSettingsColumn[];
  pendingWidthCount: number;
  savingWidths: boolean;
  onSaveWidths: () => void;
};

export type GridSettings = {
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  /** The menu and dialog portals; render once per grid. */
  overlays: ReactNode;
};

function clampToViewport(value: number, max: number): number {
  return Math.min(Math.max(value, MENU_EDGE_PADDING), Math.max(MENU_EDGE_PADDING, max));
}

export function useGridSettings({
  label,
  uiTableId,
  columns,
  pendingWidthCount,
  savingWidths,
  onSaveWidths,
}: UseGridSettingsOptions): GridSettings {
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<SettingsDraft>(EMPTY_DRAFT);
  /** The row being dragged, and the gap the pointer is currently over. */
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropGap, setDropGap] = useState<{ key: string; after: boolean } | null>(null);
  const [saveLayout, saveLayoutState] = useSaveQuotationColumnLayoutMutation();

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    // Layout pixels: the pointer and the viewport are measured in visual
    // pixels, but these land as `left`/`top` on a fixed menu inside the
    // globally scaled document. See lib/ui-scale.ts.
    const pointer = layoutPointer(event);
    const viewport = layoutViewportSize();
    setMenuPosition({
      left: clampToViewport(pointer.x, viewport.width - MENU_WIDTH),
      top: clampToViewport(pointer.y, viewport.height - MENU_HEIGHT),
    });
  }, []);

  // Anything that moves the menu away from where it was opened closes it.
  useEffect(() => {
    if (menuPosition === null) {
      return;
    }
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-quotation-grid-settings-menu="true"]')) {
        return;
      }
      setMenuPosition(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuPosition(null);
      }
    };
    const close = () => setMenuPosition(null);
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menuPosition]);

  const openSettings = useCallback(() => {
    setDraft(draftOf(columns));
    setDragKey(null);
    setDropGap(null);
    setSettingsOpen(true);
    setMenuPosition(null);
  }, [columns]);

  const closeSettings = useCallback(() => {
    if (saveLayoutState.isLoading) {
      return;
    }
    setDragKey(null);
    setDropGap(null);
    setSettingsOpen(false);
  }, [saveLayoutState.isLoading]);

  const byKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns],
  );

  /** The dialog's rows in the drafted order, ignoring keys the layout dropped. */
  const draftedColumns = useMemo(
    () => draft.order.map((key) => byKey.get(key)).filter(Boolean) as GridSettingsColumn[],
    [byKey, draft.order],
  );

  /**
   * A move is only meaningful for a row the layout owns — the injected serial
   * column and the whole local fallback carry no `ui_tbl_clm_id`, so there is
   * nothing to save a position against and they stay where they are.
   */
  const isPinned = useCallback(
    (key: string) => byKey.get(key)?.columnId == null,
    [byKey],
  );

  /**
   * Drops `key` into the gap on one side of `targetKey`. The gap is named by
   * the row beside it rather than by an index so the drag and the draft cannot
   * disagree: the dialog renders the keys the layout still has, which is not
   * necessarily every key the drafted order holds.
   */
  const moveColumnBeside = useCallback(
    (key: string, targetKey: string, after: boolean) => {
      setDraft((current) => {
        const from = current.order.indexOf(key);
        const target = current.order.indexOf(targetKey);
        if (from === -1 || target === -1) {
          return current;
        }
        // The gap is an insertion point; lifting the dragged row closes it by one.
        const to = after ? target + (from < target ? 0 : 1) : target - (from < target ? 1 : 0);
        const next = reordered(current.order, from, to, isPinned);
        return next === null ? current : { ...current, order: next };
      });
    },
    [isPinned],
  );

  const moveColumn = useCallback(
    (key: string, delta: -1 | 1) => {
      setDraft((current) => {
        const from = current.order.indexOf(key);
        const next = reordered(current.order, from, from + delta, isPinned);
        return next === null ? current : { ...current, order: next };
      });
    },
    [isPinned],
  );

  const endDrag = useCallback(() => {
    setDragKey(null);
    setDropGap(null);
  }, []);

  /**
   * Which gap the drop lands in comes from the pointer against the hovered
   * row's midpoint, so a drag can reach both ends of the list. `clientY` and
   * the rect are both visual pixels under the global zoom, so comparing the
   * two needs no conversion.
   */
  const onRowDragOver = useCallback(
    (event: ReactDragEvent<HTMLTableRowElement>, targetKey: string, index: number) => {
      if (dragKey === null) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      // A gap the layout would refuse — the one above the pinned serial column
      // — is marked undroppable rather than accepted and then quietly dropped.
      const neighbour = draftedColumns[after ? index + 1 : index - 1];
      const droppable = !isPinned(targetKey) || !(neighbour === undefined || isPinned(neighbour.key));
      event.preventDefault();
      event.dataTransfer.dropEffect = droppable ? "move" : "none";
      setDropGap((current) => {
        if (!droppable) {
          return current === null ? current : null;
        }
        return current !== null && current.key === targetKey && current.after === after
          ? current
          : { key: targetKey, after };
      });
    },
    [dragKey, draftedColumns, isPinned],
  );

  const commitDrop = useCallback(() => {
    if (dragKey !== null && dropGap !== null) {
      moveColumnBeside(dragKey, dropGap.key, dropGap.after);
    }
    endDrag();
  }, [dragKey, dropGap, endDrag, moveColumnBeside]);

  const setFlag = useCallback(
    (key: string, flag: keyof SettingsDraftEntry, value: boolean) => {
      setDraft((current) => {
        const entry = current.flags[key];
        if (!entry) {
          return current;
        }
        return { ...current, flags: { ...current.flags, [key]: { ...entry, [flag]: value } } };
      });
    },
    [],
  );

  /**
   * What the save has to send. A position is only compared once the whole
   * drafted order is numbered, so a column that did not move but was pushed
   * along by one that did still carries its new number.
   */
  const changedColumns = useMemo(() => {
    const positions = positionsFor(draftedColumns);
    const changes: Array<{
      columnId: string;
      visible?: boolean;
      focus?: boolean;
      necessity?: boolean;
      position?: number;
    }> = [];
    draftedColumns.forEach((column, index) => {
      if (column.columnId === null) {
        return;
      }
      const entry = draft.flags[column.key];
      if (!entry) {
        return;
      }
      const change = {
        columnId: column.columnId,
        ...(entry.visible === column.visible ? {} : { visible: entry.visible }),
        ...(entry.focus === column.focus ? {} : { focus: entry.focus }),
        ...(entry.necessity === column.necessity ? {} : { necessity: entry.necessity }),
        ...(positions[index] === column.position ? {} : { position: positions[index] }),
      };
      if (Object.keys(change).length > 1) {
        changes.push(change);
      }
    });
    return changes;
  }, [draft.flags, draftedColumns]);

  const saveSettings = useCallback(async () => {
    if (changedColumns.length === 0) {
      setSettingsOpen(false);
      return;
    }
    try {
      await saveLayout({ uiTableId, columns: changedColumns }).unwrap();
      setSettingsOpen(false);
    } catch {
      toast.error("Could not save the column settings.");
    }
  }, [changedColumns, saveLayout, uiTableId]);

  const menu =
    menuPosition && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.settingsMenu}
            data-quotation-grid-settings-menu="true"
            style={menuPosition}
            role="menu"
            aria-label={`${label} table settings`}
          >
            <button
              type="button"
              className={styles.settingsMenuItem}
              disabled={pendingWidthCount === 0 || savingWidths}
              title={
                pendingWidthCount === 0
                  ? "Drag a column edge first"
                  : `Save ${pendingWidthCount} resized column${pendingWidthCount === 1 ? "" : "s"} for everyone`
              }
              onClick={() => {
                setMenuPosition(null);
                onSaveWidths();
              }}
            >
              save column width
              {pendingWidthCount > 0 ? (
                <span className={styles.settingsMenuBadge}>{pendingWidthCount}</span>
              ) : null}
            </button>
            <button
              type="button"
              className={styles.settingsMenuItem}
              onClick={openSettings}
            >
              Admin settings
            </button>
          </div>,
          document.body,
        )
      : null;

  const dialog = (
    <ModalShell
      title={`Table settings — ${label}`}
      isOpen={settingsOpen}
      onClose={closeSettings}
      footer={
        <>
          <span className={styles.settingsNote}>
            Applies to this grid for every user. Drag a row — or use ▲▼ — to
            reposition it. Focus and Necessity are stored with the layout only.
          </span>
          <span className={styles.settingsFooterActions}>
          <button
            type="button"
            className={styles.button}
            disabled={saveLayoutState.isLoading}
            title="Show every column, clear both flags and restore the configured order"
            onClick={() =>
              setDraft({
                order: columns.map((column) => column.key),
                flags: Object.fromEntries(
                  columns.map((column) => [
                    column.key,
                    { visible: true, focus: false, necessity: false },
                  ]),
                ),
              })
            }
          >
            Default
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={saveLayoutState.isLoading}
            onClick={closeSettings}
          >
            Close
          </button>
          <button
            type="button"
            className={cx(styles.button, styles.buttonPrimary)}
            disabled={saveLayoutState.isLoading}
            onClick={() => void saveSettings()}
          >
            {saveLayoutState.isLoading ? "Saving…" : "Save"}
          </button>
          </span>
        </>
      }
    >
      {columns.length > 0 ? (
        // The item grid has 89 columns — the list scrolls inside the panel
        // rather than pushing the footer off screen.
        <div className={styles.listViewport}>
        <table className={styles.settingsTable}>
          <thead>
            <tr>
              <th scope="col" aria-label="Reorder" />
              <th scope="col">#</th>
              <th scope="col">Column name</th>
              <th scope="col">Order</th>
              <th scope="col">Visible</th>
              <th scope="col" title="Stored for the layout; no entry screen reads it yet">
                Focus
              </th>
              <th scope="col" title="Stored for the layout; no entry screen reads it yet">
                Necessity
              </th>
            </tr>
          </thead>
          <tbody>
            {draftedColumns.map((column, index) => {
              const entry = draft.flags[column.key] ?? {
                visible: column.visible,
                focus: column.focus,
                necessity: column.necessity,
              };
              // No configured row means no position to save one against.
              const pinned = saveLayoutState.isLoading || column.columnId === null;
              const overGap = dropGap !== null && dropGap.key === column.key;
              return (
                <tr
                  key={column.key}
                  draggable={!pinned}
                  className={cx(
                    !pinned && styles.settingsRowDraggable,
                    dragKey === column.key && styles.settingsRowDragging,
                    overGap && dragKey !== column.key
                      ? dropGap.after
                        ? styles.settingsRowDropAfter
                        : styles.settingsRowDropBefore
                      : undefined,
                  )}
                  onDragStart={(event) => {
                    // A drag begun on a checkbox is a mis-grab, not a move.
                    if ((event.target as HTMLElement).closest("input") !== null) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.effectAllowed = "move";
                    // Firefox refuses to start a drag with an empty payload.
                    event.dataTransfer.setData("text/plain", column.key);
                    setDragKey(column.key);
                  }}
                  onDragOver={(event) => onRowDragOver(event, column.key, index)}
                  onDrop={(event) => {
                    event.preventDefault();
                    commitDrop();
                  }}
                  onDragEnd={endDrag}
                >
                  <td
                    className={styles.settingsTableHandle}
                    aria-hidden="true"
                    title={pinned ? undefined : "Drag to reposition"}
                  >
                    {pinned ? "" : "⠿"}
                  </td>
                  <td className={styles.settingsTableNumber}>{index + 1}</td>
                  <td>{column.header}</td>
                  <td className={styles.settingsTableOrder}>
                    <button
                      type="button"
                      className={styles.settingsOrderButton}
                      disabled={pinned || index === 0}
                      aria-label={`Move ${column.header} up`}
                      onClick={() => moveColumn(column.key, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className={styles.settingsOrderButton}
                      disabled={pinned || index === draftedColumns.length - 1}
                      aria-label={`Move ${column.header} down`}
                      onClick={() => moveColumn(column.key, 1)}
                    >
                      ▼
                    </button>
                  </td>
                  {(
                    [
                      ["visible", "Show"],
                      ["focus", "Focus"],
                      ["necessity", "Necessity"],
                    ] as Array<[keyof SettingsDraftEntry, string]>
                  ).map(([flag, label]) => (
                    <td key={flag} className={styles.settingsTableCheck}>
                      <input
                        type="checkbox"
                        checked={entry[flag]}
                        disabled={pinned}
                        aria-label={`${label} ${column.header}`}
                        onChange={(event) => {
                          // Read before the updater runs: React nulls
                          // `currentTarget` once the handler returns, so touching
                          // it inside `setDraft` would throw and drop the toggle.
                          const { checked } = event.currentTarget;
                          setFlag(column.key, flag, checked);
                        }}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      ) : (
        <p className={styles.settingsEmpty}>No columns configured.</p>
      )}
    </ModalShell>
  );

  return {
    onContextMenu,
    overlays: (
      <>
        {menu}
        {dialog}
      </>
    ),
  };
}
