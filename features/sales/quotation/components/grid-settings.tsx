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
 * Only visibility is offered. The layout also carries `focus` and `necessity`
 * flags (the stock screens expose them), but nothing on this screen reads
 * either, so listing them would be three checkboxes of which two do nothing.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import { cx } from "@/components/design-system/cx";
import { useSaveQuotationColumnVisibilityMutation } from "@/store/api/quotationApi";
import { ModalShell } from "./modal-shell";
import styles from "../page.module.scss";

/** Keeps the menu on screen when the click lands near an edge. */
const MENU_WIDTH = 190;
const MENU_HEIGHT = 92;
const MENU_EDGE_PADDING = 8;

export type GridSettingsColumn = {
  key: string;
  header: string;
  visible: boolean;
  /** `ui_tbl_clm_id`; null on the local fallback layout, which cannot be saved. */
  columnId: string | null;
};

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
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saveVisibility, visibilityState] = useSaveQuotationColumnVisibilityMutation();

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuPosition({
      left: clampToViewport(event.clientX, window.innerWidth - MENU_WIDTH),
      top: clampToViewport(event.clientY, window.innerHeight - MENU_HEIGHT),
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
    setDraft(
      Object.fromEntries(columns.map((column) => [column.key, column.visible])),
    );
    setSettingsOpen(true);
    setMenuPosition(null);
  }, [columns]);

  const closeSettings = useCallback(() => {
    if (visibilityState.isLoading) {
      return;
    }
    setSettingsOpen(false);
  }, [visibilityState.isLoading]);

  const changedColumns = useMemo(
    () =>
      columns.filter(
        (column) =>
          column.columnId !== null &&
          draft[column.key] !== undefined &&
          draft[column.key] !== column.visible,
      ),
    [columns, draft],
  );

  const saveSettings = useCallback(async () => {
    if (changedColumns.length === 0) {
      setSettingsOpen(false);
      return;
    }
    try {
      await saveVisibility({
        uiTableId,
        columns: changedColumns.map((column) => ({
          columnId: column.columnId as string,
          visible: draft[column.key],
        })),
      }).unwrap();
      setSettingsOpen(false);
    } catch {
      toast.error("Could not save the column settings.");
    }
  }, [changedColumns, draft, saveVisibility, uiTableId]);

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
            Applies to this grid for every user.
          </span>
          <span className={styles.settingsFooterActions}>
          <button
            type="button"
            className={styles.button}
            disabled={visibilityState.isLoading}
            onClick={() =>
              setDraft(Object.fromEntries(columns.map((column) => [column.key, true])))
            }
          >
            Default
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={visibilityState.isLoading}
            onClick={closeSettings}
          >
            Close
          </button>
          <button
            type="button"
            className={cx(styles.button, styles.buttonPrimary)}
            disabled={visibilityState.isLoading}
            onClick={() => void saveSettings()}
          >
            {visibilityState.isLoading ? "Saving…" : "Save"}
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
              <th scope="col">#</th>
              <th scope="col">Column name</th>
              <th scope="col">Visible</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column, index) => (
              <tr key={column.key}>
                <td className={styles.settingsTableNumber}>{index + 1}</td>
                <td>{column.header}</td>
                <td className={styles.settingsTableCheck}>
                  <input
                    type="checkbox"
                    checked={draft[column.key] ?? column.visible}
                    disabled={visibilityState.isLoading || column.columnId === null}
                    aria-label={`Show ${column.header}`}
                    onChange={(event) => {
                      // Read before the updater runs: React nulls
                      // `currentTarget` once the handler returns, so touching it
                      // inside `setDraft` would throw and drop the toggle.
                      const { checked } = event.currentTarget;
                      setDraft((current) => ({ ...current, [column.key]: checked }));
                    }}
                  />
                </td>
              </tr>
            ))}
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
