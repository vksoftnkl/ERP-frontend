"use client";
import { type ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { notifyGlobalNavigationStart } from "@/lib/navigation/global-loader";
import { HOME_ROUTE } from "@/lib/navigation/routes";
import { useAppSelector } from "@/store/hooks";
import {
  selectAuthInitialized,
  selectIsAuthenticated,
} from "@/store/slices/authSlice";

// `/` is public because it only forwards to login or to the home screen.
const PUBLIC_EXACT_ROUTES = new Set(["/", "/login", "/ui-library", "/erp-data-demo"]);
const PUBLIC_PREFIX_ROUTES = ["/login/", "/ui-library/", "/erp-data-demo/"];

function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_EXACT_ROUTES.has(pathname) ||
    PUBLIC_PREFIX_ROUTES.some((prefix) => pathname.startsWith(prefix))
  );
}

function toRelativePath(pathname: string, query: string): string {
  return query ? `${pathname}?${query}` : pathname;
}

function normalizeNextRoute(nextRoute: string | null): string {
  if (!nextRoute || !nextRoute.startsWith("/") || nextRoute.startsWith("//")) {
    return HOME_ROUTE;
  }
  return nextRoute === "/" || nextRoute.startsWith("/login") ? HOME_ROUTE : nextRoute;
}

export default function GlobalRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const authInitialized = useAppSelector(selectAuthInitialized);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const publicRoute = isPublicRoute(pathname);

  useEffect(() => {
    if (!authInitialized) {
      return;
    }

    if (!isAuthenticated && !publicRoute) {
      const query = window.location.search.replace(/^\?/, "");
      notifyGlobalNavigationStart();
      router.replace(`/login?next=${encodeURIComponent(toRelativePath(pathname, query))}`);
      return;
    }

    if (isAuthenticated && pathname === "/login") {
      const next = new URLSearchParams(window.location.search).get("next");
      notifyGlobalNavigationStart();
      router.replace(normalizeNextRoute(next));
    }
  }, [authInitialized, isAuthenticated, pathname, publicRoute, router]);

  // Always render children to avoid hydration mismatch
  // Navigation logic is handled by useEffect above
  return <>{children}</>;
}
