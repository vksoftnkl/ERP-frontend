"use client";

/**
 * Supplier–Item Map (menu 295) — Qt `SupplierItemList` + `SupplierItemEntry`
 * (NexERP 97a5b48, scheme e0c56ef). Grid 195 on the house `CrudMasterPage`:
 *
 *  - Who sells us what, in which pack, under which code; last rate / date /
 *    bills from posted bills. A supplier filter ("All suppliers") and Show
 *    inactive sit on the toolbar.
 *  - Add / Edit open the shell's popup. On Edit the supplier and the item are
 *    fixed (the pair IS the row's key). The buy unit lists the picked item's own
 *    units (`/master-lookups/units/by-item`); a new item clears it.
 *  - The scheme (buy N get M free) is what Purchase Entry fills Free from.
 *  - Delete is off: Active on / off (Ctrl+D) posts `/purchase/supplier-items/active`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import { NexDropdownSingle, type DropdownSelection } from "@/components/design-system/dropdown";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm, getConfirmations } from "@/lib/confirm";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { formatDate } from "@/lib/date-format";
import { getMessages, toast } from "@/lib/notify";
import { lookupsApi } from "@/store/api/lookupsApi";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { usePurchaseMastersSendMutation } from "../purchase-masters-api";
import {
  BLANK_VALUES,
  CODE_MAX_LENGTH,
  LEAD_DAYS_MAX,
  LOOKUP_KEYS,
  RELOAD_AFTER_SAVE_MS,
  buildSavePayload,
  formValuesFromSource,
  isActive,
  listGridParams,
  pairNamesOf,
  rowFlag,
  schemeProblem,
  toggleRequestOf,
  validateNumber,
  type SupplierItemRow,
} from "./supplier-item";
import styles from "../purchase-masters.module.scss";

const HREF = "/master/supplier-items";

/** Qt `contentWidth = 760`. */
const MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(47.5rem, calc(100vw / var(--erp-ui-scale, 1) - 2rem))",
  maxHeight: "min(calc(86vh / var(--erp-ui-scale, 1)), 46rem)",
};

