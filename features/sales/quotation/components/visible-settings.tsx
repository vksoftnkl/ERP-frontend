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
 *
 * ---
 *
 * **Two exports, and the generic one came second.** `usePanelVisibleSettings` is
 * the whole mechanism, parameterised by menu id and by the two field-name maps a
 * screen bridges its fields through; `useVisibleSettings` is the quotation's own
 * thin wrapper over it. The sale bill reads the same two tables under menu 12
 * and wraps it the same way — the same shape as `resolveItemColumnsWith` beside
 * `resolveItemColumns`, and for the same reason: one implementation of a subtle
 * rule, two screens that name their own fields.
 */
import {
  useCallback,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { toast } from "@/lib/notify";
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
  useGetWidgetConfigQuery,
  useSaveWidgetVisibilityMutation,
} from "@/store/api/quotationApi";
import {
  QUOTATION_HEADER_FIELD_NAMES,
  QUOTATION_TERMS_FIELD_NAMES,
  QUOTATION_WIDGET_MENU_ID,
  QUOTATION_WIDGET_PLATFORM,
  type QuotationHeaderFieldKey,
  type QuotationTermsFieldKey,
} from "../quotation.constants";
import { ModalShell } from "./modal-shell";
import styles from "../page.module.scss";

/** A stable identity for the query's default, so the memos below do not rerun. */
const NO_SECTIONS: WidgetMasterSectionConfig[] = [];
/**
 * What the header blocks read to decide whether — and how — to render a field.
 *
 * Generic over the SCREEN's own field keys, so a block cannot be handed the
 * wrong screen's config: `labelFor("quoteNo")` does not typecheck against the
 * sale bill's map, which has no such field.
 */
export type HeaderFieldConfig<TKey extends string> = {
  /** False only when the config explicitly hides the field. */
  isVisible: (key: TKey) => boolean;
  /** The configured label, falling back to the one the screen ships with. */
  labelFor: (key: TKey) => string;
};

/** The same, for the Terms panel's own section. */
export type TermsFieldConfig<TKey extends string> = {
  isVisible: (key: TKey) => boolean;
  labelFor: (key: TKey) => string;
  /** False once every row is hidden: the panel has nothing left to frame. */
  anyVisible: boolean;
};

export type VisibleSettings<
  THeaderKey extends string,
  TTermsKey extends string,
> = HeaderFieldConfig<THeaderKey> & {
  /** Put this on the Terms panel; it reads the same config. */
  terms: TermsFieldConfig<TTermsKey>;
  /** Put this on the header panel; it opens the dialog. */
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  /** True while the dialog is up, so the screen's function keys stand down. */
  isOpen: boolean;
  /** The dialog portal; render once. */
  overlays: ReactNode;
};

/** What a screen has to say about itself to get a Visible Settings dialog. */
export type PanelVisibleSettingsOptions<
  THeaderKey extends string,
  TTermsKey extends string,
> = {
  /** `fixed.menu_master.menu_id` — which screen's sections these are. */
  menuId: string;
  /**
   * Sections are scoped by platform as well as by menu, and the server checks it
   * against a case-sensitive enum (Mobile | Desktop | Web).
   */
  platform?: string;
  /**
   * Each header field's key, bridged to the `fixed.form_field.field_name` it is
   * configured under (matched case-insensitively). The shipped config names
   * every field after the label the screen already showed, so the same string
   * doubles as the fallback label.
   */
  headerFieldNames: Readonly<Record<THeaderKey, string>>;
  /** The same, for the Terms panel's own section. */
  termsFieldNames: Readonly<Record<TTermsKey, string>>;
};

export function usePanelVisibleSettings<
  THeaderKey extends string,
  TTermsKey extends string,
>({
  menuId,
  platform = QUOTATION_WIDGET_PLATFORM,
  headerFieldNames,
  termsFieldNames,
}: PanelVisibleSettingsOptions<THeaderKey, TTermsKey>): VisibleSettings<THeaderKey, TTermsKey> {
  /**
   * The configured field names that map to a real field on this screen. The rest
   * are left out of the dialog, rather than offering a checkbox that would
   * toggle nothing.
   */
  const controllableFieldNames = useMemo(
    () => buildControllableFieldNames({ ...headerFieldNames, ...termsFieldNames }),
    [headerFieldNames, termsFieldNames],
  );
  const termsFieldKeys = useMemo(
    () => Object.keys(termsFieldNames) as TTermsKey[],
    [termsFieldNames],
  );
  const {
    data: sections = NO_SECTIONS,
    isLoading,
    isError,
  } = useGetWidgetConfigQuery({ menuId, platform });
  const [saveVisibility, saveState] = useSaveWidgetVisibilityMutation();
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
    (key: THeaderKey) => visibleByName(headerFieldNames[key]),
    [headerFieldNames, visibleByName],
  );
  const labelFor = useCallback(
    (key: THeaderKey) => labelByName(headerFieldNames[key]),
    [headerFieldNames, labelByName],
  );
  const terms = useMemo<TermsFieldConfig<TTermsKey>>(
    () => ({
      isVisible: (key) => visibleByName(termsFieldNames[key]),
      labelFor: (key) => labelByName(termsFieldNames[key]),
      anyVisible: termsFieldKeys.some((key) => visibleByName(termsFieldNames[key])),
    }),
    [labelByName, termsFieldKeys, termsFieldNames, visibleByName],
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
            controllable: controllableFieldNames.has(key),
          };
        }),
      })),
    [controllableFieldNames, fieldVisible, sections, sectionVisible, secondaryText],
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
        menuId,
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
  }, [fieldVisible, menuId, saveVisibility, sections, sectionVisible, secondaryText]);

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

/**
 * The Quotation screen's own wrapper: menu 14, and the field names its header
 * and Terms blocks are bridged through.
 *
 * Kept as a named export so nothing that already calls it has to change, and so
 * the screen's two field maps are named in one place rather than at the call
 * site.
 */
export function useVisibleSettings(): VisibleSettings<
  QuotationHeaderFieldKey,
  QuotationTermsFieldKey
> {
  return usePanelVisibleSettings({
    menuId: QUOTATION_WIDGET_MENU_ID,
    platform: QUOTATION_WIDGET_PLATFORM,
    headerFieldNames: QUOTATION_HEADER_FIELD_NAMES,
    termsFieldNames: QUOTATION_TERMS_FIELD_NAMES,
  });
}
