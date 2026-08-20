"use client";
import { useCallback } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import styles from "./erp-header.module.css";
import { ERP_HEADER_ICON_COMPONENTS } from "./constants";
import { toInternalRoute } from "@/lib/navigation/safe-route";
import type { ErpHeaderItem, MenuLinkProps, MenuTreeProps } from "./types";

function cx(...tokens: Array<string | false | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}

export function getItemRoute(item: ErpHeaderItem): string | null {
  return toInternalRoute(item.href);
}

export function isMenuItemActive(item: ErpHeaderItem, currentPath?: string): boolean {
  if (!currentPath) return false;
  const route = getItemRoute(item);
  if (route === currentPath) return true;
  return item.children?.some((child) => isMenuItemActive(child, currentPath)) ?? false;
}

function getMenuItemElement(element: HTMLElement): HTMLLIElement | null {
  return element.closest(`li.${styles.menuItem}`);
}

function getDirectMenuButton(element: Element | null): HTMLButtonElement | null {
  if (!(element instanceof HTMLElement)) return null;
  for (const child of Array.from(element.children)) {
    if (child instanceof HTMLButtonElement) return child;
  }
  return null;
}

function getDirectSubmenu(element: Element | null): HTMLUListElement | null {
  if (!(element instanceof HTMLElement)) return null;
  for (const child of Array.from(element.children)) {
    if (child instanceof HTMLUListElement) return child;
  }
  return null;
}

function getMenuButtonsInList(list: Element | null): HTMLButtonElement[] {
  if (!(list instanceof HTMLElement)) return [];
  return Array.from(list.children)
    .map((child) => getDirectMenuButton(child))
    .filter((button): button is HTMLButtonElement => button !== null);
}

function focusSiblingButton(button: HTMLButtonElement, offset: number): boolean {
  const menuItem = getMenuItemElement(button);
  const siblings = getMenuButtonsInList(menuItem?.parentElement ?? null);
  const currentIndex = siblings.indexOf(button);
  if (currentIndex === -1 || siblings.length === 0) return false;
  const nextIndex = (currentIndex + offset + siblings.length) % siblings.length;
  siblings[nextIndex]?.focus();
  return true;
}

function focusChildMenuButton(button: HTMLButtonElement, useLastChild = false): boolean {
  const menuItem = getMenuItemElement(button);
  const submenu = getDirectSubmenu(menuItem);
  const submenuButtons = getMenuButtonsInList(submenu);
  if (submenuButtons.length === 0) return false;
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

function getRootMenuItemElement(element: HTMLElement): HTMLLIElement | null {
  let current = getMenuItemElement(element);
  let root: HTMLLIElement | null = null;
  while (current) {
    root = current;
    current = current.parentElement?.closest(`li.${styles.menuItem}`) ?? null;
  }
  return root;
}

// Submenus open on :hover, so blurring alone leaves them open under the cursor
// after a navigation click. Flag the root menu item until the pointer leaves it.
function suppressHoverUntilPointerLeaves(button: HTMLButtonElement): void {
  const root = getRootMenuItemElement(button);
  if (!root || root.hasAttribute("data-menu-suppressed")) return;
  root.setAttribute("data-menu-suppressed", "true");
  const release = () => {
    root.removeAttribute("data-menu-suppressed");
    root.removeEventListener("pointerleave", release);
    document.removeEventListener("keydown", release, true);
  };
  root.addEventListener("pointerleave", release);
  document.addEventListener("keydown", release, true);
}

export function MenuLink({
  item,
  className,
  depth,
  hasSubmenu,
  isCurrentPage = false,
  onNavigate,
  onMenuClose,
}: MenuLinkProps) {
  const Icon = item.iconKey ? ERP_HEADER_ICON_COMPONENTS[item.iconKey] : undefined;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      item.onClick?.();
      if (item.href && item.href !== "#") {
        suppressHoverUntilPointerLeaves(event.currentTarget);
        event.currentTarget.blur();
        onMenuClose();
        onNavigate(item.href);
        return;
      }
      if (item.onClick && !hasSubmenu) {
        suppressHoverUntilPointerLeaves(event.currentTarget);
        event.currentTarget.blur();
        onMenuClose();
        return;
      }
      if (!item.onClick && !hasSubmenu) {
        suppressHoverUntilPointerLeaves(event.currentTarget);
        event.currentTarget.blur();
        onMenuClose();
        window.alert(`Navigating to ${item.label}`);
      }
    },
    [item.href, item.onClick, item.label, hasSubmenu, onNavigate, onMenuClose],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const { currentTarget, key } = event;
      const isRootLevel = depth === 0;
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        if (hasSubmenu && focusChildMenuButton(currentTarget)) return;
        currentTarget.click();
        return;
      }
      if (isRootLevel) {
        if (key === "ArrowRight") { event.preventDefault(); focusSiblingButton(currentTarget, 1); return; }
        if (key === "ArrowLeft") { event.preventDefault(); focusSiblingButton(currentTarget, -1); return; }
        if (key === "ArrowDown") { if (hasSubmenu) { event.preventDefault(); focusChildMenuButton(currentTarget); } return; }
        if (key === "ArrowUp") { if (hasSubmenu) { event.preventDefault(); focusChildMenuButton(currentTarget, true); } }
        return;
      }
      if (key === "ArrowDown") { event.preventDefault(); focusSiblingButton(currentTarget, 1); return; }
      if (key === "ArrowUp") { event.preventDefault(); focusSiblingButton(currentTarget, -1); return; }
      if (key === "ArrowRight") { if (hasSubmenu) { event.preventDefault(); focusChildMenuButton(currentTarget); } return; }
      if (key === "ArrowLeft") { event.preventDefault(); focusParentMenuButton(currentTarget); }
    },
    [depth, hasSubmenu],
  );

  return (
    <button
      type="button"
      className={cx(styles.menuLinkButton, className, hasSubmenu && styles.menuLinkWithSubmenu)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="menuitem"
      aria-haspopup={hasSubmenu ? "menu" : undefined}
      aria-current={isCurrentPage ? "page" : undefined}
    >
      <span className={styles.menuLinkContent}>
        {Icon ? <Icon className={styles.menuIcon} aria-hidden="true" /> : null}
        <span>{item.label}</span>
      </span>
      {hasSubmenu && (
        <span className={styles.submenuArrow} aria-hidden="true">
          {depth === 0 ? <FiChevronDown /> : <FiChevronRight />}
        </span>
      )}
    </button>
  );
}

export function MenuTree({
  items,
  rootListClassName,
  rootLinkClassName,
  onNavigate,
  onMenuClose,
  currentPath,
  depth = 0,
}: MenuTreeProps) {
  const isRootLevel = depth === 0;
  return (
    <ul
      data-menu-depth={depth}
      className={
        isRootLevel
          ? rootListClassName
          : cx(styles.submenuList, depth === 1 ? styles.submenuLevelOne : styles.submenuLevelNested)
      }
      role={isRootLevel ? "menubar" : "menu"}
    >
      {items.map((item, index) => {
        const children = item.children ?? [];
        const hasSubmenu = children.length > 0;
        const isCurrentPage = getItemRoute(item) === currentPath;
        const isActive =
          isCurrentPage || children.some((child) => isMenuItemActive(child, currentPath));
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
              className={cx(
                isRootLevel ? rootLinkClassName : styles.submenuLink,
                isActive && (isRootLevel ? styles.primaryMenuItemActive : styles.submenuLinkActive),
              )}
              depth={depth}
              hasSubmenu={hasSubmenu}
              isCurrentPage={isCurrentPage}
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
                currentPath={currentPath}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
