"use client";
import {
  type CSSProperties,
  type FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { FiGift, FiPlus, FiRefreshCw, FiSave } from "react-icons/fi";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHead,
  CardTitle,
  Field,
  Input,
  Label,
  Select,
} from "@/components/library/ui";
import { useBusinessContext } from "@/components/layout/business-context";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";
import { useApi } from "@/hooks/useApi";
import type { ApiSuccessResponse } from "@/utils/types";
import dynamicFormStyles from "@/components/library/ui/dynamic-modal-form.module.scss";
import type {
  LoyaltySchemePayload,
  PromotionLoyaltyPointsListMeta,
  SaveLoyaltyGiftRequest,
  SaveLoyaltyPartyRequest,
  SaveLoyaltyPointRequest,
  SaveLoyaltySchemeRequest,
  LoyaltyPointPayload,
  LoyaltyGiftPayload,
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
  formatDateRange,
  getStatusVariant,
  getTypeVariant,
  isPartyScopeType,
  resolveLabel,
  withDefaultOption,
} from "./promotion-loyalty-points.utils";
import { SchemeTab } from "./tabs/scheme-tab";
import { PointsTab } from "./tabs/points-tab";
import { GiftsTab } from "./tabs/gifts-tab";
import { PartyTab } from "./tabs/party-tab";
import type { ERPDynamicSelectOption } from "@/components/library/ui";

const DEFAULT_PARTY_SCOPE_TYPE: PartyScopeType = "CUSTOMER_GROUP";

