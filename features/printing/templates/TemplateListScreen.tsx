"use client";

/**
 * Settings -> Printing -> Templates, per `printing_ui_mockup`.
 *
 * Find a design, clone one, open it, retire it -- and SEE WHAT IS PUBLISHED.
 * That last one is why this is not a generic master list: `ptlPublishedRevId` is
 * a POINTER, not "the newest revision", and a template whose pointer is null
 * resolves for nobody. The amber row is that state, and it has to be visible
 * here rather than discovered at a till.
 *
 * The toolbar acts on the SELECTED row, which is why the table carries a
 * selection: Clone, Open and Retire are all "this one", and the mockup groups
 * them rather than repeating three links on every line.
 *
 * Nothing about printing is compiled in. The purposes come from the rows (see
 * `domain/purposes.ts` for why that is a stopgap), the engines from the
 * generated vocabulary, which comes from the OpenAPI enums, which come from the
 * CHECK constraints.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import { getApiErrorMessage } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { selectBusinessContext } from "@/store/slices/authSlice";
import { useGetCompanyListQuery } from "@/store/api/businessContextApi";
import {
  useDeletePrintingTemplateMutation,
  useListPrintingTemplatesQuery,
  useSavePrintingTemplateMutation,
} from "@/features/printing/api/templates";
import { useListPrintingAssignmentsQuery } from "@/features/printing/api/assignments";
import { useGetPrintPurposeOptionsQuery } from "@/features/printing/api/purposes";
import { buildSavePayload } from "@/features/printing/domain/buildSavePayload";
import { newDraftFrom, toDesignerDraft } from "@/features/printing/domain/draft";
import { rungOf } from "@/features/printing/domain/ladder";
import { collectPurposes, purposeLabel } from "@/features/printing/domain/purposes";
import { NEW_PRINTING_TEMPLATE_ROUTE, printingDesignerRoute } from "@/features/printing/routes";
import {
  PTV_ENGINE_VALUES,
  type PrintTemplatePayload,
  type PtvEngine,
} from "@/features/printing/types/printing";
import { Note, ScreenShell, SectionHead } from "@/features/printing/components/screen-shell";
import styles from "@/features/printing/printing.module.scss";

const TABS = [{ id: "templates" as const, label: "Templates" }];

type Filters = {
  purposeId: string;
  engine: string;
  /** "" any, "yes" published, "no" not published. A tri-state, so not a boolean. */
  published: string;
  activeOnly: boolean;
  onlyOwned: boolean;
};

const INITIAL_FILTERS: Filters = {
  purposeId: "",
  engine: "",
  published: "",
  activeOnly: true,
  onlyOwned: false,
};

/** "rev 2 · PUBLISHED", or the loud state. */
function PublishedCell({ template }: { template: PrintTemplatePayload }) {
  if (!template.ptlPublishedRevId) {
    return (
      <span
        className={`${styles.pill} ${styles.pillNone}`}
        title="Nothing is published, so this design resolves for nobody — no counter can print it."
      >
        not published
      </span>
    );
  }
  const revNo = template.ptlPublishedRevNo;
  const newest = (template.versions ?? [])
    .filter((version) => !version.ptvIsDeleted)
    .reduce((best, version) => Math.max(best, version.ptvRevNo), 0);

  return (
    <span className={styles.chipRow}>
      <span className={`${styles.pill} ${styles.pillPublished}`}>
        {revNo ? `rev ${revNo} · PUBLISHED` : "PUBLISHED"}
      </span>
      {revNo && newest > revNo ? (
        <span
          className={`${styles.pill} ${styles.pillDraft}`}
          title={`Revision ${newest} is a draft, and is not what prints`}
        >
          draft {newest}
        </span>
      ) : null}
    </span>
  );
}

