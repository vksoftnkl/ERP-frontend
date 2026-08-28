/**
 * The one call: `POST /api/v1/print-templates/create`, which creates AND
 * updates, and carries all three tables in one body.
 *
 * Every trap in the contract is a line in this file. They are collected here,
 * rather than spread through the Designer's handlers, because five of the six
 * are SILENT when you get them wrong -- the request succeeds and something else
 * is true afterwards.
 *
 *   TRAP 1  `"datasets": []` DELETES every dataset on that revision. Omitting
 *           the key leaves them alone. These are not the same thing, and the
 *           difference is one line here.
 *   TRAP 2  A version MISSING from `versions[]` is left alone, never deleted.
 *           The history is append-only; removal is an explicit
 *           `ptvIsDeleted: true`, which the server refuses for a PUBLISHED
 *           revision and for the one the template points at.
 *   TRAP 3  NEVER send `ptlPublishedRevId` TO MOVE THE POINTER. Publishing is
 *           `ptvStatus: "PUBLISHED"` plus `ptvApprovedBy` ON THE VERSION, and
 *           the server moves it. The one exception is a server defect that
 *           NULLS the pointer on every non-publishing update -- see
 *           `IdentityOptions`, which echoes it back and can never move it.
 *   TRAP 4  IDENTITY-ONLY SAVES MUST OMIT `versions` ENTIRELY. `print_template`
 *           has NO `ptl_row_version`, so a rename that round-trips the whole
 *           draft can revert a publish and nothing detects the lost update.
 *   TRAP 5  `ptvBody` is polymorphic on `ptvEngine` -- JSON for JSON_BANDS,
 *           text for HTML_CSS / QTRPT_XML / ESCPOS_TEXT / RAW -- and which one
 *           it is comes from the ENGINE, never from what the value looks like.
 *           The plan says an OBJECT may be sent for JSON_BANDS; verified against
 *           the running API, it may not. See `bodyForWire`.
 *   TRAP 6  Only a DRAFT may be updated. A `ptvId` naming a PUBLISHED revision
 *           is refused, so `ptvId` is only ever emitted for a revision the
 *           caller has established is editable.
 */

import type {
  PtvBodyInput,
  PtvEngine,
  PtvParam,
  SavePrintTemplate,
  SavePrintTemplateDataset,
  SavePrintTemplateVersion,
} from "../types/printing";
import { PTV_JSON_ENGINE } from "../types/printing";
import type { DesignerDraft, DraftDataset, DraftVersion } from "./draft";

/**
 * TRAP 5. The body as the wire wants it: ALWAYS A STRING, encoded per the
 * ENGINE.
 *
 * The plan and the DTO both say an object may be sent for JSON_BANDS -- the DTO
 * even carries a `toBodyText` transform to stringify one. IT DOES NOT WORK, and
 * this was verified against the running API on 27-08-2026:
 *
 *   POST /print-templates/create with "ptvBody": {"bands":[]}
 *   -> 400  versions[0].ptvBody: ptvBody must be a JSON object when ptvEngine
 *           is JSON_BANDS -- it did not parse as JSON
 *
 * The cause is the global `ValidationPipe`'s `enableImplicitConversion: true`
 * (main.ts): `ptvBody` is DECLARED `string`, so class-transformer coerces the
 * object to `"[object Object]"` on the way in, before `toBodyText` ever runs.
 * The same request with the body pre-stringified succeeds.
 *
 * So the client stringifies. The distinction the trap is really about survives
 * intact and is still the thing to get right: WHICH encoding is chosen is
 * decided by `ptvEngine` and never by what the value looks like. A QTRPT_XML
 * body that happens to start with `{` is passed through as the text it is; a
 * JSON_BANDS body is JSON-encoded.
 *
 * A JSON_BANDS body held as a STRING is passed through rather than
 * double-encoded: that is the unparseable stored text `draft.parseBody` hands
 * back raw, and re-encoding it would turn a broken design into a quoted string
 * that parses -- silently replacing the author's bad JSON with valid JSON that
 * means nothing.
 *
 * The two branches below happen to agree today. They are written out anyway
 * because they are different operations and only one of them is wrong: if the
 * server is fixed to accept an object, the JSON branch stops stringifying and
 * the text branch does not change at all.
 */
