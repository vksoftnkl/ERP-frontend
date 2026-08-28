"use client";

/**
 * The Layout tab's canvas: `features/print-designer` driven by this module.
 *
 * The canvas is a complete band/element editor with no backend — every
 * `/reports/*` route it was written against answers 404. This screen is the
 * backend: it hands the canvas the working revision's body and datasets, and
 * saves what comes back into `versions[0].ptvBody` through the one call that
 * does work.
 *
 * IT NOW RENDERS TOO. `POST /print-render/preview` takes a REVISION ID, which
 * this screen knows and the canvas does not, so Preview is supplied as a host
 * capability rather than restored to the toolbar. The rules it enforces are the
 * server's own, stated here so the dialog does not have to discover them by
 * being refused:
 *
 *   * a revision that has never been saved has nothing to render — `ready`;
 *   * a DRAFT may preview the canvas's unsaved bands, a published one may not,
 *     because it is frozen so that `print_log` can point at it truthfully;
 *   * the paper and the datasets come from the revision either way, so a
 *     preview differs from a print by exactly the bands being edited.
 *
 * THE SAVE IS THE MODULE'S ORDINARY SAVE, with every trap it carries. It goes
 * through `buildSavePayload`, so the whole identity travels, the published
 * pointer is defended, and `datasets` are OMITTED — the canvas never edits the
 * dataset rows, and sending the array would replace a set it does not own.
 *
 * A PUBLISHED revision opens read-only. The canvas stays fully interactive so a
 * live design can be inspected and measured; only saving is refused, and the
 * way forward is a new draft, exactly as on the Layout tab.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";

import { getApiErrorMessage } from "@/store/api";
import DesignerShell from "@/features/print-designer/components/DesignerShell";
import { CanvasHostProvider } from "@/features/print-designer/host/canvas-host";
import type {
  CanvasPreview,
  CanvasPreviewRequest,
} from "@/features/print-designer/host/canvas-host";
import type { TemplateDefinition } from "@/features/print-designer/types/template-definition";
import { useBusinessContext } from "@/components/layout/business-context";
import { useRenderPrintPreviewMutation } from "@/features/printing/api/render";
import { buildPreviewRequest, canPreview } from "@/features/printing/domain/previewRequest";
import { useSavePrintingTemplateMutation } from "@/features/printing/api/templates";
import { buildSavePayload } from "@/features/printing/domain/buildSavePayload";
import {
  bodyFromDefinition,
  toProviderDescriptors,
  toTemplateDefinition,
} from "@/features/printing/domain/canvasBridge";
import { useDesigner } from "./useDesigner";
import { printingDesignerRoute } from "@/features/printing/routes";
import styles from "@/features/printing/printing.module.scss";

export default function LayoutCanvasScreen({ ptlId }: { ptlId: string }) {
  const router = useRouter();
  // Which revision the Designer was pointing at when the canvas was opened.
  const revId = useSearchParams().get("rev");
  const designer = useDesigner(ptlId, revId);
  const { draft, editable, workingStored } = designer;
  const [saveTemplate] = useSavePrintingTemplateMutation();
  const [renderPreview] = useRenderPrintPreviewMutation();
  // The branch and accounting year the operator is signed in to. The company is
  // NOT sent — the server takes it from the session, because a render reads a
  // company's documents and a caller-supplied company would make the endpoint a
  // cross-tenant read with a friendly name.
  const { activeBranch, activeFiscalYear } = useBusinessContext();
  // Read out here rather than inside the memo: the React Compiler infers a
  // dependency on `activeBranch` itself from a `activeBranch?.id` read, and a
  // dependency list that disagrees with what it infers turns the memo off.
  const branchId = activeBranch?.id;
  const sessionAccYear = activeFiscalYear?.name?.trim();
  /** Bumped after a save so the canvas re-seeds from what the server stored. */
  const [generation, setGeneration] = useState(0);

  const working = draft.working;

  const definition = useMemo(() => toTemplateDefinition(working), [working]);
  const datasets = useMemo(() => toProviderDescriptors(working.datasets), [working.datasets]);

  const close = useCallback(() => {
    router.push(printingDesignerRoute(ptlId));
  }, [ptlId, router]);

  const onSave = useCallback(
    async (next: TemplateDefinition) => {
      /*
       * `includeDatasets: false` OMITS the key. The canvas edits the body and
       * nothing else; sending `datasets` would replace the revision's set with
       * whatever this screen happened to be holding, and sending `[]` would
       * delete every one of them.
       */
      await saveTemplate(
        buildSavePayload(
          { ...draft, working: { ...working, ptvBody: bodyFromDefinition(next) } },
          { includeDatasets: false, preservePublishedRevId: true },
        ),
      )
        .unwrap()
        .then(() => {
          toast.success("Layout saved.");
          setGeneration((current) => current + 1);
        })
        .catch((thrown) => {
          toast.error(getApiErrorMessage(thrown as never) ?? "Could not save the layout.");
          // Rethrown so the canvas keeps the draft dirty — nothing is lost when
          // a save is refused.
          throw thrown;
        });
    },
    [draft, saveTemplate, working],
  );

  /**
   * Rendering, as the host offers it.
   *
   * `versionId` is the STORED revision's id, never the draft's: a revision that
   * has not been saved has no row, and there is nothing on the server to point
   * a render at. The button stays visible and says so rather than vanishing
   * between one save and the next.
   *
   * The body is sent only when the revision is editable — a published revision
   * is frozen, and the server refuses an unsaved body against it by design. In
   * that case this sends no body at all and the dialog says the preview shows
   * the stored design, which is the truthful reading rather than an error.
   */
  const previewHost: CanvasPreview | undefined = useMemo(() => {
    const versionId = workingStored?.ptvId;

    return {
      ready: canPreview(versionId),
      notReadyReason:
        "This revision has not been saved yet, so there is nothing on the server to render. " +
        "Save the layout first.",
      previewsUnsaved: editable,
      defaults: { accYear: sessionAccYear },
      /*
       * What this revision asks its operator, straight from `ptv_params`.
       *
       * The declaration lives on the VERSION because the operator is asked ONCE
       * for the whole render — if one dataset declared `from_date` as a required
       * DATE and another as optional TEXT there would be no answer to what the
       * screen should ask. So the prompts the Data tab edits are exactly the
       * prompts Preview shows, and a required one left blank is refused by the
       * server under this same label.
       */
      prompts: working.ptvParams.map((parameter) => ({
        name: parameter.name,
        label: parameter.label?.trim() || parameter.name,
        type: parameter.type,
        required: parameter.required === true,
      })),
      // Every rule about WHAT to send — no company ever, a body only while the
      // revision is editable, blanks omitted rather than sent empty — is in
      // `buildPreviewRequest`, where it can be tested.
      render: async (request: CanvasPreviewRequest) =>
        renderPreview(
          buildPreviewRequest({
            versionId,
            editable,
            definition: request.definition,
            docId: request.docId,
            accYear: request.accYear,
            params: request.params,
            branchId,
            outputMode: request.outputMode,
          }),
        ).unwrap(),
    };
  }, [
    branchId,
    editable,
    renderPreview,
    sessionAccYear,
    working.ptvParams,
    workingStored?.ptvId,
  ]);

  if (designer.isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.body}>
          <p className={styles.muted}>Loading the design…</p>
        </div>
      </div>
    );
  }

  if (designer.readError) {
    return (
      <div className={styles.page}>
        <div className={styles.body}>
          <p className={styles.muted}>{designer.readError}</p>
          <div>
            <button type="button" className={styles.btn} onClick={close}>
              Back to the design
            </button>
          </div>
        </div>
      </div>
    );
  }

  const revLabel = workingStored
    ? `rev ${workingStored.ptvRevNo} · ${workingStored.ptvStatus}`
    : "unsaved draft";

  return (
    <CanvasHostProvider
      host={{
        label: `${draft.ptlName || "Untitled"} · ${revLabel} · ${working.ptvEngine}`,
        readOnly: !editable,
        readOnlyReason:
          "This revision is published and cannot be edited. Start a new draft from the Template tab.",
        onSave,
        onClose: close,
        preview: previewHost,
      }}
    >
      <DesignerShell
        mode="EMBEDDED"
        seedKey={`${ptlId}:${working.ptvId ?? "new"}:${generation}`}
        draft={{
          name: draft.ptlName,
          // The canvas shows these; the printing module owns them, and they are
          // edited on the Template tab.
          docType: draft.ptlCode,
          outputMode: working.ptvEngine,
          paperCode: working.ptvPaperCode,
        }}
        definition={definition}
        datasets={datasets}
      />
    </CanvasHostProvider>
  );
}
