import { type CSSProperties, type InputHTMLAttributes, type ReactNode } from "react";
import { type ACCENT_PRESETS } from "./dynamic-modal-form.constants";

type FieldInputMode = InputHTMLAttributes<HTMLInputElement>["inputMode"];

export type ModalAccentPalette = {
  accent: string;
  accentStrong: string;
  softFrom: string;
  softTo: string;
  iconBg: string;
  iconFg: string;
};

export type FieldNavigationDirection = "left" | "right" | "up" | "down";

export type FocusableFieldTarget = {
  container: HTMLElement;
  control: HTMLElement;
  fieldName: string;
  rect: DOMRect;
  centerX: number;
  centerY: number;
};

export type ERPDynamicFieldType =
  | "heading"
  | "custom"
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

export type ERPDynamicSearchQueryChangeHandler = (
  query: string,
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

export type ERPDynamicCustomFieldRenderProps = {
  disabled: boolean;
  error: string | null;
  field: ERPDynamicModalField;
  setError: (message: string | null | undefined) => void;
  setValue: (value: string) => void;
  value: string;
  values: Record<string, string>;
};

export type ERPDynamicModalField = {
  name: string;
  label: string;
  type?: ERPDynamicFieldType;
  defaultExpanded?: boolean;
  defaultExpandedWhen?: (values: Record<string, string>) => boolean;
  sectionGridColumns?: number;
  fieldStyle?: CSSProperties;
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
  gridColumnStart?: number;
  gridRowStart?: number;
  onSearchQueryChange?: ERPDynamicSearchQueryChangeHandler;
  onSearchCreateShortcut?: ERPDynamicSearchShortcutHandler;
  onSearchEditShortcut?: ERPDynamicSearchShortcutHandler;
  onValueChange?: ERPDynamicFieldValueChangeHandler;
  render?: (props: ERPDynamicCustomFieldRenderProps) => ReactNode;
};

export type AccentPreset = keyof typeof ACCENT_PRESETS;
export type ERPDynamicSectionNavigationMode = "accordion" | "tabs";

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
  sectionExpandedState: Record<string, boolean>;
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
  sectionNavigationMode?: ERPDynamicSectionNavigationMode;
  hideFieldHelperText?: boolean;
  hideFieldErrorText?: boolean;
  focusFirstInvalidFieldOnValidationError?: boolean;
  enableArrowKeyFieldNavigation?: boolean;
  className?: string;
  cardGridClassName?: string;
};

export type ERPDynamicFormSection = {
  heading: ERPDynamicModalField | null;
  fields: ERPDynamicModalField[];
};