export default function PromotionLoyaltyPointsPage() {
  const {
    activeCompany,
    branchOptions: businessBranchOptions,
    selectedBranchId,
    selectedCompanyId,
  } = useBusinessContext();

  // ── List state ────────────────────────────────────────────────────────────
  const [schemeRows, setSchemeRows] = useState<LoyaltySchemePayload[]>([]);
  const [selectedScheme, setSelectedScheme] = useState<LoyaltySchemePayload | null>(null);
  const [listMeta, setListMeta] = useState<PromotionLoyaltyPointsListMeta | null>(null);
  const [schemeSearch, setSchemeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");

  // ── Editor state ──────────────────────────────────────────────────────────
  const [schemeForm, setSchemeForm] = useState<SchemeFormState>(
    buildEmptySchemeForm(selectedCompanyId, selectedBranchId),
  );
  const [pointRows, setPointRows] = useState<EditablePointRow[]>([]);
  const [giftRows, setGiftRows] = useState<EditableGiftRow[]>([]);
  const [partyRows, setPartyRows] = useState<EditablePartyRow[]>([]);
  const [deletedPointIds, setDeletedPointIds] = useState<string[]>([]);
  const [deletedGiftIds, setDeletedGiftIds] = useState<string[]>([]);
  const [editorSubmitError, setEditorSubmitError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("scheme");
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
  const editorDialogRef = useRef<HTMLDivElement | null>(null);

  // ── Lookup choices ────────────────────────────────────────────────────────
  const [itemChoices, setItemChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [itemGroupChoices, setItemGroupChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [itemCategoryChoices, setItemCategoryChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [itemBrandChoices, setItemBrandChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [itemSectionChoices, setItemSectionChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [unitChoices, setUnitChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [customerChoices, setCustomerChoices] = useState<ERPDynamicSelectOption[]>([]);
  const [customerGroupChoices, setCustomerGroupChoices] = useState<ERPDynamicSelectOption[]>([]);

  const deferredSchemeSearch = useDeferredValue(schemeSearch.trim());

  // ── API hooks ─────────────────────────────────────────────────────────────
  const { getAll: listSchemes, loading: listLoading, error: listError } = useApi<
    ApiSuccessResponse<LoyaltySchemePayload[], PromotionLoyaltyPointsListMeta>
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

  const { getAll: getItemLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getItemGroupLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getItemCategoryLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getItemBrandLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getItemSectionLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getUnitLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getCustomerLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });
  const { getAll: getCustomerGroupLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, { toast: { success: false, error: false } });

  // ── Derived options ───────────────────────────────────────────────────────
  const branchOptions = useMemo(
    () => withDefaultOption(businessBranchOptions.filter((o) => o.value.trim().length > 0), DEFAULT_BRANCH_OPTION),
    [businessBranchOptions],
  );

  const schemePartyScopeType = useMemo<PartyScopeType | null>(
    () => (isPartyScopeType(schemeForm.ls_cust_type) ? schemeForm.ls_cust_type : null),
    [schemeForm.ls_cust_type],
  );

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
  const unitOptionsForGift = useMemo(() => withDefaultOption(unitChoices, DEFAULT_REQUIRED_UNIT_OPTION), [unitChoices]);
  const customerOptionsForParty = useMemo(() => withDefaultOption(customerChoices, DEFAULT_PARTY_CUSTOMER_OPTION), [customerChoices]);
  const customerGroupOptionsForParty = useMemo(() => withDefaultOption(customerGroupChoices, DEFAULT_PARTY_CUSTOMER_GROUP_OPTION), [customerGroupChoices]);
  const customerLabelMap = useMemo(() => buildOptionLabelMap(customerChoices), [customerChoices]);
  const customerGroupLabelMap = useMemo(() => buildOptionLabelMap(customerGroupChoices), [customerGroupChoices]);
  const branchLabelMap = useMemo(() => buildOptionLabelMap(branchOptions), [branchOptions]);

  const pointScopeLabelMap = useMemo(
    () => buildOptionLabelMap([...itemChoices, ...itemGroupChoices, ...itemCategoryChoices, ...itemBrandChoices, ...itemSectionChoices]),
    [itemBrandChoices, itemCategoryChoices, itemChoices, itemGroupChoices, itemSectionChoices],
  );

  // ── Row mutators ──────────────────────────────────────────────────────────
  const updatePointRow = (rowKey: string, patch: Partial<EditablePointRow>) =>
    setPointRows((prev) => prev.map((r) => r._rowKey === rowKey ? { ...r, ...patch } : r));

  const updateGiftRow = (rowKey: string, patch: Partial<EditableGiftRow>) =>
    setGiftRows((prev) => prev.map((r) => r._rowKey === rowKey ? { ...r, ...patch } : r));

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
  const resetSchemeEditor = (nextBranchId = selectedBranchId) => {
    setEditorSubmitError(null);
    setSelectedScheme(null);
    setSchemeForm(buildEmptySchemeForm(selectedCompanyId, nextBranchId));
    setPointRows([]);
    setGiftRows([]);
    setPartyRows([]);
    setDeletedPointIds([]);
    setDeletedGiftIds([]);
  };

  const loadSchemeDetail = async (schemeId: string) => {
    const response = await getSchemeById({ query: { ls_id: schemeId } });
    if (!response?.data) return;
    setEditorSubmitError(null);
    setSelectedScheme(response.data);
    setSchemeForm(mapSchemeToForm(response.data));
    setPointRows((response.data.points ?? []).map((r) => createPointRow(r)));
    setGiftRows((response.data.gifts ?? []).map((r) => createGiftRow(r)));
    setPartyRows((response.data.parties ?? []).map((r) => createPartyRow(r)));
    setDeletedPointIds([]);
    setDeletedGiftIds([]);
  };

  const reloadSchemes = async () => {
    if (!selectedCompanyId.trim()) {
      setSchemeRows([]);
      setListMeta(null);
      resetSchemeEditor("");
      return;
    }
    const query: Record<string, string> = {
      ls_comp_id: selectedCompanyId.trim(),
      page: "1",
      limit: "100",
    };
    if (branchFilter.trim()) query.ls_branch_id = branchFilter.trim();
    if (deferredSchemeSearch) query.search = deferredSchemeSearch;
    if (statusFilter.trim()) query.ls_status = statusFilter;
    if (typeFilter.trim()) query.ls_type = typeFilter;
    const response = await listSchemes(query);
    const nextRows = response?.data ?? [];
    setSchemeRows(nextRows);
    setListMeta(response?.meta ?? null);
    if (selectedScheme && !nextRows.some((r) => r.ls_id === selectedScheme.ls_id)) {
      resetSchemeEditor(selectedBranchId);
    }
  };

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedCompanyId.trim()) {
      setSchemeRows([]);
      setListMeta(null);
      resetSchemeEditor("");
      return;
    }
    setSchemeForm((prev) => ({
      ...prev,
      ls_comp_id: selectedCompanyId,
      ...(!selectedScheme ? { ls_branch_id: prev.ls_branch_id || selectedBranchId } : {}),
    }));
  }, [selectedCompanyId, selectedBranchId, selectedScheme]);

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [items, groups, categories, brands, sections, units, customers, customerGroups] =
          await Promise.all([
            getItemLookup({ module: "items", limit: "100" }),
            getItemGroupLookup({ module: "itemGroups", limit: "100" }),
            getItemCategoryLookup({ module: "itemCategories", limit: "100" }),
            getItemBrandLookup({ module: "itemBrands", limit: "100" }),
            getItemSectionLookup({ module: "itemSections", limit: "100" }),
            getUnitLookup({ module: "units", limit: "100" }),
            getCustomerLookup({ module: "customers", limit: "100" }),
            getCustomerGroupLookup({ module: "customerGroups", limit: "100" }),
          ]);
        setItemChoices(buildLookupChoices(items, ITEM_LOOKUP_KEYS));
        setItemGroupChoices(buildLookupChoices(groups, ITEM_GROUP_LOOKUP_KEYS));
        setItemCategoryChoices(buildLookupChoices(categories, ITEM_CATEGORY_LOOKUP_KEYS));
        setItemBrandChoices(buildLookupChoices(brands, ITEM_BRAND_LOOKUP_KEYS));
        setItemSectionChoices(buildLookupChoices(sections, ITEM_SECTION_LOOKUP_KEYS));
        setUnitChoices(buildLookupChoices(units, UNIT_LOOKUP_KEYS));
        setCustomerChoices(buildLookupChoices(customers, CUSTOMER_LOOKUP_KEYS));
        setCustomerGroupChoices(buildLookupChoices(customerGroups, CUSTOMER_GROUP_LOOKUP_KEYS));
      } catch { /* handled by hook */ }
    };
    void loadLookups();
  }, [
    getCustomerGroupLookup, getCustomerLookup, getItemBrandLookup, getItemCategoryLookup,
    getItemGroupLookup, getItemLookup, getItemSectionLookup, getUnitLookup,
  ]);

  useEffect(() => {
    void reloadSchemes();
  }, [selectedCompanyId, branchFilter, deferredSchemeSearch, statusFilter, typeFilter]);

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
  const openCreateModal = () => { resetSchemeEditor(selectedBranchId); setActiveTab("scheme"); setIsEditorOpen(true); };
  const openEditModal = async (schemeId: string, tab: EditorTab = "scheme") => {
    await loadSchemeDetail(schemeId); setActiveTab(tab); setIsEditorOpen(true);
  };
  const closeEditorModal = () => { setIsEditorOpen(false); setActiveTab("scheme"); };

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
    const nextActiveTab = activeTab;

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
      resetSchemeEditor(selectedBranchId);
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
  const schemeColumns: ReusableTableColumn<LoyaltySchemePayload>[] = [
    { key: "slno", header: "Sl No", render: (_, i) => i + 1, width: "70px", align: "center" },
    { key: "ls_code", header: "Code", render: (r) => r.ls_code || "Auto", width: "100px" },
    {
      key: "ls_name", header: "Scheme",
      render: (r) => (
        <div className="grid gap-1">
          <strong>{r.ls_name}</strong>
          <span className="text-erp-text-subtle text-xs-compact">
            {resolveLabel(r.ls_branch_id, branchLabelMap, "All Branches")}
          </span>
        </div>
      ),
      width: "240px",
    },
    {
      key: "ls_type", header: "Type",
      render: (r) => <Badge variant={getTypeVariant(r.ls_type)}>{r.ls_type}</Badge>,
      width: "110px", align: "center",
    },
    {
      key: "ls_status", header: "Status",
      render: (r) => <Badge variant={getStatusVariant(r.ls_status)}>{r.ls_status}</Badge>,
      width: "120px", align: "center",
    },
    {
      key: "period", header: "Period",
      render: (r) => formatDateRange(r.ls_start_date, r.ls_end_date),
      width: "180px",
    },
    {
      key: "rules", header: "Rules",
      render: (r) => `${r.points.length} points / ${r.gifts.length} gifts / ${r.parties.length} parties`,
      width: "220px",
    },
    {
      key: "active", header: "Active",
      render: (r) => <Badge variant={r.ls_is_active ? "success" : "neutral"}>{r.ls_is_active ? "Yes" : "No"}</Badge>,
      width: "90px", align: "center",
    },
  ];

  const editorModalStyle = {
    "--erp-modal-overlay-z-index": "2000",
    "--erp-modal-accent": "#0f766e",
    "--erp-modal-surface": "#ffffff",
  } as CSSProperties;

  const editorPanelStyle = {
    width: "min(1280px, calc(100vw - 24px))",
    height: "min(860px, calc(100dvh - 24px))",
    maxHeight: "calc(100dvh - 24px)",
  } as CSSProperties;

  return (
    <main className="h-shell-offset min-h-shell-offset px-6 py-4 pb-6 box-border overflow-auto overscroll-contain bg-gradient-to-b from-erp-slate-light to-[#eef4f4] bg-erp-gradient-teal">
      <div className="h-full min-h-0 grid">
        <Card as="section" className="h-full min-h-0 grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg shadow-erp-panel">
          <CardHead className="flex items-start justify-between gap-4 pb-4 border-b border-erp-border">
            <div>
              <div className="flex items-start gap-3">
                <FiGift aria-hidden="true" className="flex-shrink-0 w-[18px] h-[18px] text-erp-teal mt-[3px]" />
              </div>
              <CardTitle>Loyalty Schemes</CardTitle>
              <CardDescription>Manage promotion loyalty rules for the active company context.</CardDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => void reloadSchemes()} disabled={listLoading || !selectedCompanyId.trim()}>
                <FiRefreshCw aria-hidden="true" /> Refresh
              </Button>
              <Button variant="primary" size="sm" onClick={openCreateModal}>
                <FiPlus aria-hidden="true" /> New
              </Button>
            </div>
          </CardHead>
          <CardBody className="min-h-0 flex flex-col gap-[18px]">
            {!selectedCompanyId.trim() ? (
              <Alert kind="warning" title="Select a company first">
                Choose the active company from the header before opening loyalty schemes.
              </Alert>
            ) : null}
            <div className="grid grid-cols-4 gap-3">
              <Field>
                <Label htmlFor="loyalty-search">Search</Label>
                <Input id="loyalty-search" value={schemeSearch} onChange={(e) => setSchemeSearch(e.target.value)} placeholder="Search code or scheme name" />
              </Field>
              <Field>
                <Label htmlFor="loyalty-filter-type">Type</Label>
                <Select id="loyalty-filter-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="">All</option>
                  {SCHEME_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field>
                <Label htmlFor="loyalty-filter-status">Status</Label>
                <Select id="loyalty-filter-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All</option>
                  {SCHEME_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field>
                <Label htmlFor="loyalty-filter-branch">Branch Filter</Label>
                <Select id="loyalty-filter-branch" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                  {branchOptions.map((o) => <option key={o.value || "__all"} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            </div>
            {listError ? <Alert kind="danger" title="Unable to load loyalty schemes">{listError}</Alert> : null}
            <div className="w-full flex-1 min-h-0 overflow-auto">
              <ReusableTable<LoyaltySchemePayload>
                columns={schemeColumns}
                rows={schemeRows}
                rowKey="ls_id"
                activeRowKey={selectedScheme?.ls_id ?? null}
                onRowClick={(r) => void openEditModal(r.ls_id, "scheme")}
                onEdit={(r) => void openEditModal(r.ls_id, "scheme")}
                onDelete={(r) => setDeleteDialog({ kind: "scheme", id: r.ls_id, label: r.ls_name })}
                emptyText={selectedCompanyId.trim() ? "No loyalty schemes found for this filter." : "Choose a company to load schemes."}
                stickyHeader
                tableMaxHeight="calc(100dvh - 320px)"
                paginated
                pageSize={10}
                defaultPageSize={10}
                pageSizeOptions={[5, 10, 15, 25, 50]}
                totalEntries={listMeta?.total ?? 0}
                showPageSizeSelector
              />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ── Editor modal ───────────────────────────────────────────────────── */}
      {isEditorOpen && typeof document !== "undefined"
        ? createPortal(
          <div className={dynamicFormStyles.overlay} style={editorModalStyle}>
            <div className={dynamicFormStyles.backdrop} onClick={closeEditorModal} aria-hidden />
            <div
              ref={editorDialogRef}
              className={dynamicFormStyles.panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="loyalty-editor-title"
              aria-describedby="loyalty-editor-description"
              tabIndex={-1}
              style={editorPanelStyle}
            >
              <header className={dynamicFormStyles.header}>
                <div className={dynamicFormStyles.headerRow}>
                  <div>
                    <h2 id="loyalty-editor-title" className={dynamicFormStyles.headerTitle}>
                      {selectedScheme ? `Edit Scheme: ${selectedScheme.ls_name}` : "Create Loyalty Scheme"}
                    </h2>
                    <p id="loyalty-editor-description" className={dynamicFormStyles.headerDescription}>
                      Maintain scheme header, point rules, gift rules, and party scope in one place.
                    </p>
                  </div>
                  <button type="button" className={dynamicFormStyles.closeButton} onClick={closeEditorModal} aria-label="Close loyalty scheme editor">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                      <path d="M6 18 18 6M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </header>

              <div className={dynamicFormStyles.scrollArea}>
                <div
                  className={`${dynamicFormStyles.sectionTabs} sticky top-0 z-modal shadow-erp-tab-underline`}
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
                      className={`${dynamicFormStyles.sectionTab} ${activeTab === tab.key ? dynamicFormStyles.sectionTabActive : ""}`}
                      onClick={() => setActiveTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="min-h-full grid content-start gap-[18px] px-6 py-[22px] pb-6 bg-gradient-to-b from-white to-[#f8fbfb] bg-erp-gradient-modal">
                  {activeTab === "scheme" && (
                    <SchemeTab
                      schemeForm={schemeForm}
                      setSchemeForm={setSchemeForm}
                      activeCompanyName={activeCompany?.compName}
                      branchOptions={branchOptions}
                      detailError={detailError}
                      onSubmit={(e) => void handleSchemeSubmit(e)}
                    />
                  )}
                  {activeTab === "points" && (
                    <PointsTab
                      pointRows={pointRows}
                      updatePointRow={updatePointRow}
                      addPointRow={addPointRow}
                      removePointRow={removePointRow}
                      setDeleteDialog={setDeleteDialog}
                      pointScopeDescriptor={pointScopeDescriptor}
                      pointScopeOptionsForPoint={pointScopeOptionsForPoint}
                      pointScopeLabelMap={pointScopeLabelMap}
                      unitOptionsForPoint={unitOptionsForPoint}
                      pointExceedsHeader={pointExceedsHeader}
                    />
                  )}
                  {activeTab === "gifts" && (
                    <GiftsTab
                      giftRows={giftRows}
                      updateGiftRow={updateGiftRow}
                      addGiftRow={addGiftRow}
                      removeGiftRow={removeGiftRow}
                      setDeleteDialog={setDeleteDialog}
                      itemOptionsForGift={itemOptionsForGift}
                      unitOptionsForGift={unitOptionsForGift}
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

              <div className={`${dynamicFormStyles.footer} flex justify-between pt-3 bg-transparent`}>
                {editorSubmitError ? <p className={dynamicFormStyles.submitError}>{editorSubmitError}</p> : null}
                <Button variant="ghost" type="button" onClick={() => resetSchemeEditor(selectedBranchId)}>
                  Reset
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => void handleSchemeSubmit()}
                  disabled={schemeSaving || !selectedCompanyId.trim()}
                >
                  <FiSave aria-hidden="true" />
                  {schemeSaving ? "Saving..." : schemeForm.ls_id ? "Update Scheme" : "Save Scheme"}
                </Button>
              </div>
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