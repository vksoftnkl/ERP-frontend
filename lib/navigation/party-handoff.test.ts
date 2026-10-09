import { describe, expect, it } from "vitest";
import { buildPartyHandoffHref, parsePartyHandoff } from "./party-handoff";

const PARTY = "33333333-3333-4333-8333-333333333333";

describe("party hand-off", () => {
  it("round-trips through the URL", () => {
    const href = buildPartyHandoffHref("/accounts/receipt", { partyId: PARTY, partyName: "Sri Krishna Traders & Co" });
    expect(href.startsWith("/accounts/receipt?new=1&")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(parsePartyHandoff(params)).toEqual({ partyId: PARTY, partyName: "Sri Krishna Traders & Co" });
  });

  it("ignores a URL that hands nothing over", () => {
    expect(parsePartyHandoff(new URLSearchParams(`partyId=${PARTY}`))).toBeNull();
    expect(parsePartyHandoff(new URLSearchParams("new=1&partyId=not-a-uuid"))).toBeNull();
    expect(parsePartyHandoff(null)).toBeNull();
  });
});
