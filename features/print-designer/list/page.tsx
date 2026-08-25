"use client";

/**
 * Settings → Print templates.
 *
 * Built on the same `CrudMasterPage` shell every master page uses, so it
 * inherits the identical header, icon toolbar, table, delete confirmation,
 * pagination and keyboard behaviour rather than carrying a second, private
 * idea of what a list screen looks like.
 *
 * Three things differ from an ordinary master page, all forced by what a print
 * template is:
 *
 *   * A template is not editable in a modal form — it is drawn. Add, Edit and
 *     the read gesture therefore hand off (`onCreateAction` / `onEditAction` /
 *     `onViewAction`) to the paper-setup dialog and the designer, and the
 *     shell's own form never opens.
 *   * System templates (ptCompanyId null) are shipped designs shared by every
 *     tenant. They cannot be edited or deleted, so Edit and Delete go inactive
 *     on them and their row offers Clone where the others offer Design — the
 *     read-only state is visible before the user has invested any work in it.
 *   * `/reports/templates` returns the whole collection at once and its query
 *     DTO rejects any parameter it does not declare, so `page`, `limit` and
 *     `search` cannot be sent. `clientSideList` has the shell filter and slice
 *     the rows itself; `buildListQuery` sends only the filters the endpoint
 *     actually understands (doc type, mode, paper, includeSystem, activeOnly),
 *     which is why those stay server-side — re-filtering a fetched page in the
 *     client would quietly show fewer rows than the tenant has.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import CrudMasterPage from "@/components/master/crud-master-page";
import type {
  CrudMasterTableRow,
  MasterTableRow,
} from "@/components/master/crud-master-page.types";
import type { ReusableTableColumn } from "@/components/ui/table";
import { ErpActionIcon } from "@/components/design-system/icons/erp-action-icons";
import { getApiErrorMessage } from "@/store/api";
import masterStyles from "@/app/master/state-master/page.module.scss";
import {
  useClonePrintTemplateMutation,
  useGetPrintDatasetsQuery,
  useGetPrintTemplateSchemaQuery,
  useImportPrintTemplateMutation,
  useLazyExportPrintTemplateQuery,
  useSetPrintTemplateDefaultMutation,
} from "@/features/print-designer/api/printTemplateApi";
import { OUTPUT_MODES, PAPER_PRESETS } from "@/features/print-designer/lib/vocabulary";
import { newPrintDesignerRoute, printDesignerRoute } from "@/features/print-designer/routes";
import PaperSetupDialog from "@/features/print-designer/components/PaperSetupDialog";
import styles from "./page.module.scss";

const TEMPLATES_ENDPOINT = "/reports/templates";

/**
 * `getById` and `create` are never reached — the designer replaces the shell's
 * form on both paths — and `delete` is rewritten per row by
 * `buildDeleteRequest`, because a template is removed by path
 * (`DELETE /reports/templates/:ptId`) rather than by query id.
 */
const API_ENDPOINTS = {
  list: TEMPLATES_ENDPOINT,
  getById: TEMPLATES_ENDPOINT,
  create: TEMPLATES_ENDPOINT,
  delete: TEMPLATES_ENDPOINT,
} as const;

/**
 * A template has no code / short / alias column of its own, so these name the
 * nearest identifying fields. They matter for the delete-confirmation label
 * (`masterName || masterCode || masterId`) and for search, which reads them
 * alongside the raw record.
 */
const LOOKUP_KEYS = {
  id: ["ptId"],
  code: ["ptDocType"],
  name: ["ptName"],
  short: ["ptOutputMode"],
  alias: ["ptPaperCode"],
  active: ["ptIsActive"],
  array: ["data", "items", "rows", "results", "list"],
} as const;

/** Only `id` is used — the shell's form, which owns the rest, never opens here. */
const REQUEST_PAYLOAD_KEYS = {
  id: "ptId",
  name: "ptName",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

const TIMESTAMP = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

function sourceValue(row: MasterTableRow, key: string): unknown {
  return (row.__source ?? {})[key];
}

function asText(row: MasterTableRow, key: string): string {
  const value = sourceValue(row, key);
  return value === null || value === undefined ? "" : String(value);
}

function asFlag(row: MasterTableRow, key: string): boolean {
  const value = asText(row, key).trim().toLowerCase();
  return value === "true" || value === "t" || value === "1";
}

function isSystemTemplate(row: MasterTableRow): boolean {
  return asFlag(row, "isSystemTemplate");
}

function templateId(row: MasterTableRow): string {
  return asText(row, "ptId");
}

function formatTimestamp(value: string): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}

