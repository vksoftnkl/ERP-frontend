/**
 * GENERATED FILE -- DO NOT EDIT.
 *
 * Written by `npm run gen:printing-types` from the server's OpenAPI documents:
 *   /tmp/claude-1000/-home-vk-Dev-erp-ERP-server/0d956f33-4db9-4f24-98d7-b5721952c041/scratchpad/pt.json
 *   /tmp/claude-1000/-home-vk-Dev-erp-ERP-server/0d956f33-4db9-4f24-98d7-b5721952c041/scratchpad/pta.json
 *
 * Everything the print template contract says about itself lives here, so
 * nothing about printing has to be typed by hand and then kept in step. The
 * hand-written layer beside it is `printing.ts`; put additions there.
 */

// -- vocabularies ----------------------------------------------------------
//
// Each one is a CHECK constraint in 17_printing.sql before it is an enum in a
// DTO. There is deliberately no hand-written list of any of these anywhere in
// the client: a sweet shop that wants a Kitchen Order Ticket adds a row, not a
// release.

export const PRINTER_SOURCE_VALUES = ["PROFILE", "NAME", "DEFAULT"] as const;
export type PrinterSource = (typeof PRINTER_SOURCE_VALUES)[number];

export const PTA_OUTPUT_MODE_VALUES = ["PRINT", "PREVIEW", "PDF", "EMAIL", "WHATSAPP", "ESCPOS"] as const;
export type PtaOutputMode = (typeof PTA_OUTPUT_MODE_VALUES)[number];

export const PTA_SCOPE_VALUES = ["GLOBAL", "COMPANY", "BRANCH", "COUNTER"] as const;
export type PtaScope = (typeof PTA_SCOPE_VALUES)[number];

export const PTD_ROLE_VALUES = ["MASTER", "DETAIL"] as const;
export type PtdRole = (typeof PTD_ROLE_VALUES)[number];

export const PTD_SOURCE_KIND_VALUES = ["PROVIDER", "SQL"] as const;
export type PtdSourceKind = (typeof PTD_SOURCE_KIND_VALUES)[number];

export const PTV_ENGINE_VALUES = ["JSON_BANDS", "HTML_CSS", "QTRPT_XML", "ESCPOS_TEXT", "RAW"] as const;
export type PtvEngine = (typeof PTV_ENGINE_VALUES)[number];

export const PTV_ORIENTATION_VALUES = ["PORTRAIT", "LANDSCAPE"] as const;
export type PtvOrientation = (typeof PTV_ORIENTATION_VALUES)[number];

export const PTV_STATUS_VALUES = ["DRAFT", "PUBLISHED", "RETIRED"] as const;
export type PtvStatus = (typeof PTV_STATUS_VALUES)[number];

export const SCOPE_VALUES = ["GLOBAL", "COMPANY", "BRANCH", "COUNTER"] as const;
export type Scope = (typeof SCOPE_VALUES)[number];

// -- payloads --------------------------------------------------------------

/** Print Template -- `SavePrintTemplateDatasetDto` */
export interface SavePrintTemplateDataset {
  /** Present = update this dataset row, absent = insert a new one */
  ptdId?: string;
  /** MASTER: the header context, one row read, and it must be ptdDatasetNo 0. DETAIL: a repeating band. */
  ptdRole?: PtdRole;
  /** THE BINDING — what a band actually points at, unique within the version. The MASTER is always 0. Changing it rebinds every band that names it. */
  ptdDatasetNo?: number;
  /** Display order in the designer. Binds nothing — safe to reorder. */
  ptdSortOrder?: number;
  /** The same binding by name. Lower snake case, starting with a letter. */
  ptdName?: string;
  ptdLabel?: string | null;
  /** PROVIDER for anything needing joins across partitioned tables or real business logic; SQL for everything else, so a new report costs no release. Exactly one of ptdProviderCode / ptdSql goes with it. */
  ptdSourceKind?: PtdSourceKind;
  /** Required when ptdSourceKind is PROVIDER, and forbidden otherwise */
  ptdProviderCode?: string | null;
  /** Required when ptdSourceKind is SQL, and forbidden otherwise. Parameters are BOUND — write :company_id, never ':company_id'. Eleven authoring guards run on it; they are a lint, not the security boundary. */
  ptdSql?: string | null;
  /** false only for genuinely global data, such as a state-code list. Leaving it true is what stops one company seeing another's numbers. */
  ptdRequiresCompany?: boolean;
  /** Nested detail: this dataset's rows are the children of the current row of the dataset with this number. Goes with ptdLinkFields; neither works alone. */
  ptdParentNo?: number | null;
  /** parent=child pairs, comma separated, no spaces. LEFT is a column the PARENT dataset returns, RIGHT is one THIS dataset returns — both output columns, neither a parameter. */
  ptdLinkFields?: string | null;
  /** Measures the WHOLE band — a child query runs once per render, not per parent row */
  ptdRowLimit?: number;
  ptdTimeoutMs?: number;
  ptdRemarks?: string | null;
  ptdCreatedBy?: string | null;
  ptdModifiedBy?: string | null;
}

