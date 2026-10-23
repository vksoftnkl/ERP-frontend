"use client";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/design-system/cx";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import { layoutRect } from "@/lib/ui-scale";
import { Z_POPUP } from "@/lib/z-index";
import styles from "./item-qty-price.module.scss";

type UnitPickerCellProps = {
  rowId: string;
  unitId: string;
  unitLabel: string;
  /** The item's unit-conversion rows, in order (value = iuc_id). */
  units: readonly ERPDynamicSelectOption[];
  disabled?: boolean;
  /** A pick — the row's own unit again included, so the cursor still moves on. */
  onPick: (unitId: string, unitLabel: string) => void;
  /** Asked to open with no units to offer. */
  onNoUnits: () => void;
};

function isLetterKey(key: string): boolean {
  return key.length === 1 && /\p{L}/u.test(key);
}

function firstStartingWith(
  units: readonly ERPDynamicSelectOption[],
  typed: string,
  after = -1,
): number {
  const wanted = typed.toLowerCase();
  for (let step = 1; step <= units.length; step += 1) {
    const index = (after + step) % units.length;
    if (units[index].label.toLowerCase().startsWith(wanted)) return index;
  }
  return -1;
}

// The Uom cell as a pick-list (Qt ItemUnitPicker — the Contra tender menu's
// pattern, user 2026-10-22: nobody knew which key opened the old in-cell
// combo). Enter on an EMPTY cell, F2, Alt+Down, a letter (opens at the first
// unit starting with it) or a double-click shows the item's units in a menu
// under the cell; Enter on a filled cell moves on as everywhere, and Esc keeps
// what was there. The focus never leaves the cell — the menu is only a list
// it points into (the ARIA combobox pattern), so the grid's Enter walk and
// the screen's keys see one element throughout.
export function UnitPickerCell({
  rowId,
  unitId,
  unitLabel,
  units,
  disabled = false,
  onPick,
  onNoUnits,
}: UnitPickerCellProps) {
  const listId = `${useId()}-units`;
  const cellRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>(undefined);

  const openMenu = useCallback(
    (typed?: string) => {
      if (disabled) return;
      if (units.length === 0) {
        onNoUnits();
        return;
      }
      // The first unit starting with the typed letter, else the row's own.
      const typedIndex = typed ? firstStartingWith(units, typed) : -1;
      const ownIndex = units.findIndex((unit) => unit.value === unitId);
      setActiveIndex(typedIndex >= 0 ? typedIndex : ownIndex >= 0 ? ownIndex : 0);
      setOpen(true);
    },
    [disabled, onNoUnits, unitId, units],
  );

  function pick(index: number) {
    const unit = units[index];
    setOpen(false);
    if (unit) onPick(unit.value, unit.label);
  }

  const updatePlacement = useCallback(() => {
    const cell = cellRef.current;
    if (!cell) return;
    // Layout pixels — fed straight back in as CSS on a fixed menu inside the
    // globally scaled document. See lib/ui-scale.ts.
    const rect = layoutRect(cell);
    setMenuStyle({
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.bottom + 2}px`,
      minWidth: `${Math.max(rect.width, 140)}px`,
      zIndex: Z_POPUP,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePlacement();
  }, [open, updatePlacement]);

  useEffect(() => {
    if (!open) return undefined;
    // The menu is portaled out of the cell, so an outside click checks both.
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && (cellRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId, open]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const modified = event.ctrlKey || event.altKey || event.metaKey;
    if (open) {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((index) => Math.min(units.length - 1, index + 1));
          return;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((index) => Math.max(0, index - 1));
          return;
        case "Home":
          event.preventDefault();
          setActiveIndex(0);
          return;
        case "End":
          event.preventDefault();
          setActiveIndex(units.length - 1);
          return;
        case "Enter":
          event.preventDefault();
          pick(activeIndex);
          return;
        case "Escape":
          // Keeps what was there — and is not the screen's Esc (close).
          event.preventDefault();
          setOpen(false);
          return;
        case "Tab":
          setOpen(false);
          return;
        default:
          // A typed character belongs to the menu while it is up — "−" must
          // not reach the grid and remove the slab under it.
          if (event.key.length === 1 && !modified) {
            event.preventDefault();
            const next = isLetterKey(event.key) ? firstStartingWith(units, event.key, activeIndex) : -1;
            if (next >= 0) setActiveIndex(next);
          }
          return;
      }
    }
    // As a Contra's tender: Enter asks only on an EMPTY cell (a filled one
    // moves on — the grid's walk); F2, Alt+Down or a letter re-picks.
    if (event.key === "Enter" && !modified && !event.shiftKey && !unitId) {
      event.preventDefault();
      openMenu();
      return;
    }
    if ((event.key === "F2" && !modified) || (event.key === "ArrowDown" && event.altKey)) {
      event.preventDefault();
      openMenu();
      return;
    }
    if (isLetterKey(event.key) && !modified) {
      event.preventDefault();
      openMenu(event.key);
    }
  }

  const menu = open ? (
    <div ref={menuRef} id={listId} role="listbox" className={styles.unitMenu} style={menuStyle}>
      {units.map((unit, index) => (
        <div
          key={unit.value}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          className={cx(
            styles.unitMenuOption,
            index === activeIndex && styles.unitMenuOptionActive,
            unit.value === unitId && styles.unitMenuOptionCurrent,
          )}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseDown={(event) => {
            // Keeps the focus on the cell.
            event.preventDefault();
            pick(index);
          }}
        >
          {unit.label}
        </div>
      ))}
    </div>
  ) : null;

  return (
    <>
      <div
        ref={cellRef}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-label="Uom"
        aria-disabled={disabled || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        data-iqp-row={rowId}
        data-iqp-cell="unit"
        className={cx(styles.unitCell, disabled && styles.unitCellDisabled)}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => openMenu()}
      >
        <span className={unitLabel ? styles.unitText : styles.unitPlaceholder}>
          {unitLabel || "Select unit"}
        </span>
        <span
          className={styles.unitCaret}
          aria-hidden="true"
          onMouseDown={(event) => {
            event.preventDefault();
            cellRef.current?.focus();
            if (open) setOpen(false);
            else openMenu();
          }}
        >
          ▾
        </span>
      </div>
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </>
  );
}
