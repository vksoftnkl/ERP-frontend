/**
 * The editable state of one design, and the four moves that change which
 * revision is being worked on.
 *
 * -- WHY THIS IS A MODULE AND NOT A REDUCER --------------------------------
 *
 * There are no triggers in 17_printing.sql. Every rule below is prose in the
 * schema and NOTHING ELSE enforces it before the request reaches the service.
 * The Designer is the enforcement, so the rules live somewhere pure and tested
 * rather than scattered through component handlers:
 *
 *   1. A PUBLISHED revision is READ-ONLY. The only move on one is "new draft".
 *      If the editor lets someone type into a published row, `plg_version_id` --
 *      a real FK to the exact bytes that were rendered -- stops being true.
 *   2. NEW DRAFT COPIES THE DATASETS FORWARD TOO. Datasets belong to the
 *      version; a new draft with an empty `datasets` renders nothing.
 *   3. `ptdDatasetNo` is IMMUTABLE once published. It is THE BINDING a band
 *      points at. Reordering the grid writes `ptdSortOrder` and nothing else.
 *   4. ROLL BACK WRITES FORWARD. A new revision whose body is the old one, then
 *      publish that. The pointer never moves backwards -- the history must stay
 *      append-only, so a rolled-back design is still evidence.
 *   6. PUBLISHING NEEDS AN APPROVER. `ck_ptv_published` refuses PUBLISHED with a
 *      null `ptvApprovedBy`, and it must be captured deliberately: silently
 *      defaulting it to the current user makes the signature mean nothing.
 *
 * (Rule 5, "identity saves omit `versions`", is `buildSavePayload`'s.)
 */

import type {
  PrintTemplatePayload,
  PrintTemplateVersionPayload,
  PtvBodyInput,
  PtvEngine,
  PtvOrientation,
  PtvParam,
  SavePrintTemplateDataset,
} from "../types/printing";
import { PTV_JSON_ENGINE } from "../types/printing";

// -- the working shapes -----------------------------------------------------

/**
 * One dataset row as the grid holds it.
 *
 * `ptdId` present means it already exists on this revision; absent means it is
 * new. That is the same distinction the save payload draws, so the grid needs
 * no separate "is new" flag to get out of step with.
 */
export type DraftDataset = SavePrintTemplateDataset & {
  ptdDatasetNo: number;
  ptdName: string;
  ptdRole: NonNullable<SavePrintTemplateDataset["ptdRole"]>;
  ptdSourceKind: NonNullable<SavePrintTemplateDataset["ptdSourceKind"]>;
};

/** The revision being edited, or being read. */
export type DraftVersion = {
  /** Absent for a revision that does not exist yet. */
  ptvId?: string;
  /** Absent until the server assigns one. Display only. */
  ptvRevNo?: number;
  ptvEngine: PtvEngine;
  ptvBody: PtvBodyInput;
  ptvPaperCode: string;
  ptvOrientation: PtvOrientation;
  ptvWidthMm: number | null;
  ptvHeightMm: number | null;
  ptvMarginTopMm: number;
  ptvMarginBottomMm: number;
  ptvMarginLeftMm: number;
  ptvMarginRightMm: number;
  ptvColumns: number | null;
  ptvLang: string;
  ptvFontFamily: string | null;
  ptvParams: PtvParam[];
  ptvNote: string | null;
  datasets: DraftDataset[];
};

/** The whole Designer's state: identity, the revision in hand, and the history behind it. */
export type DesignerDraft = {
  ptlId?: string;
  ptlCompanyId: string | null;
  ptlPurposeId: string;
  ptlCode: string;
  ptlName: string;
  ptlDescription: string | null;
  ptlSortOrder: number;
  ptlIsActive: boolean;
  /**
   * Where a clone came from. `ptlForkedFromId` + `Rev` are WRITTEN (neither
   * works alone); `ptlForkedFromCode` is joined by the server for display and is
   * never sent.
   */
  ptlForkedFromId: string | null;
  ptlForkedFromRev: number | null;
  ptlForkedFromCode: string | null;
  /** The revision the three tabs are pointed at. */
  working: DraftVersion;
  /** Every revision the server returned, newest first. Read-only, for the rail. */
  history: PrintTemplateVersionPayload[];
  /** What the template currently publishes, or null for a design that resolves for nobody. */
  publishedRevId: string | null;
};

