"use client";
import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  FiBriefcase,
  FiCalendar,
  FiClipboard,
  FiFileText,
  FiGift,
  FiGitBranch,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiShield,
} from "react-icons/fi";
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Label,
  SearchableSelect,
} from "@/components/design-system/ui";
import { useBusinessContext } from "@/components/layout/business-context";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import {
  DEFAULT_LOOKUP_ARRAY_KEYS,
  extractRows,
} from "@/features/masters/shared/normalizers";
import { useApi } from "@/hooks/useApi";
import type { ApiSuccessResponse } from "@/utils/types";
import dynamicFormStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
import { MasterIcon } from "@/components/design-system/icons/master-icons";
import type {
  LoyaltySchemePayload,
  PromotionLoyaltyPointsListMeta,
  SaveLoyaltyGiftRequest,
  SaveLoyaltyPartyRequest,
  SaveLoyaltyPointRequest,
  SaveLoyaltySchemeRequest,
  LoyaltyPointPayload,
  LoyaltyGiftPayload,
  SchemeListRow,
} from "./promotion-loyalty-points.types";
import {
  CUSTOMER_TYPE_OPTIONS,
  DEFAULT_BRANCH_OPTION,
  DEFAULT_ITEM_BRAND_OPTION,
  DEFAULT_ITEM_CATEGORY_OPTION,
  DEFAULT_ITEM_GROUP_OPTION,
  DEFAULT_ITEM_OPTION,
  DEFAULT_ITEM_SECTION_OPTION,
  DEFAULT_PARTY_CUSTOMER_GROUP_OPTION,
  DEFAULT_PARTY_CUSTOMER_OPTION,
  DEFAULT_POINT_SCOPE_OPTION,
  DEFAULT_REQUIRED_ITEM_OPTION,
  DEFAULT_REQUIRED_UNIT_OPTION,
  DEFAULT_UNIT_OPTION,
  ITEM_BRAND_LOOKUP_KEYS,
  ITEM_CATEGORY_LOOKUP_KEYS,
  ITEM_GROUP_LOOKUP_KEYS,
  ITEM_LOOKUP_KEYS,
  ITEM_SECTION_LOOKUP_KEYS,
  ITEM_TYPE_OPTIONS,
  LOYALTY_DELETE_ENDPOINT,
  LOYALTY_GET_ENDPOINT,
  LOYALTY_GIFT_DELETE_ENDPOINT,
  LOYALTY_GIFT_SAVE_ENDPOINT,
  LOYALTY_LIST_ENDPOINT,
  LOYALTY_POINT_DELETE_ENDPOINT,
  LOYALTY_POINT_SAVE_ENDPOINT,
  LOYALTY_SAVE_ENDPOINT,
  MASTER_LOOKUP_ENDPOINT,
  SCHEME_STATUS_OPTIONS,
  SCHEME_TYPE_OPTIONS,
  CUSTOMER_LOOKUP_KEYS,
  CUSTOMER_GROUP_LOOKUP_KEYS,
  BRANCH_LOOKUP_KEYS,
  UNIT_LOOKUP_KEYS,
  APPLY_ON_OPTIONS,
} from "./promotion-loyalty-points.constant";
import {
  EDITOR_TABS,
  type DeleteDialogState,
  type EditableGiftRow,
  type EditablePartyRow,
  type EditablePointRow,
  type EditorTab,
  type PartyScopeType,
  type PointScopeDescriptor,
  type SchemeFormState,
} from "./promotion-loyalty-points.local-types";
import {
  buildEmptySchemeForm,
  buildGiftRequest,
  buildPointRequest,
  buildSchemeRequest,
  createGiftRow,
  createPartyRow,
  createPointRow,
  buildEmptyPartyRow,
  shouldPersistGiftRow,
  shouldPersistPointRow,
  mapSchemeToForm,
} from "./promotion-loyalty-points.builders";
import {
  buildLookupChoices,
  buildOptionLabelMap,
  formatDateForDisplay,
  getStatusVariant,
  getTypeVariant,
  isValidDateValue,
  isPartyScopeType,
  resolveLabel,
  withFallbackOption,
  withDefaultOption,
} from "./promotion-loyalty-points.utils";
import { SchemeTab } from "./tabs/scheme-tab";
import { PointsTab } from "./tabs/points-tab";
import { GiftsTab } from "./tabs/gifts-tab";
import { PartyTab } from "./tabs/party-tab";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import styles from "./page.module.scss";
const DEFAULT_PARTY_SCOPE_TYPE: PartyScopeType = "CUSTOMER_GROUP";
// `/branch-masters/get` is a fetch-by-id route (it requires a `brId` UUID), not a
// company-filtered list, so querying it with `compId` only ever returned 400 and
// left the branch dropdown empty. This is the company-scoped lookup the business
// context switcher already uses; the id goes in the path.
const BRANCH_BY_COMPANY_ENDPOINT = "/master-lookups/branches/by-company";
const ITEM_PRICE_LIST_ENDPOINT = "/item-prices/get";
const ITEM_LIST_ENDPOINT = "/configured-grid-sql/run?grid_id=1"
const MODAL_FIELD_STYLE_VARS = {
  "--erp-modal-control-height": "2.15rem",
  "--erp-modal-control-padding-y": "0.5rem",
  "--erp-modal-control-padding-x": "0.5rem",
  "--erp-modal-accent": "#0f766e",
  "--erp-modal-accent-soft-ring": "rgba(15, 118, 110, 0.14)",
} as CSSProperties;
type BranchRecord = {
  brId?: string;
  br_id?: string;
  branch_id?: string;
  branchId?: string;
  id?: string;
  _id?: string;
  value?: string;
  brName?: string;
  br_name?: string;
  branch_name?: string;
  branchName?: string;
  name?: string;
  label?: string;
  brIsDefault?: boolean;
  br_is_default?: boolean | string | number | null;
  isDefault?: boolean | string | number | null;
  is_default?: boolean | string | number | null;
};
type ItemPriceRecord = {
  ipm_item_id?: string | null;
  // FK to item_unit_conversion(iuc_id) — item_price_master stores no raw unit
  // id, and no base unit at all; both moved onto the conversion row.
  ipm_uc_unit_id?: string | null;
  item_id?: string | null;
  itemId?: string | null;
  ipmItemId?: string | null;
  unit_id?: string | null;
  unitId?: string | null;
  ipmUnitId?: string | null;
  item_unit_id?: string | null;
  itemUnitId?: string | null;
  uom_id?: string | null;
  ipm_is_active?: boolean | string | number | null;
  is_active?: boolean | string | number | null;
  isActive?: boolean | string | number | null;
  ipm_is_deleted?: boolean | string | number | null;
  is_deleted?: boolean | string | number | null;
  isDeleted?: boolean | string | number | null;
};
type ItemLookupRecord = Record<string, unknown>;
function normalizeScopeValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  if (value == null) {
    return "";
  }
  return String(value).trim().toLowerCase();
}
function isActiveLookupRow(value: unknown): boolean {
  if (value == null || value === "") {
    return true;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized !== "false" && normalized !== "0";
  }
  return true;
}
function isTruthyLookupFlag(value: unknown): boolean {
  if (value == null || value === "") {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return Boolean(value);
}
function isDeletedItemLookupRow(row: ItemLookupRecord): boolean {
  const deletedFlagKeys = [
    "item_is_deleted",
    "itemIsDeleted",
    "is_deleted",
    "isDeleted",
    "deleted",
  ] as const;
  return deletedFlagKeys.some((key) => isTruthyLookupFlag(row[key]));
}
function buildGiftUnitScopeKey(itemId: string, branchId = ""): string {
  return [branchId.trim(), itemId.trim()].join("::");
}
function extractItemPriceRows(payload: unknown): ItemPriceRecord[] {
  return extractRows<ItemPriceRecord>(payload, DEFAULT_LOOKUP_ARRAY_KEYS);
}
function getItemPriceItemId(row: ItemPriceRecord): string {
  const candidates = [
    row.ipm_item_id,
    row.item_id,
    row.itemId,
    row.ipmItemId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}
function getItemPriceUnitId(row: ItemPriceRecord): string {
  const candidates = [
    row.ipm_uc_unit_id,
    row.unit_id,
    row.unitId,
    row.ipmUnitId,
    row.item_unit_id,
    row.itemUnitId,
    row.uom_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}
function isActiveItemPriceRow(row: ItemPriceRecord): boolean {
  const activeFlag = [
    row.ipm_is_active,
    row.is_active,
    row.isActive,
  ].find((value) => value != null && value !== "");
  return activeFlag == null ? true : isActiveLookupRow(activeFlag);
}
function isDeletedItemPriceRow(row: ItemPriceRecord): boolean {
  return [
    row.ipm_is_deleted,
    row.is_deleted,
    row.isDeleted,
  ].some(isTruthyLookupFlag);
}
function readStringField(
  row: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}
function getBranchId(row: BranchRecord): string {
  return readStringField(row, ["brId", "br_id", "branch_id", "branchId", "id", "_id", "value"]);
}
function getBranchName(row: BranchRecord): string {
  return readStringField(row, ["brName", "br_name", "branch_name", "branchName", "name", "label"]);
}
function isDefaultBranch(row: BranchRecord): boolean {
  return [
    row.brIsDefault,
    row.br_is_default,
    row.isDefault,
    row.is_default,
  ].some(isTruthyLookupFlag);
}
function getSchemeBranchLabel(
  row: { ls_branch_id: string | null },
  branchLabelMap: Map<string, string>,
): string {
  const directBranchName = readStringField(
    row as unknown as Record<string, unknown>,
    ["ls_branch_name", "lsBranchName", "branch_name", "branchName", "br_name", "brName"],
  );
  if (directBranchName) {
    return directBranchName;
  }
  return resolveLabel(row.ls_branch_id, branchLabelMap, "All Branches");
}
function toSchemeListRow(row: Record<string, unknown>): SchemeListRow {
  const toStr = (value: unknown): string => (value == null ? "" : String(value));
  const toNullableStr = (value: unknown): string | null => (value == null ? null : String(value));
  const toCount = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    ls_id: toStr(row.ls_id),
    ls_code: toNullableStr(row.ls_code),
    ls_name: toStr(row.ls_name),
    ls_type: toStr(row.ls_type),
    ls_status: toStr(row.ls_status),
    ls_branch_id: toNullableStr(row.ls_branch_id),
    ls_start_date: toStr(row.ls_start_date),
    ls_end_date: toStr(row.ls_end_date),
    ls_is_active: Boolean(row.ls_is_active),
    points_count: toCount(row.points_count),
    gifts_count: toCount(row.gifts_count),
    parties_count: toCount(row.parties_count),
  };
}

type MetricTone = "blue" | "green" | "orange" | "purple";

function buildSparklinePath(values: number[], width = 96, height = 36): string {
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * xStep;
    const y = height - ((value - min) / range) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return points.join(" ");
}

function MetricCard({
  icon,
  label,
  value,
  tone,
  sparkline,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: MetricTone;
  sparkline: number[];
}) {
  const points = buildSparklinePath(sparkline);
  const areaPath = points ? `M ${points.replaceAll(",", " ")} L 96 36 L 0 36 Z` : "";

  return (
    <article className={`${styles.metricCard} ${styles[`metricCard${tone}`]}`}>
      <div className={styles.metricIcon} aria-hidden="true">
        {icon}
      </div>
      <div className={styles.metricCopy}>
        <p className={styles.metricLabel}>{label}</p>
        <p className={styles.metricValue}>{value}</p>
      </div>
      <svg className={styles.metricSparkline} viewBox="0 0 96 36" aria-hidden="true">
        {areaPath ? <path d={areaPath} className={styles.metricSparklineFill} /> : null}
        {points ? <polyline points={points} className={styles.metricSparklineLine} /> : null}
      </svg>
    </article>
  );
}
export default function PromotionLoyaltyPointsPage() {
  const {
    companyOptions,
    selectedBranchId,
    selectedCompanyId,
  } = useBusinessContext();
  // ── List state ────────────────────────────────────────────────────────────
  const [pageCompanyId, setPageCompanyId] = useState(selectedCompanyId);
  const [pageBranchChoices, setPageBranchChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [pageDefaultBranchId, setPageDefaultBranchId] = useState(selectedBranchId);
  const [schemeBranchChoices, setSchemeBranchChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [schemeRows, setSchemeRows] = useState<SchemeListRow[]>([]);
  const [selectedScheme, setSelectedScheme] = useState<LoyaltySchemePayload | null>(null);
  const [listMeta, setListMeta] = useState<PromotionLoyaltyPointsListMeta | null>(null);
  const [schemeSearch, setSchemeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  // ── Editor state ──────────────────────────────────────────────────────────
  const [schemeForm, setSchemeForm] = useState<SchemeFormState>(
    buildEmptySchemeForm(pageCompanyId, pageDefaultBranchId),
  );
  const [pointRows, setPointRows] = useState<EditablePointRow[]>([]);
  const [giftRows, setGiftRows] = useState<EditableGiftRow[]>([]);
  const [partyRows, setPartyRows] = useState<EditablePartyRow[]>([]);
  const [deletedPointIds, setDeletedPointIds] = useState<string[]>([]);
  const [deletedGiftIds, setDeletedGiftIds] = useState<string[]>([]);
  const [editorSubmitError, setEditorSubmitError] = useState<string | null>(null);
  const [showSchemeValidation, setShowSchemeValidation] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("scheme");
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
  const editorDialogRef = useRef<HTMLDivElement | null>(null);
  const editorScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const listRequestIdRef = useRef(0);
  // ── Lookup choices ────────────────────────────────────────────────────────
  const [itemChoices, setItemChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [itemGroupChoices, setItemGroupChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [itemCategoryChoices, setItemCategoryChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [itemBrandChoices, setItemBrandChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [itemSectionChoices, setItemSectionChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [unitChoices, setUnitChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [branchLookupChoices, setBranchLookupChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [customerChoices, setCustomerChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [customerGroupChoices, setCustomerGroupChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [giftUnitIdsByScopeKey, setGiftUnitIdsByScopeKey] = useState<Record<string, string[]>>({});
  const giftUnitIdsByScopeKeyRef = useRef<Record<string, string[]>>({});
  const giftUnitRequestsRef = useRef<Record<string, Promise<string[]>>>({});
  const deferredSchemeSearch = useDeferredValue(schemeSearch.trim());
  // ── API hooks ─────────────────────────────────────────────────────────────
  const { getAll: listSchemes, loading: listLoading, error: listError } = useApi<
    ApiSuccessResponse<{ items: Record<string, unknown>[]; meta: { page: number; limit: number; total: number } }>
  >(LOYALTY_LIST_ENDPOINT, { toast: { success: false, error: true } });
  const { run: getSchemeById, loading: detailLoading, error: detailError } = useApi<
    ApiSuccessResponse<LoyaltySchemePayload>
  >(LOYALTY_GET_ENDPOINT, { toast: { success: false, error: true } });
  const { run: saveScheme, loading: schemeSaving } = useApi<
    ApiSuccessResponse<LoyaltySchemePayload>,
    SaveLoyaltySchemeRequest
  >(LOYALTY_SAVE_ENDPOINT, {
    method: "POST",
    toast: { success: true, error: true, successMessage: "Loyalty scheme saved." },
  });
  const { run: deleteScheme, loading: schemeDeleting } = useApi<
    ApiSuccessResponse<{ ls_id: string; deleted: true }>
  >(LOYALTY_DELETE_ENDPOINT, {
    method: "DELETE",
    toast: { success: true, error: true, successMessage: "Loyalty scheme deleted." },
  });
  const { run: savePoint } = useApi<ApiSuccessResponse<LoyaltyPointPayload>, SaveLoyaltyPointRequest>(
    LOYALTY_POINT_SAVE_ENDPOINT,
    { method: "POST", toast: { success: true, error: true, successMessage: "Point rule saved." } },
  );
  const { run: savePointSilently } = useApi<ApiSuccessResponse<LoyaltyPointPayload>, SaveLoyaltyPointRequest>(
    LOYALTY_POINT_SAVE_ENDPOINT,
    { method: "POST", toast: { success: false, error: true } },
  );
  const { run: deletePointSilently } = useApi<ApiSuccessResponse<{ lspt_id: string; deleted: true }>>(
    LOYALTY_POINT_DELETE_ENDPOINT,
    { method: "DELETE", toast: { success: false, error: true } },
  );
  const { run: saveGift } = useApi<ApiSuccessResponse<LoyaltyGiftPayload>, SaveLoyaltyGiftRequest>(
    LOYALTY_GIFT_SAVE_ENDPOINT,
    { method: "POST", toast: { success: true, error: true, successMessage: "Gift rule saved." } },
  );
  const { run: saveGiftSilently } = useApi<ApiSuccessResponse<LoyaltyGiftPayload>, SaveLoyaltyGiftRequest>(
    LOYALTY_GIFT_SAVE_ENDPOINT,
    { method: "POST", toast: { success: false, error: true } },
  );
  const { run: deleteGiftSilently } = useApi<ApiSuccessResponse<{ lsg_id: string; deleted: true }>>(
    LOYALTY_GIFT_DELETE_ENDPOINT,
    { method: "DELETE", toast: { success: false, error: true } },
  );
  const { run: loadBranchesForCompany } = useApi<unknown>(BRANCH_BY_COMPANY_ENDPOINT, {
    toast: { success: false, error: false },
  });
  const { getAll: listItemPrices } = useApi<ApiSuccessResponse<ItemPriceRecord[]>>(ITEM_PRICE_LIST_ENDPOINT, {
    toast: { success: false, error: false },
  });
  const { getAll: getItemLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getItemGroupLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getItemCategoryLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getItemBrandLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getItemSectionLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getUnitLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getBranchLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getCustomerLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getCustomerGroupLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getItemsList } = useApi<unknown>(ITEM_LIST_ENDPOINT, { toast: { success: false, error: false } });
  const loadActiveBranchesForCompany = useCallback(
    async (companyId: string) => {
      const normalizedCompanyId = companyId.trim();
      if (!normalizedCompanyId) {
        return {
          choices: [] as ERPDynamicSelectOption[],
          defaultBranchId: "",
        };
      }
      // The lookup returns every active branch for the company in one unpaginated
      // response, so there is no page loop to run.
      const payload = await loadBranchesForCompany({
        url: `${BRANCH_BY_COMPANY_ENDPOINT}/${encodeURIComponent(normalizedCompanyId)}`,
      });
      const branches = extractRows<BranchRecord>(payload).filter(
        (branch) => Boolean(getBranchId(branch) && getBranchName(branch)),
      );
      const branchChoiceMap = new Map<string, ERPDynamicSelectOption>();
      branches.forEach((branch) => {
        const branchId = getBranchId(branch);
        if (!branchChoiceMap.has(branchId)) {
          branchChoiceMap.set(branchId, {
            value: branchId,
            label: getBranchName(branch),
          });
        }
      });
      const defaultBranchId = getBranchId(
        branches.find(isDefaultBranch) ?? branches[0] ?? {},
      );
      const choices = Array.from(branchChoiceMap.values());
      return {
        choices,
        defaultBranchId: defaultBranchId || choices[0]?.value || "",
      };
    },
    [loadBranchesForCompany],
  );
  // ── Derived options ───────────────────────────────────────────────────────
  const pageBranchOptions = useMemo(
    () => withDefaultOption(pageBranchChoices, DEFAULT_BRANCH_OPTION),
    [pageBranchChoices],
  );
  const schemeBranchOptions = useMemo(
    () => withDefaultOption(schemeBranchChoices, DEFAULT_BRANCH_OPTION),
    [schemeBranchChoices],
  );
  const schemePartyScopeType = useMemo<PartyScopeType | null>(
    () => (isPartyScopeType(schemeForm.ls_cust_type) ? schemeForm.ls_cust_type : null),
    [schemeForm.ls_cust_type],
  );
  const shouldHidePointScopeColumn = schemeForm.ls_item_type === "ALL";
  const shouldShowPointUnitColumn = schemeForm.ls_item_type === "ITEM";
  const partyScopeColumnHeader =
    schemePartyScopeType === "CUSTOMER_GROUP"
      ? "Customer Group"
      : schemePartyScopeType === "CUSTOMER"
        ? "Customer"
        : "Scope";
  const pointScopeDescriptor = useMemo<PointScopeDescriptor>(() => {
    switch (schemeForm.ls_item_type) {
      case "ITEM_GROUP":
        return { headerLabel: "Item Group", options: itemGroupChoices, defaultOption: DEFAULT_ITEM_GROUP_OPTION };
      case "ITEM_BRAND":
        return { headerLabel: "Item Brand", options: itemBrandChoices, defaultOption: DEFAULT_ITEM_BRAND_OPTION };
      case "ITEM_CATEGORY":
        return { headerLabel: "Item Category", options: itemCategoryChoices, defaultOption: DEFAULT_ITEM_CATEGORY_OPTION };
      case "ITEM_SECTION":
        return { headerLabel: "Item Section", options: itemSectionChoices, defaultOption: DEFAULT_ITEM_SECTION_OPTION };
      case "ALL":
        return { headerLabel: "Item Scope", options: itemChoices, defaultOption: DEFAULT_POINT_SCOPE_OPTION };
      case "ITEM":
      default:
        return { headerLabel: "Item", options: itemChoices, defaultOption: DEFAULT_ITEM_OPTION };
    }
  }, [itemBrandChoices, itemCategoryChoices, itemChoices, itemGroupChoices, itemSectionChoices, schemeForm.ls_item_type]);
  const pointScopeOptionsForPoint = useMemo(
    () => withDefaultOption(pointScopeDescriptor.options, pointScopeDescriptor.defaultOption),
    [pointScopeDescriptor],
  );
  const pointExceedsHeader = useMemo(() => {
    const label = APPLY_ON_OPTIONS.find((o) => o.value === schemeForm.ls_apply_on)?.label;
    return label ? `${label} Exceeds` : "Exceeds";
  }, [schemeForm.ls_apply_on]);
  const unitOptionsForPoint = useMemo(() => withDefaultOption(unitChoices, DEFAULT_UNIT_OPTION), [unitChoices]);
  const itemOptionsForGift = useMemo(() => withDefaultOption(itemChoices, DEFAULT_REQUIRED_ITEM_OPTION), [itemChoices]);
  const customerOptionsForParty = useMemo(() => withDefaultOption(customerChoices, DEFAULT_PARTY_CUSTOMER_OPTION), [customerChoices]);
  const customerGroupOptionsForParty = useMemo(() => withDefaultOption(customerGroupChoices, DEFAULT_PARTY_CUSTOMER_GROUP_OPTION), [customerGroupChoices]);
  const customerLabelMap = useMemo(() => buildOptionLabelMap(customerChoices), [customerChoices]);
  const customerGroupLabelMap = useMemo(() => buildOptionLabelMap(customerGroupChoices), [customerGroupChoices]);
  const branchLabelMap = useMemo(
    () => buildOptionLabelMap([...pageBranchOptions, ...schemeBranchOptions, ...branchLookupChoices]),
    [branchLookupChoices, pageBranchOptions, schemeBranchOptions],
  );
  const unitLabelMap = useMemo(() => buildOptionLabelMap(unitChoices), [unitChoices]);
  const pointScopeLabelMap = useMemo(
    () => buildOptionLabelMap([...itemChoices, ...itemGroupChoices, ...itemCategoryChoices, ...itemBrandChoices, ...itemSectionChoices]),
    [itemBrandChoices, itemCategoryChoices, itemChoices, itemGroupChoices, itemSectionChoices],
  );
  const typeFilterOptions = useMemo<ERPDynamicSelectOption[]>(
    () => [{ value: "", label: "All Types" }, ...SCHEME_TYPE_OPTIONS],
    [],
  );
  const statusFilterOptions = useMemo<ERPDynamicSelectOption[]>(
    () => [{ value: "", label: "All Status" }, ...SCHEME_STATUS_OPTIONS],
    [],
  );
  useEffect(() => {
    giftUnitIdsByScopeKeyRef.current = giftUnitIdsByScopeKey;
  }, [giftUnitIdsByScopeKey]);
  // ── Row mutators ──────────────────────────────────────────────────────────
  const updatePointRow = (rowKey: string, patch: Partial<EditablePointRow>) =>
    setPointRows((prev) => prev.map((r) => r._rowKey === rowKey ? { ...r, ...patch } : r));
  const updateGiftRow = (rowKey: string, patch: Partial<EditableGiftRow>) =>
    setGiftRows((prev) => prev.map((r) => r._rowKey === rowKey ? { ...r, ...patch } : r));
  const handleSchemeItemTypeChange = useCallback(
    (value: string) => {
      const normalizedNextValue = value.trim();
      if (normalizedNextValue === schemeForm.ls_item_type) {
        return;
      }
      setEditorSubmitError(null);
      setSchemeForm((prev) => ({ ...prev, ls_item_type: value }));
      setPointRows((prev) => {
        const deletedIds = prev
          .map((row) => row.lspt_id.trim())
          .filter(Boolean);
        if (deletedIds.length > 0) {
          setDeletedPointIds((current) =>
            deletedIds.reduce((ids, id) => queueDeletedId(ids, id), current),
          );
        }
        return [];
      });
    },
    [schemeForm.ls_item_type],
  );
  const ensureGiftUnitIdsForItem = useCallback(
    async (
      itemId: string,
      options?: { force?: boolean },
    ) => {
      const normalizedItemId = itemId.trim();
      if (!normalizedItemId) {
        return [];
      }
      const scopedBranchId = schemeForm.ls_branch_id.trim();
      const scopeKey = buildGiftUnitScopeKey(
        normalizedItemId,
        scopedBranchId,
      );
      const cachedUnitIds = giftUnitIdsByScopeKeyRef.current[scopeKey];
      if (cachedUnitIds && !options?.force) {
        return cachedUnitIds;
      }
      const pendingRequest = giftUnitRequestsRef.current[scopeKey];
      if (pendingRequest) {
        return pendingRequest;
      }
      const request = (async () => {
        const response = await listItemPrices({
          ipm_item_id: normalizedItemId,
          limit: "100"
        });
        const rows = extractItemPriceRows(response);
        const normalizedItemKey = normalizeScopeValue(normalizedItemId);
        const nextUnitIds = Array.from(
          new Set(
            rows
              .filter((row) => isActiveItemPriceRow(row))
              .filter((row) => !isDeletedItemPriceRow(row))
              .filter((row) => normalizeScopeValue(getItemPriceItemId(row)) === normalizedItemKey)
              .map((row) => getItemPriceUnitId(row))
              .filter(Boolean),
          ),
        );
        setGiftUnitIdsByScopeKey((prev) =>
          options?.force || !prev[scopeKey]
            ? { ...prev, [scopeKey]: nextUnitIds }
            : prev,
        );
        return nextUnitIds;
      })();
      giftUnitRequestsRef.current[scopeKey] = request;
      try {
        return await request;
      } finally {
        delete giftUnitRequestsRef.current[scopeKey];
      }
    },
    [listItemPrices, schemeForm.ls_branch_id],
  );
  const getUnitOptionsForGiftRow = useCallback(
    (row: EditableGiftRow) => {
      const itemId = row.lsg_item_id.trim();
      if (!itemId) {
        return [DEFAULT_REQUIRED_UNIT_OPTION];
      }
      const scopeKey = buildGiftUnitScopeKey(
        itemId,
        schemeForm.ls_branch_id,
      );
      const allowedUnitIds = giftUnitIdsByScopeKey[scopeKey];
      const filteredUnitOptions = (allowedUnitIds ?? []).map((unitId) => {
        const normalizedUnitId = unitId.trim();
        return {
          value: normalizedUnitId,
          label: unitLabelMap.get(normalizedUnitId) ?? normalizedUnitId,
        };
      });
      return withFallbackOption(
        withDefaultOption(filteredUnitOptions, DEFAULT_REQUIRED_UNIT_OPTION),
        row.lsg_unit_id,
        unitLabelMap,
      );
    },
    [
      giftUnitIdsByScopeKey,
      schemeForm.ls_branch_id,
      unitLabelMap,
    ],
  );
  const getUnitOptionsForPointRow = useCallback(
    (row: EditablePointRow) => {
      const itemId = row.lspt_item_id.trim();
      if (!itemId) {
        return [DEFAULT_UNIT_OPTION];
      }
      const scopeKey = buildGiftUnitScopeKey(
        itemId,
        schemeForm.ls_branch_id,
      );
      const allowedUnitIds = giftUnitIdsByScopeKey[scopeKey];
      const filteredUnitOptions = (allowedUnitIds ?? []).map((unitId) => {
        const normalizedUnitId = unitId.trim();
        return {
          value: normalizedUnitId,
          label: unitLabelMap.get(normalizedUnitId) ?? normalizedUnitId,
        };
      });
      return withFallbackOption(
        withDefaultOption(filteredUnitOptions, DEFAULT_UNIT_OPTION),
        row.lspt_unit_id,
        unitLabelMap,
      );
    },
    [
      giftUnitIdsByScopeKey,
      schemeForm.ls_branch_id,
      unitLabelMap,
    ],
  );
  const handleGiftItemChange = useCallback(
    (row: EditableGiftRow, value: string) => {
      const normalizedNextItemId = value.trim();
      const normalizedCurrentItemId = row.lsg_item_id.trim();
      if (normalizedNextItemId === normalizedCurrentItemId) {
        return;
      }
      updateGiftRow(row._rowKey, {
        lsg_item_id: value,
        lsg_unit_id: "",
      });
      if (!normalizedNextItemId) {
        return;
      }
      void ensureGiftUnitIdsForItem(normalizedNextItemId, { force: true });
    },
    [ensureGiftUnitIdsForItem],
  );
  const handlePointScopeChange = useCallback(
    (row: EditablePointRow, value: string) => {
      const normalizedNextItemId = value.trim();
      const normalizedCurrentItemId = row.lspt_item_id.trim();
      if (normalizedNextItemId === normalizedCurrentItemId) {
        return;
      }
      if (schemeForm.ls_item_type !== "ITEM") {
        updatePointRow(row._rowKey, { lspt_item_id: value });
        return;
      }
      updatePointRow(row._rowKey, {
        lspt_item_id: value,
        lspt_unit_id: "",
      });
      if (!normalizedNextItemId) {
        return;
      }
      void ensureGiftUnitIdsForItem(normalizedNextItemId, { force: true });
    },
    [ensureGiftUnitIdsForItem, schemeForm.ls_item_type],
  );
  const updatePartyRow = (rowKey: string, patch: Partial<EditablePartyRow>) => {
    setEditorSubmitError(null);
    setPartyRows((prev) => prev.map((r) => r._rowKey === rowKey ? { ...r, ...patch } : r));
  };
  const queueDeletedId = (ids: string[], id: string) => ids.includes(id) ? ids : [...ids, id];
  const removePointRow = (rowKey: string, rowId?: string) => {
    setPointRows((prev) => prev.filter((r) => r._rowKey !== rowKey));
    if (rowId) setDeletedPointIds((prev) => queueDeletedId(prev, rowId));
  };
  const removeGiftRow = (rowKey: string, rowId?: string) => {
    setGiftRows((prev) => prev.filter((r) => r._rowKey !== rowKey));
    if (rowId) setDeletedGiftIds((prev) => queueDeletedId(prev, rowId));
  };
  const removePartyRow = (rowKey: string) => {
    setEditorSubmitError(null);
    setPartyRows((prev) => prev.filter((r) => r._rowKey !== rowKey));
  };
  const addPointRow = () => {
    setPointRows((prev) => {
      const nextSlno = prev.reduce((m, r) => Math.max(m, Number.parseInt(r.lspt_slno || "0", 10) || 0), 0) + 1;
      return [...prev, { ...createPointRow(), lspt_slno: String(nextSlno) }];
    });
  };
  const addGiftRow = () => {
    setGiftRows((prev) => {
      const nextSlno = prev.reduce((m, r) => Math.max(m, Number.parseInt(r.lsg_slno || "0", 10) || 0), 0) + 1;
      return [...prev, { ...createGiftRow(), lsg_slno: String(nextSlno) }];
    });
  };
  const addPartyRow = () => {
    setEditorSubmitError(null);
    const nextScopeType = schemePartyScopeType ?? DEFAULT_PARTY_SCOPE_TYPE;
    if (!schemePartyScopeType) {
      setSchemeForm((prev) => ({ ...prev, ls_cust_type: nextScopeType }));
    }
    setPartyRows((prev) => {
      const nextSlno = prev.reduce((m, r) => Math.max(m, r.lps_slno || 0), 0) + 1;
      return [...prev, buildEmptyPartyRow(nextSlno, nextScopeType)];
    });
  };
  // ── Gift validation ───────────────────────────────────────────────────────
  const getGiftRowValidationMessage = (row: EditableGiftRow, index: number): string | null => {
    if (!shouldPersistGiftRow(row)) return null;
    const label = `Gift row ${row.lsg_slno || index + 1}`;
    if (!row.lsg_unit_id.trim()) return `${label} requires unit.`;
    const qtyValue = row.lsg_item_qty.trim();
    if (!qtyValue) return `${label} requires qty.`;
    const qtyNumber = Number(qtyValue);
    if (!Number.isFinite(qtyNumber) || qtyNumber <= 0) {
      return `${label} requires a valid qty greater than 0.`;
    }
    return null;
  };
  // ── Party validation ──────────────────────────────────────────────────────
  const getPartyRowValidationMessage = (row: EditablePartyRow, index: number): string | null => {
    const effectiveType = schemePartyScopeType ?? (isPartyScopeType(row.lps_scope_type) ? row.lps_scope_type : null);
    const label = `Party Scope row ${row.lps_slno || index + 1}`;
    if (!effectiveType) return `${label} requires a customer scope in the Scheme tab.`;
    const isUuidValid = Boolean(row.lps_scope_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.lps_scope_id.trim()));
    if (!isUuidValid) return `${label} requires a valid ${effectiveType === "CUSTOMER_GROUP" ? "customer group" : "customer"} selection.`;
    return null;
  };
  // ── Data loading ──────────────────────────────────────────────────────────
  const resetSchemeEditor = useCallback((nextCompanyId: string, nextBranchId = "") => {
    setEditorSubmitError(null);
    setShowSchemeValidation(false);
    setSelectedScheme(null);
    setSchemeForm(buildEmptySchemeForm(nextCompanyId, nextBranchId));
    setPointRows([]);
    setGiftRows([]);
    setPartyRows([]);
    setDeletedPointIds([]);
    setDeletedGiftIds([]);
  }, []);
  const handlePageCompanyChange = useCallback((value: string) => {
    const nextCompanyId = value.trim();
    if (nextCompanyId === pageCompanyId) {
      return;
    }
    setPageCompanyId(nextCompanyId);
    setBranchFilter("");
    setPageBranchChoices([]);
    setPageDefaultBranchId("");
    setSchemeRows([]);
    setListMeta(null);
    resetSchemeEditor(nextCompanyId, "");
  }, [pageCompanyId, resetSchemeEditor]);
  const handleSchemeCompanyChange = useCallback((value: string) => {
    const nextCompanyId = value.trim();
    setSchemeForm((prev) => {
      if (prev.ls_comp_id === nextCompanyId) {
        return prev;
      }
      return {
        ...prev,
        ls_comp_id: nextCompanyId,
        ls_branch_id: "",
      };
    });
  }, []);
  const loadSchemeDetail = async (schemeId: string) => {
    const response = await getSchemeById({ query: { ls_id: schemeId } });
    if (!response?.data) return;
    setEditorSubmitError(null);
    setShowSchemeValidation(false);
    setSelectedScheme(response.data);
    setSchemeForm(mapSchemeToForm(response.data));
    setPointRows((response.data.points ?? []).map((r) => createPointRow(r)));
    setGiftRows((response.data.gifts ?? []).map((r) => createGiftRow(r)));
    setPartyRows((response.data.parties ?? []).map((r) => createPartyRow(r)));
    setDeletedPointIds([]);
    setDeletedGiftIds([]);
  };
  const reloadSchemes = async () => {
    const requestId = ++listRequestIdRef.current;
    if (!pageCompanyId.trim()) {
      setSchemeRows([]);
      setListMeta(null);
      resetSchemeEditor("", "");
      return;
    }
    const limit = 100;
    const query: Record<string, string> = {
      page: "1",
      limit: String(limit),
      grid_param: JSON.stringify({
        p_comp_id: pageCompanyId.trim(),
        p_branch_id: branchFilter.trim(),
        p_status: statusFilter.trim(),
        p_type: typeFilter.trim(),
      }),
    };
    if (deferredSchemeSearch) query.search = deferredSchemeSearch;
    const response = await listSchemes(query);
    if (requestId !== listRequestIdRef.current) return;
    const nextRows = (response?.data?.items ?? []).map(toSchemeListRow);
    setSchemeRows(nextRows);
    const meta = response?.data?.meta ?? null;
    setListMeta(
      meta
        ? { ...meta, total_pages: meta.limit > 0 ? Math.ceil(meta.total / meta.limit) : 0 }
        : null,
    );
    if (selectedScheme && !nextRows.some((r) => r.ls_id === selectedScheme.ls_id)) {
      resetSchemeEditor(pageCompanyId, pageDefaultBranchId);
    }
  };
  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (pageCompanyId.trim() || !selectedCompanyId.trim()) {
      return;
    }
    setPageCompanyId(selectedCompanyId);
    setPageDefaultBranchId(selectedBranchId);
  }, [pageCompanyId, selectedBranchId, selectedCompanyId]);
  useEffect(() => {
    let ignore = false;
    const syncPageBranches = async () => {
      setDeleteDialog(null);
      setActiveTab("scheme");
      setBranchFilter("");
      setSchemeRows([]);
      setListMeta(null);
      resetSchemeEditor(pageCompanyId, "");
      if (!pageCompanyId.trim()) {
        setPageBranchChoices([]);
        setPageDefaultBranchId("");
        return;
      }
      try {
        const { choices, defaultBranchId } = await loadActiveBranchesForCompany(pageCompanyId);
        if (ignore) return;
        setPageBranchChoices(choices);
        setPageDefaultBranchId(defaultBranchId);
        resetSchemeEditor(pageCompanyId, defaultBranchId);
      } catch {
        if (ignore) return;
        setPageBranchChoices([]);
        setPageDefaultBranchId("");
      }
    };
    void syncPageBranches();
    return () => {
      ignore = true;
    };
  }, [loadActiveBranchesForCompany, pageCompanyId, resetSchemeEditor]);
  useEffect(() => {
    if (!pageCompanyId.trim()) {
      setSchemeRows([]);
      setListMeta(null);
      resetSchemeEditor("", "");
      return;
    }
    setSchemeForm((prev) => ({
      ...prev,
      ls_comp_id: pageCompanyId,
      ...(!selectedScheme ? { ls_branch_id: prev.ls_branch_id || pageDefaultBranchId } : {}),
    }));
  }, [pageCompanyId, pageDefaultBranchId, resetSchemeEditor, selectedScheme]);
  useEffect(() => {
    if (!isEditorOpen) {
      return;
    }
    let ignore = false;
    const targetCompanyId = schemeForm.ls_comp_id.trim();
    const syncSchemeBranches = async () => {
      if (!targetCompanyId) {
        setSchemeBranchChoices([]);
        setSchemeForm((prev) => (
          prev.ls_comp_id.trim()
            ? prev
            : prev.ls_branch_id
              ? { ...prev, ls_branch_id: "" }
              : prev
        ));
        return;
      }
      try {
        const { choices, defaultBranchId } = await loadActiveBranchesForCompany(targetCompanyId);
        if (ignore) return;
        setSchemeBranchChoices(choices);
        setSchemeForm((prev) => {
          if (prev.ls_comp_id.trim() !== targetCompanyId) {
            return prev;
          }
          const currentBranchId = prev.ls_branch_id.trim();
          const hasCurrentBranch = choices.some((branch) => branch.value === currentBranchId);
          const nextBranchId = hasCurrentBranch ? currentBranchId : defaultBranchId;
          return currentBranchId === nextBranchId
            ? prev
            : { ...prev, ls_branch_id: nextBranchId };
        });
      } catch {
        if (ignore) return;
        setSchemeBranchChoices([]);
        setSchemeForm((prev) => (
          prev.ls_comp_id.trim() !== targetCompanyId || !prev.ls_branch_id
            ? prev
            : { ...prev, ls_branch_id: "" }
        ));
      }
    };
    void syncSchemeBranches();
    return () => {
      ignore = true;
    };
  }, [isEditorOpen, loadActiveBranchesForCompany, schemeForm.ls_comp_id]);
  useEffect(() => {
    const loadLookups = async () => {
      const [
        itemsPayload,
        itemsListPayload,
        groupsPayload,
        categoriesPayload,
        brandsPayload,
        sectionsPayload,
        unitsPayload,
        branchesPayload,
        customersPayload,
        customerGroupsPayload,
      ] = await Promise.allSettled([
        getItemLookup({ module: "items" }),
        getItemsList({ limit: "100" }),
        getItemGroupLookup({ module: "itemGroups" }),
        getItemCategoryLookup({ module: "itemCategories" }),
        getItemBrandLookup({ module: "itemBrands" }),
        getItemSectionLookup({ module: "itemSections" }),
        getUnitLookup({ module: "units" }),
        getBranchLookup({ module: "branches" }),
        getCustomerLookup({ module: "customers" }),
        getCustomerGroupLookup({ module: "customerGroups" }),
      ]);
      // ── Items ────────────────────────────────────────────────────────────────
      // Pass the RAW payload so buildLookupOptions can extract the array using
      // its arrayKeys config. Pre-extracting with extractRows() breaks this step.
      // Deleted-item filtering is done after extraction using the id set built
      // from the extracted rows.
      const buildFilteredItemChoices = (payload: unknown): ERPDynamicSelectOption[] => {
        const rows = extractRows<ItemLookupRecord>(payload, DEFAULT_LOOKUP_ARRAY_KEYS);
        const deletedIds = new Set(
          rows
            .filter(isDeletedItemLookupRow)
            .map((row) => {
              const idKeys = ["item_id", "itemId", "id", "_id", "value"] as const;
              for (const key of idKeys) {
                const v = (row as Record<string, unknown>)[key];
                if (typeof v === "string" && v.trim()) return v.trim();
              }
              return "";
            })
            .filter(Boolean),
        );
        return buildLookupChoices(payload, ITEM_LOOKUP_KEYS).filter(
          (opt) => !deletedIds.has(opt.value),
        );
      };
      const masterItemChoices =
        itemsPayload.status === "fulfilled"
          ? buildFilteredItemChoices(itemsPayload.value)
          : [];
      const listItemChoices =
        itemsListPayload.status === "fulfilled"
          ? buildFilteredItemChoices(itemsListPayload.value)
          : [];
      setItemChoices(masterItemChoices.length > 0 ? masterItemChoices : listItemChoices);
      // ── Item sub-groups (raw payload — already correct) ───────────────────
      setItemGroupChoices(
        groupsPayload.status === "fulfilled"
          ? buildLookupChoices(groupsPayload.value, ITEM_GROUP_LOOKUP_KEYS)
          : [],
      );
      setItemCategoryChoices(
        categoriesPayload.status === "fulfilled"
          ? buildLookupChoices(categoriesPayload.value, ITEM_CATEGORY_LOOKUP_KEYS)
          : [],
      );
      setItemBrandChoices(
        brandsPayload.status === "fulfilled"
          ? buildLookupChoices(brandsPayload.value, ITEM_BRAND_LOOKUP_KEYS)
          : [],
      );
      setItemSectionChoices(
        sectionsPayload.status === "fulfilled"
          ? buildLookupChoices(sectionsPayload.value, ITEM_SECTION_LOOKUP_KEYS)
          : [],
      );
      // ── Units ─────────────────────────────────────────────────────────────
      // Same fix: pass raw payload, not pre-extracted rows.
      setUnitChoices(
        unitsPayload.status === "fulfilled"
          ? buildLookupChoices(unitsPayload.value, UNIT_LOOKUP_KEYS)
          : [],
      );
      // ── Branches ──────────────────────────────────────────────────────────
      setBranchLookupChoices(
        branchesPayload.status === "fulfilled"
          ? buildLookupChoices(branchesPayload.value, BRANCH_LOOKUP_KEYS)
          : [],
      );
      // ── Customers ─────────────────────────────────────────────────────────
      // Same fix: pass raw payload.
      setCustomerChoices(
        customersPayload.status === "fulfilled"
          ? buildLookupChoices(customersPayload.value, CUSTOMER_LOOKUP_KEYS)
          : [],
      );
      // ── Customer Groups ───────────────────────────────────────────────────
      // Same fix: pass raw payload.
      setCustomerGroupChoices(
        customerGroupsPayload.status === "fulfilled"
          ? buildLookupChoices(customerGroupsPayload.value, CUSTOMER_GROUP_LOOKUP_KEYS)
          : [],
      );
    };
    void loadLookups();
  }, [
    getCustomerGroupLookup, getCustomerLookup, getItemBrandLookup, getItemCategoryLookup,
    getBranchLookup, getItemGroupLookup, getItemLookup, getItemSectionLookup, getUnitLookup,
    getItemsList,
  ]);
  useEffect(() => {
    const uniqueItemIds = Array.from(
      new Set(
        giftRows.map((row) => row.lsg_item_id.trim()).filter(Boolean),
      ),
    );
    uniqueItemIds.forEach((itemId) => {
      void ensureGiftUnitIdsForItem(itemId);
    });
  }, [ensureGiftUnitIdsForItem, giftRows]);
  useEffect(() => {
    if (schemeForm.ls_item_type !== "ITEM") {
      return;
    }
    const uniqueItemIds = Array.from(
      new Set(
        pointRows.map((row) => row.lspt_item_id.trim()).filter(Boolean),
      ),
    );
    uniqueItemIds.forEach((itemId) => {
      void ensureGiftUnitIdsForItem(itemId);
    });
  }, [ensureGiftUnitIdsForItem, pointRows, schemeForm.ls_item_type]);
  useEffect(() => {
    void reloadSchemes();
  }, [pageCompanyId, branchFilter, deferredSchemeSearch, statusFilter, typeFilter]);
  useEffect(() => {
    if (schemeForm.ls_item_type === "ITEM") {
      return;
    }
    setPointRows((prev) => {
      let hasChanges = false;
      const nextRows = prev.map((row) => {
        if (schemeForm.ls_item_type === "ALL") {
          if (!row.lspt_item_id && !row.lspt_unit_id) {
            return row;
          }
          hasChanges = true;
          return {
            ...row,
            lspt_item_id: "",
            lspt_unit_id: "",
          };
        }
        if (!row.lspt_unit_id) {
          return row;
        }
        hasChanges = true;
        return {
          ...row,
          lspt_unit_id: "",
        };
      });
      return hasChanges ? nextRows : prev;
    });
  }, [schemeForm.ls_item_type]);
  useEffect(() => {
    if (!isEditorOpen) return;
    editorScrollAreaRef.current?.scrollTo({ top: 0 });
  }, [activeTab, isEditorOpen]);
  useEffect(() => {
    if (!isEditorOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setIsEditorOpen(false); setActiveTab("scheme"); }
    };
    const html = document.documentElement;
    const body = document.body;
    const appContent = document.querySelector<HTMLElement>(".erp-app-content");
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      appOverflow: appContent?.style.overflow ?? "",
      appOverscroll: appContent?.style.overscrollBehavior ?? "",
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    if (appContent) { appContent.style.overflow = "hidden"; appContent.style.overscrollBehavior = "none"; }
    window.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => editorDialogRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(frame);
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      if (appContent) { appContent.style.overflow = prev.appOverflow; appContent.style.overscrollBehavior = prev.appOverscroll; }
    };
  }, [isEditorOpen]);
  // ── Modal open/close ──────────────────────────────────────────────────────
  const openCreateModal = () => {
    resetSchemeEditor(pageCompanyId, pageDefaultBranchId);
    setActiveTab("scheme");
    setIsEditorOpen(true);
  };
  const openEditModal = async (schemeId: string, tab: EditorTab = "scheme") => {
    await loadSchemeDetail(schemeId); setActiveTab(tab); setIsEditorOpen(true);
  };
  const closeEditorModal = () => {
    setIsEditorOpen(false);
    setActiveTab("scheme");
    setShowSchemeValidation(false);
  };
  // ── Save / persist ────────────────────────────────────────────────────────
  const persistDraftRows = async (schemeId: string) => {
    for (const row of pointRows.filter(shouldPersistPointRow)) {
      updatePointRow(row._rowKey, { _saving: true });
      try { await savePointSilently({ body: buildPointRequest(schemeId, row) }); }
      finally { updatePointRow(row._rowKey, { _saving: false }); }
    }
    for (const row of giftRows.filter(shouldPersistGiftRow)) {
      updateGiftRow(row._rowKey, { _saving: true });
      try { await saveGiftSilently({ body: buildGiftRequest(schemeId, row) }); }
      finally { updateGiftRow(row._rowKey, { _saving: false }); }
    }
  };
  const persistDeletedRows = async () => {
    for (const lspt_id of deletedPointIds) await deletePointSilently({ query: { lspt_id } });
    for (const lsg_id of deletedGiftIds) await deleteGiftSilently({ query: { lsg_id } });
  };
  const handleSchemeSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setEditorSubmitError(null);
    setShowSchemeValidation(true);
    const nextActiveTab = activeTab;
    // Validate required fields
    if (!schemeForm.ls_name.trim()) {
      setEditorSubmitError("Scheme Name is required");
      setActiveTab("scheme");
      return;
    }
    if (!schemeForm.ls_start_date.trim()) {
      setEditorSubmitError("Start Date is required");
      setActiveTab("scheme");
      return;
    }
    if (!isValidDateValue(schemeForm.ls_start_date)) {
      setEditorSubmitError("Start Date must be in dd/mm/yyyy format");
      setActiveTab("scheme");
      return;
    }
    if (!schemeForm.ls_end_date.trim()) {
      setEditorSubmitError("End Date is required");
      setActiveTab("scheme");
      return;
    }
    if (!isValidDateValue(schemeForm.ls_end_date)) {
      setEditorSubmitError("End Date must be in dd/mm/yyyy format");
      setActiveTab("scheme");
      return;
    }
    const giftError = giftRows.reduce<string | null>(
      (err, row, i) => err ?? getGiftRowValidationMessage(row, i),
      null,
    );
    if (giftError) { setEditorSubmitError(giftError); setActiveTab("gifts"); return; }
    const partyError = partyRows.reduce<string | null>(
      (err, row, i) => err ?? getPartyRowValidationMessage(row, i),
      null,
    );
    if (partyError) { setEditorSubmitError(partyError); setActiveTab("party"); return; }
    const response = await saveScheme({ body: buildSchemeRequest(schemeForm, partyRows) });
    const savedScheme = response?.data;
    if (!savedScheme) return;
    try {
      await persistDraftRows(savedScheme.ls_id);
      await persistDeletedRows();
    } catch {
      await reloadSchemes();
      await loadSchemeDetail(savedScheme.ls_id);
      setIsEditorOpen(true);
      return;
    }
    await reloadSchemes();
    await loadSchemeDetail(savedScheme.ls_id);
    setEditorSubmitError(null);
    setIsEditorOpen(true);
    setActiveTab(nextActiveTab);
  };
  const confirmDelete = async () => {
    if (!deleteDialog) return;
    if (deleteDialog.kind === "scheme") {
      await deleteScheme({ query: { ls_id: deleteDialog.id } });
      setDeleteDialog(null);
      resetSchemeEditor(pageCompanyId, pageDefaultBranchId);
      closeEditorModal();
      await reloadSchemes();
      return;
    }
    if (deleteDialog.kind === "point") removePointRow(deleteDialog.rowKey, deleteDialog.id);
    else if (deleteDialog.kind === "gift") removeGiftRow(deleteDialog.rowKey, deleteDialog.id);
    else if (deleteDialog.kind === "party") removePartyRow(deleteDialog.rowKey);
    setDeleteDialog(null);
  };
  // ── Scheme list columns ───────────────────────────────────────────────────
  const metricCards = useMemo(
    () => {
      const totalSchemes = listMeta?.total ?? schemeRows.length;
      const activeSchemes = schemeRows.filter((row) => row.ls_is_active).length;
      const draftSchemes = schemeRows.filter((row) => row.ls_status === "DRAFT").length;
      const redeemSchemes = schemeRows.filter((row) => row.ls_type === "REDEEM").length;
      return [
        {
          label: "Total Schemes",
          value: totalSchemes,
          tone: "blue" as const,
          icon: <FiFileText />,
          sparkline: [3, 5, 4, 7, 11, 8, 8, 12],
        },
        {
          label: "Active Schemes",
          value: activeSchemes,
          tone: "green" as const,
          icon: <FiShield />,
          sparkline: [4, 7, 5, 6, 6, 12, 8, 14],
        },
        {
          label: "Draft Schemes",
          value: draftSchemes,
          tone: "orange" as const,
          icon: <FiClipboard />,
          sparkline: [2, 3, 3, 4, 7, 3, 8],
        },
        {
          label: "Redeem Schemes",
          value: redeemSchemes,
          tone: "purple" as const,
          icon: <FiGift />,
          sparkline: [2, 4, 3, 5, 7, 6, 10],
        },
      ];
    },
    [listMeta?.total, schemeRows],
  );
  const tableColumnClassNames = {
    headerClassName: styles.schemeTableHeaderCell,
    cellClassName: styles.schemeTableCell,
  };
  const schemeColumns: ReusableTableColumn<SchemeListRow>[] = [
    {
      key: "slno",
      header: "Sl No",
      render: (_, i) => i + 1,
      width: "68px",
      align: "center",
      sortable: false,
      ...tableColumnClassNames,
    },
    {
      key: "ls_name", header: "Scheme",
      render: (r) => (
        <div className={styles.schemeNameStack}>
          <strong>{r.ls_name}</strong>
          <span>
            {getSchemeBranchLabel(r, branchLabelMap)}
          </span>
        </div>
      ),
      width: "190px",
      sortAccessor: (r) => r.ls_name,
      searchAccessor: (r) => r.ls_name,
      headerClassName: styles.schemeTableHeaderCell,
      cellClassName: `${styles.schemeTableCell} ${styles.schemeNameCell}`,
    },
    {
      key: "ls_type", header: "Type",
      render: (r) => <Badge variant={getTypeVariant(r.ls_type)}>{r.ls_type}</Badge>,
      width: "96px",
      align: "center",
      sortAccessor: (r) => r.ls_type,
      ...tableColumnClassNames,
    },
    {
      key: "ls_status", header: "Status",
      render: (r) => <Badge variant={getStatusVariant(r.ls_status)}>{r.ls_status}</Badge>,
      width: "104px",
      align: "center",
      sortAccessor: (r) => r.ls_status,
      ...tableColumnClassNames,
    },
    {
      key: "period", header: "Period",
      render: (r) => {
        const fromDate = formatDateForDisplay(r.ls_start_date);
        const toDate = formatDateForDisplay(r.ls_end_date);
        return (
          <div className={styles.periodCell}>
            <FiCalendar aria-hidden="true" />
            <div>
              <span>{fromDate ? `From ${fromDate}` : "From -"}</span>
              <span>{toDate ? `To ${toDate}` : "To -"}</span>
            </div>
          </div>
        );
      },
      width: "170px",
      sortAccessor: (r) => r.ls_start_date,
      ...tableColumnClassNames,
    },
    {
      key: "rules", header: "Rules",
      render: (r) => `${r.points_count} points / ${r.gifts_count} gifts / ${r.parties_count} parties`,
      width: "178px",
      sortable: false,
      ...tableColumnClassNames,
    },
    {
      key: "active", header: "Active",
      render: (r) => <Badge variant={r.ls_is_active ? "success" : "neutral"}>{r.ls_is_active ? "Yes" : "No"}</Badge>,
      width: "82px",
      align: "center",
      sortAccessor: (r) => (r.ls_is_active ? 1 : 0),
      ...tableColumnClassNames,
    },
    {
      key: "actions",
      header: "Actions",
      width: "78px",
      align: "center",
      sortable: false,
      ...tableColumnClassNames,
    },
  ];
  const editorModalStyle = {
    "--erp-modal-overlay-z-index": "2000",
    "--erp-modal-accent": "#365b9d",
    "--erp-modal-surface": "#ffffff",
  } as CSSProperties;
  const editorPanelStyle = {
    width: "min(1280px, calc(100vw - 24px))",
    height: "min(860px, calc(100dvh - 24px))",
    maxHeight: "calc(100dvh - 24px)",
  } as CSSProperties;
  const editorFooterStyle = {
    alignItems: "center",
    flexShrink: 0,
    padding: "0.5rem",
  } as CSSProperties;
  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="loyalty-page-title">
        <header className={styles.pageHeader}>
          <div className={styles.titleBlock}>
            <div className={styles.titleIcon} aria-hidden="true">
              <FiGift />
            </div>
            <div>
              <h1 id="loyalty-page-title" className={styles.title}>Loyalty Schemes</h1>
              <p className={styles.description}>Manage promotion loyalty rules for the selected company context.</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Button
              variant="ghost"
              size="sm"
              className={styles.refreshButton}
              onClick={() => void reloadSchemes()}
              disabled={listLoading || !pageCompanyId.trim()}
            >
              <FiRefreshCw aria-hidden="true" /> Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              className={styles.newButton}
              onClick={openCreateModal}
              disabled={!pageCompanyId.trim()}
            >
              <FiPlus aria-hidden="true" /> New Scheme
            </Button>
          </div>
        </header>
        <div className={styles.metricGrid}>
          {metricCards.map((metric) => (
            <MetricCard
              key={metric.label}
              icon={metric.icon}
              label={metric.label}
              value={metric.value}
              tone={metric.tone}
              sparkline={metric.sparkline}
            />
          ))}
        </div>
        {!pageCompanyId.trim() ? (
          <Alert kind="warning" title="Select a company first" className={styles.alert}>
            Choose a company from the filter before opening loyalty schemes.
          </Alert>
        ) : null}
        <div className={styles.filterPanel}>
          <div className={styles.filterGrid}>
            <Field className={styles.filterField}>
              <Label htmlFor="loyalty-search" className={`${dynamicFormStyles.label} ${styles.filterLabel}`}>Search</Label>
              <div className={styles.searchControl}>
                <FiSearch className={styles.filterAdornment} aria-hidden="true" />
                <Input
                  id="loyalty-search"
                  className={`${dynamicFormStyles.control} ${styles.searchInput}`}
                  style={MODAL_FIELD_STYLE_VARS}
                  value={schemeSearch}
                  onChange={(e) => setSchemeSearch(e.target.value)}
                  placeholder="Search scheme"
                />
              </div>
            </Field>
            <Field className={styles.filterField}>
              <Label htmlFor="loyalty-filter-type" className={`${dynamicFormStyles.label} ${styles.filterLabel}`}>Type</Label>
              <SearchableSelect
                id="loyalty-filter-type"
                value={typeFilter}
                options={typeFilterOptions}
                onChange={setTypeFilter}
                searchPlaceholder="Search type"
                className={styles.filterSelect}
              />
            </Field>
            <Field className={styles.filterField}>
              <Label htmlFor="loyalty-filter-status" className={`${dynamicFormStyles.label} ${styles.filterLabel}`}>Status</Label>
              <SearchableSelect
                id="loyalty-filter-status"
                value={statusFilter}
                options={statusFilterOptions}
                onChange={setStatusFilter}
                searchPlaceholder="Search status"
                className={styles.filterSelect}
              />
            </Field>
            <Field className={styles.filterField}>
              <Label htmlFor="loyalty-filter-company" className={`${dynamicFormStyles.label} ${styles.filterLabel}`}>Company</Label>
              <div className={styles.filterControlWithIcon}>
                <FiBriefcase className={styles.filterAdornment} aria-hidden="true" />
                <SearchableSelect
                  id="loyalty-filter-company"
                  value={pageCompanyId}
                  options={companyOptions}
                  onChange={handlePageCompanyChange}
                  searchPlaceholder="Search company"
                  className={`${styles.filterSelect} ${styles.filterSelectWithIcon}`}
                />
              </div>
            </Field>
            <Field className={styles.filterField}>
              <Label htmlFor="loyalty-filter-branch" className={`${dynamicFormStyles.label} ${styles.filterLabel}`}>Branch</Label>
              <div className={styles.filterControlWithIcon}>
                <FiGitBranch className={styles.filterAdornment} aria-hidden="true" />
                <SearchableSelect
                  id="loyalty-filter-branch"
                  value={branchFilter}
                  options={pageBranchOptions}
                  onChange={setBranchFilter}
                  searchPlaceholder="Search branch"
                  className={`${styles.filterSelect} ${styles.filterSelectWithIcon}`}
                />
              </div>
            </Field>
          </div>
        </div>
        {listError ? <Alert kind="danger" title="Unable to load loyalty schemes" className={styles.alert}>{listError}</Alert> : null}
        <div className={styles.tablePanel}>
          <ReusableTable<SchemeListRow>
            columns={schemeColumns}
            rows={schemeRows}
            rowKey="ls_id"
            activeRowKey={selectedScheme?.ls_id ?? null}
            onRowClick={(r) => void openEditModal(r.ls_id, "scheme")}
            onEdit={(r) => void openEditModal(r.ls_id, "scheme")}
            onDelete={(r) => setDeleteDialog({ kind: "scheme", id: r.ls_id, label: r.ls_name })}
            editLabel="Edit Scheme"
            emptyText={pageCompanyId.trim() ? "No loyalty schemes found for this filter." : "Choose a company to load schemes."}
            fullViewHeight={false}
            minWidth="900px"
            wrapperClassName={styles.schemeTable}
            stickyHeader
            tableMaxHeight="100%"
            paginated
            sortable
            pageSize={10}
            defaultPageSize={10}
            pageSizeOptions={[5, 10, 15, 25, 50]}
            totalEntries={listMeta?.total ?? 0}
            showPageSizeSelector
          />
        </div>
      </section>
      {/* ── Editor modal ───────────────────────────────────────────────────── */}
      {isEditorOpen && typeof document !== "undefined"
        ? createPortal(
          <div className={dynamicFormStyles.overlay} style={editorModalStyle}>
            <div className={dynamicFormStyles.backdrop} onClick={closeEditorModal} aria-hidden />
            <div
              ref={editorDialogRef}
              className={`${dynamicFormStyles.panel} ${styles.editorPanel}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="loyalty-editor-title"
              aria-describedby="loyalty-editor-description"
              tabIndex={-1}
              style={editorPanelStyle}
            >
              <header className={`${dynamicFormStyles.header} ${styles.editorHeader}`}>
                <div className={`${dynamicFormStyles.headerRow} ${styles.editorHeaderRow}`}>
                  <div className={styles.editorHeaderIntro}>
                    <span className={styles.editorHeaderIcon} aria-hidden="true">
                      <MasterIcon name="loyalty_scheme_master" />
                    </span>
                    <div>
                    <h2 id="loyalty-editor-title" className={dynamicFormStyles.headerTitle}>
                      {selectedScheme ? `Edit Loyalty Scheme` : "Create Loyalty Scheme"}
                    </h2>
                    <p id="loyalty-editor-description" className={dynamicFormStyles.headerDescription}>
                      Maintain scheme header, point rules, gift rules, and party scope in one place.
                    </p>
                    </div>
                  </div>
                  <button type="button" className={`${dynamicFormStyles.closeButton} ${styles.editorCloseButton}`} onClick={closeEditorModal} aria-label="Close loyalty scheme editor">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                      <path d="M6 18 18 6M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </header>
              <div
                className={`${dynamicFormStyles.scrollArea} ${dynamicFormStyles.scrollAreaHiddenScrollbar} ${styles.editorScrollArea}`}
                ref={editorScrollAreaRef}
              >
                <div
                  className={`${dynamicFormStyles.sectionTabs} ${styles.editorTabs} sticky top-0 z-modal shadow-erp-tab-underline`}
                  role="tablist"
                  aria-label="Loyalty scheme sections"
                >
                  {EDITOR_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.key}
                      aria-controls={`loyalty-editor-panel-${tab.key}`}
                      id={`loyalty-editor-tab-${tab.key}`}
                      tabIndex={activeTab === tab.key ? 0 : -1}
                      className={`${dynamicFormStyles.sectionTab} ${styles.editorTab} ${activeTab === tab.key ? `${dynamicFormStyles.sectionTabActive} ${styles.editorTabActive}` : ""}`}
                      onClick={() => setActiveTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className={styles.editorContent}>
                  {activeTab === "scheme" && (
                    <SchemeTab
                      schemeForm={schemeForm}
                      setSchemeForm={setSchemeForm}
                      onItemTypeChange={handleSchemeItemTypeChange}
                      companyOptions={companyOptions}
                      onCompanyChange={handleSchemeCompanyChange}
                      branchOptions={schemeBranchOptions}
                      detailError={detailError}
                      showValidationErrors={showSchemeValidation}
                    />
                  )}
                  {activeTab === "points" && (
                    <PointsTab
                      pointRows={pointRows}
                      updatePointRow={updatePointRow}
                      onPointScopeChange={handlePointScopeChange}
                      addPointRow={addPointRow}
                      removePointRow={removePointRow}
                      setDeleteDialog={setDeleteDialog}
                      pointScopeDescriptor={pointScopeDescriptor}
                      pointScopeOptionsForPoint={pointScopeOptionsForPoint}
                      pointScopeLabelMap={pointScopeLabelMap}
                      getUnitOptionsForPointRow={getUnitOptionsForPointRow}
                      pointExceedsHeader={pointExceedsHeader}
                      hideScopeColumn={shouldHidePointScopeColumn}
                      showUnitColumn={shouldShowPointUnitColumn}
                    />
                  )}
                  {activeTab === "gifts" && (
                    <GiftsTab
                      giftRows={giftRows}
                      updateGiftRow={updateGiftRow}
                      onItemChange={handleGiftItemChange}
                      addGiftRow={addGiftRow}
                      removeGiftRow={removeGiftRow}
                      setDeleteDialog={setDeleteDialog}
                      itemOptionsForGift={itemOptionsForGift}
                      getUnitOptionsForGiftRow={getUnitOptionsForGiftRow}
                    />
                  )}
                  {activeTab === "party" && (
                    <PartyTab
                      partyRows={partyRows}
                      updatePartyRow={updatePartyRow}
                      addPartyRow={addPartyRow}
                      removePartyRow={removePartyRow}
                      setDeleteDialog={setDeleteDialog}
                      partyScopeColumnHeader={partyScopeColumnHeader}
                      schemePartyScopeType={schemePartyScopeType}
                      customerOptionsForParty={customerOptionsForParty}
                      customerGroupOptionsForParty={customerGroupOptionsForParty}
                      customerLabelMap={customerLabelMap}
                      customerGroupLabelMap={customerGroupLabelMap}
                    />
                  )}
                </div>
              </div>
              <footer className={`${dynamicFormStyles.footer} ${styles.editorFooter}`} style={editorFooterStyle}>
                {editorSubmitError ? (
                  <p className={dynamicFormStyles.submitError} role="alert">
                    {editorSubmitError}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={`${dynamicFormStyles.cancelButton} ${styles.editorCancelButton}`}
                  onClick={closeEditorModal}
                  disabled={schemeSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${dynamicFormStyles.submitButton} ${styles.editorSubmitButton} ${schemeForm.ls_id
                      ? dynamicFormStyles.submitButtonUpdate
                      : dynamicFormStyles.submitButtonSave
                    }`}
                  onClick={() => void handleSchemeSubmit()}
                  disabled={schemeSaving || !pageCompanyId.trim()}
                >
                  <FiSave aria-hidden="true" />
                  {schemeSaving ? "Saving..." : schemeForm.ls_id ? "Update" : "Save"}
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )
        : null}
      <DeleteConfirmModal
        isOpen={Boolean(deleteDialog)}
        itemName={deleteDialog?.label}
        loading={deleteDialog?.kind === "scheme" ? schemeDeleting : false}
        onCancel={() => setDeleteDialog(null)}
        onConfirm={() => void confirmDelete()}
      />
      {(detailLoading || schemeSaving) && selectedScheme ? (
        <div className="fixed bottom-6 right-6 px-4 py-3 rounded-pill bg-[rgba(15,23,42,0.92)] text-white text-sm-compact shadow-lg shadow-[rgba(15,23,42,0.24)] z-status">
          <span>{detailLoading ? "Loading scheme details..." : "Saving scheme..."}</span>
        </div>
      ) : null}
    </main>
  );
}
