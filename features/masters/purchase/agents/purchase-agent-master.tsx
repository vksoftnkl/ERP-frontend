"use client";

/**
 * Agents Master (menu 28) — Qt `AgentList` + `AgentEntry` (NexERP 97a5b48).
 * Grid 194 on the house `CrudMasterPage`:
 *
 *  - Purchase agents (brokers) with the ledger each one is; Show inactive.
 *  - Add / Edit open the shell's popup. Saving keeps the agent's ledger (Sundry
 *    Creditors) under the same name — the server renames it with the agent.
 *  - Delete is off: Active on / off (Ctrl+D) posts `/purchase/agents/active`,
 *    which switches the agent and the ledger together. A PO or a bill may name
 *    the agent, so nothing is removed.
 *  - The grid run is cached by the server for about a second, so the list
 *    re-reads once that has turned over.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm, getConfirmations } from "@/lib/confirm";
import { getMessages, toast } from "@/lib/notify";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { usePurchaseMastersSendMutation } from "../purchase-masters-api";
import {
  BLANK_VALUES,
  LOOKUP_KEYS,
  MAX_LENGTH,
  RELOAD_AFTER_SAVE_MS,
  buildSavePayload,
  formValuesFromRow,
  isActive,
  listGridParams,
  toggleRequestOf,
  validateCommPct,
  validateGstin,
  validatePan,
  type AgentRow,
} from "./purchase-agent";
import styles from "../purchase-masters.module.scss";

const HREF = "/master/purchase-agents";

/** Qt `contentWidth = 760`. */
const MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(47.5rem, calc(100vw / var(--erp-ui-scale, 1) - 2rem))",
  maxHeight: "min(calc(86vh / var(--erp-ui-scale, 1)), 46rem)",
};

