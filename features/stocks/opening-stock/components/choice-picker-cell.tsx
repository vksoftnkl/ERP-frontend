"use client";

/**
 * The Size and Colour cells — Qt 091bf5b's `ItemUnitPicker` on the Opening
 * Stock grid (user, 2026-10-26), the same pattern as the item card's Uom
 * picker: a pick-list under the cell, with "+ Add new size…/colour…" at the
 * foot. The broken editable combo (and, on the web, the `<datalist>`) is gone.
 *
 * Enter on an EMPTY cell, F2, Alt+↓, a letter (opens at the first name
 * starting with it) or a double-click opens it; Enter on a filled cell moves
 * on as everywhere; Delete / Backspace empties it; Esc keeps what was there.
 *
 * Focus never leaves the cell: it is a read-only input (so the grid's Enter
 * walk, `disabled` filter and select-on-landing see an ordinary cell) and the
 * menu is only a list it points into (the ARIA combobox pattern). A pick moves
 * on along the row, as the price grid's does. Nothing is committed on blur —
 * only an explicit pick writes — so Enter's synchronous focus hop cannot make
 * a second commit (the stale-closure trap `BatchDetailCell` documents).
 */
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
import {
  GRID_COLUMN_INDEX_ATTR,
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
  GRID_GRID_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import { moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { layoutRect } from "@/lib/ui-scale";
import { Z_POPUP } from "@/lib/z-index";
import type { BatchDetailChoice } from "../opening-stock.types";
import styles from "../page.module.scss";

export type ChoicePickerCellProps = {
  /** "size" / "colour" — the words in the placeholder and the footer. */
  word: "size" | "colour";
  value: string;
  choices: readonly BatchDetailChoice[];
  editable: boolean;
  invalid?: boolean;
  title?: string;
  gridName: string;
  rowKey: string;
  fieldKey: string;
  columnIndex: number;
  focusStop?: boolean;
  /** A pick — or "" / "" when the cell is emptied. A real pick also moves focus on along the row. */
  onPick: (choice: BatchDetailChoice) => void;
  /** "+ Add new …" — the screen asks for the name. */
  onAddNew: () => void;
};

function isLetterKey(key: string): boolean {
  return key.length === 1 && /\p{L}/u.test(key);
}

function firstStartingWith(names: readonly string[], typed: string, after = -1): number {
  const wanted = typed.toLowerCase();
  for (let step = 1; step <= names.length; step += 1) {
    const index = (after + step) % names.length;
    if (names[index].toLowerCase().startsWith(wanted)) return index;
  }
  return -1;
}

export function ChoicePickerCell(props: ChoicePickerCellProps) {
  const {
    word,
    value,
    choices,
    editable,
    invalid,
    title,
    gridName,
    rowKey,
    fieldKey,
    columnIndex,
    focusStop,
    onPick,
    onAddNew,
  } = props;
  const listId = `${useId()}-${word}`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [openRequested, setOpen] = useState(false);
  // The row can lose its right to the cell (a batch number typed) with the menu up.
  const open = openRequested && editable;
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>(undefined);

  // The last option is always "+ Add new …".
  const addIndex = choices.length;
  const names = choices.map((choice) => choice.name);

  const openMenu = useCallback(
    (typed?: string) => {
      if (!editable) return;
      const typedIndex = typed ? firstStartingWith(names, typed) : -1;
      const ownIndex = names.findIndex((name) => name.trim().toLowerCase() === value.trim().toLowerCase());
      setActiveIndex(typedIndex >= 0 ? typedIndex : ownIndex >= 0 ? ownIndex : 0);
      setOpen(true);
    },
    // names is rebuilt each render; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable, value, choices],
  );

  function choose(index: number) {
    setOpen(false);
    if (index === addIndex) {
      onAddNew();
      return;
    }
    const choice = choices[index];
    if (choice) {
      onPick(choice);
      // Along the row, as the price grid's Uom does.
      moveCellFocus(gridName, inputRef.current, 1);
    }
  }

  const updatePlacement = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    // Layout pixels: the document is globally scaled (lib/ui-scale.ts).
    const rect = layoutRect(input);
    setMenuStyle({
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.bottom + 2}px`,
      minWidth: `${Math.max(rect.width, 160)}px`,
      zIndex: Z_POPUP,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePlacement();
  }, [open, updatePlacement]);

  useEffect(() => {
    if (!open) return undefined;
    // The menu is portaled out of the cell, so an outside click checks both.
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && (inputRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId, open]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const modified = event.ctrlKey || event.altKey || event.metaKey;
    if (open) {
      // Everything is the menu's while it is up; none of it reaches the grid.
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          event.stopPropagation();
          setActiveIndex((index) => Math.min(addIndex, index + 1));
          return;
        case "ArrowUp":
          event.preventDefault();
          event.stopPropagation();
          setActiveIndex((index) => Math.max(0, index - 1));
          return;
        case "Home":
          event.preventDefault();
          event.stopPropagation();
          setActiveIndex(0);
          return;
        case "End":
          event.preventDefault();
          event.stopPropagation();
          setActiveIndex(addIndex);
          return;
        case "Enter":
          if (modified) return; // Ctrl+Enter is the screen's Save & Post
          event.preventDefault();
          event.stopPropagation();
          choose(activeIndex);
          return;
        case "Escape":
          // Keeps what was there — and is not the screen's Esc (close).
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          return;
        case "Tab":
          setOpen(false);
          return;
        default:
          if (event.key.length === 1 && !modified) {
            event.preventDefault();
            event.stopPropagation();
            const next = isLetterKey(event.key) ? firstStartingWith(names, event.key, activeIndex) : -1;
            if (next >= 0) setActiveIndex(next);
          }
          return;
      }
    }
    // Enter asks only on an EMPTY cell; a filled one moves on (the grid's walk).
    if (event.key === "Enter" && !modified && !event.shiftKey && !value.trim()) {
      event.preventDefault();
      event.stopPropagation();
      openMenu();
      return;
    }
    if ((event.key === "F2" && !modified) || (event.key === "ArrowDown" && event.altKey)) {
      event.preventDefault();
      event.stopPropagation();
      openMenu();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !modified && value.trim()) {
      event.preventDefault();
      event.stopPropagation();
      onPick({ id: "", name: "" });
      return;
    }
    if (isLetterKey(event.key) && !modified) {
      event.preventDefault();
      event.stopPropagation();
      openMenu(event.key);
    }
  }

  const addLabel = word === "size" ? "+ Add new size…" : "+ Add new colour…";
  const menu = open ? (
    <div ref={menuRef} id={listId} role="listbox" className={styles.choiceMenu} style={menuStyle}>
      {choices.length === 0 ? (
        <div className={styles.choiceMenuEmpty}>
          {`No ${word}s yet — add one with "${addLabel.replace("+ ", "")}".`}
        </div>
      ) : null}
      {choices.map((choice, index) => (
        <div
          key={choice.id || choice.name}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          className={cx(
            styles.choiceMenuOption,
            index === activeIndex && styles.choiceMenuOptionActive,
            choice.name.trim().toLowerCase() === value.trim().toLowerCase() && styles.choiceMenuOptionCurrent,
          )}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseDown={(event) => {
            event.preventDefault(); // keeps the focus on the cell
            choose(index);
          }}
        >
          {choice.name}
        </div>
      ))}
      <div
        id={`${listId}-${addIndex}`}
        role="option"
        aria-selected={activeIndex === addIndex}
        className={cx(
          styles.choiceMenuOption,
          styles.choiceMenuAdd,
          activeIndex === addIndex && styles.choiceMenuOptionActive,
        )}
        onMouseEnter={() => setActiveIndex(addIndex)}
        onMouseDown={(event) => {
          event.preventDefault();
          choose(addIndex);
        }}
      >
        {addLabel}
      </div>
    </div>
  ) : null;

  return (
    <>
      <input
        ref={inputRef}
        className={cx(quotationStyles.cellInput, invalid && quotationStyles.cellInvalid)}
        type="text"
        role="combobox"
        readOnly
        value={value}
        disabled={!editable}
        title={title ?? (value || undefined)}
        placeholder={editable ? "Pick…" : undefined}
        autoComplete="off"
        aria-label={word === "size" ? "Size" : "Colour"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        onKeyDown={onKeyDown}
        onDoubleClick={() => openMenu()}
        {...{
          [GRID_GRID_ATTR]: gridName,
          [GRID_ROW_ATTR]: rowKey,
          [GRID_FIELD_ATTR]: fieldKey,
          [GRID_COLUMN_INDEX_ATTR]: columnIndex,
          ...(focusStop ? { [GRID_FOCUS_STOP_ATTR]: "true" } : {}),
        }}
      />
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </>
  );
}
