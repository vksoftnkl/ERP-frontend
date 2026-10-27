"use client";
/**
 * Tracking Presets — menu 249 (Qt `TrackPresetList` + `TrackPresetEntry`,
 * NexERP d27045b; server notes 159 §4).
 *
 *  - The list is grid 98, resolved by name; it merges the shared presets with
 *    the company's own. "Show Only Deleted" swaps the view.
 *  - Add / Edit open one popup. Edit on a SHARED preset makes this company's
 *    own copy (a save with no `sptId`, the code locked); an own preset used by
 *    items or groups has its six tracking ticks locked.
 *  - There is no Delete: "Active on / off" (Ctrl+D) goes through
 *    `/stock-track-presets/deactivate` — refused while items or groups use
 *    the preset, and never offered on a shared one.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useApi } from "@/hooks/useApi";
import { confirm, getConfirmations } from "@/lib/confirm";
import { getMessages, toast } from "@/lib/notify";
import styles from "@/app/master/state-master/page.module.scss";
import {
  AGEING_BASES,
  ALLOW_NEGATIVE,
  CODE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  F,
  ISSUE_STRATEGIES,
  LIST_LOOKUP_KEYS,
  NAME_MAX_LENGTH,
  NEAR_EXPIRY_MAX,
  REMARKS_MAX_LENGTH,
  SHELF_LIFE_MAX,
  SORT_MAX,
  TRACK_PRESET_HREF,
  TRACK_PRESET_MENU_ID,
  buildSavePayload,
  detailRowOf,
  formValuesFromRow,
  initialValues,
  isSharedRow,
  listGridParams,
  noteLines,
  toggleBody,
  toggleWords,
  usedByOf,
} from "./track-preset";

const DEACTIVATE_ENDPOINT = "/stock-track-presets/deactivate";

/** Qt `contentWidth = 880`, two columns. */
const MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(55rem, calc(100vw / var(--erp-ui-scale, 1) - 2rem))",
  maxHeight: "min(calc(86vh / var(--erp-ui-scale, 1)), 46rem)",
};

const REQUEST_PAYLOAD_KEYS = {
  id: F.id,
  name: F.name,
  alias: F.code,
  short: F.code,
  description: F.description,
  sort: F.sort,
};

const TOOLTIP_NOTHING = "Select a preset first";

type EntryMeta = { shared: boolean; used: number };
const NEW_META: EntryMeta = { shared: false, used: 0 };

const options = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

function LockIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

const sourceOf = (row: MasterTableRow | null): Record<string, unknown> | null => row?.__source ?? null;
const rowActive = (row: Record<string, unknown>) => row[F.active] === true || row[F.active] === "true";
const NEVER = () => true;

