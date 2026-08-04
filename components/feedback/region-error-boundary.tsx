"use client";

import type { ReactNode } from "react";
import ErrorBoundary from "@/components/feedback/error-boundary";
import ErrorState from "@/components/feedback/error-state";

/**
 * Inline boundary for a single region of the app shell (header, sidebar, …).
 *
 * `ErrorBoundary`'s `fallback` is a function, and functions cannot cross the
 * Server → Client Component boundary — passing one from `app/layout.tsx`
 * (a Server Component) fails serialization at render time. This wrapper keeps
 * the closure on the client side and exposes only serializable props, so the
 * layout can scope a region without becoming a Client Component itself.
 */

export type RegionErrorBoundaryProps = {
  children: ReactNode;
  /** Headline shown in place of the failed region. */
  title: string;
  /** Optional sentence under the headline. */
  description?: string;
};

export default function RegionErrorBoundary({
  children,
  title,
  description = "",
}: RegionErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <ErrorState
          className="erp-error-state--inline"
          title={title}
          description={description}
          error={error}
          onRetry={reset}
          showReload={false}
          showHomeLink={false}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
