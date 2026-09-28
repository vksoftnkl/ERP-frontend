"use client";

/**
 * The Permissions tab (§6): the menu tree × the eleven verb columns.
 *
 * Painted from `tree + grants` and nothing else — no signals to block, no
 * pending queue. A cell exists only where the menu has the verb (§6.3). Rows
 * are virtualised: the tree is a couple of hundred rows by twelve cells.
 */
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ModalPortal from "@/components/ui/modal-portal";
import { cx } from "@/components/design-system/cx";
import { layoutPointer } from "@/lib/ui-scale";
import { PERMISSION_COLUMNS } from "../domain/columns";
import {
  countGrants,
  grantEverything,
  grantNothing,
  setAllVerbsOnMenu,
  setFlag,
  setVerbOnRows,
  tickMenu,
  verbColumnState,
  type Grants,
} from "../domain/grants";
import { type MenuNode, type MenuTree, parentIds, visibleRows } from "../domain/menuTree";
import { NESTED_SURFACE_ATTR } from "../nested-surface";
import styles from "../user-administration.module.scss";

const ROW_HEIGHT = 26;

export type PermissionsTabProps = {
  tree: MenuTree;
  grants: Grants;
  /** The set as loaded — new rows take the user's own favourite / pinned / sort from it. */
  loaded: Grants;
  /** Why the tab is read-only right now, or null. */
  hold: string | null;
  disabled: boolean;
  /** "Rights of X loaded into the form" — after a copy. */
  hint: string | null;
  onChange: (grants: Grants) => void;
  onCopyFrom: () => void;
};

type ContextMenuState = { node: MenuNode; x: number; y: number };

function TriStateBox({
  state,
  disabled,
  label,
  onToggle,
}: {
  state: "none" | "some" | "all";
  disabled: boolean;
  label: string;
  onToggle: (value: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "all"}
      disabled={disabled}
      aria-label={`${label} on every listed menu`}
      onChange={() => onToggle(state !== "all")}
    />
  );
}