/** Print Template -- `SavePrintTemplateVersionDto` */
export interface SavePrintTemplateVersion {
  /** Present = update this version, absent = add a new revision. Only a DRAFT may be updated. */
  ptvId?: string;
  /** Omit it and the next number for this template is assigned. Dense, unique per template and never reused — the history is append-only. */
  ptvRevNo?: number;
  /** DRAFT is editable and nothing else is. PUBLISHED needs an approver and moves the template's published pointer to this revision. RETIRED takes it out of service. */
  ptvStatus?: PtvStatus;
  /** What ptvBody IS. Without this column, changing engines is a flag day. */
  ptvEngine?: PtvEngine;
  /** The design. Send a JSON object for JSON_BANDS — it is stored as text — or a string for the text and markup engines. */
  ptvBody?: string;
  ptvSchemaVer?: number;
  ptvPaperCode?: string;
  ptvOrientation?: PtvOrientation;
  /** Greater than 0, or null to take the width from the paper */
  ptvWidthMm?: number | null;
  ptvHeightMm?: number | null;
  ptvMarginTopMm?: number;
  ptvMarginBottomMm?: number;
  ptvMarginLeftMm?: number;
  ptvMarginRightMm?: number;
  /** Characters per line for the text engines. Meaningless for a page one — send null. */
  ptvColumns?: number | null;
  /** The DEFAULT, not a resolution key — a render may override it. Language must never fork a template. */
  ptvLang?: string;
  ptvFontFamily?: string | null;
  /** What the OPERATOR is asked, ONCE, for the whole render. Context parameters — :company_id, :branch_id, :acc_year, :doc_id, :user_id, :device_id — are NEVER declared here; the server holds them and finds which a query uses by reading it. */
  ptvParams?: Record<string, unknown>[] | null;
  ptvNote?: string | null;
  /** Required to publish. A version whose datasets carry stored SQL is, in every meaningful sense, code — so publishing takes a signature. ptvApprovedOn is stamped by the server. */
  ptvApprovedBy?: string | null;
  /** Soft delete this revision. Omitting a version from the array does NOT delete it — the history is append-only, so removal is an explicit act. Refused for a PUBLISHED revision and for the one the template currently points at. */
  ptvIsDeleted?: boolean;
  ptvCreatedBy?: string | null;
  ptvModifiedBy?: string | null;
  /** The queries that feed this revision. An array that is PRESENT replaces the set: rows carrying ptdId are updated, rows without one are inserted, and rows already on the version but missing from the array are soft deleted. Omit the key to leave the datasets alone — "datasets": [] means "delete every one of them", which is not the same thing. */
  datasets?: SavePrintTemplateDataset[];
}