export default function TemplateListScreen() {
  const router = useRouter();
  const businessContext = useAppSelector(selectBusinessContext);
  const companyId = businessContext?.companyId ?? null;

  const { data: companies = [] } = useGetCompanyListQuery();
  const companyName = companies.find((company) => company.id === companyId)?.name ?? null;

  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PrintTemplatePayload | null>(null);

  const [deleteTemplate, { isLoading: isDeleting }] = useDeletePrintingTemplateMutation();
  const [saveTemplate, { isLoading: isCloning }] = useSavePrintingTemplateMutation();

  /*
   * EVERY BOOLEAN IS SENT ONLY WHEN TRUE. A query boolean cannot express false
   * -- see `toParams` in api/templates.ts -- so `onlyOwned: false` would arrive
   * as `true` and hide every shipped design.
   *
   * `includeVersions` stays true: the Published column needs the revision
   * numbers to say "rev 2 published, draft 3 in progress", and that sentence is
   * the point of the screen.
   */
  const { data, isFetching, error, refetch } = useListPrintingTemplatesQuery({
    limit: 100,
    includeVersions: true,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(companyId ? { ptlCompanyId: companyId } : {}),
    ...(companyId && filters.onlyOwned ? { onlyOwned: true } : {}),
    ...(filters.purposeId ? { ptlPurposeId: filters.purposeId } : {}),
    ...(filters.engine ? { engine: filters.engine as PtvEngine } : {}),
    ...(filters.published === "yes" ? { isPublished: true } : {}),
    ...(filters.activeOnly ? { ptlIsActive: true } : {}),
  });

  /*
   * "Used by" counts print_template_assignment rows -- the question a designer
   * actually has before changing anything. One read, counted per template; a
   * request per row would be one per visible design.
   *
   * `includeGlobal` matters more here than anywhere: a SHIPPED design is most
   * likely to be used by an every-company row, whose `pta_company_id` is NULL
   * and which an exact-match company filter therefore drops. Without it the
   * shipped designs -- the ones a whole tenant depends on -- would read "used
   * by 0" to the person about to change them.
   */
  const { data: assignmentPage, isError: assignmentsFailed } = useListPrintingAssignmentsQuery(
    companyId ? { ptaCompanyId: companyId, includeGlobal: true, limit: 100 } : { limit: 100 },
  );
  const assignments = useMemo(() => assignmentPage?.items ?? [], [assignmentPage]);
  const assignmentsTruncated = (assignmentPage?.total ?? 0) > assignments.length;

  const templates = useMemo(() => data?.items ?? [], [data]);

  /*
   * "Not published" is filtered HERE because the server cannot be asked for it:
   * `isPublished=false` arrives as `true`.
   */
  const rows = useMemo(
    () =>
      filters.published === "no"
        ? templates.filter((template) => !template.ptlPublishedRevId)
        : templates,
    [templates, filters.published],
  );

  /*
   * The filter offers every purpose from print_purpose, with the ones these rows
   * already reference merged in — so filtering to a purpose that has no design
   * yet is possible, and that is a useful thing to ask for.
   */
  const { data: catalogue } = useGetPrintPurposeOptionsQuery({ companyId });
  const purposes = useMemo(() => {
    const byId = new Map((catalogue ?? []).map((purpose) => [purpose.ppoId, purpose]));
    for (const purpose of collectPurposes({ templates, assignments })) {
      if (!byId.has(purpose.ppoId)) byId.set(purpose.ppoId, purpose);
    }
    return [...byId.values()].sort((left, right) =>
      purposeLabel(left).localeCompare(purposeLabel(right)),
    );
  }, [catalogue, templates, assignments]);

  const selected = rows.find((template) => template.ptlId === selectedId) ?? null;

  const patch = useCallback((next: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...next }));
  }, []);

  const usedBy = useCallback(
    (ptlId: string): string => {
      if (assignmentsFailed) return "—";
      const mine = assignments.filter((assignment) => assignment.ptaTemplateId === ptlId);
      if (mine.length === 0) return "—";

      const counters = new Set<string>();
      const branches = new Set<string>();
      let companyWide = 0;
      for (const assignment of mine) {
        const rung = rungOf(assignment);
        if (rung === "COUNTER" && assignment.ptaDeviceId) counters.add(assignment.ptaDeviceId);
        if (assignment.ptaBranchId) branches.add(assignment.ptaBranchId);
        if (rung === "COMPANY" || rung === "EVERY_COMPANY") companyWide += 1;
      }

      // A company-wide row with nothing narrower beating it reaches every till,
      // which is what the mockup's "every counter" says.
      if (companyWide > 0 && counters.size === 0 && branches.size === 0) {
        return "every counter";
      }
      const parts: string[] = [];
      if (counters.size) parts.push(`${counters.size} counter${counters.size === 1 ? "" : "s"}`);
      if (branches.size) parts.push(`${branches.size} branch${branches.size === 1 ? "" : "es"}`);
      if (companyWide) parts.push("company-wide");
      return parts.join(", ");
    },
    [assignments, assignmentsFailed],
  );

  const openDesigner = useCallback(
    (ptlId: string) => router.push(printingDesignerRoute(ptlId)),
    [router],
  );

  /**
   * Clone: a NEW template carrying the chosen design's newest revision as its
   * revision 1 DRAFT.
   *
   * It publishes NOTHING, deliberately. A clone that arrived published would
   * start printing the moment it was assigned, before anyone had read it. And
   * `newDraftFrom` is what strips every `ptvId` and `ptdId`, so the whole design
   * is INSERTed onto the copy rather than moved off the original.
   */
  const cloneSelected = useCallback(async () => {
    if (!selected) return;
    const source = toDesignerDraft(selected);
    const suffix = Date.now().toString(36).toUpperCase().slice(-4);
    try {
      const created = await saveTemplate(
        buildSavePayload({
          ...source,
          ptlId: undefined,
          // A clone belongs to the company doing the cloning -- that is what
          // forking a shipped design means.
          ptlCompanyId: companyId,
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
    }
  }, [companyId, openDesigner, saveTemplate, selected]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      await deleteTemplate({ ptlId: pendingDelete.ptlId }).unwrap();
      toast.success(`"${pendingDelete.ptlName}" retired.`);
      setPendingDelete(null);
      setSelectedId(null);
    } catch (thrown) {
      // The common refusal is a 409: an assignment still points at it, and a
      // counter would otherwise resolve to a design that is gone.
      toast.error(getApiErrorMessage(thrown as never) ?? "Could not retire the design.");
    }
  }, [deleteTemplate, pendingDelete]);

  const readError = error ? getApiErrorMessage(error as never) : null;
  const hasUnpublished = rows.some((template) => !template.ptlPublishedRevId);

  return (
    <ScreenShell
      title="Print Templates"
      subtitle={[companyName, "every design this company can print with"]}
      tabs={TABS}
      activeTab="templates"
      footer={
        <>
          <button type="button" className={styles.btn} onClick={() => router.back()}>
            Close
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!selected}
            onClick={() => selected && openDesigner(selected.ptlId)}
          >
            Open
          </button>
        </>
      }
    >
      <section className={styles.section}>
        <SectionHead
          title="Designs"
          table="print_template"
          slice={`${rows.length} of ${data?.meta.total ?? 0}`}
        />
        <Note>
          Identity only — a name, an owner, and a pointer to the revision currently published. The
          body lives on the version.
        </Note>

        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => router.push(NEW_PRINTING_TEMPLATE_ROUTE)}
          >
            New template
          </button>
          <button
            type="button"
            className={styles.btn}
            disabled={!selected || isCloning}
            title={
              selected
                ? "Fork this design into a new one, as an unpublished draft"
                : "Select a design first"
            }
            onClick={() => void cloneSelected()}
          >
            {isCloning ? "Cloning…" : "Clone"}
          </button>
          <button
            type="button"
            className={styles.btn}
            disabled={!selected}
            onClick={() => selected && openDesigner(selected.ptlId)}
          >
            Open
          </button>
          <button
            type="button"
            className={styles.btn}
            disabled={!selected}
            title="Soft delete — print history keeps pointing at the revisions"
            onClick={() => selected && setPendingDelete(selected)}
          >
            Retire
          </button>

          <span className={styles.toolbarRight}>
            <select
              className={styles.select}
              value={filters.purposeId}
              onChange={(event) => patch({ purposeId: event.target.value })}
              title="What the design prints"
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
              value={filters.engine}
              onChange={(event) => patch({ engine: event.target.value })}
              title="The engine of the published revision"
            >
              <option value="">Any engine</option>
              {PTV_ENGINE_VALUES.map((engine) => (
                <option key={engine} value={engine}>
                  {engine}
                </option>
              ))}
            </select>
            <select
              className={styles.select}
              value={filters.published}
              onChange={(event) => patch({ published: event.target.value })}
            >
              <option value="">Any state</option>
              <option value="yes">Published</option>
              <option value="no">Not published</option>
            </select>
            <label className={styles.checkRow} title="Hide the designs shipped with the product">
              <input
                type="checkbox"
                checked={filters.onlyOwned}
                disabled={!companyId}
                onChange={(event) => patch({ onlyOwned: event.target.checked })}
              />
              Ours only
            </label>
            <input
              className={`${styles.input} ${styles.search}`}
              value={search}
              placeholder="search code, name or purpose…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colSmall}>Code</th>
                <th>Name</th>
                <th className={styles.colSmall}>Purpose</th>
                <th className={styles.colSmall}>Owner</th>
                <th className={styles.colSmall}>Published</th>
                <th className={styles.colSmall}>Used by</th>
                <th>Cloned from</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((template) => (
                <tr
                  key={template.ptlId}
                  className={[
                    styles.rowClickable,
                    template.ptlPublishedRevId ? "" : styles.rowWarning,
                    template.ptlId === selectedId ? styles.rowSelected : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedId(template.ptlId)}
                  onDoubleClick={() => openDesigner(template.ptlId)}
                >
                  <td className={styles.mono}>{template.ptlCode}</td>
                  <td>
                    {template.ptlName}
                    {template.ptlIsActive ? null : (
                      <span className={styles.muted}> · inactive</span>
                    )}
                  </td>
                  <td>{template.ptlPurposeName ?? template.ptlPurposeCode ?? "—"}</td>
                  <td>
                    {template.ptlCompanyId === null
                      ? "Shipped"
                      : (template.ptlCompanyName ?? "This company")}
                  </td>
                  <td>
                    <PublishedCell template={template} />
                  </td>
                  <td>{usedBy(template.ptlId)}</td>
                  <td className={styles.muted}>
                    {template.ptlForkedFromCode
                      ? `${template.ptlForkedFromCode}${
                          template.ptlForkedFromRev ? ` rev ${template.ptlForkedFromRev}` : ""
                        }`
                      : "—"}
                  </td>
                </tr>
              ))}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.muted}>
                    {isFetching
                      ? "Loading…"
                      : "No designs yet. Create one, then publish a revision."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {readError ? (
          <Note
            tone="red"
            action={
              <button type="button" className={styles.btn} onClick={() => void refetch()}>
                Try again
              </button>
            }
          >
            {readError}
          </Note>
        ) : null}

        {/*
         * The amber row explained, where the row is. This is the state the whole
         * subsystem is arranged to make visible.
         */}
        {hasUnpublished ? (
          <Note tone="amber">
            The amber row is <span className={styles.mono}>ptl_published_rev_id IS NULL</span> — a
            design with only a draft. It resolves for nobody and reaches no counter. That state has
            to be visible HERE, not discovered at a till.
          </Note>
        ) : null}

        <Note>
          “Used by” counts <span className={styles.mono}>print_template_assignment</span> rows. It
          is the question a designer actually has before changing anything: is this safe to touch?
        </Note>

        {assignmentsTruncated ? (
          <Note tone="amber">
            “Used by” counts the first {assignments.length} of {assignmentPage?.total} assignments —
            the list endpoint caps a page at 100 — so a design may be used more widely than shown.
            Check Assignments before changing one.
          </Note>
        ) : null}
      </section>

      <DeleteConfirmModal
        isOpen={pendingDelete !== null}
        itemName={pendingDelete?.ptlName}
        title="Retire this design?"
        message="The design is soft deleted with every revision and dataset — print history keeps pointing at them."
        note="Refused while a branch or counter is still assigned to it, because that counter would resolve to a design that is gone."
        confirmLabel="Retire"
        loading={isDeleting}
        loadingLabel="Retiring…"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </ScreenShell>
  );
}
