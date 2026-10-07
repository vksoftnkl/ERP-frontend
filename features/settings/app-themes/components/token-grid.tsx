"use client";

import { Fragment, useState, type KeyboardEvent } from "react";

import { toast } from "@/lib/notify";
import { TOKEN_CATALOGUE, normaliseTypedColour } from "../lib/token-catalogue";
import styles from "../page.module.scss";

type Props = {
  tokens: Record<string, string>;
  loadedTokens: Record<string, string>;
  editable: boolean;
  onChange: (key: string, value: string) => void;
  onReset: (key: string) => void;
};

/** `#rrggbb` for `<input type="color">`, which takes neither alpha nor capitals. */
function pickerValue(value: string): string {
  return value.slice(0, 7).toLowerCase();
}

/**
 * The colour grid: one row per key, grouped as the Qt screen groups them.
 * The swatch opens the colour picker, the hex is typed (`#rrggbb` /
 * `#rrggbbaa`), Delete on a row puts back the app's built-in value, and a
 * changed row is tinted with what it was.
 */
export default function TokenGrid({ tokens, loadedTokens, editable, onChange, onReset }: Props) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.tokenTable}>
        <thead>
          <tr>
            <th>Key</th>
            <th>Means</th>
            <th>Colour</th>
            <th>Hex</th>
            <th>vs built-in</th>
          </tr>
        </thead>
        <tbody>
          {TOKEN_CATALOGUE.map((entry, index) => {
            const heading = index === 0 || TOKEN_CATALOGUE[index - 1].group !== entry.group ? entry.group : null;
            const value = tokens[entry.key] ?? entry.builtIn;
            const loaded = loadedTokens[entry.key] ?? entry.builtIn;
            const changed = value !== loaded;
            const note = changed ? `was ${loaded}` : value === entry.builtIn ? "same" : `built-in ${entry.builtIn}`;

            const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
              if (!editable || event.key !== "Delete") return;
              // In the hex box Delete edits the text.
              if ((event.target as HTMLElement).dataset.hexInput === "true") return;
              event.preventDefault();
              onReset(entry.key);
            };

            return (
              <Fragment key={entry.key}>
                {heading ? (
                  <tr className={styles.groupRow}>
                    <td colSpan={5}>{heading}</td>
                  </tr>
                ) : null}
                <tr className={changed ? styles.tokenRowChanged : undefined} onKeyDown={onRowKeyDown}>
                  <td className={styles.mono}>{entry.key}</td>
                  <td className={styles.meaning}>{entry.meaning}</td>
                  <td>
                    <span className={styles.swatchCell}>
                      {value.length === 9 ? <span className={styles.checker} aria-hidden="true" /> : null}
                      <input
                        type="color"
                        className={styles.swatchInput}
                        value={pickerValue(value)}
                        disabled={!editable}
                        aria-label={`${entry.key} colour`}
                        title={editable ? "Pick a colour · Delete puts back the built-in value" : value}
                        style={{ opacity: value.length === 9 ? Number.parseInt(value.slice(7), 16) / 255 : 1 }}
                        onChange={(event) => {
                          // A see-through colour keeps its alpha; the picker has none.
                          const next = `${event.target.value}${value.slice(7)}`.toUpperCase();
                          if (next !== value) onChange(entry.key, next);
                        }}
                      />
                    </span>
                  </td>
                  <td>
                    <HexInput tokenKey={entry.key} value={value} editable={editable} onCommit={onChange} />
                  </td>
                  <td
                    className={changed ? styles.noteChanged : styles.noteMuted}
                    title={`The app's built-in value: ${entry.builtIn}`}
                  >
                    {note}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type HexInputProps = {
  tokenKey: string;
  value: string;
  editable: boolean;
  onCommit: (key: string, value: string) => void;
};

/** A typed value that is not `#rrggbb` / `#rrggbbaa` never reaches the edit. */
function HexInput({ tokenKey, value, editable, onCommit }: HexInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const next = normaliseTypedColour(draft);
    if (next === null) {
      if (draft.trim()) toast.warn(`${tokenKey} must be #rrggbb or #rrggbbaa — "${draft.trim()}" was not taken.`);
      return;
    }
    if (next !== value) onCommit(tokenKey, next);
  };

  return (
    <input
      type="text"
      className={styles.hexInput}
      data-hex-input="true"
      spellCheck={false}
      autoComplete="off"
      maxLength={9}
      readOnly={!editable}
      aria-label={`${tokenKey} hex`}
      value={draft ?? value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const typed = event.target.value.toUpperCase();
        if (/^#?[0-9A-F]{0,8}$/.test(typed)) setDraft(typed);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape" && draft !== null) {
          event.preventDefault();
          event.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}