const REQUEST_PAYLOAD_KEYS = {
  // `id` names the query param of the shell's /get.
  id: "psiId",
  name: "item_name",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

const NEVER = () => true;

function sourceOf(row: MasterTableRow | null | undefined): SupplierItemRow | null {
  return (row?.__source as SupplierItemRow | undefined) ?? null;
}

const COLUMN_RENDER_OVERRIDES: Record<string, (row: MasterTableRow) => ReactNode> = {
  psi_is_preferred: (row) => (rowFlag(sourceOf(row), "psi_is_preferred") ? "Yes" : ""),
  last_date: (row) => formatDate(String(sourceOf(row)?.last_date ?? "")),
};

/** The picked item's units, as the iuc ids a line stores. Blank = the item's default. */
function BuyUnitSelect({
  id,
  itemId,
  value,
  disabled,
  onChange,
}: {
  id?: string;
  itemId: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { data: units, isFetching } = lookupsApi.endpoints.getUnitsByItem.useQuery(
    { itemId },
    { skip: !itemId },
  );
  const options = itemId ? (units ?? []) : [];
  // A stored unit not (yet) in the list keeps its id rather than reading as the default.
  const known = !value || isFetching || options.some((option) => option.value === value);
  return (
    <select
      id={id}
      className={`erp-ms-modal-control ${styles.buyUnitSelect}`}
      data-erp-modal-field-control="true"
      aria-label="Buy unit"
      value={value}
      disabled={disabled || !itemId}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">— the item&apos;s default —</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {known ? null : <option value={value}>(a unit the item no longer has)</option>}
    </select>
  );
}

function LockIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function SupplierItemMasterPage() {
  const { activeCompany } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const { permissions } = usePagePermissions({ href: HREF });
  const canToggle = permissions.canEdit;
  const supplierDropdownId = useDropdownId("supplier");
  const itemDropdownId = useDropdownId("item");

  const [send] = usePurchaseMastersSendMutation();
  const [showInactive, setShowInactive] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState<DropdownSelection | null>(null);
  const [variantKey, setVariantKey] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [acting, setActing] = useState(false);
  // The two pickers show their names from here: the form values are the ids.
  const [supplierSelection, setSupplierSelection] = useState<DropdownSelection | null>(null);
  const [itemSelection, setItemSelection] = useState<DropdownSelection | null>(null);
  const actingRef = useRef(false);
  const selectedRef = useRef<SupplierItemRow | null>(null);
  const reloadTimer = useRef<number | null>(null);

  const reloadSoon = useCallback(() => {
    if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null;
      setReloadTick((tick) => tick + 1);
    }, RELOAD_AFTER_SAVE_MS);
  }, []);
  useEffect(
    () => () => {
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    },
    [],
  );

  const creating = variantKey === "master-create";
  const fieldId = useCallback(
    (name: string) => (variantKey ? `erp-modal-form-${variantKey}-${name}` : undefined),
    [variantKey],
  );

  const formFields = useMemo<ERPDynamicModalField[]>(() => {
    const numberField = (
      name: "packQty" | "moq" | "leadDays" | "schemeBuyQty" | "schemeFreeQty",
      label: string,
      extra: Partial<ERPDynamicModalField> = {},
    ): ERPDynamicModalField => ({
      name,
      label,
      type: "number",
      min: 0,
      step: name === "leadDays" ? 1 : "any",
      colSpan: 1,
      ...extra,
      validation: {
        custom: (value, values) =>
          validateNumber(name, value) ??
          (name === "schemeBuyQty" || name === "schemeFreeQty" ? schemeProblem(values) : null),
      },
    });
    return [
      { name: "pairHeading", label: "Supplier and item", type: "subheading" },
      {
        name: "supplierId",
        label: "Supplier",
        type: "custom",
        required: true,
        colSpan: 1,
        // The pair is the row's key: a different one is a different row.
        disabled: !creating,
        validation: { requiredMessage: "Pick the supplier." },
        render: ({ value, setValue, disabled }) => (
          <NexDropdownSingle
            id={fieldId("supplierId")}
            dropdownId={supplierDropdownId}
            value={value ? (supplierSelection?.id === value ? supplierSelection : { id: value, text: supplierSelection?.text ?? "" }) : null}
            disabled={disabled}
            placeholder="Pick the supplier"
            aria-label="Supplier"
            onChange={(selection) => {
              setSupplierSelection(selection);
              setValue(selection?.id ?? "");
            }}
          />
        ),
      },
      {
        name: "itemId",
        label: "Item",
        type: "custom",
        required: true,
        colSpan: 1,
        disabled: !creating,
        validation: { requiredMessage: "Pick the item." },
        // Qt `reloadUnits`: the buy-unit list follows the item; another item's unit cannot stay.
        onValueChange: ({ value, previousValues }) =>
          value !== (previousValues.itemId ?? "") ? { values: { buyUomId: "" } } : undefined,
        render: ({ value, setValue, disabled }) => (
          <NexDropdownSingle
            id={fieldId("itemId")}
            dropdownId={itemDropdownId}
            value={value ? (itemSelection?.id === value ? itemSelection : { id: value, text: itemSelection?.text ?? "" }) : null}
            disabled={disabled}
            placeholder="Pick the item"
            aria-label="Item"
            onChange={(selection) => {
              setItemSelection(selection);
              setValue(selection?.id ?? "");
            }}
          />
        ),
      },
      { name: "codesHeading", label: "The supplier's", type: "subheading" },
      {
        name: "supplierItemCode",
        label: "Supplier code",
        colSpan: 1,
        validation: { maxLength: CODE_MAX_LENGTH, maxLengthMessage: `The code is at most ${CODE_MAX_LENGTH} characters.` },
      },
      {
        name: "supplierBarcode",
        label: "Supplier barcode",
        colSpan: 1,
        helperText: "The barcode on the supplier's pack — a scan on a purchase finds the item.",
        validation: { maxLength: CODE_MAX_LENGTH, maxLengthMessage: `The barcode is at most ${CODE_MAX_LENGTH} characters.` },
      },
      { name: "buyingHeading", label: "Buying", type: "subheading" },
      {
        name: "buyUomId",
        label: "Buy unit",
        type: "custom",
        colSpan: 1,
        render: ({ value, setValue, disabled, values }) => (
          <BuyUnitSelect
            id={fieldId("buyUomId")}
            itemId={values.itemId ?? ""}
            value={value}
            disabled={disabled}
            onChange={setValue}
          />
        ),
      },
      numberField("packQty", "Pack (base units)", { placeholder: "the unit's factor" }),
      numberField("moq", "MOQ"),
      numberField("leadDays", "Lead days", { max: LEAD_DAYS_MAX }),
      { name: "schemeHeading", label: "Scheme — buy N get M free (Purchase Entry fills Free)", type: "subheading" },
      numberField("schemeBuyQty", "Buy (qty)", { placeholder: "e.g. 10" }),
      numberField("schemeFreeQty", "Get free (qty)", { placeholder: "e.g. 1" }),
      {
        name: "isPreferred",
        label: "Preferred supplier for this item (first in Reorder → PO)",
        type: "checkbox",
        colSpan: 2,
      },
      { name: "isActive", label: "Active", type: "checkbox", colSpan: 1 },
    ];
  }, [creating, fieldId, itemDropdownId, itemSelection, supplierDropdownId, supplierSelection]);

  const supplierFilterId = supplierFilter?.id ?? "";
  const buildListQuery = useCallback(
    ({ searchTerm, currentPage, pageSize }: { searchTerm: string; currentPage: number; pageSize: number }) => {
      // A new tick is a new function, which is what makes the shell re-read.
      void reloadTick;
      if (!companyId) return null;
      return {
        page: String(currentPage),
        limit: String(pageSize),
        ...(searchTerm ? { search: searchTerm } : {}),
        grid_param: JSON.stringify(listGridParams(companyId, supplierFilterId, showInactive)),
      };
    },
    [companyId, reloadTick, showInactive, supplierFilterId],
  );

  // ── Active on / off ─────────────────────────────────────────────────────

  const toggleActive = useCallback(
    async (row: SupplierItemRow | null) => {
      if (!row || actingRef.current || !canToggle) return;
      const request = toggleRequestOf(row);
      if (
        !(await confirm({
          title: request.title,
          message: request.message,
          confirmLabel: request.title,
          iconVariant: "replace",
        }))
      ) {
        return;
      }
      actingRef.current = true;
      setActing(true);
      try {
        const result = await send({ route: request.route, body: request.body }).unwrap();
        toast.success(result.message || (request.body.active ? "Row reactivated." : "Row deactivated."));
        reloadSoon();
      } catch (error) {
        toast.apiError(error);
      } finally {
        actingRef.current = false;
        setActing(false);
      }
    },
    [canToggle, reloadSoon, send],
  );

  // Ctrl+D — Active on / off, the Qt key. Quiet while any dialog or message is up.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "d") return;
      if (document.querySelector('[role="dialog"]') || getConfirmations().length > 0 || getMessages().length > 0) {
        return;
      }
      event.preventDefault();
      void toggleActive(selectedRef.current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleActive]);

  const toolbarActions = useCallback(
    (shellRow: MasterTableRow | null) => {
      const row = sourceOf(shellRow);
      selectedRef.current = row;
      const allowed = Boolean(row) && canToggle;
      const title = !row
        ? "Select a row first"
        : allowed
          ? "Deactivate or reactivate the selected row (Ctrl+D)"
          : "No right to switch a row on or off";
      return (
        <>
          <span className="erp-ms-tsep" aria-hidden="true" />
          <button
            type="button"
            className={`${masterStyles.iconBtn} ${masterStyles.iconBtnShipping} erp-ms-tbtn`}
            title={title}
            disabled={!allowed || acting}
            onClick={() => void toggleActive(row)}
          >
            <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
              <LockIcon />
            </span>
            <span>Active on / off</span>
          </button>
        </>
      );
    },
    [acting, canToggle, toggleActive],
  );

  const rowClassName = useCallback(
    (shellRow: MasterTableRow) => (isActive(sourceOf(shellRow)) ? undefined : styles.rowMuted),
    [],
  );

  const createInitialValues = useMemo(() => ({ ...BLANK_VALUES }), []);

  return (
    <CrudMasterPage
      title="Supplier–Item Map"
      listTitleOverride="Supplier–item"
      listSubtitleOverride="Who sells us what, in which pack, under which code. Posted bills add rows by themselves; last rate, date and bills come from them."
      entityLabel="supplier–item row"
      entityLabelPlural="supplier–item rows"
      searchPlaceholder="Search..."
      apiEndpoints={{
        getById: "/purchase/supplier-items/get",
        create: "/purchase/supplier-items/save",
        delete: "/purchase/supplier-items/active",
      }}
      gridKey="supplierItemList"
      gridTableName="pur_supplier_item"
      listResponseStyleArrayKey=""
      useConfiguredGridColumnsOnly
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={masterStyles}
      columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
      rowClassName={rowClassName}
      buildListQuery={buildListQuery}
      listStateResetKey={`${companyId}|${supplierFilterId}|${showInactive}`}
      listEmptyText="No rows here. Clear the supplier or tick Show inactive to see more."
      toolbarContent={
        <div className={masterStyles.filterCheckGroup}>
          <div className={styles.supplierFilter} title="Only this supplier's items (clear it for every supplier)">
            <NexDropdownSingle
              dropdownId={supplierDropdownId}
              value={supplierFilter}
              placeholder="All suppliers"
              aria-label="Supplier filter"
              onChange={(selection) => setSupplierFilter(selection)}
            />
          </div>
          <label className={masterStyles.filterCheckLabel}>
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
            Show inactive
          </label>
        </div>
      }
      toolbarActions={toolbarActions}
      enableListActionKeys
      listHintMessage={() => "Ctrl+D active on / off"}
      permissionHref={HREF}
      createLabel="New row"
      codeColumnHeader="Supplier code"
      nameColumnHeader="Supplier"
      nameFieldLabel="Item"
      formTitle="Supplier–Item"
      formDescription="Who sells us this item, under which code, in which pack. A posted bill makes this row by itself; what you type here is kept."
      createModalTitle="New Supplier–Item"
      editModalTitle="Supplier–Item"
      viewModalTitle="Supplier–Item"
      customFields={formFields}
      createInitialValues={createInitialValues}
      modalPanelStyle={MODAL_PANEL_STYLE}
      modalFormDenseGrid={false}
      modalStackLabels
      // Qt shows no Delete: rows are switched off, never deleted from here.
      isRowDeleteDisabled={NEVER}
      rowDeleteDisabledReason="A row is deactivated, never deleted — use Active on / off (Ctrl+D)"
      onModalOpenChange={(open, key) => {
        setVariantKey(open ? key : null);
        if (open && key === "master-create") {
          setSupplierSelection(null);
          setItemSelection(null);
        }
      }}
      buildGetByIdRequest={({ recordId }) => ({ query: { psiId: String(recordId) } })}
      // /get reads p.* (the scheme included, which the grid may not select) — it wins over the row.
      augmentDetailSource={({ source, rowSource }) => ({ ...(rowSource ?? {}), ...(source ?? {}) })}
      mapFormValues={({ source }) => {
        const row = (source ?? null) as SupplierItemRow | null;
        const values = formValuesFromSource(row);
        const names = pairNamesOf(row);
        setSupplierSelection(values.supplierId ? { id: values.supplierId, text: names.supplierName } : null);
        setItemSelection(values.itemId ? { id: values.itemId, text: names.itemName } : null);
        return { ...BLANK_VALUES, ...values };
      }}
      buildRequestPayload={({ values }) => buildSavePayload(values as Record<string, string>, companyId)}
      afterSubmitSuccess={() => reloadSoon()}
    />
  );
}
