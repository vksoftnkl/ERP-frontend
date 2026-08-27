/**
 * The rewrite every free-text field performs on what is typed into it, and the
 * setting that chooses it.
 *
 * `system.font_capitalization` (SYSTEM / Display, TEXT, default `TITLE`, may be
 * overridden all the way down to USER) carries the four modes the legacy Qt
 * screens exposed as a font capitalization filter. Here they are applied to the
 * VALUE rather than to the glyphs, so what is stored is what is shown:
 *
 *  - `TITLE` — the first letter of every word upper, the rest lower.
 *  - `UPPER` / `LOWER` — force one case.
 *  - `MIXED` — exactly as typed; the transform never runs at all.
 *
 * Tamil is deliberately exempt. Its letters are caseless, so a case fold is at
 * best a no-op, and a word carrying a left-joining vowel sign (ெ, ே, ை — typed
 * after its consonant but drawn before it) has no "first letter" in the visual
 * sense a title-case pass assumes. Any word holding a Tamil character is left
 * exactly as typed.
 */

export const NAME_CAPITALIZATION_SETTING_KEY = "system.font_capitalization";

export type CapitalizationMode = "TITLE" | "UPPER" | "LOWER" | "MIXED";

/** Matches `app_setting_def.asd_default_value` for the key above. */
export const DEFAULT_CAPITALIZATION_MODE: CapitalizationMode = "TITLE";

const MODES = new Set<CapitalizationMode>(["TITLE", "UPPER", "LOWER", "MIXED"]);

/** Any character in the Tamil block, including the combining vowel signs. */
const TAMIL_PATTERN = /[\u0B80-\u0BFF]/;

/** Letters, digits and the marks that live inside a word rather than end it. */
const WORD_CHARACTER = /[\p{L}\p{N}'’]/u;

/**
 * The stored text as a mode. The value is raw TEXT from the settings resolver,
 * so anything unrecognised — a blank, a value written before the allowed list
 * existed — falls back to the catalog default rather than silently disabling
 * the rewrite.
 */
export function parseCapitalizationMode(text: string | null | undefined): CapitalizationMode {
  const normalized = (text ?? "").trim().toUpperCase();
  return MODES.has(normalized as CapitalizationMode)
    ? (normalized as CapitalizationMode)
    : DEFAULT_CAPITALIZATION_MODE;
}

/**
 * Case-maps one character, but only when the mapping is length-preserving.
 *
 * `ß`.toUpperCase() is `SS`: two characters where one was typed. Growing the
 * value under the caret would move the caret away from where the user is
 * typing, so those characters are left alone (see `applyCapitalization`, which
 * refuses a whole transform that changes length for the same reason).
 */
function mapCase(character: string, upper: boolean): string {
  const mapped = upper ? character.toUpperCase() : character.toLowerCase();
  return mapped.length === character.length ? mapped : character;
}

function toTitleCase(token: string): string {
  let result = "";
  let atWordStart = true;
  for (const character of token) {
    if (WORD_CHARACTER.test(character)) {
      result += mapCase(character, atWordStart);
      atWordStart = false;
    } else {
      result += character;
      atWordStart = true;
    }
  }
  return result;
}

function transformWord(word: string, mode: CapitalizationMode): string {
  // Caseless script: leave the word whole. Checked per word, so an English
  // name beside a Tamil one is still rewritten.
  if (TAMIL_PATTERN.test(word)) {
    return word;
  }
  if (mode === "UPPER") {
    return [...word].map((character) => mapCase(character, true)).join("");
  }
  if (mode === "LOWER") {
    return [...word].map((character) => mapCase(character, false)).join("");
  }
  return toTitleCase(word);
}

/** What the field should hold, given what was typed into it and the mode in force. */
export function applyCapitalization(value: string, mode: CapitalizationMode): string {
  if (mode === "MIXED" || !value) {
    return value;
  }
  // Split on whitespace and keep the separators, so the exemption above can be
  // decided word by word without the join losing the spacing as typed.
  return value
    .split(/(\s+)/)
    .map((token) => (token.trim() ? transformWord(token, mode) : token))
    .join("");
}
