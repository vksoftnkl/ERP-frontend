/**
 * Sale Bill Entry — every row of the §17.1 verb table, and the §17.2 reasons.
 */
import { describe, expect, it } from "vitest";
import { documentRights, type DocumentRightsInput } from "@/lib/permissions/document-rights";
import {
  NO_DRAFTS_MESSAGE,
  amendBlockedReason,
  cancelBlockedReason,
  draftSaveRefused,
  verbState,
  type VerbInput,
} from "./salebill.verbs";
import type { BillLocks, BillRights } from "./salebill.types";

const RIGHTS: BillRights = { post: true, cancel: true, amend: true, override: true, retender: true };
const LOCKS: BillLocks = {
  returns: 0,
  allocations: 0,
  dayClosed: false,
  irnLive: false,
  ewbLive: false,
  irnCancelWindowUntil: null,
  ewbValidUpto: null,
  editable: { document: false, transportBand: true },
};

function input(overrides: Partial<VerbInput> = {}): VerbInput {
  return {
    status: "DRAFT",
    isNew: true,
    editable: true,
    amending: false,
    autoPost: false,
    tenderRoute: false,
    rights: null,
    locks: null,
    canEditScreen: true,
    canDeleteScreen: true,
    maySaveDraft: true,
    ...overrides,
  };
}

const visible = (state: ReturnType<typeof verbState>) =>
  Object.entries(state)
    .filter(([key, value]) => key !== "saveRoute" && (value as { visible: boolean }).visible)
    .map(([key]) => key)
    .sort();

describe("verbState — keying a new bill", () => {
  it("plain route: Save draft (F5) · Post & Print (F6) · Hold · Held · Clear · List · Close", () => {
    const state = verbState(input());
    expect(visible(state)).toEqual(["clear", "close", "hold", "list", "pickHeld", "save", "saveAndPrint"]);
    expect(state.save.label).toBe("Save draft - F5");
    expect(state.saveAndPrint.label).toBe("Post & Print - F6");
    expect(state.saveAndPrint.tooltip).toBe("Post without printing: Ctrl+Shift+Enter");
    expect(state.saveRoute).toBe("draft");
  });

  it("tender route: Tender (F5) only, no Save, no F6", () => {
    const state = verbState(input({ tenderRoute: true }));
    expect(state.tender.visible).toBe(true);
    expect(state.save.visible).toBe(false);
    expect(state.saveAndPrint.visible).toBe(false);
    expect(state.saveRoute).toBe("tender");
  });

  it("auto-post: Save (F5) = post, Save & Print (F6)", () => {
    const state = verbState(input({ autoPost: true }));
    expect(state.save.label).toBe("Save - F5");
    expect(state.saveAndPrint.label).toBe("Save & Print - F6");
    expect(state.saveAndPrint.tooltip).toBeNull();
    expect(state.saveRoute).toBe("autoPost");
  });

  it("a new bill is never refused Post on missing rights", () => {
    expect(verbState(input({ rights: null })).saveAndPrint.enabled).toBe(true);
    expect(verbState(input({ isNew: true, rights: { ...RIGHTS, post: false } })).saveAndPrint.enabled).toBe(true);
  });

  it("a loaded draft without the post right greys Post & Print", () => {
    const state = verbState(input({ isNew: false, rights: { ...RIGHTS, post: false }, locks: { ...LOCKS, editable: { ...LOCKS.editable, document: true } } }));
    expect(state.saveAndPrint.enabled).toBe(false);
    expect(state.saveAndPrint.tooltip).toBe("You don't have permission to post bills.");
  });
});

describe("verbState — a loaded draft", () => {
  it("read-only: Edit (F2), Delete, Copy, List, Clear, Close", () => {
    const state = verbState(input({ isNew: false, editable: false }));
    expect(visible(state)).toEqual(["clear", "close", "copy", "delete", "edit", "list"]);
    expect(state.edit.enabled).toBe(true);
  });

  it("Edit greys without the screen right", () => {
    const state = verbState(input({ isNew: false, editable: false, canEditScreen: false }));
    expect(state.edit.enabled).toBe(false);
    expect(state.edit.tooltip).toBe("You don't have permission to edit bills.");
  });

  it("editing: Delete and Copy join the save verbs", () => {
    const state = verbState(input({ isNew: false }));
    expect(state.delete.visible).toBe(true);
    expect(state.copy.visible).toBe(true);
    expect(state.edit.visible).toBe(false);
  });
});

