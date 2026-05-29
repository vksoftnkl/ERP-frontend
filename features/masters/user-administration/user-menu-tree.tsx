"use client";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useApi } from "@/hooks/useApi";
// ── Types ─────────────────────────────────────────────────────────────────────
interface MenuNode {
  menuId: number;
  menuName: string;
  menuAlias: string | null;
  menuSeparator: boolean;
  menuIsActive: boolean;
  children?: MenuNode[];
}
export interface MenuPermission {
  umMenuId: number;
  umCanView: boolean;
  umCanCreate: boolean;
  umCanEdit: boolean;
  umCanDelete: boolean;
  umCanPrint: boolean;
  umCanExport: boolean;
}
// ── Constants ─────────────────────────────────────────────────────────────────
// Use /all so admins see every menu regardless of their own permissions
const MENU_ENDPOINT = "/menu-masters/get";
const MENU_QUERY = {
  // includeChildren: "true",
  // activeOnly: "true",
  // visibleOnly: "true",
} as const;
const PERM_KEYS = [
  "umCanView",
  "umCanCreate",
  "umCanEdit",
  "umCanDelete",
  "umCanPrint",
  "umCanExport",
] as const;
type PermKey = (typeof PERM_KEYS)[number];
const PERM_LABELS: Record<PermKey, string> = {
  umCanView: "View",
  umCanCreate: "Create",
  umCanEdit: "Edit",
  umCanDelete: "Delete",
  umCanPrint: "Print",
  umCanExport: "Export",
};
// ── Helpers ──────────────────────────────────────────────────────────────────
function emptyPerm(menuId: number): MenuPermission {
  return {
    umMenuId: menuId,
    umCanView: false,
    umCanCreate: false,
    umCanEdit: false,
    umCanDelete: false,
    umCanPrint: false,
    umCanExport: false,
  };
}
function collectAllIds(nodes: MenuNode[]): number[] {
  const ids: number[] = [];
  for (const node of nodes) {
    ids.push(node.menuId);
    if (node.children?.length) ids.push(...collectAllIds(node.children));
  }
  return ids;
}
function collectNodeAndDescendantIds(node: MenuNode): number[] {
  return collectAllIds([node]);
}
export function parseMenuPermissions(raw: string): MenuPermission[] {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root: {
    border: "1px solid var(--border, #dbe3ef)",
    borderRadius: "0.5rem",
    overflow: "hidden",
    fontSize: "0.8rem",
  } satisfies CSSProperties,
  header: {
    display: "grid",
    gridTemplateColumns: "1fr repeat(6, 4.5rem)",
    background: "#f3f4f6",
    borderBottom: "1px solid var(--border, #dbe3ef)",
    padding: "0.4rem 0.75rem",
    gap: "0.25rem",
    alignItems: "center",
    fontWeight: 600,
    fontSize: "0.72rem",
    color: "#374151",
  } satisfies CSSProperties,
  headerMenuCell: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  } satisfies CSSProperties,
  headerPermCell: {
    textAlign: "center" as const,
  } satisfies CSSProperties,
  actionBtn: {
    fontSize: "0.68rem",
    padding: "0.1rem 0.4rem",
    border: "1px solid var(--border, #dbe3ef)",
    borderRadius: "0.25rem",
    cursor: "pointer",
    background: "white",
    color: "#374151",
  } satisfies CSSProperties,
  scrollArea: {
    maxHeight: "24rem",
    overflowY: "auto" as const,
  } satisfies CSSProperties,
  row: (depth: number, alt: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "1fr repeat(6, 4.5rem)",
    padding: "0.28rem 0.75rem",
    gap: "0.25rem",
    alignItems: "center",
    background: alt ? "#f9fafb" : "white",
    borderBottom: "1px solid #f0f0f0",
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
  permCell: {
    textAlign: "center" as const,
  } satisfies CSSProperties,
  menuName: (isSeparator: boolean, hasChildren: boolean): CSSProperties => ({
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    fontWeight: hasChildren ? 600 : 400,
    color: isSeparator ? "#9ca3af" : undefined,
  }),
  empty: {
    padding: "1.5rem",
    textAlign: "center" as const,
    color: "#6b7280",
    fontSize: "0.8rem",
  } satisfies CSSProperties,
};
// ── MenuRow ───────────────────────────────────────────────────────────────────
interface MenuRowProps {
  node: MenuNode;
  depth: number;
  rowIndex: number;
  permissions: Map<number, MenuPermission>;
  collapsed: Set<number>;
  disabled: boolean;
  onToggleMenu: (node: MenuNode, checked: boolean) => void;
  onTogglePerm: (id: number, key: PermKey, checked: boolean) => void;
  onToggleCollapsed: (id: number) => void;
}
function MenuRow({
  node,
  depth,
  rowIndex,
  permissions,
  collapsed,
  disabled,
  onToggleMenu,
  onTogglePerm,
  onToggleCollapsed,
}: MenuRowProps) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isCollapsed = collapsed.has(node.menuId);
  const perm = permissions.get(node.menuId);
  const isAssigned = perm !== undefined;
  return (
    <>
      <div style={S.row(depth, rowIndex % 2 !== 0)}>
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
          <input
            type="checkbox"
            checked={isAssigned}
            disabled={disabled}
            onChange={(e) => onToggleMenu(node, e.target.checked)}
            style={{ flexShrink: 0 }}
          />
          <span
            title={node.menuName}
            style={S.menuName(node.menuSeparator, hasChildren)}
          >
            {node.menuName}
          </span>
        </div>
        {PERM_KEYS.map((k) => (
          <div key={k} style={S.permCell}>
            <input
              type="checkbox"
              checked={perm?.[k] ?? false}
              disabled={disabled || !isAssigned}
              onChange={(e) => onTogglePerm(node.menuId, k, e.target.checked)}
            />
          </div>
        ))}
      </div>
      {hasChildren && !isCollapsed
        ? node.children!.map((child, i) => (
            <MenuRow
              key={child.menuId}
              node={child}
              depth={depth + 1}
              rowIndex={i}
              permissions={permissions}
              collapsed={collapsed}
              disabled={disabled}
              onToggleMenu={onToggleMenu}
              onTogglePerm={onTogglePerm}
              onToggleCollapsed={onToggleCollapsed}
            />
          ))
        : null}
    </>
  );
}
// ── UserMenuTree ──────────────────────────────────────────────────────────────
interface UserMenuTreeProps {
  value: string;
  setValue: (value: string) => void;
  disabled: boolean;
}
export function UserMenuTree({ value, setValue, disabled }: UserMenuTreeProps) {
  const { getAll } = useApi<{ data: MenuNode[] }>(MENU_ENDPOINT);
  const [menus, setMenus] = useState<MenuNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const permMap = useMemo<Map<number, MenuPermission>>(() => {
    const arr = parseMenuPermissions(value);
    return new Map(arr.map((p) => [p.umMenuId, p]));
  }, [value]);
  useEffect(() => {
    setLoading(true);
    getAll(MENU_QUERY as Record<string, string>)
      .then((res: unknown) => {
        const data = (res as { data?: MenuNode[] })?.data ?? [];
        setMenus(Array.isArray(data) ? data : []);
      })
      .catch(() => setMenus([]))
      .finally(() => setLoading(false));
  }, [getAll]);
  const commit = useCallback(
    (map: Map<number, MenuPermission>) => {
      setValue(JSON.stringify([...map.values()]));
    },
    [setValue],
  );
  const handleToggleMenu = useCallback(
    (node: MenuNode, checked: boolean) => {
      const next = new Map(permMap);
      const ids = collectNodeAndDescendantIds(node);
      if (checked) {
        for (const id of ids) {
          if (!next.has(id)) {
            next.set(id, emptyPerm(id));
          }
        }
      } else {
        for (const id of ids) {
          next.delete(id);
        }
      }
      commit(next);
    },
    [permMap, commit],
  );
  const handleTogglePerm = useCallback(
    (menuId: number, key: PermKey, checked: boolean) => {
      const next = new Map(permMap);
      const existing = next.get(menuId) ?? emptyPerm(menuId);
      next.set(menuId, { ...existing, [key]: checked });
      commit(next);
    },
    [permMap, commit],
  );
  const handleToggleCollapsed = useCallback((menuId: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(menuId) ? next.delete(menuId) : next.add(menuId);
      return next;
    });
  }, []);
  const handleSelectAll = useCallback(() => {
    const all = collectAllIds(menus);
    const map = new Map(
      all.map((id) => [
        id,
        {
          umMenuId: id,
          umCanView: true,
          umCanCreate: true,
          umCanEdit: true,
          umCanDelete: true,
          umCanPrint: true,
          umCanExport: true,
        },
      ]),
    );
    setValue(JSON.stringify([...map.values()]));
  }, [menus, setValue]);
  const handleDeselectAll = useCallback(() => {
    setValue("[]");
  }, [setValue]);
  if (loading) {
    return (
      <div style={S.root}>
        <div style={S.empty}>Loading menus…</div>
      </div>
    );
  }
  if (!menus.length) {
    return (
      <div style={S.root}>
        <div style={S.empty}>No menus available.</div>
      </div>
    );
  }
  const assignedCount = permMap.size;
  const totalCount = collectAllIds(menus).length;
  return (
    <div style={S.root}>
      {/* Header row */}
      <div style={S.header}>
        <div style={S.headerMenuCell}>
          <span>Menu</span>
          <button
            type="button"
            style={S.actionBtn}
            onClick={handleSelectAll}
            disabled={disabled}
          >
            All
          </button>
          <button
            type="button"
            style={S.actionBtn}
            onClick={handleDeselectAll}
            disabled={disabled}
          >
            None
          </button>
          <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: "0.25rem" }}>
            {assignedCount}/{totalCount}
          </span>
        </div>
        {PERM_KEYS.map((k) => (
          <div key={k} style={S.headerPermCell}>
            {PERM_LABELS[k]}
          </div>
        ))}
      </div>
      {/* Tree rows */}
      <div style={S.scrollArea}>
        {menus.map((menu, i) => (
          <MenuRow
            key={menu.menuId}
            node={menu}
            depth={0}
            rowIndex={i}
            permissions={permMap}
            collapsed={collapsed}
            disabled={disabled}
            onToggleMenu={handleToggleMenu}
            onTogglePerm={handleTogglePerm}
            onToggleCollapsed={handleToggleCollapsed}
          />
        ))}
      </div>
    </div>
  );
}