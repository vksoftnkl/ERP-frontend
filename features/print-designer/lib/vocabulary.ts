/**
 * The designer's palette vocabulary.
 *
 * These arrays exist so the toolbar, the band picker and the property panel can
 * render before `GET /reports/templates/schema` resolves. The server's answer is
 * still authoritative: `reconcileVocabulary` compares the two and warns in
 * development, because a band type the server accepts but the palette omits is
 * a feature nobody can reach, and one the palette offers but the server rejects
 * is a save that fails at the last step.
 */

import type {
  BandType,
  ElementKind,
  LayoutMode,
  OutputMode,
  PaperPreset,
  PrintOn,
  TemplateSchemaVocabulary,
} from "@/features/print-designer/types/template-definition";

export const LAYOUT_MODES: readonly LayoutMode[] = ["GRAPHIC", "GRID"];

export const OUTPUT_MODES: readonly OutputMode[] = ["PDF", "ESCPOS", "ESCP_DOTMATRIX", "HTML"];

export const BAND_TYPES: readonly BandType[] = [
  "REPORT_HEADER",
  "PAGE_HEADER",
  "GROUP_HEADER",
  "DETAIL",
  "GROUP_FOOTER",
  "SUMMARY",
  "PAGE_FOOTER",
  "REPORT_FOOTER",
  "NO_DATA",
];

export const BAND_LABELS: Readonly<Record<BandType, string>> = {
  REPORT_HEADER: "Report header",
  PAGE_HEADER: "Page header",
  GROUP_HEADER: "Group header",
  DETAIL: "Detail",
  GROUP_FOOTER: "Group footer",
  SUMMARY: "Summary",
  PAGE_FOOTER: "Page footer",
  REPORT_FOOTER: "Report footer",
  NO_DATA: "No data",
};

/** Bands that repeat per row and therefore require a `many` dataset. */
export const ROW_BANDS: readonly BandType[] = ["DETAIL", "GROUP_HEADER", "GROUP_FOOTER"];

/** Bands the definition allows at most one of. */
export const SINGLETON_BANDS: readonly BandType[] = [
  "REPORT_HEADER",
  "PAGE_HEADER",
  "PAGE_FOOTER",
  "SUMMARY",
  "REPORT_FOOTER",
  "NO_DATA",
];

export const GROUPED_BANDS: readonly BandType[] = ["GROUP_HEADER", "GROUP_FOOTER"];

export const ELEMENT_KINDS: readonly ElementKind[] = [
  "TEXT",
  "FIELD",
  "LINE",
  "RECT",
  "IMAGE",
  "BARCODE",
  "QRCODE",
  "PAGEBREAK",
];

export const ELEMENT_LABELS: Readonly<Record<ElementKind, string>> = {
  TEXT: "Text",
  FIELD: "Field",
  LINE: "Line",
  RECT: "Rectangle",
  IMAGE: "Image",
  BARCODE: "Barcode",
  QRCODE: "QR code",
  PAGEBREAK: "Page break",
};

export const PRINT_ON_VALUES: readonly PrintOn[] = [
  "ALL_PAGES",
  "FIRST_PAGE",
  "LAST_PAGE",
  "NOT_FIRST_PAGE",
  "NOT_LAST_PAGE",
];

export const BARCODE_SYMBOLOGIES = [
  "code128",
  "ean13",
  "ean8",
  "upca",
  "code39",
  "itf14",
] as const;

/**
 * Faces the server's font registry ships. Not free text: a family the registry
 * does not know falls back at render time, so the invoice a customer approved
 * on screen prints in a different face.
 */
export const FONT_FAMILIES = ["NotoSans", "NotoSansMono", "NotoSerif"] as const;

/** Point sizes worth a one-click choice; the input still accepts any value. */
export const FONT_SIZE_PRESETS = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 24, 32] as const;

export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/**
 * Mirror of the server's PAPER_PRESETS. Replaced wholesale by the schema
 * response once it arrives; kept here so the paper setup wizard is not empty on
 * first paint.
 */