describe("verbState — a posted bill", () => {
  const posted = input({ status: "POSTED", isNew: false, editable: false, rights: RIGHTS, locks: LOCKS });

  it("offers Edit · Cancel bill · Copy · Clear · List · Close and nothing else", () => {
    const state = verbState(posted);
    expect(visible(state)).toEqual(["cancelBill", "clear", "close", "copy", "edit", "list"]);
    expect(state.edit.tooltip).toBe("Correct this bill. It keeps its number and date.");
    expect(state.cancelBill.tooltip).toBe("Reverse this bill. It keeps its number.");
  });

  it("never gates Amend on locks.editable.document", () => {
    expect(verbState(posted).edit.enabled).toBe(true);
  });

  it("lock 2 hides Edit; no right merely greys it", () => {
    expect(verbState({ ...posted, locks: { ...LOCKS, irnLive: true } }).edit.visible).toBe(false);
    const noRight = verbState({ ...posted, rights: { ...RIGHTS, amend: false } });
    expect(noRight.edit.visible).toBe(true);
    expect(noRight.edit.enabled).toBe(false);
    expect(noRight.edit.tooltip).toBe("You don't have permission to edit posted bills.");
  });

  it("amending: Save changes (F5) · Save changes & Print (F6) · Clear · Close", () => {
    const state = verbState({ ...posted, editable: true, amending: true });
    expect(visible(state)).toEqual(["clear", "close", "save", "saveAndPrint"]);
    expect(state.save.label).toBe("Save changes - F5");
    expect(state.saveAndPrint.label).toBe("Save changes & Print - F6");
    expect(state.saveRoute).toBe("amend");
  });

  it("amending on the tender route: Tender (F5) and Save changes", () => {
    const state = verbState({ ...posted, editable: true, amending: true, tenderRoute: true });
    expect(state.tender.visible).toBe(true);
    expect(state.save.visible).toBe(true);
    expect(state.save.label).toBe("Save changes");
    expect(state.saveAndPrint.visible).toBe(false);
  });
});

describe("the blocked reasons, in the order the operator must act", () => {
  it("cancel: right → IRN → EWB → returns → allocations → day closed", () => {
    expect(cancelBlockedReason({ ...RIGHTS, cancel: false }, { ...LOCKS, irnLive: true })).toMatch(/permission to cancel/);
    expect(cancelBlockedReason(RIGHTS, { ...LOCKS, irnLive: true, ewbLive: true })).toMatch(/IRN/);
    expect(cancelBlockedReason(RIGHTS, { ...LOCKS, ewbLive: true, returns: 2 })).toMatch(/e-way/);
    expect(cancelBlockedReason(RIGHTS, { ...LOCKS, returns: 2, allocations: 1 })).toBe("2 sale returns point at this bill. Cancel those first.");
    expect(cancelBlockedReason(RIGHTS, { ...LOCKS, allocations: 1, dayClosed: true })).toBe("1 receipt allocation are set against this bill. Release them first.");
    expect(cancelBlockedReason(RIGHTS, { ...LOCKS, dayClosed: true })).toMatch(/day is closed/);
    expect(cancelBlockedReason(RIGHTS, LOCKS)).toBeNull();
  });

  it("amend: lock 2 before the right", () => {
    expect(amendBlockedReason({ ...RIGHTS, amend: false }, { ...LOCKS, ewbLive: true })).toMatch(/e-way/);
    expect(amendBlockedReason({ ...RIGHTS, amend: false }, LOCKS)).toMatch(/permission to edit posted/);
    expect(amendBlockedReason(null, null)).toBeNull();
  });
});

describe("draft rights — Post without Create = no drafts (Qt 2026-10-12)", () => {
  const perms = (overrides: Partial<DocumentRightsInput> = {}): DocumentRightsInput => ({
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canPost: true,
    canCancel: true,
    canAmend: true,
    ...overrides,
  });

  it("greys Save draft with the reason; Post & Print stays the way", () => {
    const state = verbState(input({ maySaveDraft: false }));
    expect(state.save.visible).toBe(true);
    expect(state.save.enabled).toBe(false);
    expect(state.save.tooltip).toBe(NO_DRAFTS_MESSAGE);
    expect(state.saveAndPrint.enabled).toBe(true);
  });

  it("leaves auto-post's Save and an amend's Save changes alone — neither is a draft", () => {
    expect(verbState(input({ autoPost: true, maySaveDraft: false })).save.enabled).toBe(true);
    const amending = verbState(
      input({ status: "POSTED", isNew: false, amending: true, rights: RIGHTS, locks: LOCKS, maySaveDraft: false }),
    );
    expect(amending.save.enabled).toBe(true);
    expect(amending.save.tooltip).toBeNull();
  });

  it("refuses only a plain draft save, whatever reaches it (F5, the tender dialog's OK)", () => {
    expect(draftSaveRefused({ autoPost: false, amending: false, maySaveDraft: false })).toBe(true);
    expect(draftSaveRefused({ autoPost: false, amending: false, maySaveDraft: true })).toBe(false);
    expect(draftSaveRefused({ autoPost: true, amending: false, maySaveDraft: false })).toBe(false);
    expect(draftSaveRefused({ autoPost: false, amending: true, maySaveDraft: false })).toBe(false);
  });

  it("reads the right from documentRights: Create for a new bill, Edit for a saved draft", () => {
    const postOnly = documentRights(perms({ canCreate: false, canEdit: false }));
    expect(postOnly.mayStartNew).toBe(true);
    expect(draftSaveRefused({ autoPost: false, amending: false, maySaveDraft: postOnly.maySaveDraft(false) })).toBe(true);
    const createOnly = documentRights(perms({ canEdit: false }));
    expect(createOnly.maySaveDraft(false)).toBe(true);
    expect(createOnly.maySaveDraft(true)).toBe(false);
  });
});
