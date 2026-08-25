"use client";

/**
 * Publish, clone and export — the file-level actions that are not Save.
 *
 * They live in a hook because three places need them: the document toolbar, the
 * File menu, and (for clone) the read-only banner a system template shows. Three
 * copies of "confirm the scope, then PUT set-default" is three chances for one
 * of them to skip the confirm.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getApiErrorMessage } from "@/store/api";
import {
  useClonePrintTemplateMutation,
  useLazyExportPrintTemplateQuery,
  useSetPrintTemplateDefaultMutation,
} from "@/features/print-designer/api/printTemplateApi";
import { metaPatched } from "@/features/print-designer/store/designerSlice";
import { selectMeta, selectTemplateId } from "@/features/print-designer/store/selectors";
import { printDesignerRoute } from "@/features/print-designer/routes";

export function useTemplateActions() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const meta = useAppSelector(selectMeta);
  const templateId = useAppSelector(selectTemplateId);

  const [setDefault, { isLoading: publishing }] = useSetPrintTemplateDefaultMutation();
  const [cloneTemplate, { isLoading: cloning }] = useClonePrintTemplateMutation();
  const [exportTemplate] = useLazyExportPrintTemplateQuery();

  /**
   * Promotion is not "save with a flag": it changes what prints at a counter the
   * next time anyone hits Ctrl+P, for a scope the user cannot see from here. So
   * the confirm names that scope in full rather than asking "are you sure?".
   */
  const publish = useCallback(async () => {
    if (!templateId) {
      toast.info("Save the template before publishing it.");
      return;
    }
    const scope = [
      meta.companyId ? "this company" : "every company",
      meta.branchId ? "this branch" : "every branch",
      meta.docType,
      String(meta.outputMode),
      meta.paperCode,
    ].join(" · ");
    if (!window.confirm(`Make "${meta.name}" the default for ${scope}?`)) {
      return;
    }
    try {
      const summary = await setDefault(templateId).unwrap();
      dispatch(metaPatched({ isDefault: summary.ptIsDefault }));
      toast.success("Published as the default.");
    } catch (error) {
      toast.error(getApiErrorMessage(error as never) ?? "Publish failed.");
    }
  }, [
    dispatch,
    meta.branchId,
    meta.companyId,
    meta.docType,
    meta.name,
    meta.outputMode,
    meta.paperCode,
    setDefault,
    templateId,
  ]);

  const clone = useCallback(async () => {
    if (!templateId) {
      return;
    }
    try {
      const copy = await cloneTemplate({
        ptId: templateId,
        body: { ptName: `${meta.name} (copy)` },
      }).unwrap();
      toast.success("Cloned into your company.");
      router.push(printDesignerRoute(copy.ptId));
    } catch (error) {
      toast.error(getApiErrorMessage(error as never) ?? "Clone failed.");
    }
  }, [cloneTemplate, meta.name, router, templateId]);

  const exportJson = useCallback(async () => {
    if (!templateId) {
      return;
    }
    try {
      const payload = await exportTemplate(templateId).unwrap();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${meta.name.replace(/[^A-Za-z0-9-_]+/g, "-").toLowerCase()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(getApiErrorMessage(error as never) ?? "Export failed.");
    }
  }, [exportTemplate, meta.name, templateId]);

  return { publish, publishing, clone, cloning, exportJson, templateId, meta };
}
