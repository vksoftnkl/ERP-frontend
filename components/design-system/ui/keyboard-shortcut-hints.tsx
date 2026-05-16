import { cx } from "@/components/design-system/cx";
import styles from "./keyboard-shortcut-hints.module.scss";
const KEY_LABELS = new Map<string, string>([
  [" ", "Space"],
  ["alt", "Alt"],
  ["arrowdown", "↓"],
  ["arrowleft", "←"],
  ["arrowright", "→"],
  ["arrowup", "↑"],
  ["control", "Ctrl"],
  ["ctrl", "Ctrl"],
  ["end", "End"],
  ["enter", "Enter"],
  ["esc", "Esc"],
  ["escape", "Esc"],
  ["home", "Home"],
  ["meta", "Cmd"],
  ["shift", "Shift"],
  ["space", "Space"],
  ["tab", "Tab"],
]);
function formatKeyLabel(value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return "";
  }
  const mappedValue = KEY_LABELS.get(normalizedValue.toLowerCase());
  if (mappedValue) {
    return mappedValue;
  }
  if (normalizedValue.length === 1) {
    return normalizedValue.toUpperCase();
  }
  return normalizedValue;
}
export type KeyboardShortcutDefinition = {
  label?: string;
  keys: readonly string[];
};
type KeyboardKeycapProps = {
  label: string;
  className?: string;
  ariaHidden?: boolean;
};
export function KeyboardKeycap({
  label,
  className,
  ariaHidden = false,
}: KeyboardKeycapProps) {
  const displayLabel = formatKeyLabel(label);
  if (!displayLabel) {
    return null;
  }
  return (
    <kbd
      className={cx(styles.keycap, className)}
      aria-hidden={ariaHidden ? true : undefined}
    >
      {displayLabel}
    </kbd>
  );
}
type KeyboardShortcutKeysProps = {
  keys: readonly string[];
  className?: string;
  ariaHidden?: boolean;
};
export function KeyboardShortcutKeys({
  keys,
  className,
  ariaHidden = false,
}: KeyboardShortcutKeysProps) {
  if (keys.length === 0) {
    return null;
  }
  return (
    <span
      className={cx(styles.keycapGroup, className)}
      aria-hidden={ariaHidden ? true : undefined}
    >
      {keys.map((key, keyIndex) => (
        <span
          key={`${key}-${keyIndex}`}
          className={styles.keycapWithJoiner}
        >
          {keyIndex > 0 ? (
            <span className={styles.keycapJoiner}>+</span>
          ) : null}
          <KeyboardKeycap label={key} />
        </span>
      ))}
    </span>
  );
}
type KeyboardShortcutHintsProps = {
  shortcuts: readonly KeyboardShortcutDefinition[];
  className?: string;
  dense?: boolean;
  ariaHidden?: boolean;
};
export function KeyboardShortcutHints({
  shortcuts,
  className,
  dense = false,
  ariaHidden = false,
}: KeyboardShortcutHintsProps) {
  if (shortcuts.length === 0) {
    return null;
  }
  return (
    <div
      className={cx(
        styles.shortcutList,
        dense && styles.shortcutListDense,
        className,
      )}
      aria-hidden={ariaHidden ? true : undefined}
    >
      {shortcuts.map((shortcut, shortcutIndex) => {
        const shortcutKey = `${shortcut.label ?? "shortcut"}-${shortcutIndex}-${shortcut.keys.join("-")}`;
        return (
          <span key={shortcutKey} className={styles.shortcutItem}>
            {shortcut.label ? (
              <span className={styles.shortcutLabel}>{shortcut.label}</span>
            ) : null}
            <KeyboardShortcutKeys keys={shortcut.keys} />
          </span>
        );
      })}
    </div>
  );
}