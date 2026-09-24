/**
 * The screen's keys — ONE table, from which both the key map and the words on
 * the buttons are generated, so the two can never disagree.
 *
 * No button is a default button, and Enter on a row opens the receipt.
 * Re-present and Replace have no key, as in the Qt screen.
 */
import type { ChequeVerb } from "./domain/stateMachine";
import type { ChequeVocabulary } from "./domain/vocabulary";

export type KeyBinding = {
  verb: ChequeVerb;
  /** What the button says (before the key). */
  label: (words: ChequeVocabulary) => string;
  /** The key as written on the button, or null for none. */
  keyLabel: string | null;
  matches: (event: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">) => boolean;
};

function plain(key: string) {
  return (event: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">) =>
    event.key === key && !event.ctrlKey && !event.altKey && !event.metaKey;
}

export const KEY_TABLE: readonly KeyBinding[] = [
  { verb: "deposit", label: (words) => words.depositVerb, keyLabel: "F5", matches: plain("F5") },
  { verb: "clear", label: () => "Clear", keyLabel: "F7", matches: plain("F7") },
  { verb: "bounce", label: () => "Bounce", keyLabel: "F8", matches: plain("F8") },
  { verb: "represent", label: () => "Re-present", keyLabel: null, matches: () => false },
  { verb: "replace", label: () => "Replace", keyLabel: null, matches: () => false },
  { verb: "return", label: () => "Return / Cancel", keyLabel: "F3", matches: plain("F3") },
  { verb: "printSlip", label: () => "Print slip", keyLabel: "F6", matches: plain("F6") },
  {
    verb: "history",
    label: () => "History",
    keyLabel: "Ctrl+H",
    matches: (event) =>
      event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "h",
  },
];

/**
 * Keys that are ALWAYS swallowed on this screen, whether their button is live
 * or not: the browser's F5 reloads the page, F3 opens find, F6 jumps to the
 * address bar, F7 toggles caret browsing and Ctrl+H opens history. An
 * operator reaching for Deposit must never lose the screen instead.
 */
export function isReservedKey(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): boolean {
  return KEY_TABLE.some((binding) => binding.keyLabel !== null && binding.matches(event));
}

export function bindingFor(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
): KeyBinding | null {
  return KEY_TABLE.find((binding) => binding.matches(event)) ?? null;
}

export function buttonText(binding: KeyBinding, words: ChequeVocabulary): string {
  const label = binding.label(words);
  return binding.keyLabel ? `${label} - ${binding.keyLabel}` : label;
}
