/**
 * Marks a surface nested inside the entry dialog — the copy-rights picker,
 * the row context menu — so the dialog's own Escape leaves it alone. The
 * dialog looks for this attribute in the DOM at event time; see the Escape
 * handler in `user-entry-dialog.tsx` for why a state read is not enough.
 */
export const NESTED_SURFACE_ATTR = "data-erp-nested-surface";
