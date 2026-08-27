"use client";

import { useEffect, useMemo } from "react";

import {
  NAME_CAPITALIZATION_SETTING_KEY,
  applyCapitalization,
  parseCapitalizationMode,
  type CapitalizationMode,
} from "@/lib/text-capitalization";
import { useAppSelector } from "@/store/hooks";
import { selectAppSettingText } from "@/store/slices/appSettingsSlice";

type EditableTarget = HTMLInputElement | HTMLTextAreaElement;

/**
 * `autocomplete` tokens that mark a credential field. These must never be
 * rewritten: usernames and passwords are compared case-sensitively, and a
 * "reveal password" toggle turns the password box into `type="text"` (see the
 * login form), which would otherwise look like an ordinary text field to us.
 */
const CREDENTIAL_AUTOCOMPLETE = /username|password|one-time-code|webauthn/;

/**
 * Fields the user searches or filters with. Rewriting those only changes what
 * they see while typing a query, so leave them alone. `type="search"` and
 * `role="searchbox"` are checked separately; this catches the plain text boxes
 * that are search boxes only by their label.
 */
const SEARCH_HINT = /search|filter/;

const EMAIL_HINT = /e-?mail/;

/** `inputMode` values that promise something other than free text. */
const NON_TEXT_INPUT_MODES = new Set(["numeric", "decimal", "tel", "email", "url"]);

/**
 * Everything the field says about itself, lowercased into one haystack so the
 * hints above can be matched with a single test.
 */
function describeField(target: EditableTarget): string {
  return [
    target.name,
    target.id,
    target.placeholder,
    target.getAttribute("aria-label") ?? "",
    target.autocomplete ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function isCapitalizationTarget(target: EventTarget | null): target is EditableTarget {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    return false;
  }

  if (target.disabled || target.readOnly) {
    return false;
  }

  // Opt-outs: the standard HTML attribute on the field itself, or a marker on
  // any ancestor so a whole panel can be exempted in one place.
  const autoCapitalize = (target.getAttribute("autocapitalize") ?? "").toLowerCase();
  if (autoCapitalize === "off" || autoCapitalize === "none") {
    return false;
  }
  if (target.closest('[data-uppercase="off"]')) {
    return false;
  }

  if (target.getAttribute("role") === "searchbox") {
    return false;
  }

  // `input.type` normalises a missing or unknown type to "text", so this single
  // check also drops password, email, number, date, colour, checkbox and search
  // inputs. Textareas have no meaningful type and are handled above it.
  if (target instanceof HTMLInputElement && target.type.toLowerCase() !== "text") {
    return false;
  }

  if (NON_TEXT_INPUT_MODES.has((target.inputMode ?? "").toLowerCase())) {
    return false;
  }

  const description = describeField(target);
  if (
    CREDENTIAL_AUTOCOMPLETE.test(description) ||
    SEARCH_HINT.test(description) ||
    EMAIL_HINT.test(description)
  ) {
    return false;
  }

  return true;
}

/**
 * Writes through the prototype setter rather than `target.value = …`. React
 * installs its own `value` property on the node to track changes; assigning
 * normally would update that tracker and React would then decide nothing
 * changed and swallow the `onChange`.
 */
function setNativeValue(target: EditableTarget, nextValue: string) {
  const prototype =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(target, nextValue);
}

function rewriteField(eventTarget: EventTarget | null, mode: CapitalizationMode, notify: boolean) {
  if (!isCapitalizationTarget(eventTarget)) {
    return;
  }

  const currentValue = eventTarget.value;
  const nextValue = applyCapitalization(currentValue, mode);

  // Bail on transforms that change the length: the caret offsets restored
  // below would no longer line up with the text on screen.
  if (nextValue === currentValue || nextValue.length !== currentValue.length) {
    return;
  }

  const { selectionStart, selectionEnd } = eventTarget;
  setNativeValue(eventTarget, nextValue);
  if (selectionStart !== null && selectionEnd !== null) {
    eventTarget.setSelectionRange(selectionStart, selectionEnd);
  }

  if (notify) {
    eventTarget.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/**
 * Applies `system.font_capitalization` to every free-text field in the
 * application as the user types, without each screen having to opt in — there
 * is no shared `Input` component here, roughly 76 files render raw `<input>`
 * elements.
 *
 * The mode is read from the settings the RUNNING session resolved to
 * (`SessionAppSettings` loads them), so it answers to all four layers of the
 * scope bar — company, branch, counter, user — and a save at the session's own
 * scope takes effect without a sign-in, as the catalog promises for this key.
 *
 * It listens in the capture phase, so the value is already rewritten by the
 * time the event reaches React's own handler further down the tree; React sees
 * one ordinary change carrying the transformed value.
 *
 * Exempt a field with `autocapitalize="off"`, or a whole region with
 * `data-uppercase="off"` on any ancestor.
 */
export default function GlobalTextCapitalization() {
  const settingText = useAppSelector((state) =>
    selectAppSettingText(state, NAME_CAPITALIZATION_SETTING_KEY),
  );
  const mode = useMemo(() => parseCapitalizationMode(settingText), [settingText]);

  useEffect(() => {
    // MIXED is "leave it exactly as typed", so nothing is listened for at all
    // rather than listened for and then discarded.
    if (mode === "MIXED") {
      return;
    }

    // Mid-composition text (IME, transliteration) is provisional and must be
    // left untouched until the user commits it.
    let isComposing = false;

    const handleInput = (event: Event) => {
      if (isComposing) {
        return;
      }
      rewriteField(event.target, mode, false);
    };

    const handleCompositionStart = () => {
      isComposing = true;
    };

    const handleCompositionEnd = (event: Event) => {
      isComposing = false;
      // Browsers disagree on whether `input` fires before or after
      // `compositionend`, so transform here and tell React about it. When the
      // browser does fire `input` afterwards, the value is already rewritten
      // and `handleInput` is a no-op.
      rewriteField(event.target, mode, true);
    };

    window.addEventListener("input", handleInput, true);
    window.addEventListener("compositionstart", handleCompositionStart, true);
    window.addEventListener("compositionend", handleCompositionEnd, true);

    return () => {
      window.removeEventListener("input", handleInput, true);
      window.removeEventListener("compositionstart", handleCompositionStart, true);
      window.removeEventListener("compositionend", handleCompositionEnd, true);
    };
  }, [mode]);

  return null;
}
