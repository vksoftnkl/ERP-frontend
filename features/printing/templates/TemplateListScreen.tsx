"use client";

/**
 * Settings -> Printing -> Templates (menu 62), on the house `CrudMasterPage`
 * over the registered grid `MAIN LIST - PRINT TEMPLATES` -- the same grid Qt's
 * `PrintTemplateList` reads, so both front ends share one column definition
 * that Grid Master can edit.
 *
 * It used to be a custom table over `/print-templates/list`, with a client-side
 * "used by" fan-out over `/print-assignments/list`, client paging and a
 * client-side "not published" filter (the query booleans could not say false).
 * All of that is the grid's SQL now: `used_by` is computed there, the filters
 * are tokens, paging and search are the shell's.
 *
 * What the grid cannot do stays here:
 *  - the pills (owner, state, active), through `COLUMN_RENDER_OVERRIDES`;
 *  - open / new, which navigate to the designer rather than open the shell's
 *    popup (`onEditAction` / `onViewAction` / `onCreateAction`);
 *  - Clone, which needs the whole design (the grid row carries no revisions),
 *    so it reads `/print-templates/get` first -- the old screen's clone, unchanged;
 *  - Retire, the old `/print-templates/delete`. A shipped design (no company)
 *    is refused up front, with the reason, instead of through a server error.
 *
 * `ptlPublishedRevId` is a POINTER, not "the newest revision": a design whose
 * pointer is null resolves for nobody. The State pill and the hint line make
 * that visible here rather than at a till.
 */

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { toast } from "@/lib/notify";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { getApiErrorMessage } from "@/store/api";
import {
  useDeletePrintingTemplateMutation,
  useLazyGetPrintingTemplateQuery,
  useSavePrintingTemplateMutation,
} from "@/features/printing/api/templates";
import { useGetPrintPurposeOptionsQuery } from "@/features/printing/api/purposes";
import { buildSavePayload } from "@/features/printing/domain/buildSavePayload";
import { newDraftFrom, toDesignerDraft } from "@/features/printing/domain/draft";
import { purposeLabel } from "@/features/printing/domain/purposes";
import {
  NEW_PRINTING_TEMPLATE_ROUTE,
  PRINTING_TEMPLATES_ROUTE,
  printingDesignerRoute,
} from "@/features/printing/routes";
import { PTV_ENGINE_VALUES } from "@/features/printing/types/printing";
import {
  INITIAL_TEMPLATE_FILTERS,
  isInactiveRow,
  retireRefusal,
  rowNotes,
  templateGridParams,
  text,
  type TemplateGridRow,
  type TemplateListFilters,
} from "./templateList";
import styles from "./templateList.module.scss";

const HREF = PRINTING_TEMPLATES_ROUTE;

// The shell's own form never opens here (open / new navigate, Retire is the
// page's own request); these only satisfy its contract.
const API_ENDPOINTS = {
  getById: "/print-templates/get",
  create: "/print-templates/create",
  delete: "/print-templates/delete",
} as const;

