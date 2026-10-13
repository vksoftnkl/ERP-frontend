/**
 * Whether a save may happen on this order — the Qt `saveAllowed` (user,
 * 2026-10-12: no drafts for a user without the right to make one). Pure; the
 * rule itself is `documentRights`, this only says which half of it applies.
 *
 * A NEW order under `sales.auto_post` is confirmed by the save itself — it goes
 * out `soStatus: 'CONFIRMED'`, the server's one-call save-and-confirm (notes
 * 106) — so it needs Create OR Post. Otherwise the save writes a DRAFT: Create
 * for a new one, Edit for a saved one.
 */
import type { DocumentRights } from "@/lib/permissions/document-rights";

export type SaveVerbInput = {
  /** A saved order (it has a docId) — not a new entry. Copy-as-new is new again. */
  saved: boolean;
  /** `sales.auto_post`. */
  autoPost: boolean;
  rights: Pick<DocumentRights, "mayStartNew" | "maySaveDraft">;
};

export type SaveVerbState = {
  ok: boolean;
  /** What is missing, for the disabled buttons' tooltip and the save's warning; "" when ok. */
  reason: string;
};

export function saveAllowed({ saved, autoPost, rights }: SaveVerbInput): SaveVerbState {
  const confirmsNow = !saved && autoPost;
  const ok = confirmsNow ? rights.mayStartNew : rights.maySaveDraft(saved);
  if (ok) {
    return { ok, reason: "" };
  }
  return {
    ok,
    reason: confirmsNow
      ? "You need the Create or Post right on Sales Order"
      : saved
        ? "You need the Edit right to change a saved draft"
        : "You may not save a draft (no Create right)",
  };
}
