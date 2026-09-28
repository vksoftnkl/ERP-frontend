import { describe, expect, it } from "vitest";
import {
  canSave,
  currentDiff,
  entryReducer,
  grantsForSave,
  initialEntryState,
  isDirty,
  permissionsHold,
  permissionsReady,
  saveHold,
  splitServerErrors,
  type EntryAction,
  type EntryState,
} from "./entryModel";
import { LIVE_MENU_TREE_PAYLOAD, liveUserPayload } from "./fixtures";
import { setFlag, tickMenu } from "./grants";
import { parseMenuTree } from "./menuTree";

const tree = parseMenuTree({ data: LIVE_MENU_TREE_PAYLOAD });

function run(state: EntryState, ...actions: EntryAction[]): EntryState {
  return actions.reduce(entryReducer, state);
}

describe("the load gate (§7.2)", () => {
  it("edit: Save stays disabled until the tree AND the user have loaded", () => {
    let state = initialEntryState({ mode: "edit", usrId: "u1" });
    expect(canSave(state)).toBe(false);
    state = run(state, { type: "tree/loading" }, { type: "user/loading" });
    expect(canSave(state)).toBe(false);
    expect(permissionsReady(state)).toBe(false);
    state = run(state, { type: "tree/loaded", tree });
    expect(canSave(state)).toBe(false);
    expect(saveHold(state)).toBe("Loading the user…");
    state = run(state, { type: "user/loaded", payload: liveUserPayload() });
    expect(canSave(state)).toBe(true);
    expect(saveHold(state)).toBeNull();
    expect(permissionsReady(state)).toBe(true);
    expect(permissionsHold(state)).toBeNull();
    expect(grantsForSave(state)?.size).toBe(80);
  });

  it("create: nothing to fetch for the user, but the tree still has to arrive", () => {
    let state = initialEntryState({ mode: "create", usrId: null });
    expect(state.user.status).toBe("loaded");
    expect(canSave(state)).toBe(false);
    state = run(state, { type: "tree/loading" });
    expect(saveHold(state)).toBe("Loading the menu tree…");
    state = run(state, { type: "tree/loaded", tree });
    expect(canSave(state)).toBe(true);
    expect(grantsForSave(state)?.size).toBe(0);
  });

  it("a tree that failed to load opens Save with menus omitted", () => {
    let state = initialEntryState({ mode: "edit", usrId: "u1" });
    state = run(
      state,
      { type: "user/loaded", payload: liveUserPayload() },
      { type: "tree/failed", error: "Network down." },
    );
    expect(canSave(state)).toBe(true);
    expect(grantsForSave(state)).toBeNull();
    expect(permissionsHold(state)).toBe(
      "Network down. Saving leaves this user's menu rights exactly as they are.",
    );
  });

  it("a user that failed to load cannot be saved at all", () => {
    const state = run(
      initialEntryState({ mode: "edit", usrId: "u1" }),
      { type: "tree/loaded", tree },
      { type: "user/failed", error: "Not found." },
    );
    expect(canSave(state)).toBe(false);
    expect(saveHold(state)).toBe("Not found.");
  });

  it("read-only and saving both close the gate", () => {
    const loaded = run(
      initialEntryState({ mode: "edit", usrId: "u1", readOnly: true }),
      { type: "tree/loaded", tree },
      { type: "user/loaded", payload: liveUserPayload() },
    );
    expect(canSave(loaded)).toBe(false);
    const saving = run({ ...loaded, readOnly: false }, { type: "save/started" });
    expect(canSave(saving)).toBe(false);
    expect(saveHold(saving)).toBe("Saving…");
  });
});

