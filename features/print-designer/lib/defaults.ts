/**
 * Defaults for newly created objects.
 *
 * Every value here is the schema's own default made explicit. The designer
 * writes complete elements rather than relying on the server to fill them in,
 * so what the canvas shows and what a save stores cannot differ.
 */
import type {
  Band,
  BandType,
  DatasetBinding,
  ElementKind,
  FieldMeta,
  LayoutMode,
  PaperPreset,
  PaperSpec,
  ProviderDescriptor,
  ReportElement,
  TemplateDefinition,
} from "@/features/print-designer/types/template-definition";
import { SCHEMA_VERSION } from "@/features/print-designer/types/template-definition";
import { defaultOutputModeForPaper } from "@/features/print-designer/lib/vocabulary";
import { DEFAULT_TEXT_H_MM, DEFAULT_TEXT_W_MM } from "@/features/print-designer/lib/geometry";
/** 10mm all round: the margin every Indian pre-printed stationery assumes. */
export const DEFAULT_MARGINS = { top: 10, right: 10, bottom: 10, left: 10 } as const;
/** Thermal and dot-matrix stationery has no side margin worth the name. */
export const GRID_MARGINS = { top: 2, right: 2, bottom: 2, left: 2 } as const;
export function paperFromPreset(preset: PaperPreset): PaperSpec {
  const margins = preset.layoutMode === "GRID" ? { ...GRID_MARGINS } : { ...DEFAULT_MARGINS };
  return {
    code: preset.code,
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    orientation: "PORTRAIT",
    margins,
    ...(preset.columns === undefined ? {} : { columns: preset.columns }),
    ...(preset.rows === undefined ? {} : { rows: preset.rows }),
  };
}
export function createBand(type: BandType, layoutMode: LayoutMode): Band {
  const graphicHeights: Partial<Record<BandType, number>> = {
    REPORT_HEADER: 25,
    PAGE_HEADER: 35,
    GROUP_HEADER: 8,
    DETAIL: 6,
    GROUP_FOOTER: 8,
    SUMMARY: 30,
    PAGE_FOOTER: 12,
    REPORT_FOOTER: 15,
    NO_DATA: 10,
  };
  return {
    type,
    heightMm: layoutMode === "GRID" ? 0 : (graphicHeights[type] ?? 10),
    ...(layoutMode === "GRID" ? { heightRows: type === "DETAIL" ? 1 : 3 } : {}),
    groupLevel: 0,
    printOn: "ALL_PAGES",
    autoGrow: type === "DETAIL",
    keepTogether: false,
    keepWithNext: false,
    keepWithLastDetail: type === "SUMMARY",
    spacingRows: 0,
    elements: [],
  };
}
/**
 * A blank template: page header, detail, page footer.
 *
 * Not an empty band list — the schema demands at least one band, and a designer
 * that opens on nothing gives the user no place to drop the first field.
 *
 * Prefer `createStarterDefinition`, which produces a template that is already
 * VALID. This one is only for the case where the dataset catalogue is not
 * available, and it deliberately omits the DETAIL band: a DETAIL band with no
 * dataset is a save-blocking error, and handing a new user an error they did
 * not cause is the worst possible first screen.
 */
export function createEmptyDefinition(preset: PaperPreset): TemplateDefinition {
  const layoutMode = preset.layoutMode;
  return {
    schemaVersion: SCHEMA_VERSION,
    layoutMode,
    paper: paperFromPreset(preset),
    datasets: [],
    bands: [createBand("PAGE_HEADER", layoutMode), createBand("PAGE_FOOTER", layoutMode)],
  };
}
/** Segment names that say nothing on their own, so the one before it is used. */
const GENERIC_TOKEN_TAILS = new Set(["profile", "header", "data", "info", "detail", "details"]);
/**
 * A readable dataset name for a provider token.
 *
 * `sales.invoice.header` should be `invoice`, not `header`, because the name is
 * what every expression in the template will read: `invoice.billNo` is the
 * point of the exercise and `header.billNo` is not.
 */
