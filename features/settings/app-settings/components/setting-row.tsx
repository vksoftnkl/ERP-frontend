"use client";

import { SCOPE_LABEL, sourceLabel } from "../lib/scope";
import type { EditableScope } from "../types";
import type { SettingRow as Row } from "../use-app-settings";
import SettingControl from "./setting-control";
import styles from "../page.module.scss";

/**
 * One setting: what it is, what it is set to, where that came from, and — only
 * where it applies — how to put it back.
 *
 * A row the current scope may not edit is rendered read-only WITH the reason,
 * never hidden: an operator hunting for "Regional language" on a branch bar has
 * to be told it is company-wide, not left wondering where it went.
 */
export default function SettingRow({
  row,
  scope,
  busy,
  onChange,
  onReset,
}: {
  row: Row;
  scope: EditableScope;
  busy: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className={`${styles.row} ${row.dirty ? styles.rowDirty : ""}`}>
      <div className={styles.rowText}>
        <div className={styles.rowLabelLine}>
          <span className={styles.rowLabel}>{row.asdLabel}</span>
          {row.dirty ? <span className={styles.dirtyDot} title="Unsaved change" /> : null}
          {row.asdNeedsRelogin ? (
            <span className={styles.reloginTag} title="Takes effect after the next sign-in">
              sign-in
            </span>
          ) : null}
        </div>
        {row.asdDescription ? (
          <p className={styles.rowDescription}>{row.asdDescription}</p>
        ) : null}
        <code className={styles.rowKey}>{row.asdKey}</code>
        {row.readOnlyReason ? (
          <p className={styles.rowReadOnly}>{row.readOnlyReason}</p>
        ) : null}
        {row.error ? (
          <p id={`app-setting-${row.asdKey}-error`} className={styles.rowError}>
            {row.error}
          </p>
        ) : null}
      </div>

      <div className={styles.rowControl}>
        <SettingControl row={row} onChange={onChange} />
      </div>

      <div className={styles.rowMeta}>
        <span
          className={`${styles.sourceBadge} ${
            row.source === "OVERRIDE" ? styles.sourceBadgeSet : ""
          }`}
          title={
            row.override
              ? `Set at ${SCOPE_LABEL[row.override.asvScope]} level by ${row.override.asvCreatedBy}`
              : "No override anywhere — the catalog default stands"
          }
        >
          {sourceLabel(row)}
        </span>
        {row.resettable ? (
          <button
            type="button"
            className={styles.resetButton}
            disabled={busy}
            onClick={onReset}
            title={`Remove this ${SCOPE_LABEL[scope]} override and inherit again`}
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}