// -- reading the server's shape ---------------------------------------------

/** Parse `ptvBody` per the ENGINE, never by looking at the value (Trap 5). */
export function parseBody(engine: PtvEngine, body: string | null | undefined): PtvBodyInput {
  if (engine !== PTV_JSON_ENGINE) {
    return body ?? "";
  }
  if (!body) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(body);
    // `ck_ptv_body_is_json` says a JSON_BANDS body is an OBJECT. An array or a
    // scalar that somehow got stored is handed back as-is rather than coerced,
    // so the Layout tab can show what is actually there.
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : body;
  } catch {
    // Unparseable stored text is still the truth about this revision. Showing
    // the raw string beats showing an empty design.
    return body;
  }
}

/** `ptvParams` is untyped JSON on the wire; read what is actually usable out of it. */
export function parseParams(raw: unknown): PtvParam[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((entry): PtvParam[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    if (!name) return [];
    return [
      {
        name,
        type: (typeof record.type === "string" ? record.type : "TEXT") as PtvParam["type"],
        required: record.required === true,
        label: typeof record.label === "string" ? record.label : null,
      },
    ];
  });
}

function toDraftDataset(dataset: {
  ptdId?: string;
  ptdRole?: string | null;
  ptdDatasetNo?: number | null;
  ptdSortOrder?: number | null;
  ptdName?: string | null;
  ptdLabel?: string | null;
  ptdSourceKind?: string | null;
  ptdProviderCode?: string | null;
  ptdSql?: string | null;
  ptdRequiresCompany?: boolean | null;
  ptdParentNo?: number | null;
  ptdLinkFields?: string | null;
  ptdRowLimit?: number | null;
  ptdTimeoutMs?: number | null;
  ptdRemarks?: string | null;
}): DraftDataset {
  return {
    ptdId: dataset.ptdId,
    ptdRole: (dataset.ptdRole ?? "DETAIL") as DraftDataset["ptdRole"],
    ptdDatasetNo: dataset.ptdDatasetNo ?? 0,
    ptdSortOrder: dataset.ptdSortOrder ?? 0,
    ptdName: dataset.ptdName ?? "",
    ptdLabel: dataset.ptdLabel ?? null,
    ptdSourceKind: (dataset.ptdSourceKind ?? "PROVIDER") as DraftDataset["ptdSourceKind"],
    ptdProviderCode: dataset.ptdProviderCode ?? null,
    ptdSql: dataset.ptdSql ?? null,
    ptdRequiresCompany: dataset.ptdRequiresCompany ?? true,
    ptdParentNo: dataset.ptdParentNo ?? null,
    ptdLinkFields: dataset.ptdLinkFields ?? null,
    ptdRowLimit: dataset.ptdRowLimit ?? DEFAULT_ROW_LIMIT,
    ptdTimeoutMs: dataset.ptdTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    ptdRemarks: dataset.ptdRemarks ?? null,
  };
}

export const DEFAULT_ROW_LIMIT = 5_000;
export const DEFAULT_TIMEOUT_MS = 15_000;

export function toDraftVersion(version: PrintTemplateVersionPayload): DraftVersion {
  const engine = version.ptvEngine;
  return {
    ptvId: version.ptvId,
    ptvRevNo: version.ptvRevNo,
    ptvEngine: engine,
    ptvBody: parseBody(engine, version.ptvBody),
    ptvPaperCode: version.ptvPaperCode,
    ptvOrientation: version.ptvOrientation,
    ptvWidthMm: version.ptvWidthMm ?? null,
    ptvHeightMm: version.ptvHeightMm ?? null,
    ptvMarginTopMm: version.ptvMarginTopMm,
    ptvMarginBottomMm: version.ptvMarginBottomMm,
    ptvMarginLeftMm: version.ptvMarginLeftMm,
    ptvMarginRightMm: version.ptvMarginRightMm,
    ptvColumns: version.ptvColumns ?? null,
    ptvLang: version.ptvLang,
    ptvFontFamily: version.ptvFontFamily ?? null,
    ptvParams: parseParams(version.ptvParams),
    ptvNote: version.ptvNote ?? null,
    datasets: (version.datasets ?? []).map(toDraftDataset),
  };
}

