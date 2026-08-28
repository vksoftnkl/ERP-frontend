#!/usr/bin/env node
/**
 * Regenerate `features/printing/types/printing.generated.ts` from the server's
 * OpenAPI documents.
 *
 * Section 4 of the plan asks for this rather than hand-written DTOs, and the
 * reason is arithmetic: the print template contract is 40-odd fields across
 * three nested levels, three of which are vocabularies that also exist as CHECK
 * constraints. Typed by hand, the client's copy drifts and nothing says so.
 *
 * Run it against a running API:
 *
 *   npm run gen:printing-types                       # https://192.168.0.106:3011
 *   API=https://localhost:3011 npm run gen:printing-types
 *
 * or against saved documents, which is what CI would use:
 *
 *   npm run gen:printing-types -- ./pt.json ./pta.json
 *
 * Like `gen:print-vocab`, this is NOT wired into `postinstall`: a deploy machine
 * has no API to reach, and a build that needs one is a build that fails on the
 * one machine that matters.
 *
 * TWO THINGS THIS DOES BEYOND TRANSCRIBING
 *
 * 1. IT REPAIRS NEST'S NULLABLE DEGRADATION. `@NullableString()` and friends
 *    reach the document as `{"type":"object","nullable":true}` -- the scalar
 *    type is simply gone, and a literal transcription would type `ptdSql` as an
 *    object. Every degraded property is recovered from a concrete declaration
 *    of THE SAME NAME in another schema (the payload DTOs are hand-written and
 *    keep their types), then from `format`/`maxLength`, then from `example`.
 *
 * 2. IT FAILS WHEN TWO DECLARATIONS DISAGREE. One property name declared as two
 *    different types, or one vocabulary declared with two different member
 *    lists, aborts the run. That is not tidiness -- it is the section 9.5 class
 *    of bug, where the API offered an output mode the CHECK refused, caught at
 *    codegen instead of at a till.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, "..");
const TARGET = resolve(clientRoot, "features/printing/types/printing.generated.ts");

const DEFAULT_API = process.env.API ?? "https://192.168.0.106:3011";

/** The two documents, and the label each schema is attributed to. */
const DOCUMENTS = [
  { slug: "print-template", label: "Print Template" },
  { slug: "print-template-assignments", label: "Print Template Assignments" },
];

/**
 * Envelope and error schemas are shared plumbing this client already types in
 * `utils/types.ts`; emitting a second copy per document would collide on name.
 */
const SKIP = new Set([
  "HttpErrorResponseDto",
  "ModuleErrorFieldDto",
  "ModuleErrorResponseDto",
  "Object",
]);

function die(message) {
  console.error(`gen-printing-types: ${message}`);
  process.exit(1);
}

async function loadDocuments(argv) {
  if (argv.length) {
    if (argv.length !== DOCUMENTS.length) {
      die(`expected ${DOCUMENTS.length} document paths, got ${argv.length}`);
    }
    return argv.map((path, index) => ({
      ...DOCUMENTS[index],
      source: path,
      json: JSON.parse(readFileSync(path, "utf8")),
    }));
  }

  // The API serves a mkcert certificate node does not trust. This script reads
  // a schema off a developer machine; it carries no credentials and writes no
  // data, so the check is turned off for its lifetime only.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  return Promise.all(
    DOCUMENTS.map(async (document) => {
      const url = `${DEFAULT_API}/api/docs/${document.slug}-json`;
      const response = await fetch(url).catch((error) => die(`${url} -- ${error.message}`));
      if (!response.ok) {
        die(`${url} answered ${response.status}`);
      }
      return { ...document, source: url, json: await response.json() };
    }),
  );
}

// -- vocabularies -----------------------------------------------------------

/** `ptvStatus` -> `PTV_STATUS_VALUES`; `ptaOutputMode` -> `PTA_OUTPUT_MODE_VALUES`. */
const constName = (property) =>
  `${property.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}_VALUES`;

/** `ptvStatus` -> `PtvStatus`. */
const typeName = (property) => property.charAt(0).toUpperCase() + property.slice(1);

// -- type recovery ----------------------------------------------------------

/** The only types Nest's nullable decorators can lose, and so the only ones worth recovering. */
const SCALARS = new Set(["string", "number", "boolean"]);

const isDegraded = (schema) =>
  schema.type === "object" && !schema.properties && !schema.$ref && !schema.allOf;

