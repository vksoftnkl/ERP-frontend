"use client";

/**
 * The CRUD half of the Assignments screen: every `pta_` row as a row, with New,
 * Edit and Delete over it.
 *
 * -- WHY A LIST WHEN THERE IS ALREADY A MATRIX ----------------------------
 *
 * The matrix answers "what does THIS counter print?", which is the question an
 * operator has. This answers "what have we configured?", which is the question
 * whoever maintains it has -- and the matrix cannot answer it: it shows four
 * rungs for ONE branch and ONE counter at a time, so a row belonging to some
 * other branch is not a blank cell there, it is not on the screen at all.
 *
 * The two are the same rows through different questions, which is why they are
 * tabs of one screen sharing one editor rather than two screens.
 *
 * -- THE SCOPE FILTER IS THREE QUESTIONS, NOT A CHECKBOX -------------------
 *
 * `ptaCompanyId=X` is EXACT MATCH, so it drops the every-company rows the
 * company inherits; `includeGlobal` adds them; `globalOnly` returns them alone.
 * A checkbox would only be able to say two of those three. Both flags are
 * true-or-absent -- see `toParams` in `api/assignments.ts` for why `false` is
 * unsendable.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";

import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import { getApiErrorMessage } from "@/store/api";
import {
  useDeletePrintingAssignmentMutation,
  useListPrintingAssignmentsQuery,
  type AssignmentListQuery,
} from "@/features/printing/api/assignments";
import { useGetPrintPurposeOptionsQuery } from "@/features/printing/api/purposes";
import { RUNG_LABEL, rungOf } from "@/features/printing/domain/ladder";
import { purposeLabel } from "@/features/printing/domain/purposes";
import { printingDesignerRoute } from "@/features/printing/routes";
import {
  PTA_OUTPUT_MODE_VALUES,
  type PrintTemplateAssignmentPayload,
  type PtaOutputMode,
} from "@/features/printing/types/printing";
import { Note, SectionHead } from "@/features/printing/components/screen-shell";
import styles from "@/features/printing/printing.module.scss";
import type { AssignmentPrefill } from "./AssignmentEditor";

/** The server's own default page size, so the pager agrees with the response. */
const PAGE_SIZE = 20;

type ScopeFilter = "INHERITED" | "OWN" | "GLOBAL";

const SCOPE_FILTER_LABEL: Record<ScopeFilter, string> = {
  INHERITED: "This company + inherited",
  OWN: "This company only",
  GLOBAL: "Every-company rows only",
};

/** "Counter · TILL-3", or just the rung where there is no narrower name. */
function scopeCell(row: PrintTemplateAssignmentPayload): string {
  const rung = rungOf(row);
  const name =
    rung === "COUNTER"
      ? (row.ptaDeviceName ?? row.ptaDeviceId)
      : rung === "BRANCH"
        ? (row.ptaBranchName ?? row.ptaBranchId)
        : rung === "COMPANY"
          ? (row.ptaCompanyName ?? row.ptaCompanyId)
          : null;
  return name ? `${RUNG_LABEL[rung]} · ${name}` : RUNG_LABEL[rung];
}

/** The one name for the render path, read the way the resolver reads it. */
function printerCell(row: PrintTemplateAssignmentPayload): string {
  if (row.ptaPrinterId) return row.ptaPrinterProfileName ?? "profile";
  if (row.ptaPrinterName) return row.ptaPrinterName;
  return "counter default";
}

