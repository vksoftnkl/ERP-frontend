"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import ErrorState from "@/components/feedback/error-state";

/**
 * Reusable render-error boundary for subtrees that Next's file-based
 * boundaries do not cover.
 *
 * `app/error.tsx` only wraps the *page* below a layout — anything rendered by
 * the root layout itself (the header, the business-context provider) escapes it
 * and goes straight to `app/global-error.tsx`, which blanks the entire
 * application. Wrapping those shell pieces here keeps one failing region from
 * taking down the others.
 */

export type ErrorBoundaryProps = {
  children: ReactNode;
  /**
   * Custom fallback. Receives the caught error and a reset callback that clears
   * the boundary and re-renders `children`.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Notified on catch, in addition to the console log. */
  onError?: (error: Error, info: ErrorInfo) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // React only prints the component stack itself in development. Logging it
    // here keeps the one forensic trail we have in a production build, where a
    // minified message alone rarely identifies the screen that failed.
    console.error("[ErrorBoundary]", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }
    return <ErrorState error={error} onRetry={this.reset} />;
  }
}
