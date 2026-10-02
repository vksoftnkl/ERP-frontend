/**
 * Tells a dynamic modal form's field predicates whether the form is editing a
 * saved record or creating a new one.
 *
 * `disabledWhen(values)` / `visibleWhen(values)` see only the form's values,
 * not the modal variant, so the mode travels AS a value: a never-shown field
 * named `__editing` that `mapFormValues` sets to "true" for the update / view
 * variants and `createInitialValues` leaves "false". Declaring it as a field
 * keeps the key through `buildInitialValues`, which drops anything not
 * declared (the modal's `openModal` would carry a bare key, a reset would not).
 */
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";

export const EDIT_MODE_FIELD_NAME = "__editing";

export const EDIT_MODE_FIELD: ERPDynamicModalField = {
  name: EDIT_MODE_FIELD_NAME,
  label: "",
  type: "text",
  visibleWhen: () => false,
};

export function isEditingValues(values: Record<string, string>): boolean {
  return values[EDIT_MODE_FIELD_NAME] === "true";
}

/** For `disabledWhen` on a field that is read-only once the record exists. */
export function whenEditing(values: Record<string, string>): boolean {
  return isEditingValues(values);
}

/** For `disabledWhen` on a field that waits for the record to exist first. */
export function whenCreating(values: Record<string, string>): boolean {
  return !isEditingValues(values);
}

export function withEditMode<TValues extends Record<string, string>>(
  values: TValues,
  editing: boolean,
): TValues & { [EDIT_MODE_FIELD_NAME]: "true" | "false" } {
  return { ...values, [EDIT_MODE_FIELD_NAME]: editing ? "true" : "false" };
}
