"use client";

import { useEffect } from "react";
import ErrorState from "@/components/feedback/error-state";

/**
 * Route-segment error boundary.
 *
 * Catches render/effect throws from every page under `app/**` — each route is a
 * `dynamic(..., { ssr: false })` shim around a feature screen, and a throw
 * inside that lazy component surfaces here rather than blanking the browser.
 * The app shell (header, providers, toaster) stays mounted.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <ErrorState
      description="This screen stopped responding before it finished loading. Your saved data is not affected — try again, or reload the page."
      error={error}
      onRetry={reset}
    />
  );
}
