"use client";

/**
 * Settings -> Printing -> Assignments, per `printing_ui_mockup`.
 *
 * -- TWO TABS OVER ONE TABLE, BECAUSE THERE ARE TWO QUESTIONS --------------
 *
 * BY SCOPE is the operator's question -- "what does THIS counter print?".
 * Selectors on top, one row per purpose against the four scope columns, and an
 * "Effective here" column that is the RESOLVER'S OWN ANSWER for the counter
 * selected above, not this screen's arithmetic.
 *
 * ALL ASSIGNMENTS is the maintainer's question -- "what have we configured?" --
 * and the matrix genuinely cannot answer it: it shows four rungs for ONE branch
 * and ONE counter at a time, so a row belonging to another branch is not a
 * blank cell there, it is absent from the screen entirely.
 *
 * Both write through the SAME editor, because both are the same `pta_` row.
 *
 * -- WHY THIS IS NOT A TAB ON THE DESIGNER --------------------------------
 *
 * A per-design view is scoped to one `ptaTemplateId`; the row that OVERRIDES it
 * lives on a DIFFERENT template. Open Invoice A4, see a company-wide row, and
 * conclude every counter uses it -- COUNTER-3 does not, and the evidence is not
 * on that screen at all. Resolution is a question about a SCOPE.
 *
 * The loudest row is the one with NOTHING configured: a till that prints
 * nothing, visible here and nowhere else.
 *
 * -- FOUR SCOPE COLUMNS, NOT THREE -----------------------------------------
 *
 * `20260827140000_correct_print_template_assignment` made `pta_company_id`
 * nullable, so there is a rung ABOVE company: a shipped design that resolves
 * for every tenant that has not said otherwise. It is the last column, and the
 * list query has to ask for it -- `ptaCompanyId=X` alone does not return rows
 * whose company is NULL, so without `includeGlobal` the column would read as
 * empty and the screen would claim nothing is inherited when something is.
 *
 * -- IT IS NO LONGER READ ONLY --------------------------------------------
 *
 * The banner that used to stand here listed four defects in the server's
 * reconstruction of section 5; that migration fixed every one, and
 * `api/assignments.ts` records what each one changed. The editor those notes
 * said was missing is `components/AssignmentEditor.tsx`, and every rung --
 * including "every company" -- is writable through it.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";

import { getApiErrorMessage } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { selectBusinessContext, selectUserInfo } from "@/store/slices/authSlice";
import {
  useGetBranchesByCompanyQuery,
  useGetCompanyListQuery,
} from "@/store/api/businessContextApi";
import { useGetCounterOptionsQuery } from "@/store/api/appSettingsApi";
import { useListPrintingAssignmentsQuery } from "@/features/printing/api/assignments";
import { useListPrintingTemplatesQuery } from "@/features/printing/api/templates";
import { useGetPrintPurposeOptionsQuery } from "@/features/printing/api/purposes";
import { buildAssignmentMatrix, type Rung } from "@/features/printing/domain/ladder";
import { collectPurposes, purposeLabel } from "@/features/printing/domain/purposes";
import { PRINTING_TEMPLATES_ROUTE, printingDesignerRoute } from "@/features/printing/routes";
import {
  PTA_OUTPUT_MODE_VALUES,
  type PrintTemplateAssignmentPayload,
  type PtaOutputMode,
} from "@/features/printing/types/printing";
import AssignmentEditor, {
  type AssignmentPrefill,
} from "./components/AssignmentEditor";
import AssignmentRows from "./components/AssignmentRows";
import EffectiveCell from "./components/EffectiveCell";
import { Note, ScreenShell, SectionHead } from "@/features/printing/components/screen-shell";
import styles from "@/features/printing/printing.module.scss";

type TabId = "matrix" | "rows";

const TABS = [
  { id: "matrix" as const, label: "By scope" },
  { id: "rows" as const, label: "All assignments" },
];

/** Widest last, so the eye reads narrowest-wins left to right. */
const COLUMNS: Rung[] = ["COUNTER", "BRANCH", "COMPANY", "EVERY_COMPANY"];

/**
 * What the editor is open on: a row, or a blank form carrying what the click
 * already said. `key` remounts it, so the form initialises once per open
 * instead of syncing props into state.
 */
