/**
 * The user master's wire, against a REAL backend — the port plan's §11 live
 * acceptance, run through the same functions the screen uses:
 *
 *   1. create a ZT user with three menus; read `menus[]` back;
 *   2. grant one more — the other three come back unchanged (this is the
 *      2026-09-19 regression, where a save meant to grant one menu rewrote
 *      the set and four rows came back all-false);
 *   3. revoke one — the confirmation names it;
 *   4. Post / Cancel granted on a posting menu reach the row;
 *   4c. the till PIN is set, kept by a blank save and cleared; SUPERVISOR saves;
 *   5. delete the user.
 *
 * SKIPPED BY DEFAULT. It needs a running API:
 *
 *   USER_ADMIN_IT_API=https://localhost:3011/api/v1 \
 *     npx vitest run features/masters/settings/user-administration/user-admin.integration.test.ts
 *
 * `/user-administration/*` is a public controller, so no token is needed; set
 * USER_ADMIN_IT_TOKEN to send one anyway. The menu ids come from the captured
 * tree (`domain/fixtures.ts`): 10 Customers, 11 Sales Order, 12 Sales Entry
 * (the one menu with RETENDER), 249 Stock Track Policy (VIEW + PRINT only).
 * Every run creates its own ZT-USER-… and deletes it at the end; a failed run
 * leaves it soft-deleted at worst.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readUserAdminError } from "./api/userAdmin";
import { buildSaveBody } from "./domain/body";
import { LIVE_MENU_TREE_PAYLOAD } from "./domain/fixtures";
import { describeRevocations, grantDiff } from "./domain/grantDiff";
import {
  EMPTY_GRANTS,
  grantsFromPayload,
  setAllVerbsOnMenu,
  setFlag,
  tickMenu,
  type Grants,
} from "./domain/grants";
import { EMPTY_IDENTITY, identityFromPayload, type IdentityForm } from "./domain/identity";
import { parseMenuTree } from "./domain/menuTree";
import { GRANT_FLAG_KEYS, type SaveUserAdministrationDto, type UserAdminPayload } from "./domain/wire";

const API = process.env.USER_ADMIN_IT_API;
const TOKEN = process.env.USER_ADMIN_IT_TOKEN;
const suite = API ? describe : describe.skip;

if (API) {
  // The API is served over a mkcert certificate node does not trust.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

type Envelope<T> = { success: boolean; message?: string; data?: T; errors?: unknown[] };

async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Envelope<T> }> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: Envelope<T> = { success: false };
  try {
    parsed = JSON.parse(text) as Envelope<T>;
  } catch {
    parsed = { success: false, message: text };
  }
  return { status: response.status, body: parsed };
}

async function save(body: SaveUserAdministrationDto): Promise<UserAdminPayload> {
  const { status, body: envelope } = await call<UserAdminPayload>("POST", "/user-administration/create", body);
  if (status >= 400 || !envelope.data) {
    throw new Error(
      `save answered ${status}: ${readUserAdminError({ status, data: envelope }).message} ${JSON.stringify(envelope.errors ?? [])}`,
    );
  }
  return envelope.data;
}

async function read(usrId: string): Promise<UserAdminPayload> {
  const { status, body } = await call<UserAdminPayload>("GET", `/user-administration/get?usrId=${usrId}`);
  if (status >= 400 || !body.data) throw new Error(`get answered ${status}: ${body.message}`);
  return body.data;
}

function flagsOf(grants: Grants, menuId: number): Record<string, boolean> {
  const grant = grants.get(menuId);
  if (!grant) throw new Error(`menu ${menuId} is not in the set`);
  return Object.fromEntries(GRANT_FLAG_KEYS.map((key) => [key, grant.flags[key]]));
}

const tree = parseMenuTree({ data: LIVE_MENU_TREE_PAYLOAD });
const node = (menuId: number) => {
  const found = tree.byId.get(menuId);
  if (!found) throw new Error(`fixture tree has no menu ${menuId}`);
  return found;
};
const nameOf = (menuId: number) => tree.byId.get(menuId)?.label ?? `#${menuId}`;

suite("User Administration against the live API", () => {
  const loginName = `ZT-USER-${Date.now().toString(36)}`;
  let usrId = "";
  let identity: IdentityForm = { ...EMPTY_IDENTITY, loginName, password: "zt-pass-1", userType: "USER" };
  let loaded: Grants = EMPTY_GRANTS;

  beforeAll(() => {
    expect(tree.byId.get(12)?.verbs.has("POST")).toBe(true);
  });

  afterAll(async () => {
    if (!usrId) return;
    await call("DELETE", `/user-administration/delete?usrId=${usrId}`);
  });

  it("1. creates the user with three menus and reads them back", async () => {
    let grants = setAllVerbsOnMenu(EMPTY_GRANTS, node(10), true, EMPTY_GRANTS);
    grants = setAllVerbsOnMenu(grants, node(11), true, EMPTY_GRANTS);
    grants = setFlag(grants, 12, "umCanView", true, EMPTY_GRANTS);
    grants = setFlag(grants, 12, "umCanCreate", true, EMPTY_GRANTS);

    const created = await save(buildSaveBody({ mode: "create", usrId: null, identity, grants }));
    usrId = created.usrId;
    expect(created.usrLoginName).toBe(loginName);
    // A blank display name fell back to the login.
    expect(created.usrDisplayName).toBe(loginName);
    expect(created.usrType).toBe("USER");

    const back = await read(usrId);
    loaded = grantsFromPayload(back.menus);
    identity = identityFromPayload(back);
    expect([...loaded.keys()].sort((a, b) => a - b)).toEqual([10, 11, 12]);
    expect(flagsOf(loaded, 10)).toEqual(flagsOf(grants, 10));
    expect(flagsOf(loaded, 11)).toEqual(flagsOf(grants, 11));
    expect(flagsOf(loaded, 12)).toEqual(flagsOf(grants, 12));
    expect(loaded.get(12)?.flags.umCanPost).toBe(false);
  });

  it("2. grants one more menu and leaves the other three exactly as they were", async () => {
    const before = { 10: flagsOf(loaded, 10), 11: flagsOf(loaded, 11), 12: flagsOf(loaded, 12) };
    const grants = setAllVerbsOnMenu(loaded, node(249), true, loaded);
    const diff = grantDiff(loaded, grants);
    expect(diff.granted).toEqual([249]);
    expect(describeRevocations(diff, nameOf)).toBeNull();

    await save(buildSaveBody({ mode: "edit", usrId, identity, grants }));
    const back = await read(usrId);
    loaded = grantsFromPayload(back.menus);
    expect([...loaded.keys()].sort((a, b) => a - b)).toEqual([10, 11, 12, 249]);
    expect(flagsOf(loaded, 10)).toEqual(before[10]);
    expect(flagsOf(loaded, 11)).toEqual(before[11]);
    expect(flagsOf(loaded, 12)).toEqual(before[12]);
    // VIEW + PRINT are its verbs; the rest went as false and came back false.
    expect(loaded.get(249)?.flags.umCanView).toBe(true);
    expect(loaded.get(249)?.flags.umCanPrint).toBe(true);
    expect(loaded.get(249)?.flags.umCanCreate).toBe(false);
  });

  it("3. revokes one menu, and the confirmation names it", async () => {
    const grants = tickMenu(loaded, node(11), false, loaded);
    const sentence = describeRevocations(grantDiff(loaded, grants), nameOf);
    expect(sentence).toBe("This save removes access to 1 menu: Sales Order. Continue?");

    await save(buildSaveBody({ mode: "edit", usrId, identity, grants }));
    const back = await read(usrId);
    const before10 = flagsOf(loaded, 10);
    loaded = grantsFromPayload(back.menus);
    expect([...loaded.keys()].sort((a, b) => a - b)).toEqual([10, 12, 249]);
    expect(flagsOf(loaded, 10)).toEqual(before10);
  });

  it("4. Post and Cancel granted on a posting menu reach the row", async () => {
    let grants = setFlag(loaded, 12, "umCanPost", true, loaded);
    grants = setFlag(grants, 12, "umCanCancel", true, loaded);
    await save(buildSaveBody({ mode: "edit", usrId, identity, grants }));
    const back = await read(usrId);
    loaded = grantsFromPayload(back.menus);
    expect(loaded.get(12)?.flags.umCanPost).toBe(true);
    expect(loaded.get(12)?.flags.umCanCancel).toBe(true);
    expect(loaded.get(12)?.flags.umCanAmend).toBe(false);
    expect(loaded.get(12)?.flags.umCanRetender).toBe(false);
  });

  it("4b. a save without `menus` leaves the set alone; a bad login name is refused on its field", async () => {
    const sizeBefore = loaded.size;
    await save(buildSaveBody({ mode: "edit", usrId, identity: { ...identity, fullName: "ZT Person" }, grants: null }));
    const back = await read(usrId);
    expect(back.usrFullName).toBe("ZT Person");
    expect(back.menus.length).toBe(sizeBefore);

    const refused = await call("POST", "/user-administration/create", {
      ...buildSaveBody({ mode: "edit", usrId, identity, grants: null }),
      usrIsLocked: false,
    });
    expect(refused.status).toBe(400);
  });

  it("4c. the till PIN: set, kept by a blank save, cleared; SUPERVISOR is a role the DTO takes", async () => {
    const set = await save(
      buildSaveBody({ mode: "edit", usrId, identity: { ...identity, pin: "4321", userType: "SUPERVISOR" }, grants: null }),
    );
    expect(set.usrPinSet).toBe(true);
    expect(set.usrType).toBe("SUPERVISOR");
    expect(set).not.toHaveProperty("usrPin");
    identity = identityFromPayload(set);
    expect(identity.pin).toBe("");

    const kept = await save(buildSaveBody({ mode: "edit", usrId, identity, grants: null }));
    expect(kept.usrPinSet).toBe(true);

    const cleared = await save(buildSaveBody({ mode: "edit", usrId, identity: { ...identity, clearPin: true }, grants: null }));
    expect(cleared.usrPinSet).toBe(false);
    identity = identityFromPayload(cleared);
  });

  it("5. deletes the user, menu rows and all", async () => {
    const { status } = await call("DELETE", `/user-administration/delete?usrId=${usrId}`);
    expect(status).toBeLessThan(300);
    const gone = await call("GET", `/user-administration/get?usrId=${usrId}`);
    expect(gone.status).toBe(404);
    usrId = "";
  });
});
