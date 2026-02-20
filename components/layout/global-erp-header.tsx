"use client";

import { usePathname } from "next/navigation";
import ErpHeader from "@/components/layout/erp-header";

function isLoginRoute(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

export default function GlobalErpHeader() {
  const pathname = usePathname();

  if (!pathname || isLoginRoute(pathname)) {
    return null;
  }

  return (
    <ErpHeader
      searchMenuCount={0}
      cartCount={6}
      goLabel="K Go"
      selectedCustomer="Customers"
      billPlaceholder="Enter Bill No"
    />
  );
}
