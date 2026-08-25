"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { suggestTamilWords } from "@/lib/utils/tamil-transliteration";
import styles from "./global-tamil-input-assist.module.css";
import { layoutRect, layoutViewportSize } from "@/lib/ui-scale";

type SupportedInputTarget = HTMLInputElement | HTMLTextAreaElement;
type SuggestionPlacement = "top" | "bottom";
type SuggestionProvider = "google" | "local";

type SuggestionContext = {
  left: number;
  placement: SuggestionPlacement;
  provider: SuggestionProvider;
  replaceEnd: number;
  replaceStart: number;
  suggestions: string[];
  top: number;
  width: number;
  word: string;
};

type DismissedSuggestion = {
  target: SupportedInputTarget | null;
  word: string;
};

type RemoteSuggestionPayload = {
  configured?: boolean;
  provider?: SuggestionProvider;
  suggestions?: string[];
};

const VIEWPORT_PADDING = 12;
const POPUP_MIN_WIDTH = 240;
const POPUP_MAX_WIDTH = 420;
const POPUP_HEIGHT_GUESS = 196;

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
    if (mergedSuggestions.length >= 4) {
      break;
    }
  }

  return mergedSuggestions;
}

function isSupportedInputTarget(target: EventTarget | null): target is SupportedInputTarget {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    return false;
  }

  if (target.disabled || target.readOnly || target.dataset.tamilInput === "off") {
    return false;
  }

  if (target instanceof HTMLTextAreaElement) {
    return true;
  }

  const inputType = (target.type || "text").toLowerCase();
  if (target.inputMode === "numeric" || target.inputMode === "decimal") {
    return false;
  }

  return inputType === "text" || inputType === "search";
}

function extractRomanWordContext(target: SupportedInputTarget) {
  if (target.selectionStart === null || target.selectionEnd === null) {
    return null;
  }

  if (target.selectionStart !== target.selectionEnd) {
    return null;
  }

  const cursorIndex = target.selectionStart;
  const value = target.value;
  let replaceStart = cursorIndex;
  let replaceEnd = cursorIndex;

  while (replaceStart > 0 && /[A-Za-z]/.test(value[replaceStart - 1] ?? "")) {
    replaceStart -= 1;
  }

  while (replaceEnd < value.length && /[A-Za-z]/.test(value[replaceEnd] ?? "")) {
    replaceEnd += 1;
  }

  if (replaceStart === replaceEnd) {
    return null;
  }

  const word = value.slice(replaceStart, replaceEnd);
  if (!/^[A-Za-z]{2,32}$/.test(word)) {
    return null;
  }

  return {
    replaceEnd,
    replaceStart,
    word,
  };
}

function computePopupPosition(target: SupportedInputTarget) {
  // Layout pixels: the result is written back as `left`/`top`/`width` on a
  // fixed panel inside the globally scaled document. See lib/ui-scale.ts.
  const rect = layoutRect(target);
  const viewport = layoutViewportSize();
  const width = Math.min(
    POPUP_MAX_WIDTH,
    Math.max(POPUP_MIN_WIDTH, Math.round(rect.width)),
  );
  const availableBelow = viewport.height - rect.bottom;
  const placement: SuggestionPlacement =
    availableBelow < POPUP_HEIGHT_GUESS && rect.top > POPUP_HEIGHT_GUESS
      ? "top"
      : "bottom";
  const maxLeft = viewport.width - width - VIEWPORT_PADDING;
  const left = Math.min(
    Math.max(rect.left, VIEWPORT_PADDING),
    Math.max(VIEWPORT_PADDING, maxLeft),
  );
  const top = placement === "top" ? rect.top : rect.bottom;

  return {
    left,
    placement,
    top,
    width,
  };
}

function setNativeValue(target: SupportedInputTarget, nextValue: string, caretIndex: number) {
  const prototype =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  descriptor?.set?.call(target, nextValue);
  target.dispatchEvent(new Event("input", { bubbles: true }));

  window.requestAnimationFrame(() => {
    target.focus();
    target.setSelectionRange(caretIndex, caretIndex);
  });
}

