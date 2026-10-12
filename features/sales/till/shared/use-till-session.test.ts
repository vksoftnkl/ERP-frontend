import { describe, expect, it } from "vitest";
import { createTillSessionStore, type TillSessionRef } from "./session-store";
import { revalidateTillSession } from "./use-till-session";
import type { TillSessionPayload } from "./wire/types";

const SESSION: TillSessionRef = {
  id: "tss-1",
  accYear: "2026-2027",
  sessionNo: "C01-261009-01",
  counterId: "ctr",
  counterCode: "C01",
  status: "OPEN",
  companyId: "co",
  branchId: "br",
};

function memoryStore() {
  const data = new Map<string, string>();
  const store = createTillSessionStore({
    storage: () => ({
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    }),
    currentUserId: () => "u1",
    currentLoginId: () => "sid",
  });
  store.set(SESSION);
  return store;
}

const answer = (status: string) => async () => ({ tssStatus: status }) as unknown as TillSessionPayload;

describe("revalidateTillSession", () => {
  it("keeps a session still taking money, with the server's status", async () => {
    const store = memoryStore();
    const held = await revalidateTillSession({ get: answer("SUSPENDED") }, store);
    expect(held?.status).toBe("SUSPENDED");
  });

  it("drops a session counted or closed elsewhere", async () => {
    for (const status of ["COUNTING", "CLOSED", "PENDING_APPROVAL", "VOIDED"]) {
      const store = memoryStore();
      expect(await revalidateTillSession({ get: answer(status) }, store)).toBeNull();
    }
  });

  it("drops a session the server no longer has, keeps it through a network failure", async () => {
    const gone = memoryStore();
    await revalidateTillSession(
      {
        get: async () => {
          throw { status: 404, data: { message: "Till session tss-1 was not found", errors: [] } };
        },
      },
      gone,
    );
    expect(gone.get()).toBeNull();

    const offline = memoryStore();
    await revalidateTillSession(
      {
        get: async () => {
          throw { status: "FETCH_ERROR", error: "Failed to fetch" };
        },
      },
      offline,
    );
    expect(offline.get()?.id).toBe("tss-1");
  });

  it("asks nothing when nothing is held", async () => {
    const store = memoryStore();
    store.clear();
    let asked = false;
    await revalidateTillSession(
      {
        get: async () => {
          asked = true;
          return {} as TillSessionPayload;
        },
      },
      store,
    );
    expect(asked).toBe(false);
  });
});