type EditorRequest = {
  key: number;
  editing: PrintTemplateAssignmentPayload | null;
  prefill: AssignmentPrefill;
};

export default function AssignmentsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessContext = useAppSelector(selectBusinessContext);
  const userInfo = useAppSelector(selectUserInfo);

  const [companyId, setCompanyId] = useState<string | null>(businessContext?.companyId ?? null);
  const [branchId, setBranchId] = useState<string | null>(businessContext?.branchId ?? null);
  const [deviceId, setDeviceId] = useState<string | null>(userInfo?.deviceId ?? null);
  const [outputMode, setOutputMode] = useState<PtaOutputMode>("PRINT");
  const [editor, setEditor] = useState<EditorRequest | null>(null);

  /** Set when arriving from a design's "used by" chip. */
  const templateFilter = searchParams.get("ptaTemplateId");

  /*
   * "Used by" is a question about ROWS, not about one counter's ladder, so
   * arriving from that chip opens the list. The matrix would show at most the
   * one branch and counter selected, which is where that link's answer would
   * be missing most of itself.
   */
  const [tab, setTab] = useState<TabId>(templateFilter ? "rows" : "matrix");

  const { data: companies = [] } = useGetCompanyListQuery();
  const { data: branches = [] } = useGetBranchesByCompanyQuery(companyId ?? "", {
    skip: !companyId,
  });
  const { data: counters = [] } = useGetCounterOptionsQuery();

  const {
    data: assignmentPage,
    error,
    refetch,
  } = useListPrintingAssignmentsQuery(
    companyId
      ? {
          ptaCompanyId: companyId,
          // Without this the every-company column reads as empty, and the
          // screen would say nothing is inherited while the till prints
          // something. The filter is exact-match on the server by design.
          includeGlobal: true,
          limit: 100,
          ...(templateFilter ? { ptaTemplateId: templateFilter } : {}),
        }
      : { limit: 100 },
    // The list tab does its own paged, filtered read; this one only feeds the
    // matrix, and asking for it while it is not on screen is a wasted request.
    { skip: tab !== "matrix" },
  );
  const assignments = useMemo(() => assignmentPage?.items ?? [], [assignmentPage]);

  // The purposes worth a row. See the closing note for what this cannot show.
  const { data: templatePage } = useListPrintingTemplatesQuery(
    {
      limit: 100,
      includeVersions: false,
      ...(companyId ? { ptlCompanyId: companyId } : {}),
    },
    { skip: tab !== "matrix" },
  );
  const templates = useMemo(() => templatePage?.items ?? [], [templatePage]);

  /*
   * EVERY purpose, from print_purpose itself — not just the ones something
   * already references. That difference is the whole point of this screen: a
   * purpose with no design AND no assignment prints nothing anywhere, and it
   * could not be listed at all until the catalogue existed.
   *
   * The referenced ones are merged in behind it, so a design pointing at an
   * inactive or another company's purpose still gets a row rather than vanishing.
   */
  const { data: catalogue, isError: catalogueFailed } = useGetPrintPurposeOptionsQuery({
    companyId,
  });
  const purposes = useMemo(() => {
    const referenced = collectPurposes({ templates, assignments });
    const byId = new Map((catalogue ?? []).map((purpose) => [purpose.ppoId, purpose]));
    for (const purpose of referenced) {
      if (!byId.has(purpose.ppoId)) byId.set(purpose.ppoId, purpose);
    }
    return [...byId.values()].sort((left, right) =>
      purposeLabel(left).localeCompare(purposeLabel(right)),
    );
  }, [catalogue, templates, assignments]);

  const matrix = useMemo(
    () => buildAssignmentMatrix(assignments, { branchId, deviceId }),
    [assignments, branchId, deviceId],
  );

  const companyName = companies.find((company) => company.id === companyId)?.name ?? null;
  const branchName = branches.find((branch) => branch.id === branchId)?.name ?? null;
  const counterName = counters.find((counter) => counter.id === deviceId)?.name ?? null;
  const readError = error ? getApiErrorMessage(error as never) : null;

  const openEditor = useCallback(
    (editing: PrintTemplateAssignmentPayload | null, prefill: AssignmentPrefill = {}) => {
      setEditor((current) => ({ key: (current?.key ?? 0) + 1, editing, prefill }));
    },
    [],
  );

  /**
   * The scope a click on an EMPTY cell means.
   *
   * The rung says which ids to carry: a company cell is this company with no
   * branch and no counter, and the every-company cell is a null company -- said
   * out loud, because in this contract `null` and "left out" are different
   * requests.
   */
  const prefillFor = useCallback(
    (rung: Rung, purposeId: string): AssignmentPrefill => ({
      ptaCompanyId: rung === "EVERY_COMPANY" ? null : companyId,
      ptaBranchId: rung === "BRANCH" || rung === "COUNTER" ? branchId : null,
      ptaDeviceId: rung === "COUNTER" ? deviceId : null,
      ptaPurposeId: purposeId,
      ptaOutputMode: outputMode,
    }),
    [branchId, companyId, deviceId, outputMode],
  );

  const columnHeader = (rung: Rung): string => {
    if (rung === "EVERY_COMPANY") return "Every company";
    if (rung === "COMPANY") return "Company-wide";
    if (rung === "BRANCH") return branchName ? `Branch: ${branchName}` : "Branch";
    return counterName ?? "Counter";
  };

  return (
    <ScreenShell
      title="Print Assignments"
      subtitle={[companyName, "which design each branch and counter uses"]}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      footerNote={
        tab === "matrix"
          ? "Narrowest wins — counter, branch, company, every company"
          : "One choice per company, branch, counter, purpose and output mode"
      }
      footer={
        <>
          <button type="button" className={styles.btn} onClick={() => router.back()}>
            Close
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() =>
              openEditor(null, {
                ptaCompanyId: companyId,
                ptaBranchId: branchId,
                ptaDeviceId: deviceId,
                ptaOutputMode: outputMode,
              })
            }
          >
            New assignment
          </button>
        </>
      }
    >
      <div className={styles.toolbar}>
        <label className={styles.fieldInline}>
          <span className={styles.fieldLabel}>Company</span>
          <select
            className={styles.select}
            value={companyId ?? ""}
            onChange={(event) => {
              // A branch of the old company is not a branch of the new one, and
              // a counter belongs to a branch. Both are dropped rather than left
              // pointing somewhere else.
              setCompanyId(event.target.value || null);
              setBranchId(null);
              setDeviceId(null);
            }}
          >
            <option value="">Choose…</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>

        {/*
         * Branch, counter and output belong to the LADDER the matrix draws: they
         * pick which rungs have a column and which counter "Effective here"
         * asks about. The list tab filters by different questions and carries
         * its own toolbar, so these would only look like filters that do
         * nothing.
         */}
        {tab === "matrix" ? (
          <>
            <label className={styles.fieldInline}>
              <span className={styles.fieldLabel}>Branch</span>
              <select
                className={styles.select}
                value={branchId ?? ""}
                disabled={!companyId}
                onChange={(event) => {
                  setBranchId(event.target.value || null);
                  setDeviceId(null);
                }}
              >
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.fieldInline}>
              <span className={styles.fieldLabel}>Counter</span>
              <select
                className={styles.select}
                value={deviceId ?? ""}
                disabled={!branchId}
                title={branchId ? undefined : "A counter belongs to a branch — choose one first"}
                onChange={(event) => setDeviceId(event.target.value || null)}
              >
                <option value="">All counters</option>
                {counters.map((counter) => (
                  <option key={counter.id} value={counter.id}>
                    {counter.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.fieldInline}>
              <span
                className={styles.fieldLabel}
                title="Part of the resolution key — paper is not"
              >
                Output
              </span>
              <select
                className={styles.select}
                value={outputMode}
                onChange={(event) => setOutputMode(event.target.value as PtaOutputMode)}
              >
                {PTA_OUTPUT_MODE_VALUES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {templateFilter ? (
          <span className={styles.toolbarRight}>
            <Link href={PRINTING_TEMPLATES_ROUTE} className={`${styles.chip} ${styles.chipBlue}`}>
              filtered to one design ✕
            </Link>
          </span>
        ) : null}
      </div>

      {tab === "rows" ? (
        <AssignmentRows
          companyId={companyId}
          templateId={templateFilter}
          onCreate={(prefill) => openEditor(null, prefill)}
          onEdit={(row) => openEditor(row)}
        />
      ) : (
        <section className={styles.section}>
          <SectionHead
            title="What each scope prints"
            table="print_template_assignment"
            qualifier="one row per company / branch / counter + purpose + output"
            slice={`${assignments.length} row${assignments.length === 1 ? "" : "s"}`}
          />
          <Note>
            The four scope columns are the resolution ladder. Narrowest wins, and “Effective here”
            is the resolver’s own answer for the counter selected above — this screen never
            re-derives it. “Every company” is a design shipped with the product, inherited by any
            company that has not said otherwise.
          </Note>

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

          {!companyId ? (
            <Note tone="amber">Choose a company to see what it prints.</Note>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Purpose</th>
                    {COLUMNS.map((rung) => (
                      <th key={rung}>{columnHeader(rung)}</th>
                    ))}
                    <th>Effective here</th>
                  </tr>
                </thead>
                <tbody>
                  {purposes.map((purpose) => {
                    const cells = matrix.get(purpose.ppoId);
                    return (
                      <tr key={purpose.ppoId}>
                        <td>{purposeLabel(purpose)}</td>

                        {COLUMNS.map((rung) => {
                          const cell = cells?.[rung] ?? null;
                          /*
                           * A narrower column with no scope selected is not a
                           * question this screen can answer: with "all branches"
                           * there is no branch column to fill, and an em dash
                           * would read as "nothing is set".
                           */
                          const notApplicable =
                            (rung === "BRANCH" && !branchId) || (rung === "COUNTER" && !deviceId);
                          return (
                            <td key={rung}>
                              {notApplicable ? (
                                <span
                                  className={styles.cellEmpty}
                                  title="Select one to see its row"
                                >
                                  —
                                </span>
                              ) : cell ? (
                                <span className={styles.cellActions}>
                                  <Link
                                    href={printingDesignerRoute(cell.ptaTemplateId)}
                                    className={styles.link}
                                  >
                                    {cell.ptaTemplateName ?? cell.ptaTemplateCode ?? "Open design"}
                                  </Link>
                                  <button
                                    type="button"
                                    className={styles.cellEdit}
                                    title="Edit this assignment — scope, design, printer and copies together"
                                    onClick={() => openEditor(cell)}
                                  >
                                    edit
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className={styles.cellSet}
                                  title="Nothing is configured on this rung — set it"
                                  onClick={() => openEditor(null, prefillFor(rung, purpose.ppoId))}
                                >
                                  + set
                                </button>
                              )}
                            </td>
                          );
                        })}

                        <td>
                          <EffectiveCell
                            companyId={companyId}
                            branchId={branchId}
                            deviceId={deviceId}
                            purposeId={purpose.ppoId}
                            outputMode={outputMode}
                          />
                        </td>
                      </tr>
                    );
                  })}

                  {purposes.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length + 2} className={styles.muted}>
                        Nothing to show: no design and no assignment names a purpose yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          <Note tone="blue">
            Why this cannot be a tab on the Designer: open Invoice A4, see a company-wide row, and
            conclude every counter uses it. A counter override does not — and the row that beats it
            lives on a DIFFERENT template.
          </Note>

          <Note>
            The winning row also carries the printer and the copies override. Editing a cell edits
            that one <span className={styles.mono}>pta_</span> row — scope, design, printer and
            copies together.
          </Note>

          {/*
           * Only said when it is true. With the catalogue reachable this screen
           * shows every purpose, including the ones nothing is configured for --
           * which is exactly the case it exists to make visible.
           */}
          {catalogueFailed ? (
            <Note tone="amber">
              The purpose list could not be read, so these rows cover only the purposes some design
              or assignment already names. A purpose with neither — which prints nothing anywhere —
              is missing from this table until it can be read.
            </Note>
          ) : null}
        </section>
      )}

      {editor ? (
        <AssignmentEditor
          key={editor.key}
          editing={editor.editing}
          prefill={editor.prefill}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </ScreenShell>
  );
}
