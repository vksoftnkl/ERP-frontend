"use client";

/**
 * Keeps this browser on the server's live change feed while someone is signed
 * in, so another user's save refreshes what is on screen here at once — see
 * lib/data-freshness/server-change-feed.ts. Renders nothing.
 */

import { useEffect } from "react";

import { API_BASE, getAuthHeaderValue } from "@/lib/api/client";
import { getAuthSession } from "@/lib/auth/session";
import { startServerChangeFeed } from "@/lib/data-freshness/server-change-feed";
import { useAppSelector } from "@/store/hooks";
import { selectIsAuthenticated } from "@/store/slices/authSlice";

export default function ServerChangeFeed() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;
    return startServerChangeFeed({
      url: `${API_BASE}/data-changes/stream`,
      getAuthorization: () => getAuthHeaderValue(getAuthSession()),
    });
  }, [isAuthenticated]);

  return null;
}
