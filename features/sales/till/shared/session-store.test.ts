import { describe, expect, it } from "vitest";
import { TILL_SESSION_STORAGE_KEY, createTillSessionStore, type TillSessionRef } from "./session-store";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const SESSION: TillSessionRef = {
  id: "tss-1",
  accYear: "2026-2027",
  sessionNo: "C01-261009-01",
  counterId: "ctr-1",
  counterCode: "C01",
  status: "OPEN",
  companyId: "co",
  branchId: "br",
};

function setup(user: { id: string | null; login: string | null }) {
  const storage = fakeStorage();
  const auth = { ...user };
  const make = () =>
    createTillSessionStore({
      storage: () => storage,
      currentUserId: () => auth.id,
      currentLoginId: () => auth.login,
    });
  return { storage, auth, make };
}

describe("till session store", () => {
  it("holds the session, notifies, and survives a reload of the tab", () => {
    const { make } = setup({ id: "u1", login: "sid-1" });
    const store = make();
    let calls = 0;
    store.subscribe(() => (calls += 1));
    expect(store.get()).toBeNull();
    store.set(SESSION);
    expect(store.get()).toEqual(SESSION);
    expect(calls).toBe(1);
    // A reload: a fresh module over the same sessionStorage.
    expect(make().get()).toEqual(SESSION);
  });

  it("keeps the same snapshot until something changes", () => {
    const { make } = setup({ id: "u1", login: "sid-1" });
    const store = make();
    store.set(SESSION);
    expect(store.get()).toBe(store.get());
  });

  it("patches the status only of the session it holds", () => {
    const { make } = setup({ id: "u1", login: "sid-1" });
    const store = make();
    store.set(SESSION);
    store.patchStatus("other", "COUNTING");
    expect(store.get()?.status).toBe("OPEN");
    store.patchStatus("tss-1", "COUNTING");
    expect(store.get()?.status).toBe("COUNTING");
  });

  it("clears by id only when that is the one held", () => {
    const { make, storage } = setup({ id: "u1", login: "sid-1" });
    const store = make();
    store.set(SESSION);
    store.clear("other");
    expect(store.get()).not.toBeNull();
    store.clear("tss-1");
    expect(store.get()).toBeNull();
    expect(storage.data.has(TILL_SESSION_STORAGE_KEY)).toBe(false);
  });

  it("drops it on logout and for another user", () => {
    const { make } = setup({ id: "u1", login: "sid-1" });
    const store = make();
    store.set(SESSION);
    store.onAuthChange("u1");
    expect(store.get()).not.toBeNull();
    store.onAuthChange(null);
    expect(store.get()).toBeNull();
  });

  it("drops a session left from an earlier login of the same user", () => {
    const { make, auth } = setup({ id: "u1", login: "sid-1" });
    make().set(SESSION);
    auth.login = "sid-2"; // logged out and in again while this module slept
    expect(make().get()).toBeNull();
  });

  it("holds nothing while nobody is signed in", () => {
    const { make, auth } = setup({ id: "u1", login: "sid-1" });
    make().set(SESSION);
    auth.id = null;
    expect(make().get()).toBeNull();
  });

  it("ignores a corrupt stored value", () => {
    const { make, storage } = setup({ id: "u1", login: "sid-1" });
    storage.setItem(TILL_SESSION_STORAGE_KEY, "{not json");
    expect(make().get()).toBeNull();
  });
});
