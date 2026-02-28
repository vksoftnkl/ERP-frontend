"use client";
import { type ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth/session";

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

  // Computed synchronously — no useState needed.
  // `null` during SSR (window unavailable), boolean on the client.
  const auth = typeof window !== "undefined" ? isAuthenticated() : null;
  const publicRoute = isPublicRoute(pathname);

  useEffect(() => {
    if (auth === null) return;

    if (!auth && !publicRoute) {
      const query = window.location.search.replace(/^\?/, "");
      router.replace(`/login?next=${encodeURIComponent(toRelativePath(pathname, query))}`);
      return;
    }

    if (auth && pathname === "/login") {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(normalizeNextRoute(next));
    }
  }, [auth, pathname, publicRoute, router]);

  // Block render while auth is unknown on a protected route
  if (auth === null && !publicRoute) return null;

  // Block render during redirect to avoid flash
  if (auth !== null && ((!auth && !publicRoute) || (auth && pathname === "/login"))) return null;

  return <>{children}</>;
}
