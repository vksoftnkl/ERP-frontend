/**
 * The bridge between the printing module and the canvas designer.
 *
 * -- WHY THIS EXISTS -------------------------------------------------------
 *
 * `features/print-designer` is a complete band/element canvas: a Redux store, a
 * ruler, snapping, undo, a property panel. What it does NOT have is a backend --
 * every `/reports/*` route it was written against answers 404 (verified
 * 27-08-2026: templates, schema, datasets/catalogue and preview alike). It can
 * edit a design and it cannot load or save one.
 *
 * The printing module is the mirror image: it has the tables, the revisions, the
 * publish pointer and a working save, and its Layout tab is a JSON text area.
 *
 * So this module translates between them. The canvas becomes the Layout tab's
 * editor, and `print_template_version` becomes the canvas's storage. Nothing
 * about `/reports/*` is revived, and the canvas needs no server: every
 * vocabulary it draws from (band types, element kinds, paper presets) is a local
 * constant in `print-designer/lib/vocabulary.ts`, and only load, save, catalogue
 * and preview ever touched the network.
 *
 * -- WHICH SIDE OWNS WHAT --------------------------------------------------
 *
 * ON THE WAY IN, the version wins for the page and the datasets, and the body
 * wins only for the bands:
 *
 *   paper     <- versions[0].ptv*        (the Template tab's "The page")
 *   datasets  <- versions[0].datasets[]  (the Data tab)
 *   bands     <- versions[0].ptvBody     (the canvas's own work)
 *
 * That direction is deliberate. If the canvas could redefine the paper or invent
 * a dataset, the Template and Data tabs would quietly stop describing the design
 * they are labelled as describing -- and a dataset the canvas made up would have
 * no row in `print_template_dataset`, so it would bind to nothing at render.
 * A divergence always resolves in favour of the version.
 */

import {
  createBand,
  createEmptyDefinition,
  paperFromPreset,
} from "@/features/print-designer/lib/defaults";
import {
  BAND_TYPES,
  PAPER_PRESETS,
  findPaperPreset,
} from "@/features/print-designer/lib/vocabulary";
import type {
  Band,
  BandType,
  Cardinality,
  DatasetBinding,
  FieldMeta,
  LayoutMode,
  PaperSpec,
  ProviderDescriptor,
  TemplateDefinition,
} from "@/features/print-designer/types/template-definition";
import { SCHEMA_VERSION } from "@/features/print-designer/types/template-definition";
import type { PtvBodyInput, PtvEngine } from "../types/printing";
import type { DraftDataset, DraftVersion } from "./draft";

/** The token a SQL dataset is given, since it has no provider code. */
export const sqlToken = (name: string): string => `sql.${name}`;

/**
 * Which layout the canvas should open in.
 *
 * The text engines are character grids and the page engines are millimetres;
 * the engine is the authority, and `ptvColumns` only breaks a tie for an engine
 * that could be either.
 */
export function layoutModeFor(engine: PtvEngine, columns: number | null): LayoutMode {
  if (engine === "ESCPOS_TEXT" || engine === "RAW") return "GRID";
  if (engine === "JSON_BANDS" || engine === "HTML_CSS" || engine === "QTRPT_XML") {
    return "GRAPHIC";
  }
  return columns === null ? "GRAPHIC" : "GRID";
}

/** The page, as the canvas models it. */
export function paperFor(working: DraftVersion): PaperSpec {
  const preset =
    findPaperPreset(working.ptvPaperCode) ??
    PAPER_PRESETS.find((entry) => entry.code === "A4") ??
    PAPER_PRESETS[0];
  const base = paperFromPreset(preset);

  return {
    ...base,
    // The stored code wins even when no preset matches it: a site's own paper
    // is a real code, and silently renaming it to A4 would be a lie.
    code: working.ptvPaperCode || base.code,
    widthMm: working.ptvWidthMm ?? base.widthMm,
    // null is MEANINGFUL here -- continuous stationery, a thermal roll -- so it
    // is only replaced when the version says nothing at all.
    heightMm: working.ptvHeightMm !== null ? working.ptvHeightMm : base.heightMm,
    orientation: working.ptvOrientation,
    margins: {
      top: working.ptvMarginTopMm,
      right: working.ptvMarginRightMm,
      bottom: working.ptvMarginBottomMm,
      left: working.ptvMarginLeftMm,
    },
    ...(working.ptvColumns !== null ? { columns: working.ptvColumns } : {}),
  };
}

/** MASTER is read once; DETAIL repeats. */
const cardinalityOf = (dataset: DraftDataset): Cardinality =>
  dataset.ptdRole === "MASTER" ? "one" : "many";

