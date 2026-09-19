/**
 * dropdown id → the master screen behind it, for Alt+C (add) and Alt+A (amend).
 *
 * The operator adds a missing customer without leaving the field. The mapping
 * lives in a registry rather than in this module's imports so the dropdown never
 * has to know about a feature: each feature registers its own dropdowns as it
 * loads, and this file stays importable from anywhere.
 *
 * This is the one module here that may NOT be pulled into a barrel import — a
 * barrel would make every registration eager and drag every master screen into
 * the initial bundle.
 */
import type { ReactNode } from "react";

export type DropdownMasterMode = "create" | "edit";

export type DropdownMasterEntryProps = {
  mode: DropdownMasterMode;
  /** The record to amend. Null when creating. */
  selectionId: string | null;
  /** What was typed in the field, so a create can prefill the name it was given. */
  query: string;
  /**
   * The master saved. Reporting `{ id, text }` lets the field select the record
   * that was just created — without it the field can only refresh its list, and a
   * rename leaves stale text in the field with nothing to notice it by.
   */
  onSaved: (saved?: { id?: string; text?: string }) => void;
  onClose: () => void;
};

export type DropdownMasterRegistration = {
  /**
   * The master's OWN menu id. Alt+C is gated on its `canCreate` and Alt+A on its
   * `canEdit`, so a field can never become a back door into a master the user was
   * not granted.
   */
  menuId: number;
  render: (props: DropdownMasterEntryProps) => ReactNode;
};

const registry = new Map<string, DropdownMasterRegistration>();

/**
 * Registrations are not all made at import time.
 *
 * A dropdown id is resolved from the configured registry BY NAME, at runtime, so
 * a feature cannot name its dropdown at module scope — it registers from an
 * effect once the id has landed. A field that read the registry once while
 * rendering would therefore miss its own master by one render, which is
 * indistinguishable from not having one. Readers subscribe instead.
 */
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeDropdownMasters(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function key(dropdownId: string | number): string {
  return String(dropdownId ?? "").trim();
}

export function registerDropdownMaster(
  dropdownId: string | number,
  registration: DropdownMasterRegistration,
): void {
  const id = key(dropdownId);
  if (!id) {
    return;
  }
  if (registry.get(id) === registration) {
    return;
  }
  registry.set(id, registration);
  notify();
}

/** No registration is not an error: the shortcuts simply do nothing. */
export function getDropdownMaster(
  dropdownId: string | number,
): DropdownMasterRegistration | null {
  return registry.get(key(dropdownId)) ?? null;
}

export function unregisterDropdownMaster(dropdownId: string | number): void {
  if (registry.delete(key(dropdownId))) {
    notify();
  }
}

/** Test seam. */
export function clearDropdownMasters(): void {
  registry.clear();
  notify();
}
