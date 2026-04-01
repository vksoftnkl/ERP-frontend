"use client";
import { usePathname } from "next/navigation";
import ErpHeader from "@/components/layout/erp-header";
import { useGetBranchOptionsQuery } from "@/store/api/lookupsApi";
function isLoginRoute(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}
export default function GlobalErpHeader() {
  const pathname = usePathname();
  const hideHeader = !pathname || isLoginRoute(pathname);
  const { data: branchOptions } = useGetBranchOptionsQuery(undefined, {
    skip: hideHeader,
  });
  if (hideHeader) {
    return null;
  }
  return (
    <ErpHeader
      branchOptions={branchOptions}
      searchMenuCount={0}
      cartCount={6}
      goLabel="K Go"
      billPlaceholder="Enter Bill No"
    />
  );
}
