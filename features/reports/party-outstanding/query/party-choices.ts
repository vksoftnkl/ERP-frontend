/**
 * The Party combo's list: the parties THIS report would show with no party
 * picked, A–Z.
 *
 * It reads the report's own `/parties` (sort `name`, the largest page the DTO
 * allows), never a ledger lookup or a dropdown id — the user's rule that every
 * call of this screen goes to `/reports/party-outstanding/*`. So the list
 * follows the strip: Side, Group, Area, Branch, As on and the checkboxes all
 * narrow who is offered, exactly as they narrow the grid.
 *
 * Buckets and Age by never change WHO is listed, so the list asks with the
 * default buckets: a half-typed Buckets field must not empty the combo.
 */
import { isIsoDate } from "@/features/reports/shared/wire/dates";
import type { PartyOutstandingClient } from "../api/party-outstanding";
import {
  DEFAULT_BUCKETS,
  partiesQuery,
  reportFiltersOf,
  reportKey,
  type Filters,
  type ReportFilters,
  type Session,
} from "./params";

export type PartyChoice = { partyId: string; name: string; area: string | null };

/** The DTO's ceiling for `pageSize`. */
export const CHOICE_PAGE_SIZE = 500;
/** Ten pages: past 5,000 parties the combo is the wrong tool, and the server is asked ten times. */
export const CHOICE_MAX_PAGES = 10;

/**
 * The draft's filters, minus the party, as the list asks for them. An As on
 * still being typed falls back to the applied one; a Due-days window the
 * server would refuse (≥ above ≤) is dropped rather than sent.
 */
export function partyChoiceFilters(draft: Omit<ReportFilters, "buckets">, appliedAsOn: string): ReportFilters {
  const window =
    draft.minDueDays !== null && draft.maxDueDays !== null && draft.minDueDays > draft.maxDueDays
      ? { minDueDays: null, maxDueDays: null }
      : {};
  return reportFiltersOf({
    ...draft,
    ...window,
    partyId: null,
    buckets: DEFAULT_BUCKETS,
    asOn: isIsoDate(draft.asOn) ? draft.asOn : appliedAsOn,
  });
}

export function partyChoicesKey(session: Session, f: ReportFilters): string {
  return `${session.companyId}#${reportKey(f)}`;
}

/** Every page, in order, up to `CHOICE_MAX_PAGES`. `truncated` says the cap cut it short. */
export async function loadPartyChoices(
  client: Pick<PartyOutstandingClient, "getParties">,
  session: Session,
  f: ReportFilters,
  signal?: AbortSignal,
): Promise<{ choices: PartyChoice[]; truncated: boolean }> {
  const view: Filters = {
    ...f,
    tab: "parties",
    sort: "name",
    dir: "asc",
    selected: null,
    billSort: "date",
    billDir: "asc",
    dueOn: null,
    groupBy: "GROUP",
    calFrom: null,
    calTo: null,
  };
  const choices: PartyChoice[] = [];
  for (let page = 1; page <= CHOICE_MAX_PAGES; page += 1) {
    const data = await client.getParties(partiesQuery(session, view, page, CHOICE_PAGE_SIZE), signal);
    for (const row of data.rows) choices.push({ partyId: row.partyId, name: row.name, area: row.area });
    const total = data.page.totalRows;
    if (choices.length >= total || data.rows.length === 0) return { choices, truncated: false };
  }
  return { choices, truncated: true };
}
