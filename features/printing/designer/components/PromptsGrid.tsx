"use client";

/**
 * `ptvParams` -- what the OPERATOR is asked, ONCE, for the whole render.
 *
 * ON THE VERSION, NOT ON THE DATASET, and that is the single most important
 * thing about this grid. An earlier draft of the schema hung prompts off the
 * dataset, and it was wrong: two datasets could declare `from_date` as
 * `DATE required` and as `TEXT optional`, and there is no answer to what the
 * screen should then ask. `plg_params` being one JSONB object per RENDER, not
 * one per dataset, is the corroborating evidence.
 *
 * ANY NAME MAY BE DECLARED, including one of the six context names. That used
 * to be refused -- at save and at render -- on the grounds that the operator
 * would be asked for something the server already knows. It is allowed now
 * because the two are not the same thing: the context value is the DEFAULT for
 * a name this table leaves out, and a row here says "ask instead". The one
 * exception is `company_id`, whose value stays the authenticated session's
 * however it is declared, because a caller able to name the company is a caller
 * able to print another tenant's documents.
 *
 * The cross-check against the queries is a LINT. Nothing server-side validates a
 * `ptv_params` element at all -- the only constraint is "must be a JSON array"
 * -- so a prompt no query binds, or a `:name` no prompt declares, saves cleanly
 * and fails at render. Both are reported here and neither blocks a save.
 */

import {
  CONTEXT_PARAMS,
  contextParam,
  hasContextDefault,
  isServerOwnedParam,
} from "@/features/printing/domain/context";
import { extractBoundParams } from "@/features/printing/domain/sqlLint";
import {
  PARAM_NAME_PATTERN,
  PTV_PARAM_TYPES,
  type PtvParam,
} from "@/features/printing/types/printing";
import type { DraftDataset } from "@/features/printing/domain/draft";
import { Note, SectionHead } from "@/features/printing/components/screen-shell";
import styles from "@/features/printing/printing.module.scss";

export default function PromptsGrid({
  params,
  datasets,
  readOnly,
  onChange,
}: {
  params: PtvParam[];
  datasets: DraftDataset[];
  readOnly: boolean;
  onChange: (next: PtvParam[]) => void;
}) {
  // Every `:name` bound by any stored query on this revision, read off the
  // NORMALISED text so a name inside a literal or a comment is not counted.
  const bound = new Set<string>();
  for (const dataset of datasets) {
    if (dataset.ptdSourceKind !== "SQL") continue;
    for (const name of extractBoundParams(dataset.ptdSql)) {
      bound.add(name);
    }
  }

  const declared = new Set(params.map((parameter) => parameter.name));
  // A bound name with no context default and no row here has nothing to fill
  // it. A context name needs neither -- the render supplies it -- so declaring
  // one is an override, never an omission worth reporting.
  const undeclared = [...bound].filter((name) => !hasContextDefault(name) && !declared.has(name));

  const patch = (index: number, next: Partial<PtvParam>) =>
    onChange(
      params.map((parameter, position) =>
        position === index ? { ...parameter, ...next } : parameter,
      ),
    );

  const addRow = () =>
    onChange([...params, { name: "", type: "TEXT", required: false, label: null }]);

  return (
    <section className={styles.section}>
      <SectionHead
        title="Prompts"
        table="ptv_params"
        qualifier="asked ONCE, for the whole render"
        slice="versions[0].ptvParams"
      />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colSmall}>Name</th>
              <th className={styles.colPick}>Type</th>
              <th className={styles.colTiny}>Required</th>
              <th>Label on screen</th>
              <th className={styles.colTiny} />
            </tr>
          </thead>
          <tbody>
            {params.map((parameter, index) => {
              const shapeOk = PARAM_NAME_PATTERN.test(parameter.name);
              const context = shapeOk ? contextParam(parameter.name) : undefined;
              const serverOwned = shapeOk && isServerOwnedParam(parameter.name);
              const unused = shapeOk && bound.size > 0 && !bound.has(parameter.name);

              return (
                <tr key={index}>
                  <td>
                    <input
                      className={styles.cellInput}
                      value={parameter.name}
                      disabled={readOnly}
                      data-uppercase="off"
                      placeholder="from_date"
                      onChange={(event) => patch(index, { name: event.target.value.trim() })}
                    />
                    {!shapeOk && parameter.name ? (
                      <span className={styles.cellFinding}>
                        Lower snake case, starting with a letter.
                      </span>
                    ) : null}
                    {context && !serverOwned ? (
                      <span className={styles.cellNote}>
                        {context.what}. The render supplies :{parameter.name} on its own, so
                        declaring it here is an OVERRIDE — what the operator answers is what the
                        queries bind, and a blank answer falls back to the render&apos;s own value.
                      </span>
                    ) : null}
                    {serverOwned ? (
                      <span className={styles.cellFinding}>
                        :{parameter.name} always binds the signed-in company, whatever is answered
                        here — a render that took it from the caller would read another company&apos;s
                        documents. Declare it to document the binding, not to change it.
                      </span>
                    ) : null}
                    {unused ? (
                      <span className={styles.cellFinding}>
                        No query on this revision binds it, so the answer goes nowhere.
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <select
                      className={styles.cellSelect}
                      value={parameter.type}
                      disabled={readOnly}
                      onChange={(event) =>
                        patch(index, { type: event.target.value as PtvParam["type"] })
                      }
                    >
                      {PTV_PARAM_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={parameter.required === true}
                      disabled={readOnly}
                      onChange={(event) => patch(index, { required: event.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.cellInput}
                      value={parameter.label ?? ""}
                      disabled={readOnly}
                      placeholder="From date"
                      onChange={(event) => patch(index, { label: event.target.value || null })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.link}
                      disabled={readOnly}
                      onClick={() => onChange(params.filter((_, position) => position !== index))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}

            <tr className={styles.ghostRow} onClick={() => !readOnly && addRow()}>
              <td colSpan={5}>{readOnly ? "This revision is read-only." : "add a row…"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {undeclared.length > 0 ? (
        <Note
          tone="amber"
          action={
            <button
              type="button"
              className={styles.btn}
              disabled={readOnly}
              onClick={() =>
                onChange([
                  ...params,
                  ...undeclared.map((name) => ({
                    name,
                    type: "TEXT" as const,
                    required: true,
                    label: null,
                  })),
                ])
              }
            >
              Declare {undeclared.length === 1 ? "it" : "them"}
            </button>
          }
        >
          {undeclared.map((name) => `:${name}`).join(", ")}{" "}
          {undeclared.length === 1 ? "is bound by a query" : "are bound by queries"} on this
          revision but declared nowhere. Nothing will fill{" "}
          {undeclared.length === 1 ? "it" : "them"} at render time.
        </Note>
      ) : null}

      <Note>
        An invoice normally has none of these. They are for reports — and for the one other thing
        this table is now for: overriding what the render would otherwise supply on its own.{" "}
        {CONTEXT_PARAMS.map((parameter) => `:${parameter.name}`).join(", ")} bind without being
        declared, so a query may use them as they stand; declare one only to have the operator
        answer it instead.
      </Note>
    </section>
  );
}
