"use client";

/**
 * LAYOUT tab -- `versions[0].ptvBody`, the design itself.
 *
 * TWO EDITORS OVER ONE BODY: a canvas, and this text area. Both write the same
 * `ptvBody`, and neither replaces the other -- the canvas is for laying bands
 * out, the text for what an editor cannot express: a hand-written expression, a
 * paste from another design, or a body the canvas cannot parse at all.
 *
 * The canvas is `features/print-designer`, hosted by this module. That designer
 * has no backend of its own -- every `/reports/*` route it was written against
 * answers 404 -- so this module supplies one. `domain/canvasBridge.ts` is the
 * translation and says which side owns what.
 *
 * -- WHAT STILL DOES NOT HAPPEN HERE ---------------------------------------
 *
 * RENDERING. It is server-side, and that is the point of the subsystem. 3.0's
 * every template existed twice -- a Linux one and a Windows one, identical SQL
 * and two XMLs to keep in step -- only because QtRPT rendered on the CLIENT and
 * `pstyl_platform` had to exist. So there is no jsPDF, no pdfmake, and no
 * `window.print()` of a hidden div: the canvas lays a design out, and the server
 * is still the only thing that turns one into paper.
 */

import { useMemo } from "react";
import Link from "next/link";

import { PTV_JSON_ENGINE } from "@/features/printing/types/printing";
import { isTemplateDefinition } from "@/features/printing/domain/canvasBridge";
import { printingLayoutCanvasRoute } from "@/features/printing/routes";
import type { DesignerController } from "../useDesigner";
import { Note, SectionHead } from "@/features/printing/components/screen-shell";
import styles from "@/features/printing/printing.module.scss";

/** What the editor shows: the body as text, whatever the engine. */
function bodyAsText(body: unknown): string {
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return "";
  }
}

export default function LayoutTab({ designer }: { designer: DesignerController }) {
  const { draft, editable, patchWorking, workingStored } = designer;
  const working = draft.working;
  const isJson = working.ptvEngine === PTV_JSON_ENGINE;

  const text = useMemo(() => bodyAsText(working.ptvBody), [working.ptvBody]);
  /** Whether the canvas would open on this body, or on an empty design. */
  const canvasReady = isTemplateDefinition(working.ptvBody);

  const problem = useMemo(() => {
    if (!isJson || typeof working.ptvBody !== "string") return null;
    // Held as a string while the engine says JSON: either it is being typed and
    // has not parsed yet, or it is stored text the server could not parse.
    try {
      const parsed: unknown = JSON.parse(working.ptvBody);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? null
        : "ck_ptv_body_is_json wants an OBJECT — an array or a scalar is refused.";
    } catch {
      return "This is not valid JSON, and a JSON_BANDS body must parse.";
    }
  }, [isJson, working.ptvBody]);

  return (
    <section className={styles.section}>
      <SectionHead
        title="The layout"
        table="ptv_body"
        qualifier={workingStored ? `rev ${workingStored.ptvRevNo}` : "this draft"}
        slice="versions[0].ptvBody"
      />

      <Note>
        {isJson
          ? "A JSON_BANDS body is an object of bands. Bands point at datasets BY NUMBER — the Data tab is where those numbers live."
          : `A ${working.ptvEngine} body is text and is stored exactly as typed.`}{" "}
        Rendering happens on the server; nothing here draws the page.
      </Note>

      {/*
        The canvas. It edits the SAME body this text area holds, so both are
        offered rather than one replacing the other: the canvas for laying bands
        out, the text for the cases an editor cannot express — a hand-written
        expression, a paste from another design, a body the canvas cannot parse.
      */}
      {designer.draft.ptlId ? (
        <div className={styles.toolbar}>
          <Link
            // The revision the rail is pointing at, not whatever is newest.
            href={printingLayoutCanvasRoute(designer.draft.ptlId, working.ptvId)}
            className={styles.btnPrimary}
            style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}
          >
            {editable ? "Open the canvas" : "Open the canvas (read only)"}
          </Link>
          <span className={styles.muted}>
            {canvasReady
              ? "Drag bands and fields instead of editing this JSON."
              : "Opens on an empty design — this body is not a band layout yet, and saving from the canvas replaces it."}
          </span>
        </div>
      ) : (
        <Note tone="amber">
          Save the design once before opening the canvas — it edits a stored revision.
        </Note>
      )}

      <textarea
        className={`${styles.textarea} ${styles.textareaTall}`}
        value={text}
        disabled={!editable}
        spellCheck={false}
        data-uppercase="off"
        onChange={(event) => {
          const next = event.target.value;
          if (!isJson) {
            patchWorking({ ptvBody: next });
            return;
          }
          /*
           * Keep the typed text as the source of truth while it is being edited,
           * and promote it to an object only when it parses. Re-serialising on
           * every keystroke would fight the cursor; parsing eagerly would throw
           * away half-typed JSON.
           */
          try {
            const parsed: unknown = JSON.parse(next);
            patchWorking({
              ptvBody:
                typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
                  ? (parsed as Record<string, unknown>)
                  : next,
            });
          } catch {
            patchWorking({ ptvBody: next });
          }
        }}
      />

      {problem ? <Note tone="amber">{problem}</Note> : null}
    </section>
  );
}
