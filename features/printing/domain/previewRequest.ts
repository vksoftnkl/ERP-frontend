/**
 * What Preview asks the renderer for.
 *
 * A pure function rather than four spread operators inside a screen, because
 * every clause in it is a RULE the server also enforces, and a rule that only
 * exists inside a component is a rule nothing can test.
 *
 * -- THE RULES ------------------------------------------------------------
 *
 * THE COMPANY IS NEVER SENT. It comes from the authenticated session. A render
 * reads a company's documents, and a caller-supplied company id would make the
 * preview endpoint a cross-tenant read with a friendly name. There is no field
 * for it here on purpose.
 *
 * THE BODY GOES ONLY WHEN THE REVISION IS EDITABLE. A published revision is
 * frozen so that `print_log.plg_version_id` can point at it truthfully, and the
 * server refuses an unsaved body against one. Rather than send a request that
 * will be refused, this sends none — the revision renders as stored, and the
 * dialog says so.
 *
 * AN UNSAVED REVISION CANNOT BE RENDERED. There is no row to point at. The
 * caller checks `canPreview` before offering the button.
 *
 * BLANKS ARE OMITTED, NOT SENT EMPTY. `docId: ""` would reach the server as a
 * uuid that fails validation; an absent docId is a render with no document,
 * which is a legitimate thing for a report to be.
 */

import { bodyFromDefinition } from "./canvasBridge";
import type { RenderPreviewRequest } from "@/features/printing/api/render";
import type { TemplateDefinition } from "@/features/print-designer/types/template-definition";

export type PreviewRequestInput = {
  /** The STORED revision's id. Absent for a design that has never been saved. */
  versionId: string | undefined;
  /** False for a PUBLISHED or RETIRED revision, which is frozen. */
  editable: boolean;
  /** The canvas's current design. */
  definition: TemplateDefinition;
  docId?: string;
  accYear?: string;
  branchId?: string;
  deviceId?: string;
  /** Omitted lets the engine decide: GRAPHIC → PDF, GRID → ESCPOS. */
  outputMode?: string;
  /**
   * The operator's answers to this revision's own prompts (`ptv_params`), by
   * name. Sent as given: the server validates each against the type the
   * revision declared, and refuses an answer to a prompt that does not exist —
   * which is almost always a spelling mistake worth hearing about.
   */
  params?: Record<string, string>;
};

/** True when there is something on the server for a render to point at. */
export const canPreview = (versionId: string | undefined): boolean => Boolean(versionId);

const trimmed = (value: string | undefined): string | undefined => {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : undefined;
};

export function buildPreviewRequest(input: PreviewRequestInput): RenderPreviewRequest {
  if (!input.versionId) {
    throw new Error(
      "This revision has not been saved yet, so there is nothing on the server to render.",
    );
  }

  const docId = trimmed(input.docId);
  const accYear = trimmed(input.accYear);
  const branchId = trimmed(input.branchId);
  const deviceId = trimmed(input.deviceId);
  const outputMode = trimmed(input.outputMode);

  // `bodyFromDefinition` is typed as PtvBodyInput, which allows the raw string
  // form the text column can hold. The preview endpoint takes a JSON object,
  // and a canvas definition is always one.
  //
  // The narrowing is a NAMED const rather than a `typeof` test inside the
  // spread below: control-flow narrowing does not survive being spread into an
  // object literal, so the inline form types as PtvBodyInput and fails the
  // build while reading as though it had worked. A cast would hide the string
  // case; this keeps it visible and unsent.
  const body = input.editable ? bodyFromDefinition(input.definition) : null;
  const jsonBody = body === null || typeof body === "string" ? null : body;

  return {
    versionId: input.versionId,
    ...(jsonBody ? { body: jsonBody } : {}),
    ...(docId ? { docId } : {}),
    ...(accYear ? { accYear } : {}),
    ...(branchId ? { branchId } : {}),
    ...(deviceId ? { deviceId } : {}),
    ...(outputMode ? { outputMode } : {}),
    // An empty object is omitted rather than sent: a revision that asks nothing
    // should produce a request that says nothing about parameters.
    ...(input.params && Object.keys(input.params).length > 0 ? { params: input.params } : {}),
  };
}
