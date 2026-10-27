"use client";
/**
 * Ageing Slabs — menu 294 (Qt `AgeingSlabEntry`, NexERP d27045b; server notes 159).
 *
 * The bands the ageing report groups stock into ("0-30 days" … "Over 180
 * days"). ONE LADDER, saved whole: the shared default is shown read-only with
 * Customise; the company's own is edited and saved, or reverted to the
 * default. Each slab starts the day after the previous one ends, so a gap or
 * an overlap cannot be keyed; Save is off while the ladder has a fault.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import {
  useGetAgeingSlabsQuery,
  useRevertAgeingSlabsMutation,
  useSaveAgeingSlabsMutation,
} from "./ageing-slab.api";
import {
  AGEING_SLAB_MENU_ID,
  LABEL_MAX_LENGTH,
  MAX_SLABS,
  addSlab,
  buildSavePayload,
  coverageLayout,
  coversText,
  ladderFault,
  removeSlab,
  rowsFromLadder,
  slabsOf,
  type AgeingLadder,
  type SlabRow,
} from "./ageing-slab";
import styles from "./ageing-slab.module.scss";

export default function AgeingSlabsPage() {
  const { selectedCompanyId, activeCompany } = useBusinessContext();
  const companyId = selectedCompanyId ?? "";
  const companyName = (activeCompany?.name ?? "").trim() || "this company";
  const { permissions, isLoading: rightsLoading } = usePagePermissions({ menuId: AGEING_SLAB_MENU_ID });
  const canEdit = !rightsLoading && permissions.canEdit;

  const {
    data: ladder,
    isFetching,
    error: loadError,
    refetch,
  } = useGetAgeingSlabsQuery({ companyId }, { skip: !companyId, refetchOnMountOrArgChange: true });
  const [saveLadder, { isLoading: saving }] = useSaveAgeingSlabsMutation();
  const [revertLadder, { isLoading: reverting }] = useRevertAgeingSlabsMutation();

  const [usingOwn, setUsingOwn] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [rows, setRows] = useState<SlabRow[]>([]);
  const [current, setCurrent] = useState(0);
  const dirtyRef = useRef(false);
  const tableRef = useRef<HTMLTableSectionElement | null>(null);
  const busy = saving || reverting;

  /** Qt `reload`: the company's own ladder opens for editing; the default is shown. */
  const seed = useCallback((next: AgeingLadder) => {
    setUsingOwn(next.usingOwn);
    setEditing(next.usingOwn);
    setRows(rowsFromLadder(next.slabs));
    setDirty(false);
    dirtyRef.current = false;
    setCurrent(0);
  }, []);

  // A background revalidation must not wipe edits in progress.
  useEffect(() => {
    if (ladder && !dirtyRef.current) seed(ladder);
  }, [ladder, seed]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
  }, []);

  // The browser's own prompt for a reload / tab close with an unsaved ladder.
  useEffect(() => {
    if (!dirty || !editing) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, editing]);

  const slabs = useMemo(() => slabsOf(rows), [rows]);
  const fault = useMemo(() => ladderFault(slabs), [slabs]);
  const layout = useMemo(() => coverageLayout(slabs), [slabs]);
  const canSave = editing && dirty && !fault && canEdit && !busy;

  const focusCell = useCallback((index: number) => {
    window.setTimeout(() => {
      tableRef.current?.querySelector<HTMLInputElement>(`input[data-slab-row="${index}"][data-slab-cell="label"]`)?.focus();
    }, 0);
  }, []);

  const customise = useCallback(() => {
    if (editing || !canEdit) return;
    setEditing(true); // a copy of the default, the company's own once saved
    markDirty();
    focusCell(0);
  }, [canEdit, editing, focusCell, markDirty]);

  const patchRow = useCallback(
    (id: number, patch: Partial<SlabRow>) => {
      setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      markDirty();
    },
    [markDirty],
  );

  const handleAdd = useCallback(() => {
    if (!editing || rows.length >= MAX_SLABS) return;
    const next = addSlab(rows);
    setRows(next.rows);
    setCurrent(next.at);
    markDirty();
    focusCell(next.at);
  }, [editing, focusCell, markDirty, rows]);

  const handleRemove = useCallback(() => {
    if (!editing || rows.length <= 1) return;
    setRows(removeSlab(rows, current));
    setCurrent(0);
    markDirty();
  }, [current, editing, markDirty, rows]);

  const handleCancel = useCallback(async () => {
    if (dirty && !(await confirm({ title: "Cancel", message: "Discard the changes to the ladder?", confirmLabel: "Discard" }))) {
      return;
    }
    dirtyRef.current = false;
    setDirty(false);
    if (ladder) seed(ladder);
    else void refetch();
  }, [dirty, ladder, refetch, seed]);

  const handleSave = useCallback(async () => {
    if (!editing || busy) return;
    if (fault) {
      toast.warn(fault);
      return;
    }
    try {
      const saved = await saveLadder(buildSavePayload(companyId, slabs)).unwrap();
      seed(saved);
      toast.success("The ladder is saved — the ageing report uses it from now on.");
    } catch (error) {
      toast.apiError(error, { fallback: "Unable to save the ageing slabs." });
    }
  }, [busy, companyId, editing, fault, saveLadder, seed, slabs]);

  const handleRevert = useCallback(async () => {
    if (!usingOwn || busy) return;
    const ok = await confirm({
      title: "Revert to default",
      message:
        "Remove this company's own ladder and use the shared default again? The labels and boundaries you set are gone; reports already printed are not affected.",
      confirmLabel: "Revert",
      iconVariant: "replace",
    });
    if (!ok) return;
    try {
      const reverted = await revertLadder({ companyId }).unwrap();
      seed(reverted);
      toast.success("Back on the default ladder.");
    } catch (error) {
      toast.apiError(error, { fallback: "Unable to revert the ageing slabs." });
    }
  }, [busy, companyId, revertLadder, seed, usingOwn]);

  // Ctrl+S — Save ladder (Qt TxnKeys SaveDraft).
  const saveRef = useRef(handleSave);
  useEffect(() => {
    saveRef.current = handleSave;
  }, [handleSave]);
  useEffect(() => {
    if (!canSave) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      void saveRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canSave]);

  const pill = usingOwn ? "USING YOUR OWN" : editing ? "CUSTOMISING" : "USING THE DEFAULT LADDER";
  const own = usingOwn || editing;
  const loadFailed = Boolean(loadError) && !ladder;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{editing ? `Ageing Slabs — ${companyName}` : "Ageing Slabs"}</h1>
          <p className={styles.subtitle}>{companyName} · how old is what we are holding</p>
        </div>
        <span className={own ? styles.pillOwn : styles.pillDefault}>{pill}</span>
      </header>

      <div className={styles.body}>
        {!editing ? (
          <p className={styles.info}>
            These slabs are shared by every company that has not defined its own. Nothing here belongs to {companyName}{" "}
            — Customise makes {companyName}&apos;s own copy to change.
          </p>
        ) : null}

        <div className={styles.gridViewport}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th className={styles.cellIndex}>#</th>
                <th>Label</th>
                <th className={styles.numCol}>From day</th>
                <th className={styles.numCol}>To day</th>
                <th>Covers</th>
              </tr>
            </thead>
            <tbody ref={tableRef}>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyState}>
                    {isFetching ? "Loading the ladder…" : loadFailed ? "The ladder could not be loaded." : "No slabs."}
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const slab = slabs[index];
                  return (
                    <tr
                      key={row.id}
                      className={index === current ? styles.rowCurrent : undefined}
                      onFocusCapture={() => setCurrent(index)}
                      onMouseDown={() => setCurrent(index)}
                    >
                      <td className={styles.cellIndex}>{index + 1}</td>
                      <td>
                        <input
                          type="text"
                          aria-label={`Slab ${index + 1} label`}
                          className={styles.cellInput}
                          maxLength={LABEL_MAX_LENGTH}
                          readOnly={!editing}
                          data-uppercase="off"
                          data-slab-row={index}
                          data-slab-cell="label"
                          value={row.label}
                          onChange={(event) => patchRow(row.id, { label: event.target.value })}
                        />
                      </td>
                      <td className={styles.numCell}>{slab.from}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Slab ${index + 1} to day`}
                          className={`${styles.cellInput} ${styles.cellNumber}`}
                          readOnly={!editing}
                          placeholder="—"
                          data-uppercase="off"
                          data-slab-row={index}
                          data-slab-cell="to"
                          value={row.to}
                          onChange={(event) => patchRow(row.id, { to: event.target.value })}
                        />
                      </td>
                      <td className={styles.coversCell}>{coversText(slab, index === rows.length - 1)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {editing ? (
          <div className={styles.rowButtons}>
            <button type="button" className={styles.button} disabled={rows.length >= MAX_SLABS || busy} onClick={handleAdd}>
              + Add slab
            </button>
            <button type="button" className={styles.button} disabled={rows.length <= 1 || busy} onClick={handleRemove}>
              − Remove slab
            </button>
          </div>
        ) : null}

        <h2 className={styles.cardTitle}>COVERAGE</h2>
        <div className={styles.coverage} aria-label="Ladder coverage by day">
          <div className={styles.track}>
            {layout.bands.map((band, i) => (
              <div
                key={rows[i]?.id ?? i}
                className={`${styles.band} ${i % 2 === 0 ? styles.bandA : styles.bandB}`}
                style={{ left: `${band.left}%`, width: `${band.width}%` }}
                title={band.label}
              >
                <span className={styles.bandLabel}>{band.label}</span>
                {band.open ? <span className={styles.openEnd}>›››</span> : null}
              </div>
            ))}
          </div>
          <div className={styles.axis}>
            {layout.ticks.map((tick) => (
              <span key={tick.day} className={styles.tick} style={{ left: `${tick.left}%` }}>
                {tick.day}
              </span>
            ))}
            <span className={styles.axisCaption}>days →</span>
          </div>
        </div>

        {editing ? (
          fault ? (
            <p className={styles.checkBad} role="alert">
              ⚠ {fault}
            </p>
          ) : (
            <p className={styles.checkGood}>
              The ladder covers every day from 0, with no gaps and one open-ended slab.
              {dirty ? " Save ladder (Ctrl+S) keeps it." : ""}
            </p>
          )
        ) : null}
      </div>

      <footer className={styles.footer}>
        <span className={styles.footNote}>
          The whole ladder saves as one set. Reports read the slabs when they run — changing them never rewrites stock.
        </span>
        <span className={styles.footerSpacer} />
        {!editing ? (
          <button
            type="button"
            className={styles.buttonPrimary}
            disabled={!canEdit || !ladder || busy}
            title={canEdit ? undefined : "No right to edit on Ageing Slabs"}
            onClick={customise}
          >
            Customise for {companyName}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.buttonDanger}
              disabled={!usingOwn || !canEdit || busy}
              onClick={() => void handleRevert()}
            >
              Revert to default
            </button>
            <button type="button" className={styles.button} disabled={busy} onClick={() => void handleCancel()}>
              Cancel
            </button>
            <button type="button" className={styles.buttonPrimary} disabled={!canSave} onClick={() => void handleSave()}>
              Save ladder
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
