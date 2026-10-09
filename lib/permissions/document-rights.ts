import type { MenuPermissions } from "./menu-permissions";

/**
 * Document rights — the ONE rule every draft/post screen follows (Qt
 * `NexDialog`'s document rights, 2026-10-08):
 *
 *   Create  save a DRAFT            Post    post — a new document too
 *   Edit    change a saved draft    Delete  drop / cancel a draft
 *   Cancel  reverse a POSTED one
 *
 * So Post without Create is "no drafts": New, then Save & Post, and Save Draft
 * stays off — the single shop where the owner does every job. New needs Create
 * OR Post; a supervisor with Post but not Edit may post a saved draft they
 * cannot change.
 *
 * The posting flags are optional on the wire. Absent means the menu said
 * nothing, read as allowed and left to the server — an ungoverned screen gets
 * `FULL_MENU_PERMISSIONS`, which holds every one of them.
 *
 * Status is the screen's own business: each answer here is a RIGHT, and the
 * caller ANDs it with what the document's status allows.
 */
export type DocumentRightsInput = Pick<
  MenuPermissions,
  "canCreate" | "canEdit" | "canDelete" | "canPost" | "canCancel" | "canAmend"
>;

export type DocumentRights = {
  /** New — Create or Post. */
  mayStartNew: boolean;
  /** Save as a draft: Create for a new document, Edit for a saved one. */
  maySaveDraft: (saved: boolean) => boolean;
  /** Post (Save & Post on a new document, Post on a saved draft). */
  mayPost: boolean;
  /** Edit a saved draft. */
  mayEdit: boolean;
  /** Drop a saved draft. */
  mayDeleteDraft: boolean;
  /** Cancel: a POSTED document needs Cancel, a draft needs Delete. */
  mayCancelDocument: (posted: boolean) => boolean;
  /** Amend a posted document in place. */
  mayAmend: boolean;
};

export function documentRights(permissions: DocumentRightsInput): DocumentRights {
  const canPost = permissions.canPost !== false;
  const canCancel = permissions.canCancel !== false;
  return {
    mayStartNew: permissions.canCreate || canPost,
    maySaveDraft: (saved) => (saved ? permissions.canEdit : permissions.canCreate),
    mayPost: canPost,
    mayEdit: permissions.canEdit,
    mayDeleteDraft: permissions.canDelete,
    mayCancelDocument: (posted) => (posted ? canCancel : permissions.canDelete),
    mayAmend: permissions.canAmend !== false,
  };
}
