"use client";

/**
 * Saving, in one place.
 *
 * Both the Save button and Ctrl+S need it, and two copies of "create when there
 * is no id, update when there is, then replace the route" is exactly the kind of
 * duplication that ends with one path forgetting to `router.replace` and a
 * refresh reopening a blank draft.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getApiErrorMessage } from "@/store/api";
import {
  useCreatePrintTemplateMutation,
  useUpdatePrintTemplateMutation,
} from "@/features/print-designer/api/printTemplateApi";
import { templateSaved } from "@/features/print-designer/store/designerSlice";
import {
  selectCanSave,
  selectDefinition,
  selectMeta,
  selectProblemCounts,
  selectTemplateId,
} from "@/features/print-designer/store/selectors";
import { printDesignerRoute } from "@/features/print-designer/routes";

export function useTemplateSave() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const meta = useAppSelector(selectMeta);
  const definition = useAppSelector(selectDefinition);
  const templateId = useAppSelector(selectTemplateId);
  const canSave = useAppSelector(selectCanSave);
  const counts = useAppSelector(selectProblemCounts);

  const [createTemplate, { isLoading: creating }] = useCreatePrintTemplateMutation();
  const [updateTemplate, { isLoading: updating }] = useUpdatePrintTemplateMutation();

  const save = useCallback(async () => {
    if (meta.isSystemTemplate) {
      toast.info("System templates are read-only. Clone it to make changes.");
      return;
    }
    if (counts.errors > 0) {
      toast.error("Fix the problems first — the server would reject this definition.");
      return;
    }
    if (!meta.name.trim()) {
      toast.error("Give the template a name before saving.");
      return;
    }

    try {
      if (templateId) {
        const saved = await updateTemplate({
          ptId: templateId,
          body: { ptName: meta.name, definition },
        }).unwrap();
        dispatch(templateSaved(saved));
        toast.success(`Saved version ${saved.ptVersion}`);
        return;
      }

      const created = await createTemplate({
        ptDocType: meta.docType,
        ptOutputMode: String(meta.outputMode),
        ptPaperCode: meta.paperCode,
        ptName: meta.name,
        definition,
      }).unwrap();
      dispatch(templateSaved(created));
      toast.success("Template created");
      // Leave /new behind so a refresh reopens the saved template.
      router.replace(printDesignerRoute(created.ptId));
    } catch (error) {
      toast.error(getApiErrorMessage(error as never) ?? "Save failed.");
    }
  }, [
    counts.errors,
    createTemplate,
    definition,
    dispatch,
    meta.docType,
    meta.isSystemTemplate,
    meta.name,
    meta.outputMode,
    meta.paperCode,
    router,
    templateId,
    updateTemplate,
  ]);

  return { save, saving: creating || updating, canSave };
}
