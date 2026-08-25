"use client";
import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HOME_ROUTE } from "@/lib/navigation/routes";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useAppSelector } from "@/store/hooks";
import { selectIsAuthenticated } from "@/store/slices/authSlice";

/**
 * Route-level half of menu permissions.
 *
 * User Administration grants each user a set of menus (`/menu-masters/usermenu`).
 * A screen that belongs to that catalogue but is missing from the user's own
 * menu was not granted, so typing its URL must not open it. Screens the
 * catalogue never lists (designers, `/home`) are not menu-governed and pass
 * straight through, as does every route while the menu is still loading — the
 * guard fails open until it has something to check against.
 */
export default function MenuAccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { isDenied } = usePagePermissions({ disabled: !isAuthenticated });

  if (!isDenied) {
    return <>{children}</>;
  }

  return (
    <main className="erp-error-state erp-error-state--access" role="alert">
      <div className="erp-error-state__panel">
        <div className="erp-error-state__badge" aria-hidden="true">
          🔒
        </div>
        <h1 className="erp-error-state__title">You do not have access to this screen</h1>
        <p className="erp-error-state__description">
          This screen is not part of the menu permissions assigned to your user.
          Ask an administrator to grant it in Settings → User Administration.
        </p>
        <p className="erp-error-state__reference">
          <span className="erp-error-state__reference-label">Screen</span>
          <code className="erp-error-state__reference-value">{pathname}</code>
        </p>
        <div className="erp-error-state__actions">
          <Link className="ui-btn ui-btn--primary" href={HOME_ROUTE}>
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
