/**
 * The template definition contract — schemaVersion 1.
 *
 * A hand-maintained mirror of the server's zod schema at
 * `ERP server/src/modules/reporting/templates/dto/template-definition.schema.ts`.
 * These are the schema's OUTPUT types (defaults applied), because that is what
 * `GET /reports/templates/:id` returns: the service parses and migrates before
 * responding, so every defaulted field arrives populated. Modelling the input
 * type instead would litter the canvas with `?? "left"` fallbacks.
 *
 * Drift protection is runtime, not compile time: `lib/vocabulary.ts` reconciles
 * these unions against `GET /reports/templates/schema` and warns in
 * development when the server knows a band type or transform this build does
 * not. `npm run gen:print-vocab` regenerates the vocabulary from the sibling
 * server checkout when one is present.
 */

export const SCHEMA_VERSION = 1;

export type LayoutMode = "GRAPHIC" | "GRID";
export type OutputMode = "PDF" | "ESCPOS" | "ESCP_DOTMATRIX" | "HTML";
export type Orientation = "PORTRAIT" | "LANDSCAPE";

export type BandType =
  | "REPORT_HEADER"
  | "PAGE_HEADER"
  | "GROUP_HEADER"
  | "DETAIL"
  | "GROUP_FOOTER"
  | "SUMMARY"
  | "PAGE_FOOTER"
  | "REPORT_FOOTER"
  | "NO_DATA";

export type ElementKind =
  | "TEXT"
  | "FIELD"
  | "LINE"
  | "RECT"
  | "IMAGE"
  | "BARCODE"
  | "QRCODE"
  | "PAGEBREAK"
  | "CROSSTAB";

export type PrintOn =
  | "ALL_PAGES"
  | "FIRST_PAGE"
  | "LAST_PAGE"
  | "NOT_FIRST_PAGE"
  | "NOT_LAST_PAGE";

export type HorizontalAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";
export type ImageFit = "CONTAIN" | "COVER" | "STRETCH";
export type Cardinality = "one" | "many";
export type AggregateFunction = "sum" | "count" | "avg" | "min" | "max";
export type AggregateScope = "GROUP" | "PAGE" | "REPORT";
export type BarcodeSymbology = "code128" | "ean13" | "ean8" | "upca" | "code39" | "itf14";
export type QrErrorCorrection = "L" | "M" | "Q" | "H";
export type CrosstabSort =
  | "LABEL_ASC"
  | "LABEL_DESC"
  | "VALUE_DESC"
  | "VALUE_ASC"
  | "FIRST_SEEN";
export type CrosstabOverflow = "FOLD" | "CLIP";

export type Margins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type PaperSpec = {
  code: string;
  widthMm: number;
  /** null = continuous stationery (thermal roll, fanfold). */
  heightMm: number | null;
  orientation: Orientation;
  margins: Margins;
  /** GRID mode only: printable character columns. */
  columns?: number;
  /** GRID mode only: lines per page. */
  rows?: number;
};

export type DatasetBinding = {
  name: string;
  /** A registered provider token, e.g. `sales.invoice.lines`. Never SQL. */
  provider: string;
  cardinality: Cardinality;
  params?: Record<string, unknown>;
};