/** Print Template -- `SavePrintTemplateDto` */
export interface SavePrintTemplate {
  /** Present = update the existing template, absent = create one */
  ptlId?: string;
  /** NULL = shipped with the product, visible to every company. The only scope column here — branch, device and "is default" are RESOLUTION questions and live on the assignment. */
  ptlCompanyId?: string | null;
  /** print_purpose.ppo_id — WHAT this design prints. Required on create. */
  ptlPurposeId?: string;
  /** Letters, digits, underscore and hyphen. Unique per owner, case-insensitively — a shipped code and a company's own copy of it coexist, which is what forking means. */
  ptlCode?: string;
  ptlName?: string;
  ptlDescription?: string | null;
  /** The revision a render actually uses. Usually left alone: setting a version's ptvStatus to PUBLISHED moves this pointer for you. Sent explicitly, it must name a PUBLISHED, undeleted version OF THIS TEMPLATE — a rule fk_ptl_published_rev does not itself enforce. */
  ptlPublishedRevId?: string | null;
  /** Where a clone came from. Goes with ptlForkedFromRev; neither works alone. */
  ptlForkedFromId?: string | null;
  ptlForkedFromRev?: number | null;
  /** Order in the "print in format" list */
  ptlSortOrder?: number;
  ptlIsActive?: boolean;
  ptlCreatedBy?: string | null;
  ptlModifiedBy?: string | null;
  /** The revisions. Rows carrying ptvId update that revision — a DRAFT only — and rows without one are appended as the next revision. A revision MISSING from the array is left alone: the history is append-only, so deleting one is an explicit ptvIsDeleted: true. */
  versions?: SavePrintTemplateVersion[];
}

/** Print Template -- `PrintTemplateDatasetPayloadDto` */
export interface PrintTemplateDatasetPayload {
  ptdId: string;
  ptdVersionId: string;
  ptdRole: PtdRole;
  /** THE BINDING. The master is always 0. */
  ptdDatasetNo: number;
  /** Display order only. Binds nothing. */
  ptdSortOrder: number;
  ptdName: string;
  ptdLabel?: string | null;
  ptdSourceKind: PtdSourceKind;
  ptdProviderCode?: string | null;
  ptdSql?: string | null;
  /** Read-only, computed by the database: comments stripped, literals and quoted identifiers replaced by tokens, casts flattened, lowercased. Every SQL guard reads THIS, not ptdSql, so it is what to look at when a guard refuses a query that looks fine. */
  ptdSqlNorm?: string | null;
  ptdRequiresCompany: boolean;
  ptdParentNo?: number | null;
  ptdLinkFields?: string | null;
  ptdRowLimit: number;
  ptdTimeoutMs: number;
  ptdRemarks?: string | null;
  ptdIsDeleted: boolean;
  ptdSyncDate?: string | null;
  ptdCreatedOn: string;
  ptdCreatedBy?: string | null;
  ptdModifiedOn?: string | null;
  ptdModifiedBy?: string | null;
}

/** Print Template -- `PrintTemplateVersionPayloadDto` */
export interface PrintTemplateVersionPayload {
  ptvId: string;
  ptvTemplateId: string;
  ptvRevNo: number;
  ptvStatus: PtvStatus;
  ptvEngine: PtvEngine;
  /** The design. Text — a JSON object for JSON_BANDS. */
  ptvBody: string;
  ptvSchemaVer: number;
  ptvPaperCode: string;
  ptvOrientation: PtvOrientation;
  ptvWidthMm?: number | null;
  ptvHeightMm?: number | null;
  ptvMarginTopMm: number;
  ptvMarginBottomMm: number;
  ptvMarginLeftMm: number;
  ptvMarginRightMm: number;
  ptvColumns?: number | null;
  ptvLang: string;
  ptvFontFamily?: string | null;
  /** What the operator is asked, once, for the whole render */
  ptvParams?: Record<string, unknown>[] | null;
  ptvNote?: string | null;
  ptvApprovedOn?: string | null;
  ptvApprovedBy?: string | null;
  ptvIsDeleted: boolean;
  ptvSyncDate?: string | null;
  ptvCreatedOn: string;
  ptvCreatedBy?: string | null;
  ptvModifiedOn?: string | null;
  ptvModifiedBy?: string | null;
  /** Derived: is this the revision the template currently publishes? */
  ptvIsPublishedRev: boolean;
  /** Derived: DRAFT and nothing else. A published version is never UPDATEd. */
  ptvIsEditable: boolean;
  datasets: PrintTemplateDatasetPayload[];
}

