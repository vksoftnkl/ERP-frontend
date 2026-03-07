"use client";
import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cx } from "@/components/library/cx";
import styles from "./dynamic-modal-form.module.scss";
type FieldInputMode = InputHTMLAttributes<HTMLInputElement>["inputMode"];
type ModalAccentPalette = {
  accent: string;
  accentStrong: string;
  softFrom: string;
  softTo: string;
  iconBg: string;
  iconFg: string;
};
const ACCENT_PRESETS = {
  blue: {
    accent: "#2563eb",
    accentStrong: "#1d4ed8",
    softFrom: "#dbeafe",
    softTo: "#bfdbfe",
    iconBg: "#dbeafe",
    iconFg: "#1d4ed8",
  },
  emerald: {
    accent: "#059669",
    accentStrong: "#047857",
    softFrom: "#d1fae5",
    softTo: "#a7f3d0",
    iconBg: "#d1fae5",
    iconFg: "#047857",
  },
  amber: {
    accent: "#d97706",
    accentStrong: "#b45309",
    softFrom: "#fef3c7",
    softTo: "#fde68a",
    iconBg: "#fef3c7",
    iconFg: "#b45309",
  },
  rose: {
    accent: "#e11d48",
    accentStrong: "#be123c",
    softFrom: "#ffe4e6",
    softTo: "#fecdd3",
    iconBg: "#ffe4e6",
    iconFg: "#be123c",
  },
  indigo: {
    accent: "#4f46e5",
    accentStrong: "#4338ca",
    softFrom: "#e0e7ff",
    softTo: "#c7d2fe",
    iconBg: "#e0e7ff",
    iconFg: "#3730a3",
  },
} as const;
const DEFAULT_ACCENT = ACCENT_PRESETS.blue;
const SEARCH_SELECT_LIST_MAX_HEIGHT = 220;
const SEARCH_SELECT_LIST_OFFSET = 4;
export type ERPDynamicFieldType =
  | "heading"
  | "text"
  | "email"
  | "tel"
  | "number"
  | "checkbox"
  | "color"
  | "date"
  | "select"
  | "textarea"
  | "file"
  | "password"
  | "url";
export type ERPDynamicSelectOption = {
  label: string;
  value: string;
};
export type ERPDynamicSearchShortcutPayload = {
  fieldName: string;
  query: string;
  value: string;
  values: Record<string, string>;
};
export type ERPDynamicSearchShortcutHandler = (
  payload: ERPDynamicSearchShortcutPayload,
) => void | Promise<void>;
export type ERPDynamicFieldValueChangePayload = {
  field: ERPDynamicModalField;
  fieldName: string;
  value: string;
  values: Record<string, string>;
  previousValues: Record<string, string>;
};
export type ERPDynamicFieldValueChangeResult = {
  values?: Record<string, string>;
  errors?: Record<string, string | null | undefined>;
};
export type ERPDynamicFieldValueChangeHandler = (
  payload: ERPDynamicFieldValueChangePayload,
) =>
  | ERPDynamicFieldValueChangeResult
  | void
  | Promise<ERPDynamicFieldValueChangeResult | void>;