export function suggestDatasetName(token: string, taken: ReadonlySet<string>): string {
  const segments = token.split(".").filter(Boolean);
  const tail = segments[segments.length - 1] ?? "data";
  const chosen =
    GENERIC_TOKEN_TAILS.has(tail) && segments.length > 1 ? segments[segments.length - 2] : tail;
  const cleaned = chosen.replace(/[^A-Za-z0-9_]/g, "") || "data";
  const base = /^[A-Za-z_]/.test(cleaned) ? cleaned : `d_${cleaned}`;
  if (!taken.has(base)) {
    return base;
  }
  for (let suffix = 2; suffix < 100; suffix += 1) {
    if (!taken.has(`${base}${suffix}`)) {
      return `${base}${suffix}`;
    }
  }
  return `${base}_x`;
}
/** A provider explicitly declared for this document type — not a wildcard one. */
const claimsDocType = (provider: ProviderDescriptor, docType: string): boolean =>
  provider.docTypes.includes(docType);
/**
 * Which collection a DETAIL band should repeat over by default.
 *
 * The catalogue is sorted by token, so "first match" hands an invoice
 * `sales.invoice.batchDetail` — the batch/serial split rows — when what anyone
 * starting an invoice means is `sales.invoice.lines`. These tails are ranked by
 * how likely they are to be the document's main body.
 */
const ROW_TOKEN_PREFERENCE = ["lines", "items", "rows", "entries", "transactions"];
function preferredRowProvider(
  providers: readonly ProviderDescriptor[],
  docType: string,
): ProviderDescriptor | undefined {
  const candidates = providers.filter(
    (provider) => provider.cardinality === "many" && claimsDocType(provider, docType),
  );
  for (const preferred of ROW_TOKEN_PREFERENCE) {
    const match = candidates.find((provider) => provider.token.endsWith(`.${preferred}`));
    if (match) {
      return match;
    }
  }
  return candidates[0];
}
/**
 * A new template that is ready to design: datasets bound, the DETAIL band
 * pointing at them, and something on the page to preview.
 *
 * Binding is deliberately MINIMAL — the company, the document header, and the
 * one collection a DETAIL band repeats over. Every declared dataset is resolved
 * on every print (see the server's `resolveDatasets`), so binding all six
 * providers a document type offers would charge the customer four queries per
 * invoice for data the design never mentions. Everything else is one click away
 * in the Data panel.
 */