/** Print Template -- `PrintTemplatePayloadDto` */
export interface PrintTemplatePayload {
  ptlId: string;
  /** NULL = shipped with the product */
  ptlCompanyId?: string | null;
  ptlCompanyName?: string | null;
  ptlPurposeId: string;
  ptlPurposeCode?: string | null;
  ptlPurposeName?: string | null;
  ptlCode: string;
  ptlName: string;
  ptlDescription?: string | null;
  ptlPublishedRevId?: string | null;
  ptlPublishedRevNo?: number | null;
  ptlForkedFromId?: string | null;
  ptlForkedFromCode?: string | null;
  ptlForkedFromRev?: number | null;
  ptlSortOrder: number;
  /** Read-only, generated: the owner with NULL folded to the nil uuid */
  ptlCompanyKey?: string | null;
  ptlIsActive: boolean;
  ptlIsDeleted: boolean;
  ptlSyncDate?: string | null;
  ptlCreatedOn: string;
  ptlCreatedBy?: string | null;
  ptlModifiedOn?: string | null;
  ptlModifiedBy?: string | null;
  /** Newest revision first */
  versions: PrintTemplateVersionPayload[];
}

/** Print Template -- `PrintTemplateSuccessSingleDto` */
export interface PrintTemplateSuccessSingle {
  success: boolean;
  message: string;
  data: PrintTemplatePayload;
}

/** Print Template -- `PrintTemplateListMetaDto` */
export interface PrintTemplateListMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

/** Print Template -- `PrintTemplateSuccessListDto` */
export interface PrintTemplateSuccessList {
  success: boolean;
  message: string;
  data: PrintTemplatePayload[];
  meta: PrintTemplateListMeta;
}

/** Print Template -- `PrintTemplateDeleteResultDto` */
export interface PrintTemplateDeleteResult {
  ptlId: string;
  deleted: boolean;
}

/** Print Template -- `PrintTemplateSuccessDeleteDto` */
export interface PrintTemplateSuccessDelete {
  success: boolean;
  message: string;
  data: PrintTemplateDeleteResult;
}

/** Print Template Assignments -- `SavePrintTemplateAssignmentDto` */
export interface SavePrintTemplateAssignment {
  /** When provided, the request updates the existing assignment */
  ptaId?: string;
  /** NULL = EVERY COMPANY, the widest rung of the ladder. A global assignment may only name a shipped design. On create the field must be PRESENT — send null deliberately; omitting it is rejected, because "every company" is not something to arrive at by accident. */
  ptaCompanyId?: string | null;
  /** NULL = every branch. Required when ptaDeviceId is given. */
  ptaBranchId?: string | null;
  /** NULL = every counter. A counter row must also name its branch. */
  ptaDeviceId?: string | null;
  ptaPurposeId: string;
  ptaTemplateId: string;
  ptaOutputMode?: PtaOutputMode;
  /** A registered printer profile. NULL = the server's default queue for the device. Cannot be combined with ptaPrinterName. */
  ptaPrinterId?: string | null;
  /** A bare queue or share name, for a scope whose printer nobody has registered as a profile. A FALLBACK, never a copy of a profile name — a render through it asserts nothing about paper, codepage or column count. Cannot be combined with ptaPrinterId. */
  ptaPrinterName?: string | null;
  /** Overrides the purpose's copy count for this scope. NULL = use it. */
  ptaCopies?: number | null;
  ptaRemarks?: string | null;
  ptaIsActive?: boolean;
  ptaCreatedBy?: string | null;
  ptaModifiedBy?: string | null;
}

