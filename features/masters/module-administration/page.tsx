"use client";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { useAppSelector } from "@/store/hooks";
import { selectAuthInitialized, selectAuthUserId } from "@/store/slices/authSlice";

// ── Types ─────────────────────────────────────────────────────────────────────
interface MenuNode {
  menuId: number;
  menuName: string;
  menuVisibility: boolean;
  menuSeparator: boolean;
  menuIsActive: boolean;
  children?: MenuNode[];
}

interface VisibilityItem {
  menuId: number;
  menuVisibility: boolean;
}

// ── API ───────────────────────────────────────────────────────────────────────
const MENU_ALL_ENDPOINT = "/menu-masters/get";
const MENU_VISIBILITY_ENDPOINT = "/menu-masters/visibility";
const MENU_QUERY = {
  includeChildren: "true",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function collectAllNodes(nodes: MenuNode[]): MenuNode[] {
  const result: MenuNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children?.length) result.push(...collectAllNodes(node.children));
  }
  return result;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    padding: "1rem 1.25rem",
    boxSizing: "border-box",
    overflow: "hidden",
  } satisfies CSSProperties,

  heading: {
    fontSize: "1.05rem",
    fontWeight: 700,
    marginBottom: "0.25rem",
    color: "#111827",
  } satisfies CSSProperties,

  subtext: {
    fontSize: "0.78rem",
    color: "#6b7280",
    marginBottom: "1rem",
  } satisfies CSSProperties,

  card: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    border: "1px solid var(--border, #dbe3ef)",
    borderRadius: "0.5rem",
    overflow: "hidden",
  } satisfies CSSProperties,

  tableHeader: {
    display: "grid",
    gridTemplateColumns: "1fr 7rem",
    background: "#f3f4f6",
    borderBottom: "1px solid var(--border, #dbe3ef)",
    padding: "0.4rem 0.75rem",
    fontWeight: 600,
    fontSize: "0.72rem",
    color: "#374151",
    alignItems: "center",
  } satisfies CSSProperties,

  headerActions: {
    display: "flex",
    gap: "0.4rem",
    alignItems: "center",
    justifyContent: "flex-end",
  } satisfies CSSProperties,

  actionBtn: {
    fontSize: "0.68rem",
    padding: "0.15rem 0.5rem",
    border: "1px solid var(--border, #dbe3ef)",
    borderRadius: "0.25rem",
    cursor: "pointer",
    background: "white",
    color: "#374151",
  } satisfies CSSProperties,

  scrollArea: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto" as const,
  } satisfies CSSProperties,

  row: (depth: number, alt: boolean, dirty: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "1fr 7rem",
    padding: "0.3rem 0.75rem",
    alignItems: "center",
    background: dirty ? "#fffbeb" : alt ? "#f9fafb" : "white",
    borderBottom: "1px solid #f0f0f0",
    transition: "background 0.15s",
  }),

  menuCell: (depth: number): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    paddingLeft: `${depth * 1.25}rem`,
    overflow: "hidden",
  }),

  expandBtn: {
    width: "1rem",
    height: "1rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    flexShrink: 0,
    fontSize: "0.6rem",
    color: "#6b7280",
    padding: 0,
  } satisfies CSSProperties,

  menuName: (hasChildren: boolean, isSeparator: boolean): CSSProperties => ({
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    fontSize: "0.8rem",
    fontWeight: hasChildren ? 600 : 400,
    color: isSeparator ? "#9ca3af" : "#111827",
  }),

  visibilityCell: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies CSSProperties,

  empty: {
    padding: "2rem",
    textAlign: "center" as const,
    color: "#6b7280",
    fontSize: "0.8rem",
  } satisfies CSSProperties,

  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "0.75rem",
    gap: "0.5rem",
  } satisfies CSSProperties,

  dirtyBadge: {
    fontSize: "0.72rem",
    color: "#92400e",
    background: "#fef3c7",
    border: "1px solid #fde68a",
    borderRadius: "9999px",
    padding: "0.1rem 0.6rem",
  } satisfies CSSProperties,

  saveBtn: (disabled: boolean): CSSProperties => ({
    padding: "0.4rem 1.25rem",
    borderRadius: "0.375rem",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "#d1d5db" : "#2563eb",
    color: "white",
    fontWeight: 600,
    fontSize: "0.82rem",
    opacity: disabled ? 0.7 : 1,
  }),
};


// ── MenuRow ───────────────────────────────────────────────────────────────────
interface MenuRowProps {
  node: MenuNode;
  depth: number;
  rowIndex: number;
  visibility: Map<number, boolean>;
  original: Map<number, boolean>;
  collapsed: Set<number>;
  saving: boolean;
  onToggle: (menuId: number, value: boolean) => void;
  onToggleCollapsed: (menuId: number) => void;
}