export default function GlobalTamilInputAssist() {
  const [isMounted, setIsMounted] = useState(false);
  const [suggestionContext, setSuggestionContext] = useState<SuggestionContext | null>(null);
  const activeTargetRef = useRef<SupportedInputTarget | null>(null);
  const dismissedSuggestionRef = useRef<DismissedSuggestion>({
    target: null,
    word: "",
  });
  const isComposingRef = useRef(false);
  const suggestionContextRef = useRef<SuggestionContext | null>(null);
  const googleFetchAbortRef = useRef<AbortController | null>(null);
  const googleFetchTimerRef = useRef<number | null>(null);
  const googleSuggestionCacheRef = useRef(
    new Map<string, { provider: SuggestionProvider; suggestions: string[] }>(),
  );
  const googleRequestIdRef = useRef(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    suggestionContextRef.current = suggestionContext;
  }, [suggestionContext]);

  useEffect(() => {
    if (!isMounted) {
      return undefined;
    }

    let frameId = 0;

    const clearSuggestions = () => {
      suggestionContextRef.current = null;
      setSuggestionContext(null);
    };

    const refreshSuggestions = (target: SupportedInputTarget | null) => {
      if (!target || !document.contains(target) || document.activeElement !== target) {
        activeTargetRef.current = null;
        clearSuggestions();
        return;
      }

      const wordContext = extractRomanWordContext(target);
      if (!wordContext) {
        dismissedSuggestionRef.current = {
          target: null,
          word: "",
        };
        clearSuggestions();
        return;
      }

      if (
        dismissedSuggestionRef.current.target === target &&
        dismissedSuggestionRef.current.word === wordContext.word.toLowerCase()
      ) {
        clearSuggestions();
        return;
      }

      const localSuggestions = suggestTamilWords(wordContext.word, { limit: 4 });
      if (localSuggestions.length === 0) {
        clearSuggestions();
        return;
      }

      activeTargetRef.current = target;
      dismissedSuggestionRef.current = {
        target: null,
        word: "",
      };

      const nextContext: SuggestionContext = {
        ...computePopupPosition(target),
        ...wordContext,
        provider: "local",
        suggestions: localSuggestions,
      };

      suggestionContextRef.current = nextContext;
      setSuggestionContext(nextContext);

      const normalizedWord = wordContext.word.toLowerCase();
      const cachedSuggestions =
        googleSuggestionCacheRef.current.get(normalizedWord);
      if (cachedSuggestions) {
        const mergedSuggestions = mergeSuggestions(
          cachedSuggestions.suggestions,
          localSuggestions,
        );
        const mergedContext: SuggestionContext = {
          ...nextContext,
          provider: cachedSuggestions.provider,
          suggestions: mergedSuggestions,
        };
        suggestionContextRef.current = mergedContext;
        setSuggestionContext(mergedContext);
        return;
      }

      if (googleFetchTimerRef.current !== null) {
        window.clearTimeout(googleFetchTimerRef.current);
      }
      googleFetchAbortRef.current?.abort();
      const requestId = googleRequestIdRef.current + 1;
      googleRequestIdRef.current = requestId;

      googleFetchTimerRef.current = window.setTimeout(async () => {
        const controller = new AbortController();
        googleFetchAbortRef.current = controller;

        try {
          const response = await fetch(
            `/api/tamil/suggest?q=${encodeURIComponent(wordContext.word)}`,
            {
              cache: "no-store",
              signal: controller.signal,
            },
          );
          const payload =
            (await response.json().catch(() => null)) as RemoteSuggestionPayload | null;
          const remoteSuggestions = Array.isArray(payload?.suggestions)
            ? payload.suggestions.filter(
                (entry): entry is string =>
                  typeof entry === "string" && entry.trim().length > 0,
              )
            : [];
          const provider =
            payload?.provider === "google" ? "google" : "local";
          const mergedSuggestions = mergeSuggestions(
            remoteSuggestions,
            localSuggestions,
          );

          googleSuggestionCacheRef.current.set(normalizedWord, {
            provider,
            suggestions: mergedSuggestions,
          });

          if (
            googleRequestIdRef.current !== requestId ||
            activeTargetRef.current !== target
          ) {
            return;
          }

          const activeWordContext = extractRomanWordContext(target);
          if (
            !activeWordContext ||
            activeWordContext.word.toLowerCase() !== normalizedWord
          ) {
            return;
          }

          const resolvedContext: SuggestionContext = {
            ...computePopupPosition(target),
            ...activeWordContext,
            provider,
            suggestions: mergedSuggestions,
          };

          suggestionContextRef.current = resolvedContext;
          setSuggestionContext(resolvedContext);
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            return;
          }
          console.error("Tamil suggestion request failed:", error);
        }
      }, 160);
    };

    const scheduleRefresh = (target: SupportedInputTarget | null) => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        refreshSuggestions(target);
      });
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = isSupportedInputTarget(event.target) ? event.target : null;
      activeTargetRef.current = target;
      scheduleRefresh(target);
    };

    const handleFocusOut = () => {
      window.setTimeout(() => {
        const activeElement = document.activeElement;
        if (isSupportedInputTarget(activeElement)) {
          activeTargetRef.current = activeElement;
          scheduleRefresh(activeElement);
          return;
        }
        activeTargetRef.current = null;
        clearSuggestions();
      }, 0);
    };

    const handleInput = (event: Event) => {
      if (isComposingRef.current) {
        return;
      }

      const target = isSupportedInputTarget(event.target)
        ? event.target
        : activeTargetRef.current;
      scheduleRefresh(target);
    };

    const handleSelectionChange = () => {
      if (isComposingRef.current) {
        return;
      }
      scheduleRefresh(activeTargetRef.current);
    };

    const handleScrollOrResize = () => {
      scheduleRefresh(activeTargetRef.current);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      const currentContext = suggestionContextRef.current;
      if (!currentContext) {
        return;
      }

      dismissedSuggestionRef.current = {
        target: activeTargetRef.current,
        word: currentContext.word.toLowerCase(),
      };
      clearSuggestions();
    };

    const handleCompositionStart = () => {
      isComposingRef.current = true;
      clearSuggestions();
    };

    const handleCompositionEnd = (event: CompositionEvent) => {
      isComposingRef.current = false;
      const target = isSupportedInputTarget(event.target)
        ? event.target
        : activeTargetRef.current;
      scheduleRefresh(target);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("compositionstart", handleCompositionStart, true);
    document.addEventListener("compositionend", handleCompositionEnd, true);
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      if (googleFetchTimerRef.current !== null) {
        window.clearTimeout(googleFetchTimerRef.current);
      }
      googleFetchAbortRef.current?.abort();
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("compositionstart", handleCompositionStart, true);
      document.removeEventListener("compositionend", handleCompositionEnd, true);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isMounted]);

  if (!isMounted || !suggestionContext) {
    return null;
  }

  const handleSuggestionSelect = (suggestion: string) => {
    const target = activeTargetRef.current;
    if (!target) {
      suggestionContextRef.current = null;
      setSuggestionContext(null);
      return;
    }

    const nextValue = `${target.value.slice(0, suggestionContext.replaceStart)}${suggestion}${target.value.slice(
      suggestionContext.replaceEnd,
    )}`;
    const nextCaretIndex = suggestionContext.replaceStart + suggestion.length;
    dismissedSuggestionRef.current = {
      target: null,
      word: "",
    };
    suggestionContextRef.current = null;
    setNativeValue(target, nextValue, nextCaretIndex);
    setSuggestionContext(null);
  };

  return createPortal(
    <div
      className={`${styles.panel} ${
        suggestionContext.placement === "top" ? styles.panelTop : styles.panelBottom
      }`}
      style={{
        left: suggestionContext.left,
        top: suggestionContext.top,
        width: suggestionContext.width,
      }}
    >
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          <span className={styles.badge}>
            {suggestionContext.provider === "google"
              ? "Google Tamil"
              : "Tamil Assist"}
          </span>
          <span className={styles.caption}>
            Suggestions for <span className={styles.word}>{suggestionContext.word}</span>
          </span>
        </div>
      </div>
      <div className={styles.list}>
        {suggestionContext.suggestions.map((suggestion, suggestionIndex) => (
          <button
            key={`${suggestion}-${suggestionIndex}`}
            type="button"
            lang="ta"
            className={`${styles.item} ${suggestionIndex === 0 ? styles.itemPrimary : ""}`}
            onMouseDown={(event) => {
              event.preventDefault();
              handleSuggestionSelect(suggestion);
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>
      <div className={styles.hint}>Click a suggestion to replace the current romanized word.</div>
    </div>,
    document.body,
  );
}
