/**
 * The document a save writes: the stored one with every key the screen does NOT
 * render carried through untouched (value and JSON type), and the keys it DOES
 * render answered by the freshly built document.
 *
 * `built` is filtered to the rendered keys on purpose. The form's values are seeded
 * from the stored document, so they also hold the unrendered keys as text
 * (`item_incl_tax: true` becomes "true"); building those back would overwrite the
 * stored boolean with a string.
 */
export function mergeTemplateDocument(
  stored: Record<string, unknown> | null,
  built: Record<string, unknown>,
  renderedKeys: ReadonlySet<string>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stored ?? {})) {
    if (!renderedKeys.has(key)) {
      merged[key] = value;
    }
  }
  for (const [key, value] of Object.entries(built)) {
    if (renderedKeys.has(key)) {
      merged[key] = value;
    }
  }
  return merged;
}
