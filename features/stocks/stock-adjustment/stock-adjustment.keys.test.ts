/**
 * Stock Adjustment — the voucher's keys: the shared transaction set it binds
 * (lib/txn-keys, as Opening Stock), the F1 sheet, its own F12 / F5, and the
 * Type row's arrows.
 */
import { describe, expect, it } from "vitest";
import { txnKeyOf, withKey } from "@/lib/txn-keys";
import { KIND_BUTTONS } from "./stock-adjustment.constants";
import {
  KEY_SHEET,
  kindStep,
  LINE_KEYS,
  screenKeyAction,
  type ScreenKeyEvent,
  type ScreenKeyState,
} from "./stock-adjustment.keys";

function press(key: string, extra: Partial<ScreenKeyEvent> = {}): ScreenKeyEvent {
  return {
    key,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    defaultPrevented: false,
    ...extra,
  };
}

const KEYING: ScreenKeyState = { overlayOpen: false, editable: true };
const BROWSING: ScreenKeyState = { overlayOpen: false, editable: false };
const UNDER_A_DIALOG: ScreenKeyState = { overlayOpen: true, editable: true };

describe("the shared document keys", () => {
  it("are the Opening Stock set, the web chords where Chrome keeps the Qt ones", () => {
    expect(txnKeyOf(press("n", { altKey: true }))).toBe("new");
    expect(txnKeyOf(press("s", { ctrlKey: true }))).toBe("saveDraft");
    expect(txnKeyOf(press("Enter", { ctrlKey: true }))).toBe("post");
    expect(txnKeyOf(press("F2"))).toBe("edit");
    expect(txnKeyOf(press("x", { altKey: true }))).toBe("cancelDoc");
    expect(txnKeyOf(press("h", { ctrlKey: true }))).toBe("history");
    expect(txnKeyOf(press("o", { ctrlKey: true }))).toBe("open");
    expect(txnKeyOf(press("Escape"))).toBe("close");
    expect(txnKeyOf(press("PageUp", { altKey: true }))).toBe("previous");
    expect(txnKeyOf(press("PageDown", { altKey: true }))).toBe("next");
  });

  it("caption the buttons as the .ui does", () => {
    expect(withKey("New", "new")).toBe("New · Alt+N");
    expect(withKey("Save Draft", "saveDraft")).toBe("Save Draft · Ctrl+S");
    expect(withKey("Save & Post", "post")).toBe("Save & Post · Ctrl+Enter");
    expect(withKey("Cancel", "cancelDoc")).toBe("Cancel · Alt+X");
    expect(withKey("Edit", "edit")).toBe("Edit · F2");
    expect(withKey("History", "history")).toBe("History · Ctrl+H");
    expect(withKey("Show List", "open")).toBe("Show List · Ctrl+O");
    expect(withKey("Close", "close")).toBe("Close · Esc");
  });

  it("the old function keys are not document keys any more", () => {
    for (const key of ["F3", "F4", "F5", "F6", "F7", "F8", "F9"]) {
      expect(txnKeyOf(press(key))).toBeNull();
    }
  });
});

describe("the F1 sheet", () => {
  it("lists the document keys in the Qt bind() order", () => {
    expect(KEY_SHEET.document.map((row) => `${row.label} — ${row.keyText}`)).toEqual([
      "New / Clear — Alt+N",
      "Save Draft — Ctrl+S",
      "Save & Post — Ctrl+Enter",
      "Edit — F2",
      "Cancel — Alt+X",
      "History — Ctrl+H",
      "List / Open — Ctrl+O",
      "Close — Esc",
      "Previous document — Alt+PgUp",
      "Next document — Alt+PgDn",
    ]);
  });

  it("lists the grid's own keys under Lines, Pick from stock on F12", () => {
    expect(KEY_SHEET.lines).toEqual(LINE_KEYS);
    expect(LINE_KEYS.map((row) => `${row.label} — ${row.keyText}`)).toEqual([
      "Pick from stock (the line's lot) — F12",
      "Item list (type a name in Barcode) — ↓",
      "Add a line — +",
      "Remove a line — −",
      "Next cell — Enter",
      "Leave the grid — Tab",
    ]);
  });
});

describe("screenKeyAction", () => {
  it("F12 picks from stock while a draft is keyed", () => {
    expect(screenKeyAction(press("F12"), KEYING)).toEqual({ action: "pick", swallow: true });
  });

  it("F12 on a read-only document does nothing, and still stays away from the browser", () => {
    expect(screenKeyAction(press("F12"), BROWSING)).toEqual({ action: null, swallow: true });
  });

  it("F12 under a dialog is left alone — there it is only DevTools", () => {
    expect(screenKeyAction(press("F12"), UNDER_A_DIALOG)).toEqual({ action: null, swallow: false });
  });

  it("a held F12 opens nothing again; one already claimed is not run twice", () => {
    expect(screenKeyAction(press("F12", { repeat: true }), KEYING)).toEqual({ action: null, swallow: true });
    expect(screenKeyAction(press("F12", { defaultPrevented: true }), KEYING)).toEqual({
      action: null,
      swallow: true,
    });
  });

  it("bare F5 — Save until the rework — never reloads the page, under a dialog too", () => {
    expect(screenKeyAction(press("F5"), KEYING)).toEqual({ action: null, swallow: true });
    expect(screenKeyAction(press("F5"), BROWSING)).toEqual({ action: null, swallow: true });
    expect(screenKeyAction(press("F5"), UNDER_A_DIALOG)).toEqual({ action: null, swallow: true });
  });

  it("F2 is Edit now (the shared set's), never Pick from stock", () => {
    expect(screenKeyAction(press("F2"), KEYING)).toEqual({ action: null, swallow: false });
  });

  it("leaves modified keys and everything else alone", () => {
    expect(screenKeyAction(press("F5", { ctrlKey: true }), KEYING)).toEqual({ action: null, swallow: false });
    expect(screenKeyAction(press("F12", { shiftKey: true }), KEYING)).toEqual({ action: null, swallow: false });
    expect(screenKeyAction(press("F12", { altKey: true }), KEYING)).toEqual({ action: null, swallow: false });
    expect(screenKeyAction(press("F7"), KEYING)).toEqual({ action: null, swallow: false });
    expect(screenKeyAction(press("a"), KEYING)).toEqual({ action: null, swallow: false });
  });
});

describe("kindStep", () => {
  const kinds = KIND_BUTTONS.map((button) => button.kind);

  it("steps to the neighbouring type and wraps", () => {
    expect(kindStep(kinds, "Adjustment", "ArrowRight")).toBe("Issue");
    expect(kindStep(kinds, "Adjustment", "ArrowDown")).toBe("Issue");
    expect(kindStep(kinds, "Issue", "ArrowLeft")).toBe("Adjustment");
    expect(kindStep(kinds, "Adjustment", "ArrowUp")).toBe("Move");
    expect(kindStep(kinds, "Move", "ArrowRight")).toBe("Adjustment");
  });

  it("answers only the arrows", () => {
    expect(kindStep(kinds, "Adjustment", "Enter")).toBeNull();
    expect(kindStep(kinds, "Adjustment", "Tab")).toBeNull();
  });
});