export function bodyForWire(engine: PtvEngine, body: PtvBodyInput): string {
  if (engine === PTV_JSON_ENGINE) {
    // Already text -- an unparseable design being shown raw. Do not re-encode.
    return typeof body === "string" ? body : JSON.stringify(body);
  }
  // The text and markup engines. A non-string here means the engine was
  // switched away from JSON_BANDS while an object body was in hand; encoding it
  // keeps the bytes rather than sending "[object Object]", and the author can
  // see what happened and rewrite it.
  return typeof body === "string" ? body : JSON.stringify(body);
}

/** A dataset row, as the wire wants it. `ptdSqlNorm` is GENERATED and writing it raises 428C9. */
function datasetForWire(dataset: DraftDataset): SavePrintTemplateDataset {
  const isSql = dataset.ptdSourceKind === "SQL";
  return {
    // TRAP 6's sibling: present updates that row, absent inserts a new one.
    ...(dataset.ptdId ? { ptdId: dataset.ptdId } : {}),
    ptdRole: dataset.ptdRole,
    ptdDatasetNo: dataset.ptdDatasetNo,
    ptdSortOrder: dataset.ptdSortOrder ?? 0,
    ptdName: dataset.ptdName,
    ptdLabel: dataset.ptdLabel ?? null,
    ptdSourceKind: dataset.ptdSourceKind,
    // Exactly one of the two, and the other explicitly null: the server refuses
    // a PROVIDER row carrying SQL, and leaving a stale value behind is how a
    // row that used to be SQL keeps its query after being switched.
    ptdProviderCode: isSql ? null : (dataset.ptdProviderCode ?? null),
    ptdSql: isSql ? (dataset.ptdSql ?? null) : null,
    ptdRequiresCompany: dataset.ptdRequiresCompany ?? true,
    ptdParentNo: dataset.ptdParentNo ?? null,
    ptdLinkFields: dataset.ptdLinkFields ?? null,
    ptdRowLimit: dataset.ptdRowLimit,
    ptdTimeoutMs: dataset.ptdTimeoutMs,
    ptdRemarks: dataset.ptdRemarks ?? null,
  };
}

/** `ptvParams` -- the USER prompts, declared once on the version. */
function paramsForWire(params: PtvParam[]): Record<string, unknown>[] {
  return params.map((parameter) => ({
    name: parameter.name,
    type: parameter.type,
    required: parameter.required === true,
    ...(parameter.label ? { label: parameter.label } : {}),
  }));
}

export type VersionIntent =
  /** Save the working revision as it stands. */
  | { kind: "SAVE" }
  /** Save it AND publish it. Needs an approver -- see `draft.checkPublishable`. */
  | { kind: "PUBLISH"; approvedBy: string }
  /** Take it out of service without deleting it. */
  | { kind: "RETIRE" };

export type VersionOptions = {
  intent?: VersionIntent;
  /**
   * TRAP 1. `true` sends `datasets`, replacing the revision's set; `false`
   * OMITS THE KEY, leaving them alone. Default true, because the Designer holds
   * the whole set and a save from it means "this is the set". Pass false for a
   * save that only touched the page setup.
   */
  includeDatasets?: boolean;
};

/**
 * One entry of `versions[]`.
 *
 * TRAP 6 lives in the caller, not here: `ptvId` is emitted whenever the draft
 * carries one, and it is `draft.isEditable` that decides whether the Designer
 * ever hands this function a draft with a published `ptvId`. Dropping the id
 * silently here would turn "you cannot edit that" into "here is a surprise new
 * revision", which is worse than the refusal.
 */