/**
 * The concrete TypeScript type of one property schema, ignoring nullability.
 * Returns null when the schema is degraded and has to be recovered.
 */
function concreteType(schema) {
  if (schema.$ref) {
    return schema.$ref.split("/").pop().replace(/Dto$/, "");
  }
  if (Array.isArray(schema.enum)) {
    return null; // handled by the vocabulary pass
  }
  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "array": {
      const item = schema.items ?? {};
      if (item.$ref) {
        return `${item.$ref.split("/").pop().replace(/Dto$/, "")}[]`;
      }
      if (isDegraded(item) || item.type === "object") {
        // `{type:'object'}` items are genuinely open -- ptvParams is exactly this.
        return "Record<string, unknown>[]";
      }
      const inner = concreteType(item);
      return inner ? `${inner}[]` : "unknown[]";
    }
    case "object":
      return schema.properties ? "Record<string, unknown>" : null;
    default:
      return schema.oneOf || schema.anyOf ? "unknown" : null;
  }
}

/**
 * The last resort, and deliberately a short, reviewed list rather than a
 * heuristic.
 *
 * These five reach the document as a bare `{type:'object',nullable:true}` with
 * no format, no maxLength, no example, and no concretely-typed twin anywhere --
 * so there is genuinely nothing in the OpenAPI document to recover them from.
 * The source of truth for each is
 * `ERP server/src/modules/settings/print-template-assignment/types/print-template-assignment-api.types.ts`,
 * where all five are declared `string | null`.
 *
 * The pass below FAILS if an entry here is not needed, so the table cannot rot
 * into a stale override that quietly outranks a fixed server DTO.
 */
const OVERRIDES = {
  "PrintTemplateAssignmentPayloadDto.ptaSyncDate": "string",
  "PrintTemplateAssignmentPayloadDto.ptaModifiedOn": "string",
  "PrintTemplateAssignmentResolutionDto.ptaTemplateCode": "string",
  "PrintTemplateAssignmentResolutionDto.ptaTemplateName": "string",
  "PrintTemplateAssignmentResolutionDto.ptaPrinterName": "string",
};

/** What a degraded `{type:'object',nullable:true}` was before Nest lost it. */
function recoverFromHints(schema) {
  if (schema.format === "uuid" || schema.format === "date-time") return "string";
  if (typeof schema.maxLength === "number") return "string";
  if (typeof schema.minimum === "number" || typeof schema.maximum === "number") return "number";
  if (typeof schema.example === "string") return "string";
  if (typeof schema.example === "number") return "number";
  if (typeof schema.example === "boolean") return "boolean";
  return null;
}

// -- the pass ---------------------------------------------------------------

