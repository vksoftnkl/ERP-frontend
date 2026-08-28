"use client";

/**
 * Where the rows come from -- one line per dataset on this revision.
 *
 * -- THE TWO NUMBERS ARE DIFFERENT OPERATIONS ------------------------------
 *
 * `No.` is THE BINDING: it is what a band in the layout points at, and changing
 * it REBINDS every band that names it. `Order` is only how this list is sorted
 * and binds nothing.
 *
 * 3.0 had ONE column doing both jobs, which is why reordering rows there
 * silently rebound every band to the wrong query. So they must not look like one
 * control: Order is the arrows and writes `ptdSortOrder` alone; No. is a typed
 * field with a warning attached, refused once the number has been published.
 *
 * -- NESTING IS NOT PER-ROW EXECUTION --------------------------------------
 *
 * `Parent` + `Link fields` say a band is nested. The child query still runs ONCE
 * for the whole render, bound with the same context, returning the parent key as
 * an ordinary column the renderer groups on. That is why `Rows` and the timeout
 * measure the WHOLE BAND, and the labels say so -- a UI that suggested per-row
 * execution would lead someone to write a query that is N+1 against partitioned
 * tables.
 */

import {
  DEFAULT_ROW_LIMIT,
  DEFAULT_TIMEOUT_MS,
  renumberDataset,
  reorderDatasets,
  type DraftDataset,
} from "@/features/printing/domain/draft";
import {
  isValidLinkFields,
  nestingIncoherence,
  parseLinkFields,
} from "@/features/printing/domain/linkFields";
import {
  PTD_ROLE_VALUES,
  PTD_SOURCE_KIND_VALUES,
  type PtdRole,
  type PtdSourceKind,
} from "@/features/printing/types/printing";
import { Note, SectionHead } from "@/features/printing/components/screen-shell";
import { useListPrintDataProvidersQuery } from "@/features/printing/api/render";
import styles from "@/features/printing/printing.module.scss";

/** `ck_ptd_name_shape` and `ck_ptd_provider_shape`. */
const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const PROVIDER_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

/** The datalist every provider cell shares; one list, not one per row. */
const PROVIDER_LIST_ID = "ptd-provider-codes";

