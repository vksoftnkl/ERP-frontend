/**
 * Loose text matching for the pickers that filter their options in the browser
 * (a select whose options were loaded up front, so the server never sees the
 * typed text). The server applies the same rule to every list and lazy
 * dropdown through `fixed.fn_search_norm` (ERP server,
 * src/common/search/loose-search.ts): lower-case, every run of white space
 * and punctuation removed, and every typed word has to be found.
 *
 * So "chillipowder", "chilli powder" and "POWDER chilli" all match
 * "Chilli Powder"; "sm-sauce" matches "SM SAUCE 00012".
 */
export function normalizeSearchText(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** The typed text as the distinct normalised words it has to find; empty when there is nothing to search for. */
export function searchTokens(query: string | null | undefined): string[] {
  const tokens = new Set<string>();
  for (const word of (query ?? "").trim().split(/\s+/)) {
    const token = normalizeSearchText(word);
    if (token) {
      tokens.add(token);
    }
  }
  return [...tokens];
}

/**
 * True when every token (from `searchTokens`) is found in at least one of the
 * candidate texts. No tokens — nothing typed — matches everything.
 */
export function matchesSearchTokens(
  tokens: readonly string[],
  ...candidates: Array<string | null | undefined>
): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const haystacks = candidates.map((candidate) => normalizeSearchText(candidate));
  return tokens.every((token) => haystacks.some((haystack) => haystack.includes(token)));
}

/** One-call form: does `query` loosely match any of the `candidates`? */
export function looselyMatches(
  query: string | null | undefined,
  ...candidates: Array<string | null | undefined>
): boolean {
  return matchesSearchTokens(searchTokens(query), ...candidates);
}
