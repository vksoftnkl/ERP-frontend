import { NextRequest, NextResponse } from "next/server";
import {
  isGoogleTranslateConfigured,
  suggestTamilWordsWithGoogle,
} from "@/lib/config/google-translate";
import { suggestTamilWords } from "@/lib/utils/tamil-transliteration";

type TamilSuggestionProvider = "google" | "local";

type SuggestionPayload = {
  configured: boolean;
  provider: TamilSuggestionProvider;
  suggestions: string[];
};

const MAX_SUGGESTION_COUNT = 4;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const WORD_PATTERN = /^[A-Za-z]{2,32}$/;
const suggestionCache = new Map<
  string,
  {
    expiresAt: number;
    payload: SuggestionPayload;
  }
>();

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mergeSuggestions(
  primarySuggestions: string[],
  fallbackSuggestions: string[],
): string[] {
  const mergedSuggestions: string[] = [];
  const seenSuggestions = new Set<string>();

  for (const suggestion of [...primarySuggestions, ...fallbackSuggestions]) {
    const normalizedSuggestion = suggestion.trim();
    if (!normalizedSuggestion || seenSuggestions.has(normalizedSuggestion)) {
      continue;
    }
    mergedSuggestions.push(normalizedSuggestion);
    seenSuggestions.add(normalizedSuggestion);
    if (mergedSuggestions.length >= MAX_SUGGESTION_COUNT) {
      break;
    }
  }

  return mergedSuggestions;
}

function readCachedPayload(word: string): SuggestionPayload | null {
  const cachedEntry = suggestionCache.get(word);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    suggestionCache.delete(word);
    return null;
  }

  return cachedEntry.payload;
}

function cachePayload(word: string, payload: SuggestionPayload) {
  suggestionCache.set(word, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const normalizedWord = query.toLowerCase();
  const configured = isGoogleTranslateConfigured();

  if (!WORD_PATTERN.test(query)) {
    return NextResponse.json<SuggestionPayload>({
      configured,
      provider: "local",
      suggestions: [],
    });
  }

  const cachedPayload = readCachedPayload(normalizedWord);
  if (cachedPayload) {
    return NextResponse.json(cachedPayload);
  }

  const localSuggestions = suggestTamilWords(query, {
    limit: MAX_SUGGESTION_COUNT,
  });
  let googleSuggestions: string[] = [];
  let provider: TamilSuggestionProvider = "local";

  if (configured) {
    try {
      googleSuggestions = await suggestTamilWordsWithGoogle(query);
      if (googleSuggestions.length > 0) {
        provider = "google";
      }
    } catch (error) {
      console.error("Google Tamil suggestion failed:", error);
    }
  }

  const payload: SuggestionPayload = {
    configured,
    provider,
    suggestions: mergeSuggestions(googleSuggestions, localSuggestions),
  };

  cachePayload(normalizedWord, payload);

  return NextResponse.json(payload);
}