/** `versions[0].datasets[]`, as the canvas's dataset bindings. */
export function bindingsFor(datasets: DraftDataset[]): DatasetBinding[] {
  return datasets
    .filter((dataset) => dataset.ptdName)
    .map((dataset) => ({
      name: dataset.ptdName,
      provider:
        dataset.ptdSourceKind === "SQL"
          ? sqlToken(dataset.ptdName)
          : (dataset.ptdProviderCode ?? sqlToken(dataset.ptdName)),
      cardinality: cardinalityOf(dataset),
    }));
}

/** True when a stored body already holds a canvas definition. */
export function isTemplateDefinition(value: unknown): value is TemplateDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as { bands?: unknown }).bands)
  );
}

/**
 * One stored band, made safe to hand to the canvas.
 *
 * THE BODY IS NOT VALIDATED ANYWHERE. `ptv_body` is a text column, and the only
 * check on it is that a JSON_BANDS body parses as an object -- nothing says its
 * bands are the canvas's bands. So a body can hold `{"bands":[{"kind":"HEADER"}]}`,
 * which is a perfectly good stub and which crashes a renderer that expects
 * `band.elements` to be iterable. Found exactly that way.
 *
 * A band with an unrecognised `type` is DROPPED rather than guessed at: it means
 * something to whatever wrote it, and inventing a DETAIL band in its place would
 * put a row on the page that nobody asked for. Everything else is filled in from
 * `createBand`'s defaults, so a partial band survives with its own values intact.
 */
function normaliseBand(value: unknown, layoutMode: LayoutMode): Band | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const type = raw.type;
  if (typeof type !== "string" || !BAND_TYPES.includes(type as BandType)) return null;

  const base = createBand(type as BandType, layoutMode);
  const num = (key: string, fallback: number): number =>
    typeof raw[key] === "number" && Number.isFinite(raw[key]) ? (raw[key] as number) : fallback;
  const bool = (key: string, fallback: boolean): boolean =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : fallback;
  const str = (key: string): string | undefined =>
    typeof raw[key] === "string" && raw[key] ? (raw[key] as string) : undefined;

  return {
    ...base,
    heightMm: num("heightMm", base.heightMm),
    ...(base.heightRows !== undefined || typeof raw.heightRows === "number"
      ? { heightRows: num("heightRows", base.heightRows ?? 1) }
      : {}),
    ...(str("dataset") ? { dataset: str("dataset") } : {}),
    ...(str("groupBy") ? { groupBy: str("groupBy") } : {}),
    ...(str("visible") ? { visible: str("visible") } : {}),
    groupLevel: num("groupLevel", base.groupLevel),
    printOn: base.printOn,
    autoGrow: bool("autoGrow", base.autoGrow),
    keepTogether: bool("keepTogether", base.keepTogether),
    keepWithNext: bool("keepWithNext", base.keepWithNext),
    keepWithLastDetail: bool("keepWithLastDetail", base.keepWithLastDetail),
    spacingRows: num("spacingRows", base.spacingRows),
    // The crash this whole function exists for: never anything but an array.
    elements: Array.isArray(raw.elements)
      ? (raw.elements.filter(
          (element) => typeof element === "object" && element !== null && !Array.isArray(element),
        ) as Band["elements"])
      : [],
  };
}

/**
 * The working revision, as something the canvas can open.
 *
 * A body that is not a canvas definition -- the `{"bands":[]}` stub a new design
 * starts with, an unparsed string, an HTML body -- opens as an empty design
 * rather than throwing. Nothing is lost by that: the caller only writes back
 * when the operator saves, and `bodyFromDefinition` then replaces the body
 * wholesale, which is what saving from a canvas means.
 */
export function toTemplateDefinition(working: DraftVersion): TemplateDefinition {
  const layoutMode = layoutModeFor(working.ptvEngine, working.ptvColumns);
  const paper = paperFor(working);
  const datasets = bindingsFor(working.datasets);

  const stored = working.ptvBody;
  const fallback = createEmptyDefinition(
    findPaperPreset(working.ptvPaperCode) ??
      PAPER_PRESETS.find((entry) => entry.code === "A4") ??
      PAPER_PRESETS[0],
  ).bands;

  const salvaged = isTemplateDefinition(stored)
    ? stored.bands
        .map((band) => normaliseBand(band, layoutMode))
        .filter((band): band is Band => band !== null)
    : [];

  // Nothing usable in the body opens the starting page/footer pair rather than
  // a blank sheet -- an empty canvas with no bands cannot be built on.
  const bands: Band[] = salvaged.length > 0 ? salvaged : fallback;

  return {
    schemaVersion: SCHEMA_VERSION,
    layoutMode,
    ...(isTemplateDefinition(stored) && stored.meta ? { meta: stored.meta } : {}),
    paper,
    datasets,
    bands,
  };
}