export default function DatasetGrid({
  datasets,
  readOnly,
  publishedNumbers,
  selectedIndex,
  revLabel,
  onSelect,
  onChange,
}: {
  datasets: DraftDataset[];
  readOnly: boolean;
  /** Dataset numbers already published, which are immutable. */
  publishedNumbers: ReadonlySet<number>;
  selectedIndex: number | null;
  revLabel: string;
  onSelect: (index: number | null) => void;
  onChange: (next: DraftDataset[]) => void;
}) {
  const patch = (index: number, next: Partial<DraftDataset>) =>
    onChange(datasets.map((row, position) => (position === index ? { ...row, ...next } : row)));

  const addRow = () => {
    // The next free binding, never a duplicate: two rows claiming one number is
    // exactly the bug that rebinds a band to the wrong query.
    const used = new Set(datasets.map((row) => row.ptdDatasetNo));
    let next = 0;
    while (used.has(next) && next <= 99) next += 1;
    onChange([
      ...datasets,
      {
        ptdRole: next === 0 ? "MASTER" : "DETAIL",
        ptdDatasetNo: next,
        ptdSortOrder: datasets.length,
        ptdName: "",
        ptdLabel: null,
        ptdSourceKind: "PROVIDER",
        ptdProviderCode: null,
        ptdSql: null,
        ptdRequiresCompany: true,
        ptdParentNo: null,
        ptdLinkFields: null,
        ptdRowLimit: DEFAULT_ROW_LIMIT,
        ptdTimeoutMs: DEFAULT_TIMEOUT_MS,
        ptdRemarks: null,
      },
    ]);
    onSelect(datasets.length);
  };

  /*
   * WHAT A PROVIDER CODE MAY NAME, from the server that would have to have it.
   *
   * A provider is CODE. A template naming one this build does not carry cannot
   * be made to work by editing data — it fails at print with "No provider is
   * registered as …" — and until this endpoint existed there was no way to find
   * that out except by printing.
   *
   * It is still a free-text field, and an unknown code is a WARNING rather than
   * a refusal, for the same reason the SQL guards are an authoring lint: a
   * design may legitimately be written against a provider a release is about to
   * add. A failed query (an older server, no network) simply offers no list and
   * no warning, and the field behaves exactly as it did before.
   */
  const { data: providers } = useListPrintDataProvidersQuery();
  const knownProviderCodes = providers ? new Set(providers.map((entry) => entry.code)) : null;

  const numbers = datasets.map((row) => row.ptdDatasetNo);
  const duplicateNumbers = new Set(
    numbers.filter((value, index) => numbers.indexOf(value) !== index),
  );
  const names = datasets.map((row) => row.ptdName);
  const duplicateNames = new Set(
    names.filter((value, index) => value !== "" && names.indexOf(value) !== index),
  );
  const masterCount = datasets.filter((row) => row.ptdRole === "MASTER").length;

  return (
    <section className={styles.section}>
      {/*
        One list for every provider cell, emitted only when the server answered.
        A datalist suggests without constraining, which is the right strength
        here: the field stays free text, and an unrecognised code is a warning
        under the cell rather than something the control refuses to hold.
      */}
      {providers ? (
        <datalist id={PROVIDER_LIST_ID}>
          {providers.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {`${entry.label} · ${entry.cardinality === "one" ? "one row" : "many rows"}`}
            </option>
          ))}
        </datalist>
      ) : null}

      <SectionHead
        title="Datasets"
        table="print_template_dataset"
        qualifier={`they belong to ${revLabel}, not to the design`}
        slice="versions[0].datasets[]"
      />
      <Note>
        <strong>No.</strong> is the BINDING for a band. <strong>Order</strong> is only how this list
        is sorted — changing it cannot rebind a band, which is the 3.0 defect.
      </Note>

      <div className={styles.toolbar}>
        <button type="button" className={styles.btn} disabled={readOnly} onClick={addRow}>
          Add
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={readOnly || selectedIndex === null}
          onClick={() => {
            if (selectedIndex === null) return;
            onChange(datasets.filter((_, position) => position !== selectedIndex));
            onSelect(null);
          }}
        >
          Remove
        </button>
        <button
          type="button"
          className={styles.btnGreen}
          disabled
          title="There is no preview or run endpoint on /print-templates yet — the four routes are list, get, create and delete. Rendering is server-side, and a client-side runner would be the 3.0 mistake on a new axis."
        >
          Run it
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colNum} title="THE BINDING a band points at">
                No.
              </th>
              <th className={styles.colPick}>Role</th>
              <th className={styles.colSmall}>Name</th>
              <th className={styles.colPick}>Source</th>
              <th>Provider / stored query</th>
              <th className={styles.colTiny}>Parent</th>
              <th className={styles.colSmall}>Link fields</th>
              <th className={styles.colTiny} title="Measures the WHOLE band">
                Rows
              </th>
              <th className={styles.colTiny}>Order</th>
            </tr>
          </thead>
          <tbody>
            {datasets.map((row, index) => {
              const numberLocked = row.ptdId !== undefined && publishedNumbers.has(row.ptdDatasetNo);
              const nesting = nestingIncoherence(row);
              const linkBad =
                Boolean(row.ptdLinkFields) && !isValidLinkFields(row.ptdLinkFields ?? "");

              return (
                <tr
                  key={row.ptdId ?? `new-${index}`}
                  className={`${styles.rowClickable} ${index === selectedIndex ? styles.rowSelected : ""}`}
                  onClick={() => onSelect(index)}
                >
                  <td>
                    <input
                      className={`${styles.cellInput} ${styles.cellNum}`}
                      type="number"
                      min={0}
                      max={99}
                      value={row.ptdDatasetNo}
                      disabled={readOnly || numberLocked}
                      title={
                        numberLocked
                          ? "This number has been published. It is the binding a band points at, so it cannot change — start a new draft."
                          : "Changing this rebinds every band that names it"
                      }
                      onChange={(event) =>
                        onChange(renumberDataset(datasets, index, Number(event.target.value)))
                      }
                    />
                    {duplicateNumbers.has(row.ptdDatasetNo) ? (
                      <span className={styles.cellFinding}>Two rows claim this number.</span>
                    ) : null}
                  </td>

                  <td>
                    <select
                      className={styles.cellSelect}
                      value={row.ptdRole}
                      disabled={readOnly}
                      onChange={(event) => patch(index, { ptdRole: event.target.value as PtdRole })}
                    >
                      {PTD_ROLE_VALUES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    {/* ck_ptd_master_is_zero — the master is dataset 0, and nothing else is. */}
                    {row.ptdRole === "MASTER" && row.ptdDatasetNo !== 0 ? (
                      <span className={styles.cellFinding}>The master must be number 0.</span>
                    ) : null}
                  </td>

                  <td>
                    <input
                      className={styles.cellInput}
                      value={row.ptdName}
                      disabled={readOnly}
                      data-uppercase="off"
                      placeholder="items"
                      onChange={(event) => patch(index, { ptdName: event.target.value.trim() })}
                    />
                    {row.ptdName && !NAME_PATTERN.test(row.ptdName) ? (
                      <span className={styles.cellFinding}>
                        Lower snake case, starting with a letter.
                      </span>
                    ) : null}
                    {duplicateNames.has(row.ptdName) ? (
                      <span className={styles.cellFinding}>Two rows share this name.</span>
                    ) : null}
                  </td>

                  <td>
                    <select
                      className={styles.cellSelect}
                      value={row.ptdSourceKind}
                      disabled={readOnly}
                      onChange={(event) =>
                        patch(index, { ptdSourceKind: event.target.value as PtdSourceKind })
                      }
                    >
                      {PTD_SOURCE_KIND_VALUES.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    {row.ptdSourceKind === "PROVIDER" ? (
                      <>
                        <input
                          className={styles.cellInput}
                          value={row.ptdProviderCode ?? ""}
                          disabled={readOnly}
                          data-uppercase="off"
                          list={providers ? PROVIDER_LIST_ID : undefined}
                          placeholder="sales.bill.tax_summary"
                          onChange={(event) =>
                            patch(index, { ptdProviderCode: event.target.value.trim() || null })
                          }
                        />
                        {row.ptdProviderCode && !PROVIDER_PATTERN.test(row.ptdProviderCode) ? (
                          <span className={styles.cellFinding}>
                            Dotted lower snake case, e.g. sales.bill.tax_summary.
                          </span>
                        ) : row.ptdProviderCode &&
                          knownProviderCodes &&
                          !knownProviderCodes.has(row.ptdProviderCode) ? (
                          <span className={styles.cellFinding}>
                            The server has no provider by that name, so this dataset would fail at
                            print. It carries: {[...knownProviderCodes].sort().join(", ")}.
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span
                        className={`${styles.mono} ${styles.truncate} ${row.ptdSql ? "" : styles.muted}`}
                        title={row.ptdSql ?? undefined}
                      >
                        {row.ptdSql ?? "select the row to write a query"}
                      </span>
                    )}
                  </td>

                  <td>
                    <input
                      className={`${styles.cellInput} ${styles.cellNum}`}
                      type="number"
                      min={0}
                      max={99}
                      value={row.ptdParentNo ?? ""}
                      disabled={readOnly}
                      placeholder="—"
                      onChange={(event) =>
                        patch(index, {
                          ptdParentNo:
                            event.target.value === "" ? null : Number(event.target.value),
                        })
                      }
                    />
                  </td>

                  <td>
                    <input
                      className={styles.cellInput}
                      value={row.ptdLinkFields ?? ""}
                      disabled={readOnly}
                      data-uppercase="off"
                      placeholder="—"
                      title="parent=child pairs, comma separated, no spaces. Both sides are output columns."
                      onChange={(event) =>
                        patch(index, { ptdLinkFields: event.target.value.trim() || null })
                      }
                    />
                    {nesting ? <span className={styles.cellFinding}>{nesting}</span> : null}
                    {linkBad
                      ? (
                          parseLinkFields(row.ptdLinkFields ?? "") as { errors?: string[] }
                        ).errors?.map((message) => (
                          <span key={message} className={styles.cellFinding}>
                            {message}
                          </span>
                        ))
                      : null}
                  </td>

                  <td>
                    <input
                      className={`${styles.cellInput} ${styles.cellNum}`}
                      type="number"
                      min={1}
                      max={200000}
                      value={row.ptdRowLimit ?? DEFAULT_ROW_LIMIT}
                      disabled={readOnly}
                      title="The WHOLE band — a child query runs once per render, not per parent row"
                      onChange={(event) =>
                        patch(index, { ptdRowLimit: Number(event.target.value) })
                      }
                    />
                  </td>

                  <td>
                    <span className={styles.toolbar}>
                      <button
                        type="button"
                        className={styles.link}
                        disabled={readOnly || index === 0}
                        title="Moves the row in this grid. The binding does not change."
                        onClick={(event) => {
                          event.stopPropagation();
                          onChange(reorderDatasets(datasets, index, index - 1));
                          onSelect(index - 1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.link}
                        disabled={readOnly || index === datasets.length - 1}
                        title="Moves the row in this grid. The binding does not change."
                        onClick={(event) => {
                          event.stopPropagation();
                          onChange(reorderDatasets(datasets, index, index + 1));
                          onSelect(index + 1);
                        }}
                      >
                        ↓
                      </button>
                      <span className={styles.muted}>{(row.ptdSortOrder ?? index) + 1}</span>
                    </span>
                  </td>
                </tr>
              );
            })}

            {/* The mockup's ghost line: adding a row is where the rows are. */}
            <tr className={styles.ghostRow} onClick={() => !readOnly && addRow()}>
              <td colSpan={9}>{readOnly ? "This revision is read-only." : "add a row…"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {masterCount > 1 ? (
        <Note tone="red">
          A revision may hold at most one MASTER dataset; {masterCount} rows claim it.
        </Note>
      ) : null}

      <Note>
        PROVIDER for the few things that need real logic — joins across partitioned tables, or an
        e-invoice QR. SQL for everything else, so a new report needs no release.
      </Note>
    </section>
  );
}