function MenuRow({
  node,
  depth,
  rowIndex,
  visibility,
  original,
  collapsed,
  saving,
  onToggle,
  onToggleCollapsed,
}: MenuRowProps) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isCollapsed = collapsed.has(node.menuId);
  const current = visibility.get(node.menuId) ?? node.menuVisibility;
  const isDirty = original.get(node.menuId) !== current;

  return (
    <>
      <div style={S.row(depth, rowIndex % 2 !== 0, isDirty)}>
        <div style={S.menuCell(depth)}>
          {hasChildren ? (
            <button
              type="button"
              style={S.expandBtn}
              onClick={() => onToggleCollapsed(node.menuId)}
              tabIndex={-1}
              aria-label={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? "▶" : "▼"}
            </button>
          ) : (
            <span style={{ width: "1rem", flexShrink: 0 }} />
          )}
          <span title={node.menuName} style={S.menuName(hasChildren, node.menuSeparator)}>
            {node.menuName}
          </span>
        </div>

        <div style={S.visibilityCell}>
          <input
            type="checkbox"
            checked={current}
            disabled={saving}
            onChange={(e) => onToggle(node.menuId, e.target.checked)}
          />
        </div>
      </div>

      {hasChildren && !isCollapsed
        ? node.children!.map((child, i) => (
            <MenuRow
              key={child.menuId}
              node={child}
              depth={depth + 1}
              rowIndex={i}
              visibility={visibility}
              original={original}
              collapsed={collapsed}
              saving={saving}
              onToggle={onToggle}
              onToggleCollapsed={onToggleCollapsed}
            />
          ))
        : null}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ModuleAdministrationPage() {
  const authInitialized = useAppSelector(selectAuthInitialized);
  const userId = useAppSelector(selectAuthUserId);
  const { getAll } = useApi<{ data: MenuNode[] }>(MENU_ALL_ENDPOINT);
  const { run: patchVisibility, loading: saving } = useApi<unknown, { menus: VisibilityItem[] }>(
    MENU_VISIBILITY_ENDPOINT,
    { method: "PATCH" },
  );

  const [menus, setMenus] = useState<MenuNode[]>([]);
  const [loadingMenus, setLoadingMenus] = useState(true);
  const [visibility, setVisibility] = useState<Map<number, boolean>>(new Map());
  const [original, setOriginal] = useState<Map<number, boolean>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const initMaps = useCallback((nodes: MenuNode[]) => {
    const map = new Map<number, boolean>();
    for (const node of collectAllNodes(nodes)) {
      map.set(node.menuId, node.menuVisibility);
    }
    setVisibility(new Map(map));
    setOriginal(new Map(map));
  }, []);

  useEffect(() => {
    if (!authInitialized) {
      return;
    }
    if (!userId) {
      setMenus([]);
      initMaps([]);
      setLoadingMenus(false);
      return;
    }
    setLoadingMenus(true);
    getAll({ ...MENU_QUERY, userId })
      .then((res: unknown) => {
        const data = (res as { data?: MenuNode[] })?.data ?? [];
        const list = Array.isArray(data) ? data : [];
        setMenus(list);
        initMaps(list);
      })
      .catch(() => setMenus([]))
      .finally(() => setLoadingMenus(false));
  }, [authInitialized, getAll, initMaps, userId]);

  const dirtyItems = (() => {
    const items: VisibilityItem[] = [];
    visibility.forEach((value, menuId) => {
      if (original.get(menuId) !== value) {
        items.push({ menuId, menuVisibility: value });
      }
    });
    return items;
  })();

  const handleToggle = useCallback((menuId: number, value: boolean) => {
    setVisibility((prev) => new Map(prev).set(menuId, value));
  }, []);

  const handleToggleCollapsed = useCallback((menuId: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(menuId) ? next.delete(menuId) : next.add(menuId);
      return next;
    });
  }, []);

  const handleShowAll = useCallback(() => {
    setVisibility((prev) => {
      const next = new Map(prev);
      next.forEach((_, id) => next.set(id, true));
      return next;
    });
  }, []);

  const handleHideAll = useCallback(() => {
    setVisibility((prev) => {
      const next = new Map(prev);
      next.forEach((_, id) => next.set(id, false));
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setVisibility(new Map(original));
  }, [original]);

  const handleSave = useCallback(async () => {
    if (dirtyItems.length === 0 || saving) return;
    await patchVisibility({ body: { menus: dirtyItems } });
    setOriginal(new Map(visibility));
  }, [dirtyItems, saving, patchVisibility, visibility]);

  const hasDirty = dirtyItems.length > 0;

  if (loadingMenus) {
    return (
      <div style={S.page}>
        <div style={S.heading}>Module Administration</div>
        <div style={S.card}>
          <div style={S.empty}>Loading menus…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.heading}>Module Administration</div>
      <div style={S.subtext}>
        Control which menu items are visible across the application.
      </div>

      <div style={S.card}>
        {/* Header */}
        <div style={S.tableHeader}>
          <span>Menu</span>
          <div style={S.headerActions}>
            <button type="button" style={S.actionBtn} onClick={handleShowAll} disabled={saving}>
              Show All
            </button>
            <button type="button" style={S.actionBtn} onClick={handleHideAll} disabled={saving}>
              Hide All
            </button>
          </div>
        </div>

        {/* Tree */}
        <div style={S.scrollArea}>
          {menus.length === 0 ? (
            <div style={S.empty}>No menus found.</div>
          ) : (
            menus.map((menu, i) => (
              <MenuRow
                key={menu.menuId}
                node={menu}
                depth={0}
                rowIndex={i}
                visibility={visibility}
                original={original}
                collapsed={collapsed}
                saving={saving}
                onToggle={handleToggle}
                onToggleCollapsed={handleToggleCollapsed}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <div>
          {hasDirty && (
            <span style={S.dirtyBadge}>
              {dirtyItems.length} unsaved change{dirtyItems.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {hasDirty && (
            <button
              type="button"
              style={{ ...S.actionBtn, padding: "0.4rem 0.9rem" }}
              onClick={handleReset}
              disabled={saving}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            style={S.saveBtn(!hasDirty || saving)}
            onClick={handleSave}
            disabled={!hasDirty || saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