/**
 * The canvas's definition, as a body to store.
 *
 * The whole definition goes in, not just the bands: the canvas round-trips its
 * own `meta` and layout mode that way, and a body that describes its own page is
 * readable on its own. The version stays the authority regardless --
 * `toTemplateDefinition` re-derives paper and datasets from it on the way back
 * in, so a stale copy in the body can never outrank the Template tab.
 */
export function bodyFromDefinition(definition: TemplateDefinition): PtvBodyInput {
  return { ...definition } as unknown as Record<string, unknown>;
}

/**
 * The columns a stored query returns, read off its SELECT list.
 *
 * BEST EFFORT, AND LABELLED AS SUCH WHEREVER IT IS SHOWN. There is no catalogue
 * endpoint and no way to run the query, so the alternative is a data panel with
 * no field names at all -- which makes the canvas useless for exactly the
 * datasets the schema expects most of ("SQL for everything else, so a new report
 * costs no release").
 *
 * It reads the top-level SELECT list only: parenthesised depth is tracked so a
 * sub-select's columns are skipped, an alias after AS wins, and a bare
 * `table.column` contributes `column`. `SELECT *` contributes nothing, because
 * nothing here knows what the star expands to.
 */
export function selectListColumns(sql: string | null | undefined): string[] {
  if (!sql) return [];

  // Comments first, then literals -- the same order ptd_sql_norm uses, and for
  // the same reason: a stray quote inside a comment mispairs the scanner.
  const cleaned = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/'(?:[^']|'')*'/g, " ")
    .replace(/::/g, " ");

  const match = /\bselect\b(?:\s+distinct(?:\s+on\s*\([^)]*\))?)?([\s\S]*)/i.exec(cleaned);
  if (!match) return [];

  // Walk to the FROM that closes the top-level select list.
  const rest = match[1];
  let depth = 0;
  let end = rest.length;
  for (let index = 0; index < rest.length; index += 1) {
    const char = rest[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (depth === 0 && /\s/.test(char) && /^\s+from\b/i.test(rest.slice(index))) {
      end = index;
      break;
    }
  }

  const list = rest.slice(0, end);
  const items: string[] = [];
  let current = "";
  depth = 0;
  for (const char of list) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      items.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  items.push(current);

  const columns: string[] = [];
  for (const raw of items) {
    const item = raw.trim().replace(/"/g, "");
    if (!item || item === "*" || item.endsWith(".*")) continue;

    const aliased = /\bas\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/i.exec(item);
    let name = aliased?.[1];
    if (!name) {
      // No AS: a trailing bare word is an implicit alias, otherwise the last
      // dotted segment of the expression.
      const tail = item.split(/\s+/).pop() ?? "";
      const candidate = tail.includes(".") ? (tail.split(".").pop() ?? "") : tail;
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(candidate)) name = candidate;
    }
    if (name && !columns.includes(name)) columns.push(name);
  }
  return columns;
}

/**
 * The version's datasets, as the canvas's data panel wants them.
 *
 * This REPLACES `GET /reports/templates/datasets/catalogue`, which does not
 * exist. A provider dataset has no discoverable field list without that
 * endpoint, so it lists none and says why; a SQL dataset lists what its SELECT
 * returns.
 */
export function toProviderDescriptors(datasets: DraftDataset[]): ProviderDescriptor[] {
  return datasets
    .filter((dataset) => dataset.ptdName)
    .map((dataset) => {
      const isSql = dataset.ptdSourceKind === "SQL";
      const fields: FieldMeta[] = isSql
        ? selectListColumns(dataset.ptdSql).map((name) => ({
            name,
            // Nothing here knows a column's type; string prints every value
            // as-is, and a format can be set per element.
            type: "string" as FieldMeta["type"],
            label: name,
            description: "Read from the query's SELECT list",
          }))
        : [];

      return {
        token: isSql
          ? sqlToken(dataset.ptdName)
          : (dataset.ptdProviderCode ?? sqlToken(dataset.ptdName)),
        label: dataset.ptdLabel || dataset.ptdName,
        cardinality: cardinalityOf(dataset),
        // Empty means "meaningful for any document type" — this list is already
        // scoped to one revision, so there is nothing left to filter by.
        docTypes: [],
        fields,
      };
    });
}
