/**
 * CONTEXT PARAMETERS -- the closed set a render always knows, and that a
 * template author therefore never declares.
 *
 * They appear in no table, in no payload, and in no form on any screen. The
 * server holds the registry, holds one fixed type for each, and works out which
 * ones a query uses BY READING THE QUERY -- exactly as
 * `ck_ptd_sql_company_scoped` already greps `ptd_sql_norm` for `:company_id`.
 *
 * So this list is not a vocabulary the client sends anywhere. It is a
 * READ-ONLY NOTE, rendered beside the SQL editor, whose entire job is to stop
 * an author declaring `:company_id` as a USER prompt -- which would make the
 * render stop and ask the operator for something it already knows.
 *
 * The list is duplicated from `PTV_CONTEXT_PARAMS` in the server's
 * `print-template.constants.ts` because there is no endpoint that exposes it.
 * It is a closed set "forever" by the schema's own account, so the duplication
 * is cheap; if it ever gains a member, `sqlLint`'s prompt cross-check is what
 * will notice, by reporting the new name as an undeclared parameter.
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

/** True for a name the server supplies, and that must therefore not be a prompt. */
export function isContextParam(name: string): boolean {
  return CONTEXT_NAMES.has(name.trim().toLowerCase());
}
