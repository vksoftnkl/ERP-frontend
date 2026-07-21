"use client";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import ErpHeader from "@/components/layout/erp-header";
import { useBusinessContext } from "@/components/layout/business-context";

function isLoginRoute(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

export default function GlobalErpHeader() {
  const pathname = usePathname();
  const hideHeader = !pathname || isLoginRoute(pathname);
  const {
    companyOptions,
    branchOptions,
    fiscalYearOptions,
    selectedCompanyId,
    selectedBranchId,
    selectedFiscalYearId,
    isCompanySelectionLocked,
    isBranchSelectionLocked,
    setSelectedCompanyId,
    setSelectedBranchId,
    setSelectedFiscalYearId,
  } = useBusinessContext();

  const visibleCompanyOptions = useMemo(
    () => companyOptions.filter((option) => option.value.trim().length > 0),
    [companyOptions],
  );
  const visibleBranchOptions = useMemo(
    () => branchOptions.filter((option) => option.value.trim().length > 0),
    [branchOptions],
  );
  const visibleFiscalYearOptions = useMemo(
    () => fiscalYearOptions.filter((option) => option.value.trim().length > 0),
    [fiscalYearOptions],
  );
  const resolvedCompanyId = useMemo(() => {
    if (visibleCompanyOptions.some((option) => option.value === selectedCompanyId)) {
      return selectedCompanyId;
    }
    return visibleCompanyOptions[0]?.value ?? "";
  }, [selectedCompanyId, visibleCompanyOptions]);
  const resolvedBranchId = useMemo(() => {
    if (visibleBranchOptions.some((option) => option.value === selectedBranchId)) {
      return selectedBranchId;
    }
    return visibleBranchOptions[0]?.value ?? "";
  }, [selectedBranchId, visibleBranchOptions]);
  const resolvedFiscalYearId = useMemo(() => {
    if (visibleFiscalYearOptions.some((option) => option.value === selectedFiscalYearId)) {
      return selectedFiscalYearId;
    }
    return visibleFiscalYearOptions[0]?.value ?? "";
  }, [selectedFiscalYearId, visibleFiscalYearOptions]);

  if (hideHeader) {
    return null;
  }
  return (
    <ErpHeader
      companyOptions={visibleCompanyOptions}
      selectedCompany={resolvedCompanyId}
      onCompanyChange={setSelectedCompanyId}
      companyDisabled={isCompanySelectionLocked}
      branchOptions={visibleBranchOptions}
      selectedBranch={resolvedBranchId}
      onBranchChange={setSelectedBranchId}
      branchDisabled={isBranchSelectionLocked}
      fiscalYearOptions={visibleFiscalYearOptions}
      selectedFiscalYear={resolvedFiscalYearId}
      onFiscalYearChange={setSelectedFiscalYearId}
      searchMenuCount={0}
      cartCount={6}
      goLabel="K Go"
    />
  );
}
