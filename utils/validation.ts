// utils/validateGstin.ts

const VALID_STATE_CODES = new Set([
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
  "31", "32", "33", "34", "35", "36", "37", "96", "97", "99",
]);

/**
 * Validates a 15-character GSTIN string.
 *
 * Structure: [State Code (2)] [PAN (10)] [Entity No (1)] [Z (1)] [Checksum (1)]
 * Example:   24               ABCDE1234F  1               Z       5
 *
 * @param gstin - Raw GSTIN string (will be trimmed + uppercased internally)
 * @returns An error message string if invalid, or `null` if valid.
 *
 * @example
 * validateGstin("24ABCDE1234F1Z5") // null (valid)
 * validateGstin("24ABCDE1234")     // "GSTIN must be exactly 15 characters."
 * validateGstin("99ABCDE1234F1Z5") // "Invalid state code "99"..."
 */
export function validateGstin(gstin: string): string | null {
  const normalized = gstin.trim().toUpperCase();

  if (!normalized) {
    return "GSTIN is required.";
  }

  if (normalized.length !== 15) {
    return "GSTIN must be exactly 15 characters.";
  }

  const stateCode = normalized.slice(0, 2);
  if (!VALID_STATE_CODES.has(stateCode)) {
    return `Invalid state code "${stateCode}". GSTIN must start with a valid 2-digit state code (01–37).`;
  }

  const panSegment = normalized.slice(2, 12);
  const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  if (!panPattern.test(panSegment)) {
    return `Invalid PAN segment "${panSegment}" in GSTIN. Characters 3–12 must follow the PAN format (e.g. ABCDE1234F).`;
  }

  const entityChar = normalized[12];
  if (!/[1-9A-Z]/.test(entityChar)) {
    return `Invalid entity number "${entityChar}" at position 13. Must be 1–9 or A–Z.`;
  }

  if (normalized[13] !== "Z") {
    return `Invalid character "${normalized[13]}" at position 14. Must be "Z".`;
  }

  if (!/[0-9A-Z]/.test(normalized[14])) {
    return `Invalid checksum character "${normalized[14]}" at position 15. Must be a digit or uppercase letter.`;
  }

  return null; // valid
}

export function validateOptionalGstin(gstin: string): string | null {
  if (!gstin.trim()) {
    return null;
  }

  return validateGstin(gstin);
}