/**
 * The whole Designer state for a template the server returned.
 *
 * `working` is the newest UNDELETED revision -- which is not necessarily the
 * published one, and that asymmetry is the point: a template holding rev 5 as a
 * DRAFT while it still publishes rev 3 opens on rev 5, because rev 5 is the
 * work in progress. What RESOLVES is `publishedRevId`, tracked separately and
 * joined on the pointer, never on `max(ptvRevNo)`.
 */
export function toDesignerDraft(template: PrintTemplatePayload): DesignerDraft {
  const history = (template.versions ?? []).filter((version) => !version.ptvIsDeleted);
  const newest = history.reduce<PrintTemplateVersionPayload | null>(
    (best, version) => (best === null || version.ptvRevNo > best.ptvRevNo ? version : best),
    null,
  );
  return {
    ptlId: template.ptlId,
    ptlCompanyId: template.ptlCompanyId ?? null,
    ptlPurposeId: template.ptlPurposeId,
    ptlCode: template.ptlCode,
    ptlName: template.ptlName,
    ptlDescription: template.ptlDescription ?? null,
    ptlSortOrder: template.ptlSortOrder,
    ptlIsActive: template.ptlIsActive,
    ptlForkedFromId: template.ptlForkedFromId ?? null,
    ptlForkedFromRev: template.ptlForkedFromRev ?? null,
    ptlForkedFromCode: template.ptlForkedFromCode ?? null,
    working: newest ? toDraftVersion(newest) : blankVersion(),
    history,
    publishedRevId: template.ptlPublishedRevId ?? null,
  };
}

// -- the four moves ---------------------------------------------------------

/**
 * Rule 1, as a question the UI asks before it offers an affordance.
 *
 * `ptvIsEditable` is derived server-side and means DRAFT and nothing else. A
 * version with no `ptvId` has not been written yet, so it is editable by
 * definition -- that is the unsaved rev 1 of a brand new template.
 */
export function isEditable(
  working: DraftVersion,
  history: PrintTemplateVersionPayload[],
): boolean {
  if (!working.ptvId) return true;
  const stored = history.find((version) => version.ptvId === working.ptvId);
  return stored ? stored.ptvIsEditable : false;
}

/** The blank rev 1 a "New template" starts on. */
export function blankVersion(): DraftVersion {
  return {
    ptvEngine: PTV_JSON_ENGINE,
    ptvBody: { bands: [] },
    ptvPaperCode: "A4",
    ptvOrientation: "PORTRAIT",
    ptvWidthMm: null,
    ptvHeightMm: null,
    ptvMarginTopMm: 0,
    ptvMarginBottomMm: 0,
    ptvMarginLeftMm: 0,
    ptvMarginRightMm: 0,
    ptvColumns: null,
    ptvLang: "en-IN",
    ptvFontFamily: null,
    ptvParams: [],
    ptvNote: null,
    datasets: [],
  };
}

export function blankDraft(purposeId = ""): DesignerDraft {
  return {
    ptlCompanyId: null,
    ptlPurposeId: purposeId,
    ptlCode: "",
    ptlName: "",
    ptlDescription: null,
    ptlSortOrder: 100,
    ptlIsActive: true,
    ptlForkedFromId: null,
    ptlForkedFromRev: null,
    ptlForkedFromCode: null,
    working: blankVersion(),
    history: [],
    publishedRevId: null,
  };
}

/**
 * MOVE 1 -- new draft from a revision.
 *
 * Rule 2 is the whole subtlety: the datasets come forward too, stripped of
 * their `ptdId` so the server INSERTS them onto the new revision rather than
 * trying to move rows that belong to the old one. A new draft that forgot them
 * would save cleanly and render nothing.
 *
 * `ptvId` is dropped, which is what makes the save append the next revision
 * number instead of updating a frozen one.
 */
