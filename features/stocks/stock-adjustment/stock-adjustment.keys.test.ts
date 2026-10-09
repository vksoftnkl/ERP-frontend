/**
 * Stock Adjustment — the voucher's window keys and the Type row's arrows.
 */
import { describe, expect, it } from "vitest";
import { documentRights, type DocumentRightsInput } from "@/lib/permissions/document-rights";
import { FULL_MENU_PERMISSIONS } from "@/lib/permissions/menu-permissions";
import { KIND_BUTTONS } from "./stock-adjustment.constants";
import { entryKeyAction, kindStep, type EntryKeyEvent, type EntryKeyState } from "./stock-adjustment.keys";

function press(key: string, extra: Partial<EntryKeyEvent> = {}): EntryKeyEvent {
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

/** Every right, less the ones named. */
function rightsWithout(...denied: (keyof DocumentRightsInput)[]) {
  const input: DocumentRightsInput = { ...FULL_MENU_PERMISSIONS };
  for (const right of denied) {
    input[right] = false;
  }
  return documentRights(input);
}

/** A new document being keyed, by a user with every right. */
const KEYING: EntryKeyState = {
  overlayOpen: false,
  mode: "entry",
  status: "DRAFT",
  saved: false,
  busy: false,
  rights: rightsWithout(),
};
/** A saved draft opened read-only from the list. */
const BROWSING_DRAFT: EntryKeyState = { ...KEYING, mode: "browse", saved: true };
const POSTED: EntryKeyState = { ...KEYING, mode: "browse", status: "POSTED", saved: true };

describe("entryKeyAction", () => {
  it("maps the function keys while keying", () => {
    expect(entryKeyAction(press("F5"), KEYING)).toEqual({ action: "save", swallow: true });
    expect(entryKeyAction(press("F4"), KEYING).action).toBe("saveDraft");
    expect(entryKeyAction(press("F9"), KEYING).action).toBe("validate");
    expect(entryKeyAction(press("F7"), KEYING).action).toBe("new");
    expect(entryKeyAction(press("F8"), KEYING).action).toBe("list");
    expect(entryKeyAction(press("F2"), KEYING).action).toBe("pick");
    expect(entryKeyAction(press("F12"), KEYING).action).toBe("pick");
    expect(entryKeyAction(press("F6"), KEYING).action).toBe("print");
    expect(entryKeyAction(press("Escape"), KEYING).action).toBe("close");
    expect(entryKeyAction(press("F1"), KEYING).action).toBe("panelNext");
    expect(entryKeyAction(press("F1", { shiftKey: true }), KEYING).action).toBe("panelPrev");
  });

  it("Ctrl+Enter is Save & Print, like F6", () => {
    expect(entryKeyAction(press("Enter", { ctrlKey: true }), KEYING)).toEqual({ action: "print", swallow: true });
    expect(entryKeyAction(press("Enter", { metaKey: true }), KEYING).action).toBe("print");
    expect(entryKeyAction(press("Enter"), KEYING)).toEqual({ action: null, swallow: false });
  });

  it("F2 opens a browsed draft for edit, and nothing else", () => {
    expect(entryKeyAction(press("F2"), BROWSING_DRAFT).action).toBe("edit");
    expect(entryKeyAction(press("F2"), { ...BROWSING_DRAFT, rights: rightsWithout("canEdit") })).toEqual({
      action: null,
      swallow: true,
    });
    expect(entryKeyAction(press("F2"), POSTED).action).toBeNull();
    expect(entryKeyAction(press("F12"), BROWSING_DRAFT).action).toBeNull();
  });

  it("F3 cancels only a saved, live document: a posted one on Cancel, a draft on Delete", () => {
    expect(entryKeyAction(press("F3"), KEYING).action).toBeNull();
    expect(entryKeyAction(press("F3"), BROWSING_DRAFT).action).toBe("cancel");
    expect(entryKeyAction(press("F3"), POSTED).action).toBe("cancel");
    expect(entryKeyAction(press("F3"), { ...POSTED, status: "CANCELLED" }).action).toBeNull();
    expect(entryKeyAction(press("F3"), { ...POSTED, rights: rightsWithout("canCancel") }).action).toBeNull();
    expect(entryKeyAction(press("F3"), { ...POSTED, rights: rightsWithout("canDelete") }).action).toBe("cancel");
    expect(entryKeyAction(press("F3"), { ...BROWSING_DRAFT, rights: rightsWithout("canDelete") }).action).toBeNull();
    expect(entryKeyAction(press("F3"), { ...BROWSING_DRAFT, rights: rightsWithout("canCancel") }).action).toBe(
      "cancel",
    );
  });

  it("a posted document saves and validates nothing", () => {
    expect(entryKeyAction(press("F5"), POSTED)).toEqual({ action: null, swallow: true });
    expect(entryKeyAction(press("F4"), POSTED).action).toBeNull();
    expect(entryKeyAction(press("F9"), POSTED).action).toBeNull();
    expect(entryKeyAction(press("F8"), POSTED).action).toBe("list");
  });

  it("follows the document rights: F5 is Post, F4 is Create (Edit once saved), F7 is Create or Post", () => {
    const viewer = { ...KEYING, rights: rightsWithout("canCreate", "canEdit", "canPost") };
    expect(entryKeyAction(press("F5"), viewer).action).toBeNull();
    expect(entryKeyAction(press("F4"), viewer).action).toBeNull();
    expect(entryKeyAction(press("F7"), viewer).action).toBeNull();

    // Post without Create — "no drafts": New, then Save (and post); Save draft stays off.
    const postOnly = { ...KEYING, rights: rightsWithout("canCreate", "canEdit") };
    expect(entryKeyAction(press("F5"), postOnly).action).toBe("save");
    expect(entryKeyAction(press("F4"), postOnly).action).toBeNull();
    expect(entryKeyAction(press("F7"), postOnly).action).toBe("new");

    // Create without Post — drafts only.
    const draftsOnly = { ...KEYING, rights: rightsWithout("canPost") };
    expect(entryKeyAction(press("F5"), draftsOnly)).toEqual({ action: null, swallow: true });
    expect(entryKeyAction(press("F4"), draftsOnly).action).toBe("saveDraft");
    expect(entryKeyAction(press("F7"), draftsOnly).action).toBe("new");

    // A saved draft is saved again on Edit, not Create.
    const savedDraft = { ...KEYING, saved: true };
    expect(entryKeyAction(press("F4"), { ...savedDraft, rights: rightsWithout("canCreate") }).action).toBe("saveDraft");
    expect(entryKeyAction(press("F4"), { ...savedDraft, rights: rightsWithout("canEdit") }).action).toBeNull();
  });

  it("does nothing while a request is in flight — not even leave", () => {
    const busy = { ...KEYING, busy: true };
    for (const key of ["F4", "F5", "F7", "F8", "F9", "Escape"]) {
      expect(entryKeyAction(press(key), busy)).toEqual({ action: null, swallow: true });
    }
  });

  it("under a dialog runs nothing, but keeps the screen's F-keys from the browser", () => {
    const covered = { ...KEYING, overlayOpen: true };
    expect(entryKeyAction(press("F5"), covered)).toEqual({ action: null, swallow: true });
    expect(entryKeyAction(press("F1"), covered)).toEqual({ action: null, swallow: true });
    expect(entryKeyAction(press("F12"), covered)).toEqual({ action: null, swallow: false });
    expect(entryKeyAction(press("Escape"), covered)).toEqual({ action: null, swallow: false });
    expect(entryKeyAction(press("Enter", { ctrlKey: true }), covered)).toEqual({ action: null, swallow: false });
  });

  it("a held key repeats nothing, and a held F5 never reloads", () => {
    expect(entryKeyAction(press("F5", { repeat: true }), KEYING)).toEqual({ action: null, swallow: true });
    expect(entryKeyAction(press("Escape", { repeat: true }), KEYING)).toEqual({ action: null, swallow: false });
  });

  it("leaves a key alone once something else has claimed it", () => {
    expect(entryKeyAction(press("Escape", { defaultPrevented: true }), KEYING)).toEqual({ action: null, swallow: false });
    expect(entryKeyAction(press("F2", { defaultPrevented: true }), KEYING).action).toBeNull();
  });

  it("ignores Alt, and Ctrl / Shift with anything but their own keys", () => {
    expect(entryKeyAction(press("F5", { altKey: true }), KEYING)).toEqual({ action: null, swallow: false });
    expect(entryKeyAction(press("F5", { ctrlKey: true }), KEYING)).toEqual({ action: null, swallow: false });
    expect(entryKeyAction(press("F5", { shiftKey: true }), KEYING)).toEqual({ action: null, swallow: false });
    expect(entryKeyAction(press("a"), KEYING)).toEqual({ action: null, swallow: false });
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
