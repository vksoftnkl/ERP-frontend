type RomanTokenType = "vowel" | "consonant";

type RomanToken = {
  key: string;
  type: RomanTokenType;
};

type TamilVowelOption = {
  dependent: string;
  independent: string;
  weight: number;
};

type TamilConsonantOption = {
  letter: string;
  weight: number;
};

type CandidateState = {
  score: number;
  text: string;
};

type SuggestTamilWordsOptions = {
  limit?: number;
};

const PULLI = "்";
const DEFAULT_LIMIT = 4;
const MAX_BEAM_WIDTH = 14;
const MAX_TOKEN_LENGTH = 32;

const VOWEL_OPTIONS: Record<string, TamilVowelOption[]> = {
  a: [{ independent: "அ", dependent: "", weight: 0 }],
  aa: [{ independent: "ஆ", dependent: "ா", weight: 0 }],
  i: [{ independent: "இ", dependent: "ி", weight: 0 }],
  ii: [{ independent: "ஈ", dependent: "ீ", weight: 0 }],
  u: [{ independent: "உ", dependent: "ு", weight: 0 }],
  uu: [{ independent: "ஊ", dependent: "ூ", weight: 0 }],
  e: [
    { independent: "எ", dependent: "ெ", weight: 0 },
    { independent: "ஏ", dependent: "ே", weight: 0.9 },
  ],
  ee: [
    { independent: "ஈ", dependent: "ீ", weight: 0 },
    { independent: "ஏ", dependent: "ே", weight: 0.75 },
  ],
  ai: [{ independent: "ஐ", dependent: "ை", weight: 0 }],
  o: [
    { independent: "ஒ", dependent: "ொ", weight: 0 },
    { independent: "ஓ", dependent: "ோ", weight: 0.8 },
  ],
  oo: [
    { independent: "ஊ", dependent: "ூ", weight: 0 },
    { independent: "ஓ", dependent: "ோ", weight: 0.9 },
  ],
  oe: [{ independent: "ஓ", dependent: "ோ", weight: 0 }],
  ae: [{ independent: "ஏ", dependent: "ே", weight: 0 }],
  au: [{ independent: "ஔ", dependent: "ௌ", weight: 0 }],
};

const CONSONANT_OPTIONS: Record<string, TamilConsonantOption[]> = {
  k: [{ letter: "க", weight: 0 }],
  g: [{ letter: "க", weight: 0.1 }],
  ng: [{ letter: "ங", weight: 0 }],
  c: [{ letter: "ச", weight: 0 }],
  ch: [{ letter: "ச", weight: 0 }],
  s: [
    { letter: "ச", weight: 0 },
    { letter: "ஸ", weight: 0.9 },
  ],
  j: [
    { letter: "ஜ", weight: 0 },
    { letter: "ச", weight: 1.1 },
  ],
  z: [
    { letter: "ழ", weight: 0 },
    { letter: "ஜ", weight: 1.4 },
  ],
  nj: [{ letter: "ஞ", weight: 0 }],
  ny: [{ letter: "ஞ", weight: 0.2 }],
  t: [
    { letter: "த", weight: 0 },
    { letter: "ட", weight: 0.85 },
  ],
  th: [
    { letter: "த", weight: 0 },
    { letter: "ட", weight: 0.8 },
  ],
  d: [
    { letter: "ட", weight: 0 },
    { letter: "த", weight: 0.95 },
  ],
  dh: [
    { letter: "ட", weight: 0 },
    { letter: "த", weight: 0.75 },
  ],
  n: [
    { letter: "ந", weight: 0 },
    { letter: "ண", weight: 0.95 },
    { letter: "ன", weight: 1.1 },
  ],
  p: [{ letter: "ப", weight: 0 }],
  b: [{ letter: "ப", weight: 0.1 }],
  f: [
    { letter: "ஃப", weight: 0 },
    { letter: "ப", weight: 0.95 },
  ],
  m: [{ letter: "ம", weight: 0 }],
  y: [{ letter: "ய", weight: 0 }],
  r: [
    { letter: "ர", weight: 0 },
    { letter: "ற", weight: 0.95 },
  ],
  rr: [
    { letter: "ற", weight: 0 },
    { letter: "ர", weight: 0.95 },
  ],
  l: [
    { letter: "ல", weight: 0 },
    { letter: "ள", weight: 0.95 },
    { letter: "ழ", weight: 1.1 },
  ],
  zh: [
    { letter: "ழ", weight: 0 },
    { letter: "ள", weight: 1.1 },
  ],
  v: [{ letter: "வ", weight: 0 }],
  w: [{ letter: "வ", weight: 0.1 }],
  h: [{ letter: "ஹ", weight: 0 }],
  sh: [
    { letter: "ஷ", weight: 0 },
    { letter: "ச", weight: 1.2 },
  ],
  ph: [{ letter: "ப", weight: 0.2 }],
  bh: [{ letter: "ப", weight: 0.25 }],
  kh: [{ letter: "க", weight: 0.2 }],
  gh: [{ letter: "க", weight: 0.25 }],
};