/** Print Template Assignments -- `PrintTemplateAssignmentPayloadDto` */
export interface PrintTemplateAssignmentPayload {
  ptaId: string;
  /** NULL = every company — the widest rung, and shipped designs only */
  ptaCompanyId?: string | null;
  ptaCompanyName?: string | null;
  /** NULL = every branch */
  ptaBranchId?: string | null;
  ptaBranchName?: string | null;
  /** NULL = every counter */
  ptaDeviceId?: string | null;
  ptaDeviceName?: string | null;
  ptaPurposeId: string;
  ptaPurposeCode?: string | null;
  ptaPurposeName?: string | null;
  ptaTemplateId: string;
  ptaTemplateCode?: string | null;
  ptaTemplateName?: string | null;
  /** The template's owner, the nil uuid meaning shipped with the product. Derived from the template, never accepted from the caller. */
  ptaTemplateCompanyKey: string;
  /** ptaTemplateCompanyKey is the nil uuid */
  ptaTemplateIsShipped: boolean;
  ptaOutputMode: PtaOutputMode;
  ptaPrinterId?: string | null;
  /** The bare queue name column — a fallback for a scope with no registered profile. Never set alongside ptaPrinterId. */
  ptaPrinterName?: string | null;
  /** The registered profile's name, joined. NULL whenever ptaPrinterId is NULL. */
  ptaPrinterProfileName?: string | null;
  ptaCopies?: number | null;
  /** Derived in the database, never written: 3 counter, 2 branch, 1 company, 0 every company */
  ptaSpecificity?: number | null;
  /** ptaSpecificity as a word */
  ptaScope: PtaScope;
  ptaRemarks?: string | null;
  ptaIsActive: boolean;
  ptaIsDeleted: boolean;
  ptaSyncDate?: string | null;
  ptaCreatedOn: string;
  ptaCreatedBy?: string | null;
  ptaModifiedOn?: string | null;
  ptaModifiedBy?: string | null;
}

/** Print Template Assignments -- `PrintTemplateAssignmentSuccessSingleDto` */
export interface PrintTemplateAssignmentSuccessSingle {
  success: boolean;
  message: string;
  data: PrintTemplateAssignmentPayload;
}

/** Print Template Assignments -- `PrintTemplateAssignmentSuccessCreateDto` */
export interface PrintTemplateAssignmentSuccessCreate {
  success: boolean;
  message: string;
  data: PrintTemplateAssignmentPayload;
}

/** Print Template Assignments -- `PrintTemplateAssignmentListDataDto` */
export interface PrintTemplateAssignmentListData {
  items: PrintTemplateAssignmentPayload[];
  page: number;
  limit: number;
  total: number;
}

/** Print Template Assignments -- `PrintTemplateAssignmentSuccessListDto` */
export interface PrintTemplateAssignmentSuccessList {
  success: boolean;
  message: string;
  data: PrintTemplateAssignmentListData;
}

/** Print Template Assignments -- `PrintTemplateAssignmentResolutionDto` */
export interface PrintTemplateAssignmentResolution {
  ptaId: string;
  ptaSpecificity?: number | null;
  scope: Scope;
  ptaTemplateId: string;
  ptaTemplateCode?: string | null;
  ptaTemplateName?: string | null;
  /** The winning design ships with the product */
  ptaTemplateIsShipped: boolean;
  /** NULL means the template has no published revision and cannot render */
  publishedRevId?: string | null;
  ptaPrinterId?: string | null;
  /** One name for the render path: the registered profile's when ptaPrinterId is set, the bare fallback otherwise, NULL when the server's default queue applies. */
  ptaPrinterName?: string | null;
  /** PROFILE — paper, codepage and columns are known and can be asserted. NAME — a bare queue, so none of that is known. DEFAULT — the counter default. */
  printerSource: PrinterSource;
  ptaOutputMode: PtaOutputMode;
  /** Assignment override, else the purpose count */
  copies: number;
  copyLabels: string[];
}

/** Print Template Assignments -- `PrintTemplateAssignmentSuccessResolveDto` */
export interface PrintTemplateAssignmentSuccessResolve {
  success: boolean;
  message: string;
  data: PrintTemplateAssignmentResolution;
}

/** Print Template Assignments -- `PrintTemplateAssignmentDeleteResultDto` */
export interface PrintTemplateAssignmentDeleteResult {
  ptaId: string;
  deleted: boolean;
}

/** Print Template Assignments -- `PrintTemplateAssignmentSuccessDeleteDto` */
export interface PrintTemplateAssignmentSuccessDelete {
  success: boolean;
  message: string;
  data: PrintTemplateAssignmentDeleteResult;
}

