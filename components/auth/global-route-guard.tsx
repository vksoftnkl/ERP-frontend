"use client";
import { type ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppSelector } from "@/store/hooks";
import {
  selectAuthInitialized,
  selectIsAuthenticated,
} from "@/store/slices/authSlice";

const PUBLIC_EXACT_ROUTES = new Set(["/login", "/ui-library", "/erp-advanced-fixed"]);
const PUBLIC_PREFIX_ROUTES = ["/login/", "/ui-library/", "/erp-advanced-fixed/"];

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
    return "/";
  }
  return nextRoute.startsWith("/login") ? "/" : nextRoute;
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
      router.replace(`/login?next=${encodeURIComponent(toRelativePath(pathname, query))}`);
      return;
    }

    if (isAuthenticated && pathname === "/login") {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(normalizeNextRoute(next));
    }
  }, [authInitialized, isAuthenticated, pathname, publicRoute, router]);

  if (!authInitialized && !publicRoute) return null;

  if ((!isAuthenticated && !publicRoute) || (isAuthenticated && pathname === "/login")) {
    return null;
  }

  return <>{children}</>;
}
