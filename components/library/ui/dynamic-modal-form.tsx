"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
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

export type ERPDynamicFieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
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
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  options?: ERPDynamicSelectOption[];
  colSpan?: 1 | 2;
  helperText?: string;
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
  onValidationError?: (errors: Record<string, string>, variantKey: string) => void;
  onControllerReady?: (controller: ERPDynamicModalController) => void;
  showDefaultCards?: boolean;
  hideSectionHeader?: boolean;
  submitError?: string | null;
  className?: string;
  cardGridClassName?: string;
};

function resolvePalette(accent: ERPDynamicModalVariant["accent"]): ModalAccentPalette {
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

function validateFieldValue(
  field: ERPDynamicModalField,
  values: Record<string, string>,
  files: Record<string, File | null>,
): string | null {
  const rawValue = values[field.name] ?? "";
  const value = rawValue.trim();
  const fieldType = field.type ?? "text";
  const validation = field.validation;

  if (fieldType === "file") {
    const selectedFile = files[field.name] ?? null;

    if (field.required && !selectedFile) {
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

  if (field.required && isEmptyValue(rawValue)) {
    return validation?.requiredMessage ?? `${field.label} is required.`;
  }

  if (isEmptyValue(rawValue)) {
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
  className,
  cardGridClassName,
}: ERPDynamicModalFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeVariantKey, setActiveVariantKey] = useState<string>(variants[0]?.key ?? "");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [fileData, setFileData] = useState<Record<string, File | null>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        closeModal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeModal, isOpen]);

  const validateVariant = useCallback(
    (variant: ERPDynamicModalVariant, values: Record<string, string>) => {
      const nextErrors: Record<string, string> = {};

      for (const field of variant.fields) {
        const fieldError = validateFieldValue(field, values, fileData);
        if (fieldError) {
          nextErrors[field.name] = fieldError;
        }
      }

      return nextErrors;
    },
    [fileData],
  );

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const target = event.target;
    const { name } = target;
    const isFileInput = target instanceof HTMLInputElement && target.type === "file";
    const nextFile = isFileInput ? target.files?.[0] ?? null : null;
    const nextValue = isFileInput ? (nextFile ? nextFile.name : "") : target.value;

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

      if (validateOnChange && activeVariant) {
        const field = activeVariant.fields.find((item) => item.name === name);
        if (field) {
          const nextFiles = isFileInput
            ? {
                ...fileData,
                [name]: nextFile,
              }
            : fileData;
          const nextError = validateFieldValue(field, nextValues, nextFiles);
          setFieldErrors((currentErrors) => {
            const nextErrors = { ...currentErrors };
            if (nextError) {
              nextErrors[name] = nextError;
            } else {
              delete nextErrors[name];
            }
            return nextErrors;
          });
        }
      }

      return nextValues;
    });
  };

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

  const formId = activeVariant ? `erp-modal-form-${activeVariant.key}` : "erp-modal-form";

  return (
    <section className={cx("space-y-6", className)}>
      {!hideSectionHeader ? (
        <header className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
          {description ? <p className="max-w-3xl text-sm text-slate-600">{description}</p> : null}
        </header>
      ) : null}

      {showDefaultCards ? (
        <div className={cx("grid gap-6 md:grid-cols-2 xl:grid-cols-3", cardGridClassName)}>
          {variants.map((variant) => {
            const palette = resolvePalette(variant.accent);

            return (
            <article
              key={variant.key}
              className="rounded-[4px] border border-slate-200 bg-white p-6 shadow-[0_10px_26px_rgba(15,35,56,0.08)] transition hover:-translate-y-[2px] hover:shadow-[0_16px_32px_rgba(15,35,56,0.14)]"
            >
              <div
                className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[4px]"
                style={{ backgroundColor: palette.iconBg, color: palette.iconFg }}
              >
                  {variant.icon ?? <IconPlaceholder />}
                </div>

                <h3 className="text-xl font-semibold text-slate-900">{variant.cardTitle}</h3>
                <p className="mt-2 text-sm text-slate-600">{variant.cardDescription}</p>

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
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-title`}
          >
            <header
              className={styles.header}
              style={{ background: `linear-gradient(120deg, ${activePalette.softFrom} 0%, ${activePalette.softTo} 100%)` }}
            >
              <div className={styles.headerRow}>
                <div>
                  <h3 id={`${formId}-title`} className={styles.headerTitle}>
                    {activeVariant.modalTitle}
                  </h3>
                  {activeVariant.modalDescription ? (
                    <p className={styles.headerDescription}>{activeVariant.modalDescription}</p>
                  ) : null}
                </div>

                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={closeModal}
                  aria-label="Close modal"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
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

            <div className={styles.scrollArea}>
              <form id={formId} onSubmit={handleSubmit} noValidate className={styles.formGrid}>
                {activeVariant.fields.map((field) => {
                  const fieldValue = formData[field.name] ?? "";
                  const selectedFile = fileData[field.name] ?? null;
                  const fieldError = fieldErrors[field.name];
                  const inputType = field.type ?? "text";
                  const controlId = `${formId}-${field.name}`;
                  const helpId = field.helperText ? `${controlId}-help` : undefined;
                  const fileId = selectedFile ? `${controlId}-file` : undefined;
                  const errorId = fieldError ? `${controlId}-error` : undefined;
                  const describedBy = [helpId, fileId, errorId].filter(Boolean).join(" ") || undefined;
                  const commonProps = {
                    id: controlId,
                    name: field.name,
                    required: field.required,
                    disabled: field.disabled || isSubmitting,
                    onChange: handleChange,
                    autoComplete: field.autoComplete,
                    "aria-invalid": fieldError ? true : undefined,
                    "aria-describedby": describedBy,
                  };

                  return (
                    <div
                      key={field.name}
                      className={cx(styles.field, field.colSpan === 2 && styles.fieldWide)}
                    >
                      <label className={styles.label} htmlFor={commonProps.id}>
                        {field.label}{" "}
                        {field.required ? <span className={styles.requiredMark}>*</span> : null}
                      </label>

                      {inputType === "select" ? (
                        <select
                          {...commonProps}
                          value={fieldValue}
                          className={cx(styles.control, fieldError && styles.controlInvalid)}
                        >
                          <option value="">{field.placeholder ?? `Select ${field.label}`}</option>
                          {field.options?.map((option) => (
                            <option key={`${field.name}-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : inputType === "textarea" ? (
                        <textarea
                          {...commonProps}
                          value={fieldValue}
                          rows={field.rows ?? 4}
                          placeholder={field.placeholder}
                          className={cx(
                            styles.control,
                            styles.textarea,
                            fieldError && styles.controlInvalid,
                          )}
                        />
                      ) : inputType === "file" ? (
                        <div className={styles.fileField}>
                          <input
                            {...commonProps}
                            type="file"
                            accept={field.accept}
                            className={cx(styles.control, styles.fileInput, fieldError && styles.controlInvalid)}
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
                          value={fieldValue}
                          type={inputType}
                          inputMode={field.inputMode}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          placeholder={field.placeholder}
                          className={cx(styles.control, fieldError && styles.controlInvalid)}
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
