"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./erp-header.module.css";
import { clearAuthSession } from "@/lib/auth/session";
import { clearBusinessContextSession } from "@/components/layout/business-context";
import {
  clearRecentPagesSession,
  isTrackableRecentPagePath,
  readRecentPages,
  upsertRecentPage,
} from "@/lib/navigation/recent-pages";
import {
  canUseClientSideRouting,
  toInternalRoute,
} from "@/lib/navigation/safe-route";
import {
  ARIA_LABELS,
  DEFAULT_BRANCH_OPTIONS,
  DEFAULT_COMPANY_OPTIONS,
  DEFAULT_DATE_FORMAT_OPTIONS,
  ERP_HEADER_ICON_COMPONENTS,
  DEFAULT_PRIMARY_MENU,
  DEFAULT_QUICK_TABS,
} from "./constants";
import type {
  ErpHeaderItem,
  ErpHeaderProps,
  HeaderRightProps,
  MenuLinkProps,
  MenuTreeProps,
  RecentPageOption,
  TabStripProps,
} from "./types";
import { useGetPrimaryMenuQuery } from "@/store/api/shellApi";
import { useAppDispatch } from "@/store/hooks";
import { authSessionChanged } from "@/store/slices/authSlice";
export type { ErpHeaderItem, ErpHeaderProps } from "./types";
// Utility functions
function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", DEFAULT_DATE_FORMAT_OPTIONS)
    .format(date)
    .replaceAll("/", "-");
}
function cx(...tokens: Array<string | false | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}

function getDefaultBranchValue(options: Array<{ value: string }>): string {
  const firstNamedBranch = options.find((option) => option.value.trim().length > 0);
  return firstNamedBranch?.value ?? options[0]?.value ?? "";
}

function getDefaultCompanyValue(options: Array<{ value: string }>): string {
  const firstNamedCompany = options.find((option) => option.value.trim().length > 0);
  return firstNamedCompany?.value ?? options[0]?.value ?? "";
}

