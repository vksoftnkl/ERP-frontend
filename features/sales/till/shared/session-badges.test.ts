import { describe, expect, it } from "vitest";
import { isSessionBadgeColumn, sessionBadgeBucket } from "./session-badges";

describe("sessionBadgeBucket", () => {
  it("colours the session status", () => {
    expect(sessionBadgeBucket("CLOSED")).toBe("success");
    expect(sessionBadgeBucket("OPEN")).toBe("progress");
    expect(sessionBadgeBucket("Suspended")).toBe("neutral");
    expect(sessionBadgeBucket("PENDING_APPROVAL")).toBe("warning");
    expect(sessionBadgeBucket("pending approval")).toBe("warning");
  });

  it("gives every treatment its own hue", () => {
    expect(sessionBadgeBucket("WITHIN TOL.")).toBe("success");
    expect(sessionBadgeBucket("WITHIN_TOLERANCE")).toBe("success");
    expect(sessionBadgeBucket("PENDING")).toBe("warning");
    expect(sessionBadgeBucket("EXPENSE")).toBe("progress");
    expect(sessionBadgeBucket("SUSPENSE")).toBe("locked");
    expect(sessionBadgeBucket("RECOVER")).toBe("danger");
    expect(sessionBadgeBucket("RETENDERED")).toBe("neutral");
  });

  it("reads the notes 114 cash column", () => {
    expect(sessionBadgeBucket("TO APPROVE")).toBe("warning");
    expect(sessionBadgeBucket("TO_APPROVE")).toBe("warning");
    expect(sessionBadgeBucket("APPROVED")).toBe("success");
    expect(sessionBadgeBucket("DIFFERENCE")).toBe("danger");
  });

  it("knows nothing of blanks and strangers", () => {
    expect(sessionBadgeBucket("")).toBeNull();
    expect(sessionBadgeBucket(null)).toBeNull();
    expect(sessionBadgeBucket("SOMETHING ELSE")).toBeNull();
  });
});

describe("isSessionBadgeColumn", () => {
  it("names the three pill columns", () => {
    expect(isSessionBadgeColumn("cash_receipt")).toBe(true);
    expect(isSessionBadgeColumn("treatment")).toBe(true);
    expect(isSessionBadgeColumn("status_text")).toBe(true);
    expect(isSessionBadgeColumn("cash_variance")).toBe(false);
  });
});
