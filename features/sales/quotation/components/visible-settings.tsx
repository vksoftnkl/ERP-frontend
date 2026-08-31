"use client";

/**
 * Visible Settings — the header panel's right-click field configuration.
 *
 * The same backend config the master screens use (`fixed.form_section` /
 * `fixed.form_field`, here menu 14 "Quotation" on the Web platform): which of
 * the header AND Terms fields this deployment shows, and what it calls them.
 * Each panel has its own section, so a site can drop the whole Terms block by
 * turning its section off.
 *
 * Visibility and labels only, never order. The header blocks are a
 * hand-laid-out layout the legacy screen shares, so a configured position has
 * nothing meaningful to move here — the master pages call this same choice
 * `visibility-only`. The two grids are not configured from it at all: they take
 * their columns from `fixed.ui_table_columns` (their own right-click "Admin
 * settings").
 *
 * Right-click is already spoken for on the two grids, so this one is scoped to
 * the header panel and the Terms block, and the two never compete for the same
 * click.
 */
import {
  useCallback,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { toast } from "react-toastify";
import { cx } from "@/components/design-system/cx";
import WidgetVisibilityTree, {
  type WidgetTreeSectionView,
} from "@/features/masters/shared/widget-visibility-tree";
import {
  buildControllableFieldNames,
  buildWidgetFieldConfigFromSections,
  type WidgetMasterSectionConfig,
} from "@/features/masters/shared/widget-config";
import {
  useGetQuotationWidgetConfigQuery,
  useSaveQuotationWidgetVisibilityMutation,
} from "@/store/api/quotationApi";
import {
  QUOTATION_HEADER_FIELD_NAMES,
  QUOTATION_TERMS_FIELD_NAMES,
  type QuotationHeaderFieldKey,
  type QuotationTermsFieldKey,
} from "../quotation.constants";
import { ModalShell } from "./modal-shell";
import styles from "../page.module.scss";

/** A stable identity for the query's default, so the memos below do not rerun. */
const NO_SECTIONS: WidgetMasterSectionConfig[] = [];
/**
 * The configured field names that map to a real field on this screen. The rest
 * are left out of the dialog, rather than offering a checkbox that would toggle
 * nothing.
 */
const CONTROLLABLE_FIELD_NAMES = buildControllableFieldNames({
  ...QUOTATION_HEADER_FIELD_NAMES,
  ...QUOTATION_TERMS_FIELD_NAMES,
});
const TERMS_FIELD_KEYS = Object.keys(QUOTATION_TERMS_FIELD_NAMES) as QuotationTermsFieldKey[];

/** What the header blocks read to decide whether — and how — to render a field. */
export type HeaderFieldConfig = {
  /** False only when the config explicitly hides the field. */
  isVisible: (key: QuotationHeaderFieldKey) => boolean;
  /** The configured label, falling back to the one the screen ships with. */
  labelFor: (key: QuotationHeaderFieldKey) => string;
};

/** The same, for the Terms panel's own section. */
export type TermsFieldConfig = {
  isVisible: (key: QuotationTermsFieldKey) => boolean;
  labelFor: (key: QuotationTermsFieldKey) => string;
  /** False once every row is hidden: the panel has nothing left to frame. */
  anyVisible: boolean;
};

export type VisibleSettings = HeaderFieldConfig & {
  /** Put this on the Terms panel; it reads the same config. */
  terms: TermsFieldConfig;
  /** Put this on the header panel; it opens the dialog. */
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  /** True while the dialog is up, so the screen's function keys stand down. */
  isOpen: boolean;
  /** The dialog portal; render once. */
  overlays: ReactNode;
};

export function useVisibleSettings(): VisibleSettings {
  const {
    data: sections = NO_SECTIONS,
    isLoading,
    isError,
  } = useGetQuotationWidgetConfigQuery();
  const [saveVisibility, saveState] = useSaveQuotationWidgetVisibilityMutation();
  const [open, setOpen] = useState(false);
  // Edits, held here rather than written back into the fetched config: a tick
  // previews on the form immediately, and closing the dialog without saving
  // drops them all at once. After a save they are kept — they are what was
  // saved, so the refetch that follows agrees with them and nothing flickers.
  const [sectionVisible, setSectionVisible] = useState<Map<number, boolean>>(() => new Map());
  const [fieldVisible, setFieldVisible] = useState<Map<string, boolean>>(() => new Map());
  const [secondaryText, setSecondaryText] = useState<Map<number, string>>(() => new Map());

  // The config as the form should read it: what the server sent, with the
  // pending edits laid over it. A field of a hidden section is hidden too —
  // each section here IS a panel (the header, the Terms block), so turning one
  // off is how a site drops that panel whole.
  const resolved = useMemo(() => {
    const config = buildWidgetFieldConfigFromSections(sections);
    for (const section of sections) {
      const sectionOn =
        sectionVisible.get(section.sectionId) ?? section.sectionVisibility !== false;
      for (const field of section.fields ?? []) {
        const key = (field.fieldName ?? "").trim().toLowerCase();
        const entry = config.get(key);
        if (!entry) {
          continue;
        }
        config.set(key, {
          ...entry,
          secondaryText: secondaryText.get(field.fieldId) ?? entry.secondaryText,
          visible: sectionOn && (fieldVisible.get(key) ?? entry.visible),
        });
      }
    }
    return config;
  }, [fieldVisible, sections, sectionVisible, secondaryText]);

  // A field the config says nothing about keeps its shipped label and stays on,
  // so an empty or failed fetch leaves the screen exactly as authored.
  const visibleByName = useCallback(
    (shipped: string) => resolved.get(shipped.toLowerCase())?.visible ?? true,
    [resolved],
  );
  const labelByName = useCallback(
    (shipped: string) => {
      const entry = resolved.get(shipped.toLowerCase());
      // Secondary text is the operator's own re-label, so it outranks the
      // config's GUI name the way it does on the master forms.
      return (entry?.secondaryText ?? "").trim() || entry?.label || shipped;
    },
    [resolved],
  );
  const isVisible = useCallback(
    (key: QuotationHeaderFieldKey) => visibleByName(QUOTATION_HEADER_FIELD_NAMES[key]),
    [visibleByName],
  );
  const labelFor = useCallback(
    (key: QuotationHeaderFieldKey) => labelByName(QUOTATION_HEADER_FIELD_NAMES[key]),
    [labelByName],
  );
  const terms = useMemo<TermsFieldConfig>(
    () => ({
      isVisible: (key) => visibleByName(QUOTATION_TERMS_FIELD_NAMES[key]),
      labelFor: (key) => labelByName(QUOTATION_TERMS_FIELD_NAMES[key]),
      anyVisible: TERMS_FIELD_KEYS.some((key) =>
        visibleByName(QUOTATION_TERMS_FIELD_NAMES[key]),
      ),
    }),
    [labelByName, visibleByName],
  );

  const treeSections = useMemo<WidgetTreeSectionView[]>(
    () =>
      sections.map((section) => ({
        sectionId: section.sectionId,
        label: section.sectionGuiName?.trim() || section.sectionName || "Section",
        visible: sectionVisible.get(section.sectionId) ?? section.sectionVisibility !== false,
        fields: (section.fields ?? []).map((field) => {
          const key = (field.fieldName ?? "").trim().toLowerCase();
          return {
            fieldId: field.fieldId,
            fieldName: field.fieldName,
            label: (field.fieldGuiName ?? "").trim() || field.fieldName,
            secondaryText: secondaryText.get(field.fieldId) ?? field.fieldSecondaryText ?? "",
            // The field's own flag, not the effective one: a hidden section
            // already reads as off on its own row, and turning it back on must
            // restore the fields that were ticked rather than none of them.
            checked: fieldVisible.get(key) ?? field.fieldVisibility !== false,
            controllable: CONTROLLABLE_FIELD_NAMES.has(key),
          };
        }),
      })),
    [fieldVisible, sections, sectionVisible, secondaryText],
  );

  const onToggleSection = useCallback((sectionId: number, checked: boolean) => {
    setSectionVisible((current) => new Map(current).set(sectionId, checked));
  }, []);
  const onToggleField = useCallback((fieldName: string, checked: boolean) => {
    setFieldVisible((current) => new Map(current).set(fieldName.trim().toLowerCase(), checked));
  }, []);
  const onChangeSecondaryText = useCallback((fieldId: number, value: string) => {
    setSecondaryText((current) => new Map(current).set(fieldId, value));
  }, []);

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    // Right-clicking one of the comboboxes focuses it on mousedown, which opens
    // its menu — and the popup layer sits ABOVE the modal one, so that menu
    // would hang over the dialog this click is opening. Dropping focus closes it
    // (the combo closes on blur), and the operator did not ask for it anyway.
    (document.activeElement as HTMLElement | null)?.blur();
    setOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    if (saveState.isLoading) {
      return;
    }
    setSectionVisible(new Map());
    setFieldVisible(new Map());
    setSecondaryText(new Map());
    setOpen(false);
  }, [saveState.isLoading]);

  // Every section is sent whole: the server updates by `sectionId` / `fieldId`
  // and rolls the whole batch back if one is missing, so a partial body would
  // not be a partial save.
  const onSave = useCallback(async () => {
    try {
      await saveVisibility({
        data: sections.map((section) => ({
          sectionId: section.sectionId,
          sectionGuiName: section.sectionGuiName?.trim() || section.sectionName || "Section",
          sectionVisibility:
            sectionVisible.get(section.sectionId) ?? section.sectionVisibility !== false,
          fields: (section.fields ?? []).map((field) => {
            const key = (field.fieldName ?? "").trim().toLowerCase();
            return {
              fieldId: field.fieldId,
              // The DTO wants a string for both, and an unconfigured row
              // carries null.
              fieldSecondaryText:
                secondaryText.get(field.fieldId) ?? field.fieldSecondaryText ?? "",
              fieldVisibility: fieldVisible.get(key) ?? field.fieldVisibility !== false,
            };
          }),
        })),
      }).unwrap();
      setOpen(false);
    } catch {
      toast.error("Could not save the field settings.");
    }
  }, [fieldVisible, saveVisibility, sections, sectionVisible, secondaryText]);

  const dialog = (
    <ModalShell
      title="Visible Settings"
      isOpen={open}
      onClose={closeDialog}
      footer={
        <>
          <span className={styles.settingsNote}>
            Applies to this screen for every user.
          </span>
          <span className={styles.settingsFooterActions}>
            <button
              type="button"
              className={styles.button}
              disabled={saveState.isLoading}
              onClick={closeDialog}
            >
              Close
            </button>
            <button
              type="button"
              className={cx(styles.button, styles.buttonPrimary)}
              disabled={saveState.isLoading || sections.length === 0}
              onClick={() => void onSave()}
            >
              {saveState.isLoading ? "Saving…" : "Save"}
            </button>
          </span>
        </>
      }
    >
      <WidgetVisibilityTree
        sections={treeSections}
        loading={isLoading}
        error={isError ? "Unable to load the field configuration." : null}
        disabled={saveState.isLoading}
        onToggleSection={onToggleSection}
        onToggleField={onToggleField}
        onChangeSecondaryText={onChangeSecondaryText}
      />
    </ModalShell>
  );

  return { isVisible, labelFor, terms, onContextMenu, isOpen: open, overlays: dialog };
}
