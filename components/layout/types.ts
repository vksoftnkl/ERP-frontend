import type React from "react";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";

export type ErpHeaderIconKey =
  | "sales"
  | "purchase"
  | "inventory"
  | "stock"
  | "accounts"
  | "reports"
  | "settings"
  | "transport";

/**
 * Per-menu rights as `/menu-masters/usermenu` reports them for the signed-in
 * user. The server already drops menus the user cannot see, so an item that
 * reaches the client is viewable; the remaining flags decide which toolbar
 * actions that screen may perform.
 */
export type ErpMenuPermissionFlags = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPrint: boolean;
  canExport: boolean;
  isVisible: boolean;
};

export type ErpHeaderItem = {
  label: string;
  href?: string;
  iconKey?: ErpHeaderIconKey;
  onClick?: () => void;
  menuSeparator?: boolean;
  /** `fixed.menu_master.menu_id` — the key permissions are granted against. */
  menuId?: number;
  permissions?: ErpMenuPermissionFlags;
  children?: ErpHeaderItem[];
};

export type RecentPageOption = {
  path: string;
  label: string;
};

export type ErpHeaderProps = {
  primaryMenu?: ErpHeaderItem[];
  searchMenuCount?: number;
  dateText?: string;
  companyOptions?: ERPDynamicSelectOption[];
  selectedCompany?: string;
  onCompanyChange?: (value: string) => void;
  companyDisabled?: boolean;
  branchOptions?: ERPDynamicSelectOption[];
  selectedBranch?: string;
  onBranchChange?: (value: string) => void;
  branchDisabled?: boolean;
  fiscalYearOptions?: ERPDynamicSelectOption[];
  selectedFiscalYear?: string;
  onFiscalYearChange?: (value: string) => void;
  fiscalYearDisabled?: boolean;
  cartCount?: number;
  onCartClick?: () => void;
  goLabel?: string;
  onGoClick?: () => void;
  logoutLabel?: string;
  onLogout?: () => void;
};

export type MenuLinkProps = {
  item: ErpHeaderItem;
  className: string;
  depth: number;
  hasSubmenu: boolean;
  isCurrentPage?: boolean;
  onNavigate: (destination: string) => void;
  onMenuClose: () => void;
};

export type MenuTreeProps = {
  items: ErpHeaderItem[];
  rootListClassName: string;
  rootLinkClassName: string;
  onNavigate: (destination: string) => void;
  onMenuClose: () => void;
  currentPath?: string;
  depth?: number;
};

export type HeaderRightProps = {
  searchMenuCount: number;
  dateText: string;
  recentPages: RecentPageOption[];
  selectedRecentPage: string;
  onRecentPageChange: (value: string) => void;
  companyOptions: ERPDynamicSelectOption[];
  selectedCompany: string;
  onCompanyChange?: (value: string) => void;
  companyDisabled: boolean;
  branchOptions: ERPDynamicSelectOption[];
  selectedBranch: string;
  onBranchChange?: (value: string) => void;
  branchDisabled: boolean;
  fiscalYearOptions: ERPDynamicSelectOption[];
  selectedFiscalYear: string;
  onFiscalYearChange?: (value: string) => void;
  fiscalYearDisabled: boolean;
  cartCount: number;
  onCartClick?: () => void;
  goLabel: string;
  onGoClick?: () => void;
  logoutLabel: string;
  onLogout: () => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
};

export type TabStripProps = {
  quickTabs: ErpHeaderItem[];
  billNumber: string;
  onBillNumberChange?: (value: string) => void;
  billPlaceholder: string;
  onNavigate: (destination: string) => void;
  onMenuClose: () => void;
  quickTabsRef?: React.RefObject<HTMLDivElement | null>;
};

export type ERPMenuObject = {
  [key: string]: string | null | ERPMenuObject;
};