const LOOKUP_KEYS = {
  id: ["ptl_id"],
  code: ["ptl_code"],
  name: ["ptl_name"],
  short: [],
  alias: [],
  active: ["ptl_is_active"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "ptlId",
  name: "ptl_name",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

const NO_TENANT_ID = "";

function sourceOf(row: MasterTableRow | null | undefined): TemplateGridRow | null {
  return (row?.__source as TemplateGridRow | undefined) ?? null;
}

function Pill({ tone, title, children }: { tone: string; title?: string; children: ReactNode }) {
  return (
    <span className={`${styles.pill} ${tone}`} title={title}>
      {children}
    </span>
  );
}

/*
 * Same meaning as Qt's badge colours: SHIPPED neutral, OWN blue; PUBLISHED
 * green, NOT PUBLISHED amber (a design only a draft backs); Inactive in danger red.
 */
const COLUMN_RENDER_OVERRIDES: Record<string, (row: MasterTableRow) => ReactNode> = {
  owner: (row) => {
    const word = text(sourceOf(row)?.owner).toUpperCase();
    return <Pill tone={word === "SHIPPED" ? styles.pillShipped : styles.pillOwn}>{word}</Pill>;
  },
  state: (row) => {
    const word = text(sourceOf(row)?.state).toUpperCase();
    return word === "NOT PUBLISHED" ? (
      <Pill
        tone={styles.pillNotPublished}
        title="Nothing is published, so this design resolves for nobody — no counter can print it."
      >
        {word}
      </Pill>
    ) : (
      <Pill tone={styles.pillPublished}>{word}</Pill>
    );
  },
  ptl_is_active: (row) =>
    isInactiveRow(sourceOf(row)) ? (
      <Pill tone={styles.pillInactive}>Inactive</Pill>
    ) : (
      <Pill tone={styles.pillActive}>Active</Pill>
    ),
};

export default function TemplateListScreen() {
  const router = useRouter();
  const { activeCompany } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const { permissions } = usePagePermissions({ href: HREF });

  const [filters, setFilters] = useState<TemplateListFilters>(INITIAL_TEMPLATE_FILTERS);
  const [acting, setActing] = useState(false);
  const actingRef = useRef(false);

  const [deleteTemplate] = useDeletePrintingTemplateMutation();
  const [saveTemplate] = useSavePrintingTemplateMutation();
  const [loadTemplate] = useLazyGetPrintingTemplateQuery();

  // Every purpose from print_purpose, so filtering to one that has no design
  // yet is possible -- and that is a useful thing to ask for.
  const { data: catalogue } = useGetPrintPurposeOptionsQuery({ companyId: companyId || null });
  const purposes = useMemo(
    () => [...(catalogue ?? [])].sort((a, b) => purposeLabel(a).localeCompare(purposeLabel(b))),
    [catalogue],
  );

  const patch = useCallback((next: Partial<TemplateListFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
  }, []);

  const openDesigner = useCallback(
    (ptlId: string) => router.push(printingDesignerRoute(ptlId)),
    [router],
  );

  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
      sortBy,
      sortDir,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
      sortBy?: string;
      sortDir?: "asc" | "desc";
    }): Record<string, string> => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(sortBy && sortDir ? { sort_dir: sortDir } : {}),
      grid_param: JSON.stringify(templateGridParams(companyId || NO_TENANT_ID, filters)),
    }),
    [companyId, filters],
  );

  const openRow = useCallback(
    (row: MasterTableRow) => {
      const ptlId = text(sourceOf(row)?.ptl_id);
      if (ptlId) openDesigner(ptlId);
    },
    [openDesigner],
  );

  /**
   * Clone: a NEW template carrying the chosen design's newest revision as its
   * revision 1 DRAFT.
   *
   * It publishes NOTHING, deliberately. A clone that arrived published would
   * start printing the moment it was assigned, before anyone had read it. And
   * `newDraftFrom` is what strips every `ptvId` and `ptdId`, so the whole design
   * is INSERTed onto the copy rather than moved off the original.
   *
   * The grid row has no revisions, so the whole design is read first.
   */
  const cloneRow = useCallback(
    async (row: TemplateGridRow | null) => {
      const ptlId = text(row?.ptl_id);
      if (!ptlId || actingRef.current) return;
      actingRef.current = true;
      setActing(true);
      try {
        const selected = await loadTemplate(ptlId).unwrap();
        const source = toDesignerDraft(selected);
        const suffix = Date.now().toString(36).toUpperCase().slice(-4);
        const created = await saveTemplate(
          buildSavePayload({
            ...source,
            ptlId: undefined,
            // A clone belongs to the company doing the cloning -- that is what
            // forking a shipped design means.
            ptlCompanyId: companyId || null,
            ptlCode: `${source.ptlCode}_${suffix}`.slice(0, 60),
            ptlName: `${source.ptlName} (copy)`.slice(0, 120),
            // What the "Cloned from" column reads. The pair goes together; the
            // revision recorded is the one actually copied, which is the newest
            // undeleted one -- not necessarily the published one.
            ptlForkedFromId: selected.ptlId,
            ptlForkedFromRev: source.working.ptvRevNo ?? null,
            ptlForkedFromCode: null,
            working: newDraftFrom(source.working),
            history: [],
            publishedRevId: null,
          }),
        ).unwrap();
        toast.success("Cloned. The copy publishes nothing until you publish it.");
        openDesigner(created.ptlId);
      } catch (thrown) {
        toast.error(getApiErrorMessage(thrown as never) ?? "Could not clone the design.");
      } finally {
        actingRef.current = false;
        setActing(false);
      }
    },
    [companyId, loadTemplate, openDesigner, saveTemplate],
  );

  /**
   * Retire -- the shell asks first (its confirm, worded below), then this runs.
   * True means the design is gone and the shell reloads the list.
   */
  const retireRow = useCallback(
    async (shellRow: MasterTableRow): Promise<boolean> => {
      const row = sourceOf(shellRow);
      const ptlId = text(row?.ptl_id);
      if (!ptlId) return false;
      try {
        await deleteTemplate({ ptlId }).unwrap();
        toast.success(`"${text(row?.ptl_name)}" retired.`);
        return true;
      } catch (thrown) {
        // The common refusal is a 409: an assignment still points at it, and a
        // counter would otherwise resolve to a design that is gone.
        toast.error(getApiErrorMessage(thrown as never) ?? "Could not retire the design.");
        return false;
      }
    },
    [deleteTemplate],
  );

  const toolbarContent = (
    <div className={styles.filters}>
      <label className={masterStyles.filterCheckLabel}>
        <input
          type="checkbox"
          checked={filters.activeOnly}
          onChange={(event) => patch({ activeOnly: event.target.checked })}
        />
        Active only
      </label>
      <select
        className={styles.select}
        value={filters.purposeId}
        onChange={(event) => patch({ purposeId: event.target.value })}
        title="What the design prints"
        aria-label="Purpose"
      >
        <option value="">Any purpose</option>
        {purposes.map((purpose) => (
          <option key={purpose.ppoId} value={purpose.ppoId}>
            {purposeLabel(purpose)}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={filters.state}
        onChange={(event) => patch({ state: event.target.value as TemplateListFilters["state"] })}
        aria-label="State"
      >
        <option value="">Any state</option>
        <option value="PUBLISHED">Published</option>
        <option value="UNPUBLISHED">Not published</option>
      </select>
      <select
        className={styles.select}
        value={filters.engine}
        onChange={(event) => patch({ engine: event.target.value })}
        title="The engine of the published revision, else the newest"
        aria-label="Engine"
      >
        <option value="">Any engine</option>
        {PTV_ENGINE_VALUES.map((engine) => (
          <option key={engine} value={engine}>
            {engine}
          </option>
        ))}
      </select>
      <label className={masterStyles.filterCheckLabel} title="Hide the designs shipped with the product">
        <input
          type="checkbox"
          checked={filters.ownedOnly}
          onChange={(event) => patch({ ownedOnly: event.target.checked })}
        />
        Ours only
      </label>
    </div>
  );

  const toolbarActions = useCallback(
    (shellRow: MasterTableRow | null) => {
      const row = sourceOf(shellRow);
      const allowed = !!row && permissions.canCreate;
      const title = !row
        ? "Select a design first"
        : !permissions.canCreate
          ? "No right to create a design"
          : "Fork this design into a new one, as an unpublished draft";
      return (
        <>
          <span className="erp-ms-tsep" aria-hidden="true" />
          <button
            type="button"
            className={`${masterStyles.iconBtn} erp-ms-tbtn`}
            title={title}
            disabled={!allowed || acting}
            onClick={() => void cloneRow(row)}
          >
            <span>{acting ? "Cloning…" : "Clone"}</span>
          </button>
        </>
      );
    },
    [acting, cloneRow, permissions.canCreate],
  );

  // Two jobs in one line, as in Qt: say why a button is off, and what the
  // selected row's state means. The shell prints the key legend beside it.
  const hintMessage = useCallback((shellRow: MasterTableRow | null) => {
    const notes = rowNotes(sourceOf(shellRow));
    return notes.length ? <span className={styles.hintNote}>{notes.join("  ")}</span> : null;
  }, []);

  const rowClassName = useCallback(
    (shellRow: MasterTableRow) => (isInactiveRow(sourceOf(shellRow)) ? styles.rowMuted : undefined),
    [],
  );

  const isRowDeleteDisabled = useCallback(
    (shellRow: MasterTableRow) => retireRefusal(sourceOf(shellRow)) !== null,
    [],
  );

  return (
    <CrudMasterPage
      title="Print Templates"
      listTitleOverride="Print Templates"
      listSubtitleOverride="Every design this company can print with — its own and the shipped ones."
      entityLabel="design"
      entityLabelPlural="designs"
      searchPlaceholder="Search code, name or purpose..."
      apiEndpoints={API_ENDPOINTS}
      gridKey="printTemplateList"
      gridTableName="print_template"
      listResponseStyleArrayKey=""
      useConfiguredGridColumnsOnly
      enableGridSettingsContextMenu
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={masterStyles}
      columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
      rowClassName={rowClassName}
      buildListQuery={buildListQuery}
      listStateResetKey={`${companyId}|${JSON.stringify(filters)}`}
      listEmptyText="No designs here. Untick Active only, or clear a filter."
      toolbarContent={toolbarContent}
      toolbarActions={toolbarActions}
      enableListActionKeys
      listHintMessage={hintMessage}
      permissionHref={HREF}
      codeColumnHeader="Code"
      nameColumnHeader="Name"
      // New, and Open / Edit / Enter / double-click, go to the designer.
      createLabel="New template"
      onCreateAction={() => router.push(NEW_PRINTING_TEMPLATE_ROUTE)}
      onEditAction={openRow}
      onViewAction={openRow}
      // Retire = the old soft delete, refused up front for a shipped design.
      deleteActionLabel="Retire"
      onDeleteAction={retireRow}
      isRowDeleteDisabled={isRowDeleteDisabled}
      rowDeleteDisabledReason="A shipped design is used by every company — Clone it to change it; it cannot be retired."
      deleteConfirmMessage={(row) =>
        `Retire "${text(sourceOf(row)?.ptl_name)}"? The design is soft deleted with every revision and dataset — print history keeps pointing at them.`
      }
      deleteConfirmNote="Refused while a branch or counter is still assigned to it, because that counter would resolve to a design that is gone."
    />
  );
}
