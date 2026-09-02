#!/usr/bin/env node
/**
 * Regenerate the print designer's palette vocabulary from the server's schema.
 *
 * The plan's F7 asks for codegen so the frontend types cannot drift from the
 * backend zod schema. This is that, with one deliberate difference: it is NOT
 * wired into `postinstall`. A deploy machine has the client checkout and no
 * server checkout, so a postinstall step that needs a sibling repository is a
 * build that fails on the one machine that matters. Run it by hand after a
 * schema change instead:
 *
 *   npm run gen:print-vocab
 *
 * Drift is still caught without it: the designer reconciles this file against
 * `GET /reports/templates/schema` at runtime and warns in development
 * (see lib/vocabulary.ts, reconcileVocabulary).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, "..");
// The engine moved from `modules/reporting` to `modules/settings/print-render`
// when the reporting module was folded into settings; these paths followed it.
const SERVER_ENGINE = resolve(clientRoot, "../ERP server/src/modules/settings/print-render");
const SERVER_SCHEMA = resolve(SERVER_ENGINE, "definition/template-definition.schema.ts");
const SERVER_UNITS = resolve(SERVER_ENGINE, "engine/units/units.ts");
const SERVER_JEXL = resolve(SERVER_ENGINE, "engine/expression/jexl.factory.ts");
const TARGET = resolve(clientRoot, "features/print-designer/lib/vocabulary.generated.json");
function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`Cannot read ${path}. Is the "ERP server" checkout a sibling of this one?`);
    process.exit(1);
  }
}
/** Pull a `export const NAME = [ ... ] as const` string array out of a source file. */
function constArray(source, name) {
  const match = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(source);
  if (!match) {
    console.error(`Could not find ${name} in the server sources.`);
    process.exit(1);
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}
const schemaSource = read(SERVER_SCHEMA);
const unitsSource = read(SERVER_UNITS);
const jexlSource = read(SERVER_JEXL);
const vocabulary = {
  generatedFrom: "ERP server/src/modules/settings/print-render",
  schemaVersion: Number(/export const SCHEMA_VERSION = (\d+)/.exec(schemaSource)?.[1] ?? 1),
  layoutModes: constArray(schemaSource, "LAYOUT_MODES"),
  outputModes: constArray(schemaSource, "OUTPUT_MODES"),
  orientations: constArray(schemaSource, "ORIENTATIONS"),
  bandTypes: constArray(schemaSource, "BAND_TYPES"),
  elementKinds: constArray(schemaSource, "ELEMENT_KINDS"),
  printOn: constArray(schemaSource, "PRINT_ON"),
  barcodeSymbologies: constArray(schemaSource, "BARCODE_SYMBOLOGIES"),
  aggregateFunctions: constArray(schemaSource, "AGGREGATE_FUNCTIONS"),
  aggregateScopes: constArray(schemaSource, "AGGREGATE_SCOPES"),
  crosstabSorts: constArray(schemaSource, "CROSSTAB_SORTS"),
  crosstabOverflows: constArray(schemaSource, "CROSSTAB_OVERFLOWS"),
  transforms: constArray(jexlSource, "TRANSFORM_NAMES"),
  paperCodes: [...unitsSource.matchAll(/code:\s*'([A-Z0-9]+)'/g)].map((entry) => entry[1]),
};
writeFileSync(TARGET, `${JSON.stringify(vocabulary, null, 2)}\n`, "utf8");
console.log(`Wrote ${TARGET}`);
console.log(
  "Compare it against features/print-designer/lib/vocabulary.ts and update anything that moved.",
);