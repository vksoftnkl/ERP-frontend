"use client";

/**
 * Stock Reasons master (menu 293) — Qt `StockReasonList` + `StockReasonEntry`
 * (97a8e59). Grid 188 on the house `CrudMasterPage`:
 *
 *  - Shared reasons plus the company's own; Way and Scope as pills; Show inactive.
 *  - Add / Edit open the shell's popup. The popup fills from the grid row (the
 *    row carries the ledger and txn-type facts `/get` leaves out). Edit on a
 *    SHARED reason saves a company copy with the same code (a create), which
 *    then replaces it in the list.
 *  - Delete is off: Active on / off (Ctrl+D) posts `/stock/reasons/deactivate`
 *    (the server removes a reason nothing cites). On a shared reason it saves an
 *    inactive company copy instead.
 *  - The grid run is cached by the server for about a second, so the list
 *    re-reads once that has turned over.
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
import { getMessages, toast } from "@/lib/notify";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { useStockReasonsSendMutation } from "./stock-reason-api";
import {
  BLANK_VALUES,
  CODE_MAX_LENGTH,
  LOOKUP_KEYS,
  NAME_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  RELOAD_AFTER_SAVE_MS,
  SORT_MAX,
  TXN_TYPES,
  WAY_OPTIONS,
  buildSavePayload,
  formValuesFromRow,
  isActive,
  isShared,
  listGridParams,
  rowFlag,
  toggleRequestOf,
  txnTypesOf,
  type ReasonRow,
} from "./stock-reason";
import styles from "./stock-reason.module.scss";

const HREF = "/master/stock-reasons";

/** Qt `contentWidth = 720`. */
const MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(45rem, calc(100vw / var(--erp-ui-scale, 1) - 2rem))",
  maxHeight: "min(calc(82vh / var(--erp-ui-scale, 1)), 44rem)",
};

const REQUEST_PAYLOAD_KEYS = {
  // `id` names the query param of the shell's /get.
  id: "srmId",
  name: "srm_name",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

const NEVER = () => true;

function sourceOf(row: MasterTableRow | null | undefined): ReasonRow | null {
  return (row?.__source as ReasonRow | undefined) ?? null;
}

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`${styles.pill} ${tone}`}>{children}</span>;
}

const COLUMN_RENDER_OVERRIDES: Record<string, (row: MasterTableRow) => ReactNode> = {
  direction_text: (row) => {
    const source = sourceOf(row);
    const way = String(source?.srm_direction ?? "").toUpperCase();
    const tone = way === "IN" ? styles.pillIn : way === "OUT" ? styles.pillOut : styles.pillBoth;
    return <Pill tone={tone}>{String(source?.direction_text ?? "")}</Pill>;
  },
  scope_text: (row) => {
    const source = sourceOf(row);
    return (
      <Pill tone={isShared(source) ? styles.pillShared : styles.pillOwn}>{String(source?.scope_text ?? "")}</Pill>
    );
  },
  srm_require_remarks: (row) => (rowFlag(sourceOf(row), "srm_require_remarks") ? "Yes" : ""),
};

function LockIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function StockReasonMasterPage() {
  const { activeCompany } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const { permissions } = usePagePermissions({ href: HREF });
  const rights = useMemo(
    () => ({ canCreate: permissions.canCreate, canEdit: permissions.canEdit }),
    [permissions.canCreate, permissions.canEdit],
  );
  const ledgerDropdownId = useDropdownId("tillReasonLedger");
  const ledgerParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);

  const [send] = useStockReasonsSendMutation();
  const [showInactive, setShowInactive] = useState(false);
  const [variantKey, setVariantKey] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [acting, setActing] = useState(false);
  // The ledger box shows its name from here: the form value is the id.
  const [ledgerSelection, setLedgerSelection] = useState<DropdownSelection | null>(null);
  /** The popup opened on a SHARED reason: Save is a create (a company copy). */
  const copyRef = useRef(false);
  const actingRef = useRef(false);
  const selectedRef = useRef<ReasonRow | null>(null);
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

  const formFields = useMemo<ERPDynamicModalField[]>(
    () => [
      {
        name: "code",
        label: "Code",
        required: true,
        colSpan: 1,
        // The code is the key a company copy replaces the shared row by.
        disabled: !creating,
        helperText: creating ? undefined : "The code cannot change — it is what links a company copy to the shared reason.",
        validation: {
          requiredMessage: "Give the reason a code.",
          maxLength: CODE_MAX_LENGTH,
          maxLengthMessage: `The code is at most ${CODE_MAX_LENGTH} characters.`,
        },
      },
      {
        name: "name",
        label: "Name",
        required: true,
        colSpan: 1,
        validation: {
          requiredMessage: "Give the reason a name.",
          maxLength: NAME_MAX_LENGTH,
          maxLengthMessage: `The name is at most ${NAME_MAX_LENGTH} characters.`,
        },
      },
      {
        name: "direction",
        label: "Way",
        type: "select",
        colSpan: 1,
        options: WAY_OPTIONS.map((option) => ({ ...option })),
      },
      { name: "sortOrder", label: "Sort Order", type: "number", min: 0, max: SORT_MAX, step: 1, colSpan: 1 },
      {
        name: "allowedTxnTypes",
        label: "Used on",
        type: "custom",
        colSpan: 2,
        helperText: "Where the reason may be chosen. None ticked = anywhere.",
        render: ({ value, setValue, disabled }) => {
          const on = new Set(txnTypesOf(value));
          return (
            <div className={styles.usedOn}>
              {TXN_TYPES.map((type) => (
                <label key={type.value} className={styles.usedOnItem}>
                  <input
                    type="checkbox"
                    checked={on.has(type.value)}
                    disabled={disabled}
                    onChange={(event) => {
                      const next = new Set(on);
                      if (event.target.checked) next.add(type.value);
                      else next.delete(type.value);
                      // Keep the catalogue order, whatever order the ticks came in.
                      setValue(
                        TXN_TYPES.filter((t) => next.has(t.value))
                          .map((t) => t.value)
                          .join(","),
                      );
                    }}
                  />
                  {type.label}
                </label>
              ))}
            </div>
          );
        },
      },
      {
        name: "glLedgerId",
        label: "Ledger",
        type: "custom",
        colSpan: 2,
        helperText: "The expense / income ledger the reason posts to. Blank = Stock Shortage / Excess (default).",
        render: ({ value, setValue, disabled }) => (
          <NexDropdownSingle
            id={variantKey ? `erp-modal-form-${variantKey}-glLedgerId` : undefined}
            dropdownId={ledgerDropdownId}
            params={ledgerParams}
            clearOnParamsChange={false}
            value={value ? (ledgerSelection?.id === value ? ledgerSelection : { id: value, text: ledgerSelection?.text ?? "" }) : null}
            disabled={disabled}
            placeholder="Stock Shortage / Excess (default)"
            aria-label="Ledger"
            onChange={(selection) => {
              setLedgerSelection(selection);
              setValue(selection?.id ?? "");
            }}
          />
        ),
      },
      { name: "requireRemarks", label: "Remarks are required", type: "checkbox", colSpan: 1 },
      { name: "isActive", label: "Active", type: "checkbox", colSpan: 1 },
      {
        name: "remarks",
        label: "Notes",
        type: "textarea",
        rows: 3,
        colSpan: 2,
        validation: { maxLength: NOTES_MAX_LENGTH, maxLengthMessage: `Notes are at most ${NOTES_MAX_LENGTH} characters.` },
      },
    ],
    [creating, ledgerDropdownId, ledgerParams, ledgerSelection, variantKey],
  );

  const buildListQuery = useCallback(
    ({ searchTerm, currentPage, pageSize }: { searchTerm: string; currentPage: number; pageSize: number }) => {
      // A new tick is a new function, which is what makes the shell re-read.
      void reloadTick;
      if (!companyId) return null;
      return {
        page: String(currentPage),
        limit: String(pageSize),
        ...(searchTerm ? { search: searchTerm } : {}),
        grid_param: JSON.stringify(listGridParams(companyId, showInactive)),
      };
    },
    [companyId, reloadTick, showInactive],
  );

  // ── Active on / off ─────────────────────────────────────────────────────

  const canToggle = useCallback(
    (row: ReasonRow | null) => {
      if (!row) return false;
      // A shared row: off makes this company's own copy, so it needs Create.
      return isShared(row) ? rights.canCreate : rights.canEdit;
    },
    [rights],
  );

  const toggleActive = useCallback(
    async (row: ReasonRow | null) => {
      if (!row || actingRef.current || !companyId || !canToggle(row)) return;
      const request = toggleRequestOf(row, companyId);
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
        toast.success(result.message || "Stock reason updated.");
        reloadSoon();
      } catch (error) {
        toast.apiError(error);
      } finally {
        actingRef.current = false;
        setActing(false);
      }
    },
    [canToggle, companyId, reloadSoon, send],
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
      const allowed = canToggle(row);
      const title = !row
        ? "Select a reason first"
        : allowed
          ? "Deactivate or reactivate the selected reason (Ctrl+D)"
          : "No right to switch this reason on or off";
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

  const hintMessage = useCallback(
    (shellRow: MasterTableRow | null) =>
      isShared(sourceOf(shellRow))
        ? "Ctrl+D active on / off · Shared with every company — Edit or Off saves this company's own copy"
        : "Ctrl+D active on / off",
    [],
  );

  const isRowEditDisabled = useCallback(
    (shellRow: MasterTableRow) => isShared(sourceOf(shellRow)) && !rights.canCreate,
    [rights.canCreate],
  );

  const rowClassName = useCallback(
    (shellRow: MasterTableRow) => (isActive(sourceOf(shellRow)) ? undefined : styles.rowMuted),
    [],
  );

  return (
    <CrudMasterPage
      title="Stock Reasons"
      listTitleOverride="Reasons"
      listSubtitleOverride="Why stock moved — the shared reasons plus this company's own. Chosen on an adjustment, a count, a write-off or a transfer."
      entityLabel="reason"
      entityLabelPlural="reasons"
      searchPlaceholder="Search..."
      apiEndpoints={{ getById: "/stock/reasons/get", create: "/stock/reasons", delete: "/stock/reasons" }}
      gridKey="stockReasonList"
      gridTableName="stock_reason_master"
      listResponseStyleArrayKey=""
      useConfiguredGridColumnsOnly
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={masterStyles}
      columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
      rowClassName={rowClassName}
      buildListQuery={buildListQuery}
      listStateResetKey={`${companyId}|${showInactive}`}
      listEmptyText="No reasons here. Tick Show inactive to see the switched-off ones."
      toolbarContent={
        <div className={masterStyles.filterCheckGroup}>
          <label className={masterStyles.filterCheckLabel}>
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
            Show inactive
          </label>
        </div>
      }
      toolbarActions={toolbarActions}
      enableListActionKeys
      listHintMessage={hintMessage}
      permissionHref={HREF}
      createLabel="New reason"
      codeColumnHeader="Code"
      nameColumnHeader="Reason"
      nameFieldLabel="Name"
      formTitle="Stock Reason"
      formDescription="Why stock moved — chosen on an adjustment, a count, a write-off or a transfer."
      createModalTitle="New Stock Reason"
      editModalTitle="Stock Reason"
      viewModalTitle="Stock Reason"
      customFields={formFields}
      createInitialValues={BLANK_VALUES}
      modalPanelStyle={MODAL_PANEL_STYLE}
      modalStackLabels
      isRowEditDisabled={isRowEditDisabled}
      rowEditDisabledReason="Editing a shared reason makes this company's own copy — that needs the Create right"
      // Qt shows no Delete: a reason with history is deactivated, never deleted from here.
      isRowDeleteDisabled={NEVER}
      rowDeleteDisabledReason="A reason is deactivated, never deleted — use Active on / off (Ctrl+D)"
      onModalOpenChange={(open, key) => {
        setVariantKey(open ? key : null);
        if (open && key === "master-create") {
          copyRef.current = false;
          setLedgerSelection(null);
        }
      }}
      // /get is asked for (the shell does), but the grid row is the record: it
      // carries the ledger name and the types, and wins over the camel-case /get.
      buildGetByIdRequest={({ recordId }) => ({ query: { companyId, srmId: String(recordId) } })}
      augmentDetailSource={({ rowSource }) => rowSource}
      mapFormValues={({ source }) => {
        const row = (source ?? {}) as ReasonRow;
        const copy = isShared(row);
        copyRef.current = copy;
        const ledgerId = String(row.srm_gl_ledger_id ?? "");
        setLedgerSelection(ledgerId ? { id: ledgerId, text: String(row.ledger_name ?? "") } : null);
        return { ...BLANK_VALUES, ...formValuesFromRow(row, copy) };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const editingId =
          shouldUpdate && editingItemId !== null && editingItemId !== undefined && !copyRef.current
            ? String(editingItemId)
            : null;
        return buildSavePayload(values as Record<string, string>, { companyId, editingId });
      }}
      afterSubmitSuccess={() => reloadSoon()}
    />
  );
}
