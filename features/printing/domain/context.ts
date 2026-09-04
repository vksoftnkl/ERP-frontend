/**
 * CONTEXT PARAMETERS -- what the render fills in BY DEFAULT, and nothing more.
 *
 * They used to be a CLOSED SET: six names a template author was forbidden to
 * declare, shown on the Data tab as a read-only note precisely because there
 * was no row anywhere to edit. That is gone. `ptv_params` is now the whole
 * declaration -- an author who wants `:doc_id` answered by the operator rather
 * than taken from the print request puts a row in the prompts table like any
 * other parameter, and the answer wins.
 *
 * What survives is a FALLBACK. A query binding `:company_id` on a revision that
 * declares no such prompt still gets the session's company, so every design
 * written before this change keeps printing, and a declared prompt left blank
 * falls back to the same value rather than binding NULL. That is the only
 * reason this list is still here: the prompts grid uses it to know which
 * `:name` in a query needs no declaration to resolve.
 *
 * Mirrors `PTV_CONTEXT_PARAMS` and `PTV_SERVER_OWNED_PARAMS` in the server's
 * `print-template.constants.ts`; there is no endpoint that exposes either.
 */

export type ContextParam = {
  name: string;
  type: "UUID" | "TEXT";
  what: string;
};

export const CONTEXT_PARAMS: readonly ContextParam[] = [
  { name: "company_id", type: "UUID", what: "The company the render belongs to" },
  { name: "branch_id", type: "UUID", what: "The branch the operator is signed in to" },
  { name: "acc_year", type: "TEXT", what: "The accounting year, e.g. 2026-2027" },
  { name: "doc_id", type: "UUID", what: "The document being printed" },
  { name: "user_id", type: "UUID", what: "Who asked for the print" },
  { name: "device_id", type: "UUID", what: "The counter it is printing at" },
];

const CONTEXT_NAMES = new Set(CONTEXT_PARAMS.map((parameter) => parameter.name));

/**
 * The names whose VALUE stays the server's, however the revision declares them.
 *
 * `company_id` may be put in the prompts table -- nothing refuses it -- but an
 * ANSWER to it is refused by the render endpoint and the authenticated company
 * binds regardless. A render reads a company's documents, so a caller able to
 * name the company is a caller able to read another tenant's data.
 */
export const SERVER_OWNED_PARAMS: readonly string[] = ["company_id"];

const SERVER_OWNED_NAMES = new Set(SERVER_OWNED_PARAMS);

/**
 * True for a name the render supplies when the revision declares no prompt for
 * it -- so a query may bind it with nothing in `ptv_params` at all.
 *
 * Named for what it now MEANS rather than for the old closed set: this is a
 * DEFAULT, and a row in the prompts table overrides it.
 */
export function hasContextDefault(name: string): boolean {
  return CONTEXT_NAMES.has(name.trim().toLowerCase());
}

/** The description of a context name, for the hint shown beside a declared row. */
export function contextParam(name: string): ContextParam | undefined {
  return CONTEXT_PARAMS.find((parameter) => parameter.name === name.trim().toLowerCase());
}

/** True for a name the operator can never answer, only the server. */
export function isServerOwnedParam(name: string): boolean {
  return SERVER_OWNED_NAMES.has(name.trim().toLowerCase());
}