export const PAPER_PRESETS: readonly PaperPreset[] = [
  { code: "A4", label: "A4 210 x 297 mm", widthMm: 210, heightMm: 297, layoutMode: "GRAPHIC" },
  { code: "A5", label: "A5 148 x 210 mm", widthMm: 148, heightMm: 210, layoutMode: "GRAPHIC" },
  { code: "A6", label: "A6 105 x 148 mm", widthMm: 105, heightMm: 148, layoutMode: "GRAPHIC" },
  {
    code: "LETTER",
    label: "Letter 216 x 279 mm",
    widthMm: 215.9,
    heightMm: 279.4,
    layoutMode: "GRAPHIC",
  },
  {
    code: "T58",
    label: "Thermal 58 mm roll",
    widthMm: 58,
    heightMm: null,
    layoutMode: "GRID",
    columns: 32,
  },
  {
    code: "T80",
    label: "Thermal 80 mm roll",
    widthMm: 80,
    heightMm: null,
    layoutMode: "GRID",
    columns: 48,
  },
  {
    code: "DM80",
    label: "Dot matrix 80 col (10 CPI)",
    widthMm: 241.3,
    heightMm: 279.4,
    layoutMode: "GRID",
    columns: 80,
    rows: 66,
    cpi: 10,
  },
  {
    code: "DM96",
    label: "Dot matrix 96 col (12 CPI)",
    widthMm: 241.3,
    heightMm: 279.4,
    layoutMode: "GRID",
    columns: 96,
    rows: 66,
    cpi: 12,
  },
  {
    code: "DM132",
    label: "Dot matrix 132 col (10 CPI, 15in)",
    widthMm: 377,
    heightMm: 279.4,
    layoutMode: "GRID",
    columns: 132,
    rows: 66,
    cpi: 10,
  },
  {
    code: "DM137",
    label: "Dot matrix 137 col (15 CPI condensed)",
    widthMm: 241.3,
    heightMm: 279.4,
    layoutMode: "GRID",
    columns: 137,
    rows: 66,
    cpi: 15,
  },
];

export const findPaperPreset = (
  code: string,
  presets: readonly PaperPreset[] = PAPER_PRESETS,
): PaperPreset | undefined =>
  presets.find((preset) => preset.code === code.trim().toUpperCase());

/**
 * The output mode a paper implies. A thermal roll cannot be driven as a PDF
 * page and a dot-matrix form is not an ESC/POS receipt, so the wizard derives
 * the mode from the paper rather than asking twice.
 */
export function defaultOutputModeForPaper(preset: PaperPreset): OutputMode {
  if (preset.layoutMode === "GRAPHIC") {
    return "PDF";
  }
  return preset.code.startsWith("DM") ? "ESCP_DOTMATRIX" : "ESCPOS";
}

/** Root identifiers every expression may reference, dataset names aside. */
export const BUILTIN_ROOT_IDENTIFIERS = [
  "row",
  "page",
  "agg",
  "ctx",
  "sys",
  "group",
] as const;

/**
 * Transform signatures for the expression editor's help list. The names must
 * match the server's TRANSFORM_NAMES; the signatures are documentation and are
 * never sent anywhere.
 */
