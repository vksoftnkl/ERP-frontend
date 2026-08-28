import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  RUNG_LABEL,
  RUNG_ORDER,
  buildAssignmentMatrix,
  rungLabelOf,
  rungOf,
  rungOfResolvedScope,
  rungOfServerScope,
  scopeIncoherence,
} from "./ladder";
import type { PrintTemplateAssignmentPayload } from "../types/printing";

const here = dirname(fileURLToPath(import.meta.url));

function assignment(
  overrides: Partial<PrintTemplateAssignmentPayload> = {},
): PrintTemplateAssignmentPayload {
  return {
    ptaId: "a1",
    ptaCompanyId: "c1",
    ptaBranchId: null,
    ptaDeviceId: null,
    ptaPurposeId: "p1",
    ptaTemplateId: "t1",
    ptaOutputMode: "PRINT",
    ptaPrinterId: null,
    ptaCopies: null,
    ptaIsActive: true,
    ptaIsDeleted: false,
    ptaCreatedOn: "2026-08-27T00:00:00.000Z",
    ...overrides,
  } as PrintTemplateAssignmentPayload;
}

describe("the rung comes from the scope columns, not from ptaSpecificity", () => {
  it("reads a counter row from its device id", () => {
    expect(rungOf({ ptaCompanyId: "c1", ptaBranchId: "b1", ptaDeviceId: "d1" })).toBe("COUNTER");
  });

  it("reads a branch row from its branch id", () => {
    expect(rungOf({ ptaCompanyId: "c1", ptaBranchId: "b1", ptaDeviceId: null })).toBe("BRANCH");
  });

  it("reads a company row from its company id", () => {
    expect(rungOf({ ptaCompanyId: "c1" })).toBe("COMPANY");
  });

  it("reads the widest rung from a null company — a design shipped for everyone", () => {
    expect(rungOf({ ptaCompanyId: null })).toBe("EVERY_COMPANY");
    expect(rungOf({})).toBe("EVERY_COMPANY");
  });

  it("gives the same answer whatever ptaSpecificity happens to say", () => {
    // The first migration generated 2 for a counter; the correction generates
    // 3. Both rows classify identically here, which is the point — and this is
    // not hypothetical, it is what actually happened on 27-08-2026.
    const applied = assignment({ ptaBranchId: "b1", ptaDeviceId: "d1", ptaSpecificity: 2 });
    const corrected = assignment({ ptaBranchId: "b1", ptaDeviceId: "d1", ptaSpecificity: 3 });

    expect(rungOf(applied)).toBe("COUNTER");
    expect(rungOf(corrected)).toBe("COUNTER");
  });
});

/**
 * The numbering is settled now -- 3 counter, 2 branch, 1 company, 0 every
 * company -- and asserting that decode here would still be the wrong test. It
 * was settled BEFORE too, at 2/1/0, and the correction migration rewrote it
 * under a client that had every reason to believe otherwise. So the durable
 * invariant is the stronger one below -- that the module reads the integer
 * NOWHERE -- and it is checked against the source text, because a behavioural
 * test cannot prove the absence of a decode.
 */
