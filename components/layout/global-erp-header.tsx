"use client";
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
    selectedCompanyId,
    selectedBranchId,
    setSelectedCompanyId,
    setSelectedBranchId,
  } = useBusinessContext();
  if (hideHeader) {
    return null;
  }
  return (
    <ErpHeader
      companyOptions={companyOptions}
      selectedCompany={selectedCompanyId}
      onCompanyChange={setSelectedCompanyId}
      branchOptions={branchOptions}
      selectedBranch={selectedBranchId}
      onBranchChange={setSelectedBranchId}
      searchMenuCount={0}
      cartCount={6}
      goLabel="K Go"
      billPlaceholder="Enter Bill No"
    />
  );
}