export function PermissionsTab({
  tree,
  grants,
  loaded,
  hold,
  disabled,
  hint,
  onChange,
  onCopyFrom,
}: PermissionsTabProps) {
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(() => visibleRows(tree, { collapsed, filter }), [tree, collapsed, filter]);
  const count = useMemo(() => countGrants(grants, tree), [grants, tree]);
  const inert = disabled || hold !== null;

  // Rows are absolutely positioned inside a box the size of the whole list; the
  // library measures nothing and re-renders only what scrolls into view.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const toggleCollapsed = useCallback((menuId: number) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(menuId)) next.delete(menuId);
      else next.add(menuId);
      return next;
    });
  }, []);

  const openContextMenu = useCallback((event: ReactMouseEvent, node: MenuNode) => {
    event.preventDefault();
    const point = layoutPointer(event);
    setContextMenu({ node, x: point.x, y: point.y });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        // Taken: the dialog underneath must not close on the same Escape.
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", close, true);
    document.addEventListener("keydown", onKeyDown, true);
    const scroller = scrollerRef.current;
    scroller?.addEventListener("scroll", close);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("keydown", onKeyDown, true);
      scroller?.removeEventListener("scroll", close);
    };
  }, [contextMenu]);

  return (
    <div className={styles.permBody}>
      <div className={styles.permToolbar}>
        <input
          type="search"
          className={styles.permFilter}
          placeholder="Filter menus"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Filter menus by name"
        />
        <button
          type="button"
          className={styles.permButton}
          disabled={inert}
          title="Every menu, every right it has"
          onClick={() => onChange(grantEverything(grants, tree, loaded))}
        >
          All
        </button>
        <button
          type="button"
          className={styles.permButton}
          disabled={inert}
          title="No menu listed here"
          onClick={() => onChange(grantNothing(grants, tree))}
        >
          None
        </button>
        <button type="button" className={styles.permButton} onClick={() => setCollapsed(new Set())}>
          Expand
        </button>
        <button
          type="button"
          className={styles.permButton}
          onClick={() => setCollapsed(new Set(parentIds(tree)))}
        >
          Collapse
        </button>
        <button
          type="button"
          className={styles.permButton}
          disabled={inert}
          title="Load another user's menus and rights into this form"
          onClick={onCopyFrom}
        >
          Copy rights from…
        </button>
        <span className={styles.permSpacer} />
        <span className={styles.permCount}>
          {count.ticked} of {count.total} menus
          {count.outsideTree > 0 ? (
            <span
              className={styles.permCountKept}
              title="Rights on menus this list does not show. They are kept exactly as they are."
            >
              {" "}
              · {count.outsideTree} more kept
            </span>
          ) : null}
        </span>
      </div>

      {hold ? (
        <p className={styles.permHold} role="status">
          {hold}
        </p>
      ) : hint ? (
        <p className={styles.permHint} role="status">
          {hint}
        </p>
      ) : null}

      <div ref={scrollerRef} className={styles.gridScroller}>
        <div className={styles.gridInner}>
          <div className={styles.gridHead}>
            <div className={styles.gridHeadMenu}>Menu</div>
            {PERMISSION_COLUMNS.map((column) => (
              <label
                key={column.key}
                className={styles.gridHeadCell}
                title={column.tooltip ?? `${column.label} — every listed menu that has it`}
              >
                <TriStateBox
                  state={verbColumnState(grants, rows, column.verb)}
                  disabled={inert}
                  label={column.label}
                  onToggle={(value) => onChange(setVerbOnRows(grants, rows, column.verb, value))}
                />
                {column.label}
              </label>
            ))}
          </div>

          <div className={styles.gridRows} style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const node = rows[item.index];
              const grant = grants.get(node.id);
              const ticked = grant !== undefined;
              const hasChildren = node.children.length > 0;
              return (
                <div
                  key={node.id}
                  className={cx(
                    styles.gridRow,
                    item.index % 2 === 1 && styles.gridRowAlt,
                    ticked && styles.gridRowTicked,
                  )}
                  style={{ transform: `translateY(${item.start}px)` }}
                  onContextMenu={inert ? undefined : (event) => openContextMenu(event, node)}
                >
                  <div className={styles.menuCell} style={{ paddingLeft: `${8 + node.depth * 16}px` }}>
                    {hasChildren ? (
                      <button
                        type="button"
                        className={styles.caret}
                        tabIndex={-1}
                        aria-label={collapsed.has(node.id) ? "Expand" : "Collapse"}
                        onClick={() => toggleCollapsed(node.id)}
                      >
                        {collapsed.has(node.id) ? "▶" : "▼"}
                      </button>
                    ) : (
                      <span className={styles.caretSpacer} />
                    )}
                    <input
                      type="checkbox"
                      className={styles.menuTick}
                      checked={ticked}
                      disabled={inert}
                      aria-label={`${node.label} in the user's menu`}
                      onChange={(event) => onChange(tickMenu(grants, node, event.target.checked, loaded))}
                    />
                    <span
                      className={cx(styles.menuLabel, hasChildren && styles.menuLabelParent)}
                      title={node.label}
                    >
                      {node.label}
                    </span>
                  </div>
                  {PERMISSION_COLUMNS.map((column) =>
                    node.verbs.has(column.verb) ? (
                      <div key={column.key} className={styles.cell}>
                        <input
                          type="checkbox"
                          checked={grant?.flags[column.key] === true}
                          disabled={inert}
                          aria-label={`${column.label} on ${node.label}`}
                          onChange={(event) =>
                            onChange(setFlag(grants, node.id, column.key, event.target.checked, loaded))
                          }
                        />
                      </div>
                    ) : (
                      <div
                        key={column.key}
                        className={cx(styles.cell, styles.cellNone)}
                        title={`${node.label} has nothing to ${column.label.toLowerCase()}`}
                      >
                        ·
                      </div>
                    ),
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {contextMenu ? (
        <ModalPortal>
          <div
            className={styles.contextMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            {...{ [NESTED_SURFACE_ATTR]: "" }}
            role="menu"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className={styles.contextMenuTitle}>{contextMenu.node.label}</p>
            <button
              type="button"
              role="menuitem"
              className={styles.contextMenuItem}
              onClick={() => {
                onChange(setAllVerbsOnMenu(grants, contextMenu.node, true, loaded));
                setContextMenu(null);
              }}
            >
              All rights on this menu
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.contextMenuItem}
              onClick={() => {
                onChange(setAllVerbsOnMenu(grants, contextMenu.node, false, loaded));
                setContextMenu(null);
              }}
            >
              No rights on this menu
            </button>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