describe("no decode of the integer exists anywhere in this module", () => {
  const source = readFileSync(resolve(here, "ladder.ts"), "utf8");
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments, where the numbering IS discussed
    .replace(/^\s*\/\/.*$/gm, "");

  it("never switches, compares or indexes on ptaSpecificity", () => {
    // Every mention outside a comment must be a pass-through, and there are none.
    expect(code).not.toMatch(/ptaSpecificity\s*(===|!==|>|<|>=|<=)/);
    expect(code).not.toMatch(/switch\s*\(\s*[a-zA-Z.]*ptaSpecificity/);
    expect(code).not.toMatch(/\[\s*[a-zA-Z.]*ptaSpecificity\s*\]/);
  });

  it("has no literal map from a specificity number to a rung name", () => {
    expect(code).not.toMatch(/\b[0-4]\s*:\s*["']?(COUNTER|BRANCH|COMPANY)/);
  });
});

describe("rung ordering", () => {
  it("is narrowest-wins", () => {
    expect(RUNG_ORDER.COUNTER).toBeGreaterThan(RUNG_ORDER.BRANCH);
    expect(RUNG_ORDER.BRANCH).toBeGreaterThan(RUNG_ORDER.COMPANY);
    expect(RUNG_ORDER.COMPANY).toBeGreaterThan(RUNG_ORDER.EVERY_COMPANY);
  });

  it("labels all four rungs", () => {
    expect(RUNG_LABEL.EVERY_COMPANY).toBe("Every company");
    expect(rungLabelOf({ ptaCompanyId: "c1", ptaBranchId: "b1" })).toBe("Branch");
  });
});

describe("the server's decoded scope widens to a rung", () => {
  it("maps each server scope to the matching rung", () => {
    expect(rungOfServerScope("COUNTER")).toBe("COUNTER");
    expect(rungOfServerScope("BRANCH")).toBe("BRANCH");
    expect(rungOfServerScope("COMPANY")).toBe("COMPANY");
  });

  it("maps the server's GLOBAL onto this screen's every-company rung", () => {
    // The two vocabularies differ by one word and mean the same rung. Getting
    // this wrong would label a shipped, inherited design as company-specific.
    expect(rungOfServerScope("GLOBAL")).toBe("EVERY_COMPANY");
  });

  it("reads a list row's ptaScope and a resolution's scope the same way", () => {
    // They are generated from one PTA_SCOPE_BY_SPECIFICITY map on the server.
    expect(rungOfServerScope(assignment({ ptaScope: "GLOBAL" }).ptaScope)).toBe("EVERY_COMPANY");
    expect(rungOfResolvedScope("COUNTER")).toBe(rungOfServerScope("COUNTER"));
  });

  it("agrees with the scope columns for a row that carries both", () => {
    // A row states its rung twice — as three nullable ids, and as the word the
    // database derived. The screen must never show one and act on the other.
    const row = assignment({ ptaCompanyId: null, ptaScope: "GLOBAL" });
    expect(rungOf(row)).toBe(rungOfServerScope(row.ptaScope));
  });
});

describe("scope coherence", () => {
  it("names the missing branch on a counter row", () => {
    expect(scopeIncoherence({ ptaCompanyId: "c1", ptaDeviceId: "d1" })).toMatch(/branch/i);
  });

  it("names the missing company on a branch row", () => {
    expect(scopeIncoherence({ ptaBranchId: "b1" })).toMatch(/company/i);
  });

  it("accepts every legal shape, including the widest rung", () => {
    expect(scopeIncoherence({})).toBeNull();
    expect(scopeIncoherence({ ptaCompanyId: "c1" })).toBeNull();
    expect(scopeIncoherence({ ptaCompanyId: "c1", ptaBranchId: "b1" })).toBeNull();
    expect(
      scopeIncoherence({ ptaCompanyId: "c1", ptaBranchId: "b1", ptaDeviceId: "d1" }),
    ).toBeNull();
  });
});

describe("the section 8 matrix", () => {
  const rows = [
    assignment({ ptaId: "every-company", ptaPurposeId: "p1", ptaCompanyId: null }),
    assignment({ ptaId: "company", ptaPurposeId: "p1" }),
    assignment({ ptaId: "branch", ptaPurposeId: "p1", ptaBranchId: "b1" }),
    assignment({ ptaId: "counter", ptaPurposeId: "p1", ptaBranchId: "b1", ptaDeviceId: "d1" }),
    assignment({ ptaId: "other-branch", ptaPurposeId: "p1", ptaBranchId: "b2" }),
    assignment({ ptaId: "second-purpose", ptaPurposeId: "p2" }),
  ];

  it("places each row in its own rung's column", () => {
    const matrix = buildAssignmentMatrix(rows, { branchId: "b1", deviceId: "d1" });
    const cells = matrix.get("p1");

    expect(cells?.EVERY_COMPANY?.ptaId).toBe("every-company");
    expect(cells?.COMPANY?.ptaId).toBe("company");
    expect(cells?.BRANCH?.ptaId).toBe("branch");
    expect(cells?.COUNTER?.ptaId).toBe("counter");
  });

  it("keeps an inherited every-company row beside the company's own", () => {
    // Both are real and both are shown: the company row beats the inherited
    // one, and the screen exists to make that visible rather than to hide the
    // loser. A row whose company is NULL is never confused for a company row.
    const matrix = buildAssignmentMatrix(rows, { branchId: null, deviceId: null });
    const cells = matrix.get("p1");

    expect(cells?.EVERY_COMPANY?.ptaCompanyId).toBeNull();
    expect(cells?.COMPANY?.ptaCompanyId).toBe("c1");
  });

  it("drops rows belonging to a branch the view is not pointed at", () => {
    const matrix = buildAssignmentMatrix(rows, { branchId: "b1", deviceId: "d1" });

    // "other-branch" is not a blank cell in b1's column; it answers a different
    // question and does not appear.
    expect(
      [...matrix.values()].some((cells) => cells.BRANCH?.ptaId === "other-branch"),
    ).toBe(false);
  });

  it("keeps company rows visible when no branch is selected", () => {
    const matrix = buildAssignmentMatrix(rows, { branchId: null, deviceId: null });

    expect(matrix.get("p1")?.COMPANY?.ptaId).toBe("company");
    expect(matrix.get("p1")?.BRANCH).toBeNull();
    expect(matrix.get("p2")?.COMPANY?.ptaId).toBe("second-purpose");
  });

  it("gives every purpose its own row", () => {
    const matrix = buildAssignmentMatrix(rows, { branchId: "b1", deviceId: "d1" });

    expect([...matrix.keys()].sort()).toEqual(["p1", "p2"]);
  });
});
