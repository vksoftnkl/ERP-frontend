"use client";

/**
 * The master tables' right-click menu, for a configured grid that is NOT a
 * `CrudMasterPage` list — the cheque registers, the Cheque Books list, the
 * voucher Exceptions. The same four affordances, against the same
 * `fixed.grid_columns` rows the list is built from:
 *
 *   grid filter setting        which columns the search box matches on
 *   column visibility setting  which columns the list draws
 *   Admin settings             the Grid Designer for this grid — in a NEW tab:
 *                              these grids sit on working screens (a voucher
 *                              being keyed, a picker over a stock document),
 *                              and leaving in place would drop the work unasked
 *
 * (`save column width` stays the master page's own: these lists size their
 * columns from the layout and have no drag to save.)
 *
 * Both settings are the shared layout, not a per-operator preference; a save
 * re-reads the grid's columns so every list on screen redraws from it.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FiSearch } from "react-icons/fi";
import ModalPortal from "@/components/ui/modal-portal";
import dynamicModalStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
import { useApi } from "@/hooks/useApi";
import { layoutPointer, layoutViewportSize } from "@/lib/ui-scale";
import { Z_MODAL_NESTED } from "@/lib/z-index";
import { useAppDispatch } from "@/store/hooks";
import { metadataApi } from "@/store/api/metadataApi";
import type { GridColumnConfig } from "@/store/slices/gridColumnsSlice";
import styles from "@/app/master/state-master/page.module.scss";

const GRID_FILTER_SETTINGS_ENDPOINT = "/grid-details/filter-settings";
const GRID_VISIBILITY_SETTINGS_ENDPOINT = "/grid-details/visibility-settings";

const MENU_WIDTH = 190;
const MENU_HEIGHT = 100;
const MENU_PADDING = 8;

type Mode = "filter" | "visibility";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Position first, then the column number, then the heading — the master page's order. */
function compareColumns(left: GridColumnConfig, right: GridColumnConfig): number {
  const leftPosition = left.position ?? left.order;
  const rightPosition = right.position ?? right.order;
  if (leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }
  const leftNumber = left.columnNumber ?? left.order;
  const rightNumber = right.columnNumber ?? right.order;
  if (leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left.header.localeCompare(right.header, undefined, { numeric: true, sensitivity: "base" });
}

export type UseConfiguredGridSettingsOptions = {
  /** `fixed.grid_details.grid_id`, as the registry resolved it. */
  gridId: string;
  /** The grid's columns — hidden ones included (the dialog is where one comes back). */
  columns: readonly GridColumnConfig[] | undefined;
  /** After a save: re-read the rows, the search may match differently now. */
  onSaved?: () => void;
};

export type ConfiguredGridSettings = {
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  /** The menu or the dialog is up: a screen's own keys should stand aside. */
  active: boolean;
  /** The menu and dialog portals; render once per grid. */
  overlays: ReactNode;
};

export function useConfiguredGridSettings({
  gridId,
  columns,
  onSaved,
}: UseConfiguredGridSettingsOptions): ConfiguredGridSettings {
  const dispatch = useAppDispatch();
  const [menu, setMenu] = useState<Pick<CSSProperties, "left" | "top"> | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [selections, setSelections] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const { run: saveFilterSettings } = useApi<unknown, Record<string, unknown>>(GRID_FILTER_SETTINGS_ENDPOINT, {
    method: "PUT",
    toast: { success: false },
  });
  const { run: saveVisibilitySettings } = useApi<unknown, Record<string, unknown>>(GRID_VISIBILITY_SETTINGS_ENDPOINT, {
    method: "PUT",
    toast: { success: false },
  });

  const settingsColumns = useMemo(
    () => (columns ?? []).filter((column) => Boolean(column.serialId)).slice().sort(compareColumns),
    [columns],
  );

  const onContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!gridId || settingsColumns.length === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // Layout pixels — the menu is fixed inside the globally scaled document (lib/ui-scale).
      const pointer = layoutPointer(event);
      const viewport = layoutViewportSize();
      setMenu({
        left: clamp(pointer.x, MENU_PADDING, viewport.width - MENU_WIDTH),
        top: clamp(pointer.y, MENU_PADDING, viewport.height - MENU_HEIGHT),
      });
    },
    [gridId, settingsColumns.length],
  );

  // Anything away from the menu closes it.
  useEffect(() => {
    if (menu === null) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest('[data-configured-grid-settings-menu="true"]')) {
        return;
      }
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setMenu(null);
      }
    };
    const close = () => setMenu(null);
    document.addEventListener("mousedown", onPointerDown);
    // The window's capture phase runs before any dialog's document listener:
    // Esc closes this menu only, not the modal the grid sits in.
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const openMode = useCallback(
    (next: Mode) => {
      setMenu(null);
      setSelections(
        Object.fromEntries(
          settingsColumns.map((column) => [
            column.serialId as string,
            next === "visibility" ? column.visible !== false : column.sortable !== false,
          ]),
        ),
      );
      setMode(next);
    },
    [settingsColumns],
  );

  const closeMode = useCallback(() => {
    if (!saving) {
      setMode(null);
    }
  }, [saving]);

  const save = useCallback(async () => {
    if (!gridId || mode === null || settingsColumns.length === 0) {
      return;
    }
    setSaving(true);
    try {
      const body = {
        columns: settingsColumns.map((column) => ({
          grid_column_id: column.serialId as string,
          ...(mode === "visibility"
            ? { grid_column_visibility: selections[column.serialId as string] === true }
            : { grid_column_filter: selections[column.serialId as string] === true }),
        })),
      };
      if (mode === "visibility") {
        await saveVisibilitySettings({ body });
      } else {
        await saveFilterSettings({ body });
      }
      // Every list built on this grid redraws from the saved columns.
      dispatch(metadataApi.util.invalidateTags([{ type: "GridColumns", id: Number(gridId) }]));
      onSaved?.();
      setMode(null);
    } catch {
      // useApi shows the error.
    } finally {
      setSaving(false);
    }
  }, [dispatch, gridId, mode, onSaved, saveFilterSettings, saveVisibilitySettings, selections, settingsColumns]);

  // The dialog's keys, as the master page's: Esc closes, F5 saves.
  useEffect(() => {
    if (mode === null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMode();
      } else if (event.key === "F5") {
        event.preventDefault();
        event.stopPropagation();
        void save();
      } else if (/^F([1-9]|1[0-2])$/.test(event.key) || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
        // A screen's own shortcuts must not fire underneath the dialog.
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeMode, mode, save]);

  const title = mode === "visibility" ? "Grid Visible Columns" : "Grid Search Columns";

  const menuPortal =
    menu && typeof document !== "undefined"
      ? createPortal(
          <div
            className={`${styles.masterSearchSettingsTooltip} ${styles.masterTableContextTooltip}`}
            data-configured-grid-settings-menu="true"
            style={{ ...menu, zIndex: 3000 }}
            role="tooltip"
          >
            <button type="button" className={styles.masterSearchSettingsItem} onClick={() => openMode("filter")}>
              grid filter setting
            </button>
            <button type="button" className={styles.masterSearchSettingsItem} onClick={() => openMode("visibility")}>
              column visibility setting
            </button>
            <button
              type="button"
              className={styles.masterSearchSettingsItem}
              onClick={() => {
                setMenu(null);
                window.open(`/master/grid-designer/${gridId}`, "_blank", "noopener");
              }}
            >
              Admin settings
            </button>
          </div>,
          document.body,
        )
      : null;

  const dialog =
    mode !== null ? (
      <ModalPortal>
        <div
          className={dynamicModalStyles.overlay}
          style={
            {
              "--erp-modal-accent": "var(--primary, #7b1515)",
              "--erp-modal-accent-soft-ring": "rgba(123, 21, 21, 0.2)",
              "--erp-modal-overlay-z-index": Z_MODAL_NESTED,
            } as CSSProperties
          }
        >
          <div className={dynamicModalStyles.backdrop} role="presentation" onMouseDown={closeMode} />
          <form
            className={`${dynamicModalStyles.panel} ${styles.gridSettingsDialog}`}
            aria-label={title}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <header className={dynamicModalStyles.header}>
              <div className={dynamicModalStyles.headerRow}>
                <div className={dynamicModalStyles.headerIntro}>
                  <span className={dynamicModalStyles.headerIcon} aria-hidden="true">
                    <FiSearch />
                  </span>
                  <div className={dynamicModalStyles.headerText}>
                    <h2 className={dynamicModalStyles.headerTitle}>{title}</h2>
                    <p className={dynamicModalStyles.headerDescription}>
                      Select columns for this grid setting. It is the shared layout, not yours alone.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={dynamicModalStyles.closeButton}
                  onClick={closeMode}
                  disabled={saving}
                  aria-label={`Close ${title.toLowerCase()}`}
                >
                  x
                </button>
              </div>
            </header>
            <div className={styles.gridSettingsBody}>
              {settingsColumns.map((column) => {
                const serialId = column.serialId as string;
                return (
                  <label key={serialId} className={styles.gridSettingsRow}>
                    <input
                      type="checkbox"
                      checked={selections[serialId] === true}
                      disabled={saving}
                      onChange={(event) => setSelections((current) => ({ ...current, [serialId]: event.target.checked }))}
                    />
                    <span>{column.columnName ?? column.header}</span>
                  </label>
                );
              })}
            </div>
            <footer className={dynamicModalStyles.footer}>
              <div className={dynamicModalStyles.footerActions}>
                <button type="submit" className={dynamicModalStyles.submitButton} disabled={saving}>
                  <span className={dynamicModalStyles.footerButtonIcon} aria-hidden="true">
                    OK
                  </span>
                  <span>{saving ? "Saving..." : "Save"}</span>
                </button>
                <button type="button" className={dynamicModalStyles.cancelButton} onClick={closeMode} disabled={saving}>
                  <span className={dynamicModalStyles.footerButtonIcon} aria-hidden="true">
                    x
                  </span>
                  <span>Cancel</span>
                </button>
              </div>
            </footer>
          </form>
        </div>
      </ModalPortal>
    ) : null;

  return {
    onContextMenu,
    active: menu !== null || mode !== null,
    overlays: (
      <>
        {menuPortal}
        {dialog}
      </>
    ),
  };
}
