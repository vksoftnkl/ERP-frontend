export type ErpHeaderItem = {
  label: string;
  href?: string;
  onClick?: () => void;
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
  billNumber?: string;
  onBillNumberChange?: (value: string) => void;
  billPlaceholder?: string;
};

export type MenuLinkProps = {
  item: ErpHeaderItem;
  className: string;
  hasSubmenu: boolean;
  onNavigate: (destination: string) => void;
};

export type MenuTreeProps = {
  items: ErpHeaderItem[];
  rootListClassName: string;
  rootLinkClassName: string;
  onNavigate: (destination: string) => void;
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
};

export type TabStripProps = {
  quickTabs: ErpHeaderItem[];
  billNumber: string;
  onBillNumberChange?: (value: string) => void;
  billPlaceholder: string;
  onNavigate: (destination: string) => void;
};

export type ERPMenuObject = {
  [key: string]: string | null | ERPMenuObject;
};
