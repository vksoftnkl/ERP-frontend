/**
 * What the app's message popup shows for this screen: an optional caption in
 * bold (the Qt message box's title — "No price rows", "Price below cost"…)
 * over text whose line breaks are kept, since the save toast and a 422's
 * per-row reasons are one line each.
 */
import type { ReactNode } from "react";

export function messageContent(text: string, title?: string): ReactNode {
  return (
    <div style={{ whiteSpace: "pre-line" }}>
      {title ? (
        <>
          <strong>{title}</strong>
          {"\n"}
        </>
      ) : null}
      {text}
    </div>
  );
}