function toTitleCaseLabel(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function toFallbackRecentPageLabel(pathname: string): string {
  const lastSegment = pathname.split("/").filter(Boolean).pop() ?? "";
  if (!lastSegment) {
    return "Home";
  }

  return toTitleCaseLabel(lastSegment.replace(/[-_]+/g, " ").trim()) || "Recent Page";
}

function buildRouteLabelLookup(items: ErpHeaderItem[]): Map<string, string> {
  const lookup = new Map<string, string>();

  const visit = (menuItems: ErpHeaderItem[]) => {
    for (const item of menuItems) {
      const route = toInternalRoute(item.href);
      const label = item.label.trim();

      if (route && label && !lookup.has(route)) {
        lookup.set(route, label);
      }

      if (item.children?.length) {
        visit(item.children);
      }
    }
  };

  visit(items);
  return lookup;
}

function getMenuItemElement(element: HTMLElement): HTMLLIElement | null {
  return element.closest(`li.${styles.menuItem}`);
}

function getDirectMenuButton(element: Element | null): HTMLButtonElement | null {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  for (const child of Array.from(element.children)) {
    if (child instanceof HTMLButtonElement) {
      return child;
    }
  }

  return null;
}

function getDirectSubmenu(element: Element | null): HTMLUListElement | null {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  for (const child of Array.from(element.children)) {
    if (child instanceof HTMLUListElement) {
      return child;
    }
  }

  return null;
}

function getMenuButtonsInList(list: Element | null): HTMLButtonElement[] {
  if (!(list instanceof HTMLElement)) {
    return [];
  }

  return Array.from(list.children)
    .map((child) => getDirectMenuButton(child))
    .filter((button): button is HTMLButtonElement => button !== null);
}

function focusSiblingButton(button: HTMLButtonElement, offset: number): boolean {
  const menuItem = getMenuItemElement(button);
  const siblings = getMenuButtonsInList(menuItem?.parentElement ?? null);
  const currentIndex = siblings.indexOf(button);
  if (currentIndex === -1 || siblings.length === 0) {
    return false;
  }

  const nextIndex = (currentIndex + offset + siblings.length) % siblings.length;
  siblings[nextIndex]?.focus();
  return true;
}

function focusChildMenuButton(button: HTMLButtonElement, useLastChild = false): boolean {
  const menuItem = getMenuItemElement(button);
  const submenu = getDirectSubmenu(menuItem);
  const submenuButtons = getMenuButtonsInList(submenu);
  if (submenuButtons.length === 0) {
    return false;
  }

  const target = useLastChild ? submenuButtons[submenuButtons.length - 1] : submenuButtons[0];
  target?.focus();
  return true;
}

function focusParentMenuButton(button: HTMLButtonElement): boolean {
  const menuItem = getMenuItemElement(button);
  const parentList = menuItem?.parentElement;
  const parentMenuItem = parentList?.closest(`li.${styles.menuItem}`) ?? null;
  const parentButton = getDirectMenuButton(parentMenuItem);
  parentButton?.focus();
  return parentButton !== null;
}
// Components
function MenuLink({
  item,
  className,
  depth,
  hasSubmenu,
  onNavigate,
  onMenuClose,
}: MenuLinkProps) {
  const Icon = item.iconKey ? ERP_HEADER_ICON_COMPONENTS[item.iconKey] : undefined;
  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    item.onClick?.();
    if (item.href && item.href !== "#") {
      event.currentTarget.blur();
      onMenuClose();
      onNavigate(item.href);
      return;
    }
    if (item.onClick && !hasSubmenu) {
      event.currentTarget.blur();
      onMenuClose();
      return;
    }
    if (!item.onClick && !hasSubmenu) {
      event.currentTarget.blur();
      onMenuClose();
      window.alert(`Navigating to ${item.label}`);
    }
  }, [item.href, item.onClick, item.label, hasSubmenu, onNavigate, onMenuClose]);
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    const { currentTarget, key } = event;
    const isRootLevel = depth === 0;

    if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (hasSubmenu && focusChildMenuButton(currentTarget)) {
        return;
      }
      currentTarget.click();
      return;
    }

    if (isRootLevel) {
      if (key === "ArrowRight") {
        event.preventDefault();
        focusSiblingButton(currentTarget, 1);
        return;
      }

      if (key === "ArrowLeft") {
        event.preventDefault();
        focusSiblingButton(currentTarget, -1);
        return;
      }

      if (key === "ArrowDown") {
        if (hasSubmenu) {
          event.preventDefault();
          focusChildMenuButton(currentTarget);
        }
        return;
      }

      if (key === "ArrowUp") {
        if (hasSubmenu) {
          event.preventDefault();
          focusChildMenuButton(currentTarget, true);
        }
      }
      return;
    }

    if (key === "ArrowDown") {
      event.preventDefault();
      focusSiblingButton(currentTarget, 1);
      return;
    }

    if (key === "ArrowUp") {
      event.preventDefault();
      focusSiblingButton(currentTarget, -1);
      return;
    }

    if (key === "ArrowRight") {
      if (hasSubmenu) {
        event.preventDefault();
        focusChildMenuButton(currentTarget);
      }
      return;
    }

    if (key === "ArrowLeft") {
      event.preventDefault();
      focusParentMenuButton(currentTarget);
    }
  }, [depth, hasSubmenu]);
  return (
    <button
      type="button"
      className={cx(styles.menuLinkButton, className, hasSubmenu && styles.menuLinkWithSubmenu)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="menuitem"
      aria-haspopup={hasSubmenu ? "menu" : undefined}
    >
      <span className={styles.menuLinkContent}>
        {Icon ? <Icon className={styles.menuIcon} aria-hidden="true" /> : null}
        <span>{item.label}</span>
      </span>
      {hasSubmenu && (
        <span className={styles.submenuArrow} aria-hidden="true">
          &#9656;
        </span>
      )}
    </button>
  );
}
function MenuTree({
  items,
  rootListClassName,
  rootLinkClassName,
  onNavigate,
  onMenuClose,
  depth = 0,
}: MenuTreeProps) {
  const isRootLevel = depth === 0;
  return (
    <ul
      data-menu-depth={depth}
      className={
        isRootLevel
          ? rootListClassName
          : cx(
              styles.submenuList,
              depth === 1 ? styles.submenuLevelOne : styles.submenuLevelNested,
            )
      }
      role={isRootLevel ? "menubar" : "menu"}
    >
      {items.map((item, index) => {
        const children = item.children ?? [];
        const hasSubmenu = children.length > 0;
        const key = `${item.label}-${depth}-${index}`;
        return (
          <li
            key={key}
            className={cx(
              styles.menuItem,
              !isRootLevel && item.menuSeparator && styles.submenuItemSeparated,
            )}
          >
            <MenuLink
              item={item}
              className={isRootLevel ? rootLinkClassName : styles.submenuLink}
              depth={depth}
              hasSubmenu={hasSubmenu}
              onNavigate={onNavigate}
              onMenuClose={onMenuClose}
            />
            {hasSubmenu && (
              <MenuTree
                items={children}
                rootListClassName={rootListClassName}
                rootLinkClassName={rootLinkClassName}
                onNavigate={onNavigate}
                onMenuClose={onMenuClose}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
// Header Right Component
function HeaderRight({
  searchMenuCount,
  dateText,
  recentPages,
  selectedRecentPage,
  onRecentPageChange,
  companyOptions,
  selectedCompany,
  onCompanyChange,
  branchOptions,
  selectedBranch,
  onBranchChange,
  cartCount,
  onCartClick,
  goLabel,
  onGoClick,
  logoutLabel,
  onLogout,
}: HeaderRightProps) {
  const handleCompanyChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    onCompanyChange?.(next);
  }, [onCompanyChange]);
  const handleBranchChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    onBranchChange?.(next);
  }, [onBranchChange]);
  const handleRecentPageChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    onRecentPageChange(next);
  }, [onRecentPageChange]);
  return (
    <div className={styles.headerRight}>
      <span className={styles.searchText}>{searchMenuCount} Search Menu :</span>
      <span className={styles.date}>{dateText}</span>
      <span className={styles.calendar} aria-hidden="true">
        CAL
      </span>
      <select
        className={styles.recentPagesSelect}
        aria-label={ARIA_LABELS.RECENT_PAGES_SELECT}
        value={selectedRecentPage}
        onChange={handleRecentPageChange}
        disabled={recentPages.length === 0}
      >
        <option value="" disabled>
          Recent Pages
        </option>
        {recentPages.map((page) => (
          <option key={page.path} value={page.path}>
            {page.label}
          </option>
        ))}
      </select>
      <select
        className={styles.contextSelect}
        aria-label={ARIA_LABELS.COMPANY_SELECT}
        value={selectedCompany}
        onChange={handleCompanyChange}
      >
        {companyOptions.map((option, index) => (
          <option key={`${option.value}-company-${index}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        className={styles.contextSelect}
        aria-label={ARIA_LABELS.BRANCH_SELECT}
        value={selectedBranch}
        onChange={handleBranchChange}
      >
        {branchOptions.map((option, index) => (
          <option key={`${option.value}-${index}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={styles.cartButton}
        onClick={onCartClick}
        aria-label={ARIA_LABELS.CART_BUTTON(cartCount)}
      >
        {cartCount}
      </button>
      <button type="button" className={styles.goButton} onClick={onGoClick}>
        {goLabel}
      </button>
      <button type="button" className={styles.logoutButton} onClick={onLogout}>
        {logoutLabel}
      </button>
    </div>
  );
}
// Tab Strip Component
function TabStrip({
  quickTabs,
  billNumber,
  onBillNumberChange,
  billPlaceholder,
  onNavigate,
  onMenuClose,
  quickTabsRef,
}: TabStripProps) {
  const handleBillNumberChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    onBillNumberChange?.(next);
  }, [onBillNumberChange]);
  return (
    <section className={styles.tabStrip}>
      <div ref={quickTabsRef} className={styles.quickTabs}>
        <MenuTree
          items={quickTabs}
          rootListClassName={styles.quickTabsList}
          rootLinkClassName={styles.quickTab}
          onNavigate={onNavigate}
          onMenuClose={onMenuClose}
        />
      </div>
      <input
        className={styles.billInput}
        type="text"
        autoComplete="off"
        placeholder={billPlaceholder}
        aria-label={ARIA_LABELS.BILL_INPUT}
        value={billNumber}
        onChange={handleBillNumberChange}
      />
    </section>
  );
}
// Main Component
export default function ErpHeader({
  primaryMenu = DEFAULT_PRIMARY_MENU,
  quickTabs = DEFAULT_QUICK_TABS,
  searchMenuCount = 0,
  dateText,
  companyOptions = DEFAULT_COMPANY_OPTIONS,
  selectedCompany,
  onCompanyChange,
  branchOptions = DEFAULT_BRANCH_OPTIONS,
  selectedBranch,
  onBranchChange,
  cartCount = 0,
  onCartClick,
  goLabel = "Go",
  onGoClick,
  logoutLabel = "Logout",
  onLogout,
  billNumber,
  onBillNumberChange,
  billPlaceholder = "Enter Bill No",
}: ErpHeaderProps) {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const router = useRouter();
  const primaryMenuRef = useRef<HTMLElement | null>(null);
  const quickTabsRef = useRef<HTMLDivElement | null>(null);
  const shouldUseMenuMasterLabels = primaryMenu === DEFAULT_PRIMARY_MENU;
  const { data: primaryMenuFromApi } = useGetPrimaryMenuQuery(undefined, {
    skip: !shouldUseMenuMasterLabels,
  });
  const [localCompany, setLocalCompany] = useState(
    selectedCompany ?? getDefaultCompanyValue(companyOptions)
  );
  const [localBranch, setLocalBranch] = useState(
    selectedBranch ?? getDefaultBranchValue(branchOptions)
  );
  const [localBillNumber, setLocalBillNumber] = useState(billNumber ?? "");
  const [recentPages, setRecentPages] = useState<RecentPageOption[]>([]);
  const [selectedRecentPage, setSelectedRecentPage] = useState("");
  useEffect(() => {
    if (selectedCompany !== undefined) {
      setLocalCompany(selectedCompany);
    }
  }, [selectedCompany]);
  useEffect(() => {
    if (
      selectedCompany === undefined &&
      companyOptions.length > 0 &&
      !companyOptions.some((option) => option.value === localCompany)
    ) {
      setLocalCompany(getDefaultCompanyValue(companyOptions));
    }
  }, [companyOptions, localCompany, selectedCompany]);
  useEffect(() => {
    if (selectedBranch !== undefined) {
      setLocalBranch(selectedBranch);
    }
  }, [selectedBranch]);
  useEffect(() => {
    if (
      selectedBranch === undefined &&
      branchOptions.length > 0 &&
      !branchOptions.some((option) => option.value === localBranch)
    ) {
      setLocalBranch(getDefaultBranchValue(branchOptions));
    }
  }, [branchOptions, localBranch, selectedBranch]);
  useEffect(() => {
    if (billNumber !== undefined) {
      setLocalBillNumber(billNumber);
    }
  }, [billNumber]);
  // Memoized values
  const resolvedDateText = useMemo(
    () => dateText ?? formatDateLabel(new Date()),
    [dateText]
  );
  const resolvedPrimaryMenu = useMemo(
    () => (shouldUseMenuMasterLabels ? primaryMenuFromApi ?? [] : primaryMenu),
    [primaryMenu, primaryMenuFromApi, shouldUseMenuMasterLabels],
  );
  const resolvedCompany = selectedCompany ?? localCompany;
  const resolvedBranch = selectedBranch ?? localBranch;
  const resolvedBillNumber = billNumber ?? localBillNumber;
  const routeLabelLookup = useMemo(
    () => buildRouteLabelLookup(resolvedPrimaryMenu),
    [resolvedPrimaryMenu],
  );
  const resolvedCurrentPageLabel = useMemo(() => {
    if (!pathname) {
      return "";
    }

    return routeLabelLookup.get(pathname) ?? toFallbackRecentPageLabel(pathname);
  }, [pathname, routeLabelLookup]);
  const recentPageOptions = useMemo(
    () => recentPages.filter((page) => page.path !== pathname),
    [pathname, recentPages],
  );
  const closeFocusedMenu = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  }, []);

  useEffect(() => {
    closeFocusedMenu();
  }, [closeFocusedMenu, pathname]);
  useEffect(() => {
    if (!pathname) {
      setRecentPages(readRecentPages());
      return;
    }

    if (!isTrackableRecentPagePath(pathname)) {
      setRecentPages(readRecentPages());
      return;
    }

    setRecentPages(
      upsertRecentPage({
        path: pathname,
        label: resolvedCurrentPageLabel,
      }),
    );
  }, [pathname, resolvedCurrentPageLabel]);
  useEffect(() => {
    setSelectedRecentPage("");
  }, [pathname]);
  useEffect(() => {
    const handlePointerDownCapture = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) {
        return;
      }
      const isInsidePrimaryMenu = !!primaryMenuRef.current?.contains(target);
      const isInsideQuickTabs = !!quickTabsRef.current?.contains(target);
      if (isInsidePrimaryMenu || isInsideQuickTabs) {
        return;
      }
      const activeInPrimaryMenu = !!primaryMenuRef.current?.contains(active);
      const activeInQuickTabs = !!quickTabsRef.current?.contains(active);
      if (activeInPrimaryMenu || activeInQuickTabs) {
        active.blur();
      }
    };
    document.addEventListener("pointerdown", handlePointerDownCapture, true);
    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDownCapture,
        true,
      );
    };
  }, []);
  // Event handlers
  const handleCompanyChange = useCallback((value: string) => {
    if (selectedCompany === undefined) {
      setLocalCompany(value);
    }
    onCompanyChange?.(value);
  }, [onCompanyChange, selectedCompany]);
  const handleBranchChange = useCallback((value: string) => {
    if (selectedBranch === undefined) {
      setLocalBranch(value);
    }
    onBranchChange?.(value);
  }, [selectedBranch, onBranchChange]);
  const handleBillNumberChange = useCallback((value: string) => {
    if (billNumber === undefined) {
      setLocalBillNumber(value);
    }
    onBillNumberChange?.(value);
  }, [billNumber, onBillNumberChange]);
  const handleNavigate = useCallback((destination: string) => {
    const route = toInternalRoute(destination);
    if (!route) {
      return;
    }
    if (!canUseClientSideRouting()) {
      window.location.assign(route);
      return;
    }
    router.push(route);
  }, [router]);
  const handleRecentPageChange = useCallback((value: string) => {
    if (!value) {
      return;
    }

    setSelectedRecentPage("");
    handleNavigate(value);
  }, [handleNavigate]);
  const handleLogout = useCallback(() => {
    clearRecentPagesSession();
    setRecentPages([]);

    if (onLogout) {
      onLogout();
      return;
    }

    dispatch(authSessionChanged({ token: null, userId: null }));
    clearAuthSession();
    clearBusinessContextSession();
    if (!canUseClientSideRouting()) {
      window.location.replace("/login");
      return;
    }
    router.replace("/login");
  }, [dispatch, onLogout, router]);
  return (
    <div className={styles.headerShell}>
      <header className={styles.topHeader}>
        <nav
          ref={primaryMenuRef}
          className={styles.primaryMenu}
          aria-label={ARIA_LABELS.MAIN_MENU}
        >
          <MenuTree
            items={resolvedPrimaryMenu}
            rootListClassName={styles.primaryMenuList}
            rootLinkClassName={styles.primaryMenuItem}
            onNavigate={handleNavigate}
            onMenuClose={closeFocusedMenu}
          />
        </nav>
        <HeaderRight
          searchMenuCount={searchMenuCount}
          dateText={resolvedDateText}
          recentPages={recentPageOptions}
          selectedRecentPage={selectedRecentPage}
          onRecentPageChange={handleRecentPageChange}
          companyOptions={companyOptions}
          selectedCompany={resolvedCompany}
          onCompanyChange={handleCompanyChange}
          branchOptions={branchOptions}
          selectedBranch={resolvedBranch}
          onBranchChange={handleBranchChange}
          cartCount={cartCount}
          onCartClick={onCartClick}
          goLabel={goLabel}
          onGoClick={onGoClick}
          logoutLabel={logoutLabel}
          onLogout={handleLogout}
        />
      </header>
      <TabStrip
        quickTabs={quickTabs}
        billNumber={resolvedBillNumber}
        onBillNumberChange={handleBillNumberChange}
        billPlaceholder={billPlaceholder}
        onNavigate={handleNavigate}
        onMenuClose={closeFocusedMenu}
        quickTabsRef={quickTabsRef}
      />
    </div>
  );
}
