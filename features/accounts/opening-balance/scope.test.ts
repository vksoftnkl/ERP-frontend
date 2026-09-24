import { describe, expect, it } from "vitest";
import { isAccYear, previousAccYear, sameScope, scopeOf, scopeSignature } from "./scope";

describe("previousAccYear", () => {
  it("is arithmetic on the first half, never a date calculation", () => {
    expect(previousAccYear("2026-2027")).toBe("2025-2026");
    expect(previousAccYear("2000-2001")).toBe("1999-2000");
  });

  it("refuses anything ck_op_acc_year would refuse", () => {
    expect(previousAccYear("2026")).toBeNull();
    expect(previousAccYear("2026-2028")).toBeNull();
    expect(previousAccYear("")).toBeNull();
    expect(previousAccYear("FY26-27")).toBeNull();
  });
});

describe("isAccYear", () => {
  it("requires the second half to be the first plus one", () => {
    expect(isAccYear("2026-2027")).toBe(true);
    expect(isAccYear("2026-2026")).toBe(false);
  });
});

describe("scopeOf — a NULL branch is a scope of its own", () => {
  it("sends the branch under 'This branch'", () => {
    expect(scopeOf("branch", "c", "b", "2026-2027").branchId).toBe("b");
  });

  it("sends NULL under 'All branches' — the company-level set, not a merge", () => {
    expect(scopeOf("company", "c", "b", "2026-2027").branchId).toBeNull();
  });

  it("keeps the two apart", () => {
    const branch = scopeOf("branch", "c", "b", "2026-2027");
    const company = scopeOf("company", "c", "b", "2026-2027");
    expect(sameScope(branch, company)).toBe(false);
    expect(scopeSignature(branch)).not.toBe(scopeSignature(company));
  });
});
