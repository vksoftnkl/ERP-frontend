"use client";
import {
  type ChangeEvent,
  type CSSProperties,
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cx } from "@/components/design-system/cx";
import { ERPColorPicker } from "@/components/design-system/ui/color-picker";
import ModalPortal from "@/components/ui/modal-portal";
import { SHOW_DROPDOWN_ADD_BUTTON } from "@/config/ui";
import styles from "./dynamic-modal-form.module.scss";
import {
  FIELD_CONTAINER_SELECTOR,
  SEARCH_SELECT_LIST_MAX_HEIGHT,
  SEARCH_SELECT_LIST_OFFSET,
} from "./dynamic-modal-form.constants";
import type {
  AccentPreset,
  ERPDynamicCustomFieldRenderProps,
  ERPDynamicFieldType,
  ERPDynamicFieldValidation,
  ERPDynamicFieldValueChangeResult,
  ERPDynamicFormSection,
  ERPDynamicModalController,
  ERPDynamicModalField,
  ERPDynamicModalFormProps,
  ERPDynamicModalOpenOptions,
  ERPDynamicModalSubmitPayload,
  ERPDynamicModalVariant,
  ERPDynamicSearchShortcutPayload,
  ERPDynamicSearchShortcutHandler,
  ERPDynamicSectionNavigationMode,
  ERPDynamicSelectOption,
} from "./dynamic-modal-form.types";
export type {
  AccentPreset,
  ERPDynamicCustomFieldRenderProps,
  ERPDynamicFieldType,
  ERPDynamicFieldValidation,
  ERPDynamicModalController,
  ERPDynamicModalField,
  ERPDynamicModalFormProps,
  ERPDynamicModalOpenOptions,
  ERPDynamicModalSubmitPayload,
  ERPDynamicModalVariant,
  ERPDynamicSearchShortcutPayload,
  ERPDynamicSectionNavigationMode,
} from "./dynamic-modal-form.types";
export type {
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicFieldValueChangePayload,
  ERPDynamicFieldValueChangeResult,
  ERPDynamicSearchQueryChangeHandler,
  ERPDynamicSelectOption,
} from "./dynamic-modal-form.types";
import {
  buildFormSections,
  buildInitialValues,
  buildSectionExpandedState,
  findNextFieldTarget,
  focusFieldControl,
  formatMultiSelectValue,
  getFocusableFieldTargets,
  getFirstFocusableFieldTarget,
  getSelectOptionLabel,
  getSectionRowStartOffset,
  isFieldDisabled,
  isFieldRequired,
  isEmptyValue,
  parseMultiSelectValue,
  resolvePalette,
  resolveVisibleFields,
  validateFieldValue,
} from "./dynamic-modal-form.utils";
import {
  IconPlaceholder,
  ModalFooterCancelIcon,
  ModalFooterSubmitIcon,
} from "./dynamic-modal-form.parts";

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
  footerLeadingActions,
  showDefaultCards = true,
  hideSectionHeader = false,
  submitError,
  panelStyle,
  panelClassName,
  formGridColumns,
  denseGrid = true,
  stackLabels = false,
  sectionNavigationMode = "accordion",
  hideFieldHelperText = false,
  hideFieldErrorText = false,
  focusFirstInvalidFieldOnValidationError = false,
  enableArrowKeyFieldNavigation = false,
  showAddButton = SHOW_DROPDOWN_ADD_BUTTON,
  className,
  cardGridClassName,
}: ERPDynamicModalFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeVariantKey, setActiveVariantKey] = useState<string>(
    variants[0]?.key ?? "",
  );
  const [formData, setFormData] = useState<Record<string, string>>({});
  // Mirrors `formData` so value changes can be computed outside a `setFormData`
  // updater. Updaters run during render and must stay pure — the validation and
  // `onValueChange` side effects below would otherwise fire mid-render (React
  // warns when a caller's handler updates the parent) and run twice in
  // StrictMode. Every write to `formData` goes through here to keep it accurate.
  const formDataRef = useRef<Record<string, string>>({});
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
  // Tracks which searchable field is currently open so onSearchOpenChange can be
  // fired exactly once on each open/close transition (used for lazy dropdowns).
  const prevOpenSearchFieldRef = useRef<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [searchDropdownPlacement, setSearchDropdownPlacement] = useState<
    "down" | "up"
  >("down");
  const [searchDropdownMaxHeight, setSearchDropdownMaxHeight] = useState(
    SEARCH_SELECT_LIST_MAX_HEIGHT,
  );
  const formRef = useRef<HTMLFormElement | null>(null);
  const [sectionExpandedByVariant, setSectionExpandedByVariant] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [activeSectionByVariant, setActiveSectionByVariant] = useState<
    Record<string, string>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Data-URL previews for image files picked in this session, keyed by field name.
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});
  const fieldValueChangeRequestIdsRef = useRef<Record<string, number>>({});
  const sectionTabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // Replaces the whole form value set (open/reset). Keeps `formDataRef` in sync.
  const replaceFormData = useCallback((nextValues: Record<string, string>) => {
    formDataRef.current = nextValues;
    setFormData(nextValues);
  }, []);
  // Derives the next values from the latest committed values and returns both
  // sides, so callers can run validation and `onValueChange` after the commit
  // instead of inside the updater.
  const commitFormData = useCallback(
    (updater: (current: Record<string, string>) => Record<string, string>) => {
      const previousValues = formDataRef.current;
      const nextValues = updater(previousValues);
      formDataRef.current = nextValues;
      setFormData(nextValues);
      return { previousValues, nextValues };
    },
    [],
  );
  const activeVariant = useMemo(
    () => variants.find((variant) => variant.key === activeVariantKey),
    [activeVariantKey, variants],
  );
  // "State Entry — New". Derived from the open variant, but suppressed when the
  // title already carries the mode, so the default "New State" doesn't render
  // as "New State — New".
  const headerModeLabel = useMemo(() => {
    if (!activeVariant) {
      return null;
    }
    const key = activeVariant.key.toLowerCase();
    const mode = key.includes("create")
      ? "New"
      : key.includes("update") || key.includes("edit")
        ? "Edit"
        : key.includes("view")
          ? "View"
          : null;
    if (!mode) {
      return null;
    }
    return new RegExp(`\\b${mode}\\b`, "i").test(activeVariant.modalTitle)
      ? null
      : mode;
  }, [activeVariant]);
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
    setFilePreviews({});
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
      const nextFormData = {
        ...buildInitialValues(variant, initialValuesByVariant),
        ...(options?.values ?? {}),
      };
      setActiveVariantKey(variantKey);
      replaceFormData(nextFormData);
      setFileData({});
      setFilePreviews({});
      setFieldErrors({});
      setSearchQueries({});
      setOpenSearchField(null);
      setSearchActiveOptionIndex({});
      setSearchDropdownPlacement("down");
      setSearchDropdownMaxHeight(SEARCH_SELECT_LIST_MAX_HEIGHT);
      fieldValueChangeRequestIdsRef.current = {};
      setSectionExpandedByVariant((current) => ({
        ...current,
        [variantKey]: buildSectionExpandedState(variant.fields, nextFormData),
      }));
      setActiveSectionByVariant((current) => {
        const nextSections = buildFormSections(
          resolveVisibleFields(variant, nextFormData),
        );
        const firstSectionKey = nextSections[0]?.heading?.name ?? "section-0";
        return {
          ...current,
          [variantKey]: firstSectionKey,
        };
      });
      setIsOpen(true);
      onOpenChange?.(true, variantKey);
    },
    [initialValuesByVariant, onOpenChange, replaceFormData, variants],
  );
  useEffect(() => {
    onControllerReady?.({ openModal, closeModal });
  }, [closeModal, onControllerReady, openModal]);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
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
        return;
      }
      const isSubmitChord =
        (!event.altKey &&
          !event.shiftKey &&
          (event.ctrlKey || event.metaKey) &&
          (event.key === "Enter" || event.key.toLowerCase() === "s")) ||
        // Plain F12 is the legacy primary Save shortcut. preventDefault below
        // cannot stop the browser's devtools binding, but where the page
        // receives the key it saves, matching the legacy form.
        (event.key === "F12" &&
          !event.altKey &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey);
      if (isSubmitChord) {
        if (!activeVariant || isSubmitting) {
          return;
        }
        const formElement = formRef.current;
        if (!formElement) {
          return;
        }
        // Also swallows the browser's own Ctrl+S (Save Page) while the modal is open.
        event.preventDefault();
        formElement.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeVariant, closeModal, isOpen, isSubmitting, openSearchField]);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      return;
    }
    window.requestAnimationFrame(() => {
      scrollArea.scrollTop = 0;
    });
  }, [activeVariantKey, isOpen]);
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
      const fieldsToValidate =
        sectionNavigationMode === "tabs"
          ? resolveVisibleFields(variant, values)
          : resolveVisibleFields(variant, values, sectionState);
      for (const field of fieldsToValidate) {
        const fieldError = validateFieldValue(field, values, fileData);
        if (fieldError) {
          nextErrors[field.name] = fieldError;
        }
      }
      return nextErrors;
    },
    [fileData, sectionExpandedByVariant, sectionNavigationMode],
  );
  const activeSectionExpandedState = useMemo(
    () =>
      activeVariant ? sectionExpandedByVariant[activeVariant.key] : undefined,
    [activeVariant, sectionExpandedByVariant],
  );
  const allVisibleFields = useMemo(() => {
    if (!activeVariant) {
      return [];
    }
    return resolveVisibleFields(activeVariant, formData);
  }, [activeVariant, formData]);
  const visibleSections = useMemo<ERPDynamicFormSection[]>(() => {
    return buildFormSections(allVisibleFields);
  }, [allVisibleFields]);
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
  const tabSections = useMemo(
    () =>
      visibleSections.map((section, index) => ({
        key: section.heading?.name ?? `section-${index}`,
        label: section.heading?.label ?? `Section ${index + 1}`,
        section,
      })),
    [visibleSections],
  );
  const sectionErrorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { key, section } of tabSections) {
      counts[key] = section.fields.reduce(
        (count, field) => (fieldErrors[field.name] ? count + 1 : count),
        0,
      );
    }
    return counts;
  }, [fieldErrors, tabSections]);
  const activeSectionKey =
    activeVariant
      ? activeSectionByVariant[activeVariant.key] ?? tabSections[0]?.key
      : undefined;
  const activeTabSection =
    sectionNavigationMode === "tabs"
      ? tabSections.find((section) => section.key === activeSectionKey) ??
        tabSections[0] ??
        null
      : null;
  const setActiveSection = useCallback(
    (sectionKey: string) => {
      if (!activeVariant) {
        return;
      }
      setActiveSectionByVariant((current) => ({
        ...current,
        [activeVariant.key]: sectionKey,
      }));
    },
    [activeVariant],
  );
  // Ctrl/Cmd+1..9 jumps straight to the Nth section tab while the modal is
  // open (the legacy form's Ctrl+1..4 tab shortcuts, generalized).
  useEffect(() => {
    if (!isOpen || sectionNavigationMode !== "tabs" || tabSections.length === 0) {
      return;
    }
    const onSectionShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.shiftKey ||
        (!event.ctrlKey && !event.metaKey) ||
        !/^[1-9]$/.test(event.key)
      ) {
        return;
      }
      const targetSection = tabSections[Number(event.key) - 1];
      if (!targetSection) {
        return;
      }
      event.preventDefault();
      setActiveSection(targetSection.key);
    };
    window.addEventListener("keydown", onSectionShortcut);
    return () => window.removeEventListener("keydown", onSectionShortcut);
  }, [isOpen, sectionNavigationMode, setActiveSection, tabSections]);
  const handleSectionTabKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLButtonElement>,
      sectionIndex: number,
      sectionKey: string,
    ) => {
      if (sectionNavigationMode !== "tabs" || tabSections.length === 0) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (activeSectionKey !== sectionKey) {
          setActiveSection(sectionKey);
        }
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const formElement = formRef.current;
            if (!formElement) {
              return;
            }
            const firstFieldTarget = getFirstFocusableFieldTarget(formElement);
            if (!firstFieldTarget) {
              return;
            }
            focusFieldControl(firstFieldTarget.control);
          });
        });
        return;
      }
      let nextIndex = sectionIndex;
      if (event.key === "ArrowRight") {
        nextIndex = (sectionIndex + 1) % tabSections.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex = (sectionIndex - 1 + tabSections.length) % tabSections.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabSections.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const nextSection = tabSections[nextIndex];
      if (!nextSection) {
        return;
      }
      setActiveSection(nextSection.key);
      window.requestAnimationFrame(() => {
        sectionTabRefs.current[nextSection.key]?.focus();
      });
    },
    [activeSectionKey, sectionNavigationMode, setActiveSection, tabSections],
  );
  useEffect(() => {
    if (sectionNavigationMode !== "tabs" || !activeVariant || tabSections.length === 0) {
      return;
    }
    const activeKey = activeSectionByVariant[activeVariant.key];
    if (activeKey && tabSections.some((section) => section.key === activeKey)) {
      return;
    }
    setActiveSectionByVariant((current) => ({
      ...current,
      [activeVariant.key]: tabSections[0]?.key ?? "section-0",
    }));
  }, [activeSectionByVariant, activeVariant, sectionNavigationMode, tabSections]);
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
        const { nextValues } = commitFormData((current) => ({
          ...current,
          ...resultValues,
        }));
        revalidateFieldNames(Object.keys(resultValues), nextValues, fileData);
      }
      if (result.errors) {
        applyResolvedFieldErrors(result.errors);
      }
    },
    [applyResolvedFieldErrors, commitFormData, fileData, revalidateFieldNames],
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
    const visibleFieldNames = new Set(allVisibleFields.map((field) => field.name));
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
  }, [activeVariant, allVisibleFields]);
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
      if (nextFile && nextFile.type.startsWith("image/")) {
        const previewFieldName = name;
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === "string") {
            setFilePreviews((current) => ({
              ...current,
              [previewFieldName]: result,
            }));
          }
        };
        reader.readAsDataURL(nextFile);
      } else {
        setFilePreviews((current) => {
          if (!(name in current)) {
            return current;
          }
          const nextState = { ...current };
          delete nextState[name];
          return nextState;
        });
      }
    }
    const { previousValues, nextValues } = commitFormData((current) => ({
      ...current,
      [name]: nextValue,
    }));
    if (field) {
      const nextFiles = isFileInput
        ? {
            ...fileData,
            [name]: nextFile,
          }
        : fileData;
      revalidateFieldNames([name], nextValues, nextFiles);
      runFieldValueChangeHandler(field, nextValue, nextValues, previousValues);
    }
  };
  // `checkbox-group` fields keep the multi-select value shape (comma-joined
  // option values) but toggle one box at a time. Selections stay in the order
  // the options are declared so the stored string is stable regardless of the
  // order the user ticked them.
  const handleCheckboxGroupToggle = useCallback(
    (field: ERPDynamicModalField, optionValue: string) => {
      const fieldName = field.name;
      let nextFieldValue = "";
      const { previousValues, nextValues } = commitFormData((current) => {
        const existingValues = parseMultiSelectValue(current[fieldName] ?? "");
        const nextSelected = new Set(existingValues);
        if (nextSelected.has(optionValue)) {
          nextSelected.delete(optionValue);
        } else {
          nextSelected.add(optionValue);
        }
        const optionOrder = (field.options ?? []).map((option) => option.value);
        const orderedValues = [
          ...optionOrder.filter((value) => nextSelected.has(value)),
          // Values with no matching option (stale data) keep their place at the end.
          ...existingValues.filter(
            (value) => nextSelected.has(value) && !optionOrder.includes(value),
          ),
        ];
        nextFieldValue = formatMultiSelectValue(orderedValues);
        return {
          ...current,
          [fieldName]: nextFieldValue,
        };
      });
      revalidateFieldNames([fieldName], nextValues, fileData);
      runFieldValueChangeHandler(
        field,
        nextFieldValue,
        nextValues,
        previousValues,
      );
    },
    [commitFormData, fileData, revalidateFieldNames, runFieldValueChangeHandler],
  );
  const handleCheckboxKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      if (event.currentTarget.disabled) {
        return;
      }
      event.currentTarget.click();
    },
    [],
  );
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
      if (field.onSearchQueryChange) {
        void Promise.resolve(field.onSearchQueryChange(query)).catch(() => {
          // Search option refresh is optional and caller-owned.
        });
      }
    },
    [],
  );
  const handleSearchableSelectChoose = useCallback(
    (field: ERPDynamicModalField, option: ERPDynamicSelectOption) => {
      const fieldName = field.name;
      const isMultipleSelect =
        (field.type ?? "text") === "select" && field.multiple;
      let nextFieldValue = "";
      const { previousValues, nextValues } = commitFormData((current) => {
        nextFieldValue = isMultipleSelect
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
        return {
          ...current,
          [fieldName]: nextFieldValue,
        };
      });
      revalidateFieldNames([fieldName], nextValues, fileData);
      runFieldValueChangeHandler(
        field,
        nextFieldValue,
        nextValues,
        previousValues,
      );
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
    [commitFormData, fileData, revalidateFieldNames, runFieldValueChangeHandler],
  );
  // Backs the `setValue` handed to custom field renderers. Kept out of
  // `renderField` so the ref read never sits in a render-time closure.
  const setCustomFieldValue = useCallback(
    (field: ERPDynamicModalField, nextValue: string) => {
      const { previousValues, nextValues } = commitFormData((current) => ({
        ...current,
        [field.name]: nextValue,
      }));
      revalidateFieldNames([field.name], nextValues, fileData);
      runFieldValueChangeHandler(field, nextValue, nextValues, previousValues);
    },
    [commitFormData, fileData, revalidateFieldNames, runFieldValueChangeHandler],
  );
  const focusNextFieldControl = useCallback((originControl: HTMLElement) => {
    const formElement = formRef.current;
    if (!formElement) {
      return;
    }
    const container = originControl.closest<HTMLElement>(FIELD_CONTAINER_SELECTOR);
    const fieldName = container?.dataset.erpModalFieldName;
    if (!fieldName) {
      return;
    }
    const targets = getFocusableFieldTargets(formElement);
    const currentIndex = targets.findIndex(
      (target) => target.fieldName === fieldName,
    );
    const nextTarget = currentIndex >= 0 ? targets[currentIndex + 1] : undefined;
    if (nextTarget) {
      focusFieldControl(nextTarget.control);
    }
  }, []);
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
          const hasConfirmedValue = isMultipleSelect
            ? parseMultiSelectValue(fieldValue).length > 0
            : fieldValue.trim() !== "";
          if (hasConfirmedValue) {
            focusNextFieldControl(event.currentTarget);
            return;
          }
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
      focusNextFieldControl,
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
  // Notify owners when a searchable field opens/closes so they can lazily load
  // (or refresh) that field's options. Fires false for the field that just
  // closed and true for the one that just opened.
  useEffect(() => {
    const previousField = prevOpenSearchFieldRef.current;
    if (previousField === openSearchField) {
      return;
    }
    if (previousField) {
      const closedField = activeVariant?.fields.find(
        (item) => item.name === previousField,
      );
      closedField?.onSearchOpenChange?.(false);
    }
    if (openSearchField) {
      const openedField = activeVariant?.fields.find(
        (item) => item.name === openSearchField,
      );
      openedField?.onSearchOpenChange?.(true);
    }
    prevOpenSearchFieldRef.current = openSearchField;
  }, [openSearchField, activeVariant]);
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
  const focusFirstInvalidField = useCallback(
    (
      variant: ERPDynamicModalVariant,
      values: Record<string, string>,
      validationErrors: Record<string, string>,
    ) => {
      const [firstErrorFieldName] = Object.keys(validationErrors);
      if (!firstErrorFieldName) {
        return;
      }
      if (sectionNavigationMode === "tabs") {
        const nextSections = buildFormSections(resolveVisibleFields(variant, values));
        const matchingSection = nextSections.find((section) =>
          section.fields.some((field) => field.name === firstErrorFieldName),
        );
        if (matchingSection) {
          setActiveSectionByVariant((current) => ({
            ...current,
            [variant.key]: matchingSection.heading?.name ?? "section-0",
          }));
        }
      }
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const element = document.getElementById(
            `erp-modal-form-${variant.key}-${firstErrorFieldName}`,
          );
          if (!(element instanceof HTMLElement)) {
            return;
          }
          element.focus();
          element.scrollIntoView({
            block: "nearest",
            inline: "nearest",
          });
        });
      });
    },
    [sectionNavigationMode],
  );
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeVariant || isSubmitting) {
      return;
    }
    const validationErrors = validateVariant(activeVariant, formData);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      onValidationError?.(validationErrors, activeVariant.key);
      if (focusFirstInvalidFieldOnValidationError) {
        focusFirstInvalidField(activeVariant, formData, validationErrors);
      }
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit?.({
        variantKey: activeVariant.key,
        variant: activeVariant,
        values: formData,
        files: fileData,
        sectionExpandedState: activeSectionExpandedState ?? {},
      });
      if (resetOnSubmit) {
        replaceFormData(buildInitialValues(activeVariant, initialValuesByVariant));
        setFileData({});
        setFilePreviews({});
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
  // Bare Enter walks to the next control instead of submitting. Saving is the
  // Ctrl/Cmd+Enter chord (handled by the window listener above), so this must
  // never swallow a modified Enter.
  const handleFieldEnterAdvance = useCallback(
    (event: ReactKeyboardEvent<HTMLFormElement>) => {
      if (
        event.key !== "Enter" ||
        event.defaultPrevented ||
        event.altKey ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      // Controls where Enter already means something native: newlines, clicks.
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement ||
        target.isContentEditable ||
        target.getAttribute("role") === "button" ||
        (target instanceof HTMLAnchorElement && target.hasAttribute("href"))
      ) {
        return;
      }
      // Blocks the browser's implicit submission via the footer Save button,
      // which owns this form through its `form` attribute.
      event.preventDefault();
      const container = target.closest<HTMLElement>(FIELD_CONTAINER_SELECTOR);
      if (!container || container.dataset.erpModalFieldType === "custom") {
        return;
      }
      focusNextFieldControl(target);
    },
    [focusNextFieldControl],
  );
  const handleFieldArrowNavigation = useCallback(
    (event: ReactKeyboardEvent<HTMLFormElement>) => {
      if (
        !enableArrowKeyFieldNavigation ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      const direction =
        event.key === "ArrowLeft"
          ? "left"
          : event.key === "ArrowRight"
            ? "right"
            : event.key === "ArrowUp"
              ? "up"
              : event.key === "ArrowDown"
                ? "down"
                : null;
      if (!direction) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (
        target.closest('[data-erp-modal-search-dropdown="true"]') ||
        target.getAttribute("role") === "searchbox" ||
        target.getAttribute("data-search-select-input") === "true"
      ) {
        return;
      }
      const currentContainer = target.closest<HTMLElement>(FIELD_CONTAINER_SELECTOR);
      if (!currentContainer) {
        return;
      }
      if (currentContainer.dataset.erpModalFieldType === "custom") {
        return;
      }
      const formElement = formRef.current;
      if (!formElement) {
        return;
      }
      const targets = getFocusableFieldTargets(formElement);
      const currentFieldName = currentContainer.dataset.erpModalFieldName;
      const currentFieldTarget = currentFieldName
        ? targets.find((entry) => entry.fieldName === currentFieldName)
        : undefined;
      if (!currentFieldTarget) {
        return;
      }
      const nextTarget = findNextFieldTarget(targets, currentFieldTarget, direction);
      if (!nextTarget) {
        if (
          direction === "up" &&
          sectionNavigationMode === "tabs" &&
          activeSectionKey
        ) {
          const activeTab = sectionTabRefs.current[activeSectionKey];
          if (activeTab) {
            event.preventDefault();
            activeTab.focus();
          }
        }
        return;
      }
      event.preventDefault();
      focusFieldControl(nextTarget.control);
    },
    [activeSectionKey, enableArrowKeyFieldNavigation, sectionNavigationMode],
  );
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
  const getSectionGridStyle = (
    heading: ERPDynamicModalField | null,
  ): CSSProperties | undefined => {
    const styles: CSSProperties = {};
    if (
      typeof heading?.sectionGridColumns === "number" &&
      Number.isFinite(heading.sectionGridColumns) &&
      heading.sectionGridColumns > 0
    ) {
      styles["--erp-modal-section-columns" as keyof CSSProperties] = String(
        Math.max(1, Math.floor(heading.sectionGridColumns)),
      ) as never;
    }
    if (!denseGrid) {
      styles.gridAutoFlow = "row";
    }
    return Object.keys(styles).length > 0 ? styles : undefined;
  };
  const renderField = (
    field: ERPDynamicModalField,
    sectionRowStartOffset?: number | null,
  ) => {
    const fieldValue = formData[field.name] ?? "";
    const selectedFile = fileData[field.name] ?? null;
    const fieldError = fieldErrors[field.name];
    const inputType = field.type ?? "text";
    const fieldRequired = isFieldRequired(field, formData);
    // `disabled` is the fixed answer; `disabledWhen` re-decides on every render from
    // the current values, for controls another field switches off (a payment
    // integration block that only applies to one tender type, say).
    const fieldDisabled = isFieldDisabled(field, formData);
    if (inputType === "heading") {
      return null;
    }
    if (inputType === "subheading") {
      return (
        <div
          key={field.name}
          className={cx(styles.field, styles.fieldWide, styles.subheadingField, "erp-ms-modal-band")}
        >
          <span className={cx(styles.subheading, "erp-ms-modal-band-title")}>{field.label}</span>
        </div>
      );
    }
    const isMultiSelect = inputType === "select" && field.multiple;
    const isCheckboxGroup = inputType === "checkbox-group";
    const selectedValues =
      isMultiSelect || isCheckboxGroup
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
    const shouldUseSearchableSelect =
      inputType === "select" && field.searchable !== false;
    const isSearchOpen = openSearchField === field.name;
    const searchTriggerValue = isMultiSelect
      ? searchInputValue
      : isSearchOpen
        ? searchInputValue
        : selectedLabel;
    const searchTriggerPlaceholder = isMultiSelect
      ? selectedOptionEntries.length
        ? ""
        : (field.placeholder ?? `Select ${field.label}`)
      : selectedLabel || (field.placeholder ?? `Select ${field.label}`);
    const normalizedQuery = (searchQuery ?? "")
      .trim()
      .toLowerCase();
    const filteredOptions = !shouldUseSearchableSelect
      ? []
      : field.serverSearch
        ? // Options are already filtered by the owner (server-side/lazy dropdown).
          (field.options ?? [])
        : (field.options ?? []).filter((option) => {
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
          });
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
    const helpId = !hideFieldHelperText && field.helperText
      ? `${controlId}-help`
      : undefined;
    const storedFileName =
      inputType === "file" && !selectedFile ? fieldValue.trim() : "";
    const storedFilePreview =
      inputType === "file" && field.previewImageValueKey
        ? (formData[field.previewImageValueKey] ?? "").trim()
        : "";
    const filePreviewSource =
      inputType === "file"
        ? selectedFile
          ? (filePreviews[field.name] ?? "")
          : storedFilePreview
        : "";
    const fileId =
      selectedFile || storedFileName ? `${controlId}-file` : undefined;
    const errorId =
      fieldError && !hideFieldErrorText ? `${controlId}-error` : undefined;
    const describedBy =
      [helpId, fileId, errorId].filter(Boolean).join(" ") ||
      undefined;
    const commonProps = {
      id: controlId,
      name: field.name,
      required: fieldRequired,
      disabled: fieldDisabled || isSubmitting,
      onChange: handleChange,
      autoComplete: "off",
      "aria-invalid": fieldError ? true : undefined,
      "aria-describedby": describedBy,
    };
    const setCustomValue = (nextValue: string) => {
      setCustomFieldValue(field, nextValue);
    };
    const setCustomError = (message: string | null | undefined) => {
      applyResolvedFieldErrors({
        [field.name]: message,
      });
    };
    const normalizedGridRowStart =
      field.gridRowStart !== undefined
        ? Math.max(
            1,
            Math.floor(field.gridRowStart) -
              Math.max(0, (sectionRowStartOffset ?? 1) - 1),
          )
        : undefined;
    return (
      <div
        key={field.name}
        data-erp-modal-field-name={field.name}
        data-erp-modal-field-type={inputType}
        className={cx(
          styles.field,
          "erp-ms-modal-field",
          stackLabels &&
            inputType !== "checkbox" &&
            styles.fieldStacked,
          field.colSpan === 2 && styles.fieldWide,
          inputType === "checkbox" && styles.checkboxField,
        )}
        style={{
          ...(field.fieldStyle ?? {}),
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
                gridRowStart: normalizedGridRowStart,
              }
            : {}),
        }}
      >
        {inputType !== "checkbox" && field.label.trim().length > 0 ? (
          <label
            className={cx(styles.label, "erp-ms-modal-label")}
            // A checkbox group has no single control to label; it names the
            // group through `aria-labelledby` instead.
            id={isCheckboxGroup ? `${controlId}-label` : undefined}
            htmlFor={isCheckboxGroup ? undefined : commonProps.id}
          >
            {field.label}{" "}
            {fieldRequired ? (
              <span className={styles.requiredMark}>*</span>
            ) : null}
          </label>
        ) : null}
        {inputType === "custom" ? (
          field.render?.({
            disabled: Boolean(fieldDisabled || isSubmitting),
            error: fieldError ?? null,
            field,
            setError: setCustomError,
            setValue: setCustomValue,
            value: fieldValue,
            values: formData,
          }) ?? null
        ) : shouldUseSearchableSelect ? (
          <div
            className={styles.searchSelect}
            ref={(element) => {
              searchSelectRefs.current[field.name] = element;
            }}
          >
            <div
              className={cx(
                styles.searchSelectTrigger,
                "erp-ms-modal-control erp-ms-modal-trigger",
                isMultiSelect && styles.searchMultiSelectControl,
                showAddButton &&
                  Boolean(field.onSearchCreateShortcut) &&
                  styles.searchSelectTriggerWithAdd,
                fieldError && styles.controlInvalid,
                isSearchOpen && styles.searchSelectTriggerOpen,
                (fieldDisabled || isSubmitting) &&
                  styles.searchSelectTriggerDisabled,
              )}
              onMouseDown={(event) => {
                const target = event.target as HTMLElement;
                if (
                  target.closest('[data-search-select-remove="true"]') ||
                  target.closest('[data-search-select-chevron="true"]') ||
                  target.closest('[data-search-select-add="true"]') ||
                  target.closest('[data-search-select-input="true"]')
                ) {
                  return;
                }
                event.preventDefault();
                if (fieldDisabled || isSubmitting) {
                  return;
                }
                searchInputRefs.current[field.name]?.focus();
                setOpenSearchField(field.name);
              }}
            >
              {isMultiSelect && selectedOptionEntries.length ? (
                <div className={styles.searchSelectValueTokens}>
                  {selectedOptionEntries.map((option) => (
                    <span
                      key={`${field.name}-selected-${option.value}`}
                      className={styles.searchSelectToken}
                    >
                      <span className={styles.searchSelectTokenText}>
                        {option.label}
                      </span>
                      <button
                        type="button"
                        data-search-select-remove="true"
                        className={styles.searchSelectTokenRemove}
                        aria-label={`Remove ${option.label}`}
                        disabled={fieldDisabled || isSubmitting}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (fieldDisabled || isSubmitting) {
                            return;
                          }
                          handleSearchableSelectChoose(field, option);
                        }}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <input
                id={controlId}
                data-erp-modal-field-control="true"
                data-search-select-input="true"
                type="text"
                autoComplete="off"
                className={cx(
                  styles.searchSelectInput,
                  "erp-ms-modal-select-input",
                  isMultiSelect && styles.searchSelectInputMulti,
                )}
                role="combobox"
                aria-expanded={isSearchOpen}
                aria-controls={`${controlId}-search-list`}
                aria-activedescendant={activeDescendantId}
                aria-autocomplete="list"
                aria-required={fieldRequired ? true : undefined}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={describedBy}
                disabled={fieldDisabled || isSubmitting}
                value={searchTriggerValue}
                placeholder={searchTriggerPlaceholder}
                ref={(element) => {
                  searchInputRefs.current[field.name] = element;
                }}
                onFocus={(event) => {
                  event.currentTarget.select();
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  if (fieldDisabled || isSubmitting) {
                    return;
                  }
                  setOpenSearchField(field.name);
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
              {showAddButton && field.onSearchCreateShortcut ? (
                <button
                  type="button"
                  tabIndex={-1}
                  data-search-select-add="true"
                  className={styles.searchSelectAddButton}
                  aria-label={`Add new ${field.label}`}
                  title={`Add new ${field.label} (Alt+C)`}
                  disabled={fieldDisabled || isSubmitting}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (fieldDisabled || isSubmitting) {
                      return;
                    }
                    void field.onSearchCreateShortcut?.({
                      fieldName: field.name,
                      query: (searchQueries[field.name] ?? "").trim(),
                      value: fieldValue,
                      values: { ...formData },
                    });
                  }}
                >
                  <svg viewBox="0 0 20 20" className={styles.searchSelectAddIcon} aria-hidden="true">
                    <path
                      d="M10 4.5v11M4.5 10h11"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              ) : null}
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                data-search-select-chevron="true"
                className={styles.searchSelectChevronSlot}
                disabled={fieldDisabled || isSubmitting}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (fieldDisabled || isSubmitting) {
                    return;
                  }
                  if (isSearchOpen) {
                    setOpenSearchField(null);
                    searchInputRefs.current[field.name]?.blur();
                  } else {
                    searchInputRefs.current[field.name]?.focus();
                    setOpenSearchField(field.name);
                  }
                }}
              >
                <svg
                  viewBox="0 0 20 20"
                  className={cx(
                    styles.searchSelectChevron,
                    "erp-ms-modal-chevron",
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
              </button>
            </div>
            {isSearchOpen && !fieldDisabled ? (
              <div
                id={`${controlId}-search-list`}
                data-erp-modal-search-dropdown="true"
                className={cx(
                  styles.searchSelectList,
                  searchDropdownPlacement === "up" &&
                    styles.searchSelectListUp,
                )}
                style={{
                  maxHeight: `${searchDropdownMaxHeight}px`,
                }}
              >
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
        ) : inputType === "select" ? (
          <select
            {...commonProps}
            data-erp-modal-field-control="true"
            value={fieldValue}
            multiple={isMultiSelect}
            className={cx(
              styles.control,
              "erp-ms-modal-control",
              fieldError && styles.controlInvalid,
            )}
            style={field.controlStyle}
          >
            {!isMultiSelect ? (
              <option value="" hidden>
                {field.placeholder ?? `Select ${field.label}`}
              </option>
            ) : null}
            {(field.options ?? []).map((option) => (
              <option key={`${field.name}-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : isCheckboxGroup ? (
          <div
            className={cx(styles.checkboxGroup, "erp-ms-modal-check-group")}
            role="group"
            aria-labelledby={
              field.label.trim().length > 0 ? `${controlId}-label` : undefined
            }
            aria-describedby={describedBy}
          >
            {(field.options ?? []).map((option, optionIndex) => {
              const optionId = `${controlId}-${option.value}`;
              return (
                <label
                  key={optionId}
                  className={cx(
                    styles.checkboxGroupOption,
                    "erp-ms-modal-check-item",
                  )}
                  htmlFor={optionId}
                >
                  <input
                    id={optionId}
                    type="checkbox"
                    // Arrow-key field navigation targets one control per field.
                    data-erp-modal-field-control={
                      optionIndex === 0 ? "true" : undefined
                    }
                    autoComplete="off"
                    disabled={fieldDisabled || isSubmitting}
                    checked={selectedValues.includes(option.value)}
                    onChange={() =>
                      handleCheckboxGroupToggle(field, option.value)
                    }
                    onKeyDown={handleCheckboxKeyDown}
                    className={cx(
                      styles.checkboxControl,
                      "erp-ms-modal-check",
                      fieldError && styles.checkboxControlInvalid,
                    )}
                    style={field.controlStyle}
                  />
                  <span
                    className={cx(
                      styles.checkboxGroupOptionLabel,
                      "erp-ms-modal-check-label",
                    )}
                  >
                    {option.label}
                  </span>
                </label>
              );
            })}
          </div>
        ) : inputType === "checkbox" ? (
          <label
            className={styles.checkboxWrapper}
            htmlFor={commonProps.id}
          >
            <input
              {...commonProps}
              type="checkbox"
              data-erp-modal-field-control="true"
              autoComplete="off"
              onKeyDown={handleCheckboxKeyDown}
              checked={fieldValue === "true"}
              className={cx(
                styles.checkboxControl,
                "erp-ms-modal-check",
                fieldError && styles.checkboxControlInvalid,
              )}
              style={field.controlStyle}
            />
            <span className={cx(styles.checkboxLabel, "erp-ms-modal-check-label")}>
              {field.label}
              {fieldRequired ? (
                <span className={styles.requiredMark}>*</span>
              ) : null}
            </span>
          </label>
        ) : inputType === "textarea" ? (
          <textarea
            {...commonProps}
            data-erp-modal-field-control="true"
            value={fieldValue}
            rows={field.rows ?? 4}
            placeholder={field.placeholder}
            autoComplete="off"
            className={cx(
              styles.control,
              "erp-ms-modal-control",
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
              data-erp-modal-field-control="true"
              autoComplete="off"
              accept={field.accept}
              className={cx(
                styles.control,
                "erp-ms-modal-control",
              "erp-ms-modal-control",
                styles.fileInput,
                fieldError && styles.controlInvalid,
              )}
              style={field.controlStyle}
            />
            {filePreviewSource ? (
              <img
                src={filePreviewSource}
                alt={`${field.label} preview`}
                className={styles.filePreviewImage}
              />
            ) : null}
            {selectedFile ? (
              <p id={fileId} className={styles.fileMeta}>
                {`${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`}
              </p>
            ) : storedFileName ? (
              <p id={fileId} className={styles.fileMeta}>
                {storedFileName}
              </p>
            ) : null}
          </div>
        ) : inputType === "color" ? (
          <ERPColorPicker
            id={commonProps.id}
            value={fieldValue || "#000000"}
            onChange={setCustomValue}
            disabled={commonProps.disabled}
            invalid={Boolean(fieldError)}
            label={field.label}
            aria-describedby={describedBy}
            style={field.controlStyle}
          />
        ) : (
          <input
            {...commonProps}
            data-erp-modal-field-control="true"
            value={fieldValue}
            type={inputType}
            placeholder={field.placeholder}
            autoComplete="off"
            inputMode={field.inputMode}
            min={field.min}
            max={field.max}
            step={field.step}
            className={cx(
              styles.control,
              "erp-ms-modal-control",
              fieldError && styles.controlInvalid,
            )}
            style={field.controlStyle}
          />
        )}
        {!hideFieldHelperText && field.helperText ? (
          <p id={helpId} className={cx(styles.helpText, "erp-ms-modal-help")}>
            {field.helperText}
          </p>
        ) : null}
        {!hideFieldErrorText && fieldError ? (
          <p id={errorId} className={cx(styles.errorText, "erp-ms-modal-error")}>
            {fieldError}
          </p>
        ) : null}
      </div>
    );
  };
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
        <ModalPortal>
        <div className={cx(styles.overlay, "erp-ms-modal-overlay")} style={modalStyle}>
          <div
            className={styles.backdrop}
            onClick={closeOnBackdrop ? closeModal : undefined}
            aria-hidden
          />
          <section
            className={cx(styles.panel, "erp-ms-modal", panelClassName)}
            style={panelStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-title`}
          >
            <header className={cx(styles.header, "erp-ms-modal-header")}>
              <div className={styles.headerRow}>
                <div className={styles.headerIntro}>
                  <span className={cx(styles.headerIcon, "erp-ms-modal-icon")} aria-hidden="true">
                    {activeVariant.icon ?? <IconPlaceholder />}
                  </span>
                  <div className={styles.headerText}>
                    <h3 id={`${formId}-title`} className={cx(styles.headerTitle, "erp-ms-modal-title")}>
                      {activeVariant.modalTitle}
                      {headerModeLabel ? (
                        <span className="erp-ms-modal-mode">
                          {" — "}
                          {headerModeLabel}
                        </span>
                      ) : null}
                    </h3>
                    {activeVariant.modalDescription ? (
                      <p className={cx(styles.headerDescription, "erp-ms-modal-subtitle")}>
                        {activeVariant.modalDescription}
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  className={cx(styles.closeButton, "erp-ms-modal-close")}
                  onClick={closeModal}
                  aria-label="Close modal"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className={styles.closeIcon}
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
              className={cx(styles.scrollArea, "erp-ms-modal-body")}
              ref={scrollAreaRef}
              data-erp-modal-scroll-area="true"
            >
              {sectionNavigationMode === "tabs" && tabSections.length > 0 ? (
                <div className={cx(styles.sectionTabs, "erp-ms-modal-tabs")} role="tablist" aria-label="Form sections">
                  {tabSections.map((section, sectionIndex) => (
                    <button
                      key={section.key}
                      ref={(element) => {
                        sectionTabRefs.current[section.key] = element;
                      }}
                      type="button"
                      role="tab"
                      aria-selected={section.key === activeSectionKey}
                      aria-controls={`${formId}-${section.key}-panel`}
                      id={`${formId}-${section.key}-tab`}
                      tabIndex={section.key === activeSectionKey ? 0 : -1}
                      className={cx(
                        styles.sectionTab,
                        "erp-ms-modal-tab",
                        section.key === activeSectionKey && styles.sectionTabActive,
                      )}
                      onClick={() => setActiveSection(section.key)}
                      onKeyDown={(event) =>
                        handleSectionTabKeyDown(event, sectionIndex, section.key)
                      }
                    >
                      {section.label}
                      {sectionErrorCounts[section.key] ? (
                        <span
                          className={styles.sectionTabBadge}
                          aria-label={`${sectionErrorCounts[section.key]} field errors`}
                        >
                          {sectionErrorCounts[section.key]}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
              <form
                id={formId}
                ref={formRef}
                onSubmit={handleSubmit}
                onKeyDown={(event) => {
                  handleFieldEnterAdvance(event);
                  handleFieldArrowNavigation(event);
                }}
                noValidate
                autoComplete="off"
                className={styles.formGrid}
                style={formGridStyle}
              >
                {sectionNavigationMode === "tabs" ? (
                  activeTabSection ? (
                    <div
                      id={`${formId}-${activeTabSection.key}-panel`}
                      role="tabpanel"
                      aria-labelledby={`${formId}-${activeTabSection.key}-tab`}
                      className={styles.sectionFields}
                      style={getSectionGridStyle(activeTabSection.section.heading)}
                    >
                      {activeTabSection.section.fields.map((field) =>
                        renderField(
                          field,
                          getSectionRowStartOffset(activeTabSection.section.fields),
                        ),
                      )}
                    </div>
                  ) : null
                ) : (
                  visibleSections.map((section, sectionIndex) => {
                    const heading = section.heading;
                    const sectionKey = heading?.name ?? `section-${sectionIndex}`;
                    const sectionRowStartOffset = getSectionRowStartOffset(
                      section.fields,
                    );
                    const sectionExpanded = heading
                      ? (activeSectionExpandedState?.[heading.name] ?? true)
                      : true;
                    const sectionToggleId = heading
                      ? `${formId}-${heading.name}-section-toggle`
                      : undefined;
                    return (
                      <Fragment key={sectionKey}>
                        {heading ? (
                          <div
                            className={cx(
                              styles.field,
                              styles.fieldWide,
                              styles.sectionHeadingField,
                              "erp-ms-modal-band",
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
                                onChange={() => toggleSectionExpanded(heading.name)}
                              />
                              <span className={cx(styles.sectionHeading, "erp-ms-modal-band-title")}>
                                {heading.label}
                              </span>
                            </label>
                            {heading.helperText ? (
                              <p className={styles.sectionHeadingDescription}>
                                {heading.helperText}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {sectionExpanded ? (
                          <div
                            className={styles.sectionFields}
                            style={getSectionGridStyle(heading)}
                          >
                            {section.fields.map((field) =>
                              renderField(field, sectionRowStartOffset),
                            )}
                          </div>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </form>
            </div>
            <footer className={cx(styles.footer, "erp-ms-modal-footer")}>
              {footerLeadingActions ? (
                <div className={cx(styles.footerLeading, "erp-ms-modal-footer-leading")}>
                  {footerLeadingActions({ variantKey: activeVariant.key, values: formData })}
                </div>
              ) : null}
              {submitError ? (
                <p className={styles.submitError} role="alert">
                  {submitError}
                </p>
              ) : null}
              <div className={cx(styles.footerActions, "erp-ms-modal-footer-actions")}>
                <button
                  type="button"
                  className={cx(styles.cancelButton, "erp-ms-modal-cancel")}
                  onClick={handleCancel}
                  disabled={isSubmitting}
                >
                  <span className={styles.footerButtonIcon}>
                    <ModalFooterCancelIcon />
                  </span>
                  <span>Cancel</span>
                </button>
                <button
                  type="submit"
                  form={formId}
                  className={cx(styles.submitButton, "erp-ms-modal-save")}
                  disabled={isSubmitting}
                >
                  <span className={styles.footerButtonIcon}>
                    <ModalFooterSubmitIcon label={activeVariant.submitLabel} />
                  </span>
                  <span>
                    {isSubmitting ? "Saving..." : activeVariant.submitLabel}
                  </span>
                </button>
              </div>
            </footer>
          </section>
        </div>
        </ModalPortal>
      ) : null}
    </section>
  );
}
export default ERPDynamicModalForm;
