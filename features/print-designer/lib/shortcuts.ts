/**
 * The keyboard map, as data.
 *
 * One list so the help sheet cannot drift from what the handler actually does —
 * a shortcut sheet that lies is worse than none.
 */

export type ShortcutEntry = {
  keys: string;
  action: string;
  group: "Editing" | "Selection" | "View" | "File";
};

export const SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: "Ctrl+Z", action: "Undo", group: "Editing" },
  { keys: "Ctrl+Shift+Z / Ctrl+Y", action: "Redo", group: "Editing" },
  { keys: "Delete", action: "Delete the selection", group: "Editing" },
  { keys: "Ctrl+C / Ctrl+X / Ctrl+V", action: "Copy, cut, paste", group: "Editing" },
  { keys: "Ctrl+D", action: "Duplicate", group: "Editing" },
  { keys: "Arrows", action: "Nudge 0.5mm (one cell in GRID mode)", group: "Editing" },
  { keys: "Shift+Arrows", action: "Nudge 5mm", group: "Editing" },
  { keys: "Ctrl+A", action: "Select every element in the band", group: "Selection" },
  { keys: "Click / Ctrl+Click", action: "Select / add to selection", group: "Selection" },
  { keys: "Drag on empty space", action: "Marquee select", group: "Selection" },
  { keys: "Escape", action: "Clear the selection or cancel placing", group: "Selection" },
  { keys: "Ctrl+Wheel", action: "Zoom", group: "View" },
  { keys: "Ctrl+G", action: "Toggle the grid", group: "View" },
  { keys: "Ctrl+;", action: "Toggle snapping", group: "View" },
  { keys: "Ctrl+E", action: "Toggle expressions and sample values", group: "View" },
  { keys: "Ctrl+S", action: "Save", group: "File" },
  { keys: "Ctrl+P", action: "Preview as PDF", group: "File" },
  { keys: "?", action: "This sheet", group: "View" },
];

/** Nudge distances in millimetres. */
export const NUDGE_MM = 0.5;
export const NUDGE_COARSE_MM = 5;

/**
 * Whether a keystroke belongs to the field the user is typing in.
 *
 * Without this, Delete inside the value textarea would delete the element the
 * user was editing — the single most destructive way to get shortcut handling
 * wrong.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}