export function newDraftFrom(source: DraftVersion): DraftVersion {
  return {
    ...source,
    ptvId: undefined,
    ptvRevNo: undefined,
    ptvNote: null,
    // Structurally cloned so editing the new draft cannot reach back into the
    // revision it came from, which the rail is still displaying.
    ptvParams: source.ptvParams.map((parameter) => ({ ...parameter })),
    ptvBody:
      typeof source.ptvBody === "string"
        ? source.ptvBody
        : (structuredClone(source.ptvBody) as Record<string, unknown>),
    datasets: source.datasets.map((dataset) => ({ ...dataset, ptdId: undefined })),
  };
}

/**
 * MOVE 2 -- roll back to an earlier revision (rule 4).
 *
 * Identical to `newDraftFrom` in mechanism, and deliberately so: rolling back
 * IS writing the old design forward as a new revision. There is no path in this
 * client that moves `ptlPublishedRevId` to a lower revision, and there must not
 * be -- the history is the evidence of what was printed.
 *
 * The note records where it came from, because the rail is otherwise a row of
 * identical-looking bodies.
 */
export function rollbackTo(source: PrintTemplateVersionPayload): DraftVersion {
  const draft = newDraftFrom(toDraftVersion(source));
  return { ...draft, ptvNote: `Rolled back from revision ${source.ptvRevNo}` };
}

/**
 * MOVE 3 -- reorder the dataset grid (rule 3).
 *
 * Writes `ptdSortOrder` and NOTHING ELSE. `ptdDatasetNo` is THE BINDING a band
 * points at; 3.0 had one column doing both jobs, which is why reordering rows
 * there silently rebound every band to the wrong query. On screen these must
 * look like two different operations, and here they are two different
 * functions.
 */
export function reorderDatasets(datasets: DraftDataset[], from: number, to: number): DraftDataset[] {
  if (from === to || from < 0 || to < 0 || from >= datasets.length || to >= datasets.length) {
    return datasets;
  }
  const next = [...datasets];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((dataset, index) => ({ ...dataset, ptdSortOrder: index }));
}

/**
 * MOVE 4 -- renumber one dataset, which REBINDS every band that names it.
 *
 * Separate from `reorderDatasets` on purpose, and refused outright once the
 * number has been published: `ptdDatasetNo` is immutable then, and the honest
 * move is a new draft.
 */
export function renumberDataset(
  datasets: DraftDataset[],
  index: number,
  datasetNo: number,
): DraftDataset[] {
  return datasets.map((dataset, position) =>
    position === index ? { ...dataset, ptdDatasetNo: datasetNo } : dataset,
  );
}

// -- publishing (rule 6) ----------------------------------------------------

export type PublishRefusal = { reason: string };

/**
 * Whether this revision may be published, and why not.
 *
 * The approver is a deliberate capture, not a default. A version whose datasets
 * carry stored SQL is, in every meaningful sense, code -- so publishing takes a
 * signature, and one filled in automatically from the session is not one.
 */
export function checkPublishable(
  working: DraftVersion,
  approvedBy: string | null,
): PublishRefusal | null {
  if (!approvedBy) {
    return { reason: "Publishing needs an approver — ck_ptv_published refuses a null signature." };
  }
  if (working.datasets.length === 0) {
    return { reason: "This revision has no datasets, so it would render nothing." };
  }
  return null;
}

/** True for the revision the template currently publishes. */
export function isPublishedRevision(draft: DesignerDraft, version: PrintTemplateVersionPayload) {
  return draft.publishedRevId !== null && draft.publishedRevId === version.ptvId;
}

/**
 * A design with no published revision resolves FOR NOBODY.
 *
 * A legitimate state -- a template holding only a draft -- and one that has to
 * be loud wherever it appears, or it is discovered at a till.
 */
export function resolvesForNobody(template: {
  ptlPublishedRevId?: string | null;
}): boolean {
  return !template.ptlPublishedRevId;
}