export default function TrackPresetPage() {
  const { selectedCompanyId } = useBusinessContext();
  const companyId = selectedCompanyId ?? "";
  const { permissions } = usePagePermissions({ menuId: TRACK_PRESET_MENU_ID });
  const { canCreate, canEdit } = permissions;

  const { run: runDeactivate } = useApi<{ message?: string }>(DEACTIVATE_ENDPOINT, {
    method: "POST",
    toast: { success: false, error: false },
  });

  const [showDeleted, setShowDeleted] = useState(false);
  const [variantKey, setVariantKey] = useState<string | null>(null);
  const [meta, setMeta] = useState<EntryMeta>(NEW_META);
  const metaRef = useRef(meta);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);
  /** Bumped to make the shell re-read the list. */
  const [reloadTick, setReloadTick] = useState(0);
  const [acting, setActing] = useState(false);
  const actingRef = useRef(false);
  const selectedRef = useRef<Record<string, unknown> | null>(null);

  const creating = variantKey === "master-create";
  const blank = useMemo(() => initialValues(), []);

  const buildListQuery = useCallback(
    ({ searchTerm, currentPage, pageSize }: { searchTerm: string; currentPage: number; pageSize: number }) => {
      void reloadTick; // a new tick is a new function, which is what makes the shell re-read
      return {
        page: String(currentPage),
        limit: String(pageSize),
        ...(searchTerm ? { search: searchTerm } : {}),
        grid_param: JSON.stringify(listGridParams(showDeleted, companyId)),
      };
    },
    [companyId, reloadTick, showDeleted],
  );

  const formFields = useMemo<ERPDynamicModalField[]>(() => {
    const locked = !creating && !meta.shared && meta.used > 0;
    const flag = (name: string, label: string): ERPDynamicModalField => ({
      name,
      label,
      type: "checkbox",
      disabled: locked,
    });
    return [
      { name: "preset", label: "Preset", type: "heading" },
      {
        name: F.code,
        label: "Code",
        required: true,
        // The code is the key a company copy replaces the shared preset by.
        disabled: !creating,
        validation: {
          requiredMessage: "Give the preset a code (letters, digits, _ or -).",
          maxLength: CODE_MAX_LENGTH,
          maxLengthMessage: `The code is at most ${CODE_MAX_LENGTH} characters.`,
          pattern: /^[A-Za-z0-9_-]+$/,
          patternMessage: "The code may hold only letters, digits, _ and -.",
        },
      },
      {
        name: F.name,
        label: "Name",
        required: true,
        validation: {
          requiredMessage: "Give the preset a name.",
          maxLength: NAME_MAX_LENGTH,
          maxLengthMessage: `The name is at most ${NAME_MAX_LENGTH} characters.`,
        },
      },
      {
        name: F.description,
        label: "Description",
        colSpan: 2,
        validation: {
          maxLength: DESCRIPTION_MAX_LENGTH,
          maxLengthMessage: `The description is at most ${DESCRIPTION_MAX_LENGTH} characters.`,
        },
      },
      { name: F.sort, label: "Sort Order", type: "number", min: 0, max: SORT_MAX, step: 1 },
      { name: "tracks", label: "Tracks stock by", type: "heading" },
      flag("spt_track_batch", "Batch"),
      flag("spt_track_expiry", "Expiry (needs batch)"),
      flag("spt_track_mrp", "MRP"),
      flag("spt_track_sale_price", "Sale price"),
      flag("spt_track_serial", "Serial no"),
      flag("spt_track_supplier", "Supplier"),
      { name: "rules", label: "Rules", type: "heading" },
      { name: F.issue, label: "Issue Order", type: "select", options: options(ISSUE_STRATEGIES) },
      { name: F.negative, label: "Negative Stock", type: "select", options: options(ALLOW_NEGATIVE) },
      {
        name: F.shelf,
        label: "Shelf Life (days)",
        type: "number",
        min: 1,
        max: SHELF_LIFE_MAX,
        step: 1,
        placeholder: "blank = none",
      },
      {
        name: F.nearExpiry,
        label: "Near-expiry Warning (days)",
        type: "number",
        min: 0,
        max: NEAR_EXPIRY_MAX,
        step: 1,
      },
      { name: F.ageing, label: "Age Counted From", type: "select", options: options(AGEING_BASES) },
      { name: F.blockExpired, label: "Do not sell expired stock", type: "checkbox" },
      {
        name: "notes",
        label: "",
        type: "custom",
        colSpan: 2,
        render: ({ values }) => (
          <div style={{ fontSize: "0.8rem", whiteSpace: "pre-line", color: "var(--text-soft, #444444)" }}>
            {noteLines(values, { editingUsed: creating || meta.shared ? 0 : meta.used }).join("\n")}
          </div>
        ),
      },
      {
        name: F.remarks,
        label: "Remarks",
        type: "textarea",
        colSpan: 2,
        rows: 2,
        validation: {
          maxLength: REMARKS_MAX_LENGTH,
          maxLengthMessage: `The remarks are at most ${REMARKS_MAX_LENGTH} characters.`,
        },
      },
    ];
  }, [creating, meta.shared, meta.used]);

  // ── Active on / off ─────────────────────────────────────────────────────

  const mayToggle = useCallback(
    (row: Record<string, unknown> | null) => Boolean(row) && !isSharedRow(row) && canEdit,
    [canEdit],
  );

  const toggleActive = useCallback(
    async (row: Record<string, unknown> | null) => {
      if (!row || actingRef.current || !mayToggle(row)) return;
      const makeActive = !rowActive(row);
      const name = String(row[F.name] ?? "");
      const words = toggleWords(name, makeActive);
      if (!(await confirm({ title: words.title, message: words.message, confirmLabel: words.title, iconVariant: "replace" }))) {
        return;
      }
      actingRef.current = true;
      setActing(true);
      try {
        const response = await runDeactivate({ body: toggleBody(companyId, String(row[F.id] ?? ""), makeActive) });
        if (response !== undefined) {
          toast.success(response?.message || (makeActive ? "Reactivated." : "Deactivated."));
          setReloadTick((tick) => tick + 1);
        }
      } catch (error) {
        toast.apiError(error, { fallback: "Unable to change this preset.", refusedTitle: "Cannot change" });
      } finally {
        actingRef.current = false;
        setActing(false);
      }
    },
    [companyId, mayToggle, runDeactivate],
  );

  // Ctrl+D — Active on / off, the Qt key. Quiet while any dialog or message is up.
  const toggleRef = useRef(toggleActive);
  useEffect(() => {
    toggleRef.current = toggleActive;
  }, [toggleActive]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "d") return;
      if (document.querySelector('[role="dialog"]') || getConfirmations().length > 0 || getMessages().length > 0) return;
      event.preventDefault(); // never the browser's bookmark dialog on this screen
      void toggleRef.current(selectedRef.current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toolbarActions = useCallback(
    (shellRow: MasterTableRow | null) => {
      const row = sourceOf(shellRow);
      selectedRef.current = row;
      const title = !row
        ? TOOLTIP_NOTHING
        : isSharedRow(row)
          ? "A shared preset cannot be switched off — edit it to make this company's own copy"
          : !canEdit
            ? "No right to switch this preset on or off"
            : "Deactivate or reactivate the selected preset (Ctrl+D)";
      return (
        <>
          <span className="erp-ms-tsep" aria-hidden="true" />
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.iconBtnShipping} erp-ms-tbtn`}
            title={title}
            disabled={!mayToggle(row) || acting}
            onClick={() => void toggleActive(row)}
          >
            <span className={`${styles.iconBtnBox} erp-ms-tbtn-icon`}>
              <LockIcon />
            </span>
            <span>Active on / off</span>
          </button>
        </>
      );
    },
    [acting, canEdit, mayToggle, toggleActive],
  );

  // Edit on a shared preset makes this company's copy — that is a CREATE.
  const isRowEditDisabled = useCallback(
    (shellRow: MasterTableRow) => isSharedRow(sourceOf(shellRow)) && !canCreate,
    [canCreate],
  );

  return (
    <CrudMasterPage
      title="Tracking Presets"
      entityLabel="preset"
      entityLabelPlural="presets"
      apiEndpoints={{
        getById: "/stock-track-presets/get",
        create: "/stock-track-presets/save",
        // Never used: a preset is switched off (Active on / off), not deleted.
        delete: DEACTIVATE_ENDPOINT,
      }}
      gridKey="stockTrackPresetList"
      gridTableName="stock_track_preset"
      listResponseStyleArrayKey=""
      useConfiguredGridColumnsOnly
      lookupKeys={LIST_LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      permissionMenuId={TRACK_PRESET_MENU_ID}
      permissionHref={TRACK_PRESET_HREF}
      buildListQuery={buildListQuery}
      listStateResetKey={`${companyId}|${showDeleted ? "deleted" : "live"}`}
      searchPlaceholder="preset code, name, description or remarks"
      toolbarContent={
        <div className={styles.filterCheckGroup}>
          <label className={styles.filterCheckLabel}>
            <input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} />
            Show Only Deleted
          </label>
        </div>
      }
      toolbarActions={toolbarActions}
      isRowEditDisabled={isRowEditDisabled}
      rowEditDisabledReason="Editing a shared preset makes this company's own copy — that needs the Create right"
      isRowDeleteDisabled={NEVER}
      rowDeleteDisabledReason="A preset is switched off, never deleted — use Active on / off (Ctrl+D)"
      listTitle="Tracking Preset List"
      listTitleOverride="Tracking Preset List"
      listSubtitleOverride="Trades the policy screen can offer — what each one tracks, and the defaults it copies into a policy."
      createLabel="Add Preset"
      codeColumnHeader="Code"
      nameColumnHeader="Preset"
      nameFieldLabel="Name"
      formTitle="Tracking Preset"
      formDescription={
        meta.shared && !creating
          ? "A shared preset, the same for every company. Saving makes this company's own copy, which replaces it here; other companies keep the shared one."
          : "What an item's stock is split into lots by, and the defaults that go with it."
      }
      createModalTitle="New Tracking Preset"
      editModalTitle="Tracking Preset"
      viewModalTitle="Tracking Preset"
      customFields={formFields}
      createInitialValues={blank}
      modalPanelStyle={MODAL_PANEL_STYLE}
      modalStackLabels
      onModalOpenChange={(open, key) => {
        setVariantKey(open ? key : null);
        if (open && key === "master-create") setMeta(NEW_META);
      }}
      buildGetByIdRequest={({ recordId }) => ({
        query: { company_id: companyId, spt_id: String(recordId) },
      })}
      mapFormValues={({ source }) => {
        const row = detailRowOf(source) ?? {};
        setMeta({ shared: isSharedRow(row), used: usedByOf(row) });
        return { ...blank, ...formValuesFromRow(row) };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        // A shared preset is never written: saving it makes this company's copy.
        const own = shouldUpdate && !metaRef.current.shared && editingItemId !== null && editingItemId !== undefined;
        return buildSavePayload(values as Record<string, string>, {
          companyId,
          sptId: own ? String(editingItemId) : null,
        });
      }}
    />
  );
}