export function createStarterDefinition(options: {
  preset: PaperPreset;
  docType: string;
  templateName: string;
  providers: readonly ProviderDescriptor[];
}): TemplateDefinition {
  const { preset, docType, providers } = options;
  const layoutMode = preset.layoutMode;
  const paper = paperFromPreset(preset);
  const company = providers.find((provider) => provider.token === "company.profile");
  const header = providers.find(
    (provider) => provider.cardinality === "one" && claimsDocType(provider, docType),
  );
  const rows = preferredRowProvider(providers, docType);
  const taken = new Set<string>();
  const datasets: DatasetBinding[] = [];
  const bind = (provider: ProviderDescriptor | undefined): string | undefined => {
    if (!provider) {
      return undefined;
    }
    const name = suggestDatasetName(provider.token, taken);
    taken.add(name);
    datasets.push({ name, provider: provider.token, cardinality: provider.cardinality });
    return name;
  };
  const companyName = bind(company);
  bind(header);
  const rowsName = bind(rows);
  const pageHeader = createBand("PAGE_HEADER", layoutMode);
  const pageFooter = createBand("PAGE_FOOTER", layoutMode);
  const isGrid = layoutMode === "GRID";
  const contentWidthMm = paper.widthMm - paper.margins.left - paper.margins.right;
  const columns = paper.columns ?? 48;
  /** A centred full-width line of text, in whichever unit the mode uses. */
  const banner = (id: string, value: string, row: number, sizePt: number): ReportElement => {
    const element = createElement({
      kind: "TEXT",
      id,
      xMm: isGrid ? 0 : paper.margins.left,
      yMm: isGrid ? row : row * 6,
      layoutMode,
      col: 0,
      row,
    });
    if (element.kind !== "TEXT") {
      return element;
    }
    return {
      ...element,
      value,
      align: "center",
      w: isGrid ? columns : contentWidthMm,
      h: isGrid ? 1 : 6,
      ...(isGrid ? { cols: columns } : {}),
      font: { size: sizePt, bold: true },
    };
  };
  // The title is the company when one is bound, and the template's own name
  // otherwise — never an expression referencing a dataset that does not exist,
  // which would open the designer on a validation error.
  pageHeader.elements.push(
    banner("title", companyName ? `{{ ${companyName}.name }}` : options.templateName, 0, 12),
  );
  if (!isGrid) {
    // `page` is a built-in root, so this is valid in every template.
    const footer = createElement({
      kind: "TEXT",
      id: "page_no",
      xMm: paper.margins.left,
      yMm: 1,
      layoutMode,
    });
    if (footer.kind === "TEXT") {
      pageFooter.elements.push({
        ...footer,
        value: "Page {{ page.number }} of {{ page.total }}",
        align: "right",
        w: contentWidthMm,
        h: 4,
        font: { size: 8 },
      });
    }
  }
  const bands = [pageHeader];
  if (rowsName) {
    const detail = createBand("DETAIL", layoutMode);
    detail.dataset = rowsName;
    bands.push(detail);
  }
  bands.push(pageFooter);
  return {
    schemaVersion: SCHEMA_VERSION,
    layoutMode,
    paper,
    datasets,
    bands,
  };
}
export function defaultOutputMode(preset: PaperPreset) {
  return defaultOutputModeForPaper(preset);
}
/**
 * Element ids must be unique across the whole definition — the server enforces
 * it and the designer addresses elements by id for selection and undo. Sequence
 * per kind, then skip anything already taken.
 */
