"use client";

import { cx } from "@/components/design-system/cx";

/**
 * Shared presentational error screen.
 *
 * Rendered by every failure path in the app — the route-segment boundary
 * (`app/error.tsx`), the root-layout boundary (`app/global-error.tsx`) and the
 * reusable `ErrorBoundary` component. It deliberately depends on nothing but
 * global CSS: `global-error.tsx` runs when the Redux `Providers` tree itself
 * failed to render, so anything reaching for a store or a router hook here
 * would throw a second time inside the fallback.
 */

export type ErrorStateProps = {
  /** Headline. Defaults to a neutral, non-alarming message. */
  title?: string;
  /** Sentence under the headline explaining what the user can do. */
  description?: string;
  /** The caught error. Its message/digest is surfaced for support tickets. */
  error?: (Error & { digest?: string }) | null;
  /** Re-render the failed subtree. Omit to hide the Try again button. */
  onRetry?: () => void;
  /** Show the full-page reload escape hatch. */
  showReload?: boolean;
  /** Show the "Back to home" link. */
  showHomeLink?: boolean;
  /** Extra class on the root, e.g. `erp-error-state--inline` for shell regions. */
  className?: string;
};

const DEFAULT_TITLE = "Something went wrong";
const DEFAULT_DESCRIPTION =
  "This screen stopped responding before it finished loading. Your saved data is not affected.";

function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * A support-quotable identifier. Next.js attaches `digest` to errors thrown
 * during server rendering; client-side throws have none, so fall back to the
 * message, which is all we have to correlate a user report with a log line.
 */
function resolveErrorReference(error: ErrorStateProps["error"]): string | null {
  if (!error) {
    return null;
  }
  if (error.digest) {
    return error.digest;
  }
  const message = typeof error.message === "string" ? error.message.trim() : "";
  return message || null;
}

export default function ErrorState({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  error,
  onRetry,
  showReload = true,
  showHomeLink = true,
  className,
}: ErrorStateProps) {
  const reference = resolveErrorReference(error);
  const showStack = isDevelopment() && Boolean(error?.stack);

  return (
    <main className={cx("erp-error-state", className)} role="alert">
      <div className="erp-error-state__panel">
        <div className="erp-error-state__badge" aria-hidden="true">
          !
        </div>
        <h1 className="erp-error-state__title">{title}</h1>
        {description ? (
          <p className="erp-error-state__description">{description}</p>
        ) : null}

        {reference ? (
          <p className="erp-error-state__reference">
            <span className="erp-error-state__reference-label">Reference</span>
            <code className="erp-error-state__reference-value">{reference}</code>
          </p>
        ) : null}

        <div className="erp-error-state__actions">
          {onRetry ? (
            <button type="button" className="ui-btn ui-btn--primary" onClick={onRetry}>
              Try again
            </button>
          ) : null}
          {showReload ? (
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              onClick={() => {
                window.location.reload();
              }}
            >
              Reload page
            </button>
          ) : null}
          {/* Plain anchor, not next/link: a hard navigation is the point here —
              it rebuilds the React tree that just failed. A client-side
              transition would reuse the same broken tree, and in the
              global-error case the router is not even mounted. */}
          {showHomeLink ? (
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a className="ui-btn ui-btn--ghost" href="/">
              Back to home
            </a>
          ) : null}
        </div>

        {showStack ? (
          <details className="erp-error-state__details">
            <summary className="erp-error-state__details-summary">
              Developer details
            </summary>
            <pre className="erp-error-state__stack">{error?.stack}</pre>
          </details>
        ) : null}
      </div>
    </main>
  );
}
