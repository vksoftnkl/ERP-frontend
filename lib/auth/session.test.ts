import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The rule this file exists for: **a token refresh must not cost the session
 * its user block.**
 *
 * `setAuthSession` is called from three places — login (with the user block)
 * and the two refresh paths (without it, historically). It writes the persisted
 * copy a reload rehydrates from, so blanking the block there made a signed-in
 * SUPER ADMIN typeless from the next refresh onward, and the loss survived the
 * reload. Nothing read `userType` until "Save as Default Template" did, which
 * is how it stayed invisible.
 */
type SessionModule = typeof import("./session");

const SUPER_ADMIN = {
  userName: "vijay",
  userType: "SUPER ADMIN",
  tokenType: "Bearer",
  deviceId: null,
  deviceName: null,
  devCompanyId: null,
  devBranchId: null,
  devUserId: null,
  deviceType: null,
};

// The module keeps in-memory copies beside the storage, so each case gets a
// fresh import over a fresh fake storage.
async function loadSession(): Promise<SessionModule> {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  vi.stubGlobal("window", {
    sessionStorage: storage,
    localStorage: storage,
    dispatchEvent: () => true,
    crypto: globalThis.crypto,
  });
  vi.resetModules();
  return import("./session");
}

describe("setAuthSession", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the user block when a refresh does not report one", async () => {
    const session = await loadSession();
    session.setAuthSession("token-1", "user-1", "refresh-1", SUPER_ADMIN);

    // The refresh paths call it with three arguments.
    session.setAuthSession("token-2", "user-1", "refresh-2");

    expect(session.getUserInfo()?.userType).toBe("SUPER ADMIN");
    expect(session.getAuthSession()).toBe("token-2");
  });

  it("keeps it when the response parses to an all-null block", async () => {
    const session = await loadSession();
    session.setAuthSession("token-1", "user-1", "refresh-1", SUPER_ADMIN);

    session.setAuthSession("token-2", "user-1", "refresh-2", session.extractUserInfo({}));

    expect(session.getUserInfo()?.userType).toBe("SUPER ADMIN");
  });

  it("replaces it when a new sign-in reports one", async () => {
    const session = await loadSession();
    session.setAuthSession("token-1", "user-1", "refresh-1", SUPER_ADMIN);

    session.setAuthSession("token-2", "user-2", "refresh-2", {
      ...SUPER_ADMIN,
      userName: "ravi",
      userType: "USER",
    });

    expect(session.getUserInfo()?.userType).toBe("USER");
  });

  it("drops it on sign-out", async () => {
    const session = await loadSession();
    session.setAuthSession("token-1", "user-1", "refresh-1", SUPER_ADMIN);

    session.clearAuthSession();

    expect(session.getUserInfo()).toBeNull();
  });
});

describe("canEditTemplates", () => {
  it("admits SUPER ADMIN only, whatever the casing or padding", async () => {
    const session = await loadSession();
    expect(session.canEditTemplates(SUPER_ADMIN)).toBe(true);
    expect(session.canEditTemplates({ ...SUPER_ADMIN, userType: " super admin " })).toBe(true);
    expect(session.canEditTemplates({ ...SUPER_ADMIN, userType: "ADMIN" })).toBe(false);
    expect(session.canEditTemplates({ ...SUPER_ADMIN, userType: null })).toBe(false);
    expect(session.canEditTemplates(null)).toBe(false);
  });
});