export default function AssignmentRows({
  companyId,
  templateId,
  onCreate,
  onEdit,
}: {
  /** The company the screen is scoped to, or null while none is chosen. */
  companyId: string | null;
  /**
   * Set when the screen was opened from a design's "used by" chip. It is the
   * question that view CANNOT answer for itself: the rows using this design
   * live under branches and counters a per-design screen never shows.
   */
  templateId: string | null;
  onCreate: (prefill: AssignmentPrefill) => void;
  onEdit: (row: PrintTemplateAssignmentPayload) => void;
}) {
  const [search, setSearch] = useState("");
  const [purposeId, setPurposeId] = useState("");
  const [outputMode, setOutputMode] = useState<PtaOutputMode | "">("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("INHERITED");
  const [activeOnly, setActiveOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PrintTemplateAssignmentPayload | null>(null);

  const [deleteAssignment, { isLoading: isDeleting }] = useDeletePrintingAssignmentMutation();

  /*
   * Every filter is omitted rather than sent falsey. `activeOnly: false` would
   * arrive as `true` and hide the retired rows this list exists to show.
   */
  const query: AssignmentListQuery = {
    page,
    limit: PAGE_SIZE,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(templateId ? { ptaTemplateId: templateId } : {}),
    ...(purposeId ? { ptaPurposeId: purposeId } : {}),
    ...(outputMode ? { ptaOutputMode: outputMode } : {}),
    ...(activeOnly ? { ptaIsActive: true } : {}),
    ...(scopeFilter === "GLOBAL"
      ? { globalOnly: true }
      : companyId
        ? {
            ptaCompanyId: companyId,
            ...(scopeFilter === "INHERITED" ? { includeGlobal: true } : {}),
          }
        : {}),
  };

  const { data, isFetching, error, refetch } = useListPrintingAssignmentsQuery(query);
  const rows = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: catalogue = [] } = useGetPrintPurposeOptionsQuery({ companyId });
  const purposes = useMemo(() => {
    const byId = new Map(catalogue.map((purpose) => [purpose.ppoId, purpose]));
    // A purpose only these rows name still deserves to be filterable.
    for (const row of rows) {
      if (!byId.has(row.ptaPurposeId)) {
        byId.set(row.ptaPurposeId, {
          ppoId: row.ptaPurposeId,
          ppoCode: row.ptaPurposeCode ?? null,
          ppoName: row.ptaPurposeName ?? null,
        });
      }
    }
    return [...byId.values()].sort((left, right) =>
      purposeLabel(left).localeCompare(purposeLabel(right)),
    );
  }, [catalogue, rows]);

  const selected = rows.find((row) => row.ptaId === selectedId) ?? null;
  const readError = error ? getApiErrorMessage(error as never) : null;

  /** Any filter change re-asks the question from the first page. */
  const refilter = useCallback((apply: () => void) => {
    apply();
    setPage(1);
    setSelectedId(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      await deleteAssignment(pendingDelete.ptaId).unwrap();
      toast.success("Assignment removed. The scope falls back to the rung above.");
      setPendingDelete(null);
      setSelectedId(null);
    } catch (thrown) {
      toast.error(getApiErrorMessage(thrown as never) ?? "Could not remove the assignment.");
    }
  }, [deleteAssignment, pendingDelete]);

  return (
    <section className={styles.section}>
      <SectionHead
        title="Every assignment"
        table="print_template_assignment"
        qualifier="narrowest scope first, the order the resolver walks"
        slice={total ? `${rows.length} of ${total}` : "none"}
      />
      <Note>
        One row is one choice: at this scope, printing this purpose in this output mode, use this
        design. There is no “default” flag — default-ness IS the row, so removing it hands the
        scope back to the rung above.
      </Note>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() =>
            // The list's own scope is the honest starting point for a new row:
            // the company it is showing, and nothing narrower assumed.
            onCreate({ ptaCompanyId: scopeFilter === "GLOBAL" ? null : companyId })
          }
        >
          New assignment
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={!selected}
          title={selected ? "Scope, design, printer and copies are edited together" : "Select a row first"}
          onClick={() => selected && onEdit(selected)}
        >
          Edit
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={!selected}
          title={
            selected
              ? "Soft delete — the scope then resolves to the next rung up"
              : "Select a row first"
          }
          onClick={() => selected && setPendingDelete(selected)}
        >
          Remove
        </button>

        <span className={styles.toolbarRight}>
          <select
            className={styles.select}
            value={scopeFilter}
            title="Company is an exact-match filter — the every-company rows are a separate question"
            onChange={(event) =>
              refilter(() => setScopeFilter(event.target.value as ScopeFilter))
            }
          >
            {(Object.keys(SCOPE_FILTER_LABEL) as ScopeFilter[]).map((option) => (
              <option key={option} value={option} disabled={option !== "GLOBAL" && !companyId}>
                {SCOPE_FILTER_LABEL[option]}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={purposeId}
            onChange={(event) => refilter(() => setPurposeId(event.target.value))}
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
            value={outputMode}
            onChange={(event) =>
              refilter(() => setOutputMode(event.target.value as PtaOutputMode | ""))
            }
          >
            <option value="">Any output</option>
            {PTA_OUTPUT_MODE_VALUES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
          <label className={styles.checkRow} title="Hide rows that resolve for nobody">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => refilter(() => setActiveOnly(event.target.checked))}
            />
            Active only
          </label>
          <input
            className={`${styles.input} ${styles.search}`}
            value={search}
            placeholder="search design, purpose, printer or remarks…"
            onChange={(event) => refilter(() => setSearch(event.target.value))}
          />
        </span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colSmall}>Scope</th>
              <th className={styles.colSmall}>Purpose</th>
              <th>Design</th>
              <th className={styles.colTiny}>Output</th>
              <th className={styles.colSmall}>Printer</th>
              <th className={styles.colNum}>Copies</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.ptaId}
                className={[
                  styles.rowClickable,
                  row.ptaIsActive ? "" : styles.rowWarning,
                  row.ptaId === selectedId ? styles.rowSelected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelectedId(row.ptaId)}
                onDoubleClick={() => onEdit(row)}
              >
                <td>
                  {scopeCell(row)}
                  {row.ptaIsActive ? null : <span className={styles.muted}> · inactive</span>}
                </td>
                <td>{row.ptaPurposeName ?? row.ptaPurposeCode ?? "—"}</td>
                <td>
                  <Link
                    href={printingDesignerRoute(row.ptaTemplateId)}
                    className={styles.link}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {row.ptaTemplateName ?? row.ptaTemplateCode ?? "Open design"}
                  </Link>
                  {row.ptaTemplateIsShipped ? (
                    <span className={`${styles.chip} ${styles.chipBlue}`}>shipped</span>
                  ) : null}
                </td>
                <td className={styles.mono}>{row.ptaOutputMode}</td>
                <td>
                  {printerCell(row)}
                  {row.ptaPrinterId ? null : row.ptaPrinterName ? (
                    <span
                      className={styles.muted}
                      title="A bare queue name asserts nothing about paper, codepage or column count"
                    >
                      {" "}
                      · fallback
                    </span>
                  ) : null}
                </td>
                <td className={styles.colNum}>
                  {row.ptaCopies ?? (
                    <span className={styles.muted} title="The purpose's own copy count applies">
                      —
                    </span>
                  )}
                </td>
                <td className={styles.muted}>{row.ptaRemarks ?? "—"}</td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.muted}>
                  {isFetching
                    ? "Loading…"
                    : "Nothing configured for this filter. A purpose with no assignment prints nothing at all."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className={styles.toolbar}>
        <span className={styles.muted}>
          {total > 0
            ? `${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + rows.length} of ${total}`
            : "no rows"}
        </span>
        <span className={styles.toolbarRight}>
          <button
            type="button"
            className={styles.btn}
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className={styles.muted}>
            page {page} of {lastPage}
          </span>
          <button
            type="button"
            className={styles.btn}
            disabled={page >= lastPage || isFetching}
            onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
          >
            Next
          </button>
        </span>
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

      <Note tone="blue">
        Scope is a ladder and the narrowest rung wins. A company-wide row is not “the setting” — a
        counter row beats it, and only the “By scope” tab shows which one actually reaches a till.
      </Note>

      <DeleteConfirmModal
        isOpen={pendingDelete !== null}
        itemName={
          pendingDelete
            ? `${scopeCell(pendingDelete)} · ${pendingDelete.ptaPurposeName ?? pendingDelete.ptaPurposeCode ?? "purpose"} · ${pendingDelete.ptaOutputMode}`
            : undefined
        }
        title="Remove this assignment?"
        message="The choice for this scope goes away and the resolver falls back to the next rung up — branch, company, then the every-company default."
        note="If no rung above it has a row, that scope prints nothing at all."
        confirmLabel="Remove"
        loading={isDeleting}
        loadingLabel="Removing…"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
