import type React from "react";
import type { ERPDynamicSelectOption } from "@/components/library/ui";

export type ErpHeaderIconKey =
  | "sales"
  | "purchase"
  | "inventory"
  | "stock"
  | "accounts"
  | "reports"
  | "settings"
  | "transport";

export type ErpHeaderItem = {
  label: string;
  href?: string;
  iconKey?: ErpHeaderIconKey;
  onClick?: () => void;
  menuSeparator?: boolean;
  children?: ErpHeaderItem[];
};

export type RecentPageOption = {
  path: string;
  label: string;
};

export type ErpHeaderProps = {
  primaryMenu?: ErpHeaderItem[];
  quickTabs?: ErpHeaderItem[];
  searchMenuCount?: number;
  dateText?: string;
  companyOptions?: ERPDynamicSelectOption[];
  selectedCompany?: string;
  onCompanyChange?: (value: string) => void;
  branchOptions?: ERPDynamicSelectOption[];
  selectedBranch?: string;
  onBranchChange?: (value: string) => void;
  cartCount?: number;
  onCartClick?: () => void;
  goLabel?: string;
  onGoClick?: () => void;
  logoutLabel?: string;
  onLogout?: () => void;
  billNumber?: string;
  onBillNumberChange?: (value: string) => void;
  billPlaceholder?: string;
};

export type MenuLinkProps = {
  item: ErpHeaderItem;
  className: string;
  depth: number;
  hasSubmenu: boolean;
  onNavigate: (destination: string) => void;
  onMenuClose: () => void;
};

export type MenuTreeProps = {
  items: ErpHeaderItem[];
  rootListClassName: string;
  rootLinkClassName: string;
  onNavigate: (destination: string) => void;
  onMenuClose: () => void;
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
  branchOptions: ERPDynamicSelectOption[];
  selectedBranch: string;
  onBranchChange?: (value: string) => void;
  cartCount: number;
  onCartClick?: () => void;
  goLabel: string;
  onGoClick?: () => void;
  logoutLabel: string;
  onLogout: () => void;
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
