"use client";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  EMPTY_MENU_PERMISSION_INDEX,
  FULL_MENU_PERMISSIONS,
  NO_MENU_PERMISSIONS,
  buildMenuPermissionIndex,
  resolveMenuAccess,
  type MenuAccessResult,
  type MenuPermissionIndex,
  type MenuPermissions,
} from "@/lib/permissions/menu-permissions";
import { useGetPrimaryMenuQuery } from "@/store/api/shellApi";
import { useAppSelector } from "@/store/hooks";
import { selectAuthUserId, selectIsAuthenticated } from "@/store/slices/authSlice";

export type UseMenuPermissionsResult = MenuAccessResult & {
  isLoading: boolean;
  /** Convenience: `status === "denied"`. */
  isDenied: boolean;
};

/**
 * The signed-in user's menu rights, indexed by route and by `menu_id`. Shares
 * the header's `/menu-masters/usermenu` cache entry, so mounting this costs no
 * extra request.
 */
export function useMenuPermissionIndex(): MenuPermissionIndex & { isLoading: boolean } {
  const userId = useAppSelector(selectAuthUserId);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { data, isLoading, isFetching, isUninitialized } = useGetPrimaryMenuQuery(
    userId ?? "",
    { skip: !isAuthenticated || !userId },
  );
  return useMemo(() => {
    const index = data ? buildMenuPermissionIndex(data) : EMPTY_MENU_PERMISSION_INDEX;
    return {
      ...index,
      isLoading: isUninitialized || isLoading || (isFetching && !data),
    };
  }, [data, isFetching, isLoading, isUninitialized]);
}

/**
 * Rights for one screen. Resolves the current pathname against the user menu
 * unless `href` or `menuId` names the menu explicitly (a screen reached from a
 * route the catalogue does not list still knows which menu owns it).
 *
 * Fails open while the menu is loading and for routes no menu governs; fails
 * closed only once a loaded menu has been checked and came back without the
 * screen.
 */
export function usePagePermissions(options?: {
  href?: string;
  menuId?: number;
  /** Opt out entirely — the screen is not menu-governed. */
  disabled?: boolean;
}): UseMenuPermissionsResult {
  const pathname = usePathname() ?? "";
  const index = useMenuPermissionIndex();
  const { href, menuId, disabled } = options ?? {};
  return useMemo(() => {
    if (disabled) {
      return {
        status: "ungoverned" as const,
        permissions: FULL_MENU_PERMISSIONS,
        route: null,
        isLoading: false,
        isDenied: false,
      };
    }
    if (typeof menuId === "number") {
      if (index.isLoading || !index.loaded) {
        return {
          status: "loading" as const,
          permissions: FULL_MENU_PERMISSIONS,
          route: null,
          isLoading: true,
          isDenied: false,
        };
      }
      const granted = index.byMenuId.get(menuId);
      if (!granted || !granted.canView) {
        return {
          status: "denied" as const,
          permissions: NO_MENU_PERMISSIONS,
          route: null,
          isLoading: false,
          isDenied: true,
        };
      }
      return {
        status: "granted" as const,
        permissions: granted,
        route: null,
        isLoading: false,
        isDenied: false,
      };
    }
    const access = resolveMenuAccess(href ?? pathname, index);
    return {
      ...access,
      isLoading: access.status === "loading",
      isDenied: access.status === "denied",
    };
  }, [disabled, href, index, menuId, pathname]);
}

export type { MenuPermissions };
