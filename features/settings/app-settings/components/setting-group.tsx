"use client";

import type { EditableScope } from "../types";
import type { SettingGroupView, SettingRow as Row } from "../use-app-settings";
import SettingRow from "./setting-row";
import styles from "../page.module.scss";

/** One group of the catalog, as a card of striped rows. */
export default function SettingGroup({
  view,
  scope,
  busy,
  onChange,
  onReset,
}: {
  view: SettingGroupView;
  scope: EditableScope;
  busy: boolean;
  onChange: (row: Row, value: string) => void;
  onReset: (row: Row) => void;
}) {
  return (
    <section className={styles.group}>
      <header className={styles.groupHead}>
        <h2 className={styles.groupTitle}>{view.group}</h2>
        <span className={styles.groupModule}>{view.module}</span>
        <span className={styles.groupCount}>
          {view.rows.length} setting{view.rows.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className={styles.groupRows}>
        {view.rows.map((row) => (
          <SettingRow
            key={row.asdKey}
            row={row}
            scope={scope}
            busy={busy}
            onChange={(value) => onChange(row, value)}
            onReset={() => onReset(row)}
          />
        ))}
      </div>
    </section>
  );
}
