import { describe, expect, it } from "vitest";
import type { Scope } from "../opening-balance.types";
import { initialDraft } from "./draft";
import { isOpeningWorthRemembering, listAnswerAction, type OpeningMemory } from "./memory";

const SCOPE: Scope = { companyId: "comp-1", branchId: "branch-1", accYear: "2026-2027" };
const TENANT = { companyId: "comp-1", branchId: "branch-1", accYear: "2026-2027" };

function memoryOf(dirty: boolean): OpeningMemory {
  return { mode: "branch", draft: { ...initialDraft(SCOPE), dirty }, tenant: TENANT };
}

describe("which opening set is worth bringing back", () => {
  it("keeps a set with unsaved changes, not a clean one", () => {
    expect(isOpeningWorthRemembering(memoryOf(true))).toBe(true);
    expect(isOpeningWorthRemembering(memoryOf(false))).toBe(false);
  });
});

describe("what a /list answer does to the set on screen", () => {
  const answer = { opCompanyId: "comp-1" };

  it("applies a new answer for this scope", () => {
    expect(listAnswerAction({ payload: answer, seeded: null, forThisScope: true, keepRestored: false })).toBe(
      "load",
    );
  });

  it("ignores no answer, the answer already taken, and one for another scope", () => {
    expect(listAnswerAction({ payload: undefined, seeded: null, forThisScope: true, keepRestored: false })).toBe(
      "ignore",
    );
    expect(listAnswerAction({ payload: answer, seeded: answer, forThisScope: true, keepRestored: false })).toBe(
      "ignore",
    );
    expect(listAnswerAction({ payload: answer, seeded: null, forThisScope: false, keepRestored: true })).toBe(
      "ignore",
    );
  });

  it("takes the first answer for a restored dirty set without repainting it", () => {
    expect(listAnswerAction({ payload: answer, seeded: null, forThisScope: true, keepRestored: true })).toBe(
      "keep-restored",
    );
  });

  it("applies the next new answer once the restored set has met its first", () => {
    const fresher = { opCompanyId: "comp-1" };
    expect(listAnswerAction({ payload: fresher, seeded: answer, forThisScope: true, keepRestored: false })).toBe(
      "load",
    );
  });
});
