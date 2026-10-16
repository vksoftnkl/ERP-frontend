import { describe, expect, it } from "vitest";
import { createScreenMemory, isCompleteScope, type ScreenScope } from "./screen-memory";

const SCOPE_A: ScreenScope = { companyId: "co", branchId: "br-a", accYear: "2026-2027" };
const SCOPE_B: ScreenScope = { companyId: "co", branchId: "br-b", accYear: "2026-2027" };

function setup(userId: string | null = "u1", maxEntries?: number) {
  const auth = { userId };
  const memory = createScreenMemory({ currentUserId: () => auth.userId, maxEntries });
  return { auth, memory };
}

describe("screen memory", () => {
  it("hands back the very value it was given", () => {
    const { memory } = setup();
    const draft = { lines: [{ itemId: "i1" }] };
    memory.remember("sales/bill", SCOPE_A, draft);
    expect(memory.recall("sales/bill", SCOPE_A)).toBe(draft);
    expect(memory.has("sales/bill", SCOPE_A)).toBe(true);
  });

  it("recall is read-only — a second call sees the same value", () => {
    const { memory } = setup();
    memory.remember("sales/bill", SCOPE_A, { n: 1 });
    expect(memory.recall("sales/bill", SCOPE_A)).toEqual({ n: 1 });
    expect(memory.recall("sales/bill", SCOPE_A)).toEqual({ n: 1 });
  });

  it("keeps one slot per tenant and never restores across tenants", () => {
    const { memory } = setup();
    memory.remember("sales/bill", SCOPE_A, "bill in A");
    expect(memory.recall("sales/bill", SCOPE_B)).toBeNull();
    memory.remember("sales/bill", SCOPE_B, "bill in B");
    expect(memory.recall("sales/bill", SCOPE_A)).toBe("bill in A");
    expect(memory.recall("sales/bill", SCOPE_B)).toBe("bill in B");
  });

  it("keeps screens apart", () => {
    const { memory } = setup();
    memory.remember("sales/bill", SCOPE_A, "bill");
    expect(memory.recall("sales/quotation", SCOPE_A)).toBeNull();
  });

  it("does not show one user's entry to another", () => {
    const { auth, memory } = setup("u1");
    memory.remember("sales/bill", SCOPE_A, "u1's bill");
    auth.userId = "u2";
    expect(memory.recall("sales/bill", SCOPE_A)).toBeNull();
    expect(memory.has("sales/bill", SCOPE_A)).toBe(false);
  });

  it("drops a write without a user or with an incomplete scope", () => {
    const { auth, memory } = setup(null);
    memory.remember("sales/bill", SCOPE_A, "no user");
    auth.userId = "u1";
    expect(memory.recall("sales/bill", SCOPE_A)).toBeNull();
    const partial = { ...SCOPE_A, branchId: "" };
    memory.remember("sales/bill", partial, "no branch");
    expect(memory.recall("sales/bill", partial)).toBeNull();
  });

  it("forget with a scope drops that tenant only; without one, every tenant", () => {
    const { memory } = setup();
    memory.remember("sales/bill", SCOPE_A, "a");
    memory.remember("sales/bill", SCOPE_B, "b");
    memory.remember("sales/quotation", SCOPE_A, "q");
    memory.forget("sales/bill", SCOPE_A);
    expect(memory.has("sales/bill", SCOPE_A)).toBe(false);
    expect(memory.has("sales/bill", SCOPE_B)).toBe(true);
    memory.forget("sales/bill");
    expect(memory.has("sales/bill", SCOPE_B)).toBe(false);
    expect(memory.has("sales/quotation", SCOPE_A)).toBe(true);
  });

  it("forget with an incomplete scope touches nothing", () => {
    const { memory } = setup();
    memory.remember("sales/bill", SCOPE_A, "a");
    memory.forget("sales/bill", { companyId: "", branchId: "", accYear: "" });
    expect(memory.has("sales/bill", SCOPE_A)).toBe(true);
  });

  it("forgetAll empties it", () => {
    const { memory } = setup();
    memory.remember("sales/bill", SCOPE_A, "a");
    memory.remember("sales/quotation", SCOPE_B, "q");
    memory.forgetAll();
    expect(memory.has("sales/bill", SCOPE_A)).toBe(false);
    expect(memory.has("sales/quotation", SCOPE_B)).toBe(false);
  });

  it("survives a token refresh for the same user, not a logout or another user", () => {
    const { auth, memory } = setup("u1");
    memory.remember("sales/bill", SCOPE_A, "a");
    memory.onAuthChange("u1");
    expect(memory.has("sales/bill", SCOPE_A)).toBe(true);
    memory.onAuthChange(null);
    expect(memory.has("sales/bill", SCOPE_A)).toBe(false);

    memory.remember("sales/bill", SCOPE_A, "a again");
    memory.onAuthChange("u2");
    auth.userId = "u1";
    expect(memory.has("sales/bill", SCOPE_A)).toBe(false);
  });

  it("drops the entry written longest ago past the cap", () => {
    const { memory } = setup("u1", 2);
    memory.remember("one", SCOPE_A, 1);
    memory.remember("two", SCOPE_A, 2);
    memory.remember("one", SCOPE_A, 11); // re-written: now the newest
    memory.remember("three", SCOPE_A, 3);
    expect(memory.has("two", SCOPE_A)).toBe(false);
    expect(memory.recall("one", SCOPE_A)).toBe(11);
    expect(memory.recall("three", SCOPE_A)).toBe(3);
  });

  it("knows a complete scope", () => {
    expect(isCompleteScope(SCOPE_A)).toBe(true);
    expect(isCompleteScope({ ...SCOPE_A, accYear: "" })).toBe(false);
    expect(isCompleteScope(null)).toBe(false);
  });
});