describe("the form", () => {
  const ready = run(
    initialEntryState({ mode: "edit", usrId: "u1" }),
    { type: "tree/loaded", tree },
    { type: "user/loaded", payload: liveUserPayload() },
  );

  it("loads the identity and the whole set from the payload", () => {
    expect(ready.identity.loginName).toBe("arjun");
    expect(ready.identity.password).toBe("");
    expect(ready.identity.userType).toBe("USER");
    expect(ready.identity.companyName).toBe("Zenith Traders");
    expect(ready.facts?.lastLoginOn).toBe("2026-09-25T04:12:00.000Z");
    expect(ready.loadedGrants.size).toBe(80);
    expect(isDirty(ready)).toBe(false);
  });

  it("is dirty on an identity change, a typed password, or a changed set", () => {
    expect(isDirty(run(ready, { type: "identity/changed", patch: { fullName: "Arjun K." } }))).toBe(true);
    expect(isDirty(run(ready, { type: "identity/changed", patch: { password: "x" } }))).toBe(true);
    // Post on 249 — a right the fixture user does not hold, so granting it is a change.
    const changed = setFlag(ready.grants, 249, "umCanPost", true, ready.loadedGrants);
    const withGrants = run(ready, { type: "grants/changed", grants: changed });
    expect(isDirty(withGrants)).toBe(true);
    expect(currentDiff(withGrants).flagsAdded).toEqual([{ menuId: 249, key: "umCanPost" }]);
  });

  it("a new company drops the branch chosen under the old one", () => {
    const next = run(ready, { type: "identity/changed", patch: { companyId: "other", companyName: "Other" } });
    expect(next.identity.branchId).toBe("");
    expect(next.identity.branchName).toBe("");
    const same = run(ready, { type: "identity/changed", patch: { companyId: ready.identity.companyId } });
    expect(same.identity.branchId).toBe(ready.identity.branchId);
  });

  it("editing a field clears that field's error", () => {
    const withError = run(ready, {
      type: "errors/set",
      fieldErrors: { loginName: "taken", email: "bad" },
      banner: null,
    });
    const next = run(withError, { type: "identity/changed", patch: { loginName: "arjun2" } });
    expect(next.fieldErrors).toEqual({ email: "bad" });
  });

  it("a revoking edit is reported by the diff", () => {
    const revoked = tickMenu(ready.grants, tree.byId.get(249)!, false, ready.loadedGrants);
    const diff = currentDiff(run(ready, { type: "grants/changed", grants: revoked }));
    expect(diff.revoked).toEqual([249]);
  });

  it("a successful save becomes the new baseline", () => {
    const dirty = run(ready, { type: "identity/changed", patch: { fullName: "Arjun K.", password: "pw" } });
    const saved = run(dirty, { type: "save/started" }, {
      type: "save/succeeded",
      payload: liveUserPayload({ usrFullName: "Arjun K." }),
    });
    expect(saved.saving).toBe(false);
    expect(saved.identity.fullName).toBe("Arjun K.");
    expect(saved.identity.password).toBe("");
    expect(isDirty(saved)).toBe(false);
  });
});

describe("splitServerErrors (§7.4)", () => {
  it("puts each field message on its field and the rest on the banner", () => {
    const { fieldErrors, banner } = splitServerErrors(
      [
        { field: "usrLoginName", message: "Login name 'arjun' is already taken" },
        { field: "menus", message: "Menu IDs not found or inactive: 999" },
        { field: "usrEmail", message: "usrEmail must be an email" },
      ],
      "Save failed.",
    );
    expect(fieldErrors).toEqual({
      loginName: "Login name 'arjun' is already taken",
      email: "usrEmail must be an email",
    });
    expect(banner).toBe("Menu IDs not found or inactive: 999");
  });

  it("uses the fallback only when nothing at all was said", () => {
    expect(splitServerErrors([], "Save failed.")).toEqual({ fieldErrors: {}, banner: "Save failed." });
    expect(splitServerErrors(null, "Save failed.").banner).toBe("Save failed.");
    expect(splitServerErrors([{ field: "usrType", message: "bad type" }], "x").banner).toBeNull();
  });

  it("lands a save failure on the form", () => {
    const state = run(
      initialEntryState({ mode: "create", usrId: null }),
      { type: "tree/loaded", tree },
      { type: "save/started" },
      {
        type: "save/failed",
        ...splitServerErrors([{ field: "usrLoginName", message: "taken" }], "x"),
      },
    );
    expect(state.saving).toBe(false);
    expect(state.fieldErrors.loginName).toBe("taken");
    expect(state.banner).toBeNull();
  });
});