function updatedAt(row: MasterTableRow): string {
  return asText(row, "ptModifiedOn") || asText(row, "ptCreatedOn");
}

type TemplateFilters = {
  ptDocType: string;
  ptOutputMode: string;
  ptPaperCode: string;
  includeSystem: boolean;
  activeOnly: boolean;
};

const INITIAL_FILTERS: TemplateFilters = {
  ptDocType: "",
  ptOutputMode: "",
  ptPaperCode: "",
  includeSystem: true,
  activeOnly: true,
};

export default function PrintTemplatesPage() {
  const router = useRouter();

  const [filters, setFilters] = useState<TemplateFilters>(INITIAL_FILTERS);
  const [setupOpen, setSetupOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: vocabulary } = useGetPrintTemplateSchemaQuery();
  const { data: providers } = useGetPrintDatasetsQuery();

  const [cloneTemplate] = useClonePrintTemplateMutation();
  const [setDefault] = useSetPrintTemplateDefaultMutation();
  const [importTemplate] = useImportPrintTemplateMutation();
  const [exportTemplate] = useLazyExportPrintTemplateQuery();

  const papers = vocabulary?.papers ?? PAPER_PRESETS;
  const modes = vocabulary?.outputModes ?? OUTPUT_MODES;

  /*
   * The document types the engine has data for, not the ones the current page
   * happens to show: filtering to a type is how you find out a tenant has no
   * template for it yet, and a list derived from the rows could never offer it.
   */
  const docTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const provider of providers ?? []) {
      for (const docType of provider.docTypes) {
        seen.add(docType);
      }
    }
    return [...seen].sort();
  }, [providers]);

  const patchFilter = useCallback((patch: Partial<TemplateFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  /*
   * Only what `GetTemplatesQueryDto` declares. The shell's search term, page
   * and page size are deliberately dropped: the endpoint whitelists its query
   * and would answer 400 for any of them, so `clientSideList` handles all three
   * over the rows this returns.
   */
  const buildListQuery = useCallback(
    (): Record<string, string> => ({
      ...(filters.ptDocType ? { ptDocType: filters.ptDocType } : {}),
      ...(filters.ptOutputMode ? { ptOutputMode: filters.ptOutputMode } : {}),
      ...(filters.ptPaperCode ? { ptPaperCode: filters.ptPaperCode } : {}),
      includeSystem: String(filters.includeSystem),
      activeOnly: String(filters.activeOnly),
    }),
    [filters],
  );

  const handleClone = useCallback(
    async (row: MasterTableRow) => {
      try {
        const clone = await cloneTemplate({
          ptId: templateId(row),
          body: { ptName: `${row.masterName} (copy)` },
        }).unwrap();
        toast.success("Cloned into your company.");
        router.push(printDesignerRoute(clone.ptId));
      } catch (cloneError) {
        toast.error(getApiErrorMessage(cloneError as never) ?? "Clone failed.");
      }
    },
    [cloneTemplate, router],
  );

  const handleSetDefault = useCallback(
    async (row: MasterTableRow) => {
      const scope = [
        asText(row, "ptDocType"),
        asText(row, "ptOutputMode"),
        asText(row, "ptPaperCode"),
      ].join(" · ");
      if (!window.confirm(`Make "${row.masterName}" the default for ${scope}?`)) {
        return;
      }
      try {
        await setDefault(templateId(row)).unwrap();
        toast.success("Default updated.");
      } catch (defaultError) {
        toast.error(getApiErrorMessage(defaultError as never) ?? "Could not set the default.");
      }
    },
    [setDefault],
  );

  const handleExport = useCallback(
    async (row: MasterTableRow) => {
      try {
        const payload = await exportTemplate(templateId(row)).unwrap();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${row.masterName.replace(/[^A-Za-z0-9-_]+/g, "-").toLowerCase()}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
      } catch (exportError) {
        toast.error(getApiErrorMessage(exportError as never) ?? "Export failed.");
      }
    },
    [exportTemplate],
  );

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const payload = JSON.parse(await file.text()) as Record<string, unknown>;
        const imported = await importTemplate({ payload }).unwrap();
        toast.success("Template imported.");
        router.push(printDesignerRoute(imported.ptId));
      } catch (importError) {
        toast.error(
          getApiErrorMessage(importError as never) ??
            "That file is not an exported print template.",
        );
      }
    },
    [importTemplate, router],
  );

  const openDesigner = useCallback(
    (row: MasterTableRow) => {
      router.push(printDesignerRoute(templateId(row)));
    },
    [router],
  );

  const columns = useMemo<ReusableTableColumn<CrudMasterTableRow>[]>(
    () => [
      { key: "serialNo", header: "S.No", accessor: "serialNo", width: "56px", sortable: false },
      {
        key: "ptName",
        header: "Name",
        width: "260px",
        accessor: "masterName",
        render: (row) => (
          <span className={styles.nameCell}>
            <span>{row.masterName}</span>
            {asFlag(row, "ptIsDefault") ? (
              <span className={`${styles.badge} ${styles.badgeDefault}`}>default</span>
            ) : null}
            {isSystemTemplate(row) ? (
              <span className={`${styles.badge} ${styles.badgeSystem}`}>system</span>
            ) : null}
            {asFlag(row, "ptIsActive") ? null : <span className={styles.badge}>inactive</span>}
          </span>
        ),
      },
      {
        key: "ptDocType",
        header: "Document",
        width: "160px",
        render: (row) => asText(row, "ptDocType"),
        sortAccessor: (row) => asText(row, "ptDocType"),
        searchAccessor: (row) => asText(row, "ptDocType"),
      },
      {
        key: "ptOutputMode",
        header: "Mode",
        width: "120px",
        render: (row) => asText(row, "ptOutputMode"),
        sortAccessor: (row) => asText(row, "ptOutputMode"),
        searchAccessor: (row) => asText(row, "ptOutputMode"),
      },
      {
        key: "ptPaperCode",
        header: "Paper",
        width: "100px",
        render: (row) => asText(row, "ptPaperCode"),
        sortAccessor: (row) => asText(row, "ptPaperCode"),
        searchAccessor: (row) => asText(row, "ptPaperCode"),
      },
      {
        key: "ptVersion",
        header: "Ver",
        width: "70px",
        align: "right",
        render: (row) => `v${asText(row, "ptVersion")}`,
        sortAccessor: (row) => Number(asText(row, "ptVersion")) || 0,
      },
      {
        key: "ptModifiedOn",
        header: "Updated",
        width: "180px",
        render: (row) => formatTimestamp(updatedAt(row)),
        sortAccessor: (row) => updatedAt(row),
      },
      {
        key: "actions",
        header: "Actions",
        width: "230px",
        sortable: false,
        render: (row) => (
          <span className={styles.rowActions}>
            {isSystemTemplate(row) ? null : (
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => openDesigner(row)}
              >
                Design
              </button>
            )}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => void handleClone(row)}
            >
              Clone
            </button>
            <button
              type="button"
              className={styles.linkButton}
              disabled={asFlag(row, "ptIsDefault")}
              title={asFlag(row, "ptIsDefault") ? "Already the default for its scope" : undefined}
              onClick={() => void handleSetDefault(row)}
            >
              Set default
            </button>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => void handleExport(row)}
            >
              Export
            </button>
          </span>
        ),
      },
    ],
    [handleClone, handleExport, handleSetDefault, openDesigner],
  );

  return (
    <>
      <CrudMasterPage
        // Singular: the shell reads this back in "Delete {title}?". The list
        // heading is `listTitle`, which stays plural.
        title="Print Template"
        entityLabel="print template"
        entityLabelPlural="print templates"
        apiEndpoints={API_ENDPOINTS}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        listTitle="Print Templates"
        listSubtitleOverride="Designs for invoices, receipts and statements — the desktop app prints through these too."
        createLabel="New Template"
        searchPlaceholder="Search by name, document, mode or paper..."
        listEmptyText="No templates yet. Create one to get started."
        customTableColumns={columns}
        buildListQuery={buildListQuery}
        clientSideList
        enableGridSettingsContextMenu={false}
        // The template's whole identity is its path segment; the shell's own
        // `?ptId=` query rides along and the route ignores it.
        buildDeleteRequest={({ deleteId }) => ({
          url: `${TEMPLATES_ENDPOINT}/${deleteId}`,
        })}
        onCreateAction={() => setSetupOpen(true)}
        // A shipped design has no company to save into: the server refuses both
        // the PUT and the DELETE, so neither toolbar button is offered.
        isRowEditDisabled={isSystemTemplate}
        rowEditDisabledReason="Shipped templates cannot be edited — clone one first"
        isRowDeleteDisabled={isSystemTemplate}
        rowDeleteDisabledReason="Shipped templates cannot be deleted"
        onEditAction={openDesigner}
        // Ctrl+Enter and double-click open the design to be READ. A template
        // does not fit the shell's view modal — it is a canvas — so it opens the
        // designer instead. A shipped one says why nothing happened: the chord
        // has no greyed-out affordance the way the toolbar button does.
        onViewAction={(row) => {
          if (isSystemTemplate(row)) {
            toast.info("This is a shipped template — clone it to open it in the designer.");
            return;
          }
          openDesigner(row);
        }}
        toolbarActions={
          <>
            <button
              type="button"
              className={`${masterStyles.iconBtn} ${masterStyles.iconBtnImport} erp-ms-tbtn`}
              onClick={() => fileInputRef.current?.click()}
              title="Import an exported template JSON"
            >
              <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
                <ErpActionIcon name="import" />
              </span>
              <span>Import JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className={styles.hiddenInput}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  void handleImportFile(file);
                }
              }}
            />
          </>
        }
        toolbarContent={
          <>
            <label className={masterStyles.filterGroup}>
              <span className={masterStyles.filterLabel}>Document</span>
              <select
                className={styles.filterSelect}
                value={filters.ptDocType}
                onChange={(event) => patchFilter({ ptDocType: event.target.value })}
              >
                <option value="">All</option>
                {docTypes.map((docType) => (
                  <option key={docType} value={docType}>
                    {docType}
                  </option>
                ))}
              </select>
            </label>
            <label className={masterStyles.filterGroup}>
              <span className={masterStyles.filterLabel}>Mode</span>
              <select
                className={styles.filterSelect}
                value={filters.ptOutputMode}
                onChange={(event) => patchFilter({ ptOutputMode: event.target.value })}
              >
                <option value="">All</option>
                {modes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            <label className={masterStyles.filterGroup}>
              <span className={masterStyles.filterLabel}>Paper</span>
              <select
                className={styles.filterSelect}
                value={filters.ptPaperCode}
                onChange={(event) => patchFilter({ ptPaperCode: event.target.value })}
              >
                <option value="">All</option>
                {papers.map((paper) => (
                  <option key={paper.code} value={paper.code}>
                    {paper.code}
                  </option>
                ))}
              </select>
            </label>
            <div className={masterStyles.filterCheckGroup}>
              <label className={masterStyles.filterCheckLabel}>
                <input
                  type="checkbox"
                  checked={filters.includeSystem}
                  onChange={(event) => patchFilter({ includeSystem: event.target.checked })}
                />
                Include shipped
              </label>
              <label className={`${masterStyles.filterCheckLabel} ${styles.checkSpacer}`}>
                <input
                  type="checkbox"
                  checked={filters.activeOnly}
                  onChange={(event) => patchFilter({ activeOnly: event.target.checked })}
                />
                Active only
              </label>
            </div>
          </>
        }
      />

      <PaperSetupDialog
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onConfirm={(result) => {
          setSetupOpen(false);
          router.push(
            newPrintDesignerRoute({
              docType: result.docType,
              paper: result.paperCode,
              mode: result.outputMode,
              name: result.name,
            }),
          );
        }}
      />
    </>
  );
}
