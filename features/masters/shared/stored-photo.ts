// Helpers to surface a master record's stored photo (base64 column + optional
// *_photo_url column) in the dynamic modal form's file field on edit/view.
const IMAGE_BASE64_SIGNATURES: ReadonlyArray<readonly [string, string]> = [
  ["/9j/", "image/jpeg"],
  ["iVBOR", "image/png"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"],
  ["PHN2Z", "image/svg+xml"],
  ["PD94bW", "image/svg+xml"],
];
export function toStoredImageDataUrl(photoBase64: string): string {
  const normalized = photoBase64.trim();
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("data:")) {
    return normalized;
  }
  const signature = IMAGE_BASE64_SIGNATURES.find(([prefix]) =>
    normalized.startsWith(prefix),
  );
  // Browsers content-sniff image/* data URLs, so a generic fallback still renders.
  return `data:${signature?.[1] ?? "image/png"};base64,${normalized}`;
}
export function resolveStoredPhotoPreview(
  photoBase64: string,
  photoUrl: string,
): string {
  const dataUrl = toStoredImageDataUrl(photoBase64);
  if (dataUrl) {
    return dataUrl;
  }
  const trimmedUrl = photoUrl.trim();
  if (
    /^(https?:)?\/\//i.test(trimmedUrl) ||
    trimmedUrl.startsWith("/") ||
    trimmedUrl.startsWith("data:")
  ) {
    return trimmedUrl;
  }
  return "";
}
export function resolveStoredPhotoName(
  photoUrl: string,
  hasStoredPhoto: boolean,
): string {
  const trimmed = photoUrl.trim();
  if (trimmed && !trimmed.startsWith("data:")) {
    const withoutQuery = trimmed.split(/[?#]/)[0] ?? "";
    const segments = withoutQuery.split(/[\\/]/).filter(Boolean);
    const basename = segments[segments.length - 1] ?? "";
    if (basename) {
      return basename;
    }
  }
  return hasStoredPhoto ? "Uploaded image" : "";
}
