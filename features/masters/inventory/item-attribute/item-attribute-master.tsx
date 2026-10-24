"use client";

/**
 * Item Size Master (menu 291) and Item Colour Master (menu 292) — the Qt
 * `ItemSizeMasterList` / `ItemColourMasterList` + their `NexCrudForm` entries
 * (Qt a204dc8), one screen for both: the two differ by a column prefix and the
 * size's Size Set field (`item-attribute.ts`).
 *
 *  - The list is grid 181 / 182, resolved by name. "Show Only Deleted" swaps
 *    the view, and there the Delete button RESTORES (`POST …/restore`).
 *  - Add and Edit are the same popup; only the id differs. The Company box is
 *    locked once the row exists — the server keeps the stored company on
 *    update, and other companies' batches may already use a shared row.
 *  - A size / colour a batch uses is refused on delete (409): the refusal is
 *    shown as the server words it, which says to untick Active instead.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import { NexDropdownSingle, type DropdownSelection } from "@/components/design-system/dropdown";
import { useBusinessContext } from "@/components/layout/business-context";
import styles from "@/app/master/state-master/page.module.scss";
import { useSoftDeleteActions } from "@/features/masters/shared/use-soft-delete-actions";
import { useDropdownId } from "@/lib/configured-dropdowns";
import {
  CODE_MAX_LENGTH,
  NAME_MAX_LENGTH,
  SIZE_SET_OPTIONS,
  SORT_MAX,
  buildSavePayload,
  companyLabelOf,
  fieldNames,
  formValuesFromRow,
  initialValues,
  listGridParams,
  lookupKeysOf,
  type ItemAttributeSpec,
} from "./item-attribute";

/** Qt `contentWidth = 600`, one column. */
const MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(38rem, calc(100vw / var(--erp-ui-scale, 1) - 2rem))",
  maxHeight: "min(calc(82vh / var(--erp-ui-scale, 1)), 40rem)",
};

