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
  {
    name: "company_id",
    type: "UUID",
    what: "The company the render belongs to",
  },
  {
    name: "branch_id",
    type: "UUID",
    what: "The branch the operator is signed in to",
  },
  {
    name: "acc_year",
    type: "TEXT",
    what: "The accounting year, e.g. 2026-2027",
  },
  { name: "doc_id", type: "UUID", what: "The document being printed" },
  { name: "user_id", type: "UUID", what: "Who asked for the print" },
  { name: "device_id", type: "UUID", what: "The counter it is printing at" },
];

const CONTEXT_NAMES = new Set(
  CONTEXT_PARAMS.map((parameter) => parameter.name),
);

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
  return CONTEXT_PARAMS.find(
    (parameter) => parameter.name === name.trim().toLowerCase(),
  );
}

/** True for a name the operator can never answer, only the server. */
export function isServerOwnedParam(name: string): boolean {
  return SERVER_OWNED_NAMES.has(name.trim().toLowerCase());
}

/**
 * A `:name` a query binds that is almost certainly a CONTEXT name misspelt.
 *
 * This exists because of a trap the prompts grid used to walk authors into. A
 * query binding `:comp_id` is reported as "bound but declared nowhere", and the
 * obvious way out — declaring it — produces a prompt that NOTHING can answer: a
 * document print sends the document and nothing else, so a required custom
 * prompt fails the render outright ("'X' is required by this revision and was
 * not answered") and an optional one binds NULL and matches no row. The fix is
 * always in the QUERY: bind the context name, which the render fills by itself.
 *
 * Deliberately conservative — a name is listed only where there is one obvious
 * reading. `:from_date` is a real prompt and is not here.
 */
const CONTEXT_ALIASES: Readonly<Record<string, string>> = {
  // The company. Its VALUE is the session's whatever a revision declares.
  comp_id: "company_id",
  compid: "company_id",
  comp_uuid: "company_id",
  company: "company_id",
  companyid: "company_id",
  // The document being printed. Every voucher screen prints ONE, and the
  // renderer knows which — a per-document name spells that binding wrong.
  doc: "doc_id",
  docid: "doc_id",
  document_id: "doc_id",
  quote_id: "doc_id",
  quotation_id: "doc_id",
  sale_id: "doc_id",
  sales_id: "doc_id",
  bill_id: "doc_id",
  invoice_id: "doc_id",
  order_id: "doc_id",
  receipt_id: "doc_id",
  challan_id: "doc_id",
  sq_id: "doc_id",
  sb_id: "doc_id",
  so_id: "doc_id",
  // The accounting year — a partition key on every transaction table.
  accyear: "acc_year",
  acc_yr: "acc_year",
  year: "acc_year",
  fin_year: "acc_year",
  financial_year: "acc_year",
  // The rest of the session.
  branch: "branch_id",
  branchid: "branch_id",
  br_id: "branch_id",
  user: "user_id",
  userid: "user_id",
  usr_id: "user_id",
  device: "device_id",
  deviceid: "device_id",
  counter_id: "device_id",
  terminal_id: "device_id",
};

/**
 * The context name this one is probably meant to be, or `undefined`.
 *
 * A context name maps to itself only in the sense that it is not an alias: pass
 * one in and this answers `undefined`, because there is nothing to suggest.
 */
export function suggestContextParam(name: string): string | undefined {
  const key = name.trim().toLowerCase();
  if (CONTEXT_NAMES.has(key)) return undefined;
  return CONTEXT_ALIASES[key];
}
