"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./erp-header.module.css";
import { clearAuthSession } from "@/lib/auth/session";
import {
  canUseClientSideRouting,
  toInternalRoute,
} from "@/lib/navigation/safe-route";
import {
  ARIA_LABELS,
  DEFAULT_CUSTOMER_OPTIONS,
  DEFAULT_DATE_FORMAT_OPTIONS,
  DEFAULT_PRIMARY_MENU,
  DEFAULT_QUICK_TABS,
} from "./constants";
import type {
  ErpHeaderItem,
  ErpHeaderProps,
  HeaderRightProps,
  MenuLinkProps,
  MenuTreeProps,
  TabStripProps,
} from "./types";
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
// Components
function MenuLink({ item, className, hasSubmenu, onNavigate }: MenuLinkProps) {
  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    item.onClick?.();
    if (item.href && item.href !== "#") {
      event.currentTarget.blur();
      onNavigate(item.href);
      return;
    }

    if (item.onClick && !hasSubmenu) {
      event.currentTarget.blur();
      return;
    }

    if (!item.onClick && !hasSubmenu) {
      event.currentTarget.blur();
      window.alert(`Navigating to ${item.label}`);
    }
  }, [item.href, item.onClick, item.label, hasSubmenu, onNavigate]);
  return (
    <button
      type="button"
      className={cx(styles.menuLinkButton, className, hasSubmenu && styles.menuLinkWithSubmenu)}
      onClick={handleClick}
      aria-haspopup={hasSubmenu ? "menu" : undefined}
    >
      <span>{item.label}</span>
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
  depth = 0,
}: MenuTreeProps) {
  const isRootLevel = depth === 0;
  return (
    <ul
      className={
        isRootLevel
          ? rootListClassName
          : cx(
              styles.submenuList,
              depth === 1 ? styles.submenuLevelOne : styles.submenuLevelNested,
            )
      }
      role={isRootLevel ? undefined : "menu"}
    >
      {items.map((item, index) => {
        const children = item.children ?? [];
        const hasSubmenu = children.length > 0;
        const key = `${item.label}-${depth}-${index}`;

        return (
          <li key={key} className={styles.menuItem}>
            <MenuLink
              item={item}
              className={isRootLevel ? rootLinkClassName : styles.submenuLink}
              hasSubmenu={hasSubmenu}
              onNavigate={onNavigate}
            />
            {hasSubmenu && (
              <MenuTree
                items={children}
                rootListClassName={rootListClassName}
                rootLinkClassName={rootLinkClassName}
                onNavigate={onNavigate}
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
  customerOptions,
  selectedCustomer,
  onCustomerChange,
  cartCount,
  onCartClick,
  goLabel,
  onGoClick,
  logoutLabel,
  onLogout,
}: HeaderRightProps) {
  const handleCustomerChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    onCustomerChange?.(next);
  }, [onCustomerChange]);
  return (
    <div className={styles.headerRight}>
      <span className={styles.searchText}>{searchMenuCount} Search Menu :</span>
      <span className={styles.date}>{dateText}</span>
      <span className={styles.calendar} aria-hidden="true">
        CAL
      </span>
      <select
        className={styles.customerSelect}
        aria-label={ARIA_LABELS.CUSTOMER_SELECT}
        value={selectedCustomer}
        onChange={handleCustomerChange}
      >
        {customerOptions.map((option, index) => (
          <option key={`${option}-${index}`} value={option}>
            {option}
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
        />
      </div>
      <input
        className={styles.billInput}
        type="text"
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
  customerOptions = DEFAULT_CUSTOMER_OPTIONS,
  selectedCustomer,
  onCustomerChange,
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
  const router = useRouter();
  const primaryMenuRef = useRef<HTMLElement | null>(null);
  const quickTabsRef = useRef<HTMLDivElement | null>(null);
  // State management
  const [localCustomer, setLocalCustomer] = useState(
    selectedCustomer ?? customerOptions[0] ?? ""
  );
  const [localBillNumber, setLocalBillNumber] = useState(billNumber ?? "");
  // Effects for syncing with props
  useEffect(() => {
    if (selectedCustomer !== undefined) {
      setLocalCustomer(selectedCustomer);
    }
  }, [selectedCustomer]);
  useEffect(() => {
    if (
      selectedCustomer === undefined &&
      customerOptions.length > 0 &&
      !customerOptions.includes(localCustomer)
    ) {
      setLocalCustomer(customerOptions[0]);
    }
  }, [customerOptions, localCustomer, selectedCustomer]);
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
  const resolvedCustomer = selectedCustomer ?? localCustomer;
  const resolvedBillNumber = billNumber ?? localBillNumber;

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
  const handleCustomerChange = useCallback((value: string) => {
    if (selectedCustomer === undefined) {
      setLocalCustomer(value);
    }
    onCustomerChange?.(value);
  }, [selectedCustomer, onCustomerChange]);
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
  const handleLogout = useCallback(() => {
    if (onLogout) {
      onLogout();
      return;
    }

    clearAuthSession();
    if (!canUseClientSideRouting()) {
      window.location.replace("/login");
      return;
    }

    router.replace("/login");
  }, [onLogout, router]);
  return (
    <div className={styles.headerShell}>
      <header className={styles.topHeader}>
        <nav
          ref={primaryMenuRef}
          className={styles.primaryMenu}
          aria-label={ARIA_LABELS.MAIN_MENU}
        >
          <MenuTree
            items={primaryMenu}
            rootListClassName={styles.primaryMenuList}
            rootLinkClassName={styles.primaryMenuItem}
            onNavigate={handleNavigate}
          />
        </nav>
        <HeaderRight
          searchMenuCount={searchMenuCount}
          dateText={resolvedDateText}
          customerOptions={customerOptions}
          selectedCustomer={resolvedCustomer}
          onCustomerChange={handleCustomerChange}
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
        quickTabsRef={quickTabsRef}
      />
    </div>
  );
}
