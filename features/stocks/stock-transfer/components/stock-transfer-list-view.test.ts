import { describe, expect, it } from "vitest";
import { rowPolicy } from "./stock-transfer-list-view";

describe("rowPolicy", () => {
  it("godown: a posted or cancelled transfer is neither edited nor deleted", () => {
    expect(rowPolicy("godown", "DRAFT")).toMatchObject({ canEdit: true, canDelete: true });
    expect(rowPolicy("godown", "POSTED")).toMatchObject({ canEdit: false, canDelete: false });
    expect(rowPolicy("godown", "POSTED").reason).toMatch(/Cancel it/);
    expect(rowPolicy("godown", "CANCELLED").reason).toMatch(/reversal/);
  });

  it("branch: only a draft is editable; a despatch is never cancelled", () => {
    expect(rowPolicy("branch", "DRAFT").canEdit).toBe(true);
    expect(rowPolicy("branch", "IN_TRANSIT")).toMatchObject({ canEdit: false, canDelete: false });
    expect(rowPolicy("branch", "IN_TRANSIT").reason).toMatch(/never cancelled/);
    expect(rowPolicy("branch", "RECEIVED").reason).toMatch(/closed/);
  });
});
