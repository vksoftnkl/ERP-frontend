"use client";

/**
 * The menu bar.
 *
 * Every command in the designer is reachable from here, which is the point: a
 * toolbar teaches nothing about what it does not show, and the people opening
 * this screen are coming from a desktop report designer where File / Edit /
 * View / Insert / Format is where they look first. The toolbars below are
 * shortcuts to a subset; this is the complete list.
 *
 * Menus close on outside pointerdown and on Escape, and hovering across the bar
 * while one is open switches menus — the behaviour every desktop menu bar has,
 * and its absence is immediately noticeable.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  BAND_LABELS,
  BAND_TYPES,
  ELEMENT_KINDS,
  ELEMENT_LABELS,
  ZOOM_LEVELS,
} from "@/features/print-designer/lib/vocabulary";
import {
  bandAdded,
  clipboardPasted,
  placingStarted,
  redo,
  selectAllInBand,
  selectionAligned,
  selectionCopied,
  selectionCut,
  selectionDeleted,
  selectionDistributed,
  selectionDuplicated,
  selectionReordered,
  setLeftPanelOpen,
  setRightPanelOpen,
  setShowExpressions,
  setShowGrid,
  setSnapEnabled,
  setZoom,
  undo,
} from "@/features/print-designer/store/designerSlice";
import {
  selectHistoryState,
  selectMeta,
  selectSelection,
  selectView,
} from "@/features/print-designer/store/selectors";
import { useTemplateSave } from "@/features/print-designer/hooks/useTemplateSave";
import { useTemplateActions } from "@/features/print-designer/hooks/useTemplateActions";
import { PRINT_TEMPLATES_ROUTE } from "@/features/print-designer/routes";
import styles from "@/features/print-designer/components/designer.module.scss";

export type DesignerMenuBarProps = {
  onPreview: () => void;
  onOpenRevisions: () => void;
  onOpenShortcuts: () => void;
};

type MenuName = "File" | "Edit" | "View" | "Insert" | "Format" | "Help";

const MENUS: readonly MenuName[] = ["File", "Edit", "View", "Insert", "Format", "Help"];

function MenuOption({
  label,
  shortcut,
  checked,
  disabled,
  onSelect,
}: {
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.menuOption} ${checked ? styles.menuOptionChecked : ""}`}
      style={{ position: "relative" }}
      disabled={disabled}
      onClick={onSelect}
    >
      <span>{label}</span>
      {shortcut ? <span className={styles.menuShortcut}>{shortcut}</span> : null}
    </button>
  );
}

const Separator = () => <div className={styles.menuSeparator} />;

export function DesignerMenuBar({
  onPreview,
  onOpenRevisions,
  onOpenShortcuts,
}: DesignerMenuBarProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const meta = useAppSelector(selectMeta);
  const view = useAppSelector(selectView);
  const selection = useAppSelector(selectSelection);
  const history = useAppSelector(selectHistoryState);

  const { save, canSave } = useTemplateSave();
  const { publish, clone, exportJson, templateId } = useTemplateActions();

  const [open, setOpen] = useState<MenuName | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, open]);

  const run = (action: () => void) => () => {
    close();
    action();
  };

  const hasSelection = selection.elementIds.length > 0;
  const bandIndex = selection.bandIndex;
  const readOnly = meta.isSystemTemplate;

  const contents: Record<MenuName, ReactNode> = {
    File: (
      <>
        <MenuOption
          label="Save"
          shortcut="Ctrl+S"
          disabled={!canSave}
          onSelect={run(() => void save())}
        />
        <MenuOption label="Preview…" shortcut="Ctrl+P" onSelect={run(onPreview)} />
        <Separator />
        <MenuOption
          label="Publish as default…"
          disabled={!templateId || readOnly}
          onSelect={run(() => void publish())}
        />
        <MenuOption
          label="Duplicate template"
          disabled={!templateId}
          onSelect={run(() => void clone())}
        />
        <MenuOption
          label="Export JSON"
          disabled={!templateId}
          onSelect={run(() => void exportJson())}
        />
        <Separator />
        <MenuOption
          label="Version history…"
          disabled={!templateId}
          onSelect={run(onOpenRevisions)}
        />
        <Separator />
        <MenuOption label="Close" onSelect={run(() => router.push(PRINT_TEMPLATES_ROUTE))} />
      </>
    ),

    Edit: (
      <>
        <MenuOption
          label={history.undoLabel ? `Undo ${history.undoLabel}` : "Undo"}
          shortcut="Ctrl+Z"
          disabled={!history.canUndo}
          onSelect={run(() => dispatch(undo()))}
        />
        <MenuOption
          label={history.redoLabel ? `Redo ${history.redoLabel}` : "Redo"}
          shortcut="Ctrl+Shift+Z"
          disabled={!history.canRedo}
          onSelect={run(() => dispatch(redo()))}
        />
        <Separator />
        <MenuOption
          label="Cut"
          shortcut="Ctrl+X"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionCut()))}
        />
        <MenuOption
          label="Copy"
          shortcut="Ctrl+C"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionCopied()))}
        />
        <MenuOption
          label="Paste"
          shortcut="Ctrl+V"
          disabled={bandIndex === null}
          onSelect={run(() => {
            if (bandIndex !== null) {
              dispatch(clipboardPasted({ bandIndex }));
            }
          })}
        />
        <MenuOption
          label="Duplicate"
          shortcut="Ctrl+D"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionDuplicated()))}
        />
        <MenuOption
          label="Delete"
          shortcut="Del"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionDeleted()))}
        />
        <Separator />
        <MenuOption
          label="Select all in band"
          shortcut="Ctrl+A"
          disabled={bandIndex === null}
          onSelect={run(() => {
            if (bandIndex !== null) {
              dispatch(selectAllInBand(bandIndex));
            }
          })}
        />
      </>
    ),

    View: (
      <>
        <MenuOption
          label="Zoom in"
          disabled={view.zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
          onSelect={run(() => {
            const next = ZOOM_LEVELS.find((level) => level > view.zoom);
            if (next) {
              dispatch(setZoom(next));
            }
          })}
        />
        <MenuOption
          label="Zoom out"
          disabled={view.zoom <= ZOOM_LEVELS[0]}
          onSelect={run(() => {
            const next = [...ZOOM_LEVELS].reverse().find((level) => level < view.zoom);
            if (next) {
              dispatch(setZoom(next));
            }
          })}
        />
        <MenuOption label="Actual size" onSelect={run(() => dispatch(setZoom(1)))} />
        <Separator />
        <MenuOption
          label="Grid"
          shortcut="Ctrl+G"
          checked={view.showGrid}
          onSelect={run(() => dispatch(setShowGrid(!view.showGrid)))}
        />
        <MenuOption
          label="Snap to grid"
          shortcut="Ctrl+;"
          checked={view.snapEnabled}
          onSelect={run(() => dispatch(setSnapEnabled(!view.snapEnabled)))}
        />
        <MenuOption
          label="Show expressions"
          shortcut="Ctrl+E"
          checked={view.showExpressions}
          onSelect={run(() => dispatch(setShowExpressions(!view.showExpressions)))}
        />
        <Separator />
        <MenuOption
          label="Data panel"
          checked={view.leftPanelOpen}
          onSelect={run(() => dispatch(setLeftPanelOpen(!view.leftPanelOpen)))}
        />
        <MenuOption
          label="Properties panel"
          checked={view.rightPanelOpen}
          onSelect={run(() => dispatch(setRightPanelOpen(!view.rightPanelOpen)))}
        />
      </>
    ),

    Insert: (
      <>
        {ELEMENT_KINDS.map((kind) => (
          <MenuOption
            key={kind}
            label={ELEMENT_LABELS[kind]}
            disabled={bandIndex === null}
            onSelect={run(() => dispatch(placingStarted(kind)))}
          />
        ))}
        <Separator />
        {BAND_TYPES.map((type) => (
          <MenuOption
            key={type}
            label={`Band: ${BAND_LABELS[type]}`}
            onSelect={run(() => dispatch(bandAdded(type)))}
          />
        ))}
      </>
    ),

    Format: (
      <>
        <MenuOption
          label="Align left"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionAligned("left")))}
        />
        <MenuOption
          label="Align centre"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionAligned("hcenter")))}
        />
        <MenuOption
          label="Align right"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionAligned("right")))}
        />
        <MenuOption
          label="Align top"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionAligned("top")))}
        />
        <MenuOption
          label="Align middle"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionAligned("vmiddle")))}
        />
        <MenuOption
          label="Align bottom"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionAligned("bottom")))}
        />
        <Separator />
        <MenuOption
          label="Distribute horizontally"
          disabled={selection.elementIds.length < 3}
          onSelect={run(() => dispatch(selectionDistributed("horizontal")))}
        />
        <MenuOption
          label="Distribute vertically"
          disabled={selection.elementIds.length < 3}
          onSelect={run(() => dispatch(selectionDistributed("vertical")))}
        />
        <Separator />
        <MenuOption
          label="Bring to front"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionReordered("front")))}
        />
        <MenuOption
          label="Bring forward"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionReordered("forward")))}
        />
        <MenuOption
          label="Send backward"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionReordered("backward")))}
        />
        <MenuOption
          label="Send to back"
          disabled={!hasSelection}
          onSelect={run(() => dispatch(selectionReordered("back")))}
        />
      </>
    ),

    Help: (
      <>
        <MenuOption label="Keyboard shortcuts" shortcut="?" onSelect={run(onOpenShortcuts)} />
      </>
    ),
  };

  return (
    <div className={styles.menuBar} ref={barRef}>
      {MENUS.map((name) => (
        <div key={name} className={styles.menuAnchor}>
          <button
            type="button"
            className={`${styles.menuTitle} ${open === name ? styles.menuTitleOpen : ""}`}
            onClick={() => setOpen((current) => (current === name ? null : name))}
            // Once one menu is open, sliding across the bar opens the next.
            onPointerEnter={() => setOpen((current) => (current === null ? null : name))}
          >
            {name}
          </button>
          {open === name ? <div className={styles.menuDropdown}>{contents[name]}</div> : null}
        </div>
      ))}
    </div>
  );
}

export default DesignerMenuBar;
