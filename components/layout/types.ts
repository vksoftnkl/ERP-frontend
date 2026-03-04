import type React from "react";

export type ErpHeaderItem = {
  label: string;
  href?: string;
  onClick?: () => void;
  menuSeparator?: boolean;
  children?: ErpHeaderItem[];
};

export type ErpHeaderProps = {
  primaryMenu?: ErpHeaderItem[];
  quickTabs?: ErpHeaderItem[];
  searchMenuCount?: number;
  dateText?: string;
  customerOptions?: string[];
  selectedCustomer?: string;
  onCustomerChange?: (value: string) => void;
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
  customerOptions: string[];
  selectedCustomer: string;
  onCustomerChange?: (value: string) => void;
  cartCount: number;
  onCartClick?: () => void;
  goLabel: string;
  onGoClick?: () => void;
  logoutLabel: string;
  onLogout?: () => void;
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
