"use client";

import { useEffect } from "react";
import "./globals.css";
import "@/styles/library/index.scss";
import ErrorState from "@/components/feedback/error-state";

/**
 * Last-resort boundary for failures in the root layout itself.
 *
 * Next.js replaces the whole document when this renders, so it must supply its
 * own `<html>`/`<body>` and re-import the global stylesheets. Nothing here may
 * touch Redux or the router: by definition, the tree that provides them is the
 * thing that just failed. `reset` is not offered for the same reason — the
 * layout would re-run and throw again; a full reload is the only real recovery.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ErrorState
          title="The application failed to start"
          description="A problem in the app shell stopped this page from loading. Reloading usually clears it."
          error={error}
        />
      </body>
    </html>
  );
}