export function nextElementId(
  kind: ElementKind,
  taken: ReadonlySet<string>,
): string {
  const prefix = kind.toLowerCase();
  for (let index = 1; index < 100_000; index += 1) {
    const candidate = `${prefix}_${index}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  // Unreachable in practice: 500 elements per band, 60 bands.
  return `${prefix}_${taken.size + 1}`;
}
export type CreateElementOptions = {
  kind: ElementKind;
  id: string;
  xMm: number;
  yMm: number;
  layoutMode: LayoutMode;
  /** GRID mode cell position, when the canvas is a character grid. */
  col?: number;
  row?: number;
};

export function createElement(options: CreateElementOptions): ReportElement {
  const { kind, id, layoutMode } = options;
  const x = options.xMm;
  const y = options.yMm;
  const gridGeometry =
    layoutMode === "GRID"
      ? { col: options.col ?? 0, row: options.row ?? 0, cols: 10 }
      : {};

  const base = { id, x, y, z: 0, ...gridGeometry } as const;

  switch (kind) {
    case "TEXT":
      return {
        ...base,
        kind: "TEXT",
        w: DEFAULT_TEXT_W_MM,
        h: DEFAULT_TEXT_H_MM,
        value: "Text",
        align: "left",
        vAlign: "top",
        wrap: false,
        ellipsis: false,
        blankWhenZero: false,
      };
    case "FIELD":
      return {
        ...base,
        kind: "FIELD",
        w: DEFAULT_TEXT_W_MM,
        h: DEFAULT_TEXT_H_MM,
        value: "{{ row.value }}",
        align: "left",
        vAlign: "top",
        wrap: false,
        ellipsis: false,
        blankWhenZero: false,
      };
    case "LINE":
      return {
        ...base,
        kind: "LINE",
        x1: x,
        y1: y,
        x2: x + 50,
        y2: y,
        widthPt: 0.5,
        gridChar: "-",
      };
    case "RECT":
      return { ...base, kind: "RECT", w: 50, h: 20, radiusMm: 0 };
    case "IMAGE":
      return {
        ...base,
        kind: "IMAGE",
        w: 25,
        h: 25,
        source: "{{ ctx.companyLogo }}",
        fit: "CONTAIN",
      };
    case "BARCODE":
      return {
        ...base,
        kind: "BARCODE",
        w: 40,
        h: 15,
        symbology: "code128",
        value: "{{ row.barcode }}",
        showText: true,
      };
    case "QRCODE":
      return { ...base, kind: "QRCODE", size: 25, value: "{{ row.qrPayload }}", errorCorrection: "M" };
    case "PAGEBREAK":
      return { ...base, kind: "PAGEBREAK", w: 20, h: 4 };
    case "CROSSTAB":
      return {
        ...base,
        kind: "CROSSTAB",
        // Wide, but inside A5's printable width. A pivot with four months and
        // a totals column is unreadable in the 40mm a text element gets, so it
        // has to start wide; 150 would overhang A5 and land the user a brand
        // new element carrying two margin warnings it did not earn.
        w: 120,
        h: 30,
        dataset: "",
        rowBy: "{{ row.name }}",
        columnBy: "{{ row.period }}",
        measure: "{{ row.amount }}",
        fn: "sum",
        format: "#,##0.00",
        blankWhenZero: true,
        corner: "",
        rowHeaderWidthMm: 40,
        columnWidthMm: 0,
        headerHeightMm: 6,
        rowHeightMm: 5,
        showRowTotals: true,
        showColumnTotals: true,
        totalsLabel: "Total",
        rowSort: "LABEL_ASC",
        // Not LABEL_ASC: the commonest column axis is a period, and sorting
        // month names alphabetically gives Apr, Aug, Dec. The query's own
        // ORDER BY is right far more often than the label order is.
        columnSort: "FIRST_SEEN",
        maxColumns: 12,
        overflow: "FOLD",
        overflowLabel: "Other",
        gridLines: true,
        repeatHeader: true,
      };
  }
}

/**
 * A FIELD element for a dataset field dragged out of the tree.
 *
 * Numeric fields arrive right-aligned with the provider's suggested mask, which
 * is the difference between a usable drop and one the user has to fix in the
 * property panel every single time.
 */
export function createFieldElement(options: {
  id: string;
  xMm: number;
  yMm: number;
  layoutMode: LayoutMode;
  datasetName: string;
  cardinality: "one" | "many";
  field: FieldMeta;
  col?: number;
  row?: number;
}): ReportElement {
  const { field } = options;
  const numeric = field.type === "number" || field.type === "integer";
  const dateLike = field.type === "date" || field.type === "datetime";

  // A `many` dataset is read through the band's current row; a `one` dataset is
  // addressed by its own name.
  const path =
    options.cardinality === "many" ? `row.${field.name}` : `${options.datasetName}.${field.name}`;

  const mask =
    field.format ??
    (numeric ? "#,##0.00" : dateLike ? "dd-MM-yyyy" : undefined);

  const value = mask
    ? `{{ ${numeric ? "fmt" : "date"}(${path}, '${mask}') }}`
    : `{{ ${path} }}`;

  const element = createElement({
    kind: "FIELD",
    id: options.id,
    xMm: options.xMm,
    yMm: options.yMm,
    layoutMode: options.layoutMode,
    col: options.col,
    row: options.row,
  });

  if (element.kind !== "FIELD") {
    return element;
  }

  return {
    ...element,
    value,
    align: numeric ? "right" : "left",
    w: numeric ? 25 : field.type === "boolean" ? 12 : DEFAULT_TEXT_W_MM,
  };
}