const MULTI_CHAR_TOKENS = [
  "ng",
  "nj",
  "ny",
  "zh",
  "th",
  "dh",
  "ch",
  "sh",
  "ph",
  "bh",
  "kh",
  "gh",
  "rr",
  "aa",
  "ii",
  "uu",
  "ee",
  "oo",
  "ai",
  "au",
  "ae",
  "oe",
];

const COMMON_ROMANIZED_OVERRIDES: Record<string, string[]> = {
  akka: ["அக்கா"],
  amma: ["அம்மா"],
  anna: ["அண்ணா", "அன்னா"],
  appa: ["அப்பா"],
  ayya: ["அய்யா"],
  nandri: ["நன்றி"],
  tamil: ["தமிழ்"],
  thamizh: ["தமிழ்"],
  vanakkam: ["வணக்கம்"],
};

function trimAndNormalizeWord(value: string): string {
  return value.trim().toLowerCase();
}

function isRomanWord(value: string): boolean {
  return /^[a-z]{1,32}$/.test(value);
}

function tokenizeRomanWord(value: string): RomanToken[] {
  const tokens: RomanToken[] = [];
  let currentIndex = 0;

  while (currentIndex < value.length) {
    const remaining = value.slice(currentIndex);
    const matchedMultiCharToken = MULTI_CHAR_TOKENS.find((token) =>
      remaining.startsWith(token),
    );
    const tokenKey = matchedMultiCharToken ?? remaining[0];
    if (!tokenKey) {
      return [];
    }

    if (VOWEL_OPTIONS[tokenKey]) {
      tokens.push({
        key: tokenKey,
        type: "vowel",
      });
      currentIndex += tokenKey.length;
      continue;
    }

    if (CONSONANT_OPTIONS[tokenKey]) {
      tokens.push({
        key: tokenKey,
        type: "consonant",
      });
      currentIndex += tokenKey.length;
      continue;
    }

    return [];
  }

  return tokens;
}

function rankConsonantOptions(
  token: RomanToken,
  tokenIndex: number,
  tokens: RomanToken[],
  isWordEnd: boolean,
): TamilConsonantOption[] {
  const options = CONSONANT_OPTIONS[token.key] ?? [];
  const previousToken = tokenIndex > 0 ? tokens[tokenIndex - 1] : null;
  const nextToken = tokenIndex < tokens.length - 1 ? tokens[tokenIndex + 1] : null;

  return [...options]
    .map((option, optionIndex) => {
      let weight = option.weight + optionIndex * 0.08;

      if (token.key === "n") {
        if (tokenIndex === 0 && option.letter === "ந") {
          weight -= 0.7;
        }
        if (
          previousToken?.type === "vowel" &&
          tokenIndex > 0 &&
          (nextToken?.type === "consonant" || isWordEnd) &&
          option.letter === "ண"
        ) {
          weight -= 0.8;
        }
        if (isWordEnd && option.letter === "ன") {
          weight -= 0.55;
        }
      }

      if ((token.key === "t" || token.key === "th") && tokenIndex === 0 && option.letter === "த") {
        weight -= 0.45;
      }

      if ((token.key === "d" || token.key === "dh") && option.letter === "ட") {
        weight -= 0.3;
      }

      if (token.key === "l") {
        if (
          isWordEnd &&
          previousToken?.type === "vowel" &&
          previousToken.key === "i" &&
          option.letter === "ழ"
        ) {
          weight -= 0.8;
        }
        if (
          isWordEnd &&
          previousToken?.type === "vowel" &&
          previousToken.key === "a" &&
          option.letter === "ள"
        ) {
          weight -= 0.35;
        }
      }

      if (token.key === "rr" && option.letter === "ற") {
        weight -= 0.45;
      }

      if (token.key === "z" && option.letter === "ழ") {
        weight -= 0.6;
      }

      return {
        letter: option.letter,
        weight,
      };
    })
    .sort((left, right) => left.weight - right.weight);
}

function expandCandidates(
  states: CandidateState[],
  expansions: CandidateState[],
  limit: number,
): CandidateState[] {
  const nextStates = [...states, ...expansions];
  nextStates.sort((left, right) => {
    if (left.score === right.score) {
      return left.text.localeCompare(right.text);
    }
    return left.score - right.score;
  });

  const dedupedStates: CandidateState[] = [];
  const seenTexts = new Set<string>();

  for (const state of nextStates) {
    if (seenTexts.has(state.text)) {
      continue;
    }
    dedupedStates.push(state);
    seenTexts.add(state.text);
    if (dedupedStates.length >= limit) {
      break;
    }
  }

  return dedupedStates;
}

