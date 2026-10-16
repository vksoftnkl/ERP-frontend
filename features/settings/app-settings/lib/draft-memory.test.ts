import { describe, expect, it } from "vitest";
import { hasPendingDrafts } from "./draft-memory";

describe("screen memory", () => {
  it("keeps the edits only while a layer holds one", () => {
    expect(hasPendingDrafts({ draftsByScope: {} })).toBe(false);
    // Discard (or a save) leaves a layer empty, or drops it.
    expect(hasPendingDrafts({ draftsByScope: { "COMPANY:c1": {} } })).toBe(false);
    expect(
      hasPendingDrafts({ draftsByScope: { "COMPANY:c1": { "sales.default_price_level": "2" } } }),
    ).toBe(true);
    // An edit on a layer the bar has moved away from still counts.
    expect(
      hasPendingDrafts({
        draftsByScope: { "COMPANY:c1": {}, "BRANCH:b1": { "sales.round_off": "true" } },
      }),
    ).toBe(true);
  });
});
