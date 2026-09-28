import { describe, expect, it } from "vitest";
import { buildSaveBody } from "./body";
import { LIVE_USER_MENUS, liveUserPayload } from "./fixtures";
import { EMPTY_GRANTS, grantsFromPayload } from "./grants";
import { EMPTY_IDENTITY, identityFromPayload, type IdentityForm } from "./identity";
import { SAVE_USER_KEYS } from "./wire";

const loaded = grantsFromPayload(LIVE_USER_MENUS);
const edited: IdentityForm = identityFromPayload(liveUserPayload());

describe("buildSaveBody", () => {
  it("carries no key outside SaveUserAdministrationDto, on create and on edit", () => {
    const create = buildSaveBody({
      mode: "create",
      usrId: null,
      identity: { ...EMPTY_IDENTITY, loginName: "zt-user", password: "secret" },
      grants: EMPTY_GRANTS,
    });
    const edit = buildSaveBody({ mode: "edit", usrId: "u1", identity: edited, grants: loaded });
    for (const body of [create, edit]) {
      for (const key of Object.keys(body)) expect(SAVE_USER_KEYS).toContain(key);
    }
    // Nothing the GET payload carries leaks through.
    expect(edit).not.toHaveProperty("usrIsLocked");
    expect(edit).not.toHaveProperty("usrCreatedOn");
    expect(edit).not.toHaveProperty("usrCompanyName");
  });

  it("omits usrPassword when blank on edit, and sends it on create", () => {
    const edit = buildSaveBody({ mode: "edit", usrId: "u1", identity: edited, grants: loaded });
    expect(edit).not.toHaveProperty("usrPassword");
    const changed = buildSaveBody({
      mode: "edit",
      usrId: "u1",
      identity: { ...edited, password: "  new-one " },
      grants: loaded,
    });
    expect(changed.usrPassword).toBe("new-one");
    const create = buildSaveBody({
      mode: "create",
      usrId: null,
      identity: { ...EMPTY_IDENTITY, loginName: "zt", password: "pw" },
      grants: null,
    });
    expect(create.usrPassword).toBe("pw");
  });

  it("omits menus when the tab never loaded and sends the whole set when it did", () => {
    const unloaded = buildSaveBody({ mode: "edit", usrId: "u1", identity: edited, grants: null });
    expect(unloaded).not.toHaveProperty("menus");
    const full = buildSaveBody({ mode: "edit", usrId: "u1", identity: edited, grants: loaded });
    expect(full.menus?.length).toBe(loaded.size);
    // An emptied set is sent as [] — that IS "revoke everything", and it is what the form says.
    const none = buildSaveBody({ mode: "edit", usrId: "u1", identity: edited, grants: EMPTY_GRANTS });
    expect(none.menus).toEqual([]);
  });

  it("sends usrId on edit only", () => {
    expect(buildSaveBody({ mode: "edit", usrId: "u1", identity: edited, grants: null }).usrId).toBe("u1");
    expect(
      buildSaveBody({ mode: "create", usrId: "ignored", identity: edited, grants: null }),
    ).not.toHaveProperty("usrId");
  });

  it("trims, nulls blanks, and never sends a branch without its company", () => {
    const body = buildSaveBody({
      mode: "create",
      usrId: null,
      identity: {
        ...EMPTY_IDENTITY,
        loginName: "  zt  ",
        password: "pw",
        fullName: "  ",
        email: " a@b.c ",
        userType: "",
        companyId: "",
        branchId: "br-1",
      },
      grants: null,
    });
    expect(body.usrLoginName).toBe("zt");
    expect(body.usrFullName).toBeNull();
    expect(body.usrEmail).toBe("a@b.c");
    expect(body.usrType).toBeNull();
    expect(body.usrCompanyId).toBeNull();
    expect(body.usrBranchId).toBeNull();
    expect(body.usrNotes).toBeNull();
  });

  it("falls back the display name to the full name, then the login", () => {
    const base = { ...EMPTY_IDENTITY, loginName: "zt", password: "pw" };
    expect(buildSaveBody({ mode: "create", usrId: null, identity: base, grants: null }).usrDisplayName).toBe("zt");
    expect(
      buildSaveBody({ mode: "create", usrId: null, identity: { ...base, fullName: "Zed Tee" }, grants: null })
        .usrDisplayName,
    ).toBe("Zed Tee");
    expect(
      buildSaveBody({
        mode: "create",
        usrId: null,
        identity: { ...base, fullName: "Zed Tee", displayName: "ZT" },
        grants: null,
      }).usrDisplayName,
    ).toBe("ZT");
  });

  it("leaves employee, timezone, language and avatar unsent", () => {
    const body = buildSaveBody({ mode: "edit", usrId: "u1", identity: edited, grants: null });
    expect(body).not.toHaveProperty("usrEmployeeId");
    expect(body).not.toHaveProperty("usrTimezone");
    expect(body).not.toHaveProperty("usrLanguage");
    expect(body).not.toHaveProperty("usrAvatarUrl");
  });
});