export function ItemAttributeMasterPage({ spec }: { spec: ItemAttributeSpec }) {
  const f = useMemo(() => fieldNames(spec), [spec]);
  const lookupKeys = useMemo(() => lookupKeysOf(spec), [spec]);
  const requestPayloadKeys = useMemo(
    () => ({
      // `id` is load-bearing: the shell sends it as the query-param name of /get
      // and /delete. The rest feed only the default payload builder, which this
      // page replaces.
      id: f.id,
      name: f.name,
      alias: f.code,
      short: f.code,
      description: f.name,
      sort: f.sort,
    }),
    [f],
  );
  const blank = useMemo(() => initialValues(spec), [spec]);

  const { activeCompany } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const companyName = activeCompany?.name ?? "";
  const session = useMemo(() => ({ companyId, companyName }), [companyId, companyName]);
  const companyDropdownId = useDropdownId("company");

  const [showDeleted, setShowDeleted] = useState(false);
  const [variantKey, setVariantKey] = useState<string | null>(null);
  // The Company box shows its label from here: /get carries the id only.
  const [companySelection, setCompanySelection] = useState<DropdownSelection | null>(null);
  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const softDeleteProps = useSoftDeleteActions({
    showingDeleted: showDeleted,
    deleteEndpoint: spec.endpoints.delete,
    restoreEndpoint: spec.endpoints.restore,
    idParam: f.id,
    idKeys: lookupKeys.id,
    entityTitle: spec.Word,
    plainRefusals: true,
  });

  const seedCompany = useCallback((id: string) => {
    const trimmed = id.trim();
    setCompanySelection(trimmed ? { id: trimmed, text: companyLabelOf(trimmed, sessionRef.current) } : null);
  }, []);

  const creating = variantKey === "master-create";
  const formFields = useMemo<ERPDynamicModalField[]>(() => {
    const fields: ERPDynamicModalField[] = [
      {
        name: f.name,
        label: spec.Word,
        required: true,
        placeholder: spec.namePlaceholder,
        colSpan: 2,
        validation: {
          requiredMessage: spec.nameRequiredMessage,
          maxLength: NAME_MAX_LENGTH,
          maxLengthMessage: `A ${spec.word} is at most ${NAME_MAX_LENGTH} characters.`,
        },
      },
      {
        name: f.code,
        label: "Code",
        colSpan: 2,
        validation: {
          maxLength: CODE_MAX_LENGTH,
          maxLengthMessage: `The code is at most ${CODE_MAX_LENGTH} characters.`,
        },
      },
    ];
    if (spec.hasSizeSet) {
      fields.push({
        name: f.sizeSet,
        label: "Size Set",
        type: "select",
        colSpan: 2,
        options: SIZE_SET_OPTIONS.map((option) => ({ ...option })),
        helperText: "Groups sizes for the size grid. Blank = no set.",
      });
    }
    fields.push(
      {
        name: f.sort,
        label: "Sort Order",
        type: "number",
        min: 0,
        max: SORT_MAX,
        step: 1,
        colSpan: 2,
        helperText:
          spec.kind === "size"
            ? "Reports list sizes by this, not by name: S < M < L < XL."
            : "Lists sort by this, then by name.",
      },
      {
        name: f.companyId,
        label: "Company",
        type: "custom",
        colSpan: 2,
        helperText: creating
          ? `Blank = the ${spec.word} is shared by every company.`
          : `Company cannot be changed after the ${spec.word} is created.`,
        render: ({ value, setValue, disabled }) => (
          <NexDropdownSingle
            id={variantKey ? `erp-modal-form-${variantKey}-${f.companyId}` : undefined}
            dropdownId={companyDropdownId}
            value={companySelection ?? (value ? { id: value, text: companyLabelOf(value, session) } : null)}
            disabled={disabled || !creating}
            placeholder="Blank = every company"
            aria-label="Company"
            onChange={(selection) => {
              setCompanySelection(selection);
              setValue(selection?.id ?? "");
            }}
          />
        ),
      },
      { name: f.active, label: "Active", type: "checkbox", colSpan: 2 },
    );
    return fields;
  }, [companyDropdownId, companySelection, creating, f, session, spec, variantKey]);

  const buildListQuery = useCallback(
    ({ searchTerm, currentPage, pageSize }: { searchTerm: string; currentPage: number; pageSize: number }) => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      grid_param: JSON.stringify(listGridParams(spec, showDeleted, companyId)),
    }),
    [companyId, showDeleted, spec],
  );

  return (
    <CrudMasterPage
      {...softDeleteProps}
      // The live view's own question, in the Qt words; the deleted view keeps
      // the restore question the hook supplies.
      deleteConfirmMessage={
        softDeleteProps.deleteConfirmMessage ??
        ((row) => `Delete ${spec.word} "${row.masterName || `this ${spec.word}`}"?`)
      }
      deleteConfirmNote={
        showDeleted ? undefined : `A ${spec.word} a batch uses cannot be deleted — untick Active instead.`
      }
      modalDraftKey={spec.draftKey}
      onModalDraftApplied={({ values }) => seedCompany(values[f.companyId] ?? "")}
      title={spec.title}
      auditHistory={{ screenName: spec.auditScreenName }}
      entityLabel={spec.word}
      entityLabelPlural={`${spec.word}s`}
      apiEndpoints={{
        getById: spec.endpoints.getById,
        create: spec.endpoints.create,
        delete: spec.endpoints.delete,
      }}
      gridKey={spec.gridKey}
      gridTableName={spec.kind === "size" ? "item_size_master" : "item_colour_master"}
      listResponseStyleArrayKey=""
      useConfiguredGridColumnsOnly
      lookupKeys={lookupKeys}
      requestPayloadKeys={requestPayloadKeys}
      styles={styles}
      buildListQuery={buildListQuery}
      listStateResetKey={`${companyId}|${showDeleted ? "deleted" : "live"}`}
      toolbarContent={
        <div className={styles.filterCheckGroup}>
          <label className={styles.filterCheckLabel}>
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(event) => setShowDeleted(event.target.checked)}
            />
            Show Only Deleted
          </label>
        </div>
      }
      listTitle={spec.listTitle}
      listTitleOverride={spec.listTitle}
      listSubtitleOverride={spec.listSubtitle}
      createLabel={`Add ${spec.Word}`}
      codeColumnHeader="Code"
      nameColumnHeader={spec.Word}
      nameFieldLabel={spec.Word}
      nameFieldPlaceholder={spec.namePlaceholder}
      formTitle={spec.entryTitle}
      formDescription={spec.entrySubtitle}
      createModalTitle={spec.entryTitle}
      editModalTitle={`Edit ${spec.entryTitle}`}
      viewModalTitle={`${spec.Word} Details`}
      customFields={formFields}
      createInitialValues={blank}
      modalPanelStyle={MODAL_PANEL_STYLE}
      // The Company box is a custom field, which always stacks its label; every
      // other field stacks too so the popup reads as one column.
      modalStackLabels
      onModalOpenChange={(open, key) => {
        setVariantKey(open ? key : null);
        if (open && key === "master-create") {
          setCompanySelection(null);
        }
      }}
      mapFormValues={({ source }) => {
        const row = (source ?? {}) as Record<string, unknown>;
        const values = formValuesFromRow(spec, row);
        seedCompany(values[f.companyId] ?? "");
        return { ...blank, ...values };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const id =
          shouldUpdate && editingItemId !== null && editingItemId !== undefined
            ? String(editingItemId)
            : null;
        return buildSavePayload(spec, values as Record<string, string>, id);
      }}
    />
  );
}
