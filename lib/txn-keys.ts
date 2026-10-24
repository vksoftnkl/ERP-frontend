/**
 * ONE set of document keys for every transaction entry screen — the Qt
 * `TxnKeys` (shared/ui/txn/txn_keys.h, Qt 6d56fa6, user 2026-10-23). The keys
 * are the ones people already know from Windows, Office, browsers and mail:
 *
 *     New / Clear      Alt+N         (Qt Ctrl+N — see BROWSER_RESERVED below)
 *     Save Draft       Ctrl+S
 *     Save & Post      Ctrl+Enter
 *     Edit             F2
 *     Cancel           Alt+X
 *     List / Open      Ctrl+O
 *     Close            Esc
 *     Print            Ctrl+P
 *     Find             Ctrl+F
 *     History          Ctrl+H
 *     Previous / Next  Alt+PgUp / Alt+PgDn   (Qt Ctrl+PgUp / Ctrl+PgDn)
 *     Keys             F1
 *     Duplicate line   Ctrl+D        (Opening Stock: Split batch)
 *     Change rate      Ctrl+R        (the line's item prices — the quick rate popup)
 *
 * The rules, as Qt states them: one key means one thing on every screen; Enter
 * never saves or posts; an action that cannot be undone has a modifier and
 * asks first; no key clashes with editing text in a field.
 *
 * ── Where the web differs ─────────────────────────────────────────────────
 * Chrome hands three of the Qt keys to itself before a page ever sees them:
 * Ctrl+N (new window) and Ctrl+PgUp / Ctrl+PgDn (previous / next TAB) are
 * "reserved" shortcuts no `preventDefault` reaches. So New is Alt+N and
 * Previous / Next are Alt+PgUp / Alt+PgDn here. The Qt chords are still
 * MATCHED — a browser that does deliver them (Firefox, an installed app
 * window) gets the same action — but the captions and the F1 sheet show the
 * key that works.
 *
 * Pure: no React, no DOM beyond reading a keyboard event.
 */

export type TxnKeyAction =
  | "new"
  | "saveDraft"
  | "post"
  | "edit"
  | "cancelDoc"
  | "open"
  | "close"
  | "print"
  | "find"
  | "history"
  | "previous"
  | "next"
  | "duplicateLine"
  | "changeRate";

/** The order the F1 sheet lists them in — the Qt enum's order. */
export const TXN_KEY_ACTIONS: readonly TxnKeyAction[] = [
  "new",
  "saveDraft",
  "post",
  "edit",
  "cancelDoc",
  "open",
  "close",
  "print",
  "find",
  "history",
  "previous",
  "next",
  "duplicateLine",
  "changeRate",
];

/** What each action is called on the F1 sheet (Qt `caption()`). */
export const TXN_KEY_CAPTION: Record<TxnKeyAction, string> = {
  new: "New / Clear",
  saveDraft: "Save Draft",
  post: "Save & Post",
  edit: "Edit",
  cancelDoc: "Cancel",
  open: "List / Open",
  close: "Close",
  print: "Print",
  find: "Find",
  history: "History",
  previous: "Previous document",
  next: "Next document",
  duplicateLine: "Copy this line",
  changeRate: "Change this item's rate",
};

/** The key as shown to the user — the one that works in a browser. */
export const TXN_KEY_TEXT: Record<TxnKeyAction, string> = {
  new: "Alt+N",
  saveDraft: "Ctrl+S",
  post: "Ctrl+Enter",
  edit: "F2",
  cancelDoc: "Alt+X",
  open: "Ctrl+O",
  close: "Esc",
  print: "Ctrl+P",
  find: "Ctrl+F",
  history: "Ctrl+H",
  previous: "Alt+PgUp",
  next: "Alt+PgDn",
  duplicateLine: "Ctrl+D",
  changeRate: "Ctrl+R",
};

/** The Qt chords a desktop browser keeps for itself (documentation; still matched). */
export const BROWSER_RESERVED: readonly string[] = ["Ctrl+N", "Ctrl+PgUp", "Ctrl+PgDn"];

/** Line actions are listed under "Lines" on the F1 sheet, the rest under "Document". */
export function isLineAction(action: TxnKeyAction): boolean {
  return action === "duplicateLine" || action === "changeRate";
}

/** The fields of a keyboard event this module reads — a DOM event or React's. */
export type KeyLike = {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey?: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

function letter(event: KeyLike, wanted: string): boolean {
  // `code` too: Alt+letter is a dead key on some layouts, where `key` arrives
  // as the composed character rather than the letter.
  return event.key.toLowerCase() === wanted || event.code === `Key${wanted.toUpperCase()}`;
}

/**
 * The action a keystroke means, or null. Ctrl and ⌘ are the same modifier
 * (a Mac keyboard), and Shift is never part of a chord here — a Shift+Ctrl+S
 * is not a save.
 */
export function txnKeyOf(event: KeyLike): TxnKeyAction | null {
  const ctrl = event.ctrlKey || Boolean(event.metaKey);
  const alt = event.altKey;
  if (event.shiftKey) {
    return null;
  }
  if (ctrl && alt) {
    // AltGr on European layouts reports as Ctrl+Alt: it types characters.
    return null;
  }
  if (ctrl) {
    if (event.key === "Enter") return "post";
    if (event.key === "PageUp") return "previous";
    if (event.key === "PageDown") return "next";
    if (letter(event, "n")) return "new";
    if (letter(event, "s")) return "saveDraft";
    if (letter(event, "o")) return "open";
    if (letter(event, "p")) return "print";
    if (letter(event, "f")) return "find";
    if (letter(event, "h")) return "history";
    if (letter(event, "d")) return "duplicateLine";
    if (letter(event, "r")) return "changeRate";
    return null;
  }
  if (alt) {
    if (event.key === "PageUp") return "previous";
    if (event.key === "PageDown") return "next";
    if (letter(event, "n")) return "new";
    if (letter(event, "x")) return "cancelDoc";
    return null;
  }
  if (event.key === "F2") return "edit";
  if (event.key === "Escape") return "close";
  return null;
}

/** F1 — the key sheet. Bare F1 only. */
export function isHelpKey(event: KeyLike): boolean {
  return (
    event.key === "F1" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
  );
}

/** A button's caption with its key — "Save Draft · Ctrl+S" (Qt `bind()`). */
export function withKey(label: string, action: TxnKeyAction): string {
  return `${label} · ${TXN_KEY_TEXT[action]}`;
}

/** One row of the F1 sheet: what it does, and the key. */
export type TxnKeyRow = { label: string; keyText: string };

/**
 * The sheet's two sections from the actions a screen binds (each with the
 * button's own label where it has one — "Split batch" for Ctrl+D) and the
 * screen's own grid keys.
 */
export function keySheetRows(
  bound: ReadonlyArray<TxnKeyAction | { action: TxnKeyAction; label: string }>,
  lineKeys: readonly TxnKeyRow[] = [],
): { document: TxnKeyRow[]; lines: TxnKeyRow[] } {
  const document: TxnKeyRow[] = [];
  const lines: TxnKeyRow[] = [];
  for (const entry of bound) {
    const action = typeof entry === "string" ? entry : entry.action;
    // A line action is listed by the button's own label, a document action
    // by the shared caption (Qt `remember()`).
    const label =
      typeof entry === "string"
        ? TXN_KEY_CAPTION[action]
        : isLineAction(action)
          ? entry.label
          : TXN_KEY_CAPTION[action];
    (isLineAction(action) ? lines : document).push({ label, keyText: TXN_KEY_TEXT[action] });
  }
  return { document, lines: [...lines, ...lineKeys] };
}
