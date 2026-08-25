/**
 * Sample values for the canvas's "show values" mode.
 *
 * The dataset catalogue publishes field METADATA but not the providers'
 * `sampleData()` rows, so the canvas cannot show the same specimen values the
 * PDF preview will. It synthesises them from the field type instead, which is
 * enough for the only question this mode answers: does the layout still hold
 * once a placeholder is replaced by something the width of a real value.
 *
 * Nothing here is authoritative. `PreviewDialog` renders through the server's
 * engine against real provider samples, and that is what the plan's F1 calls
 * the authoritative view.
 */

import type {
  DatasetBinding,
  FieldMeta,
  ProviderDescriptor,
} from "@/features/print-designer/types/template-definition";
import { expressionSpans } from "@/features/print-designer/lib/expression";

/** Deterministic per name, so a field does not change value on every keystroke. */
function hashOf(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

const STRING_SAMPLES = [
  "Sample value",
  "ACME TRADERS",
  "Chennai",
  "TAX INVOICE",
  "PCS",
  "GSTIN33ABCDE1234F1Z5",
];

export function sampleValueFor(field: FieldMeta): string {
  const seed = hashOf(field.name);
  switch (field.type) {
    case "number":
      return (((seed % 90_000) + 1_000) / 100).toFixed(2);
    case "integer":
      return String((seed % 900) + 1);
    case "boolean":
      return seed % 2 === 0 ? "Yes" : "No";
    case "date":
      return "24-08-2026";
    case "datetime":
      return "24-08-2026 14:30";
    case "object":
      return "{…}";
    default:
      return STRING_SAMPLES[seed % STRING_SAMPLES.length];
  }
}

/** Placeholders for the built-in roots, which have no provider metadata. */
const BUILTIN_SAMPLES: Readonly<Record<string, string>> = {
  "page.number": "1",
  "page.total": "2",
  "page.isFirst": "Yes",
  "page.isLast": "No",
  "ctx.companyName": "VK NEX TRADERS PVT LTD",
  "ctx.companyLogo": "[logo]",
  "ctx.branchName": "MAIN BRANCH",
  "ctx.accYear": "2026-2027",
  "ctx.docId": "SB-000142",
  "sys.now": "24-08-2026 14:30",
  "sys.renderedAt": "24-08-2026 14:30",
  "group.key": "Group A",
  "group.count": "7",
  "row.__index": "1",
};

const FALLBACK_BY_ROOT: Readonly<Record<string, string>> = {
  page: "1",
  agg: "12,345.00",
  ctx: "Context",
  sys: "24-08-2026",
  group: "Group A",
  row: "Value",
};

export type SampleResolver = (path: string) => string;

/**
 * Build a resolver for a definition: dataset name -> provider fields, so
 * `row.netAmount` inside a DETAIL band bound to `items` resolves through that
 * provider's metadata.
 */
export function createSampleResolver(options: {
  /** The definition's dataset bindings, not the whole definition: a resolver
   *  rebuilt on every band-height tweak would defeat its own memoisation. */
  datasets: readonly DatasetBinding[];
  providers: readonly ProviderDescriptor[];
  /** Dataset name of the band being rendered, for `row.*`. */
  bandDataset?: string;
}): SampleResolver {
  const providerByToken = new Map(options.providers.map((provider) => [provider.token, provider]));
  const fieldsByDataset = new Map<string, Map<string, FieldMeta>>();

  for (const dataset of options.datasets) {
    const provider = providerByToken.get(dataset.provider);
    if (!provider) {
      continue;
    }
    fieldsByDataset.set(
      dataset.name,
      new Map(provider.fields.map((field) => [field.name, field])),
    );
  }

  return (path: string): string => {
    const builtin = BUILTIN_SAMPLES[path];
    if (builtin !== undefined) {
      return builtin;
    }

    const [root, ...rest] = path.split(".");
    const leaf = rest.join(".");

    if (root === "row" && options.bandDataset) {
      const field = fieldsByDataset.get(options.bandDataset)?.get(leaf);
      if (field) {
        return sampleValueFor(field);
      }
    }

    const datasetFields = fieldsByDataset.get(root);
    if (datasetFields) {
      const field = datasetFields.get(leaf);
      if (field) {
        return sampleValueFor(field);
      }
    }

    return FALLBACK_BY_ROOT[root] ?? leaf ?? path;
  };
}

/**
 * The first identifier path in an expression span — the value a reader of the
 * canvas is looking for. `fmt(row.netAmount, '#,##0.00')` shows the amount, not
 * the mask.
 */
function primaryPath(source: string): string | null {
  const code = source.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
  const match = /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)/.exec(code);
  return match ? match[1] : null;
}

/**
 * Substitute `{{ … }}` spans with sample values for display.
 *
 * Display only — never written back into the definition. An expression whose
 * shape this cannot read shows as `…`, which reads on the canvas as "something
 * computed goes here" rather than as a broken template.
 */
export function substituteSampleValues(template: string, resolve: SampleResolver): string {
  const spans = expressionSpans(template);
  if (!spans.length) {
    return template;
  }

  let result = "";
  let cursor = 0;
  for (const span of spans) {
    result += template.slice(cursor, span.start);
    const path = primaryPath(span.source);
    result += path ? resolve(path) : "…";
    cursor = span.end;
  }
  result += template.slice(cursor);
  return result;
}
