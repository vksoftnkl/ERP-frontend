"use client";

import { SCOPE_LABEL } from "../lib/scope";
import type { EditableScope } from "../types";
import styles from "../page.module.scss";

/**
 * Which layer is being written. The bar has no "level" control — the level is
 * derived from which of branch and counter are set — so this is the only place
 * that says it, and it has to say it plainly.
 */
export default function ScopeChip({ scope }: { scope: EditableScope }) {
  return (
    <span className={`${styles.scopeChip} ${styles[`scopeChip${scope}`] ?? ""}`}>
      Editing at {SCOPE_LABEL[scope]} level
    </span>
  );
}