export const TRANSFORM_SIGNATURES: ReadonlyArray<{
  name: string;
  signature: string;
  description: string;
}> = [
  { name: "fmt", signature: "fmt(value, pattern)", description: "Number/date mask, e.g. '#,##0.00'." },
  { name: "fmtIntl", signature: "fmtIntl(value, locale)", description: "Locale-aware number format." },
  { name: "date", signature: "date(value, pattern)", description: "Date format, e.g. 'dd-MM-yyyy'." },
  { name: "numToWords", signature: "numToWords(value)", description: "Amount in words, Indian system." },
  { name: "intToWords", signature: "intToWords(value)", description: "Whole number in words." },
  { name: "gstSplit", signature: "gstSplit(amount, rate)", description: "CGST/SGST halves of a tax amount." },
  { name: "gstExclusive", signature: "gstExclusive(amount, rate)", description: "Strip tax from an inclusive amount." },
  { name: "interState", signature: "interState(fromState, toState)", description: "True when IGST applies." },
  { name: "upper", signature: "upper(text)", description: "Uppercase." },
  { name: "lower", signature: "lower(text)", description: "Lowercase." },
  { name: "title", signature: "title(text)", description: "Title case." },
  { name: "trim", signature: "trim(text)", description: "Strip surrounding spaces." },
  { name: "pad", signature: "pad(text, width, fill?)", description: "Left-pad to width." },
  { name: "padEnd", signature: "padEnd(text, width, fill?)", description: "Right-pad to width." },
  { name: "padCenter", signature: "padCenter(text, width, fill?)", description: "Centre within width." },
  { name: "truncate", signature: "truncate(text, width)", description: "Cut to width." },
  { name: "repeat", signature: "repeat(text, count)", description: "Repeat, for GRID rules." },
  { name: "coalesce", signature: "coalesce(a, b, ...)", description: "First non-empty value." },
  { name: "wrap", signature: "wrap(text, width)", description: "Wrap into lines of width." },
  { name: "mask", signature: "mask(text, pattern)", description: "Apply a character mask." },
  { name: "abs", signature: "abs(value)", description: "Absolute value." },
  { name: "round", signature: "round(value, places?)", description: "Round half up." },
  { name: "ceil", signature: "ceil(value)", description: "Round up." },
  { name: "floor", signature: "floor(value)", description: "Round down." },
  { name: "neg", signature: "neg(value)", description: "Negate." },
  { name: "default", signature: "default(value, fallback)", description: "Fallback when empty." },
  { name: "length", signature: "length(value)", description: "String or array length." },
  { name: "join", signature: "join(array, separator)", description: "Join an array." },
  { name: "first", signature: "first(array)", description: "First element." },
  { name: "last", signature: "last(array)", description: "Last element." },
  { name: "sum", signature: "sum(array, field?)", description: "Total a collection." },
  { name: "sortBy", signature: "sortBy(array, field)", description: "Sort a collection." },
  { name: "where", signature: "where(array, field, value)", description: "Filter a collection." },
  {
    name: "groupIndian",
    signature: "groupIndian(value)",
    description: "Lakh/crore digit grouping: 12,34,567.",
  },
  {
    name: "groupWestern",
    signature: "groupWestern(value)",
    description: "Thousands grouping: 1,234,567.",
  },
  { name: "bool", signature: "bool(value)", description: "Coerce to true/false." },
  { name: "num", signature: "num(value)", description: "Coerce to a number." },
  { name: "str", signature: "str(value)", description: "Coerce to text." },
];

export const TRANSFORM_NAMES: readonly string[] = TRANSFORM_SIGNATURES.map(
  (transform) => transform.name,
);

/** Common numeric and date masks offered as presets in the format section. */
export const NUMBER_FORMAT_PRESETS = [
  { pattern: "#,##0.00", label: "1,234.56" },
  { pattern: "#,##0", label: "1,235" },
  { pattern: "#,##0.000", label: "1,234.560" },
  { pattern: "0.00", label: "1234.56" },
  { pattern: "#,##0.00;(#,##0.00)", label: "(1,234.56) negative" },
] as const;

export const DATE_FORMAT_PRESETS = [
  { pattern: "dd-MM-yyyy", label: "24-08-2026" },
  { pattern: "dd/MM/yyyy", label: "24/08/2026" },
  { pattern: "dd-MMM-yyyy", label: "24-Aug-2026" },
  { pattern: "yyyy-MM-dd", label: "2026-08-24" },
  { pattern: "dd-MM-yyyy HH:mm", label: "24-08-2026 14:30" },
] as const;

export type VocabularyDrift = {
  kind: "bandTypes" | "elementKinds" | "outputModes" | "transforms" | "rootIdentifiers";
  serverOnly: string[];
  clientOnly: string[];
};

/**
 * Compare the server's vocabulary with this build's. Returns the differences
 * rather than throwing: a newer server is a reason to warn a developer, never a
 * reason to refuse to open a template a customer needs to fix.
 */
export function reconcileVocabulary(server: TemplateSchemaVocabulary): VocabularyDrift[] {
  const pairs: Array<{ kind: VocabularyDrift["kind"]; server: readonly string[]; client: readonly string[] }> = [
    { kind: "bandTypes", server: server.bandTypes ?? [], client: BAND_TYPES },
    { kind: "elementKinds", server: server.elementKinds ?? [], client: ELEMENT_KINDS },
    { kind: "outputModes", server: server.outputModes ?? [], client: OUTPUT_MODES },
    { kind: "transforms", server: server.transforms ?? [], client: TRANSFORM_NAMES },
    { kind: "rootIdentifiers", server: server.rootIdentifiers ?? [], client: BUILTIN_ROOT_IDENTIFIERS },
  ];

  const drift: VocabularyDrift[] = [];
  for (const pair of pairs) {
    const serverSet = new Set(pair.server);
    const clientSet = new Set(pair.client);
    const serverOnly = pair.server.filter((value) => !clientSet.has(value));
    const clientOnly = pair.client.filter((value) => !serverSet.has(value));
    if (serverOnly.length || clientOnly.length) {
      drift.push({ kind: pair.kind, serverOnly, clientOnly });
    }
  }
  return drift;
}
