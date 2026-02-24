"use client";

import { type ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth/session";

const PUBLIC_EXACT_ROUTES = new Set([
  "/",
  "/login",
  "/ui-library",
  "/erp-advanced-fixed",
]);

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
  const publicRoute = isPublicRoute(pathname);
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    setAuthenticated(isAuthenticated());
    setAuthChecked(true);
  }, [pathname]);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    if (!authenticated && !publicRoute) {
      const query = window.location.search.replace(/^\?/, "");
      const target = toRelativePath(pathname, query);
      router.replace(`/login?next=${encodeURIComponent(target)}`);
      return;
    }

    if (authenticated && pathname === "/login") {
      const nextRoute = normalizeNextRoute(
        new URLSearchParams(window.location.search).get("next")
      );
      router.replace(nextRoute);
    }
  }, [authChecked, authenticated, pathname, publicRoute, router]);

  if (!publicRoute && !authChecked) {
    return null;
  }

  if (authChecked && ((!authenticated && !publicRoute) || (authenticated && pathname === "/login"))) {
    return null;
  }

  return <>{children}</>;
}