function buildTamilCandidates(tokens: RomanToken[], limit: number): CandidateState[] {
  let states: CandidateState[] = [{ text: "", score: 0 }];
  let tokenIndex = 0;

  while (tokenIndex < tokens.length) {
    const currentToken = tokens[tokenIndex];

    if (currentToken.type === "vowel") {
      const vowelOptions = VOWEL_OPTIONS[currentToken.key] ?? [];
      const nextStates = states.flatMap((state) =>
        vowelOptions.map((option) => ({
          text: `${state.text}${option.independent}`,
          score: state.score + option.weight,
        })),
      );
      states = expandCandidates([], nextStates, MAX_BEAM_WIDTH);
      tokenIndex += 1;
      continue;
    }

    let clusterEndIndex = tokenIndex;
    while (
      clusterEndIndex + 1 < tokens.length &&
      tokens[clusterEndIndex + 1]?.type === "consonant"
    ) {
      clusterEndIndex += 1;
    }

    let workingStates = states;

    for (let clusterIndex = tokenIndex; clusterIndex <= clusterEndIndex; clusterIndex += 1) {
      const clusterToken = tokens[clusterIndex];
      const nextToken = tokens[clusterIndex + 1] ?? null;
      const isLastClusterToken = clusterIndex === clusterEndIndex;
      const hasFollowingVowel = Boolean(isLastClusterToken && nextToken?.type === "vowel");
      const consonantOptions = rankConsonantOptions(
        clusterToken,
        clusterIndex,
        tokens,
        !hasFollowingVowel && clusterIndex === tokens.length - 1,
      );
      const expandedStates = workingStates.flatMap((state) => {
        if (!hasFollowingVowel) {
          return consonantOptions.map((option) => ({
            text: `${state.text}${option.letter}${PULLI}`,
            score: state.score + option.weight,
          }));
        }

        const vowelOptions = VOWEL_OPTIONS[nextToken?.key ?? ""] ?? [];
        return consonantOptions.flatMap((option) =>
          vowelOptions.map((vowelOption) => ({
            text: `${state.text}${option.letter}${vowelOption.dependent}`,
            score: state.score + option.weight + vowelOption.weight,
          })),
        );
      });

      workingStates = expandCandidates([], expandedStates, MAX_BEAM_WIDTH);
    }

    states = workingStates;

    if (tokens[clusterEndIndex + 1]?.type === "vowel") {
      tokenIndex = clusterEndIndex + 2;
    } else {
      tokenIndex = clusterEndIndex + 1;
    }
  }

  return states.slice(0, limit);
}

function buildTamilVariants(word: string, candidate: string): string[] {
  const variants = [candidate];

  if (word.endsWith("il") && candidate.endsWith("ில்")) {
    variants.push(candidate.replace(/ில்$/, "ிழ்"));
  }

  if (word.endsWith("al") && candidate.endsWith("ல்")) {
    variants.push(candidate.replace(/ல்$/, "ள்"));
  }

  return variants;
}

export function suggestTamilWords(
  rawWord: string,
  options: SuggestTamilWordsOptions = {},
): string[] {
  const normalizedWord = trimAndNormalizeWord(rawWord);
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 8));

  if (
    normalizedWord.length === 0 ||
    normalizedWord.length > MAX_TOKEN_LENGTH ||
    !isRomanWord(normalizedWord)
  ) {
    return [];
  }

  const seededSuggestions = COMMON_ROMANIZED_OVERRIDES[normalizedWord] ?? [];
  const tokens = tokenizeRomanWord(normalizedWord);
  if (tokens.length === 0) {
    return seededSuggestions.slice(0, limit);
  }

  const candidates = buildTamilCandidates(tokens, Math.max(limit * 3, MAX_BEAM_WIDTH));
  const suggestions: string[] = [];
  const seenSuggestions = new Set<string>();

  for (const suggestion of seededSuggestions) {
    if (seenSuggestions.has(suggestion)) {
      continue;
    }
    suggestions.push(suggestion);
    seenSuggestions.add(suggestion);
    if (suggestions.length >= limit) {
      return suggestions;
    }
  }

  for (const candidate of candidates) {
    const variants = buildTamilVariants(normalizedWord, candidate.text);
    for (const variant of variants) {
      if (seenSuggestions.has(variant)) {
        continue;
      }
      suggestions.push(variant);
      seenSuggestions.add(variant);
      if (suggestions.length >= limit) {
        return suggestions;
      }
    }
  }

  return suggestions;
}
