/**
 * The hand-written half of the printing contract.
 *
 * Everything the OpenAPI document can say is in `printing.generated.ts` and is
 * re-exported from here, so nothing outside this folder ever imports the
 * generated file directly. What lives here is only what a JSON Schema cannot
 * express:
 *
 *   * `ptvBody` is polymorphic on `ptvEngine` and the document types it as a
 *     bare string (Trap 5).
 *   * `ptvParams` is "an array of objects" and nothing more -- there is no
 *     server-side validation of an element's shape at all (section 9.7), so the
 *     shape below is a client-side reading of it, treated as a lint.
 *   * The list envelope, whose `meta` the document declares but whose success
 *     wrapper the rest of this client already types in `utils/types.ts`.
 *
 * Regenerate the other half with `npm run gen:printing-types`.
 */

export type {
  PrinterSource,
  PrintTemplateAssignmentPayload,
  PrintTemplateAssignmentResolution,
  PrintTemplateDatasetPayload,
  PrintTemplateDeleteResult,
  PrintTemplateListMeta,
  PrintTemplatePayload,
  PrintTemplateVersionPayload,
  PtaOutputMode,
  PtaScope,
  PtdRole,
  PtdSourceKind,
  PtvEngine,
  PtvOrientation,
  PtvStatus,
  SavePrintTemplate,
  SavePrintTemplateAssignment,
  SavePrintTemplateDataset,
  SavePrintTemplateVersion,
  Scope,
} from "./printing.generated";

export {
  PRINTER_SOURCE_VALUES,
  PTA_OUTPUT_MODE_VALUES,
  PTA_SCOPE_VALUES,
  PTD_ROLE_VALUES,
  PTD_SOURCE_KIND_VALUES,
  PTV_ENGINE_VALUES,
  PTV_ORIENTATION_VALUES,
  PTV_STATUS_VALUES,
  SCOPE_VALUES,
} from "./printing.generated";

import type { PtvEngine } from "./printing.generated";

/**
 * Trap 5. `ptv_body` is a text column, so the payload types it as a string --
 * but for JSON_BANDS the server accepts (and a designer holds) a real object,
 * and stringifies it on the way in.
 *
 * Switch on `ptvEngine` to decide which; never guess from the value. A
 * QTRPT_XML body that happens to start with `{` is still a string.
 */
export type PtvBodyInput = Record<string, unknown> | string;

/** The one engine whose body is a JSON object rather than text. */
export const PTV_JSON_ENGINE: PtvEngine = "JSON_BANDS";

/**
 * One USER prompt -- what the operator is asked, ONCE, for the whole render.
 *
 * Declared on the VERSION and nowhere else. It was on the dataset in an earlier
 * draft of the schema and that was wrong: two datasets could declare
 * `from_date` as `DATE required` and as `TEXT optional`, and there is no answer
 * to what the screen should then ask. `plg_params` being one JSONB object per
 * render, not one per dataset, is the corroborating evidence.
 *
 * ANY name may be declared, context names included: the six the render knows
 * about are a DEFAULT for what this array leaves out, not a reserved word list.
 * See `domain/context.ts` -- and note that `company_id` can be declared but
 * never answered.
 */
export type PtvParam = {
  name: string;
  type: PtvParamType;
  required?: boolean;
  label?: string | null;
};

/**
 * The types a prompt may declare.
 *
 * This one list IS hand-written, and it is the exception that proves section
 * 12's rule rather than a breach of it: `ptv_params` has no CHECK beyond
 * "jsonb_typeof = array", so there is no constraint for the API to expose and
 * nothing for the generator to read. The authority is
 * `PTV_PARAM_TYPES` in the server's `print-template.constants.ts`; keep the two
 * in step by hand until a `ptv_params` element schema exists.
 */
export const PTV_PARAM_TYPES = [
  "TEXT",
  "NUMBER",
  "DATE",
  "DATETIME",
  "BOOLEAN",
  "UUID",
] as const;
export type PtvParamType = (typeof PTV_PARAM_TYPES)[number];

/** `ck_ptd_name_shape`, which a prompt name shares -- both name something a query addresses. */
export const PARAM_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * A purpose, as far as this client can see one.
 *
 * `print_purpose` has NO endpoint (section 9.6), so there is no catalogue to
 * read and the twelve shipped rows are not hard-coded here -- section 12
 * forbids exactly that, and for the right reason: the list is open, and a sweet
 * shop that wants a Kitchen Order Ticket adds a row.
 *
 * What the client can honestly know is the purposes something already refers
 * to: every template carries `ptlPurposeId/Code/Name` and every assignment
 * carries `ptaPurposeId/Code/Name`. `domain/purposes.ts` collects those, and the
 * screens say plainly that the list is what is referenced rather than what
 * exists.
 */
export type PrintPurposeRef = {
  ppoId: string;
  ppoCode: string | null;
  ppoName: string | null;
};