async function main() {
  const documents = await loadDocuments(process.argv.slice(2));

  /** property name -> concrete type, gathered across BOTH documents. */
  const knownTypes = new Map();
  /** property name -> { values, seenIn } for every enum. */
  const vocabularies = new Map();

  for (const document of documents) {
    const schemas = document.json?.components?.schemas ?? {};
    for (const [schemaName, schema] of Object.entries(schemas)) {
      if (SKIP.has(schemaName)) continue;
      for (const [property, propertySchema] of Object.entries(schema.properties ?? {})) {
        if (Array.isArray(propertySchema.enum)) {
          const values = [...propertySchema.enum];
          const existing = vocabularies.get(property);
          if (existing) {
            // Section 9.5, caught here rather than at a counter.
            if (existing.values.join(" ") !== values.join(" ")) {
              die(
                `vocabulary "${property}" is declared twice with different members:\n` +
                  `  ${existing.seenIn}: [${existing.values.join(", ")}]\n` +
                  `  ${schemaName}: [${values.join(", ")}]\n` +
                  "Fix the server DTOs -- one of them does not match the CHECK constraint.",
              );
            }
          } else {
            vocabularies.set(property, { values, seenIn: schemaName });
          }
          continue;
        }
        const concrete = concreteType(propertySchema);
        // Scalars only. Recovery exists because Nest loses the SCALAR type of a
        // nullable field, and a $ref or an array-of-$ref legitimately differs
        // between the save and payload shapes of one name -- `datasets` is
        // SavePrintTemplateDataset[] going out and PrintTemplateDatasetPayload[]
        // coming back, and that is the contract, not drift.
        if (concrete === null || !SCALARS.has(concrete)) continue;
        const existing = knownTypes.get(property);
        if (existing && existing.type !== concrete) {
          die(
            `property "${property}" is declared as two different types:\n` +
              `  ${existing.seenIn}: ${existing.type}\n` +
              `  ${schemaName}: ${concrete}`,
          );
        }
        if (!existing) knownTypes.set(property, { type: concrete, seenIn: schemaName });
      }
    }
  }

  const lines = [];
  const unresolved = [];
  const usedOverrides = new Set();

  lines.push(
    "/**",
    " * GENERATED FILE -- DO NOT EDIT.",
    " *",
    " * Written by `npm run gen:printing-types` from the server's OpenAPI documents:",
    ...documents.map((document) => ` *   ${document.source}`),
    " *",
    " * Everything the print template contract says about itself lives here, so",
    " * nothing about printing has to be typed by hand and then kept in step. The",
    " * hand-written layer beside it is `printing.ts`; put additions there.",
    " */",
    "",
  );

  // Vocabularies first -- the payload interfaces below refer to them.
  lines.push(
    "// -- vocabularies ----------------------------------------------------------",
    "//",
    "// Each one is a CHECK constraint in 17_printing.sql before it is an enum in a",
    "// DTO. There is deliberately no hand-written list of any of these anywhere in",
    "// the client: a sweet shop that wants a Kitchen Order Ticket adds a row, not a",
    "// release.",
    "",
  );
  for (const [property, { values }] of [...vocabularies].sort()) {
    const constant = constName(property);
    lines.push(
      `export const ${constant} = [${values.map((value) => `"${value}"`).join(", ")}] as const;`,
      `export type ${typeName(property)} = (typeof ${constant})[number];`,
      "",
    );
  }

  lines.push("// -- payloads --------------------------------------------------------------", "");

  for (const document of documents) {
    const schemas = document.json?.components?.schemas ?? {};
    for (const [schemaName, schema] of Object.entries(schemas)) {
      if (SKIP.has(schemaName)) continue;
      const required = new Set(schema.required ?? []);
      const name = schemaName.replace(/Dto$/, "");
      const body = [];

      for (const [property, propertySchema] of Object.entries(schema.properties ?? {})) {
        const key = `${schemaName}.${property}`;
        let type;
        if (Array.isArray(propertySchema.enum)) {
          type = typeName(property);
        } else {
          type =
            concreteType(propertySchema) ??
            knownTypes.get(property)?.type ??
            recoverFromHints(propertySchema);
          if (type === null || type === undefined) {
            type = OVERRIDES[key];
            if (type) {
              usedOverrides.add(key);
            } else {
              unresolved.push(key);
              type = "unknown";
            }
          } else if (OVERRIDES[key]) {
            die(
              `${key} is in the OVERRIDES table but the document now types it as ${type}. ` +
                "Delete the override -- the server DTO was fixed.",
            );
          }
        }
        const nullable = propertySchema.nullable === true;
        const optional = !required.has(property);
        const description = (propertySchema.description ?? "").trim();
        if (description) {
          body.push(`  /** ${description.replace(/\s*\n\s*/g, " ").replace(/\*\//g, "*\\/")} */`);
        }
        body.push(`  ${property}${optional ? "?" : ""}: ${type}${nullable ? " | null" : ""};`);
      }

      lines.push(`/** ${document.label} -- \`${schemaName}\` */`);
      lines.push(`export interface ${name} {`, ...body, "}", "");
    }
  }

  const staleOverrides = Object.keys(OVERRIDES).filter((key) => !usedOverrides.has(key));
  if (staleOverrides.length) {
    die(
      `these OVERRIDES entries name a property no schema declares:\n  ${staleOverrides.join(
        "\n  ",
      )}\nDelete them.`,
    );
  }

  if (unresolved.length) {
    console.warn(
      `gen-printing-types: could not recover a type for ${unresolved.length} propert${
        unresolved.length === 1 ? "y" : "ies"
      }, emitted as unknown:\n  ${unresolved.join("\n  ")}`,
    );
  }

  mkdirSync(dirname(TARGET), { recursive: true });
  const interfaceCount = lines.filter((line) => line.startsWith("export interface")).length;
  writeFileSync(TARGET, `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`, "utf8");
  console.log(
    `gen-printing-types: wrote ${TARGET}\n` +
      `  ${vocabularies.size} vocabularies, ${interfaceCount} interfaces`,
  );
}

await main();
