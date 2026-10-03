/**
 * The issued screen's keys — ONE table, from which both the key map and the
 * words on the buttons are generated (the received `keys.ts` idea).
 *
 * The Qt screen's keys: F7 Presented, F8 Returned unpaid, F3 Stop, Ctrl+H
 * History; Void and Replace have none, on purpose — both are deliberate
 * moves, and a stray key should not start one. Enter opens the voucher.
 */
import type { IssuedVerb } from "./domain/machine";

type KeyEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

export type IssuedKeyBinding = {
  verb: IssuedVerb;
  label: string;
  keyLabel: string | null;
  title: string;
  matches: (event: KeyEvent) => boolean;
};

function plain(key: string) {
  return (event: KeyEvent) => event.key === key && !event.ctrlKey && !event.altKey && !event.metaKey;
}

export const ISSUED_KEY_TABLE: readonly IssuedKeyBinding[] = [
  {
    verb: "presented",
    label: "Presented",
    keyLabel: "F7",
    title: "Our bank paid it: not presented → presented, no voucher",
    matches: plain("F7"),
  },
  {
    verb: "returned",
    label: "Returned unpaid",
    keyLabel: "F8",
    title: "Our bank returned it: this line reversed, the bills reopen",
    matches: plain("F8"),
  },
  {
    verb: "stop",
    label: "Stop",
    keyLabel: "F3",
    title: "Stop payment: this line reversed",
    matches: plain("F3"),
  },
  {
    verb: "void",
    label: "Void",
    keyLabel: null,
    title: "Spoilt or written wrong, never left the office",
    matches: () => false,
  },
  {
    verb: "replace",
    label: "Replace",
    keyLabel: null,
    title: "A new cheque on a new leaf, a new Payment Voucher",
    matches: () => false,
  },
  {
    verb: "history",
    label: "History",
    keyLabel: "Ctrl+H",
    title: "Every step of this cheque",
    matches: (event) =>
      event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "h",
  },
];

/**
 * Keys always swallowed on this screen: the browser's F3 opens find, F7
 * toggles caret browsing and Ctrl+H opens its history — an operator reaching
 * for a verb must not lose the screen instead.
 */
export function isIssuedReservedKey(event: KeyEvent): boolean {
  return ISSUED_KEY_TABLE.some((binding) => binding.keyLabel !== null && binding.matches(event));
}

export function issuedBindingFor(event: KeyEvent): IssuedKeyBinding | null {
  return ISSUED_KEY_TABLE.find((binding) => binding.matches(event)) ?? null;
}

export function issuedButtonText(binding: IssuedKeyBinding): string {
  return binding.keyLabel ? `${binding.label} - ${binding.keyLabel}` : binding.label;
}