export function buildVersionPayload(
  working: DraftVersion,
  options: VersionOptions = {},
): SavePrintTemplateVersion {
  const { intent = { kind: "SAVE" }, includeDatasets = true } = options;

  const payload: SavePrintTemplateVersion = {
    ...(working.ptvId ? { ptvId: working.ptvId } : {}),
    ptvEngine: working.ptvEngine,
    ptvBody: bodyForWire(working.ptvEngine, working.ptvBody),
    ptvPaperCode: working.ptvPaperCode,
    ptvOrientation: working.ptvOrientation,
    ptvWidthMm: working.ptvWidthMm,
    ptvHeightMm: working.ptvHeightMm,
    ptvMarginTopMm: working.ptvMarginTopMm,
    ptvMarginBottomMm: working.ptvMarginBottomMm,
    ptvMarginLeftMm: working.ptvMarginLeftMm,
    ptvMarginRightMm: working.ptvMarginRightMm,
    ptvColumns: working.ptvColumns,
    ptvLang: working.ptvLang,
    ptvFontFamily: working.ptvFontFamily,
    ptvParams: paramsForWire(working.ptvParams),
    ptvNote: working.ptvNote,
  };

  if (intent.kind === "PUBLISH") {
    // TRAP 3: this pair is the ENTIRE publish gesture. The pointer moves
    // server-side; `ptlPublishedRevId` is never sent from here.
    payload.ptvStatus = "PUBLISHED";
    payload.ptvApprovedBy = intent.approvedBy;
  } else if (intent.kind === "RETIRE") {
    payload.ptvStatus = "RETIRED";
  } else if (!working.ptvId) {
    // A revision being created is explicitly a DRAFT. The server defaults to
    // this, but saying so keeps the request readable in a network log.
    payload.ptvStatus = "DRAFT";
  }

  // TRAP 1. Present replaces the set; absent leaves it alone. `[]` is a real
  // instruction -- "delete every one" -- and reaches the wire when the Designer
  // genuinely holds no datasets.
  if (includeDatasets) {
    payload.datasets = working.datasets.map(datasetForWire);
  }

  return payload;
}

/**
 * -- SERVER DEFECT, AND THE ONE THING THIS MODULE DOES ABOUT IT ------------
 *
 * `POST /print-templates/create` claims "on update only the keys present in the
 * body are written". IT DOES NOT BEHAVE THAT WAY. Verified against the running
 * API on 27-08-2026, `{"ptlId": "...", "ptlName": "renamed"}` alone:
 *
 *   ptl_description        "keep me"  ->  NULL
 *   ptl_is_active          false      ->  true
 *   ptl_company_id         <a company>->  NULL      <-- CROSS-TENANT
 *   ptl_published_rev_id   <rev 1>    ->  NULL      <-- UNPUBLISHES IT
 *
 * The cause is that the service asks `hasOwnProperty(dto, key)` to decide
 * whether a key was sent, and the DTO is a class-transformer INSTANCE. With the
 * server's `target: ES2022`, `useDefineForClassFields` is on, so every declared
 * field exists as an own property holding `undefined` -- and the check is
 * therefore always true. Fields that fall back to the existing row survive;
 * those that fall back to a default (`?? null`, `?? true`) are overwritten.
 *
 * THE CONSEQUENCE IS NOT COSMETIC. Renaming a live design, or starting a new
 * draft on one, silently UNPUBLISHES it: the revision stays PUBLISHED, the
 * pointer goes null, and the design resolves for nobody. Every counter using it
 * stops printing, and nothing anywhere says so.
 *
 * TWO OF THOSE ARE SERIOUS. A null `ptl_company_id` means "shipped with the
 * product, visible to EVERY company" -- so a rename hands one tenant's private
 * design to all of them. A null `ptl_published_rev_id` unpublishes a live
 * design: the revision stays PUBLISHED, the pointer goes, and every counter
 * using it stops printing with nothing said.
 *
 * `ptlCompanyId`, `ptlDescription` and `ptlIsActive` are covered for free,
 * because every payload below sends the WHOLE identity rather than a diff. That
 * is not incidental -- it is why `identityPayload` has no "only what changed"
 * mode, and it must not grow one while this defect stands.
 *
 * The pointer is not, and covering it means sending `ptlPublishedRevId` --
 * which is exactly what TRAP 3 forbids. So it is NOT done silently and NOT done
 * by default: `preservePublishedRevId` is opt-in, is refused whenever the same
 * request publishes (the server rejects both together, correctly, as two ways
 * of moving one pointer), and only ever echoes back the pointer the server
 * itself just reported. When the server is fixed, delete the option and its
 * call sites; nothing else changes.
 */
export type IdentityOptions = {
  /** Echo the current published pointer back, to stop the server nulling it. */
  preservePublishedRevId?: boolean;
};

