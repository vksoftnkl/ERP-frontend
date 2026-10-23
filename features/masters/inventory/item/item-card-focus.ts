import type {
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicModalField,
} from "@/components/design-system/ui/dynamic-modal-form";
import {
  focusFieldControl,
  getFocusableFieldTargets,
} from "@/components/design-system/ui/dynamic-modal-form.utils";
import { FIELD_CONTAINER_SELECTOR } from "@/components/design-system/ui/dynamic-modal-form.constants";

/**
 * The Item card's cursor rules (Qt 54b0eed, test_item_popup_focus /
 * test_item_enter_nav). The shared modal already opens on the first field
 * (Item Name) and walks Enter in reading order; what it does not do is move on
 * after a dropdown PICK — the choice closes the list and the caret stays put.
 */

function fieldContainer(fieldName: string): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.querySelector<HTMLElement>(
    `${FIELD_CONTAINER_SELECTOR}[data-erp-modal-field-name="${CSS.escape(fieldName)}"]`,
  );
}

/** Focus the field after `fieldName` in the form's own Enter order. */
export function focusNextItemFormField(fieldName: string): void {
  const form = fieldContainer(fieldName)?.closest("form");
  if (!form) {
    return;
  }
  const targets = getFocusableFieldTargets(form);
  const index = targets.findIndex((target) => target.fieldName === fieldName);
  const next = index >= 0 ? targets[index + 1] : undefined;
  if (next) {
    focusFieldControl(next.control);
  }
}

/** Put the caret in a field and select its text, for typing over (Copy from Item). */
export function focusAndSelectItemFormField(fieldName: string): void {
  const control = fieldContainer(fieldName)?.querySelector<HTMLInputElement>("input, textarea");
  if (!control) {
    return;
  }
  control.focus();
  control.select();
}

/**
 * Every searchable single-pick dropdown moves the cursor on once a value is
 * picked (a clear stays put). The field's own handler still runs first and its
 * result is passed back untouched; the move waits a frame, for the list to close.
 */
export function withAdvanceFocusAfterPick(fields: ERPDynamicModalField[]): ERPDynamicModalField[] {
  return fields.map((field) => {
    if ((field.type ?? "text") !== "select" || !field.searchable || field.multiple) {
      return field;
    }
    const onValueChange: ERPDynamicFieldValueChangeHandler = (payload) => {
      const result = field.onValueChange?.(payload);
      if (payload.value.trim() && typeof window !== "undefined") {
        window.requestAnimationFrame(() => focusNextItemFormField(field.name));
      }
      return result;
    };
    return { ...field, onValueChange };
  });
}
