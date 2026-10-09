import { describe, expect, it } from "vitest";
import { documentRights, type DocumentRightsInput } from "./document-rights";
import { FULL_MENU_PERMISSIONS, NO_MENU_PERMISSIONS } from "./menu-permissions";

const none: DocumentRightsInput = {
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canPost: false,
  canCancel: false,
  canAmend: false,
};

describe("documentRights", () => {
  it("an ungoverned screen may do everything", () => {
    const rights = documentRights(FULL_MENU_PERMISSIONS);
    expect(rights.mayStartNew).toBe(true);
    expect(rights.maySaveDraft(false)).toBe(true);
    expect(rights.maySaveDraft(true)).toBe(true);
    expect(rights.mayPost).toBe(true);
    expect(rights.mayCancelDocument(true)).toBe(true);
    expect(rights.mayCancelDocument(false)).toBe(true);
  });

  it("a denied screen may do nothing", () => {
    const rights = documentRights(NO_MENU_PERMISSIONS);
    expect(rights.mayStartNew).toBe(false);
    expect(rights.maySaveDraft(false)).toBe(false);
    expect(rights.mayPost).toBe(false);
    expect(rights.mayCancelDocument(true)).toBe(false);
  });

  it("Post without Create is 'no drafts': New and Post, never Save Draft", () => {
    const rights = documentRights({ ...none, canPost: true });
    expect(rights.mayStartNew).toBe(true);
    expect(rights.mayPost).toBe(true);
    expect(rights.maySaveDraft(false)).toBe(false);
    expect(rights.maySaveDraft(true)).toBe(false);
  });

  it("Create without Post saves drafts but cannot post them", () => {
    const rights = documentRights({ ...none, canCreate: true });
    expect(rights.mayStartNew).toBe(true);
    expect(rights.maySaveDraft(false)).toBe(true);
    expect(rights.maySaveDraft(true)).toBe(false); // a saved draft needs Edit
    expect(rights.mayPost).toBe(false);
  });

  it("Cancel reverses a posted document, Delete drops a draft", () => {
    const deleteOnly = documentRights({ ...none, canDelete: true });
    expect(deleteOnly.mayCancelDocument(false)).toBe(true);
    expect(deleteOnly.mayCancelDocument(true)).toBe(false);
    const cancelOnly = documentRights({ ...none, canCancel: true });
    expect(cancelOnly.mayCancelDocument(true)).toBe(true);
    expect(cancelOnly.mayCancelDocument(false)).toBe(false);
  });

  it("an absent posting flag is read as allowed (the server decides)", () => {
    const rights = documentRights({ canCreate: false, canEdit: false, canDelete: false });
    expect(rights.mayPost).toBe(true);
    expect(rights.mayCancelDocument(true)).toBe(true);
  });
});
