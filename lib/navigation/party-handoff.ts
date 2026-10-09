/**
 * "Open a NEW voucher on this party" — a hand-off between two routes.
 *
 * A report (Party-wise Outstanding's Ctrl+R) sends the operator to a fresh
 * receipt or payment with the party already picked. The party travels in the
 * URL, so the two screens stay two routes and the link is one the browser can
 * hold. The receiving page consumes it once and takes the query off the URL,
 * so a reload or Back lands on a plain register.
 *
 * Pure: no React, no network.
 */

export type PartyHandoff = { partyId: string; partyName: string };

const MARKER = "new";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildPartyHandoffHref(route: string, handoff: PartyHandoff): string {
  const query = new URLSearchParams({ [MARKER]: "1", partyId: handoff.partyId, partyName: handoff.partyName });
  return `${route}?${query.toString()}`;
}

/** The party a URL hands over, or null when it hands over none. */
export function parsePartyHandoff(params: Pick<URLSearchParams, "get"> | null | undefined): PartyHandoff | null {
  if (!params || params.get(MARKER) !== "1") return null;
  const partyId = (params.get("partyId") ?? "").trim();
  if (!UUID.test(partyId)) return null;
  return { partyId, partyName: (params.get("partyName") ?? "").trim() };
}