export type FontSpec = {
  family: string;
  /** Points. */
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export type StyleSpec = {
  color?: string;
  fill?: string;
  stroke?: string;
  strokeWidthPt?: number;
  /** Millimetres inside the element box. */
  padding?: number;
};

type ElementBase = {
  id: string;
  /** GRAPHIC: millimetres from the band's top-left. */
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** GRID: character cell position and width. */
  col?: number;
  row?: number;
  cols?: number;
  /** Expression; the element is skipped when it evaluates falsy. */
  visible?: string;
  style?: StyleSpec;
  /** Draw order within the band; higher paints later. */
  z: number;
};

type TextLikeBase = ElementBase & {
  value: string;
  font?: Partial<FontSpec>;
  align: HorizontalAlign;
  vAlign: VerticalAlign;
  wrap: boolean;
  ellipsis: boolean;
  blankWhenZero: boolean;
};

export type TextElement = TextLikeBase & { kind: "TEXT" };

export type FieldAggregate = {
  fn: AggregateFunction;
  scope: AggregateScope;
  dataset?: string;
  /** The RAW numeric expression to accumulate; defaults to `value`. */
  over?: string;
};

export type FieldElement = TextLikeBase & {
  kind: "FIELD";
  aggregate?: FieldAggregate;
};

export type LineElement = ElementBase & {
  kind: "LINE";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  widthPt: number;
  /** GRID mode: the character to repeat. */
  gridChar: string;
};

export type RectElement = ElementBase & {
  kind: "RECT";
  w: number;
  h: number;
  radiusMm: number;
};

export type ImageElement = ElementBase & {
  kind: "IMAGE";
  w: number;
  h: number;
  source: string;
  fit: ImageFit;
};

export type BarcodeElement = ElementBase & {
  kind: "BARCODE";
  w: number;
  h: number;
  symbology: BarcodeSymbology;
  value: string;
  showText: boolean;
};

export type QrcodeElement = ElementBase & {
  kind: "QRCODE";
  /** QR is square; `size` wins over w/h. */
  size: number;
  value: string;
  errorCorrection: QrErrorCorrection;
};

export type PagebreakElement = ElementBase & {
  kind: "PAGEBREAK";
  when?: string;
};

/**
 * A whole pivot table in one element.
 *
 * Unlike everything else on the canvas, its height and its column count come
 * from the DATA, not from the designer: `rowBy`, `columnBy` and `measure` are
 * evaluated once per source row and the engine expands the result into ordinary
 * text and line primitives at layout time. So the canvas can only ever draw a
 * placeholder for it — the real shape is not knowable until a render.
 *
 * Each of the three is the first of a LIST: `extraRowBys` adds label columns
 * down the left edge, `extraColumnBys` adds header rows across the top, and
 * `extraMeasures` splits every column group into one sub-column per measure.
 *
 * `w` is a budget the engine enforces. Columns that will not fit are folded
 * into one trailing column or clipped, per `overflow`.
 */
/**
 * One level of a crosstab's row or column axis, beyond the first.
 *
 * `rowBy`/`columnBy` stay the FIRST level, so a template written before nesting
 * existed parses unchanged and no stored `ptv_body` needs migrating.
 */
export type CrosstabAxis = {
  /** Expression yielding this level's label. */
  expression: string;
  /**
   * Header caption for the column this level prints in.
   *
   * Row axes only: the first row column is captioned by `corner`, and a nested
   * COLUMN level has no fixed caption — its header cells are the data's labels.
   */
  label: string;
  /** Row axes only. 0 = share whatever `rowHeaderWidthMm` leaves. */
  widthMm: number;
};

/**
 * One value column of a crosstab, beyond the first.
 *
 * Each measure keeps its OWN aggregate and number format: a quantity summed as
 * an integer and a value averaged to two decimals cannot share either.
 */
export type CrosstabMeasure = {
  expression: string;
  /** Sub-header caption. Printed only when the crosstab has >1 measure. */
  label: string;
  fn: AggregateFunction;
  format: string;
  blankWhenZero: boolean;
};

export type CrosstabElement = ElementBase & {
  kind: "CROSSTAB";
  w: number;
  /** A MINIMUM; the band grows to the table's real height. */
  h: number;
  /** The repeating dataset the pivot reads — not the band's dataset. */
  dataset: string;
  /** Expression yielding the FIRST row label down the left edge. */
  rowBy: string;
  /** Expression yielding the FIRST column label across the top. */
  columnBy: string;
  /** Expression yielding the number the FIRST measure accumulates. */
  measure: string;
  fn: AggregateFunction;
  /** Number pattern applied to the first measure's cells and totals. */
  format: string;
  blankWhenZero: boolean;
  /**
   * OPTIONAL, all four of them — and they have to be.
   *
   * The designer edits the raw `ptv_body` it was handed, and a template stored
   * before nesting existed simply does not have these keys. The server's zod
   * schema defaults them on save; every reader here treats absent as empty
   * rather than assuming the save has already happened.
   */
  /** Sub-header caption for the first measure; printed only when >1 measure. */
  measureLabel?: string;
  /**
   * Row dimensions AFTER `rowBy`, printed as further label columns down the
   * left edge and grouped left to right: HSN, then description within it.
   */
  extraRowBys?: CrosstabAxis[];
  /**
   * Column dimensions AFTER `columnBy`, printed as further HEADER ROWS: year
   * across the top, month underneath it, one leaf column per combination the
   * data actually contains.
   */
  extraColumnBys?: CrosstabAxis[];
  /** Value columns AFTER `measure`. Every column group repeats all of them. */
  extraMeasures?: CrosstabMeasure[];
  /** The top-left cell, above the row labels. */
  corner: string;
  rowHeaderWidthMm: number;
  /** 0 = share the width left after the row header and totals column. */
  columnWidthMm: number;
  headerHeightMm: number;
  rowHeightMm: number;
  showRowTotals: boolean;
  showColumnTotals: boolean;
  totalsLabel: string;
  rowSort: CrosstabSort;
  columnSort: CrosstabSort;
  maxColumns: number;
  overflow: CrosstabOverflow;
  overflowLabel: string;
  font?: Partial<FontSpec>;
  /** Falls back to `font` with bold on. */
  headerFont?: Partial<FontSpec>;
  gridLines: boolean;
  headerFill?: string;
  /** Reprint the column header on each page the table spills onto. */
  repeatHeader: boolean;
};

export type ReportElement =
  | TextElement
  | FieldElement
  | LineElement
  | RectElement
  | ImageElement
  | BarcodeElement
  | QrcodeElement
  | PagebreakElement
  | CrosstabElement;

export type TextLikeElement = TextElement | FieldElement;

export const isTextLike = (element: ReportElement): element is TextLikeElement =>
  element.kind === "TEXT" || element.kind === "FIELD";

/** Elements whose geometry is a box the designer can resize on both axes. */
export type BoxElement =
  | RectElement
  | ImageElement
  | BarcodeElement
  | CrosstabElement
  | TextLikeElement;

export const isBoxLike = (element: ReportElement): element is BoxElement =>
  element.kind === "TEXT" ||
  element.kind === "FIELD" ||
  element.kind === "RECT" ||
  element.kind === "IMAGE" ||
  element.kind === "BARCODE" ||
  element.kind === "CROSSTAB";

export type Band = {
  type: BandType;
  /** Millimetres in GRAPHIC mode. */
  heightMm: number;
  /** Character lines in GRID mode. */
  heightRows?: number;
  dataset?: string;
  groupBy?: string;
  groupLevel: number;
  printOn: PrintOn;
  autoGrow: boolean;
  keepTogether: boolean;
  keepWithNext: boolean;
  keepWithLastDetail: boolean;
  visible?: string;
  spacingRows: number;
  elements: ReportElement[];
};

export type TemplateDefinition = {
  schemaVersion: number;
  layoutMode: LayoutMode;
  /** Free-form designer metadata; the engine ignores it entirely. */
  meta?: Record<string, unknown>;
  paper: PaperSpec;
  datasets: DatasetBinding[];
  bands: Band[];
};

// ─── API payloads ────────────────────────────────────────────────────────────

export type TemplateSummaryPayload = {
  ptId: string;
  ptCompanyId: string | null;
  ptBranchId: string | null;
  ptDocType: string;
  ptOutputMode: string;
  ptPaperCode: string;
  ptName: string;
  ptVersion: number;
  ptParentId: string | null;
  ptSchemaVer: number;
  ptIsDefault: boolean;
  ptIsActive: boolean;
  /** True when ptCompanyId is null — a shipped design that must be cloned to edit. */
  isSystemTemplate: boolean;
  ptCreatedOn: string;
  ptCreatedBy: string | null;
  ptModifiedOn: string | null;
  ptModifiedBy: string | null;
};

export type TemplatePayload = TemplateSummaryPayload & {
  definition: TemplateDefinition;
  definitionMigrated: boolean;
};

export type TemplateRevisionPayload = {
  ptrId: string;
  ptrTemplateId: string;
  ptrVersion: number;
  ptrSchemaVer: number;
  ptrNote: string | null;
  ptrCreatedOn: string;
  ptrCreatedBy: string | null;
};

export type TemplateExportPayload = {
  kind: "vknex.print-template";
  exportVersion: 1;
  exportedAt: string;
  name: string;
  docType: string;
  outputMode: string;
  paperCode: string;
  schemaVersion: number;
  definition: TemplateDefinition;
};

export type FieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "datetime"
  | "object";

export type FieldMeta = {
  name: string;
  type: FieldType;
  label: string;
  /** Suggested format pattern, e.g. '#,##0.00'. Advisory only. */
  format?: string;
  complexScript?: boolean;
  description?: string;
};

/** One entry of `GET /reports/templates/datasets/catalogue`. */
export type ProviderDescriptor = {
  token: string;
  label: string;
  cardinality: Cardinality;
  /** Document types this provider is meaningful for. Empty = any. */
  docTypes: string[];
  fields: FieldMeta[];
};

/** `GET /reports/templates/schema` — the designer's palette vocabulary. */
export type TemplateSchemaVocabulary = {
  schemaVersion: number;
  layoutModes: LayoutMode[];
  outputModes: OutputMode[];
  bandTypes: BandType[];
  elementKinds: ElementKind[];
  papers: PaperPreset[];
  transforms: string[];
  rootIdentifiers: string[];
  gallery: Array<{
    key: string;
    name: string;
    docType: string;
    outputMode: string;
    paperCode: string;
  }>;
};

export type PaperPreset = {
  code: string;
  label: string;
  widthMm: number;
  /** null = continuous stationery. */
  heightMm: number | null;
  layoutMode: LayoutMode;
  columns?: number;
  rows?: number;
  cpi?: number;
};
