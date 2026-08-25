"use client";

/**
 * `/print-designer/new` — a template that does not exist on the server yet.
 *
 * The definition is built here, from the paper preset in the query string, and
 * handed to the shell as a draft. It is only written to the database when the
 * user saves, which is what lets someone open the designer, decide the paper
 * was wrong and walk away without leaving a row behind.
 *
 * The dataset catalogue is awaited before the shell mounts, and that wait is the
 * point: the starter definition binds the document type's providers and points
 * the DETAIL band at the collection it repeats over. Seeding an empty template
 * first and binding afterwards would open the designer on a validation error
 * ("DETAIL requires a dataset") that the user did not cause and has no obvious
 * way to clear.
 */

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  useGetPrintDatasetsQuery,
  useGetPrintTemplateSchemaQuery,
} from "@/features/print-designer/api/printTemplateApi";
import { getApiErrorMessage } from "@/store/api";
import {
  PAPER_PRESETS,
  defaultOutputModeForPaper,
  findPaperPreset,
} from "@/features/print-designer/lib/vocabulary";
import { createStarterDefinition } from "@/features/print-designer/lib/defaults";
import DesignerShell from "@/features/print-designer/components/DesignerShell";
import styles from "@/features/print-designer/components/designer.module.scss";

export default function NewPrintTemplatePage() {
  const search = useSearchParams();

  const paperCode = search?.get("paper") ?? "A4";
  const docType = (search?.get("docType") ?? "SALE_INVOICE").toUpperCase();
  const name = search?.get("name") ?? "Untitled template";

  const { data: vocabulary } = useGetPrintTemplateSchemaQuery();
  const {
    data: providers,
    isLoading: loadingProviders,
    error: providersError,
  } = useGetPrintDatasetsQuery(docType);

  const presets = vocabulary?.papers ?? PAPER_PRESETS;
  const preset = findPaperPreset(paperCode, presets) ?? presets[0];

  const definition = useMemo(
    () =>
      providers
        ? createStarterDefinition({
            preset,
            docType,
            templateName: name,
            providers,
          })
        : null,
    [docType, name, preset, providers],
  );

  if (providersError) {
    return (
      <div className={styles.page}>
        <div className={styles.centerState}>
          <h1>The dataset catalogue could not be loaded</h1>
          <p>{getApiErrorMessage(providersError)}</p>
          <p>A template cannot be started without it — it is where the fields come from.</p>
        </div>
      </div>
    );
  }

  if (!definition || loadingProviders) {
    return (
      <div className={styles.page}>
        <div className={styles.centerState}>
          <p>Preparing the template…</p>
        </div>
      </div>
    );
  }

  return (
    <DesignerShell
      mode="NEW"
      draft={{
        name,
        docType,
        outputMode: search?.get("mode") ?? defaultOutputModeForPaper(preset),
        paperCode: preset.code,
      }}
      definition={definition}
    />
  );
}
