import { getAuthUserId } from "@/lib/auth/session";

/**
 * Unsaved popup entries, kept so a form closed without saving — a stray click on
 * the backdrop, Escape, a jump to another screen, a reload or a crashed tab —
 * opens again on what the user had typed.
 *
 * Only the fields the user changed are kept, against the values the form opened
 * on, so a restore lays them over fresh defaults (or a freshly read record)
 * instead of freezing the whole form as it stood. The names of the chosen
 * dropdown options ride along, because a lazily loaded dropdown has no options
 * to name its value with until it is opened.
 *
 * `localStorage`, so a draft outlives the tab; scoped to the signed-in user, so
 * a shared counter machine never hands one user's entry to the next; dropped
 * after {@link FORM_DRAFT_MAX_AGE_MS}.
 */

const STORAGE_PREFIX = "erp_form_draft:v1:";
export const FORM_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Option names by field, then by option value. */
export type FormDraftLabels = Record<string, Record<string, string>>;

export type FormDraft = {
  values: Record<string, string>;
  labels: FormDraftLabels;
  savedAt: number;
};

type FormDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function getStorage(): FormDraftStorage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function storageKeyFor(draftKey: string, userId: string | null): string {
  return `${STORAGE_PREFIX}${userId ?? "anonymous"}:${draftKey}`;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((entry) => typeof entry === "string")
  );
}

export function parseFormDraft(raw: string | null, now: number): FormDraft | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<FormDraft>;
    if (!isStringRecord(parsed.values) || typeof parsed.savedAt !== "number") {
      return null;
    }
    if (now - parsed.savedAt > FORM_DRAFT_MAX_AGE_MS) {
      return null;
    }
    const labels: FormDraftLabels = {};
    if (parsed.labels && typeof parsed.labels === "object") {
      for (const [fieldName, byValue] of Object.entries(parsed.labels)) {
        if (isStringRecord(byValue)) {
          labels[fieldName] = byValue;
        }
      }
    }
    return { values: parsed.values, labels, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

/**
 * The fields of `values` that differ from `baseline` — what a draft keeps. A
 * field missing on one side counts as blank there. Null when nothing differs.
 */
export function collectChangedFormValues(
  baseline: Record<string, string>,
  values: Record<string, string>,
): Record<string, string> | null {
  const changed: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (value !== (baseline[name] ?? "")) {
      changed[name] = value;
    }
  }
  for (const name of Object.keys(baseline)) {
    if (!(name in values) && baseline[name] !== "") {
      changed[name] = "";
    }
  }
  return Object.keys(changed).length > 0 ? changed : null;
}

/**
 * `values` without the fields a draft must never hold — a typed password
 * (localStorage is plain text) or a picked file (only its name would survive,
 * so the field would claim an upload it no longer has). Null when nothing is
 * left.
 */
export function omitFormDraftFields(
  values: Record<string, string> | null,
  excluded: ReadonlySet<string>,
): Record<string, string> | null {
  if (!values) {
    return null;
  }
  const kept = Object.fromEntries(
    Object.entries(values).filter(([name]) => !excluded.has(name)),
  );
  return Object.keys(kept).length > 0 ? kept : null;
}

/** Drops drafts past their age, for every user (best effort). */
function pruneExpiredFormDrafts(storage: FormDraftStorage, now: number): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(STORAGE_PREFIX) && !parseFormDraft(storage.getItem(key), now)) {
      storage.removeItem(key);
    }
  }
}

let prunedThisSession = false;

export function readFormDraft(draftKey: string): FormDraft | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  try {
    const now = Date.now();
    if (!prunedThisSession) {
      prunedThisSession = true;
      pruneExpiredFormDrafts(storage, now);
    }
    return parseFormDraft(storage.getItem(storageKeyFor(draftKey, getAuthUserId())), now);
  } catch {
    return null;
  }
}

export function writeFormDraft(
  draftKey: string,
  draft: Pick<FormDraft, "values" | "labels">,
): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    const stored: FormDraft = { ...draft, savedAt: Date.now() };
    storage.setItem(storageKeyFor(draftKey, getAuthUserId()), JSON.stringify(stored));
  } catch {
    // Storage full or blocked: the form still works, it just keeps no draft.
  }
}

export function clearFormDraft(draftKey: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(storageKeyFor(draftKey, getAuthUserId()));
  } catch {
    // Nothing else to do when storage is blocked.
  }
}
