"use client";

import { useMemo, useState } from "react";

import { SIZE_PLACEHOLDERS, TOKEN_KEYS, isColour } from "../lib/token-catalogue";
import styles from "../page.module.scss";

type Props = {
  counts: ReadonlyMap<string, number>;
  /** The "Fill with theme" theme's resolved values, sizes included. */
  values: Record<string, string>;
  fillName: string;
  readOnly: boolean;
  onInsert: (key: string) => void;
};

const KEYS: readonly string[] = [...TOKEN_KEYS, ...Object.keys(SIZE_PLACEHOLDERS)];

/**
 * Every key a template may use: how often the text uses it, and what the
 * chosen theme fills it with. A click types `{{key}}` at the editor's cursor.
 */
export default function PlaceholderTable({ counts, values, fillName, readOnly, onInsert }: Props) {
  const [search, setSearch] = useState("");
  const keys = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? KEYS.filter((key) => key.toLowerCase().includes(needle)) : KEYS;
  }, [search]);

  return (
    <section className={styles.placeholderPane} aria-label="Placeholders">
      <div className={styles.paneHead}>
        <span className={styles.sectionCap}>Placeholders</span>
        <span className={styles.mutedNote}>click a row to insert it at the cursor</span>
      </div>
      <input
        type="search"
        className={styles.searchInput}
        placeholder="Search keys…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search placeholder keys"
      />
      <div className={styles.tableScroll}>
        <table className={styles.placeholderTable}>
          <thead>
            <tr>
              <th>Key</th>
              <th className={styles.right}>Used</th>
              <th>{fillName || "Value"}</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const used = counts.get(key) ?? 0;
              const value = values[key] ?? "";
              return (
                <tr
                  key={key}
                  className={readOnly ? undefined : styles.clickableRow}
                  title={readOnly ? undefined : `Click: insert {{${key}}} at the cursor`}
                  onClick={() => {
                    if (!readOnly) onInsert(key);
                  }}
                >
                  <td className={styles.mono}>{key}</td>
                  <td className={`${styles.right} ${used === 0 ? styles.noteMuted : ""}`}>{used}</td>
                  <td className={styles.mono}>
                    {isColour(value) ? (
                      <span className={styles.valueWithSwatch}>
                        <span className={styles.staticSwatch} style={{ background: value }} />
                        {value}
                      </span>
                    ) : (
                      value
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
