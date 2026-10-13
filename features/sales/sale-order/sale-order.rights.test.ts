import { describe, expect, it } from "vitest";
import { documentRights } from "@/lib/permissions/document-rights";
import { saveAllowed } from "./sale-order.rights";

function rightsOf(granted: { create?: boolean; edit?: boolean; post?: boolean }) {
  return documentRights({
    canCreate: granted.create ?? false,
    canEdit: granted.edit ?? false,
    canDelete: false,
    canPost: granted.post ?? false,
    canCancel: false,
    canAmend: false,
  });
}

describe("saveAllowed — no draft without the right to make one", () => {
  it("a new order under auto_post is confirmed by the save: Create or Post", () => {
    for (const granted of [{ create: true }, { post: true }]) {
      expect(saveAllowed({ saved: false, autoPost: true, rights: rightsOf(granted) })).toEqual({
        ok: true,
        reason: "",
      });
    }
    expect(saveAllowed({ saved: false, autoPost: true, rights: rightsOf({ edit: true }) })).toEqual({
      ok: false,
      reason: "You need the Create or Post right on Sales Order",
    });
  });

  it("a new order without auto_post is a draft: Create alone — Post does not make drafts", () => {
    expect(saveAllowed({ saved: false, autoPost: false, rights: rightsOf({ create: true }) }).ok).toBe(
      true,
    );
    expect(saveAllowed({ saved: false, autoPost: false, rights: rightsOf({ post: true }) })).toEqual({
      ok: false,
      reason: "You may not save a draft (no Create right)",
    });
  });

  it("a saved order needs Edit, auto_post or not", () => {
    for (const autoPost of [true, false]) {
      expect(saveAllowed({ saved: true, autoPost, rights: rightsOf({ edit: true }) }).ok).toBe(true);
      expect(
        saveAllowed({ saved: true, autoPost, rights: rightsOf({ create: true, post: true }) }),
      ).toEqual({ ok: false, reason: "You need the Edit right to change a saved draft" });
    }
  });
});
