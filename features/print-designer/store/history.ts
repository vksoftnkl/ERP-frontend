/**
 * Undo/redo for the template definition.
 *
 * Patches, not snapshots. A 200-element invoice definition is ~150KB of JSON,
 * so a 50-deep snapshot stack is 7MB of duplicated state per open designer;
 * immer's inverse patches for the same 50 operations are a few kilobytes. That
 * is the plan's F4 mitigation, and it is why every definition edit in the slice
 * goes through `commitDefinitionEdit` rather than mutating the draft directly.
 *
 * Coalescing exists for one specific gesture: holding an arrow key nudges an
 * element every ~30ms, and without it forty keypresses cost forty undos to get
 * back where you started.
 */

import {
  applyPatches,
  current,
  enablePatches,
  isDraft,
  produceWithPatches,
  type Patch,
} from "immer";
import type { TemplateDefinition } from "@/features/print-designer/types/template-definition";

// Patch recording is opt-in in immer 10 and must be enabled before the first
// produceWithPatches call anywhere in the process.
enablePatches();

export const MAX_HISTORY = 50;

/** Same-kind edits closer together than this fold into one history entry. */
export const COALESCE_WINDOW_MS = 400;

export type HistoryEntry = {
  undo: Patch[];
  redo: Patch[];
  label: string;
  /**
   * Edits sharing a key inside the coalesce window merge. Undefined means the
   * edit always stands alone.
   */
  coalesceKey?: string;
  at: number;
};

export type HistoryState = {
  past: HistoryEntry[];
  future: HistoryEntry[];
};

export const emptyHistory = (): HistoryState => ({ past: [], future: [] });

/** Anything the slice needs for an edit; keeps this module free of the slice. */
export type EditableState = {
  definition: TemplateDefinition;
  history: HistoryState;
  dirty: boolean;
};

/**
 * A plain snapshot of the definition.
 *
 * Inside a reducer this is an immer draft and `current` unwraps it; called
 * directly from a test it is already plain, and `current` would throw on a
 * non-draft. Both callers are legitimate, so handle both.
 */
const snapshot = (definition: TemplateDefinition): TemplateDefinition =>
  isDraft(definition) ? (current(definition) as TemplateDefinition) : definition;

export type EditOptions = {
  coalesceKey?: string;
  /** Clock injection point; the slice passes Date.now(). */
  now?: number;
};

/**
 * Apply `recipe` to the definition, recording the inverse for undo.
 *
 * Returns true when something actually changed. A recipe that produces no
 * patches — dragging an element zero millimetres, setting a property to the
 * value it already had — must not push a history entry, or Ctrl+Z becomes a key
 * the user has to press an unpredictable number of times.
 */
export function commitDefinitionEdit(
  state: EditableState,
  label: string,
  recipe: (definition: TemplateDefinition) => void,
  options: EditOptions = {},
): boolean {
  const base = snapshot(state.definition);
  const [next, patches, inverse] = produceWithPatches(base, recipe);

  if (!patches.length) {
    return false;
  }

  state.definition = next;
  state.dirty = true;

  const at = options.now ?? Date.now();
  const previous = state.history.past[state.history.past.length - 1];
  const canCoalesce =
    options.coalesceKey !== undefined &&
    previous !== undefined &&
    previous.coalesceKey === options.coalesceKey &&
    at - previous.at <= COALESCE_WINDOW_MS;

  if (canCoalesce && previous) {
    previous.redo = [...previous.redo, ...patches];
    // Inverse patches undo in reverse order, so the newer inverse goes first.
    previous.undo = [...inverse, ...previous.undo];
    previous.at = at;
  } else {
    state.history.past.push({
      undo: inverse,
      redo: patches,
      label,
      coalesceKey: options.coalesceKey,
      at,
    });
    if (state.history.past.length > MAX_HISTORY) {
      state.history.past.shift();
    }
  }

  // Any new edit abandons the redo branch — the standard linear-history rule.
  state.history.future = [];
  return true;
}

export function undoDefinition(state: EditableState): boolean {
  const entry = state.history.past.pop();
  if (!entry) {
    return false;
  }
  state.definition = applyPatches(snapshot(state.definition), entry.undo);
  state.history.future.push(entry);
  state.dirty = true;
  return true;
}

export function redoDefinition(state: EditableState): boolean {
  const entry = state.history.future.pop();
  if (!entry) {
    return false;
  }
  state.definition = applyPatches(snapshot(state.definition), entry.redo);
  state.history.past.push(entry);
  state.dirty = true;
  return true;
}

export const canUndo = (history: HistoryState): boolean => history.past.length > 0;
export const canRedo = (history: HistoryState): boolean => history.future.length > 0;

export const undoLabel = (history: HistoryState): string | null =>
  history.past[history.past.length - 1]?.label ?? null;

export const redoLabel = (history: HistoryState): string | null =>
  history.future[history.future.length - 1]?.label ?? null;
