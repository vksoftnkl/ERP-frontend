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
import { notifyGlobalNavigationStart } from "@/lib/navigation/global-loader";
import {
  ARIA_LABELS,
  DEFAULT_BRANCH_OPTIONS,
  DEFAULT_COMPANY_OPTIONS,
  DEFAULT_DATE_FORMAT_OPTIONS,
  DEFAULT_PRIMARY_MENU,
} from "./constants";
import type {
  ErpHeaderItem,
  ErpHeaderProps,
  HeaderRightProps,
  RecentPageOption,
} from "./types";
import { useGetPrimaryMenuQuery } from "@/store/api/shellApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  authSessionChanged,
  recentPagesChanged,
  selectAuthUserId,
  selectRecentPages,
} from "@/store/slices/authSlice";
import { MenuTree } from "./erp-header-menu";
export type { ErpHeaderItem, ErpHeaderProps } from "./types";
// ─── Utility functions ────────────────────────────────────────────────────────
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
  if (!lastSegment) return "Home";
  return toTitleCaseLabel(lastSegment.replace(/[-_]+/g, " ").trim()) || "Recent Page";
}
function areRecentPagesEqual(left: RecentPageOption[], right: RecentPageOption[]): boolean {
  return left.length === right.length && left.every((page, index) => {
    const otherPage = right[index];
    return page.path === otherPage?.path && page.label === otherPage.label;
  });
}
function buildRouteLabelLookup(items: ErpHeaderItem[]): Map<string, string> {
  const lookup = new Map<string, string>();
  const visit = (menuItems: ErpHeaderItem[]) => {
    for (const item of menuItems) {
      const route = toInternalRoute(item.href);
      const label = item.label.trim();
      if (route && label && !lookup.has(route)) lookup.set(route, label);
      if (item.children?.length) visit(item.children);
    }
  };
  visit(items);
  return lookup;
}
// ─── Calendar helpers ─────────────────────────────────────────────────────────
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function buildCalendarDays(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null); // pad last row
  return cells;
}
// ─── CalendarPicker component ─────────────────────────────────────────────────
function CalendarPicker({
  selectedDate,
  onDateChange,
}: {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
  const shellRef = useRef<HTMLDivElement | null>(null);
  // Keep calendar view in sync when external date changes
  useEffect(() => {
    setViewYear(selectedDate.getFullYear());
    setViewMonth(selectedDate.getMonth());
  }, [selectedDate]);
  const close = useCallback(() => setOpen(false), []);
  const handleToggle = useCallback(() => setOpen((v) => !v), []);
  const handlePrevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }, []);
  const handleNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }, []);
  const handleDayClick = useCallback(
    (date: Date) => { onDateChange(date); close(); },
    [onDateChange, close],
  );
  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (shellRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [close, open]);
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
    },
    [close],
  );
  const calendarDays = useMemo(
    () => buildCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth],
  );
  const today = useMemo(() => new Date(), []);
  return (
    <div ref={shellRef} className={styles.calendarPickerShell} onKeyDown={handleKeyDown}>
      <button
        type="button"
        className={styles.calendarIconButton}
        onClick={handleToggle}
        aria-label="Open calendar"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Calendar"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          width="18"
          height="18"
        >
          <path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm-2 6h14v12H5V8zm2 3v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zM7 15v2h2v-2H7zm4 0v2h2v-2h-2z" />
        </svg>
      </button>
      {open && (
        <div className={styles.calendarPopover} role="dialog" aria-label="Date picker">
          {/* Month / year navigation */}
          <div className={styles.calendarNav}>
            <button
              type="button"
              className={styles.calendarNavBtn}
              onClick={handlePrevMonth}
              aria-label="Previous month"
            >
              &#8249;
            </button>
            <span className={styles.calendarMonthYear}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              className={styles.calendarNavBtn}
              onClick={handleNextMonth}
              aria-label="Next month"
            >
              &#8250;
            </button>
          </div>
          {/* Day-of-week headers + day grid */}
          <div className={styles.calendarGrid}>
            {DAY_LABELS.map((d) => (
              <div key={d} className={styles.calendarDayLabel}>{d}</div>
            ))}
            {calendarDays.map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className={styles.calendarCell} />;
              }
              const isSelected = isSameDay(date, selectedDate);
              const isToday = isSameDay(date, today);
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  className={cx(
                    styles.calendarCell,
                    styles.calendarDay,
                    isSelected && styles.calendarDaySelected,
                    isToday && !isSelected && styles.calendarDayToday,
                  )}
                  onClick={() => handleDayClick(date)}
                  aria-label={date.toDateString()}
                  aria-pressed={isSelected}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          {/* Today shortcut */}
          <div className={styles.calendarFooter}>
            <button
              type="button"
              className={styles.calendarTodayBtn}
              onClick={() => handleDayClick(new Date())}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
// ─── RecentPagesDropdown component ───────────────────────────────────────────
function RecentPagesDropdown({
  recentPages,
  onRecentPageChange,
  ariaLabel,
}: {
  recentPages: RecentPageOption[];
  onRecentPageChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const handleToggle = useCallback(() => {
    if (recentPages.length === 0) return;
    setOpen((value) => !value);
  }, [recentPages.length]);
  const handleSelect = useCallback(
    (path: string) => {
      if (!path) return;
      close();
      onRecentPageChange(path);
    },
    [close, onRecentPageChange],
  );
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (shellRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [close, open]);
  const handleShellKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
    },
    [close],
  );
  return (
    <div
      ref={shellRef}
      className={styles.recentPagesDropdown}
      aria-label={ariaLabel}
      onKeyDown={handleShellKeyDown}
    >
      <button
        type="button"
        className={styles.recentPagesIconButton}
        onClick={handleToggle}
        {...(recentPages.length === 0 ? { disabled: true } : {})}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Recent pages"
        title="Recent Pages"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          width="18"
          height="18"
        >
          <path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm-1 5v5.414l3.293 3.293 1.414-1.414L13 12.586V8h-1z" />
        </svg>
      </button>
      {open && (
        <div className={styles.recentPagesPopover} role="menu">
          <div className={styles.recentPagesPopoverHeader}>Recent Pages</div>
          <ul className={styles.recentPagesList}>
            {recentPages.length === 0 ? (
              <li className={styles.recentPagesEmpty}>No recent pages</li>
            ) : (
              recentPages.map((page) => (
                <li key={page.path} className={styles.recentPagesItem}>
                  <button
                    type="button"
                    className={styles.recentPagesItemButton}
                    onClick={() => handleSelect(page.path)}
                  >
                    {page.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
// ─── UserMenuDropdown component ───────────────────────────────────────────────
function UserMenuDropdown({
  logoutLabel,
  onLogout,
}: {
  logoutLabel: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const handleToggle = useCallback(() => setOpen((v) => !v), []);
  const handleLogoutClick = useCallback(() => { close(); onLogout(); }, [close, onLogout]);
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (shellRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [close, open]);
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
    },
    [close],
  );
  return (
    <div ref={shellRef} className={styles.userMenuDropdown} onKeyDown={handleKeyDown}>
      <button
        type="button"
        className={styles.userIconButton}
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="User menu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          width="20"
          height="20"
        >
          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
        </svg>
      </button>
      {open && (
        <div className={styles.userMenuPopover} role="menu">
          <button
            type="button"
            className={styles.userMenuLogoutButton}
            role="menuitem"
            onClick={handleLogoutClick}
          >
            {logoutLabel}
          </button>
        </div>
      )}
    </div>
  );
}
// ─── HeaderRight component ────────────────────────────────────────────────────
function HeaderRight({
  searchMenuCount,
  dateText,
  recentPages,
  onRecentPageChange,
  companyOptions,
  selectedCompany,
  onCompanyChange,
  companyDisabled,
  branchOptions,
  selectedBranch,
  onBranchChange,
  branchDisabled,
  cartCount,
  onCartClick,
  goLabel,
  onGoClick,
  logoutLabel,
  onLogout,
  selectedDate,
  onDateChange,
}: HeaderRightProps) {
  return (
    <div className={styles.headerRight}>
      {searchMenuCount > 0 && (
        <span className={styles.searchText}>{searchMenuCount}</span>
      )}
      <span className={styles.date}>{dateText}</span>
      <CalendarPicker selectedDate={selectedDate} onDateChange={onDateChange} />
      <RecentPagesDropdown
        recentPages={recentPages}
        onRecentPageChange={onRecentPageChange}
        ariaLabel="Recent pages"
      />
      <div className={styles.companyContextGroup}>
        <select
          className={cx(styles.contextSelect, styles.companyContextSelect)}
          value={selectedCompany}
          onChange={(e) => onCompanyChange?.(e.target.value)}
          disabled={companyDisabled}
          aria-label="Company"
        >
          {companyOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className={styles.contextSelect}
          value={selectedBranch}
          onChange={(e) => onBranchChange?.(e.target.value)}
          disabled={branchDisabled}
          aria-label="Branch"
        >
          {branchOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {onCartClick && (
        <button
          type="button"
          className={styles.cartButton}
          onClick={onCartClick}
          aria-label={`Cart (${cartCount})`}
        >
          {cartCount > 0 ? cartCount : null}
        </button>
      )}
      <button
        type="button"
        className={styles.goButton}
        onClick={onGoClick}
      >
        {goLabel}
      </button>
      <UserMenuDropdown logoutLabel={logoutLabel} onLogout={onLogout} />
    </div>
  );
}
// ─── Main ErpHeader component ─────────────────────────────────────────────────
export default function ErpHeader({
  primaryMenu = DEFAULT_PRIMARY_MENU,
  searchMenuCount = 0,
  dateText,
  companyOptions = DEFAULT_COMPANY_OPTIONS,
  selectedCompany,
  onCompanyChange,
  companyDisabled = false,
  branchOptions = DEFAULT_BRANCH_OPTIONS,
  selectedBranch,
  onBranchChange,
  branchDisabled = false,
  cartCount = 0,
  onCartClick,
  goLabel = "Go",
  onGoClick,
  logoutLabel = "Logout",
  onLogout,
}: ErpHeaderProps) {
  const dispatch = useAppDispatch();
  const recentPages = useAppSelector(selectRecentPages);
  const pathname = usePathname();
  const router = useRouter();
  const primaryMenuRef = useRef<HTMLElement | null>(null);
  const userId = useAppSelector(selectAuthUserId);
  const shouldUseMenuMasterLabels = primaryMenu === DEFAULT_PRIMARY_MENU;
  const {
    data: primaryMenuFromApi,
    isLoading: isMenuLoading,
    isUninitialized: isMenuUninitialized,
  } = useGetPrimaryMenuQuery(userId ?? "", {
    skip: !shouldUseMenuMasterLabels || !userId,
  });
  const [localCompany, setLocalCompany] = useState(
    selectedCompany ?? getDefaultCompanyValue(companyOptions)
  );
  const [localBranch, setLocalBranch] = useState(
    selectedBranch ?? getDefaultBranchValue(branchOptions)
  );
  const [selectedRecentPage, setSelectedRecentPage] = useState("");
  // Tracks the date shown in the header. Starts as today; updated on calendar pick.
  const [pickedDate, setPickedDate] = useState<Date>(() => new Date());
  useEffect(() => {
    if (selectedCompany !== undefined) setLocalCompany(selectedCompany);
  }, [selectedCompany]);
  useEffect(() => {
    if (
      selectedCompany === undefined &&
      companyOptions.length > 0 &&
      !companyOptions.some((o) => o.value === localCompany)
    ) setLocalCompany(getDefaultCompanyValue(companyOptions));
  }, [companyOptions, localCompany, selectedCompany]);
  useEffect(() => {
    if (selectedBranch !== undefined) setLocalBranch(selectedBranch);
  }, [selectedBranch]);
  useEffect(() => {
    if (
      selectedBranch === undefined &&
      branchOptions.length > 0 &&
      !branchOptions.some((o) => o.value === localBranch)
    ) setLocalBranch(getDefaultBranchValue(branchOptions));
  }, [branchOptions, localBranch, selectedBranch]);
  // If caller supplies dateText prop, use it; otherwise format the picked date.
  const resolvedDateText = useMemo(
    () => dateText ?? formatDateLabel(pickedDate),
    [dateText, pickedDate],
  );
  const resolvedPrimaryMenu = useMemo(() => {
    if (!shouldUseMenuMasterLabels) return primaryMenu;
    if (isMenuLoading || isMenuUninitialized) return primaryMenu;
    return primaryMenuFromApi?.length ? primaryMenuFromApi : primaryMenu;
  }, [primaryMenu, primaryMenuFromApi, isMenuLoading, isMenuUninitialized, shouldUseMenuMasterLabels]);
  const resolvedCompany = selectedCompany ?? localCompany;
  const resolvedBranch = selectedBranch ?? localBranch;
  const routeLabelLookup = useMemo(
    () => buildRouteLabelLookup(resolvedPrimaryMenu),
    [resolvedPrimaryMenu],
  );
  const resolvedCurrentPageLabel = useMemo(() => {
    if (!pathname) return "";
    return routeLabelLookup.get(pathname) ?? toFallbackRecentPageLabel(pathname);
  }, [pathname, routeLabelLookup]);
  const recentPageOptions = useMemo(
    () => recentPages.filter((page) => page.path !== pathname),
    [pathname, recentPages],
  );
  const closeFocusedMenu = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }, []);
  useEffect(() => { closeFocusedMenu(); }, [closeFocusedMenu, pathname]);
  useEffect(() => {
    if (!pathname || !isTrackableRecentPagePath(pathname)) {
      const persistedRecentPages = readRecentPages();
      if (!areRecentPagesEqual(recentPages, persistedRecentPages)) {
        dispatch(recentPagesChanged(persistedRecentPages));
      }
      return;
    }
    const nextRecentPages = upsertRecentPage(
      { path: pathname, label: resolvedCurrentPageLabel },
      recentPages,
    );
    if (!areRecentPagesEqual(recentPages, nextRecentPages)) {
      dispatch(recentPagesChanged(nextRecentPages));
    }
  }, [dispatch, pathname, recentPages, resolvedCurrentPageLabel]);
  useEffect(() => { setSelectedRecentPage(""); }, [pathname]);
  useEffect(() => {
    const handlePointerDownCapture = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      const isInsidePrimaryMenu = !!primaryMenuRef.current?.contains(target);
      if (isInsidePrimaryMenu) return;
      const activeInPrimaryMenu = !!primaryMenuRef.current?.contains(active);
      if (activeInPrimaryMenu) active.blur();
    };
    document.addEventListener("pointerdown", handlePointerDownCapture, true);
    return () => document.removeEventListener("pointerdown", handlePointerDownCapture, true);
  }, []);
  const handleCompanyChange = useCallback((value: string) => {
    if (selectedCompany === undefined) setLocalCompany(value);
    onCompanyChange?.(value);
  }, [onCompanyChange, selectedCompany]);
  const handleBranchChange = useCallback((value: string) => {
    if (selectedBranch === undefined) setLocalBranch(value);
    onBranchChange?.(value);
  }, [selectedBranch, onBranchChange]);
  const handleNavigate = useCallback((destination: string) => {
    const route = toInternalRoute(destination);
    if (!route) return;
    notifyGlobalNavigationStart();
    if (!canUseClientSideRouting()) { window.location.assign(route); return; }
    router.push(route);
  }, [router]);
  const handleRecentPageChange = useCallback((value: string) => {
    if (!value) return;
    setSelectedRecentPage("");
    handleNavigate(value);
  }, [handleNavigate]);
  const handleLogout = useCallback(() => {
    clearRecentPagesSession();
    if (onLogout) { onLogout(); return; }
    dispatch(authSessionChanged({ isAuthenticated: false }));
    clearAuthSession();
    clearBusinessContextSession();
    notifyGlobalNavigationStart();
    if (!canUseClientSideRouting()) { window.location.replace("/login"); return; }
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
            currentPath={pathname ?? undefined}
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
          companyDisabled={companyDisabled}
          branchOptions={branchOptions}
          selectedBranch={resolvedBranch}
          onBranchChange={handleBranchChange}
          branchDisabled={branchDisabled}
          cartCount={cartCount}
          onCartClick={onCartClick}
          goLabel={goLabel}
          onGoClick={onGoClick}
          logoutLabel={logoutLabel}
          onLogout={handleLogout}
          selectedDate={pickedDate}
          onDateChange={setPickedDate}
        />
      </header>
    </div>
  );
}