/** The `ptl*` half, which every save carries. */
function identityPayload(draft: DesignerDraft, options: IdentityOptions = {}): SavePrintTemplate {
  return {
    ...(draft.ptlId ? { ptlId: draft.ptlId } : {}),
    ptlCompanyId: draft.ptlCompanyId,
    ptlPurposeId: draft.ptlPurposeId,
    ptlCode: draft.ptlCode,
    ptlName: draft.ptlName,
    ptlDescription: draft.ptlDescription,
    ptlSortOrder: draft.ptlSortOrder,
    ptlIsActive: draft.ptlIsActive,
    // Where a clone came from. The two go together -- neither works alone -- and
    // `ptlForkedFromCode` is joined for display and is never sent.
    ptlForkedFromId: draft.ptlForkedFromId,
    ptlForkedFromRev: draft.ptlForkedFromRev,
    // TRAP 3. The ONLY way this key is ever emitted, and only to defend a
    // pointer that already exists -- never to move one. Moving it is
    // `ptvStatus: "PUBLISHED"` on the version, and always will be.
    ...(options.preservePublishedRevId && draft.publishedRevId
      ? { ptlPublishedRevId: draft.publishedRevId }
      : {}),
  };
}

/**
 * TRAP 4 -- THE IDENTITY-ONLY SAVE.
 *
 * A rename, a re-sort, an activate/deactivate. `versions` is OMITTED
 * ENTIRELY, not sent empty and not sent unchanged.
 *
 * The reason is that `print_template` has no `ptl_row_version`. Round-trip the
 * whole draft to change a name and you will, sooner or later, post a stale
 * `ptvStatus: "DRAFT"` over a revision somebody published thirty seconds ago --
 * and nothing anywhere will detect the lost update. Omitting the key makes that
 * class of bug unreachable rather than unlikely.
 */
export function buildIdentitySavePayload(
  draft: DesignerDraft,
  options: IdentityOptions = {},
): SavePrintTemplate {
  return identityPayload(draft, options);
}

export type SaveOptions = VersionOptions &
  IdentityOptions & {
  /**
   * TRAP 2, as an explicit act. Revisions to soft delete, by id. A revision
   * simply missing from `versions[]` is LEFT ALONE -- the history is
   * append-only -- so removal has to be asked for. The server refuses it for a
   * PUBLISHED revision and for the one the template currently points at.
   */
  deleteVersionIds?: string[];
};

/**
 * The full save: identity plus the working revision.
 *
 * Only ONE version is ever sent. `versions[]` accepts up to twenty, but the
 * Designer edits one revision at a time by construction, and a save that
 * carried the whole history back would re-post frozen rows the server would
 * (rightly) refuse.
 */
export function buildSavePayload(
  draft: DesignerDraft,
  options: SaveOptions = {},
): SavePrintTemplate {
  const { deleteVersionIds = [], preservePublishedRevId, ...versionOptions } = options;

  const versions: SavePrintTemplateVersion[] = [
    buildVersionPayload(draft.working, versionOptions),
  ];

  for (const ptvId of deleteVersionIds) {
    // Nothing but the id and the flag: this is a removal, not an edit, and
    // sending a body with it would be an edit to a row that may be frozen.
    versions.push({ ptvId, ptvIsDeleted: true });
  }

  return {
    ...identityPayload(draft, {
      // The server refuses `ptlPublishedRevId` and a PUBLISHED revision in one
      // request -- rightly, they are two ways of moving one pointer -- and a
      // publish moves the pointer anyway, so there is nothing to defend.
      preservePublishedRevId:
        preservePublishedRevId && versionOptions.intent?.kind !== "PUBLISH",
    }),
    versions,
  };
}

/**
 * Publish an EXISTING revision without touching its content.
 *
 * The rail's "publish" on a revision that is already saved. It carries the
 * `ptvId`, the status and the signature and nothing else -- a revision being
 * published is not yet frozen, so this is accepted, but re-posting its body
 * would be a pointless rewrite of bytes `plg_version_id` is about to point at.
 */
export function buildPublishPayload(
  draft: DesignerDraft,
  ptvId: string,
  approvedBy: string,
): SavePrintTemplate {
  return {
    // No `preservePublishedRevId` here, ever: this request MOVES the pointer,
    // and the server refuses both ways of doing that in one call.
    ...identityPayload(draft),
    versions: [{ ptvId, ptvStatus: "PUBLISHED", ptvApprovedBy: approvedBy }],
  };
}