const REQUEST_PAYLOAD_KEYS = {
  // `id` names the query param of the shell's /get.
  id: "pagId",
  name: "pag_name",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

const NEVER = () => true;

function sourceOf(row: MasterTableRow | null | undefined): AgentRow | null {
  return (row?.__source as AgentRow | undefined) ?? null;
}

const maxLength = (limit: number, label: string) => ({
  maxLength: limit,
  maxLengthMessage: `${label} is at most ${limit} characters.`,
});

/** Qt `buildConfig`: Agent / Contact / Tax bands, two columns. */
const FORM_FIELDS: ERPDynamicModalField[] = [
  { name: "agentHeading", label: "Agent", type: "subheading" },
  {
    name: "name",
    label: "Name",
    required: true,
    colSpan: 1,
    helperText: "The ledger carries the same name.",
    validation: { requiredMessage: "Give the agent a name.", ...maxLength(MAX_LENGTH.name, "The name") },
  },
  { name: "code", label: "Code", colSpan: 1, validation: maxLength(MAX_LENGTH.code, "The code") },
  { name: "alias", label: "Alias", colSpan: 1, validation: maxLength(MAX_LENGTH.alias, "The alias") },
  {
    name: "defaultCommPct",
    label: "Commission %",
    type: "number",
    min: 0,
    max: 100,
    step: 0.01,
    colSpan: 1,
    helperText: "What the agent usually earns — charged on a purchase as a charge.",
    validation: { custom: (value) => validateCommPct(value) },
  },
  { name: "contactHeading", label: "Contact", type: "subheading" },
  { name: "mobile1", label: "Mobile", type: "tel", colSpan: 1, validation: maxLength(MAX_LENGTH.mobile, "Mobile") },
  { name: "mobile2", label: "Mobile 2", type: "tel", colSpan: 1, validation: maxLength(MAX_LENGTH.mobile, "Mobile 2") },
  { name: "addr1", label: "Address", colSpan: 1, validation: maxLength(MAX_LENGTH.addr, "Address") },
  { name: "addr2", label: "Address 2", colSpan: 1, validation: maxLength(MAX_LENGTH.addr, "Address 2") },
  { name: "city", label: "City", colSpan: 1, validation: maxLength(MAX_LENGTH.place, "City") },
  { name: "district", label: "District", colSpan: 1, validation: maxLength(MAX_LENGTH.place, "District") },
  { name: "state", label: "State", colSpan: 1, validation: maxLength(MAX_LENGTH.place, "State") },
  { name: "pincode", label: "Pincode", colSpan: 1, validation: maxLength(MAX_LENGTH.pincode, "Pincode") },
  { name: "taxHeading", label: "Tax", type: "subheading" },
  { name: "panNo", label: "PAN", colSpan: 1, validation: { custom: (value) => validatePan(value) } },
  { name: "gstin", label: "GSTIN", colSpan: 1, validation: { custom: (value) => validateGstin(value) } },
  { name: "isActive", label: "Active", type: "checkbox", colSpan: 1 },
  {
    name: "remarks",
    label: "Notes",
    type: "textarea",
    rows: 3,
    colSpan: 2,
    validation: maxLength(MAX_LENGTH.remarks, "Notes"),
  },
];

function LockIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function PurchaseAgentMasterPage() {
  const { activeCompany } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const { permissions } = usePagePermissions({ href: HREF });
  const canToggle = permissions.canEdit;

  const [send] = usePurchaseMastersSendMutation();
  const [showInactive, setShowInactive] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [acting, setActing] = useState(false);
  const actingRef = useRef(false);
  const selectedRef = useRef<AgentRow | null>(null);
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

  const toggleActive = useCallback(
    async (row: AgentRow | null) => {
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
        toast.success(result.message || "Agent updated.");
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
        ? "Select an agent first"
        : allowed
          ? "Deactivate or reactivate the selected agent (Ctrl+D)"
          : "No right to switch an agent on or off";
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
      title="Agents Master"
      listTitleOverride="Purchase agents"
      listSubtitleOverride="Brokers who bring purchases. Each is a ledger (Sundry Creditors) — the commission is owed to the agent."
      entityLabel="agent"
      entityLabelPlural="agents"
      searchPlaceholder="Search..."
      apiEndpoints={{ getById: "/purchase/agents/get", create: "/purchase/agents/save", delete: "/purchase/agents/active" }}
      gridKey="purchaseAgentList"
      gridTableName="pur_agent"
      listResponseStyleArrayKey=""
      useConfiguredGridColumnsOnly
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={masterStyles}
      rowClassName={rowClassName}
      buildListQuery={buildListQuery}
      listStateResetKey={`${companyId}|${showInactive}`}
      listEmptyText="No agents here. Tick Show inactive to see the switched-off ones."
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
      listHintMessage={() => "Ctrl+D active on / off"}
      permissionHref={HREF}
      createLabel="New agent"
      codeColumnHeader="Code"
      nameColumnHeader="Name"
      nameFieldLabel="Name"
      formTitle="Agent"
      formDescription="A purchase agent is a ledger too: saving keeps the ledger (Sundry Creditors) under the same name."
      createModalTitle="New Agent"
      editModalTitle="Agent"
      viewModalTitle="Agent"
      customFields={FORM_FIELDS}
      createInitialValues={createInitialValues}
      modalPanelStyle={MODAL_PANEL_STYLE}
      modalFormDenseGrid={false}
      modalStackLabels
      // Qt shows no Delete: an agent a document names is deactivated, never deleted.
      isRowDeleteDisabled={NEVER}
      rowDeleteDisabledReason="An agent is deactivated, never deleted — use Active on / off (Ctrl+D)"
      buildGetByIdRequest={({ recordId }) => ({ query: { pagId: String(recordId) } })}
      // /get answers the same snake keys as the grid row (a.* + the ledger); either fills the form.
      augmentDetailSource={({ source, rowSource }) => ({ ...(rowSource ?? {}), ...(source ?? {}) })}
      mapFormValues={({ source }) => ({ ...BLANK_VALUES, ...formValuesFromRow(source as AgentRow | null) })}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) =>
        buildSavePayload(values as Record<string, string>, {
          companyId,
          editingId:
            shouldUpdate && editingItemId !== null && editingItemId !== undefined ? String(editingItemId) : null,
        })
      }
      afterSubmitSuccess={() => reloadSoon()}
    />
  );
}