export type ERPDynamicFieldValidation = {
  requiredMessage?: string;
  minLength?: number;
  minLengthMessage?: string;
  maxLength?: number;
  maxLengthMessage?: string;
  minMessage?: string;
  maxMessage?: string;
  pattern?: string | RegExp;
  patternMessage?: string;
  custom?: (
    value: string,
    values: Record<string, string>,
    field: ERPDynamicModalField,
  ) => string | null | undefined;
};
export type ERPDynamicModalField = {
  name: string;
  label: string;
  type?: ERPDynamicFieldType;
  defaultExpanded?: boolean;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  multiple?: boolean;
  options?: ERPDynamicSelectOption[];
  colSpan?: 1 | 2;
  helperText?: string;
  controlStyle?: CSSProperties;
  defaultValue?: string;
  rows?: number;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  autoComplete?: string;
  inputMode?: FieldInputMode;
  accept?: string;
  maxFileSizeBytes?: number;
  allowedMimeTypes?: string[];
  validation?: ERPDynamicFieldValidation;
  visibleWhen?: (values: Record<string, string>) => boolean;
  // Places the field card in a specific modal grid column track.
  gridColumnStart?: number;
  // Places the field card in a specific modal grid row track.
  gridRowStart?: number;
  onSearchCreateShortcut?: ERPDynamicSearchShortcutHandler;
  onSearchEditShortcut?: ERPDynamicSearchShortcutHandler;
  onValueChange?: ERPDynamicFieldValueChangeHandler;
};
type AccentPreset = keyof typeof ACCENT_PRESETS;
export type ERPDynamicModalVariant = {
  key: string;
  cardTitle: string;
  cardDescription: string;
  cardButtonLabel: string;
  modalTitle: string;
  modalDescription?: string;
  submitLabel: string;
  icon?: ReactNode;
  accent?: AccentPreset | Partial<ModalAccentPalette>;
  fields: ERPDynamicModalField[];
};
export type ERPDynamicModalSubmitPayload = {
  variantKey: string;
  variant: ERPDynamicModalVariant;
  values: Record<string, string>;
  files: Record<string, File | null>;
};
export type ERPDynamicModalOpenOptions = {
  values?: Record<string, string>;
};
export type ERPDynamicModalController = {
  openModal: (variantKey: string, options?: ERPDynamicModalOpenOptions) => void;
  closeModal: () => void;
};
export type ERPDynamicModalFormProps = {
  title: string;
  description?: string;
  variants: ERPDynamicModalVariant[];
  onSubmit?: (payload: ERPDynamicModalSubmitPayload) => void | Promise<void>;
  onOpenChange?: (open: boolean, variantKey: string | null) => void;
  onCancel?: (variantKey: string) => void;
  initialValuesByVariant?: Record<string, Record<string, string>>;
  closeOnBackdrop?: boolean;
  closeOnSubmit?: boolean;
  resetOnSubmit?: boolean;
  validateOnChange?: boolean;
  onValidationError?: (
    errors: Record<string, string>,
    variantKey: string,
  ) => void;
  onControllerReady?: (controller: ERPDynamicModalController) => void;
  showDefaultCards?: boolean;
  hideSectionHeader?: boolean;
  submitError?: string | null;
  panelStyle?: CSSProperties;
  formGridColumns?: number;
  denseGrid?: boolean;
  stackLabels?: boolean;
  className?: string;
  cardGridClassName?: string;
};
function resolvePalette(
  accent: ERPDynamicModalVariant["accent"],
): ModalAccentPalette {
  if (!accent) {
    return DEFAULT_ACCENT;
  }
  if (typeof accent === "string") {
    return ACCENT_PRESETS[accent] ?? DEFAULT_ACCENT;
  }
  return {
    ...DEFAULT_ACCENT,
    ...accent,
  };
}
function buildInitialValues(
  variant: ERPDynamicModalVariant,
  initialValuesByVariant: ERPDynamicModalFormProps["initialValuesByVariant"],
): Record<string, string> {
  const storedValues = initialValuesByVariant?.[variant.key] ?? {};
  return variant.fields.reduce<Record<string, string>>((state, field) => {
    state[field.name] = storedValues[field.name] ?? field.defaultValue ?? "";
    return state;
  }, {});
}
function isEmptyValue(value: string): boolean {
  return value.trim().length === 0;
}
function toRegExp(pattern: string | RegExp): RegExp | null {
  if (pattern instanceof RegExp) {
    return pattern;
  }
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}
function getSelectOptionLabel(
  field: ERPDynamicModalField,
  value: string | undefined,
): string {
  if (!value) {
    return "";
  }
  const matchedOption = field.options?.find((option) => option.value === value);
  return matchedOption?.label ?? value;
}
function parseMultiSelectValue(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
function formatMultiSelectValue(values: string[]): string {
  return values.join(",");
}
function validateFieldValue(
  field: ERPDynamicModalField,
  values: Record<string, string>,
  files: Record<string, File | null>,
): string | null {
  const rawValue = values[field.name] ?? "";
  const value = rawValue.trim();
  const fieldType = field.type ?? "text";
  const validation = field.validation;
  if (fieldType === "heading") {
    return null;
  }
  if (fieldType === "checkbox") {
    const isChecked = rawValue === "true";
    if (field.required && !isChecked) {
      return validation?.requiredMessage ?? `${field.label} is required.`;
    }
    return null;
  }
  if (fieldType === "file") {
    const selectedFile = files[field.name] ?? null;
    if (field.required && !selectedFile) {
      return validation?.requiredMessage ?? `${field.label} is required.`;
    }
    if (!selectedFile) {
      return null;
    }
    if (
      field.allowedMimeTypes?.length &&
      !field.allowedMimeTypes.includes(selectedFile.type)
    ) {
      return (
        validation?.patternMessage ?? `${field.label} file type is not allowed.`
      );
    }
    if (
      field.maxFileSizeBytes !== undefined &&
      selectedFile.size > field.maxFileSizeBytes
    ) {
      const maxMB = (field.maxFileSizeBytes / (1024 * 1024)).toFixed(1);
      return (
        validation?.maxMessage ??
        `${field.label} must be smaller than ${maxMB} MB.`
      );
    }
    return null;
  }
  if (field.required && isEmptyValue(rawValue)) {
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
  if (
    validation?.minLength !== undefined &&
    value.length < validation.minLength
  ) {
    return (
      validation.minLengthMessage ??
      `${field.label} must be at least ${validation.minLength} characters.`
    );
  }
  if (
    validation?.maxLength !== undefined &&
    value.length > validation.maxLength
  ) {
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
      return (
        validation?.patternMessage ??
        `${field.label} must be a valid email address.`
      );
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
        return (
          validation?.minMessage ??
          `${field.label} must be at least ${field.min}.`
        );
      }
    }
    if (field.max !== undefined) {
      const maxValue = Number(field.max);
      if (!Number.isNaN(maxValue) && numericValue > maxValue) {
        return (
          validation?.maxMessage ??
          `${field.label} must be at most ${field.max}.`
        );
      }
    }
  }
  if (fieldType === "date") {
    if (field.min !== undefined && value < String(field.min)) {
      return (
        validation?.minMessage ??
        `${field.label} cannot be before ${field.min}.`
      );
    }
    if (field.max !== undefined && value > String(field.max)) {
      return (
        validation?.maxMessage ?? `${field.label} cannot be after ${field.max}.`
      );
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
function resolveVisibleFields(
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

    if (
      currentSectionName &&
      sectionExpandedState[currentSectionName] === false
    ) {
      continue;
    }

    resolved.push(field);
  }

  return resolved;
}

function buildSectionExpandedState(
  fields: ERPDynamicModalField[],
): Record<string, boolean> {
  const sectionState: Record<string, boolean> = {};
  for (const field of fields) {
    if ((field.type ?? "text") === "heading") {
      sectionState[field.name] = field.defaultExpanded ?? true;
    }
  }
  return sectionState;
}

function IconPlaceholder() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M4 6h16M4 12h16M4 18h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function ERPDynamicModalForm({
  title,
  description,
  variants,
  onSubmit,
  onOpenChange,
  onCancel,
  initialValuesByVariant,
  closeOnBackdrop = true,
  closeOnSubmit = true,
  resetOnSubmit = true,
  validateOnChange = true,
  onValidationError,
  onControllerReady,
  showDefaultCards = true,
  hideSectionHeader = false,
  submitError,
  panelStyle,
  formGridColumns,
  denseGrid = true,
  stackLabels = false,
  className,
  cardGridClassName,
}: ERPDynamicModalFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeVariantKey, setActiveVariantKey] = useState<string>(
    variants[0]?.key ?? "",
  );
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [fileData, setFileData] = useState<Record<string, File | null>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>(
    {},
  );
  const [openSearchField, setOpenSearchField] = useState<string | null>(null);
  const [searchActiveOptionIndex, setSearchActiveOptionIndex] = useState<
    Record<string, number>
  >({});
  const searchSelectRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [searchDropdownPlacement, setSearchDropdownPlacement] = useState<
    "down" | "up"
  >("down");
  const [searchDropdownMaxHeight, setSearchDropdownMaxHeight] = useState(
    SEARCH_SELECT_LIST_MAX_HEIGHT,
  );
  const [sectionExpandedByVariant, setSectionExpandedByVariant] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fieldValueChangeRequestIdsRef = useRef<Record<string, number>>({});
  const activeVariant = useMemo(
    () => variants.find((variant) => variant.key === activeVariantKey),
    [activeVariantKey, variants],
  );
  useEffect(() => {
    if (variants.length === 0) {
      setActiveVariantKey("");
      return;
    }
    if (!variants.some((variant) => variant.key === activeVariantKey)) {
      setActiveVariantKey(variants[0].key);
    }
  }, [activeVariantKey, variants]);
  const closeModal = useCallback(() => {
    setIsOpen(false);
    setIsSubmitting(false);
    setFieldErrors({});
    setFileData({});
    setSearchQueries({});
    setOpenSearchField(null);
    setSearchActiveOptionIndex({});
    setSearchDropdownPlacement("down");
    setSearchDropdownMaxHeight(SEARCH_SELECT_LIST_MAX_HEIGHT);
    fieldValueChangeRequestIdsRef.current = {};
    onOpenChange?.(false, activeVariant?.key ?? null);
  }, [activeVariant?.key, onOpenChange]);
  const openModal = useCallback(
    (variantKey: string, options?: ERPDynamicModalOpenOptions) => {
      const variant = variants.find((item) => item.key === variantKey);
      if (!variant) {
        return;
      }
      setActiveVariantKey(variantKey);
      setFormData({
        ...buildInitialValues(variant, initialValuesByVariant),
        ...(options?.values ?? {}),
      });
      setFileData({});
      setFieldErrors({});
      setSearchQueries({});
      setOpenSearchField(null);
      setSearchActiveOptionIndex({});
      setSearchDropdownPlacement("down");
      setSearchDropdownMaxHeight(SEARCH_SELECT_LIST_MAX_HEIGHT);
      fieldValueChangeRequestIdsRef.current = {};
      setSectionExpandedByVariant((current) => ({
        ...current,
        [variantKey]: buildSectionExpandedState(variant.fields),
      }));
      setIsOpen(true);
      onOpenChange?.(true, variantKey);
    },
    [initialValuesByVariant, onOpenChange, variants],
  );
  useEffect(() => {
    onControllerReady?.({ openModal, closeModal });
  }, [closeModal, onControllerReady, openModal]);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (openSearchField) {
          setOpenSearchField(null);
          setSearchActiveOptionIndex((current) => {
            if (!(openSearchField in current)) {
              return current;
            }
            const nextState = { ...current };
            delete nextState[openSearchField];
            return nextState;
          });
          return;
        }
        closeModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeModal, isOpen, openSearchField]);
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    const appContent = document.querySelector<HTMLElement>(".erp-app-content");

    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousAppOverflow = appContent?.style.overflow ?? "";
    const previousAppOverscroll = appContent?.style.overscrollBehavior ?? "";

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    if (appContent) {
      appContent.style.overflow = "hidden";
      appContent.style.overscrollBehavior = "none";
    }

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      if (appContent) {
        appContent.style.overflow = previousAppOverflow;
        appContent.style.overscrollBehavior = previousAppOverscroll;
      }
    };
  }, [isOpen]);
  const validateVariant = useCallback(
    (variant: ERPDynamicModalVariant, values: Record<string, string>) => {
      const nextErrors: Record<string, string> = {};
      const sectionState = sectionExpandedByVariant[variant.key];
      for (const field of resolveVisibleFields(variant, values, sectionState)) {
        const fieldError = validateFieldValue(field, values, fileData);
        if (fieldError) {
          nextErrors[field.name] = fieldError;
        }
      }
      return nextErrors;
    },
    [fileData, sectionExpandedByVariant],
  );

  const activeSectionExpandedState = useMemo(
    () =>
      activeVariant ? sectionExpandedByVariant[activeVariant.key] : undefined,
    [activeVariant, sectionExpandedByVariant],
  );

  const visibleFields = useMemo(() => {
    if (!activeVariant) {
      return [];
    }
    return resolveVisibleFields(
      activeVariant,
      formData,
      activeSectionExpandedState,
    );
  }, [activeSectionExpandedState, activeVariant, formData]);

  const toggleSectionExpanded = useCallback(
    (sectionName: string) => {
      if (!activeVariant) {
        return;
      }
      setSectionExpandedByVariant((current) => {
        const variantSections = current[activeVariant.key] ?? {};
        const currentValue = variantSections[sectionName] ?? true;
        return {
          ...current,
          [activeVariant.key]: {
            ...variantSections,
            [sectionName]: !currentValue,
          },
        };
      });
    },
    [activeVariant],
  );
  const applyResolvedFieldErrors = useCallback(
    (errors: Record<string, string | null | undefined>) => {
      setFieldErrors((currentErrors) => {
        let changed = false;
        const nextErrors = { ...currentErrors };

        for (const [fieldName, errorMessage] of Object.entries(errors)) {
          if (errorMessage) {
            if (nextErrors[fieldName] !== errorMessage) {
              nextErrors[fieldName] = errorMessage;
              changed = true;
            }
            continue;
          }

          if (fieldName in nextErrors) {
            delete nextErrors[fieldName];
            changed = true;
          }
        }

        return changed ? nextErrors : currentErrors;
      });
    },
    [],
  );
  const revalidateFieldNames = useCallback(
    (
      fieldNames: string[],
      values: Record<string, string>,
      files: Record<string, File | null>,
    ) => {
      if (!validateOnChange || !activeVariant || fieldNames.length === 0) {
        return;
      }

      const fieldNameSet = new Set(fieldNames);
      setFieldErrors((currentErrors) => {
        let changed = false;
        const nextErrors = { ...currentErrors };

        for (const field of activeVariant.fields) {
          if (!fieldNameSet.has(field.name)) {
            continue;
          }

          const nextError = validateFieldValue(field, values, files);
          const currentError = currentErrors[field.name];
          if (nextError) {
            if (currentError !== nextError) {
              nextErrors[field.name] = nextError;
              changed = true;
            }
            continue;
          }

          if (currentError !== undefined) {
            delete nextErrors[field.name];
            changed = true;
          }
        }

        return changed ? nextErrors : currentErrors;
      });
    },
    [activeVariant, validateOnChange],
  );
  const applyFieldValueChangeResult = useCallback(
    (result: ERPDynamicFieldValueChangeResult | void) => {
      if (!result) {
        return;
      }

      if (result.values && Object.keys(result.values).length > 0) {
        const resultValues = result.values;
        setFormData((current) => {
          const nextValues = {
            ...current,
            ...resultValues,
          };
          revalidateFieldNames(Object.keys(resultValues), nextValues, fileData);
          return nextValues;
        });
      }

      if (result.errors) {
        applyResolvedFieldErrors(result.errors);
      }
    },
    [applyResolvedFieldErrors, fileData, revalidateFieldNames],
  );
  const runFieldValueChangeHandler = useCallback(
    (
      field: ERPDynamicModalField,
      nextValue: string,
      nextValues: Record<string, string>,
      previousValues: Record<string, string>,
    ) => {
      if (!field.onValueChange) {
        return;
      }

      const requestId =
        (fieldValueChangeRequestIdsRef.current[field.name] ?? 0) + 1;
      fieldValueChangeRequestIdsRef.current[field.name] = requestId;

      void Promise.resolve(
        field.onValueChange({
          field,
          fieldName: field.name,
          value: nextValue,
          values: nextValues,
          previousValues,
        }),
      )
        .then((result) => {
          if (fieldValueChangeRequestIdsRef.current[field.name] !== requestId) {
            return;
          }
          applyFieldValueChangeResult(result);
        })
        .catch(() => {
          // Caller-owned error handling can be returned through `errors`.
        });
    },
    [applyFieldValueChangeResult],
  );
  useEffect(() => {
    if (!activeVariant) {
      return;
    }
    const visibleFieldNames = new Set(visibleFields.map((field) => field.name));
    setFieldErrors((current) => {
      let changed = false;
      const nextErrors: Record<string, string> = {};
      for (const [fieldName, errorMessage] of Object.entries(current)) {
        if (visibleFieldNames.has(fieldName)) {
          nextErrors[fieldName] = errorMessage;
        } else {
          changed = true;
        }
      }
      return changed ? nextErrors : current;
    });
    setSearchQueries((current) => {
      let changed = false;
      const nextQueries: Record<string, string> = {};

      for (const [fieldName, query] of Object.entries(current)) {
        if (visibleFieldNames.has(fieldName)) {
          nextQueries[fieldName] = query;
        } else {
          changed = true;
        }
      }

      return changed ? nextQueries : current;
    });

    setOpenSearchField((current) => {
      if (current && !visibleFieldNames.has(current)) {
        return null;
      }
      return current;
    });

    setSearchActiveOptionIndex((current) => {
      let changed = false;
      const nextIndexes: Record<string, number> = {};
      for (const [fieldName, optionIndex] of Object.entries(current)) {
        if (visibleFieldNames.has(fieldName)) {
          nextIndexes[fieldName] = optionIndex;
        } else {
          changed = true;
        }
      }
      return changed ? nextIndexes : current;
    });
  }, [activeVariant, visibleFields]);

  const handleChange = (
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const target = event.target;
    const { name } = target;
    const isFileInput =
      target instanceof HTMLInputElement && target.type === "file";
    const isCheckboxInput =
      target instanceof HTMLInputElement && target.type === "checkbox";
    const isMultiSelectInput =
      target instanceof HTMLSelectElement && target.multiple;
    const nextFile = isFileInput ? (target.files?.[0] ?? null) : null;
    const nextValue = isFileInput
      ? nextFile
        ? nextFile.name
        : ""
      : isCheckboxInput
        ? target.checked
          ? "true"
          : "false"
          : isMultiSelectInput
            ? formatMultiSelectValue(
              Array.from(target.selectedOptions).map((option) => option.value),
            )
          : target.value;
    const field = activeVariant?.fields.find((item) => item.name === name);

    if (isFileInput) {
      setFileData((current) => ({
        ...current,
        [name]: nextFile,
      }));
    }

    setFormData((current) => {
      const nextValues = {
        ...current,
        [name]: nextValue,
      };

      const nextFiles = isFileInput
        ? {
            ...fileData,
            [name]: nextFile,
          }
        : fileData;

      if (field) {
        revalidateFieldNames([name], nextValues, nextFiles);
        runFieldValueChangeHandler(field, nextValue, nextValues, current);
      }

      return nextValues;
    });
  };

  const handleSearchableSelectInput = useCallback(
    (field: ERPDynamicModalField, query: string) => {
      const fieldName = field.name;
      setOpenSearchField(fieldName);
      setSearchQueries((current) => ({
        ...current,
        [fieldName]: query,
      }));
      setSearchActiveOptionIndex((current) => {
        if (!(fieldName in current)) {
          return current;
        }
        const nextState = { ...current };
        delete nextState[fieldName];
        return nextState;
      });

    },
    [],
  );

  const handleSearchableSelectChoose = useCallback(
    (field: ERPDynamicModalField, option: ERPDynamicSelectOption) => {
      const fieldName = field.name;
      const isMultipleSelect =
        (field.type ?? "text") === "select" && field.multiple;
      setFormData((current) => {
        const nextFieldValue = isMultipleSelect
          ? (() => {
              const existingValues = parseMultiSelectValue(
                current[fieldName] ?? "",
              );
              const isSelected = existingValues.includes(option.value);
              const updatedValues = isSelected
                ? existingValues.filter((value) => value !== option.value)
                : [...existingValues, option.value];
              return formatMultiSelectValue(updatedValues);
            })()
          : option.value;

        const nextValues = {
          ...current,
          [fieldName]: nextFieldValue,
        };
        revalidateFieldNames([fieldName], nextValues, fileData);
        runFieldValueChangeHandler(field, nextFieldValue, nextValues, current);

        return nextValues;
      });

      setSearchQueries((current) => {
        if (isMultipleSelect) {
          return {
            ...current,
            [fieldName]: "",
          };
        }

        const nextState = { ...current };
        delete nextState[fieldName];
        return nextState;
      });
      setSearchActiveOptionIndex((current) => {
        if (!(fieldName in current)) {
          return current;
        }
        const nextState = { ...current };
        delete nextState[fieldName];
        return nextState;
      });
      setOpenSearchField(isMultipleSelect ? fieldName : null);
    },
    [fileData, revalidateFieldNames, runFieldValueChangeHandler],
  );

  const handleSearchableSelectKeyDown = useCallback(
    (
      field: ERPDynamicModalField,
      event: ReactKeyboardEvent<HTMLElement>,
      filteredOptions: ERPDynamicSelectOption[],
      fieldValue: string,
    ) => {
      const fieldName = field.name;
      const normalizedShortcutKey = event.key.trim().toLowerCase();
      const searchQuery = (searchQueries[fieldName] ?? "").trim();
      const shortcutPayload: ERPDynamicSearchShortcutPayload = {
        fieldName,
        query: searchQuery,
        value: fieldValue,
        values: { ...formData },
      };
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        normalizedShortcutKey === "c" &&
        field.onSearchCreateShortcut
      ) {
        event.preventDefault();
        void field.onSearchCreateShortcut(shortcutPayload);
        return;
      }
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        normalizedShortcutKey === "a" &&
        field.onSearchEditShortcut
      ) {
        event.preventDefault();
        void field.onSearchEditShortcut(shortcutPayload);
        return;
      }
      const isMultipleSelect =
        (field.type ?? "text") === "select" && field.multiple;
      const isSearchOpen = openSearchField === fieldName;
      const optionCount = filteredOptions.length;
      const currentIndex =
        searchActiveOptionIndex[fieldName] !== undefined
          ? searchActiveOptionIndex[fieldName]
          : -1;

      const clearActiveIndex = () => {
        setSearchActiveOptionIndex((current) => {
          if (!(fieldName in current)) {
            return current;
          }
          const nextState = { ...current };
          delete nextState[fieldName];
          return nextState;
        });
      };

      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        event.preventDefault();

        if (!isSearchOpen) {
          setOpenSearchField(fieldName);
        }
        if (optionCount === 0) {
          clearActiveIndex();
          return;
        }

        const selectedIndex = isMultipleSelect
          ? -1
          : filteredOptions.findIndex((option) => option.value === fieldValue);
        const baseIndex =
          currentIndex >= 0 && currentIndex < optionCount
            ? currentIndex
            : selectedIndex;
        let nextIndex = baseIndex;

        if (event.key === "ArrowDown") {
          nextIndex = baseIndex + 1;
        } else if (event.key === "ArrowUp") {
          nextIndex = baseIndex - 1;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = optionCount - 1;
        }

        if (nextIndex < 0) {
          nextIndex = optionCount - 1;
        } else if (nextIndex >= optionCount) {
          nextIndex = 0;
        }

        setSearchActiveOptionIndex((current) => ({
          ...current,
          [fieldName]: nextIndex,
        }));
        return;
      }

      if (event.key === "Enter") {
        if (!isSearchOpen) {
          event.preventDefault();
          setOpenSearchField(fieldName);
          return;
        }

        event.preventDefault();
        if (optionCount === 0) {
          return;
        }
        const selectedIndex = isMultipleSelect
          ? -1
          : filteredOptions.findIndex((option) => option.value === fieldValue);
        const resolvedIndex =
          currentIndex >= 0 && currentIndex < optionCount
            ? currentIndex
            : selectedIndex >= 0
              ? selectedIndex
              : 0;
        const nextOption = filteredOptions[resolvedIndex];
        if (nextOption) {
          handleSearchableSelectChoose(field, nextOption);
        }
        return;
      }

      if (event.key === " " && !isSearchOpen) {
        const target = event.currentTarget;
        if (target instanceof HTMLDivElement) {
          event.preventDefault();
          setOpenSearchField(fieldName);
          return;
        }
      }

      if (event.key === "Escape" && isSearchOpen) {
        event.preventDefault();
        setOpenSearchField(null);
        clearActiveIndex();
        return;
      }

      if (event.key === "Tab" && isSearchOpen) {
        clearActiveIndex();
      }
    },
    [
      formData,
      handleSearchableSelectChoose,
      openSearchField,
      searchActiveOptionIndex,
      searchQueries,
    ],
  );

  const updateSearchDropdownLayout = useCallback((fieldName: string) => {
    const fieldContainer = searchSelectRefs.current[fieldName];
    if (!fieldContainer) {
      return;
    }

    const scrollContainer = fieldContainer.closest<HTMLElement>(
      '[data-erp-modal-scroll-area="true"]',
    );
    const fieldRect = fieldContainer.getBoundingClientRect();
    const scrollRect = scrollContainer?.getBoundingClientRect();

    const boundaryTop = scrollRect?.top ?? 0;
    const boundaryBottom = scrollRect?.bottom ?? window.innerHeight;
    const spaceBelow = Math.max(
      0,
      boundaryBottom - fieldRect.bottom - SEARCH_SELECT_LIST_OFFSET,
    );
    const spaceAbove = Math.max(
      0,
      fieldRect.top - boundaryTop - SEARCH_SELECT_LIST_OFFSET,
    );
    const shouldOpenUp =
      spaceBelow < SEARCH_SELECT_LIST_MAX_HEIGHT && spaceAbove > spaceBelow;
    const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;
    const nextMaxHeight = Math.max(
      0,
      Math.min(SEARCH_SELECT_LIST_MAX_HEIGHT, Math.floor(availableSpace)),
    );

    setSearchDropdownPlacement(shouldOpenUp ? "up" : "down");
    setSearchDropdownMaxHeight(
      nextMaxHeight > 0 ? nextMaxHeight : SEARCH_SELECT_LIST_MAX_HEIGHT,
    );
  }, []);

  useEffect(() => {
    if (!openSearchField) {
      return;
    }

    const fieldName = openSearchField;
    const runLayoutUpdate = () => updateSearchDropdownLayout(fieldName);
    runLayoutUpdate();

    const fieldContainer = searchSelectRefs.current[fieldName];
    const scrollContainer = fieldContainer?.closest<HTMLElement>(
      '[data-erp-modal-scroll-area="true"]',
    );

    window.addEventListener("resize", runLayoutUpdate);
    scrollContainer?.addEventListener("scroll", runLayoutUpdate, {
      passive: true,
    });

    return () => {
      window.removeEventListener("resize", runLayoutUpdate);
      scrollContainer?.removeEventListener("scroll", runLayoutUpdate);
    };
  }, [openSearchField, updateSearchDropdownLayout]);
  useEffect(() => {
    if (!openSearchField) {
      return;
    }

    const input = searchInputRefs.current[openSearchField];
    if (!input) {
      return;
    }

    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }, [openSearchField]);
  useEffect(() => {
    if (!openSearchField) {
      return;
    }

    const handleOutsidePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const fieldContainer = searchSelectRefs.current[openSearchField];
      if (fieldContainer?.contains(target)) {
        return;
      }
      setOpenSearchField(null);
      setSearchActiveOptionIndex((current) => {
        if (!(openSearchField in current)) {
          return current;
        }
        const nextState = { ...current };
        delete nextState[openSearchField];
        return nextState;
      });
    };

    document.addEventListener("mousedown", handleOutsidePointerDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointerDown);
    };
  }, [openSearchField]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeVariant || isSubmitting) {
      return;
    }

    const validationErrors = validateVariant(activeVariant, formData);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      onValidationError?.(validationErrors, activeVariant.key);
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit?.({
        variantKey: activeVariant.key,
        variant: activeVariant,
        values: formData,
        files: fileData,
      });

      if (resetOnSubmit) {
        setFormData(buildInitialValues(activeVariant, initialValuesByVariant));
        setFileData({});
        setFieldErrors({});
      }

      if (closeOnSubmit) {
        closeModal();
      }
    } catch {
      // Keep modal open and let parent error state render via submitError.
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!activeVariant) {
      closeModal();
      return;
    }
    onCancel?.(activeVariant.key);
    closeModal();
  };
  if (variants.length === 0) {
    return null;
  }
  const activePalette = resolvePalette(activeVariant?.accent);
  const modalStyle = {
    "--erp-modal-accent": activePalette.accent,
    "--erp-modal-accent-soft-ring": `${activePalette.accent}33`,
    "--erp-modal-border": "#cfdae6",
    "--erp-modal-surface": "#ffffff",
  } as CSSProperties;
  const formId = activeVariant
    ? `erp-modal-form-${activeVariant.key}`
    : "erp-modal-form";
  const formGridStyle = (() => {
    const styles: CSSProperties = {};
    if (
      typeof formGridColumns === "number" &&
      Number.isFinite(formGridColumns) &&
      formGridColumns > 0
    ) {
      styles["--erp-modal-form-columns" as keyof CSSProperties] = String(
        Math.max(1, Math.floor(formGridColumns)),
      ) as never;
    }
    if (!denseGrid) {
      styles.gridAutoFlow = "row";
    }
    return Object.keys(styles).length > 0 ? styles : undefined;
  })();
  return (
    <section className={className}>
      {!hideSectionHeader ? (
        <header className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
          {description ? (
            <p className="max-w-3xl text-sm text-slate-600">{description}</p>
          ) : null}
        </header>
      ) : null}
      {showDefaultCards ? (
        <div
          className={cx(
            "grid gap-6 md:grid-cols-2 xl:grid-cols-3",
            cardGridClassName,
          )}
        >
          {variants.map((variant) => {
            const palette = resolvePalette(variant.accent);
            return (
              <article
                key={variant.key}
                className="rounded-[4px] border border-slate-200 bg-white p-6 shadow-[0_10px_26px_rgba(15,35,56,0.08)] transition hover:-translate-y-[2px] hover:shadow-[0_16px_32px_rgba(15,35,56,0.14)]"
              >
                <div
                  className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[4px]"
                  style={{
                    backgroundColor: palette.iconBg,
                    color: palette.iconFg,
                  }}
                >
                  {variant.icon ?? <IconPlaceholder />}
                </div>
                <h3 className="text-xl font-semibold text-slate-900">
                  {variant.cardTitle}
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  {variant.cardDescription}
                </p>
                <button
                  type="button"
                  className={styles.cardButton}
                  style={{
                    backgroundColor: palette.accent,
                    borderColor: palette.accentStrong,
                    ["--erp-modal-accent" as string]: palette.accent,
                  }}
                  onClick={() => openModal(variant.key)}
                >
                  {variant.cardButtonLabel}
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
      {isOpen && activeVariant ? (
        <div className={styles.overlay} style={modalStyle}>
          <div
            className={styles.backdrop}
            onClick={closeOnBackdrop ? closeModal : undefined}
            aria-hidden
          />
          <section
            className={styles.panel}
            style={panelStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-title`}
          >
            <header className={styles.header}>
              <div className={styles.headerRow}>
                <div>
                  <h3 id={`${formId}-title`} className={styles.headerTitle}>
                    {activeVariant.modalTitle}
                  </h3>
                  {/* {activeVariant.modalDescription ? (
                    <p className={styles.headerDescription}>{activeVariant.modalDescription}</p>
                  ) : null} */}
                </div>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={closeModal}
                  aria-label="Close modal"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-5 w-5"
                  >
                    <path
                      d="M6 18 18 6M6 6l12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </header>
            <div
              className={styles.scrollArea}
              data-erp-modal-scroll-area="true"
            >
              <form
                id={formId}
                onSubmit={handleSubmit}
                noValidate
                autoComplete="off"
                className={styles.formGrid}
                style={formGridStyle}
              >
                {visibleFields.map((field) => {
                  const fieldValue = formData[field.name] ?? "";
                  const selectedFile = fileData[field.name] ?? null;
                  const fieldError = fieldErrors[field.name];
                  const inputType = field.type ?? "text";
                  if (inputType === "heading") {
                    const sectionExpanded =
                      activeSectionExpandedState?.[field.name] ?? true;
                    const sectionToggleId = `${formId}-${field.name}-section-toggle`;
                    return (
                      <div
                        key={field.name}
                        className={cx(
                          styles.field,
                          styles.fieldWide,
                          styles.sectionHeadingField,
                        )}
                      >
                        <label
                          className={styles.sectionToggle}
                          htmlFor={sectionToggleId}
                        >
                          <input
                            id={sectionToggleId}
                            type="checkbox"
                            autoComplete="off"
                            className={styles.sectionToggleInput}
                            checked={sectionExpanded}
                            disabled={isSubmitting}
                            onChange={() => toggleSectionExpanded(field.name)}
                          />
                          <span className={styles.sectionHeading}>
                            {field.label}
                          </span>
                        </label>
                        {field.helperText ? (
                          <p className={styles.sectionHeadingDescription}>
                            {field.helperText}
                          </p>
                        ) : null}
                      </div>
                    );
                  }
                  const isMultiSelect =
                    inputType === "select" && field.multiple;
                  const selectedValues = isMultiSelect
                    ? parseMultiSelectValue(fieldValue)
                    : [];
                  const selectedOptionEntries = isMultiSelect
                    ? selectedValues.map((selectedValue) => {
                        const matchedOption = field.options?.find(
                          (option) => option.value === selectedValue,
                        );
                        return {
                          value: selectedValue,
                          label: matchedOption?.label ?? selectedValue,
                        };
                      })
                    : [];
                  const selectedLabel = getSelectOptionLabel(field, fieldValue);
                  const searchQuery = searchQueries[field.name];
                  const searchInputValue = searchQuery ?? "";
                  const shouldUseSearchableSelect = inputType === "select";
                  const isSearchOpen = openSearchField === field.name;
                  const normalizedQuery = (searchQuery ?? "")
                    .trim()
                    .toLowerCase();
                  const filteredOptions =
                    shouldUseSearchableSelect
                      ? (field.options ?? []).filter((option) => {
                          if (!normalizedQuery) {
                            return true;
                          }
                          const valueMatch = option.value
                            .toLowerCase()
                            .includes(normalizedQuery);
                          const labelMatch = option.label
                            .toLowerCase()
                            .includes(normalizedQuery);
                          return valueMatch || labelMatch;
                        })
                      : [];
                  const highlightedOptionIndexRaw =
                    searchActiveOptionIndex[field.name];
                  const highlightedOptionIndex =
                    highlightedOptionIndexRaw !== undefined &&
                    highlightedOptionIndexRaw >= 0 &&
                    highlightedOptionIndexRaw < filteredOptions.length
                      ? highlightedOptionIndexRaw
                      : -1;
                  const controlId = `${formId}-${field.name}`;
                  const activeDescendantId =
                    isSearchOpen && highlightedOptionIndex >= 0
                      ? `${controlId}-search-option-${highlightedOptionIndex}`
                      : undefined;
                  const helpId = field.helperText
                    ? `${controlId}-help`
                    : undefined;
                  const fileId = selectedFile ? `${controlId}-file` : undefined;
                  const errorId = fieldError ? `${controlId}-error` : undefined;
                  const describedBy =
                    [helpId, fileId, errorId].filter(Boolean).join(" ") ||
                    undefined;
                  const commonProps = {
                    id: controlId,
                    name: field.name,
                    required: field.required,
                    disabled: field.disabled || isSubmitting,
                    onChange: handleChange,
                    autoComplete: "off",
                    "aria-invalid": fieldError ? true : undefined,
                    "aria-describedby": describedBy,
                  };
                  return (
                    <div
                      key={field.name}
                      className={cx(
                        styles.field,
                        stackLabels &&
                          inputType !== "checkbox" &&
                          styles.fieldStacked,
                        field.colSpan === 2 && styles.fieldWide,
                        inputType === "checkbox" && styles.checkboxField,
                      )}
                      style={
                        field.gridColumnStart !== undefined ||
                        field.gridRowStart !== undefined
                          ? {
                              ...(field.gridColumnStart !== undefined
                                ? {
                                    gridColumnStart: Math.max(
                                      1,
                                      Math.floor(field.gridColumnStart),
                                    ),
                                  }
                                : {}),
                              ...(field.gridRowStart !== undefined
                                ? {
                                    gridRowStart: Math.max(
                                      1,
                                      Math.floor(field.gridRowStart),
                                    ),
                                  }
                                : {}),
                            }
                          : undefined
                      }
                    >
                      {inputType !== "checkbox" ? (
                        <label className={styles.label} htmlFor={commonProps.id}>
                          {field.label}{" "}
                          {field.required ? (
                            <span className={styles.requiredMark}>*</span>
                          ) : null}
                        </label>
                      ) : null}
                      {shouldUseSearchableSelect ? (
                        <div
                          className={styles.searchSelect}
                          ref={(element) => {
                            searchSelectRefs.current[field.name] = element;
                          }}
                        >
                          <div
                            className={cx(
                              styles.searchSelectTrigger,
                              isMultiSelect && styles.searchMultiSelectControl,
                              fieldError && styles.controlInvalid,
                              isSearchOpen && styles.searchSelectTriggerOpen,
                              (field.disabled || isSubmitting) &&
                                styles.searchSelectTriggerDisabled,
                            )}
                            role="combobox"
                            aria-expanded={isSearchOpen}
                            aria-controls={`${controlId}-search-list`}
                            aria-activedescendant={activeDescendantId}
                            aria-disabled={
                              field.disabled || isSubmitting ? true : undefined
                            }
                            tabIndex={field.disabled || isSubmitting ? -1 : 0}
                            onMouseDown={(event) => {
                              const target = event.target as HTMLElement;
                              if (
                                target.closest(
                                  '[data-search-select-remove="true"]',
                                )
                              ) {
                                return;
                              }
                              event.preventDefault();
                              if (field.disabled || isSubmitting) {
                                return;
                              }
                              setOpenSearchField((current) =>
                                current === field.name ? null : field.name,
                              );
                            }}
                            onKeyDown={(event) =>
                              handleSearchableSelectKeyDown(
                                field,
                                event,
                                filteredOptions,
                                fieldValue,
                              )
                            }
                          >
                            {isMultiSelect ? (
                              <div className={styles.searchSelectValueTokens}>
                                {selectedOptionEntries.length ? (
                                  selectedOptionEntries.map((option) => (
                                    <span
                                      key={`${field.name}-selected-${option.value}`}
                                      className={styles.searchSelectToken}
                                    >
                                      <span
                                        className={styles.searchSelectTokenText}
                                      >
                                        {option.label}
                                      </span>
                                      <button
                                        type="button"
                                        data-search-select-remove="true"
                                        className={styles.searchSelectTokenRemove}
                                        aria-label={`Remove ${option.label}`}
                                        disabled={field.disabled || isSubmitting}
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          if (field.disabled || isSubmitting) {
                                            return;
                                          }
                                          handleSearchableSelectChoose(
                                            field,
                                            option,
                                          );
                                        }}
                                      >
                                        x
                                      </button>
                                    </span>
                                  ))
                                ) : (
                                  <span
                                    className={
                                      styles.searchSelectTriggerPlaceholder
                                    }
                                  >
                                    {field.placeholder ?? `Select ${field.label}`}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span
                                className={cx(
                                  styles.searchSelectTriggerSingleValue,
                                  !fieldValue &&
                                    styles.searchSelectTriggerPlaceholder,
                                )}
                              >
                                {selectedLabel ||
                                  field.placeholder ||
                                  `Select ${field.label}`}
                              </span>
                            )}
                            <span
                              className={styles.searchSelectChevronSlot}
                              aria-hidden="true"
                            >
                              <svg
                                viewBox="0 0 20 20"
                                className={cx(
                                  styles.searchSelectChevron,
                                  isSearchOpen &&
                                    styles.searchSelectChevronOpen,
                                )}
                              >
                                <path
                                  d="M5 7.5 10 12.5 15 7.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                          </div>
                          {isSearchOpen && !field.disabled ? (
                            <div
                              id={`${controlId}-search-list`}
                              className={cx(
                                styles.searchSelectList,
                                searchDropdownPlacement === "up" &&
                                  styles.searchSelectListUp,
                              )}
                              style={{
                                maxHeight: `${searchDropdownMaxHeight}px`,
                              }}
                            >
                              <div className={styles.searchSelectSearchWrap}>
                                <input
                                  type="text"
                                  autoComplete="off"
                                  value={searchInputValue}
                                  placeholder={
                                    field.placeholder ?? `Search ${field.label}`
                                  }
                                  className={styles.searchSelectSearchInput}
                                  role="searchbox"
                                  ref={(element) => {
                                    searchInputRefs.current[field.name] =
                                      element;
                                  }}
                                  onFocus={() => setOpenSearchField(field.name)}
                                  onBlur={() => {
                                    window.setTimeout(() => {
                                      const container =
                                        searchSelectRefs.current[field.name];
                                      const activeElement =
                                        document.activeElement;
                                      if (
                                        container &&
                                        activeElement instanceof Node &&
                                        container.contains(activeElement)
                                      ) {
                                        return;
                                      }
                                      setOpenSearchField((current) =>
                                        current === field.name ? null : current,
                                      );
                                    }, 0);
                                  }}
                                  onMouseDown={(event) => {
                                    event.stopPropagation();
                                  }}
                                  onKeyDown={(event) =>
                                    handleSearchableSelectKeyDown(
                                      field,
                                      event,
                                      filteredOptions,
                                      fieldValue,
                                    )
                                  }
                                  onChange={(event) =>
                                    handleSearchableSelectInput(
                                      field,
                                      event.currentTarget.value,
                                    )
                                  }
                                />
                                <span
                                  className={styles.searchSelectSearchIcon}
                                  aria-hidden="true"
                                >
                                  <svg viewBox="0 0 20 20">
                                    <path
                                      d="M8.6 3.5a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2Zm0 1.6a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm4.7 8.7 3.2 3.2"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.7"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </span>
                              </div>
                              <ul className={styles.searchSelectOptions} role="listbox">
                                {filteredOptions.length ? (
                                  filteredOptions.map((option, optionIndex) => (
                                    <li
                                      id={`${controlId}-search-option-${optionIndex}`}
                                      key={`${field.name}-${option.value}`}
                                      className={cx(
                                        styles.searchSelectOption,
                                        optionIndex === highlightedOptionIndex &&
                                          styles.searchSelectOptionActive,
                                        (isMultiSelect
                                          ? selectedValues.includes(option.value)
                                          : option.value === fieldValue) &&
                                          styles.searchSelectOptionActive,
                                      )}
                                      role="option"
                                      aria-selected={
                                        isMultiSelect
                                          ? selectedValues.includes(option.value)
                                          : option.value === fieldValue
                                      }
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        handleSearchableSelectChoose(
                                          field,
                                          option,
                                        );
                                      }}
                                      onMouseEnter={() =>
                                        setSearchActiveOptionIndex((current) => ({
                                          ...current,
                                          [field.name]: optionIndex,
                                        }))
                                      }
                                    >
                                      {isMultiSelect ? (
                                        <input
                                          type="checkbox"
                                          autoComplete="off"
                                          checked={selectedValues.includes(option.value)}
                                          readOnly
                                          tabIndex={-1}
                                          aria-hidden="true"
                                        />
                                      ) : null}
                                      {option.label}
                                    </li>
                                  ))
                                ) : (
                                  <li
                                    className={styles.searchSelectEmpty}
                                    role="option"
                                    aria-disabled
                                  >
                                    No matching options
                                  </li>
                                )}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : inputType === "checkbox" ? (
                        <label
                          className={styles.checkboxWrapper}
                          htmlFor={commonProps.id}
                        >
                          <input
                            {...commonProps}
                            type="checkbox"
                            autoComplete="off"
                            checked={fieldValue === "true"}
                            className={cx(
                              styles.checkboxControl,
                              fieldError && styles.checkboxControlInvalid,
                            )}
                            style={field.controlStyle}
                          />
                          <span className={styles.checkboxLabel}>
                            {field.label}
                            {field.required ? (
                              <span className={styles.requiredMark}>*</span>
                            ) : null}
                          </span>
                        </label>
                      ) : inputType === "textarea" ? (
                        <textarea
                          {...commonProps}
                          value={fieldValue}
                          rows={field.rows ?? 4}
                          autoComplete="off"
                          //placeholder={field.placeholder}
                          className={cx(
                            styles.control,
                            styles.textarea,
                            fieldError && styles.controlInvalid,
                          )}
                          style={field.controlStyle}
                        />
                      ) : inputType === "file" ? (
                        <div className={styles.fileField}>
                          <input
                            {...commonProps}
                            type="file"
                            autoComplete="off"
                            accept={field.accept}
                            className={cx(
                              styles.control,
                              styles.fileInput,
                              fieldError && styles.controlInvalid,
                            )}
                            style={field.controlStyle}
                          />
                          <p id={fileId} className={styles.fileMeta}>
                            {selectedFile
                              ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                              : "No file selected"}
                          </p>
                        </div>
                      ) : (
                        <input
                          {...commonProps}
                          value={
                            inputType === "color"
                              ? fieldValue || "#000000"
                              : fieldValue
                          }
                          type={inputType}
                          autoComplete="off"
                          inputMode={field.inputMode}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          //placeholder={field.placeholder}
                          className={cx(
                            styles.control,
                            fieldError && styles.controlInvalid,
                          )}
                          style={field.controlStyle}
                        />
                      )}

                      {field.helperText ? (
                        <p id={helpId} className={styles.helpText}>
                          {field.helperText}
                        </p>
                      ) : null}
                      {fieldError ? (
                        <p id={errorId} className={styles.errorText}>
                          {fieldError}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </form>
            </div>

            <footer className={styles.footer}>
              {submitError ? (
                <p className={styles.submitError} role="alert">
                  {submitError}
                </p>
              ) : null}
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                form={formId}
                className={styles.submitButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : activeVariant.submitLabel}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default ERPDynamicModalForm;
