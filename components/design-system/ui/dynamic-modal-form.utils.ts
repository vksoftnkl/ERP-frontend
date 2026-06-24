import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  FIELD_CONTAINER_SELECTOR,
  PRIMARY_FIELD_CONTROL_SELECTOR,
} from "./dynamic-modal-form.constants";
import type {
  ERPDynamicFormSection,
  ERPDynamicModalField,
  ERPDynamicModalFormProps,
  ERPDynamicModalVariant,
  FieldNavigationDirection,
  FocusableFieldTarget,
  ModalAccentPalette,
} from "./dynamic-modal-form.types";
export function getSectionRowStartOffset(fields: ERPDynamicModalField[]): number | null {
  const rowStarts = fields
    .map((field) => field.gridRowStart)
    .filter(
      (gridRowStart): gridRowStart is number =>
        typeof gridRowStart === "number" &&
        Number.isFinite(gridRowStart) &&
        gridRowStart > 0,
    );
  if (rowStarts.length === 0) {
    return null;
  }
  return Math.min(...rowStarts);
}
export function buildFormSections(fields: ERPDynamicModalField[]): ERPDynamicFormSection[] {
  if (fields.length === 0) {
    return [];
  }
  const sections: ERPDynamicFormSection[] = [];
  let currentSection: ERPDynamicFormSection = { heading: null, fields: [] };
  for (const field of fields) {
    if ((field.type ?? "text") === "heading") {
      if (currentSection.heading !== null || currentSection.fields.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { heading: field, fields: [] };
      continue;
    }
    currentSection.fields.push(field);
  }
  if (currentSection.heading !== null || currentSection.fields.length > 0) {
    sections.push(currentSection);
  }
  return sections;
}
export function resolvePalette(accent: ERPDynamicModalVariant["accent"]): ModalAccentPalette {
  if (!accent) {
    return DEFAULT_ACCENT;
  }
  if (typeof accent === "string") {
    return ACCENT_PRESETS[accent] ?? DEFAULT_ACCENT;
  }
  return { ...DEFAULT_ACCENT, ...accent };
}
export function buildInitialValues(
  variant: ERPDynamicModalVariant,
  initialValuesByVariant: ERPDynamicModalFormProps["initialValuesByVariant"],
): Record<string, string> {
  const storedValues = initialValuesByVariant?.[variant.key] ?? {};
  return variant.fields.reduce<Record<string, string>>((state, field) => {
    state[field.name] = storedValues[field.name] ?? field.defaultValue ?? "";
    return state;
  }, {});
}
export function isEmptyValue(value: string): boolean {
  return value.trim().length === 0;
}
export function isFieldRequired(
  field: ERPDynamicModalField,
  values: Record<string, string>,
): boolean {
  if (field.required === false) {
    return false;
  }
  if (field.requiredWhen) {
    return Boolean(field.requiredWhen(values));
  }
  return Boolean(field.required);
}
export function toRegExp(pattern: string | RegExp): RegExp | null {
  if (pattern instanceof RegExp) {
    return pattern;
  }
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}
export function getSelectOptionLabel(field: ERPDynamicModalField, value: string | undefined): string {
  if (!value) {
    return "";
  }
  const matchedOption = field.options?.find((option) => option.value === value);
  return matchedOption?.label ?? value;
}
export function parseMultiSelectValue(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
export function formatMultiSelectValue(values: string[]): string {
  return values.join(",");
}
export function getFocusableFieldControl(container: HTMLElement): HTMLElement | null {
  const primaryControl = container.querySelector<HTMLElement>(PRIMARY_FIELD_CONTROL_SELECTOR);
  if (primaryControl) {
    return primaryControl;
  }
  return container.querySelector<HTMLElement>(
    [
      'input:not([type="hidden"]):not([disabled])',
      "textarea:not([disabled])",
      "select:not([disabled])",
      '[role="combobox"][tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
      "button:not([disabled])",
      '[contenteditable="true"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(", "),
  );
}
export function getFocusableFieldTargets(root: HTMLElement): FocusableFieldTarget[] {
  const fieldContainers = Array.from(
    root.querySelectorAll<HTMLElement>(FIELD_CONTAINER_SELECTOR),
  );
  return fieldContainers
    .map((container) => {
      const control = getFocusableFieldControl(container);
      if (!control || control.getClientRects().length === 0) {
        return null;
      }
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return null;
      }
      const fieldName = container.dataset.erpModalFieldName;
      if (!fieldName) {
        return null;
      }
      return {
        container,
        control,
        fieldName,
        rect,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    })
    .filter((target): target is FocusableFieldTarget => target !== null);
}
export function findNextFieldTarget(
  targets: FocusableFieldTarget[],
  currentTarget: FocusableFieldTarget,
  direction: FieldNavigationDirection,
): FocusableFieldTarget | null {
  const isHorizontal = direction === "left" || direction === "right";
  let bestTarget: FocusableFieldTarget | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of targets) {
    if (candidate.fieldName === currentTarget.fieldName) {
      continue;
    }
    const primaryDelta = isHorizontal
      ? candidate.centerX - currentTarget.centerX
      : candidate.centerY - currentTarget.centerY;
    const isInDirection =
      direction === "left" || direction === "up" ? primaryDelta < -6 : primaryDelta > 6;
    if (!isInDirection) {
      continue;
    }
    const overlap = isHorizontal
      ? Math.max(
          0,
          Math.min(currentTarget.rect.bottom, candidate.rect.bottom) -
            Math.max(currentTarget.rect.top, candidate.rect.top),
        )
      : Math.max(
          0,
          Math.min(currentTarget.rect.right, candidate.rect.right) -
            Math.max(currentTarget.rect.left, candidate.rect.left),
        );
    const crossDistance = isHorizontal
      ? Math.abs(candidate.centerY - currentTarget.centerY)
      : Math.abs(candidate.centerX - currentTarget.centerX);
    const score =
      (overlap > 0 ? 0 : 100000) + Math.abs(primaryDelta) * 100 + crossDistance;
    if (score < bestScore) {
      bestScore = score;
      bestTarget = candidate;
    }
  }
  return bestTarget;
}
export function getFirstFocusableFieldTarget(root: HTMLElement): FocusableFieldTarget | null {
  const targets = getFocusableFieldTargets(root);
  if (targets.length === 0) {
    return null;
  }
  return (
    [...targets].sort((left, right) => {
      const topDifference = left.rect.top - right.rect.top;
      if (Math.abs(topDifference) > 6) {
        return topDifference;
      }
      return left.rect.left - right.rect.left;
    })[0] ?? null
  );
}
export function focusFieldControl(control: HTMLElement) {
  control.focus();
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    try {
      const selectionIndex = control.value.length;
      control.setSelectionRange(selectionIndex, selectionIndex);
    } catch {
      // Some input types do not support text selection.
    }
  }
  control.scrollIntoView({ block: "nearest", inline: "nearest" });
}
export function validateFieldValue(
  field: ERPDynamicModalField,
  values: Record<string, string>,
  files: Record<string, File | null>,
): string | null {
  const rawValue = values[field.name] ?? "";
  const value = rawValue.trim();
  const fieldType = field.type ?? "text";
  const validation = field.validation;
  const required = isFieldRequired(field, values);
  if (fieldType === "heading" || fieldType === "subheading") {
    return null;
  }
  if (fieldType === "custom") {
    if (required && isEmptyValue(rawValue)) {
      return validation?.requiredMessage ?? `${field.label} is required.`;
    }
    if (validation?.custom) {
      const customError = validation.custom(rawValue, values, field);
      if (customError) {
        return customError;
      }
    }
    return null;
  }
  if (fieldType === "checkbox") {
    const isChecked = rawValue === "true";
    if (required && !isChecked) {
      return validation?.requiredMessage ?? `${field.label} is required.`;
    }
    return null;
  }
  if (fieldType === "file") {
    const selectedFile = files[field.name] ?? null;
    if (required && !selectedFile) {
      return validation?.requiredMessage ?? `${field.label} is required.`;
    }
    if (!selectedFile) {
      return null;
    }
    if (field.allowedMimeTypes?.length && !field.allowedMimeTypes.includes(selectedFile.type)) {
      return validation?.patternMessage ?? `${field.label} file type is not allowed.`;
    }
    if (field.maxFileSizeBytes !== undefined && selectedFile.size > field.maxFileSizeBytes) {
      const maxMB = (field.maxFileSizeBytes / (1024 * 1024)).toFixed(1);
      return validation?.maxMessage ?? `${field.label} must be smaller than ${maxMB} MB.`;
    }
    return null;
  }
  if (required && isEmptyValue(rawValue)) {
    return validation?.requiredMessage ?? `${field.label} is required.`;
  }
  if (isEmptyValue(rawValue)) {
    if (validation?.custom) {
      const customError = validation.custom(rawValue, values, field);
      if (customError) {
        return customError;
      }
    }
    return null;
  }
  if (validation?.minLength !== undefined && value.length < validation.minLength) {
    return (
      validation.minLengthMessage ??
      `${field.label} must be at least ${validation.minLength} characters.`
    );
  }
  if (validation?.maxLength !== undefined && value.length > validation.maxLength) {
    return (
      validation.maxLengthMessage ??
      `${field.label} must be at most ${validation.maxLength} characters.`
    );
  }
  if (validation?.pattern) {
    const regex = toRegExp(validation.pattern);
    if (regex && !regex.test(value)) {
      return validation.patternMessage ?? `${field.label} format is invalid.`;
    }
  }
  if (fieldType === "email" && !validation?.pattern) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return validation?.patternMessage ?? `${field.label} must be a valid email address.`;
    }
  }
  if (fieldType === "number") {
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
      return `${field.label} must be a valid number.`;
    }
    if (field.min !== undefined) {
      const minValue = Number(field.min);
      if (!Number.isNaN(minValue) && numericValue < minValue) {
        return validation?.minMessage ?? `${field.label} must be at least ${field.min}.`;
      }
    }
    if (field.max !== undefined) {
      const maxValue = Number(field.max);
      if (!Number.isNaN(maxValue) && numericValue > maxValue) {
        return validation?.maxMessage ?? `${field.label} must be at most ${field.max}.`;
      }
    }
  }
  if (fieldType === "date") {
    if (field.min !== undefined && value < String(field.min)) {
      return validation?.minMessage ?? `${field.label} cannot be before ${field.min}.`;
    }
    if (field.max !== undefined && value > String(field.max)) {
      return validation?.maxMessage ?? `${field.label} cannot be after ${field.max}.`;
    }
  }
  if (validation?.custom) {
    const customError = validation.custom(rawValue, values, field);
    if (customError) {
      return customError;
    }
  }
  return null;
}
export function resolveVisibleFields(
  variant: ERPDynamicModalVariant,
  values: Record<string, string>,
  sectionExpandedState?: Record<string, boolean>,
): ERPDynamicModalField[] {
  const baseVisibleFields = variant.fields.filter((field) => {
    if (!field.visibleWhen) {
      return true;
    }
    try {
      return field.visibleWhen(values);
    } catch {
      return true;
    }
  });
  if (!sectionExpandedState) {
    return baseVisibleFields;
  }
  const resolved: ERPDynamicModalField[] = [];
  let currentSectionName: string | null = null;
  for (const field of baseVisibleFields) {
    const fieldType = field.type ?? "text";
    if (fieldType === "heading") {
      currentSectionName = field.name;
      resolved.push(field);
      continue;
    }
    if (currentSectionName && sectionExpandedState[currentSectionName] === false) {
      continue;
    }
    resolved.push(field);
  }
  return resolved;
}
export function buildSectionExpandedState(
  fields: ERPDynamicModalField[],
  values?: Record<string, string>,
): Record<string, boolean> {
  const sectionState: Record<string, boolean> = {};
  for (const field of fields) {
    if ((field.type ?? "text") === "heading") {
      let defaultExpanded = field.defaultExpanded ?? true;
      if (values && field.defaultExpandedWhen) {
        try {
          defaultExpanded = field.defaultExpandedWhen(values);
        } catch {
          defaultExpanded = field.defaultExpanded ?? true;
        }
      }
      sectionState[field.name] = defaultExpanded;
    }
  }
  return sectionState;
}