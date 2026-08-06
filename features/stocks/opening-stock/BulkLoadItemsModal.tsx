"use client";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { FiX } from "react-icons/fi";
import { useBusinessContext } from "@/components/layout/business-context";
import { useApi } from "@/hooks/useApi";
import { SearchableSelect, type ERPDynamicSelectOption } from "@/components/design-system/ui";
import ModalPortal from "@/components/ui/modal-portal";
import dynamicModalStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
const MASTER_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const NONE_OPTION: ERPDynamicSelectOption = { value: "", label: "--None--" };
const LOOKUP_TOAST = { toast: { success: false, error: false } } as const;
type RawRecord = Record<string, unknown>;
function extractRows(payload: unknown, arrayKeys: readonly string[]): RawRecord[] {
  if (Array.isArray(payload)) return payload as RawRecord[];
  if (payload && typeof payload === "object") {
    for (const key of arrayKeys) {
      const candidate = (payload as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) return candidate as RawRecord[];
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        for (const innerKey of arrayKeys) {
          const inner = (candidate as Record<string, unknown>)[innerKey];
          if (Array.isArray(inner)) return inner as RawRecord[];
        }
      }
    }
  }
  return [];
}
function pickString(record: RawRecord, keys: readonly string[]): string {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}
const DEFAULT_ARRAY_KEYS = ["data", "rows", "items", "results", "list"] as const;
function buildOptions(
  payload: unknown,
  arrayKeys: readonly string[],
  idKeys: readonly string[],
  labelKeys: readonly string[],
): ERPDynamicSelectOption[] {
  const rows = extractRows(payload, arrayKeys);
  const seen = new Set<string>();
  const options: ERPDynamicSelectOption[] = [];
  for (const row of rows) {
    const id = pickString(row, idKeys);
    const label = pickString(row, labelKeys);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    options.push({ value: id, label: label || id });
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  return [NONE_OPTION, ...options];
}
const BRANCH_ARRAY_KEYS = [...DEFAULT_ARRAY_KEYS, "branches", "branch_masters"] as const;
const BRANCH_ID_KEYS = ["brId", "br_id", "branch_id", "branchId", "id", "_id", "value"] as const;
const BRANCH_LABEL_KEYS = ["brName", "br_name", "branch_name", "branchName", "name", "label"] as const;
const GROUP_ARRAY_KEYS = [...DEFAULT_ARRAY_KEYS, "groups", "itemGroups"] as const;
const GROUP_ID_KEYS = ["itg_id", "itgId", "group_id", "groupId", "itemGroupId", "id", "_id", "value"] as const;
const GROUP_LABEL_KEYS = ["itg_name", "itgName", "group_name", "groupName", "itemGroupName", "name", "label"] as const;
const BRAND_ARRAY_KEYS = [...DEFAULT_ARRAY_KEYS, "brands", "itemBrands"] as const;
const BRAND_ID_KEYS = ["ibm_id", "ibmId", "brand_id", "brandId", "itemBrandId", "id", "_id", "value"] as const;
const BRAND_LABEL_KEYS = ["ibm_name", "ibmName", "brand_name", "brandName", "itemBrandName", "name", "label"] as const;
const SECTION_ARRAY_KEYS = [...DEFAULT_ARRAY_KEYS, "sections", "itemSections"] as const;
const SECTION_ID_KEYS = ["sec_id", "secId", "section_id", "sectionId", "itemSectionId", "id", "_id", "value"] as const;
const SECTION_LABEL_KEYS = ["sec_name", "secName", "section_name", "sectionName", "itemSectionName", "name", "label"] as const;
const CATEGORY_ARRAY_KEYS = [...DEFAULT_ARRAY_KEYS, "categories", "itemCategories"] as const;
const CATEGORY_ID_KEYS = ["category_id", "categoryId", "itemCategoryId", "id", "_id", "value"] as const;
const CATEGORY_LABEL_KEYS = ["category_name", "categoryName", "itemCategoryName", "name", "label"] as const;
const GODOWN_ARRAY_KEYS = [...DEFAULT_ARRAY_KEYS, "godowns", "godown_locations", "godownLocations"] as const;
const GODOWN_ID_KEYS = ["gdl_id", "gdlId", "godown_id", "godownId", "id", "_id", "value"] as const;
const GODOWN_LABEL_KEYS = ["gdl_name", "gdlName", "godown_name", "godownName", "name", "label"] as const;
const GODOWN_BRANCH_KEYS = ["gdl_branch_id", "gdlBranchId", "branch_id", "branchId"] as const;
type GodownRaw = { id: string; label: string; branchId: string };
function extractGodownRaw(payload: unknown): GodownRaw[] {
  const rows = extractRows(payload, GODOWN_ARRAY_KEYS);
  const seen = new Set<string>();
  const result: GodownRaw[] = [];
  for (const row of rows) {
    const id = pickString(row, GODOWN_ID_KEYS);
    const label = pickString(row, GODOWN_LABEL_KEYS);
    const branchId = pickString(row, GODOWN_BRANCH_KEYS);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, label: label || id, branchId });
  }
  return result;
}
export type BulkLoadParams = {
  companyId: string;
  branchId: string;
  godownId: string;
  itemGroupId: string;
  itemBrandId: string;
  itemSectionId: string;
  itemCategoryId: string;
};
type BulkLoadItemsModalProps = {
  isOpen: boolean;
  defaultCompanyId: string;
  defaultBranchId: string;
  loading: boolean;
  onClose: () => void;
  onLoadItems: (params: BulkLoadParams) => void;
};
export function BulkLoadItemsModal({
  isOpen,
  defaultCompanyId,
  defaultBranchId,
  loading,
  onClose,
  onLoadItems,
}: BulkLoadItemsModalProps): ReactNode {
  const { companyOptions } = useBusinessContext();
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [godownId, setGodownId] = useState("");
  const [itemGroupId, setItemGroupId] = useState("");
  const [itemBrandId, setItemBrandId] = useState("");
  const [itemSectionId, setItemSectionId] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [branchOptions, setBranchOptions] = useState<ERPDynamicSelectOption[]>([NONE_OPTION]);
  const [itemGroupOptions, setItemGroupOptions] = useState<ERPDynamicSelectOption[]>([NONE_OPTION]);
  const [itemBrandOptions, setItemBrandOptions] = useState<ERPDynamicSelectOption[]>([NONE_OPTION]);
  const [itemSectionOptions, setItemSectionOptions] = useState<ERPDynamicSelectOption[]>([NONE_OPTION]);
  const [itemCategoryOptions, setItemCategoryOptions] = useState<ERPDynamicSelectOption[]>([NONE_OPTION]);
  const [godownRaw, setGodownRaw] = useState<GodownRaw[]>([]);
  const [isMasterLoading, setIsMasterLoading] = useState(false);
  const { getAll: getBranchLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, LOOKUP_TOAST);
  const { getAll: getGroupLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, LOOKUP_TOAST);
  const { getAll: getBrandLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, LOOKUP_TOAST);
  const { getAll: getSectionLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, LOOKUP_TOAST);
  const { getAll: getCategoryLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, LOOKUP_TOAST);
  const { getAll: getGodownLookup } = useApi<unknown>(MASTER_LOOKUP_ENDPOINT, LOOKUP_TOAST);
  useEffect(() => {
    if (!isOpen) return;
    setCompanyId(defaultCompanyId);
    setBranchId(defaultBranchId);
    setGodownId("");
    setItemGroupId("");
    setItemBrandId("");
    setItemSectionId("");
    setItemCategoryId("");
  }, [isOpen, defaultCompanyId, defaultBranchId]);
  useEffect(() => {
    if (!isOpen) return;
    setIsMasterLoading(true);
    void (async () => {
      try {
        const [branches, groups, brands, sections, categories, godowns] = await Promise.all([
          getBranchLookup({ module: "branches" }),
          getGroupLookup({ module: "itemGroups" }),
          getBrandLookup({ module: "itemBrands" }),
          getSectionLookup({ module: "itemSections" }),
          getCategoryLookup({ module: "itemCategories" }),
          getGodownLookup({ module: "godownLocations" }),
        ]);
        setBranchOptions(buildOptions(branches, BRANCH_ARRAY_KEYS, BRANCH_ID_KEYS, BRANCH_LABEL_KEYS));
        setItemGroupOptions(buildOptions(groups, GROUP_ARRAY_KEYS, GROUP_ID_KEYS, GROUP_LABEL_KEYS));
        setItemBrandOptions(buildOptions(brands, BRAND_ARRAY_KEYS, BRAND_ID_KEYS, BRAND_LABEL_KEYS));
        setItemSectionOptions(buildOptions(sections, SECTION_ARRAY_KEYS, SECTION_ID_KEYS, SECTION_LABEL_KEYS));
        setItemCategoryOptions(buildOptions(categories, CATEGORY_ARRAY_KEYS, CATEGORY_ID_KEYS, CATEGORY_LABEL_KEYS));
        setGodownRaw(extractGodownRaw(godowns));
      } catch {
        // keep defaults on error
      } finally {
        setIsMasterLoading(false);
      }
    })();
  }, [isOpen, getBranchLookup, getGroupLookup, getBrandLookup, getSectionLookup, getCategoryLookup, getGodownLookup]);
  useEffect(() => {
    setGodownId("");
  }, [branchId]);
  const godownOptions = useMemo<ERPDynamicSelectOption[]>(() => {
    const filtered = branchId
      ? godownRaw.filter((g) => !g.branchId || g.branchId === branchId)
      : godownRaw;
    const options = filtered
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((g) => ({ value: g.id, label: g.label }));
    return [NONE_OPTION, ...options];
  }, [godownRaw, branchId]);
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key === "F5") {
        event.preventDefault();
        if (!loading && companyId) handleSubmit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });
  const handleSubmit = useMemo(() => () => {
    onLoadItems({ companyId, branchId, godownId, itemGroupId, itemBrandId, itemSectionId, itemCategoryId });
  }, [companyId, branchId, godownId, itemGroupId, itemBrandId, itemSectionId, itemCategoryId, onLoadItems]);
  if (!isOpen) return null;
  const isDisabled = loading || isMasterLoading;
  return (
    <ModalPortal>
      <div className={dynamicModalStyles.overlay}>
        <button
          type="button"
          className={dynamicModalStyles.backdrop}
          onClick={onClose}
          aria-label="Close bulk load items"
        />
        <section
          className={`${dynamicModalStyles.panel} ${dynamicModalStyles.bulkLoadScope}`}
          style={{ width: "min(500px, calc(100vw - 2rem))", maxHeight: "min(92vh, 560px)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Bulk Load Items"
        >
          <header className={dynamicModalStyles.header}>
            <div className={dynamicModalStyles.headerRow}>
              <div className={dynamicModalStyles.headerIntro}>
                <div className={dynamicModalStyles.headerText}>
                  <h2 className={dynamicModalStyles.headerTitle}>Bulk Load Items</h2>
                </div>
              </div>
              <button
                type="button"
                className={dynamicModalStyles.closeButton}
                onClick={onClose}
                aria-label="Close"
              >
                <FiX className={dynamicModalStyles.closeIcon} aria-hidden="true" />
              </button>
            </div>
          </header>
          <div className={dynamicModalStyles.scrollArea}>
            <div
              className={dynamicModalStyles.formGrid}
              style={{ "--erp-modal-form-columns": "1" } as React.CSSProperties}
            >
              <div className={dynamicModalStyles.field}>
                <p className={dynamicModalStyles.label}>Company</p>
                <SearchableSelect
                  value={companyId}
                  options={companyOptions}
                  onChange={(val) => { setCompanyId(val); setBranchId(""); }}
                  placeholder="Select company"
                  disabled={isDisabled}
                />
              </div>
              <div className={dynamicModalStyles.field}>
                <p className={dynamicModalStyles.label}>Branch</p>
                <SearchableSelect
                  value={branchId}
                  options={branchOptions}
                  onChange={setBranchId}
                  placeholder="Select branch"
                  disabled={isDisabled || !companyId}
                />
              </div>
              <div className={dynamicModalStyles.field}>
                <p className={dynamicModalStyles.label}>Item Group</p>
                <SearchableSelect
                  value={itemGroupId}
                  options={itemGroupOptions}
                  onChange={setItemGroupId}
                  placeholder="All item groups"
                  disabled={isDisabled}
                />
              </div>
              <div className={dynamicModalStyles.field}>
                <p className={dynamicModalStyles.label}>Item Brand</p>
                <SearchableSelect
                  value={itemBrandId}
                  options={itemBrandOptions}
                  onChange={setItemBrandId}
                  placeholder="All item brands"
                  disabled={isDisabled}
                />
              </div>
              <div className={dynamicModalStyles.field}>
                <p className={dynamicModalStyles.label}>Item Section</p>
                <SearchableSelect
                  value={itemSectionId}
                  options={itemSectionOptions}
                  onChange={setItemSectionId}
                  placeholder="All item sections"
                  disabled={isDisabled}
                />
              </div>
              <div className={dynamicModalStyles.field}>
                <p className={dynamicModalStyles.label}>Item Category</p>
                <SearchableSelect
                  value={itemCategoryId}
                  options={itemCategoryOptions}
                  onChange={setItemCategoryId}
                  placeholder="All item categories"
                  disabled={isDisabled}
                />
              </div>
              <div className={dynamicModalStyles.field}>
                <p className={dynamicModalStyles.label}>Godown</p>
                <SearchableSelect
                  value={godownId}
                  options={godownOptions}
                  onChange={setGodownId}
                  placeholder="All godowns"
                  disabled={isDisabled}
                />
              </div>
            </div>
          </div>
          <footer className={dynamicModalStyles.footer}>
            <div className={dynamicModalStyles.footerActions}>
              <button
                type="button"
                className={dynamicModalStyles.cancelButton}
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${dynamicModalStyles.submitButton} ${dynamicModalStyles.submitButtonSave}`}
                onClick={handleSubmit}
                disabled={loading || isMasterLoading || !companyId}
              >
                {loading ? "Loading..." : isMasterLoading ? "Fetching..." : "Load Items"}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </ModalPortal>
  );
}